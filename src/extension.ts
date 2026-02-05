// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as path from 'path';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "codescape" is now active!');

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	const disposable = vscode.commands.registerCommand('codescape.helloWorld', () => {
		// The code you place here will be executed every time your command is executed
		// Display a message box to the user
		vscode.window.showInformationMessage('Hello World from codescape!');
	});
	const scan = vscode.commands.registerCommand('codescape.scan', () => workspaceScan());

	context.subscriptions.push(disposable);
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
	console.log("scanning files....")
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

// This method is called when your extension is deactivated
export function deactivate() {}
