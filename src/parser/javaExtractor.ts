// @ts-nocheck
import { Parser, Language, Node as SyntaxNode } from 'web-tree-sitter';
import * as path from 'path';

// JSON output contract for each extracted class/interface
export interface ClassInfo {
  Classname: string;
  Methods: MethodInfo[];  // Detailed method information
  Loc: number;
  Type: string;       // "public", "abstract", "final", "private", "protected", "interface", or "default"
  Extends: string | null;
  Implements: string[];
  Fields: FieldInfo[];
  Constructors: ConstructorInfo[];

  // Inner/nested class support
  parentClass?: string;        // Name of parent class (if this is an inner class)
  innerClasses?: string[];     // Names of inner classes (if this class contains any)
  isStatic?: boolean;          // Whether this is a static inner class
  isAnonymous?: boolean;       // Whether this is an anonymous class
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

export interface MethodInfo {
  name: string;
  parameters: string[]; // just types
  returnType: string;
  modifiers: string[];
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
  const classMap = new Map<string, ClassInfo>();
  visit(tree.rootNode, results, classMap, null);
  // Post-process to establish parent-child relationships
  linkInnerClasses(results, classMap);
  return results;
}

// Recursively walks the syntax tree to find class and interface declarations.
// Tracks parent class context to establish inner class relationships.
function visit(
  node: SyntaxNode,
  results: ClassInfo[],
  classMap: Map<string, ClassInfo>,
  parentClassName: string | null
): void {
  if (node.type === 'class_declaration') {
    const classInfo = buildClassInfo(node, parentClassName);
    results.push(classInfo);
    classMap.set(classInfo.Classname, classInfo);
    // Visit inner classes with this class as parent
    visitInnerClasses(node, results, classMap, classInfo.Classname);
  } else if (node.type === 'interface_declaration') {
    const interfaceInfo = buildInterfaceInfo(node, parentClassName);
    results.push(interfaceInfo);
    classMap.set(interfaceInfo.Classname, interfaceInfo);
    // Visit inner interfaces with this interface as parent
    visitInnerClasses(node, results, classMap, interfaceInfo.Classname);
  }

  // For non-class nodes, continue searching
  if (node.type !== 'class_declaration' && node.type !== 'interface_declaration') {
    for (const child of node.namedChildren) {
      visit(child, results, classMap, parentClassName);
    }
  }
}

// Visits only the immediate children of a class/interface body to find inner classes
function visitInnerClasses(
  classNode: SyntaxNode,
  results: ClassInfo[],
  classMap: Map<string, ClassInfo>,
  parentClassName: string
): void {
  const body = classNode.childForFieldName('body');
  if (!body) { return; }

  for (const child of body.namedChildren) {
    if (child.type === 'class_declaration') {
      const classInfo = buildClassInfo(child, parentClassName);
      results.push(classInfo);
      classMap.set(classInfo.Classname, classInfo);
      // Recursively handle inner classes of inner classes
      visitInnerClasses(child, results, classMap, classInfo.Classname);
    } else if (child.type === 'interface_declaration') {
      const interfaceInfo = buildInterfaceInfo(child, parentClassName);
      results.push(interfaceInfo);
      classMap.set(interfaceInfo.Classname, interfaceInfo);
      visitInnerClasses(child, results, classMap, interfaceInfo.Classname);
    }
  }
}

// Post-processes results to establish parent-to-child relationships
// so that parents know which inner classes they contain
function linkInnerClasses(results: ClassInfo[], classMap: Map<string, ClassInfo>): void {
  for (const classInfo of results) {
    if (classInfo.parentClass) {
      const parent = classMap.get(classInfo.parentClass);
      if (parent) {
        if (!parent.innerClasses) {
          parent.innerClasses = [];
        }
        parent.innerClasses.push(classInfo.Classname);
      }
    }
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
  methods: MethodInfo[];
  fields: FieldInfo[];
} {
  const name = node.childForFieldName('name')?.text ?? 'Unknown';
  const loc = node.endPosition.row - node.startPosition.row + 1;
  const body = node.childForFieldName('body');
  // Use detailed methods as the canonical `methods` representation
  const methods = extractMethodsDetailed(body);
  const fields = extractFields(body);

  return { name, loc, body, methods, fields };
}

// Extracts ClassInfo from a class_declaration node.
function buildClassInfo(node: SyntaxNode, parentClassName: string | null = null): ClassInfo {
  const { name, loc, body, methods, fields } = extractCommonInfo(node);
  const constructors = extractConstructors(body);
  const modifiers = getModifiers(node);
  const type = determineType(modifiers);
  const isStatic = modifiers.includes('static');

  // "superclass" field holds the extends clause (e.g. extends BaseService)
  const superclassNode = node.childForFieldName('superclass');
  const extendsTypes = collectTypeNames(superclassNode);

  // "interfaces" field holds the implements clause (e.g. implements Serializable, Loggable)
  const interfacesNode = node.childForFieldName('interfaces');
  const implementsTypes = collectTypeNames(interfacesNode);

  const classInfo: ClassInfo = {
    Classname: name,
    Methods: methods,
    Loc: loc,
    Type: type,
    Extends: extendsTypes.length > 0 ? extendsTypes[0] : null,
    Implements: implementsTypes,
    Fields: fields,
    Constructors: constructors,
  };

  // Add inner class metadata if applicable
  if (parentClassName) {
    classInfo.parentClass = parentClassName;
  }
  if (isStatic) {
    classInfo.isStatic = true;
  }

  return classInfo;
}

// Extracts ClassInfo from an interface_declaration node.
// Interfaces that extend other interfaces have those listed under Implements.
function buildInterfaceInfo(node: SyntaxNode, parentClassName: string | null = null): ClassInfo {
  const { name, loc, body, methods, fields } = extractCommonInfo(node);
  const modifiers = getModifiers(node);
  const isStatic = modifiers.includes('static');

  // For interfaces, "extends_interfaces" is a child node (not a field)
  const extendsNode = node.namedChildren.find((c: SyntaxNode) => c.type === 'extends_interfaces');
  const extendsList = collectTypeNames(extendsNode);

  const interfaceInfo: ClassInfo = {
    Classname: name,
    Methods: methods,
    Loc: loc,
    Type: 'interface',
    Extends: null,
    Implements: extendsList,
    Fields: fields,
    Constructors: [], // Interfaces don't have constructors
  };

  // Add inner interface metadata if applicable
  if (parentClassName) {
    interfaceInfo.parentClass = parentClassName;
  }
  if (isStatic) {
    interfaceInfo.isStatic = true;
  }

  return interfaceInfo;
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

// (legacy extractMethods removed — Methods are now represented by MethodInfo via extractMethodsDetailed)

// Detailed method extraction: returns MethodInfo objects with name, parameter types, return type and modifiers
function extractMethodsDetailed(bodyNode: SyntaxNode | null): MethodInfo[] {
  const methods: MethodInfo[] = [];
  if (!bodyNode) { return methods; }

  for (const child of bodyNode.namedChildren) {
    if (child.type === 'method_declaration') {
      const nameNode = child.childForFieldName('name');
      if (!nameNode) { continue; }

      const parameters = child.childForFieldName('parameters');
      const paramTypes = extractParameterTypes(parameters);

      const returnTypeNode = child.childForFieldName('type');
      const returnType = extractTypeName(returnTypeNode);

      const modifiers = getModifiers(child);

      methods.push({
        name: nameNode.text,
        parameters: paramTypes,
        returnType: returnType || 'unknown',
        modifiers
      });
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
// Returns null if the type cannot be determined.
function extractTypeName(typeNode: SyntaxNode | null): string {
  if (!typeNode) { return 'unknown'; }

  // Primitive types like int, boolean, etc.
  if (typeNode.type === 'integral_type' || typeNode.type === 'floating_point_type' ||
    typeNode.type === 'boolean_type' || typeNode.type === 'void_type') {
    return typeNode.text;
  }

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
    return typeNode.text;
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
      return baseName ? `${baseName}[]` : 'unknown[]';
    }
  }

  // For other cases, try to get text representation
  return typeNode.text || 'unknown';
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
