/**
 * Toolbar
 * -----------------------------------------------------------------------
 * Wires the top toolbar: New/Duplicate/Delete column, Undo/Redo, JSON
 * import/export, design-code selector (stored on the project — Phase 6's
 * formula engine will read it), theme toggle, and the roadmap modal.
 */
(function (global) {
  'use strict';

  const state = global.App.state;
  const bus = global.App.bus;
  const Toast = global.App.Toast;

  function refreshUndoRedoButtons() {
    document.getElementById('btn-undo').disabled = !state.canUndo();
    document.getElementById('btn-redo').disabled = !state.canRedo();
  }

  function triggerDownload(filename, text) {
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  function handleExport() {
    const json = state.exportJSON();
    const name = (state.project.name || 'project').replace(/[^a-z0-9\-_]+/gi, '_');
    triggerDownload(`${name}_bbs_project.json`, json);
    Toast.show('Project exported as JSON');
  }

  function handleImport() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.addEventListener('change', () => {
      const file = input.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          state.importJSON(reader.result);
          Toast.show('Project imported');
        } catch (err) {
          Toast.show('Import failed: ' + err.message, { danger: true });
        }
      };
      reader.readAsText(file);
    });
    input.click();
  }

  function openRoadmap() {
    document.getElementById('roadmap-modal').style.display = 'flex';
  }
  function closeRoadmap() {
    document.getElementById('roadmap-modal').style.display = 'none';
  }

  function init() {
    document.getElementById('btn-new-column').addEventListener('click', () => {
      const col = state.addColumn();
      Toast.show(`Added ${col.name}`);
    });

    document.getElementById('btn-duplicate').addEventListener('click', () => {
      if (!state.selectedId) return;
      const copy = state.duplicateColumn(state.selectedId);
      if (copy) Toast.show(`Duplicated as ${copy.name}`);
    });

    document.getElementById('btn-delete').addEventListener('click', () => {
      const col = state.getSelected();
      if (!col) return;
      if (confirm(`Delete column "${col.name}"?`)) state.deleteColumn(col.id);
    });

    document.getElementById('btn-undo').addEventListener('click', () => state.undo());
    document.getElementById('btn-redo').addEventListener('click', () => state.redo());

    document.getElementById('btn-export').addEventListener('click', handleExport);
    document.getElementById('btn-import').addEventListener('click', handleImport);

    document.getElementById('btn-theme').addEventListener('click', () => global.App.Theme.toggle());

    const codeSelect = document.getElementById('select-design-code');
    global.App.DESIGN_CODES.forEach((code) => {
      const opt = document.createElement('option');
      opt.value = code; opt.textContent = code;
      codeSelect.appendChild(opt);
    });
    codeSelect.value = state.project.designCode;
    codeSelect.addEventListener('change', () => {
      state.project.designCode = codeSelect.value;
      state._scheduleSave();
      Toast.show(`Design code set to ${codeSelect.value} — formulas switch over in Phase 6`);
    });

    document.getElementById('btn-roadmap').addEventListener('click', openRoadmap);
    document.getElementById('roadmap-close').addEventListener('click', closeRoadmap);
    document.getElementById('roadmap-modal').addEventListener('click', (e) => {
      if (e.target.id === 'roadmap-modal') closeRoadmap();
    });

    // Keyboard shortcuts
    window.addEventListener('keydown', (e) => {
      const ctrl = e.ctrlKey || e.metaKey;
      if (!ctrl) return;
      if (e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); state.undo(); }
      else if (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey)) { e.preventDefault(); state.redo(); }
      else if (e.key.toLowerCase() === 'd') { e.preventDefault(); if (state.selectedId) state.duplicateColumn(state.selectedId); }
      else if (e.key.toLowerCase() === 's') { e.preventDefault(); Toast.show('Autosave is already on — nothing to do'); }
    });

    bus.on('state:changed', refreshUndoRedoButtons);
    bus.on('state:loaded', refreshUndoRedoButtons);
    refreshUndoRedoButtons();
  }

  global.App = global.App || {};
  global.App.Toolbar = { init };
})(window);
