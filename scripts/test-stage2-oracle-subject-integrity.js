"use strict";

const assert = require("assert");
const {
  createMemoryStorage,
  quietConsole,
  loadScript,
  loadModelTab
} = require("./support/copdoc-vm-harness.js");

const storage = createMemoryStorage();
const { model, context } = loadModelTab(storage, { console: quietConsole() });
loadScript(context, "functions/oracle.js");

const personB = model.createPerson({
  personId: "person_oracle_b",
  name: { lastName: "PERSON-B", firstName: "TEST" }
});
personB.arrests = [
  model.createArrest({
    arrestId: "arr_oracle_corrupt_subject",
    encounterId: "enc_oracle_subject_integrity",
    encounterNumber: "enc_oracle_subject_integrity",
    arrestDate: "2026-09-05",
    subjectId: "sub_oracle_person_a",
    subjectRole: "COLLATERAL"
  })
];

const leadB = model.createLead({
  person: personB,
  subjectPersonId: personB.personId
});
leadB.meta.status = "committed";
leadB.meta.committedAt = "2026-09-05T16:00:00.000Z";

const encounter = model.createEncounterRecord({
  encounterId: "enc_oracle_subject_integrity",
  startedAt: "2026-09-05T16:00",
  eventType: "VEHICLE_STOP"
});
encounter.subjects = [
  model.createEncounterSubject({
    subjectId: "sub_oracle_person_a",
    encounterId: encounter.encounterId,
    personId: "person_oracle_a",
    role: "TARGET",
    outcome: "ARRESTED"
  }),
  model.createEncounterSubject({
    subjectId: "sub_oracle_person_b",
    encounterId: encounter.encounterId,
    personId: personB.personId,
    role: "OTHER",
    outcome: "ARRESTED"
  })
];

const summary = context.COPDoc.oracle.summarize({
  leads: [leadB],
  encounters: [encounter],
  from: "2026-09-05",
  to: "2026-09-05",
  today: "2026-09-05T18:00:00.000Z",
  catalogs: { countries: [], dispositions: [], encounterTypes: [] }
});

assert.strictEqual(summary.arrests, 1);
assert.strictEqual(
  summary.target,
  0,
  "an Arrest nested under Person B must not inherit Person A's TARGET role"
);
assert.strictEqual(
  summary.collateral,
  1,
  "a rejected corrupt subject link must retain the Arrest's own role"
);
assert.strictEqual(
  summary.quality.roleBlank,
  0,
  "an explicit subjectId mismatch must not fall through to Person B's OTHER subject"
);

console.log("ok Oracle rejects cross-person EncounterSubject joins");
