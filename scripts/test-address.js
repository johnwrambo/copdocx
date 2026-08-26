const fs = require("fs");
const vm = require("vm");
const path = require("path");

const context = {
  document: {
    getElementById: function () {
      return null;
    }
  },
  window: { setTimeout: setTimeout }
};
vm.createContext(context);
vm.runInContext(
  fs.readFileSync(path.join(__dirname, "..", "functions/address.js"), "utf8"),
  context
);

let fail = 0;
function check(label, ok, extra) {
  if (!ok) {
    fail += 1;
    console.log("FAIL", label, extra || "");
  } else {
    console.log("ok", label);
  }
}

const parsed = context.parseAddress(
  "123 n main st apt 4, houston, tx 77002"
);
check(
  "parse street",
  parsed.components.street === "123 N Main St",
  parsed.components
);
check("parse unit", parsed.components.street2 === "Apt 4");
check("parse city", parsed.components.city === "Houston");
check("parse state", parsed.components.state === "TX");
check("parse zip", parsed.components.zip === "77002");
check("parse complete", parsed.isComplete === true);

const texas = context.parseAddress("500 Travis Street, Houston, Texas 77002-1234");
check("state name", texas.components.state === "TX");
check("zip+4", texas.components.zip === "77002-1234");

const empty = context.validateAddress({
  street: "",
  street2: "",
  city: "",
  state: "",
  zip: ""
});
check("empty is valid", empty.valid === true && empty.complete === false);

const good = context.validateAddress({
  street: "123 main st",
  street2: "",
  city: "houston",
  state: "texas",
  zip: "77002"
});
check("good address", good.valid && good.complete);
check("norm street", good.normalized.street === "123 Main St");
check("norm city", good.normalized.city === "Houston");
check("norm state", good.normalized.state === "TX");

const badZip = context.validateAddress({
  street: "123 Main St",
  city: "Houston",
  state: "TX",
  zip: "77"
});
check(
  "bad zip",
  !badZip.valid &&
    badZip.errors.some(function (e) {
      return e.field === "zip";
    })
);

const badState = context.validateAddress({
  street: "123 Main St",
  city: "Houston",
  state: "ZZ",
  zip: "77002"
});
check(
  "bad state",
  !badState.valid &&
    badState.errors.some(function (e) {
      return e.field === "state";
    })
);

const poBox = context.validateAddress({
  street: "po box 441",
  city: "Laredo",
  state: "TX",
  zip: "78040"
});
check("po box", poBox.valid && poBox.normalized.street === "Po Box 441");

const query = context.formatAddressQuery({
  street: "123 Main St",
  street2: "Apt 4",
  city: "Houston",
  state: "TX",
  zip: "77002"
});
check(
  "maps query",
  query === "123 Main St, Apt 4, Houston, TX, 77002",
  query
);
check(
  "maps url",
  context.googleMapsSearchUrl(query).indexOf("google.com/maps/search") !== -1
);
check("coord format", context.formatCoordinate(-95.36981234) === "-95.369812");

if (fail) {
  process.exit(1);
}
console.log("all passed");
