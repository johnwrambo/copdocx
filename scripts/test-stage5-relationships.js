"use strict";

const assert = require("assert");
const { createMemoryStorage, loadModelTab, loadScript, quietConsole } = require("./support/copdoc-vm-harness.js");
const WORKSPACE = "copdocx.store.v1";
function ok(result) { assert.ok(result && result.ok, result && result.error); return result; }
function fixture() {
  const storage = createMemoryStorage();
  const tab = loadModelTab(storage, { console: quietConsole() });
  loadScript(tab.context, "functions/model/investigation.js");
  const { model } = tab;
  const lead = model.createLeadSnapshot({ person: { name: { lastName: "RELATIONSHIP", firstName: "Test" } } });
  lead.person.locations = [model.createLocation({ street: "1 Fixture Road", city: "Dallas", state: "TX" })];
  lead.vehicles = [model.createVehicle({ licensePlate: "REL123", plateState: "TX", governmentVehicle: false,
    locations: [model.createLocation({ street: "2 Fixture Road", city: "Dallas", state: "TX" })] })];
  ok(model.store.saveLead(lead, { mode: "draft" }));
  const saved = model.store.getLead(lead.leadId);
  const personId = saved.subjectPersonId;
  const vehicleId = saved.vehicles[0].vehicleId;
  const locationId = saved.person.locations[0].locationId;
  const parkingId = saved.vehicles[0].locations[0].locationId;
  const relationship = model.store.associationsFor("PERSON", personId).find(row => row.to.type === "VEHICLE");
  assert.ok(relationship, "Case ingestion materializes the shared association");
  return { ...tab, storage, model, lead: saved, personId, vehicleId, locationId, parkingId, relationship };
}

// A world retraction is one workspace write; every current projection disappears,
// while objects, provenance and immutable historical payloads stay present.
{
  const f = fixture();
  const { model, storage, personId, vehicleId, relationship } = f;
  const lead = model.store.getLead(f.lead.leadId);
  lead.links = [model.createLink({ from: relationship.from, to: relationship.to,
    reasons: [relationship.reason], associationId: relationship.associationId })];
  ok(model.store.saveLead(lead, { mode: "draft" }));
  const inv = model.createInvestigation({ kind: "other", nodes: [
    { nodeId: "node_person", objectType: "PERSON", objectId: personId },
    { nodeId: "node_vehicle", objectType: "VEHICLE", objectId: vehicleId }
  ], links: [model.createLink({ ...lead.links[0], linkId: "inv_link" })] });
  ok(model.store.saveInvestigation(inv, { mode: "draft" }));
  const stale = model.store.getLead(lead.leadId);
  const staleInv = model.store.getInvestigation(inv.investigationId);
  storage.resetWriteHistory();
  ok(model.store.removeCaseLink(lead.leadId, stale.links[0].linkId, { reason: "Incorrect owner" }));
  assert.strictEqual(storage.writeCount(), 1, "relationship and projections commit together");
  const removed = model.store.getAssociation(relationship.associationId);
  assert.strictEqual(removed.relationshipStatus, "RETRACTED");
  assert.strictEqual(removed.retractionReason, "Incorrect owner");
  assert.ok(removed.lifecycleHistory[0].citations.some(row => row.collection === "investigations"));
  assert.strictEqual(model.store.getLead(lead.leadId).vehicles.length, 0);
  assert.strictEqual(model.store.getLead(lead.leadId).links.length, 0);
  assert.strictEqual(model.store.getInvestigation(inv.investigationId).links.length, 0);
  assert.ok(model.store.getVehicleRecord(vehicleId), "unlink retains canonical vehicle");
  assert.ok(model.store.getPerson(personId), "unlink retains canonical Person");
  ok(model.store.saveLead(stale, { mode: "draft" }));
  assert.strictEqual(model.store.getLead(lead.leadId).vehicles.length, 0, "stale Case cannot reinsert a retracted vehicle");
  assert.strictEqual(model.store.getLead(lead.leadId).links.length, 0, "stale Case cannot resurrect citation");
  assert.strictEqual(model.store.getAssociation(relationship.associationId).relationshipStatus, "RETRACTED");
  assert.strictEqual(model.store.upsertAssociation(relationship).code, "ASSOCIATION_CLOSED");
  assert.strictEqual(model.store.saveAssociationRecord("invented_duplicate", relationship).code, "ASSOCIATION_CLOSED");
  assert.strictEqual(model.store.reassertAssociation(relationship.associationId).code, "REASSERTION_REASON_REQUIRED");
  ok(model.store.reassertAssociation(relationship.associationId, { reason: "Reviewed ownership evidence" }));
  assert.strictEqual(model.store.getAssociation(relationship.associationId).relationshipStatus, "ACTIVE");
  assert.strictEqual(model.store.getAssociation(relationship.associationId).lifecycleHistory.length, 2);
  assert.strictEqual(model.store.getLead(lead.leadId).vehicles.length, 1);
  assert.strictEqual(model.store.getInvestigation(inv.investigationId).links.length, 0, "reassertion does not replace wall membership choices");
  ok(model.store.retractAssociation(relationship.associationId));
  ok(model.store.saveInvestigation(staleInv, { mode: "draft" }));
  assert.strictEqual(model.store.getInvestigation(inv.investigationId).links.length, 0, "stale investigation cannot restore a retracted citation");
}

// End is a historical fact, not an incorrect assertion. Active views exclude it;
// history remains inspectable, and stale occupancy copies cannot reactivate it.
{
  const f = fixture();
  const stale = f.model.store.getLead(f.lead.leadId);
  const association = f.model.store.associationsFor("PERSON", f.personId).find(row => row.to.id === f.locationId);
  ok(f.model.store.endAssociation(association.associationId, { reason: "Moved out", endedAt: "2026-09-01" }));
  const ended = f.model.store.getAssociation(association.associationId);
  assert.strictEqual(ended.relationshipStatus, "ENDED");
  assert.strictEqual(ended.validTo, "2026-09-01");
  assert.strictEqual(ended.occupancy, "historical");
  assert.strictEqual(ended.junked, false);
  assert.ok(!f.model.store.associationsFor("PERSON", f.personId).some(row => row.associationId === association.associationId));
  assert.ok(f.model.store.associationsFor("PERSON", f.personId, { includeHistorical: true }).some(row => row.associationId === association.associationId));
  ok(f.model.store.saveLead(stale, { mode: "draft" }));
  assert.strictEqual(f.model.store.getLead(f.lead.leadId).person.locations.length, 0);
  assert.strictEqual(f.model.store.getPerson(f.personId).locations.length, 0);
  assert.strictEqual(f.model.store.getAssociation(association.associationId).relationshipStatus, "ENDED");
  assert.strictEqual(f.model.store.saveAssociationRecord(association.associationId, { occupancy: "current" }).code, "ASSOCIATION_CLOSED");
  assert.strictEqual(f.model.store.endAssociation(f.relationship.associationId, { endedAt: "bad-date" }).code, "INVALID_END_DATE");
}

// Nested vehicle parking has the same authority rules as Person properties.
{
  const f = fixture();
  const stale = f.model.store.getLead(f.lead.leadId);
  ok(f.model.store.removeObjectRelationship("VEHICLE", f.vehicleId, "LOCATION", f.parkingId, { mode: "retract", reason: "Incorrect parking location" }));
  assert.strictEqual(f.model.store.getVehicleRecord(f.vehicleId).locations.length, 0);
  ok(f.model.store.saveLead(stale, { mode: "draft" }));
  assert.strictEqual(f.model.store.getLead(f.lead.leadId).vehicles[0].locations.length, 0);
  assert.ok(f.model.store.getLocationRecord(f.parkingId));
}

// A wall removal is contextual; explicit Disconnect retracts the global fact.
{
  const f = fixture();
  const inv = f.model.createInvestigation({ kind: "other", nodes: [
    { nodeId: "wall_person", objectType: "PERSON", objectId: f.personId },
    { nodeId: "wall_vehicle", objectType: "VEHICLE", objectId: f.vehicleId }
  ], links: [f.model.createLink({ from: f.relationship.from, to: f.relationship.to,
    reasons: [f.relationship.reason], associationId: f.relationship.associationId })] });
  ok(f.model.store.saveInvestigation(inv, { mode: "draft" }));
  ok(f.model.store.removeInvestigationObject(inv.investigationId, "wall_vehicle"));
  assert.strictEqual(f.model.store.getAssociation(f.relationship.associationId).junked, false);
  assert.strictEqual(f.model.store.getLead(f.lead.leadId).vehicles.length, 1);
  ok(f.model.store.disconnectInvestigationAssociation(inv.investigationId, f.relationship.associationId));
  assert.strictEqual(f.model.store.getAssociation(f.relationship.associationId).relationshipStatus, "RETRACTED");
  assert.strictEqual(f.model.store.getLead(f.lead.leadId).vehicles.length, 0);
}

// Failure leaves both the first-ever workspace and existing projections unchanged.
{
  const f = fixture();
  const before = f.storage.raw(WORKSPACE);
  f.storage.failNext(WORKSPACE);
  assert.strictEqual(f.model.store.retractAssociation(f.relationship.associationId).ok, false);
  assert.strictEqual(f.storage.raw(WORKSPACE), before);
  assert.strictEqual(f.model.store.getLead(f.lead.leadId).vehicles.length, 1);
  f.storage.failNext(WORKSPACE);
  assert.strictEqual(f.model.store.saveAssociationRecord(f.relationship.associationId, { notes: "Must not stick" }).ok, false);
  assert.strictEqual(f.storage.raw(WORKSPACE), before);
  assert.notStrictEqual(f.model.store.getAssociation(f.relationship.associationId).notes, "Must not stick");
  assert.strictEqual(f.model.store.upsertAssociation({ from: { type: "PERSON", id: "absent" },
    to: { type: "VEHICLE", id: f.vehicleId }, reason: "REGISTERED_OWNER_OF" }).code, "ASSOCIATION_ENDPOINT_MISSING");
  const old = f.model.store.getLead(f.lead.leadId);
  ok(f.model.store.saveAssociationRecord(f.relationship.associationId, { occupancy: "historical", validTo: "2020-01-01" }));
  ok(f.model.store.saveLead(old, { mode: "draft" }));
  assert.strictEqual(f.model.store.getAssociation(f.relationship.associationId).occupancy, "historical", "nested projection cannot overwrite deliberate relation update");
  assert.strictEqual(f.model.store.getLead(f.lead.leadId).vehicles[0].occupancy, "historical");
}

// Older relationship types and corrected endpoints must not survive in an old
// Case payload as a second, newly minted assertion.
{
  const f = fixture();
  let stale = f.model.store.getLead(f.lead.leadId);
  stale.links = [f.model.createLink({ from: f.relationship.from, to: f.relationship.to,
    reasons: [f.relationship.reason] })];
  ok(f.model.store.saveAssociationRecord(f.relationship.associationId, { reason: "KNOWN_OPERATOR_OF" }));
  ok(f.model.store.retractAssociation(f.relationship.associationId));
  ok(f.model.store.saveLead(stale, { mode: "draft" }));
  assert.ok(!f.model.store.associationsFor("PERSON", f.personId).some(row => row.to.id === f.vehicleId),
    "old reason without associationId must not circumvent retraction");
}
{
  const f = fixture();
  const stale = f.model.store.getLead(f.lead.leadId);
  const replacement = f.model.createVehicle({ licensePlate: "CORRECT1", plateState: "TX", governmentVehicle: false });
  ok(f.model.store.saveVehicleRecord(replacement));
  ok(f.model.store.saveAssociationRecord(f.relationship.associationId,
    { to: { type: "VEHICLE", id: replacement.vehicleId }, reason: f.relationship.reason }));
  ok(f.model.store.saveLead(stale, { mode: "draft" }));
  assert.ok(!f.model.store.associationsFor("PERSON", f.personId).some(row => row.to.id === f.vehicleId),
    "correcting an endpoint must block an older nested Case from reasserting the abandoned pair");
  assert.ok(f.model.store.associationsFor("PERSON", f.personId).some(row => row.to.id === replacement.vehicleId));
}

console.log("STAGE5_RELATIONSHIPS_PASSED retraction, historical ends, shared projection authority, context removal, rollback and stale-save protection.");
