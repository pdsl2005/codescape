import * as vscode from 'vscode';
import { initParser, extractClasses, ClassInfo } from './parser/javaExtractor';
import { initPythonParser, extractPythonEntities } from './parser/pythonExtractor';
import { FileParseStore } from './state';
import * as path from 'path';

let initialized = false;

/** Initializes the TreeSitter Java parser once. Safe to call multiple times. */
export async function ensureInitialized(): Promise<void> {
  if (!initialized) {
    await initParser();
    initialized = true;
    console.log('AST parser initialized successfully');
  }
}

/** Alias for ensureInitialized — kept for compatibility. */
export async function initializeParser(): Promise<void> {
  return ensureInitialized();
}

/** Reads a Java file from the workspace and extracts its classes via TreeSitter. */
export async function parseJavaFile(uri: vscode.Uri): Promise<ClassInfo[]> {
  await ensureInitialized();
  const bytes = await vscode.workspace.fs.readFile(uri);
  const text = new TextDecoder().decode(bytes);
  return extractClasses(text);
}

/** Reads a Python file from the workspace and extracts its entities via TreeSitter. */
export async function parsePythonFile(uri: vscode.Uri): Promise<ClassInfo[]> {
  await initPythonParser();
  const bytes = await vscode.workspace.fs.readFile(uri);
  const text = new TextDecoder().decode(bytes);
  const moduleName = path.basename(uri.fsPath, '.py');
  return extractPythonEntities(text, moduleName);
}

function getWorkspaceFolderForUri(uri: vscode.Uri): vscode.WorkspaceFolder {
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
  if (!workspaceFolder) {
    throw new Error(`No workspace folder found for ${uri.fsPath}`);
  }
  return workspaceFolder;
}

export function getJsonExportUriForSource(uri: vscode.Uri): vscode.Uri {
  const workspaceFolder = getWorkspaceFolderForUri(uri);
  const relativeSourcePath = path.relative(workspaceFolder.uri.fsPath, uri.fsPath);
  const parsedPath = path.parse(relativeSourcePath);
  const jsonFilePath = path.join(
    workspaceFolder.uri.fsPath,
    'codescape-json',
    parsedPath.dir,
    `${parsedPath.name}.json`
  );
  return vscode.Uri.file(jsonFilePath);
}

/**
 * Export parsed ClassInfo data under a dedicated generated tree.
 * For example: src/foo/Test.java -> codescape-json/src/foo/Test.json
 */
async function exportParseResultsAsJson(uri: vscode.Uri, classInfo: ClassInfo[]): Promise<void> {
  try {
    const sourceFilePath = uri.fsPath;
    const jsonUri = getJsonExportUriForSource(uri);
    const jsonDirPath = path.dirname(jsonUri.fsPath);
    const jsonContent = JSON.stringify({
      sourceFile: path.basename(sourceFilePath),
      parsedAt: new Date().toISOString(),
      classes: classInfo
    }, null, 2);
    const encoder = new TextEncoder();

    await vscode.workspace.fs.createDirectory(vscode.Uri.file(jsonDirPath));
    await vscode.workspace.fs.writeFile(jsonUri, encoder.encode(jsonContent));
    console.log(`Exported parse results to ${jsonUri.fsPath}`);
  } catch (err) {
    console.error('Failed to export parse results as JSON:', err);
  }
}

export async function deleteParseResultsJson(uri: vscode.Uri): Promise<void> {
  try {
    const workspaceFolder = getWorkspaceFolderForUri(uri);
    const jsonUri = getJsonExportUriForSource(uri);
    await vscode.workspace.fs.delete(jsonUri, { recursive: false, useTrash: false });
    console.log(`Deleted parse results JSON ${jsonUri.fsPath}`);

    const stopDir = path.join(workspaceFolder.uri.fsPath, 'codescape-json');
    let currentDir = path.dirname(jsonUri.fsPath);

    while (currentDir.startsWith(stopDir) && currentDir !== stopDir) {
      try {
        const entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(currentDir));
        if (entries.length > 0) {
          break;
        }
        await vscode.workspace.fs.delete(vscode.Uri.file(currentDir), { recursive: false, useTrash: false });
        currentDir = path.dirname(currentDir);
      } catch {
        break;
      }
    }
  } catch (err) {
    console.error('Failed to delete parse results JSON:', err);
  }
}

/**
 * Orchestrator: mark pending, parse, store, export JSON, and return results.
 * Returns { changed, removed } for partial state diffing.
 */
export async function parseAndStore(
  uri: vscode.Uri,
  store: FileParseStore
): Promise<{ changed: ClassInfo[]; removed: string[] }> {
  const before = store.get(uri);
  const oldClasses: ClassInfo[] = before?.data ?? [];

  store.markPending(uri);
  try {
    const ext = path.extname(uri.fsPath).toLowerCase();
    const classes = ext === '.py'
      ? await parsePythonFile(uri)
      : await parseJavaFile(uri);
    store.setParsed(uri, classes);
    await exportParseResultsAsJson(uri, classes);

    const removedNames = oldClasses
      .map(c => c.Classname)
      .filter(name => !classes.some(c => c.Classname === name));

    console.log(`Parsed ${uri.fsPath}: ${classes.length} class(es), ${removedNames.length} removed`);
    return { changed: classes, removed: removedNames };
  } catch (err) {
    console.error('Parsing failed for', uri.fsPath, err);
    return { changed: [], removed: [] };
  }
}

/** Getter for parsed data from URI. */
export function getData(uri: vscode.Uri, store: FileParseStore) {
  return store.get(uri);
}
