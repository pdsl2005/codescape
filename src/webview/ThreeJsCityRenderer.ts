// src/webview/ThreeJsCityRenderer.ts
// Implements ICityRenderer using the JS building creators from media/renderer3.js.
// This file owns the TS orchestration (scene, camera, controls, messaging loop)
// and delegates all building mesh creation to renderer3.js — no duplication.

import * as THREE from 'three';
import { OrbitControls } from 'https://unpkg.com/three@0.141.0/examples/jsm/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'https://unpkg.com/three@0.141.0/examples/jsm/renderers/CSS2DRenderer.js';

// Building creators from the JS prototype — imported as-is, not rewritten in TS.
// esbuild.webview.mjs has a cdnRedirectPlugin that resolves the CDN imports
// inside renderer3.js to the local node_modules/three copy at bundle time.
// @ts-ignore
import {
  createLights,
  createGround,
  createGrid,
  createBuildingFromDTO,
  disposeTextureCache,
} from "../../media/renderer3.js";

import { ICityRenderer } from "./ICityRenderer";
import {
  CityState,
  HitTestResult,
  RendererEvents,
  RendererStatus,
  BuildingDTO,
  filesToBuildingDTOs,
} from "./types";

const INITIAL_GRID_SIZE = 20;

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

  // Groups keyed by class name — used for incremental add/remove in renderCity
  private buildingGroups = new Map<string, THREE.Object3D>();

  // Persistent scene objects that must be disposed with the renderer
  private worldObjects: THREE.Object3D[] = [];

  private boundOnResize: (() => void) | null = null;

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
    this.labelRenderer.domElement.style.cssText =
      "position:absolute;top:0;left:0;pointer-events:none;z-index:10";
    container.appendChild(this.labelRenderer.domElement);

    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xf2f2f2);

    // Camera — positioned far enough to see the full grid on open
    this.camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
    const cx = INITIAL_GRID_SIZE / 2;
    this.camera.position.set(cx + INITIAL_GRID_SIZE, INITIAL_GRID_SIZE, cx + INITIAL_GRID_SIZE);

    // OrbitControls with damping (matches main3.js)
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.target.set(cx, 0, cx);

    // World setup — store returned objects so dispose() can clean them up
    const lights = createLights(this.scene);
    const ground = createGround(this.scene, INITIAL_GRID_SIZE);
    const grid = createGrid(this.scene, INITIAL_GRID_SIZE, INITIAL_GRID_SIZE);
    this.worldObjects = [...lights, ground, grid];

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

    this.buildingGroups.forEach((group) => {
      this.disposeGroup(group);
      this.scene?.remove(group);
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
    this.status = "disposed";
  }

  private disposeGroup(group: THREE.Object3D): void {
    group.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry?.dispose();
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        (mats as THREE.Material[]).forEach((m) => m?.dispose());
      }
      const c = child as any;
      if (c.isCSS2DObject && c.element instanceof HTMLElement) {
        c.element.remove();
      }
    });
  }

  // ── Rendering ──────────────────────────────────────────────────────────────

  renderCity(state: CityState): void {
    if (!this.scene) return;
    this.status = "rendering";

    const dtos = filesToBuildingDTOs(state.files);
    const incoming = new Map<string, BuildingDTO>(
      dtos.map((dto) => [dto.name ?? `${dto.col}_${dto.row}`, dto])
    );

    // Remove buildings no longer in state
    for (const [key, group] of this.buildingGroups) {
      if (!incoming.has(key)) {
        this.disposeGroup(group);
        this.scene.remove(group);
        this.buildingGroups.delete(key);
      }
    }

    // Add new buildings — delegates to createBuildingFromDTO in renderer3.js
    for (const [key, dto] of incoming) {
      if (!this.buildingGroups.has(key)) {
        const group = createBuildingFromDTO(dto);
        this.scene.add(group);
        this.buildingGroups.set(key, group);
      }
    }

    this.status = "ready";
  }

  refresh(): void {
    // The animation loop handles continuous redraws; nothing extra needed.
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
    if (!this.camera || !this.controls) return;
    const cx = INITIAL_GRID_SIZE / 2;
    this.camera.position.set(cx + INITIAL_GRID_SIZE, INITIAL_GRID_SIZE, cx + INITIAL_GRID_SIZE);
    this.controls.target.set(cx, 0, cx);
    this.controls.update();
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
      Array.from(this.buildingGroups.values()), true
    );
    if (hits.length === 0) return null;
    const root = this.findBuildingRoot(hits[0].object);
    return root ? (root.userData as HitTestResult) : null;
  }

  /** Show the CSS2D UML panel for a building. Mirrors openUmlFor() in main3.js. */
  openUml(result: HitTestResult): void {
    const key = result.file?.name ?? "";
    const group = this.buildingGroups.get(key);
    if (!group) return;
    this.closeUml();
    const label = group.userData?.umlLabel as CSS2DObject | undefined;
    if (label) {
      label.visible = true;
      this.openLabel = label;
      this.selectedGroup = group;
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

  /** Mirrors findBuildingRoot() in main3.js — walks up to the Group with isBuilding. */
  private findBuildingRoot(object: THREE.Object3D | null): THREE.Object3D | null {
    let current = object;
    while (current) {
      if (current.userData?.isBuilding) return current;
      current = current.parent;
    }
    return null;
  }

  private startLoop(): void {
    // Mirrors the animate() function in main3.js
    const loop = () => {
      this.animFrameId = requestAnimationFrame(loop);
      this.controls?.update();
      if (this.renderer && this.scene && this.camera) {
        this.renderer.render(this.scene, this.camera);
        this.labelRenderer?.render(this.scene, this.camera);
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
      Array.from(this.buildingGroups.values()), true
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
