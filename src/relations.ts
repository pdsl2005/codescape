import { ClassInfo } from './parser/javaExtractor';

// Java primitive types that are not user-defined classes — excluded from the dependency graph
const PRIMITIVES = new Set([
  'int', 'boolean', 'double', 'float', 'long', 'char', 'byte', 'short', 'void', 'unknown'
]);

export interface ClassGraph {
  // className → set of class names it directly depends on (extends, implements, field/param types)
  dependsOn: Map<string, Set<string>>;
  // className → set of class names that directly depend on it (reverse index)
  dependedOnBy: Map<string, Set<string>>;
}

// Collects all class names that a single class depends on.
// Draws from: Extends, Implements, field types, and constructor parameter types.
function getDependencies(cls: ClassInfo): Set<string> {
  const deps = new Set<string>();

  if (cls.Extends && !PRIMITIVES.has(cls.Extends)) {
    deps.add(cls.Extends);
  }

  for (const impl of cls.Implements) {
    if (!PRIMITIVES.has(impl)) { deps.add(impl); }
  }

  for (const field of cls.Fields) {
    // Strip array/generic suffixes: "List<String>" → "List", "int[]" → "int"
    const baseType = field.type.replace(/[<\[].*/,'').trim();
    if (!PRIMITIVES.has(baseType)) { deps.add(baseType); }
  }

  for (const ctor of cls.Constructors) {
    for (const param of ctor.parameters) {
      const baseType = param.type.replace(/[<\[].*/,'').trim();
      if (!PRIMITIVES.has(baseType)) { deps.add(baseType); }
    }
  }

  return deps;
}

// Builds a bidirectional relationship graph from all currently known classes.
// Call this after every parse to keep the graph fresh.
export function buildGraph(allClasses: ClassInfo[]): ClassGraph {
  const dependsOn = new Map<string, Set<string>>();
  const dependedOnBy = new Map<string, Set<string>>();

  // Initialise nodes for every known class
  for (const cls of allClasses) {
    if (!dependsOn.has(cls.Classname)) { dependsOn.set(cls.Classname, new Set()); }
    if (!dependedOnBy.has(cls.Classname)) { dependedOnBy.set(cls.Classname, new Set()); }
  }

  // Populate edges
  for (const cls of allClasses) {
    const deps = getDependencies(cls);
    dependsOn.set(cls.Classname, deps);

    for (const dep of deps) {
      if (!dependedOnBy.has(dep)) { dependedOnBy.set(dep, new Set()); }
      dependedOnBy.get(dep)!.add(cls.Classname);
    }
  }

  return { dependsOn, dependedOnBy };
}

// Returns class names (not already in changedNames) that directly depend on
// any class in changedNames — i.e. classes that may be affected by the change.
export function getRelated(changedNames: string[], graph: ClassGraph): string[] {
  const changedSet = new Set(changedNames);
  const related = new Set<string>();

  for (const name of changedNames) {
    const dependents = graph.dependedOnBy.get(name);
    if (dependents) {
      for (const dep of dependents) {
        if (!changedSet.has(dep)) { related.add(dep); }
      }
    }
  }

  return Array.from(related);
}
