// Isometric grid rendering
export function drawIsoGrid(ctx, rows, cols, size, offsetX, offsetY) {
    ctx.strokeStyle = '#2c2c2c';
    var tileW = size;
    var tileH = size / 2;

    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
        var isoX = (col - row) * tileW / 2 + offsetX;
        var isoY = (col + row) * tileH / 2 + offsetY;

        ctx.beginPath();
        ctx.moveTo(isoX, isoY);
        ctx.lineTo(isoX + tileW / 2, isoY + tileH / 2);
        ctx.lineTo(isoX, isoY + tileH);
        ctx.lineTo(isoX - tileW / 2, isoY + tileH / 2);
        ctx.closePath();
        ctx.stroke();
        }
    }
}

// Color shading for 3D effect
function shade(color, percent) {
    var num = parseInt(color.slice(1), 16),
        amt = Math.round(2.55 * percent),
        R = (num >> 16) + amt,
        G = ((num >> 8) & 0x00ff) + amt,
        B = (num & 0x0000ff) + amt;
    return (
    '#' +
    (
        0x1000000 +
        (R < 255 ? (R < 1 ? 0 : R) : 255) * 0x10000 +
        (G < 255 ? (G < 1 ? 0 : G) : 255) * 0x100 +
        (B < 255 ? (B < 1 ? 0 : B) : 255)
    ).toString(16).slice(1)
    );
}

// Single isometric cube
function drawIsoCube(ctx, x, y, width, height, color) {
    const depthX = width / 2;
    const depthY = width / 4;

    const bottom = { x: x,          y: y };
    const right  = { x: x + depthX, y: y - depthY };
    const top    = { x: x,          y: y - 2 * depthY };
    const left   = { x: x - depthX, y: y - depthY };

    const bottomU = { x: bottom.x, y: bottom.y - height };
    const rightU  = { x: right.x,  y: right.y  - height };
    const topU    = { x: top.x,    y: top.y    - height };
    const leftU   = { x: left.x,   y: left.y   - height };

    // Left face
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(left.x, left.y);
    ctx.lineTo(bottom.x, bottom.y);
    ctx.lineTo(bottomU.x, bottomU.y);
    ctx.lineTo(leftU.x, leftU.y);
    ctx.closePath();
    ctx.fill();

    // Right face
    ctx.fillStyle = shade(color, -20);
    ctx.beginPath();
    ctx.moveTo(right.x, right.y);
    ctx.lineTo(bottom.x, bottom.y);
    ctx.lineTo(bottomU.x, bottomU.y);
    ctx.lineTo(rightU.x, rightU.y);
    ctx.closePath();
    ctx.fill();

    // Top face
    ctx.fillStyle = shade(color, 20);
    ctx.beginPath();
    ctx.moveTo(topU.x, topU.y);
    ctx.lineTo(rightU.x, rightU.y);
    ctx.lineTo(bottomU.x, bottomU.y);
    ctx.lineTo(leftU.x, leftU.y);
    ctx.closePath();
    ctx.fill();
}

// Stacked cube building
function drawIsoBuilding(ctx, baseX, baseY, floors, size, color) {
    for (let i = 0; i < floors; i++) {
    drawIsoCube(ctx, baseX, baseY - i * size / 2, size, size, color);
    }
}

// Place building on grid
export function placeIsoBuilding(ctx, col, row, floors, color, TILE_L, offsetX, offsetY) {
    var isoX = (col - row) * TILE_L / 2 + offsetX;
    var isoY = (col + row) * TILE_L / 4 + offsetY;
    drawIsoBuilding(ctx, isoX, isoY + TILE_L / 2, floors, TILE_L, color || '#598BAF');
}