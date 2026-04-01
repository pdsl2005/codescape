import { RendererRegistry } from "./ICityRenderer";
import { CanvasIsoCityRenderer } from "./CanvasIsoCityRenderer";
// import { ThreeJsCityRenderer } from "./ThreeJsCityRenderer"; // SCRUM-172
import { CityState, FileData } from "./types";

// Declare the VS Code API (available in webview context)
declare function acquireVsCodeApi(): {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};

const vscode = acquireVsCodeApi();

// ── Setup ──────────────────────────────────────────────────────────────

const container = document.getElementById("city-container");
if (!container) {
  throw new Error("Missing #city-container element in webview HTML");
}

const registry = new RendererRegistry();
registry.register("canvas2d", new CanvasIsoCityRenderer());
// registry.register("threejs", new ThreeJsCityRenderer()); // SCRUM-172

const events = {
  onBuildingClick: (result: unknown) => {
    vscode.postMessage({ type: "BUILDING_CLICK", payload: result });
  },
  onReady: () => {
    // Handshake: tell extension we are ready so it sends FULL_STATE
    vscode.postMessage({ type: "READY" });
  },
};

// Start with Canvas 2D as default
registry.setActive("canvas2d", container, events);

// ── Helpers ────────────────────────────────────────────────────────────

/**
 * Maps the extension's ParsedClassInfo[] (from FULL_STATE) to the
 * renderer's CityState. Each ParsedClassInfo represents one class,
 * so classes is always 1; methods map to functions; Loc maps to lines.
 */
function parsedClassesToCityState(classes: any[]): CityState {
  const files: FileData[] = classes.map((cls) => ({
    name: cls.Classname ?? "",
    lines: cls.Loc ?? 0,
    functions: cls.Methods?.length ?? 0,
    classes: 1,
  }));
  return { files };
}

// ── Message listener ───────────────────────────────────────────────────

window.addEventListener("message", (event) => {
  const msg = event.data;
  const renderer = registry.getActive();
  if (!renderer) return;

  switch (msg.type) {
    case "FULL_STATE": {
      // Extension sends { classes: ParsedClassInfo[], status: string }
      const state: CityState = parsedClassesToCityState(msg.payload.classes ?? []);
      renderer.renderCity(state);
      break;
    }

    case "SET_VIEW":
      registry.setActive(msg.payload, container, events);
      vscode.postMessage({ type: "VIEW_CHANGED", payload: msg.payload });
      break;

    case "RESET_VIEW":
      renderer.resetView();
      break;

    case "EXPORT_PNG": {
      const dataUrl = renderer.toImageDataUrl();
      vscode.postMessage({ type: "EXPORT_PNG", payload: { dataUrl } });
      break;
    }
  }
});
