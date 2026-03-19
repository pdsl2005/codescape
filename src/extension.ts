// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import * as path from "path";
import { FileParseStore } from "./state";
import { JavaFileWatcher } from "./JavaFileWatcher";
import { initializeParser } from "./parser";
import { parseAndStore } from "./parser";
import { minimatch } from "minimatch";

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {
  console.log("CODESCAPE ACTIVATED");
  const store = new FileParseStore();
  const scan = vscode.commands.registerCommand("codescape.scan", () =>
    workspaceScan(store),
  );
  const javaWatcher = new JavaFileWatcher(store);
  await initializeParser();

  // Use the console to output diagnostic information (console.log) and errors (console.error)
  // This line of code will only be executed once when your extension is activated
  //console.log('Congratulations, your extension "codescape" is now active!');

  // sidebar view
  const provider = new CodescapeViewProvider(
    context.extensionUri,
    javaWatcher,
    store,
  );
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("codescape.Cityview", provider),
  );
  const create = vscode.commands.registerCommand("codescape.createPanel", () =>
    createPanel(context, javaWatcher, store),
  );
  // Parse all existing Java files on startup
  const existingFiles = await getJavaFiles();

  for (const uri of existingFiles) {
    await parseAndStore(uri, store);
  }

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
  context.subscriptions.push(scan);
}

function sendFullState(javaWatcher: JavaFileWatcher, store: FileParseStore) {
  const snap = store.snapshot();

  const classes = snap
    .filter(({ entry }) => entry.status === "parsed")
    .flatMap(({ entry }) => entry.data || []);

  const payload = {
    classes,
    status: classes.length === 0 ? "empty" : "ready",
  };

  console.log("[FULL_STATE] sending:", payload.classes.length, "classes");

  javaWatcher.broadcast({
    type: "FULL_STATE",
    payload,
  });
}

console.log("CREATE PANEL CALLED");
function createPanel(
  context: vscode.ExtensionContext,
  javaWatcher: JavaFileWatcher,
  store: FileParseStore,
) {
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
  panel.webview.onDidReceiveMessage((message) => {
    console.log("Received from webview:", message);

    if (message.type === "READY") {
      console.log("WEBVIEW READY RECEIVED");
      javaWatcher.addWebview(panel.webview);

      //send FULL_STATE when frontend is ready
      sendFullState(javaWatcher, store);
    }
  });

  panel.onDidDispose(() => {
    javaWatcher.removeWebview(panel.webview);
  });
}

async function workspaceScan(store: FileParseStore) {
  //Get all java files not in exclude
  const files = await getJavaFiles();

  console.log(`Found ${files.length} Java files. Starting parse...`);
  vscode.window.showInformationMessage(
    `Codescape: Scanning and parsing ${files.length} Java files...`,
  );

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
  console.log(
    `Workspace scan complete. Parsed ${successCount} files, ${failureCount} failures. Store has ${snap.length} entries.`,
  );
  vscode.window.showInformationMessage(
    `Codescape: Scan complete! Successfully parsed ${successCount} files (${failureCount} failures).`,
  );
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
  //add filewatcher to sidebar
  constructor(
    private extensionUri: vscode.Uri,
    private javaWatcher: JavaFileWatcher,
    private store: FileParseStore,
  ) {}
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
    this.javaWatcher.addWebview(webviewView.webview);

    webviewView.webview.onDidReceiveMessage((message) => {
      if (message.type === "READY") {
        console.log("SIDEBAR READY");
        sendFullState(this.javaWatcher, this.store);
      }
    });

    //ensure proper disposing
    webviewView.onDidDispose(() =>
      this.javaWatcher.removeWebview(webviewView.webview),
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
        //function updateState(newData) {
        //console.log("update state called with data: ", newData);
        // store new parsed class data
        //state.classes = newData;

        // determine UI state
        //if (!newData) {
          // null or undefined, something went wrong
          //state.status = "error";
        //} else if (newData.length === 0) {
          // valid array but no classes
          //state.status = "empty";
        //} else {
          // valid array with classes
          //state.status = "ready";
        //}

        // run layout before rendering
        //runAutoLayout();

        //assign the colors before re-rendering
        //assignColors();

        // re-render canvas
        //render();
        //}

        
        //function runAutoLayout() {
        //state.layout = {};
        //const cols = Math.ceil(Math.sqrt(state.classes.length)); // grid width
        //state.classes.forEach((cls, index) => {
          //const col = index % cols;
          //const row = Math.floor(index / cols);

          //state.layout[cls.Classname] = {
            //col: col + 3,
            //row: row + 3
          //};
        //});
      //}

        function assignColors() {
        const newColorMap = {};
        const usedColors = new Set();

        //preserve existing colors
        state.classes.forEach(cls => {
          const existing = state.colors[cls.Classname];
          if (existing) {
            newColorMap[cls.Classname] = existing;
            usedColors.add(existing);
          }
        });

        //assign new colors
        state.classes.forEach(cls => {
        if (!newColorMap[cls.Classname]) {
            const nextColor =
              COLOR_PALETTE.find(c => !usedColors.has(c)) ||
              COLOR_PALETTE[Object.keys(newColorMap).length % COLOR_PALETTE.length];

            newColorMap[cls.Classname] = nextColor;
            usedColors.add(nextColor);
          }
        });

        state.colors = newColorMap;
      }

        function patchState({ changed = [], related = [], removed = [] }) {
        console.log("patchState called");

        const nodes = buildNodesFromClasses(state.classes);
        state.layout = computeLayout(nodes);

        //remove deleted classes
        state.classes = state.classes.filter(
          cls => !removed.includes(cls.Classname)
        );

        //create a map for fast updates
        const classMap = new Map(
          state.classes.map(cls => [cls.Classname, cls])
        );

        //apply changed + related updates
        [...changed, ...related].forEach(cls => {
          classMap.set(cls.Classname, cls);
        });

        //convert back to array
        state.classes = Array.from(classMap.values());

        //update UI state
        if (state.classes.length === 0) {
          state.status = "empty";
        } else {
          state.status = "ready";
        }

        //runAutoLayout();
        assignColors();
        render();
        
      }

      function buildNodesFromClasses(classes) {
      const classNames = new Set(classes.map(c => c.Classname));

        return classes.map(cls => {
        const neighbors = [];

        //extract dependencies from fields
        if (cls.Fields) {
          cls.Fields.forEach(field => {
            const type = field.type;

            //only include if it's another class in the project
            if (classNames.has(type)) {
              neighbors.push(type);
            }
          });
        }

        return {
          id: cls.Classname,
          name: cls.Classname,
          neighbors
        };
      });
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

      // ready state -> render buildings
      const sortedClasses = [...state.classes].sort((a, b) => {
      const posA = state.layout[a.Classname];
      const posB = state.layout[b.Classname];

      if (!posA || !posB) return 0;

      // sort by depth (row + col)
      return (posA.row + posA.col) - (posB.row + posB.col);
    });

    sortedClasses.forEach((cls) => {

        const position = state.layout[cls.Classname];
        if (!position) return;

        const floors = Math.max(
          1,
          (cls.Methods?.length || 0) +
          (cls.Fields?.length || 0)
        );

        const isoX = (position.col - position.row) * TILE_L / 2 + offsetX;
        const isoY = (position.col + position.row) * TILE_L / 4 + offsetY;

        placeIsoBuilding(
          ctx,
          position.col,
          position.row,
          floors,
          state.colors[cls.Classname] || "#598BAF",
          TILE_L,
          offsetX,
          offsetY
        );

        const width = TILE_L;
        const height = floors * TILE_L / 2;

        buildingRegistry.push({
          className: cls.Classname,
          x: isoX - width / 2,
          y: isoY - height,
          width: width,
          height: height
       });

       console.log("buildingRegistry:", buildingRegistry);

      });

      if (hoveredBuilding) {

      const cls = state.classes.find(
        c => c.Classname === hoveredBuilding.className
      );

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

  function computeLayout(nodes) {
  const layout = {};
  let row = 0;
  const placed = new Set();

  for (const node of nodes) {
    if (!placed.has(node.id)) {
      layout[node.id] = { col: 0, row };
      placed.add(node.id);

      let col = 1;
      for (const neighbor of node.neighbors) {
        if (!placed.has(neighbor)) {
          layout[neighbor] = { col, row };
          placed.add(neighbor);
          col++;
        }
      }
      row++;
    }
  }

  return layout;
}

  // Listen for FULL_STATE (and legacy AST_DATA) from the extension
  window.addEventListener('message', event => {
  console.log('Message received:', event.data);
  const msg = event.data;

  if (msg.type === 'FULL_STATE' && msg.payload) {
    console.log("CLASSES:", msg.payload.classes);
    console.log('[FULL_STATE] received:', msg.payload);

    state.classes = msg.payload.classes;

    //build graph input
    const nodes = buildNodesFromClasses(state.classes);

    // run algorithm
    state.layout = computeLayout(nodes);

    assignColors();
    render();

    if (msg.payload.status === 'empty') {
      console.log('Empty state');
    }

    if (msg.payload.errors && msg.payload.errors.length > 0) {
      console.warn('Parse errors:', msg.payload.errors);
    }

    return; // stop here
  }

  else if (msg.type === 'AST_DATA' && msg.payload && msg.payload.files) {
    console.log('[AST_DATA]');
    // you probably don't need this anymore, but leaving safe
    return;
  }

  else if (msg.type === 'PARTIAL_STATE' && msg.payload) {
    const { changed = [], related = [], removed = [] } = msg.payload;

    console.log('[PARTIAL_STATE] changed:', changed.map(c => c.Classname));
    console.log('[PARTIAL_STATE] related:', related.map(c => c.Classname));
    console.log('[PARTIAL_STATE] removed:', removed);

    patchState(msg.payload);
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
