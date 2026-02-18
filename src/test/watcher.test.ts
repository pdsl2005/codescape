import * as assert from 'assert';
import * as vscode from 'vscode';
import { FileParseStore } from '../state';
import { ClassInfo } from '../parser/javaExtractor';

const stubClass: ClassInfo = {
  Classname: 'Foo',
  Methods: [],
  Loc: 5,
  Type: 'public',
  Extends: null,
  Implements: [],
  Fields: [],
  Constructors: [],
};

suite('Watcher and Store', () => {
  test('FileParseStore lifecycle', async () => {
    const store = new FileParseStore();
    const uri = vscode.Uri.file('/tmp/Test.java');

    store.markPending(uri);
    const pending = store.get(uri);
    assert.ok(pending, 'entry should exist after markPending');
    assert.strictEqual(pending.status, 'pending');

    store.setParsed(uri, [stubClass]);
    const parsed = store.get(uri);
    assert.ok(parsed, 'entry should exist after setParsed');
    assert.strictEqual(parsed.status, 'parsed');
    assert.deepStrictEqual(parsed.data, [stubClass]);

    store.remove(uri);
    assert.strictEqual(store.get(uri), undefined);
  });
});
