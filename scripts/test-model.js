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

var govVeh = model.createVehicle({ governmentVehicle: true, unit: "U-1" });
check(
  "gov vehicle defaults fleet status",
  govVeh.governmentVehicle === true && govVeh.status === "available"
);

if (fail) {
  process.exit(1);
}
console.log("all passed");
