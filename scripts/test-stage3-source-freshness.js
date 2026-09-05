"use strict";

const assert = require("node:assert/strict");
const source = require("../functions/narratives/source-freshness.js");
const domain = require("../functions/narratives/build9/narrative-domain.js");
const clone = value => JSON.parse(JSON.stringify(value));
const bundle = {
  encounter: { encounterId: "enc_source", eventType: "VEHICLE_STOP", startedAt: "2026-09-05T10:00" },
  operation: { operationId: "op_source", displayName: "Operation Test" },
  participants: [{
    encounterParticipantId: "sub_source", subjectId: "sub_source", encounterId: "enc_source",
    personId: "person_source", bookingId: "booking_source", encounterRole: "TARGET",
    identitySnapshot: { displayName: "TEST, Ada", aNumber: "000000001", dateOfBirth: "1990-01-01" },
    finalOutcome: "ARRESTED", finalOutcomeAt: "2026-09-05T10:05",
    immigrationSnapshot: { statusCode: "UNKNOWN", dispositionCode: "UNKNOWN" },
    closing: { medication: "None", currency: { code: "YES", amountUsd: "25" } }
  }],
  events: [{ encounterEventId: "event_source", eventType: "CONTACT", occurredAt: "2026-09-05T10:00", details: { description: "Initial contact" } }],
  encounterVehicles: [{ encounterVehicleId: "ev_source", vehicleId: "vehicle_source", vehicleRole: "SUBJECT_VEHICLE" }],
  vehicles: [{ vehicleId: "vehicle_source", plate: { value: "TEST123", stateCode: "TX" } }],
  location: { locationId: "loc_source", postalAddress: { city: "Dallas" }, coordinates: { latitude: 0, longitude: 0 } },
  officers: [{ officerProfileId: "officer_source", displayName: "Officer One", roles: ["REPORTING"] }],
  sourceFacts: { subjects: [{ subjectId: "sub_source", flightMode: "", compliance: "COMPLIANT", useOfForce: "no" }] }
};
const original = JSON.stringify(bundle);
const baseline = source.capture(bundle, "sub_source");
assert.equal(source.evaluate(baseline, source.capture(bundle, "sub_source")), "CURRENT");
assert.deepEqual(Object.keys(baseline).sort(), ["encounterId", "fingerprint", "focusSubjectId", "schema"]);
assert.ok(!JSON.stringify(baseline).includes("TEST, Ada"), "snapshot contains references and fingerprint, not a second personal-data copy");

const changes = [
  ["Person name", b => { b.participants[0].identitySnapshot.displayName = "UPDATED, Ada"; }],
  ["Person DOB", b => { b.participants[0].identitySnapshot.dateOfBirth = "1991-01-01"; }],
  ["Book-In closing", b => { b.participants[0].closing.medication = "Medication changed"; }],
  ["Booking identity", b => { b.participants[0].bookingId = "replacement_booking"; }],
  ["Outcome", b => { b.participants[0].finalOutcome = "RELEASED"; }],
  ["Outcome time", b => { b.participants[0].finalOutcomeAt = "2026-09-05T10:06"; }],
  ["Immigration", b => { b.participants[0].immigrationSnapshot.dispositionCode = "REINST"; }],
  ["Roster", b => { b.participants.push({ encounterParticipantId: "sub_collateral", encounterRole: "COLLATERAL" }); }],
  ["Encounter type", b => { b.encounter.eventType = "TARGETED_ARREST"; }],
  ["Encounter time", b => { b.encounter.startedAt = "2026-09-05T09:59"; }],
  ["Operation", b => { b.operation.displayName = "Changed operation"; }],
  ["Officer", b => { b.officers[0].displayName = "Corrected officer"; }],
  ["Event", b => { b.events[0].details.description = "Corrected contact"; }],
  ["Event time", b => { b.events[0].occurredAt = "2026-09-05T10:01"; }],
  ["Location", b => { b.location.postalAddress.city = "Fort Worth"; }],
  ["Missing coordinate", b => { b.location.coordinates.latitude = null; }],
  ["Vehicle", b => { b.vehicles[0].plate.value = "TEST456"; }],
  ["Vehicle association", b => { b.encounterVehicles[0].vehicleRole = "GOVERNMENT_VEHICLE"; }],
  ["Seed facts", b => { b.sourceFacts.subjects[0].compliance = "NONCOMPLIANT"; }]
];
for (const [name, change] of changes) {
  const changed = clone(bundle);
  change(changed);
  assert.equal(source.evaluate(baseline, source.capture(changed, "sub_source")), "STALE", name + " change must invalidate the old source");
}

const bookkeeping = clone(bundle);
bookkeeping.narrativesInitial = [{ narrativeId: "n1", revision: 9, output: { plainText: "New narrative text" } }];
bookkeeping.narratives = bookkeeping.narrativesInitial;
bookkeeping.generatedAt = "2026-09-06T00:00:00Z";
bookkeeping.encounter.meta = { updatedAt: "later", encounterRevision: 100 };
bookkeeping.encounter.updatedAt = "later";
bookkeeping.encounter.encounterRevision = 100;
bookkeeping.encounter.supervisorSummary = { text: "New generated summary" };
bookkeeping.participants[0].identitySnapshot.capturedAt = "later";
bookkeeping.participants[0].immigrationSnapshot.capturedAt = "later";
bookkeeping.officers[0].updatedAt = "later";
assert.equal(source.evaluate(baseline, source.capture(bookkeeping, "sub_source")), "CURRENT", "narrative saves and storage timestamps cannot stale their own source");

function reverseKeys(value) {
  if (Array.isArray(value)) return value.map(reverseKeys);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).reverse().map(([key, child]) => [key, reverseKeys(child)]));
}
assert.deepEqual(source.capture(reverseKeys(bundle), "sub_source"), baseline, "object key insertion order is not a source change");
assert.equal(source.evaluate(null, baseline), "UNKNOWN");
assert.equal(source.evaluate({ encounterId: "enc_source", iceEventNumber: "legacy" }, baseline), "UNKNOWN");
assert.equal(source.evaluate({ ...baseline, schema: "unsupported.v2" }, baseline), "UNKNOWN");
assert.equal(source.evaluate(baseline, null), "UNKNOWN");
assert.equal(source.capture({}, "sub_source"), null);
assert.equal(source.capture({ ...bundle, sourceUnavailable: true }, "sub_source"), null,
  "unreadable source stores cannot be certified from cached or empty fallbacks");
assert.equal(source.capture(bundle, "sub_missing"), null);
assert.equal(source.capture({ ...bundle, participants: bundle.participants.concat(bundle.participants) }, "sub_source"), null);
assert.equal(source.capture({ ...bundle, participants: [{ ...bundle.participants[0], subjectId: "contradiction" }] }, "sub_source"), null);
assert.equal(source.evaluate(baseline, { ...baseline, focusSubjectId: "sub_other" }), "STALE");
assert.equal(source.evaluate(baseline, { ...baseline, encounterId: "enc_other" }), "STALE");
assert.ok(source.capture(bundle, ""), "Encounter overview/supplement can capture Encounter-wide scope");
assert.equal(JSON.stringify(bundle), original, "capture and comparisons are read-only");

const narrative = domain.createNarrativeRecord({
  narrativeId: "nar_source_final", encounterId: "enc_source", narrativeKind: "PRIMARY_SUBJECT",
  focusEncounterParticipantId: "sub_source", workflowStatus: "FINALIZED", freshnessStatus: "CURRENT",
  sourceSnapshot: baseline, output: { plainText: "Finalized text stays exactly as saved." }
});
const version = domain.createNarrativeVersionRecord(narrative, { narrativeVersionId: "version_source_final" });
const finalizedBefore = JSON.stringify({ narrative, version });
const changed = clone(bundle);
changed.participants[0].finalOutcome = "RELEASED";
assert.equal(source.evaluate(narrative.sourceSnapshot, source.capture(changed, "sub_source")), "STALE");
assert.equal(JSON.stringify({ narrative, version }), finalizedBefore, "freshness evaluation must never rewrite finalized content or version snapshots");
assert.ok(Object.isFrozen(version));
assert.throws(() => domain.saveNarrativeById([narrative], narrative.narrativeId, { sourceSnapshot: source.capture(changed, "sub_source") }), error => error.code === "FINALIZED_NARRATIVE_IMMUTABLE");

console.log("STAGE3_SOURCE_FRESHNESS_PASSED source changes, stable bookkeeping, unknown legacy source, and immutable final versions.");
