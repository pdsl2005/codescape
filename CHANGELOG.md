# Change Log

All notable changes to the "codescape" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Unreleased]

## [0.1.0] - 2026-04-22

### Added
- Java parsing via Tree-sitter: classes, interfaces, inner classes, methods, fields, constructors
- Python parsing via Tree-sitter: classes, module nodes, methods, fields, inheritance, inner classes
- Isometric 3D city rendering using Three.js — buildings represent classes, height reflects complexity
- Relationship graph tracking extends/implements/field/constructor dependencies
- Incremental live updates via file watcher (partial-state messages)
- Three view modes: Explorer sidebar, side panel, bottom panel, and editor tab
- Example workspaces: `examples/java-city`, `examples/python-city`
- Comprehensive docs set:
  - `docs/ARCHITECTURE.md` (module/class audit, design rationale, integration gaps)
  - `docs/USAGE.md` (installation, view opening modes, controls, workflow)
