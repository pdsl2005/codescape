# Codescape — Code City Visualizer

Codescape transforms your Java and Python codebase into a living isometric 3D city right inside VS Code. Each building is a class or interface; its height reflects complexity (methods + fields). Watch the city update in real time as you edit your code.

## Features

| Area | Status |
|---|---|
| Java parsing (Tree-sitter) | Implemented — classes, interfaces, inner classes, methods, fields, constructors |
| Python parsing (Tree-sitter) | Implemented — classes, module nodes, methods, fields, inheritance, inner classes |
| Relationship graph | Implemented — extends/implements/field/constructor dependencies |
| Incremental live updates | Implemented — file watcher emits partial-state messages |
| Explorer sidebar view | Implemented — `Codescape City` in the Explorer panel |
| Panel views | Implemented — side panel, bottom panel, and editor tab |
| Pan/rotation controls | Planned — zoom-only camera controls in current release |

## Getting Started

1. Install **Codescape** from the VS Code Marketplace.
2. Open a Java or Python project folder.
3. Open the **Codescape City** view in the Explorer sidebar, or run one of the commands below from the Command Palette (`Cmd/Ctrl+Shift+P`).

The city renders automatically on first open and updates incrementally as you save files.

## Commands

| Command | Description |
|---|---|
| `Codescape: Open in Side Panel` | Open the city view in the side panel |
| `Codescape: Open in Bottom Panel` | Open the city view in the bottom panel |
| `Create Panel` | Open the city view in an editor tab |
| `Codescape Scan` | Manually trigger a workspace scan |

## Known Limitations

- Pan and rotation are not yet implemented — use scroll to zoom.
- Large workspaces with thousands of classes may affect rendering performance.

## Documentation

- [Usage Guide](docs/USAGE.md)
- [Architecture Reference](docs/ARCHITECTURE.md)

## Development

Clone the repo and build locally:

```bash
npm install
npm run compile
```

Launch the extension host with `F5` in VS Code, then open one of the example workspaces:
- `examples/java-city`
- `examples/python-city`

Other dev commands:
```bash
npm run watch   # watch + rebuild on change
npm run lint    # ESLint
npm test        # compile + lint + VS Code extension tests
npm run package # produce a .vsix for local install
```

## Contributing

1. Keep runtime message contracts synchronized between extension/watcher/frontend/types.
2. Prefer small, test-backed PRs — parser, relations, watcher, and layout all have existing test suites.
3. Update [Usage Guide](docs/USAGE.md) and [Architecture Reference](docs/ARCHITECTURE.md) when behavior changes.

## License

GNU GPL-3.0. See [LICENSE](LICENSE).
