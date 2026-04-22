# Fix WebviewView READY Handshake Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the auto-ready shortcut for WebviewView (sidebar explorer view) in WebviewManager so it goes through the same READY handshake as panels, preventing FULL_STATE from being posted before the webview's message listener is active.

**Architecture:** Delete the `isWebviewView` auto-ready block in `addWebview()`. The existing `onDidReceiveMessage` READY handler already does everything correctly — sets `isReady = true` and replays `lastFullState` — and the webview bundle already sends READY from both renderer classes. Removing the shortcut unifies the startup path for all container types.

**Tech Stack:** TypeScript, VS Code Extension API (`vscode.WebviewView`, `vscode.WebviewPanel`), `@vscode/test-cli` (test runner)

---

## Context / What You Need to Know

`WebviewManager.addWebview()` in `src/WebviewManager.ts` has two startup paths:

1. **Panels** (`vscode.WebviewPanel`): `isReady` starts `false`, waits for a `READY` message from the webview bundle before sending `FULL_STATE`. Working correctly.
2. **WebviewView / explorer sidebar** (`vscode.WebviewView`): `isReady` is set to `true` immediately at registration (lines 83–90), and `FULL_STATE` is posted right away. This races against the webview bundle's `window.addEventListener('message', ...)` setup and can silently drop messages.

Both renderer classes (`CanvasIsoCityRenderer`, `ThreeJsCityRenderer`) call `this.events.onReady?.()` at the end of their `init()` method, which posts `{ type: "READY" }` to the extension. The READY handler in `onDidReceiveMessage` (lines 95–103) already handles state replay — it just isn't reached for WebviewView because `isReady` is pre-set.

**Existing test note:** The test `registerExplorerView replays lastFullState immediately on registration` (line 117 of `extension.test.ts`) uses a `fakeView` without `onDidChangeVisibility`, so `isWebviewView()` returns `false` at runtime and the auto-ready block never fires. This test is currently failing (it asserts messages are sent immediately, but none are). This plan fixes the test as part of the fix.

---

## Files

| File | Change |
|------|--------|
| `src/WebviewManager.ts` | Delete lines 83–91 (the `isWebviewView` auto-ready block) |
| `src/test/extension.test.ts` | Update the broken explorer view test to use the READY handshake |

---

### Task 1: Update the explorer view test to expect the READY handshake

This makes the test correct, and it will **fail** until the code fix is applied (once `onDidChangeVisibility` is present in the mock, the auto-ready block will fire and send FULL_STATE immediately, breaking the "no messages before READY" assertion).

**Files:**
- Modify: `src/test/extension.test.ts:117-150`

- [ ] **Step 1: Replace the existing explorer view test**

In `src/test/extension.test.ts`, replace lines 117–150 with:

```typescript
  test('registerExplorerView replays lastFullState after READY handshake', async () => {
    const postedMessages: unknown[] = [];
    let messageHandler: ((msg: unknown) => void) | undefined;

    const fakeView = {
      viewType: 'codescape.Cityview',
      webview: {
        html: '',
        options: {},
        onDidReceiveMessage: (handler: (msg: unknown) => void) => {
          messageHandler = handler;
          return new vscode.Disposable(() => {});
        },
        postMessage: async (msg: unknown) => {
          postedMessages.push(msg);
          return true;
        },
        asWebviewUri: (uri: vscode.Uri) => uri,
      },
      onDidDispose: (_cb: () => void) => new vscode.Disposable(() => {}),
      onDidChangeVisibility: (_cb: () => void) => new vscode.Disposable(() => {}),
    };

    const manager = new WebviewManager(vscode.Uri.file(process.cwd()));

    const classes = loadEntitiesFromFixtures();
    const layout = computeCityLayout(classes);
    manager.broadcastFullState({ classes, layout, status: 'ready' });

    assert.strictEqual(postedMessages.length, 0, 'no messages before registration');

    manager.registerExplorerView(fakeView as unknown as vscode.WebviewView);

    assert.strictEqual(postedMessages.length, 0, 'no FULL_STATE before READY');

    assert.ok(messageHandler, 'onDidReceiveMessage handler must be registered');
    await messageHandler!({ type: 'READY' });

    const fullStateMsg = postedMessages.find((m: any) => m.type === 'FULL_STATE');
    assert.ok(fullStateMsg, 'expected FULL_STATE after READY');
    assert.strictEqual((fullStateMsg as any).payload.status, 'ready');
  });
```

Key differences from the old test:
- `onDidChangeVisibility` added — makes `isWebviewView()` return `true` so the code path is actually exercised
- `onDidReceiveMessage` captures the handler instead of ignoring it
- Two assertions: no messages before READY, then FULL_STATE after READY
- `messageHandler!({ type: 'READY' })` simulates the webview bundle calling `vscode.postMessage({ type: 'READY' })`

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npm test
```

Expected: the test `registerExplorerView replays lastFullState after READY handshake` **fails** with something like:

```
AssertionError [ERR_ASSERTION]: no FULL_STATE before READY
```

This confirms the auto-ready block is running and sending FULL_STATE before READY (the bug in action).

---

### Task 2: Remove the auto-ready block from WebviewManager

**Files:**
- Modify: `src/WebviewManager.ts:83-91`

- [ ] **Step 1: Delete the auto-ready block**

In `src/WebviewManager.ts`, find the `addWebview()` method. Delete these lines (currently 83–91):

```typescript
        if (isWebviewView(container)) {
            managedWebview.isReady = true;
            if (this.lastFullState) {
                container.webview.postMessage({
                    type: 'FULL_STATE',
                    payload: this.lastFullState,
                });
            }
        }
```

After deletion, `addWebview()` should look like this from the `this.webviews.set` line through to `onDidReceiveMessage`:

```typescript
        const viewId = this.generateViewId();
        this.webviews.set(viewId, managedWebview);

        container.webview.onDidReceiveMessage(async (message: unknown) => {
            const msg = message as { type?: string; payload?: unknown };
            if (msg.type === 'READY') {
                console.log(`Webview ready: ${viewId}`);
                managedWebview.isReady = true;
                if (this.lastFullState) {
                    container.webview.postMessage({
                        type: 'FULL_STATE',
                        payload: this.lastFullState,
                    });
                }
            } else if (msg.type === 'BUILDING_CLICK') {
                this.onBuildingClick?.(msg.payload);
            } else if (this.extensionMessageHandler) {
                await this.extensionMessageHandler(message);
            }
        });
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: no output (clean).

- [ ] **Step 3: Run all tests**

```bash
npm test
```

Expected: both tests pass —
- `webview receives a non-empty city state for real workspace fixtures` ✓
- `registerExplorerView replays lastFullState after READY handshake` ✓

- [ ] **Step 4: Commit**

```bash
git add src/WebviewManager.ts src/test/extension.test.ts
git commit -m "fix: wait for READY handshake on WebviewView before sending FULL_STATE

Explorer sidebar views were marked isReady=true immediately at registration,
before the webview bundle's message listener was active. Removing the
auto-ready block lets the existing READY handler manage state replay for
all container types uniformly."
```

---

## Verification

After the commit, manually verify in Extension Development Host:

1. Open VS Code with the extension active (explorer sidebar visible)
2. Open a Java/Python file — the city should appear in the sidebar ✓
3. Close the sidebar panel and reopen it — city should reappear ✓
4. Edit a Java file while sidebar is closed, then reopen — city should reflect the edit ✓ (this also validates the earlier `cacheFullState` fix)
