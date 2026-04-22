import { BuildingNode, LayoutMap } from './types';

/**
 * Wireframe auto layout algorithm
 * - Related classes are grouped in the same row.
 * - Unrelated classes are placed in new rows.
 * - Classes with no relationships are placed in their own row.
 * - Circular references are grouped together.
 * - Inner classes are positioned relative to their parent class with increased depth.
 *
 * Returns: { [className]: { col, row, depth } }
 */
export function computeLayout(nodes: BuildingNode[]): LayoutMap {
  const layout: LayoutMap = {};
  let row = 0;
  const placed = new Set<string>();

  // Separate top-level classes from inner classes
  const topLevel = nodes.filter(n => !n.parentClass);
  const innerClasses = nodes.filter(n => n.parentClass);

  // First pass: place top-level classes using original algorithm
  for (const node of topLevel) {
    if (!placed.has(node.id)) {
      // Place node
      layout[node.id] = { col: 0, row, depth: 0 };
      placed.add(node.id);
      // Place neighbors in same row
      let col = 1;
      for (const neighbor of node.neighbors) {
        if (!placed.has(neighbor) && !innerClasses.some(ic => ic.id === neighbor)) {
          layout[neighbor] = { col, row, depth: 0 };
          placed.add(neighbor);
          col++;
        }
      }
      row++;
    }
  }

  // Second pass: place inner classes after all existing nodes in their parent's row
  // so they never collide with neighbors placed during the first pass.
  const nextColPerRow = new Map<string, number>();
  for (const pos of Object.values(layout)) {
    const key = String(pos.row);
    const next = pos.col + 1;
    if (next > (nextColPerRow.get(key) ?? 0)) {
      nextColPerRow.set(key, next);
    }
  }

  for (const innerClass of innerClasses) {
    if (!placed.has(innerClass.id)) {
      const parentLayout = layout[innerClass.parentClass!];
      if (parentLayout) {
        const rowKey = String(parentLayout.row);
        const innerCol = nextColPerRow.get(rowKey) ?? 0;
        nextColPerRow.set(rowKey, innerCol + 1);

        layout[innerClass.id] = {
          col: innerCol,
          row: parentLayout.row,
          depth: (parentLayout.depth ?? 0) + 1,
        };
        placed.add(innerClass.id);
      } else {
        // Fallback: place as standalone if parent not found
        layout[innerClass.id] = { col: 0, row, depth: 1 };
        placed.add(innerClass.id);
        row++;
      }
    }
  }

  return layout;
}
