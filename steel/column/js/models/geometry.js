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

    const reinforcement = column.reinforcement;

    if (!reinforcement) {

        console.warn(
            '[Geometry] Column has no reinforcement model.',
            column.name
        );

        return {
            outline,
            edgeMap,
            bars: []
        };

    }

    const tieDia =
        reinforcement.transverse.diameter || 8;

    const cover =
        column.geometry.clearCover || 40;

    const bars = [];

    reinforcement.longitudinal.bars.forEach((group, groupIndex) => {

        const depth =
            cover +
            tieDia +
            group.diameter / 2;

        const positions =
            placeGroupBars(
                outline.vertices,
                edgeMap,
                group,
                depth
            );

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

                countInGroup: positions.length

            });

        });

    });

    // Remaining code stays exactly the same...

    // center-to-center spacing within each group, consecutive by index
    const byGroup = {};
    bars.forEach((b) => { (byGroup[b.groupId] = byGroup[b.groupId] || []).push(b); });
    Object.values(byGroup).forEach((groupBars) => {
      groupBars.forEach((b, i) => {
        const nextB = groupBars[i + 1];
        b.spacingToNext = nextB ? Math.round(dist(b, nextB)) : null;
      });
    });

    return { outline, edgeMap, bars };
  }

    /**
   * Build Elevation / Side View Data for Reinforcement Cage
   */
  function buildElevationData(column) {
    const geom = column.geometry || {};
    const loads = column.loads || {};
    const ties = column.ties || {};

    const clearHeight = geom.height || geom.clearHeight || 3000;
    const cover = geom.clearCover || 40;
    
    // Tie parameters
    const endZoneLen = ties.endZoneLength || (clearHeight / 4);
    const spacingEnd = ties.spacingEnd || 100;
    const spacingMid = ties.spacingMiddle || 150;

    // Generate vertical tie locations along the height (from y = 0 to clearHeight)
    const tieLevels = [];
    let currentY = cover; // start past bottom cover/footing interface
    
    // Bottom End Zone
    while (currentY <= endZoneLen) {
      tieLevels.push({ y: currentY, zone: 'end' });
      currentY += spacingEnd;
    }
    
    // Middle Zone
    const topEndStart = clearHeight - endZoneLen;
    while (currentY < topEndStart) {
      tieLevels.push({ y: currentY, zone: 'middle' });
      currentY += spacingMid;
    }
    
    // Top End Zone
    while (currentY <= clearHeight - cover) {
      tieLevels.push({ y: currentY, zone: 'end' });
      currentY += spacingEnd;
    }

    return {
      clearHeight,
      width: geom.width || geom.length || 400,
      cover,
      endZoneLen,
      tieLevels,
      bars: column.bars
    };
  }

  function build3DData(column) {
  const placement = placeAllBars(column);
  const elevation = buildElevationData(column);

  return {
    outline: placement.outline,
    bars: placement.bars,
    edgeMap: placement.edgeMap,

    height: elevation.clearHeight,
    width: elevation.width,
    cover: elevation.cover,

    ties: {
      diameter: column.ties.diameter,
      spacingMiddle: column.ties.spacingMiddle,
      spacingEnd: column.ties.spacingEnd,
      endZoneLength: column.ties.endZoneLength,
      levels: elevation.tieLevels
    },

    concrete: {
      type: column.type,
      geometry: column.geometry
    }
  };
}

 

// Expose everything cleanly together under global.App.Geometry
  global.App = global.App || {};
  global.App.Geometry = {
    buildOutline, 
    offsetPolygon, 
    classifyEdges, 
    polygonCentroid, 
    perimeter,
    placeAllBars, 
    dist, 
    buildElevationData,
    build3DData // <-- Included right here safely
  };
})(window);
