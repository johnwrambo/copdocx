"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const context = vm.createContext({ COPDoc: {} });
for (const name of ["localStorage", "sessionStorage", "document", "fetch"]) {
  Object.defineProperty(context, name, {
    get() { throw new Error("Domain/projection modules cannot access " + name); }
  });
}
for (const file of [
  "functions/domain/canonical-records.js",
  "functions/domain/encounter-subject-policy.js",
  "functions/domain/booking-projection.js",
  "functions/projections/encounter-completion.js"
]) {
  vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context, { filename: file });
}

const clone = value => JSON.parse(JSON.stringify(value));
let workspace = {
  people: { p1: { personId: "p1" }, p2: { personId: "p2" } },
  leads: { lead1: { leadId: "lead1", subjectPersonId: "p1", person: { personId: "p1" } } },
  locations: { loc1: { locationId: "loc1", street: "Current street", latitude: "32.5", longitude: "-97.2" } },
  vehicles: { veh1: { vehicleId: "veh1", make: "Current make", locations: [{ locationId: "loc1", street: "Stale street" }] } },
  encounters: {}
};
const model = {};
const canonical = context.COPDoc.domain.createCanonicalRecords({ model, clone, getWorkspace: () => workspace });
const subjects = context.COPDoc.domain.createEncounterSubjectPolicy({ model, clone, mergeRecord: canonical.mergeRecord, getWorkspace: () => workspace });
const completion = context.COPDoc.projections.createEncounterCompletion({ clone, getLocations: () => workspace.locations, nowIso: () => "2026-09-05T12:00:00.000Z" });

// Registry precedence survives stale nested snapshots without mutating their owners.
const inputVehicle = { vehicleId: "veh1", make: "Stale make", locations: [{ locationId: "loc1", street: "Older street" }] };
const inputBefore = clone(inputVehicle);
const registryBefore = clone(workspace);
const resultVehicle = canonical.canonicalVehicleRecord(inputVehicle, null);
assert.strictEqual(resultVehicle.make, "Current make");
assert.strictEqual(resultVehicle.locations[0].street, "Current street");
resultVehicle.locations[0].street = "Detached edit";
assert.deepStrictEqual(inputVehicle, inputBefore);
assert.deepStrictEqual(workspace, registryBefore);

// Case edits keep encounter/arrest projections and reject conflicting identity edits.
const baseline = { personId: "p1", name: { firstName: "Original" }, encounters: [], arrests: [], meta: { status: "draft" } };
const current = { personId: "p1", name: { firstName: "Updated elsewhere" }, encounters: [{ encounterId: "enc1" }], arrests: [{ bookingId: "booking1" }], meta: { status: "committed" } };
let merged = canonical.mergeCasePerson({ ...clone(baseline), extension: { reviewed: true } }, baseline, current, false);
assert.ok(merged.ok);
assert.strictEqual(merged.record.name.firstName, "Updated elsewhere");
assert.deepStrictEqual(merged.record.encounters, current.encounters);
assert.deepStrictEqual(merged.record.arrests, current.arrests);
assert.deepStrictEqual(merged.record.meta, current.meta);
assert.deepStrictEqual(merged.record.extension, { reviewed: true });
merged = canonical.mergeCasePerson({ ...clone(baseline), name: { firstName: "Competing edit" } }, baseline, current, false);
assert.strictEqual(merged.ok, false);
assert.match(merged.error, /name\.firstName/);

// Legacy subjects get repeatable IDs and preserve joins when the roster reorders.
const legacy = [
  { personId: "p1", bookinRecordId: "booking1", encounterRole: "target", vehicleRole: "driver" },
  { personId: "p2", encounterRole: "collateral" }
];
const normalized = subjects.normalizeEncounterSubjectsForStore(legacy, { encounterId: "enc1" });
assert.deepStrictEqual(clone(subjects.normalizeEncounterSubjectsForStore(legacy, { encounterId: "enc1" })), clone(normalized));
assert.strictEqual(normalized[0].role, "TARGET");
assert.strictEqual(normalized[0].occupantRole, "DRIVER");
assert.strictEqual(normalized[0].bookingId, "booking1");
assert.ok(normalized[0].legacyEncounterParticipantIds.includes("ep_booking1"));
assert.ok(normalized[0].legacyEncounterParticipantIds.includes("ep_0"));
const reordered = subjects.mergeEncounterSubjectsForStore(normalized, [legacy[1], legacy[0]], { encounterId: "enc1" });
assert.strictEqual(reordered[1].subjectId, normalized[0].subjectId);
assert.strictEqual(reordered[0].subjectId, normalized[1].subjectId);
assert.deepStrictEqual(legacy[0], { personId: "p1", bookinRecordId: "booking1", encounterRole: "target", vehicleRole: "driver" });

// Imports replace the entire workspace. Policies must consult the current provider.
workspace = { ...clone(workspace), locations: { loc1: { locationId: "loc1", street: "Imported street", latitude: "33", longitude: "-98" } }, encounters: {
  historical: { encounterId: "historical", completed: { subjects: [{ subjectId: "retired-subject", personId: "p1" }] } }
} };
assert.strictEqual(canonical.canonicalLocationRecord({ locationId: "loc1" }, null).street, "Imported street");
assert.ok(subjects.leadOwnerIdentity(workspace.leads.lead1, "lead1").ok);
const identityConflict = subjects.encounterSubjectIdentityConflict([], [{ subjectId: "retired-subject", personId: "p1" }], "new-encounter");
assert.strictEqual(identityConflict.reason, "subject-id-owned-by-another-encounter");
assert.strictEqual(identityConflict.existingEncounterId, "historical");
const mismatched = { encounters: { stored: { encounterId: "different" } } };
assert.strictEqual(subjects.canonicalizeEncounterMapKeys(mismatched).ok, false);
assert.strictEqual(mismatched.encounters.stored.encounterId, "different");

// Optional model adapters can be added after policy construction by later scripts.
let adapterCalls = 0;
model.normalizeEncounterSubjects = (rows, options) => { adapterCalls++; return [{ custom: rows.length, encounterId: options.encounterId }]; };
assert.deepStrictEqual(subjects.normalizeEncounterSubjectsForStore(legacy, { encounterId: "enc1" }), [{ custom: 2, encounterId: "enc1" }]);
assert.strictEqual(adapterCalls, 1);

// Closing snapshots exact saved prose and source state; later edits cannot rewrite it.
const encounter = {
  encounterId: "enc1", centerLocationId: "loc1", locations: [{ locationId: "loc1" }],
  subjects: [{ subjectId: "s1", outcome: "ARRESTED" }, { subjectId: "s2", outcome: "RELEASED" }, { subjectId: "s3", outcome: "FLED_ON_FOOT" }],
  narratives: [{ output: { finalPlainText: "Saved exact prose." }, state: { custom: ["retained"] } }]
};
const completed = completion.buildEncounterCompleted(encounter);
assert.strictEqual(completed.generatedAt, "2026-09-05T12:00:00.000Z");
assert.strictEqual(completed.locations[0].street, "Imported street");
assert.strictEqual(completed.locations[0].isCenter, true);
assert.deepStrictEqual(clone(completed.outcomeCounts), { arrested: 1, released: 1, fled: 1 });
assert.strictEqual(completed.pin.latitude, "33");
encounter.narratives[0].output.finalPlainText = "Later edit";
encounter.narratives[0].state.custom.push("later");
encounter.subjects[0].outcome = "RELEASED";
assert.strictEqual(completed.narratives[0].output.finalPlainText, "Saved exact prose.");
assert.deepStrictEqual(completed.narratives[0].state.custom, ["retained"]);
assert.strictEqual(completed.subjects[0].outcome, "ARRESTED");

// The booking projection uses the actual Arrest constructor, with no store loaded.
for (const file of ["functions/model/util.js", "functions/model/person.js"]) {
  vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context, { filename: file });
}
model.createArrest = context.COPDoc.model.createArrest;
const booking = context.COPDoc.domain.createBookingProjection({
  model, clone, getWorkspace: () => workspace, subjectPolicy: subjects,
  normalizeRole: value => String(value || "").toUpperCase(),
  normalizeVehiclePosition: value => value || "",
  normalizeClock: value => String(value || ""),
  encounterPin: completion.encounterPin
});
const bookingSubject = { subjectId: "booked-subject", personId: "p1", leadId: "lead1", bookingId: "packet1", outcome: "ARRESTED" };
workspace.encounters.enc1 = { encounterId: "enc1", subjects: [bookingSubject], locations: [{ locationId: "loc1" }] };
const bookingInput = {
  subjectId: bookingSubject.subjectId, bookingId: "packet1", encounterId: "enc1", personId: "p1", leadId: "lead1",
  arrestDate: "2026-09-04", arrestTime: "23:15", arrestingOfficer: "Original officer", subjectRole: "TARGET", booking: { cash: "$3.00" }
};
assert.ok(booking.validateBookInEncounterSubject(bookingInput).ok);
const beforeBooking = clone(workspace);
const bookedPerson = clone(workspace.people.p1);
const firstBooking = booking.upsertBookInArrest(bookedPerson, bookingInput);
assert.ok(firstBooking.ok);
assert.strictEqual(bookedPerson.arrests.length, 1);
assert.strictEqual(bookedPerson.arrests[0].subjectId, bookingSubject.subjectId);
assert.strictEqual(bookedPerson.arrests[0].bookinRecordId, "packet1");
assert.strictEqual(bookedPerson.arrests[0].latitude, "33");
assert.deepStrictEqual(workspace, beforeBooking, "projection writes only its supplied detached Person");
workspace.people.p1 = clone(bookedPerson);
workspace.leads.lead1.person = clone(bookedPerson);
const repeatedBooking = booking.upsertBookInArrest(bookedPerson, {
  ...bookingInput, arrestDate: "", arrestingOfficer: "", booking: { cash: "" },
  preserveMissingArrestFields: true, arrestFieldPresence: {}
});
assert.ok(repeatedBooking.ok);
assert.strictEqual(repeatedBooking.arrestId, firstBooking.arrestId);
assert.strictEqual(bookedPerson.arrests.length, 1, "retry updates the existing Arrest");
assert.strictEqual(bookedPerson.arrests[0].arrestDate, "2026-09-04");
assert.strictEqual(bookedPerson.arrests[0].arrestingOfficer, "Original officer");
assert.strictEqual(bookedPerson.arrests[0].booking.cash, "$3.00");
const conflictingJoin = booking.validateBookInEncounterSubject({ ...bookingInput, bookingId: "different-packet" });
assert.strictEqual(conflictingJoin.ok, false);
assert.strictEqual(conflictingJoin.code, "ENCOUNTER_SUBJECT_ID_CONFLICT");
const rejectedPerson = { personId: "p2", arrests: [] };
const wrongOwner = booking.upsertBookInArrest(rejectedPerson, bookingInput);
assert.strictEqual(wrongOwner.ok, false);
assert.deepStrictEqual(rejectedPerson.arrests, [], "a second Person cannot acquire the booking's Arrest");
assert.strictEqual(booking.validateBookInEncounterSubject({ subjectId: "orphan" }).ok, false);
workspace.encounters.enc1.bookingIdentityHistory = [{ ...bookingSubject, bookingUnlinked: true }];
assert.strictEqual(booking.validateBookInEncounterSubject(bookingInput).ok, false, "retired bookings cannot be relinked");
workspace.encounters.enc1.meta = { markedComplete: true };
assert.strictEqual(booking.validateBookInEncounterSubject(bookingInput).code, "ENCOUNTER_LOCKED");

console.log("Stage 8 store modules: canonical precedence, Case conflicts, legacy IDs, history, provider swaps, exact completion snapshots and booking projection invariants passed.");
