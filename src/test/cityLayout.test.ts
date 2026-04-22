import * as assert from 'assert';
import { computeCityLayout, classInfosToBuildingNodes } from '../cityLayout';
import { ClassInfo } from '../parser/javaExtractor';

suite('City layout bridging', () => {
  test('computeCityLayout produces positions for Java-like and Python-like entities', () => {
    const classes: ClassInfo[] = [
      {
        Classname: 'A',
        Methods: [],
        Loc: 1,
        Type: 'public',
        Extends: null,
        Implements: [],
        Fields: [],
        Constructors: [],
      },
      {
        Classname: 'B',
        Methods: [],
        Loc: 1,
        Type: 'class',
        Extends: 'A',
        Implements: [],
        Fields: [],
        Constructors: [],
      },
      {
        Classname: '<mymodule>',
        Methods: [{ name: 'f', parameters: [], returnType: 'None', modifiers: [] }],
        Loc: 5,
        Type: 'module',
        Extends: null,
        Implements: [],
        Fields: [],
        Constructors: [],
      },
    ];
    const layout = computeCityLayout(classes);
    assert.ok(layout['A'], 'layout should include A');
    assert.ok(layout['B'], 'layout should include B');
    assert.ok(layout['<mymodule>'], 'layout should include module node');
  });

  test('nested classes get parentClass edges in building graph', () => {
    const classes: ClassInfo[] = [
      {
        Classname: 'Outer',
        Methods: [],
        Loc: 1,
        Type: 'class',
        Extends: null,
        Implements: [],
        Fields: [],
        Constructors: [],
        innerClasses: ['Inner'],
      },
      {
        Classname: 'Inner',
        Methods: [],
        Loc: 1,
        Type: 'class',
        Extends: null,
        Implements: [],
        Fields: [],
        Constructors: [],
        parentClass: 'Outer',
      },
    ];
    const nodes = classInfosToBuildingNodes(classes);
    const inner = nodes.find((n) => n.id === 'Inner');
    assert.ok(inner);
    assert.ok(inner!.neighbors.includes('Outer'));
    const layout = computeCityLayout(classes);
    assert.strictEqual(layout['Inner'].depth, 1);
  });
});
