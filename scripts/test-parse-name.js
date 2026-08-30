const fs = require("fs");
const vm = require("vm");
const path = require("path");

const context = {
  document: { getElementById: function () { return null; } },
  window: { setTimeout: setTimeout }
};
vm.createContext(context);
vm.runInContext(
  fs.readFileSync(path.join(__dirname, "..", "functions/names.js"), "utf8"),
  context
);

const cases = [
  ["John Smith", { first: "John", middle: "", last: "SMITH" }],
  ["john smith", { first: "John", middle: "", last: "SMITH" }],
  ["Smith, John", { first: "John", middle: "", last: "SMITH" }],
  ["Smith, John A", { first: "John", middle: "A", last: "SMITH" }],
  ["Smith,John", { first: "John", middle: "", last: "SMITH" }],
  ["John A Smith", { first: "John", middle: "A", last: "SMITH" }],
  ["John Michael Smith", { first: "John", middle: "", last: "MICHAEL-Smith" }],
  ["John", { first: "John", middle: "", last: "", complete: false }],
  ["Maria de la Cruz", { first: "Maria", middle: "", last: "DE LA CRUZ" }],
  ["Juan Carlos de la Cruz", { first: "Juan", middle: "Carlos", last: "DE LA CRUZ" }],
  ["de la Cruz, Maria Elena", { first: "Maria", middle: "Elena", last: "DE LA CRUZ" }],
  ["Dr. John Smith Jr", { first: "John", middle: "", last: "SMITH Jr" }],
  ["Smith Jr, John", { first: "John", middle: "", last: "SMITH Jr" }],
  ["GARCIA, JUAN CARLOS", { first: "Juan", middle: "Carlos", last: "GARCIA" }],
  ["Garcia Lopez, Juan", { first: "Juan", middle: "", last: "GARCIA-Lopez" }],
  ["Juan Garcia Lopez", { first: "Juan", middle: "", last: "GARCIA-Lopez" }],
  ["Juan Carlos Garcia Lopez", { first: "Juan", middle: "Carlos", last: "GARCIA-Lopez" }],
  ["O'Brien, Mary Kate", { first: "Mary", middle: "Kate", last: "O'BRIEN" }],
  ["Jean-Luc Picard", { first: "Jean-Luc", middle: "", last: "PICARD" }],
  ["von Neumann, John", { first: "John", middle: "", last: "VON NEUMANN" }],
  ["mcdonald, john", { first: "John", middle: "", last: "MCDONALD" }]
];

let fail = 0;
cases.forEach(function (row) {
  const input = row[0];
  const expect = row[1];
  const parsed = context.parsePersonName(input);
  const completeOk =
    expect.complete === false ? !parsed.isComplete : parsed.isComplete;
  const ok =
    parsed.first === expect.first &&
    parsed.middle === expect.middle &&
    parsed.last === expect.last &&
    completeOk;
  if (!ok) {
    fail += 1;
    console.log("FAIL", input, parsed);
  } else {
    console.log("ok", input);
  }
});

const lastOnly = context.parsePersonName("garcia lopez", { field: "lastName" });
if (
  lastOnly.last !== "GARCIA-Lopez" ||
  lastOnly.first !== "" ||
  lastOnly.isComplete
) {
  fail += 1;
  console.log("FAIL last-only dual surname", lastOnly);
} else {
  console.log("ok last-only Garcia Lopez");
}

const lastNameCases = [
  ["GARCIA LOPEZ", "GARCIA-Lopez"],
  ["garcia lopez", "GARCIA-Lopez"],
  ["garcia-lopez", "GARCIA-Lopez"],
  ["garcia", "GARCIA"],
  ["garcia ", "GARCIA "],
  ["garcia-", "GARCIA-"],
  ["o'brien", "O'BRIEN"],
  ["garcia de la cruz", "GARCIA-de la Cruz"]
];
lastNameCases.forEach(function (row) {
  const formatted = context.hyphenateLastName(row[0]);
  if (formatted !== row[1]) {
    fail += 1;
    console.log("FAIL hyphenate", row[0], formatted, "expected", row[1]);
  } else {
    console.log("ok hyphenateLastName", row[0]);
  }
});

if (fail) {
  process.exit(1);
}
console.log("all passed");
