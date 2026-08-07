/**
 * cadGrid.js
 * -----------------------------------------------------------------------
 * Legacy-compatible shim. This used to be the whole grid engine, hardcoded
 * to #canvas-stage. The engine itself now lives in cadViewport.js as a
 * reusable, multi-instance module (App.CadViewport) — see that file's
 * header comment for the full feature list and API.
 *
 * This file just wires up ONE instance of App.CadViewport for the plan
 * view, in 'grid-only' mode, so canvas.js (which already owns pan/zoom of
 * #canvas-viewport) keeps working with zero changes: it still calls
 * App.CadGrid.init() / .render() / .updateView() / .setCursor() /
 * .clearCursor() exactly as before.
 *
 * To add the grid engine to a NEW view, don't copy this file — call
 * App.CadViewport.create({...}) directly. See cadViewport.js's header for
 * a usage example.
 * -----------------------------------------------------------------------
 */
(function (global) {
  'use strict';

  let instance = null;

  function init() {
    if (!global.App || !global.App.CadViewport) {
      console.error('[CadGrid] App.CadViewport is not loaded — check that cadViewport.js is included before cadGrid.js.');
      return;
    }
    if (!document.getElementById('canvas-stage')) return;

    instance = global.App.CadViewport.create({
      id: 'plan-view',
      stage: 'canvas-stage',
      viewportId: 'canvas-viewport', // reuse the real viewport — see note above
      overlayId: 'canvas-grid-overlay',
      mode: 'grid-only',           // canvas.js owns #canvas-viewport's pan/zoom itself
      mmToPx: 0.42,
      majorSpacingMm: 100,
      minorSpacingMm: 10,
      autoSpacing: false,          // keep the exact original fixed 100/10mm look
      initialPanX: 120,
      initialPanY: 200,
      showMiniAxes: false,
      hud: {
        zoomIn: 'hud-zoom-in',
        zoomOut: 'hud-zoom-out',
        reset: 'hud-zoom-reset',
        exportSvg: 'hud-export-svg',
        exportPng: 'hud-export-png',
        autoCreateSettings: true,  // adds the gear icon into the existing .canvas-hud bar
      },
    });

    if (instance) instance.init();
  }

  function render() { if (instance) instance.render(); }
  function updateView(scale, panX, panY, originX, originY) { if (instance) instance.updateView(scale, panX, panY, originX, originY); }
  function setCursor(pos) { if (instance) instance.setCursor(pos); }
  function clearCursor() { if (instance) instance.clearCursor(); }
 // In js/ui/cadGrid.js
function screenToWorld(x, y) { if (instance) return instance.screenToWorld(x, y); return { x: 0, y: 0 }; }

global.App = global.App || {};
global.App.CadGrid = { init, render, updateView, setCursor, clearCursor, screenToWorld };

})(window);
