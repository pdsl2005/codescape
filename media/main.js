import { drawIsoGrid, drawIsoBuilding } from "./renderer.js";

const canvas = document.getElementById("cityCanvas");
const ctx = canvas.getContext("2d");

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

const TILE_L = 50
const offsetX = canvas.width/2
const offsetY = 100;
const gridLength = 10;
var cols = gridLength;
var rows = gridLength;

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
        rotationState = 0;
        render();
    }
})

// BELOW are Render Functions / Tests / Saving / Loading 

// 2d array to check if the buildings are overlapping
//var grid = Array.from({length: gridLength}, ()=>
//Array(gridLength).fill(null));
// building dictionary list initialization

// if current building data is saved
// building list example
const sample_buildings = [
    { col: 2, row: 3, floors: 4, color: "#3498db" },
  { col: 5, row: 1, floors: 2, color: "#e74c3c" }
]; // adding id for identification as index might be good 

var buildings = [];
var new_buildings = [];

// function to sort the building list by depth (adding col + row)
function sortBuilding(buildings_list) {
    buildings_list.sort((a, b) => (a.col + a.row) - (b.col + b.row));
}

// rotation functions
function rotation0(col, row, cols, rows){
    return {col, row};
}

function rotation90(col, row, cols, rows){
    return {col: rows - 1 - row, row: col};
}

function rotation180(col, row, cols, rows){
    return {col: cols - 1 - col, row: rows - 1 - row};
}

function rotation270(col, row, cols, rows){
    return {col: row, row: cols - 1 - col};
}

function rotate_building_list(buildings_list, cols, rows, rotation){
    return buildings_list.map(b => {
        const r = rotation(b.col, b.row, cols, rows);
        return{...b, col: r.col, row: r.row};
    });
}

// rotating based on arrow keys
let rotationState = 0;
window.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight") {
        rotationState = (rotationState + 1) % 4;
        render();
    }
    if (e.key === "ArrowLeft") {
        rotationState = (rotationState - 1 + 4) % 4;
        render();
    }
})

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

    if (new_buildings.length !== 0){
        var combined_list = [... buildings, ... new_buildings];
        buildings = combined_list;
        sortBuilding(buildings);
        saveCityData(buildings);
    }
    else{
        buildings = loadSavedBuildings();
    }

    const building0 = rotate_building_list(buildings, cols, rows, rotation0);
    const building90 = rotate_building_list(buildings, cols, rows, rotation90);
    const building180 = rotate_building_list(buildings, cols, rows, rotation180);
    const building270 =rotate_building_list(buildings, cols, rows, rotation270);

    const rotatedLists = [building0, building90, building180, building270];

    const currentBuilding_list = rotatedLists[rotationState];
    sortBuilding(currentBuilding_list);

    for (const b of currentBuilding_list) {
        placeIsoBuilding(b.col, b.row, b.floors, b.color);
    }
}

// building placement function
function placeIsoBuilding(col, row, floors, color){
    //if (grid[col][row] !== null) {
    //    console.log("Tile already occupied");
    //    return false;
    //}

    var isoX = (col - row) * TILE_L / 2 + offsetX;
    var isoY = (col + row) * TILE_L / 4 + offsetY;

    drawIsoBuilding(ctx, isoX, isoY + TILE_L / 2, (floors - 1), TILE_L, color);
    
    //const building = {col, row, floors, color};
    //grid[col][row] = building;
    //buildings.push(building);
    //return true;
}

// ADDED for Load & Save -- need change 

// saving current building data
function saveCityData(buildings_list){
    localStorage.setItem("cityData", JSON.stringify(buildings_list));
}

// rendering function that loads current data
function loadSavedBuildings(){
    const savedData = localStorage.getItem("cityData");
    var saved_buildings = JSON.parse(savedData)
    //grid = Array.from({length: gridLength}, ()=>
    //    Array(gridLength).fill(null));
    //if (saved_buildings) {
    //    saved_buildings.forEach(b => {
    //    placeIsoBuilding(b.col, b.row, b.floors, b.color);
    //    });
    //}
    return saved_buildings;
}

// TEST
buildings = sample_buildings;
saveCityData(buildings);
render();