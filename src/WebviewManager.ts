import * as vscode from 'vscode';
import type { FullStatePayload, PartialStatePayload } from './types/messages';
import { WebviewFactory } from './WebviewFactory';

type ViewLocation = 'side' | 'bottom' | 'explorer';
type WebviewContainer = vscode.WebviewPanel | vscode.WebviewView;

interface ManagedWebview {
    container: WebviewContainer;
    location: ViewLocation;
    isReady: boolean;
}

export type WebviewExtensionMessageHandler = (message: unknown) => void | Promise<void>;
type CreateWebviewPanelFn = typeof vscode.window.createWebviewPanel;

/**
 * Tracks all active Codescape webviews and coordinates state and messaging across them.
 *
 * Responsibilities:
 *  - Maintains a registry of every open panel/view (side, bottom, explorer).
 *  - Implements a READY handshake: webviews post { type: 'READY' } once their JS
 *    bundle is loaded; only then does the manager mark them ready and replay the
 *    last known full state so they never miss an update that arrived before load.
 *  - Broadcasts FullState and PartialState messages to all ready webviews so every
 *    surface stays in sync regardless of how or when it was opened.
 *  - Delegates all panel/view creation and configuration to WebviewFactory.
 *
 * Relationship to WebviewFactory:
 *  WebviewFactory answers "how do I create a panel or register a view provider?"
 *  WebviewManager answers "what do I do with a panel once it exists?"
 */
export class WebviewManager {
    private webviews: Map<string, ManagedWebview> = new Map();
    private lastFullState: FullStatePayload | null = null;
    private factory: WebviewFactory;

    onBuildingClick?: (payload: unknown) => void;

    constructor(
        extensionUri: vscode.Uri,
        private extensionMessageHandler?: WebviewExtensionMessageHandler,
        createPanelFn: CreateWebviewPanelFn = vscode.window.createWebviewPanel.bind(vscode.window),
    ) {
        this.factory = new WebviewFactory(extensionUri, createPanelFn);
    }

    getLastFullState(): FullStatePayload | null {
        return this.lastFullState;
    }

    /** Creates a new side panel tab and begins tracking it. */
    createSidePanel(): vscode.WebviewPanel {
        const panel = this.factory.createSidePanel();
        this.addWebview(panel, 'side');
        return panel;
    }

    /**
     * @deprecated Use createSidePanel() for clarity.
     */
    createWebview(): vscode.WebviewPanel {
        return this.createSidePanel();
    }

    /**
     * Registers a declared WebviewView slot (explorer sidebar or bottom panel) with
     * VS Code and begins tracking it once VS Code calls resolveWebviewView.
     * The returned Disposable must be added to context.subscriptions.
     */
    registerViewProvider(
        viewId: string,
        location: 'explorer' | 'bottom',
    ): vscode.Disposable {
        return this.factory.registerViewProvider(viewId, (view) => {
            this.addWebview(view, location);
        });
    }

    /**
     * Configures and begins tracking an explorer sidebar view.
     * Used directly in tests to bypass the VS Code registration layer.
     */
    registerExplorerView(view: vscode.WebviewView): void {
        this.factory.configureView(view);
        this.addWebview(view, 'explorer');
    }

    /**
     * Configures and begins tracking a bottom panel view.
     * Used directly in tests to bypass the VS Code registration layer.
     */
    registerBottomView(view: vscode.WebviewView): void {
        this.factory.configureView(view);
        this.addWebview(view, 'bottom');
    }

    /**
     * Registers a panel or view for tracking and wires up message handling.
     * Sets up the READY handshake: on READY the view is marked active and the last
     * known full state is replayed so it catches up immediately.
     */
    addWebview(container: WebviewContainer, location: ViewLocation = 'explorer'): void {
        const managedWebview: ManagedWebview = {
            container,
            location,
            isReady: false,
        };

        const viewId = this.generateViewId();
        this.webviews.set(viewId, managedWebview);

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

    /** Caches state without broadcasting — useful when no views are ready yet. */
    cacheFullState(state: FullStatePayload): void {
        this.lastFullState = state;
    }

    /** Caches and broadcasts a full state snapshot to all ready views. */
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

    /** Broadcasts an incremental state update to all ready views. */
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
}
