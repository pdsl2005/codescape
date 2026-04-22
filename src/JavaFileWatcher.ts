import * as vscode from 'vscode';
import { FileParseStore } from './state';
import { isExcluded } from './extension';
import { parseAndStore } from './parser';
import { ClassInfo } from './parser/javaExtractor';
import { buildGraph, getRelated } from './relations';
import { WebviewManager } from './WebviewManager';
import { computeCityLayout } from './cityLayout';
import type { PartialStatePayload, FullStatePayload } from './types/messages';
export class JavaFileWatcher {
    private _javaWatcher: vscode.FileSystemWatcher;
    private _pythonWatcher : vscode.FileSystemWatcher;

    // Layout cache — avoids recomputing positions when only class bodies change
    private _cachedLayoutKey = '';
    private _cachedLayout: ReturnType<typeof computeCityLayout> | undefined;

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
            if (!this.webviewManager.hasReadyViews()) {
                this.webviewManager.cacheFullState(this.buildFullStatePayload(store));
                return;
            }
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
            if (!this.webviewManager.hasReadyViews()) {
                this.webviewManager.cacheFullState(this.buildFullStatePayload(store));
                return;
            }
            this.postIncrementalChange(this.buildPartialStatePayload([], removedNames, store));
        });
    }
    private buildFullStatePayload(store: FileParseStore): FullStatePayload {
        const classes = store.snapshot().flatMap(e => e.entry.data ?? []);
        return {
            classes,
            layout: computeCityLayout(classes),
            status: classes.length > 0 ? 'ready' : 'empty',
        };
    }

    private buildPartialStatePayload(
        changedClasses: ClassInfo[],
        removedNames: string[],
        store: FileParseStore
    ): PartialStatePayload {
        const allClasses = store.snapshot().flatMap(e => e.entry.data ?? []);
        // Layout only changes when classes are added or removed, not when bodies are edited.
        // Cache it keyed by sorted class names to skip expensive recomputation on edits.
        const layoutKey = allClasses.map(c => c.Classname).sort().join(',');
        if (layoutKey !== this._cachedLayoutKey || !this._cachedLayout) {
            this._cachedLayout = computeCityLayout(allClasses);
            this._cachedLayoutKey = layoutKey;
        }
        const layout = this._cachedLayout;
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
            if (!this.webviewManager.hasReadyViews()) {
                this.webviewManager.cacheFullState(this.buildFullStatePayload(store));
                return;
            }
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
