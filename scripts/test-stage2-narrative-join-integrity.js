"use strict";

const assert = require("assert");
const {
  createMemoryStorage,
  quietConsole,
  loadModelTab,
  loadScript
} = require("./support/copdoc-vm-harness.js");

const WORKSPACE_KEY = "copdocx.store.v1";
const BOOKIN_KEY = "alien-book-in.saved-records.v1";

function workspaceWith(encounter) {
  return {
    schema: "copdocx.store.v1",
    people: {},
    leads: {},
    encounters: { [encounter.encounterId]: encounter },
    investigations: {},
    vehicles: {},
    locations: {},
    businesses: {},
    entities: {},
    associations: {},
    operations: {},
    currentLeadId: ""
  };
}

function subject(values) {
  return Object.assign(
    {
      subjectId: "sub_primary",
      encounterId: "enc_join_integrity",
      role: "TARGET",
      encounterRole: "TARGET",
      bookingId: "",
      bookinRecordId: "",
      personId: "",
      leadId: "",
      lastName: "CANONICAL",
      firstName: "SUBJECT",
      outcome: "ARRESTED"
    },
    values || {}
  );
}

function packet(values, marker) {
  return Object.assign(
    {
      id: "packet_" + marker.toLowerCase(),
      encounterId: "enc_join_integrity",
      encounterRole: "TARGET",
      formState: {
        alienNumber: { value: marker }
      }
    },
    values || {}
  );
}

function bundleFor(subjects, records) {
  const encounter = {
    encounterId: "enc_join_integrity",
    startedAt: "2026-09-05T12:00:00.000Z",
    subjects,
    meta: { status: "committed" }
  };
  const storage = createMemoryStorage({
    [WORKSPACE_KEY]: workspaceWith(encounter),
    [BOOKIN_KEY]: records
  });
  const { context } = loadModelTab(storage, { console: quietConsole() });
  context.COUNTRIES = [];
  context.IMMIGRATION_DISPOSITIONS = [];
  loadScript(context, "functions/encounter-narrative.js");
  return context.COPDoc.encounterNarrative.bundleFromEncounter(encounter.encounterId);
}

function primary(bundle) {
  return bundle.participants.find(
    (row) => row.encounterParticipantId === "sub_primary"
  );
}

function assertEnriched(label, subjects, record, marker) {
  const participant = primary(bundleFor(subjects, [record]));
  assert.ok(participant, label + ": canonical participant must remain present");
  assert.strictEqual(
    participant.identitySnapshot.aNumber,
    marker.replace(/\D/g, ""),
    label + ": compatible Book-In packet should enrich the participant"
  );
}

function assertNotEnriched(label, subjects, record, marker) {
  const participant = primary(bundleFor(subjects, [record]));
  assert.ok(participant, label + ": canonical participant must remain present");
  assert.notStrictEqual(
    participant.identitySnapshot.aNumber,
    marker.replace(/\D/g, ""),
    label + ": contradictory Book-In packet must remain unjoined"
  );
}

function exerciseCompatibleTiers() {
  const fullyIdentified = subject({
    bookingId: "bk_primary",
    bookinRecordId: "bk_primary",
    personId: "person_primary",
    leadId: "lead_primary"
  });

  assertEnriched(
    "subjectId tier",
    [fullyIdentified],
    packet(
      {
        id: "bk_primary",
        subjectId: "sub_primary",
        personId: "person_primary",
        leadId: "lead_primary"
      },
      "A100000001"
    ),
    "A100000001"
  );
  assertEnriched(
    "booking tier",
    [fullyIdentified],
    packet(
      {
        id: "bk_primary",
        personId: "person_primary",
        leadId: "lead_primary"
      },
      "A100000002"
    ),
    "A100000002"
  );
  assertEnriched(
    "person tier",
    [subject({ personId: "person_primary", leadId: "lead_primary" })],
    packet(
      { personId: "person_primary", leadId: "lead_primary" },
      "A100000003"
    ),
    "A100000003"
  );
  assertEnriched(
    "lead tier",
    [subject({ leadId: "lead_primary" })],
    packet({ leadId: "lead_primary" }, "A100000004"),
    "A100000004"
  );
}

function exerciseOverlappingIdentifierConflicts() {
  const fullyIdentified = subject({
    bookingId: "bk_primary",
    bookinRecordId: "bk_primary",
    personId: "person_primary",
    leadId: "lead_primary"
  });

  [
    {
      label: "exact subjectId with contradictory booking",
      record: packet(
        {
          id: "bk_contradictory",
          subjectId: "sub_primary",
          personId: "person_primary",
          leadId: "lead_primary"
        },
        "A200000001"
      ),
      marker: "A200000001"
    },
    {
      label: "exact subjectId with contradictory person",
      record: packet(
        {
          id: "bk_primary",
          subjectId: "sub_primary",
          personId: "person_contradictory",
          leadId: "lead_primary"
        },
        "A200000002"
      ),
      marker: "A200000002"
    },
    {
      label: "exact subjectId with contradictory lead",
      record: packet(
        {
          id: "bk_primary",
          subjectId: "sub_primary",
          personId: "person_primary",
          leadId: "lead_contradictory"
        },
        "A200000003"
      ),
      marker: "A200000003"
    },
    {
      label: "booking tier with contradictory person",
      record: packet(
        {
          id: "bk_primary",
          personId: "person_contradictory",
          leadId: "lead_primary"
        },
        "A200000004"
      ),
      marker: "A200000004"
    },
    {
      label: "person tier with contradictory lead",
      subjects: [subject({ personId: "person_primary", leadId: "lead_primary" })],
      record: packet(
        { personId: "person_primary", leadId: "lead_contradictory" },
        "A200000005"
      ),
      marker: "A200000005"
    },
    {
      label: "lead tier with contradictory person",
      subjects: [subject({ personId: "person_primary", leadId: "lead_primary" })],
      record: packet(
        { personId: "person_contradictory", leadId: "lead_primary" },
        "A200000006"
      ),
      marker: "A200000006"
    }
  ].forEach((testCase) => {
    assertNotEnriched(
      testCase.label,
      testCase.subjects || [fullyIdentified],
      testCase.record,
      testCase.marker
    );
  });
}

function exerciseIdentifiersOwnedByAnotherSubject() {
  const other = subject({
    subjectId: "sub_other",
    role: "COLLATERAL",
    encounterRole: "COLLATERAL",
    bookingId: "bk_other",
    bookinRecordId: "bk_other",
    personId: "person_other",
    leadId: "lead_other",
    lastName: "OTHER"
  });
  [
    {
      label: "booking owned by another subject",
      values: { id: "bk_other", subjectId: "sub_primary" },
      marker: "A300000001"
    },
    {
      label: "person owned by another subject",
      values: {
        id: "packet_owned_person",
        subjectId: "sub_primary",
        personId: "person_other"
      },
      marker: "A300000002"
    },
    {
      label: "lead owned by another subject",
      values: {
        id: "packet_owned_lead",
        subjectId: "sub_primary",
        leadId: "lead_other"
      },
      marker: "A300000003"
    }
  ].forEach((testCase) => {
    assertNotEnriched(
      testCase.label,
      [subject(), other],
      packet(testCase.values, testCase.marker),
      testCase.marker
    );
  });
}

function exerciseDurableLegacyIndexAlias() {
  const encounterId = "enc_legacy_index_alias";
  const legacyNarrativeId = "nar_legacy_index_alias";
  const legacyEncounter = {
    encounterId,
    startedAt: "2026-09-05T12:00:00.000Z",
    subjects: [
      {
        encounterId,
        role: "TARGET",
        encounterRole: "TARGET",
        lastName: "ORIGINAL",
        firstName: "SUBJECT",
        outcome: "ARRESTED"
      }
    ],
    narratives: [
      {
        narrativeId: legacyNarrativeId,
        encounterId,
        narrativeKind: "PRIMARY_SUBJECT",
        focusEncounterParticipantId: "ep_0",
        recordState: "ACTIVE"
      }
    ],
    meta: { status: "committed" }
  };
  const storage = createMemoryStorage({
    [WORKSPACE_KEY]: workspaceWith(legacyEncounter),
    [BOOKIN_KEY]: []
  });
  const { context, model } = loadModelTab(storage, { console: quietConsole() });
  context.COUNTRIES = [];
  context.IMMIGRATION_DISPOSITIONS = [];
  loadScript(context, "functions/encounter-narrative.js");

  const rawBeforeLoad = storage.json(WORKSPACE_KEY, {});
  assert.strictEqual(
    rawBeforeLoad.encounters[encounterId].subjects[0].subjectId,
    undefined,
    "fixture must begin with a genuinely pre-canonical participant"
  );

  model.store.loadFromDisk();
  const loaded = model.store.getEncounter(encounterId);
  const originalId = loaded.subjects[0].subjectId;
  assert.ok(originalId, "loading must assign a canonical subjectId to a legacy participant");
  assert.ok(
    loaded.subjects[0].legacyEncounterParticipantIds.includes("ep_0"),
    "loading must bind the legacy index alias to the migrated participant"
  );
  assert.strictEqual(
    storage.json(WORKSPACE_KEY, {}).encounters[encounterId].subjects[0].subjectId,
    undefined,
    "loading may normalize memory but must not silently rewrite storage"
  );

  const migrationSave = model.store.saveEncounter(loaded, { mode: "commit" });
  assert.strictEqual(migrationSave.ok, true, "saving the loaded encounter must persist migration identity");
  const persisted = storage.json(WORKSPACE_KEY, {}).encounters[encounterId];
  assert.strictEqual(persisted.subjects[0].subjectId, originalId);
  assert.ok(
    persisted.subjects[0].legacyEncounterParticipantIds.includes("ep_0"),
    "the migrated index alias must be durable once saved"
  );

  let bundle = context.COPDoc.encounterNarrative.bundleFromEncounter(encounterId);
  assert.strictEqual(
    context.COPDoc.encounterNarrative.resolveEncounterParticipantId(
      bundle.participants,
      "ep_0"
    ),
    originalId,
    "the saved legacy narrative focus must resolve to the migrated participant"
  );
  assert.strictEqual(bundle.narrativesInitial[0].focusEncounterParticipantId, "ep_0");

  const reordered = model.store.getEncounter(encounterId);
  reordered.subjects.unshift(
    model.createEncounterSubject({
      subjectId: "sub_new_first",
      encounterId,
      role: "COLLATERAL",
      encounterRole: "COLLATERAL",
      lastName: "NEW",
      firstName: "FIRST",
      outcome: "RELEASED"
    })
  );
  const reorderSave = model.store.saveEncounter(reordered, { mode: "commit" });
  assert.strictEqual(reorderSave.ok, true, "reordering participants must save");

  bundle = context.COPDoc.encounterNarrative.bundleFromEncounter(encounterId);
  const originalAfterReorder = bundle.participants.find(
    (participant) => participant.encounterParticipantId === originalId
  );
  const newFirst = bundle.participants.find(
    (participant) => participant.encounterParticipantId === "sub_new_first"
  );
  assert.ok(originalAfterReorder, "the migrated participant must survive reorder");
  assert.ok(originalAfterReorder.legacyEncounterParticipantIds.includes("ep_0"));
  assert.ok(
    !newFirst.legacyEncounterParticipantIds.includes("ep_0"),
    "a canonical participant moved into index zero must not inherit the old index alias"
  );
  assert.strictEqual(
    context.COPDoc.encounterNarrative.resolveEncounterParticipantId(
      bundle.participants,
      "ep_0"
    ),
    originalId,
    "reordering must never retarget a saved legacy narrative focus"
  );

  const withoutOriginal = model.store.getEncounter(encounterId);
  withoutOriginal.subjects = withoutOriginal.subjects.filter(
    (participant) => participant.subjectId !== originalId
  );
  const removalSave = model.store.saveEncounter(withoutOriginal, { mode: "commit" });
  assert.strictEqual(removalSave.ok, true, "removing the migrated participant must save");

  bundle = context.COPDoc.encounterNarrative.bundleFromEncounter(encounterId);
  assert.strictEqual(
    context.COPDoc.encounterNarrative.resolveEncounterParticipantId(
      bundle.participants,
      "ep_0"
    ),
    "",
    "removal must orphan the legacy alias instead of transferring it to another participant"
  );
  assert.strictEqual(
    bundle.narrativesInitial.find((row) => row.narrativeId === legacyNarrativeId)
      .focusEncounterParticipantId,
    "ep_0",
    "the unresolved legacy focus must remain visible for review"
  );
}

exerciseCompatibleTiers();
exerciseOverlappingIdentifierConflicts();
exerciseIdentifiersOwnedByAnotherSubject();
exerciseDurableLegacyIndexAlias();

console.log(
  "STAGE2_NARRATIVE_JOIN_INTEGRITY_PASSED compatible joins, contradictory claims, and durable legacy aliases stay isolated."
);
