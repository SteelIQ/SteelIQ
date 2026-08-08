/**
 * Canvas — Phase 4 (drawing engine) + Phase 5 (placement editor)
 * -----------------------------------------------------------------------
 * Phase 4 gave every bar a correct *automatic* position. Phase 5 lets the
 * engineer grab any bar and drag it, with:
 *   - snap-to-perimeter (default on): the bar is constrained to its own
 *     group's rebar ring (cover + tie + bar radius from the face) —
 *     physically what a real cage allows — via Geometry.snapToRing.
 *   - grid snap (optional): rounds the committed position to 5mm.
 *   - symmetric drag (optional): moving one bar also moves its
 *     index-mirrored partner in the same group (i ↔ count-1-i) reflected
 *     across the vertical centerline, so symmetric layouts stay symmetric.
 *   - whole-layout Mirror / Rotate / Reset-to-auto, which bake the
 *     column's *current* effective positions (auto or already-hand-
 *     placed) through a transform and store the result as manual
 *     overrides on every group.
 *
 * A drag never touches App.state until pointerup — intermediate frames
 * are drawn by directly moving the affected <circle> elements, and the
 * single committed position is what goes through state.updateColumn
 * (one undo step per drag, not one per pixel).
 */
(function (global) {
  'use strict';

  const state = global.App.state;
  const bus = global.App.bus;
  const Geometry = global.App.Geometry;

  const stage = () => document.getElementById('canvas-stage');
  const viewport = () => document.getElementById('canvas-viewport');
  const emptyEl = () => document.getElementById('canvas-empty');
  const tooltipEl = () => document.getElementById('bar-tooltip');

  let scale = 1, panX = 60, panY = 40;
  let selectedBarKey = null;
  let dragState = null;

  const toolState = { snapPerimeter: true, gridSnap: false, symmetricDrag: false };

  // 1mm = 0.42px before user zoom — big enough that 8-40mm bars stay legible.
  const MM_TO_PX = 0.42;

  // ---------------------------------------------------------------- pan/zoom

  function applyTransform() {
    viewport().style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
    if (global.App.CadGrid) global.App.CadGrid.updateView(scale, panX, panY, 0, 0);
  }

  function zoomBy(factor, center) {
    const newScale = Math.max(0.2, Math.min(5, scale * factor));
    if (center) {
      panX = center.x - ((center.x - panX) * (newScale / scale));
      panY = center.y - ((center.y - panY) * (newScale / scale));
    }
    scale = newScale;
    applyTransform();
  }

  function resetView() { scale = 1; panX = 60; panY = 40; applyTransform(); }

  function initPanZoom() {
    const stageEl = stage();
    let panning = false, lastX = 0, lastY = 0, movedSinceDown = false;

    stageEl.addEventListener('wheel', (e) => {
      e.preventDefault();
      const rect = stageEl.getBoundingClientRect();
      zoomBy(e.deltaY < 0 ? 1.1 : 0.9, { x: e.clientX - rect.left, y: e.clientY - rect.top });
    }, { passive: false });

    stageEl.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.hud-btn') || e.target.closest('.mark-legend-dock') || e.target.closest('.placement-tools-dock')) return;
      panning = true;
      movedSinceDown = false;
      lastX = e.clientX;
      lastY = e.clientY;
      viewport().classList.add('panning');
    });

    window.addEventListener('pointermove', (e) => {
      // 1. Process drag pan if active
      if (panning) {
        if (Math.abs(e.clientX - lastX) > 2 || Math.abs(e.clientY - lastY) > 2) movedSinceDown = true;
        panX += (e.clientX - lastX);
        panY += (e.clientY - lastY);
        lastX = e.clientX;
        lastY = e.clientY;
        applyTransform();
      }

      // 2. Process crosshair and pointer location tracking
      if (global.App.CadGrid) {
        const rect = stageEl.getBoundingClientRect();
        const isOverStage = (
          e.clientX >= rect.left &&
          e.clientX <= rect.right &&
          e.clientY >= rect.top &&
          e.clientY <= rect.bottom
        );

        if (isOverStage) {
          const localX = e.clientX - rect.left;
          const localY = e.clientY - rect.top;
          const worldX = (localX - panX) / (scale * MM_TO_PX);
          const worldY = (panY - localY) / (scale * MM_TO_PX);
          global.App.CadGrid.setCursor({ x: worldX, y: worldY });
        } else {
          global.App.CadGrid.clearCursor();
        }
      }
    });

    window.addEventListener('pointerup', (e) => {
      const wasPanning = panning;
      panning = false;
      viewport().classList.remove('panning');
      if (wasPanning && !movedSinceDown && !e.target.closest('[data-bar-key]')) {
        selectedBarKey = null;
        render();
      }
    });

    stageEl.addEventListener('pointerleave', () => {
      if (global.App.CadGrid) global.App.CadGrid.clearCursor();
    });

    document.getElementById('hud-zoom-in').addEventListener('click', () => zoomBy(1.2));
    document.getElementById('hud-zoom-out').addEventListener('click', () => zoomBy(0.83));
    document.getElementById('hud-zoom-reset').addEventListener('click', resetView);
    document.getElementById('hud-export-svg').addEventListener('click', () => exportDrawing('svg'));
    document.getElementById('hud-export-png').addEventListener('click', () => exportDrawing('png'));
  }

  // -------------------------------------------------------------- svg helpers

  function svg(tag, attrs) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.keys(attrs || {}).forEach((k) => el.setAttribute(k, attrs[k]));
    return el;
  }

  function poly(vertices, attrs) {
    const pts = vertices.map((v) => `${(v.x * MM_TO_PX).toFixed(2)},${(v.y * MM_TO_PX).toFixed(2)}`).join(' ');
    return svg('polygon', Object.assign({ points: pts }, attrs));
  }

  const BAR_COLOR_KEYS = [8, 10, 12, 16, 20, 25, 32, 40];
  function nearestBarColorKey(d) {
    return BAR_COLOR_KEYS.reduce((best, k) => Math.abs(k - d) < Math.abs(best - d) ? k : best, BAR_COLOR_KEYS[0]);
  }

  // --------------------------------------------------- effective placement
  // (Geometry.groupPositions / Geometry.resolveBars are the shared source
  // of truth — used identically by the calc engine in models/calc.js so a
  // hand-dragged bar is reflected in both the drawing and the numbers.)
  const getEffectivePositions = (col, outline, edgeMap, group) => Geometry.groupPositions(col, outline, edgeMap, group);
  const getEffectiveBars = (col) => Geometry.resolveBars(col);

  // ------------------------------------------------------------------ render

  /** Builds a complete <svg> for a column — the exact same drawing logic
   *  whether it's the live interactive canvas or a static image for the
   *  Phase 8 PDF export. `interactive: false` skips attaching drag/hover
   *  handlers to each bar (a detached SVG has no listeners to attach
   *  anyway) and skips the "manual override" warning-tick styling noise
   *  that's only useful while actively editing. Returns both the <svg>
   *  root and the resolved bar list, since callers need the latter for
   *  the mark-legend table / BBS cross-reference. */
 function buildColumnSvg(col, opts) {
  const interactive = !opts || opts.interactive !== false;
  const { outline, bars } = getEffectiveBars(col);
  const centroid = Geometry.polygonCentroid(outline.vertices);
  const cover = col.geometry.clearCover || 40;
  const tie = col.ties || { diameter: 8, spacingEnd: 100, spacingMiddle: 150, hook: 135 };
  const tieDia = tie.diameter || 8;

  const bbox = boundsOf(outline.vertices);
  const svgW = (bbox.w * MM_TO_PX) + 280;
  const svgH = (bbox.h * MM_TO_PX) + 260;
  const svgRoot = svg('svg', { width: svgW, height: svgH, style: 'overflow:visible;' });
  
  // Defs for reusable markers/filters
  const defs = svg('defs');
  defs.appendChild(buildMarkerArrow());
  svgRoot.appendChild(defs);

  const group = svg('g', { transform: 'translate(60, 50)' });

  // --- 1. Concrete Cross-Section Fill & Outline ---
  if (outline.isCircle) {
    const r = outline.circle.r;
    circleAt(group, r, r, r, { fill: 'var(--bg-panel-alt)', stroke: 'var(--text-primary)', 'stroke-width': 2 });
    circleAt(group, r, r, Math.max(0, r - cover), { fill: 'none', stroke: 'var(--annotate)', 'stroke-width': 1, 'stroke-dasharray': '4 3' });
    circleAt(group, r, r, Math.max(0, r - cover - tieDia / 2), { fill: 'none', stroke: 'var(--text-secondary)', 'stroke-width': 1.4 });
  } else {
    // Solid Concrete Hatch / Surface
    group.appendChild(poly(outline.vertices, { fill: 'var(--bg-panel-alt)', stroke: 'var(--text-primary)', 'stroke-width': 2 }));
    // Clear Cover Reference Ring
    group.appendChild(poly(Geometry.offsetPolygon(outline.vertices, cover), { fill: 'none', stroke: 'var(--annotate)', 'stroke-width': 1, 'stroke-dasharray': '4 3' }));
    // Outer Tie Ring
    const tieVertices = Geometry.offsetPolygon(outline.vertices, cover + tieDia / 2);
    group.appendChild(poly(tieVertices, { fill: 'none', stroke: 'var(--text-secondary)', 'stroke-width': 1.5 }));
    
    // Draw 135° / 90° Seismic Hooks at Top-Left Corner Vertex
    addStirrupHooks(group, tieVertices, tieDia, tie.hook || 135);
  }

  // --- 2. Internal Ties / Cross-Links Layer ---
  const intLinkType = tie.internalLinkType || 'none';
  if (intLinkType !== 'none') {
    const linkPaths = Geometry.buildInternalLinkPaths(bars, intLinkType);
    const linksLayer = svg('g', { id: 'internal-links-layer' });

    linkPaths.forEach((path) => {
      if (path.type === 'closed' && path.vertices) {
        linksLayer.appendChild(poly(path.vertices, {
          fill: 'none', stroke: 'var(--text-secondary)', 'stroke-width': 1.2, 'stroke-dasharray': '4 2'
        }));
      } else if (path.type === 'line' && path.start && path.end) {
        linksLayer.appendChild(svg('line', {
          x1: path.start.x * MM_TO_PX, y1: path.start.y * MM_TO_PX,
          x2: path.end.x * MM_TO_PX, y2: path.end.y * MM_TO_PX,
          stroke: 'var(--text-secondary)', 'stroke-width': 1.2, 'stroke-dasharray': '4 2'
        }));
      }
    });
    group.appendChild(linksLayer);
  }

  // --- 3. Architectural Dimension Lines ---
  if (outline.isCircle) {
    addDim(group, 0, bbox.h * MM_TO_PX + 28, bbox.w * MM_TO_PX, `⌀ ${col.geometry.diameter} mm`, false);
  } else {
    addDim(group, 0, bbox.h * MM_TO_PX + 28, bbox.w * MM_TO_PX, `${Math.round(bbox.w)} mm`, false);
    addDim(group, bbox.w * MM_TO_PX + 28, 0, bbox.h * MM_TO_PX, `${Math.round(bbox.h)} mm`, true);
  }

  // --- 4. Centroid Mark ---
  addCentroid(group, centroid.x * MM_TO_PX, centroid.y * MM_TO_PX);

  // --- 5. Longitudinal Bars Rendering ---
  const barsLayer = svg('g', { id: 'bars-layer' });
  bars.forEach((bar) => {
    const key = `${bar.groupId}:${bar.indexInGroup}`;
    const px = bar.x * MM_TO_PX, py = bar.y * MM_TO_PX;
    const r = Math.max(2.5, (bar.diameter / 2) * MM_TO_PX);
    const colorKey = nearestBarColorKey(bar.diameter);
    const isSelected = interactive && key === selectedBarKey;

    const wrap = svg('g', { 'data-bar-key': key, style: interactive ? 'cursor:grab;' : '' });
    wrap.appendChild(svg('circle', { cx: px, cy: py, r: r + 5, fill: 'transparent' }));
    wrap.appendChild(svg('circle', {
      cx: px, cy: py, r,
      fill: `var(--bar-${colorKey})`,
      stroke: isSelected ? 'var(--accent)' : 'var(--bg-canvas)',
      'stroke-width': isSelected ? 2.5 : 1,
    }));
    if (isSelected) {
      wrap.appendChild(svg('circle', { cx: px, cy: py, r: r + 4, fill: 'none', stroke: 'var(--accent)', 'stroke-width': 1, 'stroke-dasharray': '3 2' }));
    }
    if (bar.manual && interactive) {
      wrap.appendChild(svg('rect', { x: px - r - 6, y: py - r - 6, width: 4, height: 4, fill: 'var(--warning)' }));
    }
    if (interactive) wireBarInteraction(wrap, col, bar);
    barsLayer.appendChild(wrap);
  });
  group.appendChild(barsLayer);

  // --- 6. Stirrup / Tie Annotation Leader ---
  addTieCallout(group, outline, cover, tie);

  // --- 7. Longitudinal Group Leader Badges (Engineering Notation) ---
  const markedGroups = new Set();
  bars.forEach((bar) => {
    if (markedGroups.has(bar.groupId)) return;
    markedGroups.add(bar.groupId);

    const groupBars = bars.filter(b => b.groupId === bar.groupId);
    const dx = bar.x - centroid.x, dy = bar.y - centroid.y;
    const len = Math.hypot(dx, dy) || 1;
    const dir = { x: dx / len, y: dy / len };
    const barR = Math.max(2.5, (bar.diameter / 2) * MM_TO_PX);

    const startX = bar.x * MM_TO_PX + dir.x * barR;
    const startY = bar.y * MM_TO_PX + dir.y * barR;
    const endX = startX + dir.x * 24;
    const endY = startY + dir.y * 24;

    // Leader Line
    group.appendChild(svg('line', { x1: startX, y1: startY, x2: endX, y2: endY, stroke: 'var(--annotate)', 'stroke-width': 1.2 }));
    
    // Callout Tag Badge: e.g. "Mk 1: 4-T16"
    const calloutText = `#${bar.markNumber} (${groupBars.length}-T${bar.diameter})`;
    const textWidth = calloutText.length * 6.5 + 12;
    
    const tagBg = svg('rect', {
      x: endX - textWidth / 2, y: endY - 10, width: textWidth, height: 18, rx: 3,
      fill: 'var(--bg-panel)', stroke: 'var(--annotate)', 'stroke-width': 1
    });
    const tagText = svg('text', {
      x: endX, y: endY + 3, 'font-size': 9.5, fill: 'var(--annotate)',
      'text-anchor': 'middle', 'font-weight': 700, 'font-family': 'var(--font-mono)'
    });
    tagText.textContent = calloutText;

    group.appendChild(tagBg);
    group.appendChild(tagText);
  });

  // --- 8. Concrete Title & Material Stamp Block ---
  addTitleStamp(group, col, bbox);

  svgRoot.appendChild(group);
  return { svgRoot, bars };
}

/**
 * Draws 135° / 90° Hook Overlaps on Stirrup Rings.
 */
function addStirrupHooks(group, vertices, tieDia, angle) {
  if (!vertices || vertices.length < 3) return;
  const p0 = vertices[0]; // Top-left corner
  const px = p0.x * MM_TO_PX;
  const py = p0.y * MM_TO_PX;
  const hookLen = Math.max(12, tieDia * 10 * MM_TO_PX);

  // Hook 1: 45° Inward Extension
  const h1x = px + hookLen * Math.cos(Math.PI / 4);
  const h1y = py + hookLen * Math.sin(Math.PI / 4);
  group.appendChild(svg('line', { x1: px, y1: py, x2: h1x, y2: h1y, stroke: 'var(--text-secondary)', 'stroke-width': 1.5 }));

  // Hook 2: Overlapping Hook
  const offset = 3;
  const h2x = (px + offset) + hookLen * Math.cos(Math.PI / 4 + 0.1);
  const h2y = (py + offset) + hookLen * Math.sin(Math.PI / 4 + 0.1);
  group.appendChild(svg('line', { x1: px + offset, y1: py + offset, x2: h2x, y2: h2y, stroke: 'var(--text-secondary)', 'stroke-width': 1.5 }));
}
/**
 * Stirrup / Tie Callout Annotation Pointer.
 */
function addTieCallout(group, outline, cover, tie) {
  const tieDia = tie.diameter || 8;
  const spEnd = tie.spacingEnd || 100;
  const spMid = tie.spacingMiddle || 150;
  
  const calloutText = `T${tieDia} @ ${spEnd}/${spMid} c/c (${tie.hook || 135}° hook)`;
  
  // Point leader to top-right edge of stirrup
  const startX = (outline.isCircle ? outline.circle.r * 1.5 : outline.vertices[1].x - cover) * MM_TO_PX;
  const startY = (outline.isCircle ? outline.circle.r * 0.5 : outline.vertices[1].y + cover) * MM_TO_PX;
  const endX = startX + 35;
  const endY = startY - 20;

  group.appendChild(svg('line', { x1: startX, y1: startY, x2: endX, y2: endY, stroke: 'var(--text-secondary)', 'stroke-width': 1, 'stroke-dasharray': '2 2' }));
  group.appendChild(svg('circle', { cx: startX, cy: startY, r: 2.5, fill: 'var(--text-secondary)' }));

  const bg = svg('rect', { x: endX, y: endY - 11, width: calloutText.length * 6.2 + 10, height: 16, rx: 2, fill: 'var(--bg-panel)', stroke: 'var(--border)', 'stroke-width': 1 });
  const t = svg('text', { x: endX + 5, y: endY + 1, fill: 'var(--text-secondary)', 'font-size': 9, 'font-weight': 600, 'font-family': 'var(--font-mono)' });
  t.textContent = calloutText;

  group.appendChild(bg);
  group.appendChild(t);
}
/**
 * Section Title Block / Engineering Stamp Header.
 */
function addTitleStamp(group, col, bbox) {
  const titleG = svg('g', { transform: 'translate(0, -32)' });
  
  const t1 = svg('text', { x: 0, y: 0, fill: 'var(--text-primary)', 'font-size': 13, 'font-weight': 800, 'font-family': 'var(--font-mono)' });
  t1.textContent = `${col.name} — ${App.ColumnTypes[col.type].label}`;
  
  const t2 = svg('text', { x: 0, y: 15, fill: 'var(--text-muted)', 'font-size': 9.5, 'font-weight': 600, 'font-family': 'var(--font-mono)' });
  const areaM2 = (Geometry.grossAreaMm2(col) / 1e6).toFixed(3);
  t2.textContent = `Grade: ${col.concreteGrade} | Steel: ${col.steelGrade} | Cover: ${col.geometry.clearCover || 40}mm | Ag: ${areaM2} m²`;

  titleG.appendChild(t1);
  titleG.appendChild(t2);
  group.appendChild(titleG);
}

function buildMarkerArrow() {
  const m = svg('marker', { id: 'arrow', viewBox: '0 0 10 10', refX: '5', refY: '5', markerWidth: '6', markerHeight: '6', orient: 'auto-start-reverse' });
  m.appendChild(svg('path', { d: 'M 0 0 L 10 5 L 0 10 z', fill: 'var(--annotate)' }));
  return m;
}
  function render() {
    const col = state.getSelected();
    viewport().innerHTML = '';
    if (!col) { emptyEl().style.display = 'flex'; return; }
    emptyEl().style.display = 'none';

    const { svgRoot, bars } = buildColumnSvg(col, { interactive: true });
    viewport().appendChild(svgRoot);
    renderMarkLegend(col, bars);
  }

  function boundsOf(vertices) {
    const xs = vertices.map((v) => v.x), ys = vertices.map((v) => v.y);
    return { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  }

  function circleAt(group, cx, cy, r, attrs) {
    group.appendChild(svg('circle', Object.assign({ cx: cx * MM_TO_PX, cy: cy * MM_TO_PX, r: r * MM_TO_PX }, attrs)));
  }

/**
 * Enhanced Architectural Dimension Lines with 45° Slash Ticks & Text Badges.
 */
function addDim(group, x, y, length, text, vertical) {
  const g = svg('g', { class: 'dim-annotation' });
  const tick = 4;

  if (vertical) {
    // Extension Lines
    g.appendChild(svg('line', { x1: x - 6, y1: y, x2: x + 6, y2: y, stroke: 'var(--annotate)', 'stroke-width': 0.8, 'stroke-opacity': 0.6 }));
    g.appendChild(svg('line', { x1: x - 6, y1: y + length, x2: x + 6, y2: y + length, stroke: 'var(--annotate)', 'stroke-width': 0.8, 'stroke-opacity': 0.6 }));
    
    // Main Dimension Line
    g.appendChild(svg('line', { x1: x, y1: y, x2: x, y2: y + length, stroke: 'var(--annotate)', 'stroke-width': 1.2 }));
    
    // 45° Architectural Ticks
    g.appendChild(svg('line', { x1: x - tick, y1: y + tick, x2: x + tick, y2: y - tick, stroke: 'var(--annotate)', 'stroke-width': 1.6 }));
    g.appendChild(svg('line', { x1: x - tick, y1: y + length + tick, x2: x + tick, y2: y + length - tick, stroke: 'var(--annotate)', 'stroke-width': 1.6 }));
    
    // Text Badge
    const bg = svg('rect', { x: x + 8, y: y + length / 2 - 9, width: text.length * 7 + 10, height: 18, rx: 3, fill: 'var(--bg-panel)', stroke: 'var(--border)', 'stroke-width': 1 });
    const t = svg('text', { x: x + 8 + (text.length * 7 + 10) / 2, y: y + length / 2 + 3.5, fill: 'var(--annotate)', 'font-size': 10, 'font-weight': 700, 'text-anchor': 'middle', 'font-family': 'var(--font-mono)' });
    t.textContent = text;
    g.appendChild(bg); g.appendChild(t);
  } else {
    // Extension Lines
    g.appendChild(svg('line', { x1: x, y1: y - 6, x2: x, y2: y + 6, stroke: 'var(--annotate)', 'stroke-width': 0.8, 'stroke-opacity': 0.6 }));
    g.appendChild(svg('line', { x1: x + length, y1: y - 6, x2: x + length, y2: y + 6, stroke: 'var(--annotate)', 'stroke-width': 0.8, 'stroke-opacity': 0.6 }));
    
    // Main Dimension Line
    g.appendChild(svg('line', { x1: x, y1: y, x2: x + length, y2: y, stroke: 'var(--annotate)', 'stroke-width': 1.2 }));
    
    // 45° Architectural Ticks
    g.appendChild(svg('line', { x1: x - tick, y1: y + tick, x2: x + tick, y2: y - tick, stroke: 'var(--annotate)', 'stroke-width': 1.6 }));
    g.appendChild(svg('line', { x1: x + length - tick, y1: y + tick, x2: x + length + tick, y2: y - tick, stroke: 'var(--annotate)', 'stroke-width': 1.6 }));
    
    // Text Badge
    const bg = svg('rect', { x: x + length / 2 - (text.length * 7 + 10) / 2, y: y + 8, width: text.length * 7 + 10, height: 18, rx: 3, fill: 'var(--bg-panel)', stroke: 'var(--border)', 'stroke-width': 1 });
    const t = svg('text', { x: x + length / 2, y: y + 20.5, fill: 'var(--annotate)', 'font-size': 10, 'font-weight': 700, 'text-anchor': 'middle', 'font-family': 'var(--font-mono)' });
    t.textContent = text;
    g.appendChild(bg); g.appendChild(t);
  }
  group.appendChild(g);
}

  function addCentroid(group, cx, cy) {
    const g = svg('g', { stroke: 'var(--danger)', 'stroke-width': 1 });
    g.appendChild(svg('line', { x1: cx - 7, y1: cy, x2: cx + 7, y2: cy }));
    g.appendChild(svg('line', { x1: cx, y1: cy - 7, x2: cx, y2: cy + 7 }));
    group.appendChild(g);
  }

  // ------------------------------------------------------------- bar drag

  function wireBarInteraction(wrap, col, bar) {
    wrap.addEventListener('pointerenter', (e) => { if (!dragState) showTooltip(e, bar); });
    wrap.addEventListener('pointermove', (e) => { if (!dragState) moveTooltip(e); });
    wrap.addEventListener('pointerleave', () => { if (!dragState) hideTooltip(); });
    wrap.addEventListener('pointerdown', (e) => {
      e.stopPropagation(); // never let this bubble to the pan handler
      startBarDrag(e, col, bar);
    });
  }

  function startBarDrag(e, col, bar) {
    const group = col.bars.find((g) => g.id === bar.groupId);
    if (!group) return;
    const outline = Geometry.buildOutline(col);
    const edgeMap = Geometry.classifyEdges(outline.vertices);
    const positions = getEffectivePositions(col, outline, edgeMap, group);
    const depth = Geometry.groupDepth(col, group);

    dragState = {
      col, group,
      barIndex: bar.indexInGroup,
      key: `${bar.groupId}:${bar.indexInGroup}`,
      startClientX: e.clientX, startClientY: e.clientY,
      startX: positions[bar.indexInGroup].x, startY: positions[bar.indexInGroup].y,
      positions,
      insetShape: Geometry.insetShapeForGroup(outline, depth),
      centroid: Geometry.polygonCentroid(outline.vertices),
      moved: false,
    };
    hideTooltip();
    window.addEventListener('pointermove', onBarDragMove);
    window.addEventListener('pointerup', onBarDragEnd);
  }

  function onBarDragMove(e) {
    if (!dragState) return;
    const dxScreen = e.clientX - dragState.startClientX;
    const dyScreen = e.clientY - dragState.startClientY;
    if (!dragState.moved && (Math.abs(dxScreen) > 3 || Math.abs(dyScreen) > 3)) dragState.moved = true;
    if (!dragState.moved) return;

    const dxMm = dxScreen / (scale * MM_TO_PX);
    const dyMm = dyScreen / (scale * MM_TO_PX);
    let newX = dragState.startX + dxMm;
    let newY = dragState.startY + dyMm;

    if (toolState.snapPerimeter) {
      const snapped = Geometry.snapToRing({ x: newX, y: newY }, dragState.insetShape);
      newX = snapped.x; newY = snapped.y;
    }
    if (toolState.gridSnap) { newX = Math.round(newX / 5) * 5; newY = Math.round(newY / 5) * 5; }

    dragState.positions[dragState.barIndex] = { x: newX, y: newY };

    const movedIdxs = [dragState.barIndex];
    if (toolState.symmetricDrag) {
      const n = dragState.positions.length;
      const partner = n - 1 - dragState.barIndex;
      if (partner !== dragState.barIndex) {
        dragState.positions[partner] = { x: 2 * dragState.centroid.x - newX, y: newY };
        movedIdxs.push(partner);
      }
    }
    liveUpdateBarPositions(dragState.group.id, movedIdxs, dragState.positions);
  }

  function liveUpdateBarPositions(groupId, indices, positions) {
    indices.forEach((idx) => {
      const el = viewport().querySelector(`[data-bar-key="${groupId}:${idx}"]`);
      if (!el) return;
      const px = positions[idx].x * MM_TO_PX, py = positions[idx].y * MM_TO_PX;
      el.querySelectorAll('circle').forEach((c) => { c.setAttribute('cx', px); c.setAttribute('cy', py); });
    });
  }

  function onBarDragEnd() {
    window.removeEventListener('pointermove', onBarDragMove);
    window.removeEventListener('pointerup', onBarDragEnd);
    if (!dragState) return;
    const { col, group, moved, key, positions } = dragState;

    if (moved) {
      group.manualPositions = positions.map((p) => ({ x: round1(p.x), y: round1(p.y) }));
      state.updateColumn(col.id, { bars: col.bars });
      global.App.Toast.show('Bar position updated');
    } else {
      selectedBarKey = (selectedBarKey === key ? null : key);
      render();
    }
    dragState = null;
  }

  function round1(v) { return Math.round(v * 10) / 10; }

  // ---------------------------------------------------- whole-layout tools

  /** Applies transformFn(point, centroid) to every group's current
   *  effective positions and bakes the result as each group's manual
   *  override — this is how Mirror/Rotate work on top of a mix of
   *  auto-placed and already hand-placed groups. */
  function transformWholeLayout(col, transformFn) {
    const outline = Geometry.buildOutline(col);
    const edgeMap = Geometry.classifyEdges(outline.vertices);
    const centroid = Geometry.polygonCentroid(outline.vertices);
    col.bars.forEach((group) => {
      const positions = getEffectivePositions(col, outline, edgeMap, group);
      group.manualPositions = positions.map((p) => {
        const t = transformFn(p, centroid);
        return { x: round1(t.x), y: round1(t.y) };
      });
    });
    state.updateColumn(col.id, { bars: col.bars });
  }

  function mirrorHorizontal(col) { // flip left-right across the vertical centerline
    transformWholeLayout(col, (p, c) => ({ x: 2 * c.x - p.x, y: p.y }));
  }
  function mirrorVertical(col) { // flip top-bottom across the horizontal centerline
    transformWholeLayout(col, (p, c) => ({ x: p.x, y: 2 * c.y - p.y }));
  }
  function rotate90(col, dir) { // dir: 1 = CW, -1 = CCW (screen coords, y-down)
    transformWholeLayout(col, (p, c) => {
      const dx = p.x - c.x, dy = p.y - c.y;
      return dir > 0 ? { x: c.x - dy, y: c.y + dx } : { x: c.x + dy, y: c.y - dx };
    });
  }
  function resetLayout(col) {
    col.bars.forEach((g) => { g.manualPositions = null; });
    state.updateColumn(col.id, { bars: col.bars });
  }

  function initPlacementTools() {
    const withSelected = (fn) => () => {
      const col = state.getSelected();
      if (!col) { global.App.Toast.show('Select a column first', { danger: true }); return; }
      fn(col);
    };

    document.getElementById('pt-mirror-h').addEventListener('click', withSelected((col) => {
      mirrorHorizontal(col); global.App.Toast.show('Mirrored left/right');
    }));
    document.getElementById('pt-mirror-v').addEventListener('click', withSelected((col) => {
      mirrorVertical(col); global.App.Toast.show('Mirrored top/bottom');
    }));
    document.getElementById('pt-rotate-cw').addEventListener('click', withSelected((col) => {
      warnIfAsymmetricRotate(col);
      rotate90(col, 1); global.App.Toast.show('Rotated 90° clockwise');
    }));
    document.getElementById('pt-rotate-ccw').addEventListener('click', withSelected((col) => {
      warnIfAsymmetricRotate(col);
      rotate90(col, -1); global.App.Toast.show('Rotated 90° counter-clockwise');
    }));
    document.getElementById('pt-reset').addEventListener('click', withSelected((col) => {
      resetLayout(col); global.App.Toast.show('Layout reset to automatic placement');
    }));

    document.getElementById('pt-snap-perimeter').addEventListener('change', (e) => { toolState.snapPerimeter = e.target.checked; });
    document.getElementById('pt-grid-snap').addEventListener('change', (e) => { toolState.gridSnap = e.target.checked; });
    document.getElementById('pt-symmetric-drag').addEventListener('change', (e) => { toolState.symmetricDrag = e.target.checked; });
  }

  function warnIfAsymmetricRotate(col) {
    if (col.type === 'rectangle' || col.type === 'lshape' || col.type === 'tshape') {
      global.App.Toast.show('Note: this rotates the bar layout only — the concrete outline itself is not rotated.');
    }
  }

  // ---------------------------------------------------------------- tooltip

  function showTooltip(e, bar) {
    const tip = tooltipEl();
    tip.innerHTML = `<strong>Mark ${bar.markNumber}</strong> — Ø${bar.diameter}mm<br>${bar.placement} · bar ${bar.indexInGroup + 1} of ${bar.countInGroup}${bar.spacingToNext ? `<br>spacing → next: ${bar.spacingToNext}mm` : ''}${bar.manual ? '<br><em>hand-placed</em>' : ''}<br><span class="text-muted">drag to reposition</span>`;
    tip.style.display = 'block';
    moveTooltip(e);
  }
  function moveTooltip(e) {
    const tip = tooltipEl();
    const stageRect = stage().getBoundingClientRect();
    tip.style.left = (e.clientX - stageRect.left + 14) + 'px';
    tip.style.top = (e.clientY - stageRect.top + 14) + 'px';
  }
  function hideTooltip() { tooltipEl().style.display = 'none'; }

  // ------------------------------------------------------------- mark legend

  function renderMarkLegend(col, bars) {
    const el = document.getElementById('mark-legend');
    const byGroup = {};
    bars.forEach((b) => { (byGroup[b.groupId] = byGroup[b.groupId] || []).push(b); });
    const rows = col.bars.map((g) => {
      const groupBars = byGroup[g.id] || [];
      const mark = groupBars[0] ? groupBars[0].markNumber : '—';
      const manual = groupBars[0] && groupBars[0].manual;
      return `<tr>
        <td>${mark}</td>
        <td><span class="swatch" style="background:var(--bar-${nearestBarColorKey(g.diameter)});display:inline-block;"></span> T${g.diameter}</td>
        <td>${groupBars.length}</td>
        <td>${g.placement}${manual ? ' <span class="badge badge-neutral" style="margin-left:3px;">hand</span>' : ''}</td>
      </tr>`;
    }).join('');
    el.innerHTML = `
      <table class="mark-table">
        <thead><tr><th>Mark</th><th>Dia</th><th>Nos</th><th>Placement</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
  }

  // ---------------------------------------------------------------- export

  function resolvedCssVars() {
    const cs = getComputedStyle(document.documentElement);
    const names = [
      '--bg-panel-alt', '--bg-panel', '--bg-canvas', '--text-primary', '--text-secondary',
      '--text-muted', '--annotate', '--danger', '--accent', '--warning',
      ...BAR_COLOR_KEYS.map((k) => `--bar-${k}`),
    ];
    const map = {};
    names.forEach((n) => { map[n] = cs.getPropertyValue(n).trim(); });
    return map;
  }

  function serializeSvgElement(svgEl) {
    if (!svgEl) return null;
    const clone = svgEl.cloneNode(true);
    const varMap = resolvedCssVars();
    clone.querySelectorAll('*').forEach((node) => {
      ['fill', 'stroke'].forEach((attr) => {
        const val = node.getAttribute(attr);
        if (val && val.startsWith('var(')) {
          const name = val.slice(4, -1).trim();
          node.setAttribute(attr, varMap[name] || '#888');
        }
      });
    });
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    const bgRect = svg('rect', { x: -40, y: -40, width: clone.getAttribute('width'), height: clone.getAttribute('height'), fill: varMap['--bg-canvas'] });
    clone.insertBefore(bgRect, clone.firstChild);
    return new XMLSerializer().serializeToString(clone);
  }

  /** Rasterizes any (live or detached) <svg> element to a PNG data URL.
   *  Promise-based so the Phase 8 PDF export can await one per column
   *  without touching the live canvas or the user's current selection. */
  function svgElementToPngDataUrl(svgEl, scaleFactor) {
    return new Promise((resolve, reject) => {
      const svgString = serializeSvgElement(svgEl);
      if (!svgString) { reject(new Error('No SVG to rasterize')); return; }
      const w = parseFloat(svgEl.getAttribute('width'));
      const h = parseFloat(svgEl.getAttribute('height'));
      const factor = scaleFactor || 2;
      const img = new Image();
      const url = URL.createObjectURL(new Blob([svgString], { type: 'image/svg+xml' }));
      img.onload = () => {
        const canvasEl = document.createElement('canvas');
        canvasEl.width = w * factor; canvasEl.height = h * factor;
        const ctx = canvasEl.getContext('2d');
        ctx.scale(factor, factor);
        ctx.drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        resolve({ dataUrl: canvasEl.toDataURL('image/png'), widthPx: w, heightPx: h });
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('SVG rasterization failed')); };
      img.src = url;
    });
  }

  /** Renders an ARBITRARY column (not necessarily the one currently
   *  selected/shown on the live canvas) to a PNG data URL — this is what
   *  the Phase 8 PDF report calls once per column to get its drawing,
   *  without disturbing the user's current view or selection. */
  function getColumnPngDataUrl(col, scaleFactor) {
    const { svgRoot } = buildColumnSvg(col, { interactive: false });
    return svgElementToPngDataUrl(svgRoot, scaleFactor);
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  function exportDrawing(kind) {
    const col = state.getSelected();
    if (!col) { global.App.Toast.show('Select a column first', { danger: true }); return; }
    const svgString = serializeSvgElement(viewport().querySelector('svg'));
    if (!svgString) return;
    const safeName = `${col.name}_cross_section`.replace(/[^a-z0-9\-_]+/gi, '_');

    if (kind === 'svg') {
      downloadBlob(new Blob([svgString], { type: 'image/svg+xml' }), `${safeName}.svg`);
      global.App.Toast.show('Exported as SVG');
      return;
    }

    const svgEl = viewport().querySelector('svg');
    const w = parseFloat(svgEl.getAttribute('width'));
    const h = parseFloat(svgEl.getAttribute('height'));
    const scaleFactor = 2;
    const img = new Image();
    const svgBlob = new Blob([svgString], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(svgBlob);
    img.onload = () => {
      const canvasEl = document.createElement('canvas');
      canvasEl.width = w * scaleFactor; canvasEl.height = h * scaleFactor;
      const ctx = canvasEl.getContext('2d');
      ctx.scale(scaleFactor, scaleFactor);
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      canvasEl.toBlob((blob) => {
        downloadBlob(blob, `${safeName}.png`);
        global.App.Toast.show('Exported as PNG');
      }, 'image/png');
    };
    img.onerror = () => global.App.Toast.show('PNG export failed — try SVG export instead', { danger: true });
    img.src = url;
  }

  // -------------------------------------------------------------------- init

  function init() {
    if (global.App.CadGrid) global.App.CadGrid.init();
    initPanZoom();
    initPlacementTools();
    applyTransform();
    bus.on('state:selected', render);
    bus.on('state:changed', render);
    bus.on('state:loaded', render);
    render();
  }

  global.App = global.App || {};
  global.App.Canvas = { init, render, getColumnPngDataUrl };
})(window);
