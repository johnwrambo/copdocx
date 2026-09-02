# Investigation wall — target UX

**Status:** Draft built **0.37.0**. Windows drawer (**D12**) shipped **0.52.0**.  
**0.37.0 is a sketch:** pan/zoom, click-to-place identity cards, drag-move, drag-connect, promote onto the wall, spawn copies `x,y`. Keep that motion. Tighten it for LE.

How to comment: under any **D#**, **PR#**, or **Q#**:

> Comment: …

Canonical rules: vanilla HTML/JS/CSS; stores stay split; **Open as case** is identity-only (same `personId`, no RAP, no wall dump); do not merge book-in. If a decision here changes behavior, update [taxonomy.md](taxonomy.md), [records.md](records.md), [data-models.md](data-models.md), [chrome.md](chrome.md) in the same PR.

---

## 1. Job, not a mind-map clone

An investigator is not brainstorming. They are building a **web of facts that can become probable cause**.

Typical plate-check:

1. Paste 80 plates from a lot.
2. Discard junk. Mark hits.
3. A hit becomes a **vehicle** on the wall.
4. Title print → **person** (registered owner). Thirty other cars on that RO are not all targets.
5. RO **shares a residence** with someone we already care about → that address is a **location** node, one place, many people.
6. Target’s car later parks somewhere else → another location, more links.
7. That cluster is interesting enough to be its own job → **Spawn** a child investigation. Same object ids. Overlapping Venn. Not a copy of the plate list.

The wall is where that thinking happens **before** anyone is a Case. A case is a person file. An investigation is a web.

> Comment (job):

---

## 2. What we borrow (and what we refuse)

Popular mind-map tools (MindNode, XMind, TheBrain, Obsidian Canvas, Miro) solved *capture on a wall*. Steal the mechanics. Do not steal the data model.

| Borrow | From | LE meaning |
| --- | --- | --- |
| Infinite canvas, pan empty space, zoom | MindNode, Canvas, Miro | The lot / the web is the page. No scrolling form. |
| Title-first nodes; extra text tucked away | MindNode notes, XMind | Plate / name / street is the node. Make, VIN, DOB stay one click in, not always-on. |
| Capture inbox → map | MindNode quick entry, Miro frames | Plate queue is the inbox. Promote *drops onto the wall*. Discard never leaves the dock. |
| Keyboard: add next to the thing you’re looking at | MindNode Tab/Enter child/sibling | From a focused vehicle, one key mints an RO person (or parking location) already linked. Mouse still works. |
| Cross-links that are not parent/child | MindNode “connections”, TheBrain jumps | A6 typed edges: RO, operator, residence, parking. Unlabeled lines are useless in court. |
| Focus / plex: this thought + neighbors | TheBrain | Select a person: dim the rest, keep one-hop bright. 30 RO cars stay on the wall without drowning the target. |
| Groups / hulls | Canvas groups, Miro frames | Visual cluster around a residence or a spawn child. Not a second store. |
| Same thought in more than one map | TheBrain, Canvas embeds | Spawn / overlap: same `vehicleId` / `personId` on two walls. Never clone the person. |
| Outline sidecar | MindNode outline | Optional list of objects on this investigation (search, jump, filter hits). Not the primary UI. **0.44.0:** Find box + Hits (plate-check). Does not hide wall chips. |

| Refuse | Why |
| --- | --- |
| Radiant **tree** as the model | LE webs are graphs. One residence has many people and cars. A tree lies. |
| Auto-layout that rearranges after you placed | The officer put that car next to that house on purpose. |
| Fold/unfold as the only way to hide clutter | Use focus-plex + compact titles, not disappearing evidence. |
| Untyped lines | “Linked” is not an association. Edge label is the A6 reason. |
| Sticky-note brainstorming | Nodes are real `people{}` / `vehicles{}` / `locations{}`. |

0.37.0 already has canvas + typed connect + promote-to-wall + spawn-overlap. It is still a **form-card collage**: every node is a full identity fieldset. That is the main thing to refine.

> Comment (borrow/refuse):

---

## 3. LE loop (the workflow we are optimizing)

One sitting, one investigation. Chrome stays **Save / Back / Import plates / Spawn**. Wall tools stay on the glass.

```
INGEST          TRIAGE         MATERIALIZE      ATTRIBUTE         ASSOCIATE         PEEL OFF
plate paste  →  discard/hit →  Promote/place →  title on node  →  drag typed edge →  Spawn child
referral        (dock)         onto wall        (plate, name,      RO / parking /     same object ids
elite                                              street)            residence          new wall
```

**Ingest** lives in the dock (plates) or a first click (other kinds). It is not the wall.

**Triage** never mints objects. Discarded plates stay in the queue.

**Materialize** is the only way a vehicle/person/location appears. Promote a hit, or click the wall, or keyboard-add from a focused node. Plate-check default type is **vehicle**.

**Attribute** is the node title plus an inspector that is *not* the wall. Type the plate on the vehicle; reuse if that plate already exists. Type “Garcia, Luis” on a person; reuse if that person exists. Do not require a separate search strip.

**Associate** is drag-handle (or keyboard-add already linked). Reason defaults: vehicle↔person = registered owner; vehicle↔location = parking; person↔location = current residence. Change the reason on the edge. Disconnect is allowed. Never infer a link from similar names.

**Peel off** is Spawn: focused object + one-hop onto a child wall. Parent plate queue stays put. Child can be a different kind (often `discovered`). Officer keeps working the parent lot *and* the target web.

Filing a **Case** is a peel-off from a focused **person**, not from the wall as a whole. Chrome **Open as case** mints (or reuses) a working lead for that `personId`. Identity only. The wall stays an investigation; it does not become `leads{}`.

> Comment (loop):

---

## 4. Decisions

**D1 — Wall is the workspace.**  
Thin header (id, team, kind, title, parent/children). Empty wall is valid. No stacked *case-form* inspector, no Add strip. Control chrome is **Windows** (D12): Plates, Objects, and Object card are separate panels you show or hide. They do not share one rail. The canvas is the page.

**D11 — Same object, same identity card.**  
Every wall node is `createPerson` / `createVehicle` / `createLocation` in `people{}` / `vehicles{}` / `locations{}`. Field names match the case/vehicle/location cards (`data-field="licensePlate"` etc.), including the photo/file row (`ownerType` + `id` into `copdocx.media.v1`) and location address (`street` / `street2` / city / state / ZIP). The wall does not invent a parallel schema. Compact title is a collapsed view of that same card. When a photo is attached to the object, that photo **is** the wall card, with the label on it. Nested occupancy / RAP / Add location stay off the wall because those are other nodes or a Case — not because the object is different.

**D2 — Nodes are compact facts, not case forms.**  
On the wall you see a **title chip**:

| Type | Title |
| --- | --- |
| Vehicle | `TX HELLO1` (or “Vehicle” if no plate yet) |
| Person | `Garcia, Luis` (or “Person”) |
| Location | `100 Main St, Dallas` (or “Location”) |

Chips stay chips. Identity fields live in the **Object card** window (D12), not under the Objects list. Same card fields as the rest of the app, including **Add photo / Add file** and location address (`street2` too). Vehicle = plate/state/year/color/make/model/body/VIN + RO **name string**; person = last/first/middle; location = street/street2/city/state/ZIP. Not occupancy, other residents, nested Add location, nested Add link, RAP. Those are other nodes or a Case. If the object has a photo, the wall chip is that photo plus the title label. Click a chip to focus/plex. **Edit** (or double-click) opens the Object card.

**D3 — Layout is per investigation.**  
`nodes[]`: `nodeId`, `objectType`, `objectId`, `x`, `y`. Same vehicle can sit somewhere else on a child wall. No `copdocx.investigation-wall.v1`. No positions on `vehicles{}`.

**D4 — Graph, HTML nodes, SVG edges.**  
Vanilla. Cubic curves. Edge label = A6 reason. No force-directed physics. No tree auto-layout.

**D5 — Gestures (MindNode feel, graph rules).**  
- Empty drag = pan. Wheel / −+ = zoom.  
- Empty click = place current type (default vehicle on plate-check) **if a type is selected**. Click the selected Vehicle / Person / Location / Business / Entity chip again to deselect. With no type selected, empty click does not mint; drag still pans. **Tab** from a focused node opens the Card Associated composer (type-ahead). Does not mint a blank chip.  
- Click chip = focus / plex. Does **not** open the Object card.  
- **Edit** on the chip (or double-click, or Enter when not typing) opens the Object card window for that object.  
- Drag card = move.  
- Drag **dot** = connect; drop on a node; default A6 reason; picker if more than one.  
- Click edge = change reason or disconnect.  
- **Delete** / **Backspace** (not while typing) or inspector **Remove from wall** drops the focused chip from *this* investigation. Shared `people{}` / `vehicles{}` / … stay. Links on this wall go with it. A promoted plate returns to **Hit**. Confirm first.  
- Keyboard (**0.60.0**): from a focused vehicle, **Tab** opens Associated for a person (RO type-ahead); **Shift+Tab** for a location (parking). From a person, Tab = vehicle. Enter in the composer reuses or mints. Does not fire while typing in a field.

**D6 — Promote is “send to wall.”**  
Hit → vehicle object (reuse plate+state) → node in the current view. Focus it. Do not open a form stack.

**D7 — Spawn is “new map from this thought.”**  
Focused node + one-hop, same object ids, new node/link ids, copied `x,y` (slight offset ok). Empty plate queue. Requires focus. No case.

**D8 — Reuse is typing, not a second search UI.**  
Plate, name, or address in the inspector that matches an existing record **becomes that record** (same id). Status line says so. Do not mint a second Garcia, Luis.

**D9 — Focus-plex before hulls.**  
Selecting a node dims non-neighbors. One-hop stays full. That is how you survive an RO with 30 cars. Visual hulls/Venn around a child web come after this works. **Find (0.46.0)** is a second spotlight: matching chips stay full, the rest dim. Nothing is removed from the wall. While Find or Hits is active, Find wins over plex.

**D10 — 0.36.0 inspector card stays dead.**  
Do not put occupancy/nested blocks back on investigation vehicles.

**D12 — Windows drawer (0.52.0).**  
Borrow Illustrator / Photoshop / Figma **Window** palettes, not their data model.

The wall is the canvas. Controls are **windows** you toggle. They overlay the wall (do not permanently steal a column). A compact **Windows** group sits in the wall tools row next to type chips and zoom:

`Plates` · `Objects` · `Card`

Each button is `aria-pressed`. On = that window is open. Off = hidden. Independent: Objects can be open with Card closed, Card open with Objects closed, both, or neither.

| Window | Job | Open by | Contains |
| --- | --- | --- | --- |
| **Plates** | Inbox. Triage only. | Windows → Plates. Kind `tag` defaults open. Other kinds: button hidden. | Paste, import, queue, Hit / Discard / Promote. Same as today’s dock. |
| **Objects** | Directory. Search and jump. | Windows → Objects. Default closed. | Find, Hits, list, All (clear plex). Click a row focuses the chip. **Edit** on the row opens Card. |
| **Card** | Identity of **one** object. Same Person/Vehicle/Location/Business/Entity card (photo, address fields). | **Edit** / double-click / Enter on a focused chip or Objects row. Windows → Card (needs a focused object). | Title, identity fields, Add photo/file, **Remove from wall**. Close hides the window; focus stays. |

**Not a modal.** Card does not trap the wall. You can pan, connect, and place while Card is open. Close with the window’s ×, Windows → Card off, or Esc (when not typing in a field).

**Click vs Edit.** Click = select / plex. Edit / double-click / Enter = open Card. Place-then-type still works: placing a new object **opens Card** and focuses the first field (plate / last name / street). Selecting an existing chip does not. Promote focuses the vehicle and does not open Card.

**Layout.** Each window is a positioned overlay (`position: absolute` on the wall). Plates default left, Objects default right, Card default center-right (or over the focused chip). Title bar: name + Hide. **0.61.0** drag the title bar; x/y remembered in the same session key. Not draggable under 640px (stacked defaults).

**State.** Which windows are open is **session UI**, not object data. `sessionStorage` key `copdocx.investigation-windows.v1` `{ plates, objects, card, pos: { plates, objects, card } }` (`pos` values `{x,y}` or null). Do not put panel positions on `investigations{}` or `vehicles{}`. Do not mint `copdocx.investigation-wall.v1` for layout of nodes (D3 still holds).

**Chrome stays Save / Back / Import plates / Spawn / Open as case / Clear all.** Windows are overlays, same rule as map drawing tools. Import plates still focuses the Plates window (opens it if closed).

> Comment (D1–D12):

---

## 5. Picture

```
┌ app bar  Save  Back  Import plates  Spawn  Open as case  Clear all ┐
├ INV3-…  Plate check  Title  Spawned from INV…                      ┤
├────────────────────────────────────────────────────────────────────┤
│  [Vehicle Person Location …]  Windows: Plates Objects Card   − +   │
│                                                                    │
│     (dim)  [veh]~~~~[GARCIA]          ┌ Objects ──────── × ┐       │
│               |                       │ Find               │       │
│            [100 MAIN]                 │ Hits  All          │       │
│               |                       │ veh   GARCIA  Edit │       │
│            [veh] [veh] …              └────────────────────┘       │
│                                                                    │
│  ┌ Card GARCIA, Luis ──────── × ┐                                  │
│  │ photo  Last  First  Middle   │   (only after Edit)              │
│  │ Remove from wall             │                                  │
│  └──────────────────────────────┘                                  │
└────────────────────────────────────────────────────────────────────┘
```

The wall is full width. Plates / Objects / Card are windows you toggle. Click a chip to focus. Edit opens Card. Objects is a directory, not a form.

> Comment (picture):

> Comment (picture):

---

## 6. What we will not do

- No D3 / cytoscape / vis.js / MindNode clone library.
- No canvas-drawn text inputs (nodes stay HTML).
- No auto-layout that yanks placed cards.
- No unlabeled edges.
- No cloning people/vehicles on spawn.
- No dumping the wall graph into `leads{}` (**Open as case** is identity-only for a focused PERSON).
- No deleting `people{}` / `vehicles{}` / `locations{}` / `businesses{}` / `entities{}` from the wall. Remove is this investigation’s node + links only.
- BUSINESS / custom ENTITY shipped **0.40.0** (same card/object rule).
- No +Person / +Vehicle / +Location in chrome.
- No gluing the Object card under the Objects list (0.43.0 rail is the thing this revises).
- No modal that blocks pan/connect.
- No panel-position store on people/vehicles.
- Do not merge book-in. Do not rewrite PDF.

> Comment (won’t):

---

## 7. Built vs next

| # | Title | Stamp | Notes |
| --- | --- | --- | --- |
| 46–50 | Store + spawn | 0.33.0–0.35.0 | INV ids, plate queue, `vehicles{}` / `locations{}`, `addInvestigationObject`, spawn. Keep. |
| 51 | ~~Inspector vehicle card~~ | 0.36.0 | Dead end. |
| 51w | Wall sketch | **0.37.0** | Pan/zoom, always-open fieldset cards, drag-move, drag-connect, promote onto wall, spawn copies `x,y`. **Draft.** |
| 56 | Compact nodes + reuse-on-type | 51w | **0.38.0** | Title chip; expand selected; typing plate/name/address reuses. Disconnect / retarget edge. Keyboard Tab from focus. |
| 57 | Focus-plex | 56 | **0.39.0** | Selected + one-hop bright; rest dim. Objects list sidecar. All clears plex. |
| 58 | BUSINESS + ENTITY | 57 | **0.40.0** | Same object/card rule. Chips, A6 links, reuse by name. |
| 59 | Hulls / Venn | 58 | **0.41.0** | Convex hulls on parent/child shared objects. Overlap glow. Tag opens the other wall. |
| 60 | Promote person → case | 59 | **0.42.0** | Chrome **Open as case**: focused PERSON → working lead, same `personId`, identity only. |
| 61 | Slim inspector | 60 | **0.43.0** | Wall chips stay compact. Identity card opens in the Objects-rail inspector. Reuse-on-type and Tab still work. |
| 62 | Outline search | 61 | **0.44.0** | Find box on the Objects list (title, kind, VIN, address). Enter jumps to first match. Hits filters plate-check vehicles. Wall chips stay put. |
| 63 | Deselect place type | 62 | **0.45.0** | Click the selected Vehicle/Person/… chip again to stop placing. Empty click then does not mint. |
| 64 | Find dims the wall | 63 | **0.46.0** | Find / Hits dim non-matching chips (and edges between two misses). Does not hide evidence. Find wins over plex. |
| 65 | Remove from wall | 64 | **0.47.0** | Focused chip: inspector **Remove from wall** or Delete. Drops node + links on this investigation. Shared object stays. Promoted plate → Hit. |
| 66 | Photo chip + card media | 65 | **0.48.0** | Inspector uses the same photo/file row and location address fields. Attached photo becomes the wall card face, with the label. |
| 67 | Object identity audit | 66 | **0.49.0** | Reuse drops abandoned records; retargets every wall. Promote-from-wall keeps RAP on `people{}`. |
| 68 | Clear workspace | 67 | **0.50.0** | Chrome **Clear all**: empty this wall and plate queue. Shared objects and child walls stay. |
| 72 | Junk / delete record | 68 | **0.51.0** | Card: **Remove from wall** (this map), **Junk** (keep record, skip reuse, off every wall), **Delete record** (only if unreferenced). Case subjects cannot be junked or deleted. |
| 69 | Split windows (DOM) | 68 | **0.52.0** | Card is its own overlay, not under Objects. |
| 70 | Windows drawer | 69 | **0.52.0** | Wall-tools **Plates / Objects / Card**. Overlays. Click = focus; Edit / double-click / Enter opens Card. Esc hides Card. |
| 71 | Remember open windows | 70 | **0.52.0** | `sessionStorage` `copdocx.investigation-windows.v1`. No node layout key. |
| 80 | Association factory | 71 | **0.53.0** | `store.associations{}`. Wall edges cite `associationId`. Spawn shares the fact. |
| 81 | A6 catalog | 80 | **0.53.0** | `CUSTOMER_OF`. Canonical ends from the matrix. |
| 75 | Card composer (people) | 81 | **0.54.0** | Associated people on the Card. Type a name, Enter, reuse or mint, spawn, edge, relationship. × drops the wall citation. Off-wall rows get Place on wall. |
| 78 | Card composer (all types) | 75 | **0.55.0** | Kind select on Associated. Plate / street / name Enter. Same reuse, spawn, ×, Place on wall. |
| 76 | Dual-write nested case views | 78 | **0.56.0** | Case snapshot gets associated locations/vehicles. No RAP. No wall-graph dump. |
| 77 | Case Associations consume associations | 76 | **0.57.0** | Case tile lists `associations{}`. Slide-over uses `associateCaseObject`. |
| 79 | Case Associations live composer | 77 | **0.58.0** | Case tile: type a name / plate / street, Enter. Same constructor as the Card. × drops the fact. |
| 82 | Occupancy on the association | 79 | **0.59.0** | Occupancy dates live on the association. Nested case copies are dual-written. |
| 83 | Tab type-ahead | 82 | **0.60.0** | Tab / Shift+Tab open the Card Associated composer. Do not mint a blank chip. |
| 84 | Draggable windows | 83 | **0.61.0** | Drag Plates / Objects / Card by the title bar. Remember x/y in `copdocx.investigation-windows.v1`. |

> Comment (PRs):

---

## 8. Open questions

**Q5.** ~~Expand in place vs slim inspector.~~ **0.43.0** put the card in the Objects rail. **D12 / 0.52.0** Card is its own window.  
**Q6.** When Promote drops a vehicle, should it land in a **column next to the last promoted** (lot strip), or always in the view center? (0.38.0 shipped lot strip.)  
**Q7.** ~~Keyboard Tab from a vehicle: always mint a new person, or open a type-ahead that can reuse Garcia?~~ **0.60.0** Tab opens the Associated composer (type-ahead / reuse). Does not mint a blank chip. Click-place and composer Enter still mint when the name/plate/street is empty of a match.  
**Q8.** ~~Fixed overlay vs draggable.~~ **0.52.0** shipped fixed overlays. **0.61.0** drag title bar; remember x/y in the same session key. Narrow screens keep the stacked defaults.  
**Q9.** ~~Objects default closed vs open.~~ **0.52.0** Objects default closed. Plates default open on kind `tag`.

> Comment (Q5–Q7):
