import * as vscode from 'vscode';
import { ClassInfo } from './parser/javaExtractor';

interface StoreEntry {
  status: 'pending' | 'parsed';
  data?: ClassInfo[];
}

/**
 * Typed in-memory store: URI string → parsed ClassInfo[] for that file.
 */
export class FileParseStore {
  private store: Map<string, StoreEntry>;

  constructor() {
    this.store = new Map();
  }

  /** Mark a file as pending parse */
  markPending(uri: vscode.Uri) {
    this.store.set(uri.toString(), { status: 'pending' });
  }

  /** Save parsed ClassInfo[] for a file */
  setParsed(uri: vscode.Uri, data: ClassInfo[]) {
    this.store.set(uri.toString(), { status: 'parsed', data });
  }

  /** Remove a file from the store (e.g. on delete) */
  remove(uri: vscode.Uri) {
    this.store.delete(uri.toString());
  }

  /** Get the stored entry for a file, or undefined */
  get(uri: vscode.Uri): StoreEntry | undefined {
    return this.store.get(uri.toString());
  }

  /** Return a shallow snapshot of all stored entries */
  snapshot(): Array<{ uri: string; entry: StoreEntry }> {
    return Array.from(this.store.entries()).map(([k, v]) => ({ uri: k, entry: v }));
  }
}
