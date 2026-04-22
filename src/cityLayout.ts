import { ClassInfo } from './parser/javaExtractor';
import { buildGraph } from './relations';
import { BuildingNode, LayoutMap } from './layout/types';
import { computeLayout } from './layout/placer';

/**
 * Maps parsed ClassInfo entities to BuildingNode inputs for the shared auto-layout
 * algorithm (neighbor grouping + inner-class depth).
 */
export function classInfosToBuildingNodes(classes: ClassInfo[]): BuildingNode[] {
  const graph = buildGraph(classes);
  return classes.map((cls) => {
    const deps = graph.dependsOn.get(cls.Classname) ?? new Set();
    return {
      id: cls.Classname,
      name: cls.Classname,
      neighbors: Array.from(deps),
      parentClass: cls.parentClass,
      innerClasses: cls.innerClasses,
    };
  });
}

/** Computes grid layout for the full class list (Java + Python + module nodes). */
export function computeCityLayout(classes: ClassInfo[]): LayoutMap {
  const nodes = classInfosToBuildingNodes(classes);
  return computeLayout(nodes);
}
