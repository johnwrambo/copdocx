# Data models

Factories live in `functions/model/`. Reuse Location and Vehicle; add Officer. Officers are not Persons and never enter `people{}`.

## Stores (do not merge)

| Key | Module | Contents |
| --- | --- | --- |
| `copdocx.store.v1` | `functions/model/store.js` | `leads{}`, `people{}`, `encounters{}`, `currentLeadId` |
| `copdoc.admin.v1` | `functions/admin.js` | `{ officers, vehicles, shifts }` |
| `alien-book-in.saved-records.v1` | `functions/book-in.js` | Book-in records array |
| `copdocx.settings.v1` | `functions/warrant-issue.js` | `{ issuingOffice, lastOfficerId }` |
| IndexedDB `copdocx.warrants` | `functions/warrant-issue.js` | File System Access directory handle for `warrants/` |
| IndexedDB `copdocx.media.v1` | `functions/model/media.js` (**planned**) | Photo / file blobs + metadata. **Not** inside `copdocx.store.v1`. |

File Import/Export writes leads, encounters, admin, and book-in. Encounters live in `copdocx.store.v1` next to leads — not a fourth store. The JSON bundle format is `copdocx.transfer.v1` (`functions/transfer.js`). CSV export is not imported.

Lead snapshots may include `history[]`: `{ eventId, at, type, text, source }`. Operator notes (`type: "note"`) are stored here. `collectLead` re-appends previous `history` so a form Save does not wipe Case view notes.

`store.relatedCommittedCases(personId, excludeLeadId)` returns `{ asSubject, asAssociate }` from committed leads (`listLeads` `subjectPersonId` + person-to-person `links[]`). Case view uses it for association jumps. No new lead fields.

Cross-store **reads** OK (dashboard arrest counts; book-in prefill). Cross-store **writes** only when the user Saves on the destination form.

Admin roster **stays** in `copdoc.admin.v1`.

## Encounter aggregate — `functions/model/encounter.js`

Not Person RAP `createEncounter` (that stays a history subrecord on the lead form).

`createEncounterRecord`: `encounterId` (`newId("enc")`), `entityType: "ENCOUNTER"`, `schema: "copdocx.encounter.v1"`, `startedAt`, `vehicles[]`, `locations[]`, `subjects[]`, `narratives[]` (PRIMARY_SUBJECT I-213s), `supervisorSummary`, `meta` as in [records.md](records.md). Mint the id on Add (draft save + `replaceState ?id=`). Format `DAL{team}-{YYYYMMDD}-{seq}` (default team 3). Do not wait for the first field. Old `enc_…` ids remain valid. Each primary narrative is keyed by `focusEncounterParticipantId`; display also shows the subject’s Book-in ICE event.

`createEncounterSubject`: `{ personId, leadId, bookinRecordId, lastName, firstName, alienNumber, encounterRole }`. `encounterRole` is `"TARGET"` | `"COLLATERAL"` | `""` for **this** field encounter (not a person attribute). Subjects are Book-in records tagged `encounterId` in `alien-book-in.saved-records.v1`. Book-in Save copies a summary onto `subjects[]`. Do not merge the Book-in store.

Location associations for the encounter card: `stop` / `staging` / `other` (`ENCOUNTER_LOCATION_ASSOCIATIONS`).

## Narrative Build 9 training data

`narrative.html` does not add a fourth persistent store. Without a query, Build 9
uses deterministic in-memory training data from `data/narratives/build9/demo-fixtures.js`.

`narrative.html?encounterId=` is the I-213 hook: `functions/encounter-narrative.js`
`bundleFromEncounter` maps the saved encounter + Book-in `formState` + lead subject
into the Build 9 bundle (identity, TARGET/COLLATERAL, immigration, closing, location,
vehicles, reporting officer). Live pages omit training `narrativeFacts`. Do not rewrite
the narrative engine, section libraries, or demo fixtures. **Save I-213** writes
`encounter.narratives[]` and `supervisorSummary` only — not leads, admin, or book-in
storage. A missing `?encounterId=` does not load the demo fixture. Events/conduct stay
operator-entered until an encounter event log exists.

## Person warrants — `createWarrant`

RAP cards on the lead form stay `{ formType: "" }` plus charge / number / date / status / issuer.

Issued I-200 / I-205 (lead view **Issue**) add:

```
formType       "I-200" | "I-205" | ""
fileNo         A-Number as printed
pdfFileName    I-200_{LAST}_{FIRST}_{A#########}_{YYYYMMDD}.pdf
office         Location / office string
officerName
officerTitle
basis          checkbox field ids that were On
inaLaw         I-205 only
entryPlace / entryDate   I-205 only
issuedAt       ISO
```

Keep `warrantNumber`, `warrantDate`, `warrantStatus` (`active` on issue), `warrantIssuer`, `charge`. `collectLead` re-reads RAP cards then **re-appends** `formType` I-200/I-205 rows from the previous snapshot so an edit does not wipe issued warrants. Hydrate skips those rows on `#warrantList`.

Writeback uses `store.saveLead(snapshot, { mode: "commit" })` so Issue does not demote a committed lead.

## Person criminal profile

`createPerson().criminal` holds identifiers (`fbiNumber`, `ncicNumber`, `stateId`, `rapSheet`) plus **derived** flags from arrests, convictions, and RAP warrants. There is no lead-form Criminal checkbox. `collectLead` calls `deriveCriminalProfile` after cards (and after re-appending issued I-200/I-205).

```
isCriminal / hasCriminalRecord   ≥1 conviction with an offense
hasCriminalWarrants              RAP warrant (`!isIssuedWarrant`) status active / unknown / blank
sexOffender / foreignFugitive / armed   keyword hit on offense text (arrests count; I-200/I-205 do not)
threatLevel                      none | low | moderate | high | severe (max of signals)
```

Threat: none (no record/warrants) → low (misdemeanor only) → moderate (felony or outstanding criminal warrant) → high (armed) → severe (sex offender or foreign fugitive). Recompute on hydrate, list, view, Book-in load, and baseball so old snapshots with a stale checkbox still display correctly.

## Person immigration (lead Save)

`createPerson().immigration` includes A-Number, FIN, disposition, status, `finalOrder` / `finalOrderDate`, **`firstDeportationDate`**, **`lastDeportationDate`**, and **`baseballCards[]`**. `lexId` is on the person (not immigration). Lead form Save must persist every field on `lead-form.html` — no form-only inputs.

`createBaseballCard`: `cardId`, `generatedAt`, `text`, `arrestDate`, `disposition`. Generate on `baseballcard.html` appends a row and writes deportation dates back, then `saveLead` **commit**. `collectLead` re-appends `baseballCards` from the previous snapshot (lead form has no baseball cards to re-collect).

## Officer — `functions/model/officer.js`

`createOfficer`: `officerId`, `entityType: "OFFICER"`, flat `lastName` / `firstName` / `middleName`, `badge`, `callSign`, `duty` (`available | in-field | admin | leave | off`), `role`, `team`, `eod`, `phoneGov`, `phonePrivate`, `locations[]` (`createLocation`, residence/work), `qualifications[]`, `qualOther`, `equipment[]`, `equipNotes`, `meta` as in `records.md`.

`formatPersonLabel` still works if passed the officer (`person.name || person` in `person.js`). Prefer a small `officerName()` in admin for last-name-first tables.

## Vehicle — extend `functions/model/vehicle.js`

Keep plate/VIN/make/model/color/body, `registeredOwnerName`, `locations[]`. Add:

```
governmentVehicle: false
unit, status, barcode, driverNumber
assignedOfficerIds[]
equipment[]    // caged | gun-box | radio | emergency-lights
meta
```

**Name collision:** root `status` is **fleet** (`available | assigned | down | out`). Record lifecycle is **`meta.status`**. Dashboard: `meta.status === "committed" && status === "available"`.

| `governmentVehicle` | Who | Fields |
| --- | --- | --- |
| `false` (default) | Lead cards | Identity + owner + locations. Fleet fields stay `""` / `[]`. |
| `true` | Admin `vehicle-form.html` | Identity + agency fields. **No** owner, **no** nested locations. `addVehicle` already deletes those — keep for gov. Default fleet `status` **`"available"`** when `governmentVehicle: true`. |

`collect.js` must pass **`governmentVehicle: false`** explicitly.

## Location — `functions/model/location.js`

Unchanged. Officer uses the lead location card (`data-location-owner="person"`). **Non-goal:** fleet parking.

Every `[data-card="location"]` (lead form, nested vehicle locations, encounter form, officer residence) has **Resolve address** and **Map it**. Resolve geocodes (Census, then Nominatim) into `latitude` / `longitude` and drops a Leaflet pin on that card (`functions/location-map.js`). Drag the pin or click the map to correct; the pair field updates. Map it opens Google Maps. The **lead view** paints **one** read-only 4×3 **Case map** of this subject’s home, work, and vehicle places (`locationMap.displayMany`). A side legend lists those addresses (Home / Work / Vehicle). Files sit with the identity facts (hyperlinks). Multiple subject photos get **Open photo gallery**. Click the photo to add/edit. This is **not** `COPDoc.map.leaflet` (the planning board). Tiles are OSM; same Leaflet 1.9.4 as `map.html`. Geocode/tiles need http(s). Maps use `aspect-ratio: 4 / 3`. Basemap on each location map: Map / Satellite / Hybrid (OSM + Esri, same as `map.html`). Subject photos on views are square (`object-fit: cover`).

## Media — `functions/model/media.js` (**0.17.0** store)

Photos and files are **one Media object**. They do not live as data-URLs on the lead/officer JSON and they do not rewrite the owner snapshot on save.

Do **not** merge this into `copdocx.store.v1`, `copdoc.admin.v1`, or book-in. Cross-store **read** on views. **Write** only from Save photo / Save file (picker) or Remove on the owner’s view/form.

`person.documents[]` (`createDocument`) stays identity **metadata** (type, number, dates). A scan is Media with `documentType` and optional `documentId` pointing at that row. Do not put PDF bytes on the RAP document card.

**Reject (current lab pickers do this; product Save must not):** base64 data-URLs in `localStorage`; stuffing blobs into `leads{}`; `FileReader.readAsDataURL` as the persistence format; loading full originals to paint a thumbnail list.

### IndexedDB layout (`copdocx.media.v1`, version 1)

Two object stores. Metadata is cheap to query; binaries stay out of list reads.

| Store | Key | Value |
| --- | --- | --- |
| `meta` | `mediaId` | `createMedia` JSON (no bytes) |
| `blobs` | `[mediaId, role]` | `{ mediaId, role, mime, bytes, blob }` |

`role` is `original` | `display` | `thumb`. Files that are not images store **original only**. Photos store all three.

Indexes on `meta`:

| Index | Key | Use |
| --- | --- | --- |
| `ownerKey` | `owner.type + ":" + owner.id` | `forOwner` — the view query |
| `mediaClass` | `photo` \| `file` | split photo card vs document list |
| `sha256` | hex digest of original | skip duplicate save to the same owner |
| `ownerSha` | `ownerKey + ":" + sha256` | one-get duplicate check |

Warrants already use IndexedDB (`copdocx.warrants` for a directory handle). This is a second IDB database, not a store bolted onto that one.

### Factory (`meta` only)

```
mediaId
entityType          "MEDIA"
mediaClass          "photo" | "file"
owner               { type, id }     // PERSON | VEHICLE | LOCATION | OFFICER | ENCOUNTER | LEAD | BOOKIN
ownerKey            "PERSON:p_…"     // denormalized for the index; write on every save
kind                subject | vehicle | location | document | evidence | other
documentType        identity catalog and/or case packet code
caption, takenAt, place, tags[], notes
mime, bytes, width, height, originalName
sha256              hex of original bytes
roles               ["original","display","thumb"]   // which blob keys exist
crop                { x, y, w, h } or null
primary             boolean (photos only). One primary photo per owner.
documentId          optional → person.documents[].documentId
meta                draft | committed  (same records.md rules)
```

**Primary photo:** the picture that object’s view shows large. Many photos per PERSON / OFFICER / VEHICLE / LOCATION. Setting a new primary clears the previous one on that owner. First saved photo on an object is primary. Documents are never primary. If the primary is removed, the next remaining photo (by `takenAt`) becomes primary.

**Scale (thousands of photos in the DB):** a view never scans the whole library. `list(owner)` uses the `ownerKey` index (one person/car/place — usually tens of rows of JSON, no bytes). Thumbnails load `thumb` only. The large picture and Mobile Target sheet load **one** `display` blob at a time and revoke the previous object URL. Originals are only fetched for Open / recrop. Duplicate files on the same owner are skipped (`ownerSha`). Do not put bytes on lead JSON; do not create object URLs for every photo up front. Mobile Target sheet: show primary first; left/right (click or swipe) walks that owner’s photos in list order and fetches the neighbor `display` only.

v1: **one owner**. The owner **is the object the media is of** (the person in the mugshot, the vehicle in the plate shot, the house in the location shot). Source of truth is the media row. No `mediaIds[]` on person/vehicle. No join table. **Photos never use `LEAD` as owner.** A lead is a case file, not a face or a car. Add photo on that object’s card; the card supplies `ownerType` + `id`. Do not dump leftovers on the lead.

Caps (refuse with status, do not partial-write): original photo **15 MB**, other file **25 MB**. Before put: `navigator.storage.estimate()`; if remaining &lt; `bytes * 1.2`, fail loud. Call `navigator.storage.persist()` once per browser on first successful save.

### Mechanical save (one file)

Picker **Save photo** / **Save file** with `ownerType` + `id` in the query. Missing owner → status error, stay (same as book-in without a committed lead). Do **not** `saveLead` / `addOfficer`.

```
File / Blob
  → SHA-256 (crypto.subtle.digest)
  → if sha256 index hit for this ownerKey: skip, status “Already saved.”
  → photo? createImageBitmap(file, { imageOrientation: "from-image" })
       display = JPEG max-edge 1920, quality 0.86
       thumb   = JPEG max-edge 320,  quality 0.72
       original = the File as-is (keep what the camera wrote)
     file (non-image)? original only; if mime is image/* treat as photo
  → one IDB readwrite transaction:
       meta.put(createMedia(…, roles, sha256, ownerKey))
       blobs.put(original)
       blobs.put(display)   // photos
       blobs.put(thumb)     // photos
     commit
  → revoke any object URLs from the picker preview
  → status “Saved to {label}.” → owner view
```

Encode derivatives with OffscreenCanvas when present; else a detached `<canvas>`. Never `toDataURL` into storage — `canvas.convertToBlob({ type: "image/jpeg", quality })` (or `toBlob`) and put that Blob.

Multi-select: **one file = one transaction**. Failure on file 3 does not roll back 1–2. Status `Saving 2 of 5`. Concurrency **2** (decode is memory-heavy). Sequential is acceptable if simpler.

Crop **Apply** (photo only): read `original` blob → bitmap → draw crop rect → replace **display** (and **thumb**) in one transaction; keep `original`; set `meta.crop`. **Reset original**: delete display/thumb, rebuild from original, clear `crop`.

Remove: one transaction deletes `meta` + all `blobs` for that `mediaId`. Does not rewrite the owner record.

### Mechanical read (view)

`media-card.js` never opens originals to draw a list.

```
meta.index("ownerKey").getAll("PERSON:" + personId)
  → split mediaClass photo vs file; hide draft on committed views
photos: thumbs → blobs.get([mediaId, "thumb"]) for visible strip only
        large picture = the primary photo’s "display" (one URL; revoke on change)
files:  paint type / caption / bytes from meta only
        Open → blobs.get([mediaId, "original"]) → object URL (revoke on leave / next open)
```

Revoke object URLs when the view unmounts or the selection changes. Do not keep a process-wide map of every blob URL.

### Query contract

| Open from | URL |
| --- | --- |
| Lead / person | `photo-picker.html?ownerType=PERSON&id={personId}` (also accept `leadId=` → subject) |
| Vehicle | `?ownerType=VEHICLE&id={vehicleId}` |
| Officer | `?ownerType=OFFICER&id={officerId}` |
| Encounter | `?ownerType=ENCOUNTER&id={encounterId}` |
| Book-in | `?ownerType=BOOKIN&id={recordId}` |
| Location | `?ownerType=LOCATION&id={locationId}` |
| Lab (no owner) | no query — isolated `copdocx.photo-picker.v1` / `file-upload.v1`, **no** product Save |

`file-upload.html` uses the same query. Primary with an owner: **Save photo** / **Save file**. Without: **Add photos** / **Add files** only (lab).

API (all Promise): `COPDoc.media.save({ owner, file, mediaClass, fields })`, `.list(owner)`, `.blob(mediaId, role)`, `.setPrimary(mediaId)`, `.remove(mediaId)`. `list` returns meta only, photos first with `primary` first, then `takenAt`.

### Owners (which object gets which card)

| Owner | Photo card (view) | Document list (view) | Notes |
| --- | --- | --- | --- |
| **PERSON** | Primary photo large; other photos as thumbs | Identity + packet files | Lead view uses the subject. Mobile Target sheet `#targetPhoto` shows primary; left/right walks this owner’s photos. |
| **VEHICLE** | Vehicle shots (`kind=vehicle` or evidence of that unit) | Title / registration / other files | Case and fleet; same `vehicleId`. |
| **LOCATION** | Location shots | Rare; show if any | No `location.html`. Render on the parent person/vehicle/encounter view, grouped by `locationId`. |
| **OFFICER** | Portrait | Creds / certs scans | Admin officer view. |
| **ENCOUNTER** | Scene of the stop as a whole (not a face, not a plate) | I-213 PDF, packets for the event | Face → PERSON. Plate/car → VEHICLE. Street/house → LOCATION. |
| **LEAD** | **Never** for photos | Only files that are not of a nested object (rare) | Not a photo dump. |
| **BOOKIN** | Detainee photo if not already on the person | Generated packet PDFs | Photo of the detainee → `PERSON` when `personId` exists. |

`owner` **is the object in the picture** (or the document’s subject). `kind` is a label on that photo (mugshot vs evidence), not a second owner. Plate-check shot → `owner: VEHICLE`. House → `owner: LOCATION`. Mugshot → `owner: PERSON`.

Lead **view** paints one media widget per object on the snapshot (subject, each vehicle, each location). Add photo on the vehicle card sets `ownerType=VEHICLE&id=` for that unit. Same for files: DL scan → PERSON; title → VEHICLE.

### View chrome (shared widget)

One painter, `functions/media-card.js`, used on every view that has an owner id:

```
┌ Photo                         ┐  ┌ Documents                    ┐
│ [primary photo]               │  │ Type · caption · Open        │
│ caption · takenAt             │  │ …                            │
│ thumbs                        │  │ empty: No files uploaded.    │
│ Add photo → picker?owner=     │  │ Add file → file-upload.html  │
└───────────────────────────────┘  └──────────────────────────────┘
```

Empty photo: placeholder (reuse FOW empty art). Empty files: `records-empty` line. Draft media does not show on a **committed** view. Forms may show drafts.

Do **not** put +Person / +Vehicle / +Location on these cards. Add photo / Add file only.

### Transfer

JSON bundle stays metadata-sized. v1 export: media **index** (ids, owner, kind, documentType, caption, sha256 — no blobs). Import of blobs is a later PR. CSV does not include binaries.

File System Access (`warrants/`) stays for issued I-200/I-205 PDFs on disk. It is not the in-app photo store.

## Lead — `functions/model/lead.js`

Additive `meta.status` / `meta.committedAt` only. `SCHEMA` stays `copdocx.lead.v1`.

## `functions/model/util.js`

Extract `assign`, `nowIso`, `newId` from `lead.js` so admin can load helpers without `createLead`.

## Migration (idempotent on load; write back)

1. Missing `meta.status` → `committed`, `committedAt ← updatedAt || now`. **Do not** read fleet `status` as meta. A row `{ id, plate, status: "available" }` becomes `governmentVehicle: true`, `meta.status: "committed"`, fleet `status` still `"available"`.
2. **Dual-write, do not delete in 0.6.x:**
   - Officer: `id` **and** `officerId` (same string on every save). `address` **and** `locations[]` (`locationAssociation` → `association`). 0.5.2 still reads `row.address` (`fillOfficerAddress`, `paintOfficerView`, list city).
   - Vehicle: `id` **and** `vehicleId`; `plate` **and** `licensePlate`. Do not delete `plate`.
3. Lookups: `row.id === id || row.officerId === id` (same for `vehicleId`). `findOfficer` / `findVehicle` today match **only** `row.id`.
4. New records still use `model.newId` (underscores). Alias `id` anyway.
5. Admin vehicles: `governmentVehicle: true`.
6. People registry: no purge of pre-0.6 autosaved persons.

Rollback 0.6 → 0.5.2 works **only** because `address` / `id` / `plate` remain.

Cover in `scripts/test-model.js`: officer factory; vehicle `governmentVehicle` default false; gov default fleet `status === "available"`; `saveLead` draft does not `rememberPeople` and **keeps `committedAt`**; migration of `{ id, plate, status: "available" }`; `createEncounterRecord` mints `enc` id as draft; `saveEncounter` draft/commit preserves `committedAt`; `deriveCriminalProfile` from convictions/warrants/keywords.
