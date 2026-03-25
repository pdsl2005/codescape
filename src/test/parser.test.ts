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
    assert.strictEqual(result[0].Methods.length, 2);
    assert.strictEqual(result[0].Methods[0].name, 'setName');
    assert.deepStrictEqual(result[0].Methods[0].parameters, ['String']);
    assert.strictEqual(result[0].Methods[1].name, 'getName');
    assert.deepStrictEqual(result[0].Methods[1].parameters, []);
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
    // ensure method names present
    const absMethods = result[0].Methods.map(m => m.name);
    assert.ok(absMethods.includes('start'));
    assert.ok(absMethods.includes('initialize'));
    assert.ok(absMethods.includes('stop'));
    assert.ok(absMethods.includes('cleanup'));
  });

  test('extracts interface with extends', () => {
    const source = loadFixture('Printable.java');
    const result = extractClasses(source);

    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].Classname, 'Printable');
    assert.strictEqual(result[0].Type, 'interface');
    assert.strictEqual(result[0].Extends, null);
    assert.deepStrictEqual(result[0].Implements, ['Displayable', 'Formattable']);
    const ifaceMethods = result[0].Methods.map(m => m.name);
    assert.ok(ifaceMethods.includes('print'));
    assert.ok(ifaceMethods.includes('format'));
  });

  test('extracts multiple and nested classes', () => {
    const source = loadFixture('MultiClass.java');
    const result = extractClasses(source);

    assert.strictEqual(result.length, 3);

    const outer = result.find(c => c.Classname === 'OuterClass');
    assert.ok(outer);
    assert.strictEqual(outer.Type, 'public');
    assert.strictEqual(outer.Methods.length, 1);
    assert.strictEqual(outer.Methods[0].name, 'outerMethod');

    const inner = result.find(c => c.Classname === 'InnerClass');
    assert.ok(inner);
    assert.strictEqual(inner.Extends, 'OuterClass');
    assert.strictEqual(inner.Methods.length, 1);
    assert.strictEqual(inner.Methods[0].name, 'innerMethod');

    const util = result.find(c => c.Classname === 'UtilityClass');
    assert.ok(util);
    assert.strictEqual(util.Type, 'final');
    assert.strictEqual(util.Methods.length, 1);
    assert.strictEqual(util.Methods[0].name, 'helperMethod');
  });

  test('extracts minimal class with no modifiers', () => {
    const source = loadFixture('MinimalClass.java');
    const result = extractClasses(source);

    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].Classname, 'MinimalClass');
    assert.strictEqual(result[0].Type, 'default');
    assert.strictEqual(result[0].Methods.length, 0);
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
    const methods = result[0].Methods.map(m => `${m.name}(${m.parameters.join(', ')})`);
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

    const methodsStatic = result[0].Methods.map(m => `${m.name}(${m.parameters.join(', ')})`);
    assert.ok(methodsStatic.includes('staticMethod()'), 'Should include staticMethod()');
    assert.ok(methodsStatic.includes('staticIntMethod()'), 'Should include staticIntMethod()');
    assert.ok(methodsStatic.includes('staticWithParams(String)'), 'Should include staticWithParams(String)');
    assert.ok(methodsStatic.includes('privateStatic()'), 'Should include privateStatic()');
    assert.ok(methodsStatic.includes('instanceMethod()'), 'Should include instanceMethod()');
    assert.strictEqual(methodsStatic.length, 5, 'Should have exactly 5 methods');
  });

  test('handles abstract methods', () => {
    const source = loadFixture('AbstractMethods.java');
    const result = extractClasses(source);

    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].Classname, 'AbstractMethods');
    assert.strictEqual(result[0].Type, 'abstract');

    const methodsAbs = result[0].Methods.map(m => `${m.name}(${m.parameters.join(', ')})`);
    assert.ok(methodsAbs.includes('abstractMethod()'), 'Should include abstractMethod()');
    assert.ok(methodsAbs.includes('abstractWithReturn()'), 'Should include abstractWithReturn()');
    assert.ok(methodsAbs.includes('abstractWithParams(int, String)'), 'Should include abstractWithParams(int, String)');
    assert.ok(methodsAbs.includes('concreteMethod()'), 'Should include concreteMethod()');
    assert.ok(methodsAbs.includes('staticMethod()'), 'Should include staticMethod()');
    assert.strictEqual(methodsAbs.length, 5, 'Should have exactly 5 methods');
  });

  test('handles visibility modifiers', () => {
    const source = loadFixture('VisibilityModifiers.java');
    const result = extractClasses(source);

    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].Classname, 'VisibilityModifiers');

    const methodsVis = result[0].Methods.map(m => `${m.name}(${m.parameters.join(', ')})`);
    assert.ok(methodsVis.includes('publicMethod()'), 'Should include publicMethod()');
    assert.ok(methodsVis.includes('privateMethod()'), 'Should include privateMethod()');
    assert.ok(methodsVis.includes('protectedMethod()'), 'Should include protectedMethod()');
    assert.ok(methodsVis.includes('packagePrivateMethod()'), 'Should include packagePrivateMethod()');
    assert.ok(methodsVis.includes('publicStatic()'), 'Should include publicStatic()');
    assert.ok(methodsVis.includes('privateStatic()'), 'Should include privateStatic()');
    assert.strictEqual(methodsVis.length, 6, 'Should have exactly 6 methods');
  });

  test('extracts inner classes with parentClass reference', () => {
    const source = loadFixture('InnerClasses.java');
    const result = extractClasses(source);

    // Should find outer class + 6 inner classes
    assert.strictEqual(result.length, 7, 'Should extract 7 classes (1 outer + 6 inner)');

    const outer = result.find(c => c.Classname === 'OuterClass');
    assert.ok(outer, 'Should find OuterClass');
    assert.strictEqual(outer.parentClass, undefined, 'Outer class should have no parent');
    assert.deepStrictEqual(outer.innerClasses, [
      'InstanceInnerClass',
      'StaticNestedClass',
      'PrivateInnerClass',
      'ProtectedInnerClass',
      'FinalInnerClass',
      'AbstractInnerClass'
    ], 'Outer class should list all inner classes');

    const instanceInner = result.find(c => c.Classname === 'InstanceInnerClass');
    assert.ok(instanceInner, 'Should find InstanceInnerClass');
    assert.strictEqual(instanceInner.parentClass, 'OuterClass', 'Inner class should reference parent');
    assert.strictEqual(instanceInner.isStatic, undefined, 'Non-static inner class should not have isStatic flag');

    const staticNested = result.find(c => c.Classname === 'StaticNestedClass');
    assert.ok(staticNested, 'Should find StaticNestedClass');
    assert.strictEqual(staticNested.parentClass, 'OuterClass', 'Static nested should reference parent');
    assert.strictEqual(staticNested.isStatic, true, 'Static nested should have isStatic flag');

    const privateInner = result.find(c => c.Classname === 'PrivateInnerClass');
    assert.ok(privateInner, 'Should find PrivateInnerClass');
    assert.strictEqual(privateInner.Type, 'private', 'Private inner class should have private type');

    const abstractInner = result.find(c => c.Classname === 'AbstractInnerClass');
    assert.ok(abstractInner, 'Should find AbstractInnerClass');
    assert.strictEqual(abstractInner.Type, 'abstract', 'Abstract inner class should have abstract type');
  });

  test('extracts deeply nested classes', () => {
    const source = loadFixture('DeepNestedClasses.java');
    const result = extractClasses(source);

    // Outermost + FirstLevel + SecondLevel + ThirdLevel + FirstLevelStatic + OutermostStatic + NestedInStatic
    assert.ok(result.length >= 7, 'Should extract deeply nested classes');

    const outermost = result.find(c => c.Classname === 'Outermost');
    assert.ok(outermost, 'Should find Outermost');

    const firstLevel = result.find(c => c.Classname === 'FirstLevel');
    assert.ok(firstLevel, 'Should find FirstLevel');
    assert.strictEqual(firstLevel.parentClass, 'Outermost', 'FirstLevel parent should be Outermost');

    const secondLevel = result.find(c => c.Classname === 'SecondLevel');
    assert.ok(secondLevel, 'Should find SecondLevel');
    assert.strictEqual(secondLevel.parentClass, 'FirstLevel', 'SecondLevel parent should be FirstLevel');

    const thirdLevel = result.find(c => c.Classname === 'ThirdLevel');
    assert.ok(thirdLevel, 'Should find ThirdLevel');
    assert.strictEqual(thirdLevel.parentClass, 'SecondLevel', 'ThirdLevel parent should be SecondLevel');
  });

  test('extracts inner types in interfaces', () => {
    const source = loadFixture('InterfaceWithInnerTypes.java');
    const result = extractClasses(source);

    // OuterInterface + NestedInterface + NestedClassInInterface + StaticNestedInterface + InnerImplementer
    assert.ok(result.length >= 5, 'Should extract interface and inner types');

    const outerInterface = result.find(c => c.Classname === 'OuterInterface');
    assert.ok(outerInterface, 'Should find OuterInterface');
    assert.strictEqual(outerInterface.Type, 'interface', 'OuterInterface should be interface type');

    const nestedInterface = result.find(c => c.Classname === 'NestedInterface');
    assert.ok(nestedInterface, 'Should find NestedInterface');
    assert.strictEqual(nestedInterface.parentClass, 'OuterInterface', 'NestedInterface parent should be OuterInterface');
    assert.strictEqual(nestedInterface.Type, 'interface', 'NestedInterface should be interface type');

    const nestedClass = result.find(c => c.Classname === 'NestedClassInInterface');
    assert.ok(nestedClass, 'Should find NestedClassInInterface');
    assert.strictEqual(nestedClass.parentClass, 'OuterInterface', 'NestedClassInInterface parent should be OuterInterface');
  });
});
