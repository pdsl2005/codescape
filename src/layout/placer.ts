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
  const placed = new Set<string>();

  // Separate top-level classes from inner classes
  const topLevel = nodes.filter(n => !n.parentClass);
  const innerClasses = nodes.filter(n => n.parentClass);
  const innerIds = new Set(innerClasses.map(ic => ic.id));

  // Distribute clusters across a roughly-square 2D grid so unrelated nodes
  // don't all stack at col=0 and appear as a diagonal line in isometric view.
  const maxCols = Math.max(1, Math.ceil(Math.sqrt(topLevel.length)));
  let curRow = 0;
  let curCol = 0;

  // First pass: place top-level classes
  for (const node of topLevel) {
    if (!placed.has(node.id)) {
      // Count unplaced neighbors to determine cluster width before placing
      const clusterNeighbors = node.neighbors.filter(
        n => !placed.has(n) && !innerIds.has(n)
      );
      const clusterSize = 1 + clusterNeighbors.length;

      // Wrap to the next row if this cluster won't fit (but always place if at col 0)
      if (curCol > 0 && curCol + clusterSize > maxCols) {
        curRow++;
        curCol = 0;
      }

      layout[node.id] = { col: curCol, row: curRow, depth: 0 };
      placed.add(node.id);

      // Place neighbors to the right in the same row
      let col = curCol + 1;
      for (const neighbor of node.neighbors) {
        if (!placed.has(neighbor) && !innerIds.has(neighbor)) {
          layout[neighbor] = { col, row: curRow, depth: 0 };
          placed.add(neighbor);
          col++;
        }
      }

      curCol += clusterSize;
      if (curCol >= maxCols) {
        curRow++;
        curCol = 0;
      }
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
        layout[innerClass.id] = { col: 0, row: curRow, depth: 1 };
        placed.add(innerClass.id);
        curRow++;
      }
    }
  }

  return layout;
}
