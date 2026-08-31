"use strict";

var fs = require("fs");
var path = require("path");
var vm = require("vm");

var context = {
  window: {},
  console: console
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

load("functions/pdf/i200-map.js");
load("functions/pdf/i205-map.js");
load("functions/pdf/fill-warrant.js");

var pdf = context.COPDoc.pdf;
var fail = 0;

function check(label, ok, extra) {
  if (!ok) {
    fail += 1;
    console.log("FAIL", label, extra || "");
  } else {
    console.log("ok", label);
  }
}

var i200Expected = [
  "File No",
  "Date",
  "is removable from the United States  This determination is based upon",
  "the execution of a charging document to initiate removal proceedings against the subject",
  "the pendency of ongoing removal proceedings against the subject",
  "the failure to establish admissibility subsequent to deferred inspection",
  "biometric confirmation of the subjects identity and a records check of federal",
  "statements made voluntarily by the subject to an immigration officer andor other",
  "Printed Name and Title of Authorized Immigration Officer",
  "Location",
  "Name of Alien",
  "Date of Service",
  "Language",
  "Name or Number of Interpreter if applicable"
];

var i205Expected = [
  "File No",
  "Date",
  "Full name of alien",
  "Place of entry",
  "Date of entry",
  "an immigration judge in exclusion deportation or removal proceedings",
  "a designated official",
  "the Board of Immigration Appeals",
  "a United States District or Magistrate Court Judge",
  "Title of immigration officer",
  "Date and office location",
  "INA LAW"
];

i200Expected.forEach(function (name) {
  var values = Object.keys(pdf.I200_FIELDS).map(function (k) {
    return pdf.I200_FIELDS[k];
  });
  check("I-200 field " + name, values.indexOf(name) !== -1);
});

i205Expected.forEach(function (name) {
  var values = Object.keys(pdf.I205_FIELDS).map(function (k) {
    return pdf.I205_FIELDS[k];
  });
  check("I-205 field " + name, values.indexOf(name) !== -1);
});

var mapped200 = pdf.mapI200({
  fileNo: "A000 111 222",
  date: "08/30/2026",
  officerName: "REYES, Maria",
  officerTitle: "IO",
  location: "ERO Dallas",
  nameOfAlien: "GARCIA, LUIS",
  basis: { charging: true }
});
check(
  "I-200 File No maps",
  mapped200.text["File No"] === "A000 111 222"
);
check(
  "I-200 name and title combine",
  mapped200.text["Printed Name and Title of Authorized Immigration Officer"] ===
    "REYES, Maria, IO"
);
check(
  "I-200 Name of Alien maps",
  mapped200.text["Name of Alien"] === "GARCIA, LUIS"
);
check(
  "I-200 voluntary starts Off",
  mapped200.checkboxes[
    "statements made voluntarily by the subject to an immigration officer andor other"
  ] === false
);
check(
  "I-200 charging On",
  mapped200.checkboxes[
    "the execution of a charging document to initiate removal proceedings against the subject"
  ] === true
);
check(
  "I-200 signatures not in fill map",
  !mapped200.text["Signature of Authorized Immigration Officer"] &&
    pdf.I200_SIGNATURES.length === 2
);

var mapped205 = pdf.mapI205({
  fileNo: "A000 111 222",
  date: "08/30/2026",
  fullName: "GARCIA, LUIS",
  location: "ERO Dallas",
  officerTitle: "IO",
  inaLaw: "237(a)(1)(A)",
  order: { ij: true }
});
check(
  "I-205 Full name of alien maps",
  mapped205.text["Full name of alien"] === "GARCIA, LUIS"
);
check(
  "I-205 date and office combine",
  mapped205.text["Date and office location"] === "08/30/2026, ERO Dallas"
);
check(
  "I-205 designated official starts Off",
  mapped205.checkboxes["a designated official"] === false
);
check(
  "I-205 IJ On",
  mapped205.checkboxes[
    "an immigration judge in exclusion deportation or removal proceedings"
  ] === true
);
check(
  "I-205 images not in fill map",
  pdf.I205_LEAVE_BLANK.indexOf("Image1_af_image") !== -1 &&
    mapped205.text["Image1_af_image"] === undefined
);

check(
  "compact A-number",
  pdf.compactANumber("A000 111 222") === "A000111222"
);
check(
  "filename pattern",
  pdf.warrantFileName({
    formType: "I-200",
    person: { name: { lastName: "Garcia", firstName: "Luis" } },
    fileNo: "A000 111 222",
    date: "08/30/2026"
  }) === "I-200_GARCIA_LUIS_A000111222_20260830.pdf"
);
check(
  "same-day duplicate appends id",
  pdf.warrantFileName({
    formType: "I-200",
    person: { name: { lastName: "Garcia", firstName: "Luis" } },
    fileNo: "A000 111 222",
    date: "08/30/2026",
    warrantId: "wnt_dup",
    existingNames: ["I-200_GARCIA_LUIS_A000111222_20260830.pdf"]
  }) === "I-200_GARCIA_LUIS_A000111222_20260830_wnt_dup.pdf"
);

if (fail) {
  process.exit(1);
}
console.log("ok warrant maps");
