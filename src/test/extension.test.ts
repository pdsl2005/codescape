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
    const fakeSink = createFakePanelSink();
    const manager = new WebviewManager(
      vscode.Uri.file(process.cwd()),
      undefined,
      () => fakeSink.panel as unknown as vscode.WebviewPanel,
    );
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
  });

  test('registerExplorerView replays lastFullState immediately on registration', async () => {
    const postedMessages: unknown[] = [];

    const fakeView = {
      viewType: 'codescape.Cityview',
      webview: {
        html: '',
        options: {},
        onDidReceiveMessage: (_handler: (msg: unknown) => void) =>
          new vscode.Disposable(() => {}),
        postMessage: async (msg: unknown) => {
          postedMessages.push(msg);
          return true;
        },
        asWebviewUri: (uri: vscode.Uri) => uri,
      },
      onDidDispose: (_cb: () => void) => new vscode.Disposable(() => {}),
    };

    const manager = new WebviewManager(vscode.Uri.file(process.cwd()));

    const classes = loadEntitiesFromFixtures();
    const layout = computeCityLayout(classes);
    manager.broadcastFullState({ classes, layout, status: 'ready' });

    assert.strictEqual(postedMessages.length, 0, 'no messages before registration');

    manager.registerExplorerView(fakeView as unknown as vscode.WebviewView);

    assert.ok(postedMessages.length > 0, 'explorer view should receive replayed state immediately');
    const fullStateMsg = postedMessages.find((m: any) => m.type === 'FULL_STATE');
    assert.ok(fullStateMsg, 'expected a FULL_STATE replay message');
    assert.strictEqual((fullStateMsg as any).payload.status, 'ready');
  });
});
