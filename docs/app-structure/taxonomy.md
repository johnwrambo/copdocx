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
| Case (store: lead) | `cases.html` (tab **Cases**; `leads.html` redirects) | `case.html` (alias `lead.html` redirects) | `lead-form.html` |
| Officer | `officers.html` | `officer.html` | `officer-form.html` |
| Vehicle | `vehicles.html` | `vehicle.html` | `vehicle-form.html` |
| Encounter | `encounter.html` | not split yet | `encounter-form.html` |
| Investigation | `investigations.html` | `investigate.html` (workspace is the form) | — |
| Operation | `operations.html` | `operation.html` | `operation-form.html` |

Officer pocket brief: `operation-brief.html?id=` (not a tab). Nested Target sheets (**0.66.0**).

`index.html` must change **all three**: `http-equiv` refresh, `<link rel="canonical">`, and the fallback `<a>` — to **`home.html`**. The Home tab is the briefing hub; **Cases** is `cases.html` (store still `leads{}`). `leads.html` redirects. The Cases tab defaults to the **Arrests** roster (search, dates, columns, report); **Case files** is the stage list. Arrest roster + daily report with baseball cards shipped **0.67.0**.

The case triad has shipped. `lead.html` is only a compatibility redirect to `case.html`; all editing lives at `lead-form.html`.

### Reserved (not this program)

| Type | List | View | Form |
| --- | --- | --- | --- |
| Book-in | `bookins.html` | `bookin.html` | `bookin-form.html` |

Encounter list currently lives at `encounter.html` (`data-page="encounter"`), not `encounters.html`. Do not rename until a view split. Encounter subjects use **`bookin.html?encounterId=`** (not `id`) so a future book-in `?id=` does not collide.

Until book-in is split, `bookin.html` is the working form. Prefill uses **`bookin.html?leadId=`** (not `id`) so a future book-in `?id=` does not collide.

### Non-record pages

`home.html` (`data-page="home"`), `admin.html` (`data-page="dashboard"`), `schedule.html`, `map.html`, `narrative.html`, `baseballcard.html`, `photo-picker.html` (`data-page="photo-picker"`), `file-upload.html` (`data-page="file-upload"`), `mobile-target-sheet.html` (`data-page="mobile-target-sheet"`).
`i200-form.html` (`data-page="i200-form"`) and `i205-form.html` (`data-page="i205-form"`) are case-view issuance forms (`?id=` is the **leadId**). Cases tab stays current. They are not a warrant triad.
Operations tab: `operations.html` / `operation.html` / `operation-form.html` (**0.62.0**). Pocket brief `operation-brief.html` (**0.66.0**). `encounter.html` is the 0.11.0 list.

Home is a briefing hub, not a record triad. Its painter makes read-only cross-store projections for filed cases, available officers/fleet, weekly Book-ins, today's shifts, mapped priority targets, and open follow-ups. Its **Tools / Utilities** card owns workspace Import JSON, Export JSON/CSV, and Lock this tab. The transfer dialogs are the only Home actions that write stores.

`photo-picker.html` remains a development workspace for upload / crop / tags with no owner. Owner-scoped Add photo links open it embedded in `photo-picker-modal.js`; Save closes the modal and leaves the parent URL/form/wall intact. It writes media only. Not a chrome tab. Isolated lab key `copdocx.photo-picker.v1`.

`file-upload.html` is the same tagging workspace for any file, plus document type (identity catalog + case packets). Isolated key `copdocx.file-upload.v1`. Not a chrome tab. Do not write leads, admin, or book-in from it.

**Product Save:** both pickers accept `?ownerType=&id=` (see [data-models.md](data-models.md) Media). **Save photo** / **Save file** writes IndexedDB `copdocx.media.v1`. No query → lab library only. Views show a **Photo** card (hero + thumbs) and a **Documents** list via `functions/media-card.js`. Photos never use owner type `LEAD`; `leadId=` resolves the subject PERSON.

Map is a planning board, not a record triad. Action slot: **Brief view** + primary **Print brief**. Writes: `copdocx.map.views.v1` (home/presets), `copdocx.map.layers.v1` (layer visibility), `copdocx.map.icons.v1` (assigned icons), `copdocx.map.markup.v1` (labels/arrows). Does not write leads/admin/book-in. Pin click uses the same photo card as the case map (`functions/map-popup.js`); it **reads** `copdocx.media.v1` and does not Save photo.

**Map layers (0.18.0 / layout 0.19.0).** One dock row per layer: eye = visibility, name = list, icon = category glyph. A place may appear on more than one layer.

| Layer | Rule | Default |
| --- | --- | --- |
| Active targets | `targetPriority` set | on |
| Arrests | `person.arrests[]` with lat/long (from Complete / Book-in stop, or `lat, lng` in the location string) | on |
| Encounters | `encounter.completed` snapshot locations (Complete), not the live working form | on |
| Officer homes | committed officer `residence` / `home` location | on |
| Origin / finds | vehicle/person `association === "plate-check"` | off |
| Markup | labels and arrows | on |

Icon library (Lucide set on the page, `<details>` closed by default) assigns a glyph to a **category** (click a layer icon/name while a swatch is picked) or a **row**. Overlay tools: Label, Arrow, Delete. **Brief view** hides chrome, overlays, and the dock; action-slot **Print brief** uses the browser print dialog (Save as PDF).

`narrative.html` (`data-page="narrative"`) is the I-213 / Build 9 workspace, not
a chrome tab. Open it from the encounter form (**Generate I-213**). The Encounters
tab stays current. No query → synthetic training lab (Home tile). **`?encounterId=`**
loads the live encounter via `encounter-narrative.js`. A missing encounter does
**not** fall back to the demo. **Save I-213** writes `encounter.narratives[]` and
`supervisorSummary`. Training **Update draft** stays in memory.

Chrome tab label: **Cases**. Files and `data-page` stay `leads` / `lead-form` / `case`. Person **stage** is `caseRole` Lead / Target / Detainee. Encounter Target / Collateral is `encounterRole`. **Investigate** tab: `investigations.html` / `investigate.html?id=`. Investigation ID `INV{team}-{YYYYMMDD}-{seq}`. Kind uses Case source codes (`tag` Plate Check, `otherLe`, `elite`, `other`, `discovered`). An investigation is a web of objects on a **wall** (place / drag / connect; identity in the Card window), not a Case and not a scrolling form. Objects live in `people{}`, `vehicles{}`, `locations{}`, `businesses{}`, and `entities{}` and are reused across investigations by id. **Spawn** creates a child (`parentInvestigationId`) that overlaps the parent’s focused object plus one-hop neighbors. **Open as case** files a focused PERSON as a working Case (same `personId`; wall stays put). Wall details: [investigation-wall-plan.md](investigation-wall-plan.md).

## `data-page` vs `data-admin-page` (dual-write)

Chrome keys off **`data-page`**. `admin.js` `adminPage()` still reads **`data-admin-page`** (`officer-view` / `vehicle-view` are what `paint()` uses). Dual-write both until `admin.js` is switched (officer-model PR or a tiny follow-up). Do not drop `data-admin-page` in the chrome PR.

| File | `data-page` | `data-admin-page` (until admin.js migrates) |
| --- | --- | --- |
| `leads.html` | `leads` | — |
| `lead.html` | compatibility redirect | — (redirects to `case.html`) |
| `case.html` | `case` | — |
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
| `photo-picker.html` | `photo-picker` | — |
| `file-upload.html` | `file-upload` | — |
| `i200-form.html` | `i200-form` | — |
| `i205-form.html` | `i205-form` | — |
| `encounter.html` | `encounter` | — |
| `encounter-form.html` | `encounter-form` | — |

`aria-current="page"`: Home tab for `home`; Cases tab for `leads|lead|case|lead-form|i200-form|i205-form|mobile-target-sheet`; Investigate tab for `investigations|investigate`; Encounters tab for `encounter|encounter-form`; Admin **summary** for any admin child (`dashboard|officers|officer|officer-form|vehicles|vehicle|vehicle-form|schedule`). `.is-current` is for menu **links**, not buttons.

## Buttons and IDs

**One id on the primary control.** Never alias a second id onto `#appBarPrimaryAction`.

| Role | ID | Label | Element |
| --- | --- | --- | --- |
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
| Download filled warrant PDF | `#downloadWarrantPdfButton` | Download PDF | action-slot button |
| Status | `#appBarStatus` | — | `<p>` |
| Lead follow-up stubs (form only) | `#stubPersonButton`, `#stubVehicleButton`, `#stubLocationButton` | + Person / Vehicle / Location | buttons (`workflow.js`) |
| Follow-ups | `#followUpsToggle` | Follow-ups | button |
| Narrative save | `#appBarPrimaryAction` | Save I-213 / Update draft | button + `data-chrome-action="save"` |
| Narrative copy | `#copyNarrativeButton` | Copy | button (plain text) |
| Narrative downloads | `#downloadNarrativeJsonButton`, `#downloadNarrativeTextButton` | Download JSON / text | action-slot buttons |
| Workspace Import | `#homeImportButton` | Import JSON | Home Tools button calling `openFileImport` |
| Workspace Export | `#homeExportButton` | Export JSON / CSV | Home Tools button calling `openFileExport` |
| Workspace lock | `#homeLockButton` | Lock this tab | Home Tools button calling `COPDoc.privacyGate.lock` |
| Add encounter | `#appBarPrimaryAction` | Add encounter | `<a href="encounter-form.html">` |
| Add subjects (encounter form) | `#addEncounterSubjectsButton` | Add subjects | `<a href="bookin.html?encounterId=">` |
| Generate I-213 (encounter form) | `#generateI213Button` | Generate I-213 | button `call: generateEncounterNarrative` |
| Add subject (book-in + `?encounterId=`) | `#addEncounterSubjectButton` | Add subject | button `call: addEncounterSubject` |
| Load from leads (book-in) | `#loadLeadIntoEncounterButton` | Load from leads | button `call: openLoadLeadForEncounter`. Always on Book-in. |
| Map views | `#mapHomeButton`, `#mapSetHomeButton`, `#mapSavePresetButton`, `#mapPresetSelect`, `#mapDeletePresetButton` | Home / Set home / presets | in `.map-toolbar`, not the action slot |
| Map layers | active / arrest / encounter / officer / origin / markup toggles | independent visibility | in the map dock, not the action slot |
| Map hint | `#mapViewHint` | view-mode status | in `.map-card` |
| Map targets | `#targetsTableBody`, `#targetsEmpty` | ranked locations | `.targets-card` |
| Photo picker add | `#appBarPrimaryAction` | Add photos | button `call: openPhotoPicker` |
| Photo picker tools | `#downloadPhotoLibraryButton`, `#clearPhotoLibraryButton` | Download JSON / Clear library | standalone lab action slot |
| File upload add | `#appBarPrimaryAction` | Add files | button `call: openFileUpload` |
| File upload tools | `#downloadFileLibraryButton`, `#clearFileLibraryButton` | Download JSON / Clear library | page action slot |

Retire `#leadSaveStatus`, `#quickSaveLeadButton`, `#addOfficerButton`, `#addVehicleButton`, `#officerEditLink`, `#vehicleEditLink` in the **chrome PR** (same PR the slot becomes the only visible Save/Edit). Page scripts bind **Save** to `#appBarPrimaryAction[data-chrome-action="save"]`.

List tables: `#{records}Body`, `#{records}Empty`, `#{records}TableWrap`.

## CSS slots

| Slot | Class |
| --- | --- |
| Bar | `.app-bar`, `.app-bar-info`, `.app-bar-navrow` (`style.css` ~114–165) |
| Admin menu | `.app-bar-menu`, `.app-bar-menu-list` |
| Tabs | `.app-bar-nav` (~1848) |
| Actions | `.app-bar-actions` (`margin-left: auto`, ~167) |
| Primary / secondary | `.action-button` / `.action-button-secondary` |
| Status | `.app-bar-status` (`.is-ok`) |
| Tables | `.records-table`, `.records-empty`, `.record-actions` |
| Working / Filed badge / chips | `.record-status.record-status-draft`, `.record-filter-chips` (officers/vehicles/encounters: Working / Filed = `draft` / `committed`; Cases: Leads / Targets / Detainees = `caseRole` stage) |
| Narrative shell / engine scope | `.narrative-*`, `.narrative-engine-host` |
| Home briefing hub | `.page-home`, `.home-modules`, `.home-module`, `.home-split` |
| Map planning board | `.map-shell`, `.map-stage`, `.map-overlay`, `.map-dock`, `.map-layer-list` |
| Photo picker (test) | `.page-photo-picker`, `.photo-library`, `.photo-crop-stage`, `.photo-tag-list` |
| File upload (test) | `.file-library`, `.file-row`, `.file-preview` |
| Object view media | `.media-photo-card`, `.media-doc-list`, `.photo-picker-modal` |

Do not add per-page stylesheets unless print/PDF requires it.

## Directories

| Path | What belongs |
| --- | --- |
| repo root | HTML pages (lowercase, hyphenated form suffix) |
| `functions/` | Page/behavior JS |
| `functions/model/` | Factories, store, `media.js` (IDB photos/files), collect/hydrate, `util.js`, `autosave.js` — **singular** names |
| `functions/leads.js` | Lead list + view painter (after split) |
| `functions/app-bar.js` | `COPDoc.chrome` + menus + status |
| `functions/transfer.js` | Home Tools Import / Export dialogs; reads the separate stores directly |
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
workspace-config.js → privacy-gate.js (head)
app-bar.js → model/util.js → model/media.js → transfer.js
→ date.js → assets/icons/copdoc-icons.js → functions/home.js
```

Do **not** load `store.js`, `admin.js`, `collect.js`, `hydrate.js`, `workflow.js`, or `cards.js`. Home reads the record stores directly and writes only through explicit transfer dialogs. `media.js` is present so those dialogs include and restore the portable Media bundle.

**Photo picker** (`photo-picker.html`):

```
app-bar.js → date.js → model/util.js → model/store.js → model/media.js → photo-picker.js
```

Not a chrome tab. Lab key `copdocx.photo-picker.v1`. Owner query **Save photo** writes IndexedDB; owner-scoped product use is hosted by `photo-picker-modal.js`. Do **not** write leads, admin, or book-in JSON.

**File upload** (`file-upload.html`):

```
app-bar.js → date.js → model/util.js → model/store.js → model/media.js → data/identity-document-types.js → file-upload.js
```

Not a chrome tab. Lab key `copdocx.file-upload.v1`. Owner query **Save file** writes IndexedDB.

**Media (0.17.0+):** `functions/model/media.js` (IndexedDB). Views will load `media.js` then `functions/media-card.js`. Do not load media into `collect.js` / `hydrate.js`.

**Map** (`map.html`):

```
app-bar.js → date.js
→ model/util.js → model/person.js → model/store.js → model/media.js
→ Leaflet (CDN) → assets/icons/copdoc-icons.js → map-popup.js
→ map-views.js → map.js → map-targets.js → map-markup.js
```

Do **not** load `cards.js`, `collect.js`, `hydrate.js`, `admin.js`, `media-card.js`, or `workflow.js`. Cross-store **read** of leads/encounters for mapped locations, admin officer homes, and media thumbs. Writes: `copdocx.map.views.v1`, `copdocx.map.layers.v1`, `copdocx.map.icons.v1`, `copdocx.map.markup.v1`. KMZ/JSON/CSV stay `data-not-built`. Action slot: Brief view + Print brief.

**Admin pages** (officer/vehicle/dashboard/schedule/list/view):

```
app-bar.js → date.js
→ (officer-form: names.js, address.js, phone.js, cards.js)
→ (vehicle-form: data/us-places.js, data/vehicles.js, functions/vehicles.js, cards.js)
→ model/util.js → model/location.js → model/vehicle.js → model/officer.js → model/autosave.js
→ admin.js
```

Load `officer.js` only once it exists (officer-model PR). Load `autosave.js` from the save-shape PR. Until then admin keeps today’s stack plus `data-page`.

**Lead form** (`lead-form.html`):

```
app-bar.js → date.js → catalogs / cards helpers
→ model/util.js → lead.js → person.js → location.js → vehicle.js → data/association-matrix.js → link.js
→ store.js → officer-roster.js → collect.js → hydrate.js → autosave.js
→ cards.js → workflow.js → ui.js → lead-csv.js
```

**Lead view / list:** `app-bar.js`, `date.js`, `util.js`, `lead.js`, `person.js`, `location.js`, `store.js`, `leads.js`. **Do not** load `workflow.js`, `ui.js`, `baseballcard.js`, or `collect.js` on the view.

**Baseball card** (`baseballcard.html`):

```
app-bar.js → date.js → alien-number.js
→ data/countries.js → data/immigration.js
→ model/util.js → model/lead.js → model/person.js → model/store.js → model/media.js
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
app-bar.js → transfer.js → date.js → existing book-in catalogs
→ model/util.js → model/person.js → model/location.js → model/vehicle.js
→ model/lead.js → model/encounter.js → association matrix → model/link.js
→ model/store.js → model/media.js → arrest-report.js → book-in.js → baseballcard.js
```

Do **not** load `officer.js`, `autosave.js`, `collect.js`, or `createLead` beyond `lead.js` + `store.js`. `lead.js` requires `util.js` after the extract.

**Narrative** (`narrative.html`): I-213 when `?encounterId=`; otherwise Build 9 training lab.

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
→ data/countries.js → data/immigration.js
→ functions/model/util.js → person.js → lead.js → encounter.js → store.js
→ functions/encounter-narrative.js
→ functions/narratives/narrative-page.js
```

Markup must load before the engine so it can set `COPDoc.narratives.deferBoot`.
The page controller injects `ENGINE_MARKUP` and boots the document-global engine
once. Do not load `cards.js`: it would decorate the engine's generated fieldsets.
