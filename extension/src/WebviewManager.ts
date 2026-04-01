import * as vscode from 'vscode';
import { ClassInfo } from './parser/javaExtractor';


type ViewLocation = 'side' | 'bottom';
type WebviewContainer = vscode.WebviewView | vscode.WebviewPanel
interface ManagedWebview {
    container: WebviewContainer;
    isReady: boolean;
}

/**
 * WebviewManager handles creating, tracking, and syncing multiple webview panels
 * across different view locations (side pane, bottom panel). Ensures all active
 * views receive state updates and can be properly disposed.
 */
export class WebviewManager {
    private webviews: Map<string, ManagedWebview> = new Map();
    private lastFullState: any = null;
    private messageQueue: Array<{ type: string; payload: any }> = [];

    constructor(private extensionUri: vscode.Uri) { }

    /**
     * Creates a new webview panel at the specified location
     */
    createPanel(location: ViewLocation): vscode.WebviewPanel {
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

        panel.webview.html = getWebviewContent(panel.webview, this.extensionUri);
        this.addWebview(panel)
        return panel;
    }

    addWebview(container: WebviewContainer){
      
        const managedWebview: ManagedWebview = {
            container : container,
            isReady: false,
        };

        const viewId = this.generateViewId();
        this.webviews.set(viewId, managedWebview);
      // WebviewView is already ready when provider gives it to us
      if ('onDidChangeVisibility' in container) {
          managedWebview.isReady = true;
          if (this.lastFullState) {
              container.webview.postMessage({
                  type: 'FULL_STATE',
                  payload: this.lastFullState,
              });
         }
      }
      container.webview.onDidReceiveMessage((message) => {
            if (message.type === 'READY') {
                console.log(`Webview ready: ${viewId}`);
                managedWebview.isReady = true;
                // Send full state immediately to new view
                if (this.lastFullState) {
                    container.webview.postMessage({
                        type: 'FULL_STATE',
                        payload: this.lastFullState,
                    });
                }
            }
        });

                // Handle disposal
        container.onDidDispose(() => {
            console.log(`Webview disposed: ${viewId}`);
            this.webviews.delete(viewId);
        });

    }

    /**
     * Broadcasts a FULL_STATE message to all active views
     */
    broadcastFullState(state: any): void {
        this.lastFullState = state;
        const message = {
            type: 'FULL_STATE',
            payload: state,
        };

        for (const [viewId, managed] of this.webviews) {
            if (managed.isReady) {
                console.log(`Broadcasting FULL_STATE to ${viewId}`);
                managed.container.webview
                    .postMessage(message)
                    .then((delivered) => console.log(`FULL_STATE delivered to ${viewId}: ${delivered}`));
            } else {
                this.messageQueue.push(message);
            }
        }
    }

    /**
     * Broadcasts a PARTIAL_STATE (incremental changes) to all active views
     */
    broadcastPartialState(payload: {
        changed?: ClassInfo[];
        related?: ClassInfo[];
        removed?: string[];
    }): void {
        const message = {
            type: 'PARTIAL_STATE',
            payload,
        };
        console.log("Broadcasting starting, sending to: " + this.getActiveViewCount() + " Panels")
        for (const [viewId, managed] of this.webviews) {
            if (managed.isReady) {
                console.log(`Broadcasting PARTIAL_STATE to ${viewId}`);
                managed.container.webview
                    .postMessage(message)
                    .then((delivered) => console.log(`PARTIAL_STATE delivered to ${viewId}: ${delivered}`));
            }
        }
    }

    /**
     * Get the number of active webview instances
     */
    getActiveViewCount(): number {
        return this.webviews.size;
    }


    /**
     * Dispose all webviews
     */
    disposeAll(): void {
        for (const id of this.webviews.keys()) {
          let managed = this.webviews.get(id);
          if(managed != null && 'dispose' in managed.container){
              managed.container.dispose();
              this.webviews.delete(id);
        }
      }
    }

    /**
     * Gets all registered webviews for external systems (like JavaFileWatcher)
     * that need to send messages directly
     */
    getAllWebviews(): vscode.Webview[] {
        return Array.from(this.webviews.values())
            .filter((m) => m.isReady)
            .map((m) => m.container.webview);
    }

    private generateViewId(): string {
        return `view_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    
}

// new canvas-based city visualization that renders an isometric grid and buildings from AST data
export function getWebviewContent(webview: vscode.Webview, extensionUri: vscode.Uri) {
  const rendererUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, "src", "webview", "renderer.js"),
  );
  const umlUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, "src", "webview", "uml.js"),
  );
  const layoutUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri,"src","webview","placer.js"));

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
      <script src="${layoutUri}"></script>
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
    }
    return null;
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
            payload: { fileData: fileData }
          });
        });

        exportJsonBtn.addEventListener('click', () => {
          vscode.postMessage({
            type: 'EXPORT_JSON',
            payload: {
              fileData: fileData,
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