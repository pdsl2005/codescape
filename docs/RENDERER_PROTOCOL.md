# Renderer Protocol — SCRUM-170

This document is the contract for implementing a new renderer (e.g. `ThreeJsCityRenderer`) that plugs into the Codescape webview.

---

## Overview

The webview uses a **renderer registry** that lets Canvas 2D and Three.js coexist as swappable view modes. The orchestrator (`webviewMain.ts`) only ever talks to the `ICityRenderer` interface — it never calls Canvas or Three.js APIs directly.

```
extension.ts
    │  FULL_STATE { classes: ParsedClassInfo[] }
    ▼
webviewMain.ts  ──►  RendererRegistry
                          │
                 ┌────────┴────────┐
                 ▼                 ▼
     CanvasIsoCityRenderer   ThreeJsCityRenderer  ← you build this
     (SCRUM-169, done)        (SCRUM-172)
```

---

## Step 1 — Create your file

Create `src/webview/ThreeJsCityRenderer.ts` and implement `ICityRenderer`:

```ts
import { ICityRenderer } from "./ICityRenderer";
import { CityState, HitTestResult, RendererEvents, RendererStatus } from "./types";

export class ThreeJsCityRenderer implements ICityRenderer {
  status: RendererStatus = "uninitialized";
  // ... implement all methods below
}
```

---

## Step 2 — Register it

In `src/webview/webviewMain.ts`, uncomment:

```ts
// line 8
import { ThreeJsCityRenderer } from "./ThreeJsCityRenderer";

// line 24
registry.register("threejs", new ThreeJsCityRenderer());
```

---

## Step 3 — Implement the interface

All methods below must be implemented. The orchestrator calls them directly.

### `init(container: HTMLElement, events?: RendererEvents): void`

Called once when the view mode is activated.

- Mount your Three.js scene **inside `container`** (a `<div>`), not on `document.body`
- Set up your scene, camera, renderer, and animation loop here
- Call `events.onReady?.()` when the renderer is ready to receive data

```ts
init(container: HTMLElement, events?: RendererEvents): void {
  this.container = container;
  this.events = events ?? {};

  this.renderer = new THREE.WebGLRenderer({ antialias: true });
  this.renderer.setSize(container.clientWidth, container.clientHeight);
  container.appendChild(this.renderer.domElement);

  // set up scene, camera, lights...

  this.status = "ready";
  this.events.onReady?.();
}
```

---

### `dispose(): void`

Called when switching away from this renderer. Clean everything up.

- Remove `renderer.domElement` from the container
- Cancel any animation frame loops
- Dispose Three.js geometries, materials, and textures
- Set `this.status = "disposed"`

---

### `renderCity(state: CityState): void`

Called when new data arrives from the extension. `CityState` is:

```ts
interface CityState {
  files: FileData[];
}

interface FileData {
  name: string;       // e.g. "App.java"
  lines: number;      // total lines of code
  functions: number;  // method count
  classes: number;    // always 1 per entry
}
```

Use `filesToBuildingDTOs(state.files)` from `types.ts` to get grid positions and building heights:

```ts
import { filesToBuildingDTOs } from "./types";

renderCity(state: CityState): void {
  const buildings = filesToBuildingDTOs(state.files);
  // buildings[i].col, .row  → grid position
  // buildings[i].floors     → building height (functions + classes)
  // buildings[i].color      → hex color string
  // buildings[i].name       → original file name
  this.rebuild(buildings);
}
```

---

### `refresh(): void`

Redraw without new data — called after resize, zoom, or pan. For Three.js this is usually just a `renderer.render(scene, camera)` call.

---

### `resize(width: number, height: number): void`

Called when the container is resized.

```ts
resize(width: number, height: number): void {
  this.camera.aspect = width / height;
  this.camera.updateProjectionMatrix();
  this.renderer.setSize(width, height);
}
```

---

### `zoom(delta: number): void`

Positive delta = zoom in, negative = zoom out. Adjust your camera distance or FOV.

---

### `resetView(): void`

Reset camera to the default position and orientation.

---

### `hitTest(x: number, y: number): HitTestResult | null`

Given screen coordinates `(x, y)`, return the building at that position or `null`.

Use Three.js raycasting:

```ts
hitTest(x: number, y: number): HitTestResult | null {
  const rect = this.renderer.domElement.getBoundingClientRect();
  const ndc = new THREE.Vector2(
    ((x - rect.left) / rect.width) * 2 - 1,
   -((y - rect.top)  / rect.height) * 2 + 1,
  );
  this.raycaster.setFromCamera(ndc, this.camera);
  const hits = this.raycaster.intersectObjects(this.buildingMeshes);
  if (hits.length === 0) return null;

  const mesh = hits[0].object;
  // mesh.userData should contain { file: FileData, position: GridPosition }
  return mesh.userData as HitTestResult;
}
```

Store `{ file, position }` in `mesh.userData` when you build each mesh so hit-test can return it.

---

### `toImageDataUrl(): string`

Export the current view as a PNG data URL. For Three.js:

```ts
toImageDataUrl(): string {
  this.renderer.render(this.scene, this.camera); // ensure latest frame
  return this.renderer.domElement.toDataURL("image/png");
}
```

> Note: The Three.js `WebGLRenderer` must be created with `{ preserveDrawingBuffer: true }` for `toDataURL()` to work.

---

## Data flow summary

```
Extension                 webviewMain.ts              ThreeJsCityRenderer
─────────                 ──────────────              ───────────────────
FULL_STATE ──────────►  parsedClassesToCityState()
                              │
                              │  CityState { files[] }
                              ▼
                         renderer.renderCity()  ──►  filesToBuildingDTOs()
                                                           │
                                                           ▼
                                                     build/update meshes

user clicks ◄──────────  events.onBuildingClick()  ◄──  hitTest()
BUILDING_CLICK
```

---

## Checklist before marking SCRUM-172 done

- [ ] `init()` mounts Three.js inside `container`, not `document.body`
- [ ] `dispose()` removes DOM element and cancels animation loop
- [ ] `renderCity()` uses `filesToBuildingDTOs()` for grid positions
- [ ] `hitTest()` stores `{ file, position }` in `mesh.userData`
- [ ] `toImageDataUrl()` works (renderer created with `preserveDrawingBuffer: true`)
- [ ] Registered in `webviewMain.ts` under `"threejs"`
- [ ] Switching between Canvas and Three.js via `SET_VIEW` works without errors
