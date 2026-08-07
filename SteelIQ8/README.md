# StructBBS — Column Reinforcement & Bar Bending Schedule Designer

Offline, no-backend engineering tool. Pure HTML/CSS/vanilla JS.
Open `index.html` directly in a browser — no build step, no server.
The one exception: PDF/Excel export (Phase 8) needs a network
connection once, to load its export libraries from CDN — see below.

## Status: Phases 1–8 complete (of 9)

| Phase | Scope | Status |
|---|---|---|
| 1 | Architecture & folder structure | ✅ Done |
| 2 | Modern UI & layout (toolbar, rail, resizable panels, dark/light) | ✅ Done |
| 3 | Project / column management (CRUD, undo/redo, autosave, JSON I/O) | ✅ Done |
| 4 | SVG cross-section visualization engine | ✅ Done |
| 5 | Reinforcement placement system (drag/drop, mirror, snap) | ✅ Done |
| 6 | Structural calculation engine (steel %, spacing, volumes, weights) | ✅ Done |
| 7 | Development length / lap / anchorage / full BBS | ✅ Done |
| 8 | PDF & Excel export | ✅ Done |
| 9 | Final polish, testing, optimization | ⏳ Next |

The in-app **Roadmap** button (top toolbar, circle-i icon) shows this same
list live.

## What works right now

- Create unlimited columns, each with a name, quantity-in-building, shape
  type (square / rectangle / circular / polygon / L / T / custom),
  geometry, concrete/steel grade, story, longitudinal bar groups (any
  mix of diameters + placement tag), tie/stirrup parameters, and notes.
- Full CRUD: add, rename (double-click name in the list), duplicate,
  delete, search/filter by name/type/story.
- Undo/redo (`Ctrl+Z` / `Ctrl+Y`), autosave to `localStorage` (debounced),
  reloads exactly where you left off.
- Import/export the whole project as JSON.
- Dark/light theme toggle, resizable left/right panels (widths persist).
- A **basic live geometry preview** on the canvas: shape outline, cover
  line, centroid mark, a couple of dimension lines, and a bar-group
  legend, with working pan (drag) and zoom (scroll wheel or +/− /
  reset buttons). This is intentionally *not* the final detailing
  drawing — see Phase 4 below.

## Phase 4 additions (this update)

- `js/models/geometry.js` — a pure-math module (mm units, no DOM) that:
  - builds the true-vertex outline for every shape (circles are also
    approximated as a 48-gon internally so *one* placement algorithm
    handles rectilinear and curved shapes alike; the true circle is
    still what gets drawn),
  - offsets any polygon inward by an arbitrary distance — including
    concave L/T shapes — via per-edge inward normals + line
    intersection (winding-order independent: inward is resolved by
    checking which offset direction moves toward the centroid),
  - classifies which edge is "top/bottom/left-face/right-face" by
    position, so those placement tags do something real on any shape,
  - places every individual bar: `corner` bars sit exactly on the
    shape's true vertices, face-tagged bars space evenly along the
    matching edge, `middle`/`custom` bars space evenly around the
    whole perimeter (arc-length weighted, so L/T shapes with unequal
    edge lengths still look even), and each bar group gets its **own**
    inward offset (cover + tie dia + that group's own bar radius) —
    different diameter groups genuinely sit at different depths from
    the face, which is how real detailing works.
  - Verified with a standalone Node harness (rectangle, square with a
    corner-count overflow, circular, L-shape, hexagon) confirming no
    NaNs/crashes across shapes before wiring it into the UI.
- `js/ui/canvas.js` rewritten to consume that geometry: every bar is a
  real, color-coded, correctly-scaled circle (not a legend chip);
  bar-mark leader lines + numbered badges point outward from one
  representative bar per group; spacing (mm, center-to-center) is
  annotated at the first gap in each group; hover shows a tooltip
  (mark, diameter, placement, position-in-group, spacing); clicking a
  bar selects it (dashed accent ring), clicking empty canvas clears
  selection; a docked mark-legend table (Mark / Dia / Nos / Placement)
  sits in the top-right of the canvas; **Export SVG** and **Export
  PNG** buttons in the canvas HUD serialize the live drawing with all
  CSS variables resolved to literal colors first, so the exported file
  looks correct even outside the app (PNG rasterized at 2x for print
  quality).

## Phase 5 additions (this update)

- **Data model**: every bar group now has `manualPositions: null | [{x,y}]`.
  `null` means "still on Phase 4's automatic layout"; a baked array means
  "hand-placed, use these exact mm coordinates instead." Changing a
  group's count, diameter, or placement tag from the properties panel
  clears the override (a stale array with the wrong length or depth is
  worse than falling back to auto), and each overridden group shows a
  "hand-placed" badge with a one-click reset in the properties panel.
- **Drag-and-drop**: grab any bar on the drawing and move it. Live
  feedback during the drag directly repositions just the affected
  `<circle>` elements (no full re-render per pixel); the final position
  is what commits to `App.state` on release — one undo step per drag,
  not one per pixel moved.
- **Snap to rebar ring** (on by default): a dragged bar is constrained
  to its own group's inset ring — `cover + tie diameter + that group's
  bar radius` from the face, via `Geometry.snapToRing` — because a real
  cage doesn't let a bar float inside the section. Turn it off in the
  Placement Tools dock for free placement.
- **Snap to 5mm grid** (optional): rounds the committed position to a
  clean 5mm increment.
- **Symmetric drag** (optional): moving bar *i* also moves its
  index-mirrored partner (`count-1-i`) in the same group, reflected
  across the vertical centerline — keeps a symmetric layout symmetric
  without dragging both sides by hand.
- **Mirror ↔ / Mirror ↕ / Rotate 90°**: bakes the column's *current*
  effective layout (a mix of auto and hand-placed groups is fine) through
  a reflection or rotation about the section's centroid, and stores the
  result as a manual override on every group. Rotating a non-square
  rectangular/L/T column shows a one-time note that only the bar layout
  rotates, not the concrete outline itself.
- **Reset to Auto Layout**: clears every group's override in one click.
- All of the above math (`groupDepth`, `insetShapeForGroup`,
  `nearestPointOnPolygon`/`nearestPointOnCircle`, `snapToRing`,
  `placeGroupBars`, `recomputeSpacing`) was added to `js/models/geometry.js`
  rather than `canvas.js`, and verified with a second standalone Node
  test (ring-snapping from far outside the section, circle vs polygon
  insets, mirror/rotate distance-preservation) before being wired into
  drag/mirror/rotate — same verify-before-wire approach as Phase 4.

## Phase 6 additions (this update)

- **`js/models/geometry.js` gained a shared "effective bars" resolver**
  (`Geometry.groupPositions` / `Geometry.resolveBars`) that both the
  drawing (`ui/canvas.js`) and the new calc engine call — previously
  this merge-in-manual-overrides logic lived only in `canvas.js`, which
  meant the calc engine could have silently disagreed with what the
  drawing showed after a Phase 5 drag. Now there's exactly one place
  that decides where a bar actually is. `canvas.js` was refactored to
  call the shared version instead of its own copy (behavior unchanged,
  duplication removed). Also added exact polygon area (shoelace formula)
  and true-circle area for gross cross-sectional area.
- **`js/models/calc.js`** — the calculation engine, pure functions, no
  DOM:
  - gross area, steel area, steel % (exact geometry, not the 48-gon
    circle approximation used for bar placement),
  - a small per-code-family rules table (min/max longitudinal steel %)
    for IS 456, IS 13920, ACI 318, Eurocode 2, BS 8110 — explicitly
    labeled as simplified/commonly-cited defaults, not a substitute for
    a full code check (Eurocode's real minimum depends on axial load,
    which isn't modeled),
  - clear spacing between consecutive bars in each group (reading the
    *actual* drawn positions, so a hand-dragged bar changes the
    numbers — verified in the test harness below),
  - concrete volume, longitudinal steel weight (`d²/162 kg/m` standard
    formula) and an approximate tie count + weight from spacing/end-zone
    inputs and the tie ring's true perimeter,
  - safety checks (steel % too high/low, insufficient clear spacing,
    insufficient cover, too few bars, a rough congestion proxy) returned
    as `{level, message}` so the UI can color-code them,
  - project totals across every column type × quantity: total concrete,
    total steel (split longitudinal/ties), average steel %, and an
    estimated cost from the project's steel/concrete unit rates.
  - Explicitly **not** here (Phase 7): development length, lap length,
    anchorage, hook length, bend deduction, exact BBS cutting length —
    longitudinal bar length uses clear height only and says so in its
    own output; tie length is ring perimeter only, same disclosure.
  - Verified with a standalone Node test (gross/steel area against hand
    calculations, unit weight formula, an intentionally under-reinforced
    column tripping the minimum-steel check, a circular column's exact
    area, project totals across mixed column types, and — the important
    one — a manually-dragged bar pair producing a spacing violation the
    calc engine actually catches) before wiring it into the UI.
- **New "Calculations" workspace tab** (`js/ui/calcPanel.js`): per-column
  stat cards (gross/steel area, steel %, concrete volume, steel weight),
  a color-coded safety-checks list, longitudinal steel and tie weight
  tables, a bar-spacing table with pass/fail badges, and a project
  summary card aggregating every column type by quantity. Switching tabs
  now actually swaps content (previously only Cross-Section had a real
  pane; BBS/Report tabs stay locked-with-a-toast until Phases 7–8).

## Phase 7 additions (this update)

- **`js/models/devlap.js`** — development length, lap length, hooks,
  bend deduction, and the IS 13920 no-lap zone, as pure functions:
  - `Ld = φ·σs/(4·τbd)` — IS 456 Cl. 26.2.1's bond-stress method
    (σs = 0.87·fy; τbd = base bond stress from IS 456's table, ×1.6 for
    deformed bars, ×1.25 more in compression per the same clause). This
    is the method the app's whole data model (Fe415/500/500D/550,
    M20–M50) is built around; for non-IS codes (ACI 318, Eurocode 2,
    BS 8110) the same formula is used as a generic approximation, with
    an explicit disclosure returned alongside every number rather than
    presenting it as code-authoritative for those codes.
  - Lap length = `max(Ld, 30φ)` in tension / `max(Ld, 24φ)` in
    compression — the commonly-taught floor on top of Ld.
  - Hook length (135°/90°) and bend-deduction-per-bend (45°/90°/135°),
    using widely-used BBS practice values.
  - IS 13920's seismic no-lap zone `Lo = max(clear height/6, 450mm,
    2×larger column dimension)` near beam-column joints — returns
    `null` for non-seismic codes.
  - **Verified against hand calculations before touching any UI**: a
    T16/Fe415/M20 tension Ld came out to 752mm (47.0×dia — matches the
    commonly published ~47d rule of thumb for that combination exactly);
    compression Ld = tension Ld ÷ 1.25 as the formula requires; lap
    floors, hook/bend tables, and the no-lap zone were all checked
    against independently hand-computed expected values.
- **`js/models/calc.js` upgraded** (not just extended): Phase 6's
  longitudinal steel weight used clear height only and said so as a
  known gap. It now uses `floor-to-floor height + one tension lap
  length` per bar — a real cutting length, not a placeholder — and tie
  weight now uses actual cutting length (ring perimeter − bend deduction
  at each corner + two hooks) instead of bare ring perimeter. Added
  `devLapReference()` (a per-diameter Ld/lap table) and `bbsSchedule()`
  (the full BBS rows: mark, shape, dia, nos, cutting length, weight).
  Safety checks gained an informational IS 13920 no-lap-zone note.
- **New "BBS Schedule" workspace tab** (`js/ui/bbsPanel.js`, unlocked —
  no longer a locked stub): the real Bar Bending Schedule table for the
  selected column, the dev/lap reference table, and the no-lap-zone
  note when the design code is IS 13920.
- Verified the full BBS assembly (`bbsSchedule`) end-to-end in a second
  Node test: row count, a hand-calculated cutting length for a T20
  corner bar, correct hook-angle switching between IS 456 (90°) and
  IS 13920 (135°), and the no-lap zone populating only for the seismic
  code — all before wiring into `bbsPanel.js`.

## Phase 8 additions (this update)

- **One network dependency, clearly disclosed**: jsPDF, jspdf-autotable,
  and SheetJS load from CDN (the brief's own "use CDN libraries wherever
  needed" allowance). This is the *only* thing in the entire app that
  needs an internet connection — everything else, including all nine
  phases of calculation and drawing, works from a local file with no
  network at all. If those libraries fail to load, the Report tab shows
  a clear notice instead of a silent failure, and every export button
  checks readiness before doing anything.
- **`js/ui/canvas.js` refactored** (not just extended): the interactive
  `render()` function's drawing logic was extracted into `buildColumnSvg(col,
  {interactive})`, so the exact same drawing code now produces both the
  live editable canvas AND a static image of *any* column — not just
  the one currently selected — for the PDF. New `Canvas.getColumnPngDataUrl(col)`
  rasterizes an arbitrary column to a PNG without touching the user's
  current selection, view, or drag state. The existing SVG-var-resolution
  and rasterization helpers were generalized (`serializeSvgElement`,
  `svgElementToPngDataUrl`) so both the Phase 4 HUD export buttons and
  the new PDF pipeline share one implementation instead of two.
- **`js/models/reportData.js`** — pure data assembly (no jsPDF, no
  DOM): combines a column's properties with `Calc.columnSummary()` and
  `Calc.bbsSchedule()` into one report-ready shape, plus a 5-color theme
  cycle (Blue/Green/Orange/Purple/Gray) assigned by column index. Kept
  deliberately separate from the rendering code so the assembly logic
  itself is unit-testable without a browser — verified in a dedicated
  Node test (theme cycling wraps correctly at 5, per-column and project
  totals match hand-multiplied expectations) before any PDF/Excel code
  was written on top of it.
- **`js/ui/reportPanel.js`** — the "PDF Report" tab (now unlocked):
  - **PDF**: one themed page per column (colored header band in that
    column's cycle color, its cross-section drawing, a section-properties
    table, the full Bar Bending Schedule, the development/lap reference
    table, color-coded safety checks, and engineer's notes if present),
    followed by a project summary page (every column plus totals). Ends
    with a save-to-disk and an inline `<iframe>` preview via a blob URL.
  - **Excel**: one sheet per column (header block + full BBS table +
    per-column and ×quantity totals) plus a "Project Summary" sheet —
    via SheetJS, sheet names sanitized and de-duplicated to fit Excel's
    31-character/no-special-character limit.
- No `html2canvas` dependency — column drawings are rasterized from the
  real SVG (same technique as the Phase 4 export buttons) rather than
  screenshotting DOM, which stays crisp at any output size.

## What is deliberately not built yet (and why)

The brief asked for this to be built in complete phases rather than one
pass. Every core module (Phases 1–8) is now functionally complete — all
that's left is Phase 9's polish pass, still shown as "planned" in the
Roadmap modal:

- **Visual drag-and-drop bar placement, mirror/rotate/snap/auto-symmetry.**
  Done in Phase 5.
- **All engineering calculations, development length, lap length,
  anchorage, hook length, bend deduction, and exact BBS cutting length.**
  Done in Phases 6–7.
- **BBS table, PDF report, Excel export.** Done in Phases 7–8.
- **Phase 9 (final polish, testing, optimization)** — the nav-rail's
  locked module icons (Beam/Footing/Slab/Shear Wall) remain locked
  intentionally: those are future modules beyond this brief's column
  scope, not gaps in what was asked for here.

## Architecture

```
index.html
css/
  variables.css     design tokens (dark + light)
  base.css          reset, typography, focus states
  layout.css        app shell grid, panels, resizers, canvas chrome
  components.css    lists, forms, buttons, modal, toast, badges
js/
  core/
    eventbus.js     tiny pub/sub — decouples state from UI
    storage.js      localStorage wrapper, namespaced keys
    state.js        ProjectState: CRUD, undo/redo, autosave, import/export
  models/
    columnTypes.js  shape → geometry-field schema registry (extensible)
    column.js       Column factory, cloning, id generation
    geometry.js     outline building, polygon offsetting, bar placement +
                    ring-snapping math, shared effective-bars resolver
    devlap.js       development length, lap length, hooks, bend
                    deduction, IS 13920 no-lap zone (pure formulas)
    calc.js         steel %, spacing checks, volumes, weights, safety
                    checks, project totals, BBS schedule (pure functions)
    reportData.js   assembles column/project data for the PDF/Excel report
  ui/
    theme.js, panels.js, toast.js
    columnList.js, propertiesPanel.js, canvas.js, calcPanel.js,
    bbsPanel.js, reportPanel.js, toolbar.js, statusbar.js
  main.js           boot sequence
```

Design choices made for future modules (beams, footings, slabs, stair,
pile caps, retaining walls, shear walls — the nav rail already has
locked slots for these):

- Nothing is hardcoded per-shape outside `models/columnTypes.js`. Adding
  a shape is one registry entry; the properties panel and canvas both
  read it generically.
- `ProjectState` and `EventBus` are generic enough that a future
  `BeamModel` / `FootingModel` can reuse the same CRUD, undo/redo and
  autosave plumbing rather than duplicating it.
- All modules communicate only through `App.bus` events — no module
  reaches into another's internals.

## One deviation from the original spec, on purpose

The brief asked for Lucide Icons via CDN. Since this app promises to
"work completely offline," every icon here is instead a small inline
SVG with no external icon-font dependency — so nothing breaks if it's
opened with no network available. Google Fonts (Inter / JetBrains Mono)
is still loaded from CDN for typography polish, but fails gracefully to
system fonts if offline (see the `font-family` fallback chain in
`css/variables.css`).

The one *intentional* exception is Phase 8's export libraries (jsPDF,
jspdf-autotable, SheetJS) — PDF/Excel export inherently needs a library,
and the brief explicitly names these as allowed CDN dependencies. Every
other phase — drawing, placement, all calculations, the BBS schedule —
still works with zero network access; only clicking "Generate PDF
Report" or "Export Excel Workbook" needs one, and the Report tab says
so plainly if those libraries didn't load.

## Design intent

Minimal, CAD/blueprint-inspired UI — no glassmorphism, no gradients as
decoration. Flat panels, hairline borders, one accent color (rebar
orange) reserved for actions/selection, a separate teal ("annotate")
reserved for dimension and leader lines the way drafting software keeps
ink roles distinct. Data readouts use a monospace face; UI chrome uses
Inter.
