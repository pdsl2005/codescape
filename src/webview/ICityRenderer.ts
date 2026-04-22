// src/webview/ICityRenderer.ts
// SCRUM-168 — Renderer interface contract + registry

import {
  CityState,
  RendererStatus,
  RendererEvents,
  HitTestResult,
  ViewMode,
} from "./types";

/**
 * ICityRenderer — the contract that both CanvasRenderer and ThreeJsRenderer
 * must implement. The webview orchestrator only talks to this interface,
 * never to Canvas or Three.js directly.
 *
 * Heewon/Livia: your ThreeJsCityRenderer (SCRUM-172) implements this
 * so it's a drop-in swap for the Canvas renderer.
 */
export interface ICityRenderer {
  /** Current lifecycle status. */
  readonly status: RendererStatus;

  // --- Lifecycle -----------------------------------------------------------

  /**
   * Initialize the renderer. Called once when the view mode is selected.
   * Set up the drawing surface (canvas 2D context, Three.js scene/camera/
   * renderer, etc.) inside the given container.
   *
   * @param container  The DOM element to render into (typically a <div>).
   * @param events     Optional callbacks the renderer should invoke.
   */
  init(container: HTMLElement, events?: RendererEvents): void;

  /**
   * Tear down the renderer. Remove DOM elements, cancel animation frames,
   * dispose Three.js geometries/materials, etc.
   */
  dispose(): void;

  // --- Rendering -----------------------------------------------------------

  /**
   * Render the full city from the given state.
   * Called when new AST_DATA arrives from the extension.
   */
  renderCity(state: CityState): void;

  /**
   * Redraw without new data (after resize, zoom, or pan).
   */
  refresh(): void;

  // --- Viewport Controls ---------------------------------------------------

  /**
   * Handle a resize event. Update internal dimensions and redraw.
   */
  resize(width: number, height: number): void;

  /**
   * Zoom by a delta. Positive = zoom in, negative = zoom out.
   */
  zoom(delta: number): void;

  /**
   * Reset the viewport to the default zoom/pan state.
   */
  resetView(): void;

  // --- Interaction ---------------------------------------------------------

  /**
   * Hit-test a screen coordinate. Returns the building at (x, y) or null.
   */
  hitTest(x: number, y: number): HitTestResult | null;

  // --- Export --------------------------------------------------------------

  /**
   * Export the current view as a PNG data URL.
   */
  toImageDataUrl(): string;
}

/**
 * RendererRegistry — manages switching between view modes at runtime.
 *
 * Usage:
 *   const registry = new RendererRegistry();
 *   registry.register("canvas2d", new CanvasIsoCityRenderer());
 *   registry.register("threejs",  new ThreeJsCityRenderer());
 *   registry.setActive("canvas2d", containerEl, events);
 */
export class RendererRegistry {
  private renderers = new Map<ViewMode, ICityRenderer>();
  private active: ICityRenderer | null = null;
  private activeMode: ViewMode | null = null;

  register(mode: ViewMode, renderer: ICityRenderer): void {
    this.renderers.set(mode, renderer);
  }

  setActive(
    mode: ViewMode,
    container: HTMLElement,
    events?: RendererEvents
  ): ICityRenderer {
    // Dispose the old renderer if switching
    if (this.active && this.activeMode !== mode) {
      this.active.dispose();
    }

    const renderer = this.renderers.get(mode);
    if (!renderer) {
      throw new Error(`No renderer registered for mode "${mode}"`);
    }

    if (renderer !== this.active || renderer.status !== "ready") {
      renderer.init(container, events);
    }
    this.active = renderer;
    this.activeMode = mode;
    return renderer;
  }

  getActive(): ICityRenderer | null {
    return this.active;
  }

  getActiveMode(): ViewMode | null {
    return this.activeMode;
  }
}
