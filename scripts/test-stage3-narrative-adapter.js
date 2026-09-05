"use strict";

const assert = require("assert");
const sourceFreshness = require("../functions/narratives/source-freshness.js");
const {
  createMemoryStorage,
  quietConsole,
  loadModelTab,
  loadScript
} = require("./support/copdoc-vm-harness.js");

const WORKSPACE = "copdocx.store.v1";
const BOOKIN = "alien-book-in.saved-records.v1";
const ADMIN = "copdoc.admin.v1";
const clone = (value) => JSON.parse(JSON.stringify(value));
const field = (value) => ({ type: "text", value });

function setup() {
  const encounter = {
    encounterId: "enc_stage3_adapter",
    encounterNumber: "DAL-3-TEST",
    eventType: "KNOCK_AND_TALK",
    startedAt: "2026-09-05T10:00:00Z",
    endedAt: "2026-09-05T10:45:00Z",
    operationId: "op_stage3",
    officerIds: ["officer_one", "officer_two", "officer_one", "officer_missing"],
    centerLocationId: "loc_center",
    notes: "Saved encounter note",
    meta: { status: "committed", markedComplete: false, createdAt: "2020-01-01" },
    subjects: [
      {
        subjectId: "sub_one", encounterId: "enc_stage3_adapter",
        personId: "person_one", leadId: "lead_one", bookingId: "book_one",
        role: "TARGET", outcome: "ARRESTED", lastName: "OLD", firstName: "SUBJECT",
        alienNumber: "111111111", citizenship: "MX", flightMode: "FOOT",
        compliance: "NON_COMPLIANT", useOfForce: "yes", forceLevel: "HARD",
        arrestingOfficerId: "officer_two", legacyEncounterParticipantIds: ["ep_old", "ep_ambiguous"]
      },
      {
        subjectId: "sub_two", encounterId: "enc_stage3_adapter", role: "COLLATERAL",
        outcome: "FLED_FOOT", fledAt: "2026-09-05T10:20:00Z", lastName: "SECOND",
        firstName: "SUBJECT", citizenship: "MX", flightMode: "FOOT",
        legacyEncounterParticipantIds: ["ep_ambiguous"]
      },
      {
        subjectId: "sub_other", encounterId: "enc_stage3_adapter", role: "OTHER",
        outcome: "RELEASED", lastName: "UNASSIGNED"
      }
    ],
    locations: [
      { locationId: "loc_first", street: "Wrong primary", city: "First", latitude: "40", longitude: "-90" },
      { locationId: "loc_center", street: "123 Test St", street2: "Unit 4", city: "Center", state: "TX", zip: "00000", association: "target", latitude: "0", longitude: 0 }
    ],
    vehicles: [
      { vehicleId: "vehicle_one", vehicleMake: "Test", vehicleModel: "Car", encounterDisposition: "LEFT" }
    ],
    events: [
      {
        encounterEventId: "event_one", encounterId: "enc_stage3_adapter", sequence: 1,
        eventType: "USE_OF_FORCE", occurredAt: "2026-09-05T10:10:00Z",
        summary: "Saved structured event",
        participantLinks: [{ encounterParticipantId: "ep_old", role: "RECIPIENT" }],
        officerLinks: [{ officerProfileId: "officer_event", role: "ACTOR" }],
        details: { subjectEncounterParticipantId: "ep_old", encounterParticipantIds: ["ep_old", "ep_ambiguous", "unresolved"], injuryObserved: false }
      },
      { encounterEventId: "wrong_encounter_event", encounterId: "another_encounter", eventType: "ARREST" }
    ],
    narratives: [{ narrativeId: "nar_old", output: { finalPlainText: "Historical prose" } }]
  };
  const person = {
    personId: "person_one", name: { firstName: "Current", lastName: "CANONICAL" },
    dateOfBirth: "1980-01-02", sex: "F", citizenship: "CA",
    immigration: { alienNumber: "222333444", status: "TEST_STATUS", finalOrder: true }
  };
  const workspace = {
    schema: "copdocx.store.v1", people: { person_one: person },
    leads: { lead_one: { leadId: "lead_one", person: Object.assign(clone(person), { name: { firstName: "Wrong", lastName: "LEAD" } }) } },
    encounters: { [encounter.encounterId]: encounter },
    investigations: {}, vehicles: {}, locations: {}, businesses: {}, entities: {}, associations: {},
    operations: {
      op_stage3: {
        operationId: "op_stage3", operationNumber: "OP-3", name: "Operation Test",
        plannedStart: "2026-09-04T09:00:00Z", plannedEnd: "2026-09-04T11:00:00Z",
        team: "3", fieldOffice: "Saved Field Office",
        teams: [{ members: [{ officerId: "officer_excluded" }] }]
      }
    },
    currentLeadId: ""
  };
  const packets = [{
    id: "book_one", subjectId: "sub_one", personId: "person_one", leadId: "lead_one",
    encounterId: encounter.encounterId,
    formState: {
      lastName: field("PACKET"), firstName: field("Old"), dateOfBirth: field("1990-09-09"),
      citizenship: field("MX"), alienNumber: field("999999999"),
      sexMale: { type: "checkbox", checked: true }, officersName: field("Wrong Name"),
      medicalIssues: field("Recorded health detail"), cash: field("12.50"),
      dateTime: field("2026-09-05T10:15:00Z")
    }
  }];
  const storage = createMemoryStorage({
    [WORKSPACE]: workspace,
    [BOOKIN]: packets,
    [ADMIN]: { officers: [
      { officerId: "officer_one", firstName: "First", lastName: "OFFICER", badge: "1", team: "3" },
      { officerId: "officer_two", firstName: "Second", lastName: "OFFICER", badge: "2", team: "3" },
      { officerId: "officer_event", firstName: "Third", lastName: "OFFICER", badge: "3", team: "3", junked: true },
      { officerId: "officer_excluded", firstName: "Excluded", lastName: "OFFICER" }
    ] },
    "copdocx.settings.v1": { issuingOffice: "Default Office" }
  });
  const { context, model } = loadModelTab(storage, { console: quietConsole() });
  context.COUNTRIES = [{ code: "CA", label: "Canada" }, { code: "MX", label: "Mexico" }];
  context.IMMIGRATION_DISPOSITIONS = [];
  loadScript(context, "functions/encounter-narrative.js");
  model.store.loadFromDisk();
  return { api: context.COPDoc.encounterNarrative, context, model, storage, encounter, workspace, packets };
}

function exerciseSourceContext() {
  const { api, encounter, packets } = setup();
  const before = JSON.stringify({ encounter, packets });
  const bundle = api.bundleFromEncounterRecord(encounter, { bookinRecords: packets });
  assert.strictEqual(bundle.encounter.eventType, "KNOCK_AND_TALK", "vehicle presence must not invent encounter type");
  assert.strictEqual(bundle.encounter.encounterNumber, "DAL-3-TEST");
  assert.strictEqual(bundle.encounter.status, "COMMITTED", "unfinished encounters must not be labeled completed");
  assert.strictEqual(bundle.encounter.endedAt, encounter.endedAt);
  assert.strictEqual(bundle.encounter.notes, "Saved encounter note");
  assert.strictEqual(bundle.encounter.primaryLocationId, "loc_center");
  assert.strictEqual(bundle.location.postalAddress.city, "Center");
  assert.ok(bundle.location.generatedDisplayName.includes("Unit 4"));
  assert.deepStrictEqual(clone(bundle.location.coordinates), { latitude: 0, longitude: 0 });
  assert.strictEqual(bundle.operation.operationId, "op_stage3");
  assert.strictEqual(bundle.operation.operationNumber, "OP-3");
  assert.strictEqual(bundle.operation.displayName, "Operation Test");
  assert.strictEqual(bundle.operation.fieldOffice, "Saved Field Office");
  assert.strictEqual(bundle.operation.date, "2026-09-04");
  assert.strictEqual(bundle.operation.plannedEnd, "2026-09-04T11:00:00Z");
  assert.strictEqual(bundle.participants.length, 2, "preserve Stage2 assigned-role boundary");
  assert.strictEqual(bundle.unassignedParticipantCount, 1);
  const first = bundle.participants[0];
  assert.strictEqual(first.subjectId, "sub_one");
  assert.strictEqual(first.personId, "person_one");
  assert.strictEqual(first.identitySnapshot.displayName, "CANONICAL, Current");
  assert.strictEqual(first.identitySnapshot.dateOfBirth, "1980-01-02");
  assert.strictEqual(first.identitySnapshot.aNumber, "222333444");
  assert.strictEqual(first.identitySnapshot.sex, "FEMALE");
  assert.strictEqual(first.identitySnapshot.nationalityDisplay, "Canada");
  assert.strictEqual(first.closing.health, "Recorded health detail", "booking-specific facts still come from exact joined packet");
  assert.strictEqual(first.finalOutcome, "ARRESTED");
  assert.strictEqual(first.enforcementBasisCode, "UNKNOWN", "arrest without recorded authority must not imply warrantless authority");
  assert.strictEqual(bundle.participants[1].finalOutcome, "FLED_FOOT");
  assert.strictEqual(bundle.participants[1].finalOutcomeAt, "2026-09-05T10:20:00Z");
  assert.strictEqual(bundle.officers.length, 4, "all exact encounter/event officers deduplicated, excluded operation member stays excluded");
  assert.ok(!bundle.officers.some((row) => row.officerProfileId === "officer_excluded"));
  assert.strictEqual(bundle.encounter.reportingOfficerId, "officer_two");
  const reporting = bundle.officers.find((row) => row.officerProfileId === "officer_two");
  assert.strictEqual(reporting.displayName, "OFFICER, Second", "packet text cannot replace exact roster identity");
  assert.ok(reporting.roles.includes("ARRESTING") && reporting.roles.includes("REPORTING"));
  assert.strictEqual(bundle.officers.find((row) => row.officerProfileId === "officer_missing").displayName, "");
  assert.strictEqual(bundle.officers.find((row) => row.officerProfileId === "officer_event").displayName, "OFFICER, Third", "historical referenced officer may remain readable after deactivation");
  assert.strictEqual(bundle.events.length, 1, "do not adopt an explicitly foreign event");
  assert.strictEqual(bundle.events[0].encounterEventId, "event_one");
  assert.strictEqual(bundle.events[0].participantLinks[0].encounterParticipantId, "sub_one");
  assert.strictEqual(bundle.events[0].details.subjectEncounterParticipantId, "sub_one");
  assert.deepStrictEqual(clone(bundle.events[0].details.encounterParticipantIds), ["sub_one", "ep_ambiguous", "unresolved"]);
  assert.strictEqual(bundle.events[0].details.injuryObserved, false);
  assert.strictEqual(bundle.sourceFacts.encounter.centerAssociation, "target");
  assert.strictEqual(bundle.sourceFacts.vehicles[0].encounterDisposition, "LEFT");
  assert.deepStrictEqual(clone(bundle.sourceFacts.subjects.sub_one), {
    subjectId: "sub_one", outcome: "ARRESTED", citizenship: "CA", flightMode: "FOOT",
    compliance: "NON_COMPLIANT", useOfForce: "yes", forceLevel: "HARD"
  });
  assert.ok(!bundle.sourceFacts.subjects.sub_other);
  bundle.events[0].details.injuryObserved = true;
  bundle.sourceFacts.subjects.sub_one.outcome = "RELEASED";
  assert.strictEqual(JSON.stringify({ encounter, packets }), before, "projection must not mutate original Encounter or packet");
}

function exerciseAbsenceAndFallbacks() {
  const { api, encounter } = setup();
  delete encounter.startedAt;
  delete encounter.endedAt;
  delete encounter.eventType;
  encounter.events = [];
  encounter.operationId = "missing_operation";
  encounter.officerIds = [];
  encounter.subjects[0].arrestingOfficerId = "";
  encounter.locations[1].latitude = "";
  encounter.locations[1].longitude = "invalid";
  let bundle = api.bundleFromEncounterRecord(encounter, { bookinRecords: [] });
  assert.strictEqual(bundle.encounter.startedAt, "", "metadata creation time is not encounter start");
  assert.strictEqual(bundle.encounter.endedAt, "", "missing end is not start time");
  assert.strictEqual(bundle.encounter.eventType, "UNKNOWN");
  assert.deepStrictEqual(clone(bundle.location.coordinates), { latitude: null, longitude: null });
  assert.strictEqual(bundle.operation.operationId, "missing_operation", "retain exact dangling link without substituting a different operation");
  assert.strictEqual(bundle.operation.displayName, "");
  assert.strictEqual(bundle.events.length, 0, "outcome and force fields do not fabricate timeline events");
  assert.strictEqual(bundle.officers.length, 0, "do not invent officers from operation membership");
  assert.strictEqual(bundle.encounterLocked, false);
  encounter.subjects[0].enforcementBasisCode = "WARRANTLESS_ADMINISTRATIVE";
  encounter.meta.markedComplete = true;
  bundle = api.bundleFromEncounterRecord(encounter, { bookinRecords: [] });
  assert.strictEqual(bundle.participants[0].enforcementBasisCode, "WARRANTLESS_ADMINISTRATIVE", "preserve explicitly recorded enforcement authority");
  assert.strictEqual(bundle.encounter.status, "COMPLETED");
  assert.strictEqual(bundle.encounterLocked, true);
  assert.strictEqual(bundle.encounter.endedAt, "", "completion timestamp does not invent an encounter end time");
  encounter.centerLocationId = "missing_location";
  bundle = api.bundleFromEncounterRecord(encounter, { bookinRecords: [] });
  assert.strictEqual(bundle.encounter.primaryLocationId, "loc_first");
}

function exerciseIdentityAndFreshReads() {
  const { api, encounter, packets, model, storage } = setup();
  let current = api.bundleFromEncounter(encounter.encounterId);
  assert.strictEqual(current.participants[0].identitySnapshot.aNumber, "222333444");
  const saved = JSON.parse(storage.storage.getItem(WORKSPACE));
  saved.people.person_one.name.lastName = "UPDATED";
  saved.people.person_one.immigration.alienNumber = "555666777";
  storage.setRaw(WORKSPACE, saved);
  current = api.bundleFromEncounter(encounter.encounterId);
  assert.strictEqual(current.participants[0].identitySnapshot.aNumber, "555666777", "fresh canonical Person changes must survive stale packet copies");
  assert.ok(current.participants[0].identitySnapshot.displayName.startsWith("UPDATED,"));
  const originalGetPerson = model.store.getPerson;
  model.store.getPerson = () => null;
  const noPerson = api.bundleFromEncounterRecord(encounter, { bookinRecords: packets });
  assert.strictEqual(noPerson.participants[0].identitySnapshot.displayName, "PACKET, Old", "missing canonical Person may use compatible packet, not stale Lead identity");
  const noPacket = api.bundleFromEncounterRecord(encounter, { bookinRecords: [] });
  assert.strictEqual(noPacket.participants[0].identitySnapshot.displayName, "OLD, SUBJECT");
  model.store.getPerson = () => ({ personId: "someone_else", name: { lastName: "WRONG", firstName: "PERSON" } });
  const badPerson = api.bundleFromEncounterRecord(encounter, { bookinRecords: [] });
  assert.strictEqual(badPerson.participants[0].identitySnapshot.displayName, "OLD, SUBJECT", "wrong returned Person payload must not be used");
  model.store.getPerson = originalGetPerson;
  const beforeFacts = api.bundleFromEncounterRecord(encounter, { bookinRecords: packets }).sourceFacts;
  encounter.meta.updatedAt = "2099-01-01";
  encounter.meta.encounterRevision = 99;
  encounter.narratives = [];
  assert.deepStrictEqual(clone(api.bundleFromEncounterRecord(encounter, { bookinRecords: packets }).sourceFacts), clone(beforeFacts), "seeding facts exclude save timestamps, revisions, narrative output");
}

function exerciseAmbiguousRosterText() {
  const { api, encounter, packets, storage } = setup();
  encounter.officerIds = [];
  encounter.events = [];
  encounter.subjects[0].arrestingOfficerId = "";
  packets[0].formState.officersName = field("SAME, NAME");
  storage.setRaw(ADMIN, { officers: [
    { officerId: "ambiguous_one", firstName: "NAME", lastName: "SAME" },
    { officerId: "ambiguous_two", firstName: "NAME", lastName: "SAME" }
  ] });
  const bundle = api.bundleFromEncounterRecord(encounter, { bookinRecords: packets });
  assert.strictEqual(bundle.encounter.reportingOfficerId, "ofc_reporting", "ambiguous legacy name must not select an arbitrary roster identity");
  assert.strictEqual(bundle.officers[0].displayName, "SAME, NAME");
  assert.strictEqual(bundle.officers[0].personId, "");
  encounter.subjects[1].bookingId = "book_two";
  packets.push({
    id: "book_two", subjectId: "sub_two", encounterId: encounter.encounterId,
    formState: { officersName: field("ADDITIONAL, OFFICER") }
  });
  const legacyOfficers = api.bundleFromEncounterRecord(encounter, { bookinRecords: packets }).officers;
  assert.strictEqual(legacyOfficers.length, 2, "later legacy packet officer names must not disappear");
  assert.ok(legacyOfficers.some((row) => row.displayName === "ADDITIONAL, OFFICER"));
}

function exerciseExplicitSourceClears() {
  const { api, encounter, packets, model } = setup();
  const packet = packets[0];
  const person = {
    personId: "person_one", name: { lastName: "PACKET", firstName: "Old" },
    dateOfBirth: "1990-09-09", immigration: { alienNumber: "999999999" },
    sex: "M", citizenship: "MX"
  };
  model.store.getPerson = () => clone(person);
  const current = () => api.bundleFromEncounterRecord(encounter, { bookinRecords: packets });
  const identityCases = [
    ["lastName", person.name, "lastName", p => p.identitySnapshot.displayName, "Old"],
    ["firstName", person.name, "firstName", p => p.identitySnapshot.displayName, "PACKET"],
    ["DOB", person, "dateOfBirth", p => p.identitySnapshot.dateOfBirth, ""],
    ["A-number", person.immigration, "alienNumber", p => p.identitySnapshot.aNumber, ""],
    ["sex", person, "sex", p => p.identitySnapshot.sex, "UNKNOWN"],
    ["citizenship", person, "citizenship", p => p.identitySnapshot.nationalityDisplay, ""]
  ];
  identityCases.forEach(([label, owner, key, read, expected]) => {
    const prior = owner[key];
    const snapshot = sourceFreshness.capture(current(), "sub_one");
    owner[key] = "";
    const cleared = current();
    assert.strictEqual(read(cleared.participants[0]), expected, "canonical " + label + " clear must not revive packet/subject values");
    assert.strictEqual(sourceFreshness.evaluate(snapshot, sourceFreshness.capture(cleared, "sub_one")), "STALE", label + " clear must invalidate saved narrative source");
    delete owner[key];
    assert.notStrictEqual(read(current().participants[0]), expected, "genuinely absent " + label + " property retains legacy packet fallback");
    owner[key] = prior;
  });
  person.name.lastName = "";
  person.name.firstName = "";
  assert.strictEqual(current().participants[0].identitySnapshot.displayName, "", "clearing both canonical names must not fall back to row displayName");
  person.name.lastName = "PACKET";
  person.name.firstName = "Old";

  const closingCases = [
    ["medicalIssues", "medicalIssues", "Saved medical", p => p.closing.health, "UNKNOWN"],
    ["medicine", "medicine", "Saved medicine", p => p.closing.medication, "UNKNOWN"],
    ["children", "children", "Saved children", p => p.closing.minors, "UNKNOWN"],
    ["travelDocs", "travelDocs", "Saved documents", p => p.closing.identityDocuments, "UNKNOWN"],
    ["cash", "cash", "12.50", p => p.closing.currency, null],
    ["arrestDateTime", "arrestDateTime", "2026-09-05T10:15:00Z", p => p.finalOutcomeAt, ""],
    ["iceEvent", "iceEvent", "TEST-EVENT", p => p.iceEventNumber, null],
    ["immigrationDisposition", "caseType", "TEST_DISPOSITION", p => p.immigrationSnapshot.displayText, ""]
  ];
  closingCases.forEach(([id, alias, value, read, expected]) => {
    packet.formState[id] = field(value);
    packet[alias] = value;
    const snapshot = sourceFreshness.capture(current(), "sub_one");
    packet.formState[id].value = "";
    const cleared = current();
    assert.strictEqual(read(cleared.participants[0]), expected, "explicit form " + id + " clear must not revive packet top-level snapshot");
    assert.strictEqual(sourceFreshness.evaluate(snapshot, sourceFreshness.capture(cleared, "sub_one")), "STALE", id + " clear must invalidate saved narrative source");
    delete packet.formState[id];
    assert.notStrictEqual(read(current().participants[0]), expected, "absent " + id + " form entry preserves legacy top-level fallback");
  });
  // With canonical properties absent, explicit packet identity clears still win
  // over both its duplicate top-level values and the EncounterSubject snapshot.
  model.store.getPerson = () => ({ personId: "person_one" });
  packet.lastName = "PACKET";
  packet.firstName = "Old";
  packet.alienNumber = "999999999";
  packet.formState.lastName = field("");
  packet.formState.firstName = field("");
  packet.formState.alienNumber = field("");
  const packetCleared = current().participants[0].identitySnapshot;
  assert.strictEqual(packetCleared.displayName, "");
  assert.strictEqual(packetCleared.aNumber, "");
}

function exerciseArrestTimeAuthority() {
  const { api, encounter, packets } = setup();
  const subject = encounter.subjects[0];
  const packet = packets[0];
  const current = () => api.bundleFromEncounterRecord(encounter, { bookinRecords: packets });
  assert.strictEqual(current().participants[0].finalOutcomeAt, encounter.startedAt, "booking dateTime alone cannot be used as arrest time");
  packet.formState.arrestTime = field("10:05");
  assert.strictEqual(current().participants[0].finalOutcomeAt, "2026-09-05T10:05", "combine explicit arrest time with booking calendar date");
  const baseline = sourceFreshness.capture(current(), "sub_one");
  packet.arrestTime = "10:05";
  packet.formState.arrestTime.value = "";
  assert.strictEqual(current().participants[0].finalOutcomeAt, "", "cleared arrest time cannot revive duplicate snapshot or booking timestamp");
  assert.strictEqual(sourceFreshness.evaluate(baseline, sourceFreshness.capture(current(), "sub_one")), "STALE");
  packet.formState.arrestTime.value = "10:05";
  packet.arrestDateTime = "2026-09-05T10:04:00Z";
  assert.strictEqual(current().participants[0].finalOutcomeAt, packet.arrestDateTime);
  subject.finalOutcomeAt = "2026-09-05T10:03:00Z";
  assert.strictEqual(current().participants[0].finalOutcomeAt, subject.finalOutcomeAt);
  subject.outcomeAt = "2026-09-05T10:02:00Z";
  assert.strictEqual(current().participants[0].finalOutcomeAt, subject.outcomeAt, "explicit canonical outcome time wins over packet arrest and booking times");
  subject.outcomeAt = "";
  assert.strictEqual(current().participants[0].finalOutcomeAt, "", "explicitly cleared canonical outcome time remains unknown");
}

function exerciseUnavailableSources() {
  const { api, encounter, storage } = setup();
  assert.ok(api.bundleFromEncounter(encounter.encounterId));
  const originalWorkspace = storage.storage.getItem(WORKSPACE);
  storage.setRaw(WORKSPACE, "{corrupt workspace");
  assert.strictEqual(api.bundleFromEncounter(encounter.encounterId), null, "unreadable Workspace must not reuse cached valid Encounter as current source");
  storage.setRaw(WORKSPACE, originalWorkspace);
  [BOOKIN, ADMIN, "copdocx.settings.v1"].forEach((key) => {
    const original = storage.storage.getItem(key);
    storage.setRaw(key, "{corrupt source");
    const bundle = api.bundleFromEncounter(encounter.encounterId);
    assert.ok(bundle, "available Encounter may still be inspected");
    assert.strictEqual(bundle.sourceUnavailable, true, "unreadable " + key + " must flag incomplete source");
    assert.strictEqual(sourceFreshness.capture(bundle, "sub_one"), null, "failed source read cannot be certified CURRENT");
    storage.setRaw(key, original);
    assert.strictEqual(api.bundleFromEncounter(encounter.encounterId).sourceUnavailable, false);
  });
  storage.setRaw(BOOKIN, {});
  assert.strictEqual(api.bundleFromEncounter(encounter.encounterId).sourceUnavailable, true, "invalid Book-In shape is unavailable, not an empty source");
}

exerciseSourceContext();
exerciseAbsenceAndFallbacks();
exerciseIdentityAndFreshReads();
exerciseAmbiguousRosterText();
exerciseExplicitSourceClears();
exerciseArrestTimeAuthority();
exerciseUnavailableSources();
console.log("Stage 3 Narrative adapter checks passed.");
