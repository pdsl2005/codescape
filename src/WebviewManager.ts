import * as vscode from 'vscode';
import { buildCityWebviewHtml } from './cityWebviewHtml';
import type { FullStatePayload, PartialStatePayload } from './types/messages';

type ViewLocation = 'side' | 'bottom';

interface ManagedWebview {
    panel: vscode.WebviewPanel;
    location: ViewLocation;
    isReady: boolean;
}

export type WebviewExtensionMessageHandler = (message: unknown) => void | Promise<void>;

/**
 * WebviewManager handles creating, tracking, and syncing multiple webview panels
 * across different view locations (side pane, bottom panel). Ensures all active
 * views receive state updates and can be properly disposed.
 */
export class WebviewManager {
    private webviews: Map<string, ManagedWebview> = new Map();
    private lastFullState: FullStatePayload | null = null;
    private messageQueue: Array<{ type: string; payload: unknown }> = [];

    constructor(
        private extensionUri: vscode.Uri,
        private extensionMessageHandler?: WebviewExtensionMessageHandler,
    ) { }

    /** Latest FULL_STATE payload (for explorer sidebar sync on READY). */
    getLastFullState(): FullStatePayload | null {
        return this.lastFullState;
    }

    createWebview(location: ViewLocation): vscode.WebviewPanel {
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

        const managedWebview: ManagedWebview = {
            panel,
            location,
            isReady: false,
        };

        const viewId = this.generateViewId();
        this.webviews.set(viewId, managedWebview);

        panel.webview.onDidReceiveMessage(async (message: unknown) => {
            const msg = message as { type?: string };
            if (msg.type === 'READY') {
                console.log(`Webview ready: ${viewId}`);
                managedWebview.isReady = true;
                if (this.lastFullState) {
                    panel.webview.postMessage({
                        type: 'FULL_STATE',
                        payload: this.lastFullState,
                    });
                }
            }
            if (this.extensionMessageHandler) {
                await this.extensionMessageHandler(message);
            }
        });

        panel.onDidDispose(() => {
            console.log(`Webview disposed: ${viewId}`);
            this.webviews.delete(viewId);
        });

        return panel;
    }

    broadcastFullState(state: FullStatePayload): void {
        this.lastFullState = state;
        const message = {
            type: 'FULL_STATE',
            payload: state,
        };

        for (const [viewId, managed] of this.webviews) {
            if (managed.isReady) {
                console.log(`Broadcasting FULL_STATE to ${viewId}`);
                managed.panel.webview
                    .postMessage(message)
                    .then((delivered) => console.log(`FULL_STATE delivered to ${viewId}: ${delivered}`));
            } else {
                this.messageQueue.push(message);
            }
        }
    }

    broadcastPartialState(payload: PartialStatePayload): void {
        const message = {
            type: 'PARTIAL_STATE',
            payload,
        };

        for (const [viewId, managed] of this.webviews) {
            if (managed.isReady) {
                console.log(`Broadcasting PARTIAL_STATE to ${viewId}`);
                managed.panel.webview
                    .postMessage(message)
                    .then((delivered) => console.log(`PARTIAL_STATE delivered to ${viewId}: ${delivered}`));
            }
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
            managed.panel.dispose();
        }
        this.webviews.clear();
    }

    getAllWebviews(): vscode.Webview[] {
        return Array.from(this.webviews.values())
            .filter((m) => m.isReady)
            .map((m) => m.panel.webview);
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

          let state = {
            classes: [],
            layout: {},
            colors: {},
            status: "loading",
            classMap: {}  // Map of className -> ClassInfo for quick lookup
          };

          function updateState(newData) {
            console.log("update state called with data: ", newData);
            state.classes = newData;
            
            // Build class map for quick lookup of inner class relationships
            state.classMap = {};
            newData.forEach(cls => {
              state.classMap[cls.Classname] = cls;
            });

            if (!newData) {
              state.status = "error";
            } else if (newData.length === 0) {
              state.status = "empty";
            } else {
              state.status = "ready";
            }

            runAutoLayout();
            assignColors();
            render();
          }

          function runAutoLayout() {
            state.layout = {};
            const topLevelClasses = state.classes.filter(cls => !cls.parentClass);
            const innerClasses = state.classes.filter(cls => cls.parentClass);

            // Layout top-level classes
            topLevelClasses.forEach((cls, index) => {
              const col = 3 + index * 2;
              const row = 3 + index;

              state.layout[cls.Classname] = {
                col,
                row,
                depth: 0
              };
            });

            // Layout inner classes relative to their parent
            innerClasses.forEach((cls) => {
              const parent = state.classMap[cls.parentClass];
              if (parent && state.layout[parent.Classname]) {
                const parentPos = state.layout[parent.Classname];
                // Position inner classes offset from parent
                state.layout[cls.Classname] = {
                  col: parentPos.col + 2,
                  row: parentPos.row + 1,
                  depth: (parentPos.depth || 0) + 1
                };
              } else {
                // Fallback: place as top-level if parent not found
                state.layout[cls.Classname] = {
                  col: 20 + Math.random() * 10,
                  row: 10 + Math.random() * 10,
                  depth: 1
                };
              }
            });
          }

          function assignColors() {
            const newColorMap = {};
            const usedColors = new Set();

            state.classes.forEach(cls => {
              const existing = state.colors[cls.Classname];
              if (existing) {
                newColorMap[cls.Classname] = existing;
                usedColors.add(existing);
              }
            });

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

          function render() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            ctx.save();
            ctx.translate(canvas.width / 2, canvas.height / 2);
            ctx.scale(zoomLevel, zoomLevel);
            ctx.translate(-canvas.width / 2, -canvas.height / 2);

            drawIsoGrid(ctx, 10, 10, TILE_L, offsetX, offsetY);

            if (state.status === "loading") {
              drawLoadingMessage();
              ctx.restore();
              return;
            }

            if (state.status === "empty") {
              drawEmptyMessage();
              ctx.restore();
              return;
            }

            if (state.status === "error") {
              drawErrorMessage();
              ctx.restore();
              return;
            }

            state.classes.forEach((cls) => {
              const position = state.layout[cls.Classname];
              if (!position) return;

              const floors = Math.max(
                1,
                (cls.Methods?.length || 0) +
                (cls.Fields?.length || 0)
              );

              // Adjust building size based on nesting depth
              // Inner classes are smaller and positioned slightly offset
              const depthScale = 1 - ((position.depth || 0) * 0.15);
              const adjustedFloors = Math.max(1, Math.ceil(floors * depthScale));

              placeIsoBuilding(
                ctx,
                position.col,
                position.row,
                floors,
                adjustedFloors,
                state.colors[cls.Classname] || "#598BAF",
                TILE_L,
                offsetX,
                offsetY
              );

              // Add visual indicator for inner classes
              if (cls.parentClass) {
                // Draw a connection line to parent (visual indicator)
                const parentPos = state.layout[cls.parentClass];
                if (parentPos) {
                  const fromWorld = colRowToWorld(parentPos.col, parentPos.row, TILE_L, offsetX, offsetY);
                  const toWorld = colRowToWorld(position.col, position.row, TILE_L, offsetX, offsetY);
                  
                  ctx.save();
                  ctx.strokeStyle = "rgba(200, 200, 200, 0.5)";
                  ctx.lineWidth = 1;
                  ctx.setLineDash([2, 2]);
                  ctx.beginPath();
                  ctx.moveTo(fromWorld.x, fromWorld.y);
                  ctx.lineTo(toWorld.x, toWorld.y);
                  ctx.stroke();
                  ctx.restore();
                }
              }
            });

            ctx.restore();
          }

          // Helper function to convert col/row to world coordinates
          function colRowToWorld(col, row, tileL, offsetX, offsetY) {
            const x = offsetX + (col - row) * (tileL / 2);
            const y = offsetY + (col + row) * (tileL / 4);
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

          window.addEventListener('message', event => {
            console.log('Message received:', event.data);
            const msg = event.data;
            if (msg.type === 'FULL_STATE' && msg.payload) {
              if (msg.payload.classes) {
                updateState(msg.payload.classes);
              }
            } else if (msg.type === 'AST_DATA' && msg.payload && msg.payload.files) {
              // Legacy support
              updateState(msg.payload.files);
            } else if (msg.type === 'PARTIAL_STATE' && msg.payload) {
              const { changed = [], related = [], removed = [] } = msg.payload;
              console.log('[PARTIAL_STATE] changed:', changed.map(c => c.Classname));
              console.log('[PARTIAL_STATE] related:', related.map(c => c.Classname));
              console.log('[PARTIAL_STATE] removed:', removed);
              
              // Merge changes and related classes
              const updated = changed.length > 0 ? changed : related;
              if (updated.length > 0) {
                updateState(updated);
              }
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

          // Handshake: tell extension we are ready so it sends FULL_STATE
          vscode.postMessage({ type: 'READY' });
        </script>
      </body>
      </html>
    `;
    }
}
