import * as assert from 'assert';
import { buildGraph, getRelated } from '../relations';
import { ClassInfo } from '../parser/javaExtractor';

// Helper to build a minimal ClassInfo for testing
function cls(
  name: string,
  opts: {
    extends?: string;
    implements?: string[];
    fieldTypes?: string[];
    ctorParamTypes?: string[];
  } = {}
): ClassInfo {
  return {
    Classname: name,
    Methods: [],
    Loc: 10,
    Type: 'public',
    Extends: opts.extends ?? null,
    Implements: opts.implements ?? [],
    Fields: (opts.fieldTypes ?? []).map(t => ({ name: 'f', type: t, modifiers: [] })),
    Constructors: (opts.ctorParamTypes ?? []).map(t => ({
      parameters: [{ name: 'p', type: t }],
      modifiers: [],
    })),
  };
}

suite('Relations Graph', () => {

  test('empty graph has no edges', () => {
    const graph = buildGraph([]);
    assert.strictEqual(graph.dependsOn.size, 0);
    assert.strictEqual(graph.dependedOnBy.size, 0);
  });

  test('class with no relationships has empty dependency set', () => {
    const graph = buildGraph([cls('Foo')]);
    assert.deepStrictEqual([...graph.dependsOn.get('Foo')!], []);
  });

  test('extends creates a dependency edge', () => {
    const graph = buildGraph([cls('Dog', { extends: 'Animal' }), cls('Animal')]);
    assert.ok(graph.dependsOn.get('Dog')!.has('Animal'), 'Dog should depend on Animal');
    assert.ok(graph.dependedOnBy.get('Animal')!.has('Dog'), 'Animal should be depended on by Dog');
  });

  test('implements creates dependency edges', () => {
    const graph = buildGraph([cls('Foo', { implements: ['Runnable', 'Serializable'] })]);
    assert.ok(graph.dependsOn.get('Foo')!.has('Runnable'));
    assert.ok(graph.dependsOn.get('Foo')!.has('Serializable'));
  });

  test('field type creates a dependency edge', () => {
    const graph = buildGraph([cls('Foo', { fieldTypes: ['Bar'] }), cls('Bar')]);
    assert.ok(graph.dependsOn.get('Foo')!.has('Bar'));
    assert.ok(graph.dependedOnBy.get('Bar')!.has('Foo'));
  });

  test('constructor parameter type creates a dependency edge', () => {
    const graph = buildGraph([cls('Foo', { ctorParamTypes: ['Bar'] }), cls('Bar')]);
    assert.ok(graph.dependsOn.get('Foo')!.has('Bar'));
    assert.ok(graph.dependedOnBy.get('Bar')!.has('Foo'));
  });

  test('primitive types are excluded from dependency graph', () => {
    const graph = buildGraph([
      cls('Foo', { fieldTypes: ['int', 'boolean', 'double', 'void', 'unknown'] }),
    ]);
    assert.deepStrictEqual([...graph.dependsOn.get('Foo')!], []);
  });

  test('getRelated returns classes that depend on a changed class', () => {
    // Dog and Cat both extend Animal; if Animal changes, both are related
    const classes = [
      cls('Animal'),
      cls('Dog', { extends: 'Animal' }),
      cls('Cat', { extends: 'Animal' }),
    ];
    const graph = buildGraph(classes);
    const related = getRelated(['Animal'], graph);
    assert.ok(related.includes('Dog'), 'Dog should be related');
    assert.ok(related.includes('Cat'), 'Cat should be related');
    assert.ok(!related.includes('Animal'), 'Animal itself should not be in related');
  });

  test('getRelated does not include the changed class itself', () => {
    const classes = [cls('Foo', { extends: 'Bar' }), cls('Bar')];
    const graph = buildGraph(classes);
    const related = getRelated(['Bar'], graph);
    assert.ok(!related.includes('Bar'));
  });

  test('getRelated returns empty array when nothing depends on the changed class', () => {
    const graph = buildGraph([cls('Standalone')]);
    const related = getRelated(['Standalone'], graph);
    assert.deepStrictEqual(related, []);
  });

  test('getRelated handles multiple changed classes at once', () => {
    // Baz depends on both Foo and Bar
    const classes = [
      cls('Foo'),
      cls('Bar'),
      cls('Baz', { extends: 'Foo', implements: ['Bar'] }),
    ];
    const graph = buildGraph(classes);
    const related = getRelated(['Foo', 'Bar'], graph);
    assert.ok(related.includes('Baz'), 'Baz should be related to both Foo and Bar');
    assert.strictEqual(related.filter(r => r === 'Baz').length, 1, 'Baz should appear only once');
  });

  test('generic field type base name is used for dependency (List<String> → List)', () => {
    // The extractor strips <...> so field.type would be "List" not "List<String>"
    const graph = buildGraph([cls('Foo', { fieldTypes: ['List'] }), cls('List')]);
    assert.ok(graph.dependsOn.get('Foo')!.has('List'));
  });

  test('sibling inner/nested classes link via parent innerClasses metadata', () => {
    const parent: ClassInfo = {
      ...cls('Outer'),
      innerClasses: ['A', 'B'],
    };
    const a: ClassInfo = { ...cls('A'), parentClass: 'Outer' };
    const b: ClassInfo = { ...cls('B'), parentClass: 'Outer' };
    const graph = buildGraph([parent, a, b]);
    assert.ok(graph.dependsOn.get('A')!.has('Outer'));
    assert.ok(graph.dependsOn.get('A')!.has('B'));
    assert.ok(graph.dependsOn.get('B')!.has('A'));
  });

});
