// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import * as path from "path";
import { FileParseStore } from "./state";
import { JavaFileWatcher } from "./JavaFileWatcher";
import { WebviewManager } from "./WebviewManager";
import { initializeParser } from "./parser";
import { parseAndStore } from "./parser";
import { minimatch } from "minimatch";

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {
  console.log("CODESCAPE ACTIVATED");
  const store = new FileParseStore();
  const webviewManager = new WebviewManager(context.extensionUri);
  const scan = vscode.commands.registerCommand("codescape.scan", () =>
    workspaceScan(store, webviewManager),
  );
  const javaWatcher = new JavaFileWatcher(store, webviewManager);
  await initializeParser();

  // Use the console to output diagnostic information (console.log) and errors (console.error)
  // This line of code will only be executed once when your extension is activated
  //console.log('Congratulations, your extension "codescape" is now active!');

  // sidebar view
  const provider = new CodescapeViewProvider(
    context.extensionUri,
    webviewManager,
  );

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("codescape.Cityview", provider),
  );

  // multi panels
  const createSidePanel = vscode.commands.registerCommand(
    "codescape.createSidePanel",
    () => {
      webviewManager.createPanel("side");
    },
  );

  const createBottomPanel = vscode.commands.registerCommand(
    "codescape.createBottomPanel",
    () => {
      webviewManager.createPanel("bottom");
    },
  );

  // legacy command
  const create = vscode.commands.registerCommand(
    "codescape.createPanel",
    () => {
      webviewManager.createPanel("side");
    },
  );

  // Parse all existing Java and Python files on startup
  const existingFiles = [
    ...(await getJavaFiles()),
    ...(await getPythonFiles()),
  ];

  for (const uri of existingFiles) {
    await parseAndStore(uri, store);
  }

  // Send full state to webview manager after initial parse
  const fullState = {
    classes: store.snapshot().flatMap((e) => e.entry.data ?? []),
    status: "ready",
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

async function openClassSourceFromClassName(
  className: string,
  store: FileParseStore,
) {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    return;
  }

  const snapshot = store.snapshot();

  for (const { uri, entry } of snapshot) {
    if (entry.status !== "parsed" || !entry.data) continue;

    const match = entry.data.find((c) => c.Classname === className);
    if (!match) continue;

    const fileUri = vscode.Uri.parse(uri);

    const isInWorkspace = workspaceFolders.some(
      (folder: vscode.WorkspaceFolder) =>
        fileUri.fsPath.startsWith(folder.uri.fsPath + path.sep),
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

  vscode.window.showInformationMessage(
    `Could not find source for class ${className}.`,
  );
}

async function workspaceScan(
  store: FileParseStore,
  webviewManager: WebviewManager,
) {
  // Get all supported source files not in exclude
  const files = [...(await getJavaFiles()), ...(await getPythonFiles())];

  console.log(`Found ${files.length} source files. Starting parse...`);
  vscode.window.showInformationMessage(
    `Codescape: Scanning and parsing ${files.length} source files...`,
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

  // Broadcast updated full state to all webviews
  const fullState = {
    classes: snap.flatMap((e) => e.entry.data ?? []),
    status: successCount > 0 ? "ready" : "empty",
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

// sidebar view
class CodescapeViewProvider implements vscode.WebviewViewProvider {
  //add WebviewManager to sidebar
  constructor(
    private extensionUri: vscode.Uri,
    private webviewManager: WebviewManager,
  ) {}
  resolveWebviewView(webviewView: vscode.WebviewView) {
    console.log("resolveWebviewView called, view id:", webviewView.viewType);

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
    // Register this WebviewView with WebviewManager so it participates in the shared messaging/management logic
    this.webviewManager.addWebview(webviewView);
  }
}

// new canvas-based city visualization that renders an isometric grid and buildings from AST data
export function getWebviewContent(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
) {
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
    
        // Registry of rendered buildings for hit detection (hover/click).
        // Each entry is tracked in canvas/world coordinates before zoom.
        //NOTE: THIS STOPS RENDER FROM RUNNING
        //const buildingRegistry = [];

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

  function screenToWorld(clientX, clientY) {
    const x = (clientX - canvas.width / 2) / zoomLevel + canvas.width / 2;
    const y = (clientY - canvas.height / 2) / zoomLevel + canvas.height / 2;
    return { x, y };
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

        // export button
        const exportBtn = document.createElement('button');
        exportBtn.textContent = 'Export PNG';
        exportBtn.style.cssText = 'position:fixed;top:10px;right:10px;z-index:100;padding:4px 8px;background:#598BAF;color:white;border:none;border-radius:4px;cursor:pointer;font-family:monospace;';
        document.body.appendChild(exportBtn);

        const exportHtmlBtn = document.createElement('button');
        exportHtmlBtn.textContent = 'Export HTML';
        exportHtmlBtn.style.cssText = 'position:fixed;top:35px;right:10px;z-index:100;padding:4px 8px;background:#8B5CF6;color:white;border:none;border-radius:4px;cursor:pointer;font-family:monospace;';
        document.body.appendChild(exportHtmlBtn);

        const exportJsonBtn = document.createElement('button');
        exportJsonBtn.textContent = 'Export JSON';
        exportJsonBtn.style.cssText = 'position:fixed;top:60px;right:10px;z-index:100;padding:4px 8px;background:#10B981;color:white;border:none;border-radius:4px;cursor:pointer;font-family:monospace;';
        document.body.appendChild(exportJsonBtn);

        exportBtn.addEventListener('click', () => {
          // Re-render without zoom to get clean capture
          const link = document.createElement('a');
          link.download = 'codescape-city.png';
          link.href = canvas.toDataURL('image/png');
          link.click();
        });

        exportHtmlBtn.addEventListener('click', () => {
          vscode.postMessage({
            type: 'EXPORT_HTML',
            payload: { fileData: state.classes }
          });
        });

        exportJsonBtn.addEventListener('click', () => {
          vscode.postMessage({
            type: 'EXPORT_JSON',
            payload: {
              fileData: state.classes,
              zoomLevel: zoomLevel,
              tileSize: TILE_L
            }
          });
        });

        canvas.addEventListener('click', (e) => {
          const world = screenToWorld(e.clientX, e.clientY);
          const building = getBuildingAtPosition(world.x, world.y);
          if (!building) {
            return;
          }

          vscode.postMessage({
            type: 'OPEN_CLASS_SOURCE',
            payload: {
              className: building.className
            }
          });
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
