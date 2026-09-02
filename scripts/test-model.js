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
load("functions/model/officer.js");
load("functions/model/link.js");
load("functions/model/store.js");

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
check(
  "list includes untitled",
  model.store.listLeads()[0].label === "Untitled lead"
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
  "draft save does not remember people",
  !model.store.getPerson(draftSnap.subjectPersonId)
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

if (fail) {
  process.exit(1);
}
console.log("all passed");
