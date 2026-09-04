const fs = require("fs");
const vm = require("vm");
const path = require("path");

const context = { document: {} };
vm.createContext(context);
vm.runInContext(
  fs.readFileSync(path.join(__dirname, "..", "functions/age.js"), "utf8"),
  context
);

function check(label, ok, extra) {
  if (!ok) {
    console.log("FAIL", label, extra || "");
    process.exitCode = 1;
  } else {
    console.log("ok", label);
  }
}

const asOf = new Date(2026, 7, 25);
check("adult", context.calculateAge("2000-01-01", asOf) === 26);
check("turns 18 today", context.calculateAge("2008-08-25", asOf) === 18);
check("still 17", context.calculateAge("2008-08-26", asOf) === 17);
check("minor flag", context.isMinor(17) === true && context.isMinor(18) === false);
check("invalid", context.calculateAge("not-a-date", asOf) === null);
check("future", context.calculateAge("2099-01-01", asOf) === null);

if (process.exitCode) {
  process.exit(1);
}
console.log("all passed");
