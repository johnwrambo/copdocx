"use strict";
const assert = require("assert");
const { createMemoryStorage, loadModelTab, loadScript, quietConsole } = require("./support/copdoc-vm-harness.js");
const WORKSPACE = "copdocx.store.v1";
const PACKETS = "alien-book-in.saved-records.v1";
const JOURNAL = "copdocx.booking-transactions.v1";
function ok(result) { assert.ok(result && result.ok, result && result.error); return result; }
function copy(value) { return JSON.parse(JSON.stringify(value)); }
function blank() {
  return { schema: WORKSPACE, people: {}, leads: {}, encounters: {}, investigations: {},
    vehicles: {}, locations: {}, businesses: {}, entities: {}, associations: {}, operations: {} };
}
function fixture(data, extra) {
  const storage = createMemoryStorage(Object.assign({ [WORKSPACE]: data || blank() }, extra || {}));
  const tab = loadModelTab(storage, { console: quietConsole() });
  return Object.assign(tab, { storage, store: tab.model.store });
}
function draft(id, extra) {
  return Object.assign({ meta: { status: "draft", createdAt: "2026-09-05T10:00:00Z", updatedAt: "2026-09-05T10:00:00Z" } }, extra || {});
}
function packet(id) {
  return { id, lastName: "VOID", firstName: "Fixture", dateOfBirth: "1980-01-01", dateTime: "2026-09-05T12:00", arrestTime: "11:00" };
}

// Actual references in canonical records, embedded snapshots, maps, packet,
// journal and admin event history are returned with exact record IDs and paths.
{
  const data = blank();
  data.people.p_shared = draft("", { personId: "p_shared", name: { firstName: "Test", lastName: "Fixture" }, locations: [{ locationId: "loc_shared" }] });
  data.locations.loc_shared = draft("", { locationId: "loc_shared" });
  data.vehicles.v_shared = draft("", { vehicleId: "v_shared" });
  data.encounters.enc_one = draft("", { encounterId: "enc_one", subjects: [{ subjectId: "sub_one", personId: "p_shared" }],
    narratives: [{ narrativeId: "n_one", context: { primaryLocation: { locationId: "loc_shared" }, primaryPhotoId: "media_shared" } }] });
  data.operations.op_one = draft("", { operationId: "op_one", opLocations: [{ locationId: "loc_shared" }] });
  data.associations.assoc_one = { associationId: "assoc_one", from: { type: "PERSON", id: "p_shared" }, to: { type: "VEHICLE", id: "v_shared" } };
  const { storage, store } = fixture(data, {
    [PACKETS]: [{ id: "bk_one", personId: "p_shared" }],
    [JOURNAL]: { schema: JOURNAL, transactions: { tx_one: { transactionId: "tx_one", bookingId: "bk_one", request: { packet: { personId: "p_shared" } } } } },
    "copdoc.admin.v1": { officers: [{ officerId: "off_one", arrests: [{ personId: "p_shared" }] }] }
  });
  storage.resetWriteHistory();
  const people = ok(store.dependenciesFor("PERSON", "p_shared")).dependencies;
  assert.ok(people.some(row => row.recordType === "ENCOUNTER" && row.recordId === "enc_one"));
  assert.ok(people.some(row => row.recordType === "BOOKING" && row.recordId === "bk_one"));
  assert.ok(people.some(row => row.recordType === "BOOKING_TRANSACTION" && row.recordId === "tx_one"));
  assert.ok(people.some(row => row.recordType === "OFFICER" && row.recordId === "off_one"));
  assert.ok(people.some(row => row.recordType === "ASSOCIATION" && row.recordId === "assoc_one"));
  const locations = ok(store.dependenciesFor("LOCATION", "loc_shared")).dependencies;
  assert.ok(locations.some(row => row.path.includes(".narratives[0].context.primaryLocation.locationId")));
  assert.ok(locations.some(row => row.recordId === "op_one"));
  assert.ok(locations.some(row => row.recordId === "p_shared"));
  assert.ok(ok(store.dependenciesFor("MEDIA", "media_shared")).dependencies.some(row => row.recordId === "enc_one"));
  assert.strictEqual(storage.writeCount(), 0, "dependency inspection never persists or repairs");
}

// Empty drafts delete, while filed history and referenced Operations cannot.
{
  const data = blank();
  data.encounters.enc_draft = draft("", { encounterId: "enc_draft", subjects: [], vehicles: [{ vehicleId: "v_shared" }], locations: [{ locationId: "loc_shared" }] });
  data.vehicles.v_shared = draft("", { vehicleId: "v_shared" });
  data.locations.loc_shared = draft("", { locationId: "loc_shared" });
  data.operations.op_linked = draft("", { operationId: "op_linked" });
  data.encounters.enc_filed = { encounterId: "enc_filed", operationId: "op_linked", subjects: [], meta: { status: "committed" } };
  const { context, storage, store } = fixture(data);
  let cascadeCalls = 0;
  context.COPDoc.media = { removeByOwner() { cascadeCalls += 1; return Promise.resolve(); } };
  const blocked = store.deleteOperation("op_linked");
  assert.strictEqual(blocked.code, "DEPENDENCIES_EXIST");
  assert.ok(blocked.dependencies.some(row => row.recordId === "enc_filed"));
  assert.strictEqual(store.deleteEncounter("enc_filed").code, "RECORD_FILED");
  ok(store.deleteEncounter("enc_draft"));
  assert.ok(storage.json(WORKSPACE).vehicles.v_shared);
  assert.ok(storage.json(WORKSPACE).locations.loc_shared);
  assert.strictEqual(cascadeCalls, 0, "Encounter deletion never deletes shared media");
  const before = storage.raw(WORKSPACE);
  storage.setRaw(PACKETS, "{damaged");
  assert.strictEqual(store.deleteOperation("op_linked").ok, false);
  assert.strictEqual(storage.raw(WORKSPACE), before, "unverified dependencies fail closed");
}

// Failed delete/archive restores memory too. Archives retain rows and every
// relationship, and repeating archive does not change the original reason.
{
  const data = blank();
  data.operations.op_draft = draft("", { operationId: "op_draft", name: "Fixture" });
  data.encounters.enc_completed = { encounterId: "enc_completed", subjects: [], meta: { status: "committed", markedComplete: true },
    narratives: [{ narrativeId: "n_final", workflowStatus: "FINALIZED", output: "Saved prose" }] };
  const { storage, store } = fixture(data);
  const before = storage.raw(WORKSPACE);
  storage.failNext(WORKSPACE);
  assert.strictEqual(store.deleteOperation("op_draft").ok, false);
  assert.strictEqual(storage.raw(WORKSPACE), before);
  assert.ok(store.getOperation("op_draft"));
  assert.strictEqual(store.archiveRecord("ENCOUNTER", "enc_completed", {}).ok, false);
  storage.failNext(WORKSPACE);
  assert.strictEqual(store.archiveRecord("ENCOUNTER", "enc_completed", { reason: "Retained history" }).ok, false);
  assert.strictEqual(store.getEncounter("enc_completed").meta.archivedAt, undefined);
  const archived = ok(store.archiveRecord("ENCOUNTER", "enc_completed", { reason: "Retained history" }));
  const saved = storage.raw(WORKSPACE);
  assert.strictEqual(store.getEncounter("enc_completed").narratives[0].output, "Saved prose");
  assert.strictEqual(store.getEncounter("enc_completed").meta.markedComplete, true);
  assert.strictEqual(ok(store.archiveRecord("ENCOUNTER", "enc_completed", { reason: "Different reason" })).archivedAt, archived.archivedAt);
  assert.strictEqual(storage.raw(WORKSPACE), saved, "archive replay is a no-op");
}

// Removing a wall object commits its parent/object change together; failure
// never leaves a stripped wall beside an undeleted object.
{
  const data = blank();
  data.entities.entity_unused = draft("", { entityId: "entity_unused", name: "Fixture" });
  data.investigations.inv_one = draft("", { investigationId: "inv_one", nodes: [{ nodeId: "node_one", objectType: "ENTITY", objectId: "entity_unused" }], links: [], history: [] });
  const { storage, store } = fixture(data);
  const before = storage.raw(WORKSPACE);
  storage.failNext(WORKSPACE);
  assert.strictEqual(store.deleteInvestigationObject("inv_one", "node_one").ok, false);
  assert.strictEqual(storage.raw(WORKSPACE), before);
  assert.ok(store.getEntityRecord("entity_unused"));
  storage.resetWriteHistory();
  ok(store.deleteInvestigationObject("inv_one", "node_one"));
  assert.strictEqual(storage.writeCount(), 1);
  assert.strictEqual(store.getEntityRecord("entity_unused"), null);
  assert.strictEqual(store.getInvestigation("inv_one").nodes.length, 0);
}

// Booking void preflight and identity conflict are read-only; a failed canonical
// write rolls back; successful repeat retains one historical Arrest and event.
{
  const { storage, store } = fixture();
  const booked = ok(store.promoteBookInRecord(packet("bk_void"), { recoverBooking: true, bookingTransactionId: "tx_book" }));
  const input = Object.assign({}, booked, { bookingId: "bk_void", transactionId: "tx_void", reason: "Duplicate booking entry", voidedAt: "2026-09-05T14:00:00Z" });
  storage.resetWriteHistory();
  ok(store.voidBookingProjection(input, { validateOnly: true }));
  assert.strictEqual(storage.writeCount(), 0);
  const before = storage.raw(WORKSPACE);
  assert.strictEqual(store.voidBookingProjection(Object.assign({}, input, { personId: "wrong_person" })).ok, false);
  assert.strictEqual(storage.raw(WORKSPACE), before);
  storage.failNext(WORKSPACE);
  assert.strictEqual(store.voidBookingProjection(input).code, "BOOKING_VOID_WRITE_FAILED");
  assert.strictEqual(storage.raw(WORKSPACE), before);
  assert.strictEqual(store.getPerson(booked.personId).arrests[0].voidedAt, undefined);
  ok(store.voidBookingProjection(input));
  const after = storage.raw(WORKSPACE);
  assert.strictEqual(ok(store.voidBookingProjection(input)).alreadyVoided, true);
  assert.strictEqual(storage.raw(WORKSPACE), after);
  const person = store.getPerson(booked.personId);
  assert.strictEqual(person.arrests.length, 1);
  assert.strictEqual(person.arrests[0].voidTransactionId, "tx_void");
  assert.strictEqual(store.getLead(booked.leadId).person.arrests[0].voidReason, input.reason);
  assert.strictEqual(store.getLead(booked.leadId).history.filter(row => row.type === "BOOKING_VOIDED").length, 1);
  assert.strictEqual(ok(store.resolveBookInBooking("bk_void")).found, true, "retained audit does not create ambiguous booking ownership");
  assert.strictEqual(store.voidBookingProjection(Object.assign({}, input, { transactionId: "another_void" })).ok, false);
}

// The first explicit link annotates the Association minted by its nested card
// in this same save; a later stale Case cannot replace durable annotations.
{
  const { model, store } = fixture();
  const person = model.createPerson({ name: { firstName: "Link", lastName: "Fixture" } });
  const lead = model.createLead({ person, subjectPersonId: person.personId });
  const vehicle = model.createVehicle({ licensePlate: "STAGE5NOTE", plateState: "TX",
    occupancy: "historical", occupiedFrom: "2019-01-01", occupiedTo: "2020-01-01" });
  lead.vehicles = [vehicle];
  lead.links = [model.createLink({ from: { type: "VEHICLE", id: vehicle.vehicleId },
    to: { type: "PERSON", id: person.personId }, reasons: ["REGISTERED_OWNER"], notes: "Original title differs" })];
  ok(store.saveLead(lead, { mode: "draft" }));
  const saved = store.getLead(lead.leadId);
  assert.strictEqual(saved.links[0].notes, "Original title differs");
  const association = store.getAssociation(saved.links[0].associationId);
  assert.strictEqual(association.source.legacyLinkReason, "REGISTERED_OWNER");
  assert.strictEqual(association.occupancy, "historical");
  assert.strictEqual(association.validFrom, "2019-01-01");
  ok(store.saveAssociationRecord(association.associationId, { notes: "Later canonical review" }));
  const stale = store.saveLead(saved, { mode: "draft" });
  assert.ok(stale.ok || stale.code === "OBJECT_STALE", stale.error);
  assert.strictEqual(store.getAssociation(association.associationId).notes, "Later canonical review");
}

// Malformed admin collections cannot masquerade as an absence of dependencies.
{
  const data = blank();
  data.operations.op_draft = draft("", { operationId: "op_draft" });
  const { storage, store } = fixture(data, { "copdoc.admin.v1": { officers: { off_bad: { id: "off_bad" } } } });
  const before = storage.raw(WORKSPACE);
  assert.strictEqual(store.dependenciesFor("OPERATION", "op_draft").ok, false);
  assert.strictEqual(store.deleteOperation("op_draft").ok, false);
  assert.strictEqual(storage.raw(WORKSPACE), before);
}

// Completed Encounter/finalized narrative guards apply at store boundary, and
// an unlocked void keeps actual disposition and a booking identity tombstone.
{
  const { storage, store } = fixture();
  const booked = ok(store.promoteBookInRecord(packet("bk_linked"), { recoverBooking: true, bookingTransactionId: "tx_book_linked" }));
  const raw = storage.json(WORKSPACE);
  const link = { subjectId: "sub_linked", encounterId: "enc_linked", personId: booked.personId, leadId: booked.leadId,
    bookingId: "bk_linked", bookinRecordId: "bk_linked", outcome: "ARRESTED", subjectRole: "TARGET" };
  raw.encounters.enc_linked = { encounterId: "enc_linked", subjects: [link], narratives: [], meta: { status: "committed", markedComplete: true } };
  [raw.people[booked.personId], raw.leads[booked.leadId].person].forEach(person => Object.assign(person.arrests[0], { encounterId: "enc_linked", subjectId: "sub_linked" }));
  storage.setRaw(WORKSPACE, raw);
  const input = { bookingId: "bk_linked", transactionId: "tx_void_linked", reason: "Duplicate packet", encounterId: "enc_linked", subjectId: "sub_linked" };
  let blocked = store.voidBookingProjection(input);
  assert.strictEqual(blocked.code, "BOOKING_VOID_DEPENDENCIES");
  assert.ok(blocked.dependencies.some(row => row.recordType === "ENCOUNTER"));
  raw.encounters.enc_linked.meta.markedComplete = false;
  raw.encounters.enc_linked.narratives = [{ narrativeId: "n_final", workflowStatus: "FINALIZED", output: "Original prose" }];
  storage.setRaw(WORKSPACE, raw);
  blocked = store.voidBookingProjection(input);
  assert.ok(blocked.dependencies.some(row => row.recordId === "n_final"));
  assert.strictEqual(storage.json(WORKSPACE).encounters.enc_linked.narratives[0].output, "Original prose");
  raw.encounters.enc_linked.narratives = [];
  storage.setRaw(WORKSPACE, raw);
  ok(store.voidBookingProjection(input));
  const enc = store.getEncounter("enc_linked");
  assert.strictEqual(enc.subjects[0].outcome, "ARRESTED");
  assert.strictEqual(enc.subjects[0].bookingId, "");
  assert.strictEqual(enc.bookingIdentityHistory[0].bookingId, "bk_linked");
  assert.strictEqual(enc.bookingIdentityHistory[0].bookingVoid.transactionId, "tx_void_linked");
}

async function mediaChecks() {
  const data = blank();
  data.people.p_owner = draft("", { personId: "p_owner", name: { lastName: "Fixture" } });
  const { context, storage, store } = fixture(data);
  context.crypto = require("crypto").webcrypto;
  loadScript(context, "functions/model/media.js");
  const media = context.COPDoc.media;
  const image = await media.save({ owner: { type: "PERSON", id: "p_owner" }, mediaClass: "photo", original: Uint8Array.from([1, 2, 3]), mime: "image/jpeg" });
  const raw = storage.json(WORKSPACE);
  raw.encounters.enc_snapshot = draft("", { encounterId: "enc_snapshot", subjects: [], narratives: [{ context: { primaryPhotoId: image.mediaId } }] });
  storage.setRaw(WORKSPACE, raw);
  await assert.rejects(media.remove(image.mediaId), error => error.code === "MEDIA_REFERENCED" && error.dependencies.some(row => row.recordId === "enc_snapshot"));
  assert.strictEqual((await media.blob(image.mediaId)).bytes, 3);
  await assert.rejects(media.removeByOwner({ type: "PERSON", id: "p_owner" }), error => error.code === "MEDIA_REFERENCED");
  delete raw.encounters.enc_snapshot;
  delete raw.people.p_owner;
  storage.setRaw(WORKSPACE, raw);
  await media.removeByOwner({ type: "PERSON", id: "p_owner" });
  assert.strictEqual((await media.listAll()).length, 0);
  assert.strictEqual(store.getPerson("p_owner"), null);
}
mediaChecks().then(() => console.log("STAGE5_DEPENDENCIES_PASSED references, safe deletion, archives, void projections, and shared media."), error => {
  console.error(error); process.exitCode = 1;
});
