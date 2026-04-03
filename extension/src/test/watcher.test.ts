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
		let e = store.get(uri);
		assert.strictEqual(e!.status, 'pending');
		let info: ClassInfo[] = [{
		  Classname: 'bar',
		  Methods: [],
		  Loc: 0,
		  Type: 'public',
		  Extends: null,
		  Implements: [],
		  Fields: [],
		  Constructors: []
		}];
		store.setParsed(uri, info);
		e = store.get(uri);
		assert.strictEqual(e!.status, 'parsed');
		assert.deepStrictEqual(e!.data, info);
		store.remove(uri);
		e = store.get(uri);
		assert.strictEqual(e, undefined);
	});
});
