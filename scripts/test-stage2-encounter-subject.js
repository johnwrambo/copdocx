"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const {
  createMemoryStorage,
  createMinimalDocument,
  quietConsole,
  loadScript,
  loadModelTab,
  run
} = require("./support/copdoc-vm-harness.js");

const WORKSPACE_KEY = "copdocx.store.v1";
const BOOKIN_KEY = "alien-book-in.saved-records.v1";

function requireOk(result, step) {
  assert.ok(result && result.ok, step + ": " + ((result && result.error) || "unknown error"));
  return result;
}

function assertApi(object, names, owner) {
  names.forEach((name) => {
    assert.strictEqual(
      typeof object[name],
      "function",
      owner + "." + name + " must be part of the Stage 2 compatibility boundary"
    );
  });
}

function blankWorkspace(encounters) {
  return {
    schema: "copdocx.store.v1",
    people: {},
    leads: {},
    encounters: encounters || {},
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

function exerciseModelContract() {
  const storage = createMemoryStorage();
  const { model } = loadModelTab(storage, { console: quietConsole() });

  assertApi(
    model,
    [
      "normalizeEncounterSubject",
      "normalizeEncounterSubjects",
      "mergeEncounterSubjects",
      "deterministicEncounterSubjectId",
      "encounterSubjectId",
      "encounterSubjectBookingId",
      "encounterSubjectRole",
      "encounterSubjectOccupantRole",
      "encounterSubjectMatches"
    ],
    "COPDoc.model"
  );

  const fresh = model.createEncounterSubject({
    bookingId: "bk_fresh",
    role: "TARGET",
    occupantRole: "DRIVER"
  });
  assert.match(fresh.subjectId, /^sub_/, "new subjects must receive a permanent ID");
  assert.ok(!/^sub_legacy_/.test(fresh.subjectId), "new subjects must not look migrated");
  assert.strictEqual(fresh.bookingId, "bk_fresh");
  assert.strictEqual(fresh.bookinRecordId, "bk_fresh");
  assert.strictEqual(fresh.role, "TARGET");
  assert.strictEqual(fresh.encounterRole, "TARGET");
  assert.strictEqual(fresh.occupantRole, "DRIVER");
  assert.strictEqual(fresh.vehicleRole, "DRIVER");

  const migratedInput = {
    personId: "person_legacy",
    leadId: "lead_legacy",
    bookinRecordId: "bk_legacy",
    encounterRole: "COLLATERAL",
    vehicleRole: "PASSENGER",
    outcome: "FLED_VEHICLE"
  };
  const deterministicA = model.deterministicEncounterSubjectId(
    "enc_stage2_model",
    migratedInput,
    0
  );
  const deterministicB = model.deterministicEncounterSubjectId(
    "enc_stage2_model",
    JSON.parse(JSON.stringify(migratedInput)),
    0
  );
  assert.strictEqual(deterministicA, deterministicB, "legacy identity must be deterministic");
  assert.match(deterministicA, /^sub_legacy_/);

  const migrated = model.normalizeEncounterSubject(migratedInput, {
    encounterId: "enc_stage2_model",
    index: 0
  });
  assert.strictEqual(migrated.subjectId, deterministicA);
  assert.strictEqual(migrated.encounterId, "enc_stage2_model");
  assert.strictEqual(migrated.bookingId, "bk_legacy");
  assert.strictEqual(migrated.bookinRecordId, "bk_legacy");
  assert.strictEqual(migrated.role, "COLLATERAL");
  assert.strictEqual(migrated.encounterRole, "COLLATERAL");
  assert.strictEqual(migrated.occupantRole, "PASSENGER");
  assert.strictEqual(migrated.vehicleRole, "PASSENGER");
  assert.strictEqual(migrated.outcome, "FLED_VEHICLE", "flight detail must not be collapsed");

  const titleCaseLegacy = model.normalizeEncounterSubject(
    {
      encounterRole: "target",
      vehicleRole: "Driver"
    },
    { encounterId: "enc_stage2_model", index: 2 }
  );
  assert.strictEqual(titleCaseLegacy.role, "TARGET");
  assert.strictEqual(titleCaseLegacy.encounterRole, "TARGET");
  assert.strictEqual(titleCaseLegacy.occupantRole, "DRIVER");
  assert.strictEqual(titleCaseLegacy.vehicleRole, "DRIVER");

  const canonicalEmpty = model.normalizeEncounterSubject(
    {
      bookingId: "",
      bookinRecordId: "bk_stale",
      role: "",
      encounterRole: "TARGET",
      occupantRole: "",
      vehicleRole: "DRIVER"
    },
    { encounterId: "enc_stage2_model", index: 1 }
  );
  assert.strictEqual(canonicalEmpty.bookingId, "", "explicit canonical empty booking wins");
  assert.strictEqual(canonicalEmpty.bookinRecordId, "");
  assert.strictEqual(canonicalEmpty.role, "", "explicit canonical empty role wins");
  assert.strictEqual(canonicalEmpty.encounterRole, "");
  assert.strictEqual(canonicalEmpty.occupantRole, "", "explicit canonical empty occupant role wins");
  assert.strictEqual(canonicalEmpty.vehicleRole, "");

  const collisionRows = model.normalizeEncounterSubjects(
    [{ lastName: "UNKNOWN" }, { lastName: "UNKNOWN" }],
    { encounterId: "enc_stage2_collision" }
  );
  assert.strictEqual(collisionRows.length, 2);
  assert.notStrictEqual(
    collisionRows[0].subjectId,
    collisionRows[1].subjectId,
    "two roster entries must never share a generated identity"
  );

  const previous = model.normalizeEncounterSubject(
    {
      subjectId: "sub_permanent",
      personId: "person_permanent",
      bookingId: "bk_permanent",
      role: "TARGET",
      occupantRole: "DRIVER",
      lastName: "BEFORE",
      notes: "preserve this note",
      releaseReason: "preserve this reason"
    },
    { encounterId: "enc_stage2_merge", index: 0 }
  );
  const merged = model.mergeEncounterSubjects(
    [previous],
    [
      {
        personId: "person_permanent",
        bookinRecordId: "bk_permanent",
        encounterRole: "COLLATERAL",
        firstName: "AFTER"
      }
    ],
    { encounterId: "enc_stage2_merge" }
  );
  assert.strictEqual(merged.length, 1);
  assert.strictEqual(merged[0].subjectId, "sub_permanent", "edits must retain subjectId");
  assert.strictEqual(merged[0].notes, "preserve this note", "edits must not drop hidden fields");
  assert.strictEqual(merged[0].releaseReason, "preserve this reason");
  assert.strictEqual(merged[0].role, "COLLATERAL");
  assert.strictEqual(merged[0].encounterRole, "COLLATERAL");
  assert.strictEqual(merged[0].firstName, "AFTER");

  const explicitDifferentId = model.mergeEncounterSubjects(
    [previous],
    [
      {
        subjectId: "sub_distinct",
        personId: "person_permanent",
        bookingId: "bk_permanent",
        role: "OTHER",
        firstName: "DISTINCT"
      }
    ],
    { encounterId: "enc_stage2_merge" }
  );
  assert.strictEqual(
    explicitDifferentId[0].subjectId,
    "sub_distinct",
    "an explicit different subjectId must not weak-match the prior subject"
  );
  assert.strictEqual(
    explicitDifferentId[0].notes,
    "",
    "a distinct explicit identity must not inherit hidden fields from another subject"
  );

  assert.strictEqual(model.encounterSubjectId(merged[0]), "sub_permanent");
  assert.strictEqual(model.encounterSubjectBookingId(merged[0]), "bk_permanent");
  assert.strictEqual(model.encounterSubjectRole(merged[0]), "COLLATERAL");
  assert.strictEqual(model.encounterSubjectOccupantRole(merged[0]), "DRIVER");
  assert.strictEqual(
    model.encounterSubjectMatches(merged[0], { subjectId: "sub_permanent" }),
    true
  );
  assert.strictEqual(
    model.encounterSubjectMatches(merged[0], { bookingId: "bk_permanent" }),
    true
  );
  assert.strictEqual(
    model.encounterSubjectMatches(merged[0], { subjectId: "sub_other", personId: "person_permanent" }),
    false,
    "a supplied nonmatching subjectId must not fall through to a weaker identity"
  );
}

function exerciseStoreMigrationAndPermanence() {
  const legacyEncounter = {
    schema: "copdocx.encounter.v1",
    entityType: "ENCOUNTER",
    encounterId: "enc_stage2_store",
    startedAt: "2026-09-05T10:00",
    vehicles: [],
    locations: [],
    links: [],
    narratives: [],
    subjects: [
      {
        personId: "person_store",
        leadId: "lead_store",
        bookinRecordId: "bk_store",
        encounterRole: "TARGET",
        vehicleRole: "DRIVER",
        lastName: "STORED",
        notes: "stored hidden note",
        techniques: []
      }
    ],
    meta: {
      createdAt: "2026-09-05T09:00:00.000Z",
      updatedAt: "2026-09-05T09:00:00.000Z",
      markedComplete: false,
      status: "draft",
      committedAt: ""
    }
  };
  const storage = createMemoryStorage({
    [WORKSPACE_KEY]: blankWorkspace({
      enc_stage2_store: legacyEncounter,
      enc_stage2_missing_roster: {
        encounterId: "enc_stage2_missing_roster",
        meta: { status: "draft" }
      },
      enc_stage2_empty_roster: {
        encounterId: "enc_stage2_empty_roster",
        subjects: [],
        meta: { status: "draft" }
      }
    })
  });

  const firstTab = loadModelTab(storage, { console: quietConsole() });
  firstTab.model.store.loadFromDisk();
  const missingRoster = firstTab.model.store.getEncounter("enc_stage2_missing_roster");
  const emptyRoster = firstTab.model.store.getEncounter("enc_stage2_empty_roster");
  assert.strictEqual(
    Object.prototype.hasOwnProperty.call(missingRoster, "subjects"),
    false,
    "load normalization must preserve a genuinely absent legacy roster"
  );
  assert.strictEqual(
    Array.isArray(emptyRoster.subjects),
    true,
    "an explicit empty roster remains authoritative"
  );
  requireOk(
    firstTab.model.store.saveEncounter(missingRoster, { mode: "draft" }),
    "legacy Encounter without roster save"
  );
  assert.strictEqual(
    Array.isArray(firstTab.model.store.getEncounter("enc_stage2_missing_roster").subjects),
    true,
    "a successful Encounter save establishes an explicit roster"
  );
  const first = firstTab.model.store.getEncounter("enc_stage2_store");
  assert.ok(first && first.subjects && first.subjects[0]);
  const migratedId = first.subjects[0].subjectId;
  assert.match(migratedId, /^sub_legacy_/);
  assert.strictEqual(first.subjects[0].encounterId, "enc_stage2_store");
  assert.strictEqual(first.subjects[0].bookingId, "bk_store");
  assert.strictEqual(first.subjects[0].role, "TARGET");
  assert.strictEqual(first.subjects[0].occupantRole, "DRIVER");

  const secondTab = loadModelTab(storage, { console: quietConsole() });
  secondTab.model.store.loadFromDisk();
  assert.strictEqual(
    secondTab.model.store.getEncounter("enc_stage2_store").subjects[0].subjectId,
    migratedId,
    "the same legacy row must get the same identity in every window"
  );

  requireOk(firstTab.model.store.saveEncounter(first, { mode: "draft" }), "migrated Encounter save");
  assert.strictEqual(
    storage.json(WORKSPACE_KEY, {}).encounters.enc_stage2_store.subjects[0].subjectId,
    migratedId,
    "the migrated identity must be persisted on the next Encounter write"
  );

  const editWithoutId = firstTab.model.store.getEncounter("enc_stage2_store");
  editWithoutId.subjects = [
    {
      personId: "person_store",
      leadId: "lead_store",
      bookinRecordId: "bk_store",
      encounterRole: "COLLATERAL",
      firstName: "EDITED"
    }
  ];
  requireOk(
    firstTab.model.store.saveEncounter(editWithoutId, { mode: "draft" }),
    "Encounter subject edit"
  );
  const saved = firstTab.model.store.getEncounter("enc_stage2_store").subjects[0];
  assert.strictEqual(saved.subjectId, migratedId, "an edit payload cannot remint identity");
  assert.strictEqual(saved.encounterId, "enc_stage2_store");
  assert.strictEqual(saved.role, "COLLATERAL");
  assert.strictEqual(saved.encounterRole, "COLLATERAL");
  assert.strictEqual(saved.notes, "stored hidden note", "aggregate merge retains fields not on the form");

  const conflictingEdit = firstTab.model.store.getEncounter("enc_stage2_store");
  conflictingEdit.subjects[0].subjectId = "sub_conflicting_retarget";
  const beforeConflict = storage.raw(WORKSPACE_KEY);
  const conflictResult = firstTab.model.store.saveEncounter(conflictingEdit, { mode: "draft" });
  assert.strictEqual(conflictResult.ok, false, "conflicting explicit subject identity must fail");
  assert.strictEqual(conflictResult.code, "ENCOUNTER_SUBJECT_ID_CONFLICT");
  assert.strictEqual(conflictResult.conflict.matchedBy, "bookingId");
  assert.strictEqual(
    storage.raw(WORKSPACE_KEY),
    beforeConflict,
    "identity conflict rejection must happen before persistence"
  );
  assert.strictEqual(
    firstTab.model.store.getEncounter("enc_stage2_store").subjects[0].subjectId,
    migratedId,
    "identity conflict rejection must leave live state unchanged"
  );

  const arrestInput = firstTab.model.arrestInputFromSubject(
    saved,
    firstTab.model.sharedStopFromEncounter(firstTab.model.store.getEncounter("enc_stage2_store")),
    { bookInDateTime: "2026-09-05T11:00" }
  );
  assert.strictEqual(arrestInput.subjectId, migratedId, "Booking must carry the subject join key");
  assert.strictEqual(arrestInput.bookingId, "bk_store");
  assert.strictEqual(arrestInput.bookinRecordId, "bk_store");
  assert.strictEqual(firstTab.model.createArrest(arrestInput).subjectId, migratedId);

  const arrestJoinPerson = firstTab.model.createPerson({
    personId: "person_arrest_join",
    name: { lastName: "JOIN", firstName: "ARREST" }
  });
  arrestJoinPerson.arrests = [
    firstTab.model.createArrest({
      arrestId: "arr_existing_subject",
      subjectId: "sub_existing_subject",
      bookinRecordId: "bk_arrest_conflict",
      arrestDate: "2026-09-05"
    }),
    firstTab.model.createArrest({
      arrestId: "arr_legacy_blank_subject",
      subjectId: "",
      bookinRecordId: "bk_arrest_legacy",
      arrestDate: "2026-09-05"
    })
  ];
  requireOk(firstTab.model.store.upsertPerson(arrestJoinPerson), "Arrest join Person save");
  requireOk(
    firstTab.model.store.saveEncounter(
      firstTab.model.createEncounterRecord({
        encounterId: "enc_arrest_join",
        subjects: [
          {
            subjectId: "sub_distinct_arrest",
            personId: arrestJoinPerson.personId,
            role: "TARGET"
          }
        ]
      }),
      { mode: "draft" }
    ),
    "Arrest join Encounter save"
  );
  const arrestsBeforeConflict = storage.raw(WORKSPACE_KEY);
  const contradictoryArrest = firstTab.model.store.promoteBookInToLead({
      encounterId: "enc_arrest_join",
      personId: arrestJoinPerson.personId,
      lastName: "JOIN",
      firstName: "ARREST",
      subjectId: "sub_distinct_arrest",
      bookingId: "bk_arrest_conflict",
      bookinRecordId: "bk_arrest_conflict",
      arrestDate: "2026-09-05"
    });
  assert.strictEqual(
    contradictoryArrest.ok,
    false,
    "a booking owned by another explicit Arrest subject must be rejected"
  );
  assert.strictEqual(contradictoryArrest.code, "BOOKIN_ARREST_IDENTITY_CONFLICT");
  assert.strictEqual(
    storage.raw(WORKSPACE_KEY),
    arrestsBeforeConflict,
    "a contradictory Arrest identity must fail before persistence"
  );
  requireOk(
    firstTab.model.store.promoteBookInToLead({
      encounterId: "enc_arrest_join",
      personId: arrestJoinPerson.personId,
      lastName: "JOIN",
      firstName: "ARREST",
      subjectId: "sub_distinct_arrest",
      bookingId: "bk_distinct_arrest",
      bookinRecordId: "bk_distinct_arrest",
      arrestDate: "2026-09-05"
    }),
    "distinct Arrest subject promotion"
  );
  let joinedArrests = firstTab.model.store.getPerson(arrestJoinPerson.personId).arrests;
  assert.strictEqual(joinedArrests.length, 3, "a different explicit subjectId creates a distinct Arrest");
  assert.strictEqual(
    joinedArrests.find(row => row.arrestId === "arr_existing_subject").subjectId,
    "sub_existing_subject",
    "booking fallback must not retarget an Arrest that already has a subjectId"
  );
  assert.ok(joinedArrests.some(row => row.subjectId === "sub_distinct_arrest"));

  requireOk(
    firstTab.model.store.saveEncounter(
      firstTab.model.createEncounterRecord({
        encounterId: "enc_arrest_legacy_upgrade",
        subjects: [
          {
            subjectId: "sub_upgraded_legacy_arrest",
            personId: arrestJoinPerson.personId,
            bookingId: "bk_arrest_legacy",
            role: "TARGET"
          }
        ]
      }),
      { mode: "draft" }
    ),
    "legacy Arrest upgrade Encounter save"
  );
  requireOk(
    firstTab.model.store.promoteBookInToLead({
      encounterId: "enc_arrest_legacy_upgrade",
      personId: arrestJoinPerson.personId,
      lastName: "JOIN",
      firstName: "ARREST",
      subjectId: "sub_upgraded_legacy_arrest",
      bookingId: "bk_arrest_legacy",
      bookinRecordId: "bk_arrest_legacy",
      arrestDate: "2026-09-05"
    }),
    "legacy Arrest subject upgrade"
  );
  joinedArrests = firstTab.model.store.getPerson(arrestJoinPerson.personId).arrests;
  assert.strictEqual(joinedArrests.length, 3, "legacy booking fallback updates instead of duplicating");
  assert.strictEqual(
    joinedArrests.find(row => row.arrestId === "arr_legacy_blank_subject").subjectId,
    "sub_upgraded_legacy_arrest",
    "booking fallback may attach subjectId only to a legacy Arrest that lacks one"
  );
}

function formValue(value, type, checked) {
  return {
    value: value == null ? "" : String(value),
    type: type || "text",
    checked: checked !== false
  };
}

function exerciseNarrativeProjection() {
  const storage = createMemoryStorage();
  const tab = loadModelTab(storage, { console: quietConsole() });
  const { model, context } = tab;

  const targetLead = model.createLeadSnapshot();
  targetLead.person.personId = "person_narrative_target";
  targetLead.subjectPersonId = targetLead.person.personId;
  targetLead.person.name.lastName = "TARGET";
  targetLead.person.name.firstName = "TESS";
  targetLead.person.citizenship = "MX";
  targetLead.person.immigration.alienNumber = "111222333";
  requireOk(model.store.saveLead(targetLead, { mode: "commit" }), "target Case save");

  const releasedLead = model.createLeadSnapshot();
  releasedLead.person.personId = "person_narrative_released";
  releasedLead.subjectPersonId = releasedLead.person.personId;
  releasedLead.person.name.lastName = "RELEASED";
  releasedLead.person.name.firstName = "RILEY";
  requireOk(model.store.saveLead(releasedLead, { mode: "commit" }), "released Case save");

  const encounter = model.createEncounterRecord({
    encounterId: "enc_stage2_narrative",
    startedAt: "2026-09-05T12:30",
    eventType: "VEHICLE_STOP"
  });
  encounter.subjects = [
    model.createEncounterSubject({
      subjectId: "sub_narrative_target",
      encounterId: encounter.encounterId,
      personId: targetLead.person.personId,
      leadId: targetLead.leadId,
      bookingId: "bk_narrative_target",
      legacyEncounterParticipantIds: ["ep_durable_target"],
      role: "TARGET",
      occupantRole: "DRIVER",
      lastName: "TARGET",
      firstName: "TESS",
      outcome: "ARRESTED"
    }),
    model.createEncounterSubject({
      subjectId: "sub_narrative_released",
      encounterId: encounter.encounterId,
      personId: releasedLead.person.personId,
      leadId: releasedLead.leadId,
      role: "COLLATERAL",
      legacyEncounterParticipantIds: ["ep_durable_released"],
      occupantRole: "PASSENGER",
      lastName: "RELEASED",
      firstName: "RILEY",
      outcome: "RELEASED"
    }),
    model.createEncounterSubject({
      subjectId: "sub_narrative_unassigned",
      encounterId: encounter.encounterId,
      lastName: "UNASSIGNED",
      role: "",
      outcome: "UNKNOWN"
    })
  ];
  requireOk(model.store.saveEncounter(encounter, { mode: "commit" }), "Narrative Encounter save");

  storage.setRaw(BOOKIN_KEY, [
    {
      id: "bk_narrative_target",
      subjectId: "sub_narrative_target",
      encounterId: encounter.encounterId,
      personId: targetLead.person.personId,
      leadId: targetLead.leadId,
      encounterRole: "TARGET",
      lastName: "TARGET",
      firstName: "TESS",
      formState: {
        alienNumber: formValue("A999 888 777"),
        officersName: formValue("REYES, MARIA"),
        dateTime: formValue("2026-09-05T12:30")
      }
    },
    {
      id: "bk_narrative_conflicting_subject",
      subjectId: "sub_narrative_someone_else",
      encounterId: encounter.encounterId,
      personId: releasedLead.person.personId,
      leadId: releasedLead.leadId,
      encounterRole: "COLLATERAL",
      lastName: "WRONG",
      firstName: "PACKET",
      formState: {
        alienNumber: formValue("A444 555 666")
      }
    }
  ]);
  context.COUNTRIES = [{ code: "MX", label: "Mexico" }];
  context.IMMIGRATION_DISPOSITIONS = [];
  loadScript(context, "functions/encounter-narrative.js");

  const api = context.COPDoc.encounterNarrative;
  assertApi(
    api,
    [
      "bundleFromEncounter",
      "resolveEncounterParticipantId",
      "remapNarrativeStateParticipantIds"
    ],
    "COPDoc.encounterNarrative"
  );
  const bundle = api.bundleFromEncounter(encounter.encounterId);
  assert.ok(bundle, "saved Encounter must produce a narrative bundle");
  assert.strictEqual(
    bundle.participants.length,
    2,
    "a linked Book-In packet must not suppress an unbooked Encounter subject"
  );
  assert.strictEqual(bundle.unassignedParticipantCount, 1);

  const target = bundle.participants.find(
    (row) => row.encounterParticipantId === "sub_narrative_target"
  );
  const released = bundle.participants.find(
    (row) => row.encounterParticipantId === "sub_narrative_released"
  );
  assert.ok(target && released, "every assigned EncounterSubject must retain its canonical ID");
  assert.strictEqual(target.subjectId, "sub_narrative_target");
  assert.strictEqual(target.personId, targetLead.person.personId);
  assert.strictEqual(target.bookingId, "bk_narrative_target");
  assert.strictEqual(target.bookinRecordId, "bk_narrative_target");
  assert.strictEqual(target.encounterRole, "TARGET");
  assert.strictEqual(target.finalOutcome, "ARRESTED");
  assert.strictEqual(target.identitySnapshot.aNumber, "999888777", "Book-In may enrich identity");
  assert.strictEqual(released.subjectId, "sub_narrative_released");
  assert.strictEqual(released.personId, releasedLead.person.personId);
  assert.strictEqual(released.encounterRole, "COLLATERAL");
  assert.strictEqual(released.finalOutcome, "RELEASED", "Narrative outcome comes from EncounterSubject");
  assert.notStrictEqual(
    released.identitySnapshot.aNumber,
    "444555666",
    "an explicit conflicting subjectId must not enrich through a weaker Person or Lead match"
  );

  assert.ok(Array.isArray(target.legacyEncounterParticipantIds));
  assert.ok(target.legacyEncounterParticipantIds.includes("ep_bk_narrative_target"));
  assert.ok(target.legacyEncounterParticipantIds.includes("ep_durable_target"));
  assert.ok(released.legacyEncounterParticipantIds.includes("ep_durable_released"));
  assert.ok(
    !target.legacyEncounterParticipantIds.includes("ep_0"),
    "mutable array positions must not be invented as participant aliases"
  );
  assert.strictEqual(
    api.resolveEncounterParticipantId(bundle.participants, "ep_bk_narrative_target"),
    "sub_narrative_target",
    "legacy saved focus must resolve to its canonical subject"
  );
  assert.strictEqual(
    api.resolveEncounterParticipantId(bundle.participants, "sub_narrative_released"),
    "sub_narrative_released"
  );
  const ambiguous = [
    { encounterParticipantId: "sub_a", legacyEncounterParticipantIds: ["ep_shared"] },
    { encounterParticipantId: "sub_b", legacyEncounterParticipantIds: ["ep_shared"] }
  ];
  assert.strictEqual(
    api.resolveEncounterParticipantId(ambiguous, "ep_shared"),
    "",
    "ambiguous legacy claims must never select a participant"
  );

  const storedState = {
    schema: "copdoc.narrative-state.v3",
    encounter: {
      focusEncounterParticipantId: "ep_bk_narrative_target",
      tokenBindings: [
        [
          "identity::slot:subject_name",
          {
            mode: "object",
            objectId: "ep_bk_narrative_target",
            fieldKey: "full_name"
          }
        ],
        [
          "custom::slot:note",
          { mode: "custom", customValue: "Keep this text" }
        ]
      ]
    },
    narrative: {
      plainText: "Legacy saved narrative text remains unchanged.",
      plainTextIsManual: true
    }
  };
  const storedStateBefore = JSON.stringify(storedState);
  const resumedState = api.remapNarrativeStateParticipantIds(
    storedState,
    bundle.participants
  );
  assert.notStrictEqual(resumedState, storedState, "resumed state must be detached");
  assert.strictEqual(
    resumedState.encounter.tokenBindings[0][1].objectId,
    "sub_narrative_target",
    "a unique legacy object binding must resolve to the current packet object"
  );
  assert.strictEqual(
    resumedState.encounter.focusEncounterParticipantId,
    "ep_bk_narrative_target",
    "transient binding repair must not rewrite the saved focus ID"
  );
  assert.strictEqual(
    resumedState.narrative.plainText,
    storedState.narrative.plainText,
    "transient binding repair must not rewrite saved narrative text"
  );
  assert.strictEqual(
    JSON.stringify(storedState),
    storedStateBefore,
    "transient binding repair must not mutate the stored state object"
  );

  const ambiguousState = {
    encounter: {
      tokenBindings: {
        legacy: {
          mode: "object",
          objectId: "ep_shared",
          fieldKey: "full_name"
        }
      }
    }
  };
  const unresolvedState = api.remapNarrativeStateParticipantIds(
    ambiguousState,
    ambiguous
  );
  assert.strictEqual(
    unresolvedState.encounter.tokenBindings.legacy.objectId,
    "ep_shared",
    "an ambiguous legacy binding must remain unresolved instead of guessing"
  );
}

function exerciseLegacyBookinOnlyNarrativeProjection() {
  const storage = createMemoryStorage({
    [WORKSPACE_KEY]: blankWorkspace({
      enc_legacy_absent_roster: {
        encounterId: "enc_legacy_absent_roster",
        startedAt: "2026-09-05T16:00",
        meta: { status: "committed" }
      },
      enc_legacy_nonarray_roster: {
        encounterId: "enc_legacy_nonarray_roster",
        startedAt: "2026-09-05T16:05",
        subjects: { legacy: true },
        meta: { status: "committed" }
      },
      enc_explicit_empty_roster: {
        encounterId: "enc_explicit_empty_roster",
        startedAt: "2026-09-05T16:10",
        subjects: [],
        meta: { status: "committed" }
      }
    }),
    [BOOKIN_KEY]: [
      {
        id: "bk_legacy_absent",
        encounterId: "enc_legacy_absent_roster",
        encounterRole: "TARGET",
        lastName: "ABSENT",
        firstName: "ROSTER",
        formState: {}
      },
      {
        id: "bk_legacy_nonarray",
        encounterId: "enc_legacy_nonarray_roster",
        encounterRole: "COLLATERAL",
        lastName: "NONARRAY",
        firstName: "ROSTER",
        formState: {}
      },
      {
        id: "bk_explicit_empty",
        encounterId: "enc_explicit_empty_roster",
        encounterRole: "TARGET",
        lastName: "DO NOT",
        firstName: "RESTORE",
        formState: {}
      }
    ]
  });
  const { context } = loadModelTab(storage, { console: quietConsole() });
  context.COUNTRIES = [];
  context.IMMIGRATION_DISPOSITIONS = [];
  loadScript(context, "functions/encounter-narrative.js");
  const api = context.COPDoc.encounterNarrative;

  const absent = api.bundleFromEncounter("enc_legacy_absent_roster");
  const nonarray = api.bundleFromEncounter("enc_legacy_nonarray_roster");
  const explicitEmpty = api.bundleFromEncounter("enc_explicit_empty_roster");
  assert.strictEqual(absent.participants.length, 1);
  assert.match(absent.participants[0].subjectId, /^sub_legacy_/);
  assert.strictEqual(absent.participants[0].finalOutcome, "ARRESTED");
  assert.strictEqual(nonarray.participants.length, 1);
  assert.strictEqual(nonarray.participants[0].encounterRole, "COLLATERAL");
  assert.strictEqual(
    explicitEmpty.participants.length,
    0,
    "an explicit empty Encounter roster must not be repopulated from Book-In"
  );
}

function completeBookInData() {
  return {
    firstName: "BOOK",
    lastName: "SUBJECT",
    aNumber: "",
    fbiNumber: "",
    iceEvent: "DAL-STAGE2",
    encounterNumber: "enc_stage2_bookin",
    subjectRole: "TARGET",
    vehiclePosition: "driver",
    officersName: "",
    dateTime: "2026-09-05T14:00",
    arrestTime: "14:00",
    foreignWarrants: "no",
    foreignWarrantCountry: "",
    dateOfBirth: "",
    age: "",
    gender: "",
    countryOfCitizenship: "",
    caseType: "",
    team: "",
    cash: "",
    travelDocs: "",
    propertyTag: "",
    cellNum: "",
    children: "",
    medicalIssues: "",
    medicine: ""
  };
}

function loadBookInRuntime(storage) {
  const tab = loadModelTab(storage, {
    console: quietConsole(),
    document: createMinimalDocument("bookin"),
    location: {
      href: "http://copdoc.test/bookin.html?encounterId=enc_stage2_bookin",
      search: "?encounterId=enc_stage2_bookin",
      pathname: "/bookin.html"
    }
  });
  loadScript(tab.context, "functions/book-in.js");
  return tab;
}

function prepareBookInFunctions(context) {
  run(
    context,
    [
      "collectFormData = function () { return " + JSON.stringify(completeBookInData()) + "; };",
      "captureFormState = function () { return {}; };",
      "currentEncounterRole = function () { return 'TARGET'; };",
      "renderSavedRecords = function () {};",
      "rememberFormSignature = function () {};",
      "setStatus = function () {};",
      "COPDoc.model.store.applyEncounterLocationToArrests = function () { return { ok: true }; };",
      "COPDoc.model.store.linkEncounterVehiclesToPerson = function () { return { ok: true }; };",
      "promoteBookInRecord = function () { return {",
      "  ok: true, leadId: 'lead_stage2_bookin', personId: 'person_stage2_bookin',",
      "  arrestId: 'arr_stage2_bookin'",
      "}; };"
    ].join("\n")
  );
}

function exerciseBookInSynchronization() {
  const storage = createMemoryStorage();
  const tab = loadBookInRuntime(storage);
  const { model, context } = tab;
  const bookinPerson = model.createPerson({
    personId: "person_stage2_bookin",
    name: { lastName: "SUBJECT", firstName: "BOOK" }
  });
  requireOk(
    model.store.saveLead(
      model.createLead({
        leadId: "lead_stage2_bookin",
        person: bookinPerson,
        subjectPersonId: bookinPerson.personId
      }),
      { mode: "commit" }
    ),
    "Book-In Case save"
  );
  const encounter = model.createEncounterRecord({
    encounterId: "enc_stage2_bookin",
    startedAt: "2026-09-05T13:30"
  });
  encounter.subjects = [
    model.createEncounterSubject({
      subjectId: "sub_stage2_bookin",
      encounterId: encounter.encounterId,
      personId: "person_stage2_bookin",
      leadId: "lead_stage2_bookin",
      bookingId: "bk_stage2_bookin",
      role: "TARGET",
      occupantRole: "DRIVER",
      lastName: "SUBJECT",
      firstName: "BOOK",
      outcome: "RELEASED",
      custody: "RELEASED"
    })
  ];
  requireOk(model.store.saveEncounter(encounter, { mode: "draft" }), "Book-In Encounter save");
  storage.setRaw(BOOKIN_KEY, [
    {
      id: "bk_stage2_bookin",
      createdAt: "2026-09-05T13:45:00.000Z",
      updatedAt: "2026-09-05T13:45:00.000Z",
      encounterId: encounter.encounterId,
      encounterRole: "TARGET",
      personId: "person_stage2_bookin",
      leadId: "lead_stage2_bookin",
      lastName: "SUBJECT",
      firstName: "BOOK",
      formState: {}
    }
  ]);
  prepareBookInFunctions(context);
  run(context, "activeRecordId = 'bk_stage2_bookin'; pendingLeadId = 'lead_stage2_bookin';");

  assert.strictEqual(run(context, "saveCurrentRecord({ quiet: true, stay: true })"), true);
  model.store.loadFromDisk();
  assert.strictEqual(
    model.store.getEncounter(encounter.encounterId).subjects[0].outcome,
    "RELEASED",
    "quiet autosave must not project or force an arrest"
  );

  assert.strictEqual(run(context, "saveCurrentRecord({ stay: true })"), true);
  model.store.loadFromDisk();
  const after = model.store.getEncounter(encounter.encounterId).subjects[0];
  const packet = storage.json(BOOKIN_KEY, [])[0];
  assert.strictEqual(after.subjectId, "sub_stage2_bookin");
  assert.strictEqual(after.outcome, "ARRESTED", "explicit Book-In save may project custody outcome");
  assert.strictEqual(
    after.occupantRole,
    "DRIVER",
    "Book-In vehicle positions normalize to the canonical uppercase role"
  );
  assert.strictEqual(after.vehicleRole, "DRIVER");
  assert.strictEqual(packet.subjectId, "sub_stage2_bookin", "legacy packet must learn its subject join key");
  assert.strictEqual(packet.encounterId, encounter.encounterId);

  [
    ["person_stage2_preserve", "lead_stage2_preserve"],
    ["person_stage2_ambiguous", "lead_stage2_ambiguous"],
    ["person_stage2_identity_owner", "lead_stage2_identity_owner"]
  ].forEach(([personId, leadId]) => {
    const person = model.createPerson({
      personId,
      name: { lastName: personId.toUpperCase(), firstName: "TEST" }
    });
    requireOk(
      model.store.saveLead(
        model.createLead({ leadId, person, subjectPersonId: personId }),
        { mode: "commit" }
      ),
      `seed ${leadId}`
    );
  });

  const hardenedEncounter = model.store.getEncounter(encounter.encounterId);
  hardenedEncounter.subjects.push(
    model.createEncounterSubject({
      subjectId: "sub_stage2_preserve",
      encounterId: encounter.encounterId,
      personId: "person_stage2_preserve",
      leadId: "lead_stage2_preserve",
      bookingId: "bk_stage2_preserve",
      role: "TARGET",
      occupantRole: "PASSENGER",
      lastName: "PRESERVE",
      firstName: "IDENTITY",
      alienNumber: "123456789",
      packetFiledAt: "2026-09-05T13:40:00.000Z",
      outcome: "RELEASED"
    }),
    model.createEncounterSubject({
      subjectId: "sub_stage2_ambiguous_a",
      encounterId: encounter.encounterId,
      personId: "person_stage2_ambiguous",
      leadId: "lead_stage2_ambiguous",
      role: "TARGET",
      lastName: "AMBIGUOUS A",
      outcome: "RELEASED"
    }),
    model.createEncounterSubject({
      subjectId: "sub_stage2_ambiguous_b",
      encounterId: encounter.encounterId,
      personId: "person_stage2_ambiguous",
      leadId: "lead_stage2_ambiguous",
      role: "COLLATERAL",
      lastName: "AMBIGUOUS B",
      outcome: "RELEASED"
    }),
    model.createEncounterSubject({
      subjectId: "sub_stage2_blank_claim",
      encounterId: encounter.encounterId,
      role: "TARGET",
      lastName: "BLANK CLAIM",
      outcome: "RELEASED"
    }),
    model.createEncounterSubject({
      subjectId: "sub_stage2_identity_owner",
      encounterId: encounter.encounterId,
      personId: "person_stage2_identity_owner",
      leadId: "lead_stage2_identity_owner",
      role: "COLLATERAL",
      lastName: "IDENTITY OWNER",
      outcome: "RELEASED"
    })
  );
  requireOk(
    model.store.saveEncounter(hardenedEncounter, { mode: "draft" }),
    "hardened Book-In Encounter save"
  );
  const hardenedPackets = storage.json(BOOKIN_KEY, []);
  hardenedPackets.push(
    {
      id: "bk_stage2_preserve",
      encounterId: encounter.encounterId,
      encounterRole: "COLLATERAL",
      personId: "",
      leadId: "",
      lastName: "",
      firstName: "",
      aNumber: "",
      vehiclePosition: "Other",
      formState: {}
    },
    {
      id: "bk_stage2_ambiguous",
      encounterId: encounter.encounterId,
      encounterRole: "TARGET",
      personId: "person_stage2_ambiguous",
      leadId: "lead_stage2_ambiguous",
      vehiclePosition: "Other",
      formState: {}
    },
    {
      id: "bk_stage2_passenger",
      encounterId: encounter.encounterId,
      encounterRole: "COLLATERAL",
      vehiclePosition: "Passenger",
      formState: {}
    },
    {
      id: "bk_stage2_cross_owned_identity",
      subjectId: "sub_stage2_blank_claim",
      encounterId: encounter.encounterId,
      encounterRole: "TARGET",
      personId: "person_stage2_identity_owner",
      leadId: "lead_stage2_identity_owner",
      formState: {}
    }
  );
  storage.setRaw(BOOKIN_KEY, hardenedPackets);
  run(context, "syncEncounterSubjects({ encounterId: 'enc_stage2_bookin' })");
  model.store.loadFromDisk();
  const hardenedSubjects = model.store.getEncounter(encounter.encounterId).subjects;
  const preserved = hardenedSubjects.find(row => row.subjectId === "sub_stage2_preserve");
  assert.ok(preserved, "legacy booking fallback must retain the existing subject identity");
  assert.strictEqual(preserved.personId, "person_stage2_preserve");
  assert.strictEqual(preserved.leadId, "lead_stage2_preserve");
  assert.strictEqual(preserved.lastName, "PRESERVE");
  assert.strictEqual(preserved.firstName, "IDENTITY");
  assert.strictEqual(preserved.alienNumber, "123456789");
  assert.strictEqual(preserved.role, "TARGET", "Book-In must not replace Encounter-owned role");
  assert.strictEqual(preserved.encounterRole, "TARGET");
  assert.strictEqual(
    preserved.occupantRole,
    "PASSENGER",
    "Book-In must not replace Encounter-owned occupant role"
  );
  assert.strictEqual(preserved.packetFiledAt, "2026-09-05T13:40:00.000Z");

  const ambiguous = hardenedSubjects.find(
    row => model.encounterSubjectBookingId(row) === "bk_stage2_ambiguous"
  );
  assert.strictEqual(
    ambiguous,
    undefined,
    "an ambiguous legacy Person match stays unresolved instead of creating another association"
  );
  assert.strictEqual(
    hardenedSubjects.find(row => row.subjectId === "sub_stage2_ambiguous_a").bookingId,
    "",
    "ambiguous Person fallback must not attach to the first matching row"
  );
  assert.strictEqual(
    hardenedSubjects.find(row => row.subjectId === "sub_stage2_ambiguous_b").bookingId,
    ""
  );
  assert.strictEqual(
    hardenedSubjects.find(
      row => model.encounterSubjectBookingId(row) === "bk_stage2_passenger"
    ).occupantRole,
    "PASSENGER"
  );
  const blankClaim = hardenedSubjects.find(row => row.subjectId === "sub_stage2_blank_claim");
  assert.strictEqual(blankClaim.personId, "", "cross-owned Person ID must not fill a blank link");
  assert.strictEqual(blankClaim.leadId, "", "cross-owned Lead ID must not fill a blank link");
  assert.strictEqual(
    blankClaim.bookingId,
    "",
    "a cross-owned identity conflict must not attach the Book-In packet"
  );
  const backfilledPackets = storage.json(BOOKIN_KEY, []);
  assert.strictEqual(
    backfilledPackets.find(row => row.id === "bk_stage2_preserve").subjectId,
    "sub_stage2_preserve"
  );
  assert.ok(
    !backfilledPackets.find(row => row.id === "bk_stage2_ambiguous").subjectId,
    "an ambiguous legacy packet must not receive a guessed subjectId"
  );

  backfilledPackets.push({
    id: "bk_stage2_explicit_mismatch",
    subjectId: "sub_stage2_explicit_mismatch",
    encounterId: encounter.encounterId,
    encounterRole: "TARGET",
    personId: "person_stage2_preserve",
    formState: {}
  }, {
    id: "bk_stage2_exact_id_conflict",
    subjectId: "sub_stage2_preserve",
    encounterId: encounter.encounterId,
    encounterRole: "TARGET",
    personId: "person_stage2_someone_else",
    formState: {}
  });
  storage.setRaw(BOOKIN_KEY, backfilledPackets);
  run(
    context,
    "__lastSyncStatus = null; setStatus = function (message, kind) { " +
      "__lastSyncStatus = { message: message, kind: kind }; }; " +
      "syncEncounterSubjects({ encounterId: 'enc_stage2_bookin' });"
  );
  model.store.loadFromDisk();
  const afterMismatch = model.store.getEncounter(encounter.encounterId).subjects;
  assert.ok(
    !afterMismatch.some(row => row.subjectId === "sub_stage2_explicit_mismatch"),
    "an explicit nonmatching subjectId must not fall through to the matching Person"
  );
  assert.strictEqual(
    afterMismatch.find(row => row.subjectId === "sub_stage2_preserve").bookingId,
    "bk_stage2_preserve",
    "an ID or booking conflict must not steal the existing association"
  );
  assert.strictEqual(
    afterMismatch.find(row => row.subjectId === "sub_stage2_preserve").personId,
    "person_stage2_preserve",
    "an exact subjectId must not authorize a conflicting Person replacement"
  );
  assert.strictEqual(run(context, "__lastSyncStatus && __lastSyncStatus.kind"), "warning");

  const normalizedImport = run(
    context,
    "normalizeImportedRecord(" +
      JSON.stringify({
        id: "bk_import_stage2",
        subjectId: "sub_import_stage2",
        encounterId: encounter.encounterId,
        formState: {}
      }) +
      ", 0, new Set())"
  );
  assert.strictEqual(
    normalizedImport.subjectId,
    "sub_import_stage2",
    "Book-In import must preserve the canonical join key"
  );

  const maliciousPackets = storage.json(BOOKIN_KEY, []);
  const stolenPacket = maliciousPackets.find(row => row.id === "bk_stage2_preserve");
  stolenPacket.subjectId = "sub_stage2_ambiguous_a";
  stolenPacket.personId = "person_stage2_ambiguous";
  stolenPacket.leadId = "lead_stage2_ambiguous";
  storage.setRaw(BOOKIN_KEY, maliciousPackets);
  run(
    context,
    "activeRecordId = 'bk_stage2_preserve'; " +
      "__promotionCalls = 0; " +
      "promoteBookInRecord = function () { __promotionCalls += 1; return { ok: true }; };"
  );
  const workspaceBeforeRejectedSave = storage.raw(WORKSPACE_KEY);
  const packetsBeforeRejectedSave = storage.raw(BOOKIN_KEY);
  assert.strictEqual(
    run(context, "saveCurrentRecord({ stay: true })"),
    false,
    "an exact subjectId cannot claim a Book-In ID owned by another subject"
  );
  assert.strictEqual(run(context, "__promotionCalls"), 0, "conflict must stop before promotion");
  assert.strictEqual(
    storage.raw(WORKSPACE_KEY),
    workspaceBeforeRejectedSave,
    "preflight rejection must not mutate Workspace"
  );
  assert.strictEqual(
    storage.raw(BOOKIN_KEY),
    packetsBeforeRejectedSave,
    "preflight rejection must not rewrite Book-In storage"
  );
}

function exerciseOracleJoin() {
  const storage = createMemoryStorage();
  const { model, context } = loadModelTab(storage, { console: quietConsole() });
  loadScript(context, "functions/oracle.js");

  const person = model.createPerson({
    personId: "person_oracle_stage2",
    name: { lastName: "ORACLE", firstName: "JOIN" }
  });
  person.arrests = [
    model.createArrest({
      arrestId: "arr_oracle_stage2",
      subjectId: "sub_oracle_collateral",
      encounterId: "enc_oracle_stage2",
      encounterNumber: "enc_oracle_stage2",
      arrestDate: "2026-09-05",
      subjectRole: "TARGET"
    }),
    model.createArrest({
      arrestId: "arr_oracle_stage2_stale_subject",
      subjectId: "sub_oracle_missing",
      encounterId: "enc_oracle_stage2",
      encounterNumber: "enc_oracle_stage2",
      arrestDate: "2026-09-05",
      subjectRole: "TARGET"
    })
  ];
  const lead = model.createLead({ person: person, subjectPersonId: person.personId });
  lead.meta.status = "committed";
  lead.meta.committedAt = "2026-09-05T15:00:00.000Z";

  const encounter = model.createEncounterRecord({
    encounterId: "enc_oracle_stage2",
    startedAt: "2026-09-05T15:00",
    eventType: "VEHICLE_STOP"
  });
  encounter.subjects = [
    model.createEncounterSubject({
      subjectId: "sub_oracle_target",
      encounterId: encounter.encounterId,
      personId: person.personId,
      role: "TARGET",
      outcome: "ARRESTED"
    }),
    model.createEncounterSubject({
      subjectId: "sub_oracle_collateral",
      encounterId: encounter.encounterId,
      personId: person.personId,
      role: "COLLATERAL",
      outcome: "ARRESTED"
    })
  ];
  encounter.meta.status = "committed";
  encounter.meta.committedAt = "2026-09-05T15:00:00.000Z";

  const summary = context.COPDoc.oracle.summarize({
    leads: [lead],
    encounters: [encounter],
    from: "2026-09-05",
    to: "2026-09-05",
    today: "2026-09-05T18:00:00.000Z",
    catalogs: { countries: [], dispositions: [], encounterTypes: [] }
  });
  assert.strictEqual(summary.arrests, 2);
  assert.strictEqual(
    summary.target,
    1,
    "a stale explicit subjectId must not fall through to a same-Person association"
  );
  assert.strictEqual(summary.collateral, 1, "Oracle joins the arrest by subjectId before personId");
}

function exerciseReportJoinKey() {
  const storage = createMemoryStorage();
  const { model, context } = loadModelTab(storage, { console: quietConsole() });
  context.COUNTRIES = [];
  context.IMMIGRATION_DISPOSITIONS = [];
  loadScript(context, "functions/arrest-report.js");

  const lead = model.createLeadSnapshot();
  lead.meta.status = "committed";
  lead.person.arrests = [
    model.createArrest({
      arrestId: "arr_report_stage2",
      subjectId: "sub_report_stage2",
      encounterId: "enc_report_stage2",
      bookinRecordId: "bk_report_stage2",
      arrestDate: "2026-09-05"
    })
  ];
  const reportStore = {
    loadFromDisk() {},
    listLeads() {
      return [{ leadId: lead.leadId }];
    },
    getLead(leadId) {
      return leadId === lead.leadId ? lead : null;
    },
    bookInPromotionInput(record) {
      return {
        subjectId: record.subjectId || "",
        arrestingOfficer: record.officersName || ""
      };
    }
  };
  const rows = context.COPDoc.arrestReport.collect(reportStore, [], {});
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(
    rows[0].subjectId,
    "sub_report_stage2",
    "report projection must keep the canonical EncounterSubject join key"
  );
  const conflictingRows = context.COPDoc.arrestReport.collect(
    reportStore,
    [
      {
        id: "bk_report_stage2",
        subjectId: "sub_report_someone_else",
        officersName: "WRONG OFFICER"
      }
    ],
    {}
  );
  assert.strictEqual(
    conflictingRows[0].officer,
    "",
    "report joins must not use a weaker booking ID when explicit subject IDs conflict"
  );
}

function exerciseNarrativeExistingSaveContract() {
  const source = fs.readFileSync(
    path.join(__dirname, "..", "functions", "narratives", "narrative-page.js"),
    "utf8"
  );
  assert.match(
    source,
    /if \(existing\) \{\s*var updated = store\.save/,
    "switching subjects or flushing must continue saving an existing narrative"
  );
  assert.doesNotMatch(
    source,
    /if \(existing && options\.createMissing\)/,
    "createMissing gates only creation; it must not disable updates"
  );
}

exerciseModelContract();
exerciseStoreMigrationAndPermanence();
exerciseNarrativeProjection();
exerciseLegacyBookinOnlyNarrativeProjection();
exerciseBookInSynchronization();
exerciseOracleJoin();
exerciseReportJoinKey();
exerciseNarrativeExistingSaveContract();

console.log(
  "STAGE2_ENCOUNTER_SUBJECT_PASSED",
  "model, migration, persistence, narrative, Book-In, Oracle, and report contracts."
);
