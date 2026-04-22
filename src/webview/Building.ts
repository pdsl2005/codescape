import * as THREE from 'three';
import { BuildingDTO, UmlClassData } from './types';
// @ts-ignore
import { createBuildingFromDTO } from '../../media/renderer3.js';

export class Building {
  readonly group: THREE.Object3D;
  readonly name: string;
  readonly floors: number;
  readonly lines: number;
  readonly functions: number;
  readonly classes: number;
  readonly uml?: UmlClassData;

  constructor(group: THREE.Object3D, dto: BuildingDTO) {
    this.group = group;
    this.name = dto.name ?? '';
    this.floors = dto.floors;
    this.lines = dto.lines ?? 0;
    this.functions = dto.functions ?? 0;
    this.classes = dto.classes ?? 1;
    this.uml = dto.uml;
  }

  get buildingType(): 'house' | 'apartment' | 'skyscraper' {
    if (this.floors <= 2) { return 'house'; }
    if (this.floors <= 6) { return 'apartment'; }
    return 'skyscraper';
  }

  needsRebuild(dto: BuildingDTO): boolean {
    return this.floors !== dto.floors || this.lines !== dto.lines;
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
  create(dto: BuildingDTO): Building {
    const group = createBuildingFromDTO(dto);
    return new Building(group, dto);
  }
}
