"use strict";

// Historical document receipts are immutable provenance, not live object
// ownership. Diagnostics expose hashes/IDs/status, while safety backup retains
// exact bytes. These tests never read a browser profile or real records.
const assert = require("assert");
const { webcrypto } = require("crypto");
const { TextEncoder, TextDecoder } = require("util");
const { createMemoryStorage, createTab, loadScript, quietConsole } = require("./support/copdoc-vm-harness.js");

const KEY = "copdocx.document-generations.v1";
const SECRET = "SYNTHETIC_PRIVATE_HISTORY_NARRATIVE_75931";
const WHEN = "2026-09-05T12:00:00.000Z";
const SHA = "a".repeat(64);
const clone = value => JSON.parse(JSON.stringify(value));

function runtime(initial, options = {}) {
  const storage = createMemoryStorage(initial);
  const context = createTab(storage, { console: quietConsole() });
  Object.assign(context, { crypto: webcrypto, TextEncoder, TextDecoder, Uint8Array, ArrayBuffer });
  if (options.registry !== false) loadScript(context, "functions/workspace-config.js");
  if (options.generation !== false) {
    loadScript(context, "functions/document-context.js");
    loadScript(context, "functions/document-registry.js");
    loadScript(context, "functions/document-generation.js");
  }
  loadScript(context, "functions/integrity.js");
  return { storage, context, scanner: context.COPDoc.integrity };
}

function receipt(id, status = "GENERATED") {
  const row = {
    generationId: id, documentType: "bookin.combined-pdf", status,
    startedAt: WHEN, capturedAt: WHEN, template: { id: "synthetic-template", version: "1" },
    inputHash: SHA, sourceFingerprint: SHA, templateHash: SHA, hashAlgorithm: "SHA-256",
    sources: [{ type: "Person", id: "historical_deleted_person", revision: "old_revision", authority: "snapshot" }],
    generatingOfficerId: "historical_inactive_officer", deliveries: []
  };
  if (status === "GENERATED") Object.assign(row, { outputHash: SHA, outputBytes: 17, generatedAt: WHEN, mimeType: "application/pdf" });
  if (status === "FAILED") Object.assign(row, { failedAt: WHEN, failureCode: "RENDER_FAILED" });
  return row;
}

function ledger(rows = []) {
  return { schema: KEY, version: 1, revision: rows.length, records: Object.fromEntries(rows.map(row => [row.generationId, row])) };
}

function fixture(history) {
  return {
    workspace: { schema: "copdocx.store.v1", currentLeadId: "", people: {}, leads: {}, encounters: {}, operations: {}, investigations: {}, locations: {}, vehicles: {}, businesses: {}, entities: {}, associations: {} },
    admin: { officers: [], shifts: [], vehicles: [] }, bookin: [], media: [], mediaBlobKeys: [], documentGenerations: history
  };
}

function rules(report) {
  return report.findings.filter(row => row.ruleId.startsWith("DOCUMENT_"));
}

function scan(r, input) {
  const beforeInput = JSON.stringify(input), beforeStorage = r.storage.dump();
  const report = r.scanner.scanSnapshot(input, { now: WHEN });
  assert.strictEqual(report.readOnly, true);
  assert.strictEqual(JSON.stringify(input), beforeInput);
  assert.deepStrictEqual(r.storage.dump(), beforeStorage);
  assert.ok(!r.scanner.downloadReport(report).includes(SECRET), "Integrity output must omit private raw receipt extensions and corrupt input.");
  return report;
}

async function main() {
  // The standalone fallback scanner must remain useful without application
  // modules; the normal Integrity page also loads the stricter runtime contract.
  for (const generation of [true, false]) {
    const r = runtime({}, { generation });
    const clean = scan(r, fixture(ledger([receipt("doc_generated"), receipt("doc_failed", "FAILED")])));
    assert.strictEqual(rules(clean).length, 0);
    assert.strictEqual(clean.findings.length, 0, "Historical source IDs do not become dangling live relationships.");
    assert.strictEqual(clean.inputs.documentGenerations.counts.records, 2);

    const pending = receipt("doc_pending", "PENDING");
    pending.untrustedLegacyPayload = { narrative: SECRET, medical: SECRET, fileName: SECRET + ".pdf" };
    const report = scan(r, fixture(ledger([pending])));
    assert.strictEqual(rules(report).filter(row => row.ruleId === "DOCUMENT_GENERATION_PENDING").length, 1);

    for (const malformed of [
      { schema: KEY, version: 2, revision: 0, records: {} },
      { schema: "different", version: 1, revision: 0, records: {} },
      { schema: KEY, version: 1, revision: -1, records: {} },
      { schema: KEY, version: 1, revision: 0, records: [] }
    ]) {
      assert.ok(rules(scan(r, fixture(malformed))).some(row => row.ruleId === "DOCUMENT_HISTORY_INVALID"));
    }
    for (const damage of [
      row => { row.generationId = "mismatched_id"; },
      row => { row.inputHash = SECRET; },
      row => { row.templateHash = "not_sha256"; },
      row => { row.status = "DONE"; },
      row => { row.outputBytes = -1; },
      row => { row.outputHash = SECRET; },
      row => { row.sources = {}; },
      row => { row.deliveries = null; }
    ]) {
      const history = ledger([receipt("doc_invalid")]); damage(history.records.doc_invalid);
      assert.ok(rules(scan(r, fixture(history))).some(row => row.ruleId === "DOCUMENT_HISTORY_INVALID"));
    }
    assert.strictEqual(r.storage.writeCount(), 0, "All history inspections are read-only.");
  }

  const pending = receipt("doc_registered_pending", "PENDING");
  pending.legacyNote = SECRET;
  const original = "  " + JSON.stringify(ledger([pending, receipt("doc_registered_generated")]), null, 2) + "\n";
  for (const registry of [true, false]) {
    const r = runtime({ [KEY]: original }, { registry });
    const captured = r.scanner.captureRegisteredStorage();
    const item = captured.stores.filter(row => row.id === "documentGenerations");
    assert.strictEqual(item.length, 1, "Registered and fallback snapshots capture document history exactly once.");
    assert.strictEqual(item[0].raw, original);
    assert.strictEqual(rules(scan(r, captured)).filter(row => row.ruleId === "DOCUMENT_GENERATION_PENDING").length, 1);
    assert.strictEqual(r.storage.raw(KEY), original);
    assert.strictEqual(r.storage.writeCount(), 0);
  }

  const r = runtime({ [KEY]: original });
  const registration = r.context.COPDoc.config.storageEntry("documentGenerations");
  assert.strictEqual(registration.key, KEY);
  assert.strictEqual(registration.portable, false, "Local output receipts are not imported as new live domain objects.");
  loadScript(r.context, "functions/safety-backup.js");
  const backup = r.context.COPDoc.safetyBackup;
  const before = r.storage.dump();
  const archive = await backup.collect();
  const saved = archive.stores.localStorage.find(row => row.id === "documentGenerations");
  assert.ok(saved, "Full recovery backup includes the nonportable document ledger.");
  assert.strictEqual(saved.raw, original, "Recovery backup preserves exact whitespace and legacy receipt fields.");
  assert.strictEqual((await backup.verify(archive)).ok, true);
  const tampered = clone(archive);
  tampered.stores.localStorage.find(row => row.id === "documentGenerations").raw += " ";
  await assert.rejects(async () => backup.verify(tampered), /verification/i);
  assert.deepStrictEqual(r.storage.dump(), before);
  assert.strictEqual(r.storage.writeCount(), 0, "Backup and validation do not prune or rewrite history.");

  const corrupt = runtime({ [KEY]: '{"private":"' + SECRET });
  const corruptRaw = corrupt.storage.dump();
  const report = scan(corrupt, corrupt.scanner.captureRegisteredStorage());
  assert.ok(report.findings.some(row => row.ruleId === "STORAGE_JSON_INVALID" && row.affected.some(ref => ref.store === "documentGenerations")));
  assert.deepStrictEqual(corrupt.storage.dump(), corruptRaw);
  console.log("STAGE7_DOCUMENT_HISTORY_PASSED pending/corrupt diagnostics, historical references, private-value exclusion, fallback capture and exact verified recovery backup.");
}

main().catch(error => { console.error(error); process.exitCode = 1; });
