"use strict";

var fs = require("fs");
var path = require("path");
var vm = require("vm");

var context = { window: {}, console: console };
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

var model = context.COPDoc.model;

function iso(day, hour) {
  var h = hour == null ? "14:00:00.000" : hour;
  return day + "T" + h + "Z";
}

function metaCommitted(day) {
  var t = iso(day);
  return {
    createdAt: t,
    updatedAt: t,
    markedComplete: false,
    status: "committed",
    committedAt: t
  };
}

function loc(extra) {
  var row = model.createLocation(extra);
  if (row.latitude && row.longitude && !row.latLong) {
    row.latLong = row.latitude + ", " + row.longitude;
  }
  return row;
}

function dualOfficer(extra) {
  var row = model.createOfficer(extra);
  row.meta = extra.meta || row.meta;
  row.id = row.officerId;
  if (row.locations[0] && !row.address) {
    row.address = model.addressFromLocation(row.locations[0]);
  }
  return row;
}

var ERO = loc({
  street: "8101 N Stemmons Freeway",
  city: "Dallas",
  state: "TX",
  zip: "75247",
  latitude: "32.8445",
  longitude: "-96.8750",
  association: "work",
  targetPriority: ""
});

var officers = [
  dualOfficer({
    lastName: "ROGERS",
    firstName: "Steve",
    badge: "1776",
    callSign: "CAP",
    duty: "available",
    role: "IO",
    team: "DAL - 3 / Street",
    qualifications: ["firearms", "ero-basic", "1801"],
    equipment: ["creds", "firearm", "radio", "armor"],
    locations: [model.createLocation(ERO)],
    meta: metaCommitted("2026-07-01")
  }),
  dualOfficer({
    lastName: "STARK",
    firstName: "Tony",
    badge: "3000",
    callSign: "IRON",
    duty: "admin",
    role: "SDDO",
    team: "DAL - 3 / Street",
    qualifications: ["firearms", "ero-basic"],
    equipment: ["creds", "gov-phone", "laptop"],
    locations: [
      loc({
        street: "2200 Ross Ave",
        city: "Dallas",
        state: "TX",
        zip: "75201",
        latitude: "32.7874",
        longitude: "-96.7970",
        association: "work"
      })
    ],
    meta: metaCommitted("2026-07-01")
  }),
  dualOfficer({
    lastName: "ROMANOFF",
    firstName: "Natasha",
    badge: "1013",
    callSign: "WIDOW",
    duty: "in-field",
    role: "IO",
    team: "DAL - 3 / Street",
    qualifications: ["firearms", "if", "spanish", "ero-basic"],
    equipment: ["creds", "firearm", "radio", "armor", "oc"],
    locations: [model.createLocation(ERO)],
    meta: metaCommitted("2026-07-02")
  }),
  dualOfficer({
    lastName: "BARTON",
    firstName: "Clint",
    badge: "1988",
    callSign: "HAWK",
    duty: "available",
    role: "IO",
    team: "DAL - 3 / Street",
    qualifications: ["firearms", "ero-basic"],
    equipment: ["creds", "firearm", "radio"],
    locations: [
      loc({
        street: "2500 Victory Ave",
        city: "Dallas",
        state: "TX",
        zip: "75219",
        latitude: "32.7905",
        longitude: "-96.8103",
        association: "work"
      })
    ],
    meta: metaCommitted("2026-07-02")
  }),
  dualOfficer({
    lastName: "BANNER",
    firstName: "Bruce",
    badge: "1962",
    callSign: "HULK",
    duty: "admin",
    role: "IO",
    team: "DAL - 3 / Street",
    qualifications: ["ero-basic"],
    equipment: ["creds", "laptop"],
    locations: [model.createLocation(ERO)],
    meta: metaCommitted("2026-07-03")
  }),
  dualOfficer({
    lastName: "ODINSON",
    firstName: "Thor",
    badge: "0001",
    callSign: "THOR",
    duty: "available",
    role: "IO",
    team: "DAL - 3 / Street",
    qualifications: ["firearms", "ero-basic", "1801"],
    equipment: ["creds", "firearm", "radio", "armor"],
    locations: [
      loc({
        street: "300 Reunion Blvd E",
        city: "Dallas",
        state: "TX",
        zip: "75207",
        latitude: "32.7756",
        longitude: "-96.8089",
        association: "work"
      })
    ],
    meta: metaCommitted("2026-07-03")
  }),
  dualOfficer({
    lastName: "WILSON",
    firstName: "Sam",
    badge: "1941",
    callSign: "FALCON",
    duty: "in-field",
    role: "IO",
    team: "DAL - 3 / Street",
    qualifications: ["firearms", "ero-basic"],
    equipment: ["creds", "firearm", "radio", "armor"],
    locations: [model.createLocation(ERO)],
    meta: metaCommitted("2026-07-04")
  }),
  dualOfficer({
    lastName: "FURY",
    firstName: "Nick",
    badge: "0007",
    callSign: "FURY",
    duty: "admin",
    role: "AFOD",
    team: "DAL - FOD",
    qualifications: ["firearms", "ero-basic", "1801"],
    equipment: ["creds", "firearm", "gov-phone"],
    locations: [model.createLocation(ERO)],
    meta: metaCommitted("2026-07-01")
  }),
  dualOfficer({
    lastName: "DANVERS",
    firstName: "Carol",
    badge: "1989",
    callSign: "MARVEL",
    duty: "available",
    role: "IO",
    team: "DAL - 3 / Street",
    qualifications: ["firearms", "ero-basic"],
    equipment: ["creds", "firearm", "radio", "armor"],
    locations: [
      loc({
        street: "8008 Herb Kelleher Way",
        city: "Dallas",
        state: "TX",
        zip: "75235",
        latitude: "32.8471",
        longitude: "-96.8518",
        association: "work"
      })
    ],
    meta: metaCommitted("2026-07-05")
  }),
  dualOfficer({
    lastName: "RHODES",
    firstName: "James",
    badge: "1999",
    callSign: "RHODEY",
    duty: "available",
    role: "IO",
    team: "DAL - 3 / Street",
    qualifications: ["firearms", "ero-basic", "cdl"],
    equipment: ["creds", "firearm", "radio"],
    locations: [model.createLocation(ERO)],
    meta: metaCommitted("2026-07-05")
  })
];

function ofc(callSign) {
  var i;
  for (i = 0; i < officers.length; i++) {
    if (officers[i].callSign === callSign) {
      return officers[i].officerId;
    }
  }
  return officers[0].officerId;
}

var vehicles = [
  model.createVehicle({
    governmentVehicle: true,
    unit: "DAL-31",
    licensePlate: "TX G0V031",
    plate: "TX G0V031",
    plateState: "TX",
    vehicleYear: "2023",
    vehicleMake: "Ford",
    vehicleModel: "Explorer",
    vehicleColor: "White",
    vehicleBodyStyle: "SUV",
    status: "assigned",
    barcode: "DAL31",
    driverNumber: "D-31",
    assignedOfficerIds: [ofc("CAP")],
    equipment: ["radio", "emergency-lights", "caged"],
    meta: metaCommitted("2026-07-10")
  }),
  model.createVehicle({
    governmentVehicle: true,
    unit: "DAL-32",
    licensePlate: "TX G0V032",
    plate: "TX G0V032",
    plateState: "TX",
    vehicleYear: "2022",
    vehicleMake: "Chevrolet",
    vehicleModel: "Tahoe",
    vehicleColor: "White",
    vehicleBodyStyle: "SUV",
    status: "assigned",
    barcode: "DAL32",
    assignedOfficerIds: [ofc("WIDOW"), ofc("HAWK")],
    equipment: ["radio", "emergency-lights", "gun-box"],
    meta: metaCommitted("2026-07-10")
  }),
  model.createVehicle({
    governmentVehicle: true,
    unit: "DAL-33",
    licensePlate: "TX G0V033",
    plate: "TX G0V033",
    plateState: "TX",
    vehicleYear: "2021",
    vehicleMake: "Ford",
    vehicleModel: "Transit",
    vehicleColor: "White",
    vehicleBodyStyle: "Van",
    status: "available",
    barcode: "DAL33",
    assignedOfficerIds: [ofc("RHODEY")],
    equipment: ["radio", "caged"],
    meta: metaCommitted("2026-07-11")
  }),
  model.createVehicle({
    governmentVehicle: true,
    unit: "DAL-34",
    licensePlate: "TX G0V034",
    plate: "TX G0V034",
    plateState: "TX",
    vehicleYear: "2024",
    vehicleMake: "Dodge",
    vehicleModel: "Durango",
    vehicleColor: "Black",
    vehicleBodyStyle: "SUV",
    status: "available",
    barcode: "DAL34",
    assignedOfficerIds: [ofc("FALCON")],
    equipment: ["radio", "emergency-lights"],
    meta: metaCommitted("2026-07-11")
  })
];

var shifts = [
  { id: "sft_demo_1", date: "2026-08-31", officerId: ofc("CAP"), vehicleId: vehicles[0].vehicleId, start: "06:00", end: "14:00", assignment: "field" },
  { id: "sft_demo_2", date: "2026-08-31", officerId: ofc("WIDOW"), vehicleId: vehicles[1].vehicleId, start: "06:00", end: "14:00", assignment: "field" },
  { id: "sft_demo_3", date: "2026-08-31", officerId: ofc("FURY"), vehicleId: "", start: "07:00", end: "15:00", assignment: "office" },
  { id: "sft_demo_4", date: "2026-09-01", officerId: ofc("HAWK"), vehicleId: vehicles[1].vehicleId, start: "14:00", end: "22:00", assignment: "field" },
  { id: "sft_demo_5", date: "2026-09-01", officerId: ofc("FALCON"), vehicleId: vehicles[3].vehicleId, start: "06:00", end: "14:00", assignment: "field" },
  { id: "sft_demo_6", date: "2026-09-02", officerId: ofc("THOR"), vehicleId: vehicles[0].vehicleId, start: "06:00", end: "14:00", assignment: "field" },
  { id: "sft_demo_7", date: "2026-09-02", officerId: ofc("MARVEL"), vehicleId: vehicles[2].vehicleId, start: "14:00", end: "22:00", assignment: "transport" },
  { id: "sft_demo_8", date: "2026-09-03", officerId: ofc("RHODEY"), vehicleId: vehicles[2].vehicleId, start: "06:00", end: "14:00", assignment: "transport" }
];

function leadFrom(opts) {
  var snap = model.createLeadSnapshot();
  snap.meta = metaCommitted(opts.day);
  snap.source = model.createSource({
    leadSource: opts.leadSource || "discovered",
    caseNumber: opts.caseNumber || "",
    leadInfo: opts.leadInfo || ""
  });
  var person = snap.person;
  person.caseRole = "LEAD";
  person.name.lastName = opts.lastName;
  person.name.firstName = opts.firstName;
  person.name.middleName = opts.middleName || "";
  person.sex = opts.sex || "male";
  person.dateOfBirth = opts.dob || "";
  person.age = opts.age || "";
  person.citizenship = opts.citizenship || "";
  person.lexId = opts.lexId || "";
  person.criminal = {
    isCriminal: !!opts.criminal,
    fbiNumber: opts.fbiNumber || "",
    ncicNumber: "",
    stateId: "",
    rapSheet: opts.rapSheet || ""
  };
  person.immigration = {
    alienNumber: opts.alienNumber || "",
    finNumber: opts.finNumber || "",
    disposition: opts.disposition || "",
    status: opts.status || "",
    finalOrder: !!opts.finalOrder,
    finalOrderDate: opts.finalOrderDate || "",
    firstDeportationDate: opts.firstDeportationDate || "",
    lastDeportationDate: opts.lastDeportationDate || "",
    baseballCards: []
  };
  person.locations = (opts.locations || []).map(function (row) {
    return loc(row);
  });
  person.convictions = (opts.convictions || []).map(function (row) {
    return model.createConviction(row);
  });
  person.arrests = (opts.arrests || []).map(function (row) {
    return model.createArrest(row);
  });
  snap.vehicles = (opts.vehicles || []).map(function (row) {
    var v = model.createVehicle(row);
    v.meta = metaCommitted(opts.day);
    v.governmentVehicle = false;
    return v;
  });
  snap.vehicles.forEach(function (vehicle) {
    if (!vehicle.locations || !vehicle.locations.length) {
      return;
    }
    snap.links.push(
      model.createLink({
        from: { type: "VEHICLE", id: vehicle.vehicleId },
        to: { type: "PERSON", id: person.personId },
        reasons: ["OPERATES"],
        notes: ""
      })
    );
  });
  return snap;
}

var leads = [
  leadFrom({
    day: "2026-08-12",
    lastName: "LAUFEYSON",
    firstName: "Loki",
    sex: "male",
    dob: "1985-12-17",
    age: "40",
    citizenship: "IS",
    alienNumber: "A200 111 001",
    lexId: "LEX-LOKI",
    leadSource: "elite",
    caseNumber: "DAL-26-1001",
    disposition: "WA/NTA",
    status: "D",
    leadInfo: "Subject using the alias Loki of Asgard. Frequent no-show at ERO Dallas.",
    locations: [
      {
        street: "2200 Ross Ave",
        street2: "Ste 4800",
        city: "Dallas",
        state: "TX",
        zip: "75201",
        latitude: "32.7874",
        longitude: "-96.7970",
        association: "residence",
        targetPriority: "1"
      },
      {
        street: "2403 Flora St",
        city: "Dallas",
        state: "TX",
        zip: "75201",
        latitude: "32.7894",
        longitude: "-96.7984",
        association: "work",
        targetPriority: "2"
      }
    ],
    vehicles: [
      {
        licensePlate: "TRCKSTR",
        plateState: "TX",
        vehicleYear: "2019",
        vehicleMake: "Audi",
        vehicleModel: "A6",
        vehicleColor: "Green",
        registeredOwnerName: "LAUFEYSON, LOKI",
        locations: [
          loc({
            street: "2200 Ross Ave",
            city: "Dallas",
            state: "TX",
            zip: "75201",
            latitude: "32.7874",
            longitude: "-96.7970",
            association: "known-parking",
            targetPriority: "3"
          })
        ]
      }
    ]
  }),
  leadFrom({
    day: "2026-08-14",
    lastName: "THANOS",
    firstName: "Dione",
    sex: "male",
    dob: "1970-01-01",
    age: "56",
    citizenship: "GR",
    alienNumber: "A200 111 002",
    leadSource: "otherLe",
    caseNumber: "DAL-26-1002",
    disposition: "REINST",
    status: "D",
    finalOrder: true,
    finalOrderDate: "2018-07-09",
    firstDeportationDate: "2018-08-01",
    lastDeportationDate: "2023-02-14",
    criminal: true,
    fbiNumber: "123456AA0",
    convictions: [
      { crime: "Aggravated assault", convictionDate: "2016-04-12", court: "Dallas County", convictionClass: "felony" }
    ],
    locations: [
      {
        street: "1300 Robert B Cullum Blvd",
        city: "Dallas",
        state: "TX",
        zip: "75210",
        latitude: "32.7816",
        longitude: "-96.7617",
        association: "residence",
        targetPriority: "1"
      }
    ]
  }),
  leadFrom({
    day: "2026-08-15",
    lastName: "ULTRON",
    firstName: "Victor",
    sex: "male",
    dob: "1991-05-01",
    age: "35",
    citizenship: "DE",
    alienNumber: "A200 111 003",
    leadSource: "tag",
    caseNumber: "DAL-26-1003",
    disposition: "ER",
    locations: [
      {
        street: "8687 N Central Expy",
        city: "Dallas",
        state: "TX",
        zip: "75225",
        latitude: "32.8687",
        longitude: "-96.7736",
        association: "work",
        targetPriority: "2"
      }
    ],
    vehicles: [
      {
        licensePlate: "NTLGNC",
        plateState: "TX",
        vehicleYear: "2020",
        vehicleMake: "Tesla",
        vehicleModel: "Model S",
        vehicleColor: "Silver",
        registeredOwnerName: "ULTRON, VICTOR",
        locations: [
          loc({
            street: "8687 N Central Expy",
            city: "Dallas",
            state: "TX",
            zip: "75225",
            latitude: "32.8687",
            longitude: "-96.7736",
            association: "plate-check"
          })
        ]
      }
    ]
  }),
  leadFrom({
    day: "2026-08-16",
    lastName: "ODINSDOTTIR",
    firstName: "Hela",
    sex: "female",
    dob: "1978-11-02",
    age: "47",
    citizenship: "NO",
    alienNumber: "A200 111 004",
    leadSource: "discovered",
    caseNumber: "DAL-26-1004",
    disposition: "ADMDPT",
    locations: [
      {
        street: "131 E Exchange Ave",
        city: "Fort Worth",
        state: "TX",
        zip: "76164",
        latitude: "32.7887",
        longitude: "-97.3473",
        association: "residence",
        targetPriority: "1"
      }
    ]
  }),
  leadFrom({
    day: "2026-08-17",
    lastName: "SCHMIDT",
    firstName: "Johann",
    sex: "male",
    dob: "1968-03-03",
    age: "58",
    citizenship: "DE",
    alienNumber: "A200 111 005",
    leadSource: "otherLe",
    caseNumber: "DAL-26-1005",
    disposition: "HCA",
    criminal: true,
    fbiNumber: "999111BB1",
    convictions: [
      { crime: "Unlawful possession of a firearm", convictionDate: "2014-09-22", court: "Northern District of Texas", convictionClass: "felony" }
    ],
    arrests: [{ arrestDate: "2026-08-17", arrestCharge: "Reentry after deportation", arrestAgency: "ICE ERO Dallas" }],
    locations: [
      {
        street: "411 Elm St",
        city: "Dallas",
        state: "TX",
        zip: "75202",
        latitude: "32.7787",
        longitude: "-96.8083",
        association: "residence",
        targetPriority: "1"
      }
    ]
  }),
  leadFrom({
    day: "2026-08-18",
    lastName: "STEVENS",
    firstName: "Erik",
    sex: "male",
    dob: "1988-02-14",
    age: "38",
    citizenship: "ZA",
    alienNumber: "A200 111 006",
    leadSource: "elite",
    caseNumber: "DAL-26-1006",
    disposition: "REINST",
    finalOrder: true,
    finalOrderDate: "2021-06-01",
    lastDeportationDate: "2021-07-15",
    locations: [
      {
        street: "201 Main St",
        city: "Fort Worth",
        state: "TX",
        zip: "76102",
        latitude: "32.7555",
        longitude: "-97.3308",
        association: "work",
        targetPriority: "2"
      },
      {
        street: "1500 Marilla St",
        city: "Dallas",
        state: "TX",
        zip: "75201",
        latitude: "32.7763",
        longitude: "-96.7969",
        association: "residence",
        targetPriority: "3"
      }
    ]
  }),
  leadFrom({
    day: "2026-08-19",
    lastName: "ZEMO",
    firstName: "Helmut",
    sex: "male",
    dob: "1975-09-09",
    age: "50",
    citizenship: "AT",
    alienNumber: "A200 111 007",
    leadSource: "discovered",
    caseNumber: "DAL-26-1007",
    disposition: "PD",
    locations: [
      {
        street: "1520 K Ave",
        city: "Plano",
        state: "TX",
        zip: "75074",
        latitude: "33.0198",
        longitude: "-96.6989",
        association: "residence",
        targetPriority: "2"
      }
    ]
  }),
  leadFrom({
    day: "2026-08-20",
    lastName: "RONAN",
    firstName: "Kree",
    sex: "male",
    dob: "1982-04-04",
    age: "44",
    citizenship: "IE",
    alienNumber: "A200 111 008",
    leadSource: "tag",
    caseNumber: "DAL-26-1008",
    disposition: "ER/CF",
    locations: [
      {
        street: "2400 Aviation Dr",
        city: "DFW Airport",
        state: "TX",
        zip: "75261",
        latitude: "32.8998",
        longitude: "-97.0403",
        association: "work",
        targetPriority: "1"
      }
    ],
    vehicles: [
      {
        licensePlate: "ACCSR1",
        plateState: "TX",
        vehicleYear: "2018",
        vehicleMake: "GMC",
        vehicleModel: "Yukon",
        vehicleColor: "Black",
        registeredOwnerName: "RONAN, KREE"
      }
    ]
  }),
  leadFrom({
    day: "2026-08-21",
    lastName: "MAW",
    firstName: "Ebony",
    sex: "male",
    dob: "1979-08-08",
    age: "46",
    citizenship: "ET",
    alienNumber: "A200 111 009",
    leadSource: "otherLe",
    caseNumber: "DAL-26-1009",
    disposition: "WA/NTA",
    locations: [
      {
        street: "8008 Herb Kelleher Way",
        city: "Dallas",
        state: "TX",
        zip: "75235",
        latitude: "32.8471",
        longitude: "-96.8518",
        association: "residence",
        targetPriority: "2"
      }
    ]
  }),
  leadFrom({
    day: "2026-08-22",
    lastName: "MIDNIGHT",
    firstName: "Proxima",
    sex: "female",
    dob: "1990-10-31",
    age: "35",
    citizenship: "KE",
    alienNumber: "A200 111 010",
    leadSource: "discovered",
    caseNumber: "DAL-26-1010",
    disposition: "V",
    locations: [
      {
        street: "734 Stadium Dr",
        city: "Arlington",
        state: "TX",
        zip: "76011",
        latitude: "32.7473",
        longitude: "-97.0842",
        association: "residence",
        targetPriority: "1"
      }
    ]
  }),
  leadFrom({
    day: "2026-08-23",
    lastName: "GLAIVE",
    firstName: "Corvus",
    sex: "male",
    dob: "1984-06-06",
    age: "42",
    citizenship: "RU",
    alienNumber: "A200 111 011",
    leadSource: "elite",
    caseNumber: "DAL-26-1011",
    disposition: "REINRF",
    locations: [
      {
        street: "9200 World Cup Way",
        city: "Frisco",
        state: "TX",
        zip: "75033",
        latitude: "33.1545",
        longitude: "-96.8353",
        association: "work",
        targetPriority: "3"
      }
    ]
  }),
  leadFrom({
    day: "2026-08-24",
    lastName: "KANG",
    firstName: "Nathaniel",
    sex: "male",
    dob: "1973-01-30",
    age: "53",
    citizenship: "NL",
    alienNumber: "A200 111 012",
    leadSource: "discovered",
    caseNumber: "DAL-26-1012",
    disposition: "WA/NTA",
    status: "IA",
    locations: [
      {
        street: "500 W Las Colinas Blvd",
        city: "Irving",
        state: "TX",
        zip: "75039",
        latitude: "32.8786",
        longitude: "-96.9413",
        association: "residence",
        targetPriority: "1"
      },
      {
        street: "8101 N Stemmons Freeway",
        city: "Dallas",
        state: "TX",
        zip: "75247",
        latitude: "32.8445",
        longitude: "-96.8750",
        association: "work"
      }
    ]
  })
];

function bookinFromLead(snap, iceEvent, updated) {
  var person = snap.person;
  var name = person.name || {};
  var a = String((person.immigration && person.immigration.alienNumber) || "").replace(/\D/g, "");
  return {
    id: "bk_demo_" + snap.leadId,
    createdAt: updated,
    updatedAt: updated,
    createdWithVersion: "0.5.2",
    updatedWithVersion: "0.5.2",
    firstName: name.firstName,
    lastName: name.lastName,
    aNumber: a,
    iceEvent: iceEvent
  };
}

var bookin = [
  bookinFromLead(leads[0], "E260812001", iso("2026-08-12")),
  bookinFromLead(leads[1], "E260814002", iso("2026-08-14")),
  bookinFromLead(leads[4], "E260817005", iso("2026-08-17")),
  bookinFromLead(leads[9], "E260822010", iso("2026-08-22"))
];

var bundle = {
  format: "copdocx.transfer.v1",
  appVersion: "0.10.0",
  exportedAt: iso("2026-08-30", "18:00:00.000"),
  filters: {
    types: ["leads", "officers", "vehicles", "shifts", "bookin"],
    from: "",
    to: ""
  },
  note: "Demonstration workspace. File → Import. Avengers = officers; MCU villains = leads. DFW addresses include latitude/longitude for the map. Not loaded unless you import it.",
  leads: leads,
  officers: officers,
  vehicles: vehicles,
  shifts: shifts,
  bookin: bookin
};

var out = path.join(__dirname, "..", "COPDoc_demo.json");
fs.writeFileSync(out, JSON.stringify(bundle, null, 2));
console.log("wrote", out);
console.log(
  "officers",
  officers.length,
  "vehicles",
  vehicles.length,
  "shifts",
  shifts.length,
  "leads",
  leads.length,
  "bookin",
  bookin.length
);
