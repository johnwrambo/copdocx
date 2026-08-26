const fs = require("fs");
const vm = require("vm");
const path = require("path");

const root = path.join(__dirname, "..");
const ctx = {};
vm.createContext(ctx);
vm.runInContext(
  fs.readFileSync(path.join(root, "data/us-places.js"), "utf8"),
  ctx
);

const counties = ctx.US_COUNTIES.filter(function (c) {
  return c.state_code === "TX";
})
  .map(function (c) {
    return c.label;
  })
  .sort(function (a, b) {
    return a.localeCompare(b);
  });

function slug(name) {
  return name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

const rows = counties.map(function (name) {
  return {
    code: "TX_SO_" + slug(name),
    label: name + " County Sheriff's Office",
    level: "county",
    type: "sheriff",
    state: "TX",
    county: name,
    aliases: [name + " SO", name + " County SO", name + " Sheriff"],
    active: true
  };
});

const body = rows
  .map(function (row) {
    return "  " + JSON.stringify(row);
  })
  .join(",\n");

const file =
  "// Texas county sheriffs — all 254 counties.\n" +
  "// Generated from US_COUNTIES (state_code TX). Codes are TX_SO_<COUNTY>.\n" +
  "// Directory: https://txsheriffs.org/directory/\n\n" +
  "var TEXAS_SHERIFFS = [\n" +
  body +
  "\n];\n\n" +
  "function texasSheriffLabels() {\n" +
  "  return TEXAS_SHERIFFS.map(function (a) {\n" +
  "    return a.label;\n" +
  "  });\n" +
  "}\n\n" +
  "function texasSheriffByCounty(county) {\n" +
  "  var key = String(county || \"\").toLowerCase();\n" +
  "  return (\n" +
  "    TEXAS_SHERIFFS.find(function (a) {\n" +
  "      return a.county.toLowerCase() === key;\n" +
  "    }) || null\n" +
  "  );\n" +
  "}\n";

fs.writeFileSync(path.join(root, "data/le/texas-sheriffs.js"), file);
console.log("wrote", rows.length, "sheriffs");
