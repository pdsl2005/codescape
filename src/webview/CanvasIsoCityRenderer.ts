// src/webview/CanvasIsoCityRenderer.ts
// SCRUM-169 — Existing Canvas rendering refactored behind ICityRenderer
//
// This wraps the existing renderer.js drawing functions into a class.
// No visual/behavioral changes — just reorganized so the orchestrator
// can swap it with the Three.js renderer.

import { ICityRenderer } from "./ICityRenderer";
import {
  CityState,
  FileData,
  GridPosition,
  HitTestResult,
  RendererStatus,
  RendererEvents,
  BuildingDTO,
  filesToBuildingDTOs,
} from "./types";
// @ts-ignore
import { drawUmlBox } from "./uml.js";

export class CanvasIsoCityRenderer implements ICityRenderer {
  status: RendererStatus = "uninitialized";

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private container: HTMLElement | null = null;
  private events: RendererEvents = {};

  // City state
  private buildings: BuildingDTO[] = [];

  // Name of the currently selected building for UML overlay (null = none)
  private selectedBuildingName: string | null = null;

  private TILE_L = 50;
  private gridColor = "#2c2c2c";

  setTheme(theme: "dark" | "light"): void {
    this.gridColor = theme === "light" ? "#cccccc" : "#2c2c2c";
    this.refresh();
  }

  // Viewport transform — single source of truth for pan + zoom (Heewon)
  private vt = { x: 0, y: 100, scale: 1 };

  // For panning
  private isPanning = false;
  private prevX = 0;
  private prevY = 0;

  // Building bounding boxes for hit-testing
  private buildingBounds: Array<{
    dto: BuildingDTO;
    position: GridPosition;
    screenX: number;
    screenY: number;
    width: number;
    height: number;
  }> = [];

  // UML scroll state — world coordinates match drawUmlBox return values
  private umlScrollOffset: number = 0;
  private umlLastBounds: {
    x: number;
    y: number;
    width: number;
    height: number;
    totalHeight: number;
  } | null = null;

  // Cube image for PNG-based rendering (matches existing renderer.js)
  private cubeImg: HTMLImageElement | null = null;

  private hasInitialFit = false;

  // Bound event handlers (so we can remove them in dispose)
  private boundOnResize: (() => void) | null = null;
  private boundOnWheel: ((e: WheelEvent) => void) | null = null;
  private boundOnMouseDown: ((e: MouseEvent) => void) | null = null;
  private boundOnMouseUp: ((e: MouseEvent) => void) | null = null;
  private boundOnMouseMove: ((e: MouseEvent) => void) | null = null;
  private boundOnClick: ((e: MouseEvent) => void) | null = null;
  private boundOnKeyDown: ((e: KeyboardEvent) => void) | null = null;

  // =========================================================================
  // LIFECYCLE
  // =========================================================================

  init(container: HTMLElement, events?: RendererEvents): void {
    this.container = container;
    this.events = events ?? {};

    // Create canvas
    this.canvas = document.createElement("canvas");
    this.canvas.id = "cityCanvas";
    this.canvas.classList.add("canvas-2d");
    container.appendChild(this.canvas);

    this.ctx = this.canvas.getContext("2d")!;

    // Load cube image (used by drawIsoBuilding for PNG-based cubes)
    this.cubeImg = new Image();
    this.cubeImg.src = "./images/isoCube.png";

    // Set initial size
    this.canvas.width = container.clientWidth || window.innerWidth;
    this.canvas.height = container.clientHeight || window.innerHeight;
    this.vt = { x: this.canvas.width / 2, y: 100, scale: 1 };
    this.fitToView();

    // Bind event listeners
    this.bindEvents();

    this.status = "ready";
    this.events.onReady?.();
  }

  dispose(): void {
    this.unbindEvents();

    if (this.canvas && this.container) {
      this.container.removeChild(this.canvas);
    }

    this.canvas = null;
    this.ctx = null;
    this.container = null;
    this.cubeImg = null;
    this.buildings = [];
    this.buildingBounds = [];
    this.selectedBuildingName = null;
    this.hasInitialFit = false;
    this.status = "disposed";
  }

  // =========================================================================
  // RENDERING
  // =========================================================================

  renderCity(state: CityState): void {
    this.buildings = filesToBuildingDTOs(state.files, state.layout, state.colors);
    if (!this.hasInitialFit) {
      this.fitToView();
      this.hasInitialFit = true;
    }
    this.refresh();
  }

  refresh(): void {
    if (!this.ctx || !this.canvas) return;
    this.status = "rendering";

    const ctx = this.ctx;

    // Apply viewport transform — pan + zoom anchored to cursor (Heewon)
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(this.vt.scale, 0, 0, this.vt.scale, this.vt.x, this.vt.y);

    // Calculate grid size based on buildings
    const { cols, rows } = this.calculateGridSize();

    // Draw grid — offset is 0,0 since vt handles positioning
    this.drawIsoGrid(ctx, rows, cols, this.TILE_L, 0, 0);

    // Sort buildings by depth (back to front)
    const sorted = [...this.buildings].sort(
      (a, b) => (a.col + a.row) - (b.col + b.row)
    );

    // Draw buildings and record bounding boxes for hit-testing
    this.buildingBounds = [];
    for (const dto of sorted) {
      const { screenX, screenY } = this.placeIsoBuilding(
        ctx, dto.col, dto.row, dto.floors, dto.color
      );

      this.buildingBounds.push({
        dto,
        position: { col: dto.col, row: dto.row },
        screenX,
        screenY,
        width: this.TILE_L,
        height: dto.floors * (this.TILE_L / 4),
      });
    }

    // Draw UML overlay for selected building
    this.umlLastBounds = null;
    if (this.selectedBuildingName) {
      const bound = this.buildingBounds.find(b => b.dto.name === this.selectedBuildingName);
      if (bound?.dto.uml) {
        const umlX = bound.screenX - this.TILE_L / 2;
        const preferredUmlY = bound.screenY - bound.height - 20;
        // Clamp the UML so its top stays in the visible canvas — otherwise
        // tall skyscrapers push the top of the label above the viewport.
        const topMarginScreen = 10;
        const minUmlY = (topMarginScreen - this.vt.y) / this.vt.scale;
        const umlY = Math.max(preferredUmlY, minUmlY);
        const maxHeight = (this.canvas.height * 0.6) / this.vt.scale;
        this.umlLastBounds = drawUmlBox(ctx, umlX, umlY, bound.dto.uml, {
          maxHeight,
          scrollOffset: this.umlScrollOffset,
        });
      }
    }

    this.status = "ready";
  }

  // =========================================================================
  // VIEWPORT CONTROLS
  // =========================================================================

  resize(width: number, height: number): void {
    if (!this.canvas) return;
    this.canvas.width = width;
    this.canvas.height = height;
    this.vt.x = width / 2;
    this.refresh();
  }

  private fitToView(): void {
    if (!this.canvas) return;
    const { cols, rows } = this.calculateGridSize();
    const maxFloors = this.buildings.length > 0
      ? Math.max(...this.buildings.map(b => b.floors))
      : 1;

    // Isometric diamond for a rectangular (cols × rows) grid:
    //   horizontal span = (cols-1 + rows-1) * TILE_L / 2
    //   vertical span   = (cols-1 + rows-1) * TILE_L / 4 + buildingH
    const diag = (cols - 1) + (rows - 1);
    const gridW = diag * this.TILE_L / 2;
    const buildingH = maxFloors * (this.TILE_L / 2);
    const gridH = diag * this.TILE_L / 4 + buildingH;

    const padding = 16;
    const availW = this.canvas.width - padding * 2;
    const availH = this.canvas.height - padding * 2;
    const scale = Math.min(
      gridW > 0 ? availW / gridW : 1,
      gridH > 0 ? availH / gridH : 1,
      1.0,
    );

    // Horizontal iso-centre of the rectangular grid
    // (rightmost corner at col=cols-1,row=0; leftmost at col=0,row=rows-1).
    const isoCentreX = (cols - rows) * this.TILE_L / 4;

    this.vt = {
      x: this.canvas.width / 2 - isoCentreX * scale,
      y: padding + buildingH * scale,
      scale,
    };
  }

  zoom(delta: number): void {
    const newScale = Math.max(0.2, Math.min(4, this.vt.scale + delta));
    this.vt.scale = newScale;
    this.refresh();
  }

  resetView(): void {
    this.fitToView();
    this.refresh();
  }

  // =========================================================================
  // INTERACTION
  // =========================================================================

  hitTest(x: number, y: number): HitTestResult | null {
    // Inverse of setTransform(scale, 0, 0, scale, vt.x, vt.y)
    const adjX = (x - this.vt.x) / this.vt.scale;
    const adjY = (y - this.vt.y) / this.vt.scale;

    // Check in reverse order (last drawn = visually on top)
    for (let i = this.buildingBounds.length - 1; i >= 0; i--) {
      const b = this.buildingBounds[i];
      if (
        adjX >= b.screenX - b.width / 2 &&
        adjX <= b.screenX + b.width / 2 &&
        adjY >= b.screenY - b.height &&
        adjY <= b.screenY
      ) {
        // Reconstruct FileData from the DTO
        const file: FileData = {
          name: b.dto.name ?? "",
          lines: b.dto.lines ?? 0,
          functions: b.dto.functions ?? 0,
          classes: b.dto.classes ?? 0,
          uml: b.dto.uml,
        };
        return { file, position: b.position };
      }
    }
    return null;
  }

  // =========================================================================
  // EXPORT
  // =========================================================================

  toImageDataUrl(): string {
    return this.canvas?.toDataURL("image/png") ?? "";
  }

  // =========================================================================
  // PRIVATE — Drawing functions (moved from renderer.js)
  // =========================================================================

  private calculateGridSize(): { cols: number; rows: number } {
    let maxCol = 0;
    let maxRow = 0;
    for (const b of this.buildings) {
      if (b.col > maxCol) maxCol = b.col;
      if (b.row > maxRow) maxRow = b.row;
    }
    return {
      cols: Math.max(maxCol + 1, 10),
      rows: Math.max(maxRow + 1, 10),
    };
  }

  /** Draw the isometric diamond grid. From renderer.js drawIsoGrid(). */
  private drawIsoGrid(
    ctx: CanvasRenderingContext2D,
    rows: number, cols: number,
    size: number, offsetX: number, offsetY: number
  ): void {
    ctx.strokeStyle = this.gridColor;
    const tileW = size;
    const tileH = size / 2;

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const isoX = (col - row) * tileW / 2 + offsetX;
        const isoY = (col + row) * tileH / 2 + offsetY;

        ctx.beginPath();
        ctx.moveTo(isoX, isoY);
        ctx.lineTo(isoX + tileW / 2, isoY + tileH / 2);
        ctx.lineTo(isoX, isoY + tileH);
        ctx.lineTo(isoX - tileW / 2, isoY + tileH / 2);
        ctx.closePath();
        ctx.stroke();
      }
    }
  }

  /** Color shading for 3D effect. From renderer.js shade(). */
  private shade(color: string, percent: number): string {
    const num = parseInt(color.slice(1), 16);
    const amt = Math.round(2.55 * percent);
    const R = (num >> 16) + amt;
    const G = ((num >> 8) & 0x00ff) + amt;
    const B = (num & 0x0000ff) + amt;
    return (
      "#" +
      (
        0x1000000 +
        (R < 255 ? (R < 1 ? 0 : R) : 255) * 0x10000 +
        (G < 255 ? (G < 1 ? 0 : G) : 255) * 0x100 +
        (B < 255 ? (B < 1 ? 0 : B) : 255)
      ).toString(16).slice(1)
    );
  }

  /** Draw a single isometric cube. From renderer.js drawIsoCube(). */
  private drawIsoCube(
    ctx: CanvasRenderingContext2D,
    x: number, y: number,
    width: number, height: number,
    color: string
  ): void {
    const depthX = width / 2;
    const depthY = width / 4;

    const bottom = { x: x, y: y };
    const right = { x: x + depthX, y: y - depthY };
    const top = { x: x, y: y - 2 * depthY };
    const left = { x: x - depthX, y: y - depthY };

    const bottomU = { x: bottom.x, y: bottom.y - height };
    const rightU = { x: right.x, y: right.y - height };
    const topU = { x: top.x, y: top.y - height };
    const leftU = { x: left.x, y: left.y - height };

    // Left face
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(left.x, left.y);
    ctx.lineTo(bottom.x, bottom.y);
    ctx.lineTo(bottomU.x, bottomU.y);
    ctx.lineTo(leftU.x, leftU.y);
    ctx.closePath();
    ctx.fill();

    // Right face
    ctx.fillStyle = this.shade(color, -20);
    ctx.beginPath();
    ctx.moveTo(right.x, right.y);
    ctx.lineTo(bottom.x, bottom.y);
    ctx.lineTo(bottomU.x, bottomU.y);
    ctx.lineTo(rightU.x, rightU.y);
    ctx.closePath();
    ctx.fill();

    // Top face
    ctx.fillStyle = this.shade(color, 20);
    ctx.beginPath();
    ctx.moveTo(topU.x, topU.y);
    ctx.lineTo(rightU.x, rightU.y);
    ctx.lineTo(bottomU.x, bottomU.y);
    ctx.lineTo(leftU.x, leftU.y);
    ctx.closePath();
    ctx.fill();
  }

  /**
   * Draw a cube using the PNG image. From renderer.js drawIsoCubePNG().
   * Falls back to drawIsoCube if the image hasn't loaded.
   */
  private drawIsoCubePNG(
    ctx: CanvasRenderingContext2D,
    x: number, y: number,
    tileSize: number,
    color: string
  ): void {
    if (this.cubeImg && this.cubeImg.complete && this.cubeImg.naturalWidth > 0) {
      const scale = 1.45;
      const size = tileSize * scale;
      ctx.drawImage(this.cubeImg, x - size / 2, y - size + 12, size, size);
    } else {
      this.drawIsoCube(ctx, x, y, tileSize, tileSize, color);
    }
  }

  /** Stack cubes into a building. From renderer.js drawIsoBuilding(). */
  private drawIsoBuilding(
    ctx: CanvasRenderingContext2D,
    baseX: number, baseY: number,
    floors: number, size: number, color: string
  ): void {
    for (let i = 0; i <= floors; i++) {
      this.drawIsoCubePNG(ctx, baseX, baseY - i * size / 2, size, color);
    }
  }

  /** Place a building on the isometric grid. From main-2.js placeIsoBuilding(). */
  private placeIsoBuilding(
    ctx: CanvasRenderingContext2D,
    col: number, row: number,
    floors: number, color: string
  ): { screenX: number; screenY: number } {
    // Offset is 0,0 — vt transform handles positioning
    const isoX = (col - row) * this.TILE_L / 2;
    const isoY = (col + row) * this.TILE_L / 4;

    this.drawIsoBuilding(ctx, isoX, isoY + this.TILE_L / 2, floors - 1, this.TILE_L, color);

    return { screenX: isoX, screenY: isoY };
  }

  // =========================================================================
  // PRIVATE — Event binding
  // =========================================================================

  private bindEvents(): void {
    if (!this.canvas) return;

    this.boundOnResize = () => {
      if (this.container) {
        this.resize(
          this.container.clientWidth || window.innerWidth,
          this.container.clientHeight || window.innerHeight
        );
      }
    };

    // Cursor-anchored zoom (Heewon)
    this.boundOnWheel = (e: WheelEvent) => {
      e.preventDefault();

      // Intercept scroll when cursor is over a scrollable UML box
      if (this.umlLastBounds && this.selectedBuildingName && this.canvas) {
        const rect = this.canvas.getBoundingClientRect();
        const worldX = (e.clientX - rect.left - this.vt.x) / this.vt.scale;
        const worldY = (e.clientY - rect.top - this.vt.y) / this.vt.scale;
        const b = this.umlLastBounds;
        const overUml =
          worldX >= b.x && worldX <= b.x + b.width &&
          worldY >= b.y && worldY <= b.y + b.height;
        if (overUml && b.totalHeight > b.height) {
          const maxOffset = b.totalHeight - b.height;
          this.umlScrollOffset = Math.max(
            0,
            Math.min(maxOffset, this.umlScrollOffset + e.deltaY / this.vt.scale)
          );
          this.refresh();
          return;
        }
      }

      const oldScale = this.vt.scale;
      const newScale = Math.max(0.2, Math.min(4, oldScale + e.deltaY * -0.0015));
      this.vt.x = e.clientX - (e.clientX - this.vt.x) * (newScale / oldScale);
      this.vt.y = e.clientY - (e.clientY - this.vt.y) * (newScale / oldScale);
      this.vt.scale = newScale;
      this.refresh();
    };

    this.boundOnMouseMove = (e: MouseEvent) => {
      if (!this.isPanning) return;
      this.vt.x += e.clientX - this.prevX;
      this.vt.y += e.clientY - this.prevY;
      this.prevX = e.clientX;
      this.prevY = e.clientY;
      this.refresh();
    };

    this.boundOnMouseDown = (e: MouseEvent) => {
      this.isPanning = true;
      this.prevX = e.clientX;
      this.prevY = e.clientY;
    };

    this.boundOnMouseUp = () => {
      this.isPanning = false;
    };

    this.boundOnClick = (e: MouseEvent) => {
      const result = this.hitTest(e.clientX, e.clientY);
      if (result) {
        // Toggle: clicking the same building closes it
        this.selectedBuildingName =
          this.selectedBuildingName === result.file.name ? null : result.file.name;
        this.umlScrollOffset = 0;
        this.refresh();
        this.events.onBuildingClick?.(result);
      } else {
        this.selectedBuildingName = null;
        this.umlScrollOffset = 0;
        this.refresh();
      }
    };

    this.boundOnKeyDown = (e: KeyboardEvent) => {
      if (e.key === "r" || e.key === "R") {
        this.resetView();
      }
    };

    window.addEventListener("resize", this.boundOnResize);
    this.canvas.addEventListener("wheel", this.boundOnWheel, { passive: false });
    this.canvas.addEventListener("mousedown", this.boundOnMouseDown);
    this.canvas.addEventListener("mouseup", this.boundOnMouseUp);
    this.canvas.addEventListener("mousemove", this.boundOnMouseMove);
    this.canvas.addEventListener("click", this.boundOnClick);
    window.addEventListener("keydown", this.boundOnKeyDown);
  }

  private unbindEvents(): void {
    if (this.boundOnResize) window.removeEventListener("resize", this.boundOnResize);
    if (this.canvas) {
      if (this.boundOnWheel) this.canvas.removeEventListener("wheel", this.boundOnWheel);
      if (this.boundOnMouseDown) this.canvas.removeEventListener("mousedown", this.boundOnMouseDown);
      if (this.boundOnMouseUp) this.canvas.removeEventListener("mouseup", this.boundOnMouseUp);
      if (this.boundOnMouseMove) this.canvas.removeEventListener("mousemove", this.boundOnMouseMove);
      if (this.boundOnClick) this.canvas.removeEventListener("click", this.boundOnClick);
    }
    if (this.boundOnKeyDown) window.removeEventListener("keydown", this.boundOnKeyDown);
  }
}
