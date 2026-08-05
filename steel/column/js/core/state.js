/**
 * ProjectState
 * -----------------------------------------------------------------------
 * Single source of truth for the whole app. UI modules never mutate
 * columns directly — they call methods here, which mutate, snapshot for
 * undo/redo, persist to localStorage (debounced), and emit events on
 * App.bus. This is the seam future modules (beams, footings, slabs...)
 * will also go through, so it is intentionally generic:
 *   state.project        -> { name, code, currency, meta }
 *   state.columns         -> Column[]
 *   state.selectedId      -> string|null
 */
(function (global) {
  'use strict';

  const bus = global.App.bus;
  const Storage = global.App.Storage;
  const { createColumn, cloneColumn, suggestName } = global.App.ColumnModel;

  const STORAGE_KEY = 'project';
  const MAX_HISTORY = 50;
  const AUTOSAVE_DEBOUNCE_MS = 400;

  function defaultProject() {
    return {
      name: 'Untitled Project',
      designCode: global.App.DESIGN_CODES[0],
      currency: '₹',
      steelRatePerKg: 68,
      concreteRatePerM3: 6500,
    };
  }

  function ProjectState() {
    this.project = defaultProject();
    this.columns = [];
    this.selectedId = null;
    this.searchTerm = '';
    this._undoStack = [];
    this._redoStack = [];
    this._saveTimer = null;
    this._dirty = false;
  }

  // ---- persistence -------------------------------------------------

  ProjectState.prototype.load = function () {
    const saved = Storage.get(STORAGE_KEY, null);
    if (saved && Array.isArray(saved.columns) && saved.columns.length) {
      this.project = Object.assign(defaultProject(), saved.project);
      this.columns = saved.columns;
      this.selectedId = saved.selectedId || (this.columns[0] && this.columns[0].id) || null;
    } else {
      this._seedSampleProject();
    }
    bus.emit('state:loaded', this.snapshot());
  };

  ProjectState.prototype._seedSampleProject = function () {
    // A couple of realistic starter columns so the app is never a blank
    // void on first run — demonstrates the data model without being fake
    // "demo" logic baked into calculations.
    const c1 = createColumn({ name: 'C1', type: 'rectangle', quantity: 12 });
    const c2 = createColumn({
      name: 'C2', type: 'square', quantity: 8,
      bars: [
        { id: global.App.ColumnModel.nextId(), diameter: 20, count: 4, placement: 'corner' },
        { id: global.App.ColumnModel.nextId(), diameter: 16, count: 4, placement: 'middle' },
      ],
    });
    this.columns = [c1, c2];
    this.selectedId = c1.id;
  };

  ProjectState.prototype._scheduleSave = function () {
    this._dirty = true;
    bus.emit('state:dirty', true);
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => {
      Storage.set(STORAGE_KEY, {
        project: this.project,
        columns: this.columns,
        selectedId: this.selectedId,
      });
      this._dirty = false;
      bus.emit('state:saved', { at: Date.now() });
    }, AUTOSAVE_DEBOUNCE_MS);
  };

  // ---- undo / redo ---------------------------------------------------

  ProjectState.prototype._pushHistory = function () {
    this._undoStack.push(JSON.stringify({ columns: this.columns, selectedId: this.selectedId }));
    if (this._undoStack.length > MAX_HISTORY) this._undoStack.shift();
    this._redoStack.length = 0;
  };

  ProjectState.prototype.undo = function () {
    if (!this._undoStack.length) return;
    this._redoStack.push(JSON.stringify({ columns: this.columns, selectedId: this.selectedId }));
    const prev = JSON.parse(this._undoStack.pop());
    this.columns = prev.columns;
    this.selectedId = prev.selectedId;
    this._scheduleSave();
    bus.emit('state:changed', this.snapshot());
  };

  ProjectState.prototype.redo = function () {
    if (!this._redoStack.length) return;
    this._undoStack.push(JSON.stringify({ columns: this.columns, selectedId: this.selectedId }));
    const next = JSON.parse(this._redoStack.pop());
    this.columns = next.columns;
    this.selectedId = next.selectedId;
    this._scheduleSave();
    bus.emit('state:changed', this.snapshot());
  };

  ProjectState.prototype.canUndo = function () { return this._undoStack.length > 0; };
  ProjectState.prototype.canRedo = function () { return this._redoStack.length > 0; };

  // ---- column CRUD ---------------------------------------------------

  ProjectState.prototype.addColumn = function (partial = {}) {
    this._pushHistory();
    const name = partial.name || suggestName(this.columns);
    const col = createColumn(Object.assign({}, partial, { name }));
    this.columns.push(col);
    this.selectedId = col.id;
    this._scheduleSave();
    bus.emit('state:changed', this.snapshot());
    bus.emit('column:added', col);
    return col;
  };

  ProjectState.prototype.duplicateColumn = function (id) {
    const src = this.getColumn(id);
    if (!src) return null;
    this._pushHistory();
    const copy = cloneColumn(src);
    copy.id = global.App.ColumnModel.nextId();
    copy.name = suggestName(this.columns);
    copy.createdAt = Date.now();
    this.columns.splice(this.columns.indexOf(src) + 1, 0, copy);
    this.selectedId = copy.id;
    this._scheduleSave();
    bus.emit('state:changed', this.snapshot());
    return copy;
  };

  ProjectState.prototype.deleteColumn = function (id) {
    const idx = this.columns.findIndex((c) => c.id === id);
    if (idx === -1) return;
    this._pushHistory();
    this.columns.splice(idx, 1);
    if (this.selectedId === id) {
      const fallback = this.columns[idx] || this.columns[idx - 1];
      this.selectedId = fallback ? fallback.id : null;
    }
    this._scheduleSave();
    bus.emit('state:changed', this.snapshot());
  };

  ProjectState.prototype.updateColumn = function (id, patch, opts = {}) {
    const col = this.getColumn(id);
    if (!col) return;
    if (!opts.skipHistory) this._pushHistory();
    Object.keys(patch).forEach((key) => {
      const val = patch[key];
      if (val && typeof val === 'object' && !Array.isArray(val) && col[key] && typeof col[key] === 'object') {
        Object.assign(col[key], val);
      } else {
        col[key] = val;
      }
    });
    this._scheduleSave();
    bus.emit('state:changed', this.snapshot());
    bus.emit('column:updated', col);
  };

  ProjectState.prototype.getColumn = function (id) {
    return this.columns.find((c) => c.id === id) || null;
  };

  ProjectState.prototype.selectColumn = function (id) {
    this.selectedId = id;
    bus.emit('state:selected', id);
  };

  ProjectState.prototype.getSelected = function () {
    return this.selectedId ? this.getColumn(this.selectedId) : null;
  };

  ProjectState.prototype.setSearch = function (term) {
    this.searchTerm = term || '';
    bus.emit('state:search', this.searchTerm);
  };

  ProjectState.prototype.getFilteredColumns = function () {
    const term = this.searchTerm.trim().toLowerCase();
    if (!term) return this.columns;
    return this.columns.filter((c) =>
      c.name.toLowerCase().includes(term) ||
      c.type.toLowerCase().includes(term) ||
      (c.story || '').toLowerCase().includes(term)
    );
  };

  // ---- project-level summary (basic counts only — Phase 6 owns the
  // engineering totals: steel weight, concrete volume, cost, etc.) ------

  ProjectState.prototype.getSummary = function () {
    const totalColumns = this.columns.length;
    const totalQuantity = this.columns.reduce((sum, c) => sum + (Number(c.quantity) || 0), 0);
    return { totalColumns, totalQuantity };
  };

  // ---- import / export ------------------------------------------------

  ProjectState.prototype.exportJSON = function () {
    return JSON.stringify({ project: this.project, columns: this.columns }, null, 2);
  };

  ProjectState.prototype.importJSON = function (text) {
    const data = JSON.parse(text);
    if (!data || !Array.isArray(data.columns)) throw new Error('Invalid project file: missing "columns" array.');
    this._pushHistory();
    this.project = Object.assign(defaultProject(), data.project || {});
    this.columns = data.columns;
    this.selectedId = (this.columns[0] && this.columns[0].id) || null;
    this._scheduleSave();
    bus.emit('state:changed', this.snapshot());
    bus.emit('state:imported');
  };

  ProjectState.prototype.snapshot = function () {
    return { project: this.project, columns: this.columns, selectedId: this.selectedId };
  };

  global.App = global.App || {};
  global.App.state = new ProjectState();
})(window);
