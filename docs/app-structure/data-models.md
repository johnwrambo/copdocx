# Data models

Factories live in `functions/model/`. Reuse Location and Vehicle; add Officer. Officers are not Persons and never enter `people{}`.

## Stores (do not merge)

| Key | Module | Contents |
| --- | --- | --- |
| `copdocx.store.v1` | `functions/model/store.js` | `leads{}`, `people{}`, `encounters{}`, `investigations{}`, `operations{}`, `vehicles{}`, `locations{}`, `businesses{}`, `entities{}`, `associations{}`, `currentLeadId` |
| `copdoc.admin.v1` | `functions/admin.js` | `{ officers, vehicles, shifts }` |
| `alien-book-in.saved-records.v1` | `functions/book-in.js` | Book-in records array |
| `copdocx.settings.v1` | `functions/warrant-issue.js` | `{ issuingOffice, lastOfficerId }` |
| IndexedDB `copdocx.warrants` | `functions/warrant-issue.js` | File System Access directory handle for `warrants/` |
| IndexedDB `copdocx.media.v1` | `functions/model/media.js` (**shipped**) | Photo / file blobs + metadata. **Not** inside `copdocx.store.v1`. |

`functions/workspace-config.js` is the canonical product-version and persistence-key registry. It names the separate localStorage, sessionStorage, IndexedDB, and retired keys; it does not merge them.

Investigative Person / Vehicle / Location / Business / Entity writes use the
context-free gateway `store.createObjectRecord`, `getObjectRecord`, and
`saveObjectRecord`. It deep-merges omitted nested sections, runs the canonical
constructor, and enforces one type/id before writing `people{}`, `vehicles{}`,
`locations{}`, `businesses{}`, or `entities{}`. Lead, Book-In, Case,
Investigation, Encounter, import, and Person-to-case promotion paths are audited
in [object-workflow-audit.md](object-workflow-audit.md).

Home Tools Import/Export writes leads, encounters, investigations, operations, admin, book-in, and a portable Media bundle. Encounters, investigations, and operations live in `copdocx.store.v1` next to leads — not extra stores. Investigation export includes `investigationObjects` (the referenced `people{}` / `vehicles{}` / `locations{}` / `businesses{}` / `entities{}` / `associations{}`) so the wall graph round-trips without cloning ids. Importing Book-in rows also promotes them into canonical people, Detainee leads, and arrests and writes the resulting `personId`, `leadId`, and `arrestId` back onto each packet row. The JSON bundle format is `copdocx.transfer.v1` (`functions/transfer.js`). CSV export is not imported.

Lead snapshots may include `assignedOfficerId` (one committed officer from `copdoc.admin.v1`) and `history[]`: `{ eventId, at, type, text, source, officerId, officerAlias }`. Operator notes (`type: "note"`) are stored here. While an officer is assigned, new notes and system history stamp `officerAlias` (initials + badge, e.g. MR4421). `collectLead` re-appends previous `history` so a form Save does not wipe Case view notes. The Target sheet shows that officer as **Targeting Officer**.

`store.relatedCommittedCases(personId, excludeLeadId)` returns `{ asSubject, asAssociate }` from committed leads (`listLeads` `subjectPersonId` + person-to-person `links[]`). Case view uses it for association jumps. No new lead fields.

`store.promoteAssociateToCase(sourceLeadId, linkId)` (**0.26.0**) opens a PERSON association as its own **lead** (still `leads{}`, All / Working / Filed). Unresolved `label` mints a person (`parsePersonName`); existing `to.id` reuses that person. If they already have a lead (working or filed), return that `leadId` (no duplicate). Otherwise `createLead` + identity copy only (no RAP / warrants / immigration), `saveLead` **draft** so the row shows under Working. Resolves source `to.id`, writes a reciprocal PERSON link, appends system history on both. Chrome opens `lead-form.html?id=` for a working lead, `case.html?id=` if the person already has a filed case. Working (draft) sources and non-PERSON types reject.

`store.promoteBookInToLead(input)`, `promoteBookInRecord`, and `promoteBookInRecords` make Book-in an express canonical case writer. They mint or reuse the same `createPerson` / `createLead` objects as the lead form and file a **committed** lead with `caseRole: "DETAINEE"` (in custody). Reuse order is linked `leadId`, linked `personId`, A-Number, FBI number, then exact first/last/DOB. Book-in values normalize to lead-form representation (lowercase sex value, numeric age, country code, and EARM disposition code). Identity overlay does **not** copy RAP and does not wipe arrests, warrants, or baseball cards. Empty identity (no name, A-Number, FBI number, or existing id) is rejected.

Each promoted packet upserts one canonical `createArrest` by `bookinRecordId`; a second Book-in for the same person creates a second arrest, while re-importing the same row updates rather than duplicates it. The arrest owns arrest/Book-in date-times, officer/team, ICE event, encounter number/id, Target/Collateral role, vehicle position, and the booking/medical detail object. `alien-book-in.saved-records.v1` remains the import/export packet and provenance index, not an alternate Person, Lead, or Arrest model. Explicit Book-in Save, Book-in import/restore, Workspace import, legacy unlinked-row reconciliation, and opening Baseball Card promote; ordinary autosave and **Add another subject** remain packet-only. Encounter `subjects[]` gets `personId` and `leadId`.

Person associations may start unresolved: `label` (typed name), `otherType` (`PERSON` | `VEHICLE` | `BUSINESS` | `OTHER`), `to.id` empty, `notes`. Resolve later by setting `to.id`. Vehicle→person links still require `to.id`.

Case view layout is static in `case.html` (`data-size` grid). Do not write `copdocx.case-view.layout.v1`; Case view boot deletes that leftover key.

Cross-store **reads** are expected (dashboard arrest counts; Book-in prefill). Book-in promotion is the deliberate cross-store write described above. Do not merge the Book-in packet store into `copdocx.store.v1`; keep packet rows as transport/provenance and link them to canonical ids.

Admin roster **stays** in `copdoc.admin.v1`.

## Operation — `functions/model/operation.js`

`createOperation`: `operationId` / `operationNumber` `DAL{team}-OP-{YYYYMMDD}-{seq}`, `entityType: "OPERATION"`, `schema: copdocx.operation.v1`, `name`, `team`, `plannedStart`, `plannedEnd`, `targets[]`, `teams[]`, `targetAssignments[]`, `opLocations[]`, `medevacRoute[]`, `importedTeamKeys[]`, `markup`, `mapLayers`, `order`, `history[]`, `meta`. Mint id on the form; **do not write** until draft save (name or dates) or Save. Commit requires a name. **0.63.0** `store.addOperationTargets` imports committed cases with a current place or vehicle (pointers only). Planning map live-reads those cases; commit freezes `places[]` / `vehicles[]` on each target. **0.64.0** `store.importOperationTeam` takes 2–4 `officerId`s (read roster; do not write duty). `assignOperationTargetTeam` is one cell per target. `officerAvailability` uses duty, overlapping shifts that week, and other committed operations. **0.65.0** `members[].start` `{latitude,longitude}`, `heading`, `sector`, `scans`. `opLocations[]` use `createLocation` plus `opAssociation` rally|cleanup|medevac|hospital|landmark. `medevacRoute[]` is ordered lat/lng. **0.66.0** commit writes `order { generatedAt, narrative, officerBriefs[] }`. `operation-brief.html?id=` is the pocket operation sheet: nested Target-sheet blocks plus officer cards. Print / Save HTML. See [operations-plan.md](operations-plan.md).

## Investigation — `functions/model/investigation.js`

`createInvestigation`: `investigationId` `INV{team}-{YYYYMMDD}-{seq}` (not `DAL…` encounter ids), `entityType: "INVESTIGATION"`, `schema: copdocx.investigation.v1`, `kind` (`tag` | `otherLe` | `elite` | `other` | `discovered`, same as Case source), `mode` (`bulk` | `solitary` | `""`; plate-check defaults bulk), `title`, `team`, `parentInvestigationId`, `sourceLeadId`, `assignedOfficerId`, `plates[]`, `nodes[]`, `links[]`, `focusNodeId`, `history[]`, `meta`. Add mints a transient in-memory row; a blank wall is not stored and does not change the URL. First meaningful content or an explicit object/team action persists the draft. Unknown kind is rejected on save. Child investigations share object ids with the parent (overlap); they do not clone people/vehicles. **Wall (0.37.0):** each node also has `x`, `y` on this investigation only. Layout is not stored on the person/vehicle/location. `investigationPlex(record)` (**0.39.0**) is the focused node plus one-hop neighbors (by object id on `links[]`). `investigationHulls(record, related)` (**0.41.0**) maps parent/child investigations onto this wall’s nodes that share object ids (Venn overlap). `investigationOutlineMatch` / `investigationOutlineIsHit` (**0.44.0**) filter the Objects window: query matches title, kind, and extra identity; Hits are VEHICLE nodes tied to a `hit` or `promoted` plate. `investigationChipDim` (**0.46.0**) dims non-matching wall chips while Find/Hits is on (Find wins over plex; chips stay on the wall). See [investigation-wall-plan.md](investigation-wall-plan.md).

`createInvestigationPlate`: `plateId`, `plate`, `state`, `status` (`new` | `checked` | `hit` | `discarded` | `promoted`), `notes`, `vehicleId`. Plate-check queue only. Parser `COPDoc.plates.parse` (`functions/plate-parse.js`) splits paste/CSV, pairs optional state, uppercases, dedupes by `state|plate`. Import does not mint vehicles.

`store.vehicles{}` holds case/investigation vehicles (`governmentVehicle: false`). `store.promoteInvestigationPlate(investigationId, plateId)` mints or reuses by plate+state, adds a VEHICLE node, sets `focusNodeId`, marks the plate `promoted`. Discarded plates cannot promote. Does not create a lead.

`store.locations{}` holds first-class places so a residence can be shared across people and vehicles. `store.addInvestigationObject(investigationId, input)` mints or reuses a PERSON (`people{}`), VEHICLE, or LOCATION, adds a node, and `createLink`s it to the focused object using an A6 reason (`REGISTERED_OWNER_OF`, `CURRENT_RESIDENCE`, `VEHICLE_PARKING`, …), stored in canonical matrix direction. Reuse: person by name, vehicle by plate+state, location by street/city/state/ZIP. No focus → first object, no link. Plate-check (`kind: "tag"`) defaults new objects to a vehicle. A vehicle **node** on the wall is the same `createVehicle` object and identity fields as `vehicle-form.html` (plate, state, year, color, make, model, body, VIN, registered-owner name). Person and location nodes are the same `createPerson` / `createLocation` records. Business (`createBusiness`, `businesses{}`) and custom entity (`createCustomEntity`, `entities{}`) follow the same rule: name (+ phone on business, + kind on entity). Compact title is a collapsed view of that card on the wall; the identity fields open in the Card window (**0.52.0**, was the Objects-rail inspector in **0.43.0**). Open-window state is session UI (`sessionStorage` `copdocx.investigation-windows.v1` `{ plates, objects, card, pos }`), not a field on `investigations{}` or people/vehicles. **0.61.0** `pos` is `{ plates, objects, card }` of `{x,y}` or null. `investigationWindowsDefault(kind)` is plates open only for `tag`, Objects and Card closed. Occupancy / RAP / nested location cards stay off the wall (other nodes or a Case). `reuseInvestigationIdentity` retargets a node when plate/name/address matches an existing record, overlays typed identity onto the kept record, rewrites that object id on **every** investigation (nodes, links, plate `vehicleId`), drops self-links, and deletes the abandoned object if nothing else references it (no second Garcia in `people{}`). `disconnectInvestigationLink` removes an edge. Does not create a lead. `store.investigationIntegrity(investigationId)` reports duplicate nodes, dangling object ids, and links whose ends are not on this wall.

`store.removeInvestigationObject(investigationId, nodeId)` (**0.47.0**) drops that node from `nodes[]` and any `links[]` on this investigation that touch its object id. Does not delete `people{}` / `vehicles{}` / `locations{}` / `businesses{}` / `entities{}`. Does not change child/parent walls. If the node is a VEHICLE with a `promoted` plate on this investigation, that plate returns to `hit` (vehicleId kept) so Promote can put it back. Clears `focusNodeId` when it was that node. History: “Removed {label} from the wall.”

`store.clearInvestigationWorkspace(investigationId)` (**0.50.0**) empties `nodes[]`, `links[]`, `plates[]`, and `focusNodeId` on this investigation only. Shared objects stay. Parent/child walls stay. History: “Cleared the workspace.” Already-empty is `ok` with `cleared: false`.

Objects may be `junked` (**0.51.0**). Junk keeps the record (`junked: true`, `junkedAt`) but `findPersonByName` / `findVehicleByPlate` / address / business / entity lookup skip it. Junk strips that object off **every** investigation wall. Placing the same identity again restores it (`junked: false`). `store.deleteInvestigationObject` permanently drops an unreferenced record (and its media). Case subjects cannot be junked or deleted — **Remove from wall** still works. `store.objectDisposition` tells the card which actions are allowed.

`store.spawnInvestigation(parentId)` mints a child investigation (`parentInvestigationId`). Seeds the child with the parent's focused object and one-hop linked objects — same `objectId`s (overlap), new `nodeId`s / `linkId`s, same `associationId`s (**0.53.0**). Does not copy `plates[]` and does not clone people/vehicles/locations. Requires a focused object. Does not create a lead.

`store.associations{}` (**0.53.0**) is the first-class relational layer. `createAssociation` (`copdocx.association.v1`) is the record: canonical A6 `from`/`to`/`reason`, optional `occupancy` / `validFrom` / `validTo`, provenance `source`, `junked`. Investigation and Case `links[]` **cite** `associationId`; they are not second facts. `store.upsertAssociation` reuses the same ends+reason (symmetric types match either order), while `saveAssociationRecord` edits one id in place. `associationsFor(type, id)` lists both ends. Spawn copies new `linkId`s and the same `associationId`. Remove from wall drops the citation, not the fact. Reuse-on-type retargets association ends. Delete an unreferenced object drops its associations. A6 is the only catalog (`CUSTOMER_OF` PERSON→BUSINESS added). `registeredOwnerName` stays a title-print string. Nested `person.locations[]` / `lead.vehicles[]` are compatibility/read projections dual-written from associations so Case map and list city stay filled; changing or dropping the last fact for a pair prunes the obsolete projection. Occupancy dates dual-write from the association. Form-collected nested copies keep canonical ids. `store.associateInvestigationPerson` / `associateInvestigationObject` create or reuse an object, place it, and cite the association. `store.associateCaseObject` uses the same object gateway on a case subject. Case Associations uses the full standard object card rather than the retired one-line composer. × (`dropAssociation`) deletes the fact, removes every citation, and prunes unsupported Case projections; objects stay. A leftover unresolved link is removed with `removeCaseLink`. See [association-plan.md](association-plan.md) and [object-workflow-audit.md](object-workflow-audit.md).

`store.promoteInvestigationPersonToCase(investigationId, nodeId)` (**0.42.0**) opens a PERSON wall node as its own **lead** (still `leads{}`). `nodeId` optional: that node, or a PERSON `objectId` on this wall; otherwise the focused node. PERSON only. Reuses an existing lead by `subjectPersonId` (working or filed). Otherwise `createLead` + identity copy of the same `personId` (no RAP / warrants / immigration, no wall `links[]` / `vehicles[]` dump), `saveLead` **draft**. System history on the new lead and the investigation. Chrome **Open as case** opens `lead-form.html?id=` for a working lead, `case.html?id=` if the person already has a filed case. The wall graph is unchanged.

## Encounter aggregate — `functions/model/encounter.js`

Not Person RAP `createEncounter` (that stays a history subrecord on the lead form).

`createEncounterRecord`: `encounterId` (`newId("enc")`), `entityType: "ENCOUNTER"`, `schema: "copdocx.encounter.v1"`, `startedAt`, `eventType`, `operationId`, `officerIds[]`, `centerLocationId`, `vehicles[]` (optional `encounterDisposition` `LEFT`|`MOVED` and `parkedLocationText`), `locations[]`, `subjects[]`, `narratives[]` (PRIMARY_SUBJECT I-213s), `supervisorSummary`, `completed` (frozen analytics snapshot after Confirm/Complete), `completedHistory[]`, `meta` as in [records.md](records.md). `meta.markedComplete` / `completedAt` are set only by Complete. After Complete the working form is locked; the list **Completed** chip shows those rows. Add mints the id in memory; a blank form is not stored and does not get `?id=`. The first meaningful draft or explicit dependent action persists it. Format `DAL{team}-{YYYYMMDD}-{seq}` (default team 3). Old `enc_…` ids remain valid. Each primary narrative is keyed by `focusEncounterParticipantId`; display also shows the subject’s Book-in ICE event. Map Encounters plot `completed` only. Canonical Arrests store `latitude` / `longitude` / `arrestLocation` from the stop when Book-in promotes or the encounter is Completed. Picking an operation copies cell `officerIds` onto the encounter only (`officerIdsFromOperation`); it does not write `officer.duty` or mutate the operation.

`completed` snapshot (`copdocx.encounter-snapshot.v1`): `{ schema, generatedAt, encounterId, startedAt, eventType, operationId, officerIds[], centerLocationId, team, officeCode, subjects[], locations[] (isCenter), vehicles[], outcomeCounts { arrested, released, fled }, supervisorSummary, pin { latitude, longitude, arrestLocation, locationId } }`. `pin` is the **center**. Stored on the encounter, not a fourth localStorage key. Later Save/autosave must not replace it. `unlockEncounter` requires a reason, sets `markedComplete` false, and keeps `completed`. Re-Confirm appends `{ generatedAt, unlockedAt, reason, snapshot }` to `completedHistory[]`.

`createEncounterSubject`: `{ subjectId, personId, leadId, bookinRecordId, lastName, firstName, alienNumber, encounterRole, roleOther, citizenship, vehicleRole, custody, outcome, releaseReason, techniques[], unidentified, notes, packetFiledAt, fledAt, fledAtPrecision, arrestingOfficerId, compliance, useOfForce, forceLevel, docsGeneratedAt, shared }`. `shared` is the field-event stamp (`encounterId`, `startedAt`, `eventType`, `operationId`, `officerIds[]`, `team`, center place/coords, `vehicles[]`). `saveEncounter` refreshes `shared` from the parent and upserts RAP `person.encounters[]` keyed by `encounterId` + `subjectId` (`leEncounterFromSubject`). That is the LE encounter view for any outcome, including fled/released. `arrestInputFromSubject` builds the Arrest payload from the same participation + shared stop; `promoteBookInToLead` still mints the Detainee + `person.arrests[]` on **Book**, not on Add subject. Officer `fieldArrests[]` (admin roster) appends on Book. `encounterRole` is `"TARGET"` | `"COLLATERAL"` | `"OTHER"` | `""`. Outcome is `"ARRESTED"` | `"RELEASED"` | `"FLED_FOOT"` | `"FLED_VEHICLE"`. Vehicle role is `"DRIVER"` | `"PASSENGER"` only when the encounter has a vehicle. Add new uses `store.upsertPerson` and `encounterSubjectFromPerson` — it does not `saveLead` and does not write a Book-in packet. Book-in packets remain provenance (`bookinRecordId`). Do not merge the Book-in store.

Location associations for the encounter card: `stop` / `arrest` / `target` / `vehicle-left` / `staging` / `other` (`ENCOUNTER_LOCATION_ASSOCIATIONS`). One mapped location may be the **Encounter center** (`centerLocationId`).

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

`createPerson().criminal` holds identifiers (`fbiNumber`, `ncicNumber`, `stateId`, `rapSheet`), operator-entered foreign-warrant fields (`foreignWarrantsKnown`, `hasForeignWarrants`, `foreignWarrantCountry`), plus **derived** flags from arrests, convictions, and RAP warrants. There is no lead-form Criminal checkbox. `collectLead` calls `deriveCriminalProfile` after cards (and after re-appending issued I-200/I-205); deriving the domestic criminal profile does not erase foreign-warrant answers.

```
isCriminal / hasCriminalRecord   ≥1 conviction with an offense
hasCriminalWarrants              RAP warrant (`!isIssuedWarrant`) status active / unknown / blank
sexOffender / foreignFugitive / armed   keyword hit on offense text (arrests count; I-200/I-205 do not)
threatLevel                      none | low | moderate | high | severe (max of signals)
```

Threat: none (no record/warrants) → low (misdemeanor only) → moderate (felony or outstanding criminal warrant) → high (armed) → severe (sex offender or foreign fugitive). Recompute on hydrate, list, view, Book-in load, and baseball so old snapshots with a stale checkbox still display correctly.

## Person immigration (lead Save)

`createPerson().immigration` includes A-Number, FIN, disposition, status, `finalOrder` / `finalOrderDate`, **`firstDeportationDate`**, **`lastDeportationDate`**, and **`baseballCards[]`**. `lexId` is on the person (not immigration). Lead form Save must persist every field on `lead-form.html` — no form-only inputs.

`createArrest`: `arrestId`, arrest date/time/date-time, charge/statute/class/agency/location, officer/team, ICE event, encounter number/id, subject role, vehicle position, `bookinRecordId`, `bookInDateTime`, and nested `booking` (`cash`, travel documents, property tag, cell, children, medical). Book-in and lead entry both persist this same object shape.

`createBaseballCard`: `cardId`, `generatedAt`, `text`, sanitized `html`, `photoMediaId`, `arrestDate`, `disposition`, `bookinRecordId`, and the foreign-warrant answer/country. `photoMediaId` references a PERSON-owned Media photo; image bytes never enter the case JSON. **Save card** upserts the card for that Book-in arrest (legacy cards may match by date), updates foreign-warrant fields on the Person, and `saveLead` commits. It does not append duplicates on repeated saves. A legacy card with `photoDataUrl` remains readable and is migrated to Media on its next save. `collectLead` re-appends `baseballCards` from the previous snapshot because the lead form has no card editor.

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

Occupancy is on the **association** (**0.59.0**): `occupancy` (`current` | `historical`, default current), `validFrom` / `validTo`. Nested `person.locations[]` / `lead.vehicles[]` still carry `occupancy` / `occupiedFrom` / `occupiedTo` / `notes` / `otherResidents` as dual-written copies so the case map and list stay filled. Case map plots **current** places only. Officer uses the lead location card (`data-location-owner="person"`). **Non-goal:** fleet parking. `store.occupancyFor(type, id, otherType, otherId)` reads the association.

Every `[data-card="location"]` (lead form, nested vehicle locations, encounter form, officer residence) has **Resolve address** and **Map it**. Resolve geocodes (Census, then Nominatim) into `latitude` / `longitude` and drops a Leaflet pin on that card (`functions/location-map.js`). Drag the pin or click the map to correct; the pair field updates. Map it opens Google Maps. The **lead view** paints **one** read-only **Case map** of this subject’s home, work, and vehicle places (`locationMap.displayMany`). Vehicle **registration** / parking / plate-check pins stay vehicle (or parking) icons — they are not drawn as residences. A side legend lists association, plate/YMM for vehicles, and the full address. Click a pin (or legend row) for a small floating card. Its main image is the mapped LOCATION/VEHICLE; an associated PERSON portrait appears inset when both exist. Person-only falls back to one main image. Officer homes use location main + officer portrait, while arrests stay person-only. Both case and planning maps lazy-load primary committed thumbs and revoke object URLs. `map.html` also includes a read-only **Encounters** layer from committed encounter and vehicle locations. A vehicle location with an address but no lat/long reuses the matching person-place coordinates so it still plots. Files sit with the identity facts (hyperlinks). Multiple subject photos get **Open photo gallery**. Click the photo to open the in-page picker modal. This is **not** `COPDoc.map.leaflet` (the planning board). Leaflet 1.9.4 is vendored at `vendor/leaflet/` (Target sheet uses it; tiles are still OSM / Esri and need a network when the phone is online). If tiles or Leaflet fail, pins stay on a plain basemap or the list — the sheet does not blank. Saved Target sheet HTML inlines Leaflet + `location-map.js` so a connected phone still gets live tiles; an offline open still shows pins and the legend. Maps use `aspect-ratio: 16 / 9` on the case board; the Target sheet map uses viewport-relative height. Basemap on each location map: Map / Satellite / Hybrid (OSM + Esri, same as `map.html`). Subject photos on views are square (`object-fit: cover`).

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
owner               { type, id }     // PERSON | VEHICLE | LOCATION | OFFICER | ENCOUNTER | BOOKIN | BUSINESS | ENTITY
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

v1: **one owner**. The owner **is the object the media is of** (the person in the mugshot, the vehicle in the plate shot, the house in the location shot). Source of truth is the media row. No generic `mediaIds[]` on person/vehicle and no join table; a domain object may keep one specific foreign key such as Baseball Card `photoMediaId`. **Photos never use `LEAD` as owner.** A lead is a case file, not a face or a car. Add photo on that object’s card; the card supplies `ownerType` + `id`. Do not dump leftovers on the lead.

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
  → status “Photos saved.” → close owner-scoped modal and refresh that owner card
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
| Business | `?ownerType=BUSINESS&id={businessId}` |
| Entity | `?ownerType=ENTITY&id={entityId}` |
| Lab (no owner) | no query — isolated `copdocx.photo-picker.v1` / `file-upload.v1`, **no** product Save |

`file-upload.html` uses the same query. Primary with an owner: **Save photo** / **Save file**. Without: **Add photos** / **Add files** only (lab).

API (all Promise): `COPDoc.media.save({ owner, file, mediaClass, fields })`, `.list(owner)`, `.blob(mediaId, role)`, `.setPrimary(mediaId)`, `.remove(mediaId)`. `list` returns meta only, photos first with `primary` first, then `takenAt`.

### Owners (which object gets which card)

| Owner | Photo card (view) | Document list (view) | Notes |
| --- | --- | --- | --- |
| **PERSON** | Primary photo large; other photos as thumbs | Identity + packet files | Lead view uses the subject. Mobile Target sheet `#targetPhoto` shows primary; left/right walks this owner’s photos. |
| **VEHICLE** | Vehicle shots (`kind=vehicle` or evidence of that unit) | Title / registration / other files | Case and fleet; same `vehicleId`. |
| **LOCATION** | Location shots | Rare; show if any | No `location.html`. Render on the parent person/vehicle/encounter view, grouped by `locationId`. Investigation wall uses the same owner. |
| **BUSINESS** | Storefront / sign | If any | Investigation wall (**0.48.0**). |
| **ENTITY** | Crew / group image | If any | Investigation wall (**0.48.0**). |
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
│ Add photo → in-page modal      │  │ Add file → file-upload.html  │
└───────────────────────────────┘  └──────────────────────────────┘
```

Empty photo: placeholder (reuse FOW empty art). Empty files: `records-empty` line. Draft media does not show on a **committed** view. Forms may show drafts.

Do **not** put +Person / +Vehicle / +Location on these cards. Add photo / Add file only.

### Transfer

JSON workspace backups include media metadata plus base64-encoded blob roles so photos/files round-trip. Media stays in its IndexedDB database after import; it is never folded into a record store. CSV does not include binaries.

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

Cover in `scripts/test-model.js`: officer factory; vehicle `governmentVehicle` default false; gov default fleet `status === "available"`; `saveLead` draft **does** `rememberPeople` and **keeps `committedAt`**; `promoteBookInToLead` files DETAINEE, reuses A-Number, keeps RAP; migration of `{ id, plate, status: "available" }`; `createEncounterRecord` mints `enc` id as draft; `saveEncounter` draft/commit preserves `committedAt`; `deriveCriminalProfile` from convictions/warrants/keywords.
