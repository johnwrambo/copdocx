"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const {
  ROOT,
  createMemoryStorage,
  createMinimalDocument,
  quietConsole,
  loadScript,
  loadModelTab,
  run
} = require("./support/copdoc-vm-harness.js");

const BOOKIN_KEY = "alien-book-in.saved-records.v1";

function loadBookInRuntime(storage, encounterId) {
  const query = "?encounterId=" + encodeURIComponent(encounterId);
  const tab = loadModelTab(storage, {
    console: quietConsole(),
    document: createMinimalDocument("bookin"),
    location: {
      href: "http://copdoc.test/bookin.html" + query,
      search: query,
      pathname: "/bookin.html"
    }
  });
  loadScript(tab.context, "functions/book-in.js");
  run(tab.context, "setStatus = function () {}; renderSavedRecords = function () {};");
  return tab;
}

function installEncounterStore(context, encounter) {
  context.__bookinSyncEncounter = encounter;
  run(
    context,
    [
      "COPDoc.model.store.loadFromDisk = function () {};",
      "COPDoc.model.store.getEncounter = function () { return __bookinSyncEncounter; };",
      "COPDoc.model.store.saveEncounter = function (record) {",
      "  __bookinSyncEncounter = record;",
      "  return { ok: true, record: record };",
      "};"
    ].join("\n")
  );
}

function strictCanonicalSubjectIds() {
  const encounterId = "enc_bookin_strict_subject_id";
  const storage = createMemoryStorage();
  const { context, model } = loadBookInRuntime(storage, encounterId);
  installEncounterStore(context, {
    encounterId,
    subjects: [
      model.createEncounterSubject({
        subjectId: "sub_existing",
        encounterId,
        personId: "person_existing",
        role: "TARGET",
        outcome: "RELEASED",
        custody: "RELEASED"
      })
    ]
  });
  storage.setRaw(BOOKIN_KEY, [
    {
      id: "bk_unknown_canonical",
      subjectId: "sub_not_in_roster",
      encounterId,
      encounterRole: "TARGET",
      formState: {}
    },
    {
      id: "bk_idless_legacy",
      encounterId,
      encounterRole: "COLLATERAL",
      formState: {}
    }
  ]);

  const result = run(context, "syncEncounterSubjects({ encounterId: " + JSON.stringify(encounterId) + " })");
  const subjects = context.__bookinSyncEncounter.subjects;
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.conflicts.length, 1);
  assert.strictEqual(result.conflicts[0].reason, "missing-subject-id");
  assert.ok(
    !subjects.some(row => row.subjectId === "sub_not_in_roster"),
    "a nonblank subjectId that is absent from the roster must never create a subject"
  );
  assert.ok(
    subjects.some(row => row.bookingId === "bk_idless_legacy"),
    "an ID-less legacy packet may still migrate into the Encounter roster"
  );
}

function duplicateCanonicalSubjectIdsAreRejected() {
  const encounterId = "enc_bookin_duplicate_subject_id";
  const storage = createMemoryStorage();
  const { context } = loadBookInRuntime(storage, encounterId);
  installEncounterStore(context, {
    encounterId,
    subjects: [
      { subjectId: "sub_duplicate", encounterId, role: "TARGET", outcome: "RELEASED" },
      { subjectId: "sub_duplicate", encounterId, role: "COLLATERAL", outcome: "RELEASED" }
    ]
  });
  storage.setRaw(BOOKIN_KEY, [
    {
      id: "bk_duplicate_subject",
      subjectId: "sub_duplicate",
      encounterId,
      encounterRole: "TARGET",
      formState: {}
    }
  ]);

  const result = run(context, "syncEncounterSubjects({ encounterId: " + JSON.stringify(encounterId) + " })");
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.conflicts.length, 1);
  assert.strictEqual(result.conflicts[0].reason, "duplicate-subject-id");
  assert.ok(
    context.__bookinSyncEncounter.subjects.every(row => !row.bookingId),
    "an ambiguous canonical ID must not attach the Book-In packet to either row"
  );
}

function missingEncounterFailsBeforePromotion() {
  const encounterId = "enc_bookin_missing";
  const storage = createMemoryStorage();
  const { context } = loadBookInRuntime(storage, encounterId);
  storage.setRaw(BOOKIN_KEY, [
    {
      id: "bk_missing_encounter",
      subjectId: "",
      encounterId,
      encounterRole: "TARGET",
      firstName: "MISSING",
      lastName: "ENCOUNTER",
      formState: {}
    }
  ]);
  run(
    context,
    [
      "collectFormData = function () { return { foreignWarrants: 'no' }; };",
      "captureFormState = function () { return {}; };",
      "currentEncounterRole = function () { return 'TARGET'; };",
      "renderSavedRecords = function () {}; rememberFormSignature = function () {};",
      "__missingEncounterPromotionCalls = 0;",
      "promoteBookInRecord = function () { __missingEncounterPromotionCalls += 1; return { ok: true }; };",
      "activeRecordId = 'bk_missing_encounter';"
    ].join("\n")
  );
  const before = storage.raw(BOOKIN_KEY);
  assert.strictEqual(run(context, "saveCurrentRecord({ stay: true })"), false);
  assert.strictEqual(run(context, "__missingEncounterPromotionCalls"), 0);
  assert.strictEqual(
    storage.raw(BOOKIN_KEY),
    before,
    "a stale Encounter URL must not create a dangling Book-In write"
  );
}

function legacyPreflightRejectsAmbiguityBeforePromotion() {
  const encounterId = "enc_bookin_legacy_preflight";
  const storage = createMemoryStorage();
  const { context, model } = loadBookInRuntime(storage, encounterId);
  installEncounterStore(context, {
    encounterId,
    subjects: [
      model.createEncounterSubject({
        subjectId: "sub_legacy_a",
        encounterId,
        personId: "person_shared",
        role: "TARGET",
        outcome: "RELEASED"
      }),
      model.createEncounterSubject({
        subjectId: "sub_legacy_b",
        encounterId,
        personId: "person_shared",
        role: "COLLATERAL",
        outcome: "RELEASED"
      })
    ]
  });
  storage.setRaw(BOOKIN_KEY, [
    {
      id: "bk_legacy_ambiguous",
      subjectId: "",
      encounterId,
      encounterRole: "TARGET",
      personId: "person_shared",
      formState: {}
    }
  ]);
  run(
    context,
    [
      "collectFormData = function () { return { foreignWarrants: 'no' }; };",
      "captureFormState = function () { return {}; };",
      "currentEncounterRole = function () { return 'TARGET'; };",
      "renderSavedRecords = function () {}; rememberFormSignature = function () {};",
      "__legacyPromotionCalls = 0;",
      "promoteBookInRecord = function () {",
      "  __legacyPromotionCalls += 1;",
      "  return { ok: true, leadId: 'lead_wrong', personId: 'person_shared', arrestId: 'arr_wrong' };",
      "};",
      "activeRecordId = 'bk_legacy_ambiguous';"
    ].join("\n")
  );
  const packetsBefore = storage.raw(BOOKIN_KEY);
  assert.strictEqual(
    run(context, "saveCurrentRecord({ stay: true })"),
    false,
    "an ambiguous ID-less legacy claim must fail before promotion"
  );
  assert.strictEqual(run(context, "__legacyPromotionCalls"), 0);
  assert.strictEqual(storage.raw(BOOKIN_KEY), packetsBefore, "rejection must precede Book-In writes");

  context.__bookinSyncEncounter.subjects[0].personId = "";
  context.__bookinSyncEncounter.subjects[0].bookingId = "bk_cross_owned";
  context.__bookinSyncEncounter.subjects[0].bookinRecordId = "bk_cross_owned";
  context.__bookinSyncEncounter.subjects[1].personId = "person_other";
  const crossOwned = run(
    context,
    "validateEncounterSubjectLink(" +
      JSON.stringify(encounterId) +
      ", '', { id: 'bk_cross_owned', personId: 'person_other' })"
  );
  assert.strictEqual(
    crossOwned.ok,
    false,
    "an ID-less booking claim cannot borrow a Person owned by another roster row"
  );

  context.__bookinSyncEncounter.subjects[0].personId = "person_shared";
  context.__bookinSyncEncounter.subjects[0].bookingId = "";
  context.__bookinSyncEncounter.subjects[0].bookinRecordId = "";
  const unique = run(
    context,
    "validateEncounterSubjectLink(" +
      JSON.stringify(encounterId) +
      ", '', { id: 'bk_unique', personId: 'person_shared' })"
  );
  assert.strictEqual(unique.ok, true, "a unique compatible legacy claim remains valid");
  assert.strictEqual(unique.subject.subjectId, "sub_legacy_a");
  storage.setRaw(BOOKIN_KEY, [
    {
      id: "bk_legacy_ambiguous",
      subjectId: "",
      encounterId,
      encounterRole: "TARGET",
      personId: "person_shared",
      formState: {}
    }
  ]);
  run(
    context,
    [
      "__promotedCanonicalSubjectId = '';",
      "promoteBookInRecord = function (record) {",
      "  __promotedCanonicalSubjectId = record.subjectId;",
      "  return { ok: true, leadId: 'lead_unique', personId: 'person_shared', arrestId: 'arr_unique' };",
      "};",
      "COPDoc.model.store.applyEncounterLocationToArrests = function () { return { ok: true }; };",
      "COPDoc.model.store.linkEncounterVehiclesToPerson = function () { return { ok: true }; };",
      "activeRecordId = 'bk_legacy_ambiguous';"
    ].join("\n")
  );
  assert.strictEqual(run(context, "saveCurrentRecord({ stay: true })"), true);
  assert.strictEqual(
    run(context, "__promotedCanonicalSubjectId"),
    "sub_legacy_a",
    "a unique legacy join must carry the permanent subjectId into promotion"
  );
  const genuinelyNew = run(
    context,
    "validateEncounterSubjectLink(" +
      JSON.stringify(encounterId) +
      ", '', { id: 'bk_new', personId: 'person_new' })"
  );
  assert.strictEqual(genuinelyNew.ok, true, "a genuinely new ID-less packet remains valid");
  assert.strictEqual(genuinelyNew.subject, null);
}

function explicitSaveDoesNotSweepQuietPacket() {
  const encounterId = "enc_bookin_scoped_projection";
  const storage = createMemoryStorage();
  const { context, model } = loadBookInRuntime(storage, encounterId);
  installEncounterStore(context, {
    encounterId,
    subjects: [
      model.createEncounterSubject({
        subjectId: "sub_quiet",
        encounterId,
        role: "TARGET",
        outcome: "RELEASED",
        custody: "RELEASED"
      }),
      model.createEncounterSubject({
        subjectId: "sub_explicit",
        encounterId,
        role: "COLLATERAL",
        outcome: "RELEASED",
        custody: "RELEASED"
      })
    ]
  });
  storage.setRaw(BOOKIN_KEY, [
    {
      id: "bk_quiet",
      subjectId: "sub_quiet",
      encounterId,
      encounterRole: "TARGET",
      formState: {}
    },
    {
      id: "bk_explicit",
      subjectId: "sub_explicit",
      encounterId,
      encounterRole: "COLLATERAL",
      formState: {}
    }
  ]);
  run(
    context,
    [
      "collectFormData = function () { return {",
      "  firstName: 'SYNC', lastName: 'TEST', aNumber: '', fbiNumber: '', iceEvent: '',",
      "  encounterNumber: '" + encounterId + "', subjectRole: 'TARGET', vehiclePosition: '',",
      "  officersName: '', dateTime: '2026-09-05T14:00', arrestTime: '14:00',",
      "  foreignWarrants: 'no', foreignWarrantCountry: '', dateOfBirth: '', age: '',",
      "  gender: '', countryOfCitizenship: '', caseType: '', team: '', cash: '',",
      "  travelDocs: '', propertyTag: '', cellNum: '', children: '', medicalIssues: '', medicine: ''",
      "}; };",
      "captureFormState = function () { return {}; };",
      "currentEncounterRole = function () { return 'TARGET'; };",
      "renderSavedRecords = function () {}; rememberFormSignature = function () {};",
      "promoteBookInRecord = function (record) { return {",
      "  ok: true, leadId: 'lead_' + record.id, personId: 'person_' + record.id, arrestId: 'arr_' + record.id",
      "}; };",
      "COPDoc.model.store.applyEncounterLocationToArrests = function () { return { ok: true }; };",
      "COPDoc.model.store.linkEncounterVehiclesToPerson = function () { return { ok: true }; };"
    ].join("\n")
  );

  run(context, "activeRecordId = 'bk_quiet';");
  assert.strictEqual(run(context, "saveCurrentRecord({ quiet: true, stay: true })"), true);
  assert.strictEqual(
    storage.json(BOOKIN_KEY, []).find(row => row.id === "bk_quiet").encounterProjectionFiledAt,
    undefined,
    "quiet autosave must not authorize Encounter custody projection"
  );
  assert.strictEqual(
    storage.json(BOOKIN_KEY, []).find(row => row.id === "bk_quiet").encounterProjectionDraft,
    true,
    "quiet autosave must persist its draft intent across a page reload"
  );
  run(
    context,
    [
      "__reconcilePromotionCalls = 0;",
      "promoteRecordsToCases = function (rows) {",
      "  __reconcilePromotionCalls += 1;",
      "  return { ok: true, rows: rows, promoted: rows.length, created: rows.length, reused: 0, failed: 0, errors: [] };",
      "};",
      "reconcileUnlinkedBookInRecords();"
    ].join("\n")
  );
  assert.strictEqual(
    run(context, "__reconcilePromotionCalls"),
    0,
    "startup reconciliation must not promote a quiet autosave"
  );

  run(context, "activeRecordId = 'bk_explicit';");
  assert.strictEqual(run(context, "saveCurrentRecord({ stay: true })"), true);
  assert.ok(
    storage.json(BOOKIN_KEY, []).find(row => row.id === "bk_explicit").encounterProjectionFiledAt,
    "an explicitly promoted packet must persist its projection marker"
  );
  const quiet = context.__bookinSyncEncounter.subjects.find(row => row.subjectId === "sub_quiet");
  const explicit = context.__bookinSyncEncounter.subjects.find(row => row.subjectId === "sub_explicit");
  assert.strictEqual(quiet.outcome, "RELEASED");
  assert.strictEqual(quiet.custody, "RELEASED");
  assert.strictEqual(quiet.bookingId, "");
  assert.strictEqual(explicit.outcome, "ARRESTED");
  assert.strictEqual(explicit.custody, "IN_CUSTODY");
  assert.strictEqual(explicit.bookingId, "bk_explicit");
}

function cancelDetachesQuietCanonicalDraft() {
  const encounterId = "enc_bookin_cancel_quiet";
  const storage = createMemoryStorage();
  const { context, model } = loadBookInRuntime(storage, encounterId);
  installEncounterStore(context, {
    encounterId,
    subjects: [
      model.createEncounterSubject({
        subjectId: "sub_cancel_quiet",
        encounterId,
        personId: "person_cancel_quiet",
        leadId: "lead_cancel_quiet",
        role: "TARGET"
      })
    ]
  });
  storage.setRaw(BOOKIN_KEY, [
    {
      id: "bk_cancel_quiet",
      subjectId: "sub_cancel_quiet",
      encounterId,
      encounterRole: "TARGET",
      formState: {}
    }
  ]);
  run(
    context,
    [
      "collectFormData = function () { return { foreignWarrants: 'no' }; };",
      "captureFormState = function () { return {}; };",
      "currentEncounterRole = function () { return 'TARGET'; };",
      "renderSavedRecords = function () {}; rememberFormSignature = function () {};",
      "activeRecordId = 'bk_cancel_quiet';"
    ].join("\n")
  );
  assert.strictEqual(run(context, "saveCurrentRecord({ quiet: true, stay: true })"), true);
  let packet = storage.json(BOOKIN_KEY, [])[0];
  assert.strictEqual(packet.personId, "person_cancel_quiet");
  assert.strictEqual(packet.leadId, "lead_cancel_quiet");
  assert.strictEqual(packet.encounterProjectionDraft, true);
  run(context, "cancelEncounterBookIn()");
  packet = storage.json(BOOKIN_KEY, [])[0];
  assert.strictEqual(packet.encounterId, "");
  assert.strictEqual(packet.subjectId, "");
  assert.strictEqual(packet.encounterRole, "");
  assert.strictEqual(
    packet.encounterProjectionDraft,
    true,
    "a canceled packet must stay explicitly unfiled so startup reconciliation skips it"
  );
  run(
    context,
    [
      "__cancelReconcilePromotionCalls = 0;",
      "promoteRecordsToCases = function (rows) { __cancelReconcilePromotionCalls += 1; return { rows: rows }; };",
      "reconcileUnlinkedBookInRecords();"
    ].join("\n")
  );
  assert.strictEqual(run(context, "__cancelReconcilePromotionCalls"), 0);
}

function legacyFiledPacketIsNotReclassifiedAsDraft() {
  const encounterId = "enc_bookin_legacy_filed";
  const storage = createMemoryStorage();
  const { context, model } = loadBookInRuntime(storage, encounterId);
  installEncounterStore(context, {
    encounterId,
    subjects: [
      model.createEncounterSubject({
        subjectId: "sub_legacy_filed",
        encounterId,
        personId: "person_legacy_filed",
        leadId: "lead_legacy_filed",
        bookingId: "bk_legacy_filed",
        role: "TARGET",
        outcome: "ARRESTED"
      })
    ]
  });
  storage.setRaw(BOOKIN_KEY, [
    {
      id: "bk_legacy_filed",
      subjectId: "sub_legacy_filed",
      encounterId,
      encounterRole: "TARGET",
      personId: "person_legacy_filed",
      leadId: "lead_legacy_filed",
      arrestId: "arr_legacy_filed",
      formState: {}
    }
  ]);
  run(
    context,
    [
      "collectFormData = function () { return { foreignWarrants: 'no' }; };",
      "captureFormState = function () { return {}; };",
      "currentEncounterRole = function () { return 'TARGET'; };",
      "renderSavedRecords = function () {}; rememberFormSignature = function () {};",
      "activeRecordId = 'bk_legacy_filed';"
    ].join("\n")
  );
  assert.strictEqual(run(context, "saveCurrentRecord({ quiet: true, stay: true })"), true);
  let packet = storage.json(BOOKIN_KEY, [])[0];
  assert.strictEqual(
    packet.encounterProjectionDraft,
    undefined,
    "legacy filing evidence must prevent quiet-edit draft reclassification"
  );
  run(context, "cancelEncounterBookIn()");
  packet = storage.json(BOOKIN_KEY, [])[0];
  assert.strictEqual(packet.encounterId, encounterId);
  assert.strictEqual(packet.subjectId, "sub_legacy_filed");
}

function importPromotionSkipsQuietDrafts() {
  const storage = createMemoryStorage();
  const { context } = loadBookInRuntime(storage, "enc_import_projection_intent");
  run(
    context,
    [
      "__importPromotedIds = [];",
      "promoteRecordsToCases = function (rows) {",
      "  __importPromotedIds = rows.map(function (row) { return row.id; });",
      "  return { ok: true, rows: rows, promoted: rows.length, created: rows.length, reused: 0, failed: 0, errors: [] };",
      "};"
    ].join("\n")
  );
  const rows = run(
    context,
    "promoteImportRecords([" +
      "{ id: 'bk_import_quiet', encounterProjectionDraft: true }," +
      "{ id: 'bk_import_legacy' }," +
      "{ id: 'bk_import_filed', encounterProjectionFiledAt: '2026-09-05T12:00:00.000Z' }" +
      "]).rows"
  );
  assert.deepStrictEqual(
    Array.from(run(context, "__importPromotedIds")),
    ["bk_import_legacy", "bk_import_filed"]
  );
  assert.strictEqual(rows.length, 3);
  assert.strictEqual(rows[0].encounterProjectionDraft, true);
}

function nativeQuickBookInRemainsIntentional() {
  const source = fs.readFileSync(path.join(ROOT, "functions/encounters.js"), "utf8");
  assert.match(
    source,
    /promoteBookInToLead\(input\)/,
    "the native Encounter quick Book-In must explicitly promote its packet"
  );
  assert.match(
    source,
    /var packet = \{[\s\S]{0,500}subjectId: subjectKey\(row\)[\s\S]{0,160}encounterProjectionFiledAt: now/,
    "the native quick Book-In packet must retain the selected Encounter subjectId"
  );
  assert.match(
    source,
    /row\.bookingId = packetId;[\s\S]{0,160}row\.packetFiledAt = now;/,
    "the native quick Book-In must intentionally project its booking onto the selected row"
  );
}

strictCanonicalSubjectIds();
duplicateCanonicalSubjectIdsAreRejected();
missingEncounterFailsBeforePromotion();
legacyPreflightRejectsAmbiguityBeforePromotion();
explicitSaveDoesNotSweepQuietPacket();
cancelDetachesQuietCanonicalDraft();
legacyFiledPacketIsNotReclassifiedAsDraft();
importPromotionSkipsQuietDrafts();
nativeQuickBookInRemainsIntentional();

console.log(
  "STAGE2_BOOKIN_SYNC_INTEGRITY_PASSED strict canonical joins and scoped custody projection."
);
