# Current Master Schema

This is a normalized **description** of the shapes COPDoc currently writes and
reads. COPDoc does not physically persist this as one normalized schema. Blank
strings are commonly used instead of `null`; older/imported rows may omit
factory defaults; plain-object imports may retain additional fields.

Evidence anchors:

- Workspace root/read/write/normalization: `functions/model/store.js:18-35,164-282`
- Lead: `functions/model/lead.js:23-105`
- Person children: `functions/model/person.js:19-279`
- Location/Vehicle: `functions/model/location.js:18-103`,
  `functions/model/vehicle.js:16-122`
- Association/Link: `functions/model/link.js:21-335`
- Investigation/Operation/Encounter: `functions/model/investigation.js`,
  `functions/model/operation.js`, `functions/model/encounter.js:15-394`
- Admin: `functions/admin.js:92-100,303-404`; Officer factory:
  `functions/model/officer.js:9-170`
- Book-In: `functions/book-in.js:1276-1326,1455-1508,2895-3038`
- Media: `functions/model/media.js:164-270`
- Narrative: `functions/narratives/build9/narrative-domain.js:167-243,341-411`

## Classification legend

- `required-current` — a current constructor/save path establishes or expects it.
- `optional` — absence or an empty value is tolerated.
- `reference` — identifies another object/store; no foreign key is enforced.
- `duplicate` — the same fact is persisted elsewhere.
- `derived` — calculated/projected from other facts but persisted.
- `snapshot` — deliberately records a fact at a point in time.
- `legacy` — compatibility field/alias or historical shape.
- `dynamic` — observed writers/readers accept undeclared additional properties.

## TypeScript-style effective schema — Workspace root, Lead, and Person

```ts
type ISODateTime = string;
type GenericId = string;

interface LifecycleMeta {
  createdAt: ISODateTime;              // required-current
  updatedAt: ISODateTime;              // required-current, derived on save
  markedComplete: boolean;             // required-current
  completedAt?: ISODateTime;           // optional, derived on complete
  status: "draft" | "committed" | string;
  committedAt: ISODateTime | "";
  [legacyOrUnknown: string]: unknown;   // imported/older rows can survive merges
}

interface WorkspaceState {
  schema: "copdocx.store.v1" | string;
  currentLeadId: string;               // persisted UI pointer; Lead reference
  people: Record<string, Person>;
  leads: Record<string, Lead>;
  encounters: Record<string, FieldEncounter>;
  investigations: Record<string, Investigation>;
  vehicles: Record<string, Vehicle>;
  locations: Record<string, Location>;
  businesses: Record<string, Business>;
  entities: Record<string, CustomEntity>;
  associations: Record<string, Association>;
  operations: Record<string, Operation>;
  [legacyOrUnknown: string]: unknown;
}

interface Lead {
  schema: "copdocx.lead.v1" | string;
  leadId: GenericId;                   // required-current, primary ID
  subjectPersonId: GenericId;          // required-current, Person reference
  caseRole: "LEAD" | "TARGET" | "DETAINEE" | string;
  source: LeadSource;
  person: Person;                      // duplicate writable Person copy
  vehicles: Vehicle[];                 // duplicate writable Vehicle copies
  links: Link[];                       // Association citations/projections
  followUps: Array<Record<string, unknown>>;
  history: HistoryEvent[];
  assignedOfficerId: string;           // optional Admin Officer reference
  meta: LifecycleMeta;
  people?: Person[];                   // legacy subjectOf fallback
  locations?: Location[];              // legacy/read compatibility
  [legacyOrUnknown: string]: unknown;
}

interface LeadSource {
  leadSource: string;
  caseNumber: string;
  refAgency: string;
  refAgencyCode: string;
  probationCheck: boolean;
  leadInfo: string;
  [legacyOrUnknown: string]: unknown;
}

interface HistoryEvent {
  eventId?: GenericId;
  at: ISODateTime;
  type: string;
  text: string;
  source: string;
  officerId?: string;                  // Admin Officer reference
  officerAlias?: string;               // duplicate display snapshot
  bookinRecordId?: string;             // Book-In cross-store reference
  [legacyOrUnknown: string]: unknown;
}

interface Person {
  personId: GenericId;                 // required-current, primary ID
  entityType: "PERSON";
  caseRole: string;                    // duplicate of Lead workflow role
  junked: boolean;
  junkedAt: ISODateTime | "";
  name: PersonName;
  sex: string;
  dateOfBirth: string;
  age: string | number;                // derived but persisted
  citizenship: string;
  ssn: string;
  lexId: string;
  locations: Location[];               // duplicate relationship projection
  aliases: Alias[];
  documents: IdentityDocument[];
  criminal: CriminalProfile;
  encounters: PersonEncounter[];       // legacy rows + FieldEncounter projections
  arrests: Arrest[];
  convictions: Conviction[];
  warrants: Warrant[];
  immigration: ImmigrationProfile;
  [legacyOrUnknown: string]: unknown;
}

interface PersonName {
  lastName: string;
  firstName: string;
  middleName: string;
  [legacyOrUnknown: string]: unknown;
}

interface Alias {
  aliasId: GenericId;
  lastName: string;
  firstName: string;
  middleName: string;
  [legacyOrUnknown: string]: unknown;
}

interface IdentityDocument {
  documentId: GenericId;
  documentType: string;
  documentNumber: string;
  issuingState: string;
  issuingCountry: string;
  documentIssueDate: string;
  documentExpiration: string;
  [legacyOrUnknown: string]: unknown;
}

interface PersonEncounter {            // not the FieldEncounter aggregate
  encounterId: string;
  subjectId?: string;
  personId?: string;
  encounterDate: string;
  encounterRole: string;
  encounterType: string;
  encounterDisposition: string;
  encounterAgency: string;
  encounterAgencyCode?: string;
  encounterReportNumber: string;
  encounterLocation: string;
  encounterNarrative: string;
  [legacyOrUnknown: string]: unknown;
}

interface Arrest {
  arrestId: GenericId;
  arrestDate: string;
  arrestTime: string;
  arrestDateTime: string;
  arrestCharge: string;
  arrestStatute: string;
  arrestClass: string;
  arrestAgency: string;
  arrestAgencyCode: string;
  arrestLocation: string;              // duplicate/derived event place text
  latitude: string;
  longitude: string;
  arrestingOfficer: string;            // duplicate display text
  arrestingOfficerId?: string;         // optional Admin Officer reference
  team: string;
  iceEventNumber: string;
  encounterNumber: string;
  encounterId: string;                 // FieldEncounter reference
  subjectRole: string;
  vehiclePosition: string;
  bookinRecordId: string;              // Book-In reference
  bookInDateTime: string;
  booking: ArrestBookingProjection;    // duplicate Book-In subset
  [legacyOrUnknown: string]: unknown;
}

interface ArrestBookingProjection {
  cash: string;
  travelDocuments: string;
  propertyTag: string;
  holdingCellNumber: string;
  children: string;
  medical: Record<string, unknown>;
  [legacyOrUnknown: string]: unknown;
}

interface Conviction {
  convictionId: GenericId;
  crime: string;
  convictionStatute: string;
  convictionClass: string;
  disposition: string;
  convictionDate: string;
  dispositionDate: string;
  court: string;
  docketNumber: string;
  sentence: string;
  county?: string;
  state?: string;
  [legacyOrUnknown: string]: unknown;
}

interface Warrant {
  warrantId: GenericId;
  charge: string;
  warrantNumber: string;
  warrantDate: string;
  warrantStatus: string;
  warrantIssuer: string;
  warrantIssuerCode: string;
  formType: "I-200" | "I-205" | string;
  fileNo: string;
  pdfFileName: string;
  office: string;
  officerName: string;
  officerTitle: string;
  basis: string[];
  inaLaw: string;
  entryPlace: string;
  entryDate: string;
  issuedAt: ISODateTime | "";
  mediaId: string;                     // optional Media reference
  [legacyOrUnknown: string]: unknown;
}

interface CriminalProfile {
  isCriminal: boolean;                 // derived, persisted
  hasCriminalRecord: boolean;          // derived, persisted
  hasCriminalWarrants: boolean;        // derived, persisted
  foreignWarrantsKnown: boolean;
  hasForeignWarrants: boolean;
  foreignWarrantCountry: string;
  sexOffender: boolean;                // text/record-derived, persisted
  foreignFugitive: boolean;            // text/record-derived, persisted
  armed: boolean;                      // text/record-derived, persisted
  threatLevel: string;                 // derived, persisted
  fbiNumber: string;
  ncicNumber: string;
  stateId: string;
  rapSheet: string;
  [legacyOrUnknown: string]: unknown;
}

interface ImmigrationProfile {
  alienNumber: string;
  finNumber: string;
  disposition: string;
  status: string;
  finalOrder: boolean;
  finalOrderDate: string;
  firstDeportationDate: string;
  lastDeportationDate: string;
  baseballCards: BaseballCard[];
  [legacyOrUnknown: string]: unknown;
}

interface BaseballCard {
  cardId: GenericId;
  generatedAt: ISODateTime;
  text: string;                        // derived output snapshot
  html: string;                        // derived output snapshot
  photoMediaId: string;                // Media reference
  arrestDate: string;
  disposition: string;
  bookinRecordId: string;              // Book-In reference
  foreignWarrantsKnown: boolean;
  hasForeignWarrants: boolean;
  foreignWarrantCountry: string;
  photoDataUrl?: string;               // legacy inline-media field
  [legacyOrUnknown: string]: unknown;
}
```

## Cross-store, Narrative, and auxiliary schemas

```ts
interface NarrativeRecord {
  schema: "copdoc.narrative.v2";
  recordType: "NARRATIVE";
  narrativeId: string;
  encounterId: string;                  // FieldEncounter reference
  narrativeKind:
    | "PRIMARY_SUBJECT"
    | "SUBJECT_SUPPLEMENT"
    | "ENCOUNTER_OVERVIEW"
    | "ENCOUNTER_SUPPLEMENT";
  focusEncounterParticipantId: string | null;
  relatedEncounterParticipantIds: string[];
  title: string;
  sequence: number;
  workflowStatus: "DRAFT" | "FINALIZED";
  freshnessStatus: "CURRENT" | "STALE" | "UNKNOWN";
  engine: {
    version: string | null;
    build: 9;
    stateSchema: string;
    state: object | null;
  };
  output: {
    schema: "copdoc.narrative-output.v3";
    sections: NarrativeOutputSection[];
    generatedResolvedText: string;
    finalPlainText: string;
    plainTextIsManual: boolean;
  };
  bindings: object[];
  factsManifest: object | null;
  validationSnapshot: object | null;
  sourceSnapshot: object | null;
  notes: string | null;
  recordState: "ACTIVE" | "ARCHIVED" | "VOIDED" | "SUPERSEDED";
  revision: number;
  createdAt: string;
  updatedAt: string;
  [legacyOrUnknown: string]: unknown;
}

interface NarrativeOutputSection {
  sectionId: string;
  templateText?: string;
  generatedText?: string;
  resolvedText?: string;
  manualText?: string;
  finalText?: string;
  sourceRefs?: unknown[];
  [engineField: string]: unknown;
}

interface BookInRecord {
  id: string;                           // UUID or timestamp/random fallback
  createdAt: string;
  updatedAt: string;
  createdWithVersion?: string;          // full-form writer; absent in quick-book
  updatedWithVersion?: string;          // full-form writer; absent in quick-book
  revision?: number;
  firstName: string;
  lastName: string;
  aNumber: string;
  fbiNumber?: string;                   // full-form/index projection
  iceEvent?: string;                    // full-form/index projection
  encounterNumber?: string;             // full-form/index projection
  subjectRole: string;
  vehiclePosition: string;
  dateTime: string;
  arrestTime: string;
  foreignWarrants?: "yes" | "no" | string;
  foreignWarrantCountry?: string;
  dateOfBirth: string;
  countryOfCitizenship: string;
  caseType?: string;
  team: string;
  encounterId: string;                  // FieldEncounter reference
  encounterRole: string;
  leadId: string;                       // Lead reference
  personId: string;                     // Person reference
  arrestId?: string;                    // embedded Arrest reference
  officersName?: string;                // quick-book and full-form variants
  formState: Record<string, FormControlSnapshot>;
  [indexedOrLegacyField: string]: unknown;
}

interface FormControlSnapshot {
  checked: boolean;
  type: string;
  value: string;
  [legacyOrUnknown: string]: unknown;
}

interface AdminState {
  officers: Officer[];
  vehicles: Vehicle[];                  // government/fleet Vehicle variant
  shifts: Shift[];
  [legacyOrUnknown: string]: unknown;
}

interface Officer {
  officerId: GenericId;
  id: GenericId;                        // duplicate compatibility alias
  entityType: "OFFICER";
  lastName: string;
  firstName: string;
  middleName: string;
  badge: string;
  callSign: string;
  duty: string;
  role: string;
  team: string;
  eod: string;
  phoneGov: string;
  phonePrivate: string;
  address?: Record<string, unknown>;    // legacy mirrored address shape
  locations: Location[];
  qualifications: string[];
  qualOther: string;
  equipment: string[];
  equipNotes: string;
  fieldArrests?: Array<Record<string, unknown>>; // derived/imperative cache
  meta: LifecycleMeta;
  [legacyOrUnknown: string]: unknown;
}

interface Shift {
  id: GenericId;
  date: string;
  officerId: string;                    // Officer reference
  vehicleId: string;                    // Admin fleet Vehicle reference
  start: string;
  end: string;
  assignment: string;
  [legacyOrUnknown: string]: unknown;
}

interface MediaMetadata {
  mediaId: GenericId;
  entityType: "MEDIA";
  schema: "copdocx.media.v1";
  mediaClass: "photo" | "file";
  owner: Endpoint;
  ownerKey: string;                     // derived `${type}:${id}`
  ownerSha: string;                     // derived owner+content hash
  kind: string;
  documentType: string;
  caption: string;
  captionCustom: boolean;
  takenAt: string;
  takenAtPrecision: string;
  takenAtApproximate: boolean;
  takenAtSource: string;
  place: string;
  tags: string[];
  notes: string;
  mime: string;
  bytes: number;
  width: number;
  height: number;
  originalName: string;
  sha256: string;
  roles: Array<"original" | "display" | "thumb" | string>;
  crop: object | null;
  primary: boolean;
  documentId: string;
  meta: LifecycleMeta;
  [legacyOrUnknown: string]: unknown;
}

interface MediaBlobRow {
  mediaId: GenericId;
  role: "original" | "display" | "thumb" | string;
  blob: Blob;
  mime?: string;
  bytes?: number;
  [legacyOrUnknown: string]: unknown;
}

interface MapViewsState {
  home: MapView | null;
  presets: MapView[];
  [legacyOrUnknown: string]: unknown;
}

interface MapView {
  id?: GenericId;
  name?: string;
  center?: { latitude?: number | string; longitude?: number | string };
  zoom?: number;
  [mapViewField: string]: unknown;
}

interface MapMarkupState {
  labels: Array<Record<string, unknown>>;
  arrows: Array<Record<string, unknown>>;
  [legacyOrUnknown: string]: unknown;
}

interface WarrantSettings {
  office?: string;
  officerId?: string;
  officerName?: string;
  officerTitle?: string;
  [setting: string]: unknown;
}

interface BaseballCardStyle {
  [styleControl: string]: string | number | boolean | null | undefined;
}

interface InvestigationWindowState {
  [windowId: string]: {
    open?: boolean;
    left?: number;
    top?: number;
    width?: number;
    height?: number;
    [uiField: string]: unknown;
  };
}

interface IntegrityReport {
  schema: "copdocx.integrity-report.v1";
  scanner: {
    version: string;
    ruleset: string;
  };
  generatedAt: ISODateTime;
  readOnly: true;
  inputs: {
    workspace: Record<string, unknown>;
    admin: Record<string, unknown>;
    bookin: Record<string, unknown>;
    media: Record<string, unknown>;
    registered: Array<Record<string, unknown>>;
  };
  summary: {
    status: "pass" | "attention" | "unsafe";
    totalFindings: number;
    retainedFindings: number;
    suppressedFindings: number;
    counts: Record<string, number>;
    byCategory: Record<string, number>;
    scanned: Record<string, number>;
    blockedChecks: string[];
  };
  findings: Array<Record<string, unknown>>;
}

interface SafetyBackupV1 {
  format: "copdocx.safety-backup.v1";
  schemaVersion: 1;
  metadata: Record<string, unknown>;
  stores: {
    localStorage: RawStoreCapture[];
    sessionStorage: RawStoreCapture[];
    media: Record<string, unknown>;
    warrants: Record<string, unknown>;
  };
  verification: Record<string, unknown>;
  integrityReport: Record<string, unknown> | null;
}

interface RawStoreCapture {
  id: string;
  key: string;
  owner: string;
  portable: boolean;
  exists: boolean;
  raw: string | null;
  byteLength: number;
  sha256: string | null;
}
```

## Effective entity relationships

```mermaid
erDiagram
    LEAD ||--|| PERSON_SNAPSHOT : embeds
    PERSON_REGISTRY ||--o{ LEAD : "same personId"
    LEAD ||--o{ VEHICLE_SNAPSHOT : embeds
    PERSON_SNAPSHOT ||--o{ LOCATION_SNAPSHOT : embeds
    PERSON_SNAPSHOT ||--o{ ARREST : owns
    PERSON_SNAPSHOT ||--o{ WARRANT : owns
    FIELD_ENCOUNTER ||--o{ ENCOUNTER_SUBJECT : embeds
    ENCOUNTER_SUBJECT }o--|| PERSON_REGISTRY : references
    ENCOUNTER_SUBJECT }o--o| LEAD : references
    ENCOUNTER_SUBJECT }o--o| BOOKIN_RECORD : references
    FIELD_ENCOUNTER ||--o{ NARRATIVE : embeds
    FIELD_ENCOUNTER ||--o| COMPLETED_SNAPSHOT : freezes
    ARREST }o--o| FIELD_ENCOUNTER : references
    ARREST }o--o| BOOKIN_RECORD : references
    OPERATION ||--o{ OPERATION_TARGET : embeds
    OPERATION_TARGET }o--|| LEAD : references
    OPERATION ||--o{ OPERATION_TEAM : embeds
    OPERATION_TEAM ||--o{ OPERATION_MEMBER : embeds
    OPERATION_MEMBER }o--|| OFFICER : references
    INVESTIGATION ||--o{ INVESTIGATION_NODE : embeds
    INVESTIGATION_NODE }o--|| SHARED_OBJECT : references
    ASSOCIATION }o--|| SHARED_OBJECT : from
    ASSOCIATION }o--|| SHARED_OBJECT : to
    ADMIN_STATE ||--o{ OFFICER : contains
    ADMIN_STATE ||--o{ FLEET_VEHICLE : contains
    ADMIN_STATE ||--o{ SHIFT : contains
    MEDIA_METADATA }o--|| SHARED_OBJECT : "owner ref"
```

`PERSON_SNAPSHOT`, `VEHICLE_SNAPSHOT`, and `LOCATION_SNAPSHOT` are diagram
labels for duplicated embedded roles, not declared runtime classes.
`SHARED_OBJECT` represents the polymorphic Person, Vehicle, Location, Business,
CustomEntity, Lead, Encounter, Investigation, Operation, Officer, or other
owner/association endpoint accepted by specific code paths. No relationship is
database-enforced.

## Physical root JSON

```json
{
  "schema": "copdocx.store.v1",
  "currentLeadId": "lead_example",
  "people": {},
  "leads": {},
  "encounters": {},
  "investigations": {},
  "vehicles": {},
  "locations": {},
  "businesses": {},
  "entities": {},
  "associations": {},
  "operations": {}
}
```

The Workspace root is rewritten as one JSON value. Admin is a separate JSON
object with three arrays. Book-In is a separate JSON array without a live root
schema tag. Media metadata and Blob rows live in two IndexedDB object stores.
Auxiliary map/settings/template/lab/session values each serialize independently.

## Authority notes that must not be normalized away

| Shape | Current status |
|---|---|
| `Lead.person` and `WorkspaceState.people[personId]` | Two writable copies; no reliable single authority. |
| embedded and dictionary Vehicle/Location | Two writable copies with backward projection from aggregates. |
| `Association` and embedded `Link`/nested occupancy | Association is intended authority, but projections remain write-capable. |
| `EncounterSubject` identity and Person/Book-In identity | EncounterSubject owns event role/outcome; identity is copied and can drift. |
| Book-In top-level fields and `formState` | Top-level supports lists/joins; `formState` restores/generates forms. Authority is field-dependent. |
| Arrest, Book-In and EncounterSubject | Manual cross-store join; no transaction or foreign key defines a single aggregate. |
| Operation target freeze/order | Intentional commit-time snapshot, not a competing current identity record. |
| Encounter `completed`/history | Intentional completion snapshot, but later edits can leave it stale. |
| Narrative output variants | Generated/resolved/manual/final text are editorial stages; `finalPlainText` is output authority. |


## Shared-object and operational schemas

The interfaces below complete the same current schema. They are kept as a
separate block so the physical-root and relationship diagrams remain readable.

```ts
interface Location {
  locationId: GenericId;
  id: GenericId;                       // duplicate compatibility alias
  entityType: "LOCATION";
  street: string;
  street2: string;
  city: string;
  state: string;
  zip: string;
  latitude: string;
  longitude: string;
  association: string;                 // context-dependent relation code
  parksHere: "yes" | "no" | "";
  targetPriority: string;
  pinColor: string;
  junked: boolean;
  junkedAt: string;
  occupancy: "current" | "historical" | string;
  occupiedFrom: string;
  occupiedTo: string;
  notes: string;
  otherResidents: string;
  opAssociation?: string;              // dynamic Operation-place role
  meta?: LifecycleMeta;
  [legacyOrUnknown: string]: unknown;
}

interface Vehicle {
  vehicleId: GenericId;
  id: GenericId;                       // duplicate compatibility alias
  entityType: "VEHICLE";
  licensePlate: string;
  plate?: string;                      // duplicate legacy alias
  plateState: string;
  vehicleYear: string;
  vehicleMake: string;
  vehicleModel: string;
  vehicleColor: string;
  vehicleBodyStyle: string;
  vin: string;
  registeredOwnerName: string;
  junked: boolean;
  junkedAt: string;
  locations: Location[];
  governmentVehicle: boolean;
  unit: string;
  status: string;                      // fleet availability on Admin variant
  barcode: string;
  driverNumber: string;
  assignedOfficerIds: string[];        // Admin Officer refs on fleet variant
  equipment: string[];
  occupancy: string;
  occupiedFrom: string;
  occupiedTo: string;
  notes: string;
  otherResidents: string;
  encounterDisposition?: string;
  parkedLocationText?: string;
  meta: LifecycleMeta;
  [legacyOrUnknown: string]: unknown;
}

interface Business {
  businessId: GenericId;
  id: GenericId;
  entityType: "BUSINESS";
  name: string;
  phone: string;
  notes: string;
  junked: boolean;
  junkedAt: string;
  meta: LifecycleMeta;
  [legacyOrUnknown: string]: unknown;
}

interface CustomEntity {
  entityId: GenericId;
  id: GenericId;
  entityType: "ENTITY";
  name: string;
  kind: string;
  notes: string;
  junked: boolean;
  junkedAt: string;
  meta: LifecycleMeta;
  [legacyOrUnknown: string]: unknown;
}

interface Endpoint {
  type: string;
  id: string;
}

interface Link {
  linkId: GenericId;
  associationId: string;               // optional Association reference
  from: Endpoint;
  to: Endpoint;
  reasons: string[];
  notes: string;
  label: string;
  otherType: string;
  occupancy?: string;
  validFrom?: string;
  validTo?: string;
  [legacyOrUnknown: string]: unknown;
}

interface Association {
  associationId: GenericId;
  linkId: GenericId;                   // duplicate compatibility alias
  entityType: "ASSOCIATION";
  schema: "copdocx.association.v1";
  from: Endpoint;
  to: Endpoint;
  reason: string;
  reasons: string[];
  label: string;
  otherType: string;
  occupancy: string;
  validFrom: string;
  validTo: string;
  notes: string;
  source: {
    investigationId: string;
    leadId: string;
    encounterId: string;
    officerId: string;
  };
  assertedAt: string;
  junked: boolean;
  junkedAt: string;
  [legacyOrUnknown: string]: unknown;
}

interface Investigation {
  investigationId: string;             // INV{team}-{YYYYMMDD}-{sequence}
  entityType: "INVESTIGATION";
  schema: "copdocx.investigation.v1";
  kind: "tag" | "otherLe" | "elite" | "other" | "discovered" | string;
  mode: "" | "bulk" | "solitary" | string;
  title: string;
  team: string;
  parentInvestigationId: string;        // optional self-reference
  sourceLeadId: string;                 // optional Lead reference
  assignedOfficerId: string;            // optional Admin Officer reference
  plates: InvestigationPlate[];
  nodes: InvestigationNode[];
  links: Link[];
  focusNodeId: string;                  // InvestigationNode reference
  history: HistoryEvent[];
  meta: LifecycleMeta;
  [legacyOrUnknown: string]: unknown;
}

interface InvestigationPlate {
  plateId: GenericId;
  plate: string;
  state: string;
  status: string;
  notes: string;
  vehicleId: string;                    // optional Vehicle reference
  [legacyOrUnknown: string]: unknown;
}

interface InvestigationNode {
  nodeId: GenericId;
  objectType: string;
  objectId: string;                     // polymorphic shared-object reference
  x: number;
  y: number;
  [legacyOrUnknown: string]: unknown;
}

interface Operation {
  operationId: string;                 // DAL{team}-OP-{YYYYMMDD}-{sequence}
  operationNumber: string;             // duplicate display identifier
  entityType: "OPERATION";
  schema: "copdocx.operation.v1";
  name: string;
  team: string;
  plannedStart: string;
  plannedEnd: string;
  importedTeamKeys: string[];
  targets: OperationTarget[];
  teams: OperationTeam[];
  targetAssignments: OperationTargetAssignment[];
  opLocations: Location[];
  medevacRoute: Location[];
  markup: { labels: unknown[]; arrows: unknown[] };
  mapLayers: { visible: Record<string, boolean> };
  order: OperationOrder | null;          // derived commit-time snapshot
  history: HistoryEvent[];
  meta: LifecycleMeta;
  [legacyOrUnknown: string]: unknown;
}

interface OperationTarget {
  targetId: GenericId;
  leadId: string;                       // Lead reference
  personId: string;                     // Person reference
  priority: string;
  freeze: OperationTargetFreeze | null; // intentional commit-time snapshot
  [legacyOrUnknown: string]: unknown;
}

interface OperationTargetFreeze {
  subjectLabel: string;
  photoMediaId: string;
  places: Array<Location & {
    vehicleId?: string;
    plate?: string;
    plateState?: string;
    ymm?: string;
  }>;
  vehicles: Array<{
    vehicleId: string;
    plate: string;
    plateState: string;
    ymm: string;
    atLocationId: string;
  }>;
  [legacyOrUnknown: string]: unknown;
}

interface OperationTeam {
  teamId: GenericId;
  name: string;
  rosterKey: string;
  vehicleId: string;                    // optional Admin fleet Vehicle ref
  members: OperationMember[];
  [legacyOrUnknown: string]: unknown;
}

interface OperationMember {
  officerId: string;                    // Admin Officer reference
  assignmentRole: "eye" | "contact" | "primary-backup" | "backup" | "";
  start: { latitude?: string; longitude?: string } | null;
  heading: string | number;
  sector: string;
  scans: string;
  notes: string;
  [legacyOrUnknown: string]: unknown;
}

interface OperationTargetAssignment {
  targetId: string;                     // OperationTarget reference
  teamId: string;                       // OperationTeam reference
  [legacyOrUnknown: string]: unknown;
}

interface OperationOrder {
  generatedAt: ISODateTime;
  narrative: string;
  officerBriefs: OfficerBrief[];
  [legacyOrUnknown: string]: unknown;
}

interface OfficerBrief {
  officerId: string;
  teamId: string;
  teamName: string;
  role: string;
  primary: string;
  secondary: string;
  targetLabel: string;
  address: string;
  start: object | null;
  heading: string | number;
  sector: string;
  scans: string;
  rally: string;
  medevac: string;
  teammates: string[];
  [legacyOrUnknown: string]: unknown;
}

interface FieldEncounter {
  encounterId: string;                 // {office}{team}-{YYYYMMDD}-{sequence}
  entityType: "ENCOUNTER";
  schema: "copdocx.encounter.v1";
  officeCode: string;
  team: string;
  startedAt: string;
  eventType: string;
  operationId: string;                 // optional Operation reference
  officerIds: string[];                // Admin Officer references
  centerLocationId: string;            // embedded/canonical Location reference
  vehicles: Vehicle[];                 // writable duplicate event copies
  locations: Location[];               // writable duplicate event copies
  subjects: EncounterSubject[];
  links: Link[];
  narratives: NarrativeRecord[];
  supervisorSummary: SupervisorSummary;// derived and persisted
  completed: EncounterCompleted | null; // completion snapshot
  completedHistory: EncounterCompletionHistory[];
  unlock?: EncounterUnlock | null;
  meta: LifecycleMeta;
  [legacyOrUnknown: string]: unknown;
}

interface EncounterSubject {
  subjectId: GenericId;
  personId: string;                    // Person reference
  leadId: string;                      // optional Lead reference
  bookinRecordId: string;              // optional Book-In reference
  lastName: string;                    // duplicate identity snapshot
  firstName: string;                   // duplicate identity snapshot
  alienNumber: string;                 // duplicate identity snapshot
  citizenship: string;                 // duplicate identity snapshot
  encounterRole: "TARGET" | "COLLATERAL" | string;
  roleOther: string;
  vehicleRole: "DRIVER" | "PASSENGER" | string;
  custody: string;
  outcome: "ARRESTED" | "RELEASED" | "FLED_FOOT" | "FLED_VEHICLE" | string;
  releaseReason: string;
  techniques: string[];
  unidentified: boolean;
  notes: string;
  packetFiledAt: string;
  fledAt: string;
  fledAtPrecision: string;
  arrestingOfficerId: string;           // Admin Officer reference
  compliance: string;
  useOfForce: string;
  forceLevel: string;
  docsGeneratedAt: string;
  shared: SharedStop;                   // derived duplicate of Encounter root
  [legacyOrUnknown: string]: unknown;
}

interface SharedStop {
  encounterId: string;
  startedAt: string;
  eventType: string;
  operationId: string;
  officerIds: string[];
  team: string;
  officeCode: string;
  centerLocationId: string;
  city: string;
  address: string;
  latitude: string;
  longitude: string;
  vehicles: Array<{
    vehicleId: string;
    vehicleColor: string;
    vehicleMake: string;
    vehicleModel: string;
    licensePlate: string;
    plateState: string;
    encounterDisposition: string;
  }>;
  [legacyOrUnknown: string]: unknown;
}

interface SupervisorSummary {
  text: string;
  derivedAt: string;
  coverage: object | null;
  [legacyOrUnknown: string]: unknown;
}

interface EncounterCompleted {
  schema: "copdocx.encounter-snapshot.v1";
  generatedAt: string;
  encounterId: string;
  startedAt: string;
  eventType: string;
  operationId: string;
  officerIds: string[];
  centerLocationId: string;
  team: string;
  officeCode: string;
  subjects: EncounterSubject[];
  locations: Array<Location & { isCenter: boolean }>;
  vehicles: Array<Record<string, unknown>>;
  outcomeCounts: { arrested: number; released: number; fled: number };
  supervisorSummary: object;
  pin: null | {
    latitude: string;
    longitude: string;
    arrestLocation: string;
    locationId: string;
  };
  [legacyOrUnknown: string]: unknown;
}

interface EncounterCompletionHistory {
  generatedAt: string;
  unlockedAt: string;
  unlockedByAlias?: string;
  reason: string;
  snapshot: EncounterCompleted;
  [legacyOrUnknown: string]: unknown;
}

interface EncounterUnlock {
  unlockedAt: string;
  reason: string;
  unlockedByAlias: string;
  [legacyOrUnknown: string]: unknown;
}
```
