const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const mem = {};
global.localStorage = {
  getItem: function (key) {
    return Object.prototype.hasOwnProperty.call(mem, key) ? mem[key] : null;
  },
  setItem: function (key, value) {
    mem[key] = String(value);
  }
};

[
  "data/narratives/narrative-shared-options.js",
  "data/narratives/sections/01-origin.js",
  "data/narratives/sections/02-authority.js",
  "data/narratives/sections/03-context.js",
  "data/narratives/sections/04-observation.js",
  "data/narratives/sections/05-contact.js",
  "data/narratives/sections/06-conduct-incidents.js",
  "data/narratives/sections/07-confirmation.js",
  "data/narratives/sections/08-custody.js",
  "data/narratives/sections/09-vehicle-property.js",
  "data/narratives/sections/10-final-disposition.js",
  "data/narratives/narrative-master.js",
  "functions/narratives/narrative-library-store.js"
].forEach(function (file) {
  require(path.join(root, file));
});

const library = global.COPDoc.narratives.library;
const origin = library.listLineages("origin", "origin_type");
const preplanned = origin.find(function (row) {
  return row.lineageId === "preplanned_targeted_arrest";
});
assert.ok(preplanned, "master origin option is listed");
assert.equal(preplanned.currentId, "preplanned_targeted_arrest");
assert.match(preplanned.current.text, /preplanned enforcement action/);

const v2 = library.addVersion({
  sectionId: "origin",
  fieldId: "origin_type",
  lineageId: "preplanned_targeted_arrest",
  label: "Preplanned targeted arrest",
  text: "Officers conducted a preplanned enforcement action to locate and arrest [SUBJECT] near [ADDRESS].",
  basedOn: "preplanned_targeted_arrest"
});
assert.equal(v2.version, 2);
assert.equal(v2.optionId, "preplanned_targeted_arrest__v2");

const after = library.listLineages("origin", "origin_type").find(function (row) {
  return row.lineageId === "preplanned_targeted_arrest";
});
assert.equal(after.currentId, "preplanned_targeted_arrest__v2");
assert.equal(after.versions.length, 2);
assert.match(after.current.text, /near \[ADDRESS\]/);

const masterOption = global.COPDoc.narratives.MASTER_NARRATIVE_SECTIONS[0].fields[0].options.find(
  function (option) {
    return option.id === "preplanned_targeted_arrest";
  }
);
assert.match(masterOption.text, /near \[ADDRESS\]/, "current version overlays master text");
assert.equal(
  global.COPDoc.narratives.MASTER_NARRATIVE_SECTIONS[0].fields[0].options.filter(function (option) {
    return option.label === "Preplanned targeted arrest";
  }).length,
  1,
  "engine dropdown keeps a single label"
);

assert.throws(function () {
  library.addOption("origin", "origin_type", {
    label: "Preplanned targeted arrest",
    text: "Duplicate label should fail."
  });
}, /already exists/);

library.setCurrent("origin_type", "preplanned_targeted_arrest", "preplanned_targeted_arrest");
const restored = global.COPDoc.narratives.MASTER_NARRATIVE_SECTIONS[0].fields[0].options.find(
  function (option) {
    return option.id === "preplanned_targeted_arrest";
  }
);
assert.match(restored.text, /locate and arrest \[SUBJECT\]\.$/);

library.saveProfile({
  eventType: "TARGETED_ARREST",
  label: "Targeted arrest / planned enforcement",
  selections: { origin_type: "preplanned_targeted_arrest" }
});
const profile = library.profileForEventType("TARGETED_ARREST");
assert.equal(profile.selections.origin_type, "preplanned_targeted_arrest");
assert.match(
  library.preview({ origin_type: "preplanned_targeted_arrest" }),
  /Officers conducted a preplanned/
);

const page = fs.readFileSync(path.join(root, "narrative-library.html"), "utf8");
assert.match(page, /data-page="narrative-library"/);
assert.match(page, /functions\/narratives\/narrative-library-store\.js/);
assert.match(page, /librarySaveVersion/);
assert.match(page, /libraryEventType/);
assert.match(page, /library-history/);
assert.doesNotMatch(page, /id="libraryAddOption"/);

const home = fs.readFileSync(path.join(root, "home.html"), "utf8");
assert.match(home, /narrative-library\.html/);

console.log("narrative library tests passed");
