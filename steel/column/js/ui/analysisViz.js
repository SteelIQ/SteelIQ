/**
 * Unified Analysis CAD Visualizations (Pure Native SVG Engine)
 */
(function (global) {
  'use strict';

  const state = global.App.state;
  const bus = global.App.bus;
  const Analysis = global.App.Analysis;

  // Track pan/zoom state per view instance
  let scale = 1, panX = 100, panY = 50;

  function render() {
    console.log('[AnalysisViz] Render triggered (Native SVG)');
    
    const col = state.getSelected();
    const view = document.getElementById('view-diagrams');
    if (!view || view.style.display === 'none') return;

    const container = document.getElementById('diagrams-viewport');
    const emptyEl = document.getElementById('diagrams-empty');
    if (!container) return;

    if (!col) {
      container.innerHTML = '';
      if (emptyEl) emptyEl.style.display = 'flex';
      return;
    }

    if (container.clientWidth === 0 || container.clientHeight === 0) {
      setTimeout(render, 10);
      return;
    }

    if (emptyEl) emptyEl.style.display = 'none';
    const r = Analysis.calculateColumn(col);
    
    drawNativeSvgDiagram(container, col, r);
    renderDataTable(r);
  }

  function drawNativeSvgDiagram(container, col, r) {
    const width = container.clientWidth;
    const height = container.clientHeight;

    container.innerHTML = '';

    // Create Root SVG Element
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');
    svg.style.display = 'block';
    svg.style.cursor = 'grab';

    // 1. Defs (Patterns & Markers)
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    
    // Minor Grid Pattern
    const pMin = document.createElementNS('http://www.w3.org/2000/svg', 'pattern');
    pMin.setAttribute('id', 'diag-minor'); pMin.setAttribute('width', '20'); pMin.setAttribute('height', '20'); pMin.setAttribute('patternUnits', 'userSpaceOnUse');
    const pMinPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    pMinPath.setAttribute('d', 'M 20 0 L 0 0 L 0 20'); pMinPath.setAttribute('fill', 'none'); pMinPath.setAttribute('stroke', 'var(--grid-line)'); pMinPath.setAttribute('stroke-width', '0.5');
    pMin.appendChild(pMinPath);
    defs.appendChild(pMin);

    // Major Grid Pattern
    const pMaj = document.createElementNS('http://www.w3.org/2000/svg', 'pattern');
    pMaj.setAttribute('id', 'diag-major'); pMaj.setAttribute('width', '100'); pMaj.setAttribute('height', '100'); pMaj.setAttribute('patternUnits', 'userSpaceOnUse');
    const pMajPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    pMajPath.setAttribute('d', 'M 100 0 L 0 0 L 0 100'); pMajPath.setAttribute('fill', 'none'); pMajPath.setAttribute('stroke', 'var(--border-strong)'); pMajPath.setAttribute('stroke-width', '1');
    pMaj.appendChild(pMajPath);
    defs.appendChild(pMaj);

    // Arrow Marker for Axial Load
    const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
    marker.setAttribute('id', 'arrow-red'); marker.setAttribute('viewBox', '0 0 10 10'); marker.setAttribute('refX', '5'); marker.setAttribute('refY', '5');
    marker.setAttribute('markerWidth', '6'); marker.setAttribute('markerHeight', '6'); marker.setAttribute('orient', 'auto-start-reverse');
    const markerPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    markerPath.setAttribute('d', 'M 0 0 L 10 5 L 0 10 z'); markerPath.setAttribute('fill', 'var(--danger)');
    marker.appendChild(markerPath);
    defs.appendChild(marker);

    // Arrow Marker for Moment
    const markerMom = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
    markerMom.setAttribute('id', 'arrow-blue'); markerMom.setAttribute('viewBox', '0 0 10 10'); markerMom.setAttribute('refX', '5'); markerMom.setAttribute('refY', '5');
    markerMom.setAttribute('markerWidth', '5'); markerMom.setAttribute('markerHeight', '5'); markerMom.setAttribute('orient', 'auto-start-reverse');
    const markerMomPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    markerMomPath.setAttribute('d', 'M 0 0 L 10 5 L 0 10 z'); markerMomPath.setAttribute('fill', 'var(--accent)');
    markerMom.appendChild(markerMomPath);
    defs.appendChild(markerMom);

    svg.appendChild(defs);

    // 2. Background Grid Rects
    const gridBg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    const rectMin = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rectMin.setAttribute('width', '100%'); rectMin.setAttribute('height', '100%'); rectMin.setAttribute('fill', 'url(#diag-minor)');
    const rectMaj = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rectMaj.setAttribute('width', '100%'); rectMaj.setAttribute('height', '100%'); rectMaj.setAttribute('fill', 'url(#diag-major)');
    gridBg.appendChild(rectMin); gridBg.appendChild(rectMaj);
    svg.appendChild(gridBg);

    // 3. Main Transform Group (Pan/Zoom container)
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    svg.appendChild(g);

    function updateTransform() {
      g.setAttribute('transform', `translate(${panX}, ${panY}) scale(${scale})`);
      gridBg.setAttribute('transform', `translate(${panX % 100}, ${panY % 100}) scale(${scale})`);
    }
    updateTransform();

    // --- DRAW ELEVATION DIAGRAM (LEFT) ---
    const cx1 = 250, cy = 300;
    const colH = 380, colW = 60;

    // Title
    const title1 = createSvgText(cx1, cy - 240, 'Elevation & Loading', 'var(--text-primary)', 14, true);
    g.appendChild(title1);

    // Column Body Rect
    const colRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    colRect.setAttribute('x', cx1 - colW / 2); colRect.setAttribute('y', cy - colH / 2);
    colRect.setAttribute('width', colW); colRect.setAttribute('height', colH);
    colRect.setAttribute('fill', 'var(--bg-panel-alt)'); colRect.setAttribute('stroke', 'var(--text-primary)'); colRect.setAttribute('stroke-width', '2');
    g.appendChild(colRect);

    // Top & Bottom Supports (Beams/Slabs)
    const topSup = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    topSup.setAttribute('x', cx1 - colW * 1.2); topSup.setAttribute('y', cy - colH / 2 - 12);
    topSup.setAttribute('width', colW * 2.4); topSup.setAttribute('height', '12');
    topSup.setAttribute('fill', 'var(--text-muted)');
    g.appendChild(topSup);

    const botSup = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    botSup.setAttribute('x', cx1 - colW * 1.2); botSup.setAttribute('y', cy + colH / 2);
    botSup.setAttribute('width', colW * 2.4); botSup.setAttribute('height', '12');
    botSup.setAttribute('fill', 'var(--text-muted)');
    g.appendChild(botSup);

    // Axial Load (P) Arrow & Text
    const pLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    pLine.setAttribute('x1', cx1); pLine.setAttribute('y1', cy - colH / 2 - 60);
    pLine.setAttribute('x2', cx1); pLine.setAttribute('y2', cy - colH / 2 - 16);
    pLine.setAttribute('stroke', 'var(--danger)'); pLine.setAttribute('stroke-width', '3'); pLine.setAttribute('marker-end', 'url(#arrow-red)');
    g.appendChild(pLine);
    g.appendChild(createSvgText(cx1 + 15, cy - colH / 2 - 35, `P (${r.P_tot.toFixed(0)} kN)`, 'var(--danger)', 13, true));

    // Moment (M) Curved Arrow
    if (r.mx > 0 || r.my > 0) {
      const mArc = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      mArc.setAttribute('d', `M ${cx1 - 30} ${cy - colH / 2 + 20} A 30 30 0 0 1 ${cx1 + 30} ${cy - colH / 2 + 20}`);
      mArc.setAttribute('fill', 'none'); mArc.setAttribute('stroke', 'var(--accent)'); mArc.setAttribute('stroke-width', '2'); mArc.setAttribute('marker-end', 'url(#arrow-blue)');
      g.appendChild(mArc);
      g.appendChild(createSvgText(cx1 + 40, cy - colH / 2 + 10, 'M', 'var(--accent)', 13, true));
    }

    // Dimension Line (Lu)
    const dimLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    dimLine.setAttribute('x1', cx1 - colW / 2 - 30); dimLine.setAttribute('y1', cy - colH / 2);
    dimLine.setAttribute('x2', cx1 - colW / 2 - 30); dimLine.setAttribute('y2', cy + colH / 2);
    dimLine.setAttribute('stroke', 'var(--annotate)'); dimLine.setAttribute('stroke-width', '1');
    g.appendChild(dimLine);
    g.appendChild(createSvgText(cx1 - colW / 2 - 40, cy, `Lu = ${r.Lu} mm`, 'var(--annotate)', 12, false, 'end'));


    // --- DRAW STRESS BLOCK DIAGRAM (RIGHT) ---
    const cx2 = 700;
    const sWidth = 320, sHeight = 160;

    g.appendChild(createSvgText(cx2, cy - 240, 'Uncracked Elastic Stress Block', 'var(--text-primary)', 14, true));

    // Center Axis Line
    const axisLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    axisLine.setAttribute('x1', cx2 - sWidth / 2); axisLine.setAttribute('y1', cy + sHeight / 2);
    axisLine.setAttribute('x2', cx2 + sWidth / 2); axisLine.setAttribute('y2', cy + sHeight / 2);
    axisLine.setAttribute('stroke', 'var(--text-primary)'); axisLine.setAttribute('stroke-width', '3');
    g.appendChild(axisLine);
    g.appendChild(createSvgText(cx2, cy + sHeight / 2 + 22, 'Cross Section Axis', 'var(--text-secondary)', 11, true));

    const maxAbs = Math.max(Math.abs(r.sigma_max), Math.abs(r.sigma_min));
    if (maxAbs > 0) {
      // Scale heights based on stress magnitude
      const topStressY = cy + sHeight / 2 - (Math.abs(r.sigma_max) / maxAbs) * sHeight;
      const botStressY = cy + sHeight / 2 - (r.sigma_min < 0 ? - (Math.abs(r.sigma_min) / maxAbs) * (sHeight / 2) : (r.sigma_min / maxAbs) * sHeight);

      // Stress Polygon Fill
      const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      const pts = `${cx2 - sWidth/2},${cy + sHeight/2} ${cx2 - sWidth/2},${topStressY} ${cx2 + sWidth/2},${botStressY} ${cx2 + sWidth/2},${cy + sHeight/2}`;
      poly.setAttribute('points', pts);
      poly.setAttribute('fill', r.sigma_min < 0 ? 'rgba(59, 130, 246, 0.2)' : 'rgba(239, 68, 68, 0.2)');
      poly.setAttribute('stroke', 'var(--danger)'); poly.setAttribute('stroke-width', '1');
      g.appendChild(poly);

      // Top connecting stress line
      const topStressLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      topStressLine.setAttribute('x1', cx2 - sWidth / 2); topStressLine.setAttribute('y1', topStressY);
      topStressLine.setAttribute('x2', cx2 + sWidth / 2); topStressLine.setAttribute('y2', botStressY);
      topStressLine.setAttribute('stroke', 'var(--text-primary)'); topStressLine.setAttribute('stroke-width', '2');
      g.appendChild(topStressLine);

      // Stress Texts
      g.appendChild(createSvgText(cx2 - sWidth / 2, topStressY - 10, `+${r.sigma_max.toFixed(2)} MPa`, 'var(--danger)', 13, false));
      const minColor = r.sigma_min < 0 ? 'var(--accent)' : 'var(--danger)';
      g.appendChild(createSvgText(cx2 + sWidth / 2, botStressY + (r.sigma_min < 0 ? 20 : -10), `${r.sigma_min.toFixed(2)} MPa`, minColor, 13, false, 'end'));
    }

    // --- Native Mouse Pan & Zoom Interactivity ---
    let isDragging = false, startX = 0, startY = 0;
    
    svg.onmousedown = (e) => {
      if(e.target.tagName === 'BUTTON' || e.target.closest('#diag-data-table')) return;
      isDragging = true; startX = e.clientX - panX; startY = e.clientY - panY;
      svg.style.cursor = 'grabbing';
    };
    window.onmousemove = (e) => {
      if (!isDragging) return;
      panX = e.clientX - startX; panY = e.clientY - startY;
      updateTransform();
    };
    window.onmouseup = () => { isDragging = false; svg.style.cursor = 'grab'; };
    
    svg.onwheel = (e) => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
      scale = Math.max(0.3, Math.min(4, scale * zoomFactor));
      updateTransform();
    };

    // Bind HUD buttons
    document.getElementById('diag-zoom-in').onclick = () => { scale = Math.min(4, scale * 1.2); updateTransform(); };
    document.getElementById('diag-zoom-out').onclick = () => { scale = Math.max(0.3, scale * 0.8); updateTransform(); };
    document.getElementById('diag-zoom-reset').onclick = () => { scale = 1; panX = 100; panY = 50; updateTransform(); };

    container.appendChild(svg);
  }

  function createSvgText(x, y, text, fill, fontSize, isBold = false, anchor = 'middle') {
    const txt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    txt.setAttribute('x', x); txt.setAttribute('y', y);
    txt.setAttribute('fill', fill); txt.setAttribute('font-size', fontSize);
    txt.setAttribute('font-family', 'var(--font-mono)');
    txt.setAttribute('text-anchor', anchor);
    if (isBold) txt.setAttribute('font-weight', 'bold');
    txt.textContent = text;
    return txt;
  }

  function renderDataTable(r) {
    const el = document.getElementById('diag-data-table');
    if (!el) return;
    
    // Absolute positioning overlay
    el.style.position = 'absolute';
    el.style.bottom = '20px';
    el.style.right = '20px';
    el.style.zIndex = '20';
    el.style.background = 'transparent';
    el.style.border = 'none';
    el.style.boxShadow = 'none';
    el.style.padding = '0';
    el.style.width = 'max-content';
    el.style.minWidth = '300px';
    
    el.innerHTML = `
      <div style="background: var(--bg-panel); border: 1px solid var(--border-strong); border-radius: 6px; box-shadow: 0 4px 12px rgba(0,0,0,0.4); display: flex; flex-direction: column; overflow: hidden;">
        
        <!-- Collapsible Header -->
        <div id="diag-table-header" style="background: var(--bg-panel-alt); padding: 10px 16px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; font-size: 11px; font-weight: bold; letter-spacing: 0.5px; text-transform: uppercase;">
          <span style="color: var(--text-primary);">Analysis Parameters</span>
          <svg id="diag-table-icon" viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" style="transition: transform 0.25s ease;"><path d="M19 9l-7 7-7-7"/></svg>
        </div>

        <!-- Table Body -->
        <div id="diag-table-body" style="display: block; border-top: 1px solid var(--border-strong);">
          <table class="mark-table" style="width: 100%; border: none; margin: 0;">
            <tbody>
              <tr><td style="color:var(--text-secondary); white-space: nowrap; padding: 8px 16px;">Base Applied Load</td><td style="padding: 8px 16px; text-align: right;">${r.pFloor} kN/fl</td></tr>
              <tr><td style="color:var(--text-secondary); white-space: nowrap; padding: 8px 16px;">Self-Weight</td><td style="padding: 8px 16px; text-align: right;">${r.selfWeightPerFloor.toFixed(1)} kN/fl</td></tr>
              <tr><td style="color:var(--text-secondary); white-space: nowrap; padding: 8px 16px;">Total Factored Load (P)</td><td style="color:var(--danger); font-weight:bold; padding: 8px 16px; text-align: right;">${r.P_tot.toFixed(0)} kN</td></tr>
              <tr><td style="color:var(--text-secondary); white-space: nowrap; padding: 8px 16px;">Unsupported Length (Lu)</td><td style="padding: 8px 16px; text-align: right;">${r.Lu} mm</td></tr>
              <tr><td style="color:var(--text-secondary); white-space: nowrap; padding: 8px 16px;">Max Slenderness (λ)</td><td style="${r.isLong ? 'color:var(--danger)' : 'color:var(--text-primary)'}; padding: 8px 16px; text-align: right;">${r.lambda_max.toFixed(2)}</td></tr>
              <tr><td style="color:var(--text-secondary); white-space: nowrap; padding: 8px 16px;">Status</td><td style="padding: 8px 16px; text-align: right;">${r.isSafe ? '<span style="color:var(--accent)">SAFE</span>' : '<span style="color:var(--danger)">UNSAFE</span>'}</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    `;

    // Toggle Collapse Event with clean state management
    const header = document.getElementById('diag-table-header');
    if (header) {
      header.onclick = () => {
        const body = document.getElementById('diag-table-body');
        const icon = document.getElementById('diag-table-icon');
        if (body.style.display === 'none') {
          body.style.display = 'block';
          icon.style.transform = 'rotate(0deg)';
        } else {
          body.style.display = 'none';
          icon.style.transform = 'rotate(-90deg)';
        }
      };
    }
  }

  function init() {
    bus.on('state:selected', render);
    bus.on('state:changed', render);
    bus.on('state:loaded', render);
  }

  global.App = global.App || {};
  global.App.AnalysisViz = { init, render };
})(window);