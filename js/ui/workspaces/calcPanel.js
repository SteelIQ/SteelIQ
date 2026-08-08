/**
 * CalcPanel — Phase 6 UI
 * -----------------------------------------------------------------------
 * Renders the "Calculations" workspace tab: section properties, spacing
 * checks, steel/concrete quantities, safety checks for the selected
 * column, and a project-totals card aggregated across every column.
 * Pure display — all the numbers come from models/calc.js, which reads
 * bar positions through Geometry.resolveBars so a Phase 5 hand-drag is
 * reflected here too.
 */
(function (global) {
  'use strict';

  const state = global.App.state;
  const bus = global.App.bus;
  const Calc = global.App.Calc;

  const root = () => document.getElementById('calc-body');

  function fmt(n, decimals = 2) {
    return Number(n).toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  }

  function badgeForLevel(level) {
    return level === 'danger' ? 'badge-danger' : level === 'warning' ? 'badge-warn' : 'badge-ok';
  }
  function badgeForStatus(status) {
    return status === 'danger' ? 'badge-danger' : status === 'warning' ? 'badge-warn' : 'badge-ok';
  }
  function statusLabel(status) {
    return status === 'danger' ? 'Needs attention' : status === 'warning' ? 'Review' : 'OK';
  }

  function render() {
    const col = state.getSelected();
    const el = root();
    if (!col) {
      el.innerHTML = `<div class="panel-empty" style="padding:40px;">Select a column to see its calculations.</div>${projectSummarySection()}`;
      return;
    }

    const s = Calc.columnSummary(col);

    el.innerHTML = `
      <div class="calc-header">
        <div>
          <h3>${escapeHtml(col.name)} <span class="text-muted" style="font-weight:400;">— ${App.ColumnTypes[col.type].label}, ${col.quantity} nos in building</span></h3>
        </div>
        <span class="badge ${badgeForStatus(s.status)}">${statusLabel(s.status)}</span>
      </div>

      <div class="calc-grid">
        ${statCard('Gross Area', `${fmt(s.grossAreaMm2 / 1e6, 4)} m²`, `${fmt(s.grossAreaMm2, 0)} mm²`)}
        ${statCard('Steel Area', `${fmt(s.steelAreaMm2, 0)} mm²`, `${col.bars.reduce((n, g) => n + g.count, 0)} bars total`)}
        ${statCard('Steel %', `${fmt(s.steelPercent, 3)}%`, `min ${s.rules.minSteelPercent}% · max ${s.rules.maxSteelPercent}%`)}
        ${statCard('Concrete Volume', `${fmt(s.concreteVolumeM3, 3)} m³`, `per column, × ${col.quantity} in building`)}
        ${statCard('Steel Weight', `${fmt(s.totalSteelWeightKg, 1)} kg`, `per column, × ${col.quantity} in building`)}
        ${statCard('Total (this type)', `${fmt(s.totalSteelWeightKg * col.quantity, 0)} kg`, `${fmt(s.concreteVolumeM3 * col.quantity, 2)} m³ concrete`)}
      </div>

      <div class="calc-section">
        <h4>Safety Checks <span class="text-muted" style="font-weight:400; text-transform:none; letter-spacing:0;">— ${col.designCode}</span></h4>
        <ul class="check-list">
          ${s.checks.map((c) => `<li class="check-item"><span class="badge ${badgeForLevel(c.level)}">${c.level}</span><span>${escapeHtml(c.message)}</span></li>`).join('')}
        </ul>
      </div>

      <div class="calc-section">
        <h4>Longitudinal Steel</h4>
        <table class="calc-table">
          <thead><tr><th>Mark</th><th>Dia</th><th>Nos</th><th>Unit Wt</th><th>Length</th><th>Wt/Bar</th><th>Total</th></tr></thead>
          <tbody>
            ${s.longitudinalSteel.rows.map((r, i) => `
              <tr>
                <td>${i + 1}</td>
                <td>T${r.diameter}</td>
                <td>${r.count}</td>
                <td>${fmt(r.unitWeightKgPerM, 3)} kg/m</td>
                <td>${fmt(r.lengthM, 2)} m</td>
                <td>${fmt(r.weightPerBarKg, 2)} kg</td>
                <td>${fmt(r.totalKg, 2)} kg</td>
              </tr>`).join('')}
            <tr class="calc-table-total"><td colspan="6">Longitudinal subtotal</td><td>${fmt(s.longitudinalSteel.totalKg, 2)} kg</td></tr>
          </tbody>
        </table>
        <div class="field-hint">${s.longitudinalSteel.note}</div>
      </div>

      <div class="calc-section">
        <h4>Ties / Stirrups</h4>
        <table class="calc-table">
          <thead><tr><th>Dia</th><th>Count</th><th>Ring Length</th><th>Wt/Tie</th><th>Total</th></tr></thead>
          <tbody>
            <tr>
              <td>T${s.ties.tieDia}</td>
              <td>${s.ties.tieCount}</td>
              <td>${s.ties.ringLengthMm} mm</td>
              <td>${fmt(s.ties.weightPerTieKg, 3)} kg</td>
              <td>${fmt(s.ties.totalKg, 2)} kg</td>
            </tr>
          </tbody>
        </table>
        <div class="field-hint">${s.ties.note}</div>
      </div>

      <div class="calc-section">
        <h4>Bar Spacing</h4>
        ${s.spacing.length ? `
        <table class="calc-table">
          <thead><tr><th>Group</th><th>Bars</th><th>Center-to-Center</th><th>Clear Spacing</th><th>Required</th><th></th></tr></thead>
          <tbody>
            ${s.spacing.map((row) => `
              <tr>
                <td>T${row.diameter}</td>
                <td>#${row.barIndexA + 1} → #${row.barIndexB + 1}</td>
                <td>${row.centerToCenter} mm</td>
                <td>${row.clearSpacing} mm</td>
                <td>${row.required} mm</td>
                <td><span class="badge ${row.ok ? 'badge-ok' : 'badge-danger'}">${row.ok ? 'OK' : 'TOO CLOSE'}</span></td>
              </tr>`).join('')}
          </tbody>
        </table>
        <div class="field-hint">Minimum clear spacing = larger of the two bar diameters or 25mm (simplified floor).</div>
        ` : `<div class="field-hint">Only one bar in each group — nothing to check consecutively.</div>`}
      </div>

      ${projectSummarySection()}
    `;
  }

  function statCard(label, value, sub) {
    return `<div class="stat-card"><div class="stat-label">${label}</div><div class="stat-value">${value}</div><div class="stat-sub">${sub}</div></div>`;
  }

  function projectSummarySection() {
    const columns = state.columns;
    if (!columns.length) return '';
    const totals = Calc.projectTotals(columns, state.project);
    return `
      <div class="calc-section calc-project-summary">
        <h4>Project Summary <span class="text-muted" style="font-weight:400; text-transform:none; letter-spacing:0;">— all ${totals.totalColumnTypes} column type(s), ${totals.totalColumnInstances} total in building</span></h4>
        <div class="calc-grid">
          ${statCard('Total Concrete', `${fmt(totals.totalConcreteM3, 2)} m³`, '')}
          ${statCard('Total Steel', `${fmt(totals.totalSteelKg, 0)} kg`, `${fmt(totals.totalSteelKg / 1000, 2)} tonnes`)}
          ${statCard('Longitudinal / Ties', `${fmt(totals.totalLongSteelKg, 0)} kg`, `${fmt(totals.totalTieSteelKg, 0)} kg ties`)}
          ${statCard('Avg. Steel %', `${fmt(totals.averageSteelPercent, 2)}%`, 'across column types')}
          ${statCard('Est. Steel Cost', money(totals.estimatedSteelCost), `@ ${state.project.currency}${state.project.steelRatePerKg}/kg`)}
          ${statCard('Est. Total Cost', money(totals.estimatedTotalCost), `+ ${money(totals.estimatedConcreteCost)} concrete`)}
        </div>
      </div>`;
  }

  function money(n) {
    return `${state.project.currency}${Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function init() {
    bus.on('state:selected', render);
    bus.on('state:changed', render);
    bus.on('state:loaded', render);
    render();
  }

  global.App = global.App || {};
  global.App.CalcPanel = { init, render };
})(window);
