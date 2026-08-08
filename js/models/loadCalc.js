/**
 * LoadCalc — Column Load / Elastic Stress Analysis
 * -----------------------------------------------------------------------
 * Pure functions, no DOM. Reads section geometry through the SAME shared
 * Geometry module the rest of the app uses (App.Geometry.buildOutline) so
 * this stays consistent with the drawing and every other calc — an L/T
 * shape's real outline, not a bounding-box stand-in, drives the numbers.
 *
 * Method: classic working-stress "uncracked elastic section" screening
 * check — the same method commonly used for a quick short/long column and
 * biaxial-stress sanity check before a full limit-state (IS 456 Annex E /
 * SP:16 charts) design:
 *
 *   Effective length   Lex = Ley = k · L               (L = floor-to-floor height)
 *   Slenderness        λx = Lex / D , λy = Ley / B      (D, B = section bounding depth/width)
 *   Short column if λmax ≤ 12 (IS 456 Cl. 25.1.2), else flagged as slender/long.
 *   Direct stress       σd  = P / A
 *   Bending stresses     σbx = Mx / Zx , σby = My / Zy
 *   Corner stresses      σ  = σd ± σbx ± σby  (4 combinations)
 *   Permissible (simplified WSM screening only)  σcc ≈ 0.4·fck
 *
 * Zx / Zy come from the EXACT section (shoelace-derived second moment of
 * area of the true outline for polygons; closed-form for circles) — not a
 * bounding-box approximation — so L/T/polygon columns get a real answer.
 *
 * This is explicitly a simplified gross-section screening check (same
 * honesty pattern as calc.js's CODE_RULES table): it does NOT include the
 * reinforcement's contribution (no transformed section / modular ratio),
 * does NOT apply IS 456's slender-column moment magnification, and is not
 * a substitute for full limit-state design. Every result carries that
 * disclosure so the UI can show it rather than imply more precision than
 * the method has.
 */
(function (global) {
  'use strict';

  const Geometry = global.App.Geometry;

  // ---------------------------------------------------------------- support

  const K_FACTORS = {
    'pinned-pinned': { k: 1.00, label: 'Pinned – Pinned' },
    'fixed-fixed': { k: 0.65, label: 'Fixed – Fixed' },
    'fixed-pinned': { k: 0.80, label: 'Fixed – Pinned' },
    'fixed-free-sway': { k: 1.20, label: 'Fixed – Free (sway)' },
    'fixed-free': { k: 2.00, label: 'Fixed – Free (cantilever)' },
  };
  const DEFAULT_SUPPORT = 'fixed-pinned';

  function kFactorFor(support) {
    return (K_FACTORS[support] || K_FACTORS[DEFAULT_SUPPORT]).k;
  }
  function supportLabel(support) {
    return (K_FACTORS[support] || K_FACTORS[DEFAULT_SUPPORT]).label;
  }

  function gradeNumber(concreteGrade) {
    return Number(String(concreteGrade).replace(/[^0-9]/g, '')) || 25;
  }

  // ------------------------------------------------------------ section props

  /** Exact second moment of area (about centroidal axes) of a simple
   *  polygon via the shoelace-derived closed-form sums, plus the extreme
   *  fibre distances needed for section modulus. Works for any simple
   *  polygon (convex or concave — L/T shapes included), independent of
   *  winding order. */
  function polygonSectionProps(vertices) {
    const n = vertices.length;
    let A2 = 0, Cx = 0, Cy = 0, Ixx0 = 0, Iyy0 = 0;
    for (let i = 0; i < n; i++) {
      const p0 = vertices[i], p1 = vertices[(i + 1) % n];
      const cross = p0.x * p1.y - p1.x * p0.y;
      A2 += cross;
      Cx += (p0.x + p1.x) * cross;
      Cy += (p0.y + p1.y) * cross;
      Ixx0 += (p0.y * p0.y + p0.y * p1.y + p1.y * p1.y) * cross;
      Iyy0 += (p0.x * p0.x + p0.x * p1.x + p1.x * p1.x) * cross;
    }
    const A = A2 / 2;
    const cx = Cx / (6 * A);
    const cy = Cy / (6 * A);
    const Ixx = Math.abs(Ixx0 / 12 - A * cy * cy);
    const Iyy = Math.abs(Iyy0 / 12 - A * cx * cx);
    let cyMax = 0, cxMax = 0;
    vertices.forEach((v) => {
      cyMax = Math.max(cyMax, Math.abs(v.y - cy));
      cxMax = Math.max(cxMax, Math.abs(v.x - cx));
    });
    return {
      area: Math.abs(A),
      centroid: { x: cx, y: cy },
      Ixx, Iyy,
      Zx: cyMax ? Ixx / cyMax : 0,
      Zy: cxMax ? Iyy / cxMax : 0,
      cxMax, cyMax,
    };
  }

  /** Section properties for a column, in the SAME local mm coordinates
   *  Geometry.buildOutline() draws in. `depthMm`/`widthMm` (bounding-box
   *  extents) feed slenderness; `Zx`/`Zy` feed bending stress and come
   *  from the exact outline (true circle formula for circular columns). */
  function sectionProperties(column) {
    const outline = Geometry.buildOutline(column);
    if (outline.isCircle) {
      const r = outline.circle.r;
      const area = Math.PI * r * r;
      const I = (Math.PI * Math.pow(r, 4)) / 4;
      const Z = (Math.PI * Math.pow(r, 3)) / 4;
      return {
        area, Ixx: I, Iyy: I, Zx: Z, Zy: Z,
        depthMm: r * 2, widthMm: r * 2,
        centroid: { x: r, y: r },
        outline, isCircle: true,
      };
    }
    const xs = outline.vertices.map((v) => v.x), ys = outline.vertices.map((v) => v.y);
    const depthMm = Math.max(...ys) - Math.min(...ys); // y-extent — resists Mx
    const widthMm = Math.max(...xs) - Math.min(...xs); // x-extent — resists My
    const props = polygonSectionProps(outline.vertices);
    return {
      area: props.area, Ixx: props.Ixx, Iyy: props.Iyy, Zx: props.Zx, Zy: props.Zy,
      depthMm, widthMm, centroid: props.centroid,
      outline, isCircle: false,
    };
  }

  // ------------------------------------------------------------------ analyze

  /** Full load analysis for one column type (per-instance loads — these
   *  are NOT multiplied by column.quantity; a load is something that
   *  building on THIS column, not "this column repeated N times"). */
  function analyze(column) {
    const sec = sectionProperties(column);
    const loads = column.loads || {};
    const floorLoadKN = Number(loads.floorLoadKN) || 0;
    const nFloors = Math.max(1, Math.round(Number(loads.numFloorsAbove)) || 1);
    const MxKNm = Number(loads.momentXkNm) || 0;
    const MyKNm = Number(loads.momentYkNm) || 0;
    const support = loads.supportCondition || DEFAULT_SUPPORT;
    const k = kFactorFor(support);

    const Ptotal_kN = floorLoadKN * nFloors;
    const P_N = Ptotal_kN * 1000;

    const L_mm = column.geometry.floorHeight || column.geometry.height || 3000;
    const Lex = k * L_mm;
    const Ley = k * L_mm;
    const lambdaX = sec.depthMm ? Lex / sec.depthMm : 0;
    const lambdaY = sec.widthMm ? Ley / sec.widthMm : 0;
    const lambdaMax = Math.max(lambdaX, lambdaY);
    const isSlender = lambdaMax > 12; // IS 456 Cl. 25.1.2 short/slender threshold

    const sigmaD = sec.area ? P_N / sec.area : 0;               // MPa (N/mm²)
    const sigmaBx = sec.Zx ? (MxKNm * 1e6) / sec.Zx : 0;         // MPa
    const sigmaBy = sec.Zy ? (MyKNm * 1e6) / sec.Zy : 0;         // MPa

    const corners = [
      sigmaD + sigmaBx + sigmaBy,
      sigmaD + sigmaBx - sigmaBy,
      sigmaD - sigmaBx + sigmaBy,
      sigmaD - sigmaBx - sigmaBy,
    ];
    const sigmaMax = Math.max(...corners);
    const sigmaMin = Math.min(...corners);

    const fck = gradeNumber(column.concreteGrade);
    const permissible = 0.4 * fck; // simplified WSM screening limit, not a code table lookup

    const checks = [];
    if (sigmaMax > permissible) {
      checks.push({ level: 'danger', message: `Max compressive stress (${sigmaMax.toFixed(2)} MPa) exceeds the permissible working-stress screening limit (0.4·fck = ${permissible.toFixed(2)} MPa).` });
    } else {
      checks.push({ level: 'ok', message: `Max compressive stress (${sigmaMax.toFixed(2)} MPa) is within the ${permissible.toFixed(2)} MPa screening limit.` });
    }
    if (sigmaMin < 0) {
      checks.push({ level: 'warning', message: `Net tension (${Math.abs(sigmaMin).toFixed(2)} MPa) develops on the far face under this uncracked elastic check — the gross-section assumption no longer strictly holds there; verify with a cracked-section / limit-state check.` });
    } else {
      checks.push({ level: 'ok', message: 'No net tension develops across the section under this elastic check.' });
    }
    if (isSlender) {
      checks.push({ level: 'warning', message: `Slenderness ratio (${lambdaMax.toFixed(1)}) exceeds 12 — this column falls in the slender/long category and needs an additional-moment (moment-magnification) check, which this screening tool does not perform.` });
    } else {
      checks.push({ level: 'ok', message: `Slenderness ratio (${lambdaMax.toFixed(1)}) ≤ 12 — may be treated as a short column.` });
    }

    const status = checks.some((c) => c.level === 'danger') ? 'danger'
      : checks.some((c) => c.level === 'warning') ? 'warning' : 'ok';

    return {
      section: sec, support, supportLabel: supportLabel(support), k,
      L_mm, Lex, Ley, lambdaX, lambdaY, lambdaMax, isSlender,
      floorLoadKN, nFloors, Ptotal_kN, P_N, MxKNm, MyKNm,
      sigmaD, sigmaBx, sigmaBy, corners, sigmaMax, sigmaMin,
      fck, permissible, checks, status,
      note: 'Uncracked elastic (working-stress) gross-section screening check — σ = P/A ± Mx/Zx ± My/Zy, permissible ≈ 0.4·fck. Section modulus is computed from the column\u2019s actual drawn outline. This is a simplified, commonly-taught screening method: it excludes the reinforcement\u2019s contribution (no transformed section) and slender-column moment magnification — not a substitute for full IS 456 limit-state column design.',
    };
  }

  global.App = global.App || {};
  global.App.LoadCalc = {
    K_FACTORS, DEFAULT_SUPPORT, kFactorFor, supportLabel,
    polygonSectionProps, sectionProperties, analyze,
  };
})(window);
