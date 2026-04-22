import * as THREE from 'three';
import { CSS2DObject } from 'https://unpkg.com/three@0.141.0/examples/jsm/renderers/CSS2DRenderer.js';

let _imageBase = './images';

export function setImageBasePath(base) {
  _imageBase = base.replace(/\/$/, '');
}

function img(filename) {
  return [_imageBase, filename].join('/');
}

function houseTextures() {
  return [img('house.png'), img('house2.png'), img('house3.png')];
}

function apartmentTextures() {
  return [img('apt.png'), img('apt2.png'), img('apt3.png'), img('apt4.png'), img('apt5.png')];
}

function skyscraperTextures() {
  return [
    img('skyscraper.png'), img('skyscraper2.png'), img('skyscraper3.png'),
    img('skyscraper4.png'), img('skyscraper5.png'), img('skyscraper6.png'),
  ];
}

export function createLights(scene) {
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
  scene.add(ambientLight);

  const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
  directionalLight.position.set(10, 20, 10);
  scene.add(directionalLight);
}

export function createGround(scene, size) {
  const groundGeometry = new THREE.PlaneGeometry(size, size);
  const groundMaterial = new THREE.MeshStandardMaterial({
    color: 0xe8e8e8
  });

  const ground = new THREE.Mesh(groundGeometry, groundMaterial);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(size / 2 - 0.5, 0, size / 2 - 0.5);

  scene.add(ground);
}

var gridSize = 1;

export function createGrid(scene, size, divisions) {
    const cellSize = gridSize;
    size = cellSize * divisions;
  const grid = new THREE.GridHelper(size, divisions, 0x777777, 0xaaaaaa);
  grid.position.set(size / 2 - cellSize / 2, 0.01, size / 2 - cellSize / 2);

  scene.add(grid);
}

function getRandomTexture(textureArray) {
  return textureArray[Math.floor(Math.random() * textureArray.length)];
}

// basic block per floor
export function createBoxBlock(width, height, depth, color, texturePath) {
  const loader = new THREE.TextureLoader();
  const tex = loader.load(texturePath);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  const geometry = new THREE.BoxGeometry(width, height, depth);
  const sideMat = new THREE.MeshStandardMaterial({ map: tex, color: new THREE.Color(color) });
  const topBottom = new THREE.MeshStandardMaterial({
    color: new THREE.Color(color)
  });

  const materials = [sideMat, sideMat, topBottom, topBottom, sideMat, sideMat];

  return new THREE.Mesh(geometry, materials);
}

// roof for house
export function createPyramidRoof(width, height, depth, color) {
  const radius = Math.max(width, depth) / 2 + 0.2;
  const geometry = new THREE.ConeGeometry(radius, height, 4);
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(color)
  });

  const roof = new THREE.Mesh(geometry, material);

  roof.rotation.y = Math.PI / 4;

  return roof;
}

// building generators
// house
export function createHouse(dto) {
  const group = new THREE.Group();

  const bodyWidth = gridSize;
  const bodyDepth = gridSize;
  const floorHeight = gridSize;

  const texture = getRandomTexture(houseTextures());

  // stack block depending on the floor height 
  for (let i = 0; i < dto.floors; i++) {
    const block = createBoxBlock(bodyWidth, floorHeight, bodyDepth, "#FFE135", texture);
    block.position.set(0, floorHeight / 2 + i * floorHeight, 0);
    group.add(block);
  }

  // add roof on top
  const roofHeight = 1;
  const roof = createPyramidRoof(bodyWidth, roofHeight, bodyDepth, "#ffffff");
  roof.position.set(0, dto.floors * floorHeight + roofHeight / 2, 0);
  group.add(roof);

  group.position.set(dto.col, 0, dto.row);
  group.userData = dto;

  return attachUmlToGroup(group, dto); // changed this line - heewon
}

// create apt 
export function createApartment(dto) {
  const group = new THREE.Group();

  const bodyWidth = gridSize;
  const bodyDepth = gridSize;
  const floorHeight = gridSize;

  const texture = getRandomTexture(apartmentTextures());

  for (let i = 0; i < dto.floors; i++) {
    const block = createBoxBlock(bodyWidth, floorHeight, bodyDepth, "#87AE73", texture);
    block.position.set(0, floorHeight / 2 + i * floorHeight, 0);
    group.add(block);
  }

  group.position.set(dto.col, 0, dto.row);
  group.userData = dto;

  return attachUmlToGroup(group, dto);
}

// create skyscraper 
export function createSkyscraper(dto) {
  const group = new THREE.Group();

  const bodyWidth = 1.0;
  const bodyDepth = 1.0;
  const floorHeight = 1.0;
  
  const texture = getRandomTexture(skyscraperTextures());

  for (let i = 0; i < dto.floors; i++) {
    const block = createBoxBlock(bodyWidth, floorHeight, bodyDepth, "#82CAFF", texture);
    block.position.set(0, floorHeight / 2 + i * floorHeight, 0);
    group.add(block);
  }

  group.position.set(dto.col, 0, dto.row);
  group.userData = dto;

  return attachUmlToGroup(group, dto);
}

// decide type of building depending on the floor height 
export function createBuildingFromDTO(dto) {
  if (dto.floors <= 2) {
    return createHouse(dto);
  }

  if (dto.floors <= 6) {
    return createApartment(dto);
  }

  return createSkyscraper(dto);
}

export function createBuildingsFromDTOs(dtoList) {
  return dtoList.map(dto => createBuildingFromDTO(dto));
}

// creating uml label per dto
function createUmlLabel(dto) {
  const uml = dto.uml || {
    name: `Building_${dto.col}_${dto.row}`,
    fields: [
      `col: ${dto.col}`,
      `row: ${dto.row}`,
      `floors: ${dto.floors}`
      //`color: ${dto.color || "N/A"}`
    ],
    methods: []
  };

  const root = document.createElement("div");
  root.style.minWidth = "220px";
  root.style.maxWidth = "280px";
  root.style.background = "#1a1a2e";
  root.style.border = "2px solid #598BAF";
  root.style.borderRadius = "8px";
  root.style.overflow = "hidden";
  root.style.color = "#d9d9d9";
  root.style.fontFamily = "monospace";
  root.style.fontSize = "13px";
  root.style.boxShadow = "0 6px 18px rgba(0,0,0,0.35)";
  //root.style.display = "none"; 
  root.style.pointerEvents = "none";
  root.style.whiteSpace = "pre-wrap";

  const header = document.createElement("div");
  header.textContent = uml.name || "Unnamed";
  header.style.background = "#598BAF";
  header.style.color = "#ffffff";
  header.style.fontWeight = "bold";
  header.style.textAlign = "center";
  header.style.padding = "8px 10px";
  header.style.fontSize = "15px";
  root.appendChild(header);

  const fieldsSection = document.createElement("div");
  fieldsSection.style.padding = "8px 10px";
  fieldsSection.style.borderTop = "1px solid #598BAF";

  (uml.fields || []).forEach((field) => {
    const line = document.createElement("div");
    line.textContent = `- ${field}`;
    line.style.margin = "3px 0";
    fieldsSection.appendChild(line);
  });
  root.appendChild(fieldsSection);

  const methodsSection = document.createElement("div");
  methodsSection.style.padding = "8px 10px";
  methodsSection.style.borderTop = "1px solid #598BAF";

  (uml.methods || []).forEach((method) => {
    const line = document.createElement("div");
    line.textContent = `+ ${method}`;
    line.style.margin = "3px 0";
    methodsSection.appendChild(line);
  });
  root.appendChild(methodsSection);

  const label = new CSS2DObject(root);
  label.visible = false;
  return label;
}

// displaying uml label to the building
function attachUmlToGroup(group, dto) {
  const umlLabel = createUmlLabel(dto);

  // roof / building 위쪽에 뜨도록
  umlLabel.position.set(0, dto.floors + 1.2, 0);

  group.add(umlLabel);

  group.userData = {
    ...dto,
    isBuilding: true,
    umlLabel: umlLabel
  };

  return group;
}