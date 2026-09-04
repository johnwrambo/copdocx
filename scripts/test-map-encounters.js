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
        subjects: [{ leadId: "lead1", lastName: "DIAZ", firstName: "ANA" }],
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
vm.runInContext(
  fs.readFileSync(path.join(__dirname, "..", "functions", "map-targets.js"), "utf8"),
  context
);

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

const arrests = context.COPDoc.map.listArrests();
const liveArrest = arrests.filter(function (row) {
  return row && row.id === "arrests:arr_live";
})[0];
assert.ok(liveArrest, "arrest row should exist");
assert.strictEqual(liveArrest.hasCoords, true, "live encounter stop should pin the arrest");
assert.strictEqual(String(liveArrest.latitude), "32.7");

console.log("ok map encounters");
