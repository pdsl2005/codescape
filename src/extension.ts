// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { FileParseStore } from './state';
import { parseAndStore } from './parser';
import * as path from 'path';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	console.log("CODESCAPE ACTIVATED");

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	//console.log('Congratulations, your extension "codescape" is now active!');


	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	const disposable = vscode.commands.registerCommand('codescape.helloWorld', () => {
		// The code you place here will be executed every time your command is executed

	// creating the web viewer panel in vscode
	const panel = vscode.window.createWebviewPanel(
	// internal ID
  	'codescapeWebview', 
	// title shown to user  
  	'Codescape',          
  	vscode.ViewColumn.One,
  	{
		// lets the webview run JavaScript
    	enableScripts: true 
  	}
	);

	// html content for the web viewer
	panel.webview.html = getWebviewContent();

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

		// Display a message box to the user
		//vscode.window.showInformationMessage('Hello World from codescape!');
	});
	const scan = vscode.commands.registerCommand('codescape.scan', () => workspaceScan());

	

	context.subscriptions.push(disposable);

	// File watcher for .java files
	const javaWatcher = vscode.workspace.createFileSystemWatcher('**/*.java');

	// Simple in-memory store for parsed results
	const store = new FileParseStore();

	javaWatcher.onDidCreate((uri: vscode.Uri) => {
		console.log('Java file created:', uri.fsPath);
		// kick off parsing asynchronously
		void parseAndStore(uri, store);
	});

	javaWatcher.onDidChange((uri: vscode.Uri) => {
		console.log('Java file changed:', uri.fsPath);
		void parseAndStore(uri, store);
	});

	javaWatcher.onDidDelete((uri: vscode.Uri) => {
		console.log('Java file deleted:', uri.fsPath);
		store.remove(uri);
	});

	// Expose a command to dump the current parse store snapshot (useful for manual verification)
	const dumpDisposable = vscode.commands.registerCommand('codescape.dumpParseStore', () => {
		const snap = store.snapshot();
		console.log('Parse store snapshot:', JSON.stringify(snap, null, 2));
		vscode.window.showInformationMessage(`Parse store contains ${snap.length} entries (see console).`);
	});

	context.subscriptions.push(dumpDisposable);

	context.subscriptions.push(javaWatcher);
	context.subscriptions.push(scan);
}

async function workspaceScan(){
	//TODO
	//Get all java files not in exlclude
	const files = await getJavaFiles();
		
}



/**
 * Gets all java files within the workspace excluding the ones mentioned in .exclude. 
 * Note: Files in .exclude must be in glob pattern.
 * Note: Must be async (can run in background) because find files is an async func.
 * 
 * @returns An array of the uris for all the .java files not mentioned in .exclude
 */
async function getJavaFiles(): Promise<vscode.Uri[]>{
	console.log("scanning files....");
	const excludeUri = await vscode.workspace.findFiles(".exclude");
	let excludeFilter = null;
	//if there is an exclude file add them to excludeFiles array
	if(excludeUri.length > 0){
		const content = await vscode.workspace.fs.readFile(excludeUri[0]);
		let decoded = new TextDecoder("utf-8").decode(content);
		//split by newline, remove newline and\r characters and ensure no empty lines
		let excludeFiles = decoded.split('\n').map(line => line.trim()).filter(line => line.trim() !== '');
		excludeFilter = "{" + excludeFiles.join(",") + "}";
	}
	//get all java files and exclude ones in exclude filter
	let javaFiles = await vscode.workspace.findFiles("**/*.java",excludeFilter);
	return javaFiles;
}

// new canvas-based city visualization that renders an isometric grid and buildings from AST data
function getWebviewContent() {
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
      <!-- canvas element in webview -->
      <canvas id="cityCanvas"></canvas>

      <script>
        const vscode = acquireVsCodeApi();
        const canvas = document.getElementById('cityCanvas');
        const ctx = canvas.getContext('2d');

        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;

        const TILE_L = 50;
        const offsetX = canvas.width / 2;
        const offsetY = 100;

        //isometric grid rendering (from renderer.js)

        function drawIsoGrid(ctx, rows, cols, size, offsetX, offsetY) {
          ctx.strokeStyle = '#2c2c2c';
          var tileW = size;
          var tileH = size / 2;

          for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
              var isoX = (col - row) * tileW / 2 + offsetX;
              var isoY = (col + row) * tileH / 2 + offsetY;

              ctx.beginPath();
              ctx.moveTo(isoX, isoY);
              ctx.lineTo(isoX + tileW / 2, isoY + tileH / 2);
              ctx.lineTo(isoX, isoY + tileH);
              ctx.lineTo(isoX - tileW / 2, isoY + tileH / 2);
              ctx.closePath();
              ctx.stroke();
            }
          }
        }

        //building drawing based on class data

        function shade(color, percent) {
          var num = parseInt(color.slice(1), 16),
              amt = Math.round(2.55 * percent),
              R = (num >> 16) + amt,
              G = ((num >> 8) & 0x00ff) + amt,
              B = (num & 0x0000ff) + amt;
          return (
            '#' +
            (
              0x1000000 +
              (R < 255 ? (R < 1 ? 0 : R) : 255) * 0x10000 +
              (G < 255 ? (G < 1 ? 0 : G) : 255) * 0x100 +
              (B < 255 ? (B < 1 ? 0 : B) : 255)
            ).toString(16).slice(1)
          );
        }

        function drawIsoCube(ctx, x, y, width, height, color) {
          const depthX = width / 2;
          const depthY = width / 4;

          const bottom = { x: x,          y: y };
          const right  = { x: x + depthX, y: y - depthY };
          const top    = { x: x,          y: y - 2 * depthY };
          const left   = { x: x - depthX, y: y - depthY };

          const bottomU = { x: bottom.x, y: bottom.y - height };
          const rightU  = { x: right.x,  y: right.y  - height };
          const topU    = { x: top.x,    y: top.y    - height };
          const leftU   = { x: left.x,   y: left.y   - height };

          // Left face
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.moveTo(left.x, left.y);
          ctx.lineTo(bottom.x, bottom.y);
          ctx.lineTo(bottomU.x, bottomU.y);
          ctx.lineTo(leftU.x, leftU.y);
          ctx.closePath();
          ctx.fill();

          // Right face
          ctx.fillStyle = shade(color, -20);
          ctx.beginPath();
          ctx.moveTo(right.x, right.y);
          ctx.lineTo(bottom.x, bottom.y);
          ctx.lineTo(bottomU.x, bottomU.y);
          ctx.lineTo(rightU.x, rightU.y);
          ctx.closePath();
          ctx.fill();

          // Top face
          ctx.fillStyle = shade(color, 20);
          ctx.beginPath();
          ctx.moveTo(topU.x, topU.y);
          ctx.lineTo(rightU.x, rightU.y);
          ctx.lineTo(bottomU.x, bottomU.y);
          ctx.lineTo(leftU.x, leftU.y);
          ctx.closePath();
          ctx.fill();
        }

        function drawIsoBuilding(ctx, baseX, baseY, floors, size, color) {
          for (let i = 0; i < floors; i++) {
            drawIsoCube(ctx, baseX, baseY - i * size / 2, size, size, color);
          }
        }

        function placeIsoBuilding(col, row, floors, color) {
          var isoX = (col - row) * TILE_L / 2 + offsetX;
          var isoY = (col + row) * TILE_L / 4 + offsetY;
          drawIsoBuilding(ctx, isoX, isoY + TILE_L / 2, floors, TILE_L, color || '#598BAF');
        }

        // store file data received from the extension
        let fileData = [];

        function render() {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          drawIsoGrid(ctx, 10, 10, TILE_L, offsetX, offsetY);

          if (fileData.length === 0) {
            placeIsoBuilding(3, 3, 3, '#598BAF');
            placeIsoBuilding(5, 5, 5, '#8B5CF6');
            placeIsoBuilding(7, 3, 2, '#10B981');
          } else {
            // height based on class size (functions + classes)
            fileData.forEach((file, i) => {
              const floors = Math.max(1, (file.functions || 0) + (file.classes || 0));
              const col = 3 + i * 2;
              const row = 3 + i;
              placeIsoBuilding(col, row, floors, '#598BAF');
            });
          }
        }

        // Listen for AST_DATA messages from the extension
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
export function deactivate() {}
