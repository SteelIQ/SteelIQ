/**
 * cadViewport.js
 * -----------------------------------------------------------------------
 * App.CadViewport — a reusable, multi-instance CAD grid + camera engine.
 *
 * This is the generic module version of what used to be a single-view
 * "cadGrid.js" (hardcoded to #canvas-stage). Any panel in the app — the
 * plan view, the elevation view, load diagrams, a future 3D top-view,
 * a print-preview pane, whatever comes next — can spin up its own
 * independent instance:
 *
 *     const vp = App.CadViewport.create({
 *       id: 'elevation-view',
 *       stage: 'elevation-panel-container',   // any container, just needs position:relative
 *       label: 'Elevation (Side)',
 *     });
 *     vp.init();
 *     vp.setContent(mySvgElement);            // whatever you draw shows THROUGH the grid
 *
 * Every instance gets, for free:
 *   - An "infinite" CAD grid (SVG pattern tiling, so panning never runs out
 *     of grid) with adaptive major/minor spacing that stays legible at any
 *     zoom level (1mm/px through 100m/px) instead of a fixed 100/10mm step.
 *   - Pan (mouse drag, touch drag, arrow keys) and zoom (wheel, pinch,
 *     +/-, buttons) with cursor/finger-centered zooming.
 *   - A draggable, resettable world-origin marker.
 *   - Live pointer world-coordinate readout, a scale bar, an optional
 *     mini X/Y axis widget, and an optional cursor crosshair.
 *   - A settings menu (gear icon) for toggling overlays and exporting.
 *   - SVG/PNG export of whatever content the instance is showing.
 *   - fitToContent(), linkTo() (sync two viewports together, e.g. plan +
 *     elevation), on('change'|'pointer', cb) event hooks.
 *
 * Two modes:
 *   'full'      (default) — the instance owns its content viewport: it
 *               applies its own pan/zoom transform to the element you draw
 *               into via setContent()/getContentLayer(), and attaches all
 *               camera input handlers (wheel/pointer/touch/keyboard) itself.
 *               Use this for any new view.
 *
 *   'grid-only' — the instance draws ONLY the grid/HUD/origin overlay; some
 *               other piece of code (like canvas.js today) already owns
 *               the pan/zoom of its own content element and just needs to
 *               keep the grid in sync by calling instance.sync(scale, panX,
 *               panY, originX, originY) whenever its camera changes. This
 *               is what the legacy App.CadGrid shim uses so the existing
 *               plan view keeps working untouched.
 *
 * Multiple instances are fully independent (their own state, DOM ids,
 * listeners) — there is no shared/global mutable state, so any number of
 * viewports can be alive on screen at once.
 * -----------------------------------------------------------------------
 */
(function (global) {
  'use strict';

  // ======================================================================
  // Constants & tiny helpers
  // ======================================================================

  // "Nice" numbers used to pick grid spacing that stays readable at any zoom.
  const NICE_MM = [1, 2, 2.5, 5, 10, 20, 25, 50, 100, 200, 250, 500,
    1000, 2000, 2500, 5000, 10000, 20000, 25000, 50000, 100000];

  let instanceCounter = 0;
  const registry = new Map();

  function svgEl(tag, attrs) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.keys(attrs || {}).forEach((k) => el.setAttribute(k, attrs[k]));
    return el;
  }

  function resolveEl(elOrId) {
    if (!elOrId) return null;
    return typeof elOrId === 'string' ? document.getElementById(elOrId) : elOrId;
  }

  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
  function midpoint(a, b) { return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; }

  function pickNiceMm(targetPx, mmToPx, scale) {
    const pxPerMm = mmToPx * scale;
    let best = NICE_MM[0];
    let bestDiff = Infinity;
    for (let i = 0; i < NICE_MM.length; i++) {
      const px = NICE_MM[i] * pxPerMm;
      const diff = Math.abs(px - targetPx);
      if (diff < bestDiff) { bestDiff = diff; best = NICE_MM[i]; }
    }
    return best;
  }

  // Adaptive grid spacing: keeps major lines ~majorTargetPx apart and minor
  // lines ~minorTargetPx apart no matter how far in/out the user zooms —
  // this is what makes the grid feel "infinite" and useful at every scale,
  // rather than turning into a dense mush or vanishing entirely.
  function computeSpacing(cfg, scale) {
    if (!cfg.autoSpacing) {
      return { majorMm: cfg.majorSpacingMm, minorMm: cfg.minorSpacingMm };
    }
    const minorMm = pickNiceMm(cfg.minorTargetPx, cfg.mmToPx, scale);
    let majorMm = minorMm * 5;
    if (majorMm * cfg.mmToPx * scale < cfg.majorTargetPx * 0.5 ||
        majorMm * cfg.mmToPx * scale > cfg.majorTargetPx * 2.5) {
      majorMm = pickNiceMm(cfg.majorTargetPx, cfg.mmToPx, scale);
      if (majorMm <= minorMm) majorMm = minorMm * 2;
    }
    return { majorMm, minorMm };
  }

  // ======================================================================
  // Camera math
  // ======================================================================

  function getView(S) {
    return { scale: S.scale, panX: S.panX, panY: S.panY, originX: S.originX, originY: S.originY };
  }

  function applyContentTransform(S) {
    if (S.mode !== 'full' || !S.viewportEl) return;
    S.viewportEl.style.transform = `translate(${S.panX}px, ${S.panY}px) scale(${S.scale})`;
  }

  function pan(S, dx, dy) {
    S.panX += dx; S.panY += dy;
    applyContentTransform(S);
    drawGrid(S);
  }

  function zoomTo(S, newScale, center) {
    newScale = clamp(newScale, S.cfg.minScale, S.cfg.maxScale);
    if (center) {
      S.panX = center.x - ((center.x - S.panX) * (newScale / S.scale));
      S.panY = center.y - ((center.y - S.panY) * (newScale / S.scale));
    }
    S.scale = newScale;
    applyContentTransform(S);
    drawGrid(S);
  }

  function zoomBy(S, factor, center) { zoomTo(S, S.scale * factor, center); }

  function resetView(S) {
    S.scale = S.homeScale; S.panX = S.homePanX; S.panY = S.homePanY;
    applyContentTransform(S);
    drawGrid(S);
  }

  function fitToContent(S, paddingPx) {
    const svgChild = S.viewportEl && S.viewportEl.querySelector('svg');
    if (!svgChild) return;
    const w = parseFloat(svgChild.getAttribute('width')) || (svgChild.getBBox && svgChild.getBBox().width);
    const h = parseFloat(svgChild.getAttribute('height')) || (svgChild.getBBox && svgChild.getBBox().height);
    if (!w || !h) return;
    const rect = S.stageEl.getBoundingClientRect();
    const pad = paddingPx != null ? paddingPx : 40;
    const availW = Math.max(50, rect.width - pad * 2);
    const availH = Math.max(50, rect.height - pad * 2);
    const newScale = clamp(Math.min(availW / w, availH / h), S.cfg.minScale, S.cfg.maxScale);
    S.scale = newScale;
    S.panX = (rect.width - w * newScale) / 2;
    S.panY = (rect.height - h * newScale) / 2;
    applyContentTransform(S);
    drawGrid(S);
  }

  function screenToWorld(S, localX, localY) {
    const svgX = (localX - S.panX) / S.scale;
    const svgY = (localY - S.panY) / S.scale;
    const cadX = svgX - S.originX;
    const cadY = S.originY - svgY; // up is positive
    return { x: cadX / S.cfg.mmToPx, y: cadY / S.cfg.mmToPx };
  }

  function worldToScreen(S, wx, wy) {
    const cadX = wx * S.cfg.mmToPx;
    const cadY = wy * S.cfg.mmToPx;
    const svgX = cadX + S.originX;
    const svgY = S.originY - cadY;
    return { x: svgX * S.scale + S.panX, y: svgY * S.scale + S.panY };
  }

  // ======================================================================
  // Grid + HUD rendering
  // ======================================================================

  function getStageSize(S) {
    const rect = S.stageEl.getBoundingClientRect();
    return {
      width: rect.width || S.stageEl.clientWidth || 1200,
      height: rect.height || S.stageEl.clientHeight || 800,
    };
  }

  function drawGrid(S) {
    if (!S.overlayEl || !S.svgRoot) return;
    S.svgRoot.innerHTML = '';

    const { width, height } = getStageSize(S);
    S.scale = clamp(S.scale, S.cfg.minScale, S.cfg.maxScale);

    const { majorMm, minorMm } = computeSpacing(S.cfg, S.scale);
    const majorPx = majorMm * S.cfg.mmToPx * S.scale;
    const minorPx = minorMm * S.cfg.mmToPx * S.scale;
    const showMinor = minorPx >= 6 && minorMm !== majorMm;

    const originScreenX = S.panX + S.originX * S.scale;
    const originScreenY = S.panY + S.originY * S.scale;

    const defs = svgEl('defs');
    const minorId = 'cadvp-minor-' + S.id;
    const majorId = 'cadvp-major-' + S.id;

    if (showMinor) {
      const minorPat = svgEl('pattern', {
        id: minorId, width: minorPx, height: minorPx,
        patternUnits: 'userSpaceOnUse', patternTransform: `translate(${originScreenX}, ${originScreenY})`,
      });
      minorPat.appendChild(svgEl('path', {
        d: `M ${minorPx} 0 L 0 0 L 0 ${minorPx}`,
        fill: 'none', stroke: 'var(--grid-line)', 'stroke-width': 1, 'stroke-opacity': 0.5,
        'shape-rendering': 'crispEdges',
      }));
      defs.appendChild(minorPat);
    }

    const majorPat = svgEl('pattern', {
      id: majorId, width: majorPx, height: majorPx,
      patternUnits: 'userSpaceOnUse', patternTransform: `translate(${originScreenX}, ${originScreenY})`,
    });
    majorPat.appendChild(svgEl('path', {
      d: `M ${majorPx} 0 L 0 0 L 0 ${majorPx}`,
      fill: 'none', stroke: 'var(--border-strong)', 'stroke-width': 1.5, 'stroke-opacity': 0.85,
      'shape-rendering': 'crispEdges',
    }));
    defs.appendChild(majorPat);
    S.svgRoot.appendChild(defs);

    if (showMinor) S.svgRoot.appendChild(svgEl('rect', { width: '100%', height: '100%', fill: `url(#${minorId})` }));
    S.svgRoot.appendChild(svgEl('rect', { width: '100%', height: '100%', fill: `url(#${majorId})` }));

    if (S.cfg.showAxes) {
      const axesGroup = svgEl('g', { class: 'cadvp-axes' });
      axesGroup.appendChild(svgEl('line', { x1: 0, y1: originScreenY, x2: width, y2: originScreenY, stroke: 'var(--accent)', 'stroke-width': 1.5, 'stroke-opacity': 0.6, 'shape-rendering': 'crispEdges' }));
      axesGroup.appendChild(svgEl('line', { x1: originScreenX, y1: 0, x2: originScreenX, y2: height, stroke: 'var(--accent)', 'stroke-width': 1.5, 'stroke-opacity': 0.6, 'shape-rendering': 'crispEdges' }));
      S.svgRoot.appendChild(axesGroup);
    }

    if (S.cfg.showCrosshair && S.cursorWorld) {
      const p = worldToScreen(S, S.cursorWorld.x, S.cursorWorld.y);
      const cg = svgEl('g', { class: 'cadvp-crosshair' });
      cg.appendChild(svgEl('line', { x1: 0, y1: p.y, x2: width, y2: p.y, stroke: 'var(--annotate)', 'stroke-width': 1, 'stroke-dasharray': '4 3', 'stroke-opacity': 0.7 }));
      cg.appendChild(svgEl('line', { x1: p.x, y1: 0, x2: p.x, y2: height, stroke: 'var(--annotate)', 'stroke-width': 1, 'stroke-dasharray': '4 3', 'stroke-opacity': 0.7 }));
      S.svgRoot.appendChild(cg);
    }

    // Origin marker — draggable, resettable, opens the settings menu on click.
    const originMarker = svgEl('g', { style: S.cfg.enableOriginDrag ? 'cursor:move;pointer-events:all;' : 'pointer-events:all;' });
    originMarker.appendChild(svgEl('circle', { cx: originScreenX, cy: originScreenY, r: 16, fill: 'transparent' }));
    originMarker.appendChild(svgEl('circle', { cx: originScreenX, cy: originScreenY, r: 4.5, fill: 'var(--bg-canvas)', stroke: 'var(--accent)', 'stroke-width': 1.6 }));
    originMarker.appendChild(svgEl('circle', { cx: originScreenX, cy: originScreenY, r: 1.4, fill: 'var(--accent)' }));
    const coordLabel = svgEl('text', { x: originScreenX + 8, y: originScreenY + 16, fill: 'var(--text-secondary)', 'font-size': 11, 'font-family': 'var(--font-mono)', 'font-weight': 700 });
    coordLabel.textContent = '0, 0';
    originMarker.appendChild(coordLabel);

    if (S.cfg.enableOriginDrag) {
      originMarker.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        S.isDraggingOrigin = true;
        S.dragOriginStart = { mouseX: e.clientX, mouseY: e.clientY, originX: S.originX, originY: S.originY };
        e.stopPropagation();
      });
    }
    originMarker.addEventListener('click', (e) => { e.stopPropagation(); showSettingsMenu(S, originMarker); });
    S.svgRoot.appendChild(originMarker);

    // Optional view label (top-left), handy when several viewports are on screen.
    if (S.cfg.label) {
      S.svgRoot.appendChild(svgEl('text', {
        x: 12, y: 20, fill: 'var(--text-muted)', 'font-size': 10, 'font-family': 'var(--font-mono)',
        'font-weight': 700, 'letter-spacing': '0.04em',
      })).textContent = S.cfg.label.toUpperCase();
    }

    // Bottom-right HUD text (pointer coords + scale bar + zoom %).
    const hudRightMargin = 190;
    const hudBottomMargin = 24;
    const hudXRight = width - hudRightMargin;
    const hudYBottom = height - hudBottomMargin;

    if (S.cfg.showCursorCoord) {
      const cursorText = svgEl('text', { x: hudXRight, y: hudYBottom - 32, fill: 'var(--text-secondary)', 'font-size': 11, 'font-family': 'var(--font-mono)', 'font-weight': 600, 'text-anchor': 'end' });
      cursorText.textContent = S.cursorWorld ? `X ${S.cursorWorld.x.toFixed(1)}  Y ${S.cursorWorld.y.toFixed(1)}` : 'X 0.0  Y 0.0';
      S.svgRoot.appendChild(cursorText);
    }

    if (S.cfg.showZoomPct) {
      const zoomText = svgEl('text', { x: hudXRight, y: hudYBottom - 46, fill: 'var(--text-muted)', 'font-size': 10, 'font-family': 'var(--font-mono)', 'text-anchor': 'end' });
      zoomText.textContent = `${Math.round(S.scale * 100)}%`;
      S.svgRoot.appendChild(zoomText);
    }

    if (S.cfg.showScaleBar) {
      let targetMm = 100 / (S.cfg.mmToPx * S.scale);
      const niceMm = pickNiceMm(100, S.cfg.mmToPx, S.scale) || targetMm;
      const scalePxLength = niceMm * S.cfg.mmToPx * S.scale;
      const scaleBarY = hudYBottom - 10;
      const scaleBarX2 = hudXRight;
      const scaleBarX1 = hudXRight - scalePxLength;

      const sbGroup = svgEl('g');
      sbGroup.appendChild(svgEl('line', { x1: scaleBarX1, y1: scaleBarY, x2: scaleBarX2, y2: scaleBarY, stroke: 'var(--annotate)', 'stroke-width': 2, 'shape-rendering': 'crispEdges' }));
      sbGroup.appendChild(svgEl('line', { x1: scaleBarX1, y1: scaleBarY - 5, x2: scaleBarX1, y2: scaleBarY + 5, stroke: 'var(--annotate)', 'stroke-width': 1.5, 'shape-rendering': 'crispEdges' }));
      sbGroup.appendChild(svgEl('line', { x1: scaleBarX2, y1: scaleBarY - 5, x2: scaleBarX2, y2: scaleBarY + 5, stroke: 'var(--annotate)', 'stroke-width': 1.5, 'shape-rendering': 'crispEdges' }));
      const scaleLabel = svgEl('text', { x: scaleBarX1 + scalePxLength / 2, y: scaleBarY - 8, fill: 'var(--annotate)', 'font-size': 10, 'font-family': 'var(--font-mono)', 'font-weight': 700, 'text-anchor': 'middle' });
      scaleLabel.textContent = `${niceMm} mm`;
      sbGroup.appendChild(scaleLabel);
      S.svgRoot.appendChild(sbGroup);
    }

    updateMiniAxesWidget(S);
    fireChange(S);
  }

  function updateMiniAxesWidget(S) {
    const widgetId = 'cadvp-mini-axes-' + S.id;
    let widget = document.getElementById(widgetId);
    if (!S.cfg.showMiniAxes) { if (widget) widget.remove(); return; }
    if (!widget) {
      widget = document.createElement('div');
      widget.id = widgetId;
      widget.style.cssText = 'position:absolute; bottom:56px; right:12px; width:52px; height:52px; pointer-events:none; z-index:5;';
      widget.innerHTML = `
        <svg viewBox="0 0 52 52" width="52" height="52">
          <line x1="10" y1="42" x2="10" y2="8" stroke="var(--accent)" stroke-width="1.6"/>
          <line x1="10" y1="42" x2="44" y2="42" stroke="var(--accent)" stroke-width="1.6"/>
          <path d="M10 8 L6 16 L14 16 Z" fill="var(--accent)"/>
          <path d="M44 42 L36 38 L36 46 Z" fill="var(--accent)"/>
          <text x="14" y="12" font-size="9" font-family="var(--font-mono)" fill="var(--accent)" font-weight="700">Y</text>
          <text x="36" y="40" font-size="9" font-family="var(--font-mono)" fill="var(--accent)" font-weight="700">X</text>
        </svg>`;
      S.stageEl.appendChild(widget);
    }
  }

  // ======================================================================
  // Settings menu
  // ======================================================================

  function closeMenu(S) { if (S.activeMenu) { S.activeMenu.remove(); S.activeMenu = null; } }

  function doZoomIn(S) { const btn = resolveEl(S.cfg.hud.zoomIn); if (btn) btn.click(); else zoomBy(S, S.cfg.zoomStep); }
  function doZoomOut(S) { const btn = resolveEl(S.cfg.hud.zoomOut); if (btn) btn.click(); else zoomBy(S, 1 / S.cfg.zoomStep); }
  function doReset(S) {
    const btn = resolveEl(S.cfg.hud.reset);
    if (btn) btn.click(); else resetView(S);
    S.originX = 0; S.originY = 0;
    drawGrid(S);
  }

  function showSettingsMenu(S, triggerEl) {
    closeMenu(S);
    const rect = triggerEl.getBoundingClientRect();

    const menu = document.createElement('div');
    menu.className = 'mark-legend-dock';
    menu.style.cssText = `
      position: fixed;
      bottom: ${window.innerHeight - rect.top + 8}px;
      left: ${rect.left}px;
      z-index: 10000;
      background: var(--bg-panel);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      width: 260px;
      max-height: 500px;
      overflow-y: auto;
      box-shadow: 0 8px 24px rgba(0,0,0,0.6);
    `;

    menu.innerHTML = `
      <div style="padding: 8px 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; background: var(--bg-panel-alt); color: var(--text-muted); font-size: 9.5px; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center;">
        <span>${S.cfg.label ? S.cfg.label + ' — ' : ''}Grid &amp; View</span>
        <span style="cursor: pointer; font-size: 12px; color: var(--text-primary);" data-act="close">✕</span>
      </div>

      <table class="mark-table">
        <thead><tr><th colspan="2">Navigation</th></tr></thead>
        <tbody>
          <tr><td colspan="2">
            <div style="display:flex; gap:6px; margin-bottom:4px;">
              <button class="tbtn" data-act="zoom-in" style="flex:1; padding:4px; font-size:11px; justify-content:center;">Zoom In</button>
              <button class="tbtn" data-act="zoom-out" style="flex:1; padding:4px; font-size:11px; justify-content:center;">Zoom Out</button>
            </div>
            <div style="display:flex; gap:6px;">
              <button class="tbtn" data-act="fit" style="flex:1; padding:4px; font-size:11px; justify-content:center;">Fit to Content</button>
              <button class="tbtn" data-act="reset" style="flex:1; padding:4px; font-size:11px; justify-content:center;">Reset View &amp; Origin</button>
            </div>
          </td></tr>
        </tbody>

        <thead><tr><th colspan="2">Export</th></tr></thead>
        <tbody>
          <tr><td colspan="2">
            <div style="display:flex; gap:6px;">
              <button class="tbtn" data-act="export-svg" style="flex:1; padding:4px; font-size:11px; justify-content:center;">Export SVG</button>
              <button class="tbtn" data-act="export-png" style="flex:1; padding:4px; font-size:11px; justify-content:center;">Export PNG</button>
            </div>
          </td></tr>
        </tbody>

        <thead><tr><th colspan="2">Overlays &amp; Widgets</th></tr></thead>
        <tbody>
          <tr><td colspan="2">
            <label style="display:flex; align-items:center; gap:8px; margin-bottom:6px; cursor:pointer; color:var(--text-secondary);">
              <input type="checkbox" data-toggle="showScaleBar" ${S.cfg.showScaleBar ? 'checked' : ''} style="accent-color:var(--accent);"> Scale Bar
            </label>
            <label style="display:flex; align-items:center; gap:8px; margin-bottom:6px; cursor:pointer; color:var(--text-secondary);">
              <input type="checkbox" data-toggle="showCursorCoord" ${S.cfg.showCursorCoord ? 'checked' : ''} style="accent-color:var(--accent);"> Pointer Location
            </label>
            <label style="display:flex; align-items:center; gap:8px; margin-bottom:6px; cursor:pointer; color:var(--text-secondary);">
              <input type="checkbox" data-toggle="showZoomPct" ${S.cfg.showZoomPct ? 'checked' : ''} style="accent-color:var(--accent);"> Zoom % Readout
            </label>
            <label style="display:flex; align-items:center; gap:8px; margin-bottom:6px; cursor:pointer; color:var(--text-secondary);">
              <input type="checkbox" data-toggle="showMiniAxes" ${S.cfg.showMiniAxes ? 'checked' : ''} style="accent-color:var(--accent);"> Mini X-Y Axis Widget
            </label>
            <label style="display:flex; align-items:center; gap:8px; margin-bottom:6px; cursor:pointer; color:var(--text-secondary);">
              <input type="checkbox" data-toggle="showCrosshair" ${S.cfg.showCrosshair ? 'checked' : ''} style="accent-color:var(--accent);"> Cursor Crosshair
            </label>
            <label style="display:flex; align-items:center; gap:8px; cursor:pointer; color:var(--text-secondary);">
              <input type="checkbox" data-toggle="autoSpacing" ${S.cfg.autoSpacing ? 'checked' : ''} style="accent-color:var(--accent);"> Adaptive Grid Spacing
            </label>
          </td></tr>
        </tbody>
      </table>
    `;

    document.body.appendChild(menu);
    S.activeMenu = menu;

    menu.querySelector('[data-act="close"]').onclick = () => closeMenu(S);
    menu.querySelector('[data-act="zoom-in"]').onclick = () => doZoomIn(S);
    menu.querySelector('[data-act="zoom-out"]').onclick = () => doZoomOut(S);
    menu.querySelector('[data-act="reset"]').onclick = () => doReset(S);
    menu.querySelector('[data-act="fit"]').onclick = () => fitToContent(S);
    menu.querySelector('[data-act="export-svg"]').onclick = () => requestExport(S, 'svg');
    menu.querySelector('[data-act="export-png"]').onclick = () => requestExport(S, 'png');

    menu.querySelectorAll('input[data-toggle]').forEach((inp) => {
      inp.onchange = (e) => {
        S.cfg[inp.getAttribute('data-toggle')] = e.target.checked;
        drawGrid(S);
      };
    });

    const outsideListener = (e) => {
      if (!menu.contains(e.target) && !triggerEl.contains(e.target)) {
        closeMenu(S);
        document.removeEventListener('click', outsideListener);
      }
    };
    setTimeout(() => document.addEventListener('click', outsideListener), 0);
  }

  // ======================================================================
  // HUD wiring (existing markup gets a settings gear added; brand-new
  // views with no HUD markup at all can get one built automatically)
  // ======================================================================

  const GEAR_SVG = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06-.06a1.65 1.65 0 0 0-.33 1.82V9c0 .69.41 1.31 1.51 1.51h.09a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';

  function injectSettingsButton(S, container) {
    if (S.cfg.hud.autoCreateSettings === false || !container) return;
    const btnId = 'cadvp-settings-' + S.id;
    if (document.getElementById(btnId)) return;
    const btn = document.createElement('button');
    btn.className = 'hud-btn';
    btn.id = btnId;
    btn.title = 'Grid & View Settings';
    btn.innerHTML = GEAR_SVG;
    btn.onclick = (e) => { e.stopPropagation(); showSettingsMenu(S, btn); };
    const zoomOutBtn = resolveEl(S.cfg.hud.zoomOut);
    if (zoomOutBtn && container.contains(zoomOutBtn)) container.insertBefore(btn, zoomOutBtn);
    else container.appendChild(btn);
    S._settingsBtn = btn;
  }

  function buildAutoHud(S) {
    if (S.stageEl.querySelector('.cadvp-auto-hud')) return;
    const hud = document.createElement('div');
    hud.className = 'canvas-hud cadvp-auto-hud';
    hud.innerHTML = `
      <button class="hud-btn" data-act="zoom-out" title="Zoom out">−</button>
      <button class="hud-btn" data-act="zoom-reset" title="Reset view"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="2"/></svg></button>
      <button class="hud-btn" data-act="zoom-in" title="Zoom in">+</button>
      <span class="hud-sep"></span>
      <button class="hud-btn" data-act="export-svg" title="Export SVG">SVG</button>
      <button class="hud-btn" data-act="export-png" title="Export PNG">PNG</button>
    `;
    hud.querySelector('[data-act="zoom-in"]').onclick = () => zoomBy(S, S.cfg.zoomStep);
    hud.querySelector('[data-act="zoom-out"]').onclick = () => zoomBy(S, 1 / S.cfg.zoomStep);
    hud.querySelector('[data-act="zoom-reset"]').onclick = () => resetView(S);
    hud.querySelector('[data-act="export-svg"]').onclick = () => requestExport(S, 'svg');
    hud.querySelector('[data-act="export-png"]').onclick = () => requestExport(S, 'png');
    S.stageEl.appendChild(hud);
    S._autoHud = hud;
  }

  function wireHud(S) {
    const existing = resolveEl(S.cfg.hud.container) || S.stageEl.querySelector('.canvas-hud');
    if (existing) {
      injectSettingsButton(S, existing);
    } else if (S.cfg.hud.autoCreate) {
      buildAutoHud(S);
      injectSettingsButton(S, S._autoHud);
    }
  }

  // ======================================================================
  // Export (SVG / PNG)
  // ======================================================================

  function defaultCssVarNames() {
    return ['--bg-panel-alt', '--bg-panel', '--bg-canvas', '--text-primary', '--text-secondary',
      '--text-muted', '--annotate', '--danger', '--accent', '--border', '--border-strong', '--grid-line',
      8, 10, 12, 16, 20, 25, 32, 40].map((n) => (typeof n === 'number' ? `--bar-${n}` : n));
  }

  function resolveCssVars(names) {
    const cs = getComputedStyle(document.documentElement);
    const map = {};
    names.forEach((n) => { map[n] = cs.getPropertyValue(n).trim(); });
    return map;
  }

  function serializeContentSvg(S) {
    const svgChild = S.viewportEl && S.viewportEl.querySelector('svg');
    if (!svgChild) return null;
    const clone = svgChild.cloneNode(true);
    const varMap = resolveCssVars(defaultCssVarNames());
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
    return new XMLSerializer().serializeToString(clone);
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  function requestExport(S, kind) {
    // 1) Legacy/host view already has its own export button wired — delegate to it.
    const btnId = kind === 'svg' ? S.cfg.hud.exportSvg : S.cfg.hud.exportPng;
    const btn = resolveEl(btnId);
    if (btn) { btn.click(); return; }

    // 2) Caller supplied a custom export handler.
    if (typeof S.cfg.onExport === 'function') { S.cfg.onExport(kind); return; }

    // 3) Built-in export straight from this instance's own content layer.
    const svgString = serializeContentSvg(S);
    if (!svgString) { console.warn('[CadViewport] nothing to export for', S.id); return; }
    const name = (S.cfg.label || S.id).replace(/[^a-z0-9\-_]+/gi, '_') || 'view';

    if (kind === 'svg') {
      downloadBlob(new Blob([svgString], { type: 'image/svg+xml' }), `${name}.svg`);
      return;
    }

    const svgChild = S.viewportEl.querySelector('svg');
    const w = parseFloat(svgChild.getAttribute('width')) || S.stageEl.clientWidth;
    const h = parseFloat(svgChild.getAttribute('height')) || S.stageEl.clientHeight;
    const factor = 2;
    const img = new Image();
    const blob = new Blob([svgString], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = w * factor; c.height = h * factor;
      const ctx = c.getContext('2d');
      ctx.scale(factor, factor);
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      c.toBlob((b) => downloadBlob(b, `${name}.png`), 'image/png');
    };
    img.onerror = () => console.warn('[CadViewport] PNG export failed for', S.id);
    img.src = url;
  }

  // ======================================================================
  // Origin drag (global mouse tracking, scoped per instance)
  // ======================================================================

  function bindOriginDragGlobal(S) {
    const onMove = (e) => {
      if (!S.isDraggingOrigin) return;
      const dx = e.clientX - S.dragOriginStart.mouseX;
      const dy = e.clientY - S.dragOriginStart.mouseY;
      S.originX = S.dragOriginStart.originX + dx / S.scale;
      S.originY = S.dragOriginStart.originY + dy / S.scale;
      drawGrid(S);
    };
    const onUp = () => { S.isDraggingOrigin = false; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    S._cleanups.push(() => window.removeEventListener('mousemove', onMove));
    S._cleanups.push(() => window.removeEventListener('mouseup', onUp));
  }

  // ======================================================================
  // Camera input (pan/zoom/pinch/keyboard) — 'full' mode only
  // ======================================================================

  function attachCameraControls(S) {
    const el = S.stageEl;
    if (el.tabIndex < 0) el.tabIndex = 0;

    const onWheel = (e) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const center = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      const factor = e.deltaY < 0 ? S.cfg.zoomStep : 1 / S.cfg.zoomStep;
      zoomBy(S, factor, center);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    S._cleanups.push(() => el.removeEventListener('wheel', onWheel));

    const onPointerDown = (e) => {
      if (e.target.closest('.hud-btn')) return;
      if (el.setPointerCapture) { try { el.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ } }
      S.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (S.pointers.size === 1) {
        S.isPanning = true;
        S.lastPointer = { x: e.clientX, y: e.clientY };
        S.viewportEl.classList.add('panning');
      } else if (S.pointers.size === 2 && S.cfg.enableTouch) {
        S.isPanning = false;
        const pts = Array.from(S.pointers.values());
        S.pinchStartDist = dist(pts[0], pts[1]);
        S.pinchStartScale = S.scale;
      }
    };

    const onPointerMove = (e) => {
      const rect = el.getBoundingClientRect();
      const world = screenToWorld(S, e.clientX - rect.left, e.clientY - rect.top);
      S.cursorWorld = world;
      if (typeof S.cfg.onPointerWorld === 'function') S.cfg.onPointerWorld(world);
      firePointer(S, world);

      if (!S.pointers.has(e.pointerId)) { drawGrid(S); return; }
      S.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (S.pointers.size === 2 && S.cfg.enableTouch) {
        const pts = Array.from(S.pointers.values());
        const d = dist(pts[0], pts[1]);
        if (S.pinchStartDist > 0) {
          const mid = midpoint(pts[0], pts[1]);
          const center = { x: mid.x - rect.left, y: mid.y - rect.top };
          zoomTo(S, S.pinchStartScale * (d / S.pinchStartDist), center);
        }
        return;
      }

      if (S.isPanning && S.pointers.size === 1) {
        const dx = e.clientX - S.lastPointer.x;
        const dy = e.clientY - S.lastPointer.y;
        S.lastPointer = { x: e.clientX, y: e.clientY };
        pan(S, dx, dy);
      } else {
        drawGrid(S);
      }
    };

    const onPointerUp = (e) => {
      S.pointers.delete(e.pointerId);
      if (S.pointers.size === 0) {
        S.isPanning = false;
        S.viewportEl.classList.remove('panning');
      } else if (S.pointers.size === 1) {
        S.isPanning = true;
        S.lastPointer = Array.from(S.pointers.values())[0];
      }
    };

    const onPointerLeave = () => { S.cursorWorld = null; drawGrid(S); };

    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    el.addEventListener('pointerleave', onPointerLeave);
    S._cleanups.push(() => {
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      el.removeEventListener('pointerleave', onPointerLeave);
    });

    if (S.cfg.enableKeyboard) {
      const onKey = (e) => {
        const step = 40;
        switch (e.key) {
          case 'ArrowUp': pan(S, 0, step); e.preventDefault(); break;
          case 'ArrowDown': pan(S, 0, -step); e.preventDefault(); break;
          case 'ArrowLeft': pan(S, step, 0); e.preventDefault(); break;
          case 'ArrowRight': pan(S, -step, 0); e.preventDefault(); break;
          case '+': case '=': zoomBy(S, S.cfg.zoomStep); e.preventDefault(); break;
          case '-': case '_': zoomBy(S, 1 / S.cfg.zoomStep); e.preventDefault(); break;
          case '0': case 'Home': resetView(S); e.preventDefault(); break;
          case 'f': case 'F': fitToContent(S); e.preventDefault(); break;
          default: break;
        }
      };
      el.addEventListener('keydown', onKey);
      S._cleanups.push(() => el.removeEventListener('keydown', onKey));
    }
  }

  function observeResize(S) {
    if (window.ResizeObserver) {
      const ro = new ResizeObserver(() => drawGrid(S));
      ro.observe(S.stageEl);
      S._cleanups.push(() => ro.disconnect());
    } else {
      const onResize = () => drawGrid(S);
      window.addEventListener('resize', onResize);
      S._cleanups.push(() => window.removeEventListener('resize', onResize));
    }
  }

  // ======================================================================
  // Events (change / pointer) + linking two instances together
  // ======================================================================

  function fireChange(S) {
    const view = getView(S);
    if (typeof S.cfg.onChange === 'function') S.cfg.onChange(view);
    (S.listeners.change || []).forEach((fn) => { try { fn(view); } catch (err) { console.error(err); } });
  }

  function firePointer(S, world) {
    (S.listeners.pointer || []).forEach((fn) => { try { fn(world); } catch (err) { console.error(err); } });
  }

  function linkTo(S, otherS, opts) {
    opts = opts || {};
    const mirrorScale = opts.scale !== false;
    const mirrorPan = opts.pan !== false;
    const handler = (view) => {
      if (otherS._linking) return;
      otherS._linking = true;
      if (mirrorScale) otherS.scale = view.scale;
      if (mirrorPan) { otherS.panX = view.panX; otherS.panY = view.panY; }
      applyContentTransform(otherS);
      drawGrid(otherS);
      otherS._linking = false;
    };
    (S.listeners.change = S.listeners.change || []).push(handler);
    return () => { S.listeners.change = S.listeners.change.filter((h) => h !== handler); };
  }

  // ======================================================================
  // DOM setup / teardown
  // ======================================================================

  function ensureDom(S, userConfig) {
    if (!S.stageEl.style.position || S.stageEl.style.position === 'static') S.stageEl.style.position = 'relative';
    if (!S.stageEl.style.overflow) S.stageEl.style.overflow = 'hidden';

    S.viewportEl = resolveEl(userConfig.viewport || userConfig.viewportId);
    if (!S.viewportEl) {
      S.viewportEl = document.createElement('div');
      S.viewportEl.id = userConfig.viewportId || (S.id + '-viewport');
      Object.assign(S.viewportEl.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', transformOrigin: '0 0' });
      S.stageEl.appendChild(S.viewportEl);
      S._createdViewport = true;
    }

    S.overlayEl = resolveEl(userConfig.overlay || userConfig.overlayId);
    if (!S.overlayEl) {
      S.overlayEl = document.createElement('div');
      S.overlayEl.id = userConfig.overlayId || (S.id + '-grid-overlay');
      S.overlayEl.setAttribute('aria-hidden', 'true');
      Object.assign(S.overlayEl.style, { position: 'absolute', inset: '0', pointerEvents: 'none' });
      S.stageEl.appendChild(S.overlayEl);
      S._createdOverlay = true;
    } else {
      S.overlayEl.innerHTML = '';
    }

    S.svgRoot = svgEl('svg', { width: '100%', height: '100%', style: 'display:block;position:absolute;top:0;left:0;pointer-events:none;' });
    S.overlayEl.appendChild(S.svgRoot);
  }

  function initInstance(S, userConfig) {
    ensureDom(S, userConfig);
    observeResize(S);
    bindOriginDragGlobal(S);
    if (S.mode === 'full') {
      applyContentTransform(S);
      attachCameraControls(S);
    }
    wireHud(S);
    drawGrid(S);
  }

  function destroyInstance(S) {
    closeMenu(S);
    (S._cleanups || []).forEach((fn) => { try { fn(); } catch (err) { /* ignore */ } });
    const mini = document.getElementById('cadvp-mini-axes-' + S.id); if (mini) mini.remove();
    if (S._settingsBtn) S._settingsBtn.remove();
    if (S._autoHud) S._autoHud.remove();
    if (S._createdOverlay && S.overlayEl) S.overlayEl.remove();
    if (S._createdViewport && S.viewportEl) S.viewportEl.remove();
    registry.delete(S.id);
  }

  // ======================================================================
  // Factory
  // ======================================================================

  function create(userConfig) {
    userConfig = userConfig || {};
    const stageEl = resolveEl(userConfig.stage || userConfig.stageId);
    if (!stageEl) {
      console.error('[CadViewport] create() needs a valid stage element/id — got:', userConfig.stage || userConfig.stageId);
      return null;
    }

    const id = userConfig.id || ('cadvp-' + (++instanceCounter));
    if (registry.has(id)) {
      console.warn('[CadViewport] instance id already exists, returning existing instance:', id);
      return registry.get(id);
    }

    const mode = userConfig.mode === 'grid-only' ? 'grid-only' : 'full';

    const cfg = {
      mmToPx: userConfig.mmToPx || 0.42,
      minScale: userConfig.minScale != null ? userConfig.minScale : 0.1,
      maxScale: userConfig.maxScale != null ? userConfig.maxScale : 50,
      zoomStep: userConfig.zoomStep || 1.15,
      autoSpacing: userConfig.autoSpacing != null ? userConfig.autoSpacing : (mode === 'full'),
      majorSpacingMm: userConfig.majorSpacingMm || 100,
      minorSpacingMm: userConfig.minorSpacingMm || 10,
      majorTargetPx: userConfig.majorTargetPx || 110,
      minorTargetPx: userConfig.minorTargetPx || 22,
      label: userConfig.label || '',
      hud: Object.assign({ autoCreate: false, autoCreateSettings: true }, userConfig.hud || {}),
      onExport: userConfig.onExport || null,
      onPointerWorld: userConfig.onPointerWorld || null,
      onChange: userConfig.onChange || null,
      enableKeyboard: userConfig.enableKeyboard !== false,
      enableTouch: userConfig.enableTouch !== false,
      enableOriginDrag: userConfig.enableOriginDrag !== false,
      showCursorCoord: userConfig.showCursorCoord !== false,
      showScaleBar: userConfig.showScaleBar !== false,
      showZoomPct: !!userConfig.showZoomPct,
      showMiniAxes: !!userConfig.showMiniAxes,
      showAxes: userConfig.showAxes !== false,
      showCrosshair: !!userConfig.showCrosshair,
    };

    const S = {
      id, mode, cfg, stageEl,
      viewportEl: null, overlayEl: null, svgRoot: null,
      scale: userConfig.initialScale || 1,
      panX: userConfig.initialPanX != null ? userConfig.initialPanX : 120,
      panY: userConfig.initialPanY != null ? userConfig.initialPanY : 200,
      originX: userConfig.initialOriginX || 0,
      originY: userConfig.initialOriginY || 0,
      cursorWorld: null,
      isDraggingOrigin: false,
      dragOriginStart: null,
      activeMenu: null,
      pointers: new Map(),
      isPanning: false,
      lastPointer: null,
      pinchStartDist: 0,
      pinchStartScale: 1,
      listeners: { change: [], pointer: [] },
      _cleanups: [],
      _linking: false,
    };
    S.homeScale = S.scale; S.homePanX = S.panX; S.homePanY = S.panY;

    const api = {
      id: S.id,
      mode: S.mode,
      init: () => initInstance(S, userConfig),
      destroy: () => destroyInstance(S),
      render: () => drawGrid(S),
      getStage: () => S.stageEl,
      getViewportEl: () => S.viewportEl,
      getOverlayEl: () => S.overlayEl,
      getContentLayer: () => S.viewportEl,
      setContent: (node) => {
        if (S.mode !== 'full') { console.warn('[CadViewport] setContent() only applies in "full" mode — instance', S.id, 'is grid-only'); return; }
        S.viewportEl.innerHTML = '';
        (Array.isArray(node) ? node : [node]).filter(Boolean).forEach((n) => S.viewportEl.appendChild(n));
      },
      pan: (dx, dy) => pan(S, dx, dy),
      zoomBy: (factor, center) => zoomBy(S, factor, center),
      zoomTo: (scale, center) => zoomTo(S, scale, center),
      resetView: () => resetView(S),
      fitToContent: (padding) => fitToContent(S, padding),
      setOrigin: (x, y) => { S.originX = x; S.originY = y; drawGrid(S); },
      getOrigin: () => ({ x: S.originX, y: S.originY }),
      getView: () => getView(S),
      sync: (scale, panX, panY, originX, originY) => {
        S.scale = scale; S.panX = panX; S.panY = panY;
        if (originX != null) S.originX = originX;
        if (originY != null) S.originY = originY;
        drawGrid(S);
      },
      updateView: (scale, panX, panY, originX, originY) => api.sync(scale, panX, panY, originX, originY),
      setCursor: (pos) => { S.cursorWorld = pos; drawGrid(S); },
      clearCursor: () => { S.cursorWorld = null; drawGrid(S); },
      screenToWorld: (x, y) => screenToWorld(S, x, y),
      worldToScreen: (x, y) => worldToScreen(S, x, y),
      exportSVG: () => requestExport(S, 'svg'),
      exportPNG: () => requestExport(S, 'png'),
      setToggle: (name, value) => { if (name in S.cfg) { S.cfg[name] = value; drawGrid(S); } },
      getToggle: (name) => S.cfg[name],
      setLabel: (text) => { S.cfg.label = text; drawGrid(S); },
      linkTo: (otherApi, opts) => (otherApi && otherApi.__S ? linkTo(S, otherApi.__S, opts) : (() => {})),
      on: (evt, cb) => { (S.listeners[evt] = S.listeners[evt] || []).push(cb); },
      off: (evt, cb) => { if (S.listeners[evt]) S.listeners[evt] = S.listeners[evt].filter((f) => f !== cb); },
      __S: S,
    };

    registry.set(id, api);
    return api;
  }

  function get(id) { return registry.get(id) || null; }
  function all() { return Array.from(registry.values()); }

  global.App = global.App || {};
  global.App.CadViewport = { create, get, all, VERSION: '1.0.0' };
})(window);
