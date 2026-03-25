// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import * as path from "path";
import { FileParseStore } from "./state";
import { JavaFileWatcher } from "./JavaFileWatcher";
import { WebviewManager } from "./WebviewManager";
import { initializeParser } from "./parser";
import { parseAndStore } from './parser';
import { minimatch } from 'minimatch';
import { computeCityLayout } from './cityLayout';
import { buildCityWebviewHtml } from './cityWebviewHtml';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {
  console.log("CODESCAPE ACTIVATED");
  const store = new FileParseStore();
  const webviewManager = new WebviewManager(context.extensionUri, async (message: unknown) => {
    const msg = message as { type?: string; payload?: { className?: string } };
    if (msg.type === 'OPEN_CLASS_SOURCE' && msg.payload?.className) {
      await openClassSourceFromClassName(msg.payload.className, store);
    }
  });
  const scan = vscode.commands.registerCommand('codescape.scan', () => workspaceScan(store, webviewManager));
  const javaWatcher = new JavaFileWatcher(store, webviewManager);
  await initializeParser();

  // Use the console to output diagnostic information (console.log) and errors (console.error)
  // This line of code will only be executed once when your extension is activated
  //console.log('Congratulations, your extension "codescape" is now active!');

  // sidebar view
  const provider = new CodescapeViewProvider(context.extensionUri, webviewManager, store);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("codescape.Cityview", provider),
  );
  // Register multi-view commands
  const createSidePanel = vscode.commands.registerCommand('codescape.createSidePanel', () => {
    const panel = webviewManager.createWebview('side');
    console.log('Created side panel webview');
  });

  const createBottomPanel = vscode.commands.registerCommand('codescape.createBottomPanel', () => {
    const panel = webviewManager.createWebview('bottom');
    console.log('Created bottom panel webview');
  });

  const create = vscode.commands.registerCommand('codescape.createPanel', () => {
    webviewManager.createWebview('side');
  });

  // Parse all existing Java and Python files on startup
  const existingFiles = [
    ...await getJavaFiles(),
    ...await getPythonFiles(),
  ];

  for (const uri of existingFiles) {
    await parseAndStore(uri, store);
  }

  const classes = store.snapshot().flatMap(e => e.entry.data ?? []);
  const fullState = {
    classes,
    layout: computeCityLayout(classes),
    status: classes.length > 0 ? 'ready' as const : 'empty' as const,
  };
  webviewManager.broadcastFullState(fullState);

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
  context.subscriptions.push(create);
  context.subscriptions.push(createSidePanel);
  context.subscriptions.push(createBottomPanel);
  context.subscriptions.push(scan);
}

async function openClassSourceFromClassName(className: string, store: FileParseStore) {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    return;
  }

  const snapshot = store.snapshot();

  for (const { uri, entry } of snapshot) {
    if (entry.status !== 'parsed' || !entry.data) {
      continue;
    }

    const match = entry.data.find(c => c.Classname === className);
    if (!match) {
      continue;
    }

    const fileUri = vscode.Uri.parse(uri);

    const isInWorkspace = workspaceFolders.some((folder: vscode.WorkspaceFolder) =>
      fileUri.fsPath.startsWith(folder.uri.fsPath + path.sep)
    );
    if (!isInWorkspace) {
      return;
    }

    try {
      await vscode.workspace.fs.stat(fileUri);
    } catch {
      return;
    }

    const doc = await vscode.workspace.openTextDocument(fileUri);
    const editor = await vscode.window.showTextDocument(doc);

    const text = doc.getText();
    const needle = `class ${className}`;
    const idx = text.indexOf(needle);

    let targetRange: vscode.Range;
    if (idx >= 0) {
      const pos = doc.positionAt(idx);
      targetRange = new vscode.Range(pos, pos);
    } else {
      const pos = new vscode.Position(0, 0);
      targetRange = new vscode.Range(pos, pos);
    }

    editor.selection = new vscode.Selection(targetRange.start, targetRange.end);
    editor.revealRange(targetRange, vscode.TextEditorRevealType.InCenter);
    return;
  }

  vscode.window.showInformationMessage(`Could not find source for class ${className}.`);
}

function createPanel(context : vscode.ExtensionContext, store: FileParseStore){
    
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
  //listen for messages FROM the webview
  panel.webview.onDidReceiveMessage(async (message: any) => {
    console.log('Received from webview:', message);
    if (message.type === 'EXPORT_HTML') {
      const htmlContent = generateStandaloneHtml(message.payload.fileData);
      const uri = await vscode.window.showSaveDialog({
        filters: { 'HTML': ['html'] },
        defaultUri: vscode.Uri.file('codescape-city.html')
      });
      if (uri) {
        await vscode.workspace.fs.writeFile(uri, Buffer.from(htmlContent));
        vscode.window.showInformationMessage('City exported as HTML!');
      }
    }
    if (message.type === 'OPEN_CLASS_SOURCE' && message.payload?.className) {
      await openClassSourceFromClassName(message.payload.className, store);
    }
    if (message.type === 'EXPORT_JSON') {
      const uri = await vscode.window.showSaveDialog({
        filters: { 'JSON': ['json'] },
        defaultUri: vscode.Uri.file('codescape-city.json')
      });
      if (uri) {
        await vscode.workspace.fs.writeFile(
          uri,
          Buffer.from(JSON.stringify(message.payload, null, 2))
        );
        vscode.window.showInformationMessage('City state exported as JSON!');
      }
    }
  });

  function generateStandaloneHtml(fileData: any[]): string {
    // Read the JS files and inline them
    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <title>Codescape City</title>
        <style>
          body { margin: 0; overflow: hidden; background: #1a1a2e; }
          canvas { display: block; }
        </style>
      </head>
      <body>
        <canvas id="cityCanvas"></canvas>
        <script>
          // Inline renderer.js content here
          // Inline uml.js content here
          // Inline the setup script with fileData baked in
          const fileData = ${JSON.stringify(fileData)};
          // ... rest of render logic
        </script>
      </body>
      </html>
    `;
  }

  //send mock data TO the webview (Change this to run a full state change)
  panel.webview.postMessage({
    type: "AST_DATA",
    payload: {
      files: [
        {
          name: "App.tsx",
          lines: 120,
          functions: 4,
          classes: 2,
        },
      ],
    },
  });
  panel.onDidDispose(() => { });
}

async function workspaceScan(store: FileParseStore, webviewManager: WebviewManager) {
  // Get all supported source files not in exclude
  const files = [
    ...await getJavaFiles(),
    ...await getPythonFiles(),
  ];

  console.log(`Found ${files.length} source files. Starting parse...`);
  vscode.window.showInformationMessage(`Codescape: Scanning and parsing ${files.length} source files...`);

  let successCount = 0;
  let failureCount = 0;

  // Parse all files sequentially to avoid overwhelming the parser
  for (const uri of files) {
    try {
      await parseAndStore(uri, store);
      successCount++;
    } catch (err) {
      failureCount++;
      console.error(`Failed to parse ${uri.fsPath}:`, err);
    }
  }

  const snap = store.snapshot();
  console.log(`Workspace scan complete. Parsed ${successCount} files, ${failureCount} failures. Store has ${snap.length} entries.`);
  vscode.window.showInformationMessage(`Codescape: Scan complete! Successfully parsed ${successCount} files (${failureCount} failures).`);

  const scannedClasses = snap.flatMap(e => e.entry.data ?? []);
  const fullState = {
    classes: scannedClasses,
    layout: computeCityLayout(scannedClasses),
    status: successCount > 0 && scannedClasses.length > 0 ? ('ready' as const) : ('empty' as const),
  };
  webviewManager.broadcastFullState(fullState);
}

// async function workspaceScan(): Promise<vscode.Uri[]> {
//   return await getJavaFiles();
// }

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

async function getPythonFiles(): Promise<vscode.Uri[]> {
  const excludeUri = await vscode.workspace.findFiles(".exclude");
  let excludeFilter = null;
  if (excludeUri.length > 0) {
    const content = await vscode.workspace.fs.readFile(excludeUri[0]);
    let decoded = new TextDecoder("utf-8").decode(content);
    let excludeFiles = decoded
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.trim() !== "");
    excludeFilter = "{" + excludeFiles.join(",") + "}";
  }
  return vscode.workspace.findFiles("**/*.py", excludeFilter);
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

function getWebviewContent(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const rendererUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'src', 'webview', 'renderer.js'),
  );
  const umlUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'src', 'webview', 'uml.js'),
  );
  return buildCityWebviewHtml(rendererUri.toString(), umlUri.toString());
}

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

        const COLOR_PALETTE = [
  "#598BAF",
  "#8B5CF6",
  "#10B981",
  "#F59E0B",
  "#EF4444",
  "#14B8A6",
  "#6366F1",
  "#EC4899"
];

        //this replaces fileData, single source of truth for frontend
        let state = {
        // ClassInfo[]
        classes: [],   
        // { className: { col, row } }  
        layout: {},   
        //stores colors
        colors: {}, 
        // loading | ready | empty | error
        status: "loading" 
        };

        let buildingRegistry = [];
        let hoveredBuilding = null;

        //state update function that also triggers a re-render
        function updateState(newData) {
        console.log("update state called with data: ", newData);
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

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'src', 'webview')],
    };
    webviewView.webview.html = getWebviewContent(webviewView.webview, this.extensionUri);

    webviewView.webview.onDidReceiveMessage(async (message: { type?: string; payload?: { className?: string } }) => {
      if (message.type === 'READY') {
        const last = this.webviewManager.getLastFullState();
        if (last) {
          webviewView.webview.postMessage({ type: 'FULL_STATE', payload: last });
        }
      }

      function getCanvasCoordinates(event) {

      const rect = canvas.getBoundingClientRect();

        return {
          x: event.clientX - rect.left,
          y: event.clientY - rect.top
        };
      }

      function getBuildingAtPosition(canvasX, canvasY) {
        for (let i = buildingRegistry.length - 1; i >= 0; i--) {
          const b = buildingRegistry[i];
      
          const inside =
            canvasX >= b.x &&
            canvasX <= b.x + b.width &&
            canvasY >= b.y &&
            canvasY <= b.y + b.height;

          if (inside) {
            return b;
          }
        }

        return null;
      }

      canvas.addEventListener("mousemove", (event) => {

        const { x, y } = getCanvasCoordinates(event);
        const building = getBuildingAtPosition(x, y);
        
        if (hoveredBuilding !== building) {
          hoveredBuilding = building;
          render();
        }
      });
    
        // Registry of rendered buildings for hit detection (hover/click).
        // Each entry is tracked in canvas/world coordinates before zoom.
        const buildingRegistry = [];

        //now only reads from state
        
        function render() {
          ctx.clearRect(0, 0, canvas.width, canvas.height);

          // reset each frame
          buildingRegistry = [];

          ctx.save();
          ctx.translate(canvas.width / 2, canvas.height / 2);
          ctx.scale(zoomLevel, zoomLevel);
          ctx.translate(-canvas.width / 2, -canvas.height / 2);

          drawIsoGrid(ctx, 10, 10, TILE_L, offsetX, offsetY);
          // if (fileData.length === 0) {
          //   placeIsoBuilding(ctx, 3, 3, 3, '#598BAF', TILE_L, offsetX, offsetY);
          //   placeIsoBuilding(ctx, 5, 5, 5, '#8B5CF6', TILE_L, offsetX, offsetY);
          //   placeIsoBuilding(ctx, 7, 3, 2, '#10B981', TILE_L, offsetX, offsetY);
          // } else {
          //   // FULL_STATE: file has path + classes[]; height from class count and method count
          //   fileData.forEach((file, i) => {
          //     const classCount = file.classes ? file.classes.length : 0;
          //     const methodCount = file.classes ? file.classes.reduce(function (n, c) { return n + (c.Methods ? c.Methods.length : 0); }, 0) : 0;
          //     const floors = Math.max(1, classCount + methodCount);
          //     const col = 3 + i * 2;
          //     const row = 3 + i;
          //     placeIsoBuilding(ctx, col, row, floors, '#598BAF', TILE_L, offsetX, offsetY);
          //   });
          // }
          // drawUmlBox(ctx, 50, 50, {
          //   name: 'App',
          //   fields: ['count: int', 'name: String'],
          //   methods: ['getName()', 'setName()', 'toString()', 'run()']
          // });

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
      buildingRegistry.length = 0;
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

        // Approximate building footprint in canvas/world space for hit detection.
        const col = position.col;
        const row = position.row;
        const isoX = (col - row) * TILE_L / 2 + offsetX;
        const isoY = (col + row) * TILE_L / 4 + offsetY + TILE_L / 2;
        const approxHeight = TILE_L + floors * (TILE_L / 2);
        const bbox = {
          x: isoX - TILE_L / 2,
          y: isoY - approxHeight,
          width: TILE_L,
          height: approxHeight
        };

        buildingRegistry.push({
          className: cls.Classname,
          x: bbox.x,
          y: bbox.y,
          width: bbox.width,
          height: bbox.height
        });

        //place building using computed layout
        placeIsoBuilding(
          ctx,
          col,
          row,
          floors,
          state.colors[cls.Classname] || "#598BAF",
          TILE_L,
          offsetX,
          offsetY
        );
      });

      if (cls) {

        drawUmlBox(
          ctx,
          hoveredBuilding.x + hoveredBuilding.width + 10,
          hoveredBuilding.y,
          {
            name: cls.Classname,
            fields: cls.Fields?.map(f => f.name) || [],
            methods: cls.Methods?.map(m => m.name) || []
          }
        );
      }
    }
      // restore canvas transform
      ctx.restore();
    }

  function getBuildingAtPosition(canvasX, canvasY) {
    for (let i = buildingRegistry.length - 1; i >= 0; i--) {
      const b = buildingRegistry[i];

      const inside =
        canvasX >= b.x &&
        canvasX <= b.x + b.width &&
        canvasY >= b.y &&
        canvasY <= b.y + b.height;

      if (inside) {
        return b;
      }
    });
  }
}

// This method is called when your extension is deactivated
export function deactivate() { }
