import * as vscode from 'vscode';
import { FileParseStore } from './state';
import { initParser, extractClasses, ClassInfo } from './parser/javaExtractor';
import * as path from 'path';

let parserInitialized = false;

/**
 * Initialize the AST parser once during extension startup.
 */
export async function initializeParser(): Promise<void> {
	if (parserInitialized) {
		return;
	}
	try {
		await initParser();
		parserInitialized = true;
		console.log('AST parser initialized successfully');
	} catch (err) {
		console.error('Failed to initialize AST parser:', err);
		throw err;
	}
}

/**
 * Read file from workspace and parse it using the real AST parser.
 * Returns ClassInfo[] containing extracted class/interface information.
 */
export async function parseJavaFile(uri: vscode.Uri): Promise<ClassInfo[]> {
	if (!parserInitialized) {
		throw new Error('Parser not initialized. Call initializeParser() first.');
	}

	const bytes = await vscode.workspace.fs.readFile(uri);
	const text = new TextDecoder().decode(bytes);
	return extractClasses(text);
}

/**
 * Export parsed ClassInfo data to a JSON file next to the source file.
 * For example: Test.java → Test.json
 */
async function exportParseResultsAsJson(uri: vscode.Uri, classInfo: ClassInfo[]): Promise<void> {
	try {
		// Create JSON filename: Test.java → Test.json
		const javaFilePath = uri.fsPath;
		const jsonFilePath = javaFilePath.replace(/\.java$/, '.json');
		const jsonUri = vscode.Uri.file(jsonFilePath);

		// Create nicely formatted JSON
		const jsonContent = JSON.stringify({
			sourceFile: path.basename(javaFilePath),
			parsedAt: new Date().toISOString(),
			classes: classInfo
		}, null, 2);

		// Write JSON file
		const encoder = new TextEncoder();
		await vscode.workspace.fs.writeFile(jsonUri, encoder.encode(jsonContent));
		console.log(`Exported parse results to ${jsonFilePath}`);
	} catch (err) {
		console.error('Failed to export parse results as JSON:', err);
	}
}

/**
 * Orchestrator: mark pending, parse, store results, and export JSON. Errors are logged.
 */
export async function parseAndStore(uri: vscode.Uri, store: FileParseStore) {
	store.markPending(uri);
	try {
		const parsed = await parseJavaFile(uri);
		store.setParsed(uri, parsed);
		// Also export to JSON file
		await exportParseResultsAsJson(uri, parsed);
		console.log('Parsed and stored for', uri.fsPath, `(found ${parsed.length} classes/interfaces)`);
	} catch (err) {
		console.error('Parsing failed for', uri.fsPath, err);
	}
}
/**
 * getter for parsed data from uri
 */
export function getData(uri: vscode.Uri, store: FileParseStore){
	return store.get(uri);
}