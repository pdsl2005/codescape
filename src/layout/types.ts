// Types for wireframe auto layout

export interface BuildingNode {
  id: string; // unique identifier (e.g., class name)
  name: string;
  neighbors: string[]; // ids of related classes
  // Inner/nested class support
  parentClass?: string;     // Parent class if this is an inner class
  innerClasses?: string[];  // Inner classes if this class contains any
}

export interface BuildingPosition {
  col: number; // column (x)
  row: number; // row (y)
  depth?: number; // nesting depth for inner classes (default 0 for top-level)
}

export type LayoutMap = Record<string, BuildingPosition>;
