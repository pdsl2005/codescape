import * as vscode from 'vscode';
import { buildCityWebviewHtml } from './cityWebviewHtml';
import type { FullStatePayload, PartialStatePayload } from './types/messages';

type ViewLocation = 'side' | 'bottom';

interface ManagedWebview {
    panel: vscode.WebviewPanel;
    location: ViewLocation;
    isReady: boolean;
}

export type WebviewExtensionMessageHandler = (message: unknown) => void | Promise<void>;

/**
 * WebviewManager handles creating, tracking, and syncing multiple webview panels
 * across different view locations (side pane, bottom panel). Ensures all active
 * views receive state updates and can be properly disposed.
 */
export class WebviewManager {
    private webviews: Map<string, ManagedWebview> = new Map();
    private lastFullState: FullStatePayload | null = null;
    private messageQueue: Array<{ type: string; payload: unknown }> = [];

    constructor(
        private extensionUri: vscode.Uri,
        private extensionMessageHandler?: WebviewExtensionMessageHandler,
    ) { }

    /** Latest FULL_STATE payload (for explorer sidebar sync on READY). */
    getLastFullState(): FullStatePayload | null {
        return this.lastFullState;
    }

    createWebview(location: ViewLocation): vscode.WebviewPanel {
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

        panel.webview.html = this.getWebviewContent(panel.webview);

        const managedWebview: ManagedWebview = {
            panel,
            location,
            isReady: false,
        };

        const viewId = this.generateViewId();
        this.webviews.set(viewId, managedWebview);

        panel.webview.onDidReceiveMessage(async (message: unknown) => {
            const msg = message as { type?: string };
            if (msg.type === 'READY') {
                console.log(`Webview ready: ${viewId}`);
                managedWebview.isReady = true;
                if (this.lastFullState) {
                    panel.webview.postMessage({
                        type: 'FULL_STATE',
                        payload: this.lastFullState,
                    });
                }
            }
            if (this.extensionMessageHandler) {
                await this.extensionMessageHandler(message);
            }
        });

        panel.onDidDispose(() => {
            console.log(`Webview disposed: ${viewId}`);
            this.webviews.delete(viewId);
        });

        return panel;
    }

    broadcastFullState(state: FullStatePayload): void {
        this.lastFullState = state;
        const message = {
            type: 'FULL_STATE',
            payload: state,
        };

        for (const [viewId, managed] of this.webviews) {
            if (managed.isReady) {
                console.log(`Broadcasting FULL_STATE to ${viewId}`);
                managed.panel.webview
                    .postMessage(message)
                    .then((delivered) => console.log(`FULL_STATE delivered to ${viewId}: ${delivered}`));
            } else {
                this.messageQueue.push(message);
            }
        }
    }

    broadcastPartialState(payload: PartialStatePayload): void {
        const message = {
            type: 'PARTIAL_STATE',
            payload,
        };

        for (const [viewId, managed] of this.webviews) {
            if (managed.isReady) {
                console.log(`Broadcasting PARTIAL_STATE to ${viewId}`);
                managed.panel.webview
                    .postMessage(message)
                    .then((delivered) => console.log(`PARTIAL_STATE delivered to ${viewId}: ${delivered}`));
            }
        }
    }

    getActiveViewCount(): number {
        return this.webviews.size;
    }

    hasLocationActive(location: ViewLocation): boolean {
        for (const managed of this.webviews.values()) {
            if (managed.location === location) {
                return true;
            }
        }
        return false;
    }

    disposeAll(): void {
        for (const managed of this.webviews.values()) {
            managed.panel.dispose();
        }
        this.webviews.clear();
    }

    getAllWebviews(): vscode.Webview[] {
        return Array.from(this.webviews.values())
            .filter((m) => m.isReady)
            .map((m) => m.panel.webview);
    }

    private generateViewId(): string {
        return `view_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    private getWebviewContent(webview: vscode.Webview): string {
        const rendererUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.extensionUri, 'src', 'webview', 'renderer.js')
        );
        const umlUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.extensionUri, 'src', 'webview', 'uml.js')
        );
        return buildCityWebviewHtml(rendererUri.toString(), umlUri.toString());
    }
}
