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
});
