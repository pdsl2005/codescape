import * as THREE from 'three';

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

// basic block per floor
export function createBoxBlock(width, height, depth, color, texturePath) {
  const loader = new THREE.TextureLoader();
  const tex = loader.load(texturePath);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  const geometry = new THREE.BoxGeometry(width, height, depth);
  const sideMat = new THREE.MeshStandardMaterial({map: tex});
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

  // stack block depending on the floor height 
  for (let i = 0; i < dto.floors; i++) {
    const block = createBoxBlock(bodyWidth, floorHeight, bodyDepth, "#FFE135", "./images/house.png");
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

  return group;
}

// create apt 
export function createApartment(dto) {
  const group = new THREE.Group();

  const bodyWidth = gridSize;
  const bodyDepth = gridSize;
  const floorHeight = gridSize;

  for (let i = 0; i < dto.floors; i++) {
    const block = createBoxBlock(bodyWidth, floorHeight, bodyDepth, "#87AE73", "./images/apt.png");
    block.position.set(0, floorHeight / 2 + i * floorHeight, 0);
    group.add(block);
  }

  group.position.set(dto.col, 0, dto.row);
  group.userData = dto;

  return group;
}

// create skyscraper 
export function createSkyscraper(dto) {
  const group = new THREE.Group();

  const bodyWidth = 1.0;
  const bodyDepth = 1.0;
  const floorHeight = 1.0;

  for (let i = 0; i < dto.floors; i++) {
    const block = createBoxBlock(bodyWidth, floorHeight, bodyDepth, "#82CAFF", "./images/skyscraper.png");
    block.position.set(0, floorHeight / 2 + i * floorHeight, 0);
    group.add(block);
  }

  group.position.set(dto.col, 0, dto.row);
  group.userData = dto;

  return group;
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