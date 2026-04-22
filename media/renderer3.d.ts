import type * as THREE from 'three';
import type { BuildingDTO } from '../src/webview/types.js';

export function createLights(scene: THREE.Scene): THREE.Object3D[];
export function createGround(scene: THREE.Scene, cols: number, rows: number): THREE.Object3D;
export function createGrid(scene: THREE.Scene, cols: number, rows: number): THREE.Object3D;
export function createBuildingFromDTO(dto: BuildingDTO, texturePath?: string): THREE.Object3D;
export function disposeTextureCache(): void;
