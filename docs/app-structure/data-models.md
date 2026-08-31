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

File Import/Export writes leads, encounters, admin, and book-in. Encounters live in `copdocx.store.v1` next to leads — not a fourth store. The JSON bundle format is `copdocx.transfer.v1` (`functions/transfer.js`). CSV export is not imported.

Cross-store **reads** OK (dashboard arrest counts; book-in prefill). Cross-store **writes** only when the user Saves on the destination form.

Admin roster **stays** in `copdoc.admin.v1`.

## Encounter aggregate — `functions/model/encounter.js`

Not Person RAP `createEncounter` (that stays a history subrecord on the lead form).

`createEncounterRecord`: `encounterId` (`newId("enc")`), `entityType: "ENCOUNTER"`, `schema: "copdocx.encounter.v1"`, `startedAt`, `vehicles[]`, `locations[]`, `subjects[]`, `meta` as in [records.md](records.md). Mint the id on Add (draft save + `replaceState ?id=`). Do not wait for the first field.

`createEncounterSubject`: `{ personId, leadId, bookinRecordId, lastName, firstName, alienNumber }`. Subjects are Book-in records tagged `encounterId` in `alien-book-in.saved-records.v1`. `store.saveEncounter` copies a summary onto `subjects[]` after Book-in Save/Delete. Do not merge the Book-in store.

Location associations for the encounter card: `stop` / `staging` / `other` (`ENCOUNTER_LOCATION_ASSOCIATIONS`).

## Narrative Build 9 training data

`narrative.html` does not add a fourth persistent store. Without a query, Build 9
uses deterministic in-memory training data from `data/narratives/build9/demo-fixtures.js`.

`narrative.html?encounterId=` is the I-213 hook: `functions/encounter-narrative.js`
`bundleFromEncounter` maps the saved encounter + Book-in subjects into the Build 9
bundle shape. `narrative-page.js` swaps that bundle in for the demo fixture. Do not
rewrite the narrative engine, section libraries, or demo fixtures. Update draft
still does not write leads, admin, or book-in storage.

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

Cover in `scripts/test-model.js`: officer factory; vehicle `governmentVehicle` default false; gov default fleet `status === "available"`; `saveLead` draft does not `rememberPeople` and **keeps `committedAt`**; migration of `{ id, plate, status: "available" }`; `createEncounterRecord` mints `enc` id as draft; `saveEncounter` draft/commit preserves `committedAt`.
