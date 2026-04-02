import * as THREE from 'three';
import { OrbitControls } from 'https://unpkg.com/three@0.141.0/examples/jsm/controls/OrbitControls.js';
import {
  createLights,
  createGround,
  createGrid,
  createBuildingsFromDTOs
} from "./renderer3.js";

// example DTO list
//const sample_buildings = [
//  { col: 2, row: 3, floors: 4, color: "#3498db" },
//  { col: 5, row: 1, floors: 2, color: "#e74c3c" },
//  { col: 0, row: 9, floors: 10, color: "#ffffff"}
//];

function generateCity(size) {
  const buildings = [];

  for (let col = 0; col < size; col++) {
    for (let row = 0; row < size; row++) {

      // randomly decide if there's a building
      if (Math.random() < 0.8) {
        const floors = Math.floor(Math.random() * 10) + 1;

        buildings.push({
          col,
          row,
          floors
        });
      }
    }
  }

  return buildings;
}

const sample_buildings = generateCity(10);

// scene
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf2f2f2);

// camera
const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
camera.position.set(12, 12, 12);

// renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
document.body.appendChild(renderer.domElement);

// controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(5, 0, 5);

// world
createLights(scene);
createGround(scene, 10);
createGrid(scene, 10, 10);

// buildings
const buildingMeshes = createBuildingsFromDTOs(sample_buildings);

for (const mesh of buildingMeshes) {
  scene.add(mesh);
}

// animate
function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

animate();

// resize
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});