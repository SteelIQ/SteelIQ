/**
 * Canvas — Phase 4: SVG Cross-Section Visualization Engine
 * -----------------------------------------------------------------------
 * Draws the actual reinforcement cross-section using App.Geometry's real
 * bar-placement math (not a legend): concrete outline, cover line, tie
 * outline, every individual bar at true scale and color-coded by
 * diameter, bar-mark leader lines + numbering, spacing/dimension
 * annotations, hover tooltips, click-to-select, and SVG/PNG export.
 *
 * Still explicitly out of scope here (Phase 5): dragging bars by hand,
 * mirror/rotate/snap, auto-symmetry editing. This phase computes correct
 * automatic positions; Phase 5 lets the engineer override them.
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

  // Move initial pan down and right so the +,+ origin defaults comfortably on screen
  let scale = 1, panX = 120, panY = 200;
  let cadOriginSvgX = 0, cadOriginSvgY = 0;
  let selectedBarKey = null;

  // 1mm = 0.42px before user zoom — big enough that 8-40mm bars stay legible.
  const MM_TO_PX = 0.42;

  // ---------------------------------------------------------------- pan/zoom

  function applyTransform() {
    viewport().style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
    if (global.App && global.App.CadGrid && global.App.CadGrid.updateView) {
      // Pass the computed offset down to the Grid
      global.App.CadGrid.updateView(scale, panX, panY, cadOriginSvgX, cadOriginSvgY);
    }
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

  function resetView() { scale = 1; panX = 120; panY = 200; applyTransform(); }

  function resizeGrid() {
    // Call render instead of init so it doesn't wipe the pan/zoom memory on resize
    if (global.App && global.App.CadGrid && global.App.CadGrid.render) {
      global.App.CadGrid.render();
    }
  }

  function initPanZoom() {
    const stageEl = stage();
    let dragging = false, lastX = 0, lastY = 0, movedSinceDown = false;

    stageEl.addEventListener('wheel', (e) => {
      e.preventDefault();
      const rect = stageEl.getBoundingClientRect();
      zoomBy(e.deltaY < 0 ? 1.1 : 0.9, { x: e.clientX - rect.left, y: e.clientY - rect.top });
    }, { passive: false });

    stageEl.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.hud-btn')) return;
      dragging = true; movedSinceDown = false; lastX = e.clientX; lastY = e.clientY;
      viewport().classList.add('panning');
    });

    stageEl.addEventListener('pointermove', (e) => {
      const rect = stageEl.getBoundingClientRect();

      // Get the mouse coordinate strictly in the SVG scale
      const cursorSvgX = (e.clientX - rect.left - panX) / scale;
      const cursorSvgY = (e.clientY - rect.top - panY) / scale;

      // Calculate real-world CAD space
      const cadX = cursorSvgX - cadOriginSvgX;
      const cadY = cadOriginSvgY - cursorSvgY; // <-- Math inverted so UP is positive

      const worldX = (cadX / MM_TO_PX).toFixed(1);
      const worldY = (cadY / MM_TO_PX).toFixed(1);

      if (global.App && global.App.CadGrid && global.App.CadGrid.setCursor) {
        global.App.CadGrid.setCursor({ x: Number(worldX), y: Number(worldY) });
      }

      if (!dragging) return;
      if (Math.abs(e.clientX - lastX) > 2 || Math.abs(e.clientY - lastY) > 2) movedSinceDown = true;
      panX += (e.clientX - lastX); panY += (e.clientY - lastY);
      lastX = e.clientX; lastY = e.clientY;
      applyTransform();
    });

    stageEl.addEventListener('pointerleave', () => {
      if (global.App && global.App.CadGrid && global.App.CadGrid.clearCursor) {
        global.App.CadGrid.clearCursor();
      }
    });

    window.addEventListener('pointerup', (e) => {
      dragging = false;
      viewport().classList.remove('panning');
      if (!movedSinceDown && e.target.closest('#canvas-stage') && !e.target.closest('[data-bar-key]')) {
        selectedBarKey = null;
        render();
      }
    });
    window.addEventListener('resize', resizeGrid);

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

  // ------------------------------------------------------------------ render

  function render() {
    const col = state.getSelected();

    console.log(
      '%c[Cross Section]',
      'color:#22c55e;font-weight:bold;',
      'Bars:',
      col.reinforcement.longitudinal.bars
    );
    // const col = state.getSelected();
    const vp = viewport();
    if (!vp) return;
    vp.innerHTML = '';

    const emptyElement = typeof emptyEl === 'function' ? emptyEl() : document.getElementById('canvas-empty');
    if (!col) {
      if (emptyElement) emptyElement.style.display = 'flex';
      return;
    }
    if (emptyElement) emptyElement.style.display = 'none';

    const { outline, bars } = Geometry.placeAllBars(col);
    console.log(
      '%c[Geometry]',
      'color:#f97316;font-weight:bold;',
      bars
    );
    const centroid = Geometry.polygonCentroid(outline.vertices);
    const cover = col.geometry.clearCover || 40;
    const tieDia = (col.ties && col.ties.diameter) || 8;

    const bbox = boundsOf(outline.vertices);

    // Push the origin 250mm left and 250mm BELOW the drawing bottom-left. 
    // Since SVG Y goes down, drawing bottom-left Y is `40 + bbox.h`.
    const GAP_MM = 250;
    cadOriginSvgX = 40 - (GAP_MM * MM_TO_PX);
    cadOriginSvgY = 40 + (bbox.h * MM_TO_PX) + (GAP_MM * MM_TO_PX);

    const svgW = (bbox.w * MM_TO_PX) + 240;
    const svgH = (bbox.h * MM_TO_PX) + 220;
    const svgRoot = svg('svg', { width: svgW, height: svgH, style: 'overflow:visible;' });
    const group = svg('g', { transform: 'translate(40,40)' });

    // --- Concrete outline + cover + tie outline (Multi-Shape & L/T Shape Supported) ---
    if (outline.isCircle) {
      const r = outline.circle.r;
      circleAt(group, r, r, r, { fill: 'var(--bg-panel-alt)', stroke: 'var(--text-primary)', 'stroke-width': 2 });
      circleAt(group, r, r, Math.max(0, r - cover), { fill: 'none', stroke: 'var(--annotate)', 'stroke-width': 1, 'stroke-dasharray': '4 3' });
      circleAt(group, r, r, Math.max(0, r - cover - tieDia / 2), { fill: 'none', stroke: 'var(--text-muted)', 'stroke-width': 1.2 });
    } else {
      group.appendChild(poly(outline.vertices, { fill: 'var(--bg-panel-alt)', stroke: 'var(--text-primary)', 'stroke-width': 2 }));
      group.appendChild(poly(Geometry.offsetPolygon(outline.vertices, cover), { fill: 'none', stroke: 'var(--annotate)', 'stroke-width': 1, 'stroke-dasharray': '4 3' }));
      group.appendChild(poly(Geometry.offsetPolygon(outline.vertices, cover + tieDia / 2), { fill: 'none', stroke: 'var(--text-muted)', 'stroke-width': 1.2 }));
    }

    // --- Overall dimensions --------------------------------------------
    if (outline.isCircle) {
      addDim(group, 0, bbox.h * MM_TO_PX + 26, bbox.w * MM_TO_PX, `⌀ ${col.geometry.diameter} mm`);
    } else {
      addDim(group, 0, bbox.h * MM_TO_PX + 26, bbox.w * MM_TO_PX, `${Math.round(bbox.w)} mm`);
      addDim(group, bbox.w * MM_TO_PX + 26, 0, bbox.h * MM_TO_PX, `${Math.round(bbox.h)} mm`, true);
    }

    // --- Centroid --------------------------------------------------------
    addCentroid(group, centroid.x * MM_TO_PX, centroid.y * MM_TO_PX);

    // --- Bars + hover/select hit targets --------------------------------
    const barsLayer = svg('g', { id: 'bars-layer' });
    bars.forEach((bar) => {
      const key = `${bar.groupId}:${bar.indexInGroup}`;
      const px = bar.x * MM_TO_PX, py = bar.y * MM_TO_PX;
      const r = Math.max(2.4, (bar.diameter / 2) * MM_TO_PX);
      const colorKey = nearestBarColorKey(bar.diameter);
      const isSelected = key === selectedBarKey;

      const wrap = svg('g', { 'data-bar-key': key, style: 'cursor:pointer;' });
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
      wrap.addEventListener('pointerenter', (e) => showTooltip(e, bar));
      wrap.addEventListener('pointermove', (e) => moveTooltip(e));
      wrap.addEventListener('pointerleave', hideTooltip);
      wrap.addEventListener('click', (e) => { e.stopPropagation(); selectedBarKey = (selectedBarKey === key ? null : key); render(); });
      barsLayer.appendChild(wrap);
    });
    group.appendChild(barsLayer);

    // --- Spacing annotation (first gap per group, to avoid clutter) -----
    const seenGroup = new Set();
    bars.forEach((bar) => {
      if (bar.spacingToNext == null || seenGroup.has(bar.groupId)) return;
      seenGroup.add(bar.groupId);
      const groupBars = bars.filter((b) => b.groupId === bar.groupId);
      const nextBar = groupBars[bar.indexInGroup + 1];
      if (!nextBar) return;
      const mx = ((bar.x + nextBar.x) / 2) * MM_TO_PX;
      const my = ((bar.y + nextBar.y) / 2) * MM_TO_PX;
      const t = svg('text', { x: mx, y: my - 6, 'font-size': 9.5, fill: 'var(--annotate)', 'text-anchor': 'middle', 'font-family': 'var(--font-mono)' });
      t.textContent = `${bar.spacingToNext}`;
      group.appendChild(t);
    });

    // --- Bar-mark leader lines + badges (first bar of each group) -------
    const markedGroups = new Set();
    bars.forEach((bar) => {
      if (markedGroups.has(bar.groupId)) return;
      markedGroups.add(bar.groupId);
      const dx = bar.x - centroid.x, dy = bar.y - centroid.y;
      const len = Math.hypot(dx, dy) || 1;
      const dir = { x: dx / len, y: dy / len };
      const barR = Math.max(2.4, (bar.diameter / 2) * MM_TO_PX);
      const startX = bar.x * MM_TO_PX + dir.x * barR;
      const startY = bar.y * MM_TO_PX + dir.y * barR;
      const endX = startX + dir.x * 20;
      const endY = startY + dir.y * 20;

      group.appendChild(svg('line', { x1: startX, y1: startY, x2: endX, y2: endY, stroke: 'var(--annotate)', 'stroke-width': 1 }));
      group.appendChild(svg('circle', { cx: endX, cy: endY, r: 9, fill: 'var(--bg-panel)', stroke: 'var(--annotate)', 'stroke-width': 1.2 }));
      const markText = svg('text', { x: endX, y: endY + 3.5, 'font-size': 10, fill: 'var(--annotate)', 'text-anchor': 'middle', 'font-weight': 700, 'font-family': 'var(--font-mono)' });
      markText.textContent = bar.markNumber;
      group.appendChild(markText);
    });

    // --- Title ------------------------------------------------------------
    const title = svg('text', { x: 0, y: -18, fill: 'var(--text-primary)', 'font-size': 14, 'font-weight': 700, 'font-family': 'var(--font-mono)' });
    const typeLabel = (App.ColumnTypes && App.ColumnTypes[col.type]) ? App.ColumnTypes[col.type].label : col.type;
    title.textContent = `${col.name} — ${typeLabel} cross-section`;
    group.appendChild(title);

    svgRoot.appendChild(group);
    vp.appendChild(svgRoot);

    if (typeof renderMarkLegend === 'function') {
      renderMarkLegend(col, bars);
    }

    // Update the transform (which propagates the new origin down to cadGrid)
    if (typeof applyTransform === 'function') {
      applyTransform();
    }
  }

  function boundsOf(vertices) {
    const xs = vertices.map((v) => v.x), ys = vertices.map((v) => v.y);
    return { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  }

  function circleAt(group, cx, cy, r, attrs) {
    group.appendChild(svg('circle', Object.assign({ cx: cx * MM_TO_PX, cy: cy * MM_TO_PX, r: r * MM_TO_PX }, attrs)));
  }

  function addDim(group, x, y, length, text, vertical) {
    const g = svg('g', {});
    const a1 = vertical ? { x1: x - 4, y1: y, x2: x + 4, y2: y } : { x1: x, y1: y - 4, x2: x, y2: y + 4 };
    const a2 = vertical ? { x1: x - 4, y1: y + length, x2: x + 4, y2: y + length } : { x1: x + length, y1: y - 4, x2: x + length, y2: y + 4 };
    const main = vertical ? { x1: x, y1: y, x2: x, y2: y + length } : { x1: x, y1: y, x2: x + length, y2: y };
    [main, a1, a2].forEach((l) => g.appendChild(svg('line', Object.assign(l, { stroke: 'var(--annotate)', 'stroke-width': 1 }))));
    const t = svg('text', vertical
      ? { x: x + 10, y: y + length / 2, fill: 'var(--annotate)', 'font-size': 11, 'font-family': 'var(--font-mono)' }
      : { x: x + length / 2, y: y + 14, fill: 'var(--annotate)', 'font-size': 11, 'text-anchor': 'middle', 'font-family': 'var(--font-mono)' });
    t.textContent = text;
    g.appendChild(t);
    group.appendChild(g);
  }

  function addCentroid(group, cx, cy) {
    const g = svg('g', { stroke: 'var(--danger)', 'stroke-width': 1 });
    g.appendChild(svg('line', { x1: cx - 7, y1: cy, x2: cx + 7, y2: cy }));
    g.appendChild(svg('line', { x1: cx, y1: cy - 7, x2: cx, y2: cy + 7 }));
    group.appendChild(g);
  }

  // ---------------------------------------------------------------- tooltip

  function showTooltip(e, bar) {
    const tip = tooltipEl();
    tip.innerHTML = `<strong>Mark ${bar.markNumber}</strong> — Ø${bar.diameter}mm<br>${bar.placement} · bar ${bar.indexInGroup + 1} of ${bar.countInGroup}${bar.spacingToNext ? `<br>spacing → next: ${bar.spacingToNext}mm` : ''}`;
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

  function renderMarkLegend(col) {

    const el = document.getElementById('mark-legend');

    if (!el) return;

    const bars = col.reinforcement.longitudinal.bars;

    const rows = bars.map((bar, index) => {

      return `
        <tr>

            <td>M${index + 1}</td>

            <td>
                <span class="swatch"
                    style="
                        background:var(--bar-${nearestBarColorKey(bar.diameter)});
                        display:inline-block;
                    ">
                </span>

                T${bar.diameter}
            </td>

            <td>${bar.count}</td>

            <td>${bar.placement}</td>

        </tr>
        `;

    }).join('');

    el.innerHTML = `
        <table class="mark-table">

            <thead>

                <tr>

                    <th>Mark</th>

                    <th>Dia</th>

                    <th>Nos</th>

                    <th>Placement</th>

                </tr>

            </thead>

            <tbody>

                ${rows}

            </tbody>

        </table>
    `;

    console.log(
      '%c[Cross Section]',
      'color:#22c55e;font-weight:bold;',
      'Legend updated.',
      bars
    );

  }

  // ---------------------------------------------------------------- export

  function resolvedCssVars() {
    const cs = getComputedStyle(document.documentElement);
    const names = [
      '--bg-panel-alt', '--bg-panel', '--bg-canvas', '--text-primary', '--text-secondary',
      '--text-muted', '--annotate', '--danger', '--accent',
      ...BAR_COLOR_KEYS.map((k) => `--bar-${k}`),
    ];
    const map = {};
    names.forEach((n) => { map[n] = cs.getPropertyValue(n).trim(); });
    return map;
  }

  function serializeCurrentSvg() {
    const svgEl = viewport().querySelector('svg');
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
    const svgString = serializeCurrentSvg();
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
    initPanZoom();
    applyTransform();

    render();
    
    console.log(
      '%c[SteelIQ]',
      'color:#14b8a6;font-weight:bold;',
      'Cross Section initialized.'
    );
  }

  global.App = global.App || {};
  global.App.Canvas = { init, render };
})(window);