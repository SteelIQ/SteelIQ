/**
 * BbsPanel — Phase 7 UI
 * -----------------------------------------------------------------------
 * Renders the "BBS Schedule" workspace tab: a real Bar Bending Schedule
 * table (mark, shape, dia, nos, cutting length, weight) for the selected
 * column, a development/lap length reference table per bar diameter,
 * and — for IS 13920 columns — the no-lap-zone note. All numbers come
 * from models/calc.js's bbsSchedule(), which itself reads bar positions
 * through Geometry.resolveBars, so this stays consistent with the
 * drawing and the Calculations tab.
 */
(function (global) {
  'use strict';

  const state = global.App.state;
  const bus = global.App.bus;
  const Calc = global.App.Calc;

  const root = () => document.getElementById('bbs-body');

  function fmt(n, decimals = 2) {
    return Number(n).toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function render() {
    const col = state.getSelected();
    const el = root();
    if (!col) {
      el.innerHTML = `<div class="panel-empty" style="padding:40px;">Select a column to see its Bar Bending Schedule.</div>`;
      return;
    }

    const bbs = Calc.bbsSchedule(col);
    const qty = Number(col.quantity) || 1;

    el.innerHTML = `
      <div class="calc-header">
        <h3>${escapeHtml(col.name)} <span class="text-muted" style="font-weight:400;">— Bar Bending Schedule, ${col.designCode}</span></h3>
      </div>

      ${bbs.noLapZoneMm != null ? `
      <div class="notice" style="margin-bottom:14px;">${infoIcon()}<span>Seismic detailing (IS 13920): keep lap splices outside the <strong>${bbs.noLapZoneMm}mm</strong> confining zone at each beam-column joint face.</span></div>
      ` : ''}

      <div class="calc-section">
        <h4>Bar Bending Schedule <span class="text-muted" style="font-weight:400; text-transform:none; letter-spacing:0;">— per column, × ${qty} in building</span></h4>
        <table class="calc-table">
          <thead><tr><th>Mark</th><th>Shape</th><th>Dia</th><th>Nos</th><th>Cutting Length</th><th>Unit Wt</th><th>Wt/Bar</th><th>Total</th></tr></thead>
          <tbody>
            ${bbs.rows.map((r) => `
              <tr>
                <td>${r.mark}</td>
                <td>${escapeHtml(r.shape)}</td>
                <td>T${r.diameter}</td>
                <td>${r.nos}</td>
                <td>${r.cuttingLengthMm} mm</td>
                <td>${fmt(r.unitWeightKgPerM, 3)} kg/m</td>
                <td>${fmt(r.weightPerBarKg, 2)} kg</td>
                <td>${fmt(r.totalKg, 2)} kg</td>
              </tr>`).join('')}
            <tr class="calc-table-total"><td colspan="7">Total (per column)</td><td>${fmt(bbs.totalWeightKg, 2)} kg</td></tr>
            <tr class="calc-table-total"><td colspan="7">Total × ${qty} in building</td><td>${fmt(bbs.totalWeightKg * qty, 1)} kg</td></tr>
          </tbody>
        </table>
        <div class="field-hint">${escapeHtml(bbs.longSteelNote)}</div>
        <div class="field-hint">${escapeHtml(bbs.tieNote)}</div>
      </div>

      <div class="calc-section">
        <h4>Development &amp; Lap Length Reference</h4>
        <table class="calc-table">
          <thead><tr><th>Dia</th><th>Ld (Tension)</th><th>Ld (Compression)</th><th>Lap (Tension)</th><th>Lap (Compression)</th></tr></thead>
          <tbody>
            ${bbs.reference.map((r) => `
              <tr>
                <td>T${r.diameter}</td>
                <td>${Math.round(r.ldTension)} mm</td>
                <td>${Math.round(r.ldCompression)} mm</td>
                <td>${Math.round(r.lapTension)} mm</td>
                <td>${Math.round(r.lapCompression)} mm</td>
              </tr>`).join('')}
          </tbody>
        </table>
        <div class="field-hint">${escapeHtml(global.App.DevLap.disclosureFor(col.designCode))} Lap length = max(Ld, 30φ tension / 24φ compression).</div>
      </div>
    `;
  }

  function infoIcon() {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 8v.01M12 11v5"/></svg>';
  }

  function init() {
    bus.on('state:selected', render);
    bus.on('state:changed', render);
    bus.on('state:loaded', render);
    render();
  }

  global.App = global.App || {};
  global.App.BbsPanel = { init, render };
})(window);
