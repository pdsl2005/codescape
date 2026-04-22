import * as THREE from 'three';
import { OrbitControls } from 'https://unpkg.com/three@0.141.0/examples/jsm/controls/OrbitControls.js';
import {
  createLights,
  createGround,
  createGrid,
  createBuildingsFromDTOs
} from "./renderer3.js";
import { CSS2DRenderer } from 'https://unpkg.com/three@0.141.0/examples/jsm/renderers/CSS2DRenderer.js';


// example DTO list
//const sample_buildings = [
//  { col: 2, row: 3, floors: 4, color: "#3498db" },
//  { col: 5, row: 1, floors: 2, color: "#e74c3c" },
//  { col: 0, row: 9, floors: 10, color: "#ffffff"}
//];

// size for grid 
const SIZE = 10;

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

// uml label renderer
const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(window.innerWidth, window.innerHeight);
labelRenderer.domElement.style.position = "absolute";
labelRenderer.domElement.style.top = "0";
labelRenderer.domElement.style.left = "0";
labelRenderer.domElement.style.pointerEvents = "none";
labelRenderer.domElement.style.zIndex = "10";
document.body.appendChild(labelRenderer.domElement);

// controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(5, 0, 5);

// initial setting for reset
const initialCameraPosition = new THREE.Vector3(12, 12, 12);
const initialTarget = new THREE.Vector3(5, 0, 5);

// world
createLights(scene);
createGround(scene, SIZE);
createGrid(scene, SIZE, SIZE);

// buildings
const buildingMeshes = createBuildingsFromDTOs(sample_buildings);

for (const mesh of buildingMeshes) {
  scene.add(mesh);
}

// click to open uml 
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let selectedBuilding = null;
let openLabel = null;

function findBuildingRoot(object) {
  let current = object;

  while (current) {
    if (current.userData && current.userData.isBuilding) {
      return current;
    }
    current = current.parent;
  }

  return null;
}

function closeCurrentUml() {
  if (openLabel) {
    openLabel.visible = false;
    openLabel = null;
  }
  selectedBuilding = null;
}

function openUmlFor(building) {
  if (!building || !building.userData || !building.userData.umlLabel) {
    return;
  }

  building.userData.umlLabel.visible = true;
  openLabel = building.userData.umlLabel;
  selectedBuilding = building;
}

function onSceneClick(event) {
  const rect = renderer.domElement.getBoundingClientRect();

  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);

  const intersects = raycaster.intersectObjects(buildingMeshes, true);

  if (intersects.length === 0) {
    closeCurrentUml();
    return;
  }

  const clickedBuilding = findBuildingRoot(intersects[0].object);

  if (!clickedBuilding) {
    closeCurrentUml();
    return;
  }

  if (selectedBuilding === clickedBuilding) {
    closeCurrentUml();
    return;
  }

  closeCurrentUml();
  openUmlFor(clickedBuilding);
}

renderer.domElement.addEventListener("click", onSceneClick);
// animate
function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
}

animate();

// resize
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  labelRenderer.setSize(window.innerWidth, window.innerHeight);
});

// reset - r/R button
window.addEventListener("keydown", (event) => {
  if (event.key === "r" || event.key === "R") {
    camera.position.copy(initialCameraPosition);
    controls.target.copy(initialTarget);
    controls.update();
  }
});