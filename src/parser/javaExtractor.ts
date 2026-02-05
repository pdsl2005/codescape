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
  };
}

// Extracts ClassInfo from an interface_declaration node.
// Interfaces that extend other interfaces have those listed under Implements.
function buildInterfaceInfo(node: SyntaxNode): ClassInfo {
  const name = node.childForFieldName('name')?.text ?? 'Unknown';
  const loc = node.endPosition.row - node.startPosition.row + 1;
  const body = node.childForFieldName('body');
  const methods = extractMethods(body);

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
