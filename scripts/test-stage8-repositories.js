"use strict";
const assert = require("assert"), fs = require("fs"), path = require("path"), vm = require("vm");
const ROOT = path.resolve(__dirname, "..");
const load = (context, file) => vm.runInContext(fs.readFileSync(path.join(ROOT, file), "utf8"), context, { filename: file });
function backend() {
  const values = new Map(), writes = [];
  return { values, writes, storage: {
    getItem: key => values.has(key) ? values.get(key) : null,
    setItem(key, value) { writes.push([key, value]); values.set(key, value); },
    removeItem: key => values.delete(key), key: index => Array.from(values.keys())[index] || null,
    get length() { return values.size; }
  } };
}
const local = backend(), session = backend();
const context = vm.createContext({ localStorage: local.storage, sessionStorage: session.storage });
for (const file of ["functions/repositories/browser-storage.js", "functions/repositories/bookin.js", "functions/repositories/workspace.js"]) load(context, file);
const repos = context.COPDoc.repositories, BOOKIN = "alien-book-in.saved-records.v1";
assert.deepStrictEqual(JSON.parse(JSON.stringify(repos.bookin.readAll())), []);
for (const raw of ["null", "", "{", "{}", '{"records":[]}', '"not a packet array"']) {
  local.values.set(BOOKIN, raw);
  assert.throws(() => repos.bookin.readAll(), "Persisted invalid data cannot be treated as an empty collection");
  assert.strictEqual(local.values.get(BOOKIN), raw);
  assert.strictEqual(local.writes.length, 0);
}
local.values.set(BOOKIN, '{"records":[{"id":"legacy-history"}]}');
assert.strictEqual(repos.bookin.readHistoryRecords()[0].id, "legacy-history", "Legacy history wrapper remains readable without authorizing normal packet writes");
local.values.delete(BOOKIN);
const packet = [{id:"synthetic-stage8",formState:{medical:"synthetic"},unknownExtension:{preserved:true}}];
repos.bookin.saveAll(packet);
assert.strictEqual(local.values.get(BOOKIN), JSON.stringify(packet));
const read = repos.bookin.readAll(); read[0].unknownExtension.preserved = false;
assert.strictEqual(repos.bookin.readAll()[0].unknownExtension.preserved, true, "Repository callers do not share a mutable cache");
context.COPDoc.importWorkflow = { assertWritable: () => ({ok:false,error:"Pending synthetic import"}) };
const before = local.values.get(BOOKIN), writes = local.writes.length;
assert.throws(() => repos.bookin.saveAll([]), /Pending synthetic import/);
assert.strictEqual(local.values.get(BOOKIN), before);
assert.strictEqual(local.writes.length, writes);
delete context.COPDoc.importWorkflow;
repos.bookin.saveHandoff({personId:"synthetic-person"});
assert.strictEqual(local.values.has("copdocx.baseball.handoff.v1"), false);
assert.strictEqual(repos.bookin.readHandoff().personId, "synthetic-person");
const captured = repos.bookin.captureExportSources();
assert(Object.isFrozen(captured) && Object.isFrozen(captured.entries) && captured.entries.every(Object.isFrozen));
assert(repos.bookin.exportSourcesMatch(captured));
local.values.set("copdoc.admin.v1", '{"officers":[{"id":"later-edit"}]}');
assert.strictEqual(repos.bookin.exportSourcesMatch(captured), false, "Late Admin changes invalidate the exact export source snapshot");
assert.throws(() => repos.storage.write("localStorage", BOOKIN, {}), /serialized/);
assert.throws(() => repos.storage.read("indexedDB", BOOKIN), /Unsupported/);

// A denied browser getter must never be mistaken for an in-memory-only host.
const denied = vm.createContext({});
// Install inside the realm: Node's context proxy suppresses an externally
// installed throwing getter when it is accessed through globalThis.
vm.runInContext('Object.defineProperty(globalThis, "localStorage", {get() { throw new Error("Synthetic SecurityError"); }});', denied);
load(denied, "functions/repositories/browser-storage.js");
assert.strictEqual(denied.COPDoc.repositories.storage.has("localStorage"), true);
assert.throws(() => denied.COPDoc.repositories.storage.read("localStorage", BOOKIN), /SecurityError/);
assert.throws(() => denied.COPDoc.repositories.storage.write("localStorage", BOOKIN, "[]"), /SecurityError/);
const absent = vm.createContext({}); load(absent, "functions/repositories/browser-storage.js");
assert.strictEqual(absent.COPDoc.repositories.storage.has("localStorage"), false);
const unavailable = vm.createContext({ localStorage: null }); load(unavailable, "functions/repositories/browser-storage.js");
assert.strictEqual(unavailable.COPDoc.repositories.storage.has("localStorage"), true);
assert.throws(() => unavailable.COPDoc.repositories.storage.write("localStorage", BOOKIN, "[]"), /unavailable/);

// Exercise the actual store boundary, where a false availability result would
// allow an in-memory save to masquerade as a durable browser save.
const { loadScript } = require("./support/module-dependencies.js");
for (const [host, shouldSave] of [[denied, false], [unavailable, false], [absent, true]]) {
  for (const file of ["functions/model/util.js", "functions/model/person.js", "functions/model/store.js"]) loadScript(host, file);
  const result = host.COPDoc.model.store.upsertPerson({personId:"synthetic-storage-person", name:{firstName:"Synthetic"}});
  assert.strictEqual(result.ok, shouldSave, "Unavailable storage must not become a successful in-memory save");
  assert.strictEqual(Boolean(host.COPDoc.model.store.getState().people["synthetic-storage-person"]), shouldSave, "Rejected saves cannot leave phantom Persons");
}

// Service factories operate through supplied capabilities even in a host where
// every browser dependency throws. Their histories remain instance-specific.
const isolated = { COPDoc: {} };
for (const name of ["document", "localStorage", "sessionStorage", "indexedDB", "navigator", "fetch"]) {
  Object.defineProperty(isolated, name, {get() { throw new Error("Ambient " + name + " accessed"); }});
}
vm.createContext(isolated);
load(isolated, "functions/application/booking.js");
load(isolated, "functions/application/import.js");
const memory = new Map();
const channel = {getItem:key => memory.get(key) || null,setItem:(key,value) => memory.set(key,value),removeItem:key => memory.delete(key)};
const booking = isolated.COPDoc.application.createBooking({
  storage:{read:(_medium,key) => channel.getItem(key),write:(_medium,key,value) => channel.setItem(key,value)},
  getConfig:()=>null,getModel:()=>null,getOfficers:()=>null,getImportWorkflow:()=>null,getCrypto:()=>null,getLocks:()=>null
});
assert.strictEqual(booking.listTransactions().ok, true);
assert.strictEqual(booking.listTransactions().transactions.length, 0);
const imports = isolated.COPDoc.application.createImport({recovery:{channel:()=>channel},getConfig:()=>null,getModel:()=>null,getMedia:()=>null,getCrypto:()=>null,getLocks:()=>null});
assert.strictEqual(imports.listTransactions().ok, true);
assert.strictEqual(imports.assertWritable().ok, true);
memory.set("copdocx.import-transactions.v1", "{");
assert.strictEqual(imports.assertWritable().ok, false, "An injected damaged journal still blocks the real application service");
console.log("STAGE8_REPOSITORIES_PASSED malformed packet preservation, exact bytes, import guards, session ownership, export races, denied storage and isolated workflow capabilities.");
