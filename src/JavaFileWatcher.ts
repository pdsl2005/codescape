import * as vscode from 'vscode';
import { FileParseStore } from './state';
import { isExcluded} from './extension';
import { parseAndStore } from './parser';
import { ClassInfo } from './parser/javaExtractor';
export class JavaFileWatcher {
    private _watcher: vscode.FileSystemWatcher;
    //TODO (Change this to webviewview/webviewviewprovider when updated)
    private _panel?: vscode.WebviewPanel;

    constructor(store: FileParseStore) {
        this._watcher = vscode.workspace.createFileSystemWatcher('**/*.java');



        this._watcher.onDidCreate(async (uri: vscode.Uri) => {
            console.log('Java file created:', uri.fsPath);
            this.handleIncrementalChange(uri, store);
        });

        this._watcher.onDidChange(async (uri: vscode.Uri) => {
            console.log('Java file changed:', uri.fsPath);
            if (!await isExcluded(uri)) {
                this.handleIncrementalChange(uri, store);
            }
        });

        this._watcher.onDidDelete((uri: vscode.Uri) => {
            console.log('Java file deleted:', uri.fsPath);
            store.remove(uri);
            //TODO remove uri and send updated JSON to frontend
        });
    }
    //TODO: UPDATE THIS TO webviewview
    setPanel(panel: vscode.WebviewPanel){
        this._panel = panel;
    }

    private async handleIncrementalChange(uri: vscode.Uri, store: FileParseStore){
        if(this._panel == null){
            console.log("panel not initialized yet");
            return;
        }
        if(!await isExcluded(uri)){
                void parseAndStore(uri, store);
                //Store parsed data (Probably just new stuff)
                let data = store.get(uri);
                //TODO send message to frontend
                this.postIncrementalChange(data, this._panel.webview);
        }
    }
    //TODO (change the type of updatedData based on parser integration)
    private postIncrementalChange(updatedData: ClassInfo[], view : vscode.Webview){
      view.postMessage({
        type: "IncrementalChange",
        data: updatedData
      });
    }
    dispose(){
        this._watcher.dispose();
    }
}