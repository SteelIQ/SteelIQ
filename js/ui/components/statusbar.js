/**
 * StatusBar
 * -----------------------------------------------------------------------
 * Bottom strip: total columns / total quantity in the building, currently
 * selected column, autosave state, and the build phase label.
 */
(function (global) {
  'use strict';

  const state = global.App.state;
  const bus = global.App.bus;

  function render() {
    const summary = state.getSummary();
    document.getElementById('status-count').textContent = `${summary.totalColumns} column types`;
    document.getElementById('status-qty').textContent = `${summary.totalQuantity} total in building`;

    const sel = state.getSelected();
    document.getElementById('status-selection').textContent = sel
      ? `${sel.name} — ${App.ColumnTypes[sel.type].label}`
      : 'No selection';
  }

  function renderSaveState(dirty) {
    const dot = document.getElementById('save-dot');
    const label = document.getElementById('save-label');
    if (dirty) {
      dot.classList.add('dirty');
      label.textContent = 'Saving…';
    } else {
      dot.classList.remove('dirty');
      label.textContent = 'Saved to this browser';
    }
  }

  function init() {
    bus.on('state:changed', render);
    bus.on('state:loaded', render);
    bus.on('state:selected', render);
    bus.on('state:dirty', () => renderSaveState(true));
    bus.on('state:saved', () => renderSaveState(false));
    render();
    renderSaveState(false);
  }

  global.App = global.App || {};
  global.App.StatusBar = { init };
})(window);
