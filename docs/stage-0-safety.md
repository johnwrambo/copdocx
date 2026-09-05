# Stage 0 safety baseline

**Status:** implementation and verification contract

**Scope:** observation, characterization, and recovery capture only

**Integrity report schema:** `copdocx.integrity-report.v1`

**Safety backup format:** `copdocx.safety-backup.v1`

## 1. Purpose

Stage 0 makes COPDoc's current failure modes visible and preserves the browser's
existing data before later stages change persistence behavior. It has three
deliverables:

1. A manually started, read-only integrity scan.
2. Automated characterization tests for known failure paths.
3. A byte-preserving safety backup with strict capture verification.

Stage 0 does not decide which conflicting record is correct. A mismatch is
reported as evidence, and every conflicting copy remains untouched.

## 2. Hard boundary

Stage 0 may read, compare, hash, summarize, and download. It must not:

- repair, normalize, migrate, merge, deduplicate, delete, or create a domain
  record;
- generate missing IDs or lifecycle metadata;
- select an authoritative copy when embedded and canonical records disagree;
- increment an application storage schema;
- change save, import, booking, narrative, or deletion behavior;
- persist an integrity report into a COPDoc application store;
- request or change warrant-directory permissions;
- run an integrity scan automatically during ordinary page startup; or
- claim that a backup is restorable until an isolated-profile restore test has
  passed.

The diagnostic page must not load application modules that mutate or normalize
while reading. In particular, normal Store loading can normalize parsed state,
Admin loading can migrate and rewrite rows, and normal IndexedDB open paths can
create a missing database. The diagnostic reader must inspect the registered
stores directly.

Generating a report or safety-backup download is an explicit user action. The
download itself is the only Stage 0 output with an external side effect; no
application storage may change.

## 3. Manual read-only integrity scan

The intended entry point is `integrity.html`. The page exposes an explicit
**Run scan** action and does not scan automatically. The public scanner API is:

```js
await COPDoc.integrity.scanCurrent();

COPDoc.integrity.scanSnapshot(
  { workspace, admin, bookin, media },
  options
);
```

`scanCurrent()` owns browser reads. `scanSnapshot()` is the deterministic,
side-effect-free rule engine used by tests. It must not depend on mutable
singletons from `store.js`, `admin.js`, `book-in.js`, or `media.js`.

### 3.1 Snapshot rules

- Read each registered browser-storage key independently and retain the exact
  raw value.
- Treat a missing key, an empty value, malformed JSON, an inaccessible store,
  and a valid empty object or array as different states.
- Parse JSON only after the raw value has been retained. Never replace malformed
  input with `{}` or `[]`.
- Treat `copdocx.location-map.basemap` as a raw scalar, not JSON.
- Preserve legacy aliases such as `id`/`vehicleId`, `id`/`officerId`, and
  `id`/`locationId` while reporting their use.
- Treat recognized legacy records without `meta` as legacy-compatible evidence,
  not automatic corruption.
- Re-read or re-hash source storage at scan completion. If it changed during the
  scan, mark the report `NON_ATOMIC_SNAPSHOT`.
- Continue scanning independent stores when one store is malformed or blocked.
- Bound retained examples while counting every occurrence. Large scans must not
  create an unbounded findings payload.
- Do not include raw names, A-numbers, medical answers, documents, narrative
  text, or blob contents in the default report. Use record IDs, store IDs, field
  paths, counts, and rule codes.

### 3.2 IndexedDB rules

The ordinary integrity scan inspects Media structure and keys, not media-file
payloads.

- Use `indexedDB.databases()` first when available to establish whether a known
  database exists.
- If safe database enumeration is unavailable, report the database as unscanned
  rather than creating it accidentally.
- Open an existing database without requesting a newer version. Abort if
  `onupgradeneeded` fires.
- Use read-only transactions and cursors.
- Read Media metadata and Blob keys only; do not load Blob values during the
  normal scan.
- Leave the nonportable warrant directory handle unopened during an integrity
  scan. The safety backup inventories only the existing database schema; it
  never reads, serializes, or requests permission for the handle.
- Close every connection and report blocked or timed-out opens.

### 3.3 Initial rule groups

The first ruleset covers:

- storage access, malformed JSON, root type, and declared schema;
- map-key versus embedded-record-ID mismatches and duplicate canonical IDs;
- Lead-to-Person registry conflicts;
- embedded Vehicle or Location conflicts with canonical registries;
- EncounterSubject references and Person encounter projections;
- Book-In, Arrest, EncounterSubject, and Encounter outcome conflicts;
- Association endpoints;
- Investigation nodes and links;
- Operation targets, teams, officers, vehicles, and locations;
- Admin roster, shifts, and reconstructable statistics;
- Narrative participant references;
- Media owners, required roles, orphan metadata/blob keys, and multiple primary
  photos; and
- duplicate A-numbers assigned to different Person IDs.

The ruleset reports both sides of a conflict. It does not label either side as
the winner.

## 4. Integrity-report contract

Every downloaded report uses this minimum envelope:

```ts
interface COPDocIntegrityReportV1 {
  schema: "copdocx.integrity-report.v1";
  generatedAt: string;
  readOnly: true;

  scanner: {
    version: "0.1.0";
    ruleset: "copdocx.integrity-rules.v1";
  };

  inputs: {
    workspace: IntegrityInput;
    admin: IntegrityInput;
    bookin: IntegrityInput;
    media: IntegrityInput;
    registered: Array<{
      id: string;
      key: string;
      medium: "localStorage" | "sessionStorage";
      status: "ok" | "missing" | "unavailable";
      characters?: number;
      error?: string;
    }>;
  };

  summary: {
    status: "pass" | "attention" | "unsafe";
    totalFindings: number;
    retainedFindings: number;
    suppressedFindings: number;
    counts: Record<"critical" | "high" | "medium" | "low" | "info", number>;
    byCategory: Record<string, number>;
    scanned: Record<string, number>;
    blockedChecks: string[];
  };

  findings: Array<{
    findingId: string;
    ruleId: string;
    severity: "critical" | "high" | "medium" | "low" | "info";
    category: string;
    title: string;
    message: string;
    confidence: "verified" | "inferred";
    affected: Array<{
      store: string;
      type: string;
      id: string;
      path: string;
    }>;
    evidence: Array<{
      store: string;
      path: string;
      expected?: unknown;
      actual?: unknown;
    }>;
    suggestedAction: string;
    repairable: false;
  }>;
}

interface IntegrityInput {
  key: string;
  status: "ok" | "missing" | "invalid" | "unavailable" | "skipped";
  medium?: "localStorage" | "sessionStorage" | "indexedDB" | "retired";
  characters?: number;
  counts?: Record<string, number>;
  error?: string;
}
```

Finding order must be deterministic. The same byte-identical snapshot and
ruleset must produce the same rule IDs, affected IDs, counts, and ordering.
`generatedAt` may differ and is not part of the deterministic comparison.

`readOnly: true` describes scanner behavior; it does not mean the source data is
healthy. Likewise, a report with `summary.status: "unsafe"` remains a valid
report if the snapshot itself was captured consistently.

## 5. Safety-backup contract

The safety backup is separate from the ordinary transfer export. Its intended
UI-facing API is asynchronous:

```js
await COPDoc.safetyBackup.download(integrityReport);
```

The report argument is optional. When present, it must already conform to
`copdocx.integrity-report.v1`; attaching it must not alter either the report or
the captured application data.

The filename is:

```text
COPDoc_full_backup_YYYYMMDD_HHmmss.json
```

The backup envelope is:

```ts
interface COPDocSafetyBackupV1 {
  format: "copdocx.safety-backup.v1";
  schemaVersion: 1;

  metadata: {
    backupId: string;
    createdAt: string;
    productName: "COPDoc";
    appVersion: string;
    captureComplete: boolean;
    integrityValid: boolean;
    unencrypted: true;
    manifestSha256: string;
    counts: {
      registeredLocalStores: number;
      presentLocalStores: number;
      registeredSessionStores: number;
      presentSessionStores: number;
      mediaRecords: number;
      mediaBlobs: number;
    };
    warnings: string[];
    exclusions: string[];
  };

  stores: {
    localStorage: RawStoreCapture[];
    sessionStorage: RawStoreCapture[];
    media: MediaCapture;
    warrants: WarrantHandleInventory;
  };

  verification: {
    algorithm: "SHA-256";
    registeredStorageUnchangedDuringCapture: true;
    mediaPayloadsHashed: true;
    archiveVerified: true;
    serializedByteLength: number;
  };

  integrityReport: COPDocIntegrityReportV1 | null;
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

interface WarrantHandleInventory {
  database: "copdocx.warrants";
  status: "missing" | "excluded-nonportable" | "unavailable";
  version: number | null;
  objectStores?: string[];
}
```

Raw strings are intentional. They preserve drafts, legacy shapes, damaged JSON,
unknown top-level fields, empty-versus-missing state, and disagreements between
embedded and canonical objects. The backup must not rebuild these stores from
filtered record lists.

`verification.archiveVerified: true` means the serialized archive contains the
bytes the reader observed and its raw-store, Media-payload, and manifest hashes
agree. It does **not** mean the source data is internally consistent.
`metadata.integrityValid` separately records whether the Media source had a
detected structural or metadata/payload conflict. The attached integrity report
describes cross-store domain health.

## 6. Registered raw-store inventory

The inventory authority is `functions/workspace-config.js`. Stage 0 must not
maintain an unrelated hand-written key list without checking it against that
registry.

### 6.1 Captured localStorage entries

Every registered `localStorage` value is included as a `RawStoreCapture`, even
when it is missing and even when the registry marks it nonportable. The
`portable` flag is retained as evidence; capture does not approve a value for
future automatic restoration.

| Registry ID | Browser key | Portable | Purpose |
|---|---|---:|---|
| `workspace` | `copdocx.store.v1` | Yes | Domain workspace and saved Narratives |
| `admin` | `copdoc.admin.v1` | Yes | Officers, fleet, and shifts |
| `bookin` | `alien-book-in.saved-records.v1` | Yes | Book-In records |
| `bookinColumns` | `alien-book-in.saved-record-columns.v1` | No | Book-In table preference |
| `settings` | `copdocx.settings.v1` | Yes | Application settings |
| `importDoneSignal` | `copdocx.import.done.v1` | No | Transient import/reload signal retained as evidence |
| `mapViews` | `copdocx.map.views.v1` | Yes | Saved map views |
| `mapLayers` | `copdocx.map.layers.v1` | Yes | Map-layer configuration |
| `mapIcons` | `copdocx.map.icons.v1` | Yes | Map-icon configuration |
| `mapMarkup` | `copdocx.map.markup.v1` | Yes | Saved map markup |
| `mapBasemap` | `copdocx.location-map.basemap` | Yes | Raw scalar basemap choice |
| `narrativeTemplates` | `opdoc.narrative.templates.v2` | Yes | Current template store |
| `narrativeTemplatesLegacy` | `opdoc.narrative.templates.v1` | No | Legacy template store |
| `photoPickerLab` | `copdocx.photo-picker.v1` | No | Standalone photo-lab state |
| `fileUploadLab` | `copdocx.file-upload.v1` | No | Standalone upload-lab state |
| `baseballCardStyle` | `copdocx.baseball.card-style.v1` | No | Baseball-card presentation preference |

The current and legacy Narrative template keys are captured independently.
Falling back from v2 to v1 and exporting one normalized array would not preserve
the source bytes. Saved Narrative records are already inside Encounters in the
raw Workspace store. Narrative edits that exist only in active page memory
cannot be captured.

### 6.2 Captured sessionStorage entries

All three registered session values are retained as evidence in
`stores.sessionStorage`:

| Registry ID | Browser key | Purpose |
|---|---|---|
| `investigationWindows` | `copdocx.investigation-windows.v1` | Investigation-wall window state |
| `baseballHandoff` | `copdocx.baseball.handoff.v1` | Same-session Baseball Card handoff |
| `geocodeCache` | `addrGeoCache_v1` | Derived address lookup cache |

These values—and `importDoneSignal`—are **not approved for automatic restore**.
They are transient evidence that could reopen stale UI state, replay a signal,
or restore derived data. A future restore preflight must ignore them unless an
explicit policy later says otherwise.

### 6.3 IndexedDB and excluded state

`stores.media` contains the strict snapshot of IndexedDB
`copdocx.media.v1`. `stores.warrants` records only the existence/status, version,
and object-store names of `copdocx.warrants`; the directory handle itself and its
browser permission are not serialized.

The registered `retiredCaseLayout` entry has medium `retired`, so it is not in
either raw Web Storage array. Also excluded are unsaved DOM/form state, unsaved
Narrative editor state, open-window references, object URLs, browser and
service-worker caches, generated downloads, unrelated origin storage, and
browser permission grants. The warrant directory must be selected and
authorized again after any future recovery.

These limitations are recorded in `metadata.exclusions`; absence from the
archive must never be mistaken for an approved restore path.

## 7. Strict Media snapshot

Media uses IndexedDB database `copdocx.media.v1`, version 1:

- `meta`, key path `mediaId`, with indexes `ownerKey`, `mediaClass`, `sha256`,
  and `ownerSha`;
- `blobs`, compound key path `[mediaId, role]`.

The safety backup must read both object stores in one read-only transaction. It
must capture stored metadata directly, without passing it through
`createMedia()`, and encode each Blob as:

```ts
interface MediaCapture {
  database: "copdocx.media.v1";
  status: "ok" | "missing" | "invalid" | "unavailable";
  version: number | null;
  objectStores: string[];
  storeSchemas?: Array<{
    name: string;
    keyPath: string | string[] | null;
    autoIncrement: boolean;
    indexes: Array<{
      name: string;
      keyPath: string | string[];
      unique: boolean;
      multiEntry: boolean;
    }>;
  }>;
  transaction?: "readonly";
  records: Array<{
    meta: unknown;
    blobs: MediaBlobCapture[];
  }>;
  orphanBlobs: MediaBlobCapture[];
  integrityValid: boolean;
  warnings: string[];
}

interface MediaBlobCapture {
  mediaId: string;
  role: string;
  mime: string;
  declaredBytes: number;
  byteLength: number;
  sha256: string;
  base64: string;
}
```

During capture and archive verification, the implementation:

- captures metadata directly and every readable Blob payload from the same
  read-only transaction;
- retains object-store names, key paths, indexes, and database version in the
  manifest;
- hashes every captured Blob and verifies its decoded byte length and SHA-256;
- incorporates Media metadata, payload metadata, and store schema in the
  manifest digest;
- retains orphan Blob payloads separately instead of discarding them;
- checks declared roles, original-payload presence, Blob byte metadata, and the
  original payload's stored `meta.sha256`; and
- records source conflicts in `stores.media.warnings` and sets
  `stores.media.integrityValid`/`metadata.integrityValid` accordingly.

A missing role, declared-byte mismatch, metadata-hash mismatch, or orphan Blob
is a **source-integrity warning**, not an archive-capture failure. The archive
retains every readable byte and the evidence describing the conflict. A Blob
read failure, archive byte/hash failure, manifest mismatch, or serialization
failure rejects the backup instead of silently omitting data.

The existing `COPDoc.media.exportBundle()` is not strict enough for this job. It
silently skips a role when a Blob read fails. The safety backup instead retains
the corresponding metadata and emits an explicit warning for any role that was
already missing from the source; a failure while reading an existing Blob stops
capture.

## 8. Capture and verification behavior

The required sequence is:

1. Read every registered localStorage and sessionStorage value into snapshot A.
2. Read Media metadata and Blobs in one read-only IndexedDB transaction.
3. Hash and encode the retained Media bytes.
4. Read the same localStorage and sessionStorage values into snapshot B.
5. Compare A and B byte-for-byte. Reject the capture and instruct the operator
   to run it again if they differ.
6. Build the archive manifest, counts, exclusions, and optional integrity
   report.
7. Serialize the complete envelope.
8. Parse the serialized result again and verify the format/version, every raw
   store and Blob byte count/SHA-256, and the manifest digest.
9. Start the browser download only after verification passes.

Missing registered keys are valid inventory entries with `exists: false`.
Malformed JSON remains captured byte-for-byte and is assessed by the attached
integrity report. An inaccessible registered Web Storage source, mid-capture
change, Blob read failure, captured-byte mismatch, hash mismatch, manifest
mismatch, serialization failure, or download failure must not produce a normal
success message.

The UI shows a collecting/verifying state. A verified archive may still have
source-integrity warnings; the UI must display those warnings instead of
equating successful capture with healthy source data. It must never say that
the source is clean after retaining a missing role, byte-metadata conflict,
orphan Blob, or metadata-hash mismatch.

## 9. Ordinary transfer is not recovery

`functions/transfer.js` implements a filtered merge/portability format named
`copdocx.transfer.v1`. Even when every visible checkbox is selected, it is not a
full recovery archive:

- it exports selected record lists rather than the raw Workspace/Admin stores;
- it filters several draft record types;
- it omits `currentLeadId` and may omit canonical shared objects not reachable
  through the selected records;
- it normalizes support state and cannot preserve every empty, missing, legacy,
  or malformed value;
- it can silently emit `media: []` after a Media-export failure; and
- import rejects files over 32 MiB even though one supported 25 MiB attachment
  exceeds that limit after Base64 expansion.

The ordinary **Export JSON / CSV** feature remains useful for selected-record
transfer and reporting. It must not be labeled or treated as a full backup, and
`applyImport()` must not be used as the restore engine for
`copdocx.safety-backup.v1`.

## 10. Restore is deferred

Stage 0 creates and verifies a recovery capture. It does not add an exact restore
button.

Exact restore is deferred until COPDoc has:

- complete archive preflight validation;
- ID, hash, owner-reference, and declared-role collision checks;
- a fresh pre-restore safety backup;
- replace-versus-merge semantics that are explicit to the operator;
- a rollback journal for the nontransactional localStorage writes;
- one read-write transaction for replacing both Media object stores;
- direct restoration of stored Media metadata without timestamp re-stamping;
- post-restore byte/hash comparison; and
- an isolated-browser-profile restore test proving the archive round trip.

Until those gates pass, recovery is a controlled developer operation. Importing
the archive through the ordinary transfer dialog is unsupported.

## 11. Sensitive-data warning

> **COPDoc safety backups are unencrypted.** They may contain personally
> identifiable information, A-numbers, dates of birth, addresses, photographs,
> documents, medical responses, criminal and immigration information,
> narratives, officer information, and operational details. Store and transmit
> the file only through an approved protected location. Anyone holding the file
> can read its contents.

No Stage 0 code uploads the report or backup. Both are generated locally and
downloaded only when the operator explicitly requests them.

## 12. Tests and gates

### 12.1 Existing regression commands

These existing checks must continue to pass unchanged:

```bash
node scripts/test-storage-keys.js
node scripts/test-media.js
node scripts/test-transfer.js
```

They cover the registered key catalog and current happy-path transfer/Media
behavior. They do not prove strict archive integrity or a real IndexedDB restore.

### 12.2 Stage 0 scanner and backup commands

Run the implemented Stage 0 checks with:

```bash
# Read-only scanner rules and report contract
node scripts/test-integrity.js

# Exact raw-store and strict Media capture/verification
node scripts/test-safety-backup.js

# Known-risk characterization probes; exits zero while risks remain registered
node scripts/test-stage0-known-risks.js

# Deliberately exits nonzero while a registered vulnerability remains unresolved
node scripts/test-stage0-known-risks.js --strict

# Existing regression tests plus scanner, backup, and normal characterization
node scripts/run-stage0.js
```

The characterization registry is
`scripts/stage0-known-risks.json`, with shared VM helpers under
`scripts/support/copdoc-vm-harness.js`.

Initial characterization IDs are:

| ID | Known behavior to reproduce |
|---|---|
| `S0-PERSON-001` | A stale Case save removes newer Person encounter history |
| `S0-OBJECT-001` | A stale embedded Vehicle rolls back its canonical record |
| `S0-OBJECT-002` | A stale embedded Location rolls back its canonical record |
| `S0-STORAGE-001` | A failed first write leaves a phantom in-memory Lead |
| `S0-BOOKIN-001` | Booking can stop after only some stores are written |
| `S0-BOOKIN-002` | Book-In deletion leaves Encounter or Arrest residue |
| `S0-IMPORT-001` | Import can stop after some stores are already written |
| `S0-NARRATIVE-001` | Narrative input maps an incorrect participant outcome |
| `S0-NARRATIVE-002` | Narrative participant identity is unstable or mismatched |
| `S0-NARRATIVE-003` | Booked participants suppress unbooked participants |
| `S0-CONCURRENCY-001` | Concurrent whole-store writes lose one writer silently |

The normal characterization runner prints `KNOWN_RISK_REPRODUCED` for known
vulnerabilities and exits successfully while their registry status is `known`.
In the same commit that fixes a failure, change its status to `required`; the
corresponding test must then fail if the defect returns. Strict mode is expected
to fail until all registered invariants are enforced. Every probe runs in an
isolated Node VM backed by fault-injecting in-memory storage; it must never touch
real browser storage.

### 12.3 Exit gates

| Gate | Required evidence |
|---|---|
| Zero mutation | Every registered source value is byte-identical before and after scanning |
| IDB safety | Scanning cannot create or upgrade a missing IndexedDB database |
| Damaged input | One malformed store is reported without suppressing independent checks |
| Legacy visibility | Supported aliases and missing legacy metadata remain visible without normalization |
| Determinism | A fixed snapshot produces the same findings and ordering |
| Concurrency | Mid-scan changes produce `NON_ATOMIC_SNAPSHOT` |
| Privacy | Default reports contain no raw sensitive field values or Blob content |
| Characterization | Every registered Stage 0 failure is reliably reproduced in isolated storage |
| Regression | Existing application tests continue to pass unchanged |
| Backup capture | Every included raw store and Media Blob passes count/hash verification |
| Recovery proof | Future exact restore into an isolated profile is byte-identical before it is advertised |

Stage 0 is complete only when the scanner remains observational, the known-risk
suite is repeatable, and a safety archive can be captured without pretending
that filtered transfer or an untested restore path is good enough.
