# Codescape Architecture Reference

## 1) Current System Overview
Codescape is a VS Code extension that parses Java files with Tree-sitter and renders classes as an isometric city in webviews.

- Backend parses `.java` files into `ClassInfo[]`.
- In-memory store tracks parse state per file.
- File watcher emits incremental frontend updates (`PARTIAL_STATE`).
- Frontend canvas renders buildings from class metadata.

High-level flow:

```text
Java files -> parser/javaExtractor -> parser -> FileParseStore
                                          |
                                          +-> on activation scan
                                          +-> on file change/delete
                                                  |
                                                  v
                                          JavaFileWatcher -> PARTIAL_STATE -> webview script -> render
```

## 2) Module and Class Audit

This section covers all current modules under `src/` and `media/`.

### Extension Layer

#### `src/extension.ts`

- `activate(context: vscode.ExtensionContext)`
  - Purpose: extension bootstrap/orchestration.
  - Responsibilities:
    - Creates `FileParseStore` and `JavaFileWatcher`.
    - Initializes parser via `initializeParser()`.
    - Registers commands:
      - `codescape.scan`
      - `codescape.createPanel`
      - `codescape.dumpParseStore`
      - `codescape.exportParseStore`
    - Registers explorer webview provider: `codescape.Cityview`.
    - Performs startup parse of workspace Java files.
  - Interactions:
    - Calls `parseAndStore()` for initial population.
    - Passes webviews to watcher for incremental updates.

- `createPanel(context, javaWatcher)`
  - Purpose: opens editor-tab webview panel (`Codescape`).
  - Interactions:
    - Injects HTML from `getWebviewContent()`.
    - Adds panel webview to `JavaFileWatcher`.
    - Posts a legacy `AST_DATA` payload (placeholder/bootstrap behavior).

- `workspaceScan(store)`
  - Purpose: manual command-triggered parse pass.
  - Interactions:
    - Uses `getJavaFiles()` + `parseAndStore()`.

- `getJavaFiles()`
  - Purpose: find all Java files, honoring `.exclude` glob entries.

- `isExcluded(uri)`
  - Purpose: check if file path matches `.exclude` patterns.
  - Abstraction: delegates matching to `minimatch`.

- `CodescapeViewProvider implements vscode.WebviewViewProvider`
  - Purpose: explorer/sidebar view provider (`codescape.Cityview`).
  - Interaction: registers webview with `JavaFileWatcher` for shared updates.

- `getWebviewContent(webview, extensionUri)`
  - Purpose: returns full frontend HTML+script.
  - Frontend state model inside script:
    - `state.classes`: `ClassInfo[]`
    - `state.layout`: class -> grid position
    - `state.colors`: class -> assigned color
    - `state.status`: `loading | ready | empty | error`

### Watcher and Incremental Update Layer

#### `src/JavaFileWatcher.ts`

- `type IncrementalChangePayload`
  - `{ changed?: ClassInfo[]; related?: ClassInfo[]; removed?: string[] }`.

- `class JavaFileWatcher`
  - Purpose: watches `**/*.java` and pushes incremental updates to active webviews.
  - Core fields:
    - `_watcher: vscode.FileSystemWatcher`
    - `_webviews: vscode.Webview[]`
  - Methods:
    - `addWebview(view)`: subscribes webview.
    - `removeWebview(view)`: unsubscribes webview.
    - `handleIncrementalChange(uri, store)`: parse changed file, compute related classes, broadcast `PARTIAL_STATE`.
    - `buildPartialStatePayload(changed, removed, store)`: relationship-aware payload builder.
    - `postIncrementalChange(payload, views)`: sends `PARTIAL_STATE`.
    - `dispose()`: dispose file watcher.
  - Interactions:
    - Uses `parseAndStore()` from parser.
    - Uses `buildGraph()/getRelated()` from relations.
    - Uses `isExcluded()` from extension.

### Parsing Layer

#### `src/parser.ts`

- `ensureInitialized()` / `initializeParser()`
  - Purpose: idempotent parser init.

- `parseJavaFile(uri)`
  - Purpose: read Java file and extract classes.

- `parseAndStore(uri, store)`
  - Purpose: orchestrates parse lifecycle.
  - Steps:
    - mark pending
    - parse with Tree-sitter
    - set parsed result
    - export sidecar JSON (`*.json` next to source)
    - return `{ changed, removed }`

- `getData(uri, store)`
  - Purpose: store accessor.

#### `src/parser/javaExtractor.ts`

- Purpose: Tree-sitter Java extraction logic.
- Key interfaces:
  - `ClassInfo`
  - `MethodInfo`
  - `FieldInfo`
  - `ConstructorInfo`
  - `ParameterInfo`
- Key functions:
  - `initParser()`
  - `extractClasses(source)`
  - helper extraction functions for methods, fields, constructors, types, modifiers, inheritance.
- Notable behavior:
  - Handles classes and interfaces (including nested declarations).
  - Type extraction normalizes many forms (primitive, array, generic base type, scoped identifiers).

### State and Relation Layer

#### `src/state.ts`

- `interface StoreEntry`
  - `{ status: 'pending' | 'parsed'; data?: ClassInfo[] }`

- `class FileParseStore`
  - Purpose: typed in-memory parse-state map keyed by URI string.
  - Methods: `markPending`, `setParsed`, `remove`, `get`, `snapshot`.

#### `src/relations.ts`

- `interface ClassGraph`
  - `dependsOn` and `dependedOnBy` adjacency maps.

- `buildGraph(allClasses)`
  - Purpose: build dependency graph from inheritance/implements/fields/ctor params.

- `getRelated(changedNames, graph)`
  - Purpose: find classes dependent on changed/removed classes.

### Frontend Rendering Layer

#### `src/webview/renderer.js`

- Purpose: canvas isometric primitives.
- Functions:
  - `drawIsoGrid`
  - `shade`
  - `drawIsoCube`
  - `drawIsoBuilding`
  - `placeIsoBuilding`

#### `src/webview/uml.js`

- Purpose: draw UML class box on canvas.
- Function:
  - `drawUmlBox`

#### Inline frontend runtime (`getWebviewContent` in `extension.ts`)

- Purpose: state machine + render loop + message handling.
- Handles messages:
  - `FULL_STATE` (legacy path, references `fileData`)
  - `AST_DATA` (legacy/mock path)
  - `PARTIAL_STATE` (active incremental path)
- Current incremental behavior:
  - Calls `updateState(changed)` then `updateState(related)` if present.
  - This currently replaces full state with subsets instead of merging.

### Layout Subsystem

#### `src/layout/types.ts`

- `BuildingNode`, `BuildingPosition`, `LayoutMap`.

#### `src/layout/placer.ts`

- `computeLayout(nodes)`
  - Purpose: relationship-grouped row layout algorithm.
  - Status: tested, but not wired into active webview layout path.

#### `src/layout/demo.ts`

- Purpose: local/demo harness for trying `computeLayout()` with sample nodes.
- Status: developer utility; not imported by runtime extension code.

### Message Contract Types

#### `src/types/messages.ts`

- Defines `FullStateMessage`, `PartialStateMessage`, `ReadyMessage`, etc.
- Status: partially out of sync with runtime payload shapes.

### Legacy/Prototype Frontend Modules

#### `media/index.html`, `media/main.js`, `media/renderer.js`

- Purpose: earlier standalone renderer/prototype assets.
- Status: not used by the active extension webview (`getWebviewContent` + `src/webview/*`).
- Interaction: none in current runtime path.

### Tests

- `src/test/parser.test.ts`: parser coverage with fixtures.
- `src/test/relations.test.ts`: graph and related-class behavior.
- `src/test/layout.test.ts`: layout algorithm behavior.
- `src/test/watcher.test.ts`: store lifecycle test (currently contains an assertion mismatch in expected parsed data shape).
- `src/test/extension.test.ts`: placeholder sample test.

## 3) Design Decisions and Rationale

### Canvas over Three.js
Rationale:
- Isometric rendering needs 2.5D projection, not a full 3D scene graph.
- Lower dependency and runtime complexity in VS Code webview sandbox.
- Smaller bundle and easier control over pixel-level rendering.

### Frontend-Owned Auto Layout
Rationale:
- Layout is primarily presentation logic.
- Keeps backend focused on semantic model (`ClassInfo`).
- Avoids backend round-trip for every visual recalculation.

Current status:
- Active layout is inline (`runAutoLayout` in webview script).
- `src/layout/placer.ts` exists as an abstraction candidate, not yet integrated.

### Full-State vs Partial-State Split
Intended rationale:
- Full snapshot once at load.
- Incremental payloads on change/delete for performance and responsiveness.

Current code state:
- Watcher emits `PARTIAL_STATE`.
- Startup panel currently posts legacy `AST_DATA` mock data.
- Message contract has legacy branches (`FULL_STATE`, `AST_DATA`, `READY`) and needs consolidation.
- This split remains the correct architecture even though implementation still has legacy paths.

### Multi-View Architecture
Rationale:
- Support both explorer view and independent editor panel.
- Shared rendering stack allows consistent experience across placements.

Current implementation:
- Explorer view provider is registered.
- Separate `codescape.createPanel` command opens panel view.
- Watcher broadcasts updates to all registered webviews.

### Persistence Approach
Current approach:
- Primary state: in-memory `FileParseStore`.
- Artifact persistence: per-file JSON sidecars from `parseAndStore`.
- Export utility: workspace-level `codescape-output.json` command.

Rationale:
- Fast startup and simple runtime model.
- JSON outputs provide inspectable parse artifacts without database complexity.

## 4) Current Gaps and Behavioral Notes

- `codescape.scan` reparses store data but does not currently broadcast a full-state refresh to already-open webviews.
- `PARTIAL_STATE` frontend handling currently applies subset updates (`changed`, then `related`) instead of merging against a canonical full state model.
- Relationship data is computed backend-side, but frontend color mapping is still class-stable palette assignment (not relationship-based encoding yet).
- `src/types/messages.ts` should be aligned with live runtime payloads.

## 5) How Everything Fits Together

- Parsing and dependency graphing live in backend TypeScript modules.
- Watcher transforms file events into semantic incremental payloads.
- Webviews consume payloads and own visual state + rendering.
- Two display surfaces (explorer webview and panel webview) can receive the same updates.
- The system is structurally modular, but message-contract consolidation is the next key step for reliability.
