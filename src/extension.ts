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

// this is a tiny webpage that logs messages from the extension and sends a message back when it's ready
function getWebviewContent() {
  return `
<!DOCTYPE html>
<html lang="en">
  <body>
    <h1>Codescape</h1>

    <div id="content">
      <p>Loading parsed data...</p>
    </div>

    <p>Webview loaded.</p>

    <script>
      //access VS Code messaging API
      const vscode = acquireVsCodeApi();

      const container = document.getElementById('content');

      //listen for messages FROM the extension
      window.addEventListener('message', (event) => {
        const message = event.data;

        console.log('Received from extension:', message);

        if (!message || message.type !== 'AST_DATA') {
          console.warn('Unexpected message:', message);
          return;
        }

        try {
          renderAST(message.payload);
        } catch (err) {
          console.error('Schema error:', err);
          container.innerHTML = '<p>Error rendering parsed data.</p>';
        }
      });

      function renderAST(payload) {
        //validate structure
        if (!payload || !Array.isArray(payload.files)) {
          throw new Error('Invalid payload structure: missing files array');
        }

        //empty state
        if (payload.files.length === 0) {
          container.innerHTML = '<p>No Java files found.</p>';
          return;
        }

        //render simple list
        let html = '<ul>';

        payload.files.forEach((file) => {
          html += '<li>' +
            '<strong>' + file.name + '</strong><br/>' +
            'Lines: ' + file.lines + '<br/>' +
            'Classes: ' + file.classes + '<br/>' +
            'Methods: ' + file.functions +
            '</li>';
        });

        html += '</ul>';
        container.innerHTML = html;
      }

      //notify extension that webview is ready
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
