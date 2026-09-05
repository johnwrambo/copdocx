"use strict";

const assert = require("assert");
const {
  createMemoryStorage,
  createMinimalDocument,
  createTab,
  loadScript,
  loadModelTab,
  quietConsole
} = require("./support/copdoc-vm-harness.js");

const STORE_KEY = "copdocx.store.v1";
const BOOKIN_KEY = "alien-book-in.saved-records.v1";

function workspace(encounters) {
  return {
    schema: "copdocx.store.v1",
    currentLeadId: "",
    people: {},
    leads: {},
    encounters: encounters || {},
    investigations: {},
    vehicles: {},
    locations: {},
    businesses: {},
    entities: {},
    associations: {},
    operations: {}
  };
}

function runtime(initial, promoter) {
  const storage = createMemoryStorage(initial);
  const context = createTab(storage, {
    console: { log() {}, info() {}, warn() {}, error() {} },
    document: createMinimalDocument("home")
  });
  loadScript(context, "functions/transfer.js");
  if (promoter) {
    context.COPDoc.model = {
      store: {
        loadFromDisk() {},
        promoteBookInRecords: promoter
      }
    };
  }
  return { storage, context, transfer: context.COPDoc.transfer };
}

function bundle(values) {
  return Object.assign(
    {
      format: "copdocx.transfer.v1",
      leads: [],
      officers: [],
      vehicles: [],
      shifts: [],
      bookin: [],
      encounters: [],
      investigations: [],
      operations: []
    },
    values || {}
  );
}

function committedEncounter(id, subjects) {
  return {
    encounterId: id,
    subjects: subjects || [],
    meta: {
      status: "committed",
      updatedAt: "2026-09-04T12:00:00.000Z",
      committedAt: "2026-09-04T12:00:00.000Z"
    }
  };
}

function formState(values) {
  const state = {};
  Object.keys(values || {}).forEach((id) => {
    state[id] = {
      type: id.indexOf("Role") !== -1 ? "radio" : "text",
      value: String(values[id] == null ? "" : values[id]),
      checked: values[id] === true
    };
  });
  return state;
}

function encounterAndBookInIdsAreCanonicalAndCollisionSafe() {
  const initialStore = workspace({
    existing: committedEncounter("existing")
  });
  const { storage, transfer } = runtime({
    [STORE_KEY]: initialStore,
    [BOOKIN_KEY]: []
  });
  const before = storage.dump();
  const duplicateEncounter = transfer.applyImport(
    bundle({
      encounters: [
        committedEncounter("dup"),
        committedEncounter(" dup ")
      ]
    }),
    ["encounters"]
  );
  assert.match(duplicateEncounter.error, /duplicate canonical encounterId/i);
  assert.deepStrictEqual(storage.dump(), before, "Encounter collision must fail before writes");

  const duplicateBookIn = transfer.applyImport(
    bundle({
      encounters: [committedEncounter("not_written")],
      bookin: [
        { id: "booking", formState: {} },
        { id: " booking ", formState: {} }
      ]
    }),
    ["encounters", "bookin"]
  );
  assert.match(duplicateBookIn.error, /duplicate canonical Book-In record ID/i);
  assert.deepStrictEqual(storage.dump(), before, "Book-In collision must fail before any workspace write");

  storage.setRaw(STORE_KEY, {
    ...initialStore,
    encounters: {
      canonical: committedEncounter("canonical"),
      " canonical ": committedEncounter(" canonical ")
    }
  });
  const damagedBefore = storage.raw(STORE_KEY);
  const damaged = transfer.applyImport(
    bundle({ encounters: [committedEncounter("new_encounter")] }),
    ["encounters"]
  );
  assert.match(damaged.error, /duplicate canonical encounterId/i);
  assert.strictEqual(storage.raw(STORE_KEY), damagedBefore);
}

function allTypeImportDefersPromotionAndUsesEncounterRoles() {
  let promotionCall = null;
  let storage;
  const promoter = (rows, options) => {
    const saved = storage.json(STORE_KEY);
    assert.ok(saved.encounters.enc_ordered, "Encounter must be durable before Book-In promotion");
    promotionCall = {
      rows: JSON.parse(JSON.stringify(rows)),
      options: Object.assign({}, options)
    };
    return {
      ok: true,
      rows: rows.map((row) =>
        Object.assign({}, row, {
          leadId: "lead_exact",
          personId: "person_exact",
          arrestId: "arrest_exact"
        })
      ),
      promoted: rows.length,
      created: rows.length,
      reused: 0,
      failed: 0,
      errors: []
    };
  };
  const loaded = runtime(
    { [STORE_KEY]: workspace(), [BOOKIN_KEY]: [] },
    promoter
  );
  storage = loaded.storage;
  const result = loaded.transfer.applyImport(
    bundle({
      bookin: [
        {
          id: " booking_ordered ",
          bookingId: "booking_ordered",
          bookinRecordId: " booking_ordered ",
          encounterId: " enc_ordered ",
          subjectId: " subject_exact ",
          personId: " person_exact ",
          leadId: " lead_exact ",
          subjectRole: "COLLATERAL",
          encounterRole: "COLLATERAL",
          vehiclePosition: "PASSENGER",
          firstName: "Ada",
          lastName: "Exact",
          formState: {
            encounterRoleTarget: { type: "radio", value: "TARGET", checked: false },
            encounterRoleCollateral: { type: "radio", value: "COLLATERAL", checked: true },
            vehiclePosition: { type: "select-one", value: "PASSENGER", checked: false }
          }
        }
      ],
      encounters: [
        committedEncounter(" enc_ordered ", [
          {
            subjectId: "subject_exact",
            encounterId: "enc_ordered",
            personId: "person_exact",
            leadId: "lead_exact",
            role: "TARGET",
            occupantRole: "DRIVER"
          }
        ])
      ]
    }),
    ["bookin", "encounters"]
  );

  assert.strictEqual(result.error, "");
  assert.strictEqual(result.bookinPromotionAttempted, true);
  assert.strictEqual(promotionCall.options.preserveMissingArrestFields, true);
  assert.strictEqual(promotionCall.rows.length, 1);
  const promoted = promotionCall.rows[0];
  assert.strictEqual(promoted.id, "booking_ordered");
  assert.strictEqual(promoted.bookingId, "booking_ordered");
  assert.strictEqual(promoted.bookinRecordId, "booking_ordered");
  assert.strictEqual(promoted.encounterId, "enc_ordered");
  assert.strictEqual(promoted.subjectId, "subject_exact");
  assert.strictEqual(promoted.subjectRole, "TARGET");
  assert.strictEqual(promoted.encounterRole, "TARGET");
  assert.strictEqual(promoted.vehiclePosition, "Driver");
  assert.strictEqual(promoted.formState.encounterRoleTarget.checked, true);
  assert.strictEqual(promoted.formState.encounterRoleCollateral.checked, false);
  assert.strictEqual(promoted.formState.vehiclePosition.value, "Driver");
  assert.strictEqual(promoted.__copdocImportArrestFieldPresence.subjectRole, true);
  assert.strictEqual(promoted.__copdocImportArrestFieldPresence.vehiclePosition, true);
  assert.strictEqual(promoted.__copdocImportArrestFieldPresence.team, false);

  const packet = storage.json(BOOKIN_KEY)[0];
  assert.strictEqual(packet.subjectRole, "TARGET");
  assert.strictEqual(packet.vehiclePosition, "Driver");
  assert.ok(!Object.prototype.hasOwnProperty.call(packet, "__copdocImportArrestFieldPresence"));
  assert.ok(storage.json(STORE_KEY).encounters.enc_ordered);
  assert.ok(!storage.json(STORE_KEY).encounters[" enc_ordered "]);
}

function failedImportsDetachNewAndRestoreExisting() {
  const existing = {
    id: "existing_booking",
    subjectId: "subject_existing",
    encounterId: "enc_failure",
    personId: "person_existing",
    leadId: "lead_existing",
    arrestId: "arrest_existing",
    subjectRole: "TARGET",
    encounterRole: "TARGET",
    vehiclePosition: "DRIVER",
    lastName: "ORIGINAL",
    updatedAt: "2026-09-01T00:00:00.000Z",
    encounterProjectionFiledAt: "202 Nantucket",
    formState: { lastName: { type: "text", value: "ORIGINAL", checked: false } }
  };
  const untouched = {
    id: "untouched",
    lastName: "LOCAL",
    updatedAt: "2026-09-02T00:00:00.000Z",
    formState: {}
  };
  let calledIds = [];
  const { storage, transfer } = runtime(
    {
      [STORE_KEY]: workspace({
        enc_failure: committedEncounter("enc_failure", [
          {
            subjectId: "subject_existing",
            personId: "person_existing",
            leadId: "lead_existing",
            role: "TARGET",
            occupantRole: "DRIVER",
            bookingId: "existing_booking",
            bookinRecordId: "existing_booking"
          },
          {
            subjectId: "subject_new",
            personId: "person_new",
            leadId: "lead_new",
            role: "COLLATERAL",
            occupantRole: "PASSENGER"
          }
        ])
      }),
      [BOOKIN_KEY]: [existing, untouched]
    },
    (rows) => {
      calledIds = rows.map((row) => row.id);
      return {
        ok: false,
        rows,
        promoted: 0,
        created: 0,
        reused: 0,
        failed: rows.length,
        errors: rows.map((row) => ({ recordId: row.id, error: "injected failure" }))
      };
    }
  );
  const existingJson = JSON.stringify(existing);
  const untouchedJson = JSON.stringify(untouched);
  const result = transfer.applyImport(
    bundle({
      bookin: [
        {
          id: "existing_booking",
          encounterId: " enc_failure ",
          subjectId: " subject_existing ",
          personId: " ",
          leadId: " ",
          arrestId: " ",
          subjectRole: "COLLATERAL",
          vehiclePosition: "OTHER",
          lastName: "IMPORTED",
          updatedAt: "2026-09-05T00:00:00.000Z",
          formState: {}
        },
        {
          id: " new_booking ",
          encounterId: "enc_failure",
          subjectId: "subject_new",
          personId: "person_new",
          leadId: "lead_new",
          subjectRole: "TARGET",
          updatedAt: "2026-09-05T00:00:00.000Z",
          formState: {}
        }
      ]
    }),
    ["bookin"]
  );
  assert.deepStrictEqual(calledIds.sort(), ["existing_booking", "new_booking"]);
  assert.strictEqual(result.casePromotionFailed, 2);
  assert.match(result.error, /could not be linked/i);
  const rows = storage.json(BOOKIN_KEY);
  const restored = rows.find((row) => row.id === "existing_booking");
  const stillUntouched = rows.find((row) => row.id === "untouched");
  const detached = rows.find((row) => row.id === "new_booking");
  assert.strictEqual(JSON.stringify(restored), existingJson, "failed update restores exact local row");
  assert.strictEqual(JSON.stringify(stillUntouched), untouchedJson, "unimported local row stays byte-for-byte");
  assert.strictEqual(detached.encounterProjectionDraft, true);
  assert.strictEqual(detached.subjectId, "");
  assert.strictEqual(detached.personId, "");
  assert.strictEqual(detached.leadId, "");
  assert.strictEqual(detached.arrestId, "");
  assert.ok(!Object.prototype.hasOwnProperty.call(detached, "bookingId"));
  assert.ok(!Object.prototype.hasOwnProperty.call(detached, "bookinRecordId"));
  assert.ok(!Object.prototype.hasOwnProperty.call(detached, "__copdocImportArrestFieldPresence"));
}

function legacyFormStateIsSynthesizedAndLazyPromotionCannotWipe() {
  const original = {
    id: "local_only",
    lastName: "LOCAL",
    formState: { lastName: { type: "text", value: "LOCAL", checked: false } }
  };
  const { storage, transfer } = runtime({
    [STORE_KEY]: workspace(),
    [BOOKIN_KEY]: [original]
  });
  const before = storage.raw(BOOKIN_KEY);
  const result = transfer.applyImport(
    bundle({
      bookin: [
        {
          id: " legacy_flat ",
          firstName: "LEGACY",
          lastName: "VISIBLE"
        }
      ]
    }),
    ["bookin"]
  );
  assert.ok(result.pendingBookInImport, "eligible import waits for the lazy canonical model");
  assert.strictEqual(storage.raw(BOOKIN_KEY), before, "deferred promotion never clears or partially writes Book-In storage");
  const pending = result.pendingBookInImport.rows.find((row) => row.id === "legacy_flat");
  assert.ok(pending.formState && !Array.isArray(pending.formState));
  assert.strictEqual(pending.formState.firstName.value, "LEGACY");
  assert.strictEqual(pending.formState.lastName.value, "VISIBLE");
}

function encounterRosterInvariantsArePreflighted() {
  const base = committedEncounter("enc_owner", [
    {
      subjectId: "subject_owned",
      encounterId: "enc_owner",
      personId: "person_owned",
      leadId: "lead_owned",
      bookingId: "booking_owned",
      bookinRecordId: "booking_owned",
      role: "TARGET"
    }
  ]);
  base.meta.encounterRevision = 4;

  function rejected(encounters, incoming, pattern) {
    const { storage, transfer } = runtime({
      [STORE_KEY]: workspace(encounters),
      [BOOKIN_KEY]: []
    });
    const before = storage.raw(STORE_KEY);
    const result = transfer.applyImport(
      bundle({ encounters: incoming }),
      ["encounters"]
    );
    assert.match(result.error, pattern);
    assert.strictEqual(storage.raw(STORE_KEY), before, "rejected roster import must not write");
  }

  rejected(
    { enc_owner: base },
    [
      committedEncounter("enc_intruder", [
        {
          subjectId: "subject_owned",
          personId: "person_other",
          leadId: "lead_other",
          role: "COLLATERAL"
        }
      ])
    ],
    /subjectId subject_owned is already owned/i
  );
  rejected(
    { enc_owner: base },
    [
      committedEncounter("enc_intruder", [
        {
          subjectId: "subject_other",
          bookingId: "booking_owned",
          bookinRecordId: "booking_owned",
          role: "COLLATERAL"
        }
      ])
    ],
    /Book-In ID booking_owned is already owned/i
  );

  const retarget = committedEncounter("enc_owner", [
    {
      subjectId: "subject_owned",
      personId: "person_retargeted",
      leadId: "lead_owned",
      bookingId: "booking_owned",
      bookinRecordId: "booking_owned",
      role: "TARGET"
    }
  ]);
  retarget.meta.encounterRevision = 4;
  retarget.meta.updatedAt = "2026-09-05T12:00:00.000Z";
  rejected(
    { enc_owner: base },
    [retarget],
    /cannot change its canonical personId/i
  );

  const stale = committedEncounter("enc_owner", base.subjects);
  stale.meta.encounterRevision = 3;
  stale.meta.updatedAt = "2026-09-05T12:00:00.000Z";
  rejected(
    { enc_owner: base },
    [stale],
    /changed after this export/i
  );

  const completed = committedEncounter("enc_complete", []);
  completed.meta.encounterRevision = 2;
  completed.meta.markedComplete = true;
  const completedUpdate = committedEncounter("enc_complete", []);
  completedUpdate.meta.encounterRevision = 2;
  completedUpdate.meta.updatedAt = "2026-09-05T12:00:00.000Z";
  completedUpdate.team = "CHANGED";
  rejected(
    { enc_complete: completed },
    [completedUpdate],
    /completed and locked/i
  );

  const tombstoned = committedEncounter("enc_tombstone", []);
  tombstoned.meta.encounterRevision = 7;
  tombstoned.subjectIdentityHistory = [
    {
      subjectId: "subject_removed",
      encounterId: "enc_tombstone",
      bookingId: "booking_removed",
      bookinRecordId: "booking_removed",
      personId: "person_removed",
      leadId: "lead_removed"
    }
  ];
  const reactivated = committedEncounter("enc_tombstone", [
    {
      subjectId: "subject_removed",
      bookingId: "booking_removed",
      bookinRecordId: "booking_removed",
      personId: "person_removed",
      leadId: "lead_removed"
    }
  ]);
  reactivated.meta.encounterRevision = 7;
  reactivated.meta.updatedAt = "2026-09-05T12:00:00.000Z";
  rejected(
    { enc_tombstone: tombstoned },
    [reactivated],
    /cannot reactivate a removed subject or booking/i
  );
}

function encounterRemovalPreservesOwnershipHistory() {
  const existing = committedEncounter("enc_history", [
    {
      subjectId: "subject_removed_on_import",
      encounterId: "enc_history",
      personId: "person_history",
      leadId: "lead_history",
      bookingId: "booking_history",
      bookinRecordId: "booking_history"
    }
  ]);
  existing.meta.encounterRevision = 10;
  existing.bookingIdentityHistory = [
    {
      subjectId: "subject_older",
      encounterId: "enc_history",
      bookingId: "booking_older",
      bookinRecordId: "booking_older",
      bookingUnlinked: true
    }
  ];
  existing.completedHistory = [{ snapshot: { encounterId: "enc_history", subjects: [] } }];
  const incoming = committedEncounter("enc_history", []);
  incoming.meta.encounterRevision = 10;
  incoming.meta.updatedAt = "2026-09-05T12:00:00.000Z";
  incoming.subjectIdentityHistory = [];
  incoming.bookingIdentityHistory = [];
  incoming.completedHistory = [];
  const { storage, transfer } = runtime({
    [STORE_KEY]: workspace({ enc_history: existing }),
    [BOOKIN_KEY]: []
  });
  const result = transfer.applyImport(
    bundle({ encounters: [incoming] }),
    ["encounters"]
  );
  assert.strictEqual(result.error, "");
  const saved = storage.json(STORE_KEY).encounters.enc_history;
  assert.strictEqual(saved.meta.encounterRevision, 11);
  assert.ok(
    saved.subjectIdentityHistory.some(
      (row) => row.subjectId === "subject_removed_on_import" && row.bookingId === "booking_history"
    ),
    "removed roster identity becomes a durable tombstone"
  );
  assert.strictEqual(saved.bookingIdentityHistory[0].bookingId, "booking_older");
  assert.strictEqual(saved.completedHistory.length, 1);
}

function importedQuietDraftCannotCarryCanonicalClaims() {
  const { storage, transfer } = runtime({
    [STORE_KEY]: workspace(),
    [BOOKIN_KEY]: []
  });
  const result = transfer.applyImport(
    bundle({
      bookin: [
        {
          id: "draft_claim",
          encounterId: "enc_foreign",
          subjectId: "subject_foreign",
          personId: "person_foreign",
          leadId: "lead_foreign",
          bookingId: "draft_claim",
          bookinRecordId: "draft_claim",
          arrestId: "",
          encounterProjectionDraft: true,
          subjectRole: "COLLATERAL",
          encounterRole: "COLLATERAL",
          vehiclePosition: "PASSENGER",
          formState: {
            encounterRoleCollateral: { type: "radio", value: "COLLATERAL", checked: true },
            vehiclePosition: { type: "select-one", value: "PASSENGER", checked: false }
          }
        }
      ]
    }),
    ["bookin"]
  );
  assert.strictEqual(result.error, "");
  assert.strictEqual(result.bookinPromotionAttempted, false);
  const saved = storage.json(BOOKIN_KEY)[0];
  assert.strictEqual(saved.encounterProjectionDraft, true);
  ["encounterId", "subjectId", "personId", "leadId", "arrestId", "subjectRole", "encounterRole", "vehiclePosition"].forEach(
    (key) => assert.strictEqual(saved[key], "", key + " must be detached")
  );
  assert.ok(!Object.prototype.hasOwnProperty.call(saved, "bookingId"));
  assert.ok(!Object.prototype.hasOwnProperty.call(saved, "bookinRecordId"));
  assert.strictEqual(saved.formState.encounterRoleCollateral.checked, false);
  assert.strictEqual(saved.formState.vehiclePosition.value, "");
}

function malformedEncounterRostersCannotRemoveSubjects() {
  const existing = committedEncounter("enc_malformed", [
    {
      subjectId: "subject_preserved",
      personId: "person_preserved",
      leadId: "lead_preserved",
      bookingId: "booking_preserved"
    }
  ]);
  existing.meta.encounterRevision = 4;
  [null, {}, "invalid roster"].forEach((subjects) => {
    const { storage, transfer } = runtime({
      [STORE_KEY]: workspace({ enc_malformed: existing }),
      [BOOKIN_KEY]: []
    });
    const before = storage.dump();
    const incoming = {
      ...existing,
      subjects,
      meta: { ...existing.meta, updatedAt: "2026-09-05T12:00:00.000Z" }
    };
    const result = transfer.applyImport(bundle({ encounters: [incoming] }), ["encounters"]);
    assert.match(result.error, /subjects must be an array/i);
    assert.deepStrictEqual(storage.dump(), before, "malformed roster must not remove or tombstone subjects");
  });

  const { storage, transfer } = runtime({
    [STORE_KEY]: workspace({ enc_malformed: existing }),
    [BOOKIN_KEY]: []
  });
  const partial = {
    encounterId: existing.encounterId,
    meta: { ...existing.meta, updatedAt: "2026-09-05T12:00:00.000Z" },
    team: "UPDATED TEAM"
  };
  const result = transfer.applyImport(bundle({ encounters: [partial] }), ["encounters"]);
  assert.strictEqual(result.error, "");
  const saved = storage.json(STORE_KEY).encounters.enc_malformed;
  assert.strictEqual(saved.subjects[0].subjectId, "subject_preserved");
  assert.strictEqual(saved.team, "UPDATED TEAM", "omitted roster still permits partial Encounter updates");
}

function realBookInPromotionPreservesSelectCompatibility() {
  const storage = createMemoryStorage();
  const { context, model } = loadModelTab(storage, {
    console: quietConsole(),
    document: createMinimalDocument("home")
  });
  model.store.loadFromDisk();
  loadScript(context, "functions/transfer.js");
  [
    ["DRIVER", "Driver"],
    ["PASSENGER", "Passenger"],
    ["OTHER", "Other"]
  ].forEach(([occupantRole, legacyValue]) => {
    const suffix = occupantRole.toLowerCase();
    const person = model.createPerson({
      personId: "person_select_" + suffix,
      name: { lastName: "IMPORT", firstName: "SELECT" }
    });
    const lead = model.createLead({
      leadId: "lead_select_" + suffix,
      person,
      subjectPersonId: person.personId
    });
    assert.strictEqual(model.store.saveLead(lead, { mode: "commit" }).ok, true);
    const encounter = model.createEncounterRecord({
      encounterId: "enc_select_" + suffix,
      subjects: [{
        subjectId: "subject_select_" + suffix,
        personId: person.personId,
        leadId: lead.leadId,
        bookingId: "booking_select_" + suffix,
        bookinRecordId: "booking_select_" + suffix,
        role: "TARGET",
        occupantRole,
        outcome: "ARRESTED"
      }]
    });
    assert.strictEqual(model.store.saveEncounter(encounter, { mode: "commit" }).ok, true);
    const result = context.COPDoc.transfer.applyImport(bundle({
      bookin: [{
        id: "booking_select_" + suffix,
        encounterId: encounter.encounterId,
        subjectId: "subject_select_" + suffix,
        personId: person.personId,
        leadId: lead.leadId,
        firstName: "SELECT",
        lastName: "IMPORT",
        subjectRole: "COLLATERAL",
        vehiclePosition: "Wrong imported value",
        formState: {
          lastName: { type: "text", value: "IMPORT", checked: false },
          vehiclePosition: { type: "select-one", value: "Wrong imported value", checked: false },
          vehicle_position: { type: "select-one", value: "Wrong legacy alias", checked: false }
        }
      }]
    }), ["bookin"]);
    assert.strictEqual(result.error, "");
    assert.strictEqual(result.casesReused, 1, "exercise the real model promoter, not an identity stub");
    const packet = storage.json(BOOKIN_KEY).find((row) => row.id === "booking_select_" + suffix);
    assert.strictEqual(packet.subjectRole, "TARGET");
    assert.strictEqual(packet.vehiclePosition, legacyValue);
    assert.strictEqual(packet.formState.vehiclePosition.value, legacyValue, "saved value must match the Book-In select option");
    assert.strictEqual(packet.formState.vehicle_position.value, legacyValue);
    assert.strictEqual(model.store.getEncounter(encounter.encounterId).subjects[0].occupantRole, occupantRole);
    const arrest = model.store.getPerson(person.personId).arrests.find((row) => row.bookingId === packet.id);
    assert.strictEqual(arrest.subjectId, packet.subjectId);
    assert.strictEqual(arrest.vehiclePosition, legacyValue);
  });
}

encounterAndBookInIdsAreCanonicalAndCollisionSafe();
allTypeImportDefersPromotionAndUsesEncounterRoles();
failedImportsDetachNewAndRestoreExisting();
legacyFormStateIsSynthesizedAndLazyPromotionCannotWipe();
encounterRosterInvariantsArePreflighted();
encounterRemovalPreservesOwnershipHistory();
importedQuietDraftCannotCarryCanonicalClaims();
malformedEncounterRostersCannotRemoveSubjects();
realBookInPromotionPreservesSelectCompatibility();

console.log("ok stage2 transfer integrity");
