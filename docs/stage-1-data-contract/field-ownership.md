# Field Ownership, Copies, and Lineage

This register answers the Stage 1 question: **which object owns this fact today,
which copies exist, and what consumes them?** “Intended owner” is not silently
substituted for actual behavior. An authority marked **ambiguous** means current
writers can make more than one copy win.

## Identity and case facts

| Fact | Principal writers | Persisted paths | Effective owner | Important readers | Classification / risk |
|---|---|---|---|---|---|
| Person ID | `createPerson()`; Case and Book-In promotion (`functions/model/person.js:56-87`; `functions/model/store.js:107-135,1117-1427`) | `Person.personId`, `Lead.subjectPersonId`, EncounterSubject, Book-In, Arrest/Narrative snapshots | Person identity, but copied joins are manually maintained | Case/Encounter pickers, Book-In, Narrative, Map, reports | required ID + references; dangling/mismatched copies possible |
| Legal name | Lead/Case identity cards; Book-In (`functions/model/collect.js`; `functions/book-in.js`) | `Lead.person.name`, `workspace.people`, EncounterSubject scalars, Book-In top-level/`formState`, output snapshots | **Ambiguous:** Lead Person and registry both write | all identity UI, Narrative, PDFs, target sheet, baseball card, reports | duplicate; stale Lead save can overwrite registry |
| DOB | Case or Book-In | Person `dateOfBirth`; Book-In top-level/`formState`; output snapshots | Person intended; Book-In remains independent editable source | age, Book-In/warrant/baseball outputs, Narrative | duplicate |
| Age | form helper and Book-In collection (`functions/age.js`; Person factory accepts it) | `Person.age`, Book-In controls/top-level, output snapshots | none; DOB is the reconstructable source | cards, PDFs, Narrative | derived + persisted; becomes stale |
| A-number | Case immigration or Book-In | `Person.immigration.alienNumber`, Book-In `aNumber`/`formState`, snapshots | **Ambiguous** across Case and Book-In | joins/fallback search, PDFs, Narrative, reports | duplicate; uniqueness not enforced |
| FBI/NCIC/state identifiers | Case criminal card or Book-In | `Person.criminal.*`, Book-In top-level/control snapshots | Person intended, Book-In duplicates selected fields | reports, booking and Narrative | duplicate/optional |
| Case role | Lead/Case workflow and Book-In promotion | `Lead.caseRole`, `Person.caseRole` | Lead workflow appears primary; save mirrors into Person | Case lists, target selection, operations | duplicate role; not a separate Target entity |
| Encounter role | Encounter Subject editor / Book-In bridge | `EncounterSubject.encounterRole`, Book-In role fields, Narrative snapshot | EncounterSubject for event context | completion, Narrative, Oracle | event-owned; must not be merged with Case role |
| Occupant/vehicle role | Encounter/Book-In | EncounterSubject `vehicleRole`; Book-In `vehiclePosition`/formState; Arrest copy | EncounterSubject intended for event | Narrative, reports | duplicate |
| SSN/LexID | Case identity card | Person fields in Lead and registry | **Ambiguous Person copies** | search/Case views/import/export | sensitive duplicate if registry/embed drift |

## Encounter, arrest, and booking facts

| Fact | Principal writers | Persisted paths | Effective owner | Important readers | Classification / risk |
|---|---|---|---|---|---|
| Encounter ID | `nextEncounterId()` / `createEncounterRecord()` (`functions/model/encounter.js:15-49,315-394`) | Workspace map key, `Encounter.encounterId`, EncounterSubject shared copy, Arrest, Book-In, Narrative | Encounter | every encounter-dependent workflow | human-readable sequential ID; concurrent mint collision possible |
| Encounter time | Encounter root and Book-In form | `Encounter.startedAt`, subject `shared.startedAt`, Arrest date/time fields, Book-In fields, completed snapshot | Encounter intended for linked workflows; standalone Book-In is independent | Narrative, PDFs, Map, Oracle, reports | duplicated and projected |
| Center/arrest location | Encounter location editor; Book-In form; geocoder | Encounter `locations[]` + `centerLocationId`; subject shared address/coords; Arrest text/coords; Book-In; Association; completed pin | Encounter center intended for linked event; no single enforced copy | Narrative, PDFs, Map, Oracle, reports | high-risk multi-shape duplication |
| Officer participants | Encounter officer selector | `Encounter.officerIds[]`; subject arresting officer; Arrest ID/text; Book-In; Association source; Admin `fieldArrests` | Encounter assignment and subject arresting officer are separate facts | Narrative, operations, reports, statistics | IDs plus free text; no FK |
| Subject outcome | Encounter Subject editor; booking forces arrest | `EncounterSubject.outcome/custody`; Book-In fields; Person Arrest existence; completed counts; Narrative snapshot | EncounterSubject intended | completion, Narrative, Oracle | duplicate; Stage 0 proves adapter can falsify outcome |
| Flight/techniques/use of force | Encounter Subject editor | EncounterSubject fields; completed snapshot; Narrative source snapshot | EncounterSubject | Narrative, Oracle readiness | event-owned; analytics completeness depends on operator entry |
| Book-In ID | Book-In record creation (`functions/book-in.js:1276-1286`) | Book-In `id`; EncounterSubject/Arrest/BaseballCard `bookinRecordId` | Book-In record | reopen, Narrative join, reports | cross-store join; delete does not cascade |
| Book-In form values | live `bookin.html` controls | dynamic `formState[controlId]`; selected top-level search fields; Arrest booking subset | field-dependent; `formState` restores and feeds documents | Saved Records, CAP/medical PDFs, promotion, reports | DOM IDs are persisted schema; duplicate top-level fields |
| Arrest ID | `createArrest()` / Book-In promotion (`functions/model/person.js:174-208`; `functions/model/store.js`) | embedded `Person.arrests[]`; Book-In optional `arrestId` | committed Lead Person is principal report source | Arrest Report, Oracle, Map | embedded entity; registry copy can drift |
| Arrest date/time | Encounter/Book-In promotion | Arrest scalar fields, Encounter root/shared, Book-In, completion snapshot | split | PDFs, Narrative, report, Oracle/Map | duplicate; rollover/fallback rules vary |
| Arrest location | Encounter/Book-In promotion | Arrest text/coords, Encounter Location/shared/pin, Book-In | split | same as above | duplicate |
| Booking medical/property/cash | Book-In form | Book-In `formState`; embedded `Arrest.booking` subset | Book-In for editing/PDF; Arrest is reporting projection | custody/medical output, Narrative fragments | duplicate; no invalidation contract |
| Generated-doc timestamp | Encounter Book action / Book-In generation path | `EncounterSubject.docsGeneratedAt` and file download only | marker only; no Document entity | Encounter UI | derived side-effect marker can outlive failed/cancelled generation |
| Completed outcome counts | Complete Encounter (`functions/model/store.js:2110-2197`) | `Encounter.completed.outcomeCounts` and history snapshots | completion snapshot | Oracle, Map, review | derived persisted snapshot; not automatically refreshed |

## Shared objects and relationships

| Fact | Principal writers | Persisted paths | Effective owner | Important readers | Classification / risk |
|---|---|---|---|---|---|
| Vehicle identity | Case/Encounter/Investigation object cards | `workspace.vehicles{}`, Lead/Encounter embeds, operation freezes, Book-In controls | **Ambiguous:** dictionary intended, aggregates can write backward | Case/Encounter/Investigation/Operation, Narrative, Map | stale embed can roll back canonical edit |
| Plate | Vehicle cards/import | `licensePlate` and legacy `plate`, embeds, Book-In, Operation freeze | Vehicle intended | search, Narrative, Map, reports | duplicated alias plus snapshots |
| Location/address | Person/Vehicle/Encounter/Investigation cards | `workspace.locations{}`, nested copies, Association, Book-In, completion, geocode cache | **Ambiguous** | Map/GEOINT, Narrative, target sheet, documents | entity/value/projection roles overlap |
| Coordinates | location editor/geocoder/map drag | Location copies, Encounter shared/pin, Arrest, geocode cache | linked Location/Encounter context dependent | Map, Oracle, Narrative | duplicate; precision/source usually absent |
| Relationship type/dates | relationship/location cards | canonical Association plus embedded Link/nested occupancy fields | Association intended, not fully enforced | Case/Investigation graphs, Map | writable projections and upsert-only paths |
| Relationship provenance | association commands | `Association.source` plus link citations | Association | graph/integrity | partial: no universal confidence or field-level source |
| Operation target identity | Operation target import | `OperationTarget.leadId/personId` plus `freeze` label/media/places/vehicles | refs for current identity; freeze for issued plan | Operation view/brief; Encounter seed | ref + intentional snapshot |
| Operation team/member | Operation planner | embedded teams/members/assignments | Operation | brief and Encounter seed | not the same as Officer organizational team |
| Officer identity | Admin Officer form | Admin Officer; IDs/display values copied to events/reports | Admin | Encounter, Operation, Narrative, reports | authoritative current roster; historical display snapshot weak |
| Officer arrest count | Book-In side effect and report derivation | `Officer.fieldArrests` plus counts derived from Person Arrests | none consistently | Admin dashboard/roster | derived duplicate; paths can disagree |

## Narrative, media, and output facts

| Fact | Principal writers | Persisted paths | Effective owner | Important readers | Classification / risk |
|---|---|---|---|---|---|
| Narrative ID | Narrative page/domain (`functions/narratives/narrative-page.js`; `build9/narrative-domain.js`) | `Encounter.narratives[].narrativeId` | Narrative record | Narrative page, coverage, summary | current primary ID derives from adapter participant ID |
| Narrative participant | Encounter adapter | focus/related adapter IDs, source snapshot | should identify EncounterSubject; current adapter can synthesize unstable IDs | coverage, saved narrative selection | derived reference; Stage 0 proves instability |
| Narrative selections/overrides | Build 9 UI | `NarrativeRecord.engine.state`, bindings and output section variants | Narrative record | resolver/export | intentional editable state |
| Narrative final text | resolver/manual editor | section generated/resolved/manual/final fields and `output.finalPlainText` | `finalPlainText` for current output | copy/TXT/JSON, supervisor summary indirectly | intentional editorial duplication; completed Encounter omits it |
| Supervisor summary | Build 9 summary builder | `Encounter.supervisorSummary` | derived from narrative/coverage | Encounter review | derived persisted; freshness is not reliably invalidated |
| Media bytes | picker/import/warrant | IDB `blobs[[mediaId,role]].blob` | Media IndexedDB | media cards, documents, export/backup | authoritative bytes; hash metadata validates but no FK |
| Media metadata | picker/import | IDB `meta[mediaId]` | Media IndexedDB | owner media cards, primary selection, exports | primary/owner invariants enforced only in Media paths |
| Warrant generated file | warrant issue | Media file row plus `Person.warrants[].mediaId` | split across Media and Person Warrant | reopen/output/history | Media may commit before Warrant save fails |
| Baseball Card output | baseball page | embedded Person card text/html/settings/media refs; style key | saved card snapshot | arrest report/package/print | derived intentional snapshot |
| CAP/medical PDFs | Book-In live DOM | downloaded bytes only | no persistent Document record | operator/file system | generator can differ from saved Book-In record |
| Operation order | Operation commit | `Operation.order` | Operation snapshot | operation view/brief | derived intentional snapshot |

## Current aliases and terminology

| Names | Current relationship | Freeze rule |
|---|---|---|
| Case / Lead | same current aggregate; UI says Case, model says Lead | Do not rename storage/API until an explicit migration/adapter exists. |
| Person / subject | Person is reusable identity; EncounterSubject is event participation | Keep separate. |
| Target / Detainee | roles/lifecycle state on Lead/Person/EncounterSubject, not separate Person-like entities | Do not create duplicate identity entities during migration. |
| `id` / `vehicleId` / `locationId` / `officerId` | compatibility aliases coexist | Preserve and diagnose mismatches until cutover policy exists. |
| `plate` / `licensePlate` | same Vehicle fact | Treat `licensePlate` as current long-form field, but retain legacy reads. |
| Encounter / PersonEncounter | top-level field event vs embedded history/projection row | Never infer that both shapes are interchangeable. |
| Team / operation cell | organizational label versus embedded tactical assignment | Do not join solely by display name. |

## Change-impact rule

Any field change must trace four directions before implementation:

1. writers: DOM collectors, factories, promotion/sync code, imports;
2. stored copies: registry records, embeds, snapshots, auxiliary keys and blobs;
3. joins: IDs in query strings and across Workspace/Admin/Book-In/Media;
4. readers: cards, Narrative bindings, reports/PDFs, Map, Oracle and exports.

The machine manifest encodes these directions for the high-impact fields. A
constructor-only rename is not safe because imports and raw readers bypass
constructors.
