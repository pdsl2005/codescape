import { RendererRegistry } from "./ICityRenderer";
import { CanvasIsoCityRenderer } from "./CanvasIsoCityRenderer";
import { ThreeJsCityRenderer } from "./ThreeJsCityRenderer";
import { CityState, FileData, LayoutPosition } from "./types";
// @ts-ignore
import { setImageBasePath } from "../../media/renderer3.js";

// Declare the VS Code API (available in webview context)
declare function acquireVsCodeApi(): {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};

const vscode = acquireVsCodeApi();

const injectedImagesUri = (window as any).CODESCAPE_IMAGES_URI;
if (injectedImagesUri) {
  setImageBasePath(injectedImagesUri);
}

// ── Setup ──────────────────────────────────────────────────────────────

const container = document.getElementById("city-container");
if (!container) {
  throw new Error("Missing #city-container element in webview HTML");
}

const registry = new RendererRegistry();
registry.register("canvas2d", new CanvasIsoCityRenderer());
registry.register("threejs", new ThreeJsCityRenderer());

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
let currentView: "canvas2d" | "threejs" = "canvas2d";
registry.setActive("canvas2d", container, events);

const toggleBtn = document.getElementById("toggle-view-btn") as HTMLButtonElement | null;
toggleBtn?.addEventListener("click", () => {
  currentView = currentView === "canvas2d" ? "threejs" : "canvas2d";
  registry.setActive(currentView, container, events);
  if (toggleBtn) {
    toggleBtn.textContent = currentView === "canvas2d" ? "Switch to 3D" : "Switch to 2D";
  }
  const newRenderer = registry.getActive();
  if (newRenderer && currentClasses.length > 0) {
    newRenderer.renderCity(parsedClassesToCityState(currentClasses, currentLayout));
  }
  applyTheme(currentTheme);
  vscode.postMessage({ type: "VIEW_CHANGED", payload: currentView });
});

// ── Theme toggle ───────────────────────────────────────────────────────────
let currentTheme: "dark" | "light" = "dark";

const themeBtn = document.getElementById("toggle-theme-btn") as HTMLButtonElement | null;
themeBtn?.addEventListener("click", () => {
  currentTheme = currentTheme === "dark" ? "light" : "dark";
  applyTheme(currentTheme);
});

function applyTheme(theme: "dark" | "light"): void {
  document.body.classList.toggle("cs-light", theme === "light");
  if (themeBtn) {
    themeBtn.textContent = theme === "dark" ? "Light Mode" : "Dark Mode";
  }
  const renderer = registry.getActive();
  if (renderer && "setTheme" in renderer) {
    (renderer as any).setTheme(theme);
  }
}

// ── State ──────────────────────────────────────────────────────────────

// Maintained so PARTIAL_STATE can merge into it and re-render
let currentClasses: any[] = [];
let currentLayout: Record<string, LayoutPosition> | undefined;

// ── Helpers ────────────────────────────────────────────────────────────

/**
 * Maps the extension's ParsedClassInfo[] (from FULL_STATE) to the
 * renderer's CityState. Each ParsedClassInfo represents one class,
 * so classes is always 1; methods map to functions; Loc maps to lines.
 */
function parsedClassesToCityState(
  classes: any[],
  layout?: Record<string, LayoutPosition>
): CityState {
  const files: FileData[] = classes.map((cls) => ({
    name: cls.Classname ?? "",
    lines: cls.Loc ?? 0,
    functions: cls.Methods?.length ?? 0,
    classes: 1,
    uml: {
      name: cls.Classname ?? "",
      fields: (cls.Fields ?? []).map((f: any) => `${f.name}: ${f.type}`),
      methods: (cls.Methods ?? []).map((m: any) =>
        `${m.name}(${(m.parameters ?? []).join(", ")}): ${m.returnType ?? "void"}`),
    },
  }));
  return { files, layout };
}

// ── Message listener ───────────────────────────────────────────────────

window.addEventListener("message", (event) => {
  const msg = event.data;
  const renderer = registry.getActive();
  if (!renderer) { return; }

  switch (msg.type) {
    case "FULL_STATE": {
      // Replace full state and re-render
      currentClasses = msg.payload.classes ?? [];
      currentLayout = msg.payload.layout;
      renderer.renderCity(parsedClassesToCityState(currentClasses, currentLayout));
      break;
    }

    case "PARTIAL_STATE": {
      // Merge changes into currentClasses, then re-render
      const { changed = [], related = [], removed = [] } = msg.payload;

      // Remove deleted classes
      currentClasses = currentClasses.filter(
        (cls) => !removed.includes(cls.Classname)
      );

      // Apply changed + related updates
      const classMap = new Map(
        currentClasses.map((cls) => [cls.Classname, cls])
      );
      [...changed, ...related].forEach((cls) =>
        classMap.set(cls.Classname, cls)
      );
      currentClasses = Array.from(classMap.values());

      currentLayout = msg.payload.layout;
      renderer.renderCity(parsedClassesToCityState(currentClasses, currentLayout));
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
