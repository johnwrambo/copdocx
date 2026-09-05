"use strict";

var fs = require("fs");
var path = require("path");
var vm = require("vm");

var context = {
  window: {},
  document: { body: null },
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
  require("./support/module-dependencies.js").loadDependencies(context, rel);
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
load("functions/model/encounter.js");
load("functions/model/store.js");
load("functions/oracle.js");

var model = context.COPDoc.model;
var oracle = context.COPDoc.oracle;
var fail = 0;

function check(label, ok, extra) {
  if (!ok) {
    fail += 1;
    console.log("FAIL", label, extra || "");
  } else {
    console.log("ok", label);
  }
}

var catalogs = {
  countries: [{ code: "MX", label: "Mexico" }, { code: "GT", label: "Guatemala" }],
  dispositions: [
    { code: "ER", label: "Expedited Removal (I-860)" },
    { code: "WA/NTA", label: "Warrant of Arrest/Notice to Appear" }
  ],
  encounterTypes: [{ code: "VEHICLE_STOP", label: "Vehicle stop" }]
};

var loc = model.createLocation({
  city: "Dallas",
  state: "TX",
  latitude: "32.78",
  longitude: "-96.80",
  association: "arrest"
});

var target = model.createLead({
  person: model.createPerson({
    name: { lastName: "GARCIA", firstName: "Luis" },
    citizenship: "MX",
    immigration: { disposition: "ER" }
  })
});
target.person.arrests.push(
  model.createArrest({
    arrestDate: "2026-09-04",
    encounterId: "DAL3-20260904-001",
    team: "3",
    subjectRole: "TARGET"
  })
);

var collateral = model.createLead({
  person: model.createPerson({
    name: { lastName: "LOPEZ", firstName: "Ana" },
    citizenship: "GT",
    immigration: { disposition: "WA/NTA" }
  })
});
collateral.person.arrests.push(
  model.createArrest({
    arrestDate: "2026-09-04",
    encounterId: "DAL3-20260904-001",
    team: "3",
    subjectRole: "COLLATERAL"
  })
);

var draft = model.createLead({
  person: model.createPerson({
    name: { lastName: "DRAFT", firstName: "Skip" }
  })
});
draft.person.arrests.push(
  model.createArrest({
    arrestDate: "2026-09-04",
    encounterId: "DAL3-20260904-001",
    team: "3"
  })
);

var undated = model.createLead({
  person: model.createPerson({
    name: { lastName: "NODATE", firstName: "Skip" }
  })
});
undated.person.arrests.push(
  model.createArrest({
    encounterId: "DAL3-20260904-001",
    team: "3"
  })
);

check("save target", model.store.saveLead(target, { mode: "commit" }).ok);
check("save collateral", model.store.saveLead(collateral, { mode: "commit" }).ok);
check("save draft", model.store.saveLead(draft, { mode: "draft" }).ok);
check("save undated", model.store.saveLead(undated, { mode: "commit" }).ok);

var encounter = model.createEncounterRecord({
  encounterId: "DAL3-20260904-001",
  team: "3",
  startedAt: "2026-09-04T08:00:00",
  eventType: "VEHICLE_STOP"
});
encounter.locations = [loc];
encounter.centerLocationId = loc.locationId;
encounter.subjects = [
  model.createEncounterSubject({
    personId: target.person.personId,
    encounterRole: "TARGET",
    outcome: "ARRESTED"
  }),
  model.createEncounterSubject({
    personId: collateral.person.personId,
    encounterRole: "COLLATERAL",
    outcome: "ARRESTED"
  }),
  model.createEncounterSubject({
    lastName: "RELEASED",
    firstName: "One",
    encounterRole: "COLLATERAL",
    outcome: "RELEASED"
  }),
  model.createEncounterSubject({
    lastName: "FLED",
    firstName: "One",
    encounterRole: "COLLATERAL",
    outcome: "FLED_FOOT"
  }),
  model.createEncounterSubject({
    lastName: "BLANK",
    firstName: "Outcome",
    encounterRole: "OTHER",
    outcome: ""
  })
];
check(
  "complete encounter",
  model.store.saveEncounter(encounter, { mode: "complete" }).ok
);

var dynLoc = model.createLocation({
  city: "Garland",
  state: "TX",
  latitude: "32.91",
  longitude: "-96.64",
  association: "target"
});
var dynLead = model.createLead({
  person: model.createPerson({
    name: { lastName: "REYES", firstName: "Marco" },
    citizenship: "MX",
    immigration: { disposition: "ER" }
  })
});
dynLead.person.arrests.push(
  model.createArrest({
    arrestDate: "2026-09-04",
    encounterId: "DAL3-20260904-002",
    team: "3",
    subjectRole: "TARGET"
  })
);
check("save dynamic target", model.store.saveLead(dynLead, { mode: "commit" }).ok);
var dynamicEnc = model.createEncounterRecord({
  encounterId: "DAL3-20260904-002",
  team: "3",
  startedAt: "2026-09-04T10:00:00",
  eventType: "TARGETED_ARREST"
});
dynamicEnc.locations = [dynLoc];
dynamicEnc.centerLocationId = dynLoc.locationId;
dynamicEnc.subjects = [
  model.createEncounterSubject({
    personId: dynLead.person.personId,
    encounterRole: "TARGET",
    outcome: "ARRESTED"
  })
];
check(
  "complete dynamic encounter",
  model.store.saveEncounter(dynamicEnc, { mode: "complete" }).ok
);

var leads = (model.store.listLeads() || []).map(function (row) {
  return model.store.getLead(row.leadId);
});
var encounters = (model.store.listEncounters() || []).map(function (row) {
  return model.store.getEncounter(row.encounterId);
});

var today = oracle.summarize({
  leads: leads,
  encounters: encounters,
  from: "2026-09-04",
  to: "2026-09-04",
  catalogs: catalogs,
  today: "2026-09-04T12:00:00"
});

check("X is 3 booked arrests", today.arrests === 3, today.arrests);
check("Y is 2 encounters", today.encountersWithArrests === 2, today.encountersWithArrests);
check("draft arrest excluded", today.arrests === 3);
check("undated arrest not in X", today.quality.missingDate === 1, today.quality.missingDate);
check("target arrests", today.target === 2, today.target);
check("collateral arrests", today.collateral === 1, today.collateral);
check("released subjects", today.released === 1, today.released);
check("fled subjects", today.fled === 1, today.fled);
check("blank outcome flagged", today.quality.outcomeUnknown === 1);
check("completed encounters", today.completedEncounters === 2, today.completedEncounters);
check("vehicle stop is cop", oracle.familyOf("VEHICLE_STOP") === "cop");
check("targeted arrest is dynamic", oracle.familyOf("TARGETED_ARREST") === "dynamic");
check("worksite is other", oracle.familyOf("WORKSITE") === "other");
check("cop stops", today.families.cop.stops === 1, today.families.cop.stops);
check("cop hit 1/1", today.families.cop.hits === 1 && today.families.cop.hit === 1);
check("cop yield 2/1", today.families.cop.arrests === 2 && today.families.cop.yield === 2);
check("cop fled 1", today.families.cop.fled === 1);
check("cop target yield 1/1", today.families.cop.targetYield === 1);
check("cop collateral yield 1/1", today.families.cop.collateralYield === 1);
check("dynamic stops", today.families.dynamic.stops === 1, today.families.dynamic.stops);
check("dynamic hit 1/1", today.families.dynamic.hits === 1);
check("dynamic yield 1/1", today.families.dynamic.arrests === 1 && today.families.dynamic.yield === 1);
check("dynamic empty-handed 0", today.families.dynamic.empty === 0);
check("all-stop yield 3/2", today.families.all.arrests === 3 && today.families.all.stops === 2);
check("cop share of arrests 2/3", today.shares.copArrests === 2 && today.shares.allArrests === 3);
check("city rollup has Dallas", today.places.some(function (row) { return row.city === "Dallas"; }));
check("two mapped cells", today.cells.length === 2, today.cells.length);
check(
  "sentence names X in Y",
  oracle.sentence(today) === "DAL-3 arrested 3 subjects in 2 encounters.",
  oracle.sentence(today)
);
check("one team on Friday fixture", today.teamRows.length === 1, today.teamRows.length);
check("team 3 yield 1.5", today.teamRows[0].team === "3" && today.teamRows[0].yield === 1.5);

var emptyDay = oracle.summarize({
  leads: leads,
  encounters: encounters,
  from: "2026-09-01",
  to: "2026-09-01",
  catalogs: catalogs,
  today: "2026-09-04T12:00:00"
});
check("other day is zero arrests", emptyDay.arrests === 0);
check(
  "zero sentence",
  oracle.sentence(emptyDay) === "DAL-3 arrested 0 subjects in this period.",
  oracle.sentence(emptyDay)
);

var range = oracle.periodRange("today", new Date(2026, 8, 4));
check("today range", range.from === "2026-09-04" && range.to === "2026-09-04", range);

var week = oracle.periodRange("week", new Date(2026, 8, 4));
check("week starts Sunday", week.from === "2026-08-30" && week.to === "2026-09-04", week);

check("Friday weekday", oracle.weekdayOf("2026-09-04") === 5);
check("mean of 0 and 3", oracle.mean([0, 3]) === 1.5);
check("median of 2,1,0", oracle.median([2, 1, 0]) === 1);
check(
  "sample sd of 0 and 3",
  Math.abs(oracle.stdev([0, 3]) - Math.sqrt(4.5)) < 0.0001,
  oracle.stdev([0, 3])
);

var mondayLoc = model.createLocation({
  city: "Dallas",
  state: "TX",
  latitude: "32.79",
  longitude: "-96.81",
  association: "stop"
});
var mondayEnc = model.createEncounterRecord({
  encounterId: "DAL3-20260831-001",
  team: "3",
  startedAt: "2026-08-31T09:00:00",
  eventType: "VEHICLE_STOP"
});
mondayEnc.locations = [mondayLoc];
mondayEnc.centerLocationId = mondayLoc.locationId;
mondayEnc.subjects = [
  model.createEncounterSubject({
    lastName: "EMPTY",
    firstName: "Stop",
    encounterRole: "TARGET",
    outcome: "RELEASED"
  })
];
check(
  "complete monday empty cop stop",
  model.store.saveEncounter(mondayEnc, { mode: "complete" }).ok
);

encounters = (model.store.listEncounters() || []).map(function (row) {
  return model.store.getEncounter(row.encounterId);
});
var weekView = oracle.summarize({
  leads: leads,
  encounters: encounters,
  from: "2026-08-30",
  to: "2026-09-04",
  catalogs: catalogs,
  today: "2026-09-04T12:00:00"
});
check("week has 2 active days", weekView.spread.activeDays === 2, weekView.spread.activeDays);
check(
  "mean arrests per active day 1.5",
  weekView.spread.arrestsPerActiveDay.mean === 1.5,
  weekView.spread.arrestsPerActiveDay.mean
);
check(
  "median arrests per active day 1.5",
  weekView.spread.arrestsPerActiveDay.median === 1.5
);
check("sd exists for 2 days", weekView.spread.arrestsPerActiveDay.sd != null);
check(
  "yield per stop mean 1",
  weekView.spread.yieldPerStop.mean === 1,
  weekView.spread.yieldPerStop.mean
);
check("Friday has 2 stops", weekView.weekdays[5].stops === 2, weekView.weekdays[5].stops);
check("Monday has 1 empty stop", weekView.weekdays[1].stops === 1 && weekView.weekdays[1].arrests === 0);
check("Dallas has Friday and Monday", weekView.placeWeekdays.some(function (row) {
  return row.city === "Dallas" && row.days[5].stops >= 1 && row.days[1].stops >= 1;
}));
check("calendar days in week range", weekView.spread.calendarDays === 6, weekView.spread.calendarDays);

var team4Loc = model.createLocation({
  city: "Irving",
  state: "TX",
  latitude: "32.81",
  longitude: "-96.95",
  association: "stop"
});
var team4Enc = model.createEncounterRecord({
  encounterId: "DAL4-20260904-001",
  team: "4",
  startedAt: "2026-09-04T11:00:00",
  eventType: "VEHICLE_STOP"
});
team4Enc.locations = [team4Loc];
team4Enc.centerLocationId = team4Loc.locationId;
team4Enc.subjects = [
  model.createEncounterSubject({
    lastName: "TEAM4",
    firstName: "One",
    encounterRole: "TARGET",
    outcome: "ARRESTED"
  })
];
check(
  "complete team 4 cop stop",
  model.store.saveEncounter(team4Enc, { mode: "complete" }).ok
);
encounters = (model.store.listEncounters() || []).map(function (row) {
  return model.store.getEncounter(row.encounterId);
});
var teamsView = oracle.summarize({
  leads: leads,
  encounters: encounters,
  from: "2026-09-04",
  to: "2026-09-04",
  catalogs: catalogs,
  today: "2026-09-04T12:00:00"
});
check("two teams on Friday", teamsView.teamRows.length === 2, teamsView.teamRows.length);
var team3 = teamsView.teamRows.filter(function (row) { return row.team === "3"; })[0];
var team4 = teamsView.teamRows.filter(function (row) { return row.team === "4"; })[0];
check("team 3 still 1.5 yield", team3 && team3.yield === 1.5, team3 && team3.yield);
check("team 4 yield 1", team4 && team4.stops === 1 && team4.yield === 1, team4 && team4.yield);
check(
  "team table ignores scope filter",
  oracle.summarize({
    leads: leads,
    encounters: encounters,
    from: "2026-09-04",
    to: "2026-09-04",
    team: "4",
    catalogs: catalogs,
    today: "2026-09-04T12:00:00"
  }).teamRows.length === 2
);

if (fail) {
  console.log(fail + " failed");
  process.exit(1);
}
console.log("all passed");
