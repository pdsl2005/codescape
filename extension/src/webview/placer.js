function computeLayout(nodes) {
  const layout = {};
  let row = 0;
  const placed = new Set();

  const topLevel = nodes.filter(n => !n.parentClass);
  const innerClasses = nodes.filter(n => n.parentClass);

  for (const node of topLevel) {
    if (!placed.has(node.id)) {
      layout[node.id] = { col: 0, row, depth: 0 };
      placed.add(node.id);
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

  for (const innerClass of innerClasses) {
    if (!placed.has(innerClass.id)) {
      const parentLayout = layout[innerClass.parentClass];
      if (parentLayout) {
        layout[innerClass.id] = {
          col: parentLayout.col + 1,
          row: parentLayout.row,
          depth: (parentLayout.depth || 0) + 1
        };
        placed.add(innerClass.id);
      } else {
        layout[innerClass.id] = { col: 0, row, depth: 1 };
        placed.add(innerClass.id);
        row++;
      }
    }
  }

  return layout;
}
