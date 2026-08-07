(function (global) {
  'use strict';

  const MM_TO_PX = 0.42;
  const MAJOR_SPACING_MM = 100;
  const MINOR_SPACING_MM = 10;

  let overlayEl = null;
  let svgRoot = null;
  let scale = 1;
  let panX = 120;
  let panY = 200;
  let originSvgX = 0; 
  let originSvgY = 0;
  let cursorPos = null;

  function svg(tag, attrs) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.keys(attrs || {}).forEach((k) => el.setAttribute(k, attrs[k]));
    return el;
  }

  function getStageSize() {
    const stage = document.getElementById('canvas-stage');
    return { width: stage ? stage.clientWidth : 1200, height: stage ? stage.clientHeight : 800 };
  }

  function drawGrid() {
    if (!overlayEl || !svgRoot) return;
    svgRoot.innerHTML = '';

    const { width, height } = getStageSize();
    
    const majorPx = MAJOR_SPACING_MM * MM_TO_PX * scale;
    const minorPx = MINOR_SPACING_MM * MM_TO_PX * scale;
    const showMinor = minorPx >= 6; 

    // Apply the offset origin so it mathematically aligns with the geometry
    const originScreenX = panX + originSvgX * scale;
    const originScreenY = panY + originSvgY * scale;

    const defs = svg('defs');
    
    if (showMinor) {
      const minorPat = svg('pattern', {
        id: 'cad-minor-grid', width: minorPx, height: minorPx, 
        patternUnits: 'userSpaceOnUse', patternTransform: `translate(${originScreenX}, ${originScreenY})`
      });
      minorPat.appendChild(svg('path', {
        d: `M ${minorPx} 0 L 0 0 L 0 ${minorPx}`,
        fill: 'none', stroke: 'var(--grid-line)', 'stroke-width': 1, 'stroke-opacity': 0.5,
        'shape-rendering': 'crispEdges'
      }));
      defs.appendChild(minorPat);
    }

    const majorPat = svg('pattern', {
      id: 'cad-major-grid', width: majorPx, height: majorPx, 
      patternUnits: 'userSpaceOnUse', patternTransform: `translate(${originScreenX}, ${originScreenY})`
    });
    majorPat.appendChild(svg('path', {
      d: `M ${majorPx} 0 L 0 0 L 0 ${majorPx}`,
      fill: 'none', stroke: 'var(--border-strong)', 'stroke-width': 1.5, 'stroke-opacity': 0.85,
      'shape-rendering': 'crispEdges'
    }));
    defs.appendChild(majorPat);
    svgRoot.appendChild(defs);

    if (showMinor) svgRoot.appendChild(svg('rect', { width: '100%', height: '100%', fill: 'url(#cad-minor-grid)' }));
    svgRoot.appendChild(svg('rect', { width: '100%', height: '100%', fill: 'url(#cad-major-grid)' }));

    // X/Y Axes
    const axesGroup = svg('g', { class: 'cad-axes' });
    axesGroup.appendChild(svg('line', { x1: 0, y1: originScreenY, x2: width, y2: originScreenY, stroke: 'var(--accent)', 'stroke-width': 1.5, 'stroke-opacity': 0.6, 'shape-rendering': 'crispEdges' }));
    axesGroup.appendChild(svg('line', { x1: originScreenX, y1: 0, x2: originScreenX, y2: height, stroke: 'var(--accent)', 'stroke-width': 1.5, 'stroke-opacity': 0.6, 'shape-rendering': 'crispEdges' }));
    svgRoot.appendChild(axesGroup);

    // Origin Marker (0,0)
    const originMarker = svg('g');
    originMarker.appendChild(svg('circle', { cx: originScreenX, cy: originScreenY, r: 4.5, fill: 'var(--bg-canvas)', stroke: 'var(--accent)', 'stroke-width': 1.6 }));
    originMarker.appendChild(svg('circle', { cx: originScreenX, cy: originScreenY, r: 1.4, fill: 'var(--accent)' }));
    
    // Label offsets slightly to bottom-right (quadrant IV) to keep the +,+ quadrant clean
    const coordLabel = svg('text', { x: originScreenX + 8, y: originScreenY + 16, fill: 'var(--text-secondary)', 'font-size': 11, 'font-family': 'var(--font-mono)', 'font-weight': 700 });
    coordLabel.textContent = '0, 0';
    originMarker.appendChild(coordLabel);
    svgRoot.appendChild(originMarker);

    // Sticky HUD Elements (Bottom Left)
    const hudX = 24;
    const hudY = height - 24;

    const cursorText = svg('text', { x: hudX, y: hudY - 32, fill: 'var(--text-secondary)', 'font-size': 11, 'font-family': 'var(--font-mono)', 'font-weight': 600 });
    cursorText.textContent = cursorPos ? `X ${cursorPos.x.toFixed(1)}  Y ${cursorPos.y.toFixed(1)}` : 'X 0.0  Y 0.0';
    svgRoot.appendChild(cursorText);

    let targetMm = 100 / (MM_TO_PX * scale);
    let niceMm = 100;
    if (targetMm < 20) niceMm = 10;
    else if (targetMm < 75) niceMm = 50;
    else if (targetMm < 150) niceMm = 100;
    else if (targetMm < 350) niceMm = 200;
    else if (targetMm < 750) niceMm = 500;
    else niceMm = 1000;

    const scalePxLength = niceMm * MM_TO_PX * scale;
    const scaleBarY = hudY - 10;
    
    const sbGroup = svg('g');
    sbGroup.appendChild(svg('line', { x1: hudX, y1: scaleBarY, x2: hudX + scalePxLength, y2: scaleBarY, stroke: 'var(--annotate)', 'stroke-width': 2, 'shape-rendering': 'crispEdges' }));
    sbGroup.appendChild(svg('line', { x1: hudX, y1: scaleBarY - 5, x2: hudX, y2: scaleBarY + 5, stroke: 'var(--annotate)', 'stroke-width': 1.5, 'shape-rendering': 'crispEdges' }));
    sbGroup.appendChild(svg('line', { x1: hudX + scalePxLength, y1: scaleBarY - 5, x2: hudX + scalePxLength, y2: scaleBarY + 5, stroke: 'var(--annotate)', 'stroke-width': 1.5, 'shape-rendering': 'crispEdges' }));
    
    const scaleLabel = svg('text', { x: hudX + scalePxLength / 2, y: scaleBarY - 8, fill: 'var(--annotate)', 'font-size': 10, 'font-family': 'var(--font-mono)', 'font-weight': 700, 'text-anchor': 'middle' });
    scaleLabel.textContent = `${niceMm} mm`;
    sbGroup.appendChild(scaleLabel);

    svgRoot.appendChild(sbGroup);
  }

  function init() {
    overlayEl = document.getElementById('canvas-grid-overlay');
    if (!overlayEl) return;
    overlayEl.innerHTML = '';
    svgRoot = svg('svg', {
      width: '100%', height: '100%',
      style: 'display:block; position:absolute; top:0; left:0; pointer-events:none;'
    });
    overlayEl.appendChild(svgRoot);
    drawGrid();
  }

  // Engine passes the computed origin gap to the grid
  function updateView(nextScale, nextPanX, nextPanY, nextOrgX = 0, nextOrgY = 0) {
    scale = nextScale;
    panX = nextPanX;
    panY = nextPanY;
    originSvgX = nextOrgX;
    originSvgY = nextOrgY;
    drawGrid();
  }

  function setCursor(pos) { cursorPos = pos; drawGrid(); }
  function clearCursor() { cursorPos = null; drawGrid(); }
  function render() { drawGrid(); }

  global.App = global.App || {};
  global.App.CadGrid = { init, render, updateView, setCursor, clearCursor };
})(window);