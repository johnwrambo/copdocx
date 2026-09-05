"use strict";
const assert = require("assert");
const { createMemoryStorage, loadModelTab, loadScript, quietConsole } = require("./support/copdoc-vm-harness.js");
const WS = "copdocx.store.v1", PK = "alien-book-in.saved-records.v1", J = "copdocx.booking-transactions.v1", ADMIN = "copdoc.admin.v1";
const ok = r => { assert.ok(r && r.ok, r && r.error); return r; };
function runtime(storage) {
  const r = loadModelTab(storage || createMemoryStorage(), { console: quietConsole() });
  ["data/association-matrix.js", "functions/officer-roster.js", "functions/booking-workflow.js"].forEach(p => loadScript(r.context, p));
  r.api = r.context.COPDoc.booking;
  return r;
}
async function fixture(linked = true) {
  const r = runtime();
  let p = { id: "bk_void", firstName: "Synthetic", lastName: "VOID", dateOfBirth: "1980-01-01", dateTime: "2026-09-05T12:00", arrestTime: "11:00", createdAt: "2026-09-05T12:00:00.000Z", updatedAt: "2026-09-05T12:00:00.000Z", formState: {} };
  if (linked) {
    r.storage.setRaw(ADMIN, { officers: [{ id: "off_void", firstName: "Synthetic", lastName: "OFFICER", fieldArrests: [] }] });
    const person = r.model.createPerson({ personId: "person_void", name: { firstName: "Synthetic", lastName: "VOID" } });
    ok(r.model.store.upsertPerson(person));
    const encounter = r.model.createEncounterRecord({ encounterId: "enc_void" });
    encounter.startedAt = "2026-09-05T11:00";
    encounter.subjects = [r.model.encounterSubjectFromPerson(person, { subjectId: "sub_void", encounterId: "enc_void", role: "TARGET", outcome: "ARRESTED", arrestingOfficerId: "off_void" })];
    ok(r.model.store.saveEncounter(encounter, { mode: "draft" }));
    p = { ...p, encounterId: "enc_void", subjectId: "sub_void", personId: "person_void", encounterRole: "TARGET", subjectRole: "TARGET" };
  }
  r.packet = ok(await r.api.bookSubject(p)).record;
  r.storage.resetWriteHistory();
  return r;
}
function verify(r, result, linked) {
  const ws = r.storage.json(WS), packet = r.storage.json(PK).find(p => p.id === "bk_void");
  assert.ok(packet.voidedAt);
  assert.strictEqual(packet.voidReason, "Duplicate booking corrected");
  assert.strictEqual(packet.voidTransactionId, result.transactionId);
  const person = ws.people[packet.personId], lead = ws.leads[packet.leadId];
  assert.strictEqual(person.arrests.length, 1, "original Arrest retained");
  assert.strictEqual(person.arrests[0].voidTransactionId, result.transactionId);
  assert.strictEqual(lead.person.arrests[0].voidTransactionId, result.transactionId);
  assert.strictEqual(lead.history.filter(h => h.type === "BOOKING_VOIDED").length, 1);
  assert.strictEqual(lead.history.filter(h => h.bookinRecordId === "bk_void").length, 1, "original history retained");
  const tx = r.storage.json(J).transactions[result.transactionId];
  assert.strictEqual(tx.status, "COMPLETED");
  assert.ok(!tx.request, "completed receipt drops frozen packet");
  if (linked) {
    const enc = ws.encounters.enc_void, s = enc.subjects[0];
    assert.strictEqual(s.subjectId, "sub_void");
    assert.strictEqual(s.outcome, "ARRESTED", "void does not change actual encounter outcome");
    assert.ok(!s.bookingId && !s.bookinRecordId);
    assert.strictEqual(enc.bookingIdentityHistory.filter(h => h.bookinRecordId === "bk_void").length, 1);
    assert.strictEqual(r.storage.json(ADMIN).officers[0].fieldArrests.length, 1);
    assert.ok(r.storage.json(ADMIN).officers[0].fieldArrests[0].voidedAt);
  }
}
async function main() {
  for (const linked of [false, true]) {
    const baseline = await fixture(linked);
    assert.strictEqual(ok(baseline.api.planRemoval("bk_void")).action, "VOID");
    const result = ok(await baseline.api.voidBooking("bk_void", { reason: "Duplicate booking corrected", expectedUpdatedAt: baseline.packet.updatedAt }));
    verify(baseline, result, linked);
    const writes = baseline.storage.history().filter(h => h.operation === "setItem");
    assert.strictEqual(writes[0].key, J, "journal precedes void side effects");
    for (let n = 1; n <= writes.length; n++) {
      const r = await fixture(linked); r.storage.failOnWrite(n);
      const failed = await r.api.voidBooking("bk_void", { reason: "Duplicate booking corrected" });
      assert.strictEqual(failed.ok, false, `write failure ${n} must be reported`);
      const next = runtime(r.storage), pending = ok(next.api.listTransactions()).transactions.find(t => t.kind === "VOID");
      const recovered = ok(pending ? await next.api.resume(pending.transactionId) : await next.api.voidBooking("bk_void", { reason: "Duplicate booking corrected" }));
      verify(next, recovered, linked);
      const before = r.storage.dump();
      ok(await next.api.resume(recovered.transactionId));
      ok(await next.api.voidBooking("bk_void", { reason: "Duplicate booking corrected" }));
      assert.deepStrictEqual(r.storage.dump(), before, "repeat void/recovery is read-only");
    }
    const before = baseline.storage.dump();
    assert.strictEqual((await baseline.api.deleteDraftBooking("bk_void")).ok, false);
    assert.strictEqual((await baseline.api.bookSubject(baseline.packet)).ok, false, "old packet cannot reactivate");
    assert.deepStrictEqual(baseline.storage.dump(), before);
  }
  for (const mutate of [
    ws => { ws.encounters.enc_void.meta.markedComplete = true; },
    ws => { ws.encounters.enc_void.narratives = [{ narrativeId: "n_final", workflowStatus: "FINALIZED" }]; }
  ]) {
    const r = await fixture(); const ws = r.storage.json(WS); mutate(ws); r.storage.setRaw(WS, ws);
    const before = r.storage.dump();
    assert.strictEqual((await r.api.voidBooking("bk_void", { reason: "Duplicate booking corrected" })).ok, false);
    assert.deepStrictEqual(r.storage.dump(), before, "finalized dependency blocks before journal mutation");
  }
  {
    const r = await fixture(), before = r.storage.dump();
    assert.strictEqual((await r.api.voidBooking("bk_void", { reason: "" })).ok, false);
    assert.strictEqual((await r.api.voidBooking("bk_void", { reason: "Wrong timestamp", expectedUpdatedAt: "stale" })).ok, false);
    assert.deepStrictEqual(r.storage.dump(), before);
  }
  {
    const r = await fixture();
    const voided = ok(await r.api.voidBooking("bk_void", { reason: "Duplicate booking corrected" }));
    const replacement = { ...r.packet, id: "bk_replacement", updatedAt: "2026-09-05T14:00:00.000Z" };
    delete replacement.arrestId;
    delete replacement.bookinRecordId;
    delete replacement.bookingId;
    const next = ok(await r.api.bookSubject(replacement));
    assert.notStrictEqual(next.record.arrestId, r.packet.arrestId);
    const ws = r.storage.json(WS), p = ws.people[r.packet.personId];
    assert.strictEqual(p.arrests.length, 2);
    assert.strictEqual(p.arrests.filter(a => !a.voidedAt).length, 1);
    assert.strictEqual(ws.encounters.enc_void.subjects[0].subjectId, "sub_void");
    assert.strictEqual(ws.encounters.enc_void.subjects[0].bookingId, "bk_replacement");
    assert.strictEqual(r.storage.json(PK).length, 2);
    const before = r.storage.dump();
    ok(await r.api.resume(voided.transactionId));
    assert.deepStrictEqual(r.storage.dump(), before, "old void receipt remains verifiable after a new booking");
  }
  {
    const r = runtime(); r.storage.setRaw(PK, [{ id: "unused_draft", encounterProjectionDraft: true, updatedAt: "draft_v1", formState: {} }]);
    assert.strictEqual(ok(r.api.planRemoval("unused_draft")).action, "DELETE");
    ok(await r.api.deleteDraftBooking("unused_draft", { expectedUpdatedAt: "draft_v1" }));
    assert.deepStrictEqual(r.storage.json(PK), []);
  }
  {
    const r = runtime(); r.storage.setRaw(PK, [{ id: "legacy_unknown", firstName: "Historical", dateTime: "2020-01-01T12:00", iceEvent: "OLD-1", formState: {} }]);
    const before = r.storage.dump();
    assert.strictEqual(r.api.planRemoval("legacy_unknown").ok, false);
    assert.strictEqual((await r.api.deleteDraftBooking("legacy_unknown")).ok, false);
    assert.deepStrictEqual(r.storage.dump(), before, "absence of canonical pointers is not proof that a legacy packet is an unused draft");
  }
  {
    const r = await fixture(); r.storage.failNext(PK);
    const failed = await r.api.voidBooking("bk_void", { reason: "Duplicate booking corrected" });
    assert.strictEqual(failed.ok, false);
    const packets = r.storage.json(PK); packets[0].firstName = "Later changed source"; r.storage.setRaw(PK, packets);
    const before = r.storage.dump();
    assert.strictEqual((await runtime(r.storage).api.resume(failed.transactionId)).ok, false);
    assert.strictEqual(r.storage.raw(PK), before[PK], "conflicting source is not overwritten by retry");
  }
  console.log("STAGE5_BOOKING_VOID_PASSED retained history, every-write recovery, locked records, draft deletion and stale source guards.");
}
main().catch(e => { console.error(e); process.exitCode = 1; });
