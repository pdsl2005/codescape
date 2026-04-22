// src/webview/types.ts
// SCRUM-168 — Shared data types for all renderers

/** Represents a single parsed Java file / class in the city. */
export interface FileData {
  name: string;        // e.g. "App.java"
  lines: number;       // total lines of code
  functions: number;   // method count
  classes: number;     // class count
  uml?: UmlClassData;  // populated from parser if available
}

/** UML class data shown when a building is clicked. */
export interface UmlClassData {
  name: string;        // e.g. "App"
  fields: string[];    // e.g. ["count: int", "name: String"]
  methods: string[];   // e.g. ["getName()", "setName()"]
}

/** Full city state passed from the extension to the webview. */
export interface CityState {
  files: FileData[];
  layout?: Record<string, LayoutPosition>;
}

/** Grid position for a building. */
export interface GridPosition {
  col: number;
  row: number;
}

/** Grid position from the backend layout algorithm. */
export interface LayoutPosition {
  col: number;
  row: number;
  depth?: number;
}

/** Result of a hit-test (e.g. user clicked on a building). */
export interface HitTestResult {
  file: FileData;
  position: GridPosition;
}

/** Lifecycle status of a renderer. */
export type RendererStatus = "uninitialized" | "ready" | "rendering" | "disposed";

/** Events the renderer can emit back to the orchestrator. */
export interface RendererEvents {
  onBuildingClick?: (result: HitTestResult) => void;
  onBuildingHover?: (result: HitTestResult | null) => void;
  onReady?: () => void;
}

/** Building DTO used by the 3D renderer (matches Heewon's format). */
export interface BuildingDTO {
  col: number;
  row: number;
  floors: number;
  color: string;
  name?: string;       // original file name, for hit-test results
  lines?: number;
  functions?: number;
  classes?: number;
  uml?: UmlClassData;  // passed through from FileData for UML label rendering
}

const COLOR_PALETTE = [
  "#598BAF", "#8B5CF6", "#10B981", "#F59E0B",
  "#EF4444", "#14B8A6", "#6366F1", "#EC4899",
];

/** Convert FileData[] to BuildingDTO[] for renderers that need grid positions. */
export function filesToBuildingDTOs(
  files: FileData[],
  layout?: Record<string, LayoutPosition>
): BuildingDTO[] {
  return files.map((file, i) => {
    const pos = layout?.[file.name];
    return {
      col: pos?.col ?? i % 10,
      row: pos?.row ?? Math.floor(i / 10),
      floors: file.functions + file.classes,
      color: COLOR_PALETTE[i % COLOR_PALETTE.length],
      name: file.name,
      lines: file.lines,
      functions: file.functions,
      classes: file.classes,
      uml: file.uml,
    };
  });
}

/** View mode identifier. */
export type ViewMode = "canvas2d" | "threejs";
