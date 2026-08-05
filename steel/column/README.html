# StructBBS — Column Reinforcement & Bar Bending Schedule Designer

Offline, no-backend engineering tool. Pure HTML/CSS/vanilla JS.
Open `index.html` directly in a browser — no build step, no server.

## Status: Phases 1–3 complete (of 9)

| Phase | Scope | Status |
|---|---|---|
| 1 | Architecture & folder structure | ✅ Done |
| 2 | Modern UI & layout (toolbar, rail, resizable panels, dark/light) | ✅ Done |
| 3 | Project / column management (CRUD, undo/redo, autosave, JSON I/O) | ✅ Done |
| 4 | SVG cross-section visualization engine (AutoCAD-grade detailing) | ⏳ Next |
| 5 | Reinforcement placement system (drag/drop, mirror, snap) | Planned |
| 6 | Structural calculation engine (steel %, spacing, volumes, weights) | Planned |
| 7 | Development length / lap / anchorage / full BBS | Planned |
| 8 | PDF & Excel export | Planned |
| 9 | Final polish, testing, optimization | Planned |

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

## What is deliberately not built yet (and why)

The brief asked for this to be built in complete phases rather than one
pass. Rather than fake these with placeholder logic, they are left as
clearly labeled "planned" in the UI (locked nav-rail icons, disabled
workspace tabs with a toast telling you which phase unlocks them):

- **Real reinforcement drawing** — accurate bar coordinates, leader
  lines, bar callouts, spacing annotations, hover/selection states,
  high-quality export. (Phase 4)
- **Visual drag-and-drop bar placement, mirror/rotate/snap/auto-symmetry.**
  The data model already stores a `placement` tag per bar group so
  Phase 5 has something to attach to. (Phase 5)
- **All engineering calculations** — steel area/%, spacing checks,
  concrete/steel volume and weight, development length, lap length,
  bend deduction, cutting length, safety warnings. The code-standard
  selector in the toolbar is already wired to the project, waiting for
  Phase 6's formula engine to read it. (Phase 6)
- **BBS table, PDF report, Excel export.** (Phases 7–8)

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
  ui/
    theme.js, panels.js, toast.js
    columnList.js, propertiesPanel.js, canvas.js, toolbar.js, statusbar.js
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

## Design intent

Minimal, CAD/blueprint-inspired UI — no glassmorphism, no gradients as
decoration. Flat panels, hairline borders, one accent color (rebar
orange) reserved for actions/selection, a separate teal ("annotate")
reserved for dimension and leader lines the way drafting software keeps
ink roles distinct. Data readouts use a monospace face; UI chrome uses
Inter.
