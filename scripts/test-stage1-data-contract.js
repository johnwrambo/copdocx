"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { execFileSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const contractDir = path.join(root, "docs", "stage-1-data-contract");
const manifestFile = path.join(contractDir, "architecture-manifest.json");

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function unique(values, label) {
  assert.strictEqual(
    new Set(values).size,
    values.length,
    label + " must not contain duplicate IDs"
  );
}

function sourceLocation(value) {
  if (typeof value !== "string") {
    return null;
  }
  const match = value.match(
    /^((?:functions|scripts|docs|data|style)\/[A-Za-z0-9_./-]+|[A-Za-z0-9_.-]+\.html)(?::(\d+)(?:-(\d+))?)?$/
  );
  if (!match) {
    return null;
  }
  return {
    relativePath: match[1],
    firstLine: match[2] ? Number(match[2]) : null,
    lastLine: match[3] ? Number(match[3]) : match[2] ? Number(match[2]) : null
  };
}

function collectSourceLocations(value, out) {
  if (Array.isArray(value)) {
    value.forEach((item) => collectSourceLocations(item, out));
    return;
  }
  if (value && typeof value === "object") {
    Object.values(value).forEach((item) => collectSourceLocations(item, out));
    return;
  }
  const location = sourceLocation(value);
  if (location) {
    out.push(location);
  }
}

function validateSourceLocation(location, sourceText) {
  const absolute = path.join(root, location.relativePath);
  if (sourceText === undefined) {
    assert.ok(fs.existsSync(absolute), "manifest source does not exist: " + location.relativePath);
    if (fs.statSync(absolute).isDirectory()) return;
    sourceText = fs.readFileSync(absolute, "utf8");
  }
  if (location.firstLine === null) {
    return;
  }
  const lineCount = sourceText.split(/\r?\n/).length;
  assert.ok(
    location.firstLine >= 1 && location.firstLine <= lineCount,
    location.relativePath + " source line " + location.firstLine + " exceeds " + lineCount
  );
  assert.ok(
    location.lastLine >= location.firstLine && location.lastLine <= lineCount,
    location.relativePath + " source range ends at " + location.lastLine + " but has " + lineCount + " lines"
  );
}

const manifest = readJson(manifestFile);
assert.strictEqual(
  manifest.manifestSchema,
  "copdocx.architecture-manifest.v1",
  "unexpected architecture manifest schema"
);
assert.strictEqual(
  manifest.contractStatus,
  "current-effective-contract",
  "Stage 1 must describe the current contract, not a recommendation"
);
assert.match(manifest.sourceSnapshot.baseCommit, /^[0-9a-f]{40}$/);
assert.match(manifest.sourceSnapshot.baseTree, /^[0-9a-f]{40}$/);
assert.strictEqual(manifest.sourceSnapshot.includesUncommittedStage0, true);

function git(args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
}
assert.strictEqual(
  git(["rev-parse", manifest.sourceSnapshot.baseCommit + "^{tree}"]).trim(),
  manifest.sourceSnapshot.baseTree,
  "the documented Stage 1 baseline commit must still resolve to its frozen tree"
);
// The manifest was written over baseCommit plus uncommitted Stage 0 files.
// Checkpoint 9571793 (API-equivalent 68ce7ed) captures those additions exactly.
// Its immutable tree is available in either local or API-published Git history.
const stage01CheckpointTree = "aae0558fddef0620a25ff62540807829522cc6e0";
assert.strictEqual(git(["cat-file", "-t", stage01CheckpointTree]).trim(), "tree", "Stage 0/1 evidence checkpoint is required");
assert.deepStrictEqual(
  JSON.parse(git(["show", stage01CheckpointTree + ":docs/stage-1-data-contract/architecture-manifest.json"])).sourceSnapshot,
  manifest.sourceSnapshot,
  "the frozen Stage 1 source snapshot must remain tied to its original checkpoint"
);
const frozenSources = new Map();
function frozenSource(relativePath) {
  if (frozenSources.has(relativePath)) return frozenSources.get(relativePath);
  for (const tree of [manifest.sourceSnapshot.baseTree, stage01CheckpointTree]) {
    try {
      const sourceText = git(["show", tree + ":" + relativePath]);
      frozenSources.set(relativePath, sourceText);
      return sourceText;
    } catch (error) {
      // Only Stage 0/1 additions may be absent from the original base tree.
    }
  }
  assert.fail("frozen manifest source is absent from its baseline and Stage 0/1 checkpoint: " + relativePath);
}

[
  "application",
  "storage",
  "entities",
  "relationships",
  "fieldLineage",
  "workflows",
  "functions",
  "components",
  "reports",
  "events",
  "risks",
  "legacy"
].forEach((key) => assert.ok(manifest[key], "manifest is missing " + key));

const context = {};
vm.createContext(context);
vm.runInContext(
  fs.readFileSync(path.join(root, "functions", "workspace-config.js"), "utf8"),
  context
);
const config = context.COPDoc.config;
assert.strictEqual(
  manifest.sourceSnapshot.productVersion,
  config.productVersion,
  "manifest productVersion must match workspace-config"
);

const registry = config.storageEntries.map((entry) => ({
  id: entry.id,
  key: entry.key,
  medium: entry.medium,
  owner: entry.owner,
  portable: entry.portable
}));
// Stage 1 is a historical freeze. Later stores are documented additively;
// an overlay may not replace any frozen storage authority or key.
const storageOverlay = readJson(path.join(root, "docs", "stage-4-booking-storage.json"));
assert.strictEqual(storageOverlay.schema, "copdocx.storage-contract-overlay.v1");
assert.strictEqual(storageOverlay.stage, 4);
assert.deepStrictEqual(Object.keys(storageOverlay.storage), ["bookingTransactions"]);
Object.keys(storageOverlay.storage).forEach((id) => {
  assert.ok(!Object.prototype.hasOwnProperty.call(manifest.storage, id), "overlay must not replace frozen storage " + id);
});
const importStorageOverlay = readJson(path.join(root, "docs", "stage-6-import-storage.json"));
assert.strictEqual(importStorageOverlay.schema, "copdocx.storage-contract-overlay.v1");
assert.strictEqual(importStorageOverlay.stage, 6);
assert.deepStrictEqual(Object.keys(importStorageOverlay.storage), ["importTransactions"]);
Object.keys(importStorageOverlay.storage).forEach((id) => {
  assert.ok(!manifest.storage[id] && !storageOverlay.storage[id], "Stage 6 overlay must be additive: " + id);
});
const documentedStorage = Object.assign({}, manifest.storage, storageOverlay.storage, importStorageOverlay.storage);
const storeIds = Object.keys(documentedStorage);
assert.strictEqual(storeIds.length, registry.length, "manifest plus additive overlays must cover every registry entry exactly");
unique(storeIds, "manifest storage IDs");
unique(registry.map((entry) => entry.id), "runtime storage IDs");
unique(registry.map((entry) => entry.key), "runtime storage keys");

for (const entry of registry) {
  const documented = documentedStorage[entry.id];
  assert.ok(documented, "storage registry entry is undocumented: " + entry.id);
  ["key", "medium", "owner", "portable"].forEach((field) => {
    assert.deepStrictEqual(
      documented[field],
      entry[field],
      entry.id + "." + field + " differs from workspace-config"
    );
  });
  assert.ok(documented.authority, entry.id + " is missing an authority statement");
  assert.ok(Array.isArray(documented.readers), entry.id + " readers must be an array");
  assert.ok(Array.isArray(documented.writers), entry.id + " writers must be an array");
  assert.ok(documented.migration, entry.id + " is missing migration status");
}

const requiredEntities = [
  "WorkspaceState",
  "Lead",
  "Person",
  "Location",
  "Vehicle",
  "Association",
  "Investigation",
  "Operation",
  "FieldEncounter",
  "EncounterSubject",
  "Arrest",
  "BookInRecord",
  "AdminState",
  "Officer",
  "NarrativeRecord",
  "MediaMetadata",
  "MediaBlobRow",
  "IntegrityReport",
  "SafetyBackupV1"
];
requiredEntities.forEach((name) => {
  assert.ok(manifest.entities[name], "required effective object is missing: " + name);
});
assert.ok(Object.keys(manifest.entities).length >= 50, "effective object catalog is unexpectedly small");

const validStoreIds = new Set(storeIds);
for (const [name, entity] of Object.entries(manifest.entities)) {
  assert.ok(entity.kind, name + " is missing kind");
  assert.ok(entity.collectionPath, name + " is missing collectionPath");
  assert.ok(entity.identifier && "field" in entity.identifier, name + " is missing identifier contract");
  assert.ok(entity.authority, name + " is missing authority");
  assert.ok(entity.fields, name + " is missing field classification");
  [
    "requiredCurrent",
    "optionalCurrent",
    "references",
    "duplicates",
    "derivedPersisted",
    "legacy",
    "allowsUnknown"
  ].forEach((field) => {
    assert.ok(field in entity.fields, name + ".fields is missing " + field);
  });
  assert.ok(entity.crud, name + " is missing CRUD inventory");
  ["create", "read", "update", "delete", "migrate"].forEach((action) => {
    assert.ok(Array.isArray(entity.crud[action]), name + ".crud." + action + " must be an array");
    assert.ok(entity.crud[action].length > 0, name + ".crud." + action + " must state a path or none found");
  });
  if (entity.storage) {
    entity.storage.split("/").forEach((storageId) => {
      assert.ok(validStoreIds.has(storageId), name + " references unknown storage " + storageId);
    });
  }
  assert.ok(
    ["VERIFIED", "INFERRED", "UNKNOWN_REVIEW"].includes(entity.evidence),
    name + " has invalid evidence label " + entity.evidence
  );
}

assert.ok(manifest.relationships.length >= 25, "relationship catalog is unexpectedly small");
unique(manifest.relationships.map((relationship) => relationship.id), "relationship IDs");
for (const relationship of manifest.relationships) {
  assert.ok(manifest.entities[relationship.from], relationship.id + " has unknown from entity");
  assert.ok(manifest.entities[relationship.to], relationship.id + " has unknown to entity");
  assert.ok(relationship.cardinality, relationship.id + " is missing cardinality");
  assert.ok(Array.isArray(relationship.representation), relationship.id + " is missing representation paths");
  assert.ok(relationship.authority, relationship.id + " is missing authority");
  assert.ok(["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(relationship.integrityRisk));
}

unique(manifest.fieldLineage.map((row) => row.id), "field-lineage IDs");
assert.ok(manifest.fieldLineage.length >= 12, "field-lineage catalog is unexpectedly small");
manifest.fieldLineage.forEach((row) => {
  assert.ok(row.fact && row.authority, row.id + " is missing fact/authority");
  assert.ok(Array.isArray(row.storedAt) && row.storedAt.length, row.id + " is missing storedAt");
  assert.ok(Array.isArray(row.consumers) && row.consumers.length, row.id + " is missing consumers");
});

assert.ok(Object.keys(manifest.workflows).length >= 10, "workflow catalog is unexpectedly small");
Object.entries(manifest.workflows).forEach(([name, workflow]) => {
  assert.ok(Array.isArray(workflow.steps) && workflow.steps.length >= 2, name + " needs workflow steps");
  assert.ok(Array.isArray(workflow.reads) && Array.isArray(workflow.writes));
  assert.ok(workflow.atomicity, name + " is missing atomicity statement");
});

assert.ok(Object.keys(manifest.components).length >= 15, "component catalog is unexpectedly small");
assert.ok(Object.keys(manifest.reports).length >= 10, "report catalog is unexpectedly small");
assert.ok(Object.keys(manifest.functions).length >= 15, "function catalog is unexpectedly small");
assert.strictEqual(
  manifest.events.broadcastChannel.evidence,
  "VERIFIED",
  "cross-window audit must explicitly record BroadcastChannel status"
);
assert.deepStrictEqual(manifest.events.broadcastChannel.producers, []);
assert.deepStrictEqual(manifest.events.broadcastChannel.consumers, []);

const stage0 = readJson(path.join(root, "scripts", "stage0-known-risks.json"));
const risksById = new Map(manifest.risks.map((risk) => [risk.id, risk]));
unique(manifest.risks.map((risk) => risk.id), "risk IDs");
for (const risk of stage0.risks) {
  const documented = risksById.get(risk.id);
  assert.ok(documented, "Stage 0 risk is absent from manifest: " + risk.id);
  assert.strictEqual(documented.title, risk.title, risk.id + " title drifted");
  assert.strictEqual(documented.status, risk.expectedCurrentState, risk.id + " status drifted");
}

const requiredDocs = [
  "README.md",
  "current-master-schema.md",
  "workspace-store.md",
  "admin-bookin.md",
  "storage-media-transfer.md",
  "narrative-reports.md",
  "map-operations-analytics-windows.md",
  "field-ownership.md",
  "architecture-manifest.json"
];
requiredDocs.forEach((name) => {
  const file = path.join(contractDir, name);
  assert.ok(fs.existsSync(file), "Stage 1 package is missing " + name);
  assert.ok(fs.statSync(file).size > 200, "Stage 1 document is unexpectedly empty: " + name);
});

const schemaDoc = fs.readFileSync(path.join(contractDir, "current-master-schema.md"), "utf8");
assert.strictEqual(
  (schemaDoc.match(/```/g) || []).length % 2,
  0,
  "current-master-schema.md has an unclosed code fence"
);
requiredEntities.filter((name) => !["IntegrityReport"].includes(name)).forEach((name) => {
  assert.ok(
    schemaDoc.includes("interface " + name) || schemaDoc.includes(name),
    "current master schema does not mention " + name
  );
});

const sources = [];
collectSourceLocations(manifest, sources);
const uniqueSources = new Map();
sources.forEach((location) => {
  const key = ["stage1", location.relativePath, location.firstLine, location.lastLine].join(":");
  uniqueSources.set(key, location);
});
uniqueSources.forEach((location) => validateSourceLocation(location, frozenSource(location.relativePath)));
const overlaySources = [];
collectSourceLocations(storageOverlay, overlaySources);
overlaySources.forEach((location) => {
  validateSourceLocation(location);
  uniqueSources.set(["overlay", location.relativePath, location.firstLine, location.lastLine].join(":"), location);
});

console.log(
  "STAGE1_DATA_CONTRACT_PASSED",
  registry.length + " stores,",
  Object.keys(manifest.entities).length + " objects,",
  manifest.relationships.length + " relationships,",
  Object.keys(manifest.workflows).length + " workflows,",
  uniqueSources.size + " source citations."
);
