/**
 * Geometry
 * -----------------------------------------------------------------------
 * All geometry lives in real millimetres here — pixel conversion happens
 * only at the very last step in ui/canvas.js. That keeps this module
 * reusable by the Phase 6 calculation engine (spacing checks, steel %,
 * etc.) without dragging drawing concerns into it.
 *
 * Core idea for bar placement: every column shape (including circles,
 * approximated as a fine polygon) is reduced to an ordered vertex list.
 * Bars are placed by:
 *   - "corner"  -> directly on the shape's true vertices
 *   - "top/bottom/left-face/right-face" -> evenly spaced along whichever
 *      edge is classified as that face (by extreme position)
 *   - "middle/custom" -> evenly spaced around the full perimeter
 * Each bar group gets its own inward offset (cover + tie dia + bar
 * radius), because different diameter groups sit at different depths
 * from the same face — this is real detailing behaviour, not a visual
 * trick. Because the offset polygon preserves vertex/edge correspondence
 * with the outer polygon, a point described as "edge i, fraction t" on
 * the outer shape maps directly onto any inset polygon at the same
 * (i, t) — that correspondence is what makes per-group offsets cheap.
 */
(function (global) {
  'use strict';

  const CIRCLE_APPROX_SIDES = 48;

  function dist(a, b) { return Math.hypot(b.x - a.x, b.y - a.y); }

  function polygonCentroid(vertices) {
    let x = 0, y = 0;
    vertices.forEach((v) => { x += v.x; y += v.y; });
    return { x: x / vertices.length, y: y / vertices.length };
  }

  function perimeter(vertices) {
    let p = 0;
    for (let i = 0; i < vertices.length; i++) p += dist(vertices[i], vertices[(i + 1) % vertices.length]);
    return p;
  }

  /** Point at parametric fraction t (0..1) along edge (a -> b). */
  function lerp(a, b, t) { return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }; }

  /**
   * Offset a (possibly concave, e.g. L/T) polygon inward by distance d.
   * Works by shifting every edge along its inward normal, then
   * re-intersecting consecutive offset edges to find new vertices.
   * "Inward" is resolved per-edge by checking which normal direction
   * points toward the polygon centroid, so winding order doesn't matter.
   */
  function offsetPolygon(vertices, d) {
    const n = vertices.length;
    if (d <= 0) return vertices.map((v) => ({ x: v.x, y: v.y }));
    const centroid = polygonCentroid(vertices);

    const offsetLines = []; // { p, dir } — a point on the offset line + its direction
    for (let i = 0; i < n; i++) {
      const a = vertices[i], b = vertices[(i + 1) % n];
      const dx = b.x - a.x, dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      const dir = { x: dx / len, y: dy / len };
      const n1 = { x: -dir.y, y: dir.x };
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const towardCentroid = { x: centroid.x - mid.x, y: centroid.y - mid.y };
      const sign = (n1.x * towardCentroid.x + n1.y * towardCentroid.y) >= 0 ? 1 : -1;
      const normal = { x: n1.x * sign, y: n1.y * sign };
      offsetLines.push({ p: { x: a.x + normal.x * d, y: a.y + normal.y * d }, dir });
    }

    const result = [];
    for (let i = 0; i < n; i++) {
      const prev = offsetLines[(i - 1 + n) % n];
      const cur = offsetLines[i];
      const pt = lineIntersect(prev.p, prev.dir, cur.p, cur.dir);
      result.push(pt || vertices[i]);
    }
    return result;
  }

  function lineIntersect(p1, d1, p2, d2) {
    const denom = d1.x * d2.y - d1.y * d2.x;
    if (Math.abs(denom) < 1e-9) return null; // parallel edges — keep original vertex
    const t = ((p2.x - p1.x) * d2.y - (p2.y - p1.y) * d2.x) / denom;
    return { x: p1.x + d1.x * t, y: p1.y + d1.y * t };
  }

  /**
   * Classify which edge index best represents each face direction, by
   * picking the longest edge whose midpoint sits within `tol` of the
   * bounding box's extreme on that axis. Works for simple rectilinear
   * shapes and degrades gracefully (still picks *an* edge) for others.
   */
  function classifyEdges(vertices) {
    const xs = vertices.map((v) => v.x), ys = vertices.map((v) => v.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const tolX = Math.max(4, (maxX - minX) * 0.08);
    const tolY = Math.max(4, (maxY - minY) * 0.08);
    const n = vertices.length;

    const edges = [];
    for (let i = 0; i < n; i++) {
      const a = vertices[i], b = vertices[(i + 1) % n];
      edges.push({ index: i, a, b, len: dist(a, b), mid: lerp(a, b, 0.5) });
    }

    function bestEdge(filterFn) {
      const candidates = edges.filter(filterFn);
      if (!candidates.length) return null;
      return candidates.reduce((best, e) => (e.len > best.len ? e : best), candidates[0]).index;
    }

    return {
      top: bestEdge((e) => e.mid.y <= minY + tolY),
      bottom: bestEdge((e) => e.mid.y >= maxY - tolY),
      left: bestEdge((e) => e.mid.x <= minX + tolX),
      right: bestEdge((e) => e.mid.x >= maxX - tolX),
    };
  }


  /**
   * Generates vertex paths for internal ties / cross-links.
   */



  // Add inside js/models/geometry.js
  function buildInternalLinkPaths(bars, linkType) {
    if (!linkType || linkType === 'none' || !bars || !bars.length) return [];
    const paths = [];

    if (linkType === 'diamond') {
      const faceBars = bars.filter((b) => b.placement !== 'corner');
      if (faceBars.length >= 4) {
        const verts = faceBars.slice(0, 4).map((b) => ({ x: b.x, y: b.y }));
        let perim = 0;
        for (let i = 0; i < verts.length; i++) {
          perim += dist(verts[i], verts[(i + 1) % verts.length]);
        }
        paths.push({ type: 'closed', vertices: verts, perimeterMm: perim });
      }
    } else if (linkType === 'cross_x') {
      const leftBars = bars.filter((b) => b.placement === 'left-face');
      const rightBars = bars.filter((b) => b.placement === 'right-face');
      const count = Math.min(leftBars.length, rightBars.length);
      for (let i = 0; i < count; i++) {
        const p1 = { x: leftBars[i].x, y: leftBars[i].y };
        const p2 = { x: rightBars[i].x, y: rightBars[i].y };
        paths.push({ type: 'line', start: p1, end: p2, perimeterMm: dist(p1, p2) });
      }
    } else if (linkType === 'cross_y') {
      const topBars = bars.filter((b) => b.placement === 'top');
      const bottomBars = bars.filter((b) => b.placement === 'bottom');
      const count = Math.min(topBars.length, bottomBars.length);
      for (let i = 0; i < count; i++) {
        const p1 = { x: topBars[i].x, y: topBars[i].y };
        const p2 = { x: bottomBars[i].x, y: bottomBars[i].y };
        paths.push({ type: 'line', start: p1, end: p2, perimeterMm: dist(p1, p2) });
      }
    }

    return paths;
  }



  /** Build the true-vertex outline (mm, local coordinates) for a column. */
  function buildOutline(column) {
    const g = column.geometry;
    switch (column.type) {
      case 'square': {
        const s = g.side;
        return { vertices: rectVerts(s, s), isCircle: false };
      }
      case 'rectangle': {
        return { vertices: rectVerts(g.length, g.width), isCircle: false };
      }
      case 'circular': {
        const r = g.diameter / 2;
        return {
          vertices: regularPolygon(r, CIRCLE_APPROX_SIDES, r, r),
          isCircle: true,
          circle: { cx: r, cy: r, r },
        };
      }
      case 'polygon': {
        const r = g.circumDiameter / 2;
        return { vertices: regularPolygon(r, Math.max(3, g.sides), r, r), isCircle: false };
      }
      case 'lshape': {
        const L = g.length, W = g.width, t1 = g.flangeThk1, t2 = g.flangeThk2;
        return {
          vertices: [{ x: 0, y: 0 }, { x: L, y: 0 }, { x: L, y: t1 }, { x: t2, y: t1 }, { x: t2, y: W }, { x: 0, y: W }],
          isCircle: false,
        };
      }
      case 'tshape': {
        const L = g.length, W = g.width, ft = g.flangeThk, wt = g.webThk;
        const webX = (L - wt) / 2;
        return {
          vertices: [
            { x: 0, y: 0 }, { x: L, y: 0 }, { x: L, y: ft }, { x: webX + wt, y: ft },
            { x: webX + wt, y: W }, { x: webX, y: W }, { x: webX, y: ft }, { x: 0, y: ft },
          ],
          isCircle: false,
        };
      }
      default: {
        return { vertices: rectVerts(g.boundingLength || 600, g.boundingWidth || 600), isCircle: false };
      }
    }
  }

  function rectVerts(w, h) {
    return [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }];
  }

  function regularPolygon(r, sides, cx, cy) {
    const pts = [];
    for (let i = 0; i < sides; i++) {
      const angle = (Math.PI * 2 * i) / sides - Math.PI / 2;
      pts.push({ x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) });
    }
    return pts;
  }

  /**
   * Place one bar group's bars (mm coordinates), given the column's
   * outer outline. Returns [{ x, y }] in the same order/count as the
   * group. `depth` is the inward offset (cover + tie dia + bar radius).
   */
  function placeGroupBars(outerVertices, edgeMap, group, depth) {
    const n = outerVertices.length;
    const inset = offsetPolygon(outerVertices, depth);
    const count = Math.max(1, Number(group.count) || 1);
    const positions = [];

    if (group.placement === 'corner') {
      const useCount = Math.min(count, n);
      for (let i = 0; i < useCount; i++) positions.push(inset[i]);
      if (count > n) {
        // Overflow beyond available corners: spread the remainder around
        // the whole perimeter rather than stacking bars on one vertex.
        positions.push(...evenlyAroundPerimeter(outerVertices, inset, count - n, 0.5));
      }
    } else if (group.placement === 'top' || group.placement === 'bottom' || group.placement === 'left-face' || group.placement === 'right-face') {
      const key = group.placement === 'left-face' ? 'left' : group.placement === 'right-face' ? 'right' : group.placement;
      const edgeIdx = edgeMap[key];
      if (edgeIdx === null || edgeIdx === undefined) {
        positions.push(...evenlyAroundPerimeter(outerVertices, inset, count, 0.5));
      } else {
        const a = inset[edgeIdx], b = inset[(edgeIdx + 1) % n];
        const margin = 0.14; // keep face bars clear of the corner bars
        for (let i = 0; i < count; i++) {
          const t = count === 1 ? 0.5 : margin + (i / (count - 1)) * (1 - 2 * margin);
          positions.push(lerp(a, b, t));
        }
      }
    } else {
      // middle / custom — evenly around the full perimeter, phase-shifted
      // half a step so bars don't land exactly on the corners.
      positions.push(...evenlyAroundPerimeter(outerVertices, inset, count, 0.5));
    }
    return positions;
  }

  /** Evenly space `count` points around the inset polygon's perimeter,
   *  parametrized by arc-length fraction on the OUTER polygon (so shapes
   *  with unequal edge lengths, like L/T, still get visually even spacing)
   *  then mapped to the inset polygon via (edgeIndex, localT) correspondence. */
  function evenlyAroundPerimeter(outer, inset, count, phase) {
    const n = outer.length;
    const edgeLens = [];
    for (let i = 0; i < n; i++) edgeLens.push(dist(outer[i], outer[(i + 1) % n]));
    const total = edgeLens.reduce((a, b) => a + b, 0);

    const points = [];
    for (let k = 0; k < count; k++) {
      const targetLen = ((k + phase) / count) * total;
      let acc = 0, edgeIdx = 0, localT = 0;
      for (let i = 0; i < n; i++) {
        if (acc + edgeLens[i] >= targetLen) { edgeIdx = i; localT = (targetLen - acc) / (edgeLens[i] || 1); break; }
        acc += edgeLens[i];
        edgeIdx = i; localT = 1;
      }
      const a = inset[edgeIdx], b = inset[(edgeIdx + 1) % n];
      points.push(lerp(a, b, localT));
    }
    return points;
  }

  /**
   * Full placement pass for a column: returns every individual bar with
   * its mm position, plus per-group spacing (center-to-center distance
   * to the next bar in the same group, where that is meaningful).
   */
  function placeAllBars(column) {
    const outline = buildOutline(column);
    const edgeMap = classifyEdges(outline.vertices);

    const bars = [];
    column.bars.forEach((group, groupIndex) => {
      const depth = groupDepth(column, group);
      const positions = placeGroupBars(outline.vertices, edgeMap, group, depth);
      positions.forEach((pos, i) => {
        bars.push({
          groupId: group.id,
          groupIndex,
          markNumber: groupIndex + 1,
          diameter: group.diameter,
          placement: group.placement,
          x: pos.x,
          y: pos.y,
          indexInGroup: i,
          countInGroup: positions.length,
        });
      });
    });

    recomputeSpacing(bars);
    return { outline, edgeMap, bars };
  }

  /** Recompute (in place) center-to-center spacing to the next bar within
   *  each group, by current index order. Shared by auto layout and by
   *  Phase 5's manual-override merge, since a drag changes real distances. */
  function recomputeSpacing(bars) {
    const byGroup = {};
    bars.forEach((b) => { (byGroup[b.groupId] = byGroup[b.groupId] || []).push(b); });
    Object.values(byGroup).forEach((groupBars) => {
      groupBars.sort((a, b) => a.indexInGroup - b.indexInGroup);
      groupBars.forEach((b, i) => {
        const nextB = groupBars[i + 1];
        b.spacingToNext = nextB ? Math.round(dist(b, nextB)) : null;
      });
    });
  }

  /** Inward offset for one bar group: cover + tie diameter + this group's
   *  own bar radius. Different-diameter groups genuinely sit at different
   *  depths from the same face — exported so Phase 5's drag/snap logic can
   *  recompute the exact same ring a bar was auto-placed on. */
  function groupDepth(column, group) {
    const tieDia = (column.ties && column.ties.diameter) || 8;
    const cover = column.geometry.clearCover || 40;
    return cover + tieDia + group.diameter / 2;
  }

  /** The inset shape (ring) a given group's bars sit on — a polygon for
   *  every shape except true circles, which keep an exact circular ring. */
  function insetShapeForGroup(outline, depth) {
    if (outline.isCircle) {
      const r = Math.max(0, outline.circle.r - depth);
      return { isCircle: true, circle: { cx: outline.circle.cx, cy: outline.circle.cy, r } };
    }
    return { isCircle: false, vertices: offsetPolygon(outline.vertices, depth) };
  }

  function nearestPointOnSegment(p, a, b) {
    const abx = b.x - a.x, aby = b.y - a.y;
    const len2 = (abx * abx + aby * aby) || 1;
    let t = ((p.x - a.x) * abx + (p.y - a.y) * aby) / len2;
    t = Math.max(0, Math.min(1, t));
    const proj = { x: a.x + abx * t, y: a.y + aby * t };
    return { point: proj, dist: dist(p, proj) };
  }

  /** Closest point on a closed polygon's boundary to an arbitrary point —
   *  used to snap a dragged bar back onto its group's rebar ring. */
  function nearestPointOnPolygon(p, vertices) {
    const n = vertices.length;
    let best = null;
    for (let i = 0; i < n; i++) {
      const r = nearestPointOnSegment(p, vertices[i], vertices[(i + 1) % n]);
      if (!best || r.dist < best.dist) best = r;
    }
    return best.point;
  }

  function nearestPointOnCircle(p, cx, cy, r) {
    const dx = p.x - cx, dy = p.y - cy;
    const len = Math.hypot(dx, dy) || 1;
    return { x: cx + (dx / len) * r, y: cy + (dy / len) * r };
  }

  /** Snap an arbitrary point onto a group's inset ring — polygon or circle. */
  function snapToRing(point, insetShape) {
    return insetShape.isCircle
      ? nearestPointOnCircle(point, insetShape.circle.cx, insetShape.circle.cy, insetShape.circle.r)
      : nearestPointOnPolygon(point, insetShape.vertices);
  }

  /** Polygon area via the shoelace formula (always positive, winding-
   *  order independent). Used for gross cross-sectional area. */
  function polygonArea(vertices) {
    let sum = 0;
    const n = vertices.length;
    for (let i = 0; i < n; i++) {
      const a = vertices[i], b = vertices[(i + 1) % n];
      sum += a.x * b.y - b.x * a.y;
    }
    return Math.abs(sum) / 2;
  }

  /** Gross cross-sectional area in mm² — exact circle area for round
   *  columns (not the 48-gon approximation used for placement math). */
  function grossAreaMm2(column) {
    const outline = buildOutline(column);
    return outline.isCircle ? Math.PI * outline.circle.r * outline.circle.r : polygonArea(outline.vertices);
  }

  /** One group's *effective* positions: its baked manual override if
   *  present and still the right length, otherwise Phase 4's automatic
   *  layout. This is the single place that decision is made — the
   *  drawing (ui/canvas.js) and the calculation engine (models/calc.js)
   *  both call this, so a hand-dragged bar is reflected in both. */
  function groupPositions(column, outline, edgeMap, group) {
    if (group.manualPositions && group.manualPositions.length === group.count) {
      return group.manualPositions.map((p) => ({ x: p.x, y: p.y }));
    }
    const depth = groupDepth(column, group);
    return placeGroupBars(outline.vertices, edgeMap, group, depth);
  }

  /** Like placeAllBars(), but every group's positions pass through
   *  groupPositions() first, so hand-placed bars (Phase 5) show up
   *  exactly where they were left instead of at their auto position. */
  function resolveBars(column) {
    const outline = buildOutline(column);
    const edgeMap = classifyEdges(outline.vertices);
    const bars = [];
    column.bars.forEach((group, groupIndex) => {
      const positions = groupPositions(column, outline, edgeMap, group);
      positions.forEach((pos, i) => {
        bars.push({
          groupId: group.id, groupIndex, markNumber: groupIndex + 1,
          diameter: group.diameter, placement: group.placement,
          x: pos.x, y: pos.y, indexInGroup: i, countInGroup: positions.length,
          manual: !!(group.manualPositions && group.manualPositions.length === group.count),
        });
      });
    });
    recomputeSpacing(bars);
    return { outline, edgeMap, bars };
  }

  global.App = global.App || {};
  global.App.Geometry = {
    buildOutline, offsetPolygon, classifyEdges, polygonCentroid, perimeter,
    placeAllBars, placeGroupBars, recomputeSpacing, groupDepth,
    insetShapeForGroup, nearestPointOnPolygon, nearestPointOnCircle, snapToRing,
    polygonArea, grossAreaMm2, groupPositions, resolveBars,
    buildInternalLinkPaths, dist,
  };
})(window);
