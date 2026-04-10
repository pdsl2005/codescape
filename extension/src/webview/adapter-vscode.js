//
import { CityState } from "./citystate.js";

const vscode = acquireVsCodeApi();
const canvas = document.getElementById('cityCanvas');
const ctx = canvas.getContext('2d');
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

const city = new CityState(canvas, ctx);

// state messages
window.addEventListener('message', event => {
    const msg = event.data;
    if (msg.type === 'FULL_STATE' && msg.payload?.classes) {
        city.applyFullPayload(msg.payload);
    } else if (msg.type === 'PARTIAL_STATE' && msg.payload) {
        city.applyPartialPayload(msg.payload);
    }
});

// camera
canvas.addEventListener('wheel', e => {
    e.preventDefault();
    city.zoom(e.deltaY);
});

window.addEventListener('resize', () => {
    city.resize(window.innerWidth, window.innerHeight);
});

// VS Code specific
canvas.addEventListener('click', e => {
    const world = city.screenToWorld(e.clientX, e.clientY);
    const building = city.getBuildingAtPosition(world.x, world.y);
    if (!building) return;
    vscode.postMessage({
        type: 'OPEN_CLASS_SOURCE',
        payload: { className: building.className }
    });
});

city.render();
vscode.postMessage({ type: 'READY' });