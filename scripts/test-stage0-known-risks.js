"use strict";

const fs = require("fs");
const path = require("path");
const {
  createMemoryStorage,
  createMinimalDocument,
  quietConsole,
  createTab,
  loadScript,
  loadModelTab,
  run
} = require("./support/copdoc-vm-harness.js");

const WORKSPACE_KEY = "copdocx.store.v1";
const BOOKIN_KEY = "alien-book-in.saved-records.v1";
const ADMIN_KEY = "copdoc.admin.v1";
const BOOKING_JOURNAL_KEY = "copdocx.booking-transactions.v1";
const IMPORT_JOURNAL_KEY = "copdocx.import-transactions.v1";
const strict = process.argv.includes("--strict");
const baseline = JSON.parse(
  fs.readFileSync(path.join(__dirname, "stage0-known-risks.json"), "utf8")
);
const resolvedRiskIds = new Set(
  ["stage2-resolved-risks.json", "stage4-resolved-risks.json", "stage5-resolved-risks.json", "stage6-resolved-risks.json"].flatMap(filename => {
    const resolutionFile = path.join(__dirname, filename);
    return fs.existsSync(resolutionFile)
      ? JSON.parse(fs.readFileSync(resolutionFile, "utf8")).resolvedRiskIds || []
      : [];
  })
);

function requireOk(result, step) {
  if (!result || !result.ok) {
    throw new Error(step + " failed: " + ((result && result.error) || "unknown error"));
  }
  return result;
}

function makeLead(model, lastName) {
  const lead = model.createLeadSnapshot();
  lead.person.name.lastName = lastName;
  lead.person.name.firstName = "TEST";
  return lead;
}

function probePersonEncounterLoss() {
  const storage = createMemoryStorage();
  const { model } = loadModelTab(storage, { console: quietConsole() });
  const lead = makeLead(model, "HISTORY");
  requireOk(model.store.saveLead(lead, { mode: "commit" }), "initial Case save");
  const staleCase = model.store.getLead(lead.leadId);
  const encounter = model.createEncounterRecord({ encounterId: "enc_history_loss" });
  encounter.startedAt = "2026-09-05T10:00";
  encounter.subjects = [
    model.encounterSubjectFromPerson(staleCase.person, {
      subjectId: "sub_history_loss",
      encounterRole: "COLLATERAL",
      outcome: "RELEASED"
    })
  ];
  requireOk(model.store.saveEncounter(encounter, { mode: "commit" }), "Encounter save");
  const before = (model.store.getPerson(staleCase.person.personId).encounters || []).length;
  const saved = model.store.saveLead(staleCase, { mode: "commit" });
  if (!saved.ok && saved.code !== "OBJECT_STALE") requireOk(saved, "stale Case save");
  const after = (model.store.getPerson(staleCase.person.personId).encounters || []).length;
  return {
    reproduced: before === 1 && after === 0,
    observed: { encounterCountBeforeStaleSave: before, encounterCountAfterStaleSave: after }
  };
}

function probeVehicleRollback() {
  const storage = createMemoryStorage();
  const { model } = loadModelTab(storage, { console: quietConsole() });
  const vehicle = model.createVehicle({
    vehicleId: "veh_stale_case",
    licensePlate: "STALE1",
    plateState: "TX",
    vehicleColor: "RED"
  });
  const lead = makeLead(model, "VEHICLE");
  lead.vehicles = [vehicle];
  requireOk(model.store.saveLead(lead, { mode: "commit" }), "initial Case save");
  const staleCase = model.store.getLead(lead.leadId);
  const canonical = model.store.getVehicleRecord(vehicle.vehicleId);
  canonical.vehicleColor = "BLUE";
  requireOk(model.store.saveVehicleRecord(canonical, { mode: "commit" }), "canonical Vehicle edit");
  const before = model.store.getVehicleRecord(vehicle.vehicleId).vehicleColor;
  requireOk(model.store.saveLead(staleCase, { mode: "commit" }), "stale Case save");
  const after = model.store.getVehicleRecord(vehicle.vehicleId).vehicleColor;
  return {
    reproduced: before === "BLUE" && after === "RED",
    observed: { canonicalColorBeforeStaleSave: before, canonicalColorAfterStaleSave: after }
  };
}

function probeLocationRollback() {
  const storage = createMemoryStorage();
  const { model } = loadModelTab(storage, { console: quietConsole() });
  const location = model.createLocation({
    locationId: "loc_stale_case",
    street: "1 OLD ST",
    city: "Dallas",
    state: "TX"
  });
  const lead = makeLead(model, "LOCATION");
  lead.person.locations = [location];
  requireOk(model.store.saveLead(lead, { mode: "commit" }), "initial Case save");
  const staleCase = model.store.getLead(lead.leadId);
  const canonical = model.store.getLocationRecord(location.locationId);
  canonical.street = "2 NEW ST";
  requireOk(model.store.saveLocationRecord(canonical, { mode: "commit" }), "canonical Location edit");
  const before = model.store.getLocationRecord(location.locationId).street;
  requireOk(model.store.saveLead(staleCase, { mode: "commit" }), "stale Case save");
  const after = model.store.getLocationRecord(location.locationId).street;
  return {
    reproduced: before === "2 NEW ST" && after === "1 OLD ST",
    observed: { canonicalStreetBeforeStaleSave: before, canonicalStreetAfterStaleSave: after }
  };
}

function probeFailedFirstWritePhantom() {
  const storage = createMemoryStorage();
  const { model } = loadModelTab(storage, { console: quietConsole() });
  const lead = makeLead(model, "PHANTOM");
  storage.failNext(WORKSPACE_KEY);
  const result = model.store.saveLead(lead, { mode: "commit" });
  const onDisk = !!storage.raw(WORKSPACE_KEY);
  const inMemory = !!model.store.getLead(lead.leadId);
  return {
    reproduced: !!result && result.ok === false && !onDisk && inMemory,
    observed: { saveOk: !!(result && result.ok), onDisk, inMemory }
  };
}

function loadBookInRuntime(storage, location) {
  const doc = createMinimalDocument("bookin");
  const tab = loadModelTab(storage, {
    console: quietConsole(),
    document: doc,
    location: location || { search: "", pathname: "/bookin.html" }
  });
  loadScript(tab.context, "functions/officer-roster.js");
  loadScript(tab.context, "functions/booking-workflow.js");
  loadScript(tab.context, "functions/book-in.js");
  return tab;
}

async function probePartialBookIn() {
  const storage = createMemoryStorage();
  const { context } = loadBookInRuntime(storage);
  run(
    context,
    [
      "collectFormData = function () { return {",
      "firstName: 'Pat', lastName: 'PARTIAL', aNumber: '', fbiNumber: '',",
      "iceEvent: 'DAL-X', encounterNumber: '', subjectRole: '', vehiclePosition: '',",
      "officersName: '', dateTime: '2026-09-05T12:00', arrestTime: '11:00',",
      "foreignWarrants: 'no', foreignWarrantCountry: '', dateOfBirth: '', age: '',",
      "gender: '', countryOfCitizenship: '', caseType: '', team: '', cash: '',",
      "travelDocs: '', propertyTag: '', cellNum: '', children: '', medicalIssues: '', medicine: ''",
      "}; };",
      "captureFormState = function () { return {}; };",
      "createRecordId = function () { return 'bk_partial_write'; };",
      "renderSavedRecords = function () {};",
      "rememberFormSignature = function () {};",
      "setStatus = function () {};"
    ].join("\n")
  );
  storage.resetWriteHistory();
  storage.failNext(BOOKIN_KEY);
  const saveReturned = await run(context, "saveCurrentRecord({ promote: true, stay: true })");
  const workspace = storage.json(WORKSPACE_KEY, {});
  const leads = Object.values(workspace.leads || {});
  const arrests = leads.flatMap((lead) => ((lead.person && lead.person.arrests) || []));
  const packetStoreExists = storage.raw(BOOKIN_KEY) !== null;
  const interruptedJournal = storage.json(BOOKING_JOURNAL_KEY, {});
  const transactions = Object.values(interruptedJournal.transactions || {});
  const transaction = transactions.find(row => row.bookingId === "bk_partial_write");
  const writes = storage.history();
  const journalWrite = writes.findIndex(row => row.key === BOOKING_JOURNAL_KEY && !row.failed);
  const firstDomainWrite = writes.findIndex(row =>
    [WORKSPACE_KEY, BOOKIN_KEY, ADMIN_KEY].includes(row.key)
  );
  const journalBeforeWrites = journalWrite >= 0 && firstDomainWrite > journalWrite;
  const durableFailure = transaction && transaction.status !== "COMPLETED" &&
    transaction.request && transaction.request.packet;

  // Reload all runtime globals to prove recovery comes from the durable request,
  // not the form or a remembered in-memory promotion result.
  const restarted = loadBookInRuntime(storage);
  const resumed = transaction
    ? await restarted.context.COPDoc.booking.resume(transaction.transactionId)
    : { ok: false, error: "Missing recovery transaction" };
  const repeated = transaction
    ? await restarted.context.COPDoc.booking.resume(transaction.transactionId)
    : { ok: false };
  const finalWorkspace = storage.json(WORKSPACE_KEY, {});
  const finalLeads = Object.values(finalWorkspace.leads || {});
  const finalArrests = finalLeads.flatMap(lead => ((lead.person && lead.person.arrests) || []));
  const finalPackets = storage.json(BOOKIN_KEY, []);
  const finalJournal = storage.json(BOOKING_JOURNAL_KEY, {});
  const receipt = transaction && (finalJournal.transactions || {})[transaction.transactionId];
  const exactlyOnce = finalLeads.length === 1 && finalArrests.length === 1 &&
    finalPackets.length === 1 && finalPackets[0].id === "bk_partial_write" &&
    finalArrests[0].bookinRecordId === "bk_partial_write" &&
    finalPackets[0].leadId === finalLeads[0].leadId &&
    finalPackets[0].arrestId === finalArrests[0].arrestId;
  const recoveryVerified = saveReturned === false && journalBeforeWrites && durableFailure &&
    !packetStoreExists && !!resumed.ok && !!repeated.ok && exactlyOnce &&
    receipt && receipt.status === "COMPLETED";
  return {
    reproduced: !recoveryVerified,
    observed: {
      saveReturned,
      partialCanonicalLeadCount: leads.length,
      partialCanonicalArrestCount: arrests.length,
      packetStoreExists,
      journalBeforeWrites,
      durableRecoveryRequest: !!durableFailure,
      resumeOk: !!resumed.ok,
      repeatOk: !!repeated.ok,
      exactlyOnce,
      finalStatus: receipt && receipt.status,
      resumeError: resumed.error || ""
    }
  };
}

async function bookInDeleteResidueFixture() {
  const storage = createMemoryStorage();
  const { context, model } = loadBookInRuntime(storage, {
    search: "?encounterId=enc_delete_residue",
    pathname: "/bookin.html"
  });
  const person = model.createPerson({
    personId: "p_delete_residue",
    name: { lastName: "RESIDUE", firstName: "TEST" }
  });
  requireOk(model.store.upsertPerson(person), "Person save");
  const encounter = model.createEncounterRecord({ encounterId: "enc_delete_residue" });
  encounter.startedAt = "2026-09-05T12:00";
  const subject = model.encounterSubjectFromPerson(person, {
    subjectId: "sub_delete_residue",
    encounterRole: "TARGET",
    outcome: "ARRESTED",
    bookinRecordId: "bk_delete_residue"
  });
  encounter.subjects = [subject];
  requireOk(model.store.saveEncounter(encounter, { mode: "commit" }), "Encounter save");
  const input = model.arrestInputFromSubject(
    subject,
    model.sharedStopFromEncounter(encounter),
    {
      bookinRecordId: "bk_delete_residue",
      bookInDateTime: "2026-09-05T13:00"
    }
  );
  const promoted = requireOk(model.store.promoteBookInToLead(input), "Book-In promotion");
  storage.setRaw(BOOKIN_KEY, [
    {
      id: "bk_delete_residue",
      encounterId: encounter.encounterId,
      encounterRole: "TARGET",
      personId: promoted.personId,
      leadId: promoted.leadId,
      arrestId: promoted.arrestId,
      firstName: "TEST",
      lastName: "RESIDUE",
      formState: {}
    }
  ]);
  context.prompt = () => "Duplicate booking corrected";
  await run(context, "deleteSavedRecord('bk_delete_residue')");
  const after = model.store.getState();
  const packets = storage.json(BOOKIN_KEY, []);
  const savedEncounter = after.encounters[encounter.encounterId];
  const savedPerson = after.people[promoted.personId];
  const subjectReference = (savedEncounter.subjects || []).some(
    (row) => row && row.bookinRecordId === "bk_delete_residue"
  );
  const arrestReference = (savedPerson.arrests || []).some(
    (row) => row && row.bookinRecordId === "bk_delete_residue" && !row.voidedAt
  );
  const retainedVoidedPacket = packets.some(row => row.id === "bk_delete_residue" && row.voidedAt);
  if (resolvedRiskIds.has("S0-BOOKIN-002") && !retainedVoidedPacket) {
    throw new Error("Expected a successfully voided, retained packet; cancellation is not a resolved deletion risk.");
  }
  return {
    packetCount: packets.length,
    retainedVoidedPacket,
    encounterSubjectReferenceStillActive: subjectReference,
    arrestReferenceStillActive: arrestReference,
    caseStillPresent: !!after.leads[promoted.leadId]
  };
}

async function probeBookInDeleteEncounterResidue() {
  const observed = await bookInDeleteResidueFixture();
  return {
    reproduced:
      observed.encounterSubjectReferenceStillActive && (observed.packetCount === 0 || observed.retainedVoidedPacket),
    observed
  };
}

async function probeBookInDeleteArrestResidue() {
  const observed = await bookInDeleteResidueFixture();
  return {
    reproduced:
      observed.arrestReferenceStillActive && (observed.packetCount === 0 || observed.retainedVoidedPacket),
    observed
  };
}

function emptyWorkspace() {
  return {
    schema: WORKSPACE_KEY,
    currentLeadId: "",
    people: {},
    leads: {},
    encounters: {},
    investigations: {},
    vehicles: {},
    locations: {},
    businesses: {},
    entities: {},
    associations: {},
    operations: {}
  };
}

async function probePartialImport() {
  const storage = createMemoryStorage({
    [WORKSPACE_KEY]: emptyWorkspace(),
    [ADMIN_KEY]: { officers: [], vehicles: [], shifts: [] }
  });
  function runtime() {
    const { context } = loadModelTab(storage, { console: quietConsole() });
    ["functions/workspace-config.js", "functions/baseball-card-contract.js", "functions/import-schema.js", "functions/import-workflow.js", "functions/transfer.js"].forEach(source => loadScript(context, source));
    return context;
  }
  const context = runtime();
  const parsed = context.COPDoc.transfer.parseTransfer(
    JSON.stringify({
      format: "copdocx.transfer.v1",
      leads: [
        {
          leadId: "lead_partial_import",
          person: {
            personId: "p_partial_import",
            name: { lastName: "PARTIAL", firstName: "IMPORT" }
          },
          meta: {
            status: "committed",
            updatedAt: "2026-09-05T00:00:00.000Z"
          }
        }
      ],
      officers: [
        {
          id: "ofc_partial_import",
          officerId: "ofc_partial_import",
          lastName: "PARTIAL",
          firstName: "IMPORT",
          meta: {
            status: "committed",
            updatedAt: "2026-09-05T00:00:00.000Z"
          }
        }
      ]
    })
  );
  const beforeWorkspace = storage.raw(WORKSPACE_KEY), beforeAdmin = storage.raw(ADMIN_KEY);
  storage.resetWriteHistory();
  storage.failNext(ADMIN_KEY);
  const result = context.COPDoc.transfer.applyImport(parsed, ["leads", "officers"]);
  const workspace = storage.json(WORKSPACE_KEY, emptyWorkspace());
  const admin = storage.json(ADMIN_KEY, { officers: [] });
  const leadPersisted = !!workspace.leads.lead_partial_import;
  const officerPersisted = (admin.officers || []).some(
    (row) => row && row.officerId === "ofc_partial_import"
  );
  const writes = storage.history(), domainWrites = writes.filter(row => row.key === WORKSPACE_KEY || row.key === ADMIN_KEY);
  if (!leadPersisted || officerPersisted || domainWrites.length !== 2 || domainWrites[1].key !== ADMIN_KEY || !domainWrites[1].failed) {
    throw new Error("The import probe did not stop on its actual second domain-store write.");
  }
  const journal = storage.json(IMPORT_JOURNAL_KEY, { transactions: {} });
  const pending = journal.transactions[result.transactionId];
  const journalBeforeWrites = writes[0] && writes[0].key === IMPORT_JOURNAL_KEY;
  const exactBeforeImages = !!pending && pending.plan.changes.some(row => row.key === WORKSPACE_KEY && row.before === beforeWorkspace) &&
    pending.plan.changes.some(row => row.key === ADMIN_KEY && row.before === beforeAdmin);
  const resumed = runtime();
  const recovery = await resumed.COPDoc.importWorkflow.resume(result.transactionId);
  const afterRecovery = storage.dump();
  const repeat = await resumed.COPDoc.importWorkflow.resume(result.transactionId);
  const finalWorkspace = storage.json(WORKSPACE_KEY, emptyWorkspace());
  const finalAdmin = storage.json(ADMIN_KEY, { officers: [] });
  const finalJournal = storage.json(IMPORT_JOURNAL_KEY, { transactions: {} });
  const exactlyOnce = Object.keys(finalWorkspace.leads).filter(id => id === "lead_partial_import").length === 1 &&
    Object.keys(finalWorkspace.people).filter(id => id === "p_partial_import").length === 1 &&
    finalAdmin.officers.filter(row => row.officerId === "ofc_partial_import").length === 1;
  const completed = finalJournal.transactions[result.transactionId] && finalJournal.transactions[result.transactionId].status === "COMPLETED";
  const repeatReadOnly = JSON.stringify(afterRecovery) === JSON.stringify(storage.dump());
  const recoverySafe = result.ok === false && journalBeforeWrites && exactBeforeImages && recovery.ok && repeat.ok && exactlyOnce && completed && repeatReadOnly;
  return {
    reproduced: !recoverySafe,
    observed: {
      error: result.error,
      reportedAdded: result.added,
      leadPersisted,
      officerPersisted,
      failedDomainWrite: domainWrites[1].key,
      journalBeforeWrites,
      exactBeforeImages,
      resumeOk: recovery.ok,
      repeatOk: repeat.ok,
      exactlyOnce,
      completed,
      repeatReadOnly,
      resumeError: recovery.error || ""
    }
  };
}

function fledNarrativeFixture() {
  const storage = createMemoryStorage();
  const tab = loadModelTab(storage, { console: quietConsole() });
  loadScript(tab.context, "functions/encounter-narrative.js");
  const person = tab.model.createPerson({
    personId: "p_fled_narrative",
    name: { lastName: "FLED", firstName: "TEST" }
  });
  requireOk(tab.model.store.upsertPerson(person), "Person save");
  const encounter = tab.model.createEncounterRecord({ encounterId: "enc_fled_narrative" });
  encounter.startedAt = "2026-09-05T10:00";
  encounter.subjects = [
    tab.model.encounterSubjectFromPerson(person, {
      subjectId: "sub_fled_narrative",
      encounterRole: "TARGET",
      outcome: "FLED_FOOT"
    })
  ];
  requireOk(tab.model.store.saveEncounter(encounter, { mode: "commit" }), "Encounter save");
  return {
    storage,
    tab,
    person,
    sourceSubject: encounter.subjects[0],
    bundle: tab.context.COPDoc.encounterNarrative.bundleFromEncounter(encounter.encounterId)
  };
}

function probeNarrativeOutcome() {
  const fixture = fledNarrativeFixture();
  const participant = fixture.bundle.participants[0] || {};
  return {
    reproduced:
      fixture.sourceSubject.outcome === "FLED_FOOT" && participant.finalOutcome === "ARRESTED",
    observed: {
      sourceOutcome: fixture.sourceSubject.outcome,
      narrativeOutcome: participant.finalOutcome
    }
  };
}

function probeNarrativeIdentity() {
  const fixture = fledNarrativeFixture();
  const participant = fixture.bundle.participants[0] || {};
  return {
    reproduced:
      participant.encounterParticipantId !== fixture.sourceSubject.subjectId &&
      participant.personId !== fixture.person.personId,
    observed: {
      sourceSubjectId: fixture.sourceSubject.subjectId,
      narrativeParticipantId: participant.encounterParticipantId,
      sourcePersonId: fixture.person.personId,
      narrativePersonId: participant.personId
    }
  };
}

function probeNarrativeMixedParticipants() {
  const storage = createMemoryStorage();
  const tab = loadModelTab(storage, { console: quietConsole() });
  loadScript(tab.context, "functions/encounter-narrative.js");
  const booked = tab.model.createPerson({
    personId: "p_booked_narrative",
    name: { lastName: "BOOKED", firstName: "TEST" }
  });
  const unbooked = tab.model.createPerson({
    personId: "p_unbooked_narrative",
    name: { lastName: "UNBOOKED", firstName: "TEST" }
  });
  requireOk(tab.model.store.upsertPerson(booked), "booked Person save");
  requireOk(tab.model.store.upsertPerson(unbooked), "unbooked Person save");
  const encounter = tab.model.createEncounterRecord({ encounterId: "enc_mixed_narrative" });
  encounter.startedAt = "2026-09-05T11:00";
  encounter.subjects = [
    tab.model.encounterSubjectFromPerson(booked, {
      subjectId: "sub_booked_narrative",
      encounterRole: "TARGET",
      outcome: "ARRESTED",
      bookinRecordId: "bk_mixed_narrative"
    }),
    tab.model.encounterSubjectFromPerson(unbooked, {
      subjectId: "sub_unbooked_narrative",
      encounterRole: "COLLATERAL",
      outcome: "RELEASED"
    })
  ];
  requireOk(tab.model.store.saveEncounter(encounter, { mode: "commit" }), "Encounter save");
  storage.setRaw(BOOKIN_KEY, [
    {
      id: "bk_mixed_narrative",
      encounterId: encounter.encounterId,
      personId: booked.personId,
      lastName: "BOOKED",
      firstName: "TEST",
      encounterRole: "TARGET",
      formState: {}
    }
  ]);
  const bundle = tab.context.COPDoc.encounterNarrative.bundleFromEncounter(encounter.encounterId);
  return {
    reproduced: encounter.subjects.length === 2 && bundle.participants.length === 1,
    observed: {
      encounterSubjectCount: encounter.subjects.length,
      linkedPacketCount: 1,
      narrativeParticipantCount: bundle.participants.length,
      narrativeParticipantIds: bundle.participants.map((row) => row.encounterParticipantId)
    }
  };
}

function probeOverlappingTabWrite() {
  const storage = createMemoryStorage();
  const tabA = loadModelTab(storage, { console: quietConsole() });
  const tabB = loadModelTab(storage, { console: quietConsole() });
  const encounterId = "enc_overlapping_tabs";
  requireOk(
    tabA.model.store.saveEncounter({
      encounterId,
      subjects: [],
      vehicles: [],
      locations: [],
      links: [],
      narratives: []
    }),
    "initial Encounter save"
  );
  let tabBResult = null;
  const tabAResult = tabA.model.store.updateEncounter(encounterId, (record) => {
    tabBResult = tabB.model.store.updateEncounter(encounterId, (otherRecord) => {
      otherRecord.savedByTabB = "B";
      return otherRecord;
    });
    record.savedByTabA = "A";
    return record;
  });
  const disk = storage.json(WORKSPACE_KEY, {});
  const saved = disk.encounters[encounterId];
  const bothReportedSuccess = !!(
    tabAResult && tabAResult.ok && tabBResult && tabBResult.ok
  );
  const tabAValue = saved.savedByTabA || "";
  const tabBValue = saved.savedByTabB || "";
  return {
    reproduced: bothReportedSuccess && tabAValue === "A" && tabBValue !== "B",
    observed: {
      tabAReportedSuccess: !!(tabAResult && tabAResult.ok),
      tabBReportedSuccess: !!(tabBResult && tabBResult.ok),
      tabAValueOnDisk: tabAValue,
      tabBValueOnDisk: tabBValue
    }
  };
}

const probes = {
  "S0-PERSON-001": probePersonEncounterLoss,
  "S0-OBJECT-001": probeVehicleRollback,
  "S0-OBJECT-002": probeLocationRollback,
  "S0-STORAGE-001": probeFailedFirstWritePhantom,
  "S0-BOOKIN-001": probePartialBookIn,
  "S0-BOOKIN-002": probeBookInDeleteEncounterResidue,
  "S0-BOOKIN-003": probeBookInDeleteArrestResidue,
  "S0-IMPORT-001": probePartialImport,
  "S0-NARRATIVE-001": probeNarrativeOutcome,
  "S0-NARRATIVE-002": probeNarrativeIdentity,
  "S0-NARRATIVE-003": probeNarrativeMixedParticipants,
  "S0-CONCURRENCY-001": probeOverlappingTabWrite
};

async function main() {
let unexpected = 0;
let reproduced = 0;
let resolved = 0;

resolvedRiskIds.forEach((riskId) => {
  if (!baseline.risks.some((risk) => risk.id === riskId)) {
    unexpected += 1;
    console.error("HARNESS_ERROR", riskId, "Resolution manifest references an unknown risk.");
  }
});

for (const risk of baseline.risks) {
  const probe = probes[risk.id];
  if (!probe) {
    unexpected += 1;
    console.error("HARNESS_ERROR", risk.id, "No probe is registered.");
    continue;
  }
  try {
    const result = await probe();
    if (resolvedRiskIds.has(risk.id)) {
      if (!result.reproduced) {
        resolved += 1;
        console.log(
          "KNOWN_RISK_RESOLVED",
          risk.id,
          "-",
          risk.title,
          JSON.stringify(result.observed)
        );
        continue;
      }
      unexpected += 1;
      console.error(
        "RESOLVED_RISK_REGRESSED",
        risk.id,
        "-",
        risk.title,
        JSON.stringify(result.observed)
      );
      continue;
    }
    if (result.reproduced) {
      reproduced += 1;
      const prefix = strict ? "STRICT_FAILURE" : "KNOWN_RISK_REPRODUCED";
      console.log(prefix, risk.id, "-", risk.title, JSON.stringify(result.observed));
      continue;
    }
    if (strict) {
      console.log(
        "STRICT_PASS",
        risk.id,
        "-",
        risk.title,
        JSON.stringify(result.observed)
      );
      continue;
    }
    unexpected += 1;
    console.error(
      "KNOWN_RISK_NOT_REPRODUCED",
      risk.id,
      "-",
      risk.title,
      JSON.stringify(result.observed)
    );
  } catch (error) {
    unexpected += 1;
    console.error(
      "HARNESS_ERROR",
      risk.id,
      error && error.stack ? error.stack : String(error)
    );
  }
}

const expected = baseline.risks.length;
const expectedResolved = resolvedRiskIds.size;
const expectedReproduced = expected - expectedResolved;
if (strict) {
  if (reproduced || unexpected) {
    console.error(
      "STAGE0_STRICT_FAILED",
      reproduced + " known risk(s) reproduced; " + unexpected + " probe error/change(s)."
    );
    process.exit(1);
  }
  console.log("STAGE0_STRICT_PASSED", expected + " integrity invariants passed.");
} else if (
  unexpected ||
  reproduced !== expectedReproduced ||
  resolved !== expectedResolved
) {
  console.error(
    "STAGE0_CHARACTERIZATION_FAILED",
    reproduced + "/" + expectedReproduced + " expected risks reproduced; " +
      resolved + "/" + expectedResolved + " planned risks resolved; " +
      unexpected + " unexpected result(s)."
  );
  process.exit(1);
} else {
  console.log(
    "STAGE0_CHARACTERIZATION_PASSED",
    reproduced + "/" + expectedReproduced + " remaining risks reproduced and " +
      resolved + "/" + expectedResolved + " planned risks stayed resolved in isolated memory."
  );
}

}

main().catch(error => { console.error(error); process.exitCode = 1; });
