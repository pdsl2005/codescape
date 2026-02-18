import { Parser, Language, Node as SyntaxNode } from 'web-tree-sitter';
import * as path from 'path';

// JSON output contract for each extracted class/interface
export interface ClassInfo {
  Classname: string;
  Methods: string[];  // Method signatures in format "methodName(paramType1, paramType2)" or "methodName()" for no params
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

function getNamedChildrenOfType(node: SyntaxNode | null, type: string): SyntaxNode[] {
  if (!node) { return []; }
  return node.namedChildren.filter((c: SyntaxNode) => c.type === type);
}

function extractCommonInfo(node: SyntaxNode): {
  name: string;
  loc: number;
  body: SyntaxNode | null;
  methods: string[];
  fields: FieldInfo[];
} {
  const name = node.childForFieldName('name')?.text ?? 'Unknown';
  const loc = node.endPosition.row - node.startPosition.row + 1;
  const body = node.childForFieldName('body');
  const methods = extractMethods(body);
  const fields = extractFields(body);

  return { name, loc, body, methods, fields };
}

// Extracts ClassInfo from a class_declaration node.
function buildClassInfo(node: SyntaxNode): ClassInfo {
  const { name, loc, body, methods, fields } = extractCommonInfo(node);
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
  const { name, loc, body, methods, fields } = extractCommonInfo(node);

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

// Collects method signatures from a class_body or interface_body node.
// Returns signatures in format "methodName(paramType1, paramType2)" or "methodName()" for no params.
// This allows distinguishing method overloads (same name, different parameters).
function extractMethods(bodyNode: SyntaxNode | null): string[] {
  const methods: string[] = [];
  for (const child of bodyNode.namedChildren) {
    if (child.type === 'method_declaration') {
      const name = child.childForFieldName('name');
      if (name) {
        const parameters = child.childForFieldName('parameters');
        const paramTypes = extractParameterTypes(parameters);
        const signature = `${name.text}(${paramTypes.join(', ')})`;
        methods.push(signature);
      }
    }
  }
  return methods;
}

// Extracts parameter types from a formal_parameters node.
// Returns an array of type strings (e.g., ["int", "String", "List"]).
function extractParameterTypes(parametersNode: SyntaxNode | null): string[] {
  if (!parametersNode) { return []; }
  
  const paramTypes: string[] = [];
  
  // formal_parameters contains formal_parameter nodes
  for (const child of parametersNode.namedChildren) {
    if (child.type === 'formal_parameter' || child.type === 'spread_parameter') {
      // Get the type from the formal_parameter
      const typeNode = child.childForFieldName('type');
      if (typeNode) {
        const typeName = extractTypeName(typeNode);
        if (typeName) {
          paramTypes.push(typeName);
        }
      }
    }
  }
  
  return paramTypes;
}

// Extracts a type name from a type node (handles type_identifier, generic_type, etc.).
function extractTypeName(typeNode: SyntaxNode): string | null {
  if (!typeNode) { return null; }
  
  // Handle simple type identifiers
  if (typeNode.type === 'type_identifier') {
    return typeNode.text;
  }
  
  // Handle generic types like List<String> -> "List"
  if (typeNode.type === 'generic_type') {
    const baseType = typeNode.namedChildren.find((c: SyntaxNode) => c.type === 'type_identifier');
    if (baseType) {
      return baseType.text;
    }
  }
  
  // Handle scoped type identifiers like com.example.MyType
  if (typeNode.type === 'scoped_type_identifier') {
    return typeNode.text;
  }
  
  // Handle array types like int[] -> "int[]"
  if (typeNode.type === 'array_type') {
    const elementType = typeNode.childForFieldName('element');
    if (elementType) {
      const baseName = extractTypeName(elementType);
      return baseName ? `${baseName}[]` : null;
    }
  }
  
  // Handle primitive types (int, boolean, etc.) - they appear as type_identifier
  // For other cases, try to get text representation
  return typeNode.text || null;
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
  const fields: FieldInfo[] = [];

  for (const child of getNamedChildrenOfType(bodyNode, 'field_declaration')) {
    const modifiers = getModifiers(child);
    const typeNode = child.childForFieldName('type');
    const type = extractTypeName(typeNode);

    // A field_declaration can have multiple variable_declarators (e.g., int x, y;)
    const declarator = child.childForFieldName('declarator');
    if (declarator) {
      fields.push(...extractVariableDeclarators(declarator, type, modifiers));
    }
  }

  return fields;
}

function buildFieldFromDeclarator(node: SyntaxNode, type: string, modifiers: string[]): FieldInfo {
  const nameNode = node.childForFieldName('name');
  const valueNode = node.childForFieldName('value');

  return {
    name: nameNode?.text ?? 'unknown',
    type,
    modifiers,
    initializer: valueNode?.text
  };
}

// Extracts individual variable declarators from a field declaration.
// Handles both single (String name) and multiple (int x, y) declarations.
function extractVariableDeclarators(node: SyntaxNode, type: string, modifiers: string[]): FieldInfo[] {
  const fields: FieldInfo[] = [];

  if (node.type === 'variable_declarator') {
    fields.push(buildFieldFromDeclarator(node, type, modifiers));
  }

  // If there are multiple declarators in a list, recurse
  for (const child of node.namedChildren) {
    if (child.type === 'variable_declarator') {
      fields.push(buildFieldFromDeclarator(child, type, modifiers));
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
  const constructors: ConstructorInfo[] = [];

  for (const child of getNamedChildrenOfType(bodyNode, 'constructor_declaration')) {
    const modifiers = getModifiers(child);
    const paramsNode = child.childForFieldName('parameters');
    const parameters = extractParameters(paramsNode);

    constructors.push({
      parameters,
      modifiers
    });
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
