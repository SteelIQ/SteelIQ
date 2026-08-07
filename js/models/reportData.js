/**
 * ReportData — Phase 8 (data layer)
 * -----------------------------------------------------------------------
 * Pure functions, no DOM, no jsPDF/SheetJS — just assembling everything
 * a report needs to say about a column or a project into one plain-
 * object shape. Kept separate from ui/reportPanel.js (which draws this
 * into PDF pages and Excel sheets) so the assembly logic itself can be
 * unit-tested without a browser.
 */
(function (global) {
  'use strict';

  const Calc = global.App.Calc;

  // Five subtle theme colors, cycled by column index — "each section
  // uses a different color for easy identification" from the brief.
  const THEME_COLORS = [
    { name: 'Blue', hex: '#3B6FD6', tint: '#EAF0FC' },
    { name: 'Green', hex: '#1FA968', tint: '#E7F7EF' },
    { name: 'Orange', hex: '#E0741F', tint: '#FCEEE0' },
    { name: 'Purple', hex: '#7B5BD6', tint: '#F0EBFC' },
    { name: 'Gray', hex: '#5B6472', tint: '#EEF0F2' },
  ];

  function themeForIndex(i) {
    return THEME_COLORS[i % THEME_COLORS.length];
  }

  /** Everything the PDF/Excel report needs for ONE column, gathered in
   *  one place. Numbers are per-single-column-instance except where
   *  labeled "Project" — the caller multiplies by quantity as needed. */
  function buildColumnReportData(column, index) {
    const summary = Calc.columnSummary(column);
    const bbs = Calc.bbsSchedule(column);
    return {
      column,
      theme: themeForIndex(index),
      summary,
      bbs,
      qty: Number(column.quantity) || 1,
      totalWeightForQty: summary.totalSteelWeightKg * (Number(column.quantity) || 1),
      totalConcreteForQty: summary.concreteVolumeM3 * (Number(column.quantity) || 1),
    };
  }

  /** Everything the report's project-summary page/sheet needs. */
  function buildProjectReportData(columns, project) {
    const totals = Calc.projectTotals(columns, project);
    const rows = columns.map((col, i) => {
      const s = Calc.columnSummary(col);
      const qty = Number(col.quantity) || 1;
      return {
        name: col.name,
        type: col.type,
        quantity: qty,
        steelPercent: s.steelPercent,
        status: s.status,
        weightPerColumnKg: s.totalSteelWeightKg,
        totalWeightKg: s.totalSteelWeightKg * qty,
        concreteVolumeM3: s.concreteVolumeM3 * qty,
      };
    });
    return { project, totals, rows };
  }

  global.App = global.App || {};
  global.App.ReportData = { THEME_COLORS, themeForIndex, buildColumnReportData, buildProjectReportData };
})(window);
