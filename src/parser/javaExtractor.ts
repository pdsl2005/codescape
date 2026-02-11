import { Parser, Language, Node as SyntaxNode } from 'web-tree-sitter';
import * as path from 'path';

// JSON output contract for each extracted class/interface
export interface ClassInfo {
  Classname: string;
  Methods: string[];
  Loc: number;
  Type: string;       // "public", "abstract", "final", "private", "protected", "interface", or "default"
  Extends: string | null;
  Implements: string[];
  Fields: FieldInfo[];
  Constructors: ConstructorInfo[];
}

export interface FieldInfo {
  name: string;
  type: string;
  modifiers: string[];
  initializer?: string;
}

export interface ConstructorInfo {
  parameters: ParameterInfo[];
  modifiers: string[];
}

export interface ParameterInfo {
  name: string;
  type: string;
}

let parser: Parser | null = null;

// Initializes the tree-sitter parser with the Java WASM grammar.
// Must be called once before using extractClasses().
export async function initParser(): Promise<void> {
  await Parser.init();
  parser = new Parser();
  const wasmPath = path.join(
    __dirname, '..', '..', 'node_modules',
    'tree-sitter-java', 'tree-sitter-java.wasm'
  );
  const java = await Language.load(wasmPath);
  parser.setLanguage(java);
}

// Parses Java source code and returns a ClassInfo array for every
// class and interface found (including nested/inner classes).
export function extractClasses(source: string): ClassInfo[] {
  if (!parser) {
    throw new Error('Parser not initialized. Call initParser() first.');
  }

  const tree = parser.parse(source);
  if (!tree) {
    throw new Error('Failed to parse source code.');
  }

  const results: ClassInfo[] = [];
  visit(tree.rootNode, results);
  return results;
}

// Recursively walks the syntax tree to find class and interface declarations.
function visit(node: SyntaxNode, results: ClassInfo[]): void {
  if (node.type === 'class_declaration') {
    results.push(buildClassInfo(node));
  } else if (node.type === 'interface_declaration') {
    results.push(buildInterfaceInfo(node));
  }

  for (const child of node.namedChildren) {
    visit(child, results);
  }
}

// Extracts ClassInfo from a class_declaration node.
function buildClassInfo(node: SyntaxNode): ClassInfo {
  const name = node.childForFieldName('name')?.text ?? 'Unknown';
  const loc = node.endPosition.row - node.startPosition.row + 1;
  const body = node.childForFieldName('body');
  const methods = extractMethods(body);
  const fields = extractFields(body);
  const constructors = extractConstructors(body);
  const modifiers = getModifiers(node);
  const type = determineType(modifiers);

  // "superclass" field holds the extends clause (e.g. extends BaseService)
  const superclassNode = node.childForFieldName('superclass');
  const extendsTypes = collectTypeNames(superclassNode);

  // "interfaces" field holds the implements clause (e.g. implements Serializable, Loggable)
  const interfacesNode = node.childForFieldName('interfaces');
  const implementsTypes = collectTypeNames(interfacesNode);

  return {
    Classname: name,
    Methods: methods,
    Loc: loc,
    Type: type,
    Extends: extendsTypes.length > 0 ? extendsTypes[0] : null,
    Implements: implementsTypes,
    Fields: fields,
    Constructors: constructors,
  };
}

// Extracts ClassInfo from an interface_declaration node.
// Interfaces that extend other interfaces have those listed under Implements.
function buildInterfaceInfo(node: SyntaxNode): ClassInfo {
  const name = node.childForFieldName('name')?.text ?? 'Unknown';
  const loc = node.endPosition.row - node.startPosition.row + 1;
  const body = node.childForFieldName('body');
  const methods = extractMethods(body);
  const fields = extractFields(body);

  // For interfaces, "extends_interfaces" is a child node (not a field)
  const extendsNode = node.namedChildren.find((c: SyntaxNode) => c.type === 'extends_interfaces');
  const extendsList = collectTypeNames(extendsNode);

  return {
    Classname: name,
    Methods: methods,
    Loc: loc,
    Type: 'interface',
    Extends: null,
    Implements: extendsList,
    Fields: fields,
    Constructors: [], // Interfaces don't have constructors
  };
}

// Pulls modifier keywords (public, abstract, final, etc.) from a declaration node.
// Modifiers are unnamed children of the "modifiers" node; annotations are skipped.
function getModifiers(node: SyntaxNode): string[] {
  const modNode = node.namedChildren.find((c: SyntaxNode) => c.type === 'modifiers');
  if (!modNode) { return []; }
  return modNode.children
    .filter((c: SyntaxNode) => !c.isNamed)
    .map((c: SyntaxNode) => c.text);
}

// Maps a list of modifiers to a single Type string.
// Priority: abstract > final > access modifier > "default" (package-private).
function determineType(modifiers: string[]): string {
  if (modifiers.includes('abstract')) { return 'abstract'; }
  if (modifiers.includes('final')) { return 'final'; }
  if (modifiers.includes('public')) { return 'public'; }
  if (modifiers.includes('private')) { return 'private'; }
  if (modifiers.includes('protected')) { return 'protected'; }
  return 'default';
}

// Collects method names from a class_body or interface_body node.
function extractMethods(bodyNode: SyntaxNode | null): string[] {
  if (!bodyNode) { return []; }
  const methods: string[] = [];
  for (const child of bodyNode.namedChildren) {
    if (child.type === 'method_declaration') {
      const name = child.childForFieldName('name');
      if (name) { methods.push(name.text); }
    }
  }
  return methods;
}

// Recursively collects type names from a superclass, super_interfaces, or extends_interfaces node.
// Handles type_identifier ("List"), generic_type ("List<String>" -> "List"),
// and scoped_type_identifier ("com.example.MyType").
function collectTypeNames(node: SyntaxNode | null | undefined): string[] {
  if (!node) { return []; }
  const names: string[] = [];
  for (const child of node.namedChildren) {
    if (child.type === 'type_identifier') {
      names.push(child.text);
    } else if (child.type === 'generic_type') {
      // For generics like Comparable<String>, extract just the base type name
      const baseName = child.namedChildren.find((c: SyntaxNode) => c.type === 'type_identifier');
      if (baseName) { names.push(baseName.text); }
    } else if (child.type === 'scoped_type_identifier') {
      names.push(child.text);
    } else {
      // Recurse into container nodes like type_list
      names.push(...collectTypeNames(child));
    }
  }
  return names;
}

// Extracts field declarations from a class_body node.
// Returns FieldInfo with name, type, modifiers, and optional initializer.
function extractFields(bodyNode: SyntaxNode | null): FieldInfo[] {
  if (!bodyNode) { return []; }
  const fields: FieldInfo[] = [];

  for (const child of bodyNode.namedChildren) {
    if (child.type === 'field_declaration') {
      const modifiers = getModifiers(child);
      const typeNode = child.childForFieldName('type');
      const type = extractTypeName(typeNode);

      // A field_declaration can have multiple variable_declarators (e.g., int x, y;)
      const declarator = child.childForFieldName('declarator');
      if (declarator) {
        fields.push(...extractVariableDeclarators(declarator, type, modifiers));
      }
    }
  }

  return fields;
}

// Extracts individual variable declarators from a field declaration.
// Handles both single (String name) and multiple (int x, y) declarations.
function extractVariableDeclarators(node: SyntaxNode, type: string, modifiers: string[]): FieldInfo[] {
  const fields: FieldInfo[] = [];

  if (node.type === 'variable_declarator') {
    const nameNode = node.childForFieldName('name');
    const valueNode = node.childForFieldName('value');

    fields.push({
      name: nameNode?.text ?? 'unknown',
      type,
      modifiers,
      initializer: valueNode?.text
    });
  }

  // If there are multiple declarators in a list, recurse
  for (const child of node.namedChildren) {
    if (child.type === 'variable_declarator') {
      const nameNode = child.childForFieldName('name');
      const valueNode = child.childForFieldName('value');

      fields.push({
        name: nameNode?.text ?? 'unknown',
        type,
        modifiers,
        initializer: valueNode?.text
      });
    }
  }

  return fields;
}

// Extracts a single type name from a type node (handles primitives, identifiers, generics, arrays).
function extractTypeName(typeNode: SyntaxNode | null): string {
  if (!typeNode) { return 'unknown'; }

  // Primitive types like int, boolean, etc.
  if (typeNode.type === 'integral_type' || typeNode.type === 'floating_point_type' ||
      typeNode.type === 'boolean_type' || typeNode.type === 'void_type') {
    return typeNode.text;
  }

  // Simple type_identifier like String
  if (typeNode.type === 'type_identifier') {
    return typeNode.text;
  }

  // Generic type like List<String>
  if (typeNode.type === 'generic_type') {
    return typeNode.text;
  }

  // Scoped type like java.util.List
  if (typeNode.type === 'scoped_type_identifier') {
    return typeNode.text;
  }

  // Array type like String[]
  if (typeNode.type === 'array_type') {
    return typeNode.text;
  }

  return typeNode.text;
}

// Extracts constructor declarations from a class_body node.
// Returns ConstructorInfo with parameters and modifiers.
function extractConstructors(bodyNode: SyntaxNode | null): ConstructorInfo[] {
  if (!bodyNode) { return []; }
  const constructors: ConstructorInfo[] = [];

  for (const child of bodyNode.namedChildren) {
    if (child.type === 'constructor_declaration') {
      const modifiers = getModifiers(child);
      const paramsNode = child.childForFieldName('parameters');
      const parameters = extractParameters(paramsNode);

      constructors.push({
        parameters,
        modifiers
      });
    }
  }

  return constructors;
}

// Extracts parameter list from a formal_parameters node.
function extractParameters(paramsNode: SyntaxNode | null): ParameterInfo[] {
  if (!paramsNode) { return []; }
  const parameters: ParameterInfo[] = [];

  for (const child of paramsNode.namedChildren) {
    if (child.type === 'formal_parameter') {
      const typeNode = child.childForFieldName('type');
      const nameNode = child.childForFieldName('name');

      parameters.push({
        name: nameNode?.text ?? 'unknown',
        type: extractTypeName(typeNode)
      });
    }
  }

  return parameters;
}
