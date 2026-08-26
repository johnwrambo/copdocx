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
  ["John Smith", { first: "John", middle: "", last: "Smith" }],
  ["john smith", { first: "John", middle: "", last: "Smith" }],
  ["Smith, John", { first: "John", middle: "", last: "Smith" }],
  ["Smith, John A", { first: "John", middle: "A", last: "Smith" }],
  ["Smith,John", { first: "John", middle: "", last: "Smith" }],
  ["John A Smith", { first: "John", middle: "A", last: "Smith" }],
  ["John Michael Smith", { first: "John", middle: "", last: "Michael-Smith" }],
  ["John", { first: "John", middle: "", last: "", complete: false }],
  ["Maria de la Cruz", { first: "Maria", middle: "", last: "de la Cruz" }],
  ["Juan Carlos de la Cruz", { first: "Juan", middle: "Carlos", last: "de la Cruz" }],
  ["de la Cruz, Maria Elena", { first: "Maria", middle: "Elena", last: "de la Cruz" }],
  ["Dr. John Smith Jr", { first: "John", middle: "", last: "Smith Jr" }],
  ["Smith Jr, John", { first: "John", middle: "", last: "Smith Jr" }],
  ["GARCIA, JUAN CARLOS", { first: "Juan", middle: "Carlos", last: "Garcia" }],
  ["Garcia Lopez, Juan", { first: "Juan", middle: "", last: "Garcia-Lopez" }],
  ["Juan Garcia Lopez", { first: "Juan", middle: "", last: "Garcia-Lopez" }],
  ["Juan Carlos Garcia Lopez", { first: "Juan", middle: "Carlos", last: "Garcia-Lopez" }],
  ["O'Brien, Mary Kate", { first: "Mary", middle: "Kate", last: "O'Brien" }],
  ["Jean-Luc Picard", { first: "Jean-Luc", middle: "", last: "Picard" }],
  ["von Neumann, John", { first: "John", middle: "", last: "von Neumann" }],
  ["mcdonald, john", { first: "John", middle: "", last: "McDonald" }]
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
  lastOnly.last !== "Garcia-Lopez" ||
  lastOnly.first !== "" ||
  lastOnly.isComplete
) {
  fail += 1;
  console.log("FAIL last-only dual surname", lastOnly);
} else {
  console.log("ok last-only Garcia Lopez");
}

const formatted = context.hyphenateLastName("GARCIA LOPEZ");
if (formatted !== "Garcia-Lopez") {
  fail += 1;
  console.log("FAIL hyphenate", formatted);
} else {
  console.log("ok hyphenateLastName");
}

if (fail) {
  process.exit(1);
}
console.log("all passed");
