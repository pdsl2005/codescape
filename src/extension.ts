// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import * as path from "path";
import { FileParseStore } from "./state";
import { JavaFileWatcher } from "./JavaFileWatcher";
import { initializeParser } from "./parser";
import { parseAndStore, ensureInitialized } from './parser';
import { ClassInfo } from './parser/javaExtractor';
import { buildGraph, getRelated } from './relations';
import { minimatch } from 'minimatch';

import { JavaFileWatcher } from './JavaFileWatcher';
// Builds the PARTIAL_STATE payload from changed classes, removed class names,
// and the current store. Related classes are found via the relationship graph.
function buildPartialStatePayload(
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





// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {
  console.log("CODESCAPE ACTIVATED");
  await initializeParser();

  // Use the console to output diagnostic information (console.log) and errors (console.error)
  // This line of code will only be executed once when your extension is activated
  //console.log('Congratulations, your extension "codescape" is now active!');

  const panel = vscode.window.createWebviewPanel(
    // internal ID
    "codescapeWebview",
    // title shown to user
    "Codescape",
    vscode.ViewColumn.One,
    {
      // lets the webview run JavaScript
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(context.extensionUri, "src", "webview"),
      ],
    },
  );

  // html content for the web viewer
  panel.webview.html = getWebviewContent(panel.webview, context.extensionUri);

  const store = new FileParseStore();
  // Parse all existing Java files on startup
  const existingFiles = await getJavaFiles();

  for (const uri of existingFiles) {
    await parseAndStore(uri, store);
  }

  //listen for messages FROM the webview
  panel.webview.onDidReceiveMessage(async (message) => {
    console.log("Received from webview:", message);

    // when webview finishes loading
    if (message.type === "WEBVIEW_READY") {
      console.log("WEBVIEW READY RECEIVED");

      // get current parse store snapshot
      const snapshot = store.snapshot();

      // flatten parsed ClassInfo[] from store
      const allClasses = snapshot.flatMap((entry) =>
        entry.entry.status === "parsed" ? entry.entry.data : [],
      );

      // send current state to webview
      panel.webview.postMessage({
        type: "IncrementalChange",
        data: {
          status: "parsed",
          data: allClasses,
        },
      });
    }
  });

  const store = new FileParseStore();
  const scan = vscode.commands.registerCommand('codescape.scan', () => workspaceScan(store));

  const javaWatcher = new JavaFileWatcher(store);
  javaWatcher.setPanel(panel);

  const dumpDisposable = vscode.commands.registerCommand(
    "codescape.dumpParseStore",
    () => {
      const snap = store.snapshot();
      console.log("Parse store snapshot:", JSON.stringify(snap, null, 2));
      vscode.window.showInformationMessage(
        `Parse store contains ${snap.length} entries (see console).`,
      );
    },
  );

  // Expose a command to export the parse store to a JSON file in the workspace root
  const exportDisposable = vscode.commands.registerCommand(
    "codescape.exportParseStore",
    async () => {
      try {
        const snap = store.snapshot();
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
          vscode.window.showErrorMessage("No workspace folder is open.");
          return;
        }

        const outputPath = path.join(
          workspaceFolders[0].uri.fsPath,
          "codescape-output.json",
        );
        const outputUri = vscode.Uri.file(outputPath);

        // Convert to exportable format with better structure
        const exportData = {
          exportedAt: new Date().toISOString(),
          totalFiles: snap.length,
          files: snap.map(({ uri, entry }) => ({
            file: uri,
            status: entry.status,
            classes: entry.status === "parsed" ? entry.data : null,
          })),
        };

        const encoder = new TextEncoder();
        await vscode.workspace.fs.writeFile(
          outputUri,
          encoder.encode(JSON.stringify(exportData, null, 2)),
        );

        vscode.window.showInformationMessage(
          `Exported parse store to ${outputPath}`,
        );
        console.log(`Parse store exported to: ${outputPath}`);
      } catch (err) {
        vscode.window.showErrorMessage(`Failed to export parse store: ${err}`);
        console.error("Export failed:", err);
      }
    },
  );

  context.subscriptions.push(dumpDisposable);
  context.subscriptions.push(exportDisposable);

  context.subscriptions.push(javaWatcher);
  context.subscriptions.push(scan);
}

// async function workspaceScan(store: FileParseStore) {
//   //Get all java files not in exclude
//   const files = await getJavaFiles();

//   console.log(`Found ${files.length} Java files. Starting parse...`);
//   vscode.window.showInformationMessage(`Codescape: Scanning and parsing ${files.length} Java files...`);

//   let successCount = 0;
//   let failureCount = 0;

//   // Parse all files sequentially to avoid overwhelming the parser
//   for (const uri of files) {
//     try {
//       await parseAndStore(uri, store);
//       successCount++;
//     } catch (err) {
//       failureCount++;
//       console.error(`Failed to parse ${uri.fsPath}:`, err);
//     }
//   }

//   const snap = store.snapshot();
//   console.log(`Workspace scan complete. Parsed ${successCount} files, ${failureCount} failures. Store has ${snap.length} entries.`);
//   vscode.window.showInformationMessage(`Codescape: Scan complete! Successfully parsed ${successCount} files (${failureCount} failures).`);
//   context.subscriptions.push(dumpDisposable);
//   context.subscriptions.push(javaWatcher);
//   context.subscriptions.push(scan);

//   // sidebar view
//   const provider = new CodescapeViewProvider(context.extensionUri);
//   context.subscriptions.push(
//     vscode.window.registerWebviewViewProvider('codescape.Cityview', provider)
//   );
// }

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
  console.log("scanning files....");
  const excludeUri = await vscode.workspace.findFiles(".exclude");
  let excludeFilter = null;
  //if there is an exclude file add them to excludeFiles array
  if (excludeUri.length > 0) {
    const content = await vscode.workspace.fs.readFile(excludeUri[0]);
    let decoded = new TextDecoder("utf-8").decode(content);
    //split by newline, remove newline and\r characters and ensure no empty lines
    let excludeFiles = decoded
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.trim() !== "");
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
  let excludeFiles = decoded
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.trim() !== "");
  return excludeFiles.some((pattern) => minimatch(path, pattern));
}

// sidebar view
class CodescapeViewProvider implements vscode.WebviewViewProvider {
  constructor(private extensionUri: vscode.Uri) {}
  resolveWebviewView(webviewView: vscode.WebviewView) {
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.extensionUri, "src", "webview"),
      ],
    };
    webviewView.webview.html = getWebviewContent(
      webviewView.webview,
      this.extensionUri,
    );
  }
}

// new canvas-based city visualization that renders an isometric grid and buildings from AST data
function getWebviewContent(webview: vscode.Webview, extensionUri: vscode.Uri) {
  const rendererUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, "src", "webview", "renderer.js"),
  );
  const umlUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, "src", "webview", "uml.js"),
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

        //this replaces fileData, single source of truth for frontend
        let state = {
        // ClassInfo[]
        classes: [],   
        // { className: { col, row } }  
        layout: {},   
        // loading | ready | empty | error
        status: "loading" 
        };

        //state update function that also triggers a re-render
        function updateState(newData) {

        // store new parsed class data
        state.classes = newData;

        // determine UI state
        if (!newData) {
          // null or undefined, something went wrong
          state.status = "error";
        } else if (newData.length === 0) {
          // valid array but no classes
          state.status = "empty";
        } else {
          // valid array with classes
          state.status = "ready";
        }

        // run layout before rendering
        runAutoLayout();

        // re-render canvas
        render();
        }

        //will later integrate with arjuns logic?
        function runAutoLayout() {

        //clear previous layout
        state.layout = {};

        state.classes.forEach((cls, index) => {

            //simple layout for now (grid-based)
            const col = 3 + index * 2;
            const row = 3 + index;

            state.layout[cls.Classname] = {
            col,
            row
            };
        });
        }


        //now only reads from state

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
            // FULL_STATE: file has path + classes[]; height from class count and method count
            fileData.forEach((file, i) => {
              const classCount = file.classes ? file.classes.length : 0;
              const methodCount = file.classes ? file.classes.reduce(function (n, c) { return n + (c.Methods ? c.Methods.length : 0); }, 0) : 0;
              const floors = Math.max(1, classCount + methodCount);
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

        //loading state
        if (state.status === "loading") {
          drawLoadingMessage();
          ctx.restore();
          return;
        }

        //empty state (no classes detected)
        if (state.status === "empty") {
          drawEmptyMessage();
          ctx.restore();
          return;
        }

        //error state
        if (state.status === "error") {
          drawErrorMessage();
          ctx.restore();
          return;
        }

      //ready state -> render buildings
      state.classes.forEach((cls) => {

      //get layout position for this class
      const position = state.layout[cls.Classname];
      if (!position) return;

      //building height based on number of methods + fields
      const floors = Math.max(
        1,
        (cls.Methods?.length || 0) +
        (cls.Fields?.length || 0)
      );

      //place building using computed layout
      placeIsoBuilding(
        ctx,
        position.col,
        position.row,
        floors,
        "#598BAF",
        TILE_L,
        offsetX,
        offsetY
      );
    });

    ctx.restore();
  }

  function drawLoadingMessage() {
    ctx.fillStyle = "white";
    ctx.font = "20px Arial";
    ctx.fillText("Loading...", 50, 50);
  }

  function drawEmptyMessage() {
    ctx.fillStyle = "white";
    ctx.font = "20px Arial";
    ctx.fillText("No classes detected.", 50, 50);
  }

  function drawErrorMessage() {
  ctx.fillStyle = "red";
  ctx.font = "20px Arial";
  ctx.fillText("Error parsing files.", 50, 50);
  }


        window.addEventListener('message', event => {
        const msg = event.data;

        if (msg && msg.type === "IncrementalChange") {
          //extract actual ClassInfo[] from wrapper object
          const classArray = msg.data?.data || [];

          updateState(classArray);
        // Listen for FULL_STATE (and legacy AST_DATA) from the extension
        window.addEventListener('message', event => {
          const msg = event.data;
          if (msg.type === 'FULL_STATE' && msg.payload) {
            fileData = msg.payload.files || [];
            if (msg.payload.status === 'empty') {
              // Frontend can show empty state; for now still call render()
            }
            if (msg.payload.errors && msg.payload.errors.length > 0) {
              console.warn('Parse errors:', msg.payload.errors);
            }
            render();
          } else if (msg.type === 'AST_DATA' && msg.payload && msg.payload.files) {
            fileData = msg.payload.files;
            render();
          } else if (msg.type === 'PARTIAL_STATE' && msg.payload) {
            const { changed, related, removed } = msg.payload;
            console.log('[PARTIAL_STATE] changed:', changed.map(c => c.Classname));
            console.log('[PARTIAL_STATE] related:', related.map(c => c.Classname));
            console.log('[PARTIAL_STATE] removed:', removed);
            // TODO: update individual buildings instead of full re-render
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

        //initial render
        render();

        // Handshake: tell extension we are ready so it sends FULL_STATE (avoids dropped messages)
        vscode.postMessage({ type: 'READY' });
      </script>
    </body>
    </html>
  `;
}

// This method is called when your extension is deactivated
export function deactivate() {}
