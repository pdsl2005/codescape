import * as vscode from 'vscode';
import type { FullStatePayload, PartialStatePayload } from './types/messages';

type ViewLocation = 'side' | 'bottom' | 'explorer';
type WebviewContainer = vscode.WebviewPanel | vscode.WebviewView;

function isWebviewView(container: WebviewContainer): container is vscode.WebviewView {
    return 'onDidChangeVisibility' in container;
}

interface ManagedWebview {
    container: WebviewContainer;
    location: ViewLocation;
    isReady: boolean;
}

export type WebviewExtensionMessageHandler = (message: unknown) => void | Promise<void>;
type CreateWebviewPanelFn = typeof vscode.window.createWebviewPanel;

export class WebviewManager {
    private webviews: Map<string, ManagedWebview> = new Map();
    private lastFullState: FullStatePayload | null = null;

    onBuildingClick?: (payload: unknown) => void;

    constructor(
        private extensionUri: vscode.Uri,
        private extensionMessageHandler?: WebviewExtensionMessageHandler,
        private createPanelFn: CreateWebviewPanelFn = vscode.window.createWebviewPanel.bind(vscode.window),
    ) { }

    getLastFullState(): FullStatePayload | null {
        return this.lastFullState;
    }

    createWebview(location: Extract<ViewLocation, 'side' | 'bottom'>): vscode.WebviewPanel {
        const viewColumn = location === 'side' ? vscode.ViewColumn.Two : vscode.ViewColumn.Nine;
        const title = location === 'side' ? 'Codescape Side' : 'Codescape Bottom';

        const panel = this.createPanelFn(
            `codescapeWebview_${location}_${Date.now()}`,
            title,
            viewColumn,
            {
                enableScripts: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(this.extensionUri, 'src', 'webview'),
                    vscode.Uri.joinPath(this.extensionUri, 'out', 'webview'),
                    vscode.Uri.joinPath(this.extensionUri, 'media'),
                ],
                retainContextWhenHidden: true,
            }
        );

        panel.webview.html = this.getWebviewContent(panel.webview);
        this.addWebview(panel, location);
        return panel;
    }

    registerExplorerView(view: vscode.WebviewView): void {
        view.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.joinPath(this.extensionUri, 'src', 'webview'),
                vscode.Uri.joinPath(this.extensionUri, 'out', 'webview'),
                vscode.Uri.joinPath(this.extensionUri, 'media'),
            ],
        };
        view.webview.html = this.getWebviewContent(view.webview);
        this.addWebview(view, 'explorer');
    }

    addWebview(container: WebviewContainer, location: ViewLocation = 'explorer'): void {
        const managedWebview: ManagedWebview = {
            container,
            location,
            isReady: false,
        };

        const viewId = this.generateViewId();
        this.webviews.set(viewId, managedWebview);

        if (isWebviewView(container)) {
            managedWebview.isReady = true;
            if (this.lastFullState) {
                container.webview.postMessage({
                    type: 'FULL_STATE',
                    payload: this.lastFullState,
                });
            }
        }

        container.webview.onDidReceiveMessage(async (message: unknown) => {
            const msg = message as { type?: string; payload?: unknown };
            if (msg.type === 'READY') {
                console.log(`Webview ready: ${viewId}`);
                managedWebview.isReady = true;
                if (this.lastFullState) {
                    container.webview.postMessage({
                        type: 'FULL_STATE',
                        payload: this.lastFullState,
                    });
                }
            } else if (msg.type === 'BUILDING_CLICK') {
                this.onBuildingClick?.(msg.payload);
            } else if (this.extensionMessageHandler) {
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
                .then(
                    (delivered) => console.log(`FULL_STATE delivered to ${viewId}: ${delivered}`),
                    (err: unknown) => console.warn(`FULL_STATE post failed for ${viewId}:`, err),
                );
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
                .then(
                    (delivered) => console.log(`PARTIAL_STATE delivered to ${viewId}: ${delivered}`),
                    (err: unknown) => console.warn(`PARTIAL_STATE post failed for ${viewId}:`, err),
                );
        }
    }

    getActiveViewCount(): number {
        return this.webviews.size;
    }

    hasReadyViews(): boolean {
        for (const managed of this.webviews.values()) {
            if (managed.isReady) { return true; }
        }
        return false;
    }

    hasLocationActive(location: ViewLocation): boolean {
        for (const managed of this.webviews.values()) {
            if (managed.location === location) {
                return true;
            }
        }
        return false;
    }

    /**
     * Dispose all webviews
     */
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
        return `view_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    }

    private getWebviewContent(webview: vscode.Webview): string {
        const bundleUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.extensionUri, 'out', 'webview', 'webviewBundle.js')
        );
        const imagesUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.extensionUri, 'media', 'images')
        );
        return `<!DOCTYPE html>
<html lang="en">
<head>
  <style>
    body { margin: 0; overflow: hidden; }
    #city-container { width: 100vw; height: 100vh; }
    #toggle-view-btn {
      position: absolute; top: 8px; right: 8px; z-index: 10;
      padding: 4px 10px;
      background: var(--vscode-button-background, #0e639c);
      color: var(--vscode-button-foreground, #fff);
      border: none; border-radius: 3px; cursor: pointer; font-size: 12px;
    }
    #toggle-view-btn:hover { background: var(--vscode-button-hoverBackground, #1177bb); }
  </style>
</head>
<body>
  <div id="city-container"></div>
  <button id="toggle-view-btn">Switch to 3D</button>
  <script>window.CODESCAPE_IMAGES_URI = "${imagesUri}";</script>
  <script src="${bundleUri}"></script>
</body>
</html>`;
    }
}
