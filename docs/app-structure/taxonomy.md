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

`index.html` must change **all three**: `http-equiv` refresh, `<link rel="canonical">`, and the fallback `<a>` — to **`leads.html`**. Today they all point at `lead.html`.

Until the lead split ships, the form **stays** at `lead.html` with `data-page="lead-form"` (see Interim). Do not keep the form on `lead.html` after the split.

### Reserved (not this program)

| Type | List | View | Form |
| --- | --- | --- | --- |
| Book-in | `bookins.html` | `bookin.html` | `bookin-form.html` |
| Encounter | `encounters.html` | `encounter.html` | `encounter-form.html` |
| Operation | `operations.html` | `operation.html` | `operation-form.html` |

Until book-in is split, `bookin.html` is the working form. Prefill uses **`bookin.html?leadId=`** (not `id`) so a future book-in `?id=` does not collide.

### Non-record pages

`admin.html` (`data-page="dashboard"`), `schedule.html`, `map.html`, `baseballcard.html`.  
`home.html`, `encounter.html`, `operation.html` are empty files — leave them.

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
| `admin.html` | `dashboard` | `dashboard` |
| `schedule.html` | `schedule` | `schedule` |
| `bookin.html` | `bookin` | — |
| `map.html` | `map` | — |
| `baseballcard.html` | `baseballcard` | — |

`aria-current="page"`: Leads tab for `leads|lead|lead-form`; Admin **summary** for any admin child (`dashboard|officers|officer|officer-form|vehicles|vehicle|vehicle-form|schedule`). `.is-current` is for menu **links**, not buttons.

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
| Cancel | `#appBarCancel` | Cancel | `<a>` |
| Book-in (lead **view** only) | `#bookInLeadButton` | Book-in | `<a href="bookin.html?leadId=">` |
| Status | `#appBarStatus` | — | `<p>` |
| Lead follow-up stubs (form only) | `#stubPersonButton`, `#stubVehicleButton`, `#stubLocationButton` | + Person / Vehicle / Location | buttons (`workflow.js`) |
| Follow-ups | `#followUpsToggle` | Follow-ups | button |

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

Do not add per-page stylesheets unless print/PDF requires it.

## Directories

| Path | What belongs |
| --- | --- |
| repo root | HTML pages (lowercase, hyphenated form suffix) |
| `functions/` | Page/behavior JS |
| `functions/model/` | Factories, store, collect/hydrate, `util.js`, `autosave.js` — **singular** names |
| `functions/leads.js` | Lead list + view painter (after split) |
| `functions/app-bar.js` | `COPDoc.chrome` + menus + status |
| `style/style.css` | The stylesheet |
| `data/` | Catalogs only |
| `docs/app-structure/` | These rules |
| `scripts/` | Node tests |

`schema.js` stays a pointer stub. Do not invent `addlead.html` or `{record}-view.html`.

## Script order

**`functions/model/util.js`** (extract in the save-shape PR): `assign`, `nowIso`, `newId`. `lead.js` and `officer.js` call these. Admin pages must **not** load `createLead` just to get helpers.

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

**Book-in** (prefill PR; `getLead` / `subjectOf` / `formatPersonLabel`):

```
app-bar.js → date.js → existing book-in catalogs
→ model/util.js → model/lead.js → model/person.js → model/store.js
→ book-in.js
```

Do **not** load `officer.js`, `autosave.js`, `collect.js`, or `createLead` beyond `lead.js` + `store.js`. `lead.js` requires `util.js` after the extract.
