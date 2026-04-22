//UML class diagram renderer
export function drawUmlBox(ctx, x, y, classData, options) {
    const config = {
    padding: (options && options.padding) || 10,
    lineHeight: (options && options.lineHeight) || 20,
    fontSize: (options && options.fontSize) || 14,
    headerFontSize: (options && options.headerFontSize) || 16,
    maxWidth: (options && options.maxWidth) || null,
    scale: (options && options.scale) || 1,
    maxHeight: (options && options.maxHeight) || null,
    scrollOffset: (options && options.scrollOffset) || 0
    };

    const padding = config.padding * config.scale;
    const lineHeight = config.lineHeight * config.scale;
    const fontSize = config.fontSize * config.scale;
    const headerFontSize = config.headerFontSize * config.scale;

    // Measure each row with the font it will actually render with, so bold
    // headers and smaller body rows are sized correctly.
    let maxTextWidth = 0;

    ctx.font = 'bold ' + headerFontSize + 'px monospace';
    maxTextWidth = Math.max(maxTextWidth, ctx.measureText(classData.name || '').width);

    ctx.font = fontSize + 'px monospace';
    (classData.fields || []).forEach((f) => {
    maxTextWidth = Math.max(maxTextWidth, ctx.measureText('  - ' + f).width);
    });
    (classData.methods || []).forEach((m) => {
    maxTextWidth = Math.max(maxTextWidth, ctx.measureText('  + ' + m).width);
    });

    // Reserve room on the right for the scrollbar track when a height cap is in effect.
    const scrollbarReserve = config.maxHeight ? 12 : 0;
    let boxWidth = maxTextWidth + padding * 3 + scrollbarReserve;
    if (config.maxWidth) {
    boxWidth = Math.min(boxWidth, config.maxWidth);
    }

    const headerHeight = lineHeight + padding;
    const fieldsHeight = (classData.fields || []).length * lineHeight + padding;
    const methodsHeight = (classData.methods || []).length * lineHeight + padding;
    const boxHeight = headerHeight + fieldsHeight + methodsHeight + padding;

    const visibleHeight = config.maxHeight
        ? Math.min(boxHeight, config.maxHeight)
        : boxHeight;
    const maxScrollOffset = Math.max(0, boxHeight - visibleHeight);
    const scrollOffset = Math.max(0, Math.min(config.scrollOffset, maxScrollOffset));

    // Clip interior drawing to the visible window, shifted by scrollOffset
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, boxWidth, visibleHeight);
    ctx.clip();
    ctx.translate(0, -scrollOffset);

    // Draw background (full content height, clipped to visible)
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(x, y, boxWidth, boxHeight);

    // Draw class name header background
    ctx.fillStyle = '#598BAF';
    ctx.fillRect(x + 1, y + 1, boxWidth - 2, headerHeight - 1);

    // Draw class name text
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold ' + headerFontSize + 'px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(classData.name, x + boxWidth / 2, y + lineHeight);

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

    ctx.restore();

    // Draw border at the visible box edge (outside the clip + translate)
    ctx.strokeStyle = '#598BAF';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, boxWidth, visibleHeight);

    // Draw scroll indicator if content exceeds the visible window
    if (boxHeight > visibleHeight) {
        const trackH = visibleHeight;
        const thumbH = Math.max(20, (visibleHeight / boxHeight) * trackH);
        const thumbRange = trackH - thumbH;
        const scrollRatio = maxScrollOffset > 0 ? scrollOffset / maxScrollOffset : 0;
        const thumbY = y + scrollRatio * thumbRange;
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.fillRect(x + boxWidth - 6, thumbY, 4, thumbH);
    }

    return {
    x: x,
    y: y,
    width: boxWidth,
    height: visibleHeight,
    totalHeight: boxHeight
    };
}