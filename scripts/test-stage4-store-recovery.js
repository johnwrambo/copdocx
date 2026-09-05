"use strict";

const assert = require("assert");
const { createMemoryStorage, loadModelTab, loadScript, quietConsole } = require("./support/copdoc-vm-harness.js");
const WORKSPACE = "copdocx.store.v1";
const ADMIN = "copdoc.admin.v1";
function ok(result) { assert.ok(result && result.ok, result && result.error); return result; }
function tab(storage) { return loadModelTab(storage || createMemoryStorage(), { console: quietConsole() }); }
function packet(id, extra) {
  return Object.assign({ id, lastName: "RECOVERY", firstName: "Test", dateOfBirth: "1980-01-01",
    dateTime: "2026-09-05T12:00", arrestTime: "11:00", iceEvent: "TEST-1" }, extra || {});
}
function promote(model, row, transactionId) {
  return model.store.promoteBookInRecord(row, { recoverBooking: true, bookingTransactionId: transactionId || "tx_recovery" });
}

// Crash after workspace persistence: no returned IDs reached the packet/journal.
{
  const storage = createMemoryStorage();
  const first = tab(storage);
  const row = packet("bk_recovery");
  const saved = ok(promote(first.model, row));
  const raw = storage.raw(WORKSPACE);
  const reloaded = tab(storage);
  storage.resetWriteHistory();
  const recovery = ok(reloaded.model.store.resolveBookInBooking(row.id));
  assert.strictEqual(recovery.found, true);
  assert.strictEqual(recovery.personId, saved.personId);
  assert.strictEqual(recovery.leadId, saved.leadId);
  assert.strictEqual(recovery.arrestId, saved.arrestId);
  assert.strictEqual(recovery.bookingTransactionId, "tx_recovery");
  assert.strictEqual(recovery.transactionUnchanged, true);
  assert.strictEqual(storage.writeCount(), 0, "recovery is strictly read-only");
  assert.strictEqual(storage.raw(WORKSPACE), raw);
  const replay = ok(promote(reloaded.model, packet(row.id, { lastName: "CHANGED", dateOfBirth: "1975-02-02" })));
  assert.strictEqual(replay.personId, saved.personId, "replay uses booking ownership even after identity text changes");
  assert.strictEqual(replay.arrestId, saved.arrestId);
  const data = storage.json(WORKSPACE);
  assert.strictEqual(Object.keys(data.people).length, 1);
  assert.strictEqual(Object.keys(data.leads).length, 1);
  assert.strictEqual(data.people[saved.personId].arrests.length, 1);
  assert.strictEqual(data.leads[saved.leadId].history.filter(event => event.bookinRecordId === row.id).length, 1);
  assert.strictEqual(ok(reloaded.model.store.resolveBookInBooking(row.id)).transactionUnchanged, true);
  data.people[saved.personId].name.firstName = "Later independent edit";
  storage.setRaw(WORKSPACE, data);
  assert.strictEqual(ok(reloaded.model.store.resolveBookInBooking(row.id)).transactionUnchanged, false);
  const before = storage.raw(WORKSPACE);
  assert.strictEqual(promote(reloaded.model, row).code, "BOOKIN_RECOVERY_SOURCE_CHANGED");
  assert.strictEqual(storage.raw(WORKSPACE), before, "same transaction cannot replay over later independent edits");
  assert.strictEqual(promote(reloaded.model, packet(row.id, { personId: "another_person" })).ok, false);
  assert.strictEqual(storage.raw(WORKSPACE), before, "recovery rejects mismatched IDs before any writes");
}

// The booking-specific save boundary retains canonical encounter history and rolls back
// its in-memory mutation even if the first workspace write fails (there is no old disk row).
{
  const storage = createMemoryStorage();
  const { model } = tab(storage);
  storage.failNext(WORKSPACE);
  const failed = promote(model, packet("bk_first_failure"));
  assert.strictEqual(failed.ok, false);
  assert.strictEqual(storage.raw(WORKSPACE), null);
  assert.strictEqual(model.store.getPerson(failed.personId), null, "failed first booking leaves no phantom Person");
  assert.strictEqual(model.store.getLead(failed.leadId), null, "failed first booking leaves no phantom Case");
  assert.strictEqual(ok(model.store.resolveBookInBooking("bk_first_failure")).found, false);
  const saved = ok(promote(model, packet("bk_history")));
  const data = storage.json(WORKSPACE);
  data.people[saved.personId].encounters = [{ encounterId: "enc_history", subjectId: "sub_history", outcome: "RELEASED" }];
  data.leads[saved.leadId].person.encounters = [];
  storage.setRaw(WORKSPACE, data);
  ok(promote(model, packet("bk_history", saved)));
  assert.deepStrictEqual(storage.json(WORKSPACE).people[saved.personId].encounters, data.people[saved.personId].encounters);
  assert.deepStrictEqual(storage.json(WORKSPACE).leads[saved.leadId].person.encounters, data.people[saved.personId].encounters);
  const before = storage.raw(WORKSPACE);
  storage.failNext(WORKSPACE);
  assert.strictEqual(promote(model, packet("bk_history", { ...saved, lastName: "FAILED" })).ok, false);
  assert.strictEqual(storage.raw(WORKSPACE), before);
  assert.notStrictEqual(model.store.getPerson(saved.personId).name.lastName, "FAILED");
}

// Contradictory canonical/projection/history/alias ownership is never guessed away.
{
  const storage = createMemoryStorage();
  const { model } = tab(storage);
  const saved = ok(promote(model, packet("bk_conflict")));
  const pristine = storage.json(WORKSPACE);
  function reject(mutator) {
    const data = JSON.parse(JSON.stringify(pristine));
    mutator(data);
    storage.setRaw(WORKSPACE, data);
    const before = storage.raw(WORKSPACE);
    assert.strictEqual(model.store.resolveBookInBooking("bk_conflict").ok, false);
    assert.strictEqual(storage.raw(WORKSPACE), before);
  }
  reject(data => data.people[saved.personId].arrests.push({ ...data.people[saved.personId].arrests[0] }));
  reject(data => { data.leads[saved.leadId].person.arrests[0].arrestId = "different_arrest"; });
  reject(data => { data.leads[saved.leadId].subjectPersonId = "different_person"; });
  reject(data => { data.people[saved.personId].arrests[0].bookinRecordId = "contradictory_alias"; });
  reject(data => { data.people[saved.personId].arrests = []; });
  reject(data => { const lead = JSON.parse(JSON.stringify(data.leads[saved.leadId])); lead.leadId = "duplicate_case"; data.leads[lead.leadId] = lead; });
  reject(data => { data.people[saved.personId].personId = "mismatched_dictionary_id"; });
  reject(data => { data.people[saved.personId].arrests.push({ arrestId: saved.arrestId }); });
  for (const raw of ["", "{broken", "null", "[]", '{"people":[],"leads":{}}']) {
    storage.setRaw(WORKSPACE, raw);
    assert.strictEqual(model.store.resolveBookInBooking("bk_conflict").ok, false);
    assert.strictEqual(storage.raw(WORKSPACE), raw);
  }
  storage.setRaw(WORKSPACE, pristine);
  model.store.loadFromDisk();
  storage.storage.removeItem(WORKSPACE);
  assert.strictEqual(ok(model.store.resolveBookInBooking("bk_conflict")).found, false, "resolver ignores stale memory after durable workspace removal");
}

// Admin projection: retries are idempotent, all booking/subject IDs survive, corrupt
// storage and conflicting claims fail before mutation, existing fields remain intact.
{
  const storage = createMemoryStorage({ [ADMIN]: { custom: "retain", officers: [
    { id: "officer_a", officerId: "officer_a", name: "A", fieldArrests: [] },
    { id: "officer_b", officerId: "officer_b", name: "B", fieldArrests: [] }
  ] } });
  const { context } = tab(storage);
  loadScript(context, "functions/officer-roster.js");
  const officers = context.COPDoc.officers;
  const entry = { arrestId: "arr_test", bookingId: "bk_test", subjectId: "sub_test", encounterId: "enc_test", personId: "person_test", bookedAt: "2026-09-05T12:00" };
  ok(officers.recordFieldArrest("officer_a", entry));
  const recorded = storage.json(ADMIN).officers[0].fieldArrests[0];
  assert.deepStrictEqual(recorded, entry);
  storage.resetWriteHistory();
  ok(officers.recordFieldArrest("officer_a", entry));
  assert.strictEqual(storage.writeCount(), 0, "identical retry doesn't even rewrite Admin");
  ok(officers.recordFieldArrest("officer_b", entry));
  assert.strictEqual(storage.json(ADMIN).officers[1].fieldArrests.length, 1, "multiple officers may share the same arrest fact");
  const before = storage.raw(ADMIN);
  for (const conflict of [{ ...entry, arrestId: "" }, { ...entry, personId: "another_person" }, { ...entry, bookingId: "another_booking" }, { ...entry, arrestId: "another_arrest" }, { ...entry, bookinRecordId: "split_alias" }]) {
    assert.strictEqual(officers.recordFieldArrest("officer_a", conflict).ok, false);
    assert.strictEqual(storage.raw(ADMIN), before);
  }
  const edit = storage.json(ADMIN);
  edit.officers[0].fieldArrests[0].custom = "keep";
  delete edit.officers[0].fieldArrests[0].subjectId;
  storage.setRaw(ADMIN, edit);
  storage.failNext(ADMIN);
  assert.strictEqual(officers.recordFieldArrest("officer_a", entry).ok, false);
  assert.strictEqual(storage.json(ADMIN).officers[0].fieldArrests[0].subjectId, undefined);
  ok(officers.recordFieldArrest("officer_a", entry));
  assert.strictEqual(storage.json(ADMIN).officers[0].fieldArrests[0].custom, "keep");
  const good = storage.json(ADMIN);
  for (const raw of ["{broken", "null", "[]", '{"officers":{}}']) {
    storage.setRaw(ADMIN, raw);
    assert.strictEqual(officers.recordFieldArrest("officer_a", entry).ok, false);
    assert.strictEqual(storage.raw(ADMIN), raw);
  }
  good.officers[0].fieldArrests.push({ ...entry });
  storage.setRaw(ADMIN, good);
  assert.strictEqual(officers.recordFieldArrest("officer_a", entry).ok, false);
}

console.log("STAGE4_STORE_RECOVERY_PASSED durable IDs, acknowledgements, drift detection, rollback, encounter history, officer replay and corrupt storage.");
