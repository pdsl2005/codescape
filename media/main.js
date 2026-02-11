import { drawIsoGrid, drawIsoBuilding } from "./renderer.js";

const canvas = document.getElementById("cityCanvas");
const ctx = canvas.getContext("2d");

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

const TILE_L = 50
const offsetX = canvas.width/2
const offsetY = 100;
const gridLength = 10;

// 2d array to check if the buildings are overlapping
var grid = Array.from({length: gridLength}, ()=>
new Array(gridLength).fill(null));

// render function for test city view 
function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    drawIsoGrid(ctx, gridLength, gridLength, TILE_L, offsetX, offsetY);

    // test buildings
    placeIsoBuilding(7, 5, 4, "#598BAF");
    placeIsoBuilding(4, 8, 6, "#598BAF");
}

// building placement function
function placeIsoBuilding(col, row, floors, color){
    if (grid[col][row] !== null) {
        console.log("Tile already occupied");
        return false;
    }

    var isoX = (col - row) * TILE_L / 2 + offsetX;
    var isoY = (col + row) * TILE_L / 4 + offsetY;

    drawIsoBuilding(ctx, isoX, isoY + TILE_L / 2, floors, TILE_L, color);
    
    const building = {col, row, floors, color};
    grid[col][row] = building;
    buildings.push(building);
    return true;
}

function placeIsoSavedBuilding(col, row, floors, color){
    var isoX = (col - row) * TILE_L / 2 + offsetX;
    var isoY = (col + row) * TILE_L / 4 + offsetY;

    drawIsoBuilding(ctx, isoX, isoY + TILE_L / 2, floors, TILE_L, color);
    
    const building = {col, row, floors, color};
    grid[col][row] = building;
    buildings.push(building);
    return true;
}

// actual rendering TEST
render();



// ADDED for Load & Save

// if current building data is saved
// building list example
let buildings = [
    { col: 2, row: 3, floor: 4, color: "#3498db" },
  { col: 5, row: 1, floor: 2, color: "#e74c3c" }
]; // adding id for identification as index might be good 

// saving current building data
function saveCityData(){
    localStorage.setItem("cityData", JSON.stringify(buildings));
}

// rendering function that loads current data
function loadSavedBuildings(ctx){
    const savedData = localStorage.getItem("cityData");
    buildings = JSON.parse(savedData)
    grid = Array.from({length: gridLength}, ()=>
        new Array(gridLength).fill(null));
    if (buildings) {
        buildings.forEach(b => {
        placeIsoSavedBuilding(ctx, b.gridX, b.gridY, b.floor, b.color);
        });
    }
    saveCityData;
}
