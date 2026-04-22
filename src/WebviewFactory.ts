import * as crypto from 'crypto';
import * as vscode from 'vscode';

type CreateWebviewPanelFn = typeof vscode.window.createWebviewPanel;

/**
 * Single source of truth for creating and configuring all Codescape webviews.
 *
 * VS Code has two distinct webview APIs that this class abstracts:
 *
 *  - WebviewPanel  (used by createSidePanel)
 *    An editor tab the extension creates imperatively on demand. The extension
 *    owns the lifetime — the panel exists until the user closes it or the
 *    extension disposes it. Appears in an editor column (here: column two).
 *
 *  - WebviewView  (used by registerViewProvider + configureView)
 *    A persistent slot declared in package.json and owned by VS Code. VS Code
 *    creates the view lazily the first time the user opens that panel/sidebar
 *    container, then calls resolveWebviewView so we can populate it. The
 *    'explorer' location is the sidebar view (codescape.Cityview); 'bottom' is
 *    the panel-area tab (codescape.BottomView).
 */
export class WebviewFactory {
    constructor(
        private readonly extensionUri: vscode.Uri,
        private readonly createPanelFn: CreateWebviewPanelFn = vscode.window.createWebviewPanel.bind(vscode.window),
    ) {}

    /**
     * Imperatively creates a new WebviewPanel in editor column two.
     * Each call produces a new tab; the caller adds it to WebviewManager for tracking.
     */
    createSidePanel(): vscode.WebviewPanel {
        const panel = this.createPanelFn(
            `codescapeWebview_side_${Date.now()}`,
            'Codescape Side',
            vscode.ViewColumn.Two,
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
        return panel;
    }

    /**
     * Registers a WebviewView provider for a declared view slot (explorer sidebar or
     * bottom panel). VS Code calls resolveWebviewView when the user first opens the
     * container; we configure the view then and notify the caller via onResolved.
     * Returns a Disposable that should be added to context.subscriptions.
     */
    registerViewProvider(
        viewId: string,
        onResolved: (view: vscode.WebviewView) => void,
    ): vscode.Disposable {
        return vscode.window.registerWebviewViewProvider(
            viewId,
            {
                resolveWebviewView: (view) => {
                    this.configureView(view);
                    onResolved(view);
                },
            },
            { webviewOptions: { retainContextWhenHidden: true } },
        );
    }

    /**
     * Applies standard webview options and HTML to a WebviewView handed to us by VS Code.
     * Also called directly by WebviewManager.registerExplorerView / registerBottomView
     * in tests, where the VS Code registration layer is bypassed.
     */
    configureView(view: vscode.WebviewView): void {
        view.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.joinPath(this.extensionUri, 'src', 'webview'),
                vscode.Uri.joinPath(this.extensionUri, 'out', 'webview'),
                vscode.Uri.joinPath(this.extensionUri, 'media'),
            ],
        };
        view.webview.html = this.getWebviewContent(view.webview);
    }

    private getNonce(): string {
        return crypto.randomBytes(16).toString('base64');
    }

    private getWebviewContent(webview: vscode.Webview): string {
        const bundleUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.extensionUri, 'out', 'webview', 'webviewBundle.js')
        );
        const imagesUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.extensionUri, 'media', 'images')
        );
        const nonce = this.getNonce();
        return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none';
                 style-src 'nonce-${nonce}';
                 script-src 'nonce-${nonce}';
                 img-src ${webview.cspSource} data:;">
  <style nonce="${nonce}">
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
  <script nonce="${nonce}">window.CODESCAPE_IMAGES_URI = "${imagesUri}";</script>
  <script nonce="${nonce}" src="${bundleUri}"></script>
</body>
</html>`;
    }
}
