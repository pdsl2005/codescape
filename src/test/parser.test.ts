import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { initParser, extractClasses } from '../parser/javaExtractor';

const fixturesDir = path.join(__dirname, '..', '..', 'src', 'test', 'fixtures');

function loadFixture(name: string): string {
  return fs.readFileSync(path.join(fixturesDir, name), 'utf-8');
}

suite('Java Extractor Tests', () => {
  suiteSetup(async () => {
    await initParser();
  });

  test('extracts simple public class', () => {
    const source = loadFixture('SimpleClass.java');
    const result = extractClasses(source);

    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].Classname, 'SimpleClass');
    assert.deepStrictEqual(result[0].Methods, ['setName(String)', 'getName()']);
    assert.strictEqual(result[0].Type, 'public');
    assert.strictEqual(result[0].Extends, null);
    assert.deepStrictEqual(result[0].Implements, []);
    assert.ok(result[0].Loc > 0);
  });

  test('extracts abstract class with extends and implements', () => {
    const source = loadFixture('AbstractService.java');
    const result = extractClasses(source);

    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].Classname, 'AbstractService');
    assert.strictEqual(result[0].Type, 'abstract');
    assert.strictEqual(result[0].Extends, 'BaseService');
    assert.deepStrictEqual(result[0].Implements, ['Serializable', 'Loggable']);
    assert.deepStrictEqual(result[0].Methods, ['start()', 'initialize()', 'stop()', 'cleanup()']);
  });

  test('extracts interface with extends', () => {
    const source = loadFixture('Printable.java');
    const result = extractClasses(source);

    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].Classname, 'Printable');
    assert.strictEqual(result[0].Type, 'interface');
    assert.strictEqual(result[0].Extends, null);
    assert.deepStrictEqual(result[0].Implements, ['Displayable', 'Formattable']);
    assert.deepStrictEqual(result[0].Methods, ['print()', 'format()']);
  });

  test('extracts multiple and nested classes', () => {
    const source = loadFixture('MultiClass.java');
    const result = extractClasses(source);

    assert.strictEqual(result.length, 3);

    const outer = result.find(c => c.Classname === 'OuterClass');
    assert.ok(outer);
    assert.strictEqual(outer.Type, 'public');
    assert.deepStrictEqual(outer.Methods, ['outerMethod()']);

    const inner = result.find(c => c.Classname === 'InnerClass');
    assert.ok(inner);
    assert.strictEqual(inner.Extends, 'OuterClass');
    assert.deepStrictEqual(inner.Methods, ['innerMethod()']);

    const util = result.find(c => c.Classname === 'UtilityClass');
    assert.ok(util);
    assert.strictEqual(util.Type, 'final');
    assert.deepStrictEqual(util.Methods, ['helperMethod()']);
  });

  test('extracts minimal class with no modifiers', () => {
    const source = loadFixture('MinimalClass.java');
    const result = extractClasses(source);

    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].Classname, 'MinimalClass');
    assert.strictEqual(result[0].Type, 'default');
    assert.deepStrictEqual(result[0].Methods, []);
    assert.strictEqual(result[0].Extends, null);
    assert.deepStrictEqual(result[0].Implements, []);
  });

  test('handles empty source', () => {
    const result = extractClasses('');
    assert.strictEqual(result.length, 0);
  });

  test('handles source with no classes', () => {
    const result = extractClasses('package com.example;\nimport java.util.List;\n');
    assert.strictEqual(result.length, 0);
  });

  test('handles method overloads (same name, different params)', () => {
    const source = loadFixture('MethodOverloads.java');
    const result = extractClasses(source);

    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].Classname, 'MethodOverloads');
    
    // All overloads should be present with their parameter types
    const methods = result[0].Methods;
    assert.ok(methods.includes('process(int)'), 'Should include process(int)');
    assert.ok(methods.includes('process(String)'), 'Should include process(String)');
    assert.ok(methods.includes('process(int, String)'), 'Should include process(int, String)');
    assert.ok(methods.includes('process(double)'), 'Should include process(double)');
    assert.strictEqual(methods.length, 4, 'Should have exactly 4 overloads');
  });

  test('handles static methods', () => {
    const source = loadFixture('StaticMethods.java');
    const result = extractClasses(source);

    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].Classname, 'StaticMethods');
    
    const methods = result[0].Methods;
    assert.ok(methods.includes('staticMethod()'), 'Should include staticMethod()');
    assert.ok(methods.includes('staticIntMethod()'), 'Should include staticIntMethod()');
    assert.ok(methods.includes('staticWithParams(String)'), 'Should include staticWithParams(String)');
    assert.ok(methods.includes('privateStatic()'), 'Should include privateStatic()');
    assert.ok(methods.includes('instanceMethod()'), 'Should include instanceMethod()');
    assert.strictEqual(methods.length, 5, 'Should have exactly 5 methods');
  });

  test('handles abstract methods', () => {
    const source = loadFixture('AbstractMethods.java');
    const result = extractClasses(source);

    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].Classname, 'AbstractMethods');
    assert.strictEqual(result[0].Type, 'abstract');
    
    const methods = result[0].Methods;
    assert.ok(methods.includes('abstractMethod()'), 'Should include abstractMethod()');
    assert.ok(methods.includes('abstractWithReturn()'), 'Should include abstractWithReturn()');
    assert.ok(methods.includes('abstractWithParams(int, String)'), 'Should include abstractWithParams(int, String)');
    assert.ok(methods.includes('concreteMethod()'), 'Should include concreteMethod()');
    assert.ok(methods.includes('staticMethod()'), 'Should include staticMethod()');
    assert.strictEqual(methods.length, 5, 'Should have exactly 5 methods');
  });

  test('handles visibility modifiers', () => {
    const source = loadFixture('VisibilityModifiers.java');
    const result = extractClasses(source);

    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].Classname, 'VisibilityModifiers');
    
    const methods = result[0].Methods;
    assert.ok(methods.includes('publicMethod()'), 'Should include publicMethod()');
    assert.ok(methods.includes('privateMethod()'), 'Should include privateMethod()');
    assert.ok(methods.includes('protectedMethod()'), 'Should include protectedMethod()');
    assert.ok(methods.includes('packagePrivateMethod()'), 'Should include packagePrivateMethod()');
    assert.ok(methods.includes('publicStatic()'), 'Should include publicStatic()');
    assert.ok(methods.includes('privateStatic()'), 'Should include privateStatic()');
    assert.strictEqual(methods.length, 6, 'Should have exactly 6 methods');
  });
});
