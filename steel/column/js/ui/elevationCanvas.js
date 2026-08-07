/**
 * Column Side Elevation Visualizer (Console-Logged & Autonomous)
 */
(function (global) {
    'use strict';

    const state = global.App.state;
    const bus = global.App.bus;

    function render() {
        // console.log('[SideElevation] Render triggered');

        const container = document.getElementById('elevation-stage');
        if (!container) {
            // console.error('[SideElevation] ERROR: Could not find <div id="elevation-stage"> in your HTML.');
            return;
        }

        const col = state ? state.getSelected() : null;
        if (!col) {
            // console.log('[SideElevation] No column selected. Displaying empty message.');
            container.innerHTML = '<div style="display:flex; align-items:center; justify-content:center; height:100%; color:var(--text-muted); font-family:var(--font-mono); font-size:12px;">Select a column to view side elevation.</div>';
            return;
        }

        // Guard against flexbox 0x0 sizing race condition
        if (container.clientWidth === 0 || container.clientHeight === 0) {
            // console.warn('[SideElevation] Container dimensions are 0x0. Retrying in 10ms...');
            setTimeout(render, 10);
            return;
        }

        // console.log(`[SideElevation] Drawing elevation. Canvas size: ${container.clientWidth}x${container.clientHeight}`);
        container.innerHTML = '';

        const width = container.clientWidth;
        const height = container.clientHeight;

        // Check Geometry module
        if (!global.App.Geometry || typeof global.App.Geometry.buildElevationData !== 'function') {
            // console.error('[SideElevation] ERROR: App.Geometry.buildElevationData is missing!');
            return;
        }

        const elev = global.App.Geometry.buildElevationData(col);
        // console.log('[SideElevation] Built Elevation Data:', elev);

        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('width', width);
        svg.setAttribute('height', height);
        svg.style.display = 'block';
        svg.style.background = 'var(--bg-canvas)';

        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');

        // Scale & Center
        const scale = Math.min((width - 120) / (elev.width || 400), (height - 100) / (elev.clearHeight || 3000));
        const offsetX = (width - (elev.width || 400) * scale) / 2;
        const offsetY = 50;

        g.setAttribute('transform', `translate(${offsetX}, ${offsetY})`);

        // 1. Concrete Outline Box
        const concreteBox = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        concreteBox.setAttribute('x', 0);
        concreteBox.setAttribute('y', 0);
        concreteBox.setAttribute('width', (elev.width || 400) * scale);
        concreteBox.setAttribute('height', (elev.clearHeight || 3000) * scale);
        concreteBox.setAttribute('fill', 'var(--bg-panel-alt)');
        concreteBox.setAttribute('stroke', 'var(--text-primary)');
        concreteBox.setAttribute('stroke-width', '2');
        g.appendChild(concreteBox);

        // 2. Longitudinal Reinforcement Bars
        const barInsetX = (elev.cover || 40) * scale;
        const barInsetY = (elev.cover || 40) * scale;
        const barWidth = Math.max(10, ((elev.width || 400) - 2 * (elev.cover || 40)) * scale);

        if (elev.bars && elev.bars.length > 0) {
            elev.bars.forEach((group) => {
                const count = Math.min(group.count || 2, 4);
                for (let i = 0; i < count; i++) {
                    const bx = barInsetX + (count > 1 ? (i / (count - 1)) * barWidth : barWidth / 2);
                    const lBar = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                    lBar.setAttribute('x1', bx);
                    lBar.setAttribute('y1', barInsetY);
                    lBar.setAttribute('x2', bx);
                    lBar.setAttribute('y2', ((elev.clearHeight || 3000) - (elev.cover || 40)) * scale);
                    lBar.setAttribute('stroke', 'var(--danger)');
                    lBar.setAttribute('stroke-width', Math.max(2, (group.diameter || 16) / 4));
                    g.appendChild(lBar);
                }
            });
        }

        // 3. Lateral Ties / Stirrups
        if (elev.tieLevels && elev.tieLevels.length > 0) {
            elev.tieLevels.forEach((tie) => {
                const ty = tie.y * scale;
                const tLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                tLine.setAttribute('x1', barInsetX);
                tLine.setAttribute('y1', ty);
                tLine.setAttribute('x2', barInsetX + barWidth);
                tLine.setAttribute('y2', ty);
                tLine.setAttribute('stroke', tie.zone === 'end' ? 'var(--accent)' : 'var(--text-muted)');
                tLine.setAttribute('stroke-width', '1.5');
                g.appendChild(tLine);
            });
        }

        // 4. End Zone Dimension Annotations
        const dimX = (elev.width || 400) * scale + 20;
        const endLen = elev.endZoneLen || 500;

        const botEndDimLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        botEndDimLine.setAttribute('x1', dimX); botEndDimLine.setAttribute('y1', 0);
        botEndDimLine.setAttribute('x2', dimX); botEndDimLine.setAttribute('y2', endLen * scale);
        botEndDimLine.setAttribute('stroke', 'var(--annotate)'); botEndDimLine.setAttribute('stroke-width', '1');
        g.appendChild(botEndDimLine);

        const txtBot = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        txtBot.setAttribute('x', dimX + 8); txtBot.setAttribute('y', (endLen * scale) / 2);
        txtBot.setAttribute('fill', 'var(--annotate)'); txtBot.setAttribute('font-size', '11px');
        txtBot.setAttribute('font-family', 'var(--font-mono)');
        txtBot.textContent = `End Zone (${Math.round(endLen)}mm)`;
        g.appendChild(txtBot);

        svg.appendChild(g);
        container.appendChild(svg);
        // console.log('[SideElevation] Successfully rendered side elevation!');
    }

    function init() {
        // console.log('[SideElevation] Initializing module listeners...');
        if (bus) {
            bus.on('state:selected', render);
            bus.on('state:changed', render);
            bus.on('state:loaded', render);
        }
        render();
    }
    // Auto-initialize when the DOM is ready so it never misses a boot event
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    global.App = global.App || {};
    global.App.SideElevation = {
        init,
        render
    };
})(window);