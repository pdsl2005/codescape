import { drawIsoGrid, drawIsoBuilding } from "./renderer.js";

const canvas = document.getElementById("cityCanvas");
const ctx = canvas.getContext("2d");

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

const TILE_L = 50
const offsetX = canvas.width/2
const offsetY = 100;
const gridLength = 10;

// BELOW are zoom, pan, naviagation
const viewportTransform = {
    x: 0,
    y: 0,
    scale: 1
};

// pan 
// track previous mouse position
let prevX = 0, prevY = 0;

const updatePanning = (e) => {
    const localX = e.clientX;
    const localY = e.clientY;

    viewportTransform.x += localX - prevX;
    viewportTransform.y += localY - prevY;

    prevX = localX;
    prevY = localY;
}

const onMouseMove = (e) => {
    updatePanning(e);
    render();
    console.log(e)
}

canvas.addEventListener('mousedown', (e) => {
    prevX = e.clientX;
    prevY = e.clientY;

    canvas.addEventListener('mousemove', onMouseMove)
})

canvas.addEventListener('mouseup', (e) => {
    canvas.removeEventListener('mousemove', onMouseMove)
})

// zoom
const updateZooming = (e) => {
    e.preventDefault();
    const oldScale = viewportTransform.scale;
    const oldX = viewportTransform.x;
    const oldY = viewportTransform.y;

    const localX = e.clientX;
    const localY = e.clientY;

    const prevScale = viewportTransform.scale;

    var newScale = oldScale + e.deltaY * -0.0015;
    newScale = Math.max(0.2, Math.min(4, newScale));

    const newX = localX - (localX - oldX) * (newScale/prevScale);
    const newY = localY - (localY - oldY) * (newScale/prevScale);

    viewportTransform.x = newX;
    viewportTransform.y = newY;
    viewportTransform.scale = newScale;
}

const onMouseWheel = (e) => {
    updateZooming(e);
    render();
}

canvas.addEventListener('wheel', onMouseWheel);

// reset 
window.addEventListener("keydown", (e) => {
    if (e.key === "r" || e.key === "R") {
        viewportTransform.x = 0;
        viewportTransform.y = 0;
        viewportTransform.scale = 1;
        render();
    }
})

// BELOW are Render Functions / Tests / Saving / Loading 

// 2d array to check if the buildings are overlapping
var grid = Array.from({length: gridLength}, ()=>
Array(gridLength).fill(null));
// building dictionary list initialization

// if current building data is saved
// building list example
const sample_buildings = [
    { col: 2, row: 3, floors: 4, color: "#3498db" },
  { col: 5, row: 1, floors: 2, color: "#e74c3c" }
]; // adding id for identification as index might be good 

var buildings = [];
var new_buildings = [];

// render function for test city view 
function render() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(
        viewportTransform.scale,
        0,
        0,
        viewportTransform.scale,
        viewportTransform.x,
        viewportTransform.y
    );

    drawIsoGrid(ctx, gridLength, gridLength, TILE_L, offsetX, offsetY);

    loadSavedBuildings();

    for (const b of new_buildings) {
        placeIsoBuilding(b.col, b.row, b.floors, b.color);
    }
}

// building placement function
function placeIsoBuilding(col, row, floors, color){
    if (grid[col][row] !== null) {
        console.log("Tile already occupied");
        return false;
    }

    var isoX = (col - row) * TILE_L / 2 + offsetX;
    var isoY = (col + row) * TILE_L / 4 + offsetY;

    drawIsoBuilding(ctx, isoX, isoY + TILE_L / 2, (floors - 1), TILE_L, color);
    
    const building = {col, row, floors, color};
    grid[col][row] = building;
    buildings.push(building);
    return true;
}

// for saved building - don't need to check tile occupation 
// because when new building is added, it checks before add
function placeIsoSavedBuilding(col, row, floors, color){
    var isoX = (col - row) * TILE_L / 2 + offsetX;
    var isoY = (col + row) * TILE_L / 4 + offsetY;

    drawIsoBuilding(ctx, isoX, isoY + TILE_L / 2, (floors - 1), TILE_L, color);
    
    var building = {col, row, floors, color};
    grid[col][row] = building;
    buildings.push(building);
    return true;
}



// ADDED for Load & Save -- need change 

// saving current building data
function saveCityData(){
    localStorage.setItem("cityData", JSON.stringify(buildings));
}

// rendering function that loads current data
function loadSavedBuildings(){
    const savedData = localStorage.getItem("cityData");
    var saved_buildings = JSON.parse(savedData)
    grid = Array.from({length: gridLength}, ()=>
        Array(gridLength).fill(null));
    if (saved_buildings) {
        saved_buildings.forEach(b => {
        placeIsoSavedBuilding(b.col, b.row, b.floors, b.color);
        });
    }
}

// TEST
buildings = sample_buildings;
saveCityData();
render();