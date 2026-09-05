"use strict";

const assert = require("assert");
const { createMemoryStorage, createMinimalDocument, createTab, quietConsole, loadModelTab, loadScript } = require("./support/copdoc-vm-harness.js");
const WORKSPACE = "copdocx.store.v1";
const BOOKIN = "alien-book-in.saved-records.v1";
const clone = value => JSON.parse(JSON.stringify(value));
const committed = { status: "committed", updatedAt: "2026-09-05T12:00:00Z" };
const voidStamp = { voidedAt: "2026-09-05T13:00:00Z", voidReason: "Duplicate booking", voidTransactionId: "void_test" };
function workspace(values) {
  return Object.assign({ schema: WORKSPACE, currentLeadId: "", people: {}, leads: {}, encounters: {}, investigations: {}, operations: {}, vehicles: {}, locations: {}, businesses: {}, entities: {}, associations: {} }, values);
}
function bundle(values) {
  return Object.assign({ format: "copdocx.transfer.v1", leads: [], bookin: [], encounters: [], investigations: [], operations: [], officers: [], vehicles: [], shifts: [] }, values);
}
function runtime(initial) {
  const storage = createMemoryStorage(initial);
  const loaded = loadModelTab(storage, { console: quietConsole(), document: createMinimalDocument("home") });
  ["functions/arrest-report.js", "functions/oracle.js", "functions/encounter-narrative.js", "functions/transfer.js"].forEach(source => loadScript(loaded.context, source));
  return { storage, ...loaded };
}

function voidedConsumersPreserveEncounterFacts() {
  const person = { personId: "p_consumer", name: { firstName: "Test", lastName: "PERSON" }, immigration: {}, arrests: [
    Object.assign({ arrestId: "a_void", bookinRecordId: "b_void", subjectId: "s_consumer", encounterId: "e_consumer", arrestDate: "2026-09-05" }, voidStamp),
    { arrestId: "a_active", bookinRecordId: "b_active", arrestDate: "2026-09-05" }
  ] };
  const lead = { leadId: "l_consumer", subjectPersonId: person.personId, person, meta: clone(committed) };
  const subject = { subjectId: "s_consumer", personId: person.personId, encounterId: "e_consumer", leadId: lead.leadId, role: "TARGET", outcome: "ARRESTED", bookingId: "b_void" };
  const encounter = { encounterId: "e_consumer", startedAt: "2026-09-05T10:00", subjects: [subject], eventType: "VEHICLE_STOP", meta: { ...committed, markedComplete: true }, completed: { startedAt: "2026-09-05T10:00", eventType: "VEHICLE_STOP", subjects: [subject], locations: [] } };
  const packets = [Object.assign({ id: "b_void", subjectId: subject.subjectId, personId: person.personId, leadId: lead.leadId, encounterId: encounter.encounterId, formState: { medicalIssues: { value: "VOID_PACKET_SECRET" }, cash: { value: "999" } } }, voidStamp)];
  const r = runtime({ [WORKSPACE]: workspace({ people: { [person.personId]: person }, leads: { [lead.leadId]: lead }, encounters: { [encounter.encounterId]: encounter } }), [BOOKIN]: packets });
  const before = r.storage.dump();
  const rows = r.context.COPDoc.arrestReport.collect(r.model.store, packets, {});
  assert.strictEqual(rows.length, 1, "active reports omit voided canonical Arrests");
  assert.strictEqual(rows[0].arrestId, "a_active");
  assert.strictEqual(r.context.COPDoc.arrestReport.collect(r.model.store, packets, { bookinRecordIds: ["b_void"] }).length, 0, "explicit old selection cannot include a voided booking");
  const result = r.context.COPDoc.oracle.summarize({ leads: [lead], encounters: [encounter], from: "2026-09-05", to: "2026-09-05", today: "2026-09-05T15:00Z", catalogs: {} });
  assert.strictEqual(result.arrests, 1, "Oracle booked arrest counts omit voided Arrests");
  assert.strictEqual(result.stops[0].arrested, 1, "voiding booking paperwork does not erase actual Encounter outcome history");
  const narrative = r.context.COPDoc.encounterNarrative.bundleFromEncounterRecord(encounter, { bookinRecords: packets });
  assert.strictEqual(narrative.participants.length, 1);
  assert.strictEqual(narrative.participants[0].finalOutcome, "ARRESTED");
  assert.ok(!JSON.stringify(narrative).includes("VOID_PACKET_SECRET"), "voided packet does not enrich narrative");
  const unlinked = clone(encounter);
  delete unlinked.subjects[0].bookingId;
  unlinked.subjects[0].bookingUnlinked = true;
  unlinked.subjects[0].bookingVoid = { bookingId: "b_void", ...voidStamp };
  const stalePacket = clone(packets[0]); delete stalePacket.voidedAt;
  const staleBundle = r.context.COPDoc.encounterNarrative.bundleFromEncounterRecord(unlinked, { bookinRecords: [stalePacket] });
  assert.ok(!JSON.stringify(staleBundle).includes("VOID_PACKET_SECRET"), "stale packet cannot bypass canonical unlink/void marker");
  assert.deepStrictEqual(r.storage.dump(), before, "reports and adapters remain read-only");
}

function importsCannotResurrectLifecycle() {
  const archived = { operationId: "op_archived", name: "History", meta: { ...committed, archivedAt: "2026-09-05T13:00Z", archiveReason: "Finished" } };
  const packet = { id: "book_void", ...voidStamp, formState: {} };
  const association = { associationId: "assoc_ended", from: { type: "PERSON", id: "p1" }, to: { type: "VEHICLE", id: "v1" }, relationshipStatus: "RETRACTED", retractedAt: "2026-09-05", junked: true };
  const r = runtime({ [WORKSPACE]: workspace({ operations: { [archived.operationId]: archived }, associations: { [association.associationId]: association } }), [BOOKIN]: [packet] });
  const unchanged = r.storage.dump();
  const restored = clone(archived); delete restored.meta.archivedAt;
  let result = r.context.COPDoc.transfer.applyImport(bundle({ operations: [restored], settings: { shouldNotWrite: true } }), ["operations"]);
  assert.match(result.error, /archived/i);
  assert.deepStrictEqual(r.storage.dump(), unchanged, "archive resurrection blocks all writes");
  result = r.context.COPDoc.transfer.applyImport(bundle({ bookin: [{ id: packet.id, formState: {} }] }), ["bookin"]);
  assert.match(result.error, /voided/i);
  assert.deepStrictEqual(r.storage.dump(), unchanged, "void resurrection blocks all writes");
  result = r.context.COPDoc.transfer.applyImport(bundle({ bookin: [{ id: "new_void", ...voidStamp, formState: {} }] }), ["bookin"]);
  assert.match(result.error, /existing coordinated void/i);
  assert.deepStrictEqual(r.storage.dump(), unchanged, "an orphan imported void packet cannot bypass canonical recovery");
  const active = { ...association }; delete active.retractedAt; active.relationshipStatus = "ACTIVE"; active.junked = false;
  result = r.context.COPDoc.transfer.applyImport(bundle({ investigationObjects: { associations: { [association.associationId]: active } } }), ["investigations"]);
  assert.match(result.error, /retracted/i);
  assert.deepStrictEqual(r.storage.dump(), unchanged, "relationship tombstone cannot be removed by import");
}

function objectImportsShareIdentityAndAuthority() {
  const person = { personId: "p_canonical", name: { firstName: "Current", lastName: "PERSON" }, immigration: { alienNumber: "123456789" }, arrests: [{ arrestId: "a_protected", ...voidStamp }] };
  const vehicle = { vehicleId: "v_current", id: "v_current", vehicleMake: "Current", licensePlate: "CURRENT" };
  const r = runtime({ [WORKSPACE]: workspace({ people: { [person.personId]: person }, vehicles: { [vehicle.vehicleId]: vehicle } }) });
  const transfer = r.context.COPDoc.transfer;
  const before = r.storage.dump();
  const duplicate = { personId: "p_duplicate", name: { lastName: "Different" }, immigration: { alienNumber: "A123 456 789" } };
  let result = transfer.applyImport(bundle({ leads: [{ leadId: "l_duplicate", person: duplicate, subjectPersonId: duplicate.personId, meta: clone(committed) }] }), ["leads"]);
  assert.ok(result.error, "duplicate strong identity must fail shared validation");
  assert.deepStrictEqual(r.storage.dump(), before, "duplicate identity fails before all writes");
  const stale = clone(person); stale.name.firstName = "Old"; stale.arrests = [];
  result = transfer.applyImport(bundle({ leads: [{ leadId: "l_new", person: stale, subjectPersonId: stale.personId, vehicles: [{ ...vehicle, vehicleMake: "Old", licensePlate: "OLD" }], meta: clone(committed) }] }), ["leads"]);
  assert.strictEqual(result.error, "", result.error);
  const after = r.storage.json(WORKSPACE);
  assert.strictEqual(after.people.p_canonical.name.firstName, "Current");
  assert.ok(after.people.p_canonical.arrests[0].voidedAt, "embedded import cannot erase canonical Arrest tombstone");
  assert.strictEqual(after.leads.l_new.person.name.firstName, "Current");
  assert.strictEqual(after.leads.l_new.vehicles[0].licensePlate, "CURRENT");
  const mismatch = { ...vehicle, id: "wrong_id" };
  result = transfer.applyImport(bundle({ investigationObjects: { vehicles: { v_current: mismatch } } }), ["investigations"]);
  assert.ok(result.error, "contradictory dictionary/object aliases cannot silently normalize");
  const noModelStorage = createMemoryStorage({ [WORKSPACE]: workspace() });
  const noModel = createTab(noModelStorage, { document: createMinimalDocument("home"), console: quietConsole() });
  loadScript(noModel, "functions/transfer.js");
  result = noModel.COPDoc.transfer.applyImport(bundle({ leads: [{ leadId: "l_direct", person, meta: clone(committed) }] }), ["leads"]);
  assert.match(result.error, /identity validator is unavailable/i, "direct API must fail closed when shared validator is absent");
}

function adminImportsPreserveHistoricalFacts() {
  const officer = { officerId: "officer_history", id: "officer_history", firstName: "Current", meta: { ...committed, createdAt: "2020-01-01" }, fieldArrests: [{ arrestId: "admin_arrest", bookinRecordId: "admin_booking", ...voidStamp }] };
  const inactive = { officerId: "officer_inactive", id: "officer_inactive", inactive: true, junked: true, archivedAt: "2026-09-05", junkedAt: "2026-09-05", meta: clone(committed) };
  const r = runtime({ [WORKSPACE]: workspace(), "copdoc.admin.v1": { officers: [officer, inactive], vehicles: [], shifts: [] } });
  let result = r.context.COPDoc.transfer.applyImport(bundle({ officers: [{ officerId: officer.officerId, id: officer.id, firstName: "Updated", meta: { status: "committed", updatedAt: "2026-09-06" } }] }), ["officers"]);
  assert.strictEqual(result.error, "", result.error);
  const saved = r.storage.json("copdoc.admin.v1").officers.find(row => row.officerId === officer.officerId);
  assert.strictEqual(saved.firstName, "Updated");
  assert.deepStrictEqual(saved.fieldArrests, officer.fieldArrests, "omitted import facts cannot wipe officer Arrest history");
  assert.strictEqual(saved.meta.createdAt, "2020-01-01");
  const before = r.storage.dump();
  result = r.context.COPDoc.transfer.applyImport(bundle({ officers: [{ ...officer, fieldArrests: [] }] }), ["officers"]);
  assert.match(result.error, /canonical Arrest history/i);
  assert.deepStrictEqual(r.storage.dump(), before);
  result = r.context.COPDoc.transfer.applyImport(bundle({ officers: [{ ...inactive, inactive: false, junked: false, archivedAt: "" }] }), ["officers"]);
  assert.match(result.error, /archived|inactive/i);
  assert.deepStrictEqual(r.storage.dump(), before, "archived officers cannot be silently restored through transfer");
}

async function staleBaseballTabCannotWriteVoidedBooking() {
  const person = { personId: "p_card", name: { lastName: "TEST" }, immigration: {}, arrests: [{ arrestId: "a_card", bookinRecordId: "b_card", ...voidStamp }] };
  const lead = { leadId: "l_card", subjectPersonId: person.personId, person, meta: clone(committed) };
  const storage = createMemoryStorage({ [WORKSPACE]: workspace({ people: { p_card: person }, leads: { l_card: lead } }), [BOOKIN]: [{ id: "b_card", ...voidStamp }] });
  const document = createMinimalDocument("baseballcard");
  const status = { textContent: "", classList: { toggle() {} } };
  const editor = { textContent: "Preserved historical prose", innerText: "Preserved historical prose", children: [], addEventListener() {} };
  document.getElementById = id => id === "baseballCardStatus" ? status : id === "baseballCardEditor" ? editor : null;
  const loaded = loadModelTab(storage, { document, console: quietConsole(), location: { search: "?leadId=l_card&recordId=b_card" } });
  loadScript(loaded.context, "functions/baseball-page.js");
  document._dispatch("DOMContentLoaded");
  const before = storage.dump();
  assert.strictEqual(await loaded.context.persistBaseballCard(), false);
  assert.match(status.textContent, /voided/i);
  assert.deepStrictEqual(storage.dump(), before, "stale Baseball Card tab cannot modify voided booking output or Person fields");
}

(async () => {
  voidedConsumersPreserveEncounterFacts();
  importsCannotResurrectLifecycle();
  objectImportsShareIdentityAndAuthority();
  adminImportsPreserveHistoricalFacts();
  await staleBaseballTabCannotWriteVoidedBooking();
  console.log("STAGE5_CONSUMERS_PASSED active counts, historical outcomes, void enrichment, import lifecycle and identity guards.");
})().catch(error => { console.error(error); process.exitCode = 1; });
