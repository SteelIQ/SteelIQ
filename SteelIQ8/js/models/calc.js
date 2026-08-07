/**
 * Calc — Phase 6: Structural Calculation Engine
 * -----------------------------------------------------------------------
 * Pure functions, no DOM. Reads the exact same bar positions the drawing
 * uses (via Geometry.resolveBars, which already merges Phase 5's manual
 * overrides) so a hand-dragged bar changes the numbers here too.
 *
 * Development length, lap length, hook length, and bend deduction now
 * come from models/devlap.js (Phase 7) — steel weights below use real
 * cutting lengths, not a clear-height placeholder.
 *
 * Code-standard rules below (minimum/maximum longitudinal steel % and
 * minimum clear spacing) are simplified, commonly-cited defaults per
 * code family — not a substitute for a full code check, and Eurocode's
 * real minimum depends on axial load, which this tool doesn't take as
 * input yet. Every place that matters says so in its output message.
 */
(function (global) {
  'use strict';

  const Geometry = global.App.Geometry;
  const DevLap = global.App.DevLap;

  // ---------------------------------------------------------------- rules

  const CODE_RULES = {
    'IS 456 : 2000': { minSteelPercent: 0.8, maxSteelPercent: 4, maxSteelPercentAtLap: 6, source: 'IS 456:2000 Cl. 26.5.3.1' },
    'IS 13920 : 2016': { minSteelPercent: 0.8, maxSteelPercent: 4, maxSteelPercentAtLap: 6, source: 'IS 13920:2016 (seismic detailing, same longitudinal limits as IS 456)' },
    'ACI 318': { minSteelPercent: 1.0, maxSteelPercent: 8, maxSteelPercentAtLap: 8, source: 'ACI 318 Cl. 10.6.1 (approx.)' },
    'Eurocode 2': { minSteelPercent: 0.2, maxSteelPercent: 4, maxSteelPercentAtLap: 8, source: 'EC2 Cl. 9.5.2 — indicative only; real minimum depends on axial load (0.10·NEd/fyd), not modeled here' },
    'BS 8110': { minSteelPercent: 0.4, maxSteelPercent: 6, maxSteelPercentAtLap: 10, source: 'BS 8110-1 Table 3.25 (approx.)' },
  };
  const DEFAULT_RULES = CODE_RULES['IS 456 : 2000'];

  function rulesFor(designCode) {
    return CODE_RULES[designCode] || DEFAULT_RULES;
  }

  // ------------------------------------------------------------- unit math

  /** Standard steel unit-weight formula: w = d²/162 kg per running metre
   *  (d in mm) — the figure universally used in Indian BBS practice,
   *  derived from 7850 kg/m³ density and a circular bar cross-section. */
  function unitWeightKgPerM(diaMm) {
    return (diaMm * diaMm) / 162;
  }

  function barAreaMm2(diaMm) {
    return (Math.PI / 4) * diaMm * diaMm;
  }

  // ------------------------------------------------------------ section calcs

  function grossAreaMm2(column) {
    return Geometry.grossAreaMm2(column);
  }

  function steelAreaMm2(column) {
    return column.bars.reduce((sum, g) => sum + barAreaMm2(g.diameter) * g.count, 0);
  }

  function steelPercent(column) {
    const gross = grossAreaMm2(column);
    return gross > 0 ? (steelAreaMm2(column) / gross) * 100 : 0;
  }

  // -------------------------------------------------------------- spacing

  /** Minimum clear spacing between longitudinal bars — simplified rule:
   *  the larger of the bigger bar's diameter or 25mm (commonly cited
   *  floor across IS 456 / ACI 318 for column longitudinal steel). */
  function minClearSpacingMm(diaA, diaB) {
    return Math.max(diaA, diaB, 25);
  }

  /** Per-group clear-spacing check using the bars actually drawn
   *  (Geometry.resolveBars — includes Phase 5 manual overrides). */
  function spacingChecks(column) {
    const { bars } = Geometry.resolveBars(column);
    const byGroup = {};
    bars.forEach((b) => { (byGroup[b.groupId] = byGroup[b.groupId] || []).push(b); });

    const rows = [];
    column.bars.forEach((group) => {
      const groupBars = (byGroup[group.id] || []).slice().sort((a, b) => a.indexInGroup - b.indexInGroup);
      for (let i = 0; i < groupBars.length - 1; i++) {
        const a = groupBars[i], b = groupBars[i + 1];
        if (a.spacingToNext == null) continue;
        const clear = Math.round(a.spacingToNext - (a.diameter + b.diameter) / 2);
        const required = minClearSpacingMm(a.diameter, b.diameter);
        rows.push({
          markNumber: group.__markNumber || null,
          groupId: group.id,
          diameter: group.diameter,
          barIndexA: i, barIndexB: i + 1,
          centerToCenter: a.spacingToNext,
          clearSpacing: clear,
          required,
          ok: clear >= required,
        });
      }
    });
    return rows;
  }

  // ----------------------------------------------------------- volumes/weights

  /** Longitudinal steel weight for ONE instance of the column. Cutting
   *  length = floor-to-floor height + one tension lap length (Phase 7),
   *  since a column bar is normally cut long enough to lap into the
   *  next lift above — this supersedes Phase 6's clear-height-only
   *  placeholder now that lap length is actually computed. */
  function longitudinalSteelWeight(column) {
  const floorHeightM = (column.geometry.floorHeight || column.geometry.height || 0) / 1000;
  const splices = column.splices || {};

  const rows = column.bars.map((g) => {
    let extraMm = 0;

    if (splices.isCrankEnabled) {
      extraMm += 0.43 * g.diameter; // 1:6 crank bend allowance
    }
    if (splices.isFootingDowel) {
      extraMm += (splices.dowelEmbedmentMm || 600) + (12 * g.diameter); // Embedment + 12d L-bend
    }

    const lapMm = DevLap.lapLength(g.diameter, column.steelGrade, column.concreteGrade, 'tension');
    const lengthM = floorHeightM + (lapMm + extraMm) / 1000;
    const unitWt = unitWeightKgPerM(g.diameter);
    const weightPerBar = unitWt * lengthM;
    const totalWeight = weightPerBar * g.count;

    return {
      groupId: g.id,
      diameter: g.diameter,
      count: g.count,
      placement: g.placement,
      unitWeightKgPerM: unitWt,
      floorHeightM,
      lapLengthMm: Math.round(lapMm),
      extraMm: Math.round(extraMm),
      lengthM,
      weightPerBarKg: weightPerBar,
      totalKg: totalWeight,
    };
  });

  const totalKg = rows.reduce((s, r) => s + r.totalKg, 0);

  // Dynamic note describing active cutting length parameters
  let detailNote = 'floor-to-floor height + tension lap length';
  if (splices.isFootingDowel) {
    detailNote = 'floor height + footing embedment + 12d L-bend';
  } else if (splices.isCrankEnabled) {
    detailNote += ' + 1:6 crank offset';
  }

  return {
    rows,
    totalKg,
    note: `Cutting length = ${detailNote}. ${DevLap.disclosureFor(column.designCode)}`,
  };
}

  /** Tie/stirrup count and weight, now with real cutting length: ring
   *  perimeter, minus bend deduction at 4 corners (rectilinear shapes;
   *  circular ties skip this — there is no corner to deduct), plus two
   *  hook lengths at the closing ends (135° if the design code is IS
   *  13920 seismic, 90° otherwise). */
  function tieWeight(column) {
    const cover = column.geometry.clearCover || 40;
    const tie = column.ties || {};
    const tieDia = tie.diameter || 8;
    const heightMm = column.geometry.height || 0;
    const endZone = tie.endZoneLength || 750;
    const spacingEnd = Math.max(25, tie.spacingEnd || 100);
    const spacingMiddle = Math.max(25, tie.spacingMiddle || 150);
    const hookAngle = DevLap.isIndianCode(column.designCode) && column.designCode.includes('13920') ? 135 : (tie.hook || 90);

    const middleZone = Math.max(0, heightMm - 2 * endZone);
    const endTies = Math.ceil((Math.min(endZone, heightMm / 2) / spacingEnd)) * 2;
    const middleTies = Math.ceil(middleZone / spacingMiddle);
    const tieCount = Math.max(1, endTies + middleTies + 1); // +1 for the closing tie

    const outline = Geometry.buildOutline(column);
    const depth = cover + tieDia / 2;
    let ringLengthMm, cuttingLengthMm;
    const hookLen = DevLap.hookLength(tieDia, hookAngle);
    if (outline.isCircle) {
      ringLengthMm = 2 * Math.PI * Math.max(0, outline.circle.r - depth);
      cuttingLengthMm = ringLengthMm + 2 * hookLen; // circular hoop: no corner bends to deduct
    } else {
      ringLengthMm = Geometry.perimeter(Geometry.offsetPolygon(outline.vertices, depth));
      const corners = outline.vertices.length;
      cuttingLengthMm = ringLengthMm - corners * DevLap.bendDeduction(tieDia, 90) + 2 * hookLen;
    }
    const unitWt = unitWeightKgPerM(tieDia);
    const weightPerTieKg = unitWt * (cuttingLengthMm / 1000);
    const totalKg = weightPerTieKg * tieCount;

    return {
      tieDia, tieCount, hookAngle, ringLengthMm: Math.round(ringLengthMm),
      cuttingLengthMm: Math.round(cuttingLengthMm), weightPerTieKg, totalKg,
      note: `Cutting length = ring perimeter − bend deduction at each corner + two ${hookAngle}° hooks.`,
    };
  }

  function concreteVolumeM3(column) {
    const heightM = (column.geometry.height || 0) / 1000;
    return (grossAreaMm2(column) / 1e6) * heightM; // mm² -> m², × m height
  }

  // ------------------------------------------------------------ safety checks

  /** Returns [{ level: 'danger'|'warning'|'ok', message }]. Level drives
   *  color in the UI; 'ok' entries are included so the panel can show a
   *  clean bill of health, not just problems. */
  function runSafetyChecks(column) {
    const checks = [];
    const rules = rulesFor(column.designCode);
    const pct = steelPercent(column);

    if (pct < rules.minSteelPercent) {
      checks.push({ level: 'danger', message: `Steel % (${pct.toFixed(2)}%) is below the ${rules.minSteelPercent}% minimum for ${column.designCode} — ${rules.source}.` });
    } else {
      checks.push({ level: 'ok', message: `Steel % (${pct.toFixed(2)}%) meets the ${rules.minSteelPercent}% minimum for ${column.designCode}.` });
    }

    if (pct > rules.maxSteelPercent) {
      checks.push({ level: 'warning', message: `Steel % (${pct.toFixed(2)}%) exceeds the ${rules.maxSteelPercent}% general maximum for ${column.designCode} (up to ${rules.maxSteelPercentAtLap}% may be allowed at lap zones only) — ${rules.source}.` });
    }

    const spacing = spacingChecks(column);
    const failedSpacing = spacing.filter((s) => !s.ok);
    if (failedSpacing.length) {
      checks.push({ level: 'danger', message: `${failedSpacing.length} bar gap(s) have clear spacing below the required minimum (see Spacing table).` });
    } else if (spacing.length) {
      checks.push({ level: 'ok', message: 'All checked bar gaps meet minimum clear spacing.' });
    }

    const cover = column.geometry.clearCover || 0;
    const minCover = 25; // simplified floor; exposure-condition-specific values are a Phase 7+ refinement
    if (cover < minCover) {
      checks.push({ level: 'danger', message: `Clear cover (${cover}mm) is below a conservative ${minCover}mm floor — verify against exposure condition.` });
    }

    const totalBars = column.bars.reduce((s, g) => s + g.count, 0);
    const gross = grossAreaMm2(column);
    const barDensity = totalBars / (gross / 1e6); // bars per m² of section — a rough congestion proxy
    if (barDensity > 120) {
      checks.push({ level: 'warning', message: `${totalBars} longitudinal bars in this section (${barDensity.toFixed(0)}/m²) — check for congestion at splices and beam-column joints.` });
    }

    if (totalBars < 4) {
      checks.push({ level: 'danger', message: `Only ${totalBars} longitudinal bar(s) — a column needs at least 4 for basic stability.` });
    }

    const noLapZone = DevLap.noLapZoneLength(column);
    if (noLapZone != null) {
      checks.push({ level: 'ok', message: `IS 13920 seismic detailing: keep lap splices outside the ${Math.round(noLapZone)}mm confining zone at each beam-column joint face.` });
    }

    return checks;
  }

  function worstCheckLevel(checks) {
    if (checks.some((c) => c.level === 'danger')) return 'danger';
    if (checks.some((c) => c.level === 'warning')) return 'warning';
    return 'ok';
  }

  // --------------------------------------------------------- column summary

  /** Everything for ONE column type (not multiplied by quantity). */
  function columnSummary(column) {
    const gross = grossAreaMm2(column);
    const steelArea = steelAreaMm2(column);
    const pct = gross > 0 ? (steelArea / gross) * 100 : 0;
    const longSteel = longitudinalSteelWeight(column);
    const ties = tieWeight(column);
    const concreteVol = concreteVolumeM3(column);
    const checks = runSafetyChecks(column);

    return {
      grossAreaMm2: gross,
      steelAreaMm2: steelArea,
      steelPercent: pct,
      rules: rulesFor(column.designCode),
      spacing: spacingChecks(column),
      longitudinalSteel: longSteel,
      ties,
      concreteVolumeM3: concreteVol,
      totalSteelWeightKg: longSteel.totalKg + ties.totalKg,
      checks,
      status: worstCheckLevel(checks),
    };
  }

  // --------------------------------------------------------- project totals

  function projectTotals(columns, project) {
    let totalConcreteM3 = 0;
    let totalSteelKg = 0;
    let totalLongSteelKg = 0;
    let totalTieSteelKg = 0;
    let totalColumnInstances = 0;
    let steelPercentSum = 0;

    columns.forEach((col) => {
      const s = columnSummary(col);
      const qty = Number(col.quantity) || 1;
      totalConcreteM3 += s.concreteVolumeM3 * qty;
      totalLongSteelKg += s.longitudinalSteel.totalKg * qty;
      totalTieSteelKg += s.ties.totalKg * qty;
      totalColumnInstances += qty;
      steelPercentSum += s.steelPercent;
    });
    totalSteelKg = totalLongSteelKg + totalTieSteelKg;

    const steelRate = (project && project.steelRatePerKg) || 0;
    const concreteRate = (project && project.concreteRatePerM3) || 0;
    const estimatedSteelCost = totalSteelKg * steelRate;
    const estimatedConcreteCost = totalConcreteM3 * concreteRate;

    return {
      totalColumnTypes: columns.length,
      totalColumnInstances,
      totalConcreteM3,
      totalLongSteelKg,
      totalTieSteelKg,
      totalSteelKg,
      averageSteelPercent: columns.length ? steelPercentSum / columns.length : 0,
      estimatedSteelCost,
      estimatedConcreteCost,
      estimatedTotalCost: estimatedSteelCost + estimatedConcreteCost,
    };
  }

  // ------------------------------------------------- development/lap reference

  /** One row per unique bar diameter present in the column (longitudinal
   *  + tie), showing Ld and lap length in both tension and compression —
   *  the reference table an engineer checks before detailing splices. */
  function devLapReference(column) {
    const diameters = new Set(column.bars.map((g) => g.diameter));
    if (column.ties && column.ties.diameter) diameters.add(column.ties.diameter);
    return Array.from(diameters).sort((a, b) => a - b).map((dia) => ({
      diameter: dia,
      ldTension: DevLap.developmentLength(dia, column.steelGrade, column.concreteGrade, 'tension'),
      ldCompression: DevLap.developmentLength(dia, column.steelGrade, column.concreteGrade, 'compression'),
      lapTension: DevLap.lapLength(dia, column.steelGrade, column.concreteGrade, 'tension'),
      lapCompression: DevLap.lapLength(dia, column.steelGrade, column.concreteGrade, 'compression'),
    }));
  }

  // ------------------------------------------------------------- BBS schedule

  /** The Bar Bending Schedule for ONE column type (not multiplied by
   *  quantity — the caller multiplies by column.quantity for a project
   *  total, same convention as everything else in this module). One row
   *  per longitudinal bar mark, plus one row for ties. */
  function bbsSchedule(column) {
    const longSteel = longitudinalSteelWeight(column);
    const ties = tieWeight(column);
    const noLapZone = DevLap.noLapZoneLength(column);
    const splices = column.splices || {};

    // 1. Longitudinal Bar Rows (with dynamic splice/dowel shape descriptions)
    const rows = longSteel.rows.map((r, i) => {
      let shapeDesc = 'Straight (+ lap)';
      let detailDesc = `${column.geometry.floorHeight || column.geometry.height}mm floor height + ${r.lapLengthMm}mm lap`;

      if (splices.isFootingDowel) {
        shapeDesc = 'Footing Dowel (L-Bend)';
        detailDesc += ` + ${splices.dowelEmbedmentMm || 600}mm embedment + 12d L-bend`;
      } else if (splices.isCrankEnabled) {
        shapeDesc = 'Cranked Bar (1:6 Bend)';
        detailDesc += ' + 1:6 crank offset';
      }

      return {
        mark: i + 1,
        shape: shapeDesc,
        diameter: r.diameter,
        nos: r.count,
        cuttingLengthMm: Math.round(r.lengthM * 1000),
        unitWeightKgPerM: r.unitWeightKgPerM,
        weightPerBarKg: r.weightPerBarKg,
        totalKg: r.totalKg,
        detail: detailDesc,
      };
    });

    // 2. Outer Tie Row
    rows.push({
      mark: rows.length + 1,
      shape: `Rect./Circ. tie, ${ties.hookAngle}° hooks`,
      diameter: ties.tieDia,
      nos: ties.tieCount,
      cuttingLengthMm: ties.cuttingLengthMm,
      unitWeightKgPerM: unitWeightKgPerM(ties.tieDia),
      weightPerBarKg: ties.weightPerTieKg,
      totalKg: ties.totalKg,
      detail: `ring ${ties.ringLengthMm}mm − bends + hooks`,
    });

    // 3. Internal Links / Cross-Ties Row (if enabled)
    const intLinkType = (column.ties && column.ties.internalLinkType) || 'none';
    if (intLinkType !== 'none') {
      const { bars } = Geometry.resolveBars(column);
      const linkPaths = Geometry.buildInternalLinkPaths(bars, intLinkType);

      if (linkPaths.length > 0) {
        const intDia = column.ties.internalLinkDia || ties.tieDia || 8;
        const hookLen = DevLap.hookLength(intDia, ties.hookAngle || 135);

        const singleLinkPerimeter = linkPaths.reduce((acc, p) => acc + (p.perimeterMm || 0), 0);
        const linkCuttingLengthMm = Math.round(singleLinkPerimeter + (2 * hookLen));

        const linkCount = ties.tieCount * linkPaths.length;
        const unitWt = unitWeightKgPerM(intDia);
        const weightPerBarKg = unitWt * (linkCuttingLengthMm / 1000);
        const totalKg = weightPerBarKg * linkCount;

        rows.push({
          mark: rows.length + 1,
          shape: `Internal Link (${intLinkType})`,
          diameter: intDia,
          nos: linkCount,
          cuttingLengthMm: linkCuttingLengthMm,
          unitWeightKgPerM: unitWt,
          weightPerBarKg,
          totalKg,
          detail: `${linkPaths.length} link set(s) per tie level (${intLinkType})`,
        });
      }
    }

    return {
      rows,
      totalWeightKg: rows.reduce((s, r) => s + r.totalKg, 0),
      reference: devLapReference(column),
      noLapZoneMm: noLapZone != null ? Math.round(noLapZone) : null,
      longSteelNote: longSteel.note,
      tieNote: ties.note,
    };
  }

  global.App = global.App || {};
  global.App.Calc = {
    CODE_RULES, rulesFor, unitWeightKgPerM, barAreaMm2,
    grossAreaMm2, steelAreaMm2, steelPercent, minClearSpacingMm, spacingChecks,
    longitudinalSteelWeight, tieWeight, concreteVolumeM3,
    runSafetyChecks, worstCheckLevel, columnSummary, projectTotals,
    devLapReference, bbsSchedule,
  };
})(window);
