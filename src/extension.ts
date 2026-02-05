// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

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

	

	context.subscriptions.push(disposable);
}

// this is a tiny webpage that logs messages from the extension and sends a message back when it's ready
function getWebviewContent() {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <body>
      <h1>Codescape</h1>
      <p>Webview loaded.</p>

      <script>
        // this gives us access to VS Code's messaging API
        const vscode = acquireVsCodeApi();

        // listen for messages FROM the extension
        window.addEventListener('message', event => {
          console.log('Received from extension:', event.data);
        });

        // send a message TO the extension
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
