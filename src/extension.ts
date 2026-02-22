// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { FileParseStore } from './state';
import { parseAndStore } from './parser';
import { minimatch } from 'minimatch';
import { ClassInfo } from './parser/javaExtractor';
import { JavaFileWatcher } from './JavaFileWatcher';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  console.log("CODESCAPE ACTIVATED");

  // Use the console to output diagnostic information (console.log) and errors (console.error)
  // This line of code will only be executed once when your extension is activated
  //console.log('Congratulations, your extension "codescape" is now active!');
  
  const panel = vscode.window.createWebviewPanel(
    // internal ID
    'codescapeWebview',
    // title shown to user  
    'Codescape',
    vscode.ViewColumn.One,
    {
      // lets the webview run JavaScript
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'src', 'webview')]
    }
  );

  // html content for the web viewer
  panel.webview.html = getWebviewContent(panel.webview, context.extensionUri);

  //listen for messages FROM the webview
  panel.webview.onDidReceiveMessage(message => {
    console.log('Received from webview:', message);
  });

  //send mock data TO the webview
  panel.webview.postMessage({
    type: 'AST_DATA',
    payload: {
      files: [
        {
          name: 'App.tsx',
          lines: 120,
          functions: 4,
          classes: 2
        }
      ]
    }
  });

  const scan = vscode.commands.registerCommand('codescape.scan', () => workspaceScan());

  const store = new FileParseStore();

  const javaWatcher = new JavaFileWatcher(store);
  javaWatcher.setPanel(panel);

  const dumpDisposable = vscode.commands.registerCommand('codescape.dumpParseStore', () => {
    const snap = store.snapshot();
    console.log('Parse store snapshot:', JSON.stringify(snap, null, 2));
    vscode.window.showInformationMessage(`Parse store contains ${snap.length} entries (see console).`);
  });

  context.subscriptions.push(dumpDisposable);
  context.subscriptions.push(javaWatcher);
  context.subscriptions.push(scan);

  // sidebar view
  const provider = new CodescapeViewProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('codescape.Cityview', provider)
  );
}

async function workspaceScan(): Promise<vscode.Uri[]> {
  return await getJavaFiles();
}

/**
 * Gets all java files within the workspace excluding the ones mentioned in .exclude. 
 * Note: Files in .exclude must be in glob pattern.
 * Note: Must be async (can run in background) because find files is an async func.
 * 
 * @returns An array of the uris for all the .java files not mentioned in .exclude
 */
async function getJavaFiles(): Promise<vscode.Uri[]> {
  console.log("scanning files....")
  const excludeUri = await vscode.workspace.findFiles(".exclude");
  let excludeFilter = null;
  //if there is an exclude file add them to excludeFiles array
  if (excludeUri.length > 0) {
    const content = await vscode.workspace.fs.readFile(excludeUri[0]);
    let decoded = new TextDecoder("utf-8").decode(content);
    //split by newline, remove newline and\r characters and ensure no empty lines
    let excludeFiles = decoded.split('\n').map(line => line.trim()).filter(line => line.trim() !== '');
    excludeFilter = "{" + excludeFiles.join(",") + "}";
  }
  //get all java files and exclude ones in exclude filter
  let javaFiles = await vscode.workspace.findFiles("**/*.java", excludeFilter);
  return javaFiles;
}

export async function isExcluded(uri: vscode.Uri): Promise<Boolean> {
  const excludeUri = await vscode.workspace.findFiles(".exclude");
  const path = vscode.workspace.asRelativePath(uri);
  if (excludeUri.length === 0) {
    return false;
  }
  const content = await vscode.workspace.fs.readFile(excludeUri[0]);
  let decoded = new TextDecoder("utf-8").decode(content);
  let excludeFiles = decoded.split('\n').map(line => line.trim()).filter(line => line.trim() !== '');
  return excludeFiles.some(pattern => minimatch(path, pattern));
}

// sidebar view
class CodescapeViewProvider implements vscode.WebviewViewProvider {
    constructor(private extensionUri: vscode.Uri) {}
    resolveWebviewView(webviewView: vscode.WebviewView) {
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'src', 'webview')]
        };
        webviewView.webview.html = getWebviewContent(webviewView.webview, this.extensionUri);
    }
}

// new canvas-based city visualization that renders an isometric grid and buildings from AST data
function getWebviewContent(webview: vscode.Webview, extensionUri: vscode.Uri) {
  const rendererUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'src', 'webview', 'renderer.js')
  );
  const umlUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'src', 'webview', 'uml.js')
  );

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <style>
        body { margin: 0; overflow: hidden; }
        canvas { background: #1a1a2e; display: block; }
      </style>
    </head>
    <body>
      <canvas id="cityCanvas"></canvas>
      <script src="${rendererUri}"></script>
      <script src="${umlUri}"></script>
      <script>
        const vscode = acquireVsCodeApi();
        const canvas = document.getElementById('cityCanvas');
        const ctx = canvas.getContext('2d');

        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;

        const TILE_L = 50;
        const offsetX = canvas.width / 2;
        const offsetY = 100;
        let zoomLevel = 1;
        let fileData = [];

        function render() {
          ctx.clearRect(0, 0, canvas.width, canvas.height);

          ctx.save();
          ctx.translate(canvas.width / 2, canvas.height / 2);
          ctx.scale(zoomLevel, zoomLevel);
          ctx.translate(-canvas.width / 2, -canvas.height / 2);

          drawIsoGrid(ctx, 10, 10, TILE_L, offsetX, offsetY);
          if (fileData.length === 0) {
            placeIsoBuilding(ctx, 3, 3, 3, '#598BAF', TILE_L, offsetX, offsetY);
            placeIsoBuilding(ctx, 5, 5, 5, '#8B5CF6', TILE_L, offsetX, offsetY);
            placeIsoBuilding(ctx, 7, 3, 2, '#10B981', TILE_L, offsetX, offsetY);
          } else {
            fileData.forEach((file, i) => {
              const floors = Math.max(1, (file.functions || 0) + (file.classes || 0));
              const col = 3 + i * 2;
              const row = 3 + i;
              placeIsoBuilding(ctx, col, row, floors, '#598BAF', TILE_L, offsetX, offsetY);
            });
          }
          drawUmlBox(ctx, 50, 50, {
            name: 'App',
            fields: ['count: int', 'name: String'],
            methods: ['getName()', 'setName()', 'toString()', 'run()']
          });

          ctx.restore();
        }

        window.addEventListener('message', event => {
          const msg = event.data;
          if (msg.type === 'AST_DATA' && msg.payload && msg.payload.files) {
            fileData = msg.payload.files;
            render();
          }
        });

        window.addEventListener('resize', () => {
          canvas.width = window.innerWidth;
          canvas.height = window.innerHeight;
          render();
        });

        canvas.addEventListener('wheel', (e) => {
          e.preventDefault();
          if (e.deltaY < 0) {
            zoomLevel = Math.min(zoomLevel * 1.1, 3);
          } else {
            zoomLevel = Math.max(zoomLevel * 0.9, 0.3);
          }
          render();
        });

        render();

        vscode.postMessage({
          type: 'WEBVIEW_READY',
          payload: { status: 'ready' }
        });
      </script>
    </body>
    </html>
  `;
}



// This method is called when your extension is deactivated
export function deactivate() { }
