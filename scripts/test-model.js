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

var enc = model.createEncounterRecord();
check(
  "encounter id minted",
  typeof enc.encounterId === "string" && enc.encounterId.indexOf("enc") === 0
);
check("encounter entity", enc.entityType === "ENCOUNTER");
check("encounter schema", enc.schema === "copdocx.encounter.v1");
check("new encounter is draft", enc.meta.status === "draft");
check(
  "encounter empty collections",
  enc.subjects.length === 0 &&
    enc.vehicles.length === 0 &&
    enc.locations.length === 0
);
check(
  "encounter subject factory",
  model.createEncounterSubject({ lastName: "LOKI" }).lastName === "LOKI"
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

var keepEncAt = savedEnc.meta.committedAt;
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

if (fail) {
  process.exit(1);
}
console.log("all passed");
