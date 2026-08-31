# Taxonomy

One naming pattern. Officers/vehicles already follow it; every new record type must.

## Record pages (end state)

| Kind | File | `body data-page` | Query |
| --- | --- | --- | --- |
| Collection | `{records}.html` | `{records}` | — |
| View | `{record}.html` | `{record}` | `?id=` |
| Form | `{record}-form.html` | `{record}-form` | none = add; `?id=` = edit |

Always `?id=` in the URL even when the model field is `leadId` / `officerId` / `vehicleId`.

| Type | List | View | Form |
| --- | --- | --- | --- |
| Lead | `leads.html` | `lead.html` | `lead-form.html` |
| Officer | `officers.html` | `officer.html` | `officer-form.html` |
| Vehicle | `vehicles.html` | `vehicle.html` | `vehicle-form.html` |
| Encounter | `encounter.html` | not split yet | `encounter-form.html` |

`index.html` must change **all three**: `http-equiv` refresh, `<link rel="canonical">`, and the fallback `<a>` — to **`home.html`**. The Home tab is the briefing hub; Leads stays the records tab.

Until the lead split ships, the form **stays** at `lead.html` with `data-page="lead-form"` (see Interim). Do not keep the form on `lead.html` after the split.

### Reserved (not this program)

| Type | List | View | Form |
| --- | --- | --- | --- |
| Book-in | `bookins.html` | `bookin.html` | `bookin-form.html` |
| Operation | `operations.html` | `operation.html` | `operation-form.html` |

Encounter list currently lives at `encounter.html` (`data-page="encounter"`), not `encounters.html`. Do not rename until a view split. Encounter subjects use **`bookin.html?encounterId=`** (not `id`) so a future book-in `?id=` does not collide.

Until book-in is split, `bookin.html` is the working form. Prefill uses **`bookin.html?leadId=`** (not `id`) so a future book-in `?id=` does not collide.

### Non-record pages

`home.html` (`data-page="home"`), `admin.html` (`data-page="dashboard"`), `schedule.html`, `map.html`, `narrative.html`, `baseballcard.html`.
`i200-form.html` (`data-page="i200-form"`) and `i205-form.html` (`data-page="i205-form"`) are lead-view issuance forms (`?id=` is the **leadId**). Leads tab stays current. They are not a warrant triad.
`operation.html` is still empty — leave it. `encounter.html` is the 0.11.0 list.

Home is a briefing hub, not a record triad. Action slot empty. Counts and lists are placeholders until a later painter (cross-store **reads** of committed leads, admin roster, book-in). Do not write any store from `home.html`.

Map is a planning board, not a record triad. Action slot empty. The only write is `copdocx.map.views.v1`. File PDF/KMZ/JSON/CSV stay `data-not-built`.

**Map layers (planned, not built).** Three independent toggles on the map toolbar. A location may appear on more than one layer. Discriminator is existing fields — do not add a fourth “layer” field until a gap is proven.

| Toggle | Question | v1 rule | Why it matters |
| --- | --- | --- | --- |
| **Active targets** | Where do we look next? | `createLocation` with `targetPriority` set (`"1"` Primary …). Plot if lat/long exist. | Hit order. Today’s map. |
| **Arrest locations** | Where did custody happen? | `person.arrests[].arrestLocation` (and later a geocoded Location if one is attached). | Outcome, not the hunt. |
| **Past / origin** | Where did we *find* them? | v1: vehicle `association === "plate-check"`. Other find-types TBD (see below). | Intake geography — plate checks and similar — not the jail or the current hide. |

`association` is why we know the place (`residence` / `work` / `registration` / `known-parking` / `plate-check`). `targetPriority` is whether it is an active hit. Arrest is a different object, not a location association. A plate-check can also be ranked; then it is both origin and active.

**Open (do not invent yet):** what else is origin besides plate-check (LE referral scene, encounter location, demoted former targets); arrest rows are a free-text string today with no lat/long; toggles are independent checkboxes (default Active on), not a single-select radio.

`narrative.html` (`data-page="narrative"`) is the Build 9 workspace, not a
Narrative record view or form. No query → synthetic demo fixture. **`?encounterId=`**
loads the live encounter via `encounter-narrative.js` (I-213). Update draft does
not survive reload and does not write any canonical store.

Today the Leads tab label is **Lead** (singular) on a bare `<body>`. End state label: **Leads**.

## `data-page` vs `data-admin-page` (dual-write)

Chrome keys off **`data-page`**. `admin.js` `adminPage()` still reads **`data-admin-page`** (`officer-view` / `vehicle-view` are what `paint()` uses). Dual-write both until `admin.js` is switched (officer-model PR or a tiny follow-up). Do not drop `data-admin-page` in the chrome PR.

| File | `data-page` | `data-admin-page` (until admin.js migrates) |
| --- | --- | --- |
| `lead.html` **until split** | `lead-form` | — (none today; do not invent) |
| `leads.html` | `leads` | — |
| `lead.html` **after split** | `lead` | — |
| `lead-form.html` | `lead-form` | — |
| `officers.html` | `officers` | `officers` |
| `officer.html` | `officer` | **`officer-view`** |
| `officer-form.html` | `officer-form` | `officer-form` |
| `vehicles.html` | `vehicles` | `vehicles` |
| `vehicle.html` | `vehicle` | **`vehicle-view`** |
| `vehicle-form.html` | `vehicle-form` | `vehicle-form` |
| `home.html` | `home` | — |
| `admin.html` | `dashboard` | `dashboard` |
| `schedule.html` | `schedule` | `schedule` |
| `bookin.html` | `bookin` | — |
| `map.html` | `map` | — |
| `narrative.html` | `narrative` | — |
| `baseballcard.html` | `baseballcard` | — |
| `i200-form.html` | `i200-form` | — |
| `i205-form.html` | `i205-form` | — |
| `encounter.html` | `encounter` | — |
| `encounter-form.html` | `encounter-form` | — |

`aria-current="page"`: Home tab for `home`; Leads tab for `leads|lead|lead-form|i200-form|i205-form`; Encounters tab for `encounter|encounter-form`; Admin **summary** for any admin child (`dashboard|officers|officer|officer-form|vehicles|vehicle|vehicle-form|schedule`). `.is-current` is for menu **links**, not buttons.

## Interim: `lead.html` before the triad

- `data-page="lead-form"` so chrome paints **Save**, not Edit/Book-in.
- Primary Save **stays on** `lead.html`. No Cancel (no list/view yet). No Book-in.
- Autosave/commit PR **must** hydrate **only when `?id=` is present** (not `currentLeadId`), `replaceState` after first draft, and keep File New/Open in sync with the URL — [records.md](records.md) Interim.
- After the split: move the form body to `lead-form.html`; `lead.html` becomes the view (`#leadSnapshot` / `#leadMissing`, same idea as `#officerSnapshot` / `#officerMissing`). No `id` → empty state + Back to leads (not a redirect to the form). `lead.html?id=` with `meta.status === "draft"` → redirect to `lead-form.html?id=`.

## Buttons and IDs

**One id on the primary control.** Never alias a second id onto `#appBarPrimaryAction`.

| Role | ID | Label | Element |
| --- | --- | --- | --- |
| File menu | `#fileMenu` | File | `<details>` |
| Page tabs | `#appBarNav` | — | painted `<nav>` |
| Admin dropdown | `#adminMenu` | Admin | `<details>` inside `.app-bar-nav` |
| Action cluster | `#appBarActions` | — | painted |
| Primary **Add** | `#appBarPrimaryAction` | Add {record} | `<a href>` + `data-chrome-action="add"` |
| Primary **Edit** | `#appBarPrimaryAction` | Edit | `<a href>` + `data-chrome-action="edit"` (href includes `?id=`) |
| Primary **Save** | `#appBarPrimaryAction` | Save | `<button type="button">` + `data-chrome-action="save"` |
| Back | `#appBarBack` | Back to {origin} | `<a>` first secondary after Save/Edit/Issue/Generate. Retire `#appBarCancel`. |
| Book-in (lead **view** only) | `#bookInLeadButton` | Book-in | `<a href="bookin.html?leadId=">` |
| Baseball card (book-in) | `#generatebaseballCard` | Baseball card | button `call: openBaseballCard` |
| Baseball Generate | `#appBarPrimaryAction` / `#generatebaseballCard` | Generate | `call: persistBaseballCard` |
| Issue I-200 (lead **view** only) | `#issueI200Button` | Issue I-200 | `<a href="i200-form.html?id=">` |
| Issue I-205 (lead **view** only) | `#issueI205Button` | Issue I-205 | `<a href="i205-form.html?id=">` |
| Issue (I-200 / I-205 form) | `#appBarPrimaryAction` | Issue | button + `data-chrome-action="save"` |
| Download filled warrant PDF | `#downloadWarrantPdfButton` | Download PDF | File-menu button |
| Status | `#appBarStatus` | — | `<p>` |
| Lead follow-up stubs (form only) | `#stubPersonButton`, `#stubVehicleButton`, `#stubLocationButton` | + Person / Vehicle / Location | buttons (`workflow.js`) |
| Follow-ups | `#followUpsToggle` | Follow-ups | button |
| Narrative update (training page) | `#appBarPrimaryAction` | Update draft | button + `data-chrome-action="save"` |
| Narrative supplement | `#addSupplementButton` | Add supplement | button |
| Narrative output audit | `#inspectOutputButton` | Inspect output | button |
| Narrative downloads | `#downloadNarrativeJsonButton`, `#downloadNarrativeTextButton` | Download JSON / text | File-menu buttons |
| Workspace Import | `#fileImportButton` | Import | File-menu button `call: openFileImport` |
| Workspace Export | `#fileExportButton` | Export | File-menu button `call: openFileExport` |
| Add encounter | `#appBarPrimaryAction` | Add encounter | `<a href="encounter-form.html">` |
| Add subjects (encounter form) | `#addEncounterSubjectsButton` | Add subjects | `<a href="bookin.html?encounterId=">` |
| Generate I-213 (encounter form) | `#generateI213Button` | Generate I-213 | button `call: generateEncounterNarrative` |
| Add subject (book-in + `?encounterId=`) | `#addEncounterSubjectButton` | Add subject | button `call: addEncounterSubject` |
| Load from leads (book-in + `?encounterId=`) | `#loadLeadIntoEncounterButton` | Load from leads | button `call: openLoadLeadForEncounter` |
| Map views | `#mapHomeButton`, `#mapSetHomeButton`, `#mapSavePresetButton`, `#mapPresetSelect`, `#mapDeletePresetButton` | Home / Set home / presets | in `.map-toolbar`, not the action slot |
| Map layers (planned) | layer toggles for active / arrest / origin | independent; default Active on | in `.map-toolbar`, not the action slot |
| Map hint | `#mapViewHint` | view-mode status | in `.map-card` |
| Map targets | `#targetsTableBody`, `#targetsEmpty` | ranked locations | `.targets-card` |

Retire `#leadSaveStatus`, `#quickSaveLeadButton`, `#addOfficerButton`, `#addVehicleButton`, `#officerEditLink`, `#vehicleEditLink` in the **chrome PR** (same PR the slot becomes the only visible Save/Edit). Page scripts bind **Save** to `#appBarPrimaryAction[data-chrome-action="save"]`.

List tables: `#{records}Body`, `#{records}Empty`, `#{records}TableWrap`.

## CSS slots

| Slot | Class |
| --- | --- |
| Bar | `.app-bar`, `.app-bar-info`, `.app-bar-navrow` (`style.css` ~114–165) |
| File / Admin menus | `.app-bar-menu`, `.app-bar-menu-list` |
| Tabs | `.app-bar-nav` (~1848) |
| Actions | `.app-bar-actions` (`margin-left: auto`, ~167) |
| Primary / secondary | `.action-button` / `.action-button-secondary` |
| Status | `.app-bar-status` (`.is-ok`) |
| Tables | `.records-table`, `.records-empty`, `.record-actions` |
| Draft badge / chips | `.record-status.record-status-draft`, `.record-filter-chips` |
| Narrative shell / engine scope | `.narrative-*`, `.narrative-engine-host` |
| Home briefing hub | `.page-home`, `.home-modules`, `.home-module`, `.home-split` |
| Map planning board | `.page-map`, `.map-layout`, `.map-card`, `.map-toolbar`, `.targets-card` |

Do not add per-page stylesheets unless print/PDF requires it.

## Directories

| Path | What belongs |
| --- | --- |
| repo root | HTML pages (lowercase, hyphenated form suffix) |
| `functions/` | Page/behavior JS |
| `functions/model/` | Factories, store, collect/hydrate, `util.js`, `autosave.js` — **singular** names |
| `functions/leads.js` | Lead list + view painter (after split) |
| `functions/app-bar.js` | `COPDoc.chrome` + menus + status |
| `functions/transfer.js` | File Import / Export dialogs; reads the three stores directly |
| `functions/pdf/` | Warrant field maps + unflattened pdf-lib fill |
| `functions/warrant-issue.js` | I-200 / I-205 form controller |
| `functions/narratives/` | Narrative engine, packet projection, Build 9 domain, page controller |
| `style/style.css` | The stylesheet |
| `data/` | Catalogs and static option/prose libraries only |
| `data/narratives/` | Narrative option/prose libraries and synthetic acceptance fixtures |
| `docs/app-structure/` | These rules |
| `scripts/` | Node tests |

`schema.js` stays a pointer stub. Do not invent `addlead.html` or `{record}-view.html`.

## Script order

**`functions/model/util.js`** (extract in the save-shape PR): `assign`, `nowIso`, `newId`. `lead.js` and `officer.js` call these. Admin pages must **not** load `createLead` just to get helpers.

**Home** (`home.html`):

```
app-bar.js → transfer.js → date.js → assets/icons/copdoc-icons.js → functions/home.js
```

Do **not** load `store.js`, `admin.js`, `collect.js`, `hydrate.js`, `workflow.js`, or `cards.js`. Skeleton does not write storage. A later painter may **read** committed leads / roster / book-in.

**Map** (`map.html`):

```
app-bar.js → date.js
→ model/util.js → model/person.js → model/store.js
→ Leaflet (CDN) → map-views.js → map.js → map-targets.js
```

Do **not** load `cards.js`, `collect.js`, `hydrate.js`, `admin.js`, or `workflow.js`. Cross-store **read** of leads for ranked locations. The only write is `copdocx.map.views.v1` (home view / presets). File PDF/KMZ/JSON/CSV stay `data-not-built`. Empty action slot.

**Admin pages** (officer/vehicle/dashboard/schedule/list/view):

```
app-bar.js → date.js
→ (officer-form: names.js, address.js, phone.js, cards.js)
→ (vehicle-form: data/us-places.js, data/vehicles.js, functions/vehicles.js, cards.js)
→ model/util.js → model/location.js → model/vehicle.js → model/officer.js → model/autosave.js
→ admin.js
```

Load `officer.js` only once it exists (officer-model PR). Load `autosave.js` from the save-shape PR. Until then admin keeps today’s stack plus `data-page`.

**Lead form** (`lead.html` until split, then `lead-form.html`):

```
app-bar.js → date.js → catalogs / cards helpers
→ model/util.js → lead.js → person.js → location.js → vehicle.js → link.js
→ store.js → collect.js → hydrate.js → autosave.js
→ cards.js → workflow.js → ui.js → lead-csv.js
```

**Lead view / list** (after split): `app-bar.js`, `date.js`, `util.js`, `lead.js`, `person.js`, `location.js`, `store.js`, `leads.js`. **Do not** load `workflow.js`, `ui.js`, `baseballcard.js`, or `collect.js` on the view.

**Baseball card** (`baseballcard.html`):

```
app-bar.js → date.js → alien-number.js
→ data/countries.js → data/immigration.js
→ model/util.js → model/lead.js → model/person.js → model/store.js
→ baseballcard.js → baseball-page.js
```

Do **not** load `book-in.js`, `cards.js`, `collect.js`, or `workflow.js`.

**I-200 / I-205 form:**

```
app-bar.js → date.js → alien-number.js
→ model/util.js → model/lead.js → model/person.js → model/store.js
→ pdf/i200-map.js → pdf/i205-map.js → pdf/fill-warrant.js
→ warrant-issue.js
```

Do **not** load `admin.js`, `cards.js`, `collect.js`, `hydrate.js`, or `workflow.js`. Officers are read from `copdoc.admin.v1` (committed only).

**Book-in** (prefill PR; `getLead` / `subjectOf` / `formatPersonLabel`):

```
app-bar.js → date.js → existing book-in catalogs
→ model/util.js → model/lead.js → model/person.js → model/store.js
→ book-in.js
```

Do **not** load `officer.js`, `autosave.js`, `collect.js`, or `createLead` beyond `lead.js` + `store.js`. `lead.js` requires `util.js` after the extract.

**Narrative Build 9 training workspace** (`narrative.html`):

```
app-bar.js → date.js
→ data/narratives/narrative-shared-options.js
→ data/narratives/sections/01-origin.js … 10-final-disposition.js
→ data/narratives/narrative-master.js
→ functions/narratives/narrative-markup.js
→ functions/narratives/narrative-builder-engine.js
→ functions/narratives/packet-builder.js
→ functions/narratives/build9/narrative-domain.js
→ functions/narratives/build9/narrative-coverage.js
→ functions/narratives/build9/encounter-summary.js
→ functions/narratives/build9/index.js
→ data/narratives/build9/demo-fixtures.js
→ functions/narratives/narrative-page.js
```

Markup must load before the engine so it can set `COPDoc.narratives.deferBoot`.
The page controller injects `ENGINE_MARKUP` and boots the document-global engine
once. Do not load `cards.js`: it would decorate the engine's generated fieldsets.
