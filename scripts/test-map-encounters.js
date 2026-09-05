const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const state = {
  leads: {
    lead1: {
      leadId: "lead1",
      person: {
        personId: "person1",
        name: { lastName: "DIAZ", firstName: "ANA" },
        immigration: { finalOrder: true, disposition: "" },
        criminal: { isCriminal: true },
        locations: [
          {
            locationId: "home1",
            street: "1 Main St",
            city: "Dallas",
            state: "TX",
            latitude: "32.78",
            longitude: "-96.8",
            association: "residence",
            targetPriority: 1
          }
        ],
        arrests: [
          {
            arrestId: "arr_live",
            encounterId: "filedLive",
            arrestDate: "2026-09-04"
          }
        ]
      },
      meta: { status: "committed" }
    }
  },
  encounters: {
    enc1: {
      encounterId: "enc1",
      startedAt: "2026-09-03T08:00",
      subjects: [{ leadId: "lead1", lastName: "DIAZ", firstName: "ANA" }],
      locations: [
        { locationId: "loc1", street: "100 Main St", city: "Dallas", state: "TX", latitude: "32.77", longitude: "-96.79" }
      ],
      vehicles: [],
      meta: { status: "committed", markedComplete: true, completedAt: "2026-09-03T09:00:00.000Z" },
      completed: {
        generatedAt: "2026-09-03T09:00:00.000Z",
        encounterId: "enc1",
        startedAt: "2026-09-03T08:00",
        subjects: [{ leadId: "lead1", lastName: "DIAZ", firstName: "ANA", outcome: "FLED_FOOT" }],
        locations: [
          { locationId: "loc1", street: "100 Main St", city: "Dallas", state: "TX", latitude: "32.77", longitude: "-96.79" }
        ],
        vehicles: [],
        pin: { latitude: "32.77", longitude: "-96.79", arrestLocation: "100 Main St, Dallas, TX", locationId: "loc1" }
      }
    },
    draft: {
      encounterId: "draft",
      subjects: [],
      locations: [],
      vehicles: [],
      meta: { status: "draft" }
    },
    filedLive: {
      encounterId: "filedLive",
      startedAt: "2026-09-04T08:00",
      subjects: [],
      locations: [
        { locationId: "locLive", street: "9 Live St", city: "Dallas", state: "TX", latitude: "32.7", longitude: "-96.7" }
      ],
      vehicles: [],
      meta: { status: "committed" }
    }
  }
};

const context = {
  document: {
    readyState: "loading",
    addEventListener() {},
    getElementById() { return null; },
    querySelector() { return null; }
  },
  localStorage: { getItem() { return null; }, setItem() {} },
  COPDoc: {
    model: {
      formatPersonLabel(person) {
        return `${person.name.lastName}, ${person.name.firstName}`;
      },
      store: {
        loadFromDisk() {},
        getState() { return state; }
      }
    },
    map: {}
  }
};
context.window = context;
context.globalThis = context;
vm.createContext(context);
require("./support/module-dependencies.js").loadScript(context, "functions/map-targets.js");

context.COPDoc.map.refreshTargets();
const rows = context.COPDoc.map.listEncounters();
assert.strictEqual(rows.length, 1, "only completed encounters should be listed");
assert.strictEqual(rows[0].encounterId, "enc1");
assert.strictEqual(rows[0].hasCoords, true);
assert.ok(rows[0].photoOwners.some((owner) => owner.type === "LOCATION" && owner.id === "loc1"));
assert.ok(rows[0].photoOwners.some((owner) => owner.type === "PERSON" && owner.id === "person1"));

const targets = context.COPDoc.map.listTargets();
assert.strictEqual(targets.length, 1, "ranked residence should be an active target");
assert.strictEqual(targets[0].leadId, "lead1");
assert.strictEqual(targets[0].category, "targets");
assert.equal(targets[0].flags.finalOrder, true, "target flag reads final order");
assert.equal(targets[0].flags.criminal, true, "target flag reads criminal");
assert.equal(targets[0].flags.reinstate, false);
assert.equal(rows[0].flags.fled, true, "encounter flag reads fled outcome");
assert.equal(rows[0].flags.collision, false);

const arrests = context.COPDoc.map.listArrests();
const liveArrest = arrests.filter(function (row) {
  return row && row.id === "arrests:arr_live";
})[0];
assert.ok(liveArrest, "arrest row should exist");
assert.strictEqual(liveArrest.hasCoords, true, "live encounter stop should pin the arrest");
assert.strictEqual(String(liveArrest.latitude), "32.7");

assert.strictEqual(context.COPDoc.map.getIconSize(), 32, "default pin size");
assert.strictEqual(context.COPDoc.map.setIconSize(40), 40);
assert.strictEqual(context.COPDoc.map.getIconSize(), 40);
assert.strictEqual(context.COPDoc.map.setIconSize(4), 20, "pin size min");
assert.strictEqual(context.COPDoc.map.setIconSize(99), 56, "pin size max");

const mapHtml = fs.readFileSync(path.join(__dirname, "..", "map.html"), "utf8");
const sliderAt = mapHtml.indexOf('id="mapIconSizeSlider"');
assert.ok(sliderAt !== -1, "map.html has icon size slider");
assert.ok(
  /type="range"/.test(mapHtml.slice(sliderAt, sliderAt + 180)),
  "icon size control is a range slider"
);
assert.ok(
  mapHtml.indexOf('id="mapDockTabIcons"') !== -1,
  "map.html has an Icons dock tab"
);
assert.ok(
  mapHtml.indexOf('id="mapDockTabLayers"') !== -1,
  "map.html has a Layers dock tab"
);
assert.ok(
  mapHtml.indexOf("<details class=\"map-icon-library\">") === -1,
  "icon library is a dock tab, not a details drawer"
);
assert.ok(
  mapHtml.indexOf('data-icon-option="labels"') !== -1 &&
    mapHtml.indexOf('data-icon-option="badges"') !== -1 &&
    mapHtml.indexOf('data-icon-option="primary"') === -1 &&
    mapHtml.indexOf('data-icon-option="layerColor"') === -1,
  "Icons tab keeps Names and Rank only"
);
assert.ok(
  mapHtml.indexOf('id="mapIconStrokeSlider"') !== -1,
  "map.html has line thickness slider"
);
assert.ok(
  mapHtml.indexOf('id="mapIconFillSlider"') !== -1,
  "map.html has fill transparency slider"
);
assert.ok(
  mapHtml.indexOf('id="mapIconOpacitySlider"') === -1,
  "map.html does not fade the whole icon"
);
assert.equal(context.COPDoc.map.getIconFill(), 40, "default fill opacity");
assert.equal(context.COPDoc.map.setIconFill(0), 0);
assert.equal(context.COPDoc.map.setIconFill(150), 100);
assert.ok(
  mapHtml.indexOf('id="mapIconFilters"') !== -1,
  "Icons tab has visual filters"
);

const defaultOptions = context.COPDoc.map.getIconOptions();
assert.equal(defaultOptions.labels, false, "names off by default");
assert.equal(defaultOptions.badges, true, "rank badges on by default");
assert.equal(context.COPDoc.map.setIconOption("labels", true).labels, true);
assert.equal(context.COPDoc.map.getIconOptions().labels, true);
assert.equal(context.COPDoc.map.setIconOption("badges", false).badges, false);

assert.equal(context.COPDoc.map.getIconStroke(), 2, "default line thickness");
assert.equal(context.COPDoc.map.setIconStroke(4), 4);
assert.equal(context.COPDoc.map.setIconStroke(0), 1);

const filters = context.COPDoc.map.getVisualFilters();
assert.equal(filters.length, 7);
assert.ok(
  filters.some(function (row) {
    return row.id === "targetOther" && row.label === "Regular";
  }),
  "target flags include Regular"
);
assert.ok(
  filters.some(function (row) {
    return row.id === "encounterOther" && row.label === "Regular";
  }),
  "encounter flags include Regular"
);
assert.ok(
  filters.every(function (row) {
    return row.visible === true;
  }),
  "filter classes start visible"
);
const finalOrder = context.COPDoc.map.setVisualFilter("finalOrder", {
  visible: true,
  color: "#c45c26"
});
assert.equal(finalOrder.visible, true);
assert.equal(finalOrder.color, "#c45c26");
assert.equal(context.COPDoc.map.rowVisible("targets:home1"), true);
context.COPDoc.map.setVisualFilter("targetOther", { visible: false });
assert.equal(
  context.COPDoc.map.rowVisible("targets:home1"),
  true,
  "flagged target stays visible when Regular is hidden"
);
context.COPDoc.map.setVisualFilter("criminal", { visible: false });
context.COPDoc.map.setVisualFilter("finalOrder", { visible: false });
context.COPDoc.map.setVisualFilter("reinstate", { visible: false });
assert.equal(
  context.COPDoc.map.rowVisible("targets:home1"),
  false,
  "flagged target hides when all matching flags are off"
);
context.COPDoc.map.setVisualFilter("criminal", { visible: true });
assert.equal(context.COPDoc.map.rowVisible("targets:home1"), true);

assert.equal(context.COPDoc.map.hiddenCount(), 0);
context.COPDoc.map.hidePin("targets:home1");
assert.equal(context.COPDoc.map.hiddenCount(), 1);
context.COPDoc.map.hideLabel("encounters:enc1:loc1");
assert.equal(context.COPDoc.map.hiddenCount(), 2);
context.COPDoc.map.revealAll();
assert.equal(context.COPDoc.map.hiddenCount(), 0);
assert.ok(
  mapHtml.indexOf("data-map-reveal-all") !== -1,
  "map.html has reveal-all control"
);

const clustered = [
  { lat: 32.78, lng: -96.8 },
  { lat: 32.781, lng: -96.801 },
  { lat: 32.779, lng: -96.799 },
  { lat: 33.5, lng: -97.4 }
];
const peaks = context.COPDoc.map.computeHeatPeaks(clustered, 0.05);
assert.equal(peaks.length, 1, "only the clustered arrests form a local maximum");
assert.equal(peaks[0].count, 3);
assert.ok(peaks[0].id.indexOf("arrestHeat:") === 0);
assert.equal(context.COPDoc.map.layerVisible("arrestHeat"), false, "heat layer starts off");

console.log("ok map encounters");
