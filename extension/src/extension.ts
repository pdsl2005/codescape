// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import * as path from "path";
import { minimatch } from "minimatch";
import { JavaFileWatcher } from "./JavaFileWatcher";
import { WebviewManager } from "./WebviewManager";
import { initializeParser, parseAndStore } from "./parser";
import { buildCityWebviewHtml } from "./cityWebviewHtml";
import { computeCityLayout } from "./cityLayout";
import { FileParseStore } from "./state";

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {
  console.log("CODESCAPE ACTIVATED");
  const store = new FileParseStore();
  const webviewManager = new WebviewManager(context.extensionUri);
  const scan = vscode.commands.registerCommand('codescape.scan', () => workspaceScan(store, webviewManager));
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
const createSidePanel = vscode.commands.registerCommand('codescape.createSidePanel', () => {
  webviewManager.createWebview('side');
});

const createBottomPanel = vscode.commands.registerCommand('codescape.createBottomPanel', () => {
  webviewManager.createWebview('bottom');
});

// legacy command
const create = vscode.commands.registerCommand('codescape.createPanel', () => {
  webviewManager.createWebview('side');
});

  // Parse all existing Java and Python files on startup
  const existingFiles = [
    ...await getJavaFiles(),
    ...await getPythonFiles(),
  ];

  for (const uri of existingFiles) {
    await parseAndStore(uri, store);
  }

  // Send full state to webview manager after initial parse
  const classes = store.snapshot().flatMap((entry) => entry.entry.data ?? []);
  webviewManager.broadcastFullState({
    classes,
    layout: computeCityLayout(classes),
    status: classes.length > 0 ? "ready" : "empty",
  });

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

async function openClassSourceFromClassName(className: string, store: FileParseStore) {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    return;
  }

  const snapshot = store.snapshot();

  for (const { uri, entry } of snapshot) {
    if (entry.status !== 'parsed' || !entry.data) continue;

    const match = entry.data.find(c => c.Classname === className);
    if (!match) continue;

    const fileUri = vscode.Uri.parse(uri);

    const isInWorkspace = workspaceFolders.some((folder: vscode.WorkspaceFolder) =>
      fileUri.fsPath.startsWith(folder.uri.fsPath + path.sep)
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

  vscode.window.showInformationMessage(`Could not find source for class ${className}.`);
}

async function workspaceScan(store: FileParseStore, webviewManager: WebviewManager) {
  // Get all supported source files not in exclude
  const files = [
    ...await getJavaFiles(),
    ...await getPythonFiles(),
  ];

  console.log(`Found ${files.length} source files. Starting parse...`);
  vscode.window.showInformationMessage(`Codescape: Scanning and parsing ${files.length} source files...`);

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
  console.log(`Workspace scan complete. Parsed ${successCount} files, ${failureCount} failures. Store has ${snap.length} entries.`);
  vscode.window.showInformationMessage(`Codescape: Scan complete! Successfully parsed ${successCount} files (${failureCount} failures).`);

  // Broadcast updated full state to all webviews
  const scannedClasses = snap.flatMap((entry) => entry.entry.data ?? []);
  webviewManager.broadcastFullState({
    classes: scannedClasses,
    layout: computeCityLayout(scannedClasses),
    status: successCount > 0 && scannedClasses.length > 0 ? "ready" : "empty",
  });
}


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
function getWebviewContent(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const umlUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, "src", "webview", "uml.js")
  );
  const cityUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, "src", "webview", "citystate.js")
  )
  return buildCityWebviewHtml(umlUri.toString(), cityUri.toString());
}

// sidebar view
class CodescapeViewProvider implements vscode.WebviewViewProvider {
  //add WebviewManager to sidebar
  constructor(private extensionUri: vscode.Uri, private webviewManager: WebviewManager) { }
  resolveWebviewView(webviewView: vscode.WebviewView) {
    console.log('resolveWebviewView called, view id:', webviewView.viewType);

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'src', 'webview')]
    };
    webviewView.webview.html = getWebviewContent(webviewView.webview, this.extensionUri);
    // Register this WebviewView with WebviewManager so it participates in the shared messaging/management logic
    this.webviewManager.addWebview(webviewView);
  }
}


// This method is called when your extension is deactivated
export function deactivate() { }
