/**
 * DevLap — Phase 7: Development Length, Lap Length & Anchorage
 * -----------------------------------------------------------------------
 * Pure functions, no DOM. The core method (bond-stress based development
 * length) is IS 456's Cl. 26.2.1 formula — this is the method the app's
 * whole data model (Fe415/500/500D/550, M20–M50, IS-style bar marks) is
 * built around. For non-IS codes this same formula is still used as a
 * generic approximation (same honesty pattern as calc.js's CODE_RULES
 * table) — callers should show the disclosure this module returns
 * alongside the number, not present it as code-authoritative for ACI
 * 318 / Eurocode 2 / BS 8110.
 *
 * Ld = φ·σs / (4·τbd)
 *   σs  = 0.87·fy                      (design stress at yield, LSM)
 *   τbd = base bond stress × 1.6       (deformed-bar increase, IS 456 26.2.1.1)
 *         × 1.25 more, for compression (same clause's compression increase)
 *
 * Lap length = max(Ld, 30φ) in tension, max(Ld, 24φ) in compression —
 * the commonly-taught floor values (SP:34 handbook) on top of Ld.
 */
(function (global) {
  'use strict';

  // Base bond stress (N/mm², plain bars in tension) — IS 456 Table, Cl 26.2.1.1.
  // M45/M50 are extrapolated beyond IS 456's published table (stops at M40).
  const TAU_BD_BASE = { 20: 1.2, 25: 1.4, 30: 1.5, 35: 1.7, 40: 1.9, 45: 2.0, 50: 2.1 };

  const FY_BY_GRADE = { Fe415: 415, Fe500: 500, Fe500D: 500, Fe550: 550 };

  function gradeNumber(concreteGrade) {
    return Number(String(concreteGrade).replace(/[^0-9]/g, '')) || 25;
  }

  function tauBdBase(concreteGrade) {
    const g = gradeNumber(concreteGrade);
    return TAU_BD_BASE[g] || TAU_BD_BASE[25];
  }

  function isIndianCode(designCode) {
    return typeof designCode === 'string' && designCode.trim().startsWith('IS ');
  }

  /**
   * Development length in mm. `mode` is 'tension' or 'compression'.
   * Deformed bars assumed throughout (IS 1786 — this app doesn't model
   * plain round bars, which are rare in modern column detailing).
   */
  function developmentLength(diaMm, steelGrade, concreteGrade, mode) {
    const fy = FY_BY_GRADE[steelGrade] || 500;
    const tauBase = tauBdBase(concreteGrade);
    const tauEffective = mode === 'compression' ? tauBase * 1.6 * 1.25 : tauBase * 1.6;
    const sigmaS = 0.87 * fy;
    return (diaMm * sigmaS) / (4 * tauEffective);
  }

  /** Lap length in mm: development length, floored at 30φ (tension) or
   *  24φ (compression) per commonly-taught practice on top of Cl 26.2.1. */
  function lapLength(diaMm, steelGrade, concreteGrade, mode) {
    const ld = developmentLength(diaMm, steelGrade, concreteGrade, mode);
    const floor = (mode === 'compression' ? 24 : 30) * diaMm;
    return Math.max(ld, floor);
  }

  /** Extra length a hook adds beyond the bend point — commonly used BBS
   *  practice values (bend arc + minimum straight extension), not a
   *  precise IS 2502 bend-radius derivation. */
  function hookLength(diaMm, angleDeg) {
    return (angleDeg === 135 ? 10 : 8) * diaMm;
  }

  /** Shortening at a single bend due to the neutral-axis shift —
   *  standard BBS deduction-per-bend table. */
  function bendDeduction(diaMm, angleDeg) {
    const table = { 45: 1, 90: 2, 135: 3 };
    return (table[angleDeg] || 2) * diaMm;
  }

  /**
   * IS 13920 seismic detailing: the "special confining region" length Lo
   * near a beam-column joint, within which lap splices of longitudinal
   * bars are NOT permitted. Lo = larger of (clear height / 6, 450mm,
   * twice the larger column cross-section dimension) — Cl 7.4.1 (approx,
   * commonly cited form). Returns null for non-seismic codes, since the
   * restriction doesn't apply.
   */
  function noLapZoneLength(column) {
    if (!isIndianCode(column.designCode) || !column.designCode.includes('13920')) return null;
    const Geometry = global.App.Geometry;
    const outline = Geometry.buildOutline(column);
    const xs = outline.vertices.map((v) => v.x), ys = outline.vertices.map((v) => v.y);
    const largerDim = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
    const clearHeight = column.geometry.height || 0;
    return Math.max(clearHeight / 6, 450, 2 * largerDim);
  }

  function disclosureFor(designCode) {
    return isIndianCode(designCode)
      ? 'IS 456 Cl. 26.2.1 bond-stress method.'
      : `Estimated using the IS 456 bond-stress method as a generic approximation — ${designCode} has its own development-length provisions; verify against that code for final detailing.`;
  }

  global.App = global.App || {};
  global.App.DevLap = {
    TAU_BD_BASE, FY_BY_GRADE, gradeNumber, tauBdBase, isIndianCode,
    developmentLength, lapLength, hookLength, bendDeduction, noLapZoneLength, disclosureFor,
  };
})(window);
