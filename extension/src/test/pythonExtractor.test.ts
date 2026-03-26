import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { initPythonParser, extractPythonEntities } from '../parser/pythonExtractor';

const fixturesDir = path.join(__dirname, '..', '..', 'src', 'test', 'fixtures');

function loadFixture(name: string): string {
  return fs.readFileSync(path.join(fixturesDir, name), 'utf-8');
}

suite('Python Extractor Tests', () => {
  suiteSetup(async () => {
    await initPythonParser();
  });

  test('extracts simple class with fields and methods', () => {
    const source = loadFixture('SimpleClass.py');
    const result = extractPythonEntities(source, 'SimpleClass');

    const dogClass = result.find(r => r.Classname === 'Dog');
    assert.ok(dogClass, 'Dog class should be extracted');
    assert.strictEqual(dogClass.Type, 'class');
    assert.strictEqual(dogClass.Extends, null);
    assert.deepStrictEqual(dogClass.Implements, []);

    // Methods (excluding __init__)
    assert.strictEqual(dogClass.Methods.length, 2);
    assert.strictEqual(dogClass.Methods[0].name, 'speak');
    assert.strictEqual(dogClass.Methods[0].returnType, 'str');
    assert.strictEqual(dogClass.Methods[1].name, 'get_age');
    assert.strictEqual(dogClass.Methods[1].returnType, 'int');

    // Constructor from __init__
    assert.strictEqual(dogClass.Constructors.length, 1);
    assert.strictEqual(dogClass.Constructors[0].parameters.length, 2);
    assert.strictEqual(dogClass.Constructors[0].parameters[0].name, 'name');
    assert.strictEqual(dogClass.Constructors[0].parameters[0].type, 'str');
    assert.strictEqual(dogClass.Constructors[0].parameters[1].name, 'age');
    assert.strictEqual(dogClass.Constructors[0].parameters[1].type, 'int');

    // Instance fields from __init__
    const fieldNames = dogClass.Fields.map(f => f.name);
    assert.ok(fieldNames.includes('species'), 'should extract class variable species');
    assert.ok(fieldNames.includes('name'), 'should extract self.name');
    assert.ok(fieldNames.includes('age'), 'should extract self.age');

    assert.ok(dogClass.Loc > 0);
  });

  test('extracts single-level inheritance', () => {
    const source = loadFixture('Inheritance.py');
    const result = extractPythonEntities(source, 'Inheritance');

    const dog = result.find(r => r.Classname === 'Dog');
    assert.ok(dog, 'Dog class should be extracted');
    assert.strictEqual(dog.Extends, 'Animal');
    assert.deepStrictEqual(dog.Implements, []);
  });

  test('extracts multiple inheritance — first base is Extends, rest are Implements', () => {
    const source = loadFixture('Inheritance.py');
    const result = extractPythonEntities(source, 'Inheritance');

    const guide = result.find(r => r.Classname === 'GuideDog');
    assert.ok(guide, 'GuideDog class should be extracted');
    assert.strictEqual(guide.Extends, 'Dog');
    assert.deepStrictEqual(guide.Implements, ['object']);
  });

  test('detects abstract class via ABC base and @abstractmethod', () => {
    const source = loadFixture('AbstractClass.py');
    const result = extractPythonEntities(source, 'AbstractClass');

    const shape = result.find(r => r.Classname === 'Shape');
    assert.ok(shape, 'Shape class should be extracted');
    assert.strictEqual(shape.Type, 'abstract');
    assert.strictEqual(shape.Extends, 'ABC');
  });

  test('abstract class methods include decorated methods', () => {
    const source = loadFixture('AbstractClass.py');
    const result = extractPythonEntities(source, 'AbstractClass');

    const shape = result.find(r => r.Classname === 'Shape');
    assert.ok(shape);
    const methodNames = shape.Methods.map(m => m.name);
    assert.ok(methodNames.includes('area'));
    assert.ok(methodNames.includes('perimeter'));
    assert.ok(methodNames.includes('describe'));

    const area = shape.Methods.find(m => m.name === 'area');
    assert.ok(area, 'area method should exist');
    assert.ok(area.modifiers.some((d: string) => d.includes('abstractmethod')));
  });

  test('extracts module-level entry with standalone functions and imports', () => {
    const source = loadFixture('ModuleLevel.py');
    const result = extractPythonEntities(source, 'ModuleLevel');

    const mod = result.find(r => r.Classname === '<ModuleLevel>');
    assert.ok(mod, 'module entry should be created');
    assert.strictEqual(mod.Type, 'module');

    // Standalone functions
    const fnNames = mod.Methods.map((m: any) => m.name);
    assert.ok(fnNames.includes('greet'));
    assert.ok(fnNames.includes('add'));

    // Module-level variables
    const fieldNames = mod.Fields.map((f: any) => f.name);
    assert.ok(fieldNames.includes('MAX_RETRIES'));
    assert.ok(fieldNames.includes('DEFAULT_TIMEOUT'));

    // Imported module names feed the relations graph
    assert.ok(mod.Implements.includes('os'));
    assert.ok(mod.Implements.includes('sys'));
    assert.ok(mod.Implements.includes('typing'));
    assert.ok(mod.Implements.includes('collections'));
  });

  test('module entry is null for file with only classes', () => {
    const source = loadFixture('SimpleClass.py');
    const result = extractPythonEntities(source, 'SimpleClass');
    const mod = result.find(r => r.Classname === '<SimpleClass>');
    assert.strictEqual(mod, undefined, 'no module entry for class-only file');
  });

  test('extracts async and decorated class/module functions', () => {
    const source = loadFixture('AsyncDecorated.py');
    const result = extractPythonEntities(source, 'AsyncDecorated');

    const service = result.find(r => r.Classname === 'Service');
    assert.ok(service, 'Service class should be extracted');
    assert.strictEqual(service.Extends, null);

    const methodNames = service.Methods.map(m => m.name);
    assert.ok(methodNames.includes('build'));
    assert.ok(methodNames.includes('version'));

    const build = service.Methods.find(m => m.name === 'build');
    assert.ok(build, 'build method should exist');
    assert.deepStrictEqual(build.parameters, ['str']);
    assert.ok(build.modifiers.includes('classmethod'));

    const version = service.Methods.find(m => m.name === 'version');
    assert.ok(version, 'version method should exist');
    assert.strictEqual(version.returnType, 'str');
    assert.ok(version.modifiers.includes('staticmethod'));

    const moduleEntry = result.find(r => r.Classname === '<AsyncDecorated>');
    assert.ok(moduleEntry, 'module entry should exist');
    const fetchStatus = moduleEntry.Methods.find(m => m.name === 'fetch_status');
    assert.ok(fetchStatus, 'decorated async module function should exist');
    assert.deepStrictEqual(fetchStatus.parameters, ['str']);
    assert.ok(fetchStatus.modifiers.includes('lru_cache'));
  });

  test('extracts self assignments from nested control-flow blocks', () => {
    const source = loadFixture('NestedAssignments.py');
    const result = extractPythonEntities(source, 'NestedAssignments');

    const config = result.find(r => r.Classname === 'Config');
    assert.ok(config, 'Config class should be extracted');

    const fieldNames = config.Fields.map(f => f.name).sort();
    assert.ok(fieldNames.includes('mode'));
    assert.ok(fieldNames.includes('retries'));
    assert.ok(fieldNames.includes('never'));
    assert.ok(fieldNames.includes('status'));
    assert.ok(fieldNames.includes('path'));
  });

  test('extracts generic bases and module-level executable code markers', () => {
    const source = loadFixture('GenericBaseAndModuleCode.py');
    const result = extractPythonEntities(source, 'GenericBaseAndModuleCode');

    const repository = result.find(r => r.Classname === 'Repository');
    assert.ok(repository, 'Repository class should be extracted');
    assert.strictEqual(repository.Extends, 'BaseModel');
    assert.deepStrictEqual(repository.Implements, ['AuditMixin']);

    const moduleEntry = result.find(r => r.Classname === '<GenericBaseAndModuleCode>');
    assert.ok(moduleEntry, 'module entry should exist');
    assert.ok(moduleEntry.Implements.includes('pkg'));
    assert.ok(moduleEntry.Fields.some(f => f.name === 'VALUE'));

    const moduleCodeMarkers = moduleEntry.Methods.filter(m => m.name.startsWith('<module_code_'));
    assert.strictEqual(moduleCodeMarkers.length, 1, 'should capture one executable module code block');
    assert.deepStrictEqual(moduleCodeMarkers[0].modifiers, ['if_statement']);
  });
});
