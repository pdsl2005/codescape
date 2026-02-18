import * as vscode from 'vscode';
import { initParser, extractClasses, ClassInfo } from './parser/javaExtractor';
import { FileParseStore } from './state';

let initialized = false;

/** Initializes the TreeSitter Java parser once. Safe to call multiple times. */
export async function ensureInitialized(): Promise<void> {
  if (!initialized) {
    await initParser();
    initialized = true;
  }
}

/** Reads a Java file from the workspace and extracts its classes via TreeSitter. */
export async function parseJavaFile(uri: vscode.Uri): Promise<ClassInfo[]> {
  await ensureInitialized();
  const bytes = await vscode.workspace.fs.readFile(uri);
  const text = new TextDecoder().decode(bytes);
  return extractClasses(text);
}

/**
 * Orchestrator: mark pending, parse, store, and return results.
 * Also returns class names that were in the store before this parse but are no longer
 * present — these are classes that were removed/renamed in the file.
 */
export async function parseAndStore(
  uri: vscode.Uri,
  store: FileParseStore
): Promise<{ changed: ClassInfo[]; removed: string[] }> {
  const before = store.get(uri);
  const oldClasses: ClassInfo[] = before?.data ?? [];

  store.markPending(uri);
  try {
    const classes = await parseJavaFile(uri);
    store.setParsed(uri, classes);

    // Class names present before but absent now were removed/renamed
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
