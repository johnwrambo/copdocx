const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const context = {};
vm.createContext(context);
vm.runInContext(
  fs.readFileSync(path.join(__dirname, "..", "functions", "admin-disposition.js"), "utf8"),
  context
);
const api = context.COPDoc.adminDisposition;

const officer = { id: "ofc-1", officerId: "ofc-1", firstName: "Ana", lastName: "Diaz" };
const vehicle = { id: "unit-1", vehicleId: "unit-1", unit: "321", assignedOfficerIds: ["ofc-1"] };
const admin = {
  officers: [officer],
  vehicles: [vehicle],
  shifts: [{ id: "shift-1", officerId: "ofc-1", vehicleId: "unit-1", date: "2026-09-03", start: "08:00", end: "16:00" }]
};
const workspace = {
  leads: { lead1: { leadId: "lead1", assignedOfficerId: "ofc-1", vehicles: [] } },
  investigations: {},
  operations: {
    op1: { operationId: "op1", teams: [{ vehicleId: "unit-1", members: [{ officerId: "ofc-1" }] }] }
  },
  encounters: {}
};

assert.strictEqual(api.isActive(officer), true);
api.archive(officer, "2026-09-03T12:00:00.000Z");
assert.strictEqual(api.isJunked(officer), true);
assert.strictEqual(officer.junkedAt, "2026-09-03T12:00:00.000Z");
api.restore(officer);
assert.strictEqual(api.isActive(officer), true);

const officerRefs = api.references("officers", "ofc-1", admin, workspace);
assert.ok(officerRefs.some((row) => row.type === "shift"));
assert.ok(officerRefs.some((row) => row.type === "fleet-assignment"));
assert.ok(officerRefs.some((row) => row.type === "case"));
assert.ok(officerRefs.some((row) => row.type === "operation"));

const vehicleRefs = api.references("vehicles", "unit-1", admin, workspace);
assert.ok(vehicleRefs.some((row) => row.type === "shift"));
assert.ok(vehicleRefs.some((row) => row.type === "operation"));

console.log("ok admin disposition");
