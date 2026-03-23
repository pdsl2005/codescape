import * as vscode from 'vscode';
import { FileParseStore } from './state';
import { isExcluded } from './extension';
import { parseAndStore } from './parser';
import { ClassInfo } from './parser/javaExtractor';
import { buildGraph, getRelated } from './relations';
import { WebviewManager } from './WebviewManager';

type IncrementalChangePayload = {
    changed?: ClassInfo[];
    related?: ClassInfo[];
    removed?: string[];
};
export class JavaFileWatcher {
    private _watcher: vscode.FileSystemWatcher;

    constructor(store: FileParseStore, private webviewManager: WebviewManager) {
        this._watcher = vscode.workspace.createFileSystemWatcher('**/*.java');

        this._watcher.onDidChange(async (uri: vscode.Uri) => {
            console.log('Java file changed:', uri.fsPath);
            this.handleIncrementalChange(uri, store);
        });

        this._watcher.onDidDelete((uri: vscode.Uri) => {
            console.log('Java file deleted:', uri.fsPath);
            const before = store.get(uri);
            const removedNames = (before?.data ?? []).map((c: ClassInfo) => c.Classname);
            store.remove(uri);
            this.postIncrementalChange({ removed: removedNames });
        });
    }
    private buildPartialStatePayload(
        changedClasses: ClassInfo[],
        removedNames: string[],
        store: FileParseStore
    ): { changed: ClassInfo[]; related: ClassInfo[]; removed: string[] } {
        const allClasses = store.snapshot().flatMap(e => e.entry.data ?? []);
        const graph = buildGraph(allClasses);
        const changedNames = changedClasses.map(c => c.Classname);
        const relatedNames = getRelated([...changedNames, ...removedNames], graph);
        const relatedClasses = allClasses.filter(c => relatedNames.includes(c.Classname));
        return { changed: changedClasses, related: relatedClasses, removed: removedNames };
    }

    private async handleIncrementalChange(uri: vscode.Uri, store: FileParseStore) {
        if (!await isExcluded(uri)) {
            const { changed, removed } = await parseAndStore(uri, store);
            //create payload from parsed data
            const payload: IncrementalChangePayload = this.buildPartialStatePayload(changed, removed, store);
            //send message to frontend
            this.postIncrementalChange(payload);
        }
    }
    private async postIncrementalChange(payload: IncrementalChangePayload) {
        this.webviewManager.broadcastPartialState(payload);
    }

    dispose() {
        this._watcher.dispose();
    }
}