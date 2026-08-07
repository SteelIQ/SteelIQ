/**
 * Core Analysis Engine — Multi-Shape IS 456:2000 Compliant
 */
(function (global) {
  'use strict';

  function calculateColumn(col) {
    const type = (col.type || 'rectangle').toLowerCase();
    let b = 0, d = 0, A = 0, Zx = 0, Zy = 0;
    let shapeDesc = '';

    const geom = col.geometry || {};

    // 1. Shape-Specific Geometric Properties (IS 456 Basis)
    if (type === 'circle' || type === 'circular') {
      const dia = geom.diameter || 300;
      b = dia; d = dia;
      A = (Math.PI * Math.pow(dia, 2)) / 4;
      Zx = (Math.PI * Math.pow(dia, 3)) / 32;
      Zy = Zx;
      shapeDesc = `Circular (Diameter D = ${dia} mm)`;

    } else if (type === 'square') {
      const side = geom.side || geom.width || 300;
      b = side; d = side;
      A = side * side;
      Zx = (side * Math.pow(side, 2)) / 6;
      Zy = Zx;
      shapeDesc = `Square (Side = ${side} mm)`;

    } else if (type === 't-shape' || type === 'tshape') {
      // T-Shape properties (Flange width bf, web width bw, total depth d, flange thickness tf)
      const bf = geom.flangeWidth || geom.width || 400;
      const dTotal = geom.depth || geom.length || 500;
      const bw = geom.webWidth || 200;
      const tf = geom.flangeThickness || 100;
      b = bf; d = dTotal;

      const dw = dTotal - tf;
      A = (bf * tf) + (bw * dw);
      // Approximate elastic section modulus for T-section
      Zx = (bf * Math.pow(tf, 2) / 2) + (bw * Math.pow(dw, 2) / 2); // Simplified elastic core
      Zy = Zx * 0.8;
      shapeDesc = `T-Shape (Bf=${bf}, d=${dTotal}, Bw=${bw}, Tf=${tf} mm)`;

    } else if (type === 'l-shape' || type === 'lshape') {
      // L-Shape properties
      const b1 = geom.width || 400;
      const d1 = geom.depth || 400;
      const t1 = geom.thickness || 100;
      b = b1; d = d1;
      A = (b1 * t1) + ((d1 - t1) * t1);
      Zx = (b1 * Math.pow(t1, 2) / 2) + (t1 * Math.pow(d1 - t1, 2) / 3);
      Zy = Zx;
      shapeDesc = `L-Shape (Width=${b1}, Depth=${d1}, Thickness=${t1} mm)`;

    } else {
      // Rectangle, Polygon, Custom (fallback to bounding box dimensions)
      b = geom.width || geom.b || 300;
      d = geom.length || geom.d || 400;
      A = b * d;
      Zx = (b * Math.pow(d, 2)) / 6;
      Zy = (d * Math.pow(b, 2)) / 6;
      shapeDesc = type === 'polygon' ? `Polygon (Bounding Box ${b}×${d} mm)` : 
                  type === 'custom' ? `Custom Section (Bounding Box ${b}×${d} mm)` : 
                  `Rectangular (b = ${b}, d = ${d} mm)`;
    }

    // 2. Extract Heights & Loads
    const rawHeight = parseFloat(geom.height) || parseFloat(geom.clearHeight) || 3000;
    const clearHeightMm = rawHeight > 0 ? rawHeight : 3000;
    
    const loads = col.loads || {};
    const n = loads.storeys || 1;
    const pFloor = loads.axialFloor || 0;
    const mx = loads.mx || 0;
    const my = loads.my || 0;
    const k = loads.kFactor || 1.0;

    const fckString = String(col.concreteGrade || '25');
    const fck = parseInt(fckString.replace(/\D/g, ''), 10) || 25;

    // 3. Compute Self-Weight & Total Load
    const volumeM3 = (A / 1000000) * (clearHeightMm / 1000);
    const selfWeightPerFloor = volumeM3 * 25; // 25 kN/m³ for RCC
    const P_tot = (pFloor + selfWeightPerFloor) * n; // kN
    const P_N = P_tot * 1000; // N

    // 4. Slenderness Check (IS 456 Cl. 25.1.2)
    const Lu = clearHeightMm;
    const Lex = k * Lu;
    const Ley = k * Lu;
    const lambda_x = Lex / d;
    const lambda_y = Ley / b;
    const lambda_max = Math.max(lambda_x, lambda_y);
    const isLong = lambda_max > 12;

    // 5. Minimum Eccentricity Check (IS 456 Cl. 25.4)
    // e_min = Lu / 500 + D / 30, subject to a minimum of 20mm
    const emin_x = Math.max(20, (Lu / 500) + (d / 30));
    const emin_y = Math.max(20, (Lu / 500) + (b / 30));

    // 6. Elastic Stresses (Uncracked Section Analysis)
    const sigma_d = P_N / A;
    const sigma_bx = Zx > 0 ? (mx * 1e6) / Zx : 0;
    const sigma_by = Zy > 0 ? (my * 1e6) / Zy : 0;

    const sig1 = sigma_d + sigma_bx + sigma_by;
    const sig2 = sigma_d + sigma_bx - sigma_by;
    const sig3 = sigma_d - sigma_bx + sigma_by;
    const sig4 = sigma_d - sigma_bx - sigma_by;

    const sigma_max = Math.max(sig1, sig2, sig3, sig4);
    const sigma_min = Math.min(sig1, sig2, sig3, sig4);
    const permissible_comp = 0.4 * fck;

    let isSafe = true;
    let failReasons = [];

    if (sigma_max > permissible_comp) {
      isSafe = false;
      failReasons.push(`Max compressive stress (${sigma_max.toFixed(2)} MPa) exceeds permissible limit (${permissible_comp.toFixed(2)} MPa).`);
    }
    if (sigma_min < 0) {
      isSafe = false;
      failReasons.push('Tension developed in section. Uncracked elastic analysis invalid.');
    }

    return {
      type, shapeDesc, b, d, A, P_tot, P_N, Lu, Lex, Ley, 
      lambda_x, lambda_y, lambda_max, isLong, emin_x, emin_y,
      selfWeightPerFloor, pFloor, mx, my,
      Zx, Zy, sigma_d, sigma_bx, sigma_by,
      sigma_max, sigma_min, permissible_comp, isSafe, failReasons
    };
  }

  global.App = global.App || {};
  global.App.Analysis = { calculateColumn };
})(window);
