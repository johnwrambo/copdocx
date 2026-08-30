const fs = require("fs");
const vm = require("vm");
const path = require("path");

const context = {
  document: { getElementById: function () { return null; } }
};
vm.createContext(context);
vm.runInContext(
  fs.readFileSync(path.join(__dirname, "..", "functions/ssn.js"), "utf8"),
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

check("empty digits", context.ssnDigits("") === "");
check("strip junk", context.ssnDigits("123-45-6789abc") === "123456789");
check("cap at 9", context.ssnDigits("123456789012") === "123456789");

check("format 3", context.formatSSN("123") === "123");
check("format 5", context.formatSSN("12345") === "123-45");
check("format 9", context.formatSSN("123456789") === "123-45-6789");
check("format paste spaces", context.formatSSN("123 45 6789") === "123-45-6789");

const empty = context.validateSSN("");
check("empty allowed", empty.valid === true && empty.complete === false);

const partial = context.validateSSN("123-45");
check("partial not complete", partial.valid === false && partial.reason.indexOf("9 digits") !== -1);

const good = context.validateSSN("167-38-2914");
check("valid ssn", good.valid === true && good.kind === "SSN" && good.formatted === "167-38-2914");

check("area 000", context.validateSSN("000-12-3456").valid === false);
check("area 666", context.validateSSN("666-12-3456").valid === false);
check("group 00", context.validateSSN("167-00-3456").valid === false);
check("serial 0000", context.validateSSN("167-38-0000").valid === false);
check("woolworth sample", context.validateSSN("078-05-1120").valid === false);
check("repeating", context.validateSSN("111-11-1111").valid === false);

const itin = context.validateSSN("912-70-1234");
check("itin accepted", itin.valid === true && itin.kind === "ITIN");
check("area 9 not itin", context.validateSSN("912-12-3456").valid === false);

function mockInput(value) {
  return {
    value: value,
    selectionStart: String(value || "").length,
    selectionEnd: String(value || "").length,
    classList: {
      toggle: function () {},
      remove: function () {}
    },
    setAttribute: function () {},
    setSelectionRange: function (start, end) {
      this.selectionStart = start;
      this.selectionEnd = end;
    }
  };
}

const typed = mockInput("123456789");
const typedResult = context.applySSNToInput(typed, { showStatus: true });
check("input formats on apply", typed.value === "123-45-6789", typed.value);
check("123-45-6789 flagged", typedResult.valid === false);

const live = mockInput("167382914");
context.applySSNToInput(live, { showStatus: true });
check("input formats valid", live.value === "167-38-2914", live.value);

if (process.exitCode) {
  process.exit(1);
}
console.log("all passed");
