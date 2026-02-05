// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { FileParseStore } from './state';
import { parseAndStore } from './parser';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "codescape" is now active!');

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	const disposable = vscode.commands.registerCommand('codescape.helloWorld', () => {
		// The code you place here will be executed every time your command is executed
		// Display a message box to the user
		vscode.window.showInformationMessage('Hello World from codescape!');
	});

	context.subscriptions.push(disposable);

	// File watcher for .java files
	const javaWatcher = vscode.workspace.createFileSystemWatcher('**/*.java');

	// Simple in-memory store for parsed results
	const store = new FileParseStore();

	javaWatcher.onDidCreate((uri: vscode.Uri) => {
		console.log('Java file created:', uri.fsPath);
		// kick off parsing asynchronously
		void parseAndStore(uri, store);
	});

	javaWatcher.onDidChange((uri: vscode.Uri) => {
		console.log('Java file changed:', uri.fsPath);
		void parseAndStore(uri, store);
	});

	javaWatcher.onDidDelete((uri: vscode.Uri) => {
		console.log('Java file deleted:', uri.fsPath);
		store.remove(uri);
	});

	// Expose a command to dump the current parse store snapshot (useful for manual verification)
	const dumpDisposable = vscode.commands.registerCommand('codescape.dumpParseStore', () => {
		const snap = store.snapshot();
		console.log('Parse store snapshot:', JSON.stringify(snap, null, 2));
		vscode.window.showInformationMessage(`Parse store contains ${snap.length} entries (see console).`);
	});

	context.subscriptions.push(dumpDisposable);

	context.subscriptions.push(javaWatcher);
}

// This method is called when your extension is deactivated
export function deactivate() {}
