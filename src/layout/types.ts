// Types for wireframe auto layout

export interface BuildingNode {
  id: string; // unique identifier (e.g., class name)
  name: string;
  neighbors: string[]; // ids of related classes
}

export interface BuildingPosition {
  col: number; // column (x)
  row: number; // row (y)
}

export type LayoutMap = Record<string, BuildingPosition>;
