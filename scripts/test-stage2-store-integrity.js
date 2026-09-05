"use strict";

const assert = require("assert");
const {
  createMemoryStorage,
  loadModelTab,
  quietConsole
} = require("./support/copdoc-vm-harness.js");

const WORKSPACE_KEY = "copdocx.store.v1";
const STORE_ONLY_SCRIPTS = [
  "functions/model/util.js",
  "functions/model/lead.js",
  "functions/model/person.js",
  "functions/model/location.js",
  "functions/model/vehicle.js",
  "functions/model/link.js",
  "functions/model/store.js"
];

function requireOk(result, step) {
  assert.ok(result && result.ok, step + ": " + ((result && result.error) || "unknown error"));
  return result;
}

function requireConflict(result, reason, step) {
  assert.ok(result && !result.ok, step + " must fail");
  assert.strictEqual(result.code, "ENCOUNTER_SUBJECT_ID_CONFLICT", step + " code");
  if (reason) {
    assert.strictEqual(result.conflict && result.conflict.reason, reason, step + " reason");
  }
  return result;
}

function blankWorkspace(extra) {
  return Object.assign(
    {
      schema: WORKSPACE_KEY,
      people: {},
      leads: {},
      encounters: {},
      investigations: {},
      vehicles: {},
      locations: {},
      businesses: {},
      entities: {},
      associations: {},
      operations: {},
      currentLeadId: ""
    },
    extra || {}
  );
}

function seedRosterReferences(model, subjects) {
  const rows = Array.isArray(subjects) ? subjects : [];
  rows.forEach(subject => {
    const personId = String((subject && subject.personId) || "").trim();
    if (personId && !model.store.getPerson(personId)) {
      requireOk(
        model.store.upsertPerson(
          model.createPerson({
            personId,
            name: { lastName: personId.toUpperCase(), firstName: "TEST" }
          })
        ),
        `seed ${personId}`
      );
    }
  });
  rows.forEach(subject => {
    const leadId = String((subject && subject.leadId) || "").trim();
    if (!leadId || model.store.getLead(leadId)) {
      return;
    }
    const personId =
      String((subject && subject.personId) || "").trim() || `person_for_${leadId}`;
    const person =
      model.store.getPerson(personId) ||
      model.createPerson({
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
}

function draftEncounter(model, encounterId, subjects) {
  seedRosterReferences(model, subjects);
  return model.createEncounterRecord({
    encounterId,
    subjects: subjects || []
  });
}

function exerciseLegacyResolutionGuard() {
  const storage = createMemoryStorage();
  const { model } = loadModelTab(storage, { console: quietConsole() });
  model.store.loadFromDisk();

  const encounter = draftEncounter(model, "enc_legacy_guard", [
    {
      subjectId: "sub_guard_a",
      personId: "person_guard_a",
      leadId: "lead_guard_a",
      bookingId: "booking_guard_a",
      notes: "keep a"
    },
    {
      subjectId: "sub_guard_b",
      personId: "person_guard_b",
      leadId: "lead_guard_b",
      bookingId: "booking_guard_b",
      notes: "keep b"
    },
    {
      subjectId: "sub_guard_blank",
      personId: "",
      leadId: "",
      bookingId: "booking_guard_blank",
      notes: "keep hidden fields"
    }
  ]);
  requireOk(model.store.saveEncounter(encounter, { mode: "draft" }), "seed guarded roster");

  const beforeConflict = storage.raw(WORKSPACE_KEY);
  const conflicting = model.store.getEncounter(encounter.encounterId);
  conflicting.subjects = [
    {
      bookingId: "booking_guard_a",
      personId: "person_guard_b",
      leadId: "lead_guard_a"
    },
    conflicting.subjects[1],
    conflicting.subjects[2]
  ];
  const rejected = requireConflict(
    model.store.saveEncounter(conflicting, { mode: "draft" }),
    "existing-reference-retargeted",
    "ID-less booking match with a conflicting Person"
  );
  assert.strictEqual(rejected.conflict.subjectId, "sub_guard_a");
  assert.strictEqual(rejected.conflict.matchedBy, "personId");
  assert.strictEqual(
    storage.raw(WORKSPACE_KEY),
    beforeConflict,
    "an ID-less identity conflict must be rejected before persistence"
  );

  const fill = model.store.getEncounter(encounter.encounterId);
  seedRosterReferences(model, [
    { personId: "person_guard_fill", leadId: "lead_guard_fill" }
  ]);
  fill.subjects = [
    fill.subjects[0],
    fill.subjects[1],
    {
      bookingId: "booking_guard_blank",
      personId: "person_guard_fill",
      leadId: "lead_guard_fill"
    }
  ];
  const filled = requireOk(
    model.store.saveEncounter(fill, { mode: "draft" }),
    "fill blank legacy subject references"
  ).encounter.subjects[2];
  assert.strictEqual(filled.subjectId, "sub_guard_blank");
  assert.strictEqual(filled.personId, "person_guard_fill");
  assert.strictEqual(filled.leadId, "lead_guard_fill");
  assert.strictEqual(filled.notes, "keep hidden fields");
}

function exerciseStoreFallbackResolutionGuard() {
  const storage = createMemoryStorage();
  const { model } = loadModelTab(storage, {
    console: quietConsole(),
    scripts: STORE_ONLY_SCRIPTS
  });
  model.store.loadFromDisk();
  seedRosterReferences(model, [
    { personId: "person_store_fallback_a" },
    { personId: "person_store_fallback_b" }
  ]);
  requireOk(
    model.store.saveEncounter(
      {
        encounterId: "enc_store_fallback",
        subjects: [
          {
            subjectId: "sub_store_fallback_a",
            bookinRecordId: "booking_store_fallback_a",
            personId: "person_store_fallback_a"
          },
          {
            subjectId: "sub_store_fallback_b",
            bookinRecordId: "booking_store_fallback_b",
            personId: "person_store_fallback_b"
          }
        ]
      },
      { mode: "draft" }
    ),
    "seed store-only compatibility roster"
  );
  const edit = model.store.getEncounter("enc_store_fallback");
  edit.subjects = [
    {
      bookinRecordId: "booking_store_fallback_a",
      personId: "person_store_fallback_b"
    },
    edit.subjects[1]
  ];
  requireConflict(
    model.store.saveEncounter(edit, { mode: "draft" }),
    "existing-reference-retargeted",
    "store-only ID-less compatibility retarget"
  );
}

function exerciseDuplicateOwnershipGuards() {
  const storage = createMemoryStorage();
  const { model } = loadModelTab(storage, { console: quietConsole() });
  model.store.loadFromDisk();

  const duplicateIds = draftEncounter(model, "enc_duplicate_ids", [
    { subjectId: "sub_duplicate", personId: "person_one" },
    { subjectId: "sub_duplicate", personId: "person_two" }
  ]);
  requireConflict(
    model.store.saveEncounter(duplicateIds, { mode: "draft" }),
    "duplicate-incoming-subject-id",
    "duplicate subject IDs in one roster"
  );
  assert.strictEqual(model.store.getEncounter(duplicateIds.encounterId), null);

  const duplicateBookings = draftEncounter(model, "enc_duplicate_bookings", [
    { subjectId: "sub_booking_one", bookingId: "booking_duplicate" },
    { subjectId: "sub_booking_two", bookingId: "booking_duplicate" }
  ]);
  requireConflict(
    model.store.saveEncounter(duplicateBookings, { mode: "draft" }),
    "duplicate-incoming-booking-id",
    "duplicate booking ownership in one roster"
  );
  assert.strictEqual(model.store.getEncounter(duplicateBookings.encounterId), null);

  requireOk(
    model.store.saveEncounter(
      draftEncounter(model, "enc_global_owner", [
        { subjectId: "sub_global_owner", bookingId: "booking_global_owner" }
      ]),
      { mode: "draft" }
    ),
    "seed global subject and booking owner"
  );

  const duplicateGlobalId = draftEncounter(model, "enc_global_id_conflict", [
    { subjectId: "sub_global_owner", bookingId: "booking_other" }
  ]);
  requireConflict(
    model.store.saveEncounter(duplicateGlobalId, { mode: "draft" }),
    "subject-id-owned-by-another-encounter",
    "subject ID owned by another Encounter"
  );

  const duplicateGlobalBooking = draftEncounter(model, "enc_global_booking_conflict", []);
  seedRosterReferences(model, [{ personId: "person_new_legacy" }]);
  duplicateGlobalBooking.subjects = [
    {
      subjectId: "",
      bookingId: "booking_global_owner",
      personId: "person_new_legacy"
    }
  ];
  const bookingConflict = requireConflict(
    model.store.saveEncounter(duplicateGlobalBooking, { mode: "draft" }),
    "booking-id-owned-by-another-encounter",
    "ID-less booking owned by another Encounter"
  );
  assert.match(bookingConflict.conflict.subjectId, /^sub_legacy_/);
  assert.strictEqual(model.store.getEncounter(duplicateGlobalBooking.encounterId), null);

  const duplicateLegacyBookings = draftEncounter(model, "enc_legacy_booking_conflict", []);
  seedRosterReferences(model, [
    { personId: "person_legacy_one" },
    { personId: "person_legacy_two" }
  ]);
  duplicateLegacyBookings.subjects = [
    { bookingId: "booking_legacy_duplicate", personId: "person_legacy_one" },
    { bookingId: "booking_legacy_duplicate", personId: "person_legacy_two" }
  ];
  requireConflict(
    model.store.saveEncounter(duplicateLegacyBookings, { mode: "draft" }),
    "duplicate-incoming-booking-id",
    "duplicate ID-less booking ownership"
  );

  const sharedPerson = draftEncounter(model, "enc_shared_person_roles", [
    {
      subjectId: "sub_shared_person_target",
      personId: "person_shared_roles",
      leadId: "lead_shared_roles",
      role: "TARGET"
    },
    {
      subjectId: "sub_shared_person_collateral",
      personId: "person_shared_roles",
      leadId: "lead_shared_roles",
      role: "COLLATERAL"
    }
  ]);
  requireOk(
    model.store.saveEncounter(sharedPerson, { mode: "draft" }),
    "distinct explicit associations may share a Person and Lead"
  );
}

function exerciseImmutableAndHistoricalOwnership() {
  const storage = createMemoryStorage();
  const { model } = loadModelTab(storage, { console: quietConsole() });
  model.store.loadFromDisk();
  const encounter = draftEncounter(model, "enc_immutable_refs", [
    {
      subjectId: "sub_immutable_refs",
      personId: "person_immutable_refs",
      leadId: "lead_immutable_refs",
      bookingId: "booking_immutable_refs"
    }
  ]);
  requireOk(model.store.saveEncounter(encounter, { mode: "draft" }), "seed immutable refs");

  [
    ["personId", "personId"],
    ["leadId", "leadId"],
    ["bookingId", "bookingId"]
  ].forEach(([field, matchedBy]) => {
    const edit = model.store.getEncounter(encounter.encounterId);
    edit.subjects[0][field] = "";
    if (field === "bookingId") {
      edit.subjects[0].bookinRecordId = "";
    }
    const before = storage.raw(WORKSPACE_KEY);
    const rejected = requireConflict(
      model.store.saveEncounter(edit, { mode: "draft" }),
      "existing-reference-retargeted",
      `clearing established ${field}`
    );
    assert.strictEqual(rejected.conflict.matchedBy, matchedBy);
    assert.strictEqual(storage.raw(WORKSPACE_KEY), before);
  });

  const historicalWorkspace = blankWorkspace({
    people: {
      person_history_original: {
        personId: "person_history_original",
        name: { lastName: "ORIGINAL", firstName: "HISTORY" },
        locations: [],
        arrests: []
      },
      person_history_retarget: {
        personId: "person_history_retarget",
        name: { lastName: "RETARGET", firstName: "HISTORY" },
        locations: [],
        arrests: []
      }
    },
    leads: {
      lead_history_original: {
        leadId: "lead_history_original",
        subjectPersonId: "person_history_original",
        person: {
          personId: "person_history_original",
          name: { lastName: "ORIGINAL", firstName: "HISTORY" },
          locations: [],
          arrests: []
        },
        people: [],
        vehicles: [],
        links: [],
        history: [],
        followUps: [],
        meta: {}
      }
    },
    encounters: {
      enc_history_current: {
        encounterId: "enc_history_current",
        subjects: [],
        completed: {
          encounterId: "enc_history_current",
          subjects: [
            {
              subjectId: "sub_history_current",
              personId: "person_history_original",
              leadId: "lead_history_original",
              bookingId: "booking_history_current"
            }
          ]
        },
        completedHistory: [],
        meta: { status: "draft" }
      },
      enc_history_owner: {
        encounterId: "enc_history_owner",
        subjects: [],
        completedHistory: [
          {
            snapshot: {
              encounterId: "enc_history_owner",
              subjects: [
                {
                  subjectId: "sub_history_global",
                  bookingId: "booking_history_global"
                }
              ]
            }
          }
        ],
        meta: { status: "draft" }
      }
    }
  });
  const historyStorage = createMemoryStorage({
    [WORKSPACE_KEY]: historicalWorkspace
  });
  const historyTab = loadModelTab(historyStorage, { console: quietConsole() });
  historyTab.model.store.loadFromDisk();
  const retarget = historyTab.model.store.getEncounter("enc_history_current");
  retarget.subjects = [
    {
      subjectId: "sub_history_current",
      personId: "person_history_retarget",
      leadId: "",
      bookingId: "booking_history_current"
    }
  ];
  const historicalConflict = requireConflict(
    historyTab.model.store.saveEncounter(retarget, { mode: "draft" }),
    "historical-reference-retargeted",
    "current Encounter historical subject retarget"
  );
  assert.strictEqual(historicalConflict.conflict.historical, true);

  const globalIdReuse = draftEncounter(
    historyTab.model,
    "enc_history_global_reuse",
    [{ subjectId: "sub_history_global", bookingId: "booking_new" }]
  );
  requireConflict(
    historyTab.model.store.saveEncounter(globalIdReuse, { mode: "draft" }),
    "subject-id-owned-by-another-encounter",
    "historical subject ID owned by another Encounter"
  );
  const globalBookingReuse = draftEncounter(
    historyTab.model,
    "enc_history_booking_reuse",
    [{ subjectId: "sub_history_booking_new", bookingId: "booking_history_global" }]
  );
  requireConflict(
    historyTab.model.store.saveEncounter(globalBookingReuse, { mode: "draft" }),
    "booking-id-owned-by-another-encounter",
    "historical booking owned by another Encounter"
  );
}

function exerciseAbsentRosterUpdateCompatibility() {
  const storage = createMemoryStorage({
    [WORKSPACE_KEY]: blankWorkspace({
      encounters: {
        enc_absent_update: {
          encounterId: "enc_absent_update",
          narratives: [],
          meta: { status: "draft" }
        }
      }
    })
  });
  const { model } = loadModelTab(storage, { console: quietConsole() });
  model.store.loadFromDisk();
  requireOk(
    model.store.updateEncounter("enc_absent_update", next => {
      next.narratives = [{ narrativeId: "nar_absent_update" }];
      return next;
    }),
    "metadata update on absent legacy roster"
  );
  const updated = model.store.getEncounter("enc_absent_update");
  assert.strictEqual(
    Object.prototype.hasOwnProperty.call(updated, "subjects"),
    false,
    "updateEncounter must not turn an untouched absent legacy roster into an explicit empty roster"
  );
  requireOk(model.store.saveEncounter(updated, { mode: "draft" }), "explicit legacy Encounter save");
  assert.ok(
    Array.isArray(model.store.getEncounter("enc_absent_update").subjects),
    "an explicit Encounter save establishes an authoritative roster"
  );
}

function exerciseBookInBoundaryGuards() {
  const storage = createMemoryStorage();
  const { model } = loadModelTab(storage, { console: quietConsole() });
  model.store.loadFromDisk();
  const personOne = model.createPerson({
    personId: "person_boundary_one",
    name: { lastName: "ONE", firstName: "PERSON" }
  });
  const personTwo = model.createPerson({
    personId: "person_boundary_two",
    name: { lastName: "TWO", firstName: "PERSON" },
    immigration: { alienNumber: "888777666" }
  });
  const leadOne = model.createLead({
    leadId: "lead_boundary_one",
    person: personOne,
    subjectPersonId: personOne.personId
  });
  const leadTwo = model.createLead({
    leadId: "lead_boundary_two",
    person: personTwo,
    subjectPersonId: personTwo.personId
  });
  requireOk(model.store.saveLead(leadOne, { mode: "commit" }), "seed boundary Person one");
  requireOk(model.store.saveLead(leadTwo, { mode: "commit" }), "seed boundary Person two");
  const beforeEncounterPairMismatch = storage.raw(WORKSPACE_KEY);
  const encounterPairMismatch = model.store.saveEncounter(
    draftEncounter(model, "enc_boundary_pair_mismatch", [
      {
        subjectId: "sub_boundary_pair_mismatch",
        personId: personOne.personId,
        leadId: leadTwo.leadId
      }
    ]),
    { mode: "draft" }
  );
  requireConflict(
    encounterPairMismatch,
    "lead-person-mismatch",
    "Encounter Lead and Person mismatch"
  );
  assert.strictEqual(storage.raw(WORKSPACE_KEY), beforeEncounterPairMismatch);
  requireOk(
    model.store.saveEncounter(
      draftEncounter(model, "enc_boundary_blank", [
        { subjectId: "sub_boundary_blank", role: "TARGET" }
      ]),
      { mode: "draft" }
    ),
    "seed blank boundary subject"
  );
  const beforeLeadMismatch = storage.raw(WORKSPACE_KEY);
  const leadMismatch = model.store.promoteBookInToLead({
    encounterId: "enc_boundary_blank",
    subjectId: "sub_boundary_blank",
    bookingId: "booking_boundary_lead_mismatch",
    personId: personOne.personId,
    leadId: leadTwo.leadId,
    lastName: "ONE",
    firstName: "PERSON",
    arrestDate: "2026-09-05"
  });
  assert.strictEqual(leadMismatch.ok, false);
  assert.strictEqual(leadMismatch.code, "BOOKIN_PERSON_IDENTITY_CONFLICT");
  assert.strictEqual(storage.raw(WORKSPACE_KEY), beforeLeadMismatch);

  requireOk(
    model.store.saveEncounter(
      draftEncounter(model, "enc_boundary_booking_owner", [
        {
          subjectId: "sub_boundary_booking_owner",
          bookingId: "booking_boundary_global"
        }
      ]),
      { mode: "draft" }
    ),
    "seed cross-Encounter booking owner"
  );
  requireOk(
    model.store.saveEncounter(
      draftEncounter(model, "enc_boundary_booking_claim", []),
      { mode: "draft" }
    ),
    "seed cross-Encounter booking claimant"
  );
  const beforeGlobalClaim = storage.raw(WORKSPACE_KEY);
  const globalClaim = model.store.promoteBookInToLead({
    encounterId: "enc_boundary_booking_claim",
    bookingId: "booking_boundary_global",
    lastName: "NEW",
    firstName: "CLAIM",
    arrestDate: "2026-09-05"
  });
  assert.strictEqual(globalClaim.ok, false);
  assert.strictEqual(globalClaim.code, "ENCOUNTER_SUBJECT_ID_CONFLICT");
  assert.strictEqual(storage.raw(WORKSPACE_KEY), beforeGlobalClaim);

  requireOk(
    model.store.saveEncounter(
      draftEncounter(model, "enc_boundary_identity", [
        {
          subjectId: "sub_boundary_identity",
          personId: personOne.personId,
          leadId: leadOne.leadId,
          role: "TARGET"
        }
      ]),
      { mode: "draft" }
    ),
    "seed identity boundary subject"
  );
  const beforeAlienConflict = storage.raw(WORKSPACE_KEY);
  const alienConflict = model.store.promoteBookInToLead({
    encounterId: "enc_boundary_identity",
    subjectId: "sub_boundary_identity",
    bookingId: "booking_boundary_identity",
    personId: personOne.personId,
    alienNumber: "888777666",
    lastName: "ONE",
    firstName: "PERSON",
    arrestDate: "2026-09-05"
  });
  assert.strictEqual(alienConflict.ok, false);
  // Stage 5 rejects this at the shared object identity boundary before Book-In writes.
  assert.strictEqual(alienConflict.code, "OBJECT_IDENTITY_CONFLICT");
  assert.strictEqual(storage.raw(WORKSPACE_KEY), beforeAlienConflict);
}

function exerciseBookInResolutionGuard() {
  const storage = createMemoryStorage();
  const { model } = loadModelTab(storage, { console: quietConsole() });
  model.store.loadFromDisk();

  const ownedPerson = model.createPerson({
    personId: "person_bookin_owned",
    name: { lastName: "OWNED", firstName: "PERSON" },
    immigration: { alienNumber: "999111222" }
  });
  const ownedLead = model.createLead({
    leadId: "lead_bookin_owned",
    person: ownedPerson,
    subjectPersonId: ownedPerson.personId
  });
  requireOk(model.store.saveLead(ownedLead, { mode: "commit" }), "seed owned Book-In Person");

  const encounter = draftEncounter(model, "enc_bookin_resolution", [
    {
      subjectId: "sub_bookin_blank",
      personId: "",
      leadId: "",
      bookingId: ""
    },
    {
      subjectId: "sub_bookin_owner",
      personId: ownedPerson.personId,
      leadId: ownedLead.leadId,
      bookingId: "booking_owned"
    }
  ]);
  requireOk(model.store.saveEncounter(encounter, { mode: "draft" }), "seed Book-In roster");

  const before = storage.raw(WORKSPACE_KEY);
  const result = model.store.promoteBookInToLead({
    encounterId: encounter.encounterId,
    subjectId: "sub_bookin_blank",
    bookingId: "booking_new",
    alienNumber: "999111222",
    lastName: "OWNED",
    firstName: "PERSON",
    arrestDate: "2026-09-05"
  });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.code, "ENCOUNTER_SUBJECT_ID_CONFLICT");
  assert.match(result.error, /conflicts/i);
  assert.strictEqual(
    storage.raw(WORKSPACE_KEY),
    before,
    "resolved Book-In identity conflict must not mutate Workspace"
  );
  assert.strictEqual(model.store.getPerson(ownedPerson.personId).arrests.length, 0);
}

function exerciseReferenceTrimming() {
  const storage = createMemoryStorage();
  const full = loadModelTab(storage, { console: quietConsole() });
  const normalized = full.model.normalizeEncounterSubject(
    {
      subjectId: " sub_trim_full ",
      encounterId: " enc_trim_full ",
      personId: " person_trim_full ",
      leadId: " lead_trim_full ",
      bookingId: " booking_trim_full "
    },
    { encounterId: " enc_trim_full " }
  );
  assert.strictEqual(normalized.subjectId, "sub_trim_full");
  assert.strictEqual(normalized.encounterId, "enc_trim_full");
  assert.strictEqual(normalized.personId, "person_trim_full");
  assert.strictEqual(normalized.leadId, "lead_trim_full");
  assert.strictEqual(normalized.bookingId, "booking_trim_full");

  const fallback = loadModelTab(createMemoryStorage(), {
    console: quietConsole(),
    scripts: STORE_ONLY_SCRIPTS
  });
  const fallbackNormalized = fallback.model.store.normalizeEncounterSubject(
    {
      subjectId: " sub_trim_fallback ",
      encounterId: " enc_trim_fallback ",
      personId: " person_trim_fallback ",
      leadId: " lead_trim_fallback ",
      bookingId: " booking_trim_fallback "
    },
    { encounterId: " enc_trim_fallback " }
  );
  assert.strictEqual(fallbackNormalized.personId, "person_trim_fallback");
  assert.strictEqual(fallbackNormalized.leadId, "lead_trim_fallback");
}

function exerciseArrestBookingDisambiguation() {
  const person = {
    personId: "person_arrest_shared",
    name: { lastName: "SHARED", firstName: "ARREST" },
    locations: [],
    arrests: [
      {
        arrestId: "arrest_booking_a",
        subjectId: "",
        encounterId: "enc_arrest_disambiguation",
        bookinRecordId: "booking_arrest_a",
        latitude: "",
        longitude: "",
        arrestLocation: ""
      },
      {
        arrestId: "arrest_booking_b",
        subjectId: "",
        encounterId: "enc_arrest_disambiguation",
        bookinRecordId: "booking_arrest_b",
        latitude: "",
        longitude: "",
        arrestLocation: ""
      }
    ]
  };
  const workspace = blankWorkspace({
    people: { [person.personId]: person },
    leads: {
      lead_arrest_shared: {
        leadId: "lead_arrest_shared",
        subjectPersonId: person.personId,
        person,
        people: [],
        vehicles: [],
        links: [],
        history: [],
        followUps: [],
        meta: {}
      }
    },
    encounters: {
      enc_arrest_disambiguation: {
        encounterId: "enc_arrest_disambiguation",
        startedAt: "2026-09-05T10:00",
        subjects: [
          {
            subjectId: "sub_arrest_b",
            personId: person.personId,
            leadId: "lead_arrest_shared",
            bookingId: "booking_arrest_b"
          },
          {
            subjectId: "sub_arrest_a",
            personId: person.personId,
            leadId: "lead_arrest_shared",
            bookingId: "booking_arrest_a"
          }
        ],
        locations: [
          {
            locationId: "location_arrest",
            street: "1 MAIN ST",
            city: "DALLAS",
            state: "TX",
            latitude: "32.1",
            longitude: "-96.1"
          }
        ],
        vehicles: [],
        links: [],
        narratives: [],
        meta: { status: "draft" }
      }
    }
  });
  const storage = createMemoryStorage({ [WORKSPACE_KEY]: workspace });
  const { model } = loadModelTab(storage, { console: quietConsole() });
  model.store.loadFromDisk();

  requireOk(
    model.store.applyEncounterLocationToArrests("enc_arrest_disambiguation"),
    "stamp Arrest locations"
  );
  const arrests = model.store.getLead("lead_arrest_shared").person.arrests;
  assert.strictEqual(
    arrests.find(row => row.arrestId === "arrest_booking_a").subjectId,
    "sub_arrest_a"
  );
  assert.strictEqual(
    arrests.find(row => row.arrestId === "arrest_booking_b").subjectId,
    "sub_arrest_b"
  );
}

function exercisePersonEncounterExactFirst() {
  const storage = createMemoryStorage();
  const { model } = loadModelTab(storage, { console: quietConsole() });
  const person = {
    personId: "person_projection",
    encounters: [
      {
        encounterId: "enc_projection",
        subjectId: "",
        encounterDisposition: "LEGACY"
      },
      {
        encounterId: "enc_projection",
        subjectId: "sub_projection_exact",
        encounterDisposition: "OLD"
      }
    ]
  };
  model.upsertPersonLeEncounter(
    person,
    {
      subjectId: "sub_projection_exact",
      personId: person.personId,
      outcome: "UPDATED"
    },
    { encounterId: "enc_projection" }
  );
  assert.strictEqual(person.encounters.length, 2);
  assert.strictEqual(person.encounters[0].subjectId, "");
  assert.strictEqual(person.encounters[0].encounterDisposition, "LEGACY");
  assert.strictEqual(person.encounters[1].subjectId, "sub_projection_exact");
  assert.strictEqual(person.encounters[1].encounterDisposition, "UPDATED");

  const ambiguousLegacy = {
    personId: "person_projection_ambiguous",
    encounters: [
      { encounterId: "enc_projection_ambiguous", subjectId: "" },
      { encounterId: "enc_projection_ambiguous", subjectId: "" }
    ]
  };
  model.upsertPersonLeEncounter(
    ambiguousLegacy,
    {
      subjectId: "sub_projection_new",
      personId: ambiguousLegacy.personId,
      outcome: "ARRESTED"
    },
    { encounterId: "enc_projection_ambiguous" }
  );
  assert.strictEqual(ambiguousLegacy.encounters.length, 3);
  assert.strictEqual(ambiguousLegacy.encounters[0].subjectId, "");
  assert.strictEqual(ambiguousLegacy.encounters[1].subjectId, "");
  assert.strictEqual(ambiguousLegacy.encounters[2].subjectId, "sub_projection_new");
}

function exerciseEncounterWriteBoundary() {
  const storage = createMemoryStorage();
  const { model } = loadModelTab(storage, { console: quietConsole() });
  model.store.loadFromDisk();
  const person = model.createPerson({
    personId: "person_write_boundary",
    name: { lastName: "BOUNDARY", firstName: "WRITE" }
  });
  requireOk(model.store.upsertPerson(person), "seed write-boundary Person");
  const rich = model.createEncounterRecord({
    encounterId: "enc_write_boundary",
    eventType: "INITIAL",
    subjects: [
      {
        subjectId: "sub_write_boundary",
        personId: person.personId,
        role: "TARGET",
        notes: "retain subject facts"
      }
    ],
    narratives: [{ narrativeId: "nar_write_boundary", text: "retain narrative" }]
  });
  requireOk(model.store.saveEncounter(rich, { mode: "draft" }), "seed rich Encounter");
  requireOk(
    model.store.saveEncounter(
      { encounterId: "  enc_write_boundary  ", eventType: "UPDATED" },
      { mode: "draft" }
    ),
    "canonicalized Encounter ID update"
  );
  const merged = model.store.getEncounter("enc_write_boundary");
  assert.strictEqual(merged.eventType, "UPDATED");
  assert.strictEqual(merged.subjects[0].notes, "retain subject facts");
  assert.strictEqual(merged.narratives[0].narrativeId, "nar_write_boundary");
  assert.ok(
    model.store.getEncounter("  enc_write_boundary  "),
    "Encounter reads canonicalize surrounding ID whitespace"
  );
  assert.strictEqual(
    Object.prototype.hasOwnProperty.call(
      storage.json(WORKSPACE_KEY, {}).encounters || {},
      "  enc_write_boundary  "
    ),
    false,
    "persistence must not create a whitespace-keyed duplicate"
  );

  const beforeBlankId = storage.raw(WORKSPACE_KEY);
  const blankId = model.store.saveEncounter(
    { encounterId: "   ", eventType: "SHOULD_NOT_WRITE" },
    { mode: "draft" }
  );
  assert.strictEqual(blankId.ok, false);
  assert.strictEqual(storage.raw(WORKSPACE_KEY), beforeBlankId);

  [null, "bad roster", { subjectId: "not-an-array" }].forEach(value => {
    const before = storage.raw(WORKSPACE_KEY);
    const result = model.store.saveEncounter(
      { encounterId: "enc_write_boundary", subjects: value },
      { mode: "draft" }
    );
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.code, "ENCOUNTER_SUBJECT_ROSTER_INVALID");
    assert.strictEqual(storage.raw(WORKSPACE_KEY), before);
  });
  const beforeMalformedUpdate = storage.raw(WORKSPACE_KEY);
  const malformedUpdate = model.store.updateEncounter(
    " enc_write_boundary ",
    next => {
      next.subjects = null;
      return next;
    }
  );
  assert.strictEqual(malformedUpdate.ok, false);
  assert.strictEqual(malformedUpdate.code, "ENCOUNTER_SUBJECT_ROSTER_INVALID");
  assert.strictEqual(storage.raw(WORKSPACE_KEY), beforeMalformedUpdate);
}

function exerciseDanglingReferenceBoundary() {
  const storage = createMemoryStorage();
  const { model } = loadModelTab(storage, { console: quietConsole() });
  model.store.loadFromDisk();
  const before = storage.raw(WORKSPACE_KEY);
  const danglingPerson = model.store.saveEncounter(
    model.createEncounterRecord({
      encounterId: "enc_dangling_person",
      subjects: [
        { subjectId: "sub_dangling_person", personId: "person_missing" }
      ]
    }),
    { mode: "draft" }
  );
  requireConflict(
    danglingPerson,
    "person-reference-dangling",
    "new dangling Person reference"
  );
  assert.strictEqual(storage.raw(WORKSPACE_KEY), before);

  const danglingLead = model.store.saveEncounter(
    model.createEncounterRecord({
      encounterId: "enc_dangling_lead",
      subjects: [{ subjectId: "sub_dangling_lead", leadId: "lead_missing" }]
    }),
    { mode: "draft" }
  );
  requireConflict(
    danglingLead,
    "lead-reference-dangling",
    "new dangling Lead reference"
  );

  const legacyStorage = createMemoryStorage({
    [WORKSPACE_KEY]: blankWorkspace({
      encounters: {
        enc_legacy_dangling: {
          encounterId: "enc_legacy_dangling",
          subjects: [
            {
              subjectId: "sub_legacy_dangling",
              personId: "person_legacy_missing",
              leadId: "lead_legacy_missing"
            }
          ],
          meta: { status: "draft" }
        }
      }
    })
  });
  const legacy = loadModelTab(legacyStorage, { console: quietConsole() });
  legacy.model.store.loadFromDisk();
  requireOk(
    legacy.model.store.saveEncounter(
      legacy.model.store.getEncounter("enc_legacy_dangling"),
      { mode: "draft" }
    ),
    "unchanged legacy dangling references remain readable and savable"
  );
  const added = legacy.model.store.getEncounter("enc_legacy_dangling");
  added.subjects.push(
    legacy.model.createEncounterSubject({
      encounterId: added.encounterId,
      personId: "person_new_missing"
    })
  );
  requireConflict(
    legacy.model.store.saveEncounter(added, { mode: "draft" }),
    "person-reference-dangling",
    "new dangling reference beside grandfathered legacy data"
  );

  const fallbackStorage = createMemoryStorage();
  const fallback = loadModelTab(fallbackStorage, {
    console: quietConsole(),
    scripts: STORE_ONLY_SCRIPTS
  });
  fallback.model.store.loadFromDisk();
  requireConflict(
    fallback.model.store.saveEncounter(
      {
        encounterId: "enc_store_only_dangling",
        subjects: [
          { subjectId: "sub_store_only_dangling", personId: "person_missing" }
        ]
      },
      { mode: "draft" }
    ),
    "person-reference-dangling",
    "store-only dangling Person reference"
  );
}

function exerciseCompletionLockBoundary() {
  const storage = createMemoryStorage();
  const { model } = loadModelTab(storage, { console: quietConsole() });
  model.store.loadFromDisk();
  const encounter = model.createEncounterRecord({
    encounterId: "enc_completion_lock",
    startedAt: "2026-09-05T14:00",
    eventType: "GOOD",
    subjects: []
  });
  const seeded = requireOk(
    model.store.saveEncounter(encounter, { mode: "draft" }),
    "seed lock Encounter"
  );
  const stale = model.store.getEncounter(encounter.encounterId);
  requireOk(
    model.store.saveEncounter(seeded.encounter, { mode: "complete" }),
    "complete lock Encounter"
  );
  const before = storage.raw(WORKSPACE_KEY);
  stale.eventType = "STALE";
  ["draft", "complete"].forEach(mode => {
    const rejected = model.store.saveEncounter(stale, { mode });
    assert.strictEqual(rejected.ok, false);
    assert.strictEqual(rejected.code, "ENCOUNTER_LOCKED");
    assert.strictEqual(storage.raw(WORKSPACE_KEY), before);
  });
  const updated = model.store.updateEncounter(encounter.encounterId, next => {
    next.eventType = "STALE_UPDATE";
    return next;
  });
  assert.strictEqual(updated.ok, false);
  assert.strictEqual(updated.code, "ENCOUNTER_LOCKED");
  assert.strictEqual(storage.raw(WORKSPACE_KEY), before);
  const preflight = model.store.validateEncounterSubjectRoster({
    encounterId: encounter.encounterId,
    subjects: []
  });
  assert.strictEqual(preflight.ok, false);
  assert.strictEqual(preflight.code, "ENCOUNTER_LOCKED");
  assert.strictEqual(storage.raw(WORKSPACE_KEY), before);
  const promoted = model.store.promoteBookInToLead({
    encounterId: encounter.encounterId,
    lastName: "LOCKED",
    firstName: "BOOKIN",
    bookingId: "booking_locked"
  });
  assert.strictEqual(promoted.ok, false);
  assert.strictEqual(promoted.code, "ENCOUNTER_LOCKED");
  assert.strictEqual(storage.raw(WORKSPACE_KEY), before);
}

function exerciseRemovedSubjectOwnership() {
  const storage = createMemoryStorage();
  const { model } = loadModelTab(storage, { console: quietConsole() });
  model.store.loadFromDisk();
  const person = model.createPerson({
    personId: "person_removed_owner",
    name: { lastName: "PRIVATE", firstName: "DETAILS" },
    immigration: { alienNumber: "123456789" }
  });
  requireOk(model.store.upsertPerson(person), "seed removed-owner Person");
  const encounter = model.createEncounterRecord({
    encounterId: "enc_removed_owner",
    subjects: [
      {
        subjectId: "sub_removed_owner",
        personId: person.personId,
        // Stage 5 retains booked subjects; this removal exercises an unbooked draft.
        bookingId: "",
        lastName: "PRIVATE",
        alienNumber: "123456789",
        notes: "must not remain in tombstone",
        role: "TARGET"
      }
    ]
  });
  requireOk(model.store.saveEncounter(encounter, { mode: "draft" }), "seed removable subject");
  const stale = model.store.getEncounter(encounter.encounterId);
  const removed = model.store.getEncounter(encounter.encounterId);
  removed.subjects = [];
  requireOk(model.store.saveEncounter(removed, { mode: "draft" }), "remove subject");
  const tombstones = model.store.getEncounter(encounter.encounterId).subjectIdentityHistory;
  assert.strictEqual(tombstones.length, 1);
  assert.strictEqual(tombstones[0].subjectId, "sub_removed_owner");
  assert.strictEqual(tombstones[0].bookingId, "");
  assert.strictEqual(tombstones[0].lastName, "");
  assert.strictEqual(tombstones[0].alienNumber, "");
  assert.strictEqual(tombstones[0].notes, "");
  const before = storage.raw(WORKSPACE_KEY);
  const staleWrite = model.store.saveEncounter(stale, { mode: "draft" });
  assert.strictEqual(staleWrite.ok, false);
  assert.strictEqual(staleWrite.code, "ENCOUNTER_STALE_WRITE");
  assert.strictEqual(storage.raw(WORKSPACE_KEY), before);
  const malicious = model.store.getEncounter(encounter.encounterId);
  malicious.subjects.push(stale.subjects[0]);
  const reactivated = model.store.saveEncounter(malicious, { mode: "draft" });
  requireConflict(
    reactivated,
    "removed-subject-reactivated",
    "stale removed subject reactivation"
  );
  assert.strictEqual(storage.raw(WORKSPACE_KEY), before);
  const foreign = model.createEncounterRecord({
    encounterId: "enc_removed_foreign",
    subjects: [
      {
        subjectId: "sub_removed_owner",
        personId: person.personId,
        bookingId: "booking_removed_owner"
      }
    ]
  });
  requireConflict(
    model.store.saveEncounter(foreign, { mode: "draft" }),
    "subject-id-owned-by-another-encounter",
    "removed subject ownership across Encounters"
  );
}

function exerciseBookInIdentityBoundary() {
  const storage = createMemoryStorage();
  const { model } = loadModelTab(storage, { console: quietConsole() });
  model.store.loadFromDisk();
  const missingPerson = model.store.promoteBookInToLead({
    personId: "person_does_not_exist",
    lastName: "MISSING",
    bookingId: "booking_missing_person"
  });
  assert.strictEqual(missingPerson.ok, false);
  assert.strictEqual(missingPerson.code, "BOOKIN_PERSON_IDENTITY_CONFLICT");
  const missingLead = model.store.promoteBookInToLead({
    leadId: "lead_does_not_exist",
    lastName: "MISSING",
    bookingId: "booking_missing_lead"
  });
  assert.strictEqual(missingLead.ok, false);
  assert.strictEqual(missingLead.code, "BOOKIN_PERSON_IDENTITY_CONFLICT");
  const orphan = model.store.promoteBookInToLead({
    subjectId: "sub_orphan",
    lastName: "ORPHAN",
    bookingId: "booking_orphan"
  });
  assert.strictEqual(orphan.ok, false);
  assert.strictEqual(orphan.code, "ENCOUNTER_SUBJECT_ID_CONFLICT");

  const people = ["one", "two"].map(label =>
    model.createPerson({
      personId: `person_global_booking_${label}`,
      name: { lastName: label.toUpperCase(), firstName: "BOOKING" }
    })
  );
  const leads = people.map((person, index) =>
    model.createLead({
      leadId: `lead_global_booking_${index + 1}`,
      person,
      subjectPersonId: person.personId
    })
  );
  leads.forEach((lead, index) =>
    requireOk(model.store.saveLead(lead, { mode: "commit" }), `seed booking owner ${index}`)
  );
  requireOk(
    model.store.promoteBookInToLead({
      personId: people[0].personId,
      leadId: leads[0].leadId,
      lastName: "ONE",
      bookingId: "booking_global_person_owner",
      arrestDate: "2026-09-05"
    }),
    "first Person owns booking"
  );
  const beforeDuplicate = storage.raw(WORKSPACE_KEY);
  const duplicate = model.store.promoteBookInToLead({
    personId: people[1].personId,
    leadId: leads[1].leadId,
    lastName: "TWO",
    bookingId: "booking_global_person_owner",
    arrestDate: "2026-09-05"
  });
  assert.strictEqual(duplicate.ok, false);
  assert.strictEqual(duplicate.code, "BOOKIN_ARREST_IDENTITY_CONFLICT");
  assert.strictEqual(storage.raw(WORKSPACE_KEY), beforeDuplicate);
}

function exerciseEncounterRevisionBoundary() {
  const legacyStorage = createMemoryStorage({
    [WORKSPACE_KEY]: blankWorkspace({
      encounters: {
        enc_revision_legacy: {
          encounterId: "enc_revision_legacy",
          eventType: "LEGACY",
          subjects: []
        }
      }
    })
  });
  const legacyTab = loadModelTab(legacyStorage, { console: quietConsole() });
  legacyTab.model.store.loadFromDisk();
  assert.strictEqual(legacyTab.model.store.diskError(), "");
  const legacy = legacyTab.model.store.getEncounter("enc_revision_legacy");
  legacy.eventType = "MIGRATED";
  const migrated = requireOk(
    legacyTab.model.store.saveEncounter(legacy, { mode: "draft" }),
    "one-time legacy Encounter revision migration"
  );
  assert.strictEqual(migrated.encounter.meta.encounterRevision, 1);

  const storage = createMemoryStorage();
  const seed = loadModelTab(storage, { console: quietConsole() });
  seed.model.store.loadFromDisk();
  assert.strictEqual(seed.model.store.diskError(), "");
  const people = ["a", "b"].map(label =>
    seed.model.createPerson({
      personId: `person_revision_${label}`,
      name: { lastName: label.toUpperCase(), firstName: "REVISION" }
    })
  );
  people.forEach(person =>
    requireOk(seed.model.store.upsertPerson(person), `seed ${person.personId}`)
  );
  const initial = seed.model.createEncounterRecord({
    encounterId: "enc_revision_tabs",
    startedAt: "2026-09-05T10:00",
    subjects: [
      seed.model.encounterSubjectFromPerson(people[0], {
        subjectId: "sub_revision_a",
        encounterRole: "TARGET"
      })
    ]
  });
  requireOk(seed.model.store.saveEncounter(initial, { mode: "draft" }), "seed revision Encounter");

  const tabA = loadModelTab(storage, { console: quietConsole() });
  const tabB = loadModelTab(storage, { console: quietConsole() });
  tabA.model.store.loadFromDisk();
  tabB.model.store.loadFromDisk();
  assert.strictEqual(tabA.model.store.diskError(), "");
  assert.strictEqual(tabB.model.store.diskError(), "");
  const staleA = tabA.model.store.getEncounter(initial.encounterId);
  const freshB = tabB.model.store.getEncounter(initial.encounterId);
  freshB.subjects.push(
    tabB.model.encounterSubjectFromPerson(people[1], {
      subjectId: "sub_revision_b",
      encounterRole: "COLLATERAL"
    })
  );
  requireOk(tabB.model.store.saveEncounter(freshB, { mode: "draft" }), "tab B roster save");
  const beforeStale = storage.raw(WORKSPACE_KEY);
  const rejected = tabA.model.store.saveEncounter(staleA, { mode: "draft" });
  assert.strictEqual(rejected.ok, false);
  assert.strictEqual(rejected.code, "ENCOUNTER_STALE_WRITE");
  assert.strictEqual(storage.raw(WORKSPACE_KEY), beforeStale);
  assert.deepStrictEqual(
    (storage.json(WORKSPACE_KEY, {}).encounters.enc_revision_tabs.subjects || [])
      .map(row => row.subjectId)
      .sort(),
    ["sub_revision_a", "sub_revision_b"]
  );

  const current = tabB.model.store.getEncounter(initial.encounterId);
  const completed = requireOk(
    tabB.model.store.saveEncounter(current, { mode: "complete" }),
    "complete revision Encounter"
  );
  const completedRevision = completed.encounter.meta.encounterRevision;
  requireOk(
    tabB.model.store.unlockEncounter(initial.encounterId, {
      reason: "test revision boundary",
      unlockedByAlias: "TEST"
    }),
    "unlock revision Encounter"
  );
  const unlocked = tabB.model.store.getEncounter(initial.encounterId);
  assert.strictEqual(unlocked.meta.encounterRevision, completedRevision + 1);
  const staleCompleted = completed.encounter;
  staleCompleted.eventType = "STALE_AFTER_UNLOCK";
  const staleUnlockWrite = tabB.model.store.saveEncounter(staleCompleted, {
    mode: "draft"
  });
  assert.strictEqual(staleUnlockWrite.ok, false);
  assert.strictEqual(staleUnlockWrite.code, "ENCOUNTER_STALE_WRITE");
  assert.strictEqual(
    tabB.model.store.getEncounter(initial.encounterId).unlock.reason,
    "test revision boundary"
  );
}

function exerciseBookingUnlinkBoundary() {
  const storage = createMemoryStorage();
  const { model } = loadModelTab(storage, { console: quietConsole() });
  model.store.loadFromDisk();
  assert.strictEqual(model.store.diskError(), "");
  const person = model.createPerson({
    personId: "person_booking_unlink",
    name: { lastName: "UNLINK", firstName: "BOOKING" }
  });
  const lead = model.createLead({
    leadId: "lead_booking_unlink",
    person,
    subjectPersonId: person.personId
  });
  requireOk(model.store.saveLead(lead, { mode: "commit" }), "seed unlink owner");
  const encounter = model.createEncounterRecord({
    encounterId: "enc_booking_unlink",
    startedAt: "2026-09-05T12:00",
    subjects: [
      {
        subjectId: "sub_booking_unlink",
        personId: person.personId,
        leadId: lead.leadId,
        bookingId: "booking_unlink",
        bookinRecordId: "booking_unlink",
        role: "TARGET",
        outcome: "ARRESTED"
      }
    ]
  });
  const seeded = requireOk(
    model.store.saveEncounter(encounter, { mode: "commit" }),
    "seed booking unlink Encounter"
  );
  requireOk(
    model.store.saveEncounter(seeded.encounter, { mode: "complete" }),
    "complete booking unlink Encounter"
  );
  const locked = model.store.unlinkEncounterSubjectBooking(
    encounter.encounterId,
    "sub_booking_unlink",
    "booking_unlink"
  );
  assert.strictEqual(locked.ok, false);
  assert.strictEqual(locked.code, "ENCOUNTER_LOCKED");
  requireOk(
    model.store.unlockEncounter(encounter.encounterId, {
      reason: "remove deleted packet",
      unlockedByAlias: "TEST"
    }),
    "unlock booking Encounter"
  );
  requireOk(
    model.store.unlinkEncounterSubjectBooking(
      encounter.encounterId,
      "sub_booking_unlink",
      "booking_unlink"
    ),
    "exact booking unlink"
  );
  const unlinked = model.store.getEncounter(encounter.encounterId);
  assert.strictEqual(unlinked.subjects[0].bookingId, "");
  assert.strictEqual(unlinked.subjects[0].bookinRecordId, "");
  assert.strictEqual(unlinked.bookingIdentityHistory.length, 1);
  assert.strictEqual(unlinked.bookingIdentityHistory[0].bookingId, "booking_unlink");
  requireOk(
    model.store.saveEncounter(unlinked, { mode: "commit" }),
    "ordinary save after completed-history booking unlink"
  );
  const retired = model.store.promoteBookInToLead({
    encounterId: encounter.encounterId,
    subjectId: "sub_booking_unlink",
    personId: person.personId,
    leadId: lead.leadId,
    bookingId: "booking_unlink",
    lastName: "UNLINK"
  });
  assert.strictEqual(retired.ok, false);
  assert.match(retired.error, /previously unlinked|historical/i);
  requireOk(
    model.store.promoteBookInToLead({
      encounterId: encounter.encounterId,
      subjectId: "sub_booking_unlink",
      personId: person.personId,
      leadId: lead.leadId,
      bookingId: "booking_replacement",
      lastName: "UNLINK"
    }),
    "promote replacement after completed-history booking unlink"
  );
  const replacement = model.store.getEncounter(encounter.encounterId);
  replacement.subjects[0].bookingId = "booking_replacement";
  replacement.subjects[0].bookinRecordId = "booking_replacement";
  requireOk(
    model.store.saveEncounter(replacement, { mode: "commit" }),
    "link fresh replacement after completed-history booking unlink"
  );
  const replaced = model.store.getEncounter(encounter.encounterId);
  assert.strictEqual(replaced.subjects[0].subjectId, "sub_booking_unlink");
  assert.strictEqual(replaced.subjects[0].personId, person.personId);
  assert.strictEqual(replaced.subjects[0].leadId, lead.leadId);
  assert.strictEqual(replaced.subjects[0].bookingId, "booking_replacement");
  assert.strictEqual(replaced.bookingIdentityHistory[0].bookingId, "booking_unlink");
  assert.strictEqual(replaced.completed.subjects[0].bookingId, "booking_unlink");
  requireOk(
    model.store.saveEncounter(replaced, { mode: "commit" }),
    "ordinary save preserves replacement and retired historical booking"
  );
  const retargetedPerson = model.store.getEncounter(encounter.encounterId);
  retargetedPerson.subjects[0].personId = "person_retarget_attempt";
  requireConflict(
    model.store.saveEncounter(retargetedPerson, { mode: "commit" }),
    "existing-reference-retargeted",
    "replacement may not retarget the subject Person"
  );
  const retargetedLead = model.store.getEncounter(encounter.encounterId);
  retargetedLead.subjects[0].leadId = "lead_retarget_attempt";
  requireConflict(
    model.store.saveEncounter(retargetedLead, { mode: "commit" }),
    "existing-reference-retargeted",
    "replacement may not retarget the subject Lead"
  );
  const retiredAfterReplacement = model.store.promoteBookInToLead({
    encounterId: encounter.encounterId,
    subjectId: "sub_booking_unlink",
    personId: person.personId,
    leadId: lead.leadId,
    bookingId: "booking_unlink",
    lastName: "UNLINK"
  });
  assert.strictEqual(retiredAfterReplacement.ok, false);
  assert.match(retiredAfterReplacement.error, /previously unlinked|historical/i);
}

function exerciseCorruptHistoryAndLeadBoundary() {
  const storage = createMemoryStorage({
    [WORKSPACE_KEY]: blankWorkspace({
      encounters: {
        enc_bad_booking_history: {
          encounterId: "enc_bad_booking_history",
          subjects: [],
          bookingIdentityHistory: ["bad"],
          meta: { status: "draft", encounterRevision: 1 }
        }
      }
    })
  });
  const tab = loadModelTab(storage, { console: quietConsole() });
  tab.model.store.loadFromDisk();
  assert.strictEqual(tab.model.store.diskError(), "");
  assert.strictEqual(
    tab.model.store.getEncounter("enc_bad_booking_history").bookingIdentityHistory[0],
    "bad"
  );
  const injected = requireOk(
    tab.model.store.saveEncounter(
      {
        encounterId: "enc_injected_history",
        subjects: [],
        completed: {
          encounterId: "enc_injected_history",
          subjects: [
            { subjectId: "sub_injected_history", bookingId: "booking_injected_history" }
          ]
        },
        completedHistory: [
          {
            snapshot: {
              encounterId: "enc_injected_history",
              subjects: [{ subjectId: "sub_injected_history" }]
            }
          }
        ]
      },
      { mode: "draft" }
    ),
    "ignore caller-supplied completion history"
  );
  assert.strictEqual(injected.encounter.completed, undefined);
  assert.deepStrictEqual(injected.encounter.completedHistory, []);
  requireOk(
    tab.model.store.saveEncounter(
      {
        encounterId: "enc_after_injected_history",
        subjects: [{ subjectId: "sub_injected_history" }]
      },
      { mode: "draft" }
    ),
    "ignored history must not reserve subject ownership"
  );

  const mismatchStorage = createMemoryStorage({
    [WORKSPACE_KEY]: blankWorkspace({
      encounters: {
        encounter_map_key: {
          encounterId: "encounter_payload_id",
          subjects: []
        }
      }
    })
  });
  const mismatch = loadModelTab(mismatchStorage, { console: quietConsole() });
  const beforeMismatch = mismatchStorage.raw(WORKSPACE_KEY);
  mismatch.model.store.loadFromDisk();
  assert.match(
    mismatch.model.store.diskError(),
    /disagrees with payload identifier/i
  );
  assert.strictEqual(mismatchStorage.raw(WORKSPACE_KEY), beforeMismatch);

  const collisionStorage = createMemoryStorage({
    [WORKSPACE_KEY]: blankWorkspace({
      encounters: {
        enc_collision: { encounterId: "enc_collision", subjects: [] },
        " enc_collision ": { encounterId: "enc_collision", subjects: [] }
      }
    })
  });
  const collision = loadModelTab(collisionStorage, { console: quietConsole() });
  collision.model.store.loadFromDisk();
  assert.match(collision.model.store.diskError(), /duplicate canonical identifier/i);

  const leadStorage = createMemoryStorage();
  const live = loadModelTab(leadStorage, { console: quietConsole() });
  live.model.store.loadFromDisk();
  assert.strictEqual(live.model.store.diskError(), "");
  const owner = live.model.createPerson({
    personId: "person_valid_lead_owner",
    name: { lastName: "OWNER", firstName: "VALID" }
  });
  const validLead = live.model.createLead({
    leadId: "lead_valid_owner",
    person: owner,
    subjectPersonId: owner.personId
  });
  requireOk(live.model.store.saveLead(validLead, { mode: "commit" }), "seed valid Lead");
  requireConflict(
    live.model.store.saveEncounter(
      live.model.createEncounterRecord({
        encounterId: "enc_new_lead_only",
        subjects: [
          { subjectId: "sub_new_lead_only", leadId: validLead.leadId }
        ]
      }),
      { mode: "draft" }
    ),
    "lead-person-missing",
    "new Lead-only Encounter subject"
  );

  const disk = leadStorage.json(WORKSPACE_KEY, blankWorkspace());
  const invalidPerson = live.model.createPerson({
    personId: "person_invalid_lead_projection",
    name: { lastName: "INVALID", firstName: "LEAD" },
    arrests: [
      {
        arrestId: "arrest_invalid_lead_projection",
        bookingId: "booking_invalid_lead_projection",
        bookinRecordId: "booking_invalid_lead_projection"
      }
    ]
  });
  disk.people[invalidPerson.personId] = Object.assign({}, invalidPerson, {
    arrests: []
  });
  disk.leads.lead_invalid_map_key = {
    leadId: "lead_invalid_payload_id",
    subjectPersonId: invalidPerson.personId,
    person: invalidPerson,
    meta: { status: "committed" }
  };
  leadStorage.setRaw(WORKSPACE_KEY, disk);
  live.model.store.loadFromDisk();
  assert.strictEqual(live.model.store.diskError(), "");
  const beforeClaim = leadStorage.raw(WORKSPACE_KEY);
  const invalidClaim = live.model.store.promoteBookInToLead({
    personId: owner.personId,
    leadId: validLead.leadId,
    bookingId: "booking_invalid_lead_projection",
    lastName: "OWNER",
    arrestDate: "2026-09-05"
  });
  assert.strictEqual(invalidClaim.ok, false);
  assert.strictEqual(invalidClaim.code, "BOOKIN_ARREST_IDENTITY_CONFLICT");
  assert.match(invalidClaim.error, /invalid Person owner/i);
  assert.strictEqual(leadStorage.raw(WORKSPACE_KEY), beforeClaim);
}

function exerciseImportedArrestProjectionBoundary() {
  const storage = createMemoryStorage();
  const { model } = loadModelTab(storage, { console: quietConsole() });
  model.store.loadFromDisk();
  const person = model.createPerson({
    personId: "person_import_projection",
    name: { lastName: "PROJECTION", firstName: "IMPORT" }
  });
  const lead = model.createLead({
    leadId: "lead_import_projection",
    person,
    subjectPersonId: person.personId
  });
  requireOk(model.store.saveLead(lead, { mode: "commit" }), "seed import projection Lead");
  const encounter = model.createEncounterRecord({
    encounterId: "enc_import_projection",
    startedAt: "2026-09-05T09:00",
    subjects: [
      {
        subjectId: "sub_import_projection",
        personId: person.personId,
        leadId: lead.leadId,
        bookingId: "booking_import_projection",
        bookinRecordId: "booking_import_projection",
        role: "TARGET",
        occupantRole: "DRIVER",
        outcome: "ARRESTED"
      }
    ]
  });
  requireOk(model.store.saveEncounter(encounter, { mode: "commit" }), "seed import projection Encounter");
  requireOk(
    model.store.promoteBookInToLead({
      encounterId: encounter.encounterId,
      subjectId: "sub_import_projection",
      personId: person.personId,
      leadId: lead.leadId,
      bookingId: "booking_import_projection",
      lastName: "PROJECTION",
      arrestDate: "2026-09-05",
      arrestTime: "09:15",
      arrestDateTime: "2026-09-05T09:15",
      bookInDateTime: "2026-09-05T10:00",
      arrestingOfficer: "OFFICER ONE",
      team: "TEAM ONE",
      iceEventNumber: "ICE-ONE",
      encounterNumber: "ENC-ONE",
      subjectRole: "TARGET",
      vehiclePosition: "DRIVER"
    }),
    "seed canonical import Arrest"
  );
  const imported = model.store.promoteBookInRecords(
    [
      {
        id: "booking_import_projection",
        encounterId: encounter.encounterId,
        subjectId: "sub_import_projection",
        personId: person.personId,
        leadId: lead.leadId,
        lastName: "PROJECTION",
        subjectRole: "COLLATERAL",
        encounterRole: "COLLATERAL",
        vehiclePosition: "PASSENGER",
        formState: {},
        __copdocImportArrestFieldPresence: {
          arrestDate: false,
          arrestTime: false,
          arrestDateTime: false,
          arrestingOfficer: false,
          team: false,
          iceEventNumber: false,
          encounterNumber: false,
          encounterId: true,
          subjectRole: true,
          vehiclePosition: true,
          bookInDateTime: false,
          booking: false
        }
      }
    ],
    { preserveMissingArrestFields: true }
  );
  assert.strictEqual(imported.ok, true);
  assert.strictEqual(imported.rows[0].subjectRole, "TARGET");
  assert.strictEqual(imported.rows[0].encounterRole, "TARGET");
  // Book-In/Arrest retain the existing select values; the Encounter association
  // owns the uppercase code. Importing a conflicting packet must preserve both.
  assert.strictEqual(imported.rows[0].vehiclePosition, "Driver");
  assert.strictEqual(
    model.store.getEncounter(encounter.encounterId).subjects[0].occupantRole,
    "DRIVER"
  );
  assert.strictEqual(
    Object.prototype.hasOwnProperty.call(
      imported.rows[0],
      "__copdocImportArrestFieldPresence"
    ),
    false
  );
  const arrest = model.store
    .getPerson(person.personId)
    .arrests.find(row => row.bookingId === "booking_import_projection");
  assert.strictEqual(arrest.arrestDate, "2026-09-05");
  assert.strictEqual(arrest.arrestTime, "09:15");
  assert.strictEqual(arrest.arrestingOfficer, "OFFICER ONE");
  assert.strictEqual(arrest.team, "TEAM ONE");
  assert.strictEqual(arrest.iceEventNumber, "ICE-ONE");
  assert.strictEqual(arrest.encounterNumber, "ENC-ONE");
  assert.strictEqual(arrest.subjectRole, "TARGET");
  assert.strictEqual(arrest.vehiclePosition, "Driver");
}

exerciseLegacyResolutionGuard();
exerciseStoreFallbackResolutionGuard();
exerciseDuplicateOwnershipGuards();
exerciseImmutableAndHistoricalOwnership();
exerciseAbsentRosterUpdateCompatibility();
exerciseBookInBoundaryGuards();
exerciseBookInResolutionGuard();
exerciseArrestBookingDisambiguation();
exercisePersonEncounterExactFirst();
exerciseReferenceTrimming();
exerciseEncounterWriteBoundary();
exerciseDanglingReferenceBoundary();
exerciseCompletionLockBoundary();
exerciseRemovedSubjectOwnership();
exerciseBookInIdentityBoundary();
exerciseEncounterRevisionBoundary();
exerciseBookingUnlinkBoundary();
exerciseCorruptHistoryAndLeadBoundary();
exerciseImportedArrestProjectionBoundary();

console.log(
  "STAGE2_STORE_INTEGRITY_PASSED legacy resolution, ownership conflicts, Book-In, Arrest, and Person projection guards."
);
