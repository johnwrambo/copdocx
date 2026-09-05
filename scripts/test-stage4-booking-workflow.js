"use strict";
const assert = require("assert");
const { createMemoryStorage, loadModelTab, loadScript, quietConsole } = require("./support/copdoc-vm-harness.js");
const WS = "copdocx.store.v1", PK = "alien-book-in.saved-records.v1", J = "copdocx.booking-transactions.v1", ADMIN = "copdoc.admin.v1";
const ok = r => { assert.ok(r && r.ok, r && r.error); return r; };
function runtime(storage) {
  const r = loadModelTab(storage || createMemoryStorage(), { console: quietConsole() });
  loadScript(r.context, "data/association-matrix.js");
  loadScript(r.context, "functions/officer-roster.js");
  loadScript(r.context, "functions/booking-workflow.js");
  r.api = r.context.COPDoc.booking;
  return r;
}
function packet(extra) { return Object.assign({ id: "bk_workflow", firstName: "Synthetic", lastName: "BOOKING", dateOfBirth: "1980-01-01", dateTime: "2026-09-05T12:00", arrestTime: "11:00", createdAt: "2026-09-05T12:00:00.000Z", updatedAt: "2026-09-05T12:00:00.000Z", formState: {} }, extra); }
function fixture(linked = false, reserve = false) {
  const r = runtime();
  r.packet = packet();
  if (linked) {
    r.storage.setRaw(ADMIN, { officers: [{ id: "officer_booking", firstName: "Synthetic", lastName: "OFFICER", fieldArrests: [] }] });
    const p = r.model.createPerson({ personId: "person_booking", name: { firstName: "Synthetic", lastName: "BOOKING" } });
    ok(r.model.store.upsertPerson(p));
    const e = r.model.createEncounterRecord({ encounterId: "enc_booking" });
    e.startedAt = "2026-09-05T11:00";
    e.subjects = reserve ? [] : [r.model.encounterSubjectFromPerson(p, { subjectId: "sub_booking", encounterId: e.encounterId, role: "TARGET", outcome: "ARRESTED", arrestingOfficerId: "officer_booking" })];
    e.vehicles = [r.model.createVehicle({ vehicleId: "vehicle_booking", licensePlate: "SYNTHETIC", vehicleMake: "Test" })];
    e.locations = [r.model.createLocation({ locationId: "location_booking", street: "100 Test", city: "Test", state: "TX", latitude: "0", longitude: "0" })];
    e.centerLocationId = "location_booking";
    ok(r.model.store.saveEncounter(e, { mode: "draft" }));
    r.packet = packet({ encounterId: e.encounterId, subjectId: reserve ? "" : "sub_booking", personId: p.personId, encounterRole: "TARGET", subjectRole: "TARGET" });
  }
  r.storage.resetWriteHistory(); return r;
}
function verifyExactlyOnce(r, result, linked) {
  const ws = r.storage.json(WS), packets = r.storage.json(PK), txs = Object.values(r.storage.json(J).transactions);
  assert.strictEqual(Object.keys(ws.people).length, 1);
  assert.strictEqual(Object.keys(ws.leads).length, 1);
  assert.strictEqual(packets.length, 1);
  const person = ws.people[result.record.personId], lead = ws.leads[result.record.leadId];
  assert.strictEqual(person.arrests.length, 1);
  assert.strictEqual(person.arrests[0].arrestId, result.record.arrestId);
  assert.strictEqual(lead.history.filter(h => h.bookinRecordId === result.bookingId).length, 1);
  assert.strictEqual(txs.filter(t => t.status !== "COMPLETED").length, 0);
  assert.ok(!txs[0].request, "completed receipt drops sensitive frozen input");
  if (linked) {
    const e = ws.encounters.enc_booking;
    assert.strictEqual(e.subjects.length, 1);
    assert.strictEqual(e.subjects[0].subjectId, result.record.subjectId);
    assert.strictEqual(e.subjects[0].bookingId, result.bookingId);
    assert.strictEqual(Object.values(ws.associations).filter(a => a.from.id === person.personId && a.to.id === "vehicle_booking").length, 1);
    if (e.subjects[0].arrestingOfficerId) {
      const arrests = r.storage.json(ADMIN).officers[0].fieldArrests;
      assert.strictEqual(arrests.length, 1); assert.strictEqual(arrests[0].subjectId, result.record.subjectId);
    }
  }
}
async function main() {
  // Successful workflows establish their actual storage-write boundaries.
  for (const [linked, reserve] of [[false, false], [true, false], [true, true]]) {
    const baseline = fixture(linked, reserve), saved = ok(await baseline.api.bookSubject(baseline.packet));
    verifyExactlyOnce(baseline, saved, linked);
    const writes = baseline.storage.history().filter(h => h.operation === "setItem");
    assert.strictEqual(writes[0].key, J, "journal precedes all booking side effects");
    // Inject a failure at every actual write (including all journal acks and
    // the final completion receipt), reload the runtime and resume the command.
    for (let n = 1; n <= writes.length; n++) {
      const r = fixture(linked, reserve); r.storage.failOnWrite(n);
      const failed = await r.api.bookSubject(r.packet);
      assert.strictEqual(failed.ok, false, `failure ${n} must not report success`);
      const next = runtime(r.storage); let recovered;
      const commands = next.api.listTransactions(); ok(commands);
      if (commands.transactions.length) recovered = ok(await next.api.resume(commands.transactions[0].transactionId));
      else {
        assert.strictEqual(r.storage.json(WS, {}).leads && Object.keys(r.storage.json(WS).leads).length || 0, 0, "failed journal creates no case");
        recovered = ok(await next.api.bookSubject(r.packet));
      }
      verifyExactlyOnce(next, recovered, linked);
      const before = r.storage.dump();
      ok(await next.api.resume(recovered.transactionId));
      assert.deepStrictEqual(r.storage.dump(), before, "completed retry is read-only");
    }
  }
  // Duplicate invocation and ordinary edit both preserve permanent identities.
  {
    const r = fixture(true), first = ok(await r.api.bookSubject(r.packet));
    const same = ok(await r.api.bookSubject(r.packet));
    assert.strictEqual(same.transactionId, first.transactionId);
    const edit = { ...first.record, firstName: "Edited", updatedAt: "2026-09-05T13:00:00.000Z" };
    const saved = ok(await r.api.bookSubject(edit, { expectedUpdatedAt: first.record.updatedAt }));
    assert.strictEqual(saved.record.arrestId, first.record.arrestId);
    verifyExactlyOnce(r, saved, true);
    const before = r.storage.dump();
    assert.strictEqual((await r.api.bookSubject({ ...edit, lastName: "STALE" }, { expectedUpdatedAt: first.record.updatedAt })).ok, false);
    assert.deepStrictEqual(r.storage.dump(), before);
  }
  // Corrupt stores are not replaced; invalid subjects never start a command.
  for (const [k, bad] of [[WS, "{"], [PK, "{}"], [J, "null"], [ADMIN, "{"]]) {
    const r = fixture(true); r.storage.setRaw(k, bad); const before = r.storage.dump();
    assert.strictEqual((await r.api.bookSubject(r.packet)).ok, false); assert.deepStrictEqual(r.storage.dump(), before);
  }
  {
    const r = fixture(); r.storage.setRaw(PK, [packet({ id: " bk_workflow " })]); const before = r.storage.dump();
    assert.strictEqual((await r.api.bookSubject(r.packet)).ok, false);
    assert.deepStrictEqual(r.storage.dump(), before, "noncanonical stored packet IDs cannot be duplicated or promoted");
  }
  {
    const r = fixture(true); r.storage.failOnWrite(2); const failed = await r.api.bookSubject(r.packet);
    assert.strictEqual(failed.ok, false);
    const ws = r.storage.json(WS); ws.people.person_booking.name.firstName = "Later edit before promotion"; r.storage.setRaw(WS, ws);
    const before = r.storage.raw(WS); assert.strictEqual((await runtime(r.storage).api.resume(failed.transactionId)).ok, false);
    assert.strictEqual(r.storage.raw(WS), before, "retry cannot overwrite a Person edited before initial promotion");
  }
  for (const change of [s => { s.outcome = "RELEASED"; }, s => { s.outcome = "FLED"; }, s => { s.personId = "missing"; }]) {
    const r = fixture(true), ws = r.storage.json(WS); change(ws.encounters.enc_booking.subjects[0]); r.storage.setRaw(WS, ws);
    assert.strictEqual((await r.api.bookSubject(r.packet)).ok, false);
    assert.strictEqual(r.storage.raw(PK), null);
  }
  // Later edits to owned facts block replay; unrelated domain data survives.
  for (const mutation of [ws => { ws.encounters.enc_booking.subjects = []; }, ws => { ws.encounters.enc_booking.meta.markedComplete = true; }]) {
    const r = fixture(true); r.storage.failNext(PK); const failed = await r.api.bookSubject(r.packet);
    const ws = r.storage.json(WS); mutation(ws); r.storage.setRaw(WS, ws); const before = r.storage.raw(WS);
    assert.strictEqual((await runtime(r.storage).api.resume(failed.transactionId)).ok, false);
    assert.strictEqual(r.storage.raw(WS), before, "recovery cannot recreate a deleted subject or unlock an Encounter");
  }
  {
    const r = fixture(); r.storage.failNext(PK); const failed = await r.api.bookSubject(r.packet);
    const data = r.storage.json(J); data.transactions[failed.transactionId].request.packet.id = "different_booking"; r.storage.setRaw(J, data);
    const before = r.storage.dump(); assert.strictEqual((await runtime(r.storage).api.resume(failed.transactionId)).ok, false);
    assert.deepStrictEqual(r.storage.dump(), before, "contradictory recovery requests cannot write any store");
  }
  {
    const r = fixture(), second = runtime(r.storage); let lockQueue = Promise.resolve(), acquisitions = 0;
    const locks = { request(name, options, action) {
      assert.strictEqual(name, "copdocx.booking-workflow.v1"); assert.strictEqual(options.mode, "exclusive");
      acquisitions++; const next = lockQueue.then(action); lockQueue = next.catch(() => {}); return next;
    } };
    r.context.navigator.locks = locks; second.context.navigator.locks = locks;
    const results = await Promise.all([r.api.bookSubject(r.packet), second.api.bookSubject(r.packet)]);
    results.forEach(ok); assert.strictEqual(acquisitions, 2);
    assert.strictEqual(results[0].transactionId, results[1].transactionId); verifyExactlyOnce(r, results[1], false);
  }
  {
    const r = fixture(true); r.storage.failNext(PK); const failed = await r.api.bookSubject(r.packet); assert.strictEqual(failed.ok, false);
    const ws = r.storage.json(WS); ws.people[failed.record.personId].name.lastName = "LATER EDIT"; ws.unrelated = { preserve: true }; r.storage.setRaw(WS, ws);
    const before = r.storage.raw(WS); assert.strictEqual((await runtime(r.storage).api.resume(failed.transactionId)).ok, false);
    assert.strictEqual(r.storage.raw(WS), before);
  }
  {
    const r = fixture(true); r.storage.failNext(PK); const failed = await r.api.bookSubject(r.packet);
    const ws = r.storage.json(WS); ws.operations = { untouched: { operationId: "untouched", name: "Unrelated" } }; r.storage.setRaw(WS, ws);
    const recovered = ok(await runtime(r.storage).api.resume(failed.transactionId));
    assert.strictEqual(r.storage.json(WS).operations.untouched.name, "Unrelated"); verifyExactlyOnce(r, recovered, true);
  }
  console.log("STAGE4_BOOKING_WORKFLOW_PASSED every write failure/restart, exact identity, edits, corruption and stale-recovery guards.");
}
main().catch(e => { console.error(e); process.exitCode = 1; });
