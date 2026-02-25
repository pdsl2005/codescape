import { BuildingNode, LayoutMap } from './types';

/**
 * Wireframe auto layout algorithm
 * - Related classes are grouped in the same row.
 * - Unrelated classes are placed in new rows.
 * - Classes with no relationships are placed in their own row.
 * - Circular references are grouped together.
 *
 * Returns: { [className]: { col, row } }
 */
export function computeLayout(nodes: BuildingNode[]): LayoutMap {
  const layout: LayoutMap = {};
  let row = 0;
  const placed = new Set<string>();

  for (const node of nodes) {
    if (!placed.has(node.id)) {
      // Place node
      layout[node.id] = { col: 0, row };
      placed.add(node.id);
      // Place neighbors in same row
      let col = 1;
      for (const neighbor of node.neighbors) {
        if (!placed.has(neighbor)) {
          layout[neighbor] = { col, row };
          placed.add(neighbor);
          col++;
        }
      }
      row++;
    }
  }
  return layout;
}
