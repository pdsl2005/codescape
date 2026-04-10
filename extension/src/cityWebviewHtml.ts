/**
 * Shared city canvas webview document (WebviewManager + explorer sidebar).
 * Keep in sync with extension ↔ webview message payloads (FULL_STATE / PARTIAL_STATE).
 */
export function buildCityWebviewHtml(umlUri: string, adapterUri : string): string {
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
        <script type="module" src = "${adapterUri}">
        </script>
      </body>
      </html>
    `;
}
