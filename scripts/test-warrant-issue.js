"use strict";

var fs = require("fs");
var path = require("path");
var vm = require("vm");

var context = {
  window: {},
  document: {
    body: {
      getAttribute: function () {
        return "";
      }
    },
    getElementById: function () {
      return null;
    },
    readyState: "complete",
    addEventListener: function () {}
  },
  localStorage: {
    getItem: function () {
      return null;
    },
    setItem: function () {}
  },
  console: console
};
context.globalThis = context;
context.window = context;
vm.createContext(context);
require("./support/module-dependencies.js").loadScript(context, "functions/warrant-issue.js");

var api = context.COPDoc.warrantIssue;
var fail = 0;

function check(label, ok, extra) {
  if (!ok) {
    fail += 1;
    console.log("FAIL", label, extra || "");
  } else {
    console.log("ok", label);
  }
}

check("issueErrors exported", !!(api && typeof api.issueErrors === "function"));

var missing = api.issueErrors({
  formType: "I-200",
  fileNo: "",
  officerName: "",
  basis: []
});
check("I-200 requires file number", missing.indexOf("Enter a 9-digit file number.") !== -1);
check("I-200 requires officer", missing.indexOf("Select an issuing officer.") !== -1);
check("I-200 requires basis", missing.indexOf("Select at least one basis.") !== -1);

var ok200 = api.issueErrors({
  formType: "I-200",
  fileNo: "A000111222",
  officerName: "REYES, Maria",
  basis: ["basisCharging"]
});
check("valid I-200 has no errors", ok200.length === 0, ok200);

var missing205 = api.issueErrors({
  formType: "I-205",
  fileNo: "A000111222",
  officerName: "REYES, Maria",
  basis: []
});
check("I-205 requires order", missing205.indexOf("Select at least one order.") !== -1);

var ok205 = api.issueErrors({
  formType: "I-205",
  fileNo: "A000111222",
  officerName: "REYES, Maria",
  basis: ["orderIJ"]
});
check("valid I-205 has no errors", ok205.length === 0, ok205);

if (fail) {
  process.exit(1);
}
console.log("ok warrant-issue");
