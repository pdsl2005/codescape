import * as vscode from "vscode";
import * as path from "path";
import { minimatch } from "minimatch";
import { JavaFileWatcher } from "./JavaFileWatcher";
import { WebviewManager } from "./WebviewManager";
import { initializeParser, parseAndStore } from "./parser";
import { buildCityWebviewHtml } from "./cityWebviewHtml";
import { computeCityLayout } from "./cityLayout";
import { FileParseStore } from "./state";

export async function activate(context: vscode.ExtensionContext) {
  console.log("CODESCAPE ACTIVATED");

  const store = new FileParseStore();
  const webviewManager = new WebviewManager(context.extensionUri, async (message: unknown) => {
    const msg = message as { type?: string; payload?: { className?: string } };
    if (msg.type === "OPEN_CLASS_SOURCE" && msg.payload?.className) {
      await openClassSourceFromClassName(msg.payload.className, store);
    }
  });

  const scan = vscode.commands.registerCommand("codescape.scan", () =>
    workspaceScan(store, webviewManager)
  );
  const javaWatcher = new JavaFileWatcher(store, webviewManager);
  await initializeParser();

  const provider = new CodescapeViewProvider(context.extensionUri, webviewManager);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("codescape.Cityview", provider)
  );

  const createSidePanel = vscode.commands.registerCommand("codescape.createSidePanel", () => {
    webviewManager.createWebview("side");
  });

  const createBottomPanel = vscode.commands.registerCommand("codescape.createBottomPanel", () => {
    webviewManager.createWebview("bottom");
  });

  const create = vscode.commands.registerCommand("codescape.createPanel", () => {
    webviewManager.createWebview("side");
  });

  const existingFiles = [
    ...await getJavaFiles(),
    ...await getPythonFiles(),
  ];

  for (const uri of existingFiles) {
    await parseAndStore(uri, store);
  }

  const classes = store.snapshot().flatMap((entry) => entry.entry.data ?? []);
  webviewManager.broadcastFullState({
    classes,
    layout: computeCityLayout(classes),
    status: classes.length > 0 ? "ready" : "empty",
  });

  const dumpDisposable = vscode.commands.registerCommand("codescape.dumpParseStore", () => {
    const snap = store.snapshot();
    console.log("Parse store snapshot:", JSON.stringify(snap, null, 2));
    vscode.window.showInformationMessage(`Parse store contains ${snap.length} entries (see console).`);
  });

  const exportDisposable = vscode.commands.registerCommand("codescape.exportParseStore", async () => {
    try {
      const snap = store.snapshot();
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showErrorMessage("No workspace folder is open.");
        return;
      }

      const outputPath = path.join(workspaceFolders[0].uri.fsPath, "codescape-output.json");
      const outputUri = vscode.Uri.file(outputPath);
      const exportData = {
        exportedAt: new Date().toISOString(),
        totalFiles: snap.length,
        files: snap.map(({ uri, entry }) => ({
          file: uri,
          status: entry.status,
          classes: entry.status === "parsed" ? entry.data : null,
        })),
      };

      await vscode.workspace.fs.writeFile(
        outputUri,
        new TextEncoder().encode(JSON.stringify(exportData, null, 2))
      );

      vscode.window.showInformationMessage(`Exported parse store to ${outputPath}`);
      console.log(`Parse store exported to: ${outputPath}`);
    } catch (err) {
      vscode.window.showErrorMessage(`Failed to export parse store: ${err}`);
      console.error("Export failed:", err);
    }
  });

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
    if (entry.status !== "parsed" || !entry.data) {
      continue;
    }

    const match = entry.data.find((c) => c.Classname === className);
    if (!match) {
      continue;
    }

    const fileUri = vscode.Uri.parse(uri);
    const isInWorkspace = workspaceFolders.some((folder) =>
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

    const targetRange =
      idx >= 0
        ? new vscode.Range(doc.positionAt(idx), doc.positionAt(idx))
        : new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 0));

    editor.selection = new vscode.Selection(targetRange.start, targetRange.end);
    editor.revealRange(targetRange, vscode.TextEditorRevealType.InCenter);
    return;
  }

  vscode.window.showInformationMessage(`Could not find source for class ${className}.`);
}

async function workspaceScan(store: FileParseStore, webviewManager: WebviewManager) {
  const files = [
    ...await getJavaFiles(),
    ...await getPythonFiles(),
  ];

  console.log(`Found ${files.length} source files. Starting parse...`);
  vscode.window.showInformationMessage(`Codescape: Scanning and parsing ${files.length} source files...`);

  let successCount = 0;
  let failureCount = 0;

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

  const scannedClasses = snap.flatMap((entry) => entry.entry.data ?? []);
  webviewManager.broadcastFullState({
    classes: scannedClasses,
    layout: computeCityLayout(scannedClasses),
    status: successCount > 0 && scannedClasses.length > 0 ? "ready" : "empty",
  });
}

async function getJavaFiles(): Promise<vscode.Uri[]> {
  console.log("scanning files....");
  const excludeUri = await vscode.workspace.findFiles(".exclude");
  let excludeFilter = null;
  if (excludeUri.length > 0) {
    const content = await vscode.workspace.fs.readFile(excludeUri[0]);
    const decoded = new TextDecoder("utf-8").decode(content);
    const excludeFiles = decoded
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.trim() !== "");
    excludeFilter = "{" + excludeFiles.join(",") + "}";
  }
  return vscode.workspace.findFiles("**/*.java", excludeFilter);
}

async function getPythonFiles(): Promise<vscode.Uri[]> {
  const excludeUri = await vscode.workspace.findFiles(".exclude");
  let excludeFilter = null;
  if (excludeUri.length > 0) {
    const content = await vscode.workspace.fs.readFile(excludeUri[0]);
    const decoded = new TextDecoder("utf-8").decode(content);
    const excludeFiles = decoded
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.trim() !== "");
    excludeFilter = "{" + excludeFiles.join(",") + "}";
  }
  return vscode.workspace.findFiles("**/*.py", excludeFilter);
}

export async function isExcluded(uri: vscode.Uri): Promise<boolean> {
  const excludeUri = await vscode.workspace.findFiles(".exclude");
  const relativePath = vscode.workspace.asRelativePath(uri);
  if (excludeUri.length === 0) {
    return false;
  }
  const content = await vscode.workspace.fs.readFile(excludeUri[0]);
  const decoded = new TextDecoder("utf-8").decode(content);
  const excludeFiles = decoded
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.trim() !== "");
  return excludeFiles.some((pattern) => minimatch(relativePath, pattern));
}

function getWebviewContent(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const rendererUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, "src", "webview", "renderer.js")
  );
  const umlUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, "src", "webview", "uml.js")
  );
  return buildCityWebviewHtml(rendererUri.toString(), umlUri.toString());
}

class CodescapeViewProvider implements vscode.WebviewViewProvider {
  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly webviewManager: WebviewManager,
  ) { }

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, "src", "webview")],
    };
    webviewView.webview.html = getWebviewContent(webviewView.webview, this.extensionUri);
    this.webviewManager.addWebview(webviewView, "explorer");
  }
}

export function deactivate() { }
