"use strict";

const assert = require("assert");
const { createMemoryStorage, loadModelTab, loadScript, quietConsole } = require("./support/copdoc-vm-harness.js");
const WS = "copdocx.store.v1", PK = "alien-book-in.saved-records.v1", J = "copdocx.booking-transactions.v1";
const ok = r => { assert.ok(r && r.ok, r && r.error); return r; };
const has = (report, rule) => report.findings.some(row => row.ruleId === rule);
const clone = value => JSON.parse(JSON.stringify(value));

function runtime(storage) {
  const r = loadModelTab(storage || createMemoryStorage(), { console: quietConsole() });
  ["data/association-matrix.js", "functions/officer-roster.js", "functions/booking-workflow.js", "functions/integrity.js"].forEach(file => loadScript(r.context, file));
  r.api = r.context.COPDoc.booking;
  r.scan = () => r.context.COPDoc.integrity.scanSnapshot({
    workspace: r.storage.json(WS), bookin: r.storage.json(PK, []),
    bookingTransactions: r.storage.json(J), admin: { officers: [], vehicles: [], shifts: [] }, media: []
  });
  return r;
}

async function fixture(linked = true) {
  const r = runtime();
  let refs = {};
  if (linked) {
    const person = r.model.createPerson({ personId: "person_lifecycle", name: { firstName: "Test", lastName: "LIFECYCLE" } });
    ok(r.model.store.upsertPerson(person));
    const encounter = r.model.createEncounterRecord({ encounterId: "enc_lifecycle" });
    encounter.startedAt = "2026-09-05T11:00";
    encounter.subjects = [r.model.encounterSubjectFromPerson(person, { subjectId: "sub_lifecycle", encounterId: encounter.encounterId, role: "TARGET", outcome: "ARRESTED" })];
    ok(r.model.store.saveEncounter(encounter, { mode: "draft" }));
    refs = { encounterId: encounter.encounterId, subjectId: "sub_lifecycle", personId: person.personId };
  }
  r.packet = { id: "booking_lifecycle", firstName: "Test", lastName: "LIFECYCLE", dateOfBirth: "1980-01-01",
    dateTime: "2026-09-05T12:00", arrestTime: "11:00", formState: {}, ...refs };
  r.saved = ok(await r.api.bookSubject(r.packet));
  return r;
}

function noFalseLifecycleFindings(report) {
  for (const rule of ["BOOKIN_ENCOUNTER_SUBJECT_MISSING", "BOOKIN_VOID_MARKER_MISMATCH", "BOOKING_TRANSACTION_IDENTITY_CONFLICT", "BOOKING_TRANSACTION_INVALID"]) {
    assert.ok(!has(report, rule), rule + ": " + JSON.stringify(report.findings.filter(row => row.ruleId === rule)));
  }
}

async function main() {
  for (const linked of [true, false]) {
    const r = await fixture(linked);
    ok(await r.api.voidBooking(r.packet.id, { reason: "Duplicate entry" }));
    const before = r.storage.dump();
    noFalseLifecycleFindings(r.scan());
    assert.deepStrictEqual(r.storage.dump(), before, "scan never mutates lifecycle history");
    assert.ok(!has(r.scan(), "BOOKING_TRANSACTION_INCOMPLETE"));
    const bad = clone(before);
    const records = JSON.parse(bad[PK]); records[0].voidTransactionId = "forged_void";
    r.storage.setRaw(PK, records);
    assert.ok(has(r.scan(), "BOOKIN_VOID_MARKER_MISMATCH"), "marker mismatch is not classified as valid history");
    Object.entries(before).forEach(([key, value]) => r.storage.setRaw(key, value));
    if (linked) {
      const ws = r.storage.json(WS);
      ws.encounters.enc_lifecycle.subjects[0].bookingId = r.packet.id;
      ws.encounters.enc_lifecycle.subjects[0].bookinRecordId = r.packet.id;
      r.storage.setRaw(WS, ws);
      assert.ok(has(r.scan(), "ENCOUNTER_BOOKIN_VOIDED"), "active subject cannot point to voided packet");
    }
  }

  // Canonical void may have succeeded before a packet write failed. Its exact
  // journal+tombstone evidence explains the gap; it still requires recovery.
  {
    const r = await fixture();
    r.storage.failNext(PK);
    const failed = await r.api.voidBooking(r.packet.id, { reason: "PRIVATE_VOID_REASON_NOT_FOR_REPORT" });
    assert.strictEqual(failed.ok, false);
    assert.ok(!r.storage.json(PK)[0].voidedAt);
    assert.ok(r.storage.json(WS).people[r.saved.record.personId].arrests[0].voidedAt);
    const report = r.scan();
    assert.ok(has(report, "BOOKING_TRANSACTION_INCOMPLETE"));
    noFalseLifecycleFindings(report);
    assert.ok(!JSON.stringify(report).includes("PRIVATE_VOID_REASON_NOT_FOR_REPORT"));
    ok(await r.api.resume(failed.transactionId));
    noFalseLifecycleFindings(r.scan());
  }

  // Two completed receipts for an older voided booking remain valid when the
  // permanent EncounterSubject is booked again under a new booking/Arrest ID.
  {
    const r = await fixture();
    ok(await r.api.voidBooking(r.packet.id, { reason: "Duplicate entry" }));
    const replacement = { ...r.packet, id: "booking_replacement", leadId: r.saved.record.leadId };
    const savedAgain = ok(await r.api.bookSubject(replacement));
    assert.notStrictEqual(savedAgain.record.arrestId, r.saved.record.arrestId);
    noFalseLifecycleFindings(r.scan());
    const ws = r.storage.json(WS);
    ws.encounters.enc_lifecycle.bookingIdentityHistory = [];
    r.storage.setRaw(WS, ws);
    const corrupt = r.scan();
    assert.ok(has(corrupt, "BOOKIN_VOID_MARKER_MISMATCH"));
    assert.ok(has(corrupt, "BOOKING_TRANSACTION_IDENTITY_CONFLICT"), "missing ownership history cannot justify changed booking IDs");
  }

  // Explicit ENDED and RETRACTED facts are retained history, not duplicate active
  // assertions, and their junked historical endpoint is not an active edge.
  {
    const r = runtime();
    const source = { schema: WS, people: { p: { personId: "p", junked: true } }, vehicles: { v: { vehicleId: "v" } },
      associations: {
        ended: { associationId: "ended", from: { type: "PERSON", id: "p" }, to: { type: "VEHICLE", id: "v" }, reason: "REGISTERED_OWNER_OF", relationshipStatus: "ENDED", endedAt: "2026-09-01", occupancy: "historical" },
        retracted: { associationId: "retracted", from: { type: "PERSON", id: "p" }, to: { type: "VEHICLE", id: "v" }, reason: "REGISTERED_OWNER_OF", relationshipStatus: "RETRACTED", retractedAt: "2026-09-02", junked: true }
      } };
    const report = r.context.COPDoc.integrity.scanSnapshot({ workspace: source, bookin: [], admin: {}, media: [] });
    assert.ok(!has(report, "DUPLICATE_LOGICAL_ASSOCIATION"));
    assert.ok(!has(report, "ASSOCIATION_ACTIVE_TO_JUNKED_OBJECT"));
    source.associations.active = { ...source.associations.ended, associationId: "active", relationshipStatus: "ACTIVE", endedAt: "" };
    const activeReport = r.context.COPDoc.integrity.scanSnapshot({ workspace: source, bookin: [], admin: {}, media: [] });
    assert.ok(has(activeReport, "ASSOCIATION_ACTIVE_TO_JUNKED_OBJECT"));
  }
  console.log("STAGE5_INTEGRITY_PASSED verified void history, rebooking receipts, interrupted void recovery, active-link corruption and privacy.");
}

main().catch(error => { console.error(error); process.exitCode = 1; });
