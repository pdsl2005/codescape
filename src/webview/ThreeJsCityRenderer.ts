// src/webview/ThreeJsCityRenderer.ts
// SCRUM-172 — Three.js renderer implementing ICityRenderer

import * as THREE from "three";
import { ICityRenderer } from "./ICityRenderer";
import {
  CityState,
  HitTestResult,
  RendererEvents,
  RendererStatus,
  BuildingDTO,
  filesToBuildingDTOs,
} from "./types";

const TILE_SIZE = 60;
const FLOOR_HEIGHT = 8;

export class ThreeJsCityRenderer implements ICityRenderer {
  status: RendererStatus = "uninitialized";

  private renderer: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private raycaster = new THREE.Raycaster();
  private container: HTMLElement | null = null;
  private events: RendererEvents = {};

  // Mesh registry keyed by file name for efficient add/update/remove
  private buildingMeshes = new Map<string, THREE.Mesh>();

  // =========================================================================
  // LIFECYCLE
  // =========================================================================

  init(container: HTMLElement, events?: RendererEvents): void {
    this.container = container;
    this.events = events ?? {};

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    // Renderer — preserveDrawingBuffer required for toDataURL()
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      preserveDrawingBuffer: true,
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.shadowMap.enabled = true;
    container.appendChild(this.renderer.domElement);

    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color("#1a1a2e");

    // Camera — positioned above and at an angle to see the city
    this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 2000);
    this.camera.position.set(300, 400, 300);
    this.camera.lookAt(0, 0, 0);

    // Lights
    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambient);

    const sun = new THREE.DirectionalLight(0xffffff, 1.0);
    sun.position.set(200, 400, 200);
    sun.castShadow = true;
    this.scene.add(sun);

    // Ground plane
    const groundGeo = new THREE.PlaneGeometry(2000, 2000);
    const groundMat = new THREE.MeshStandardMaterial({ color: "#2c2c2c" });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    this.status = "ready";
    this.events.onReady?.();
    this.renderFrame();
  }

  dispose(): void {
    this.buildingMeshes.forEach((mesh) => {
      (mesh.geometry as THREE.BufferGeometry).dispose();
      (mesh.material as THREE.Material).dispose();
      this.scene?.remove(mesh);
    });
    this.buildingMeshes.clear();

    if (this.renderer && this.container) {
      this.container.removeChild(this.renderer.domElement);
      this.renderer.dispose();
    }

    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.container = null;
    this.status = "disposed";
  }

  // =========================================================================
  // RENDERING
  // =========================================================================

  renderCity(state: CityState): void {
    if (!this.scene) return;
    this.status = "rendering";

    const dtos = filesToBuildingDTOs(state.files);
    const incoming = new Map<string, BuildingDTO>(
      dtos.map((dto) => [dto.name ?? `${dto.col}_${dto.row}`, dto])
    );

    // Remove buildings no longer in state
    for (const [key, mesh] of this.buildingMeshes) {
      if (!incoming.has(key)) {
        this.scene.remove(mesh);
        (mesh.geometry as THREE.BufferGeometry).dispose();
        (mesh.material as THREE.Material).dispose();
        this.buildingMeshes.delete(key);
      }
    }

    // Add or update buildings
    for (const [key, dto] of incoming) {
      const existing = this.buildingMeshes.get(key);
      const floors = Math.max(1, dto.floors);
      const buildingHeight = floors * FLOOR_HEIGHT;
      const x = dto.col * TILE_SIZE;
      const z = dto.row * TILE_SIZE;

      if (existing) {
        // Update in place — no new geometry allocation
        existing.position.set(x, buildingHeight / 2, z);
        existing.scale.y = floors;
        (existing.material as THREE.MeshStandardMaterial).color.set(dto.color);
      } else {
        // One floor unit tall, scaled by floor count
        const geometry = new THREE.BoxGeometry(
          TILE_SIZE * 0.8,
          FLOOR_HEIGHT,
          TILE_SIZE * 0.8
        );
        const material = new THREE.MeshStandardMaterial({ color: dto.color });
        const mesh = new THREE.Mesh(geometry, material);

        mesh.position.set(x, buildingHeight / 2, z);
        mesh.scale.y = floors;
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        // Store file + position for hitTest
        mesh.userData = {
          file: {
            name: dto.name ?? "",
            lines: dto.lines ?? 0,
            functions: dto.functions ?? 0,
            classes: dto.classes ?? 0,
          },
          position: { col: dto.col, row: dto.row },
        };

        this.scene.add(mesh);
        this.buildingMeshes.set(key, mesh);
      }
    }

    this.status = "ready";
    this.renderFrame();
  }

  refresh(): void {
    this.renderFrame();
  }

  // =========================================================================
  // VIEWPORT CONTROLS
  // =========================================================================

  resize(width: number, height: number): void {
    if (!this.camera || !this.renderer) return;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    this.renderFrame();
  }

  zoom(delta: number): void {
    if (!this.camera) return;
    this.camera.position.multiplyScalar(delta > 0 ? 0.9 : 1.1);
    this.renderFrame();
  }

  resetView(): void {
    if (!this.camera) return;
    this.camera.position.set(300, 400, 300);
    this.camera.lookAt(0, 0, 0);
    this.renderFrame();
  }

  // =========================================================================
  // INTERACTION
  // =========================================================================

  hitTest(x: number, y: number): HitTestResult | null {
    if (!this.camera || !this.renderer) return null;

    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((x - rect.left) / rect.width) * 2 - 1,
      -((y - rect.top) / rect.height) * 2 + 1
    );

    this.raycaster.setFromCamera(ndc, this.camera);
    const meshes = Array.from(this.buildingMeshes.values());
    const hits = this.raycaster.intersectObjects(meshes);

    if (hits.length === 0) return null;
    return hits[0].object.userData as HitTestResult;
  }

  // =========================================================================
  // EXPORT
  // =========================================================================

  toImageDataUrl(): string {
    if (!this.renderer || !this.scene || !this.camera) return "";
    this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement.toDataURL("image/png");
  }

  // =========================================================================
  // PRIVATE
  // =========================================================================

  private renderFrame(): void {
    if (!this.renderer || !this.scene || !this.camera) return;
    this.renderer.render(this.scene, this.camera);
  }
}
