# Data models

Factories live in `functions/model/`. Reuse Location and Vehicle; add Officer. Officers are not Persons and never enter `people{}`.

## Stores (do not merge)

| Key | Module | Contents |
| --- | --- | --- |
| `copdocx.store.v1` | `functions/model/store.js` | `leads{}`, `people{}`, `currentLeadId` |
| `copdoc.admin.v1` | `functions/admin.js` | `{ officers, vehicles, shifts }` |
| `alien-book-in.saved-records.v1` | `functions/book-in.js` | Book-in records array |

Cross-store **reads** OK (dashboard arrest counts; book-in prefill). Cross-store **writes** only when the user Saves on the destination form.

Admin roster **stays** in `copdoc.admin.v1`.

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

Cover in `scripts/test-model.js`: officer factory; vehicle `governmentVehicle` default false; gov default fleet `status === "available"`; `saveLead` draft does not `rememberPeople` and **keeps `committedAt`**; migration of `{ id, plate, status: "available" }`.
