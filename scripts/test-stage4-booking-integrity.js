"use strict";

const assert = require("assert");
const crypto = require("crypto");
const { TextEncoder } = require("util");
const { createMemoryStorage, createTab, loadScript, quietConsole } = require("./support/copdoc-vm-harness.js");

const KEY = "copdocx.booking-transactions.v1";
const clone = (value) => JSON.parse(JSON.stringify(value));
const now = "2026-09-05T12:00:00.000Z";

function runtime(initial, registry = true) {
  const storage = createMemoryStorage(initial);
  const context = createTab(storage, { console: quietConsole() });
  context.crypto = crypto.webcrypto;
  context.TextEncoder = TextEncoder;
  context.ArrayBuffer = ArrayBuffer;
  context.Uint8Array = Uint8Array;
  if (registry) loadScript(context, "functions/workspace-config.js");
  loadScript(context, "functions/integrity.js");
  return { storage, context, scanner: context.COPDoc.integrity };
}

function transaction(overrides) {
  return Object.assign({
    transactionId: "tx_one", bookingId: "booking_one", encounterId: "", subjectId: "",
    personId: "", leadId: "", arrestId: "", status: "PENDING", completedSteps: [],
    createdAt: now, updatedAt: now,
    request: { packet: { id: "booking_one", formState: {} }, options: {} }
  }, overrides);
}

function snapshot(rows) {
  return {
    workspace: { schema: "copdocx.store.v1", people: {}, leads: {}, encounters: {} },
    admin: { officers: [], vehicles: [], shifts: [] }, bookin: [], media: [],
    bookingTransactions: { schema: KEY, transactions: Object.fromEntries(rows.map(row => [row.transactionId, row])) }
  };
}

function journalFindings(report) {
  return clone(report.findings.filter(row => row.ruleId.startsWith("BOOKING_")));
}

function has(report, rule) {
  return report.findings.some(row => row.ruleId === rule);
}

async function main() {
  const { scanner } = runtime();
  assert.deepStrictEqual(journalFindings(scanner.scanSnapshot(snapshot([]))), []);
  const pending = scanner.scanSnapshot(snapshot([transaction()]));
  assert.ok(has(pending, "BOOKING_TRANSACTION_INCOMPLETE"));
  assert.strictEqual(pending.inputs.bookingTransactions.counts.transactions, 1);
  const completed = transaction({ status: "COMPLETED" });
  delete completed.request;
  assert.deepStrictEqual(journalFindings(scanner.scanSnapshot(snapshot([completed]))), [], "historical completed receipts need no active request");
  assert.deepStrictEqual(journalFindings(scanner.scanSnapshot(snapshot([
    completed, { ...completed, transactionId: "tx_later_edit" }
  ]))), [], "multiple completed edits of one booking are allowed");

  const malformed = [
    null, [], { schema: "future", transactions: {} }, { schema: KEY, transactions: [] }
  ];
  for (const value of malformed) {
    const input = snapshot([]);
    // Null direct input is intentionally interpreted as missing by the existing
    // scanner API; stored JSON null must still be diagnosed as malformed.
    delete input.bookingTransactions;
    input.stores = [{ id: "bookingTransactions", key: KEY, raw: JSON.stringify(value) }];
    assert.ok(has(scanner.scanSnapshot(input), "BOOKING_JOURNAL_INVALID"));
  }
  for (const changes of [
    { status: "DONE" }, { completedSteps: "PROMOTED" }, { completedSteps: ["PROMOTED", "PROMOTED"] },
    { bookingId: " spaced " }, { createdAt: "yesterday" }, { request: null },
    { request: { packet: {}, options: [] } }, { personId: 42 }, { subjectId: "orphan_subject" }
  ]) {
    assert.ok(has(scanner.scanSnapshot(snapshot([transaction(changes)])), "BOOKING_TRANSACTION_INVALID"), JSON.stringify(changes));
  }
  const invalidKey = snapshot([transaction()]);
  invalidKey.bookingTransactions.transactions.wrong_key = invalidKey.bookingTransactions.transactions.tx_one;
  delete invalidKey.bookingTransactions.transactions.tx_one;
  assert.ok(has(scanner.scanSnapshot(invalidKey), "BOOKING_TRANSACTION_INVALID"));

  assert.ok(has(scanner.scanSnapshot(snapshot([
    transaction(), transaction({ transactionId: "tx_duplicate" })
  ])), "BOOKING_TRANSACTION_DUPLICATE_ACTIVE"));
  assert.ok(has(scanner.scanSnapshot(snapshot([
    transaction({ encounterId: "enc_one", subjectId: "sub_one" }),
    transaction({ transactionId: "tx_duplicate", bookingId: "booking_two", encounterId: "enc_one", subjectId: "sub_one", request: { packet: { id: "booking_two" }, options: {} } })
  ])), "BOOKING_TRANSACTION_DUPLICATE_ACTIVE"));

  const privateToken = "PRIVATE_MEDICAL_AND_NARRATIVE_VALUE_4381";
  const sensitive = transaction({ lastError: privateToken, status: "FAILED", request: {
    packet: { id: "wrong_booking", firstName: privateToken, formState: { medicine: { value: privateToken } } },
    options: { notes: privateToken }
  } });
  const sensitiveInput = snapshot([sensitive]);
  const beforeInput = JSON.stringify(sensitiveInput);
  const privateReport = scanner.scanSnapshot(sensitiveInput);
  assert.ok(has(privateReport, "BOOKING_TRANSACTION_IDENTITY_CONFLICT"));
  assert.ok(!JSON.stringify(privateReport).includes(privateToken), "request and error values must not reach the report");
  assert.strictEqual(JSON.stringify(sensitiveInput), beforeInput, "scanner must not mutate request data");

  const identityFixture = snapshot([transaction({
    encounterId: "enc_one", subjectId: "sub_one", personId: "person_one", leadId: "lead_one", arrestId: "arrest_one"
  })]);
  identityFixture.workspace.people.person_one = { personId: "person_one", arrests: [{ arrestId: "arrest_one", bookinRecordId: "other_booking" }] };
  identityFixture.workspace.leads.lead_one = { leadId: "lead_one", subjectPersonId: "other_person" };
  identityFixture.workspace.encounters.enc_one = { encounterId: "enc_one", subjects: [{ subjectId: "sub_one", personId: "other_person" }] };
  identityFixture.bookin = [{ id: "booking_one", personId: "other_person", formState: {} }];
  const conflicts = journalFindings(scanner.scanSnapshot(identityFixture)).filter(row => row.ruleId === "BOOKING_TRANSACTION_IDENTITY_CONFLICT");
  for (const field of ["bookingId", "subjectId", "leadId", "arrestId"]) {
    assert.ok(conflicts.some(row => row.affected[0].path.endsWith("." + field)), "must verify " + field);
  }

  for (const useRegistry of [true, false]) {
    const live = runtime({ [KEY]: JSON.stringify(snapshot([sensitive]).bookingTransactions) }, useRegistry);
    const rawBefore = live.storage.dump();
    const captured = live.scanner.captureRegisteredStorage();
    assert.ok(captured.stores.some(row => row.id === "bookingTransactions" && row.raw.includes(privateToken)));
    const report = live.scanner.scanSnapshot(captured);
    assert.ok(has(report, "BOOKING_TRANSACTION_INCOMPLETE"));
    assert.ok(!JSON.stringify(report).includes(privateToken));
    assert.deepStrictEqual(live.storage.dump(), rawBefore);
    assert.deepStrictEqual(live.storage.history(), [], "scan only reads registered storage");
  }
  const corrupt = runtime({ [KEY]: "{damaged journal" });
  assert.ok(has(corrupt.scanner.scanSnapshot(corrupt.scanner.captureRegisteredStorage()), "STORAGE_JSON_INVALID"));

  const originalRaw = "  " + JSON.stringify(snapshot([sensitive]).bookingTransactions, null, 2) + "\n";
  const backupRuntime = runtime({ [KEY]: originalRaw });
  const registered = backupRuntime.context.COPDoc.config.storageEntry("bookingTransactions");
  assert.strictEqual(registered.portable, false);
  loadScript(backupRuntime.context, "functions/safety-backup.js");
  const backup = backupRuntime.context.COPDoc.safetyBackup;
  const archive = await backup.collect();
  const journalArchive = archive.stores.localStorage.find(row => row.id === "bookingTransactions");
  assert.ok(journalArchive, "recovery archive includes nonportable booking commands");
  assert.strictEqual(journalArchive.raw, originalRaw, "archive preserves journal bytes including formatting and request values");
  assert.strictEqual((await backup.verify(archive)).ok, true);
  const tampered = clone(archive);
  tampered.stores.localStorage.find(row => row.id === "bookingTransactions").raw += " ";
  await assert.rejects(async () => backup.verify(tampered), /verification/);
  assert.deepStrictEqual(backupRuntime.storage.history(), [], "backup does not alter booking commands");
  console.log("STAGE4_BOOKING_INTEGRITY_PASSED journal shape, ownership, recovery status, privacy and exact backup capture.");
}

main().catch(error => { console.error(error); process.exitCode = 1; });
