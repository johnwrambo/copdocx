"use strict";

// Recovery diagnostics contain identifiers and counts, never the imported data
// or before images. Full backups must still preserve the exact recovery bytes.
const assert = require("assert");
const { TextEncoder, TextDecoder } = require("util");
const { createMemoryStorage, createTab, loadScript } = require("./support/copdoc-vm-harness");
const KEY = "copdocx.import-transactions.v1";
const WS = "copdocx.store.v1";
const secrets = ["PRIVATE_NAME_6_938", "PRIVATE_MEDICAL_6_504", "PRIVATE_CARD_NARRATIVE_6_731", "PRIVATE_PHOTO_PAYLOAD_6_209"];
const beforeImage = JSON.stringify({ person: secrets[0], medical: secrets[1], card: { content: secrets[2], photoDataUrl: "data:image/png;base64," + secrets[3] } });
function entry(id, status) {
  return {
    transactionId: id, status, revision: 3, appliedKeys: [], mediaCreated: [], mediaPrepared: false,
    plan: { ok: true, changes: [{ key: WS, medium: "localStorage", before: beforeImage, after: beforeImage + " " }], mediaPlans: [{ mediaId: "media_fixture", dataUrl: "data:image/png;base64," + secrets[3] }], rows: [{ recordId: "packet_fixture", note: secrets[0] }] },
    error: secrets[1]
  };
}
function fixture(journal) {
  return { workspace: { schema: WS, currentLeadId: "", leads: {}, people: {}, encounters: {}, operations: {}, investigations: {}, vehicles: {}, locations: {}, businesses: {}, entities: {}, associations: {} }, admin: { officers: [], vehicles: [], shifts: [] }, bookin: [], media: [], mediaBlobKeys: [], importTransactions: journal };
}
function context(storage, withRegistry) {
  const result = createTab(storage || createMemoryStorage(), {});
  result.TextEncoder = TextEncoder; result.TextDecoder = TextDecoder;
  if (withRegistry) loadScript(result, "functions/workspace-config.js");
  loadScript(result, "functions/integrity.js");
  return result;
}
function scan(api, input) {
  const before = JSON.stringify(input);
  const result = api.scanSnapshot(input, { now: "2026-09-06T12:00:00Z" });
  assert.strictEqual(JSON.stringify(input), before, "scanner does not mutate recovery input");
  assert.strictEqual(result.readOnly, true);
  const serialized = api.downloadReport(result);
  secrets.forEach(secret => assert.ok(!serialized.includes(secret), "downloaded integrity output must exclude planted private values"));
  assert.ok(!serialized.includes("data:image/"), "downloaded integrity output never contains image payloads");
  return result;
}
const api = context().COPDoc.integrity;
const clean = fixture({ schema: KEY, version: 1, transactions: { imp_complete: entry("imp_complete", "COMPLETED"), imp_rolled_back: entry("imp_rolled_back", "ROLLED_BACK") } });
let report = scan(api, clean);
assert.strictEqual(report.summary.status, "pass");
assert.strictEqual(report.findings.length, 0, "completed import and completed rollback are healthy history");
const pending = fixture({ schema: KEY, version: 1, transactions: { imp_pending: entry("imp_pending", "PENDING"), imp_applying: entry("imp_applying", "APPLYING"), imp_rolling_back: entry("imp_rolling_back", "ROLLING_BACK") } });
report = scan(api, pending);
assert.strictEqual(report.findings.filter(row => row.ruleId === "IMPORT_RECOVERY_PENDING").length, 3);
assert.strictEqual(report.summary.counts.high, 3);
assert.strictEqual(report.summary.status, "attention");
for (const breakEntry of [
  row => { row.transactionId = "wrong_id"; },
  row => { row.revision = -1; },
  row => { row.status = "UNKNOWN"; },
  row => { row.mediaPrepared = "false"; },
  row => { row.plan.changes[0].before = { private: secrets[0] }; },
  row => { row.plan.changes = null; }
]) {
  const row = entry("imp_malformed", "COMPLETED"); breakEntry(row);
  report = scan(api, fixture({ schema: KEY, version: 1, transactions: { imp_malformed: row } }));
  assert.strictEqual(report.findings.filter(finding => finding.ruleId === "IMPORT_JOURNAL_INVALID").length, 1);
  assert.strictEqual(report.summary.status, "unsafe");
}
for (const malformed of [{ schema: KEY, version: 2, transactions: {} }, { schema: "wrong", version: 1, transactions: {} }, { schema: KEY, version: 1, transactions: [] }]) {
  report = scan(api, fixture(malformed));
  assert.strictEqual(report.findings.filter(row => row.ruleId === "IMPORT_JOURNAL_INVALID").length, 1);
}
const rawJournal = JSON.stringify(pending.importTransactions, null, 2) + "\n";
const storage = createMemoryStorage({ [KEY]: rawJournal });
const registered = context(storage, true);
const registry = registered.COPDoc.config.storageEntry("importTransactions");
assert.strictEqual(registry.key, KEY);
assert.strictEqual(registry.medium, "localStorage");
assert.strictEqual(registry.portable, false, "pending local recovery commands are not ordinary portable records");
loadScript(registered, "functions/safety-backup.js");
const beforeStorage = storage.dump();
const backup = registered.COPDoc.safetyBackup.captureRawStorage();
const recoveryBytes = backup.localStorage.find(row => row.id === "importTransactions");
assert.ok(recoveryBytes && recoveryBytes.exists, "full registered backup includes nonportable recovery journal");
assert.strictEqual(recoveryBytes.raw, rawJournal, "backup retains exact raw recovery bytes, including whitespace");
const capture = registered.COPDoc.integrity.captureRegisteredStorage();
assert.strictEqual(capture.stores.filter(row => row.id === "importTransactions").length, 1);
report = registered.COPDoc.integrity.scanSnapshot(capture, { now: "2026-09-06T12:00:00Z" });
assert.strictEqual(report.findings.filter(row => row.ruleId === "IMPORT_RECOVERY_PENDING").length, 3);
secrets.forEach(secret => assert.ok(!JSON.stringify(report).includes(secret)));
assert.deepStrictEqual(storage.dump(), beforeStorage);
assert.strictEqual(storage.writeCount(), 0, "registry capture, scanner and backup capture perform no writes");
// Raw corrupt JSON must also be diagnosed without exposing its contents.
storage.setRaw(KEY, '{ "secret": "' + secrets[0]);
const corruptBefore = storage.dump();
report = registered.COPDoc.integrity.scanSnapshot(registered.COPDoc.integrity.captureRegisteredStorage());
assert.ok(report.findings.some(row => row.ruleId === "STORAGE_JSON_INVALID" && row.affected.some(ref => ref.store === "importTransactions")));
assert.ok(!JSON.stringify(report).includes(secrets[0]));
assert.deepStrictEqual(storage.dump(), corruptBefore);
console.log("Stage 6 import integrity: pending/malformed detection, private-value exclusion, and exact registered backup capture passed.");
