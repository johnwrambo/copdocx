# Operations — implementation plan (proposed)

**Status:** Approved for build. PR-A–E shipped through **0.66.0**.  
**Comment (brief):** the issued packet is an **operation sheet** that **nests Target sheets** — one Target-sheet block per target inside `operation-brief.html`.

How to comment: under any **D#**, **PR#**, or **Q#**, add:

> Comment: …

Canonical rules this plan must not contradict: [taxonomy.md](taxonomy.md) (list/view/form), [records.md](records.md) (draft/commit), [data-models.md](data-models.md) (stores stay split). If you change a decision here, update those files in the same change.

---

## 1. Naming: Planning vs Operations

They are **one record**, two phases of work — not two products.

| Word | What it is | In the product |
| --- | --- | --- |
| **Operation** | A targeted, planned law-enforcement action (the thing you name, staff, and brief) | Record type. Tab **Operations**. Files `operations.html` / `operation.html` / `operation-form.html` |
| **Planning** | The work you do *on* that operation before H-hour: pick targets, staff teams, drop pins, set heading | The **form** (draft). Map + assignments live here |
| **Order** | The issued product: map + assignments + per-officer instructions | The **view** after Save/commit (`operation.html`) |
| **Brief / operation sheet** | Officer pocket look: expanded Target sheet that nests one Target sheet per target | `operation-brief.html?id=` (new window, like Target sheet) |

**Do not** create a separate Plan record. Draft operation = planning. Commit = issue the operational order (locks the snapshot used for the brief). Later you may *execute* it (link Encounter(s)); that is not a second triad.

**Map.html** stays the unowned scratch board (layers, markup, brief). An operation **owns** its own map overlay. Planning on an operation does not dump pins onto the global map unless you open that operation.

**Encounter** is after contact (what happened, I-213). **Operation** is before contact (what we intend). Optional later: committed operation → spawn/link encounter(s). Do not merge the two models.

> Comment (naming):

---

## 2. Goal

Supervisor builds an operation by importing **targets** (from committed leads) and **fugitive operations teams** (from the officer roster). They assign 2–4 officer teams to targets, drop each officer’s start pin and heading on the map, set rally/cleanup and medevac, and see quals / roster roles / vehicles for situational awareness.

When **date/time** is set, the form reads the **schedule** and other committed operations and shows who is available vs already tasked.

**End state:** generated operational order + static map (icons, filters, headings, rally, medevac, optional arrows/labels) + a card of instructions per officer.

---

## 3. Pages (same template as leads / officers)

| Kind | File | `data-page` | Query |
| --- | --- | --- | --- |
| List | `operations.html` | `operations` | — |
| View (issued order) | `operation.html` | `operation` | `?id=` |
| Form (planning) | `operation-form.html` | `operation-form` | none = add; `?id=` = edit |
| Pocket brief | `operation-brief.html` | `operation-brief` | `?id=` (new window) |

Chrome tab **Operations** after Encounters. List primary **Add operation**. View: **Edit**, **Generate brief**. Brief: **Print**, **Save brief**, **Back**. Form: **Save** (commit), **Back**. Quiet draft on form change (does not write on Add until name or dates exist).

Draft row → form. Committed row → view.

> Comment (pages / chrome):

---

## 4. Decisions

### D1 — One record, two phases

Planning = draft form. Issued order = committed view. No `plans.html`.

> Comment (D1):

### D2 — Store with encounters, not a fourth key

`copdocx.store.v1.operations{}` next to `leads{}` / `encounters{}`. Cross-store **read** of admin roster + shifts. **Write** only `saveOperation`. Do not mutate `officer.duty` when assigning (see D8).

> Comment (D2):

### D11 — Operation sheet nests Target sheets

The officer packet is a **more expanded Target sheet**: one operation sheet with a nested Target-sheet block per target (photo, places, vehicles, assigned cell). Not a per-officer page in v1. `operation-brief.html?id=` in a new window. Read-only. Print / Save HTML.

> Comment (D11): nested Target sheets.

### D3 — Targets are imported pointers, not copies of the person

Each target: `{ targetId, leadId, personId, priority }`. Locations **read** from the lead at plan time and again when painting the map (committed lead snapshot). If the lead’s target addresses change before commit, the operation map updates on refresh. After commit, freeze a **location snapshot** on the operation so the issued order does not drift.

> Comment (D3):

### D4 — Teams are 2–4 officers with *assignment* roles

Assignment roles (this operation only), not roster `role` (tl / atl / tac-med / language):

| Code | Label |
| --- | --- |
| `eye` | Primary surveillance (eye) |
| `contact` | Primary contact |
| `primary-backup` | Primary backup |
| `backup` | Backup |

Roster role + quals + vehicle stay **displays** for SA. Hard warn (not silent skip) if a team has &lt;2 or &gt;4 members.

> Comment (D4):

### D5 — Officer start pin: select officer → drag/drop → commit

Map on the form. Select an assigned officer in the roster strip. Next map click (or drag of their pin) sets a pending start. **Commit location** writes `{ lat, lng }` on that member. Heading: compass degrees 0–359 or a drag handle on the pin (sector/scans as short text).

> Comment (D5):

### D6 — Rally, cleanup, medevac are operation locations

Reuse `createLocation` plus `opAssociation`: `rally` | `cleanup` | `medevac` | `hospital` | `landmark`. Medevac **route** is an ordered list of lat/lng (same line/arrow markup as the map). Hospitals/landmarks are optional pins with a label (no live Places API in v1 — operator drops the pin and names it).

> Comment (D6):

### D7 — Date/time drives availability (the “planning” half)

`plannedStart` / `plannedEnd`. Available = committed officer, `duty` is `available` or `in-field`, has a **shift** overlapping that window (if the team uses the schedule), and is **not** already on another **committed** operation that overlaps. Show unavailable officers greyed with reason (`leave`, `shift`, `OP DAL3-…`). Do not auto-change `duty`.

> Comment (D7):

### D8 — Do not write the admin roster on assign

Assigning an officer to an operation does not set `duty: "in-field"` or steal their vehicle. SA **reads** roster + fleet. Optional later: “lock shift” write. Not v1.

> Comment (D8):

### D9 — Generated order is derived, then frozen on commit

**Generate order** (form, anytime) builds text + map from current assignments. Commit stores `order { generatedAt, narrative, officerBriefs[] }` on the operation. View prints that freeze. Regenerating on a committed op is Edit → draft (normal demote).

> Comment (D9):

### D10 — Map filters on the order view

Same layer idea as `map.html`: show/hide target (primary/secondary/work/vehicle/origin), officer starts + heading, rally/cleanup, medevac/route, hospitals/landmarks, markup. Defaults: targets + officer starts + rally + medevac on.

> Comment (D10):

---

## 5. Model (`createOperation`)

`functions/model/operation.js`. `entityType: "OPERATION"`. `schema: "copdocx.operation.v1"`. `operationId` mint on Add (`newId("op")` or `DAL{team}-OP-{YYYYMMDD}-{seq}` — pick in Q2).

```
name, operationNumber
plannedStart, plannedEnd          ISO
importedTeamKeys[]                officer.team strings pulled in
targets[]
  targetId, leadId, personId, priority
  locationFreeze[]                filled on commit (street, city, lat, lng, association, targetPriority)
teams[]
  teamId, name, vehicleId
  members[]
    officerId
    assignmentRole                eye | contact | primary-backup | backup
    start                         { latitude, longitude } | null
    heading                       0–359 | ""
    sector, scans, notes
targetAssignments[]               { targetId, teamId }
opLocations[]                     createLocation + opAssociation
medevacRoute[]                    { latitude, longitude }
markup                            { labels[], arrows[] }  // same shape as map-markup
mapLayers                         { visible: { … } }
order                             { generatedAt, narrative, officerBriefs[] } | null
meta                              draft | committed
```

`saveOperation` / `getOperation` / `listOperations` on `store.js` beside encounters.

> Comment (model):

---

## 6. Form flow (planning)

1. **Add operation** → mint id, draft save, `operation-form.html?id=`.
2. Name + **planned start/end**. Availability list updates.
3. **Import targets** — picker of committed leads that have at least one `targetPriority` location. Multi-select. Map plots those pins (primary/secondary/vehicle/work/origin using existing associations).
4. **Import teams** — group committed officers by `officer.team` (e.g. `DAL - 3 / Street`). Supervisor picks one or more groups; can split/merge into 2–4 person teams and assign a fleet vehicle.
5. For each team: assign **assignment roles**; drag **start pin**; set **heading / sector / scans**.
6. Assign team → target (one team per target in v1; Q3 if not).
7. Drop **rally / cleanup / medevac**; optional route; optional hospital/landmark pins; optional arrows/labels (reuse map markup tools).
8. SA strip: for each assigned officer — quals, roster role, duty, vehicle, start pin set?, heading set?.
9. **Generate order** (preview). **Save** commits, freezes locations, stores `order`, goes to view.

> Comment (form flow):

---

## 7. View (issued order)

Snapshot header: name, number, window, target count, team count.

- **Order narrative** (generated)
- **Map** (frozen locations + officer starts + heading chevrons + rally/medevac + markup). Layer toggles.
- **Per-officer cards:** role, primary/secondary responsibility (from assignment role + team/target), start, heading, sector/scans, vehicle, team, target name/address.
- **Print order** — narrative + map + officer cards (print CSS / browser PDF). File: Print order, Export JSON (operation metadata, no media blobs).

> Comment (view):

---

## 8. Generated text (v1 template)

Operation narrative (supervisor-facing), then one brief per officer. Tokens from assignments, not a second narrative engine.

**Officer brief includes:**

- Operation name / number / date-time
- Team name + vehicle
- **Role** (eye / contact / primary-backup / backup)
- **Primary responsibility** (one line from role + assigned target)
- **Secondary responsibility** (the rest of the team’s job — e.g. eye’s secondary = call contact if compromised)
- Target identifier + primary address (from freeze)
- Your start (grid/address if reverse-geocode later; v1 lat/lng + heading)
- Sector / scans
- Rally / cleanup
- Medevac point
- Radio / call signs of the other three (from roster)

v1: fixed prose templates in `data/operations/` (like narrative sections, much smaller). Do **not** hijack Build 9 / I-213.

> Comment (generated text):

---

## 9. Map on the operation (vs `map.html`)

Reuse Leaflet stack (`map.js` basemap, `map-markup.js` tools, icon library). Difference: overlay **state is on the operation**, not `copdocx.map.markup.v1`.

| Layer | Source |
| --- | --- |
| Target pins | imported lead locations (then freeze) |
| Officer start + heading | `members[].start` / `heading` |
| Rally / cleanup | `opLocations` |
| Medevac + route | location + `medevacRoute` |
| Hospitals / landmarks | `opLocations` |
| Markup | `operation.markup` |

Icon defaults: target = Crosshair, officer start = Users/MapPinned, rally = Flag-equivalent (Star), medevac = Plus/cross, hospital = Plus. Supervisor can assign from the same icon library as `map.html`.

Drag/drop: selecting an officer arms “place start”; map click or pin drag; **Commit location** button (or pin popup Commit) so a stray click does not move everyone.

> Comment (map):

---

## 10. Situational awareness strip

Read-only from admin + assignment:

| Column | Source |
| --- | --- |
| Name / badge / call sign | officer |
| Assignment role | member |
| Roster role | officer.role (TL / ATL / Tac-Med / Language) |
| Quals | officer.qualifications |
| Duty | officer.duty |
| Available? | D7 |
| Vehicle | team.vehicleId → fleet row (caged, gun-box, …) |
| Start / heading | member (set / missing) |

Missing start or heading = amber on the strip until filled.

> Comment (SA):

---

## 11. What this is not

- Not Encounter (no I-213, no book-in subjects on the op itself)
- Not a second officer roster
- Not mutating `copdoc.admin.v1` on assign
- Not Map.html taking over as the operation form
- Not live AVL / GPS tracking
- Not auto hospital lookup
- Not merging book-in or media stores

> Comment (non-goals):

---

## 12. Implementation slices

Stamps after current 0.16–0.17 work. First Operations PR **0.18.0** if map-layers already shipped; otherwise next free minor.

### PR-A — Skeleton triad + store (**0.62.0**)

`functions/model/operation.js`; `store.js` `operations{}`; `operations.html` list; `operation.html` empty snapshot; `operation-form.html` name + dates + Save/autosave; chrome tab; `scripts/test-operation.js`.

> Comment (PR-A):

### PR-B — Import targets + plot (**0.63.0**)

Target picker from committed leads with a current place or vehicle. Form + issued view map plots those pins. Live-read while planning; freeze places and vehicles on commit.

> Comment (PR-B):

### PR-C — Import teams, roles, availability (**0.64.0**)

Import by `officer.team`. 2–4 members. Assignment roles. Date window greys unavailable (shifts + overlapping committed ops). SA strip quals/roles/vehicles. Vehicle pick from committed fleet. One cell per target.

> Comment (PR-C):

### PR-D — Pins, heading, rally, medevac (**0.65.0**)

Select officer name → map click → **Commit start**. Heading 0–359, sector/scans. Rally / cleanup / medevac / hospital / landmark pins. Medevac route points. Overlay state on the operation, not `copdocx.map.*`.

> Comment (PR-D):

### PR-E — Generate order + nested Target sheets (**0.66.0**)

Commit stores `order { generatedAt, narrative, officerBriefs[] }`. **Generate brief** opens `operation-brief.html?id=` — operation sheet nesting one Target-sheet block per target (photo, places, vehicles, assigned cell) plus officer cards. Print / Save HTML.

> Comment (PR-E):

### PR-F — Optional later

Link committed operation → new Encounter. Push availability onto schedule UI. Transfer JSON includes operations (metadata; map coords; no media blobs).

> Comment (PR-F):

---

## 13. Open questions

### Q1 — Tab label?

- [x] **Operations** (recommended) — planning is the form, not the tab
- [ ] Planning
- [ ] Plans
- [ ] Other:

> Comment (Q1):

### Q2 — Operation number format?

- [x] `DAL{team}-OP-{YYYYMMDD}-{seq}` (like encounter IDs)
- [ ] Free text + optional auto stamp
- [ ] Other:

> Comment (Q2):

### Q3 — One team per target in v1?

- [x] Yes (recommended)
- [ ] Many teams per target
- [ ] Other:

> Comment (Q3):

### Q4 — Must an officer have a shift that day to be “available”?

- [ ] Yes — no shift = unavailable
- [x] Shift if one exists; if no shifts that week, duty status only (recommended)
- [ ] Other:

> Comment (Q4):

### Q5 — Commit location: extra button vs pin popup vs first drop sticks?

- [x] Pin popup **Commit** after drag (recommended — matches “commit location”)
- [ ] First drop is final; drag to adjust
- [ ] Other:

> Comment (Q5):

### Q6 — Eye’s “secondary responsibility” prose?

- [x] Fixed template per role (recommended for v1)
- [ ] Supervisor free-text per officer
- [ ] Both (template + override)
- [ ] Other:

> Comment (Q6):
