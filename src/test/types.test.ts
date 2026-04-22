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
});
