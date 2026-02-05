import * as assert from 'assert';
import * as vscode from 'vscode';
import { FileParseStore } from '../state';
import { parseFromText } from '../parser';

suite('Watcher and Store', () => {
	test('parseFromText basic', () => {
		const res = parseFromText('class A {}');
		assert.strictEqual(res.length, 10);
		assert.ok(res.snippet.includes('class A'));
	});

	test('FileParseStore lifecycle', async () => {
		const store = new FileParseStore();
		const uri = vscode.Uri.file('/tmp/Test.java');
		store.markPending(uri);
		let e = store.get(uri);
		assert.strictEqual(e.status, 'pending');
		store.setParsed(uri, { foo: 'bar' });
		e = store.get(uri);
		assert.strictEqual(e.status, 'parsed');
		assert.deepStrictEqual(e.data, { foo: 'bar' });
		store.remove(uri);
		e = store.get(uri);
		assert.strictEqual(e, undefined);
	});
});
