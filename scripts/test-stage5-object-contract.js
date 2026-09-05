"use strict";

const assert = require("assert");
const { createMemoryStorage, loadModelTab, loadScript, quietConsole } = require("./support/copdoc-vm-harness.js");
const KEY = "copdocx.store.v1";
function setup() { const storage = createMemoryStorage(); const { model, context } = loadModelTab(storage, { console: quietConsole() }); loadScript(context, "functions/model/business.js"); loadScript(context, "functions/model/entity.js"); loadScript(context, "functions/model/operation.js"); loadScript(context, "functions/model/investigation.js"); return { storage, model, store: model.store }; }
function ok(result) { assert.ok(result && result.ok, result && result.error); return result; }

// Names propose candidates; explicit strong identifiers and IDs establish reuse.
{
  const { store, storage } = setup();
  const first = ok(store.resolveObjectRecord("PERSON", { name: "SAME, Test", alienNumber: "123456789" }));
  const before = storage.raw(KEY);
  const ambiguous = store.resolveObjectRecord("PERSON", { name: "SAME, Test" });
  assert.strictEqual(ambiguous.code, "OBJECT_SELECTION_REQUIRED");
  assert.deepStrictEqual(Array.from(ambiguous.candidates), [first.objectId]);
  assert.strictEqual(storage.raw(KEY), before);
  assert.strictEqual(ok(store.resolveObjectRecord("PERSON", { alienNumber: "123456789" })).objectId, first.objectId);
  const second = ok(store.resolveObjectRecord("PERSON", { name: "SAME, Test", createNew: true, fbiNumber: "FBI-SECOND" }));
  assert.notStrictEqual(first.objectId, second.objectId);
  assert.strictEqual(store.resolveObjectRecord("PERSON", { alienNumber: "123456789", fbiNumber: "FBI-SECOND", createNew: true }).code, "OBJECT_IDENTITY_CONFLICT");
  assert.strictEqual(store.resolveObjectRecord("PERSON", { objectId: first.objectId, alienNumber: "987654321" }).code, "OBJECT_IDENTITY_CONFLICT");
  assert.strictEqual(store.resolveObjectRecord("PERSON", { objectId: "missing" }).code, "OBJECT_NOT_FOUND");
  assert.strictEqual(store.saveObjectRecord("PERSON", { personId: "p_a", id: "p_b" }).code, "OBJECT_ID_CONFLICT");
  assert.strictEqual(store.saveObjectRecord("VEHICLE", { vehicleId: "constructor" }).code, "OBJECT_ID_CONFLICT");
  const data = storage.json(KEY); data.people[first.objectId].junked = true; storage.setRaw(KEY, data);
  assert.strictEqual(store.resolveObjectRecord("PERSON", { alienNumber: "123456789" }).code, "OBJECT_JUNKED");
  assert.strictEqual(storage.json(KEY).people[first.objectId].junked, true);
}

// Two editors cannot overwrite a newer canonical revision; a failed first write
// leaves neither persisted data nor phantom objects in memory.
for (const [type, field] of [["PERSON", "personId"], ["VEHICLE", "vehicleId"], ["LOCATION", "locationId"], ["BUSINESS", "businessId"], ["ENTITY", "entityId"]]) {
  const { store, storage } = setup();
  const input = { [field]: "contract_" + type.toLowerCase(), notes: "original" };
  storage.failNext(KEY);
  assert.strictEqual(store.saveObjectRecord(type, input).ok, false);
  assert.strictEqual(store.getObjectRecord(type, input[field]), null);
  const initial = ok(store.saveObjectRecord(type, input)).record;
  const changed = ok(store.saveObjectRecord(type, { ...initial, notes: "new" }, { intent: "update" })).record;
  assert.strictEqual(changed.objectRevision, initial.objectRevision + 1);
  const before = storage.raw(KEY);
  assert.strictEqual(store.saveObjectRecord(type, { ...initial, notes: "stale" }).code, "OBJECT_STALE");
  assert.strictEqual(storage.raw(KEY), before);
}

// A stale Case only edits fields changed since its own previous snapshot;
// Encounter and Arrest projections retain the canonical event history.
{
  const { model, store, storage } = setup();
  const person = model.createPerson({ personId: "p_history", name: { lastName: "HISTORY", firstName: "Test" } });
  const lead = model.createLead({ person, subjectPersonId: person.personId });
  ok(store.saveLead(lead));
  const oldCase = store.getLead(lead.leadId);
  const canonical = store.getPerson(person.personId);
  canonical.encounters = [{ encounterId: "enc_new", subjectId: "sub_new" }];
  canonical.arrests = [{ arrestId: "arr_new", voidedAt: "2026-09-05" }];
  canonical.citizenship = "NEW";
  ok(store.upsertPerson(canonical));
  oldCase.person.name.firstName = "Edited";
  assert.strictEqual(store.saveLead(oldCase).code, "OBJECT_STALE", "an editor carrying an old revision must reload");
  delete oldCase.person.objectRevision; // Legacy Case snapshots still use the three-way baseline.
  ok(store.saveLead(oldCase));
  const saved = store.getPerson(person.personId);
  assert.strictEqual(saved.name.firstName, "Edited");
  assert.strictEqual(saved.citizenship, "NEW");
  assert.strictEqual(saved.encounters[0].encounterId, "enc_new");
  assert.strictEqual(saved.arrests[0].voidedAt, "2026-09-05");
  const stale = store.getLead(lead.leadId);
  const newer = store.getPerson(person.personId); newer.name.firstName = "Independent"; ok(store.upsertPerson(newer));
  stale.person.name.firstName = "Conflict";
  const before = storage.raw(KEY);
  assert.strictEqual(store.saveLead(stale).code, "OBJECT_STALE");
  assert.strictEqual(storage.raw(KEY), before);
}

// Parent snapshots cannot roll Vehicle/Location data backward; deliberate
// editor changes carry their revision and commit atomically with the parent.
{
  const { model, store, storage } = setup();
  const loc = ok(store.saveObjectRecord("LOCATION", { locationId: "loc_contract", street: "OLD" })).record;
  const veh = ok(store.saveObjectRecord("VEHICLE", { vehicleId: "veh_contract", licensePlate: "OLD", locations: [loc] })).record;
  const lead = model.createLead({ person: model.createPerson(), vehicles: [veh] }); ok(store.saveLead(lead));
  const stale = store.getLead(lead.leadId);
  const currentLoc = ok(store.saveObjectRecord("LOCATION", { ...loc, street: "NEW" })).record;
  const currentVeh = ok(store.saveObjectRecord("VEHICLE", { ...store.getVehicleRecord(veh.vehicleId), licensePlate: "NEW", plate: "NEW" })).record;
  ok(store.saveLead(stale));
  assert.strictEqual(store.getVehicleRecord(veh.vehicleId).licensePlate, "NEW");
  assert.strictEqual(store.getLocationRecord(loc.locationId).street, "NEW");
  const edit = store.getLead(lead.leadId);
  edit.vehicles = [{ ...currentVeh, licensePlate: "EDITED", plate: "EDITED", _objectEdit: true, locations: [{ ...currentLoc, street: "EDITED", _objectEdit: true }] }];
  const before = storage.raw(KEY); storage.failNext(KEY);
  assert.strictEqual(store.saveLead(edit).ok, false);
  assert.strictEqual(storage.raw(KEY), before);
  assert.strictEqual(store.getVehicleRecord(veh.vehicleId).licensePlate, "NEW");
  ok(store.saveLead(edit));
  assert.strictEqual(store.getVehicleRecord(veh.vehicleId).licensePlate, "EDITED");
  assert.strictEqual(store.getLocationRecord(loc.locationId).street, "EDITED");
  assert.ok(!storage.raw(KEY).includes('"_objectEdit"'));
}

// Import validation is read-only, catches registry aliases and new strong-ID
// duplication, and leaves existing legacy duplicate identities reviewable.
{
  const { store, storage } = setup();
  const a = { personId: "p_a", immigration: { alienNumber: "123" } };
  const b = { personId: "p_b", immigration: { alienNumber: "123" } };
  assert.strictEqual(store.validateObjectWorkspace({ people: { p_a: a, p_b: b } }, {}).code, "OBJECT_IDENTITY_CONFLICT");
  assert.strictEqual(store.validateObjectWorkspace({ people: { p_wrong: a } }, {}).code, "OBJECT_ID_CONFLICT");
  ok(store.validateObjectWorkspace({ people: { p_a: a, p_b: b } }, { people: { p_a: a, p_b: b } }));
  assert.strictEqual(storage.writeCount(), 0);
}

// Book-In obeys the same identity resolution and never resurrects void history.
{
  const { store, storage } = setup();
  const person = ok(store.saveObjectRecord("PERSON", { personId: "p_booking", name: { lastName: "BOOK", firstName: "Test" }, dateOfBirth: "1980-01-01" })).record;
  const ambiguous = store.promoteBookInToLead({ bookingId: "bk_new", lastName: "BOOK", firstName: "Test", dateOfBirth: "1980-01-01" });
  assert.strictEqual(ambiguous.code, "OBJECT_SELECTION_REQUIRED", "name and DOB do not silently merge people");
  const booking = ok(store.promoteBookInToLead({ personId: person.personId, bookingId: "bk_selected", lastName: "BOOK", firstName: "Test" }));
  const data = storage.json(KEY);
  data.people[person.personId].arrests[0].voidedAt = "2026-09-05";
  data.leads[booking.leadId].person.arrests[0].voidedAt = "2026-09-05";
  storage.setRaw(KEY, data);
  const before = storage.raw(KEY);
  assert.strictEqual(store.promoteBookInToLead({ personId: person.personId, bookingId: "bk_selected" }).ok, false);
  assert.strictEqual(store.promoteBookInRecord({ id: "bk_voided", voidedAt: "2026-09-05" }).code, "BOOKING_VOIDED");
  assert.strictEqual(storage.raw(KEY), before);
}

// Operation support Locations now share the same canonical registry and the
// aggregate write is atomic, including failure on the first Location save.
{
  const { model, store, storage } = setup();
  const operation = model.createOperation({ operationId: "op_contract", name: "Contract" });
  ok(store.saveOperation(operation, { mode: "draft" }));
  const before = storage.raw(KEY); storage.failNext(KEY);
  assert.strictEqual(store.addOperationLocation(operation.operationId, { opAssociation: "rally", latitude: "32", longitude: "-97" }).ok, false);
  assert.strictEqual(storage.raw(KEY), before);
  assert.strictEqual(Object.keys(store.loadFromDisk().locations).length, 0);
  const added = ok(store.addOperationLocation(operation.operationId, { opAssociation: "rally", latitude: "32", longitude: "-97" }));
  assert.ok(store.getLocationRecord(added.locationId));
  assert.strictEqual(store.getOperation(operation.operationId).opLocations[0].locationId, added.locationId);
}

// Compound Case/wall/plate creates perform one final workspace write. Failure
// after staging the object preserves all objects, memberships and associations.
{
  const { model, store, storage } = setup();
  const lead = model.createLead({ person: model.createPerson({ name: { lastName: "HOST" } }) }); ok(store.saveLead(lead));
  const inv = model.createInvestigation({ kind: "other", nodes: [{ nodeId: "host", objectType: "PERSON", objectId: lead.subjectPersonId }], focusNodeId: "host", plates: [{ plateId: "plate_new", plate: "ABC123", state: "TX", status: "queued" }] });
  ok(store.saveInvestigation(inv, { mode: "draft" }));
  const actions = [
    () => store.associateCaseObject(lead.leadId, { objectType: "VEHICLE", label: "TX CASE123", reason: "REGISTERED_OWNER_OF" }),
    () => store.addInvestigationObject(inv.investigationId, { objectType: "VEHICLE", licensePlate: "zzz-999", plateState: "tx", fromNodeId: "host", reason: "REGISTERED_OWNER_OF" }),
    () => store.associateInvestigationObject(inv.investigationId, "host", { objectType: "LOCATION", label: "2 Compound Road, Dallas, TX", reason: "CURRENT_RESIDENCE" }),
    () => store.promoteInvestigationPlate(inv.investigationId, "plate_new")
  ];
  for (const action of actions) {
    const before = storage.raw(KEY); storage.resetWriteHistory(); storage.failNext(KEY);
    assert.strictEqual(action().ok, false);
    assert.strictEqual(storage.writeCount(), 1, "compound mutation attempts only its final durable commit");
    assert.strictEqual(storage.raw(KEY), before, "failed compound create leaves no orphan object");
    assert.deepStrictEqual(JSON.parse(JSON.stringify(store.loadFromDisk())), JSON.parse(before));
    storage.resetWriteHistory(); ok(action());
    assert.strictEqual(storage.writeCount(), 1, "successful object and membership commit together");
  }
  const vehicle = store.findVehicleByPlate("TX", "ZZZ999");
  assert.strictEqual(vehicle.licensePlate, "ZZZ999"); assert.strictEqual(vehicle.plateState, "TX");
  const data = storage.json(KEY); data.vehicles[vehicle.vehicleId].meta.archivedAt = "2026-09-05"; storage.setRaw(KEY, data);
  const before = storage.raw(KEY);
  assert.strictEqual(store.resolveObjectIdentity("VEHICLE", { licensePlate: "ZZZ999", plateState: "TX" }).code, "OBJECT_JUNKED");
  assert.strictEqual(storage.raw(KEY), before);
}

// New Cases around existing people keep the same complete canonical person.
// Nested associated Person creation also cannot bypass strong identity checks.
{
  const { model, store, storage } = setup();
  const person = ok(store.saveObjectRecord("PERSON", { personId: "p_promote", name: { lastName: "PROMOTE" }, encounters: [{ encounterId: "enc_kept" }], arrests: [{ arrestId: "arr_kept" }], immigration: { alienNumber: "998877665" }, criminal: { rapSheet: "retained" } })).record;
  const inv = model.createInvestigation({ kind: "other", nodes: [{ nodeId: "promote_node", objectType: "PERSON", objectId: person.personId }] }); ok(store.saveInvestigation(inv, { mode: "draft" }));
  const before = storage.raw(KEY); storage.failNext(KEY);
  assert.strictEqual(store.promoteInvestigationPersonToCase(inv.investigationId, "promote_node").ok, false);
  assert.strictEqual(storage.raw(KEY), before);
  ok(store.promoteInvestigationPersonToCase(inv.investigationId, "promote_node"));
  const kept = store.getPerson(person.personId);
  assert.strictEqual(kept.encounters[0].encounterId, "enc_kept");
  assert.strictEqual(kept.arrests[0].arrestId, "arr_kept");
  assert.strictEqual(kept.criminal.rapSheet, "retained");
  const other = model.createLead({ person: model.createPerson(), people: [model.createPerson({ immigration: { alienNumber: "998877665" } })] });
  const prior = storage.raw(KEY);
  assert.strictEqual(store.saveLead(other).code, "OBJECT_IDENTITY_CONFLICT");
  assert.strictEqual(storage.raw(KEY), prior);
}

// Encounter subject creation and Person edits use the same one-write boundary;
// a late Encounter rejection cannot leave a new Person or partial identity edit.
{
  const { model, store, storage } = setup();
  const encounter = model.createEncounter({ encounterId: "enc_compound", startedAt: "2026-09-05T12:00" });
  ok(store.saveEncounter(encounter, { mode: "draft" }));
  const person = model.createPerson({ personId: "p_compound_enc", name: { lastName: "ATOMIC" } });
  const edit = store.getEncounter(encounter.encounterId);
  edit.subjects = [model.createEncounterSubject({ subjectId: "sub_compound", encounterId: encounter.encounterId, personId: person.personId, outcome: "RELEASED" })];
  const before = storage.raw(KEY); storage.resetWriteHistory(); storage.failNext(KEY);
  assert.strictEqual(store.saveEncounterWithObjects(edit, { mode: "draft", personEdits: [{ record: person, intent: "create" }] }).ok, false);
  assert.strictEqual(storage.writeCount(), 1);
  assert.strictEqual(storage.raw(KEY), before);
  assert.strictEqual(store.getPerson(person.personId), null);
  storage.resetWriteHistory();
  ok(store.saveEncounterWithObjects(edit, { mode: "draft", personEdits: [{ record: person, intent: "create" }] }));
  assert.strictEqual(storage.writeCount(), 1);
  const storedPerson = store.getPerson(person.personId);
  const stale = store.getEncounter(encounter.encounterId);
  ok(store.saveEncounter({ ...stale, notes: "newer" }, { mode: "draft" }));
  const current = storage.raw(KEY);
  assert.strictEqual(store.saveEncounterWithObjects(stale, { mode: "draft", personEdits: [{ record: { ...storedPerson, name: { lastName: "SHOULD_NOT_SAVE" } }, intent: "update" }] }).ok, false);
  assert.strictEqual(storage.raw(KEY), current);
  assert.strictEqual(store.getPerson(person.personId).name.lastName, "ATOMIC");
}

process.stdout.write("STAGE5_OBJECT_CONTRACT_PASSED identity, canonical edits, optimistic revisions, history, Book-In, Operations and atomic creation.\n");
