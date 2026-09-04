# Object creation and association audit

This is the current invariant for every UI that creates or edits an investigative
Person, Vehicle, Location, Business, or Entity.

## Canonical contract

An investigative object has one canonical id and one canonical record in
`copdocx.store.v1`:

| Type | Constructor | Registry | Canonical id |
| --- | --- | --- | --- |
| Person | `createPerson` | `people{}` | `personId` |
| Vehicle | `createVehicle` | `vehicles{}` | `vehicleId` (`id` is the same value) |
| Location | `createLocation` | `locations{}` | `locationId` (`id` is the same value) |
| Business | `createBusiness` | `businesses{}` | `businessId` (`id` is the same value) |
| Entity | `createCustomEntity` | `entities{}` | `entityId` (`id` is the same value) |

Context code uses `store.createObjectRecord`, `store.getObjectRecord`, and
`store.saveObjectRecord`. The save gateway deep-merges omitted nested sections,
runs the normal constructor, enforces the canonical type/id, and then writes the
owning registry. A compact UI may collect fewer fields, but it may not invent a
context-specific object shape or registry.

`store.associations{}` is the canonical relationship layer. Case `links[]` and
Investigation `links[]` cite an `associationId`; they do not define a second
relationship. The nested copies in `lead.person.locations[]`, `lead.vehicles[]`,
and `vehicle.locations[]` are compatibility/read projections for existing Case,
Map, and Lead-form code. They retain the canonical object ids. Changing or
deleting a relationship removes an obsolete projection when no other live
association still supports that pair.

## Creation-path matrix

| Context | What the UI does | Persistence path | Result |
| --- | --- | --- | --- |
| Lead form | Full subject, Vehicle, Location, and link cards | `collectLead` → `saveLead` | Canonical Person plus canonical Vehicle/Location records; resolvable links become `associations{}` |
| Book-In | Fast detainee identity and arrest intake | `promoteBookInToLead` / `promoteBookInRecords` | Reuses or creates canonical Person, committed Detainee Lead, and canonical Arrest; packet keeps ids as provenance |
| Case view object tiles | Full Lead-form Vehicle/Location/Document cards | `saveLead` | Same constructors and ids as the Lead form; Cancel never persists a stub |
| Case Associations | Add → type → existing/new → full object card | `saveObjectRecord` → `associateCaseObject` | Canonical object plus one canonical association and one Case citation |
| Investigation Add/Associated | Compact identity prompt followed by wall Card | `resolveObjectRecord` → `saveObjectRecord` → association APIs | Same registry object; wall node stores only `objectType`/`objectId` and layout |
| Investigation Card | Edits the focused object | `saveObjectRecord` | Updates the same canonical object used by Cases and other walls |
| Encounter | Full encounter Vehicle/Location cards and links | `saveEncounter` → `syncEncounterObjects` | Encounter keeps its event snapshot and materializes the same ids in canonical registries/associations |
| Workspace import | Imports registries, records, and Book-In packets | transfer merge; Book-In promotion | Imported Book-In rows become full canonical cases/arrests; canonical ids are written back to packets |
| Promote Person to case | From a Case association or Investigation node | `promoteAssociateToCase` / `promoteInvestigationPersonToCase` | Reuses the same `personId`; creates at most one Lead for that Person |

The original three paths were therefore not the whole set. Case Vehicle/Place
tiles, Encounter objects, imports, and Person-to-case promotion are also creation
or materialization paths and must obey the same identity rules.

## Case editor interaction contract

All Case slide-over editors use the same actions:

- **Cancel** closes without writing. New ids may exist transiently in the DOM but
  no record or association is persisted.
- **Apply** validates and saves, refreshes the Case, and leaves the editor open.
- **Save & Close** performs the same save and closes only after success.

The Associations editor supports Person, Vehicle, Location, Business, and Entity.
Choosing an existing record hydrates its canonical card. Choosing “Create new”
uses that type's constructor card. Vehicle and Location fields match the Lead-form
templates. Person composes the standard identity, immigration, and criminal-id
cards. Relationship edits preserve the existing `associationId` instead of
creating a second fact.

## Intentional non-canonical domains

These records use familiar constructors or fields but are not investigative
world objects and must remain separate:

- Admin officers and government fleet vehicles live in `copdoc.admin.v1`.
- Officer home/work addresses are roster data.
- Operation target snapshots and operation map locations are planning/issued-order
  data; they do not silently create Case associations.
- Book-In packet rows remain transport/provenance records even though explicit
  Save/import promotes them to canonical Person/Lead/Arrest records.
- Unresolved legacy text links remain provisional until an operator selects or
  creates a real object. Editing a legacy `OTHER` Case link promotes it to a
  canonical Entity.

## Regression requirements

- Partial Person updates preserve criminal and immigration sections.
- Lead-form and Encounter objects appear in the canonical registries.
- A full Case association card persists fields beyond the old one-line label.
- Changing relationship type updates one association in place.
- Changing an endpoint does not recreate the previous Vehicle/Location link.
- Dropping an association removes its unsupported Case projection but keeps the
  canonical object record.
- Empty Case object tiles still expose Add.
- Vehicle and Location template fields stay in parity with the Lead form.

