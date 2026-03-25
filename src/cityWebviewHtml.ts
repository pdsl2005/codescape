/**
 * Shared city canvas webview document (WebviewManager + explorer sidebar).
 * Keep in sync with extension ↔ webview message payloads (FULL_STATE / PARTIAL_STATE).
 */
export function buildCityWebviewHtml(rendererUri: string, umlUri: string): string {
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
          let offsetX = canvas.width / 2;
          let offsetY = 100;
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
            classMap: {}
          };

          const buildingRegistry = [];

          function effectiveFloors(cls) {
            const methods = cls.Methods || [];
            const fields = cls.Fields || [];
            let m = methods.length;
            let f = fields.length;
            if (cls.Type === 'module') {
              const codeBlocks = methods.filter(function (x) {
                return x.name && String(x.name).indexOf('<module_code_') === 0;
              }).length;
              const realFuncs = m - codeBlocks;
              const cappedCode = Math.min(codeBlocks, 4);
              return Math.max(1, Math.min(realFuncs + f + cappedCode, 48));
            }
            return Math.max(1, Math.min(m + f, 48));
          }

          function pickBaseColor(cls) {
            const t = cls.Type;
            if (t === 'interface') return '#8B5CF6';
            if (t === 'abstract') return '#F59E0B';
            if (t === 'module') return '#14B8A6';
            if (t === 'enum') return '#A855F7';
            return '#598BAF';
          }

          function hashHue(name) {
            let h = 0;
            const s = String(name);
            for (let i = 0; i < s.length; i++) {
              h = ((h << 5) - h) + s.charCodeAt(i);
              h |= 0;
            }
            return Math.abs(h);
          }

          function runAutoLayoutFallback() {
            state.layout = {};
            const topLevel = state.classes.filter(function (c) { return !c.parentClass; });
            const inner = state.classes.filter(function (c) { return c.parentClass; });
            topLevel.forEach(function (cls, index) {
              state.layout[cls.Classname] = { col: 3 + index * 2, row: 3 + index, depth: 0 };
            });
            inner.forEach(function (cls) {
              const parent = state.classMap[cls.parentClass];
              const pp = parent && state.layout[parent.Classname];
              if (pp) {
                state.layout[cls.Classname] = {
                  col: pp.col + 2,
                  row: pp.row + 1,
                  depth: (pp.depth || 0) + 1
                };
              } else {
                state.layout[cls.Classname] = { col: 20, row: 10, depth: 1 };
              }
            });
          }

          function rebuildClassMap() {
            state.classMap = {};
            state.classes.forEach(function (cls) {
              state.classMap[cls.Classname] = cls;
            });
          }

          function applyFullPayload(payload) {
            const classes = payload.classes || [];
            state.classes = classes;
            rebuildClassMap();

            const layout = payload.layout;
            if (layout && typeof layout === 'object' && Object.keys(layout).length > 0) {
              state.layout = layout;
            } else {
              runAutoLayoutFallback();
            }

            if (!classes.length) {
              state.status = payload.status === 'empty' ? 'empty' : 'empty';
            } else {
              state.status = 'ready';
            }

            offsetX = canvas.width / 2;
            offsetY = 100;
            assignColors();
            render();
          }

          function assignColors() {
            const newColorMap = {};
            const usedColors = new Set();

            state.classes.forEach(function (cls) {
              const existing = state.colors[cls.Classname];
              if (existing) {
                newColorMap[cls.Classname] = existing;
                usedColors.add(existing);
              }
            });

            state.classes.forEach(function (cls) {
              if (!newColorMap[cls.Classname]) {
                let candidate = pickBaseColor(cls);
                let tries = 0;
                while (usedColors.has(candidate) && tries < 24) {
                  candidate = COLOR_PALETTE[(hashHue(cls.Classname + tries)) % COLOR_PALETTE.length];
                  tries++;
                }
                newColorMap[cls.Classname] = candidate;
                usedColors.add(candidate);
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

            offsetX = canvas.width / 2;
            offsetY = 100;
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

            buildingRegistry.length = 0;
            state.classes.forEach(function (cls) {
              const position = state.layout[cls.Classname];
              if (!position) return;

              const floors = effectiveFloors(cls);
              const depthScale = 1 - ((position.depth || 0) * 0.12);
              const adjustedFloors = Math.max(1, Math.ceil(floors * Math.max(0.5, depthScale)));

              const col = position.col;
              const row = position.row;
              const isoX = (col - row) * TILE_L / 2 + offsetX;
              const isoY = (col + row) * TILE_L / 4 + offsetY + TILE_L / 2;
              const approxHeight = TILE_L + adjustedFloors * (TILE_L / 2);
              buildingRegistry.push({
                className: cls.Classname,
                x: isoX - TILE_L / 2,
                y: isoY - approxHeight,
                width: TILE_L,
                height: approxHeight
              });

              placeIsoBuilding(
                ctx,
                position.col,
                position.row,
                adjustedFloors,
                state.colors[cls.Classname] || pickBaseColor(cls),
                TILE_L,
                offsetX,
                offsetY
              );

              if (cls.parentClass) {
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

          function colRowToWorld(col, row, tileL, ox, oy) {
            const x = ox + (col - row) * (tileL / 2);
            const y = oy + (col + row) * (tileL / 4);
            return { x: x, y: y };
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

          window.addEventListener('message', function (event) {
            console.log('Message received:', event.data);
            const msg = event.data;
            if (msg.type === 'FULL_STATE' && msg.payload && msg.payload.classes) {
              applyFullPayload(msg.payload);
            } else if (msg.type === 'AST_DATA' && msg.payload && msg.payload.files) {
              state.status = 'empty';
              render();
            } else if (msg.type === 'PARTIAL_STATE' && msg.payload) {
              const p = msg.payload;
              if (p.fullClasses && p.layout) {
                applyFullPayload({
                  classes: p.fullClasses,
                  layout: p.layout,
                  status: 'ready'
                });
              } else {
                const changed = p.changed || [];
                const related = p.related || [];
                const removed = p.removed || [];
                const map = {};
                state.classes.forEach(function (c) { map[c.Classname] = c; });
                removed.forEach(function (name) { delete map[name]; });
                const upsert = changed.length ? changed : related;
                upsert.forEach(function (c) { map[c.Classname] = c; });
                state.classes = Object.keys(map).map(function (k) { return map[k]; });
                rebuildClassMap();
                runAutoLayoutFallback();
                assignColors();
                render();
              }
            }
          });

          window.addEventListener('resize', function () {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
            render();
          });

          canvas.addEventListener('wheel', function (e) {
            e.preventDefault();
            if (e.deltaY < 0) {
              zoomLevel = Math.min(zoomLevel * 1.1, 3);
            } else {
              zoomLevel = Math.max(zoomLevel * 0.9, 0.3);
            }
            render();
          });

          function screenToWorld(clientX, clientY) {
            const x = (clientX - canvas.width / 2) / zoomLevel + canvas.width / 2;
            const y = (clientY - canvas.height / 2) / zoomLevel + canvas.height / 2;
            return { x: x, y: y };
          }

          function getBuildingAtPosition(canvasX, canvasY) {
            for (let i = buildingRegistry.length - 1; i >= 0; i--) {
              const b = buildingRegistry[i];
              const inside =
                canvasX >= b.x &&
                canvasX <= b.x + b.width &&
                canvasY >= b.y &&
                canvasY <= b.y + b.height;
              if (inside) return b;
            }
            return null;
          }

          canvas.addEventListener('click', function (e) {
            const world = screenToWorld(e.clientX, e.clientY);
            const building = getBuildingAtPosition(world.x, world.y);
            if (!building) return;
            vscode.postMessage({
              type: 'OPEN_CLASS_SOURCE',
              payload: { className: building.className }
            });
          });

          render();
          vscode.postMessage({ type: 'READY' });
        </script>
      </body>
      </html>
    `;
}
