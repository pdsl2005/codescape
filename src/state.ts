import * as vscode from 'vscode';

/**
 * Simple in-memory store for parsed results of files.
 * The AST integration will replace the "parsed" value with real AST objects later.
 */
export class FileParseStore {
	private store: Map<string, any>;

	constructor() {
		this.store = new Map();
	}

	/**
	 * Mark a file as pending parse (placeholder)
	 */
	markPending(uri: vscode.Uri) {
		this.store.set(uri.toString(), { status: 'pending' });
	}

	/**
	 * Save parsed results for a file. `parsed` is opaque for now.
	 */
	setParsed(uri: vscode.Uri, parsed: any) {
		this.store.set(uri.toString(), { status: 'parsed', data: parsed });
	}

	/**
	 * Remove a file from the store (e.g., on delete)
	 */
	remove(uri: vscode.Uri) {
		this.store.delete(uri.toString());
	}

	/**
	 * Get the stored entry for a file, or undefined.
	 */
	get(uri: vscode.Uri) {
		return this.store.get(uri.toString());
	}

	/**
	 * Return a shallow snapshot of all stored entries.
	 */
	snapshot() {
		return Array.from(this.store.entries()).map(([k, v]) => ({ uri: k, entry: v }));
	}
}
