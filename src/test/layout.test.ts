import * as assert from 'assert';
import { computeLayout } from '../layout/placer';
import { BuildingNode } from '../layout/types';

describe('computeLayout', () => {
  it('places unrelated nodes in separate rows', () => {
    const nodes: BuildingNode[] = [
      { id: 'A', name: 'A', neighbors: [] },
      { id: 'B', name: 'B', neighbors: [] },
    ];
    const layout = computeLayout(nodes);
    assert.deepStrictEqual(layout['A'], { col: 0, row: 0 });
    assert.deepStrictEqual(layout['B'], { col: 0, row: 1 });
  });

  it('places related nodes next to each other', () => {
    const nodes: BuildingNode[] = [
      { id: 'A', name: 'A', neighbors: ['B'] },
      { id: 'B', name: 'B', neighbors: [] },
    ];
    const layout = computeLayout(nodes);
    assert.deepStrictEqual(layout['A'], { col: 0, row: 0 });
    assert.deepStrictEqual(layout['B'], { col: 1, row: 0 });
  });

  it('handles circular references', () => {
    const nodes: BuildingNode[] = [
      { id: 'E', name: 'E', neighbors: ['F'] },
      { id: 'F', name: 'F', neighbors: ['E'] }
    ];
    const layout = computeLayout(nodes);
    assert.deepStrictEqual(layout['E'], { col: 0, row: 0 });
    assert.deepStrictEqual(layout['F'], { col: 1, row: 0 });
  });

  it('handles isolated nodes', () => {
    const nodes: BuildingNode[] = [
      { id: 'G', name: 'G', neighbors: [] }
    ];
    const layout = computeLayout(nodes);
    assert.deepStrictEqual(layout['G'], { col: 0, row: 0 });
  });
});
