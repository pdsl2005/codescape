import * as vscode from 'vscode';
import { FileParseStore } from './state';
import { isExcluded} from './extension';
import { parseAndStore } from './parser';
import { ClassInfo } from './parser/javaExtractor';
import { buildGraph, getRelated } from './relations';
type IncrementalChangePayload = {
    changed?: ClassInfo[];
    related?: ClassInfo[];
    removed?: string[];
};
export class JavaFileWatcher {
    private _watcher: vscode.FileSystemWatcher;
    //TODO (Change this to webviewview/webviewviewprovider when updated)
    private _webviews: vscode.Webview[] = [];
    
    constructor(store: FileParseStore) {
        this._watcher = vscode.workspace.createFileSystemWatcher('**/*.java');



        this._watcher.onDidCreate(async (uri: vscode.Uri) => {
            console.log('Java file created:', uri.fsPath);
            this.handleIncrementalChange(uri, store);
        });

        this._watcher.onDidChange(async (uri: vscode.Uri) => {
            console.log('Java file changed:', uri.fsPath);
            this.handleIncrementalChange(uri, store);
        });

        this._watcher.onDidDelete((uri: vscode.Uri) => {
            console.log('Java file deleted:', uri.fsPath);
		    const before = store.get(uri);
		    const removedNames = (before?.data ?? []).map((c: ClassInfo) => c.Classname);
		    store.remove(uri);
            if(this._webviews.length == 0){
                console.log("webviews not initialized yet");
                return;
            }
            this.postIncrementalChange({removed: removedNames}, this._webviews);
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
    
    //TODO: UPDATE THIS TO webviewview
    addWebview(view: vscode.Webview){
        this._webviews.push(view);
    }

    removeWebview(view: vscode.Webview){
        this._webviews = this._webviews.filter(w => w != view);
    }

    private async handleIncrementalChange(uri: vscode.Uri, store: FileParseStore){
        if(this._webviews.length == 0){
            console.log("views not initialized yet");
            return;
        }
        if(!await isExcluded(uri)){
                const {changed, removed} = await parseAndStore(uri, store);
                //create payload from parsed data
                const payload : IncrementalChangePayload = this.buildPartialStatePayload(changed, removed, store);
                //send message to frontend
                this.postIncrementalChange(payload, this._webviews);
                
        }
    }
    //TODO (change the type of updatedData based on parser integration)
    private postIncrementalChange(payload : IncrementalChangePayload, views : vscode.Webview[]){
        console.log("Posted incremental change");
        views.forEach( v => v.postMessage({
            type: "IncrementalChange",
            payload: payload
        }));
    }
    dispose(){
        this._watcher.dispose();
    }
}