/**
 * Calculations Tab UI — Multi-Shape & IS 456 Compliant Report
 */
(function (global) {
  'use strict';

  const state = global.App.state;
  const bus = global.App.bus;
  const Analysis = global.App.Analysis;

  function render() {
    const col = state.getSelected();
    const container = document.getElementById('calc-steps-container');
    if (!container) return;

    if (!col) {
      container.innerHTML = '<div class="panel-empty">Select a column to view calculations.</div>';
      return;
    }

    const r = Analysis.calculateColumn(col);
    const l = col.loads || {};
    const m = col; 

    // Dynamic Shape Formulas for Report
    let areaFormula = '';
    let zFormula = '';

    if (r.type === 'circle' || r.type === 'circular') {
      areaFormula = `A = &pi; × D² / 4 = &pi; × ${r.b}² / 4 = ${Math.round(r.A).toLocaleString()} mm²`;
      zFormula = `Zx = Zy = &pi; × D³ / 32 = ${r.Zx.toExponential(3)} mm³`;
    } else if (r.type === 'square') {
      areaFormula = `A = Side² = ${r.b}² = ${Math.round(r.A).toLocaleString()} mm²`;
      zFormula = `Zx = Zy = (Side³) / 6 = ${r.Zx.toExponential(3)} mm³`;
    } else if (r.type === 't-shape' || r.type === 'tshape') {
      areaFormula = `A = (Bf × Tf) + (Bw × Dw) = ${Math.round(r.A).toLocaleString()} mm²`;
      zFormula = `Zx &approx; Flange & Web Elastic Core Modulus = ${r.Zx.toExponential(3)} mm³`;
    } else if (r.type === 'l-shape' || r.type === 'lshape') {
      areaFormula = `A = Composite L-Section Area = ${Math.round(r.A).toLocaleString()} mm²`;
      zFormula = `Zx = Section Modulus about X-axis = ${r.Zx.toExponential(3)} mm³`;
    } else {
      areaFormula = `A = b × d = ${r.b} × ${r.d} = ${Math.round(r.A).toLocaleString()} mm²`;
      zFormula = `Zx = (b × d²) / 6 = ${r.Zx.toExponential(3)} mm³<br>Zy = (d × b²) / 6 = ${r.Zy.toExponential(3)} mm³`;
    }

    let html = `
      <h2 style="margin-top:0; border-bottom: 2px solid var(--border-strong); padding-bottom: 10px;">Engineering Calculations Report (IS 456:2000)</h2>
      <p style="color:var(--text-secondary); margin-bottom: 24px;">Multi-shape structural analysis with uncracked elastic section check & IS code provisions.</p>
      
      <h4 style="color:var(--accent); margin-top:20px;">Step 1: Geometry & Section Properties</h4>
      <div style="background:var(--bg-panel-alt); padding:12px; border-left:3px solid var(--accent); font-family:var(--font-mono); font-size:13px; margin-bottom:16px;">
        Section Type: <strong>${r.shapeDesc}</strong><br>
        Material: M${m.concreteGrade} Concrete, Fe${m.steelGrade} Steel<br>
        ${areaFormula}
      </div>

      <h4 style="color:var(--accent); margin-top:20px;">Step 2: Load Accumulation & Self-Weight</h4>
      <div style="background:var(--bg-panel-alt); padding:12px; border-left:3px solid var(--accent); font-family:var(--font-mono); font-size:13px; margin-bottom:16px;">
        Concrete Self-Weight = Volume × 25 kN/m³ = ${r.selfWeightPerFloor.toFixed(2)} kN / floor<br>
        P_total = (P_floor + Self-Weight) × storeys = (${l.axialFloor} + ${r.selfWeightPerFloor.toFixed(2)}) × ${l.storeys} = ${r.P_tot.toFixed(2)} kN<br>
        Factored Axial Load P = ${r.P_tot.toFixed(2)} × 10³ = ${(r.P_N).toLocaleString()} N
      </div>

      <h4 style="color:var(--accent); margin-top:20px;">Step 3: Slenderness & Minimum Eccentricity (IS 456 Cl. 25.1.2 & 25.4)</h4>
      <div style="background:var(--bg-panel-alt); padding:12px; border-left:3px solid var(--accent); font-family:var(--font-mono); font-size:13px; margin-bottom:16px;">
        Unsupported Length (Lu) = ${r.Lu} mm | Effective Length Lex = ${r.Lex} mm<br>
        Slenderness Ratio (&lambda;<sub>max</sub>) = ${r.lambda_max.toFixed(2)} &rarr; <strong>${r.isLong ? 'Long/Slender Column (>12)' : 'Short Column (&le;12)'}</strong><br>
        Min Eccentricity (Cl. 25.4) e<sub>min,x</sub> = max(20, Lu/500 + D/30) = ${r.emin_x.toFixed(1)} mm<br>
        Min Eccentricity (Cl. 25.4) e<sub>min,y</sub> = max(20, Lu/500 + B/30) = ${r.emin_y.toFixed(1)} mm
      </div>

      <h4 style="color:var(--accent); margin-top:20px;">Step 4: Elastic Stress Analysis</h4>
      <div style="background:var(--bg-panel-alt); padding:12px; border-left:3px solid var(--accent); font-family:var(--font-mono); font-size:13px; margin-bottom:16px;">
        ${zFormula}<br><br>
        &sigma;<sub>axial</sub> = P / A = ${r.sigma_d.toFixed(2)} MPa<br>
        &sigma;<sub>bx</sub> = (M<sub>x</sub> × 10⁶) / Zx = ${r.sigma_bx.toFixed(2)} MPa<br>
        &sigma;<sub>by</sub> = (M<sub>y</sub> × 10⁶) / Zy = ${r.sigma_by.toFixed(2)} MPa<br><br>
        <strong>&sigma;<sub>max</sub> (Compression) = ${r.sigma_max.toFixed(2)} MPa</strong><br>
        <strong>&sigma;<sub>min</sub> = ${r.sigma_min.toFixed(2)} MPa</strong>
      </div>
    `;

    if (r.isSafe) {
      html += `<div style="background:rgba(16, 185, 129, 0.1); border:1px solid var(--accent); color:var(--accent); padding:16px; border-radius:4px; margin-top:20px;">
        <strong>✓ Design Check Passed:</strong><br>
        Max stress (${r.sigma_max.toFixed(2)} MPa) is within allowable limit (${r.permissible_comp.toFixed(2)} MPa).
      </div>`;
    } else {
      html += `<div style="background:rgba(239, 68, 68, 0.1); border:1px solid var(--danger); color:var(--danger); padding:16px; border-radius:4px; margin-top:20px;">
        <strong>✕ Design Check Failed:</strong><br>
        <ul style="margin:8px 0 0 16px; padding:0;">
          ${r.failReasons.map(reason => `<li>${reason}</li>`).join('')}
        </ul>
      </div>`;
    }

    container.innerHTML = html;
  }

  function init() {
    bus.on('state:selected', render);
    bus.on('state:changed', render);
    bus.on('state:loaded', render);
  }

  global.App = global.App || {};
  global.App.Calculations = { init, render };
})(window);