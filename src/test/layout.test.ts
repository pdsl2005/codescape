import * as assert from 'assert';
import { computeLayout } from '../layout/placer';
import { BuildingNode } from '../layout/types';

suite('Layout Placer Tests', () => {
  test('places unrelated nodes in separate rows', () => {
    const nodes: BuildingNode[] = [
      { id: 'A', name: 'A', neighbors: [] },
      { id: 'B', name: 'B', neighbors: [] },
    ];
    const layout = computeLayout(nodes);
    assert.deepStrictEqual(layout['A'], { col: 0, row: 0, depth: 0 });
    assert.deepStrictEqual(layout['B'], { col: 0, row: 1, depth: 0 });
  });

  test('places related nodes next to each other', () => {
    const nodes: BuildingNode[] = [
      { id: 'A', name: 'A', neighbors: ['B'] },
      { id: 'B', name: 'B', neighbors: [] },
    ];
    const layout = computeLayout(nodes);
    assert.deepStrictEqual(layout['A'], { col: 0, row: 0, depth: 0 });
    assert.deepStrictEqual(layout['B'], { col: 1, row: 0, depth: 0 });
  });

  test('handles circular references', () => {
    const nodes: BuildingNode[] = [
      { id: 'E', name: 'E', neighbors: ['F'] },
      { id: 'F', name: 'F', neighbors: ['E'] }
    ];
    const layout = computeLayout(nodes);
    assert.deepStrictEqual(layout['E'], { col: 0, row: 0, depth: 0 });
    assert.deepStrictEqual(layout['F'], { col: 1, row: 0, depth: 0 });
  });

  test('handles isolated nodes', () => {
    const nodes: BuildingNode[] = [
      { id: 'G', name: 'G', neighbors: [] }
    ];
    const layout = computeLayout(nodes);
    assert.deepStrictEqual(layout['G'], { col: 0, row: 0, depth: 0 });
  });

  test('positions inner classes relative to parent', () => {
    const nodes: BuildingNode[] = [
      { id: 'Outer', name: 'Outer', neighbors: [] },
      { id: 'Inner', name: 'Inner', neighbors: [], parentClass: 'Outer' }
    ];
    const layout = computeLayout(nodes);
    assert.ok(layout['Outer'], 'Should place outer class');
    assert.ok(layout['Inner'], 'Should place inner class');
    assert.strictEqual(layout['Inner'].depth, 1, 'Inner class should have depth 1');
    assert.ok(layout['Inner'].col > layout['Outer'].col, 'Inner should be offset from parent');
  });

  test('handles nested inner classes', () => {
    const nodes: BuildingNode[] = [
      { id: 'Outer', name: 'Outer', neighbors: [] },
      { id: 'Middle', name: 'Middle', neighbors: [], parentClass: 'Outer' },
      { id: 'Inner', name: 'Inner', neighbors: [], parentClass: 'Middle' }
    ];
    const layout = computeLayout(nodes);
    assert.ok(layout['Outer'], 'Should place outer class');
    assert.ok(layout['Middle'], 'Should place middle class');
    assert.ok(layout['Inner'], 'Should place inner class');
    assert.strictEqual(layout['Outer'].depth, 0, 'Outer class should have depth 0');
    assert.strictEqual(layout['Middle'].depth, 1, 'Middle class should have depth 1');
    assert.strictEqual(layout['Inner'].depth, 2, 'Inner class should have depth 2');
  });

  test('places multiple inner classes of the same parent at distinct positions', () => {
    const nodes: BuildingNode[] = [
      { id: 'Outer', name: 'Outer', neighbors: [] },
      { id: 'Inner1', name: 'Inner1', neighbors: [], parentClass: 'Outer' },
      { id: 'Inner2', name: 'Inner2', neighbors: [], parentClass: 'Outer' },
      { id: 'Inner3', name: 'Inner3', neighbors: [], parentClass: 'Outer' },
    ];
    const layout = computeLayout(nodes);
    const positions = [layout['Inner1'], layout['Inner2'], layout['Inner3']];
    const keys = positions.map(p => `${p.col},${p.row}`);
    const unique = new Set(keys);
    assert.strictEqual(unique.size, 3, 'All inner classes must have distinct grid positions');
  });

  test('no two nodes share the same grid position', () => {
    const nodes: BuildingNode[] = [
      { id: 'A', name: 'A', neighbors: ['B', 'C'] },
      { id: 'B', name: 'B', neighbors: [] },
      { id: 'C', name: 'C', neighbors: [] },
      { id: 'D', name: 'D', neighbors: [] },
      { id: 'InnerA1', name: 'InnerA1', neighbors: [], parentClass: 'A' },
      { id: 'InnerA2', name: 'InnerA2', neighbors: [], parentClass: 'A' },
      { id: 'InnerB1', name: 'InnerB1', neighbors: [], parentClass: 'B' },
    ];
    const layout = computeLayout(nodes);
    const seen = new Set<string>();
    for (const [id, pos] of Object.entries(layout)) {
      const key = `${pos.col},${pos.row}`;
      assert.ok(!seen.has(key), `Duplicate position ${key} for node ${id}`);
      seen.add(key);
    }
  });
});
