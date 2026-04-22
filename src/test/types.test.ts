import * as assert from 'assert';
import { filesToBuildingDTOs, FileData } from '../webview/types';

function makeFile(name: string): FileData {
  return { name, lines: 10, functions: 2, classes: 1 };
}

suite('filesToBuildingDTOs', () => {
  test('first 10 files fill row 0, columns 0–9', () => {
    const files = Array.from({ length: 10 }, (_, i) => makeFile(`File${i}`));
    const dtos = filesToBuildingDTOs(files);
    for (let i = 0; i < 10; i++) {
      assert.strictEqual(dtos[i].col, i, `File ${i} should be at col ${i}`);
      assert.strictEqual(dtos[i].row, 0, `File ${i} should be at row 0`);
    }
  });

  test('file 10 wraps to col 0, row 1', () => {
    const files = Array.from({ length: 11 }, (_, i) => makeFile(`File${i}`));
    const dtos = filesToBuildingDTOs(files);
    assert.strictEqual(dtos[10].col, 0);
    assert.strictEqual(dtos[10].row, 1);
  });

  test('25 files produce a 3-row layout with no duplicates', () => {
    const files = Array.from({ length: 25 }, (_, i) => makeFile(`File${i}`));
    const dtos = filesToBuildingDTOs(files);
    const seen = new Set<string>();
    for (const dto of dtos) {
      const key = `${dto.col},${dto.row}`;
      assert.ok(!seen.has(key), `Duplicate position ${key}`);
      seen.add(key);
    }
    const maxRow = Math.max(...dtos.map(d => d.row));
    assert.strictEqual(maxRow, 2, 'Should span rows 0, 1, 2');
  });

  test('single file placed at origin', () => {
    const dtos = filesToBuildingDTOs([makeFile('Solo')]);
    assert.strictEqual(dtos[0].col, 0);
    assert.strictEqual(dtos[0].row, 0);
  });

  test('uses layout positions when provided, falls back to grid for missing entries', () => {
    const files = [
      makeFile('Alpha'),
      makeFile('Beta'),
      makeFile('Gamma'),
    ];
    const layout: Record<string, { col: number; row: number }> = {
      'Alpha': { col: 5, row: 3 },
      'Beta':  { col: 0, row: 7 },
      // Gamma has no entry — should fall back to i%10
    };
    const dtos = filesToBuildingDTOs(files, layout);
    assert.strictEqual(dtos[0].col, 5, 'Alpha should use layout col');
    assert.strictEqual(dtos[0].row, 3, 'Alpha should use layout row');
    assert.strictEqual(dtos[1].col, 0, 'Beta should use layout col');
    assert.strictEqual(dtos[1].row, 7, 'Beta should use layout row');
    assert.strictEqual(dtos[2].col, 2, 'Gamma should fall back to i%10 (index 2)');
    assert.strictEqual(dtos[2].row, 0, 'Gamma should fall back to Math.floor(2/10)');
  });
});
