import * as vscode from 'vscode';
import { buildCityWebviewHtml } from './cityWebviewHtml';
import type { FullStatePayload, PartialStatePayload } from './types/messages';

type ViewLocation = 'side' | 'bottom' | 'explorer';
type WebviewContainer = vscode.WebviewPanel | vscode.WebviewView;

interface ManagedWebview {
    container: WebviewContainer;
    location: ViewLocation;
    isReady: boolean;
}

export type WebviewExtensionMessageHandler = (message: unknown) => void | Promise<void>;

export class WebviewManager {
    private webviews: Map<string, ManagedWebview> = new Map();
    private lastFullState: FullStatePayload | null = null;

    constructor(
        private extensionUri: vscode.Uri,
        private extensionMessageHandler?: WebviewExtensionMessageHandler,
    ) { }

    getLastFullState(): FullStatePayload | null {
        return this.lastFullState;
    }

    createWebview(location: Extract<ViewLocation, 'side' | 'bottom'>): vscode.WebviewPanel {
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
        this.addWebview(panel, location);
        return panel;
    }

    addWebview(container: WebviewContainer, location: ViewLocation = 'explorer'): void {
        const managedWebview: ManagedWebview = {
            container,
            location,
            isReady: false,
        };

        const viewId = this.generateViewId();
        this.webviews.set(viewId, managedWebview);

        if ('viewType' in container) {
            managedWebview.isReady = true;
            if (this.lastFullState) {
                container.webview.postMessage({
                    type: 'FULL_STATE',
                    payload: this.lastFullState,
                });
            }
        }

        container.webview.onDidReceiveMessage(async (message: unknown) => {
            const msg = message as { type?: string };
            if (msg.type === 'READY') {
                console.log(`Webview ready: ${viewId}`);
                managedWebview.isReady = true;
                if (this.lastFullState) {
                    container.webview.postMessage({
                        type: 'FULL_STATE',
                        payload: this.lastFullState,
                    });
                }
            }
            if (this.extensionMessageHandler) {
                await this.extensionMessageHandler(message);
            }
        });

        container.onDidDispose(() => {
            console.log(`Webview disposed: ${viewId}`);
            this.webviews.delete(viewId);
        });
    }

    broadcastFullState(state: FullStatePayload): void {
        this.lastFullState = state;
        const message = {
            type: 'FULL_STATE',
            payload: state,
        };

        for (const [viewId, managed] of this.webviews) {
            if (!managed.isReady) {
                continue;
            }

            console.log(`Broadcasting FULL_STATE to ${viewId}`);
            managed.container.webview
                .postMessage(message)
                .then((delivered) => console.log(`FULL_STATE delivered to ${viewId}: ${delivered}`));
        }
    }

    broadcastPartialState(payload: PartialStatePayload): void {
        const message = {
            type: 'PARTIAL_STATE',
            payload,
        };

        for (const [viewId, managed] of this.webviews) {
            if (!managed.isReady) {
                continue;
            }

            console.log(`Broadcasting PARTIAL_STATE to ${viewId}`);
            managed.container.webview
                .postMessage(message)
                .then((delivered) => console.log(`PARTIAL_STATE delivered to ${viewId}: ${delivered}`));
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
            if ('dispose' in managed.container) {
                managed.container.dispose();
            }
        }
        this.webviews.clear();
    }

    getAllWebviews(): vscode.Webview[] {
        return Array.from(this.webviews.values())
            .filter((managed) => managed.isReady)
            .map((managed) => managed.container.webview);
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
