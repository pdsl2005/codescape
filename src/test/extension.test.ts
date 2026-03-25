import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { WebviewManager } from '../WebviewManager';
import { initParser, extractClasses, ClassInfo } from '../parser/javaExtractor';
import { initPythonParser, extractPythonEntities } from '../parser/pythonExtractor';
import { computeCityLayout } from '../cityLayout';

const fixturesDir = path.join(__dirname, '..', '..', 'src', 'test', 'fixtures');

type PostedMessage = {
  type: string;
  payload: {
    classes: ClassInfo[];
    layout: Record<string, unknown>;
    status: 'ready' | 'empty' | 'loading';
  };
};

type MessageHandler = (message: unknown) => void | Promise<void>;

function loadEntitiesFromFixtures(): ClassInfo[] {
  const fixtureFiles = fs.readdirSync(fixturesDir).filter((name) => name.endsWith('.java') || name.endsWith('.py'));
  const entities: ClassInfo[] = [];

  for (const fileName of fixtureFiles) {
    const fullPath = path.join(fixturesDir, fileName);
    const source = fs.readFileSync(fullPath, 'utf8');

    if (fileName.endsWith('.java')) {
      entities.push(...extractClasses(source));
      continue;
    }

    const moduleName = path.basename(fileName, '.py');
    entities.push(...extractPythonEntities(source, moduleName));
  }

  return entities;
}

function createFakePanelSink() {
  const postedMessages: PostedMessage[] = [];
  let messageHandler: MessageHandler | undefined;

  const webview = {
    html: '',
    onDidReceiveMessage: (handler: MessageHandler) => {
      messageHandler = handler;
      return new vscode.Disposable(() => {
        messageHandler = undefined;
      });
    },
    postMessage: async (message: PostedMessage) => {
      postedMessages.push(message);
      return true;
    },
    asWebviewUri: (uri: vscode.Uri) => uri,
  };

  const panel = {
    webview,
    onDidDispose: () => new vscode.Disposable(() => undefined),
    dispose: () => undefined,
  };

  return {
    panel,
    postedMessages,
    async sendToExtension(message: unknown) {
      if (!messageHandler) {
        throw new Error('Webview message handler not registered');
      }
      await messageHandler(message);
    },
  };
}

suite('Extension Test Suite', () => {
  suiteSetup(async () => {
    await initParser();
    await initPythonParser();
  });

  test('webview receives a non-empty city state for real workspace fixtures', async () => {
    const originalCreateWebviewPanel = vscode.window.createWebviewPanel;
    const fakeSink = createFakePanelSink();

    Object.defineProperty(vscode.window, 'createWebviewPanel', {
      configurable: true,
      value: () => fakeSink.panel,
    });

    try {
      const manager = new WebviewManager(vscode.Uri.file(process.cwd()));
      manager.createWebview('side');

      const classes = loadEntitiesFromFixtures();
      const payload = {
        classes,
        layout: computeCityLayout(classes),
        status: classes.length > 0 ? ('ready' as const) : ('empty' as const),
      };

      manager.broadcastFullState(payload);
      await fakeSink.sendToExtension({ type: 'READY' });

      assert.ok(fakeSink.postedMessages.length > 0, 'webview should receive a message after READY');

      const fullState = fakeSink.postedMessages.find((message) => message.type === 'FULL_STATE');
      assert.ok(fullState, 'expected a FULL_STATE message');
      assert.ok(fullState!.payload.classes.length > 0, 'FULL_STATE should contain parsed entities');
      assert.ok(
        Object.keys(fullState!.payload.layout).length > 0,
        'FULL_STATE should contain building layout positions'
      );
      assert.strictEqual(fullState!.payload.status, 'ready');
    } finally {
      Object.defineProperty(vscode.window, 'createWebviewPanel', {
        configurable: true,
        value: originalCreateWebviewPanel,
      });
    }
  });
});
