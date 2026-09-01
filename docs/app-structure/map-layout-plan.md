# Map page layout — UX proposal (not built)

**Status:** Implemented in 0.19.0 (`map.html` map-first shell). Comment here if the layout should change again.  
**Goal:** Maximize the map. Controls sit on the glass or in one dock. Nothing important requires scrolling past the map.

How to comment: under any **D#** or **Q#**:

> Comment: …

---

## 1. What is wrong now

The map is the job. The current page treats it like a form field inside a card.

| Problem | Effect |
| --- | --- |
| Page title + blurb above the map | ~80px of map gone before you start |
| Fieldset **Map** legend + padding | Another chrome ring around the viewport |
| One wrapping toolbar *above* the map | Basemap + 5 markup buttons + 5 view controls wrap to 2–3 rows; map height is leftover |
| Layer **checkboxes** and list **tabs** are the same five things | Two UIs for one idea; easy to show Targets list while that layer is off |
| Icon library always at the bottom of the dock | Pushes the table; most sessions never assign an icon |
| Print brief on the map *and* File | Duplicate |
| Empty app-bar action slot | Brief/Print fight with drawing tools for space |
| Default view is “document”; Brief view is “map” | Daily use should be the map; brief should be a mode, not the only way to see tiles |

> Comment (problems):

---

## 2. Principle

**Map fills the work area under the app bar.** Overlays are small, clustered by job, and hideable. The right dock is a *list of what is on the map*, not a second page of settings.

```
TODAY (controls eat the map)          PROPOSED (map is the page)

┌ app bar ─────────────────┐          ┌ app bar ── File | … | [Brief] [Print] ┐
│ title + paragraph        │          ├──────────────────────────────────────┤
│ [basemap][label][arrow]  │          │ [M|S|H]                         [⌂ ▾]│
│ [delete][brief][print]   │          │ [Lbl]  MAP                           │
│ [home][set][preset][del] │          │ [Arr]                         DOCK ▸│
│ ┌ map ┐ ┌ dock ───────┐ │          │ [Del]  (full remaining height)  list │
│ │     │ │ 5 checks    │ │          │                                      │
│ │small│ │ 5 tabs      │ │          │                                      │
│ │     │ │ table       │ │          │                                      │
│ │     │ │ icon palette│ │          └──────────────────────────────────────┘
│ └─────┘ └─────────────┘ │
└─────────────────────────┘
```

> Comment (principle):

---

## 3. Proposed layout

### D1 — Drop the page header on Map

No `h1` / `page-meta` on `map.html`. The tab **Map** is the title. Hint text moves to `#mapViewHint` over the map (already exists) or a one-line status in the app bar.

> Comment (D1):

### D2 — Map is edge-to-edge under the app bar

`.page-map` loses the centered 1400px card look. `.map-layout` is `100%` width, `calc(100vh - app-bar)` height. **No fieldset legend “Map”.** Viewport is `#map` only; Leaflet zoom stays default (top-left, shifted down so it does not cover basemap).

> Comment (D2):

### D3 — Overlay controls on the map (GIS pattern)

Four clusters, all `position: absolute` on `#map` (pointer-events on the cluster only):

| Corner | Control | Why |
| --- | --- | --- |
| **Top-left** | Basemap `Map \| Satellite \| Hybrid` (existing segmented control, compact) | Changes how you *see*; stays with zoom |
| **Left, vertical** | Markup: Label, Arrow, Delete (icon or short label, one column) | Drawing tools next to the canvas, like a graphics app |
| **Top-right** | View: **Home** + `details` **View ▾** (Set home, Save preset, preset select, Delete preset) | Home is one click; the rest is rare |
| **Bottom-center** | `#mapViewHint` only while a mode is armed | Does not steal height when idle |

Print / Brief **leave the map**. They are not drawing tools.

> Comment (D3):

### D4 — App bar action slot owns Brief + Print

Map is the first page where the empty slot earns its keep:

- Secondary **Brief view**
- Primary **Print brief**

File keeps Print brief (disk/print) if you want it twice; **remove** the two big buttons from the map toolbar.

> Comment (D4):

### D5 — One dock, one list of layers (merge checkbox + tab)

Right dock `~20rem`, collapsible to a **12px grab** (reuse `is-targets-collapsed`). No “Locations” fieldset legend eating a row — use a slim title **Layers** or none.

Each layer is **one row**:

```
[👁] [icon] Active targets     12
[👁] [icon] Arrests             4
[👁] [icon] Officer homes       8
[👁] [icon] Origin / finds      3
[👁]        Markup              2
```

- Eye = visibility (today’s checkbox).
- Click the **name** = that list fills the table below (today’s tab).
- Click the **icon** (when the palette has a pick) = assign category default.
- Count = rows in that catalog.

Selecting a layer that is off **turns it on** (so the list you are reading is on the map).

Table stays below, full remaining dock height. Icon library moves into `<details>` **Icons** at the bottom, closed by default.

> Comment (D5):

### D6 — Collapse the dock without losing the map

Collapsed: map is 100% wide; a vertical **Layers** tab on the right edge reopens. Same as today’s collapse, but the control is on the map edge, not a fieldset chevron.

> Comment (D6):

### D7 — Brief mode is the same layout with overlays hidden

Brief = hide app-bar **nav/actions** (keep a thin exit), hide dock, hide overlay tools, show legend. Do not invent a second map. Print uses that mode.

> Comment (D7):

---

## 4. Control inventory (what moves)

| Control | Today | Proposed |
| --- | --- | --- |
| Basemap | Toolbar row 1 | Overlay top-left on map |
| Label / Arrow / Delete | Toolbar row 1 | Overlay left rail |
| Brief view | Toolbar | App bar secondary |
| Print brief | Toolbar + File | App bar primary (+ File optional) |
| Home | Toolbar row 2 | Overlay top-right, always visible |
| Set home / presets / delete | Toolbar row 2 | Overlay **View ▾** |
| Layer on/off | 5 checkboxes | Eye on layer row |
| Which list | 5 tabs | Click layer name |
| Icon palette | Always open | `<details>` closed |
| Hint | Between toolbar and map | Overlay bottom, only when armed |
| Page h1 | Always | Gone |

> Comment (inventory):

---

## 5. Mobile (&lt;900px)

- Map still first: full width, `50vh` min.
- Dock **under** the map (not a skinny column).
- Left rail becomes a **horizontal** chip row under basemap (Label / Arrow / Delete).
- View ▾ stays top-right overlay.
- Brief still full-bleed.

> Comment (mobile):

---

## 6. What we do not do

- Do not put layer toggles in the app bar (that slot is Brief/Print).
- Do not add a second floating inspector.
- Do not auto-open the icon library.
- Do not keep the wrapping toolbar *and* the overlays (pick one; this plan is overlays).
- Do not change map data rules (layers, owners, markup storage).

> Comment (non-goals):

---

## 7. Build

One layout PR after you comment (no data-model change):

**Files:** `map.html`, `style/style.css`, `functions/app-bar.js` (Map actions), `functions/map-targets.js` (layer rows instead of checkbox+tab), `functions/map-markup.js` (tool rail classes), [chrome.md](chrome.md) Map action slot, [taxonomy.md](taxonomy.md) Map CSS slots.

> Comment (build):

---

## 8. Open questions

### Q1 — Print brief in the app bar, File, or both?

- [x] App bar primary **and** File (recommended — slot is empty; File is the print/PDF home)
- [ ] App bar only
- [ ] File only
- [ ] Other:

> Comment (Q1):

### Q2 — Markup tools: icons only or icon+word?

- [x] Icon + short word (Label / Arrow / Del) (recommended)
- [ ] Icon only (more map, worse discoverability)
- [ ] Other:

> Comment (Q2):

### Q3 — Default dock open or collapsed?

- [x] Open on desktop, collapsed on mobile (recommended)
- [ ] Always open
- [ ] Always collapsed; map first
- [ ] Other:

> Comment (Q3):
