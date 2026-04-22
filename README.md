# Codescape

Codescape is a VS Code extension that parses Java and Python code and renders it as an isometric city.

- Buildings represent classes/interfaces.
- Height is based on methods + fields.
- The view updates from file watcher events via partial-state messages.

## Current Status

Active prototype with working parser, watcher, relationship graph, and canvas renderer.

## Feature Status

| Area | Status | Notes |
|---|---|---|
| Java parsing (Tree-sitter) | Implemented | Classes/interfaces, inner classes, methods, fields, constructors |
| Python parsing (Tree-sitter) | Implemented | Classes, module nodes, methods, fields, inheritance, inner classes |
| Relationship graph | Implemented | Extends/implements/field/ctor dependencies |
| Incremental updates | Implemented | Watcher emits `PARTIAL_STATE` |
| Explorer webview | Implemented | `codescape.Cityview` |
| Panel webview | Implemented | Side (`codescape.createSidePanel`), bottom (`codescape.createBottomPanel`), editor tab (`codescape.createPanel`) |
| Auto-layout abstraction (`src/layout/placer.ts`) | Partial | Exists/tests pass, not wired into live renderer |
| Message contract typing (`src/types/messages.ts`) | Implemented | Used by `WebviewManager`/`JavaFileWatcher`; includes `layout`, `fullClasses`, and updated status values |
| Pan/rotation controls | Not implemented | Zoom-only camera controls |

## Documentation

- [Usage Guide](docs/USAGE.md)
- [Architecture Reference](docs/ARCHITECTURE.md)

## Quick Start

1. Install dependencies:
```bash
npm install
```
2. Compile:
```bash
npm run compile
```
3. Launch extension host (`F5` in VS Code).
4. In the extension host window:
   - Open the explorer view `Codescape City` in the sidebar, or
   - Run command `Create Panel` (`codescape.createPanel`) from the command palette.

Known-good example workspaces:
- `examples/java-city`
- `examples/python-city`

## Development

- Watch compile:
```bash
npm run watch
```
- Lint:
```bash
npm run lint
```
- Tests:
```bash
npm test
```

Test notes:
- `npm test` runs compile + lint + VS Code extension tests.
- In offline/restricted environments, `vscode-test` may be flaky depending on local VS Code test host availability.

## Commands

Contributed commands:
- `codescape.createPanel` — open city in an editor tab
- `codescape.createSidePanel` — open city in the side panel
- `codescape.createBottomPanel` — open city in the bottom panel
- `codescape.scan` (`Codescape Scan`) — manually trigger a workspace scan

Runtime-registered internal commands:
- `codescape.dumpParseStore`
- `codescape.exportParseStore`

## Contributing

1. Keep runtime message contracts synchronized between extension/watcher/frontend/types.
2. Prefer small, test-backed PRs (parser, relations, watcher, and layout have existing test suites).
3. Update [Usage Guide](docs/USAGE.md) and [Architecture Reference](docs/ARCHITECTURE.md) when behavior changes.

## License

GNU GPL-3.0. See [LICENSE](LICENSE).
