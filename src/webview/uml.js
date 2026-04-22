//UML class diagram renderer
export function drawUmlBox(ctx, x, y, classData, options) {
    const config = {
    padding: (options && options.padding) || 10,
    lineHeight: (options && options.lineHeight) || 20,
    fontSize: (options && options.fontSize) || 14,
    headerFontSize: (options && options.headerFontSize) || 16,
    maxWidth: (options && options.maxWidth) || null,
    scale: (options && options.scale) || 1
    };

    const padding = config.padding * config.scale;
    const lineHeight = config.lineHeight * config.scale;
    const fontSize = config.fontSize * config.scale;
    const headerFontSize = config.headerFontSize * config.scale;

    ctx.font = headerFontSize + 'px monospace';

    const allText = [
    classData.name,
    ...(classData.fields || []).map(f => '  - ' + f),
    ...(classData.methods || []).map(m => '  + ' + m)
    ];
    const maxTextWidth = allText.reduce((max, text) => {
    return Math.max(max, ctx.measureText(text).width);
    }, 0);

    let boxWidth = maxTextWidth + padding * 3;
    if (config.maxWidth) {
    boxWidth = Math.min(boxWidth, config.maxWidth);
    }

    const headerHeight = lineHeight + padding;
    const fieldsHeight = (classData.fields || []).length * lineHeight + padding;
    const methodsHeight = (classData.methods || []).length * lineHeight + padding;
    const boxHeight = headerHeight + fieldsHeight + methodsHeight + padding;

    // Draw background
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(x, y, boxWidth, boxHeight);

    // Draw border
    ctx.strokeStyle = '#598BAF';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, boxWidth, boxHeight);

    // Draw class name header background
    ctx.fillStyle = '#598BAF';
    ctx.fillRect(x + 1, y + 1, boxWidth - 2, headerHeight - 1);

    // Draw class name text
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold ' + headerFontSize + 'px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(classData.name, x + boxWidth / 2, y + lineHeight);

    // Divider lines
    ctx.strokeStyle = '#598BAF';

    // Fields text
    ctx.fillStyle = '#8B5CF6';

    // Methods text
    ctx.fillStyle = '#10B981';
    // Draw line under header
    let currentY = y + headerHeight;
    ctx.beginPath();
    ctx.moveTo(x, currentY);
    ctx.lineTo(x + boxWidth, currentY);
    ctx.strokeStyle = '#598BAF';
    ctx.stroke();

    // Draw fields
    ctx.fillStyle = '#cccccc';
    ctx.font = fontSize + 'px monospace';
    ctx.textAlign = 'left';
    (classData.fields || []).forEach((field) => {
    currentY += lineHeight;
    ctx.fillText('  - ' + field, x + padding, currentY);
    });

    // Draw line under fields
    currentY += padding;
    ctx.beginPath();
    ctx.moveTo(x, currentY);
    ctx.lineTo(x + boxWidth, currentY);
    ctx.strokeStyle = '#598BAF';
    ctx.stroke();

    // Draw methods
    ctx.fillStyle = '#cccccc';
    (classData.methods || []).forEach((method) => {
    currentY += lineHeight;
    ctx.fillText('  + ' + method, x + padding, currentY);
    });
    return {
    x: x,
    y: y,
    width: boxWidth,
    height: boxHeight
    };
}