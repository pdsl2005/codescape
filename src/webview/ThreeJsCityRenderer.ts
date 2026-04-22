// src/webview/ThreeJsCityRenderer.ts
// Implements ICityRenderer using the JS building creators from media/renderer3.js.
// This file owns the TS orchestration (scene, camera, controls, messaging loop)
// and delegates all building mesh creation to renderer3.js — no duplication.

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';

// World-object creators from the JS prototype — imported as-is, not rewritten in TS.
// esbuild.webview.mjs has a cdnRedirectPlugin that resolves the CDN imports
// inside renderer3.js to the local node_modules/three copy at bundle time.
import {
  createLights,
  createGrassGround,
  createGrid,
  disposeTextureCache,
} from "../../media/renderer3.js";

import { Building, BuildingFactory } from "./Building";
import { ICityRenderer } from "./ICityRenderer";
import {
  CityState,
  HitTestResult,
  RendererEvents,
  RendererStatus,
  BuildingDTO,
  filesToBuildingDTOs,
} from "./types";
import { computeCameraFit } from "../cameraFit";

export { computeCameraFit } from "../cameraFit";

const INITIAL_GRID_SIZE = 20;
// Y factor for 30° camera elevation at 45° azimuth — matches the 2D view's 2:1 isometric ratio
const ISO_Y_FACTOR = Math.sqrt(2 / 3);

export class ThreeJsCityRenderer implements ICityRenderer {
  status: RendererStatus = "uninitialized";

  // UML selection state — mirrors selectedBuilding / openLabel in main3.js
  selectedBuilding: HitTestResult | null = null;

  private renderer: THREE.WebGLRenderer | null = null;
  private labelRenderer: CSS2DRenderer | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private controls: OrbitControls | null = null;
  private raycaster = new THREE.Raycaster();
  private container: HTMLElement | null = null;
  private events: RendererEvents = {};
  private animFrameId: number | null = null;

  private openLabel: CSS2DObject | null = null;
  private selectedGroup: THREE.Object3D | null = null;

  // Buildings keyed by class name — used for incremental add/remove in renderCity
  private buildingGroups = new Map<string, Building>();
  private buildingFactory = new BuildingFactory();

  // Persistent scene objects that must be disposed with the renderer
  private worldObjects: THREE.Object3D[] = [];
  private currentGridCols = INITIAL_GRID_SIZE;
  private currentGridRows = INITIAL_GRID_SIZE;
  private groundObj: THREE.Object3D | null = null;
  private gridObj: THREE.Object3D | null = null;

  private boundOnResize: (() => void) | null = null;
  private boundOnKeyDown: ((e: KeyboardEvent) => void) | null = null;
  private hasInitialFit = false;

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  init(container: HTMLElement, events?: RendererEvents): void {
    if (this.status === "ready") {
      this.dispose();
    }
    this.container = container;
    this.events = events ?? {};

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    // WebGL renderer (preserveDrawingBuffer for toDataURL export)
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(this.renderer.domElement);

    // CSS2D renderer for UML popup labels (matches main3.js labelRenderer setup)
    this.labelRenderer = new CSS2DRenderer();
    this.labelRenderer.setSize(width, height);
    this.labelRenderer.domElement.classList.add("label-overlay");
    container.appendChild(this.labelRenderer.domElement);

    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a1a2e);

    // Camera — narrow FOV approximates the orthographic look of the 2D view
    this.camera = new THREE.PerspectiveCamera(20, width / height, 0.1, 2000);
    const gc = INITIAL_GRID_SIZE / 2 - 0.5;  // ground centre (size/2 - 0.5 offset)
    const initDist = INITIAL_GRID_SIZE * 2;
    this.camera.position.set(gc + initDist, initDist * ISO_Y_FACTOR, gc + initDist);

    // OrbitControls with damping (matches main3.js)
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.target.set(gc, 0, gc);

    // World setup — store returned objects so dispose() can clean them up
    const lights = createLights(this.scene);
    this.groundObj = createGrassGround(this.scene, INITIAL_GRID_SIZE, INITIAL_GRID_SIZE);
    this.gridObj = createGrid(this.scene, INITIAL_GRID_SIZE, INITIAL_GRID_SIZE);
    this.worldObjects = [...lights, this.groundObj, this.gridObj];

    this.renderer.domElement.addEventListener("click", this.onSceneClick);

    this.boundOnResize = () => {
      if (this.container) {
        this.resize(
          this.container.clientWidth || window.innerWidth,
          this.container.clientHeight || window.innerHeight,
        );
      }
    };
    window.addEventListener('resize', this.boundOnResize);

    this.controls.update();

    this.boundOnKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'r' || e.key === 'R') {
        this.resetView();
      }
    };
    window.addEventListener('keydown', this.boundOnKeyDown);

    this.status = "ready";
    this.events.onReady?.();
    this.startLoop();
  }

  dispose(): void {
    this.stopLoop();
    this.renderer?.domElement.removeEventListener("click", this.onSceneClick);
    if (this.boundOnResize) {
      window.removeEventListener('resize', this.boundOnResize);
      this.boundOnResize = null;
    }

    this.buildingGroups.forEach((building) => {
      building.dispose();
      this.scene?.remove(building.group);
    });
    this.buildingGroups.clear();

    this.worldObjects.forEach((obj) => {
      this.scene?.remove(obj);
      if (obj instanceof THREE.Mesh || obj instanceof THREE.LineSegments) {
        obj.geometry?.dispose();
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        (mats as THREE.Material[]).forEach((m) => m?.dispose());
      }
    });
    this.worldObjects = [];
    this.currentGridCols = INITIAL_GRID_SIZE;
    this.currentGridRows = INITIAL_GRID_SIZE;
    this.groundObj = null;
    this.gridObj = null;

    disposeTextureCache();

    if (this.labelRenderer && this.container) {
      this.container.removeChild(this.labelRenderer.domElement);
    }
    if (this.renderer && this.container) {
      this.container.removeChild(this.renderer.domElement);
      this.renderer.dispose();
    }

    this.renderer = null;
    this.labelRenderer = null;
    this.scene = null;
    this.camera = null;
    this.controls = null;
    this.container = null;
    if (this.boundOnKeyDown) {
      window.removeEventListener('keydown', this.boundOnKeyDown);
      this.boundOnKeyDown = null;
    }
    this.hasInitialFit = false;
    this.status = "disposed";
  }

  // ── Rendering ──────────────────────────────────────────────────────────────

  renderCity(state: CityState): void {
    if (!this.scene) return;
    this.status = "rendering";

    const dtos = filesToBuildingDTOs(state.files, state.layout, state.colors);
    const incoming = new Map<string, BuildingDTO>(
      dtos.map((dto) => [dto.name ?? `${dto.col}_${dto.row}`, dto])
    );

    // Remove buildings no longer in state
    for (const [key, building] of this.buildingGroups) {
      if (!incoming.has(key)) {
        building.dispose();
        this.scene.remove(building.group);
        this.buildingGroups.delete(key);
      }
    }

    // Add new buildings or rebuild existing ones whose geometry changed
    for (const [key, dto] of incoming) {
      const existing = this.buildingGroups.get(key);
      if (existing) {
        if (existing.needsRebuild(dto)) {
          this.rebuildBuilding(key, dto, existing);
        } else {
          existing.syncTransform(dto);
        }
      } else {
        this.addBuilding(key, dto);
      }
    }

    const { cols, rows } = this.calculateGridSize(dtos);
    if (cols !== this.currentGridCols || rows !== this.currentGridRows) {
      this.updateGroundAndGrid(cols, rows);
    }

    if (!this.hasInitialFit && this.buildingGroups.size > 0) {
      this.fitCamera();
      this.hasInitialFit = true;
    }
    this.status = "ready";
  }

  refresh(): void {
    // The animation loop handles continuous redraws; nothing extra needed.
  }

  setTheme(theme: "dark" | "light"): void {
    if (!this.scene) return;
    this.scene.background = new THREE.Color(
      theme === "light" ? 0xf2f2f2 : 0x1a1a2e
    );
  }

  // ── Viewport Controls ──────────────────────────────────────────────────────

  resize(width: number, height: number): void {
    if (!this.camera || !this.renderer || !this.labelRenderer) return;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    this.labelRenderer.setSize(width, height);
  }

  zoom(delta: number): void {
    if (!this.camera) return;
    this.camera.position.multiplyScalar(delta > 0 ? 0.9 : 1.1);
  }

  resetView(): void {
    this.fitCamera();
  }

  // ── Interaction ────────────────────────────────────────────────────────────

  hitTest(x: number, y: number): HitTestResult | null {
    if (!this.camera || !this.renderer) return null;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((x - rect.left) / rect.width) * 2 - 1,
      -((y - rect.top) / rect.height) * 2 + 1
    );
    this.raycaster.setFromCamera(ndc, this.camera);
    const hits = this.raycaster.intersectObjects(
      Array.from(this.buildingGroups.values()).map((b) => b.group), true
    );
    if (hits.length === 0) return null;
    const root = this.findBuildingRoot(hits[0].object);
    return root ? (root.userData as HitTestResult) : null;
  }

  /** Show the CSS2D UML panel for a building. Mirrors openUmlFor() in main3.js. */
  openUml(result: HitTestResult): void {
    const key = result.file?.name ?? "";
    const building = this.buildingGroups.get(key);
    if (!building) return;
    this.closeUml();
    const label = building.group.userData?.umlLabel as CSS2DObject | undefined;
    if (label) {
      label.visible = true;
      this.openLabel = label;
      this.selectedGroup = building.group;
      this.selectedBuilding = result;
    }
  }

  /** Hide the current UML panel and clear selection. Mirrors closeCurrentUml() in main3.js. */
  closeUml(): void {
    if (this.openLabel) {
      this.openLabel.visible = false;
      this.openLabel = null;
    }
    this.selectedGroup = null;
    this.selectedBuilding = null;
  }

  // ── Export ─────────────────────────────────────────────────────────────────

  toImageDataUrl(): string {
    if (!this.renderer || !this.scene || !this.camera) return "";
    this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement.toDataURL("image/png");
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private addBuilding(key: string, dto: BuildingDTO, texturePath?: string): void {
    const building = this.buildingFactory.create(dto, texturePath);
    this.scene!.add(building.group);
    this.buildingGroups.set(key, building);
  }

  private rebuildBuilding(key: string, dto: BuildingDTO, existing: Building): void {
    const texturePath = existing.texturePathForRebuild(dto);
    existing.dispose();
    this.scene!.remove(existing.group);
    this.addBuilding(key, dto, texturePath);
  }

  /** Mirrors findBuildingRoot() in main3.js — walks up to the Group with isBuilding. */
  private findBuildingRoot(object: THREE.Object3D | null): THREE.Object3D | null {
    let current = object;
    while (current) {
      if (current.userData?.isBuilding) return current;
      current = current.parent;
    }
    return null;
  }

  private fitCamera(): void {
    if (!this.camera || !this.controls) return;

    let minX = Infinity, maxX = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    let maxTop = 0;

    if (this.buildingGroups.size > 0) {
      for (const building of this.buildingGroups.values()) {
        minX = Math.min(minX, building.group.position.x);
        maxX = Math.max(maxX, building.group.position.x);
        minZ = Math.min(minZ, building.group.position.z);
        maxZ = Math.max(maxZ, building.group.position.z);
        // +1 covers the pyramid roof on houses (see createHouse in renderer3.js).
        const top = building.floors + 1;
        if (top > maxTop) maxTop = top;
      }
    } else {
      minX = 0; maxX = INITIAL_GRID_SIZE - 1;
      minZ = 0; maxZ = INITIAL_GRID_SIZE - 1;
      maxTop = 8;
    }

    const cx = (minX + maxX) / 2;
    const cy = maxTop / 2;
    const cz = (minZ + maxZ) / 2;

    const spanX = Math.max(maxX - minX, 0);
    const spanZ = Math.max(maxZ - minZ, 0);
    const { dist } = computeCameraFit(
      { spanX, spanZ, maxTop },
      { fov: this.camera.fov, aspect: this.camera.aspect || 1 },
      ISO_Y_FACTOR,
    );

    this.camera.position.set(cx + dist, dist * ISO_Y_FACTOR + cy, cz + dist);
    this.controls.target.set(cx, cy, cz);
    this.controls.update();
  }

  private calculateGridSize(dtos: BuildingDTO[]): { cols: number; rows: number } {
    let maxCol = 0;
    let maxRow = 0;
    for (const dto of dtos) {
      if (dto.col > maxCol) maxCol = dto.col;
      if (dto.row > maxRow) maxRow = dto.row;
    }
    return {
      cols: Math.max(maxCol + 1, 10),
      rows: Math.max(maxRow + 1, 10),
    };
  }

  private updateGroundAndGrid(cols: number, rows: number): void {
    if (!this.scene) return;

    for (const obj of [this.groundObj, this.gridObj]) {
      if (!obj) continue;
      this.scene.remove(obj);
      if (obj instanceof THREE.Mesh || obj instanceof THREE.LineSegments) {
        obj.geometry?.dispose();
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        (mats as THREE.Material[]).forEach((m) => m?.dispose());
      }
    }
    this.worldObjects = this.worldObjects.filter(
      (o) => o !== this.groundObj && o !== this.gridObj
    );

    const newGround = createGrassGround(this.scene, cols, rows);
    const newGrid = createGrid(this.scene, cols, rows);
    this.groundObj = newGround;
    this.gridObj = newGrid;
    this.worldObjects.push(newGround, newGrid);
    this.currentGridCols = cols;
    this.currentGridRows = rows;
  }

  private startLoop(): void {
    // Mirrors the animate() function in main3.js
    const loop = () => {
      this.animFrameId = requestAnimationFrame(loop);
      this.controls?.update();
      if (this.renderer && this.scene && this.camera) {
        this.renderer.render(this.scene, this.camera);
        // CSS2D label rendering is only needed when a UML panel is open
        if (this.openLabel !== null) {
          this.labelRenderer?.render(this.scene, this.camera);
        }
      }
    };
    loop();
  }

  private stopLoop(): void {
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
  }

  /** Mirrors onSceneClick() in main3.js — raycasts and toggles UML popup. */
  private onSceneClick = (event: MouseEvent): void => {
    if (!this.camera || !this.renderer) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
    this.raycaster.setFromCamera(ndc, this.camera);
    const hits = this.raycaster.intersectObjects(
      Array.from(this.buildingGroups.values()).map((b) => b.group), true
    );

    if (hits.length === 0) { this.closeUml(); return; }

    const clickedGroup = this.findBuildingRoot(hits[0].object);
    if (!clickedGroup) { this.closeUml(); return; }

    // Toggle: clicking the same building closes it (matches main3.js behavior)
    if (this.selectedGroup === clickedGroup) { this.closeUml(); return; }

    const dto = clickedGroup.userData as BuildingDTO;
    const result: HitTestResult = {
      file: { name: dto.name ?? `${dto.col}_${dto.row}`, lines: dto.lines ?? 0, functions: dto.functions ?? 0, classes: dto.classes ?? 0 },
      position: { col: dto.col, row: dto.row },
    };
    this.closeUml();
    this.openUml(result);
    this.events.onBuildingClick?.(result);
  };
}
