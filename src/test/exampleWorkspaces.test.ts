import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { computeCityLayout } from '../cityLayout';
import { LayoutMap } from '../layout/types';
import { initParser, extractClasses, ClassInfo } from '../parser/javaExtractor';
import { initPythonParser, extractPythonEntities } from '../parser/pythonExtractor';

const examplesDir = path.join(__dirname, '..', '..', 'examples');

function loadExampleEntities(exampleFolder: string): ClassInfo[] {
  const folder = path.join(examplesDir, exampleFolder);
  const fileNames = fs.readdirSync(folder).sort();
  const entities: ClassInfo[] = [];

  for (const fileName of fileNames) {
    if (!fileName.endsWith('.java') && !fileName.endsWith('.py')) {
      continue;
    }

    const fullPath = path.join(folder, fileName);
    const source = fs.readFileSync(fullPath, 'utf8');

    if (fileName.endsWith('.java')) {
      entities.push(...extractClasses(source));
      continue;
    }

    if (fileName.endsWith('.py')) {
      entities.push(...extractPythonEntities(source, path.basename(fileName, '.py')));
    }
  }

  return entities;
}

function maxCoordinate(
  layout: LayoutMap,
  axis: 'col' | 'row' | 'depth'
): number {
  return Math.max(
    ...Object.values(layout).map((entry) => (axis === 'depth' ? entry.depth ?? 0 : entry[axis]))
  );
}

suite('Example Workspaces', () => {
  suiteSetup(async () => {
    await initParser();
    await initPythonParser();
  });

  test('java example workspace parses into a compact city layout', () => {
    const entities = loadExampleEntities('java-city');
    const layout = computeCityLayout(entities);

    assert.deepStrictEqual(
      entities.map((entity) => entity.Classname).sort(),
      ['Gate', 'RouteMap', 'ShuttleService', 'TransitHub']
    );
    assert.strictEqual(Object.keys(layout).length, entities.length);
    assert.ok(maxCoordinate(layout, 'col') <= 2, 'java example should stay within three columns');
    assert.ok(maxCoordinate(layout, 'row') <= 1, 'java example should stay within two rows');
    assert.ok(maxCoordinate(layout, 'depth') <= 1, 'java example should have at most one nested layer');
  });

  test('python example workspace parses into a compact city layout', () => {
    const entities = loadExampleEntities('python-city');
    const layout = computeCityLayout(entities);

    assert.deepStrictEqual(
      entities.map((entity) => entity.Classname).sort(),
      ['<city_tools>', 'BaseStation', 'DispatchCenter', 'RouteMap']
    );
    assert.strictEqual(Object.keys(layout).length, entities.length);
    assert.ok(maxCoordinate(layout, 'col') <= 1, 'python example should stay within two columns');
    assert.ok(maxCoordinate(layout, 'row') <= 3, 'python example should stay within four rows');
    assert.ok(maxCoordinate(layout, 'depth') === 0, 'python example should remain top-level');
  });
});
