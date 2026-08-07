/**
 * Panels
 * -----------------------------------------------------------------------
 * Drag-to-resize behaviour for the left/right dockable panels. Widths
 * persist across reloads. Deliberately framework-free pointer handling
 * so it has zero dependency on the rest of the app.
 */
(function (global) {
  'use strict';

  const Storage = global.App.Storage;

  function makeResizer(resizerEl, panelEl, opts) {
    const { min, max, side, storageKey } = opts;
    const saved = Storage.get(storageKey, null);
    if (saved) panelEl.style.width = saved + 'px';

    let startX = 0;
    let startWidth = 0;
    let dragging = false;

    function onPointerDown(e) {
      dragging = true;
      startX = e.clientX;
      startWidth = panelEl.getBoundingClientRect().width;
      resizerEl.classList.add('dragging');
      document.body.style.userSelect = 'none';
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
    }

    function onPointerMove(e) {
      if (!dragging) return;
      const delta = side === 'left' ? (e.clientX - startX) : (startX - e.clientX);
      let width = startWidth + delta;
      width = Math.max(min, Math.min(max, width));
      panelEl.style.width = width + 'px';
    }

    function onPointerUp() {
      dragging = false;
      resizerEl.classList.remove('dragging');
      document.body.style.userSelect = '';
      Storage.set(storageKey, panelEl.getBoundingClientRect().width);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    }

    resizerEl.addEventListener('pointerdown', onPointerDown);
  }

  function init() {
    makeResizer(
      document.getElementById('resizer-left'),
      document.getElementById('panel-left'),
      { min: 180, max: 420, side: 'left', storageKey: 'panelLeftWidth' }
    );
    makeResizer(
      document.getElementById('resizer-right'),
      document.getElementById('panel-right'),
      { min: 220, max: 460, side: 'right', storageKey: 'panelRightWidth' }
    );
  }

  global.App = global.App || {};
  global.App.Panels = { init };
})(window);
