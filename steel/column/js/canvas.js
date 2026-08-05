/**
 * Canvas
 * -----------------------------------------------------------------------
 * Phase 1–3 scope: a live SVG *outline* preview of the selected column's
 * cross-section (shape + cover line + centroid), with working pan/zoom
 * chrome, so the workspace is real and not a dead placeholder.
 *
 * What this deliberately does NOT do yet (arrives in Phase 4):
 *   - accurate bar placement geometry, bar callouts, leader lines,
 *     dimension strings, spacing annotations, hover/selection effects,
 *     AutoCAD-grade detailing, drawing export.
 * That work reads App.state the same way this file does — this phase's
 * job was to make sure the pan/zoom/viewport plumbing already works so
 * Phase 4 only has to add drawing, not infrastructure.
 */
(function (global) {
  'use strict';

  const state = global.App.state;
  const bus = global.App.bus;

  const stage = () => document.getElementById('canvas-stage');
  const viewport = () => document.getElementById('canvas-viewport');
  const emptyEl = () => document.getElementById('canvas-empty');

  let scale = 1;
  let panX = 60;
  let panY = 60;

  function applyTransform() {
    viewport().style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
  }

  function zoomBy(factor, center) {
    const newScale = Math.max(0.2, Math.min(4, scale * factor));
    if (center) {
      // keep the point under the cursor stationary while zooming
      panX = center.x - ((center.x - panX) * (newScale / scale));
      panY = center.y - ((center.y - panY) * (newScale / scale));
    }
    scale = newScale;
    applyTransform();
  }

  function resetView() {
    scale = 1; panX = 60; panY = 60;
    applyTransform();
  }

  function initPanZoom() {
    const stageEl = stage();
    let dragging = false, lastX = 0, lastY = 0;

    stageEl.addEventListener('wheel', (e) => {
      e.preventDefault();
      const rect = stageEl.getBoundingClientRect();
      const center = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      zoomBy(e.deltaY < 0 ? 1.1 : 0.9, center);
    }, { passive: false });

    stageEl.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.hud-btn')) return;
      dragging = true; lastX = e.clientX; lastY = e.clientY;
      viewport().classList.add('panning');
    });
    window.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      panX += (e.clientX - lastX); panY += (e.clientY - lastY);
      lastX = e.clientX; lastY = e.clientY;
      applyTransform();
    });
    window.addEventListener('pointerup', () => { dragging = false; viewport().classList.remove('panning'); });

    document.getElementById('hud-zoom-in').addEventListener('click', () => zoomBy(1.2));
    document.getElementById('hud-zoom-out').addEventListener('click', () => zoomBy(0.83));
    document.getElementById('hud-zoom-reset').addEventListener('click', resetView);
  }

  /** mm -> px at a fixed drawing scale (1mm = 0.3px before user zoom) so a
   *  typical 450–600mm column renders at a comfortable on-screen size. */
  const MM_TO_PX = 0.3;

  function svg(tag, attrs) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.keys(attrs || {}).forEach((k) => el.setAttribute(k, attrs[k]));
    return el;
  }

  function outlinePoints(col) {
    const g = col.geometry;
    switch (col.type) {
      case 'square': {
        const s = g.side * MM_TO_PX;
        return { kind: 'rect', w: s, h: s };
      }
      case 'rectangle': {
        return { kind: 'rect', w: g.length * MM_TO_PX, h: g.width * MM_TO_PX };
      }
      case 'circular': {
        return { kind: 'circle', r: (g.diameter / 2) * MM_TO_PX };
      }
      case 'polygon': {
        return { kind: 'polygon', r: (g.circumDiameter / 2) * MM_TO_PX, sides: Math.max(3, g.sides) };
      }
      case 'lshape': {
        const L = g.length * MM_TO_PX, W = g.width * MM_TO_PX, t1 = g.flangeThk1 * MM_TO_PX, t2 = g.flangeThk2 * MM_TO_PX;
        return { kind: 'path', d: `M0,0 L${L},0 L${L},${t1} L${t2},${t1} L${t2},${W} L0,${W} Z`, w: L, h: W };
      }
      case 'tshape': {
        const L = g.length * MM_TO_PX, W = g.width * MM_TO_PX, ft = g.flangeThk * MM_TO_PX, wt = g.webThk * MM_TO_PX;
        const webX = (L - wt) / 2;
        return { kind: 'path', d: `M0,0 L${L},0 L${L},${ft} L${webX + wt},${ft} L${webX + wt},${W} L${webX},${W} L${webX},${ft} L0,${ft} Z`, w: L, h: W };
      }
      default: {
        return { kind: 'rect', w: (g.boundingLength || 600) * MM_TO_PX, h: (g.boundingWidth || 600) * MM_TO_PX };
      }
    }
  }

  function render() {
    const col = state.getSelected();
    viewport().innerHTML = '';
    if (!col) { emptyEl().style.display = 'flex'; return; }
    emptyEl().style.display = 'none';

    const shape = outlinePoints(col);
    const cover = (col.geometry.clearCover || 40) * MM_TO_PX;
    const strokeColor = 'var(--text-secondary)';
    const svgRoot = svg('svg', { width: 900, height: 600, style: 'overflow:visible;' });

    const group = svg('g', { transform: 'translate(20,20)' });

    if (shape.kind === 'rect') {
      group.appendChild(svg('rect', { x: 0, y: 0, width: shape.w, height: shape.h, fill: 'var(--bg-panel-alt)', stroke: 'var(--text-primary)', 'stroke-width': 2 }));
      group.appendChild(svg('rect', { x: cover, y: cover, width: Math.max(0, shape.w - 2 * cover), height: Math.max(0, shape.h - 2 * cover), fill: 'none', stroke: 'var(--annotate)', 'stroke-width': 1, 'stroke-dasharray': '4 3' }));
      addDim(group, 0, shape.h + 24, shape.w, `${col.geometry.length || col.geometry.side} mm`);
      addDim(group, shape.w + 24, 0, shape.h, `${col.geometry.width || col.geometry.side} mm`, true);
      addCentroid(group, shape.w / 2, shape.h / 2);
    } else if (shape.kind === 'circle') {
      group.appendChild(svg('circle', { cx: shape.r, cy: shape.r, r: shape.r, fill: 'var(--bg-panel-alt)', stroke: 'var(--text-primary)', 'stroke-width': 2 }));
      group.appendChild(svg('circle', { cx: shape.r, cy: shape.r, r: Math.max(0, shape.r - cover), fill: 'none', stroke: 'var(--annotate)', 'stroke-width': 1, 'stroke-dasharray': '4 3' }));
      addDim(group, 0, shape.r * 2 + 24, shape.r * 2, `⌀ ${col.geometry.diameter} mm`);
      addCentroid(group, shape.r, shape.r);
    } else if (shape.kind === 'polygon') {
      const pts = regularPolygonPoints(shape.r, shape.sides, shape.r, shape.r);
      group.appendChild(svg('polygon', { points: pts, fill: 'var(--bg-panel-alt)', stroke: 'var(--text-primary)', 'stroke-width': 2 }));
      const innerPts = regularPolygonPoints(Math.max(0, shape.r - cover), shape.sides, shape.r, shape.r);
      group.appendChild(svg('polygon', { points: innerPts, fill: 'none', stroke: 'var(--annotate)', 'stroke-width': 1, 'stroke-dasharray': '4 3' }));
      addDim(group, 0, shape.r * 2 + 24, shape.r * 2, `${col.geometry.sides}-sided, ⌀${col.geometry.circumDiameter}mm`);
      addCentroid(group, shape.r, shape.r);
    } else if (shape.kind === 'path') {
      group.appendChild(svg('path', { d: shape.d, fill: 'var(--bg-panel-alt)', stroke: 'var(--text-primary)', 'stroke-width': 2 }));
      addDim(group, 0, shape.h + 24, shape.w, `${col.geometry.length} mm`);
      addDim(group, shape.w + 24, 0, shape.h, `${col.geometry.width} mm`, true);
      addCentroid(group, shape.w / 2, shape.h / 2);
    }

    // Bar-group legend chips near the shape — real placement geometry is Phase 5.
    const legend = svg('g', { transform: `translate(0, ${(shape.h || shape.r * 2 || 300) + 60})` });
    col.bars.forEach((bar, i) => {
      const y = i * 20;
      legend.appendChild(svg('circle', { cx: 6, cy: y + 6, r: 6, fill: `var(--bar-${nearestBarColorKey(bar.diameter)})` }));
      const text = svg('text', { x: 20, y: y + 10, fill: 'var(--text-secondary)', 'font-size': 12, 'font-family': 'var(--font-mono)' });
      text.textContent = `${bar.count}-T${bar.diameter} (${bar.placement})`;
      legend.appendChild(text);
    });
    group.appendChild(legend);

    const label = svg('text', { x: 0, y: -14, fill: 'var(--text-primary)', 'font-size': 14, 'font-weight': 700, 'font-family': 'var(--font-mono)' });
    label.textContent = `${col.name} — ${App.ColumnTypes[col.type].label} preview`;
    group.appendChild(label);

    svgRoot.appendChild(group);
    viewport().appendChild(svgRoot);
  }

  function nearestBarColorKey(d) {
    const keys = [8, 10, 12, 16, 20, 25, 32, 40];
    return keys.reduce((best, k) => Math.abs(k - d) < Math.abs(best - d) ? k : best, keys[0]);
  }

  function regularPolygonPoints(r, sides, cx, cy) {
    const pts = [];
    for (let i = 0; i < sides; i++) {
      const angle = (Math.PI * 2 * i) / sides - Math.PI / 2;
      pts.push(`${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`);
    }
    return pts.join(' ');
  }

  function addDim(group, x, y, length, text, vertical) {
    const g = svg('g', {});
    if (!vertical) {
      g.appendChild(svg('line', { x1: x, y1: y, x2: x + length, y2: y, stroke: 'var(--annotate)', 'stroke-width': 1 }));
      g.appendChild(svg('line', { x1: x, y1: y - 4, x2: x, y2: y + 4, stroke: 'var(--annotate)', 'stroke-width': 1 }));
      g.appendChild(svg('line', { x1: x + length, y1: y - 4, x2: x + length, y2: y + 4, stroke: 'var(--annotate)', 'stroke-width': 1 }));
      const t = svg('text', { x: x + length / 2, y: y + 14, fill: 'var(--annotate)', 'font-size': 11, 'text-anchor': 'middle', 'font-family': 'var(--font-mono)' });
      t.textContent = text; g.appendChild(t);
    } else {
      g.appendChild(svg('line', { x1: x, y1: y, x2: x, y2: y + length, stroke: 'var(--annotate)', 'stroke-width': 1 }));
      g.appendChild(svg('line', { x1: x - 4, y1: y, x2: x + 4, y2: y, stroke: 'var(--annotate)', 'stroke-width': 1 }));
      g.appendChild(svg('line', { x1: x - 4, y1: y + length, x2: x + 4, y2: y + length, stroke: 'var(--annotate)', 'stroke-width': 1 }));
      const t = svg('text', { x: x + 10, y: y + length / 2, fill: 'var(--annotate)', 'font-size': 11, 'font-family': 'var(--font-mono)' });
      t.textContent = text; g.appendChild(t);
    }
    group.appendChild(g);
  }

  function addCentroid(group, cx, cy) {
    const g = svg('g', { stroke: 'var(--danger)', 'stroke-width': 1 });
    g.appendChild(svg('line', { x1: cx - 7, y1: cy, x2: cx + 7, y2: cy }));
    g.appendChild(svg('line', { x1: cx, y1: cy - 7, x2: cx, y2: cy + 7 }));
    group.appendChild(g);
  }

  function init() {
    initPanZoom();
    applyTransform();
    bus.on('state:selected', render);
    bus.on('state:changed', render);
    bus.on('state:loaded', render);
    render();
  }

  global.App = global.App || {};
  global.App.Canvas = { init, render };
})(window);
