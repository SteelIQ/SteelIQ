/**
 * Column model
 * -----------------------------------------------------------------------
 * Plain-data factory for a single column entry. Deliberately holds only
 * data + identity concerns (id, defaults, cloning) — reinforcement
 * calculations (Phase 6), BBS derivation (Phase 7) and drawing (Phase 4)
 * all read this shape but live in their own modules.
 */
(function (global) {
  'use strict';

  let _counter = 0;
  function nextId() {
    _counter += 1;
    return `col_${Date.now().toString(36)}_${_counter}`;
  }

  /**
   * Build the default geometry object for a given shape type by reading
   * the field defaults out of App.ColumnTypes.
   */
  function defaultGeometry(type) {
    const schema = global.App.ColumnTypes[type] || global.App.ColumnTypes.rectangle;
    const geo = {};
    schema.fields.forEach((f) => { geo[f.key] = f.default; });
    global.App.COMMON_FIELDS.forEach((f) => { geo[f.key] = f.default; });
    return geo;
  }

  const SWATCH_COLORS = ['#FF6A3D', '#34D6C4', '#E4D34F', '#3ECF8E', '#7CA8FF', '#C77DFF', '#FF8FA3'];

  /**
   * Create a new Column with sensible engineering defaults. `overrides`
   * (partial) is shallow-merged on top for duplication / import flows.
   */
  function createColumn(overrides = {}) {
    const type = overrides.type || 'rectangle';
    const base = {
      id: nextId(),
      name: overrides.name || 'C1',
      quantity: 1,
      type,
      geometry: defaultGeometry(type),
      concreteGrade: 'M25',
      steelGrade: 'Fe500',
      designCode: global.App.DESIGN_CODES[0],
      story: '',
      // Longitudinal bar groups. Placement is a free-form tag consumed by
      // Phase 4's auto-layout engine. `manualPositions` is null until the
      // engineer drags a bar in Phase 5's placement editor, at which point
      // it holds a baked [{x,y}] array (mm) the same length as `count` —
      // present means "use these exact positions instead of auto layout".
      bars: [
        { id: nextId(), diameter: 16, count: 4, placement: 'corner', manualPositions: null },
      ],
      // In js/models/column.js -> createColumn()
      ties: {
        diameter: 8,
        spacingMiddle: 150,
        spacingEnd: 100,
        endZoneLength: 750,
        shape: 'rectangular', // 'rectangular' | 'circular' | 'spiral' | 'multi-leg'
        hook: 135,
        internalLinkType: 'none', // 'none' | 'cross_x' | 'cross_y' | 'diamond' | 'grid'
        internalLinkDia: 8,
      },
      splices: {
        type: 'lap', // 'lap' | 'coupler' | 'welded'
        isCrankEnabled: false, // 1:6 crank offset bend
        isFootingDowel: false, // Footing starter dowels with 90° L-bend
        dowelEmbedmentMm: 600, // Embedment depth into footing
      },
      notes: '',
      status: 'draft', // draft | checked | warning
      createdAt: Date.now(),
      swatch: SWATCH_COLORS[Math.floor(Math.random() * SWATCH_COLORS.length)],
    };
    return deepMerge(base, overrides);
  }

  function deepMerge(target, source) {
    Object.keys(source || {}).forEach((key) => {
      const sv = source[key];
      if (sv && typeof sv === 'object' && !Array.isArray(sv) && target[key] && typeof target[key] === 'object') {
        deepMerge(target[key], sv);
      } else if (sv !== undefined) {
        target[key] = sv;
      }
    });
    return target;
  }

  /** Deep clone used for duplicate-column and for undo/redo snapshots. */
  function cloneColumn(column) {
    return JSON.parse(JSON.stringify(column));
  }

  /** Suggest the next unused name in a C1, C2, C3... sequence. */
  function suggestName(existingColumns) {
    const used = new Set(existingColumns.map((c) => c.name.toUpperCase()));
    let n = 1;
    while (used.has(`C${n}`)) n += 1;
    return `C${n}`;
  }

  global.App = global.App || {};
  global.App.ColumnModel = { createColumn, cloneColumn, defaultGeometry, suggestName, nextId };
})(window);
