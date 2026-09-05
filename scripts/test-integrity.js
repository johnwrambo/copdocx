"use strict";

var fs = require("fs");
var path = require("path");
var vm = require("vm");

var scannerSource = fs.readFileSync(
  path.join(__dirname, "..", "functions", "integrity.js"),
  "utf8"
);
var failures = 0;

function check(label, condition, detail) {
  if (condition) {
    console.log("ok", label);
    return;
  }
  failures += 1;
  console.error("FAIL", label, detail || "");
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadScanner(overrides) {
  var context = Object.assign({
    console: console,
    Promise: Promise,
    Date: Date,
    Math: Math,
    JSON: JSON,
    Object: Object,
    Array: Array,
    String: String,
    Number: Number,
    Boolean: Boolean,
    RegExp: RegExp,
    Error: Error,
    setTimeout: setTimeout,
    clearTimeout: clearTimeout
  }, overrides || {});
  context.globalThis = context;
  context.window = context;
  vm.createContext(context);
  vm.runInContext(scannerSource, context, { filename: "functions/integrity.js" });
  return context;
}

function rules(report) {
  return report.findings.map(function (row) { return row.ruleId; });
}

function hasRule(report, ruleId) {
  return rules(report).indexOf(ruleId) >= 0;
}

function cleanFixture() {
  var person = {
    personId: "p1",
    entityType: "PERSON",
    caseRole: "DETAINEE",
    junked: false,
    name: { lastName: "", firstName: "", middleName: "" },
    sex: "",
    dateOfBirth: "",
    citizenship: "",
    ssn: "",
    locations: [],
    aliases: [],
    documents: [],
    criminal: {},
    encounters: [{
      encounterId: "enc1",
      subjectId: "sub1",
      personId: "p1",
      encounterRole: "TARGET",
      encounterDisposition: "ARRESTED",
      encounterReportNumber: "enc1"
    }],
    arrests: [{
      arrestId: "arr1",
      encounterId: "enc1",
      bookinRecordId: "book1"
    }],
    convictions: [],
    warrants: [],
    immigration: { baseballCards: [] }
  };
  var workspace = {
    schema: "copdocx.store.v1",
    currentLeadId: "lead1",
    people: { p1: person },
    leads: {
      lead1: {
        leadId: "lead1",
        subjectPersonId: "p1",
        caseRole: "DETAINEE",
        person: clone(person),
        source: {},
        vehicles: [],
        links: [],
        followUps: [],
        history: [],
        assignedOfficerId: "ofc1",
        meta: { status: "committed", markedComplete: false }
      }
    },
    encounters: {
      enc1: {
        encounterId: "enc1",
        entityType: "ENCOUNTER",
        schema: "copdocx.encounter.v1",
        operationId: "op1",
        officerIds: ["ofc1"],
        centerLocationId: "loc1",
        locations: [{ locationId: "loc1", id: "loc1" }],
        vehicles: [{
          vehicleId: "veh1",
          id: "veh1",
          plate: "ABC1",
          licensePlate: "ABC1",
          locations: []
        }],
        subjects: [{
          subjectId: "sub1",
          personId: "p1",
          leadId: "lead1",
          bookinRecordId: "book1",
          encounterRole: "TARGET",
          custody: "IN_CUSTODY",
          outcome: "ARRESTED",
          arrestingOfficerId: "ofc1",
          unidentified: false,
          shared: { encounterId: "enc1", officerIds: [], vehicles: [] }
        }],
        links: [],
        narratives: [],
        completedHistory: [],
        meta: { status: "committed", markedComplete: false }
      }
    },
    investigations: {
      inv1: {
        investigationId: "inv1",
        entityType: "INVESTIGATION",
        schema: "copdocx.investigation.v1",
        kind: "tag",
        mode: "bulk",
        parentInvestigationId: "",
        sourceLeadId: "lead1",
        assignedOfficerId: "ofc1",
        plates: [],
        nodes: [{ nodeId: "node1", objectType: "PERSON", objectId: "p1" }],
        links: [],
        focusNodeId: "node1",
        history: []
      }
    },
    vehicles: {
      veh1: {
        vehicleId: "veh1",
        id: "veh1",
        entityType: "VEHICLE",
        plate: "ABC1",
        licensePlate: "ABC1",
        locations: []
      }
    },
    locations: {
      loc1: { locationId: "loc1", id: "loc1", entityType: "LOCATION" }
    },
    businesses: {},
    entities: {},
    associations: {
      as1: {
        associationId: "as1",
        linkId: "as1",
        entityType: "ASSOCIATION",
        schema: "copdocx.association.v1",
        from: { type: "PERSON", id: "p1" },
        to: { type: "LOCATION", id: "loc1" },
        reason: "CURRENT_RESIDENCE",
        reasons: ["CURRENT_RESIDENCE"],
        source: { leadId: "lead1", encounterId: "", investigationId: "", officerId: "" },
        junked: false
      }
    },
    operations: {
      op1: {
        operationId: "op1",
        operationNumber: "op1",
        entityType: "OPERATION",
        schema: "copdocx.operation.v1",
        targets: [{ targetId: "target1", leadId: "lead1", personId: "p1", freeze: null }],
        teams: [{
          teamId: "cell1",
          vehicleId: "fleet1",
          members: [
            { officerId: "ofc1", assignmentRole: "eye" },
            { officerId: "ofc2", assignmentRole: "contact" }
          ]
        }],
        targetAssignments: [{ targetId: "target1", teamId: "cell1" }],
        opLocations: [],
        meta: { status: "draft", markedComplete: false }
      }
    }
  };
  var admin = {
    officers: [
      {
        officerId: "ofc1",
        id: "ofc1",
        entityType: "OFFICER",
        locations: [],
        fieldArrests: [{ arrestId: "arr1", encounterId: "enc1", personId: "p1" }]
      },
      { officerId: "ofc2", id: "ofc2", entityType: "OFFICER", locations: [], fieldArrests: [] }
    ],
    vehicles: [{
      vehicleId: "fleet1",
      id: "fleet1",
      entityType: "VEHICLE",
      governmentVehicle: true,
      plate: "GOV1",
      licensePlate: "GOV1",
      assignedOfficerIds: ["ofc1"]
    }],
    shifts: [{ id: "shift1", officerId: "ofc1", vehicleId: "fleet1" }]
  };
  var bookin = [{
    id: "book1",
    createdAt: "2026-01-01T10:00:00.000Z",
    updatedAt: "2026-01-01T10:01:00.000Z",
    leadId: "lead1",
    personId: "p1",
    arrestId: "arr1",
    encounterId: "enc1",
    encounterRole: "TARGET",
    formState: {}
  }];
  var media = [{
    mediaId: "med1",
    entityType: "MEDIA",
    schema: "copdocx.media.v1",
    mediaClass: "photo",
    owner: { type: "PERSON", id: "p1" },
    ownerKey: "PERSON:p1",
    sha256: "digest1",
    ownerSha: "PERSON:p1:digest1",
    roles: ["original"],
    primary: true
  }];
  return {
    workspace: workspace,
    admin: admin,
    bookin: bookin,
    media: media,
    mediaBlobKeys: [["med1", "original"]]
  };
}

function registeredEntries() {
  return [
    { id: "workspace", key: "copdocx.store.v1", medium: "localStorage" },
    { id: "admin", key: "copdoc.admin.v1", medium: "localStorage" },
    { id: "bookin", key: "alien-book-in.saved-records.v1", medium: "localStorage" },
    { id: "sessionProbe", key: "copdoc.test.session", medium: "sessionStorage" }
  ];
}

function makeStorage(reader) {
  var calls = { getItem: 0, setItem: 0, removeItem: 0, clear: 0 };
  return {
    calls: calls,
    getItem: function (key) {
      calls.getItem += 1;
      return reader(key, calls.getItem);
    },
    setItem: function () { calls.setItem += 1; throw new Error("mutation forbidden"); },
    removeItem: function () { calls.removeItem += 1; throw new Error("mutation forbidden"); },
    clear: function () { calls.clear += 1; throw new Error("mutation forbidden"); }
  };
}

function makeIndexedDb(snapshots) {
  var state = { open: 0, getAll: 0, getAllKeys: 0, blobValueReads: 0 };
  function asyncRequest(result, method) {
    var request = {};
    setTimeout(function () {
      if (method) state[method] += 1;
      request.result = clone(result);
      if (request.onsuccess) request.onsuccess();
    }, 0);
    return request;
  }
  return {
    state: state,
    databases: function () { return Promise.resolve([{ name: "copdocx.media.v1", version: 1 }]); },
    open: function () {
      var request = {};
      var snapshotIndex = state.open;
      state.open += 1;
      var source = snapshots[Math.min(snapshotIndex, snapshots.length - 1)];
      setTimeout(function () {
        var tx = null;
        request.result = {
          objectStoreNames: { contains: function (name) { return name === "meta" || name === "blobs"; } },
          transaction: function () {
            tx = {
              objectStore: function (name) {
                if (name === "meta") {
                  return { getAll: function () { return asyncRequest(source.metadata, "getAll"); } };
                }
                return {
                  getAllKeys: function () { return asyncRequest(source.blobKeys, "getAllKeys"); },
                  getAll: function () { state.blobValueReads += 1; throw new Error("blob values forbidden"); }
                };
              }
            };
            setTimeout(function () { if (tx.oncomplete) tx.oncomplete(); }, 5);
            return tx;
          },
          close: function () {}
        };
        if (request.onsuccess) request.onsuccess();
      }, 0);
      return request;
    }
  };
}

function testCleanAndDeterministic() {
  var context = loadScanner();
  var api = context.COPDoc.integrity;
  var fixture = cleanFixture();
  var before = JSON.stringify(fixture);
  var first = api.scanSnapshot(fixture, { now: "2026-01-01T00:00:00.000Z" });
  var second = api.scanSnapshot(fixture, { now: "2026-01-02T00:00:00.000Z" });
  check("clean current-shaped fixture passes", first.summary.status === "pass" && first.findings.length === 0, rules(first));
  check("scanSnapshot does not mutate input", JSON.stringify(fixture) === before);
  delete first.generatedAt;
  delete second.generatedAt;
  check("deterministic report ignoring generatedAt", JSON.stringify(first) === JSON.stringify(second));
  check("healthy Media metadata and role keys pass", !hasRule(first, "MEDIA_ROLE_BLOB_MISSING"));
}

function testDamagedInputsContinue() {
  var api = loadScanner().COPDoc.integrity;
  var report;
  try {
    report = api.scanSnapshot({
      stores: [
        { id: "workspace", key: "copdocx.store.v1", medium: "localStorage", status: "ok", raw: "{" },
        { id: "admin", key: "copdoc.admin.v1", medium: "localStorage", status: "ok", raw: "[]" },
        { id: "bookin", key: "alien-book-in.saved-records.v1", medium: "localStorage", status: "unavailable", raw: null, error: "SecurityError" }
      ],
      media: { status: "missing", metadata: [], blobKeys: [] }
    }, { now: "2026-01-01T00:00:00.000Z" });
  } catch (error) {
    check("damaged stores continue independently", false, error && error.stack);
    return;
  }
  check("malformed JSON reported", hasRule(report, "STORAGE_JSON_INVALID"));
  check("wrong root reported independently", hasRule(report, "STORAGE_ROOT_SHAPE_INVALID"));
  check("unreadable store reported independently", hasRule(report, "STORAGE_READ_FAILED"));
  check("damaged input makes report unsafe", report.summary.status === "unsafe");
}

function testMajorRelationshipFamiliesAndPrivacy() {
  var api = loadScanner().COPDoc.integrity;
  var fixture = cleanFixture();
  var secretName = "PLANTED-PII-NAME-9472";
  var secretNarrative = "PLANTED-NARRATIVE-TEXT-5519";
  var secretMedical = "PLANTED-MEDICAL-TEXT-3308";
  fixture.workspace.people.p1.name.lastName = secretName;
  fixture.workspace.leads.lead1.person.name.lastName = secretName;
  fixture.bookin[0].formState.medicalIssues = { value: secretMedical };
  fixture.workspace.leads.lead1.subjectPersonId = "wrong-person";
  fixture.workspace.encounters.enc1.operationId = "missing-operation";
  fixture.workspace.people.p1.arrests = [];
  fixture.workspace.leads.lead1.person.arrests = [];
  fixture.workspace.associations.as1.to.id = "missing-location";
  fixture.workspace.investigations.inv1.parentInvestigationId = "inv1";
  fixture.workspace.operations.op1.targets[0].leadId = "missing-lead";
  fixture.admin.shifts[0].officerId = "missing-officer";
  fixture.workspace.vehicles.veh1.id = "conflicting-id";
  fixture.media[0].owner.id = "missing-person";
  fixture.media[0].ownerKey = "PERSON:missing-person";
  fixture.media[0].ownerSha = "PERSON:missing-person:digest1";
  fixture.workspace.encounters.enc1.narratives = [{
    schema: "wrong-narrative-schema",
    narrativeId: "narrative1",
    encounterId: "enc1",
    narrativeKind: "PRIMARY_SUBJECT",
    focusEncounterParticipantId: "missing-participant",
    relatedEncounterParticipantIds: [],
    workflowStatus: "DRAFT",
    freshnessStatus: "CURRENT",
    recordState: "ACTIVE",
    output: { finalPlainText: secretNarrative, sections: [] }
  }];
  var report = api.scanSnapshot(fixture, { now: "2026-01-01T00:00:00.000Z" });
  [
    "ID_ALIAS_MISMATCH",
    "LEAD_SUBJECT_ID_MISMATCH",
    "ENCOUNTER_OPERATION_DANGLING",
    "BOOKIN_ARREST_DANGLING",
    "ASSOCIATION_ENDPOINT_DANGLING",
    "INVESTIGATION_PARENT_SELF",
    "OPERATION_TARGET_LEAD_DANGLING",
    "SHIFT_OFFICER_DANGLING",
    "MEDIA_OWNER_DANGLING",
    "NARRATIVE_RECORD_INVALID",
    "NARRATIVE_FOCUS_ORPHAN"
  ].forEach(function (ruleId) {
    check("major family emits " + ruleId, hasRule(report, ruleId), rules(report));
  });
  var serialized = JSON.stringify(report);
  check("report excludes planted PII", serialized.indexOf(secretName) === -1);
  check("report excludes planted narrative text", serialized.indexOf(secretNarrative) === -1);
  check("report excludes planted medical text", serialized.indexOf(secretMedical) === -1);
  check("all findings are explicitly non-repairing", report.findings.every(function (row) { return row.repairable === false; }));
}

function testMediaFailures() {
  var api = loadScanner().COPDoc.integrity;
  var fixture = cleanFixture();
  fixture.media[0].owner.id = "missing-person";
  fixture.media[0].ownerKey = "PERSON:missing-person";
  fixture.media[0].ownerSha = "PERSON:missing-person:digest1";
  fixture.media[0].roles.push("thumb");
  fixture.mediaBlobKeys.push(["ghost-media", "original"]);
  var report = api.scanSnapshot(fixture, { now: "2026-01-01T00:00:00.000Z" });
  check("Media dangling owner found", hasRule(report, "MEDIA_OWNER_DANGLING"));
  check("Media metadata role without blob found", hasRule(report, "MEDIA_ROLE_BLOB_MISSING"));
  check("Media blob key without metadata found", hasRule(report, "MEDIA_BLOB_METADATA_MISSING"));
}

function testEmbeddedCanonicalDivergence() {
  var api = loadScanner().COPDoc.integrity;
  var fixture = cleanFixture();
  fixture.workspace.vehicles.veh1.vehicleColor = "BLUE";
  fixture.workspace.encounters.enc1.vehicles[0].vehicleColor = "RED";
  fixture.workspace.locations.loc1.street = "2 NEW ST";
  fixture.workspace.encounters.enc1.locations[0].street = "1 OLD ST";
  var report = api.scanSnapshot(fixture, { now: "2026-01-01T00:00:00.000Z" });
  var matches = report.findings.filter(function (row) {
    return row.ruleId === "EMBEDDED_CANONICAL_OBJECT_DIVERGED";
  });
  check(
    "stale embedded Vehicle and Location copies are detected",
    matches.length === 2,
    matches
  );
  var serialized = JSON.stringify(matches);
  check(
    "canonical-copy findings do not expose field values",
    serialized.indexOf("BLUE") === -1 &&
      serialized.indexOf("RED") === -1 &&
      serialized.indexOf("2 NEW ST") === -1 &&
      serialized.indexOf("1 OLD ST") === -1
  );
}

function testFindingBound() {
  var api = loadScanner().COPDoc.integrity;
  var fixture = cleanFixture();
  fixture.workspace.operations.op1.targets = Array.from(
    { length: 12 },
    function () { return {}; }
  );
  fixture.workspace.operations.op1.targetAssignments = [];
  var report = api.scanSnapshot(fixture, {
    now: "2026-01-01T00:00:00.000Z",
    maxFindings: 3
  });
  check("finding payload is bounded", report.findings.length === 3);
  check(
    "suppressed findings remain counted",
    report.summary.totalFindings > report.summary.retainedFindings &&
      report.summary.suppressedFindings ===
        report.summary.totalFindings - report.summary.retainedFindings,
    report.summary
  );
}

function testEmptyStringIsPresentInvalidData() {
  var values = {
    "copdocx.store.v1": "",
    "copdoc.admin.v1": JSON.stringify({ officers: [], vehicles: [], shifts: [] }),
    "alien-book-in.saved-records.v1": "[]"
  };
  var local = makeStorage(function (key) {
    return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null;
  });
  var session = makeStorage(function () { return null; });
  var context = loadScanner({
    localStorage: local,
    sessionStorage: session,
    COPDoc: { config: { storageEntries: registeredEntries() } }
  });
  var capture = context.COPDoc.integrity.captureRegisteredStorage();
  var workspace = capture.stores.filter(function (row) { return row.id === "workspace"; })[0];
  check("empty string remains present at capture", workspace.status === "ok" && workspace.raw === "");
  var report = context.COPDoc.integrity.scanSnapshot(capture, { now: "2026-01-01T00:00:00.000Z" });
  check("present empty workspace is invalid JSON, not missing", hasRule(report, "STORAGE_JSON_INVALID"));
}

function testNoIndexedDbCreation() {
  var fixture = cleanFixture();
  var values = {
    "copdocx.store.v1": JSON.stringify(fixture.workspace),
    "copdoc.admin.v1": JSON.stringify(fixture.admin),
    "alien-book-in.saved-records.v1": JSON.stringify(fixture.bookin)
  };
  function contextWithIdb(idb) {
    return loadScanner({
      localStorage: makeStorage(function (key) { return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null; }),
      sessionStorage: makeStorage(function () { return null; }),
      indexedDB: idb,
      COPDoc: { config: { storageEntries: registeredEntries() } }
    });
  }
  var unsupportedOpen = 0;
  var unsupported = contextWithIdb({ open: function () { unsupportedOpen += 1; } });
  return unsupported.COPDoc.integrity.scanCurrent().then(function (report) {
    check("unsupported IDB preflight never calls open", unsupportedOpen === 0);
    check("unsupported IDB is explicitly skipped", hasRule(report, "MEDIA_PREFLIGHT_UNAVAILABLE"));
    var missingOpen = 0;
    var missing = contextWithIdb({
      databases: function () { return Promise.resolve([]); },
      open: function () { missingOpen += 1; }
    });
    return missing.COPDoc.integrity.scanCurrent().then(function () {
      check("missing Media DB never calls open/create", missingOpen === 0);
    });
  });
}

function testReadOnlyAndNonAtomicCurrentScan() {
  var fixture = cleanFixture();
  var workspaceReads = 0;
  var values = {
    "copdoc.admin.v1": JSON.stringify(fixture.admin),
    "alien-book-in.saved-records.v1": JSON.stringify(fixture.bookin)
  };
  var workspaceRaw = JSON.stringify(fixture.workspace);
  var local = makeStorage(function (key) {
    if (key === "copdocx.store.v1") {
      workspaceReads += 1;
      return workspaceReads === 1 ? workspaceRaw : workspaceRaw + " ";
    }
    return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null;
  });
  var session = makeStorage(function () { return null; });
  var mediaSecond = clone(fixture.media);
  mediaSecond[0].caption = "changed between captures";
  var idb = makeIndexedDb([
    { metadata: fixture.media, blobKeys: fixture.mediaBlobKeys },
    { metadata: mediaSecond, blobKeys: fixture.mediaBlobKeys }
  ]);
  var context = loadScanner({
    localStorage: local,
    sessionStorage: session,
    indexedDB: idb,
    COPDoc: { config: { storageEntries: registeredEntries() } }
  });
  return context.COPDoc.integrity.scanCurrent({ now: "2026-01-01T00:00:00.000Z" }).then(function (report) {
    var atomic = report.findings.filter(function (row) { return row.ruleId === "NON_ATOMIC_SNAPSHOT"; });
    var stores = atomic.map(function (row) { return row.affected[0].store; });
    check("non-atomic Web Storage change flagged", stores.indexOf("workspace") >= 0, stores);
    check("non-atomic Media change flagged", stores.indexOf("media") >= 0, stores);
    check("capture and scanCurrent never mutate localStorage",
      local.calls.setItem === 0 && local.calls.removeItem === 0 && local.calls.clear === 0, local.calls);
    check("capture and scanCurrent never mutate sessionStorage",
      session.calls.setItem === 0 && session.calls.removeItem === 0 && session.calls.clear === 0, session.calls);
    check("Media scan reads metadata", idb.state.getAll === 2, idb.state);
    check("Media scan reads only blob keys", idb.state.getAllKeys === 2 && idb.state.blobValueReads === 0, idb.state);
  });
}

Promise.resolve()
  .then(testCleanAndDeterministic)
  .then(testDamagedInputsContinue)
  .then(testMajorRelationshipFamiliesAndPrivacy)
  .then(testMediaFailures)
  .then(testEmbeddedCanonicalDivergence)
  .then(testFindingBound)
  .then(testEmptyStringIsPresentInvalidData)
  .then(testNoIndexedDbCreation)
  .then(testReadOnlyAndNonAtomicCurrentScan)
  .then(function () {
    if (failures) {
      console.error("integrity tests failed:", failures);
      process.exitCode = 1;
    } else {
      console.log("integrity tests passed");
    }
  })
  .catch(function (error) {
    console.error(error && error.stack || error);
    process.exitCode = 1;
  });
