# Codescape

Codescape is a VS Code extension that parses Java code and renders it as an isometric city.

- Buildings represent classes/interfaces.
- Height is based on methods + fields.
- The view updates from file watcher events via partial-state messages.

## Current Status

Active prototype with working parser, watcher, relationship graph, and canvas renderer.

## Feature Status

| Area | Status | Notes |
|---|---|---|
| Java parsing (Tree-sitter) | Implemented | Classes/interfaces, methods, fields, constructors |
| Relationship graph | Implemented | Extends/implements/field/ctor dependencies |
| Incremental updates | Implemented | Watcher emits `PARTIAL_STATE` |
| Explorer webview | Implemented | `codescape.Cityview` |
| Panel webview | Implemented | Open via `codescape.createPanel` |
| Auto-layout abstraction (`src/layout/placer.ts`) | Partial | Exists/tests pass, not wired into live renderer |
| Message contract typing (`src/types/messages.ts`) | Partial | Does not fully match runtime payloads |
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
   - Open the explorer view `Codescape City`, or
   - Run command `Create Panel` (`codescape.createPanel`).

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
- `codescape.createPanel` (`Create Panel`)
- `codescape.scan` (`Codescape Scan`)

Runtime-registered internal commands:
- `codescape.dumpParseStore`
- `codescape.exportParseStore`

## Contributing

1. Keep runtime message contracts synchronized between extension/watcher/frontend/types.
2. Prefer small, test-backed PRs (parser, relations, watcher, and layout have existing test suites).
3. Update [Usage Guide](docs/USAGE.md) and [Architecture Reference](docs/ARCHITECTURE.md) when behavior changes.

## License

GNU GPL-3.0. See [LICENSE](LICENSE).
