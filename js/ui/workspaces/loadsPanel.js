/**
 * LoadsPanel — "Load Analysis" workspace tab
 * -----------------------------------------------------------------------
 * A dedicated CadViewport instance (App.CadViewport, 'full' mode — pan,
 * zoom, adaptive grid, pointer-world readout and crosshair all come free)
 * drives the SVG load diagram: an elevation of the column showing its
 * support conditions, the floors stacking their load onto it, the axial
 * load and biaxial moment arrows, and a dimensioned floor-height callout
 * — next to a cross-section stress panel built from the column's real
 * drawn outline (via App.Geometry, the same shared source of truth the
 * drawing and BBS engines use) with a small stress-comparison bar chart.
 *
 * All the numbers come from models/loadCalc.js. This file only draws.
 */
(function (global) {
  'use strict';

  const state = global.App.state;
  const bus = global.App.bus;
  const Geometry = global.App.Geometry;
  const LoadCalc = global.App.LoadCalc;

  const bodyEl = () => document.getElementById('loads-body');
  const stageEl = () => document.getElementById('loads-diagram-stage');

  let viewport = null; // lazily-created CadViewport instance

  // -------------------------------------------------------------- svg helpers

  function svg(tag, attrs) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.keys(attrs || {}).forEach((k) => el.setAttribute(k, attrs[k]));
    return el;
  }

  function text(x, y, anchor, str, fill, size, weight) {
    const t = svg('text', {
      x, y, fill, 'font-size': size || 11, 'text-anchor': anchor || 'start',
      'font-family': 'var(--font-mono)', 'font-weight': weight || 400,
    });
    t.textContent = str;
    return t;
  }

  function line(x1, y1, x2, y2, stroke, width, dash) {
    const attrs = { x1, y1, x2, y2, stroke, 'stroke-width': width || 1.5 };
    if (dash) attrs['stroke-dasharray'] = dash;
    return svg('line', attrs);
  }

  /** A straight arrow (line + filled triangle head) pointing from (x1,y1) to (x2,y2). */
  function arrow(x1, y1, x2, y2, color, widthPx) {
    const g = svg('g', {});
    g.appendChild(line(x1, y1, x2, y2, color, widthPx || 2.2));
    const ang = Math.atan2(y2 - y1, x2 - x1);
    const hs = 7;
    const p1 = { x: x2, y: y2 };
    const p2 = { x: x2 - hs * Math.cos(ang - Math.PI / 7), y: y2 - hs * Math.sin(ang - Math.PI / 7) };
    const p3 = { x: x2 - hs * Math.cos(ang + Math.PI / 7), y: y2 - hs * Math.sin(ang + Math.PI / 7) };
    g.appendChild(svg('polygon', { points: `${p1.x},${p1.y} ${p2.x},${p2.y} ${p3.x},${p3.y}`, fill: color }));
    return g;
  }

  /** A small curved "moment" arrow — an arc with an arrowhead at one end. */
  function momentArc(cx, cy, r, color) {
    const g = svg('g', {});
    const startAng = Math.PI * 0.15, endAng = Math.PI * 1.35;
    const sx = cx + r * Math.cos(startAng), sy = cy - r * Math.sin(startAng);
    const ex = cx + r * Math.cos(endAng), ey = cy - r * Math.sin(endAng);
    g.appendChild(svg('path', { d: `M ${sx} ${sy} A ${r} ${r} 0 1 1 ${ex} ${ey}`, fill: 'none', stroke: color, 'stroke-width': 2 }));
    const tangentAng = endAng + Math.PI / 2;
    const hs = 6.5;
    const p2 = { x: ex - hs * Math.cos(tangentAng - Math.PI / 7), y: ey + hs * Math.sin(tangentAng - Math.PI / 7) };
    const p3 = { x: ex - hs * Math.cos(tangentAng + Math.PI / 7), y: ey + hs * Math.sin(tangentAng + Math.PI / 7) };
    g.appendChild(svg('polygon', { points: `${ex},${ey} ${p2.x},${p2.y} ${p3.x},${p3.y}`, fill: color }));
    return g;
  }

  function dimLine(x1, y1, x2, y2, label, color) {
    const g = svg('g', {});
    g.appendChild(line(x1, y1, x2, y2, color, 1));
    const perp = { x: -(y2 - y1), y: (x2 - x1) };
    const len = Math.hypot(perp.x, perp.y) || 1;
    const nx = (perp.x / len) * 5, ny = (perp.y / len) * 5;
    g.appendChild(line(x1 - nx, y1 - ny, x1 + nx, y1 + ny, color, 1));
    g.appendChild(line(x2 - nx, y2 - ny, x2 + nx, y2 + ny, color, 1));
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    g.appendChild(text(mx + 8, my + 3, 'start', label, color, 10.5, 700));
    return g;
  }

  function fmt(n, d) {
    d = d == null ? 2 : d;
    return Number(n).toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // ------------------------------------------------------------------ diagram

  function buildDiagram(col, an) {
    const outline = an.section.outline;
    const W = 900, H = 460;
    const root = svg('svg', { width: W, height: H, style: 'overflow:visible;' });
    root.appendChild(svg('rect', { x: 0, y: 0, width: W, height: H, fill: 'transparent' }));

    // ================================================================ ELEVATION
    const ge = svg('g', { transform: 'translate(30,20)' });
    const baseY = 380, topY = 40, colW = 64, colX = 130;
    const shaftColor = an.status === 'danger' ? 'var(--danger)' : an.status === 'warning' ? 'var(--warning)' : 'var(--text-primary)';

    ge.appendChild(text(colX + colW / 2, 16, 'middle', 'ELEVATION', 'var(--text-muted)', 10, 700));

    // floors-above stack (visualizes load accumulation onto this column)
    const floorsToShow = Math.min(an.nFloors, 6);
    const floorH = 14;
    for (let i = 0; i < floorsToShow; i++) {
      const fy = topY - 10 - (i + 1) * (floorH + 4);
      ge.appendChild(svg('rect', { x: colX - 10, y: fy, width: colW + 20, height: floorH, fill: 'var(--bg-panel-alt)', stroke: 'var(--border-strong)', 'stroke-width': 1 }));
    }
    if (an.nFloors > floorsToShow) {
      ge.appendChild(text(colX + colW / 2, topY - 10 - floorsToShow * (floorH + 4) - 6, 'middle', `+${an.nFloors - floorsToShow} more floor(s)`, 'var(--text-muted)', 9));
    }
    ge.appendChild(text(colX + colW + 34, topY - 10 - Math.max(1, floorsToShow) * (floorH + 4) / 2, 'start', `${an.nFloors} floor(s) above`, 'var(--text-secondary)', 9.5));

    // column shaft
    ge.appendChild(svg('rect', { x: colX, y: topY, width: colW, height: baseY - topY, fill: 'var(--bg-panel-alt)', stroke: shaftColor, 'stroke-width': 2.2 }));

    // base support (ground hatch)
    ge.appendChild(line(colX - 24, baseY, colX + colW + 24, baseY, 'var(--text-primary)', 3));
    for (let i = 0; i < 8; i++) {
      const gx = colX - 24 + i * ((colW + 48) / 7);
      ge.appendChild(line(gx, baseY, gx - 8, baseY + 12, 'var(--text-muted)', 1.3));
    }

    // support condition label
    ge.appendChild(text(colX + colW / 2, baseY + 30, 'middle', an.supportLabel, 'var(--text-secondary)', 10, 600));
    ge.appendChild(text(colX + colW / 2, baseY + 43, 'middle', `k = ${fmt(an.k, 2)}`, 'var(--text-muted)', 9.5));

    // axial load arrow (P)
    const pArrowTop = topY - 10 - Math.max(1, floorsToShow) * (floorH + 4) - 16;
    ge.appendChild(arrow(colX + colW / 2, pArrowTop, colX + colW / 2, topY - 2, 'var(--accent)', 2.4));
    ge.appendChild(text(colX + colW / 2 - 10, pArrowTop - 8, 'end', `P = ${fmt(an.Ptotal_kN, 0)} kN`, 'var(--accent)', 11, 700));

    // moment arcs (Mx, My) — drawn as two small curved arrows near mid-height
    const momY = (topY + baseY) / 2 - 40;
    ge.appendChild(momentArc(colX + colW / 2, momY, 22, 'var(--annotate)'));
    ge.appendChild(text(colX + colW + 34, momY + 4, 'start', `Mx = ${fmt(an.MxKNm, 1)} kN·m`, 'var(--annotate)', 9.5, 600));
    ge.appendChild(momentArc(colX + colW / 2, momY + 56, 16, 'var(--bar-16)'));
    ge.appendChild(text(colX + colW + 34, momY + 60, 'start', `My = ${fmt(an.MyKNm, 1)} kN·m`, 'var(--bar-16)', 9.5, 600));

    // floor-height dimension line
    ge.appendChild(dimLine(colX - 44, topY, colX - 44, baseY, `L = ${Math.round(an.L_mm)} mm`, 'var(--annotate)'));
    ge.appendChild(text(colX - 44 + 8, (topY + baseY) / 2 + 18, 'start', `Lex = k·L = ${Math.round(an.Lex)} mm`, 'var(--text-muted)', 9));

    root.appendChild(ge);

    // ================================================================ SECTION
    const gs = svg('g', { transform: 'translate(560,50)' });
    gs.appendChild(text(90, -14, 'middle', 'CROSS-SECTION STRESS', 'var(--text-muted)', 10, 700));

    const fitBox = 180;
    let sectionGroup;
    let extremeTop, extremeBottom;
    if (outline.isCircle) {
      const r = outline.circle.r;
      const scale = fitBox / (2 * r);
      sectionGroup = svg('g', { transform: `translate(${fitBox / 2},${fitBox / 2}) scale(${scale})` });
      sectionGroup.appendChild(svg('circle', { cx: 0, cy: 0, r, fill: 'var(--bg-panel-alt)', stroke: 'var(--text-primary)', 'stroke-width': 2 / scale }));
      extremeTop = { x: 0, y: -r * scale + fitBox / 2 };
      extremeBottom = { x: 0, y: r * scale + fitBox / 2 };
    } else {
      const xs = outline.vertices.map((v) => v.x), ys = outline.vertices.map((v) => v.y);
      const bw = Math.max(...xs) - Math.min(...xs), bh = Math.max(...ys) - Math.min(...ys);
      const scale = fitBox / Math.max(bw, bh, 1);
      const ox = -Math.min(...xs) * scale + (fitBox - bw * scale) / 2;
      const oy = -Math.min(...ys) * scale + (fitBox - bh * scale) / 2;
      sectionGroup = svg('g', { transform: `translate(${ox},${oy}) scale(${scale})` });
      const pts = outline.vertices.map((v) => `${v.x},${v.y}`).join(' ');
      sectionGroup.appendChild(svg('polygon', { points: pts, fill: 'var(--bg-panel-alt)', stroke: 'var(--text-primary)', 'stroke-width': 2 / scale }));
      extremeTop = { x: ox + (bw / 2) * scale, y: Math.min(...ys) * scale + oy };
      extremeBottom = { x: extremeTop.x, y: Math.max(...ys) * scale + oy };
    }
    gs.appendChild(sectionGroup);

    const maxColor = an.sigmaMax > an.permissible ? 'var(--danger)' : 'var(--success)';
    const minColor = an.sigmaMin < 0 ? 'var(--warning)' : 'var(--success)';
    gs.appendChild(svg('circle', { cx: extremeTop.x, cy: extremeTop.y, r: 3, fill: maxColor }));
    gs.appendChild(text(extremeTop.x + 8, extremeTop.y - 4, 'start', `σmax ${fmt(an.sigmaMax, 2)} MPa`, maxColor, 10, 700));
    gs.appendChild(svg('circle', { cx: extremeBottom.x, cy: extremeBottom.y, r: 3, fill: minColor }));
    gs.appendChild(text(extremeBottom.x + 8, extremeBottom.y + 14, 'start', `σmin ${fmt(an.sigmaMin, 2)} MPa`, minColor, 10, 700));

    root.appendChild(gs);

    // ---- stress comparison bar chart, below the section --------------
    const chartX = 560, chartY = 300, chartW = 260, barH = 16, gap = 10;
    const gc = svg('g', { transform: `translate(${chartX},${chartY})` });
    gc.appendChild(text(0, -10, 'start', 'STRESS vs. PERMISSIBLE (0.4·fck)', 'var(--text-muted)', 9.5, 700));
    const peak = Math.max(an.sigmaMax, Math.abs(an.sigmaMin), an.permissible, 1) * 1.15;
    const barScale = chartW / peak;

    function bar(y, valueLabel, value, color) {
      const w = Math.max(2, Math.abs(value) * barScale);
      gc.appendChild(svg('rect', { x: 0, y, width: chartW, height: barH, fill: 'var(--bg-panel-alt)', stroke: 'var(--border)', 'stroke-width': 1 }));
      gc.appendChild(svg('rect', { x: 0, y, width: w, height: barH, fill: color, opacity: 0.85 }));
      gc.appendChild(text(chartW + 8, y + barH - 4, 'start', valueLabel, color, 10, 700));
    }
    bar(0, `${fmt(an.sigmaMax, 2)} MPa`, an.sigmaMax, maxColor);
    bar(barH + gap, `${fmt(an.sigmaMin, 2)} MPa`, an.sigmaMin, minColor);
    const permX = an.permissible * barScale;
    gc.appendChild(line(permX, -4, permX, barH * 2 + gap + 4, 'var(--text-secondary)', 1.4, '4 3'));
    gc.appendChild(text(permX, barH * 2 + gap + 16, 'middle', `permissible ${fmt(an.permissible, 2)} MPa`, 'var(--text-secondary)', 9));
    root.appendChild(gc);

    return root;
  }

  // -------------------------------------------------------------- viewport

  function ensureViewport() {
    if (viewport) return viewport;
    if (!global.App.CadViewport || !stageEl()) return null;
    viewport = global.App.CadViewport.create({
      id: 'loads-view',
      stage: 'loads-diagram-stage',
      label: 'Load Diagram',
      mmToPx: 1,
      minScale: 0.3, maxScale: 4,
      initialPanX: 20, initialPanY: 10,
      showCursorCoord: true,
      showCrosshair: true,
      showZoomPct: true,
      hud: { autoCreate: true, autoCreateSettings: true },
    });
    if (viewport) viewport.init();
    return viewport;
  }

  // ------------------------------------------------------------------- render

  function statCard(label, value, sub) {
    return `<div class="stat-card"><div class="stat-label">${label}</div><div class="stat-value">${value}</div><div class="stat-sub">${sub || ''}</div></div>`;
  }
  function badgeForStatus(status) {
    return status === 'danger' ? 'badge-danger' : status === 'warning' ? 'badge-warn' : 'badge-ok';
  }
  function statusLabel(status) {
    return status === 'danger' ? 'Overstressed' : status === 'warning' ? 'Review' : 'OK';
  }
  function badgeForLevel(level) {
    return level === 'danger' ? 'badge-danger' : level === 'warning' ? 'badge-warn' : 'badge-ok';
  }

  function render() {
    const col = state.getSelected();
    const el = bodyEl();
    if (!el) return;

    if (!col) {
      el.innerHTML = `<div class="panel-empty" style="padding:40px;">Select a column to see its load analysis.</div>`;
      return;
    }

    const an = LoadCalc.analyze(col);

    // The stage div gets replaced below (innerHTML rebuild) — tear down
    // the old CadViewport instance first so its registry entry doesn't
    // point at now-detached DOM (create() would otherwise just hand back
    // the stale instance instead of binding to the fresh stage element).
    if (viewport) { viewport.destroy(); viewport = null; }

    el.innerHTML = `
      <div class="calc-header">
        <div>
          <h3>${escapeHtml(col.name)} <span class="text-muted" style="font-weight:400;">— Load Analysis, ${escapeHtml(col.designCode)}</span></h3>
        </div>
        <span class="badge ${badgeForStatus(an.status)}">${statusLabel(an.status)}</span>
      </div>

      <div class="calc-section loads-diagram-card">
        <div id="loads-diagram-stage" class="loads-diagram-stage"></div>
      </div>

      <div class="calc-grid">
        ${statCard('Total Axial Load', `${fmt(an.Ptotal_kN, 0)} kN`, `${fmt(an.floorLoadKN, 0)} kN/floor × ${an.nFloors}`)}
        ${statCard('Effective Length', `${Math.round(an.Lex)} mm`, `k = ${fmt(an.k, 2)} (${an.supportLabel})`)}
        ${statCard('Slenderness λmax', fmt(an.lambdaMax, 1), an.isSlender ? 'Slender (long) column' : 'Short column')}
        ${statCard('Max Stress σmax', `${fmt(an.sigmaMax, 2)} MPa`, `limit ${fmt(an.permissible, 2)} MPa`)}
        ${statCard('Min Stress σmin', `${fmt(an.sigmaMin, 2)} MPa`, an.sigmaMin < 0 ? 'net tension' : 'all compression')}
        ${statCard('Section Modulus', `Zx ${fmt(an.section.Zx / 1e6, 2)}·10⁶ mm³`, `Zy ${fmt(an.section.Zy / 1e6, 2)}·10⁶ mm³`)}
      </div>

      <div class="calc-section">
        <h4>Safety Checks</h4>
        <ul class="check-list">
          ${an.checks.map((c) => `<li class="check-item"><span class="badge ${badgeForLevel(c.level)}">${c.level}</span><span>${escapeHtml(c.message)}</span></li>`).join('')}
        </ul>
      </div>

      <div class="calc-section">
        <h4>Method</h4>
        <table class="calc-table">
          <tbody>
            <tr><td>Direct stress σd = P/A</td><td>${fmt(an.sigmaD, 2)} MPa</td></tr>
            <tr><td>Bending stress σbx = Mx/Zx</td><td>${fmt(an.sigmaBx, 2)} MPa</td></tr>
            <tr><td>Bending stress σby = My/Zy</td><td>${fmt(an.sigmaBy, 2)} MPa</td></tr>
            <tr><td>Gross section area (A)</td><td>${fmt(an.section.area, 0)} mm²</td></tr>
            <tr><td>Permissible (0.4·fck, M${an.fck})</td><td>${fmt(an.permissible, 2)} MPa</td></tr>
          </tbody>
        </table>
        <div class="field-hint">${escapeHtml(an.note)}</div>
        <div class="field-hint">Edit floor load, moments, floor count and support condition in the Properties panel → Loads section on the right.</div>
      </div>
    `;

    const vp = ensureViewport();
    if (vp) vp.setContent(buildDiagram(col, an));
    else if (stageEl()) {
      stageEl().innerHTML = '<div class="panel-empty" style="padding:24px;">Grid engine (CadViewport) did not load — check that js/ui/cadViewport.js is included.</div>';
    }
  }

  function isActive() {
    const stage = document.getElementById('loads-stage');
    return stage && stage.style.display !== 'none';
  }

  function renderIfActive() {
    if (isActive()) render();
  }

  function init() {
    bus.on('state:selected', renderIfActive);
    bus.on('state:changed', renderIfActive);
    bus.on('state:loaded', renderIfActive);
  }

  global.App = global.App || {};
  global.App.LoadsPanel = { init, render };
})(window);
