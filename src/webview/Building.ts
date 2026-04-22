import * as THREE from 'three';
import { BuildingDTO, UmlClassData } from './types';
// @ts-ignore
import { createBuildingFromDTO, updateUmlLabel } from '../../media/renderer3.js';

export type BuildingType = 'house' | 'apartment' | 'skyscraper';

export class Building {
  readonly group: THREE.Object3D;
  readonly name: string;
  readonly floors: number;
  readonly lines: number;
  readonly functions: number;
  readonly classes: number;
  readonly uml?: UmlClassData;
  readonly texturePath: string;

  constructor(group: THREE.Object3D, dto: BuildingDTO) {
    this.group = group;
    this.name = dto.name ?? '';
    this.floors = dto.floors;
    this.lines = dto.lines ?? 0;
    this.functions = dto.functions ?? 0;
    this.classes = dto.classes ?? 1;
    this.uml = dto.uml;
    this.texturePath = (group.userData as { texturePath?: string }).texturePath ?? '';
  }

  static typeFromFloors(floors: number): BuildingType {
    if (floors <= 2) { return 'house'; }
    if (floors <= 6) { return 'apartment'; }
    return 'skyscraper';
  }

  get buildingType(): BuildingType {
    return Building.typeFromFloors(this.floors);
  }

  needsRebuild(dto: BuildingDTO): boolean {
    return this.floors !== dto.floors;
  }

  syncTransform(dto: BuildingDTO): void {
    this.group.position.set(dto.col, 0, dto.row);
    const { umlLabel, isBuilding } = this.group.userData as Record<string, unknown>;
    this.group.userData = { ...dto, isBuilding, umlLabel, texturePath: this.texturePath };
    if (umlLabel) {
      updateUmlLabel(umlLabel as { element: HTMLElement; position: { set(x: number, y: number, z: number): void } }, dto);
    }
  }

  texturePathForRebuild(dto: BuildingDTO): string | undefined {
    return this.buildingType === Building.typeFromFloors(dto.floors)
      ? this.texturePath
      : undefined;
  }

  dispose(): void {
    this.group.traverse((child) => {
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
}

export class BuildingFactory {
  create(dto: BuildingDTO, texturePath?: string): Building {
    const group = createBuildingFromDTO(dto, texturePath);
    return new Building(group, dto);
  }
}
