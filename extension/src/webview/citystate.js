import { placeIsoBuilding, drawIsoGrid } from './renderer.js'
const COLOR_PALETTE = [
    "#598BAF",
    "#8B5CF6",
    "#10B981",
    "#F59E0B",
    "#EF4444",
    "#14B8A6",
    "#6366F1",
    "#EC4899"
];
const TILE_L = 50;

export class CityState {

    constructor(canvas, ctx) {
        this.canvas = canvas;
        this.ctx = ctx;
        this.state = {
            classes: [],
            layout: {},
            colors: {},
            status: "loading",
            classMap: {}
        };
        this.buildingRegistry = []
        this.offsetX = canvas.width / 2;
        this.offsetY = 100;
        this.zoomLevel = 1;

    }
    effectiveFloors(cls) {
        const methods = cls.Methods || [];
        const fields = cls.Fields || [];
        let m = methods.length;
        let f = fields.length;
        if (cls.Type === 'module') {
            const codeBlocks = methods.filter((x) => {
                return x.name && String(x.name).indexOf('<module_code_') === 0;
            }).length;
            const realFuncs = m - codeBlocks;
            const cappedCode = Math.min(codeBlocks, 4);
            return Math.max(1, Math.min(realFuncs + f + cappedCode, 48));
        }
        return Math.max(1, Math.min(m + f, 48));
    }

    pickBaseColor(cls) {
        const t = cls.Type;
        if (t === 'interface') return '#8B5CF6';
        if (t === 'abstract') return '#F59E0B';
        if (t === 'module') return '#14B8A6';
        if (t === 'enum') return '#A855F7';
        return '#598BAF';
    }

    hashHue(name) {
        let h = 0;
        const s = String(name);
        for (let i = 0; i < s.length; i++) {
            h = ((h << 5) - h) + s.charCodeAt(i);
            h |= 0;
        }
        return Math.abs(h);
    }

    runAutoLayoutFallback() {
        this.state.layout = {};
        const topLevel = this.state.classes.filter((c) => { return !c.parentClass; });
        const inner = this.state.classes.filter((c) => { return c.parentClass; });
        topLevel.forEach((cls, index) => {
            this.state.layout[cls.Classname] = { col: 3 + index * 2, row: 3 + index, depth: 0 };
        });
        inner.forEach((cls) => {
            const parent = this.state.classMap[cls.parentClass];
            const pp = parent && this.state.layout[parent.Classname];
            if (pp) {
                this.state.layout[cls.Classname] = {
                    col: pp.col + 2,
                    row: pp.row + 1,
                    depth: (pp.depth || 0) + 1
                };
            } else {
                this.state.layout[cls.Classname] = { col: 20, row: 10, depth: 1 };
            }
        });
    }

    rebuildClassMap() {
        this.state.classMap = {};
        this.state.classes.forEach((cls) => {
            this.state.classMap[cls.Classname] = cls;
        });
    }

    applyFullPayload(payload) {
        const classes = payload.classes || [];
        this.state.classes = classes;
        this.rebuildClassMap();

        const layout = payload.layout;
        if (layout && typeof layout === 'object' && Object.keys(layout).length > 0) {
            this.state.layout = layout;
        } else {
            this.runAutoLayoutFallback();
        }

        if (!classes.length) {
            this.state.status = 'empty';
        } else {
            this.state.status = 'ready';
        }

        this.offsetX = this.canvas.width / 2;
        this.offsetY = 100;
        this.assignColors();
        this.render();
    }

    applyPartialPayload(payload) {
        if (payload.fullClasses && payload.layout) {
            this.applyFullPayload({
                classes: payload.fullClasses,
                layout: payload.layout,
                status: 'ready'
            });
        } else {
            const changed = payload.changed || [];
            const related = payload.related || [];
            const removed = payload.removed || [];
            const map = {};

            this.state.classes.forEach((c) => { map[c.Classname] = c; });
            removed.forEach((name) => { delete map[name]; });
            const upsert = changed.length ? changed : related;
            upsert.forEach((c) => { map[c.Classname] = c; });
            this.state.classes = Object.keys(map).map((k) => { return map[k]; });
            this.rebuildClassMap();
            this.runAutoLayoutFallback();
            this.assignColors();
            this.render();
        }
    }

    assignColors() {
        const newColorMap = {};
        const usedColors = new Set();

        this.state.classes.forEach((cls) => {
            const existing = this.state.colors[cls.Classname];
            if (existing) {
                newColorMap[cls.Classname] = existing;
                usedColors.add(existing);
            }
        });

        this.state.classes.forEach((cls) => {
            if (!newColorMap[cls.Classname]) {
                let candidate = this.pickBaseColor(cls);
                let tries = 0;
                while (usedColors.has(candidate) && tries < 24) {
                    candidate = COLOR_PALETTE[(this.hashHue(cls.Classname + tries)) % COLOR_PALETTE.length];
                    tries++;
                }
                newColorMap[cls.Classname] = candidate;
                usedColors.add(candidate);
            }
        });

        this.state.colors = newColorMap;
    }

    render() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        this.ctx.save();
        this.ctx.translate(this.canvas.width / 2, this.canvas.height / 2);
        this.ctx.scale(this.zoomLevel, this.zoomLevel);
        this.ctx.translate(-this.canvas.width / 2, -this.canvas.height / 2);

        this.offsetX = this.canvas.width / 2;
        this.offsetY = 100;
        drawIsoGrid(this.ctx, 10, 10, TILE_L, this.offsetX, this.offsetY);

        if (this.state.status === "loading") {
            this.drawLoadingMessage();
            this.ctx.restore();
            return;
        }

        if (this.state.status === "empty") {
            this.drawEmptyMessage();
            this.ctx.restore();
            return;
        }

        if (this.state.status === "error") {
            this.drawErrorMessage();
            this.ctx.restore();
            return;
        }

        this.buildingRegistry.length = 0;
        this.state.classes.forEach((cls) => {
            const position = this.state.layout[cls.Classname];
            if (!position) return;

            const floors = this.effectiveFloors(cls);
            const depthScale = 1 - ((position.depth || 0) * 0.12);
            const adjustedFloors = Math.max(1, Math.ceil(floors * Math.max(0.5, depthScale)));

            const col = position.col;
            const row = position.row;
            const isoX = (col - row) * TILE_L / 2 + this.offsetX;
            const isoY = (col + row) * TILE_L / 4 + this.offsetY + TILE_L / 2;
            const approxHeight = TILE_L + adjustedFloors * (TILE_L / 2);
            this.buildingRegistry.push({
                className: cls.Classname,
                x: isoX - TILE_L / 2,
                y: isoY - approxHeight,
                width: TILE_L,
                height: approxHeight
            });

            placeIsoBuilding(
                this.ctx,
                position.col,
                position.row,
                adjustedFloors,
                this.state.colors[cls.Classname] || this.pickBaseColor(cls),
                TILE_L,
                this.offsetX,
                this.offsetY
            );

            if (cls.parentClass) {
                const parentPos = this.state.layout[cls.parentClass];
                if (parentPos) {
                    const fromWorld = this.colRowToWorld(parentPos.col, parentPos.row, TILE_L, this.offsetX, this.offsetY);
                    const toWorld = this.colRowToWorld(position.col, position.row, TILE_L, this.offsetX, this.offsetY);
                    this.ctx.save();
                    this.ctx.strokeStyle = "rgba(200, 200, 200, 0.5)";
                    this.ctx.lineWidth = 1;
                    this.ctx.setLineDash([2, 2]);
                    this.ctx.beginPath();
                    this.ctx.moveTo(fromWorld.x, fromWorld.y);
                    this.ctx.lineTo(toWorld.x, toWorld.y);
                    this.ctx.stroke();
                    this.ctx.restore();
                }
            }
        });

        this.ctx.restore();
    }

    colRowToWorld(col, row, tileL, ox, oy) {
        const x = ox + (col - row) * (tileL / 2);
        const y = oy + (col + row) * (tileL / 4);
        return { x: x, y: y };
    }

    drawLoadingMessage() {
        this.ctx.fillStyle = "white";
        this.ctx.font = "20px Arial";
        this.ctx.fillText("Loading...", 50, 50);
    }

    drawEmptyMessage() {
        this.ctx.fillStyle = "white";
        this.ctx.font = "20px Arial";
        this.ctx.fillText("No classes detected.", 50, 50);
    }

    drawErrorMessage() {
        this.ctx.fillStyle = "red";
        this.ctx.font = "20px Arial";
        this.ctx.fillText("Error parsing files.", 50, 50);
    }
    screenToWorld(clientX, clientY) {
        const x = (clientX - this.canvas.width / 2) / this.zoomLevel + this.canvas.width / 2;
        const y = (clientY - this.canvas.height / 2) / this.zoomLevel + this.canvas.height / 2;
        return { x: x, y: y };
    }

    getBuildingAtPosition(canvasX, canvasY) {
        for (let i = this.buildingRegistry.length - 1; i >= 0; i--) {
            const b = this.buildingRegistry[i];
            const inside =
                canvasX >= b.x &&
                canvasX <= b.x + b.width &&
                canvasY >= b.y &&
                canvasY <= b.y + b.height;
            if (inside) return b;
        }
        return null;
    }
}