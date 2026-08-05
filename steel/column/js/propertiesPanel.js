/**
 * PropertiesPanel
 * -----------------------------------------------------------------------
 * Renders a data-entry form for the selected column. Geometry fields are
 * generated from App.ColumnTypes (see models/columnTypes.js) so adding a
 * new shape never requires touching this file. Bar-group and tie inputs
 * here are data entry only — the drag/drop visual placement editor and
 * the SVG redraw are Phase 4/5 work; this phase guarantees the data they
 * will consume already exists and is fully editable.
 */
(function (global) {
  'use strict';

  const state = global.App.state;
  const bus = global.App.bus;
  const { ColumnTypes, CONCRETE_GRADES, STEEL_GRADES, DESIGN_CODES, BAR_DIAMETERS } = global.App;

  const root = () => document.getElementById('properties-body');

  function fieldNumber(label, value, unit, onChange, extra = {}) {
    const id = 'f_' + Math.random().toString(36).slice(2, 8);
    return `
      <div class="field">
        <label for="${id}">${label}</label>
        <div class="field-suffix-wrap">
          <input id="${id}" type="number" value="${value}" ${extra.min !== undefined ? `min="${extra.min}"` : ''} step="${extra.step || 1}" data-bind="${extra.bindKey}" />
          ${unit ? `<span class="field-suffix">${unit}</span>` : ''}
        </div>
      </div>`;
  }

  function fieldSelect(label, value, options, bindKey) {
    const id = 'f_' + Math.random().toString(36).slice(2, 8);
    const opts = options.map((o) => {
      const val = typeof o === 'object' ? o.value : o;
      const text = typeof o === 'object' ? o.text : o;
      return `<option value="${val}" ${String(val) === String(value) ? 'selected' : ''}>${text}</option>`;
    }).join('');
    return `<div class="field"><label for="${id}">${label}</label><select id="${id}" data-bind="${bindKey}">${opts}</select></div>`;
  }

  function render() {
    const col = state.getSelected();
    const el = root();
    if (!col) {
      el.innerHTML = `<div class="panel-empty">No column selected.<br>Choose one from the list, or create a new one.</div>`;
      return;
    }

    const typeOptions = Object.keys(ColumnTypes).map((key) => ({ value: key, text: ColumnTypes[key].label }));
    const geoSchema = ColumnTypes[col.type];

    el.innerHTML = `
      <div class="panel-section">
        <div class="section-collapse"><h4>Identity</h4></div>
        ${fieldNumber('Quantity in Building', col.quantity, 'nos', null, { min: 1, step: 1, bindKey: 'quantity' })}
        ${fieldSelect('Story / Location', col.story, [{ value: '', text: '—' }, 'Foundation', 'GF', '1F', '2F', '3F', '4F', 'Roof', 'Lift/Stair'].map(v => typeof v === 'string' ? v : v), 'story')}
        ${fieldSelect('Design Code', col.designCode, DESIGN_CODES, 'designCode')}
      </div>

      <div class="panel-section">
        <div class="section-collapse"><h4>Geometry</h4></div>
        ${fieldSelect('Column Type', col.type, typeOptions, 'type')}
        ${geoSchema.fields.map((f) => fieldNumber(f.label, col.geometry[f.key], f.unit, null, { min: f.min, step: f.step, bindKey: 'geometry.' + f.key })).join('')}
        ${global.App.COMMON_FIELDS.map((f) => fieldNumber(f.label, col.geometry[f.key], f.unit, null, { min: f.min, step: f.step, bindKey: 'geometry.' + f.key })).join('')}
        ${geoSchema.note ? `<div class="notice">${infoIcon()}<span>${geoSchema.note}</span></div>` : ''}
      </div>

      <div class="panel-section">
        <div class="section-collapse"><h4>Materials</h4></div>
        ${fieldSelect('Concrete Grade', col.concreteGrade, CONCRETE_GRADES, 'concreteGrade')}
        ${fieldSelect('Steel Grade', col.steelGrade, STEEL_GRADES, 'steelGrade')}
      </div>

      <div class="panel-section">
        <div class="section-collapse"><h4>Longitudinal Bars</h4></div>
        <div id="bar-groups">${col.bars.map((b, i) => barGroupRow(b, i)).join('')}</div>
        <button class="btn btn-block" id="btn-add-bar" style="margin-top:6px;">+ Add Bar Group</button>
        <div class="field-hint" style="margin-top:6px;">Visual drag-and-drop placement on the drawing arrives in Phase 5. Placement tags set here already drive it once that lands.</div>
      </div>

      <div class="panel-section">
        <div class="section-collapse"><h4>Ties / Stirrups</h4></div>
        ${fieldSelect('Diameter', col.ties.diameter, BAR_DIAMETERS.filter(d => d <= 12), 'ties.diameter')}
        ${fieldSelect('Shape', col.ties.shape, ['rectangular', 'circular', 'polygon-cross'], 'ties.shape')}
        <div class="field-row">
          ${fieldNumber('Spacing (End Zone)', col.ties.spacingEnd, 'mm', null, { min: 25, step: 5, bindKey: 'ties.spacingEnd' })}
          ${fieldNumber('Spacing (Middle)', col.ties.spacingMiddle, 'mm', null, { min: 25, step: 5, bindKey: 'ties.spacingMiddle' })}
        </div>
        ${fieldNumber('End Zone Length', col.ties.endZoneLength, 'mm', null, { min: 100, step: 10, bindKey: 'ties.endZoneLength' })}
        ${fieldSelect('Hook Angle', col.ties.hook, [{ value: 135, text: '135°' }, { value: 90, text: '90°' }], 'ties.hook')}
      </div>

      <div class="panel-section">
        <div class="section-collapse"><h4>Notes</h4></div>
        <textarea id="col-notes" rows="3" placeholder="Engineer's remarks for the PDF report...">${col.notes || ''}</textarea>
      </div>

      <div class="panel-section">
        <button class="btn btn-danger-outline btn-block" id="btn-delete-column">Delete This Column</button>
      </div>
    `;

    bindInputs(col);
  }

  function infoIcon() {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 8v.01M12 11v5"/></svg>';
  }

  function barGroupRow(bar, index) {
    const diamOptions = BAR_DIAMETERS.map((d) => `<option value="${d}" ${d === bar.diameter ? 'selected' : ''}>${d}mm</option>`).join('');
    const placements = ['corner', 'middle', 'top', 'bottom', 'left-face', 'right-face', 'custom'];
    const placeOptions = placements.map((p) => `<option value="${p}" ${p === bar.placement ? 'selected' : ''}>${p}</option>`).join('');
    return `
      <div class="field-row" data-bar-id="${bar.id}" style="margin-bottom:6px; align-items:flex-end;">
        <div class="field" style="flex:0 0 64px;"><label>Dia</label><select data-bar-field="diameter">${diamOptions}</select></div>
        <div class="field" style="flex:0 0 56px;"><label>Count</label><input type="number" min="1" step="1" value="${bar.count}" data-bar-field="count" /></div>
        <div class="field" style="flex:1;"><label>Placement</label><select data-bar-field="placement">${placeOptions}</select></div>
        <button class="ci-action-btn danger" data-remove-bar="${bar.id}" style="margin-bottom:10px;">✕</button>
      </div>`;
  }

  function bindInputs(col) {
    root().querySelectorAll('[data-bind]').forEach((input) => {
      input.addEventListener('change', () => {
        const path = input.dataset.bind;
        const value = input.type === 'number' ? Number(input.value) : input.value;
        if (path === 'type') {
          // Shape change: rebuild geometry from the new type's own defaults
          // rather than patching mismatched keys onto the old shape's geometry.
          state.updateColumn(col.id, { type: value, geometry: global.App.ColumnModel.defaultGeometry(value) });
          render();
          return;
        }
        state.updateColumn(col.id, buildPatch(path, value));
      });
    });

    root().querySelectorAll('[data-bar-field]').forEach((input) => {
      input.addEventListener('change', () => {
        const row = input.closest('[data-bar-id]');
        const barId = row.dataset.barId;
        const bar = col.bars.find((b) => b.id === barId);
        if (!bar) return;
        const field = input.dataset.barField;
        bar[field] = (field === 'count' || field === 'diameter') ? Number(input.value) : input.value;
        state.updateColumn(col.id, { bars: col.bars });
      });
    });

    root().querySelectorAll('[data-remove-bar]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const barId = btn.dataset.removeBar;
        if (col.bars.length <= 1) { global.App.Toast.show('A column needs at least one bar group.', { danger: true }); return; }
        const updated = col.bars.filter((b) => b.id !== barId);
        state.updateColumn(col.id, { bars: updated });
        render();
      });
    });

    const addBarBtn = document.getElementById('btn-add-bar');
    if (addBarBtn) addBarBtn.addEventListener('click', () => {
      col.bars.push({ id: global.App.ColumnModel.nextId(), diameter: 12, count: 2, placement: 'middle' });
      state.updateColumn(col.id, { bars: col.bars });
      render();
    });

    const notes = document.getElementById('col-notes');
    if (notes) notes.addEventListener('change', () => state.updateColumn(col.id, { notes: notes.value }));

    const delBtn = document.getElementById('btn-delete-column');
    if (delBtn) delBtn.addEventListener('click', () => {
      if (confirm(`Delete column "${col.name}"?`)) state.deleteColumn(col.id);
    });
  }

  /** Builds a nested patch object from a dotted path, e.g. "geometry.side" -> { geometry: { side: v } } */
  function buildPatch(path, value) {
    const keys = path.split('.');
    const root = {};
    let cur = root;
    keys.forEach((key, i) => {
      if (i === keys.length - 1) cur[key] = value;
      else { cur[key] = {}; cur = cur[key]; }
    });
    return root;
  }

  function init() {
    bus.on('state:selected', render);
    bus.on('state:loaded', render);
    bus.on('column:added', render);
    render();
  }

  global.App = global.App || {};
  global.App.PropertiesPanel = { init, render };
})(window);
