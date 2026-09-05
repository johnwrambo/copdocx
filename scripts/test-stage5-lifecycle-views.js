"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { createMemoryStorage, loadModelTab, loadScript, quietConsole } = require("./support/copdoc-vm-harness.js");
const WS = "copdocx.store.v1", PK = "alien-book-in.saved-records.v1", ADMIN = "copdoc.admin.v1";

class Element {
  constructor(tag) { this.tagName = tag.toUpperCase(); this.children = []; this.attributes = {}; this.dataset = {}; this.textContent = ""; this._value = ""; }
  appendChild(child) { this.children.push(child); return child; }
  replaceChildren(...children) { this.children = children; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] || null; }
  addEventListener() {}
  get options() { return this.children.filter(row => row.tagName === "OPTION"); }
  set value(value) { this._value = String(value); }
  get value() { return this.tagName === "SELECT" && !this.options.some(row => row.value === this._value) ? "" : this._value; }
}
function documentFor(page, ids) {
  const nodes = Object.fromEntries(ids.map(id => [id, new Element("div")]));
  const body = new Element("body"); body.setAttribute("data-page", page);
  return { nodes, body, readyState: "loading", getElementById: id => nodes[id] || null,
    createElement: tag => new Element(tag), addEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; } };
}
function descendants(element, tag) {
  return element.children.flatMap(child => (child.tagName === tag ? [child] : []).concat(descendants(child, tag)));
}

// Execute Home's actual boot and snapshot render. A canonical void excludes a
// packet even when its packet-side write is still awaiting recovery.
{
  const now = "2026-09-05T12:00:00.000Z";
  const storage = createMemoryStorage({
    [WS]: { leads: {}, people: { person: { arrests: [{ arrestId: "canonical_void", bookinRecordId: "waiting", voidedAt: now }] } } },
    [ADMIN]: { officers: [], vehicles: [], shifts: [] },
    [PK]: [
      { id: "active", updatedAt: now },
      { id: "voided", voidedAt: now, updatedAt: now },
      { id: "waiting", personId: "person", arrestId: "canonical_void", updatedAt: now },
      { id: "old", updatedAt: "2020-01-01T12:00:00.000Z" }
    ]
  });
  const document = documentFor("home", ["homeStatLeads", "homeStatOfficers", "homeStatVehicles", "homeStatBookins"]);
  document.readyState = "complete";
  const context = { document, localStorage: storage.storage, Date: class extends Date { constructor(...args) { super(...(args.length ? args : [now])); } } };
  context.window = context; context.globalThis = context; vm.createContext(context);
  loadScript(context, "functions/home.js");
  assert.strictEqual(document.nodes.homeStatBookins.textContent, "1", "Home counts only active in-week bookings");
  assert.strictEqual(storage.writeCount(), 0, "Home view never mutates lifecycle records");
}

// Use the actual public map collection API. Canonical Arrest history overrides a
// stale Case projection, so neither map pins nor heat input receives voided facts.
{
  const originalArrests = [
    { arrestId: "active", latitude: "32.7", longitude: "-96.7", arrestDate: "2026-09-05" },
    { arrestId: "voided", latitude: "32.8", longitude: "-96.8", arrestDate: "2026-09-05" }
  ];
  const state = { people: { p: { personId: "p", arrests: [originalArrests[0], { ...originalArrests[1], voidedAt: "2026-09-05" }] } },
    leads: { l: { leadId: "l", subjectPersonId: "p", person: { personId: "p", name: { firstName: "Test", lastName: "MAP" }, arrests: originalArrests }, meta: { status: "committed" } } }, encounters: {} };
  const before = JSON.stringify(state);
  const context = { document: documentFor("map", []), localStorage: { getItem() { return null; }, setItem() { throw new Error("Unexpected write"); } },
    COPDoc: { model: { store: { loadFromDisk() {}, getState() { return state; } } }, map: {} } };
  context.window = context; context.globalThis = context; vm.createContext(context);
  loadScript(context, "functions/map-targets.js");
  context.COPDoc.map.refreshTargets();
  assert.deepStrictEqual(Array.from(context.COPDoc.map.listArrests(), row => row.id), ["arrests:active"]);
  assert.strictEqual(JSON.stringify(state), before, "map filtering preserves canonical and historical snapshots");
  // Legacy workspaces lacking people[] still honor the embedded void marker.
  delete state.people;
  state.leads.l.person.arrests[1].voidedAt = "2026-09-05";
  context.COPDoc.map.refreshTargets();
  assert.strictEqual(context.COPDoc.map.listArrests().length, 1);
}

// Test-only closure exposure executes the production renderer and collector
// unchanged. The fake select reproduces browser value behavior for absent options.
{
  const storage = createMemoryStorage({ [ADMIN]: {
    officers: [], shifts: [], vehicles: [
      { vehicleId: "active_fleet", id: "active_fleet", governmentVehicle: true, licensePlate: "ACTIVE", plateState: "TX", meta: { status: "committed" } },
      { vehicleId: "archived_fleet", id: "archived_fleet", governmentVehicle: true, licensePlate: "HISTORY", plateState: "TX", inactive: true, archivedAt: "2026-09-05", junked: true, meta: { status: "committed" } }
    ]
  } });
  const r = loadModelTab(storage, { console: quietConsole() });
  loadScript(r.context, "functions/model/operation.js");
  loadScript(r.context, "functions/officer-roster.js");
  const document = documentFor("operation-form", ["operationCellsList"]);
  r.context.document = document;
  const source = fs.readFileSync(path.join(__dirname, "..", "functions/operations.js"), "utf8");
  const anchor = "  window.commitOperation = commitOperation;";
  assert.ok(source.includes(anchor));
  vm.runInContext(source.replace(anchor, "  window.__stage5View = { paintCells: paintCells, collectForm: collectForm, setDraft: function (record) { draftRecord = record; } };\n" + anchor), r.context);
  const record = r.model.createOperation({ operationId: "op_lifecycle", teams: [
    { teamId: "historic_team", name: "Historical", vehicleId: "archived_fleet", members: [] },
    { teamId: "new_team", name: "New", vehicleId: "", members: [] }
  ] });
  const before = JSON.stringify(record);
  r.context.__stage5View.setDraft(record);
  r.context.__stage5View.paintCells(record);
  const selects = descendants(document.nodes.operationCellsList, "SELECT");
  assert.strictEqual(selects[0].value, "archived_fleet", "existing archived assignment remains selected and visible");
  const historical = selects[0].options.find(row => row.value === "archived_fleet");
  assert.ok(historical.disabled, "historical assignment cannot be newly selected");
  assert.ok(historical.textContent.includes("HISTORY") && historical.textContent.includes("existing assignment"));
  assert.ok(!selects[1].options.some(row => row.value === "archived_fleet"), "new team choices contain only active fleet");
  assert.ok(selects[1].options.some(row => row.value === "active_fleet"));
  assert.strictEqual(JSON.stringify(record), before, "rendering preserves stored team assignments");
  assert.strictEqual(r.context.__stage5View.collectForm().teams[0].vehicleId, "archived_fleet", "ordinary form collection preserves historical assignment");
  assert.strictEqual(storage.writeCount(), 0);
}

console.log("STAGE5_LIFECYCLE_VIEWS_PASSED Home and map exclude voided counts; Operations preserves historical fleet display without new assignments.");
