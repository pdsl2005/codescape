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

/**
 * Export parsed ClassInfo data to a JSON file next to the source file.
 * For example: Test.java → Test.json, script.py -> script.json
 */
async function exportParseResultsAsJson(uri: vscode.Uri, classInfo: ClassInfo[]): Promise<void> {
  try {
    const sourceFilePath = uri.fsPath;
    const parsedPath = path.parse(sourceFilePath);
    const jsonFilePath = path.join(parsedPath.dir, `${parsedPath.name}.json`);
    const jsonUri = vscode.Uri.file(jsonFilePath);
    const jsonContent = JSON.stringify({
      sourceFile: path.basename(sourceFilePath),
      parsedAt: new Date().toISOString(),
      classes: classInfo
    }, null, 2);
    const encoder = new TextEncoder();
    await vscode.workspace.fs.writeFile(jsonUri, encoder.encode(jsonContent));
    console.log(`Exported parse results to ${jsonFilePath}`);
  } catch (err) {
    console.error('Failed to export parse results as JSON:', err);
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
