import * as vscode from 'vscode';
import { FileParseStore } from './state';
import { isExcluded } from './extension';
import { parseAndStore } from './parser';
import { ClassInfo } from './parser/javaExtractor';
import { buildGraph, getRelated } from './relations';
import { WebviewManager } from './WebviewManager';
import { computeCityLayout } from './cityLayout';
import type { PartialStatePayload } from './types/messages';
export class JavaFileWatcher {
    private _javaWatcher: vscode.FileSystemWatcher;
    private _pythonWatcher : vscode.FileSystemWatcher;

    constructor(store: FileParseStore, private webviewManager: WebviewManager) {
        this._javaWatcher = vscode.workspace.createFileSystemWatcher('**/*.java');

        this._javaWatcher.onDidChange(async (uri: vscode.Uri) => {
            console.log('Java file changed:', uri.fsPath);
            this.handleIncrementalChange(uri, store);
        });

        this._javaWatcher.onDidDelete((uri: vscode.Uri) => {
            console.log('Java file deleted:', uri.fsPath);
            const before = store.get(uri);
            const removedNames = (before?.data ?? []).map((c: ClassInfo) => c.Classname);
            store.remove(uri);
            this.postIncrementalChange(this.buildPartialStatePayload([], removedNames, store));
        });

        // Python file watcher — same incremental pipeline as Java
        this._pythonWatcher = vscode.workspace.createFileSystemWatcher('**/*.py');

        this._pythonWatcher.onDidCreate(async (uri: vscode.Uri) => {
            console.log('Python file created:', uri.fsPath);
            this.handleIncrementalChange(uri, store);
        });

        this._pythonWatcher.onDidChange(async (uri: vscode.Uri) => {
            console.log('Python file changed:', uri.fsPath);
            this.handleIncrementalChange(uri, store);
        });

        this._pythonWatcher.onDidDelete((uri: vscode.Uri) => {
            console.log('Python file deleted:', uri.fsPath);
            const before = store.get(uri);
            const removedNames = (before?.data ?? []).map((c: ClassInfo) => c.Classname);
            store.remove(uri);
            this.postIncrementalChange(this.buildPartialStatePayload([], removedNames, store));
        });
    }
    private buildPartialStatePayload(
        changedClasses: ClassInfo[],
        removedNames: string[],
        store: FileParseStore
    ): PartialStatePayload {
        const allClasses = store.snapshot().flatMap(e => e.entry.data ?? []);
        const layout = computeCityLayout(allClasses);
        const graph = buildGraph(allClasses);
        const changedNames = changedClasses.map(c => c.Classname);
        const relatedNames = getRelated([...changedNames, ...removedNames], graph);
        const relatedClasses = allClasses.filter(c => relatedNames.includes(c.Classname));
        return {
            changed: changedClasses,
            related: relatedClasses,
            removed: removedNames,
            fullClasses: allClasses,
            layout,
        };
    }

    private async handleIncrementalChange(uri: vscode.Uri, store: FileParseStore) {
        if (!await isExcluded(uri)) {
            const { changed, removed } = await parseAndStore(uri, store);
            const payload = this.buildPartialStatePayload(changed, removed, store);
            this.postIncrementalChange(payload);
        }
    }
    private postIncrementalChange(payload: PartialStatePayload): void {
        this.webviewManager.broadcastPartialState(payload);
    }

    dispose() {
        this._javaWatcher.dispose();
        this._pythonWatcher.dispose();
    }
}
