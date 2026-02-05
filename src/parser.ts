import * as vscode from 'vscode';
import { FileParseStore } from './state';

/**
 * Lightweight, testable text-only parser helper. AST team will replace this.
 */
export function parseFromText(text: string) {
	return {
		length: text.length,
		snippet: text.slice(0, 200),
		generatedAt: new Date().toISOString(),
	};
}

/**
 * Read file from workspace and "parse" it (placeholder) returning an object.
 */
export async function parseJavaFile(uri: vscode.Uri) {
	const bytes = await vscode.workspace.fs.readFile(uri);
	const text = new TextDecoder().decode(bytes);
	return parseFromText(text);
}

/**
 * Orchestrator: mark pending, parse, and store results. Errors are logged.
 */
export async function parseAndStore(uri: vscode.Uri, store: FileParseStore) {
	store.markPending(uri);
	try {
		const parsed = await parseJavaFile(uri);
		store.setParsed(uri, parsed);
		console.log('Parsed and stored for', uri.fsPath);
	} catch (err) {
		console.error('Parsing failed for', uri.fsPath, err);
	}
}
