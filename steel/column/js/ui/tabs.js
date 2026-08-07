/**
 * Workspace Tabs Manager
 */
(function (global) {
    'use strict';

    function init() {
        const tabs = document.querySelectorAll('.ws-tab:not([data-locked])');
        console.info('[Tabs] Initializing workspace tabs manager...', tabs.length, 'tabs found.');

        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const tabName = tab.dataset.tab;
                console.log(`[Tabs] Switching to tab: ${tabName}`);

                // 1. Update active tab UI
                document.querySelectorAll('.ws-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');

                // 2. Hide all views and restore correct display types
                const targetId = 'view-' + tabName;
                document.querySelectorAll('.ws-view').forEach(v => {
                    if (v.id === targetId) {
                        v.style.display = (v.id === 'view-cross-section' || v.id === 'view-diagrams') ? 'flex' : 'block';
                        console.log(`[Tabs] Revealed view: ${v.id} (display: ${v.style.display})`);
                    } else {
                        v.style.display = 'none';
                    }
                });

                // 3. Trigger re-renders when a tab becomes visible so content draws correctly
                if (global.App.Canvas && tabName === 'cross-section') {
                    console.log('[Tabs] Triggering Canvas re-render');
                    global.App.Canvas.render();
                }
                if (global.App.AnalysisViz && tabName === 'diagrams') {
                    console.log('[Tabs] Triggering AnalysisViz re-render');
                    global.App.AnalysisViz.render();
                }
                if (global.App.Calculations && tabName === 'calculations') {
                    console.log('[Tabs] Triggering Calculations re-render');
                    global.App.Calculations.render();
                }
                if (global.App.BBSWorkspace && tabName === 'bbs') {

                    console.log('[Tabs] Triggering BBS Workspace');

                    global.App.BBSWorkspace.render();

                }
                if (global.App.ThreeRenderer && tabName === '3d') {

                    console.log('[Tabs] Triggering Three Renderer');

                    requestAnimationFrame(() => {

                        global.App.ThreeRenderer.resize();

                    });

                }
            });
        });
    }


    // --- View Settings Popover & Checkbox Toggle Logic ---
    const settingsToggle = document.getElementById('view-settings-toggle');
    const settingsPopover = document.getElementById('view-settings-popover');
    const chkPlan = document.getElementById('chk-plan-view');
    const chkElevation = document.getElementById('chk-elevation-view');
    const planPanel = document.getElementById('canvas-stage');
    const elevationPanel = document.getElementById('elevation-panel-container');

    if (settingsToggle && settingsPopover) {
        // Toggle popover on settings icon click
        settingsToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            const isVisible = settingsPopover.style.display === 'block';
            settingsPopover.style.display = isVisible ? 'none' : 'block';
        });

        // Hide popover when clicking anywhere else outside
        document.addEventListener('click', (e) => {
            if (!settingsPopover.contains(e.target) && e.target !== settingsToggle) {
                settingsPopover.style.display = 'none';
            }
        });
    }

    // Handle Checkbox Visibility Changes for Split Layout
    function updateViewLayout() {
        if (!planPanel || !elevationPanel) return;

        const showPlan = chkPlan ? chkPlan.checked : true;
        const showElev = chkElevation ? chkElevation.checked : true;

        planPanel.style.display = showPlan ? 'flex' : 'none';
        elevationPanel.style.display = showElev ? 'flex' : 'none';

        // If both are checked, share space (flex: 1 each). If only one is checked, make it take full width (flex: 1 alone).
        if (showPlan && showElev) {
            planPanel.style.flex = '1';
            elevationPanel.style.flex = '1';
        }
    }

    if (chkPlan) chkPlan.addEventListener('change', updateViewLayout);
    if (chkElevation) chkElevation.addEventListener('change', updateViewLayout);

    global.App = global.App || {};
    global.App.Tabs = { init };
})(window);



