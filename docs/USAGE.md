# Codescape User Guide

## 1) Installation

### Prerequisites
- VS Code `^1.74.0`
- Node.js + npm
- Java project/workspace with `.java` files

### Build and run from source
1. Clone and enter repo.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Compile:
   ```bash
   npm run compile
   ```
4. Launch extension host from VS Code with `F5`.

## 2) Opening the City View

Codescape currently supports two user-visible locations:

1. Explorer sidebar view:
- In VS Code explorer, open **Codescape City** (`codescape.Cityview`).

2. Editor panel view:
- Run command **Create Panel** (`codescape.createPanel`) from command palette.
- This opens a tab titled `Codescape`.

Placement options in VS Code:
- Tab: default open behavior.
- Split pane: drag tab or use split editor command.
- Bottom panel: with Codescape tab focused, run **View: Move Editor into Panel**.

## 3) What the Visualization Means

- Building = Java class/interface (`ClassInfo`).
- Building height = complexity proxy (`methods + fields`, min 1).
- Building color = stable per-class assignment from palette.
- Related classes = computed in backend (`relations.ts`) for incremental updates.

Important current behavior:
- Related classes are computed and sent in `PARTIAL_STATE`.
- UI currently logs related classes and updates state subsets; dedicated visual highlighting is not finalized.

## 4) Controls

- Zoom in: mouse wheel up.
- Zoom out: mouse wheel down.
- Zoom range: `0.3` to `3.0`.
- Pan: not implemented.
- Rotation: not implemented.

## 5) Incremental Updates

Codescape watches `**/*.java` and sends partial updates:

- File changed:
  - Re-parse file.
  - Compute `changed`, `removed`, `related`.
  - Broadcast `PARTIAL_STATE` to active webviews.

- File deleted:
  - Remove from store.
  - Broadcast `PARTIAL_STATE` with `removed` class names.

## 6) Excluding Files

Create `.exclude` in workspace root.
Each line is a glob pattern matched with `minimatch`.

Example:
```text
**/generated/**
**/build/**
**/test/**
```

## 7) Commands

Contributed commands (`package.json`):
- `codescape.createPanel` -> **Create Panel**
- `codescape.scan` -> **Codescape Scan**

Runtime-registered internal commands (not contributed in `package.json`):
- `codescape.dumpParseStore`
- `codescape.exportParseStore`

## 8) Practical Workflow

1. Start extension host (`F5`).
2. Open Java workspace in extension host window.
3. Open Codescape via sidebar or `Create Panel` command.
4. Edit/save Java files and observe updates.
5. Use zoom wheel to inspect layout.

## 9) Troubleshooting

- City view not updating:
  - Confirm `.java` file is not excluded by `.exclude`.
  - Check extension host logs for parser errors.

- Empty view:
  - Verify workspace has Java files.
  - Run `codescape.scan`.

- Commands missing:
  - Recompile (`npm run compile`) and relaunch extension host.
