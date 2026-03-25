// @ts-nocheck
import { Parser, Language, Node as SyntaxNode } from 'web-tree-sitter';
import * as path from 'path';
import { ClassInfo, MethodInfo, FieldInfo, ConstructorInfo, ParameterInfo } from './javaExtractor';

// Re-export so consumers can import from this module directly
export type { ClassInfo, MethodInfo, FieldInfo, ConstructorInfo, ParameterInfo };

let pythonParser: Parser | null = null;

/**
 * Initializes the Tree-sitter parser with the Python WASM grammar.
 * Safe to call multiple times — only initializes once.
 */
export async function initPythonParser(): Promise<void> {
  if (pythonParser) { return; }
  await Parser.init();
  pythonParser = new Parser();
  const wasmPath = path.join(
    __dirname, '..', '..', 'node_modules',
    'tree-sitter-python', 'tree-sitter-python.wasm'
  );
  const python = await Language.load(wasmPath);
  pythonParser.setLanguage(python);
}

/**
 * Parses Python source code and returns a ClassInfo array.
 *
 * Mapping to the shared ClassInfo contract:
 *   - Classes          → one ClassInfo per class_definition
 *   - Inheritance      → Extends = first base, Implements = additional bases
 *   - Instance fields  → Fields from self.x = ... in __init__
 *   - Class variables  → Fields from top-level assignments in the class body
 *   - Constructor      → Constructors from __init__ params (minus self/cls)
 *   - Methods          → all defs in class body except __init__
 *   - Module-level     → one synthetic ClassInfo with Type="module"
 *                        Methods = standalone functions
 *                        Fields  = module-level variable assignments
 *                        Implements = imported module names (for relations.ts graph)
 *
 * @param source     Raw Python source text
 * @param moduleName Basename without extension (e.g. "utils" for utils.py)
 */
export function extractPythonEntities(source: string, moduleName: string): ClassInfo[] {
  if (!pythonParser) {
    throw new Error('Python parser not initialized. Call initPythonParser() first.');
  }

  const tree = pythonParser.parse(source);
  if (!tree) {
    throw new Error('Failed to parse Python source.');
  }

  const results: ClassInfo[] = [];
  const classMap = new Map<string, ClassInfo>();
  const root = tree.rootNode;

  // Top-level class definitions (including decorated); nested classes recurse into body
  for (const child of root.namedChildren) {
    if (child.type === 'class_definition') {
      visitPythonClass(child, null, results, classMap);
    } else if (child.type === 'decorated_definition') {
      const inner = child.namedChildren.find((c: SyntaxNode) => c.type === 'class_definition');
      if (inner) {
        visitPythonClass(inner, null, results, classMap);
      }
    }
  }

  // Module-level entry (standalone functions, variables, imports)
  const moduleEntry = buildModuleEntry(root, moduleName);
  if (moduleEntry) {
    results.push(moduleEntry);
    classMap.set(moduleEntry.Classname, moduleEntry);
  }

  linkInnerClasses(results, classMap);
  return results;
}

/** Walk nested class_definition nodes and set parentClass like Java extractor. */
function visitPythonClass(
  node: SyntaxNode,
  parentClassName: string | null,
  results: ClassInfo[],
  classMap: Map<string, ClassInfo>
): void {
  const info = buildClassInfo(node, parentClassName);
  results.push(info);
  classMap.set(info.Classname, info);

  const body = node.childForFieldName('body');
  if (!body) { return; }

  for (const child of body.namedChildren) {
    if (child.type === 'class_definition') {
      visitPythonClass(child, info.Classname, results, classMap);
    } else if (child.type === 'decorated_definition') {
      const inner = child.namedChildren.find((c: SyntaxNode) => c.type === 'class_definition');
      if (inner) {
        visitPythonClass(inner, info.Classname, results, classMap);
      }
    }
  }
}

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

// ---------------------------------------------------------------------------
// Class extraction
// ---------------------------------------------------------------------------

function buildClassInfo(node: SyntaxNode, parentClassName: string | null = null): ClassInfo {
  const name = node.childForFieldName('name')?.text ?? 'Unknown';
  const loc = node.endPosition.row - node.startPosition.row + 1;

  const superclassesNode = node.childForFieldName('superclasses');
  const bases = extractBaseClasses(superclassesNode);

  const body = node.childForFieldName('body');

  const isAbstract =
    bases.some(b => b === 'ABC' || b === 'ABCMeta' || b === 'abc.ABC') ||
    hasAbstractMethodDecorator(body);

  const { methods, initNode } = extractMethods(body);
  const fields = extractFields(body, initNode);
  const constructors = initNode ? [buildConstructorInfo(initNode)] : [];

  const classInfo: ClassInfo = {
    Classname: name,
    Methods: methods,
    Loc: loc,
    Type: isAbstract ? 'abstract' : 'class',
    Extends: bases.length > 0 ? bases[0] : null,
    Implements: bases.slice(1),
    Fields: fields,
    Constructors: constructors,
  };
  if (parentClassName) {
    classInfo.parentClass = parentClassName;
  }
  return classInfo;
}

function extractBaseClasses(superclassesNode: SyntaxNode | null): string[] {
  if (!superclassesNode) { return []; }
  const bases: string[] = [];

  for (const child of superclassesNode.namedChildren) {
    if (child.type === 'identifier') {
      bases.push(child.text);
    } else if (child.type === 'attribute') {
      bases.push(child.text);
    } else if (child.type === 'subscript') {
      bases.push(extractTypeName(child));
    }
    // skip keyword_argument (e.g. metaclass=ABCMeta)
  }

  return bases;
}

function hasAbstractMethodDecorator(body: SyntaxNode | null): boolean {
  if (!body) { return false; }
  for (const child of body.namedChildren) {
    if (child.type === 'decorated_definition') {
      for (const dec of child.namedChildren) {
        if (dec.type === 'decorator' && dec.text.includes('abstractmethod')) {
          return true;
        }
      }
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Method extraction
// ---------------------------------------------------------------------------

function extractMethods(body: SyntaxNode | null): {
  methods: MethodInfo[];
  initNode: SyntaxNode | null;
} {
  const methods: MethodInfo[] = [];
  let initNode: SyntaxNode | null = null;

  if (!body) { return { methods, initNode }; }

  for (const child of body.namedChildren) {
    const { funcNode, decoratedParent } = resolveFunctionNode(child);

    if (!funcNode) { continue; }

    const funcName = funcNode.childForFieldName('name')?.text;
    if (!funcName) { continue; }

    if (funcName === '__init__') {
      initNode = funcNode;
      continue; // tracked separately as constructor
    }

    const paramsNode = funcNode.childForFieldName('parameters');
    const returnTypeNode = funcNode.childForFieldName('return_type');

    methods.push({
      name: funcName,
      parameters: extractParamTypes(paramsNode, true),
      returnType: returnTypeNode ? extractTypeName(returnTypeNode) : 'None',
      modifiers: decoratedParent ? getDecoratorNames(decoratedParent) : [],
    });
  }

  return { methods, initNode };
}

function buildConstructorInfo(initNode: SyntaxNode): ConstructorInfo {
  const paramsNode = initNode.childForFieldName('parameters');
  return {
    parameters: extractFullParams(paramsNode),
    modifiers: [],
  };
}

// ---------------------------------------------------------------------------
// Field extraction
// ---------------------------------------------------------------------------

function extractFields(body: SyntaxNode | null, initNode: SyntaxNode | null): FieldInfo[] {
  const fields: FieldInfo[] = [];
  const seen = new Set<string>();

  // Class-level variable assignments: x = value  or  x: Type = value
  if (body) {
    for (const child of body.namedChildren) {
      const assignNode = unwrapAssignment(child);
      if (assignNode) {
        const left = assignNode.childForFieldName('left');
        if (left?.type === 'identifier' && !seen.has(left.text)) {
          seen.add(left.text);
          const typeNode = assignNode.childForFieldName('type');
          fields.push({
            name: left.text,
            type: typeNode ? extractTypeName(typeNode) : 'unknown',
            modifiers: [],
          });
        }
      }
    }
  }

  // Instance variables from __init__: self.x = ...
  if (initNode) {
    const initBody = initNode.childForFieldName('body');
    if (initBody) {
      collectSelfAssignments(initBody, fields, seen);
    }
  }

  return fields;
}

/** tree-sitter-python wraps assignments inside expression_statement; unwrap if needed. */
function unwrapAssignment(node: SyntaxNode): SyntaxNode | null {
  if (node.type === 'assignment') { return node; }
  if (node.type === 'expression_statement') {
    return node.namedChildren.find((c: SyntaxNode) => c.type === 'assignment') ?? null;
  }
  return null;
}

function collectSelfAssignments(
  bodyNode: SyntaxNode,
  fields: FieldInfo[],
  seen: Set<string>
): void {
  for (const child of bodyNode.namedChildren) {
    // tree-sitter-python wraps assignments inside expression_statement nodes
    const assignNode = unwrapAssignment(child);
    if (assignNode) {
      const left = assignNode.childForFieldName('left');
      if (left?.type === 'attribute') {
        const objNode = left.childForFieldName('object');
        const attrNode = left.childForFieldName('attribute');
        if (objNode?.text === 'self' && attrNode && !seen.has(attrNode.text)) {
          seen.add(attrNode.text);
          const typeNode = assignNode.childForFieldName('type');
          fields.push({
            name: attrNode.text,
            type: typeNode ? extractTypeName(typeNode) : 'unknown',
            modifiers: [],
          });
        }
      }
    } else if (
      child.type === 'if_statement' ||
      child.type === 'for_statement' ||
      child.type === 'while_statement' ||
      child.type === 'try_statement' ||
      child.type === 'with_statement'
    ) {
      // Recurse into nested blocks to catch self.x = ... inside conditionals
      for (const blockChild of child.namedChildren) {
        if (blockChild.type === 'block') {
          collectSelfAssignments(blockChild, fields, seen);
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Module-level entry
// ---------------------------------------------------------------------------

function buildModuleEntry(root: SyntaxNode, moduleName: string): ClassInfo | null {
  const standaloneFunctions: MethodInfo[] = [];
  const moduleFields: FieldInfo[] = [];
  const importedNames: string[] = [];
  const moduleCodeBlocks: MethodInfo[] = [];
  let moduleCodeIndex = 0;

  for (const child of root.namedChildren) {
    const { funcNode, decoratedParent } = resolveFunctionNode(child);
    if (funcNode) {
      standaloneFunctions.push(buildStandaloneFunctionInfo(funcNode, decoratedParent));
    } else if (child.type === 'import_statement') {
      extractImportedModuleNames(child, importedNames);
    } else if (child.type === 'import_from_statement') {
      extractFromImportModuleName(child, importedNames);
    } else {
      // tree-sitter-python wraps assignments inside expression_statement
      const assignNode = unwrapAssignment(child);
      if (assignNode) {
        const left = assignNode.childForFieldName('left');
        if (left?.type === 'identifier') {
          const typeNode = assignNode.childForFieldName('type');
          moduleFields.push({
            name: left.text,
            type: typeNode ? extractTypeName(typeNode) : 'unknown',
            modifiers: [],
          });
        }
      } else if (isModuleCodeNode(child)) {
        moduleCodeIndex += 1;
        moduleCodeBlocks.push(buildModuleCodeInfo(child, moduleCodeIndex));
      }
    }
  }

  if (
    standaloneFunctions.length === 0 &&
    moduleFields.length === 0 &&
    importedNames.length === 0 &&
    moduleCodeBlocks.length === 0
  ) {
    return null;
  }

  return {
    Classname: `<${moduleName}>`,
    Methods: [...standaloneFunctions, ...moduleCodeBlocks],
    Loc: root.endPosition.row - root.startPosition.row + 1,
    Type: 'module',
    Extends: null,
    Implements: [...new Set(importedNames)], // deduped import names for relations graph
    Fields: moduleFields,
    Constructors: [],
  };
}

function buildStandaloneFunctionInfo(
  funcNode: SyntaxNode,
  decoratedParent: SyntaxNode | null
): MethodInfo {
  const name = funcNode.childForFieldName('name')?.text ?? 'unknown';
  const paramsNode = funcNode.childForFieldName('parameters');
  const returnTypeNode = funcNode.childForFieldName('return_type');

  return {
    name,
    parameters: extractParamTypes(paramsNode, false),
    returnType: returnTypeNode ? extractTypeName(returnTypeNode) : 'None',
    modifiers: decoratedParent ? getDecoratorNames(decoratedParent) : [],
  };
}

function buildModuleCodeInfo(node: SyntaxNode, index: number): MethodInfo {
  return {
    name: `<module_code_${index}>`,
    parameters: [],
    returnType: 'None',
    modifiers: [node.type],
  };
}

// ---------------------------------------------------------------------------
// Import helpers
// ---------------------------------------------------------------------------

function extractImportedModuleNames(node: SyntaxNode, names: string[]): void {
  for (const child of node.namedChildren) {
    if (child.type === 'dotted_name') {
      const first = child.namedChildren.find((c: SyntaxNode) => c.type === 'identifier');
      if (first) { names.push(first.text); }
    } else if (child.type === 'aliased_import') {
      const nameNode = child.childForFieldName('name');
      if (nameNode?.type === 'dotted_name') {
        const first = nameNode.namedChildren.find((c: SyntaxNode) => c.type === 'identifier');
        if (first) { names.push(first.text); }
      } else if (nameNode?.type === 'identifier') {
        names.push(nameNode.text);
      }
    }
  }
}

function extractFromImportModuleName(node: SyntaxNode, names: string[]): void {
  const moduleName = node.childForFieldName('module_name');
  if (!moduleName) { return; }

  if (moduleName.type === 'dotted_name') {
    const first = moduleName.namedChildren.find((c: SyntaxNode) => c.type === 'identifier');
    if (first) { names.push(first.text); }
  } else if (moduleName.type === 'relative_import') {
    const inner = moduleName.namedChildren.find((c: SyntaxNode) => c.type === 'dotted_name');
    if (inner) {
      const first = inner.namedChildren.find((c: SyntaxNode) => c.type === 'identifier');
      if (first) { names.push(first.text); }
    }
  } else if (moduleName.type === 'identifier') {
    names.push(moduleName.text);
  }
}

function resolveFunctionNode(child: SyntaxNode): {
  funcNode: SyntaxNode | null;
  decoratedParent: SyntaxNode | null;
} {
  if (child.type === 'function_definition' || child.type === 'async_function_definition') {
    return { funcNode: child, decoratedParent: null };
  }

  if (child.type === 'decorated_definition') {
    const funcNode = child.namedChildren.find((c: SyntaxNode) =>
      c.type === 'function_definition' || c.type === 'async_function_definition'
    ) ?? null;
    return { funcNode, decoratedParent: funcNode ? child : null };
  }

  return { funcNode: null, decoratedParent: null };
}

function isModuleCodeNode(node: SyntaxNode): boolean {
  if (
    node.type === 'class_definition' ||
    node.type === 'function_definition' ||
    node.type === 'async_function_definition' ||
    node.type === 'import_statement' ||
    node.type === 'import_from_statement' ||
    node.type === 'assignment'
  ) {
    return false;
  }

  if (node.type === 'decorated_definition') {
    return !node.namedChildren.some((child: SyntaxNode) =>
      child.type === 'class_definition' ||
      child.type === 'function_definition' ||
      child.type === 'async_function_definition'
    );
  }

  if (node.type === 'expression_statement') {
    const firstNamed = node.namedChildren[0];
    if (firstNamed?.type === 'string') {
      return false;
    }
  }

  return true;
}

// ---------------------------------------------------------------------------
// Parameter helpers
// ---------------------------------------------------------------------------

/**
 * Extracts full ParameterInfo (name + type) — used for constructor extraction.
 * Always skips 'self' and 'cls'.
 */
function extractFullParams(paramsNode: SyntaxNode | null): ParameterInfo[] {
  if (!paramsNode) { return []; }
  const params: ParameterInfo[] = [];

  for (const child of paramsNode.namedChildren) {
    const { name, type } = resolveParam(child);
    if (!name || name === 'self' || name === 'cls') { continue; }
    params.push({ name, type });
  }

  return params;
}

/**
 * Extracts parameter types only — used for method signature extraction.
 * @param skipSelf  When true, skips the first 'self'/'cls' parameter.
 */
function extractParamTypes(
  paramsNode: SyntaxNode | null,
  skipSelf: boolean
): string[] {
  if (!paramsNode) { return []; }
  const types: string[] = [];
  let skippedSelf = false;

  for (const child of paramsNode.namedChildren) {
    const { name, type } = resolveParam(child);
    if (!name) { continue; }
    if (skipSelf && !skippedSelf && (name === 'self' || name === 'cls')) {
      skippedSelf = true;
      continue;
    }
    types.push(type);
  }

  return types;
}

/** Extracts name and type from any parameter node variant. */
function resolveParam(child: SyntaxNode): { name: string; type: string } {
  switch (child.type) {
    case 'identifier':
      return { name: child.text, type: 'unknown' };

    case 'typed_parameter': {
      const nameNode = child.namedChildren.find((c: SyntaxNode) => c.type === 'identifier');
      const typeNode = child.childForFieldName('type') ??
        child.namedChildren.find((c: SyntaxNode) =>
          c.type !== 'identifier' &&
          c.type !== 'list_splat_pattern' &&
          c.type !== 'dictionary_splat_pattern'
        );
      return {
        name: nameNode?.text ?? 'unknown',
        type: typeNode ? extractTypeName(typeNode) : 'unknown',
      };
    }

    case 'default_parameter': {
      const nameNode = child.childForFieldName('name');
      return { name: nameNode?.text ?? 'unknown', type: 'unknown' };
    }

    case 'typed_default_parameter': {
      const nameNode = child.childForFieldName('name');
      const typeNode = child.childForFieldName('type');
      return {
        name: nameNode?.text ?? 'unknown',
        type: typeNode ? extractTypeName(typeNode) : 'unknown',
      };
    }

    case 'list_splat_pattern':
      return { name: `*${child.namedChildren[0]?.text ?? ''}`, type: 'unknown' };

    case 'dictionary_splat_pattern':
      return { name: `**${child.namedChildren[0]?.text ?? ''}`, type: 'unknown' };

    default:
      return { name: '', type: 'unknown' };
  }
}

// ---------------------------------------------------------------------------
// Type name helpers
// ---------------------------------------------------------------------------

function extractTypeName(typeNode: SyntaxNode | null): string {
  if (!typeNode) { return 'unknown'; }

  switch (typeNode.type) {
    case 'identifier':
      return typeNode.text;

    case 'subscript': {
      // List[str], Dict[str, int] → "List"
      const base = typeNode.childForFieldName('value');
      return base?.text ?? typeNode.text;
    }

    case 'attribute':
      return typeNode.text;

    case 'none':
      return 'None';

    case 'type':
      return typeNode.namedChildren.length > 0
        ? extractTypeName(typeNode.namedChildren[0])
        : typeNode.text;

    default:
      return typeNode.text || 'unknown';
  }
}

// ---------------------------------------------------------------------------
// Decorator helpers
// ---------------------------------------------------------------------------

function getDecoratorNames(decoratedNode: SyntaxNode): string[] {
  const names: string[] = [];
  for (const child of decoratedNode.namedChildren) {
    if (child.type === 'decorator') {
      names.push(child.text.replace(/^@/, '').trim());
    }
  }
  return names;
}
