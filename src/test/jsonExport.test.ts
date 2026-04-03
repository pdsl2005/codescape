import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';
import { deleteParseResultsJson, getJsonExportUriForSource, parseAndStore } from '../parser';
import { FileParseStore } from '../state';

async function uriExists(uri: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch {
    return false;
  }
}

suite('JSON Export Mirroring', () => {
  test('exports into codescape-json with mirrored directories and deletes mirrored JSON on removal', async () => {
    const workspaceRoot = process.cwd();
    const workspaceFolder = {
      uri: vscode.Uri.file(workspaceRoot),
      name: path.basename(workspaceRoot),
      index: 0,
    };
    const originalGetWorkspaceFolder = vscode.workspace.getWorkspaceFolder;
    const originalAsRelativePath = vscode.workspace.asRelativePath;

    Object.defineProperty(vscode.workspace, 'getWorkspaceFolder', {
      configurable: true,
      value: () => workspaceFolder,
    });
    Object.defineProperty(vscode.workspace, 'asRelativePath', {
      configurable: true,
      value: (uri: vscode.Uri | string) => {
        const fsPath = typeof uri === 'string' ? uri : uri.fsPath;
        return path.relative(workspaceRoot, fsPath);
      },
    });

    const uniqueDir = `tmp-json-export-${Date.now()}`;
    const sourceDir = vscode.Uri.file(path.join(workspaceFolder.uri.fsPath, uniqueDir, 'nested'));
    const sourceUri = vscode.Uri.file(path.join(sourceDir.fsPath, 'demo.py'));
    const mirroredRoot = vscode.Uri.file(path.join(workspaceFolder.uri.fsPath, 'codescape-json', uniqueDir));
    const mirroredDir = vscode.Uri.file(path.join(mirroredRoot.fsPath, 'nested'));
    const jsonUri = getJsonExportUriForSource(sourceUri);

    await vscode.workspace.fs.createDirectory(sourceDir);
    await vscode.workspace.fs.writeFile(
      sourceUri,
      new TextEncoder().encode([
        'class Demo:',
        '    def __init__(self):',
        '        self.value = 1',
        '',
        '    def count(self):',
        '        return self.value',
        '',
      ].join('\n'))
    );

    try {
      const store = new FileParseStore();
      await parseAndStore(sourceUri, store);

      assert.strictEqual(
        vscode.workspace.asRelativePath(jsonUri),
        path.join('codescape-json', uniqueDir, 'nested', 'demo.json')
      );
      assert.ok(await uriExists(jsonUri), 'expected mirrored JSON export to exist');

      await deleteParseResultsJson(sourceUri);

      assert.ok(!(await uriExists(jsonUri)), 'expected mirrored JSON export to be deleted');
      assert.ok(!(await uriExists(mirroredDir)), 'expected empty mirrored nested directory to be pruned');
      assert.ok(!(await uriExists(mirroredRoot)), 'expected empty mirrored root directory to be pruned');
    } finally {
      Object.defineProperty(vscode.workspace, 'getWorkspaceFolder', {
        configurable: true,
        value: originalGetWorkspaceFolder,
      });
      Object.defineProperty(vscode.workspace, 'asRelativePath', {
        configurable: true,
        value: originalAsRelativePath,
      });
      if (await uriExists(sourceUri)) {
        await vscode.workspace.fs.delete(sourceUri, { recursive: false, useTrash: false });
      }
      if (await uriExists(vscode.Uri.file(path.join(workspaceFolder.uri.fsPath, uniqueDir)))) {
        await vscode.workspace.fs.delete(
          vscode.Uri.file(path.join(workspaceFolder.uri.fsPath, uniqueDir)),
          { recursive: true, useTrash: false }
        );
      }
      if (await uriExists(mirroredRoot)) {
        await vscode.workspace.fs.delete(mirroredRoot, { recursive: true, useTrash: false });
      }
    }
  });
});
