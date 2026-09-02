"use strict";

var fs = require("fs");
var path = require("path");
var vm = require("vm");

var context = {
  window: {},
  localStorage: (function () {
    var mem = {};
    return {
      getItem: function (k) {
        return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null;
      },
      setItem: function (k, v) {
        mem[k] = String(v);
      }
    };
  })()
};
context.globalThis = context;
context.window = context;
vm.createContext(context);

function load(rel) {
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, "..", rel), "utf8"),
    context
  );
}

load("functions/model/util.js");
load("functions/model/lead.js");
load("functions/model/person.js");
load("functions/model/encounter.js");
load("functions/model/location.js");
load("functions/model/vehicle.js");
load("functions/model/business.js");
load("functions/model/entity.js");
load("functions/model/officer.js");
load("data/association-matrix.js");
load("functions/model/link.js");
load("functions/model/investigation.js");
load("functions/model/store.js");
load("functions/model/media.js");
load("functions/officer-roster.js");
load("functions/plate-parse.js");

var model = context.COPDoc.model;
var fail = 0;

function check(label, ok, extra) {
  if (!ok) {
    fail += 1;
    console.log("FAIL", label, extra || "");
  } else {
    console.log("ok", label);
  }
}

var blank = model.createLeadSnapshot();
check("schema id", blank.schema === "copdocx.lead.v1");
check("subject exists", !!blank.subjectPersonId && !!blank.person);
check("empty name ok", blank.person.name.lastName === "");
check("person owns locations", Array.isArray(blank.person.locations));
check("empty vehicles", blank.vehicles.length === 0);
check("empty links", blank.links.length === 0);
check("empty history", Array.isArray(blank.history) && blank.history.length === 0);
check("not marked complete", blank.meta.markedComplete === false);
check("new lead is draft", blank.meta.status === "draft");
check("new lead has no assigned officer", blank.assignedOfficerId === "");
check(
  "history event has officer fields",
  model.createHistoryEvent().officerAlias === "" &&
    model.createHistoryEvent().officerId === ""
);

var aliasOfc = {
  firstName: "Maria",
  middleName: "",
  lastName: "Reyes",
  badge: "4421"
};
check(
  "officer alias is initials plus badge",
  context.COPDoc.officers.alias(aliasOfc) === "MR4421"
);
check(
  "officer alias includes middle initial",
  context.COPDoc.officers.alias({
    firstName: "John",
    middleName: "David",
    lastName: "Smith",
    badge: "12"
  }) === "JDS12"
);

var vehicle = model.createVehicle({
  licensePlate: "ABC123",
  registeredOwnerName: "GARCIA, LUIS"
});
check(
  "title name is a string",
  vehicle.registeredOwnerName === "GARCIA, LUIS"
);
check("vehicle owns locations", Array.isArray(vehicle.locations));

vehicle.locations.push(
  model.createLocation({
    street: "100 Main",
    association: "plate-check"
  })
);
check(
  "plate-check is on the vehicle",
  vehicle.locations[0].association === "plate-check"
);

var link = model.createLink({
  from: { type: "VEHICLE", id: vehicle.vehicleId },
  to: { type: "PERSON", id: blank.subjectPersonId },
  reasons: ["REGISTERED_OWNER", "SAME_ADDRESS_AS_RO"],
  notes: "Title name differs from canonical"
});
check("link does not change title name", vehicle.registeredOwnerName === "GARCIA, LUIS");
check("link has multiple reasons", link.reasons.length === 2);

model.store.loadFromDisk();
var saved = model.store.saveLead(blank);
check("save empty lead", saved.ok === true, saved);
blank.assignedOfficerId = "ofc_test";
model.store.saveLead(blank, { mode: "commit" });
check(
  "save keeps assigned officer",
  model.store.getLead(blank.leadId).assignedOfficerId === "ofc_test"
);
check(
  "list includes untitled",
  model.store.listLeads()[0].label === "Untitled case"
);

var loaded = model.store.getLead(blank.leadId);
check(
  "roundtrip person",
  loaded.person.personId === blank.subjectPersonId
);

blank.person.name.lastName = "SMITH";
blank.person.name.firstName = "BOB";
model.store.saveLead(blank);
check(
  "registry has subject",
  model.store.getPerson(blank.subjectPersonId).name.lastName === "SMITH"
);

var otherLead = model.createLeadSnapshot();
otherLead.person.name.lastName = "PEREZ";
otherLead.person.name.firstName = "ANA";
model.store.saveLead(otherLead);
check(
  "other saved person is linkable",
  model.store.allPeople().some(function (p) {
    return p.personId === otherLead.subjectPersonId;
  })
);

check(
  "label format",
  model.formatPersonLabel(otherLead.person) === "PEREZ, ANA"
);

var committed = model.store.getLead(blank.leadId);
check(
  "explicit saveLead commits",
  committed.meta.status === "committed" && !!committed.meta.committedAt
);

var draftSnap = model.createLeadSnapshot();
draftSnap.person.name.lastName = "DRAFT";
model.store.saveLead(draftSnap, { mode: "draft" });
check(
  "draft save remembers people",
  !!model.store.getPerson(draftSnap.subjectPersonId)
);
check(
  "draft status",
  model.store.getLead(draftSnap.leadId).meta.status === "draft"
);

var keepAt = committed.meta.committedAt;
model.store.saveLead(
  {
    leadId: committed.leadId,
    person: committed.person,
    meta: { createdAt: "old", updatedAt: "old", markedComplete: false }
  },
  { mode: "draft" }
);
var demoted = model.store.getLead(committed.leadId);
check(
  "draft of committed keeps committedAt",
  demoted.meta.status === "draft" && demoted.meta.committedAt === keepAt
);

var migrated = model.ensureRecordMeta({
  id: "veh-1",
  plate: "ABC",
  status: "available"
});
check(
  "fleet status is not meta",
  migrated.meta.status === "committed" && migrated.status === "available"
);

var ofc = model.createOfficer({
  lastName: "REYES",
  firstName: "Maria",
  address: {
    street: "1 Main",
    city: "Dallas",
    state: "TX",
    locationAssociation: "residence"
  }
});
check("officer entity", ofc.entityType === "OFFICER" && !!ofc.officerId && ofc.id === ofc.officerId);
check(
  "officer dual-writes location",
  ofc.locations[0] && ofc.locations[0].city === "Dallas"
);
check(
  "officer label",
  model.formatPersonLabel(ofc) === "REYES, Maria"
);
check("officer city helper", model.officerCity(ofc) === "Dallas");

var staleOfc = model.createOfficer({
  lastName: "LEE",
  firstName: "Sam",
  address: { street: "9 Pine", city: "Austin", state: "TX" },
  locations: [
    { street: "1 Main", city: "Dallas", state: "TX", association: "residence" }
  ]
});
model.syncOfficerPlaces(staleOfc);
check(
  "officer address overwrites stale location",
  staleOfc.locations[0] && staleOfc.locations[0].city === "Austin"
);
check(
  "officerAddress follows synced address",
  model.officerAddress(staleOfc).city === "Austin"
);

check(
  "recordsForEncounter filters by id",
  model.recordsForEncounter(
    [
      { id: "a", encounterId: "E1" },
      { id: "b", encounterId: "E2" },
      { id: "c", encounterId: "E1" }
    ],
    "E1"
  ).length === 2
);
check(
  "recordsForEncounter empty without id",
  model.recordsForEncounter([{ id: "a", encounterId: "E1" }], "").length === 0
);

var caseVeh = model.createVehicle({ licensePlate: "XYZ999" });
check("case vehicle is not gov", caseVeh.governmentVehicle === false && caseVeh.status === "");
check("case vehicle aliases id", !!caseVeh.vehicleId && caseVeh.id === caseVeh.vehicleId);

var rapWarrant = model.createWarrant({
  charge: "FTA",
  warrantNumber: "CR-1"
});
check("rap warrant has empty formType", rapWarrant.formType === "");
check(
  "rap is not issued form",
  model.isIssuedWarrant(rapWarrant) === false
);

var i200 = model.createWarrant({
  formType: "I-200",
  fileNo: "A000 111 222",
  pdfFileName: "I-200_GARCIA_LUIS_A000111222_20260830.pdf",
  office: "ERO Dallas",
  officerName: "REYES, Maria",
  officerTitle: "IO",
  basis: ["the execution of a charging document to initiate removal proceedings against the subject"],
  issuedAt: "2026-08-30T12:00:00.000Z",
  warrantStatus: "active"
});
check("issued I-200 formType", i200.formType === "I-200" && model.isIssuedWarrant(i200));
check("issued warrant keeps RAP fields", i200.warrantStatus === "active" && !!i200.warrantId);

var mixedPerson = model.createPerson();
mixedPerson.warrants = [rapWarrant, i200];
check(
  "issuedWarrants filters RAP",
  model.issuedWarrants(mixedPerson).length === 1 &&
    model.issuedWarrants(mixedPerson)[0].formType === "I-200"
);

var issuedLead = model.createLeadSnapshot();
issuedLead.person.name.lastName = "GARCIA";
issuedLead.person.name.firstName = "LUIS";
issuedLead.person.warrants = [i200];
model.store.saveLead(issuedLead, { mode: "commit" });
var reloaded = model.store.getLead(issuedLead.leadId);
reloaded.person.warrants.push(
  model.createWarrant({ formType: "I-205", fileNo: "A000 111 222" })
);
model.store.saveLead(reloaded, { mode: "commit" });
var afterIssue = model.store.getLead(issuedLead.leadId);
check(
  "issue writeback stays committed",
  afterIssue.meta.status === "committed" && !!afterIssue.meta.committedAt
);
check(
  "issue writeback keeps both forms",
  model.issuedWarrants(afterIssue.person).length === 2
);

var personFields = model.createPerson({
  lexId: "LEX-9",
  immigration: {
    firstDeportationDate: "2019-01-02",
    lastDeportationDate: "2024-06-15"
  }
});
check("person lexId", personFields.lexId === "LEX-9");
check(
  "person deportation dates",
  personFields.immigration.firstDeportationDate === "2019-01-02" &&
    personFields.immigration.lastDeportationDate === "2024-06-15"
);
check("person baseballCards array", Array.isArray(personFields.immigration.baseballCards));

var bbcLead = model.createLeadSnapshot();
bbcLead.person.lexId = "LEX-9";
bbcLead.person.immigration.firstDeportationDate = "2019-01-02";
bbcLead.person.immigration.lastDeportationDate = "2024-06-15";
bbcLead.person.immigration.finalOrderDate = "2018-12-01";
bbcLead.person.immigration.baseballCards = [
  model.createBaseballCard({ text: "ICE Dallas arrested ...", disposition: "REINST" })
];
model.store.saveLead(bbcLead, { mode: "commit" });
var bbcStored = model.store.getLead(bbcLead.leadId);
check(
  "lead save keeps lexId and deportation dates",
  bbcStored.person.lexId === "LEX-9" &&
    bbcStored.person.immigration.firstDeportationDate === "2019-01-02" &&
    bbcStored.person.immigration.lastDeportationDate === "2024-06-15"
);
check(
  "lead save keeps baseballCards",
  bbcStored.person.immigration.baseballCards.length === 1 &&
    bbcStored.person.immigration.baseballCards[0].text.indexOf("ICE Dallas") !== -1
);
bbcStored.person.immigration.alienNumber = "A000111222";
model.store.saveLead(bbcStored, { mode: "commit" });
var bbcAgain = model.store.getLead(bbcLead.leadId);
check(
  "later commit keeps baseballCards",
  bbcAgain.person.immigration.baseballCards.length === 1 &&
    bbcAgain.meta.status === "committed"
);

var govVeh = model.createVehicle({ governmentVehicle: true, unit: "U-1" });
check(
  "gov vehicle defaults fleet status",
  govVeh.governmentVehicle === true && govVeh.status === "available"
);

check(
  "encounter id format",
  /^DAL\d+-\d{8}-\d{3}$/.test(model.nextEncounterId({ team: 3, existingIds: [] }))
);
check(
  "encounter id sequences",
  model.nextEncounterId({
    team: 3,
    date: new Date(2026, 7, 31),
    existingIds: ["DAL3-20260831-001"]
  }) === "DAL3-20260831-002"
);
check(
  "encounter id is per team",
  model.nextEncounterId({
    team: 4,
    date: new Date(2026, 7, 31),
    existingIds: ["DAL3-20260831-001"]
  }) === "DAL4-20260831-001"
);

var enc = model.createEncounterRecord({
  existingIds: [],
  date: new Date(2026, 7, 31)
});
check(
  "encounter id minted",
  typeof enc.encounterId === "string" && /^DAL3-\d{8}-\d{3}$/.test(enc.encounterId)
);
check("encounter entity", enc.entityType === "ENCOUNTER");
check("encounter schema", enc.schema === "copdocx.encounter.v1");
check("new encounter is draft", enc.meta.status === "draft");
check(
  "encounter empty collections",
  enc.subjects.length === 0 &&
    enc.vehicles.length === 0 &&
    enc.locations.length === 0 &&
    enc.links.length === 0 &&
    enc.narratives.length === 0
);
check(
  "encounter subject factory",
  model.createEncounterSubject({ lastName: "LOKI" }).lastName === "LOKI"
);
check(
  "encounter subject role default",
  model.createEncounterSubject().encounterRole === ""
);

model.store.saveEncounter(enc, { mode: "draft" });
check(
  "draft encounter listed",
  model.store.listEncounters().some(function (row) {
    return row.encounterId === enc.encounterId;
  })
);
check(
  "draft encounter status",
  model.store.getEncounter(enc.encounterId).meta.status === "draft"
);

enc.startedAt = "2026-08-30T12:00";
enc.subjects.push(
  model.createEncounterSubject({
    lastName: "LOKI",
    firstName: "Laufeyson",
    alienNumber: "A000111222"
  })
);
model.store.saveEncounter(enc, { mode: "commit" });
var savedEnc = model.store.getEncounter(enc.encounterId);
check(
  "commit encounter",
  savedEnc.meta.status === "committed" && !!savedEnc.meta.committedAt
);
check(
  "commit keeps subject",
  savedEnc.subjects[0] && savedEnc.subjects[0].lastName === "LOKI"
);

savedEnc.vehicles.push(
  model.createVehicle({
    licensePlate: "AAA111",
    locations: [model.createLocation({ street: "9 Pine", city: "Austin" })]
  })
);
savedEnc.links.push(
  model.createLink({
    from: { type: "VEHICLE", id: savedEnc.vehicles[0].vehicleId },
    to: { type: "PERSON", id: "p_link" },
    reasons: ["REGISTERED_OWNER"]
  })
);
model.store.saveEncounter(savedEnc, { mode: "commit" });
var keptVeh = model.store.getEncounter(enc.encounterId);
check(
  "encounter keeps vehicle locations",
  keptVeh.vehicles[0] &&
    keptVeh.vehicles[0].locations[0] &&
    keptVeh.vehicles[0].locations[0].street === "9 Pine"
);
check(
  "encounter keeps vehicle links",
  keptVeh.links[0] && keptVeh.links[0].to.id === "p_link"
);

var keepEncAt = keptVeh.meta.committedAt;
model.store.saveEncounter(
  { encounterId: enc.encounterId, startedAt: "2026-08-30T13:00" },
  { mode: "draft" }
);
var demotedEnc = model.store.getEncounter(enc.encounterId);
check(
  "draft of committed encounter keeps committedAt",
  demotedEnc.meta.status === "draft" && demotedEnc.meta.committedAt === keepEncAt
);
check(
  "draft merge keeps subjects",
  demotedEnc.subjects[0] && demotedEnc.subjects[0].lastName === "LOKI"
);

load("functions/encounter-narrative.js");
var bundle = context.COPDoc.encounterNarrative.bundleFromEncounter(enc.encounterId);
check("narrative adapter returns bundle", !!(bundle && bundle.encounter));
check(
  "narrative adapter uses encounter id",
  bundle.encounter.encounterId === enc.encounterId
);
check(
  "narrative adapter maps subject",
  bundle.participants[0] &&
    String(bundle.participants[0].identitySnapshot.displayName).indexOf("LOKI") !== -1
);

context.localStorage.setItem(
  "alien-book-in.saved-records.v1",
  JSON.stringify([
    {
      id: "bk_c",
      encounterId: enc.encounterId,
      lastName: "COLL",
      firstName: "B",
      encounterRole: "COLLATERAL"
    },
    {
      id: "bk_t",
      encounterId: enc.encounterId,
      lastName: "TARGET",
      firstName: "A",
      encounterRole: "TARGET"
    }
  ])
);
var roleBundle = context.COPDoc.encounterNarrative.bundleFromEncounter(
  enc.encounterId
);
check(
  "adapter keeps collateral role",
  roleBundle.participants[0] &&
    roleBundle.participants[0].encounterRole === "COLLATERAL"
);
check(
  "adapter primary is first target",
  roleBundle.participants[1] &&
    roleBundle.participants[1].encounterRole === "TARGET" &&
    roleBundle.participants[1].primaryForReport === true &&
    roleBundle.participants[0].primaryForReport === false
);

context.localStorage.setItem(
  "alien-book-in.saved-records.v1",
  JSON.stringify([
    {
      id: "bk_live",
      encounterId: enc.encounterId,
      lastName: "LOKI",
      firstName: "Laufeyson",
      aNumber: "A000111001",
      iceEvent: "DAL-1",
      encounterRole: "TARGET",
      formState: {
        lastName: { value: "LOKI", type: "text" },
        firstName: { value: "Laufeyson", type: "text" },
        alienNumber: { value: "A000111001", type: "text" },
        dateOfBirth: { value: "1985-12-17", type: "date" },
        sexMale: { checked: true, value: "male", type: "radio" },
        citizenship: { value: "MX", type: "select-one" },
        iceEvent: { value: "DAL-1", type: "text" },
        officersName: { value: "REYES, Maria", type: "text" },
        dateTime: { value: "2026-08-31T13:22", type: "datetime-local" },
        cash: { value: "40", type: "text" },
        medicine: { value: "ibuprofen", type: "text" },
        children: { value: "none", type: "textarea" },
        medicalIssues: { value: "", type: "text" },
        travelDocs: { value: "passport", type: "text" }
      }
    },
    {
      id: "bk_col",
      encounterId: enc.encounterId,
      lastName: "WALK",
      firstName: "In",
      encounterRole: "COLLATERAL",
      formState: {
        lastName: { value: "WALK", type: "text" },
        firstName: { value: "In", type: "text" },
        sexFemale: { checked: true, value: "female", type: "radio" }
      }
    }
  ])
);
enc.vehicles = [
  {
    vehicleId: "veh_1",
    licensePlate: "ABC123",
    plateState: "TX",
    vehicleYear: "2018",
    vehicleMake: "Honda",
    vehicleModel: "Civic",
    vehicleColor: "Blue"
  }
];
enc.locations = [
  {
    locationId: "loc_1",
    street: "100 Main",
    city: "Dallas",
    state: "TX",
    zip: "75201",
    association: "stop",
    latitude: "32.78",
    longitude: "-96.8"
  }
];
model.store.saveEncounter(enc, { mode: "commit" });
var liveBundle = context.COPDoc.encounterNarrative.bundleFromEncounter(
  enc.encounterId
);
check(
  "live target identity from book-in",
  liveBundle.participants[0].identitySnapshot.displayName.indexOf("LOKI") !== -1 &&
    liveBundle.participants[0].identitySnapshot.aNumber === "000111001" &&
    liveBundle.participants[0].identitySnapshot.sex === "MALE"
);
check(
  "live role sequence per role",
  liveBundle.participants[0].roleSequence === 1 &&
    liveBundle.participants[0].encounterRole === "TARGET" &&
    liveBundle.participants[1].encounterRole === "COLLATERAL" &&
    liveBundle.participants[1].roleSequence === 1
);
check(
  "live ice event and arrest time",
  liveBundle.participants[0].iceEventNumber === "DAL-1" &&
    String(liveBundle.participants[0].finalOutcomeAt).indexOf("2026-08-31") !== -1
);
check(
  "live closing from book-in",
  liveBundle.participants[0].closing.medication === "ibuprofen" &&
    liveBundle.participants[0].closing.currency &&
    String(liveBundle.participants[0].closing.currency.amountUsd) === "40"
);
check(
  "live location and plate",
  liveBundle.location.postalAddress.city === "Dallas" &&
    liveBundle.location.locationTypeCode === "PUBLIC_ROADWAY" &&
    liveBundle.vehicles[0].plate.value === "ABC123" &&
    liveBundle.encounter.eventType === "VEHICLE_STOP"
);
check(
  "live reporting officer",
  liveBundle.officers[0] &&
    liveBundle.officers[0].displayName.indexOf("REYES") !== -1 &&
    liveBundle.officers[0].roles[0] === "REPORTING"
);
check("live has no events", liveBundle.events.length === 0);

enc.narratives = [{ narrativeId: "nar_x", iceEventNumber: "DAL-1" }];
enc.supervisorSummary = { text: "Supervisor line.", derivedAt: "2026-08-31T00:00:00.000Z" };
model.store.saveEncounter(enc, { mode: "commit" });
var withNar = model.store.getEncounter(enc.encounterId);
check(
  "encounter persists narratives",
  withNar.narratives[0] && withNar.narratives[0].narrativeId === "nar_x"
);
check(
  "encounter persists supervisor summary",
  withNar.supervisorSummary &&
    withNar.supervisorSummary.text === "Supervisor line."
);

var blankCrim = model.createPerson();
var blankProfile = model.deriveCriminalProfile(blankCrim);
check("blank person is not criminal", blankProfile.isCriminal === false);
check("blank threat is none", blankProfile.threatLevel === "none");

var convPerson = model.createPerson();
convPerson.convictions.push(
  model.createConviction({ crime: "Theft", convictionClass: "misdemeanor" })
);
var convProfile = model.deriveCriminalProfile(convPerson);
check("conviction sets isCriminal", convProfile.isCriminal === true);
check("misdemeanor threat is low", convProfile.threatLevel === "low");

var felonyPerson = model.createPerson();
felonyPerson.convictions.push(
  model.createConviction({
    crime: "Aggravated assault",
    convictionClass: "felony"
  })
);
check(
  "felony threat is moderate",
  model.deriveCriminalProfile(felonyPerson).threatLevel === "moderate"
);

var armedPerson = model.createPerson();
armedPerson.convictions.push(
  model.createConviction({
    crime: "Unlawful possession of a firearm",
    convictionClass: "felony"
  })
);
var armedProfile = model.deriveCriminalProfile(armedPerson);
check("firearm conviction is not currently armed", armedProfile.armed === false);
check("firearm felony stays moderate", armedProfile.threatLevel === "moderate");

var nowArmed = model.createPerson();
nowArmed.arrests.push(
  model.createArrest({ arrestCharge: "Subject is armed and dangerous" })
);
check(
  "current armed language sets armed",
  model.deriveCriminalProfile(nowArmed).armed === true
);

var registerPerson = model.createPerson();
registerPerson.convictions.push(
  model.createConviction({ crime: "Failure to register", convictionClass: "misdemeanor" })
);
check(
  "failure to register is not sex offender",
  model.deriveCriminalProfile(registerPerson).sexOffender === false
);

var soRegister = model.createPerson();
soRegister.convictions.push(
  model.createConviction({
    crime: "Failure to register as a sex offender",
    convictionClass: "felony"
  })
);
check(
  "sex offender failure to register is severe",
  model.deriveCriminalProfile(soRegister).sexOffender === true &&
    model.deriveCriminalProfile(soRegister).threatLevel === "severe"
);

var soPerson = model.createPerson();
soPerson.convictions.push(
  model.createConviction({ crime: "Sexual assault", convictionClass: "felony" })
);
check(
  "sex offense is severe",
  model.deriveCriminalProfile(soPerson).sexOffender === true &&
    model.deriveCriminalProfile(soPerson).threatLevel === "severe"
);

var fugPerson = model.createPerson();
fugPerson.arrests.push(
  model.createArrest({ arrestCharge: "Foreign fugitive, Interpol red notice" })
);
var fugProfile = model.deriveCriminalProfile(fugPerson);
check("arrest does not set isCriminal", fugProfile.isCriminal === false);
check("fugitive from arrest text", fugProfile.foreignFugitive === true);
check("fugitive threat is severe", fugProfile.threatLevel === "severe");

var warPerson = model.createPerson();
warPerson.warrants.push(
  model.createWarrant({ charge: "Burglary", warrantStatus: "active" })
);
warPerson.warrants.push(
  model.createWarrant({ formType: "I-200", charge: "Immigration", warrantStatus: "active" })
);
var warProfile = model.deriveCriminalProfile(warPerson);
check("RAP warrant sets hasCriminalWarrants", warProfile.hasCriminalWarrants === true);
check("I-200 is not a criminal warrant", warProfile.isCriminal === false);
check("active RAP warrant threat moderate", warProfile.threatLevel === "moderate");

var servedPerson = model.createPerson();
servedPerson.warrants.push(
  model.createWarrant({ charge: "Theft", warrantStatus: "served" })
);
check(
  "served warrant does not flag outstanding",
  model.deriveCriminalProfile(servedPerson).hasCriminalWarrants === false
);

check("csvCell prefixes equals", model.csvCell("=1+1") === "'=1+1");
check("csvCell prefixes plus", model.csvCell("+cmd") === "'+cmd");
check("csvCell prefixes minus", model.csvCell("-1") === "'-1");
check("csvCell prefixes at", model.csvCell("@SUM(A1)") === "'@SUM(A1)");
check("csvCell quotes comma", model.csvCell("GARCIA, LUIS") === '"GARCIA, LUIS"');
check(
  "html is active markup",
  model.isActiveMarkupFile("note.html", "text/html") === true
);
check(
  "svg is active markup",
  model.isActiveMarkupFile("pic.svg", "image/svg+xml") === true
);
check(
  "pdf is not markup",
  model.isActiveMarkupFile("scan.pdf", "application/pdf") === false
);

var caseAlpha = model.createLeadSnapshot();
caseAlpha.person.name.lastName = "ALPHA";
caseAlpha.person.name.firstName = "CASE";
model.store.saveLead(caseAlpha, { mode: "commit" });
var caseBravo = model.createLeadSnapshot();
caseBravo.person.name.lastName = "BRAVO";
caseBravo.person.name.firstName = "CASE";
caseBravo.links = [
  model.createLink({
    from: { type: "PERSON", id: caseBravo.subjectPersonId },
    to: { type: "PERSON", id: caseAlpha.subjectPersonId },
    reasons: ["ASSOCIATE"]
  })
];
model.store.saveLead(caseBravo, { mode: "commit" });
var caseAlphaTwin = model.createLeadSnapshot();
caseAlphaTwin.subjectPersonId = caseAlpha.subjectPersonId;
caseAlphaTwin.person = model.store.getPerson(caseAlpha.subjectPersonId);
model.store.saveLead(caseAlphaTwin, { mode: "commit" });
var caseAlphaDraft = model.createLeadSnapshot();
caseAlphaDraft.subjectPersonId = caseAlpha.subjectPersonId;
caseAlphaDraft.person = model.store.getPerson(caseAlpha.subjectPersonId);
model.store.saveLead(caseAlphaDraft, { mode: "draft" });
var emptyRelated = model.store.relatedCommittedCases("", caseAlpha.leadId);
check(
  "related cases empty person",
  emptyRelated.asSubject.length === 0 && emptyRelated.asAssociate.length === 0
);
var relatedAlpha = model.store.relatedCommittedCases(
  caseAlpha.subjectPersonId,
  caseAlpha.leadId
);
check(
  "same subject other committed case",
  relatedAlpha.asSubject.some(function (row) {
    return row.leadId === caseAlphaTwin.leadId;
  })
);
check(
  "draft twin is not a jump",
  !relatedAlpha.asSubject.some(function (row) {
    return row.leadId === caseAlphaDraft.leadId;
  })
);
check(
  "inbound person link is an associate case",
  relatedAlpha.asAssociate.some(function (row) {
    return row.leadId === caseBravo.leadId;
  })
);
check(
  "related cases exclude self",
  !relatedAlpha.asSubject.some(function (row) {
    return row.leadId === caseAlpha.leadId;
  }) &&
    !relatedAlpha.asAssociate.some(function (row) {
      return row.leadId === caseAlpha.leadId;
    })
);
var relatedFromBravo = model.store.relatedCommittedCases(
  caseAlpha.subjectPersonId,
  caseBravo.leadId
);
check(
  "linked person is subject of committed case",
  relatedFromBravo.asSubject.some(function (row) {
    return row.leadId === caseAlpha.leadId;
  })
);
var relatedBravo = model.store.relatedCommittedCases(
  caseBravo.subjectPersonId,
  caseBravo.leadId
);
check("bravo has no other subject case", relatedBravo.asSubject.length === 0);
check(
  "bravo is not an associate on alpha",
  !relatedBravo.asAssociate.some(function (row) {
    return row.leadId === caseAlpha.leadId;
  })
);

var fullCase = model.createLeadSnapshot();
fullCase.person.name.lastName = "FULL";
fullCase.person.name.firstName = "AUDIT";
fullCase.person.lexId = "LEX-9";
fullCase.person.citizenship = "MX";
fullCase.person.locations = [
  model.createLocation({
    street: "10 Oak",
    city: "Dallas",
    state: "TX",
    association: "residence",
    targetPriority: "1",
    pinColor: "#112233"
  })
];
fullCase.person.warrants = [
  model.createWarrant({ charge: "Theft", warrantStatus: "active" }),
  model.createWarrant({
    formType: "I-200",
    charge: "Immigration",
    warrantStatus: "active",
    fileNo: "A123456789",
    pdfFileName: "I-200_FULL_AUDIT.pdf",
    issuedAt: "2026-08-01T00:00:00.000Z"
  })
];
fullCase.person.immigration.alienNumber = "A123456789";
fullCase.person.immigration.baseballCards = [
  model.createBaseballCard({ text: "card", disposition: "removed" })
];
fullCase.person.immigration.firstDeportationDate = "2019-01-01";
fullCase.person.criminal.fbiNumber = "123456A";
fullCase.person.convictions.push(
  model.createConviction({ crime: "Theft", convictionClass: "misdemeanor" })
);
model.deriveCriminalProfile(fullCase.person);
var auditVehicle = model.createVehicle({
  licensePlate: "AUDIT1",
  plateState: "TX",
  governmentVehicle: false
});
auditVehicle.locations = [
  model.createLocation({
    street: "Lot 4",
    city: "Dallas",
    state: "TX",
    association: "known-parking",
    pinColor: "#abcdef"
  })
];
fullCase.vehicles = [auditVehicle];
fullCase.links = [
  model.createLink({
    from: { type: "VEHICLE", id: auditVehicle.vehicleId },
    to: { type: "PERSON", id: fullCase.subjectPersonId },
    reasons: ["REGISTERED_OWNER"],
    notes: "Title name differs"
  }),
  model.createLink({
    from: { type: "PERSON", id: fullCase.subjectPersonId },
    to: { type: "PERSON", id: caseBravo.subjectPersonId },
    reasons: ["ASSOCIATE"],
    notes: "From Accurint"
  })
];
fullCase.history = [
  model.createHistoryEvent({ text: "Opened from RAP", type: "note" })
];
fullCase.followUps = [{ followUpId: "fu_1", text: "Call analyst" }];
fullCase.source.caseNumber = "DAL-88";
model.store.saveLead(fullCase, { mode: "commit" });

function casePatch(leadId, mutator) {
  var snap = model.store.getLead(leadId);
  mutator(snap, model);
  return model.store.saveLead(snap, { mode: "commit" });
}

var beforeLookup = JSON.stringify(model.store.getLead(fullCase.leadId).links);
model.store.relatedCommittedCases(fullCase.subjectPersonId, fullCase.leadId);
check(
  "related lookup does not mutate links",
  JSON.stringify(model.store.getLead(fullCase.leadId).links) === beforeLookup
);

casePatch(fullCase.leadId, function (snap) {
  snap.person.name.middleName = "Q";
  snap.person.immigration.disposition = "removed";
  snap.person.criminal.ncicNumber = "NCIC-1";
  snap.history.push(
    model.createHistoryEvent({ text: "Case view note", type: "note" })
  );
  snap.links.push(
    model.createLink({
      from: { type: "PERSON", id: snap.subjectPersonId },
      to: { type: "PERSON", id: caseAlpha.subjectPersonId },
      reasons: ["KNOWN_ASSOCIATE"]
    })
  );
});

var afterPatch = model.store.getLead(fullCase.leadId);
var afterPerson = model.subjectOf(afterPatch);
check("case patch keeps subjectPersonId", afterPatch.subjectPersonId === fullCase.subjectPersonId);
check("case patch keeps schema", afterPatch.schema === model.SCHEMA);
check(
  "case patch keeps issued I-200",
  afterPerson.warrants.some(function (row) {
    return row.formType === "I-200" && row.fileNo === "A123456789";
  })
);
check(
  "case patch keeps RAP warrant",
  afterPerson.warrants.some(function (row) {
    return !row.formType && row.charge === "Theft";
  })
);
check(
  "case patch keeps baseballCards",
  afterPerson.immigration.baseballCards[0] &&
    afterPerson.immigration.baseballCards[0].text === "card"
);
check(
  "case patch keeps deportation date",
  afterPerson.immigration.firstDeportationDate === "2019-01-01"
);
check("case patch keeps lexId", afterPerson.lexId === "LEX-9");
check("case patch keeps fbiNumber", afterPerson.criminal.fbiNumber === "123456A");
check("case patch keeps derived criminal", afterPerson.criminal.isCriminal === true);
check(
  "case patch keeps residence pinColor",
  afterPerson.locations[0] && afterPerson.locations[0].pinColor === "#112233"
);
check(
  "case patch keeps vehicle parking pinColor",
  afterPatch.vehicles[0].locations[0].pinColor === "#abcdef"
);
check(
  "case patch keeps vehicle-person link notes",
  afterPatch.links.some(function (row) {
    return (
      row.from &&
      row.from.type === "VEHICLE" &&
      row.notes === "Title name differs"
    );
  })
);
check(
  "case patch keeps person-person notes",
  afterPatch.links.some(function (row) {
    return row.notes === "From Accurint" && row.to.id === caseBravo.subjectPersonId;
  })
);
check("case patch keeps followUps", afterPatch.followUps[0].followUpId === "fu_1");
check("case patch keeps source caseNumber", afterPatch.source.caseNumber === "DAL-88");
check(
  "case patch keeps history and appends",
  afterPatch.history.length === 2 &&
    afterPatch.history[0].text === "Opened from RAP" &&
    afterPatch.history[1].text === "Case view note"
);
check("case patch writes identity", afterPerson.name.middleName === "Q");
check(
  "people registry matches subject after commit",
  model.store.getPerson(fullCase.subjectPersonId).name.middleName === "Q"
);

var preservedHistory = afterPatch.history.slice();
var rebuilt = model.createLeadSnapshot();
rebuilt.leadId = afterPatch.leadId;
rebuilt.subjectPersonId = afterPatch.subjectPersonId;
rebuilt.person = model.createPerson({
  personId: afterPatch.subjectPersonId,
  caseRole: "LEAD",
  name: afterPerson.name,
  lexId: afterPerson.lexId,
  citizenship: afterPerson.citizenship,
  locations: afterPerson.locations.map(function (loc) {
    var copy = model.createLocation(loc);
    copy.pinColor = "";
    return copy;
  }),
  warrants: afterPerson.warrants.filter(function (row) {
    return !model.isIssuedWarrant(row);
  }),
  immigration: {
    alienNumber: afterPerson.immigration.alienNumber,
    finNumber: "",
    disposition: afterPerson.immigration.disposition,
    status: "",
    finalOrder: false,
    finalOrderDate: "",
    firstDeportationDate: afterPerson.immigration.firstDeportationDate,
    lastDeportationDate: "",
    baseballCards: []
  },
  criminal: {
    fbiNumber: afterPerson.criminal.fbiNumber,
    ncicNumber: afterPerson.criminal.ncicNumber,
    stateId: "",
    rapSheet: ""
  }
});
rebuilt.vehicles = afterPatch.vehicles;
rebuilt.links = afterPatch.links;
rebuilt.history = preservedHistory;
rebuilt.followUps = afterPatch.followUps;
rebuilt.source = afterPatch.source;
((model.store.getLead(afterPatch.leadId).person.warrants || [])
  .filter(function (row) {
    return model.isIssuedWarrant(row);
  }))
  .forEach(function (row) {
    rebuilt.person.warrants.push(row);
  });
var prevLocs = model.store.getLead(afterPatch.leadId).person.locations;
rebuilt.person.locations.forEach(function (loc) {
  prevLocs.forEach(function (prev) {
    if (loc.locationId === prev.locationId && !loc.pinColor && prev.pinColor) {
      loc.pinColor = prev.pinColor;
    }
  });
});
var prevImm = model.store.getLead(afterPatch.leadId).person.immigration;
if (prevImm.baseballCards && prevImm.baseballCards.length) {
  rebuilt.person.immigration.baseballCards = prevImm.baseballCards.slice();
}
model.deriveCriminalProfile(rebuilt.person);
model.store.saveLead(rebuilt, { mode: "commit" });
var afterForm = model.store.getLead(fullCase.leadId);
check(
  "form-style rebuild keeps issued I-200",
  afterForm.person.warrants.some(function (row) {
    return row.formType === "I-200" && row.pdfFileName === "I-200_FULL_AUDIT.pdf";
  })
);
check(
  "form-style rebuild keeps baseballCards",
  afterForm.person.immigration.baseballCards[0].text === "card"
);
check(
  "form-style rebuild keeps history notes",
  afterForm.history.length === 2
);
check(
  "form-style rebuild restores pinColor",
  afterForm.person.locations[0].pinColor === "#112233"
);
check(
  "form-style rebuild keeps person links",
  afterForm.links.filter(function (row) {
    return row.from.type === "PERSON" && row.to.type === "PERSON";
  }).length === 2
);
check("stores stay split", !afterForm.bookin && !afterForm.media);

var occLoc = model.createLocation();
check("location occupancy defaults current", occLoc.occupancy === "current");
check("location occupancy extras empty", occLoc.occupiedFrom === "" && occLoc.notes === "");
var histLoc = model.createLocation({
  occupancy: "historical",
  occupiedFrom: "2020-01-01",
  occupiedTo: "2021-06-01",
  notes: "Moved out",
  otherResidents: "GARCIA, LUIS"
});
check("historical occupancy flag", model.isHistoricalOccupancy(histLoc) === true);
check(
  "current occupancy is not historical",
  model.isHistoricalOccupancy(occLoc) === false
);
var occVeh = model.createVehicle({ governmentVehicle: false });
check("vehicle occupancy defaults current", occVeh.occupancy === "current");
var histLead = model.createLeadSnapshot();
histLead.person.locations = [histLoc, occLoc];
model.store.saveLead(histLead, { mode: "commit" });
var histSaved = model.store.getLead(histLead.leadId);
check(
  "lead keeps historical location fields",
  histSaved.person.locations[0].occupancy === "historical" &&
    histSaved.person.locations[0].otherResidents === "GARCIA, LUIS" &&
    histSaved.person.locations[1].occupancy === "current"
);

var stubLink = model.createLink({
  from: { type: "PERSON", id: histLead.subjectPersonId },
  to: { type: "BUSINESS", id: "" },
  label: "Garcia Roofing",
  otherType: "BUSINESS",
  notes: "Seen on Accurint"
});
check("unresolved association keeps empty to.id", stubLink.to.id === "");
check("unresolved association keeps label", stubLink.label === "Garcia Roofing");
check("unresolved association type", stubLink.otherType === "BUSINESS");
histLead.links = (histLead.links || []).concat([stubLink]);
model.store.saveLead(histLead, { mode: "commit" });
var stubSaved = model.store.getLead(histLead.leadId);
check(
  "lead keeps unresolved association",
  stubSaved.links.some(function (row) {
    return (
      row &&
      row.label === "Garcia Roofing" &&
      row.otherType === "BUSINESS" &&
      !row.to.id
    );
  })
);
var named = model.createAssociation({
  label: "PEREZ, ANA",
  otherType: "PERSON",
  from: { type: "PERSON", id: "p_a" },
  notes: "Roommate"
});
check(
  "createAssociation stores string person",
  named.label === "PEREZ, ANA" &&
    named.otherType === "PERSON" &&
    named.to.id === "" &&
    named.notes === "Roommate"
);

var promoSource = model.createLeadSnapshot();
promoSource.person.name.lastName = "RAMIREZ";
promoSource.person.name.firstName = "MARIA";
var janeLink = model.createLink({
  from: { type: "PERSON", id: promoSource.subjectPersonId },
  to: { type: "PERSON", id: "" },
  otherType: "PERSON",
  label: "DOE, JANE",
  reasons: ["ASSOCIATE"],
  notes: "Roommate"
});
promoSource.links = [janeLink];
model.store.saveLead(promoSource, { mode: "commit" });
var leadsBefore = model.store.listLeads().length;
var promoJane = model.store.promoteAssociateToCase(
  promoSource.leadId,
  janeLink.linkId
);
check("promote unresolved ok", promoJane.ok && !!promoJane.leadId && !promoJane.existing);
var janeCase = model.store.getLead(promoJane.leadId);
check(
  "promote lists as draft lead",
  janeCase &&
    janeCase.meta.status === "draft" &&
    model.store.listLeads().some(function (row) {
      return row.leadId === janeCase.leadId && row.metaStatus === "draft";
    }) &&
    model.store.listLeads().length === leadsBefore + 1
);
check(
  "promote parsed name",
  janeCase.person.name.lastName === "DOE" &&
    janeCase.person.name.firstName === "JANE"
);
check("promote RAP empty", (janeCase.person.arrests || []).length === 0);
var promoSourceAfter = model.store.getLead(promoSource.leadId);
check(
  "promote resolved source to.id",
  promoSourceAfter.links[0].to.id === janeCase.subjectPersonId
);
check(
  "promote reciprocal link",
  janeCase.links.some(function (row) {
    return (
      row.to &&
      row.to.id === promoSource.subjectPersonId &&
      row.from.id === janeCase.subjectPersonId
    );
  })
);
check(
  "promote history both sides",
  (promoSourceAfter.history || []).some(function (row) {
    return /DOE/.test(row.text) && row.source === "system";
  }) &&
    (janeCase.history || []).some(function (row) {
      return /RAMIREZ/.test(row.text) && row.source === "system";
    })
);

var orphan = model.createPerson({
  caseRole: "LEAD",
  name: { lastName: "ORPHAN", firstName: "PAT" },
  sex: "F",
  lexId: "LEX-O"
});
model.store.upsertPerson(orphan);
var promoOrphanSrc = model.createLeadSnapshot();
promoOrphanSrc.person.name.lastName = "HOST";
promoOrphanSrc.links = [
  model.createLink({
    from: { type: "PERSON", id: promoOrphanSrc.subjectPersonId },
    to: { type: "PERSON", id: orphan.personId },
    otherType: "PERSON",
    label: "ORPHAN, PAT"
  })
];
model.store.saveLead(promoOrphanSrc, { mode: "commit" });
var promoOrphan = model.store.promoteAssociateToCase(
  promoOrphanSrc.leadId,
  promoOrphanSrc.links[0].linkId
);
var orphanCase = model.store.getLead(promoOrphan.leadId);
check(
  "promote existing person no case",
  promoOrphan.ok &&
    orphanCase.subjectPersonId === orphan.personId &&
    orphanCase.person.lexId === "LEX-O" &&
    orphanCase.person.sex === "F" &&
    (orphanCase.person.arrests || []).length === 0
);

var reuse = model.store.promoteAssociateToCase(
  promoSource.leadId,
  janeLink.linkId
);
check(
  "promote existing subject reuses case",
  reuse.ok && reuse.existing && reuse.leadId === promoJane.leadId
);
var leadsAfterReuse = model.store.listLeads().filter(function (row) {
  return row.subjectPersonId === janeCase.subjectPersonId;
});
check("promote does not duplicate subject lead", leadsAfterReuse.length === 1);
check("reuse of draft subject stays draft", reuse.existing && janeCase.meta.status === "draft");

var bizLink = model.createLink({
  from: { type: "PERSON", id: promoSource.subjectPersonId },
  to: { type: "BUSINESS", id: "" },
  otherType: "BUSINESS",
  label: "ACME LLC"
});
promoSourceAfter = model.store.getLead(promoSource.leadId);
promoSourceAfter.links.push(bizLink);
model.store.saveLead(promoSourceAfter, { mode: "commit" });
var promoBiz = model.store.promoteAssociateToCase(
  promoSource.leadId,
  bizLink.linkId
);
check("promote rejects non-person", !promoBiz.ok && !promoBiz.leadId);

var draftSrc = model.createLeadSnapshot();
draftSrc.links = [
  model.createLink({
    from: { type: "PERSON", id: draftSrc.subjectPersonId },
    to: { type: "PERSON", id: "" },
    otherType: "PERSON",
    label: "DRAFT, BOB"
  })
];
model.store.saveLead(draftSrc, { mode: "draft" });
var promoDraft = model.store.promoteAssociateToCase(
  draftSrc.leadId,
  draftSrc.links[0].linkId
);
check("promote rejects draft source", !promoDraft.ok);

var missing = model.store.promoteAssociateToCase(promoSource.leadId, "link_nope");
check("promote rejects missing link", !missing.ok);

model.store.saveLead(model.store.getLead(promoJane.leadId), { mode: "commit" });
var committedJane = model.store.getLead(promoJane.leadId);
check("promoted lead can commit", committedJane.meta.status === "committed");
var keptCommittedAt = committedJane.meta.committedAt;
model.store.saveLead(committedJane, { mode: "draft" });
var afterDemote = model.store.getLead(promoJane.leadId);
check(
  "promoted lead draft save keeps committedAt",
  afterDemote.meta.status === "draft" &&
    afterDemote.meta.committedAt === keptCommittedAt
);

var bookinNew = model.store.promoteBookInToLead({
  lastName: "GARCIA",
  firstName: "LUIS",
  sex: "Male",
  dateOfBirth: "1990-02-01",
  citizenship: "MX",
  alienNumber: "555666777",
  disposition: "B"
});
var bookinLead = model.store.getLead(bookinNew.leadId);
var bookinPerson = model.store.getPerson(bookinNew.personId);
check(
  "book-in mints filed detainee",
  bookinNew.ok &&
    !bookinNew.existing &&
    bookinLead &&
    bookinLead.meta.status === "committed" &&
    bookinLead.caseRole === "DETAINEE" &&
    bookinLead.person.caseRole === "DETAINEE" &&
    bookinLead.person.name.lastName === "GARCIA" &&
    bookinLead.person.sex === "male" &&
    bookinLead.person.immigration.alienNumber === "555666777" &&
    bookinPerson &&
    bookinPerson.personId === bookinNew.personId
);
check(
  "book-in history notes custody",
  (bookinLead.history || []).some(function (row) {
    return /Detainee/.test(row.text) && row.source === "system";
  })
);

var bookinAgain = model.store.promoteBookInToLead({
  lastName: "GARCIA",
  firstName: "LUIS",
  alienNumber: "555-666-777"
});
check(
  "book-in reuses A-Number",
  bookinAgain.ok &&
    bookinAgain.existing &&
    bookinAgain.leadId === bookinNew.leadId &&
    bookinAgain.personId === bookinNew.personId
);

var rapLead = model.createLeadSnapshot();
rapLead.person.name.lastName = "RAMIREZ";
rapLead.person.name.firstName = "ANA";
rapLead.person.arrests = [{ arrestId: "arr_keep", offense: "theft" }];
rapLead.person.immigration.alienNumber = "999888777";
model.store.saveLead(rapLead, { mode: "commit" });
var bookinUpdate = model.store.promoteBookInToLead({
  leadId: rapLead.leadId,
  lastName: "RAMIREZ",
  firstName: "ANNA",
  sex: "female"
});
var updatedRap = model.store.getLead(rapLead.leadId);
check(
  "book-in overlays identity keeps RAP",
  bookinUpdate.ok &&
    bookinUpdate.existing &&
    updatedRap.person.name.firstName === "ANNA" &&
    updatedRap.person.caseRole === "DETAINEE" &&
    updatedRap.caseRole === "DETAINEE" &&
    updatedRap.person.arrests.length === 1 &&
    updatedRap.person.arrests[0].offense === "theft"
);

var bookinEmpty = model.store.promoteBookInToLead({});
check(
  "book-in empty identity rejected",
  !bookinEmpty.ok && !bookinEmpty.leadId
);

var historyCount = (updatedRap.history || []).filter(function (row) {
  return /Detainee/.test(row.text);
}).length;
model.store.promoteBookInToLead({
  leadId: rapLead.leadId,
  lastName: "RAMIREZ",
  firstName: "ANNA"
});
var afterSecond = model.store.getLead(rapLead.leadId);
var historyCountAfter = (afterSecond.history || []).filter(function (row) {
  return /Detainee/.test(row.text);
}).length;
check("book-in does not repeat custody note", historyCountAfter === historyCount);

var invDate = new Date(2026, 8, 2);
var invId = model.nextInvestigationId({
  team: 3,
  date: invDate,
  existingIds: []
});
check("investigation id format", invId === "INV3-20260902-001");
check(
  "investigation id sequences",
  model.nextInvestigationId({
    team: 3,
    date: invDate,
    existingIds: [invId]
  }) === "INV3-20260902-002"
);
check(
  "investigation id is per team",
  model.nextInvestigationId({
    team: 4,
    date: invDate,
    existingIds: [invId]
  }) === "INV4-20260902-001"
);
var inv = model.createInvestigation({
  kind: "tag",
  existingIds: [],
  date: invDate,
  team: 3
});
check("investigation entity", inv.entityType === "INVESTIGATION");
var wallNode = model.createInvestigationNode({
  objectType: "VEHICLE",
  objectId: "veh_wall",
  x: 40,
  y: 90
});
check(
  "node stores wall position",
  wallNode.x === 40 && wallNode.y === 90
);
check("investigation schema", inv.schema === "copdocx.investigation.v1");
check("new investigation is draft", inv.meta.status === "draft");
check("investigation kind tag", inv.kind === "tag" && inv.mode === "bulk");
check(
  "investigation id does not collide with encounter prefix",
  inv.investigationId.indexOf("DAL") !== 0 &&
    inv.investigationId.indexOf("INV") === 0
);
model.store.saveInvestigation(inv, { mode: "draft" });
check(
  "draft investigation listed",
  model.store.listInvestigations().some(function (row) {
    return row.investigationId === inv.investigationId && row.metaStatus === "draft";
  })
);
var invBad = model.store.saveInvestigation(
  { investigationId: "INV3-20260902-009", kind: "nope" },
  { mode: "commit" }
);
check("investigation rejects unknown kind", !invBad.ok);
model.store.saveInvestigation(inv, { mode: "commit" });
check(
  "commit investigation",
  model.store.getInvestigation(inv.investigationId).meta.status === "committed"
);
var elite = model.createInvestigation({ kind: "elite", team: 3, date: invDate });
check("elite kind has no plate mode", elite.kind === "elite" && elite.mode === "");
check(
  "plate-check add defaults to vehicle",
  model.defaultInvestigationAddType("tag", "") === "VEHICLE" &&
    model.investigationAddTypes("", "tag")[0] === "VEHICLE"
);
check(
  "plate-check from person prefers vehicle",
  model.defaultInvestigationAddType("tag", "PERSON") === "VEHICLE"
);
check(
  "plate-check from vehicle adds person",
  model.defaultInvestigationAddType("tag", "VEHICLE") === "PERSON" &&
    model.investigationAddTypes("VEHICLE", "tag").indexOf("VEHICLE") === -1
);
check(
  "elite add defaults to person",
  model.defaultInvestigationAddType("elite", "") === "PERSON"
);

var platesApi = context.COPDoc.plates;
var parsed = platesApi.parse("TX ABC1234\nWXYZ123 CA\nTX-HELLO1");
check(
  "parse state then plate",
  parsed.kept === 3 &&
    parsed.rows[0].state === "TX" &&
    parsed.rows[0].plate === "ABC1234"
);
check(
  "parse plate then state",
  parsed.rows[1].state === "CA" && parsed.rows[1].plate === "WXYZ123"
);
check(
  "parse dashed state-plate",
  parsed.rows[2].state === "TX" && parsed.rows[2].plate === "HELLO1"
);
var mixed = platesApi.parse("ABC1234 TX, TX DEF5678;\nTX ABC1234");
check(
  "parse mixed separators and dupes",
  mixed.kept === 2 && mixed.dupes === 1 && mixed.bad === 0
);
var skipped = platesApi.parse("\n\n***\n");
check("parse skips empty and junk", skipped.kept === 0 && skipped.bad >= 1);
var queued = platesApi.parse("TX ABC1234", ["TX|ABC1234"]);
check("parse respects existing keys", queued.kept === 0 && queued.dupes === 1);
var plt = model.createInvestigationPlate({ plate: "ab-c12", state: "tx" });
check(
  "plate factory normalizes",
  plt.plate === "ABC12" && plt.state === "TX" && plt.status === "new"
);

var leadsBeforePromo = model.store.listLeads().length;
var invPlate = model.createInvestigation({
  kind: "tag",
  team: 3,
  date: invDate,
  existingIds: [inv.investigationId]
});
var hitPlate = model.createInvestigationPlate({
  plate: "HELLO1",
  state: "TX",
  status: "hit"
});
invPlate.plates = [hitPlate];
model.store.saveInvestigation(invPlate, { mode: "draft" });
var promoPlate = model.store.promoteInvestigationPlate(
  invPlate.investigationId,
  hitPlate.plateId
);
var promoInv = model.store.getInvestigation(invPlate.investigationId);
var promoVeh = model.store.getVehicleRecord(promoPlate.vehicleId);
check(
  "promote plate mints vehicle",
  promoPlate.ok &&
    promoVeh &&
    promoVeh.licensePlate === "HELLO1" &&
    promoVeh.plateState === "TX" &&
    !promoVeh.governmentVehicle
);
check(
  "promote plate marks queue",
  promoInv.plates[0].status === "promoted" &&
    promoInv.plates[0].vehicleId === promoPlate.vehicleId
);
check(
  "promote plate adds node and focus",
  promoInv.nodes.length === 1 &&
    promoInv.nodes[0].objectType === "VEHICLE" &&
    promoInv.nodes[0].objectId === promoPlate.vehicleId &&
    promoInv.focusNodeId === promoInv.nodes[0].nodeId
);
check(
  "promote plate does not mint a case",
  model.store.listLeads().length === leadsBeforePromo
);
var invPlate2 = model.createInvestigation({
  kind: "tag",
  team: 3,
  date: invDate,
  existingIds: [inv.investigationId, invPlate.investigationId]
});
var hitPlate2 = model.createInvestigationPlate({
  plate: "HELLO1",
  state: "TX",
  status: "new"
});
invPlate2.plates = [hitPlate2];
model.store.saveInvestigation(invPlate2, { mode: "draft" });
var promoPlate2 = model.store.promoteInvestigationPlate(
  invPlate2.investigationId,
  hitPlate2.plateId
);
check(
  "promote reuses vehicle by plate",
  promoPlate2.ok && promoPlate2.vehicleId === promoPlate.vehicleId
);
var discardInv = model.createInvestigation({
  kind: "tag",
  team: 3,
  date: invDate,
  existingIds: [
    inv.investigationId,
    invPlate.investigationId,
    invPlate2.investigationId
  ]
});
var discarded = model.createInvestigationPlate({
  plate: "NOPE1",
  state: "TX",
  status: "discarded"
});
discardInv.plates = [discarded];
model.store.saveInvestigation(discardInv, { mode: "draft" });
var promoDiscard = model.store.promoteInvestigationPlate(
  discardInv.investigationId,
  discarded.plateId
);
check("promote rejects discarded plate", !promoDiscard.ok);

var leadsBeforeAdd = model.store.listLeads().length;
var addRo = model.store.addInvestigationObject(invPlate.investigationId, {
  objectType: "PERSON",
  name: { lastName: "Vennweb", firstName: "Platecheck" },
  reason: "REGISTERED_OWNER_OF"
});
var afterRo = model.store.getInvestigation(invPlate.investigationId);
var roPerson = model.store.getPerson(addRo.objectId);
check(
  "add person from vehicle",
  addRo.ok &&
    !addRo.reused &&
    addRo.objectType === "PERSON" &&
    roPerson &&
    roPerson.name.lastName === "Vennweb" &&
    roPerson.caseRole === ""
);
check(
  "add person node, link, and focus",
  afterRo.nodes.length === 2 &&
    afterRo.links.length === 1 &&
    afterRo.links[0].from.type === "PERSON" &&
    afterRo.links[0].to.type === "VEHICLE" &&
    afterRo.links[0].reasons[0] === "REGISTERED_OWNER_OF" &&
    afterRo.focusNodeId === addRo.nodeId
);
check(
  "add person does not mint a case",
  model.store.listLeads().length === leadsBeforeAdd
);
var addRoAgain = model.store.addInvestigationObject(invPlate.investigationId, {
  fromNodeId: afterRo.nodes.filter(function (row) {
    return row.objectType === "VEHICLE";
  })[0].nodeId,
  objectType: "PERSON",
  name: "Vennweb, Platecheck",
  reason: "REGISTERED_OWNER_OF"
});
var afterRoAgain = model.store.getInvestigation(invPlate.investigationId);
check(
  "reuse person by name",
  addRoAgain.ok && addRoAgain.reused && addRoAgain.objectId === addRo.objectId
);
check("reuse person does not duplicate link", afterRoAgain.links.length === 1);

var addPark = model.store.addInvestigationObject(invPlate.investigationId, {
  fromNodeId: afterRo.nodes.filter(function (row) {
    return row.objectType === "VEHICLE";
  })[0].nodeId,
  objectType: "LOCATION",
  street: "100 Main St",
  city: "Dallas",
  state: "TX",
  zip: "75201",
  reason: "VEHICLE_PARKING"
});
var parkLoc = model.store.getLocationRecord(addPark.objectId);
check(
  "add parking location",
  addPark.ok &&
    !addPark.reused &&
    parkLoc &&
    parkLoc.street === "100 Main St" &&
    parkLoc.city === "Dallas"
);
var addParkAgain = model.store.addInvestigationObject(invPlate.investigationId, {
  fromNodeId: afterRo.nodes.filter(function (row) {
    return row.objectType === "VEHICLE";
  })[0].nodeId,
  objectType: "LOCATION",
  street: "100 Main St",
  city: "Dallas",
  state: "TX",
  zip: "75201"
});
check(
  "reuse location by address",
  addParkAgain.ok && addParkAgain.reused && addParkAgain.objectId === addPark.objectId
);

var addVehReuse = model.store.addInvestigationObject(invPlate.investigationId, {
  fromNodeId: addRo.nodeId,
  objectType: "VEHICLE",
  licensePlate: "HELLO1",
  plateState: "TX"
});
check(
  "reuse vehicle by plate",
  addVehReuse.ok &&
    addVehReuse.reused &&
    addVehReuse.objectId === promoPlate.vehicleId
);
var addVehNew = model.store.addInvestigationObject(invPlate.investigationId, {
  fromNodeId: addRo.nodeId,
  objectType: "VEHICLE",
  licensePlate: "zzz-999",
  plateState: "tx"
});
var extraVeh = model.store.getVehicleRecord(addVehNew.objectId);
check(
  "add another vehicle to person",
  addVehNew.ok &&
    !addVehNew.reused &&
    extraVeh &&
    extraVeh.licensePlate === "ZZZ999" &&
    extraVeh.plateState === "TX" &&
    !extraVeh.governmentVehicle
);

var emptyPerson = model.store.addInvestigationObject(invPlate.investigationId, {
  objectType: "PERSON",
  name: { lastName: "", firstName: "" },
  x: 120,
  y: 80
});
check(
  "empty person mints on wall",
  emptyPerson.ok && emptyPerson.nodeId
);
var emptyPersonNode = model.store
  .getInvestigation(invPlate.investigationId)
  .nodes.filter(function (row) {
    return row.nodeId === emptyPerson.nodeId;
  })[0];
check(
  "placed node keeps x y",
  emptyPersonNode && emptyPersonNode.x === 120 && emptyPersonNode.y === 80
);

var eliteAdd = model.createInvestigation({
  kind: "elite",
  team: 3,
  date: invDate,
  existingIds: [
    inv.investigationId,
    invPlate.investigationId,
    invPlate2.investigationId,
    discardInv.investigationId
  ]
});
model.store.saveInvestigation(eliteAdd, { mode: "draft" });
var seedPerson = model.store.addInvestigationObject(eliteAdd.investigationId, {
  objectType: "PERSON",
  name: { lastName: "Ortiz", firstName: "Ana" }
});
var eliteFresh = model.store.getInvestigation(eliteAdd.investigationId);
check(
  "add first object without focus",
  seedPerson.ok &&
    !seedPerson.linkId &&
    eliteFresh.nodes.length === 1 &&
    eliteFresh.focusNodeId === seedPerson.nodeId &&
    eliteFresh.links.length === 0
);

var noFocusInv = model.createInvestigation({
  kind: "tag",
  team: 3,
  date: invDate,
  existingIds: [
    inv.investigationId,
    invPlate.investigationId,
    invPlate2.investigationId,
    discardInv.investigationId,
    eliteAdd.investigationId
  ]
});
model.store.saveInvestigation(noFocusInv, { mode: "draft" });
check(
  "spawn requires focus",
  !model.store.spawnInvestigation(noFocusInv.investigationId).ok
);

var parentBeforeSpawn = model.store.getInvestigation(invPlate.investigationId);
var parentVehNode = parentBeforeSpawn.nodes.filter(function (row) {
  return row.objectType === "VEHICLE" && row.objectId === promoPlate.vehicleId;
})[0];
parentBeforeSpawn.focusNodeId = parentVehNode.nodeId;
model.store.saveInvestigation(parentBeforeSpawn, { mode: "draft" });
var parentNodeCount = parentBeforeSpawn.nodes.length;
var parentPlateCount = (parentBeforeSpawn.plates || []).length;
var leadsBeforeSpawn = model.store.listLeads().length;
var spawned = model.store.spawnInvestigation(invPlate.investigationId);
var childInv = model.store.getInvestigation(spawned.investigationId);
var parentAfterSpawn = model.store.getInvestigation(invPlate.investigationId);
var childIds = (childInv.nodes || []).map(function (row) {
  return row.objectType + "|" + row.objectId;
}).sort();
var childNodeIds = (childInv.nodes || []).map(function (row) {
  return row.nodeId;
});
var parentNodeIds = (parentAfterSpawn.nodes || []).map(function (row) {
  return row.nodeId;
});
check(
  "spawn child from focused vehicle",
  spawned.ok &&
    childInv.parentInvestigationId === invPlate.investigationId &&
    childInv.kind === "tag" &&
    (childInv.plates || []).length === 0 &&
    parentPlateCount > 0
);
check(
  "spawn copies 1-hop neighborhood",
  childInv.nodes.length === 3 &&
    childIds.indexOf("VEHICLE|" + promoPlate.vehicleId) !== -1 &&
    childIds.indexOf("PERSON|" + addRo.objectId) !== -1 &&
    childIds.indexOf("LOCATION|" + addPark.objectId) !== -1
);
check(
  "spawn shares object ids, new node ids",
  childInv.nodes.some(function (row) {
    return row.objectId === promoPlate.vehicleId && parentNodeIds.indexOf(row.nodeId) === -1;
  }) &&
    childNodeIds.every(function (id) {
      return parentNodeIds.indexOf(id) === -1;
    })
);
check(
  "spawn does not clone parent nodes or plates",
  parentAfterSpawn.nodes.length === parentNodeCount &&
    (parentAfterSpawn.plates || []).length === parentPlateCount
);
check(
  "spawn does not mint a case",
  model.store.listLeads().length === leadsBeforeSpawn
);
check(
  "spawn notes parent and child history",
  (parentAfterSpawn.history || []).some(function (row) {
    return String(row.text || "").indexOf(childInv.investigationId) !== -1;
  }) &&
    (childInv.history || []).some(function (row) {
      return String(row.text || "").indexOf(invPlate.investigationId) !== -1;
    })
);
check(
  "spawn copies wall position",
  childInv.nodes.some(function (row) {
    var parent = parentAfterSpawn.nodes.filter(function (n) {
      return n.objectType === row.objectType && n.objectId === row.objectId;
    })[0];
    return parent && row.x === parent.x && row.y === parent.y;
  })
);
var related = model.store.listRelatedInvestigations(invPlate.investigationId);
var parentHulls = model.investigationHulls(parentAfterSpawn, related);
check(
  "parent hull covers child overlap",
  parentHulls.some(function (hull) {
    return (
      hull.relation === "child" &&
      hull.investigationId === childInv.investigationId &&
      hull.nodeIds.length >= 1
    );
  })
);
var childRelated = model.store.listRelatedInvestigations(childInv.investigationId);
var childHulls = model.investigationHulls(childInv, childRelated);
check(
  "child hull covers parent overlap",
  childHulls.some(function (hull) {
    return hull.relation === "parent" && hull.nodeIds.length >= 1;
  })
);
var overlapCounts = model.investigationOverlapCounts(parentAfterSpawn, related);
check(
  "overlap counts shared nodes",
  Object.keys(overlapCounts).length >= 1
);
var eliteSpawn = model.store.spawnInvestigation(eliteAdd.investigationId);
var eliteChild = model.store.getInvestigation(eliteSpawn.investigationId);
check(
  "spawn solitary object shares person",
  eliteSpawn.ok &&
    eliteChild.nodes.length === 1 &&
    eliteChild.nodes[0].objectId === seedPerson.objectId &&
    eliteChild.kind === "elite" &&
    eliteChild.links.length === 0
);
var blankVeh = model.store.addInvestigationObject(eliteChild.investigationId, {
  objectType: "VEHICLE"
});
var blankRec = model.store.getVehicleRecord(blankVeh.objectId);
check(
  "add vehicle without plate mints card",
  blankVeh.ok &&
    !blankVeh.reused &&
    blankRec &&
    blankRec.licensePlate === "" &&
    !blankRec.governmentVehicle
);
var wallLink = model.store.connectInvestigationNodes(
  eliteChild.investigationId,
  eliteChild.nodes[0].nodeId,
  blankVeh.nodeId,
  "REGISTERED_OWNER_OF"
);
var wallLinked = model.store.getInvestigation(eliteChild.investigationId);
check(
  "connect wall nodes",
  wallLink.ok &&
    wallLinked.links.length === 1 &&
    wallLinked.links[0].from.type === "PERSON" &&
    wallLinked.links[0].to.type === "VEHICLE"
);
var blankLoc = model.store.addInvestigationObject(eliteChild.investigationId, {
  objectType: "LOCATION",
  x: 200,
  y: 40
});
check("empty location mints on wall", blankLoc.ok);
var plexSrc = model.store.getInvestigation(eliteChild.investigationId);
var plexPerson = plexSrc.nodes.filter(function (row) {
  return row.objectType === "PERSON";
})[0];
plexSrc.focusNodeId = plexPerson.nodeId;
model.store.saveInvestigation(plexSrc, { mode: "draft" });
plexSrc = model.store.getInvestigation(eliteChild.investigationId);
var plex = model.investigationPlex(plexSrc);
var plexVeh = plexSrc.nodes.filter(function (row) {
  return row.objectId === blankVeh.objectId;
})[0];
var plexLoc = plexSrc.nodes.filter(function (row) {
  return row.objectId === blankLoc.objectId;
})[0];
check(
  "plex includes focus and one-hop",
  plex.active &&
    plex.nodeIds[plexPerson.nodeId] &&
    plexVeh &&
    plex.nodeIds[plexVeh.nodeId]
);
check("plex excludes unlinked object", plexLoc && !plex.nodeIds[plexLoc.nodeId]);
check(
  "plex idle without focus",
  !model.investigationPlex({
    nodes: plexSrc.nodes,
    links: plexSrc.links,
    focusNodeId: ""
  }).active
);
check(
  "outline match empty query",
  model.investigationOutlineMatch("", { objectType: "VEHICLE" }, { title: "TX HELLO1" })
);
check(
  "outline match plate",
  model.investigationOutlineMatch("hello", { objectType: "VEHICLE" }, {
    title: "TX HELLO1",
    kind: "Vehicle"
  })
);
check(
  "outline match kind",
  model.investigationOutlineMatch("person", { objectType: "PERSON" }, {
    kind: "Person",
    title: "Ortiz, Ana"
  })
);
check(
  "outline match AND tokens",
  model.investigationOutlineMatch("tx hello", { objectType: "VEHICLE" }, {
    title: "TX HELLO1",
    kind: "Vehicle"
  })
);
check(
  "outline match extra vin",
  model.investigationOutlineMatch("1HGCM", { objectType: "VEHICLE" }, {
    title: "Vehicle",
    extra: "1HGCM82633A004352 Honda"
  })
);
check(
  "outline miss other title",
  !model.investigationOutlineMatch("garcia", { objectType: "VEHICLE" }, {
    title: "TX HELLO1",
    kind: "Vehicle"
  })
);
check(
  "outline hit promoted vehicle",
  model.investigationOutlineIsHit(
    { objectType: "VEHICLE", objectId: "v_hit" },
    { plates: [{ vehicleId: "v_hit", status: "promoted" }] }
  )
);
check(
  "outline hit ignores person",
  !model.investigationOutlineIsHit(
    { objectType: "PERSON", objectId: "v_hit" },
    { plates: [{ vehicleId: "v_hit", status: "promoted" }] }
  )
);
check(
  "outline hit status hit",
  model.investigationOutlineIsHit(
    { objectType: "VEHICLE", objectId: "v_hit2" },
    { plates: [{ vehicleId: "v_hit2", status: "hit" }] }
  )
);
check(
  "outline hit skips discarded",
  !model.investigationOutlineIsHit(
    { objectType: "VEHICLE", objectId: "v_miss" },
    { plates: [{ vehicleId: "v_miss", status: "discarded" }] }
  )
);
check(
  "outline kind label",
  model.investigationObjectKindLabel("VEHICLE") === "Vehicle" &&
    model.investigationObjectKindLabel("ENTITY") === "Entity"
);
check(
  "media owners include wall objects",
  (model.MEDIA_OWNER_TYPES || []).indexOf("PERSON") !== -1 &&
    (model.MEDIA_OWNER_TYPES || []).indexOf("VEHICLE") !== -1 &&
    (model.MEDIA_OWNER_TYPES || []).indexOf("LOCATION") !== -1 &&
    (model.MEDIA_OWNER_TYPES || []).indexOf("BUSINESS") !== -1 &&
    (model.MEDIA_OWNER_TYPES || []).indexOf("ENTITY") !== -1
);
check(
  "find match stays bright",
  !model.investigationChipDim({ filterOn: true, matches: true, plexActive: true, inPlex: false })
);
check(
  "find miss dims even in plex",
  model.investigationChipDim({ filterOn: true, matches: false, plexActive: true, inPlex: true })
);
check(
  "plex dims without find",
  model.investigationChipDim({ filterOn: false, matches: true, plexActive: true, inPlex: false })
);
check(
  "plex neighbor stays bright without find",
  !model.investigationChipDim({ filterOn: false, matches: true, plexActive: true, inPlex: true })
);

var reuseA = model.store.addInvestigationObject(eliteChild.investigationId, {
  objectType: "VEHICLE",
  licensePlate: "WALL1",
  plateState: "TX",
  x: 0,
  y: 0
});
var reuseB = model.store.addInvestigationObject(eliteChild.investigationId, {
  objectType: "VEHICLE",
  fromNodeId: "",
  x: 10,
  y: 10
});
var reuseRec = model.store.getVehicleRecord(reuseB.objectId);
reuseRec.licensePlate = "WALL1";
reuseRec.plate = "WALL1";
reuseRec.plateState = "TX";
model.store.saveVehicleRecord(reuseRec, { mode: "commit" });
var reused = model.store.reuseInvestigationIdentity(
  eliteChild.investigationId,
  reuseB.nodeId
);
check(
  "reuse vehicle by plate",
  reused.ok && reused.reused && reused.objectId === reuseA.objectId
);
var afterReuse = model.store.getInvestigation(eliteChild.investigationId);
var wall1Nodes = afterReuse.nodes.filter(function (row) {
  return row.objectType === "VEHICLE" && row.objectId === reuseA.objectId;
});
check("reuse collapses duplicate vehicle node", wall1Nodes.length === 1);
check(
  "reuse drops abandoned vehicle record",
  !model.store.getVehicleRecord(reuseB.objectId)
);
var wallIntegrity = model.store.investigationIntegrity(eliteChild.investigationId);
check("wall integrity after reuse", wallIntegrity.ok);
var crossPlate = model.store.addInvestigationObject(eliteChild.investigationId, {
  objectType: "VEHICLE",
  licensePlate: "XWALL9",
  plateState: "TX",
  fromNodeId: "",
  x: 8,
  y: 8
});
var crossEmpty = model.store.addInvestigationObject(childInv.investigationId, {
  objectType: "VEHICLE",
  fromNodeId: "",
  x: 9,
  y: 9
});
var crossRec = model.store.getVehicleRecord(crossEmpty.objectId);
crossRec.licensePlate = "XWALL9";
crossRec.plate = "XWALL9";
crossRec.plateState = "TX";
model.store.saveVehicleRecord(crossRec, { mode: "commit" });
var crossReuse = model.store.reuseInvestigationIdentity(
  childInv.investigationId,
  crossEmpty.nodeId
);
var childAfterCross = model.store.getInvestigation(childInv.investigationId);
var parentAfterCross = model.store.getInvestigation(eliteChild.investigationId);
check(
  "reuse retargets sibling walls to kept id",
  crossReuse.ok &&
    crossReuse.reused &&
    crossReuse.objectId === crossPlate.objectId &&
    childAfterCross.nodes.some(function (row) {
      return row.objectType === "VEHICLE" && row.objectId === crossPlate.objectId;
    }) &&
    parentAfterCross.nodes.some(function (row) {
      return row.objectType === "VEHICLE" && row.objectId === crossPlate.objectId;
    })
);
check(
  "reuse drops loser used on another wall",
  !model.store.getVehicleRecord(crossEmpty.objectId)
);

var cutId = (afterReuse.links[0] && afterReuse.links[0].linkId) || "";
var cut = model.store.disconnectInvestigationLink(eliteChild.investigationId, cutId);
check(
  "disconnect wall link",
  cut.ok &&
    !model.store.getInvestigation(eliteChild.investigationId).links.some(function (row) {
      return row.linkId === cutId;
    })
);

var shop = model.createBusiness({ name: "Acme Towing" });
check(
  "business factory",
  shop.entityType === "BUSINESS" && shop.name === "Acme Towing"
);
var crew = model.createCustomEntity({ name: "South Crew", kind: "crew" });
check(
  "custom entity label",
  model.formatEntityLabel(crew) === "South Crew (crew)"
);
var bizAdd = model.store.addInvestigationObject(eliteChild.investigationId, {
  objectType: "BUSINESS",
  name: "Acme Towing",
  fromNodeId: "",
  x: 400,
  y: 40
});
check(
  "add business on wall",
  bizAdd.ok &&
    model.store.getBusinessRecord(bizAdd.objectId).name === "Acme Towing"
);
var personOnWall = model.store
  .getInvestigation(eliteChild.investigationId)
  .nodes.filter(function (row) {
    return row.objectType === "PERSON";
  })[0];
var bizLink = model.store.connectInvestigationNodes(
  eliteChild.investigationId,
  personOnWall.nodeId,
  bizAdd.nodeId,
  "EMPLOYED_BY"
);
var bizLinked = model.store.getInvestigation(eliteChild.investigationId);
check(
  "link person to business",
  bizLink.ok &&
    bizLinked.links.some(function (row) {
      return (
        row.from.type === "PERSON" &&
        row.to.type === "BUSINESS" &&
        row.reasons[0] === "EMPLOYED_BY"
      );
    })
);
var bizDup = model.store.addInvestigationObject(eliteChild.investigationId, {
  objectType: "BUSINESS",
  name: "Acme Towing",
  fromNodeId: ""
});
check(
  "reuse business by name",
  bizDup.ok && bizDup.reused && bizDup.objectId === bizAdd.objectId
);
var entAdd = model.store.addInvestigationObject(eliteChild.investigationId, {
  objectType: "ENTITY",
  name: "South Crew",
  kind: "crew",
  fromNodeId: ""
});
check(
  "add custom entity",
  entAdd.ok &&
    model.store.getEntityRecord(entAdd.objectId).kind === "crew"
);

var wallCaseInv = model.store.getInvestigation(eliteChild.investigationId);
var wallPersonForCase = wallCaseInv.nodes.filter(function (row) {
  return row.objectType === "PERSON";
})[0];
var wallVehForCase = wallCaseInv.nodes.filter(function (row) {
  return row.objectType === "VEHICLE";
})[0];
var wallNodeCountBeforeCase = wallCaseInv.nodes.length;
var wallLinkCountBeforeCase = (wallCaseInv.links || []).length;
wallCaseInv.focusNodeId = wallPersonForCase.nodeId;
model.store.saveInvestigation(wallCaseInv, { mode: "draft" });
var leadsBeforeWallCase = model.store.listLeads().length;
var openedWallCase = model.store.promoteInvestigationPersonToCase(
  eliteChild.investigationId
);
var openedWallLead = model.store.getLead(openedWallCase.leadId);
var wallPersonAfter = model.store.getPerson(wallPersonForCase.objectId);
var wallAfterCase = model.store.getInvestigation(eliteChild.investigationId);
check(
  "promote wall person mints working lead",
  openedWallCase.ok &&
    !openedWallCase.existing &&
    openedWallLead &&
    openedWallLead.meta.status === "draft" &&
    model.store.listLeads().length === leadsBeforeWallCase + 1
);
check(
  "promote wall person keeps same person id",
  openedWallLead.subjectPersonId === wallPersonForCase.objectId &&
    wallPersonAfter &&
    wallPersonAfter.personId === openedWallLead.subjectPersonId
);
check(
  "promote wall person identity only",
  openedWallLead.person.name.lastName === "Ortiz" &&
    openedWallLead.person.name.firstName === "Ana" &&
    openedWallLead.caseRole === "LEAD" &&
    (openedWallLead.person.arrests || []).length === 0 &&
    (openedWallLead.links || []).length === 0
);
check(
  "promote wall person notes both sides",
  (openedWallLead.history || []).some(function (row) {
    return (
      String(row.text || "").indexOf(eliteChild.investigationId) !== -1 &&
      row.source === "system"
    );
  }) &&
    (wallAfterCase.history || []).some(function (row) {
      return /Ortiz/i.test(row.text) && row.source === "system";
    })
);
check(
  "promote wall person leaves the graph",
  wallAfterCase.nodes.length === wallNodeCountBeforeCase &&
    (wallAfterCase.links || []).length === wallLinkCountBeforeCase
);
var reuseWallCase = model.store.promoteInvestigationPersonToCase(
  eliteChild.investigationId
);
check(
  "promote wall person reuses existing lead",
  reuseWallCase.ok &&
    reuseWallCase.existing &&
    reuseWallCase.leadId === openedWallCase.leadId
);
check(
  "promote wall person does not duplicate subject lead",
  model.store.listLeads().filter(function (row) {
    return row.subjectPersonId === wallPersonForCase.objectId;
  }).length === 1
);
wallCaseInv = model.store.getInvestigation(eliteChild.investigationId);
wallCaseInv.focusNodeId = wallVehForCase.nodeId;
model.store.saveInvestigation(wallCaseInv, { mode: "draft" });
var promoWallVehicle = model.store.promoteInvestigationPersonToCase(
  eliteChild.investigationId
);
check(
  "promote wall rejects vehicle focus",
  !promoWallVehicle.ok && !promoWallVehicle.leadId
);
var promoWallVehicleNode = model.store.promoteInvestigationPersonToCase(
  eliteChild.investigationId,
  wallVehForCase.nodeId
);
check(
  "promote wall rejects vehicle node",
  !promoWallVehicleNode.ok
);
wallCaseInv = model.store.getInvestigation(eliteChild.investigationId);
wallCaseInv.focusNodeId = "";
model.store.saveInvestigation(wallCaseInv, { mode: "draft" });
var promoWallNoFocus = model.store.promoteInvestigationPersonToCase(
  eliteChild.investigationId
);
check(
  "promote wall requires person focus",
  !promoWallNoFocus.ok
);
var promoWallByNode = model.store.promoteInvestigationPersonToCase(
  eliteChild.investigationId,
  wallPersonForCase.nodeId
);
check(
  "promote wall by nodeId reuses lead",
  promoWallByNode.ok &&
    promoWallByNode.existing &&
    promoWallByNode.leadId === openedWallCase.leadId
);
var promoMissingInv = model.store.promoteInvestigationPersonToCase("INV-nope");
check("promote wall rejects missing investigation", !promoMissingInv.ok);

var removeSrc = model.store.getInvestigation(eliteChild.investigationId);
var removePerson = removeSrc.nodes.filter(function (row) {
  return row.objectType === "PERSON";
})[0];
var removeVeh = removeSrc.nodes.filter(function (row) {
  return row.objectType === "VEHICLE";
})[0];
var removePersonId = removePerson.objectId;
var removeVehId = removeVeh.objectId;
var removeLinkCount = (removeSrc.links || []).length;
removeSrc.focusNodeId = removePerson.nodeId;
model.store.saveInvestigation(removeSrc, { mode: "draft" });
var removedPerson = model.store.removeInvestigationObject(
  eliteChild.investigationId,
  removePerson.nodeId
);
var afterRemovePerson = model.store.getInvestigation(eliteChild.investigationId);
check(
  "remove wall person drops node",
  removedPerson.ok &&
    !afterRemovePerson.nodes.some(function (row) {
      return row.nodeId === removePerson.nodeId;
    })
);
check(
  "remove wall person keeps people record",
  !!model.store.getPerson(removePersonId)
);
check(
  "remove wall person drops its links",
  removeLinkCount > 0 &&
    !afterRemovePerson.links.some(function (link) {
      return (
        (link.from && link.from.id === removePersonId) ||
        (link.to && link.to.id === removePersonId)
      );
    })
);
check(
  "remove wall person keeps other nodes",
  afterRemovePerson.nodes.some(function (row) {
    return row.objectId === removeVehId;
  })
);
check(
  "remove wall person clears focus",
  afterRemovePerson.focusNodeId === ""
);
check(
  "remove wall person notes history",
  (afterRemovePerson.history || []).some(function (row) {
    return /Ortiz/i.test(row.text) && /wall/.test(row.text);
  })
);
var removeMissing = model.store.removeInvestigationObject(
  eliteChild.investigationId,
  "node_nope"
);
check("remove wall missing node", !removeMissing.ok);

var parentPlateInv = model.store.getInvestigation(invPlate.investigationId);
var parentVehForRemove = parentPlateInv.nodes.filter(function (row) {
  return row.objectType === "VEHICLE" && row.objectId === promoPlate.vehicleId;
})[0];
var childBeforeRemove = model.store.getInvestigation(childInv.investigationId);
var childHadVeh = childBeforeRemove.nodes.some(function (row) {
  return row.objectId === promoPlate.vehicleId;
});
var removedPlateVeh = model.store.removeInvestigationObject(
  invPlate.investigationId,
  parentVehForRemove.nodeId
);
var parentAfterRemove = model.store.getInvestigation(invPlate.investigationId);
var childAfterRemove = model.store.getInvestigation(childInv.investigationId);
check(
  "remove promoted vehicle reverts plate to hit",
  removedPlateVeh.ok &&
    parentAfterRemove.plates.some(function (row) {
      return row.vehicleId === promoPlate.vehicleId && row.status === "hit";
    })
);
check(
  "remove wall vehicle keeps vehicles record",
  !!model.store.getVehicleRecord(promoPlate.vehicleId)
);
check(
  "remove parent node keeps child overlap",
  childHadVeh &&
    childAfterRemove.nodes.some(function (row) {
      return row.objectId === promoPlate.vehicleId;
    })
);
var rePromo = model.store.promoteInvestigationPlate(
  invPlate.investigationId,
  parentAfterRemove.plates.filter(function (row) {
    return row.vehicleId === promoPlate.vehicleId;
  })[0].plateId
);
check("re-promote after remove", rePromo.ok && !!rePromo.nodeId);

var rapWall = model.createPerson({
  caseRole: "",
  name: { lastName: "WALLRAP", firstName: "KIM" },
  arrests: [{ arrestId: "arr_wall", charges: "X" }]
});
model.store.upsertPerson(rapWall);
var rapNode = model.store.addInvestigationObject(eliteChild.investigationId, {
  objectType: "PERSON",
  objectId: rapWall.personId,
  fromNodeId: ""
});
var rapInv = model.store.getInvestigation(eliteChild.investigationId);
rapInv.focusNodeId = rapNode.nodeId;
model.store.saveInvestigation(rapInv, { mode: "draft" });
var rapCase = model.store.promoteInvestigationPersonToCase(
  eliteChild.investigationId
);
var rapKept = model.store.getPerson(rapWall.personId);
check(
  "promote wall person keeps RAP on people registry",
  rapCase.ok &&
    rapKept &&
    (rapKept.arrests || []).some(function (row) {
      return row && row.arrestId === "arr_wall";
    })
);
var rapLead = model.store.getLead(rapCase.leadId);
check(
  "promote wall person case stays identity-only",
  rapLead && (rapLead.person.arrests || []).length === 0
);

var childBeforeClear = model.store.getInvestigation(childInv.investigationId);
var childNodeCount = (childBeforeClear.nodes || []).length;
var keptPerson = model.store.getPerson(rapWall.personId);
var clearedWall = model.store.clearInvestigationWorkspace(
  eliteChild.investigationId
);
var afterClear = model.store.getInvestigation(eliteChild.investigationId);
var childAfterClear = model.store.getInvestigation(childInv.investigationId);
check(
  "clear workspace empties this wall",
  clearedWall.ok &&
    clearedWall.cleared &&
    (afterClear.nodes || []).length === 0 &&
    (afterClear.links || []).length === 0 &&
    (afterClear.plates || []).length === 0 &&
    !afterClear.focusNodeId
);
check(
  "clear workspace keeps shared person",
  keptPerson && !!model.store.getPerson(rapWall.personId)
);
check(
  "clear workspace does not touch child wall",
  childNodeCount > 0 &&
    (childAfterClear.nodes || []).length === childNodeCount
);
var clearAgain = model.store.clearInvestigationWorkspace(
  eliteChild.investigationId
);
check("clear empty workspace is ok", clearAgain.ok && !clearAgain.cleared);
var clearMissing = model.store.clearInvestigationWorkspace("INV-nope");
check("clear missing investigation", !clearMissing.ok);

var junkAdd = model.store.addInvestigationObject(eliteChild.investigationId, {
  objectType: "VEHICLE",
  licensePlate: "JUNK1",
  plateState: "TX",
  fromNodeId: "",
  x: 1,
  y: 1
});
var junked = model.store.junkInvestigationObject(
  eliteChild.investigationId,
  junkAdd.nodeId
);
var junkRec = model.store.getVehicleRecord(junkAdd.objectId);
check(
  "junk keeps record and marks junked",
  junked.ok && junkRec && junkRec.junked
);
check(
  "junk removes from this wall",
  !model.store.getInvestigation(eliteChild.investigationId).nodes.some(function (row) {
    return row.objectId === junkAdd.objectId;
  })
);
check(
  "junk is skipped by plate reuse",
  !model.store.findVehicleByPlate("TX", "JUNK1")
);
var junkRestore = model.store.addInvestigationObject(eliteChild.investigationId, {
  objectType: "VEHICLE",
  licensePlate: "JUNK1",
  plateState: "TX",
  fromNodeId: ""
});
check(
  "placing junked plate restores same vehicle",
  junkRestore.ok &&
    junkRestore.reused &&
    junkRestore.objectId === junkAdd.objectId &&
    !model.store.getVehicleRecord(junkAdd.objectId).junked
);
var delAdd = model.store.addInvestigationObject(eliteChild.investigationId, {
  objectType: "LOCATION",
  street: "9 Junk Ln",
  city: "Dallas",
  state: "TX",
  zip: "75201",
  fromNodeId: ""
});
var deleted = model.store.deleteInvestigationObject(
  eliteChild.investigationId,
  delAdd.nodeId
);
check(
  "delete unreferenced record",
  deleted.ok && !model.store.getLocationRecord(delAdd.objectId)
);
var casePerson = model.store.getLead(openedWallCase.leadId);
var caseOnWall = model.store.addInvestigationObject(eliteChild.investigationId, {
  objectType: "PERSON",
  objectId: casePerson.subjectPersonId,
  fromNodeId: ""
});
var delCase = model.store.deleteInvestigationObject(
  eliteChild.investigationId,
  caseOnWall.nodeId
);
var junkCase = model.store.junkInvestigationObject(
  eliteChild.investigationId,
  caseOnWall.nodeId
);
check(
  "cannot delete or junk a case subject",
  !delCase.ok && !junkCase.ok && !!model.store.getPerson(casePerson.subjectPersonId)
);

var winTag = model.investigationWindowsDefault("tag");
check(
  "windows default tag opens plates only",
  winTag.plates && !winTag.objects && !winTag.card
);
var winElite = model.investigationWindowsDefault("elite");
check(
  "windows default other kind all closed",
  !winElite.plates && !winElite.objects && !winElite.card
);
check(
  "windows default missing kind plates closed",
  !model.investigationWindowsDefault("").plates
);

var asocInv = model.createInvestigation({
  kind: "elite",
  team: 3,
  existingIds: Object.keys(model.store.listInvestigations().reduce(function (acc, row) {
    acc[row.investigationId] = true;
    return acc;
  }, {}))
});
model.store.saveInvestigation(asocInv, { mode: "draft" });
var asocVeh = model.store.addInvestigationObject(asocInv.investigationId, {
  objectType: "VEHICLE",
  licensePlate: "ASOC1",
  plateState: "TX",
  fromNodeId: "",
  x: 10,
  y: 10
});
var asocPer = model.store.addInvestigationObject(asocInv.investigationId, {
  objectType: "PERSON",
  name: { lastName: "ASOCGARCIA", firstName: "LUIS" },
  fromNodeId: asocVeh.nodeId,
  reason: "REGISTERED_OWNER_OF",
  x: 310,
  y: 10
});
var asocWall = model.store.getInvestigation(asocInv.investigationId);
var asocLink = (asocWall.links || [])[0];
check("wall connect writes associationId", asocLink && !!asocLink.associationId);
var asocRec = model.store.getAssociation(asocLink.associationId);
check(
  "association canonicalizes person to vehicle",
  asocRec &&
    asocRec.from.type === "PERSON" &&
    asocRec.from.id === asocPer.objectId &&
    asocRec.to.type === "VEHICLE" &&
    asocRec.to.id === asocVeh.objectId &&
    asocRec.reason === "REGISTERED_OWNER_OF"
);
var asocAgain = model.store.upsertAssociation({
  from: { type: "VEHICLE", id: asocVeh.objectId },
  to: { type: "PERSON", id: asocPer.objectId },
  reason: "REGISTERED_OWNER_OF"
});
check(
  "reuse same ends+reason",
  asocAgain.ok &&
    asocAgain.reused &&
    asocAgain.associationId === asocRec.associationId
);
var forVeh = model.store.associationsFor("VEHICLE", asocVeh.objectId);
var forPer = model.store.associationsFor("PERSON", asocPer.objectId);
check(
  "associationsFor sees both ends",
  forVeh.length >= 1 &&
    forPer.length >= 1 &&
    forVeh.some(function (row) {
      return row.associationId === asocRec.associationId;
    }) &&
    forPer.some(function (row) {
      return row.associationId === asocRec.associationId;
    })
);
var asocPer2 = model.store.addInvestigationObject(asocInv.investigationId, {
  objectType: "PERSON",
  name: { lastName: "ASOCSPOUSE", firstName: "ANA" },
  fromNodeId: "",
  x: 10,
  y: 200
});
var spouse1 = model.store.upsertAssociation({
  from: { type: "PERSON", id: asocPer.objectId },
  to: { type: "PERSON", id: asocPer2.objectId },
  reason: "SPOUSE_OF"
});
var spouse2 = model.store.upsertAssociation({
  from: { type: "PERSON", id: asocPer2.objectId },
  to: { type: "PERSON", id: asocPer.objectId },
  reason: "SPOUSE_OF"
});
check(
  "symmetric spouse no reverse duplicate",
  spouse1.ok &&
    spouse2.ok &&
    spouse2.reused &&
    spouse1.associationId === spouse2.associationId
);
asocWall = model.store.getInvestigation(asocInv.investigationId);
asocWall.focusNodeId = asocVeh.nodeId;
model.store.saveInvestigation(asocWall, { mode: "draft" });
var spawnedAsoc = model.store.spawnInvestigation(asocInv.investigationId);
var childAsoc = model.store.getInvestigation(spawnedAsoc.investigationId);
check(
  "spawn cites same associationId",
  spawnedAsoc.ok &&
    childAsoc &&
    (childAsoc.links || []).some(function (row) {
      return row && row.associationId === asocLink.associationId;
    }) &&
    (childAsoc.links || []).every(function (row) {
      return !row || row.linkId !== asocLink.linkId;
    })
);
var childPersonNode = (childAsoc.nodes || []).filter(function (row) {
  return row && row.objectType === "PERSON" && row.objectId === asocPer.objectId;
})[0];
model.store.removeInvestigationObject(childAsoc.investigationId, childPersonNode.nodeId);
check(
  "remove from wall keeps association",
  !!model.store.getAssociation(asocLink.associationId)
);
var asocBiz = model.store.addInvestigationObject(asocInv.investigationId, {
  objectType: "BUSINESS",
  name: "Garcia Roofing LLC",
  fromNodeId: ""
});
var custOk = model.store.upsertAssociation({
  from: { type: "PERSON", id: asocPer.objectId },
  to: { type: "BUSINESS", id: asocBiz.objectId },
  reason: "CUSTOMER_OF"
});
check("customer of person-business", custOk.ok && !!custOk.associationId);
var custBad = model.store.upsertAssociation({
  from: { type: "PERSON", id: asocPer.objectId },
  to: { type: "VEHICLE", id: asocVeh.objectId },
  reason: "CUSTOMER_OF"
});
check("customer of rejects vehicle", !custBad.ok);
var asocFoo = model.store.addInvestigationObject(asocInv.investigationId, {
  objectType: "PERSON",
  name: { lastName: "ASOCFOO", firstName: "PAT" },
  fromNodeId: ""
});
var asocVeh2 = model.store.addInvestigationObject(asocInv.investigationId, {
  objectType: "VEHICLE",
  licensePlate: "ASOC2",
  plateState: "TX",
  fromNodeId: asocFoo.nodeId,
  reason: "KNOWN_OPERATOR_OF"
});
var fooPerson = model.store.getPerson(asocFoo.objectId);
fooPerson.name.lastName = "ASOCGARCIA";
fooPerson.name.firstName = "LUIS";
model.store.upsertPerson(fooPerson);
var reusedFoo = model.store.reuseInvestigationIdentity(
  asocInv.investigationId,
  asocFoo.nodeId
);
var opAsocs = model.store.associationsFor("PERSON", asocPer.objectId);
check(
  "reuse-on-type retargets association ends",
  reusedFoo.ok &&
    reusedFoo.reused &&
    reusedFoo.objectId === asocPer.objectId &&
    opAsocs.some(function (row) {
      return (
        row.reason === "KNOWN_OPERATOR_OF" &&
        row.to.id === asocVeh2.objectId &&
        row.from.id === asocPer.objectId
      );
    })
);
var lonerLoc = model.store.addInvestigationObject(asocInv.investigationId, {
  objectType: "LOCATION",
  street: "9 Asoc Ln",
  city: "Dallas",
  state: "TX",
  zip: "75201",
  fromNodeId: asocPer.nodeId,
  reason: "CURRENT_RESIDENCE"
});
var locAsoc = model.store.associationsFor("LOCATION", lonerLoc.objectId)[0];
var deletedLoc = model.store.deleteInvestigationObject(
  asocInv.investigationId,
  lonerLoc.nodeId
);
check(
  "delete unreferenced person-end drops hanging association",
  deletedLoc.ok &&
    locAsoc &&
    !model.store.getAssociation(locAsoc.associationId) &&
    !model.store.getLocationRecord(lonerLoc.objectId)
);
var caseSubj = model.store.getLead(openedWallCase.leadId);
var caseAsoc = model.store.upsertAssociation({
  from: { type: "PERSON", id: caseSubj.subjectPersonId },
  to: { type: "VEHICLE", id: asocVeh.objectId },
  reason: "KNOWN_OPERATOR_OF"
});
check(
  "case subject can have associations",
  caseAsoc.ok && !!model.store.getAssociation(caseAsoc.associationId)
);
var caseOnAsocWall = model.store.addInvestigationObject(asocInv.investigationId, {
  objectType: "PERSON",
  objectId: caseSubj.subjectPersonId,
  fromNodeId: ""
});
var delCaseAsoc = model.store.deleteInvestigationObject(
  asocInv.investigationId,
  caseOnAsocWall.nodeId
);
check(
  "cannot delete case subject even with associations",
  !delCaseAsoc.ok && !!model.store.getPerson(caseSubj.subjectPersonId)
);
check(
  "createAssociation still allows unresolved label",
  model.createAssociation({
    label: "PEREZ, ANA",
    otherType: "PERSON",
    from: { type: "PERSON", id: "p_a" }
  }).to.id === ""
);

check(
  "default person reason vehicle is owner",
  model.defaultPersonAssociationReason("VEHICLE") === "REGISTERED_OWNER_OF"
);
check(
  "default person reason business is customer",
  model.defaultPersonAssociationReason("BUSINESS") === "CUSTOMER_OF"
);
check(
  "card label owner",
  model.associationCardLabel("REGISTERED_OWNER_OF") === "Owner"
);
var composerInv = model.createInvestigation({
  kind: "elite",
  team: 3,
  existingIds: model.store.listInvestigations().map(function (row) {
    return row.investigationId;
  })
});
model.store.saveInvestigation(composerInv, { mode: "draft" });
var composerVeh = model.store.addInvestigationObject(composerInv.investigationId, {
  objectType: "VEHICLE",
  licensePlate: "COMP1",
  plateState: "TX",
  fromNodeId: "",
  x: 20,
  y: 20
});
var composed = model.store.associateInvestigationPerson(
  composerInv.investigationId,
  composerVeh.nodeId,
  { label: "COMPOSER, RITA", reason: "REGISTERED_OWNER_OF" }
);
var composedPerson = model.store.getPerson(composed.personId);
var composedWall = model.store.getInvestigation(composerInv.investigationId);
var composedLink = (composedWall.links || []).filter(function (row) {
  return row && row.associationId === composed.associationId;
})[0];
var composedVehRec = model.store.getVehicleRecord(composerVeh.objectId);
check(
  "composer mints person, wall node, and association",
  composed.ok &&
    composedPerson &&
    composedPerson.name.lastName === "COMPOSER" &&
    composed.placed &&
    composedLink &&
    composedWall.nodes.some(function (row) {
      return row.objectType === "PERSON" && row.objectId === composed.personId;
    })
);
check(
  "composer fills empty registered owner name",
  composedVehRec &&
    String(composedVehRec.registeredOwnerName || "").toUpperCase().indexOf("COMPOSER") !== -1
);
check(
  "composer empty name rejected",
  !model.store.associateInvestigationPerson(
    composerInv.investigationId,
    composerVeh.nodeId,
    { label: "   " }
  ).ok
);
var composedAgain = model.store.associateInvestigationPerson(
  composerInv.investigationId,
  composerVeh.nodeId,
  { label: "COMPOSER, RITA", reason: "REGISTERED_OWNER_OF" }
);
check(
  "composer reuses person and association",
  composedAgain.ok &&
    composedAgain.reused &&
    composedAgain.personId === composed.personId &&
    composedAgain.associationId === composed.associationId
);
var hostFocus = composedWall.focusNodeId;
check(
  "composer keeps host focus",
  composedWall.focusNodeId === composerVeh.nodeId || hostFocus === composerVeh.nodeId
);
var afterCompose = model.store.getInvestigation(composerInv.investigationId);
check(
  "composer does not steal focus",
  afterCompose.focusNodeId === composerVeh.nodeId
);
var dropCite = model.store.disconnectInvestigationAssociation(
  composerInv.investigationId,
  composed.associationId
);
var afterDrop = model.store.getInvestigation(composerInv.investigationId);
check(
  "x drops wall citation only",
  dropCite.ok &&
    dropCite.removed &&
    !!model.store.getAssociation(composed.associationId) &&
    !(afterDrop.links || []).some(function (row) {
      return row && row.associationId === composed.associationId;
    }) &&
    afterDrop.nodes.some(function (row) {
      return row.objectType === "PERSON" && row.objectId === composed.personId;
    })
);
var worldBiz = model.store.addInvestigationObject(composerInv.investigationId, {
  objectType: "BUSINESS",
  name: "Composer Mart",
  fromNodeId: ""
});
var bizCust = model.store.associateInvestigationPerson(
  composerInv.investigationId,
  worldBiz.nodeId,
  { label: "CUSTOMER, PAT" }
);
var custAsoc = model.store.getAssociation(bizCust.associationId);
check(
  "composer business defaults to customer",
  bizCust.ok && custAsoc && custAsoc.reason === "CUSTOMER_OF"
);
var vehFromPerson = model.store.associateInvestigationObject(
  composerInv.investigationId,
  composed.nodeId,
  { objectType: "VEHICLE", label: "TX COMP2" }
);
var vehFromPersonRec = model.store.getVehicleRecord(vehFromPerson.objectId);
var vehAsoc = model.store.getAssociation(vehFromPerson.associationId);
check(
  "composer plate mints vehicle as owner",
  vehFromPerson.ok &&
    vehFromPersonRec &&
    vehFromPersonRec.licensePlate === "COMP2" &&
    vehFromPersonRec.plateState === "TX" &&
    vehAsoc &&
    vehAsoc.reason === "REGISTERED_OWNER_OF"
);
var locFromPerson = model.store.associateInvestigationObject(
  composerInv.investigationId,
  composed.nodeId,
  { objectType: "LOCATION", label: "100 Composer St, Dallas, TX 75201" }
);
var locRec = model.store.getLocationRecord(locFromPerson.objectId);
var locAsoc2 = model.store.getAssociation(locFromPerson.associationId);
check(
  "composer address mints location as residence",
  locFromPerson.ok &&
    locRec &&
    locRec.street === "100 Composer St" &&
    locRec.city === "Dallas" &&
    locRec.state === "TX" &&
    locAsoc2 &&
    locAsoc2.reason === "CURRENT_RESIDENCE"
);
check(
  "composer rejects empty plate",
  !model.store.associateInvestigationObject(
    composerInv.investigationId,
    composed.nodeId,
    { objectType: "VEHICLE", label: "   " }
  ).ok
);
var listed = model.store.listObjects("VEHICLE");
check(
  "listObjects includes composer vehicle",
  listed.some(function (row) {
    return row && (row.licensePlate === "COMP2" || row.plate === "COMP2");
  })
);

var nestCase = model.store.promoteInvestigationPersonToCase(
  composerInv.investigationId,
  composed.nodeId
);
var nestLead = model.store.getLead(nestCase.leadId);
check(
  "open as case dual-writes associated location",
  nestCase.ok &&
    nestLead &&
    (nestLead.person.locations || []).some(function (row) {
      return row && row.city === "Dallas" && row.association === "residence";
    })
);
check(
  "open as case dual-writes associated vehicle",
  nestLead &&
    (nestLead.vehicles || []).some(function (row) {
      return row && (row.licensePlate === "COMP2" || row.plate === "COMP2");
    })
);
check(
  "open as case still identity-only RAP",
  nestLead && (nestLead.person.arrests || []).length === 0
);
var extraNest = model.store.associateInvestigationObject(
  composerInv.investigationId,
  composed.nodeId,
  { objectType: "LOCATION", label: "200 Nest Ave, Irving, TX 75060" }
);
var nestLeadAfter = model.store.getLead(nestCase.leadId);
check(
  "associating onto an existing case updates nested locations",
  extraNest.ok &&
    (nestLeadAfter.person.locations || []).some(function (row) {
      return row && row.city === "Irving";
    })
);

var caseComposer = model.store.associateCaseObject(nestCase.leadId, {
  objectType: "PERSON",
  label: "CASEPAL, RIO",
  reason: "ASSOCIATE_OF"
});
var caseAfterComposer = model.store.getLead(nestCase.leadId);
check(
  "case composer mints person association",
  caseComposer.ok &&
    caseComposer.associationId &&
    !!model.store.getAssociation(caseComposer.associationId) &&
    (caseAfterComposer.links || []).some(function (row) {
      return row && row.associationId === caseComposer.associationId;
    })
);
var caseLoc = model.store.associateCaseObject(nestCase.leadId, {
  objectType: "LOCATION",
  label: "9 Case St, Plano, TX 75074"
});
var caseAfterLoc = model.store.getLead(nestCase.leadId);
check(
  "case composer location dual-writes nested place",
  caseLoc.ok &&
    (caseAfterLoc.person.locations || []).some(function (row) {
      return row && row.city === "Plano";
    })
);
check(
  "case composer empty name rejected",
  !model.store.associateCaseObject(nestCase.leadId, {
    objectType: "PERSON",
    label: "  "
  }).ok
);

var dropPal = model.store.dropAssociation(caseComposer.associationId);
var afterDrop = model.store.getLead(nestCase.leadId);
check("dropAssociation ok", dropPal.ok && dropPal.removed);
check(
  "dropAssociation removes world fact",
  !(model.store.associationsFor("PERSON", nestLead.subjectPersonId) || []).some(
    function (row) {
      return row && row.associationId === caseComposer.associationId;
    }
  )
);
check(
  "dropAssociation uncite case link",
  !(afterDrop.links || []).some(function (row) {
    return row && row.associationId === caseComposer.associationId;
  })
);
check(
  "dropAssociation keeps the other person",
  !!model.store.getPerson(caseComposer.objectId)
);

var otherLink = model.store.associateCaseObject(nestCase.leadId, {
  objectType: "OTHER",
  label: "Unknown caller"
});
check("case OTHER link ok", otherLink.ok && otherLink.linkId && !otherLink.associationId);
var unciteOther = model.store.removeCaseLink(nestCase.leadId, otherLink.linkId);
var afterUncite = model.store.getLead(nestCase.leadId);
check("removeCaseLink ok", unciteOther.ok && unciteOther.removed);
check(
  "removeCaseLink drops OTHER",
  !(afterUncite.links || []).some(function (row) {
    return row && row.linkId === otherLink.linkId;
  })
);
check(
  "dropAssociation missing id is ok",
  model.store.dropAssociation("asoc_missing").ok &&
    !model.store.dropAssociation("asoc_missing").removed
);

var occCase = model.createLeadSnapshot();
occCase.person.name.lastName = "OCC";
occCase.person.name.firstName = "ANN";
var occPlace = model.createLocation({
  street: "10 Occupancy St",
  city: "Dallas",
  state: "TX",
  zip: "75201",
  occupancy: "historical",
  occupiedFrom: "2019-03-01",
  occupiedTo: "2020-03-01"
});
occCase.person.locations = [occPlace];
model.store.saveLead(occCase, { mode: "commit" });
var occSaved = model.store.getLead(occCase.leadId);
var occAsoc = model.store.occupancyFor(
  "PERSON",
  occSaved.subjectPersonId,
  "LOCATION",
  occPlace.locationId
);
check(
  "occupancy writes onto association",
  occAsoc &&
    occAsoc.occupancy === "historical" &&
    occAsoc.occupiedFrom === "2019-03-01" &&
    occAsoc.occupiedTo === "2020-03-01"
);
check(
  "occupancy dual-writes nested from association",
  occSaved.person.locations[0].occupancy === "historical" &&
    occSaved.person.locations[0].occupiedFrom === "2019-03-01"
);
model.store.upsertAssociation({
  from: { type: "PERSON", id: occSaved.subjectPersonId },
  to: { type: "LOCATION", id: occPlace.locationId },
  reason: "CURRENT_RESIDENCE",
  occupancy: "current",
  validFrom: "",
  validTo: ""
});
var occAfter = model.store.getLead(occCase.leadId);
check(
  "association occupancy change dual-writes nested",
  occAfter.person.locations[0].occupancy === "current"
);
var occVeh = model.createVehicle({
  governmentVehicle: false,
  licensePlate: "OCC1",
  plateState: "TX",
  occupancy: "historical",
  occupiedFrom: "2018-01-01"
});
occCase = model.store.getLead(occCase.leadId);
occCase.vehicles = [occVeh];
model.store.saveLead(occCase, { mode: "commit" });
var occVehAsoc = model.store.occupancyFor(
  "PERSON",
  occSaved.subjectPersonId,
  "VEHICLE",
  occVeh.vehicleId
);
check(
  "vehicle occupancy writes onto association",
  occVehAsoc && occVehAsoc.occupancy === "historical"
);

if (fail) {
  process.exit(1);
}
console.log("all passed");
