import * as vscode from 'vscode';
import { ClassInfo } from './parser/javaExtractor';
import {getWebviewContent} from './extension'


type ViewLocation = 'side' | 'bottom';
type WebviewContainer = vscode.WebviewView | vscode.WebviewPanel
interface ManagedWebview {
    container: WebviewContainer;
    isReady: boolean;
}

/**
 * WebviewManager handles creating, tracking, and syncing multiple webview panels
 * across different view locations (side pane, bottom panel). Ensures all active
 * views receive state updates and can be properly disposed.
 */
export class WebviewManager {
    private webviews: Map<string, ManagedWebview> = new Map();
    private lastFullState: any = null;
    private messageQueue: Array<{ type: string; payload: any }> = [];

    constructor(private extensionUri: vscode.Uri) { }

    /**
     * Creates a new webview panel at the specified location
     */
    createPanel(location: ViewLocation): vscode.WebviewPanel {
        const viewColumn = location === 'side' ? vscode.ViewColumn.Two : vscode.ViewColumn.Nine;
        const title = location === 'side' ? 'Codescape Side' : 'Codescape Bottom';

        const panel = vscode.window.createWebviewPanel(
            `codescapeWebview_${location}_${Date.now()}`,
            title,
            viewColumn,
            {
                enableScripts: true,
                localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'src', 'webview')],
                retainContextWhenHidden: true,
            }
        );

        panel.webview.html = getWebviewContent(panel.webview, this.extensionUri);
        this.addWebview(panel)
        return panel;
    }

    addWebview(container: WebviewContainer){
      
        const managedWebview: ManagedWebview = {
            container : container,
            isReady: false,
        };

        const viewId = this.generateViewId();
        this.webviews.set(viewId, managedWebview);
      // WebviewView is already ready when provider gives it to us
      if ('onDidChangeVisibility' in container) {
          managedWebview.isReady = true;
          if (this.lastFullState) {
              container.webview.postMessage({
                  type: 'FULL_STATE',
                  payload: this.lastFullState,
              });
         }
      }
      container.webview.onDidReceiveMessage((message) => {
            if (message.type === 'READY') {
                console.log(`Webview ready: ${viewId}`);
                managedWebview.isReady = true;
                // Send full state immediately to new view
                if (this.lastFullState) {
                    container.webview.postMessage({
                        type: 'FULL_STATE',
                        payload: this.lastFullState,
                    });
                }
            }
        });

                // Handle disposal
        container.onDidDispose(() => {
            console.log(`Webview disposed: ${viewId}`);
            this.webviews.delete(viewId);
        });

    }

    /**
     * Broadcasts a FULL_STATE message to all active views
     */
    broadcastFullState(state: any): void {
        this.lastFullState = state;
        const message = {
            type: 'FULL_STATE',
            payload: state,
        };

        for (const [viewId, managed] of this.webviews) {
            if (managed.isReady) {
                console.log(`Broadcasting FULL_STATE to ${viewId}`);
                managed.container.webview
                    .postMessage(message)
                    .then((delivered) => console.log(`FULL_STATE delivered to ${viewId}: ${delivered}`));
            } else {
                this.messageQueue.push(message);
            }
        }
    }

    /**
     * Broadcasts a PARTIAL_STATE (incremental changes) to all active views
     */
    broadcastPartialState(payload: {
        changed?: ClassInfo[];
        related?: ClassInfo[];
        removed?: string[];
    }): void {
        const message = {
            type: 'PARTIAL_STATE',
            payload,
        };
        console.log("Broadcasting starting, sending to: " + this.getActiveViewCount() + " Panels")
        for (const [viewId, managed] of this.webviews) {
            if (managed.isReady) {
                console.log(`Broadcasting PARTIAL_STATE to ${viewId}`);
                managed.container.webview
                    .postMessage(message)
                    .then((delivered) => console.log(`PARTIAL_STATE delivered to ${viewId}: ${delivered}`));
            }
        }
    }

    /**
     * Get the number of active webview instances
     */
    getActiveViewCount(): number {
        return this.webviews.size;
    }


    /**
     * Dispose all webviews
     */
    disposeAll(): void {
        for (const id of this.webviews.keys()) {
          let managed = this.webviews.get(id);
          if(managed != null && 'dispose' in managed.container){
              managed.container.dispose();
              this.webviews.delete(id);
        }
      }
    }

    /**
     * Gets all registered webviews for external systems (like JavaFileWatcher)
     * that need to send messages directly
     */
    getAllWebviews(): vscode.Webview[] {
        return Array.from(this.webviews.values())
            .filter((m) => m.isReady)
            .map((m) => m.container.webview);
    }

    private generateViewId(): string {
        return `view_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
}
