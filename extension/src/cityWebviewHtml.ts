/**
 * Shared city canvas webview document (WebviewManager + explorer sidebar).
 * Keep in sync with extension ↔ webview message payloads (FULL_STATE / PARTIAL_STATE).
 */
export function buildCityWebviewHtml(umlUri: string, cityUri : string): string {
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
        <script src="${umlUri}"></script>
        <script type="module" src="${cityUri}"></script>
        <script type= "module">
          import {CityState} from "${cityUri}"
          const vscode = acquireVsCodeApi();
          const canvas = document.getElementById('cityCanvas');
          const ctx = canvas.getContext('2d');

          canvas.width = window.innerWidth;
          canvas.height = window.innerHeight;
          const city = new CityState(canvas, ctx);


          window.addEventListener('message', function (event) {
            console.log('Message received:', event.data);
            const msg = event.data;
            if (msg.type === 'FULL_STATE' && msg.payload && msg.payload.classes) {
              city.applyFullPayload(msg.payload);
            } else if (msg.type === 'AST_DATA' && msg.payload && msg.payload.files) {
              state.status = 'empty';
              city.render();
            } else if (msg.type === 'PARTIAL_STATE' && msg.payload) {
              city.applyPartialPayload(msg.payload);
            }
          });

          window.addEventListener('resize', function () {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
            city.render();
          });

          canvas.addEventListener('wheel', function (e) {
            e.preventDefault();
            if (e.deltaY < 0) {
              city.zoomLevel = Math.min(city.zoomLevel * 1.1, 3);
            } else {
              city.zoomLevel = Math.max(city.zoomLevel * 0.9, 0.3);
            }
            city.render();
          });


          canvas.addEventListener('click', function (e) {
            const world = screenToWorld(e.clientX, e.clientY);
            const building = getBuildingAtPosition(world.x, world.y);
            if (!building) return;
            vscode.postMessage({
              type: 'OPEN_CLASS_SOURCE',
              payload: { className: building.className }
            });
          });

          city.render();
          vscode.postMessage({ type: 'READY' });
        </script>
      </body>
      </html>
    `;
}
