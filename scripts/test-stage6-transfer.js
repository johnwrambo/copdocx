"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { createMemoryStorage, createMinimalDocument, createTab, loadModelTab, loadScript, quietConsole } = require("./support/copdoc-vm-harness.js");
const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures/stage6-bookin-v1.12-schema5.json"), "utf8"));
const WS = "copdocx.store.v1", PK = "alien-book-in.saved-records.v1", ADMIN = "copdoc.admin.v1", JOURNAL = "copdocx.import-transactions.v1";
const clone = value => JSON.parse(JSON.stringify(value));
function runtime(initial) {
  const storage = initial && initial.storage ? initial : createMemoryStorage(initial);
  const r = loadModelTab(storage, { document: createMinimalDocument("home"), console: quietConsole() });
  ["functions/workspace-config.js", "functions/baseball-card-contract.js", "functions/import-schema.js", "functions/import-workflow.js", "functions/transfer.js"].forEach(file => loadScript(r.context, file));
  return { ...r, storage, transfer: r.context.COPDoc.transfer };
}
function plannedWorkspace(plan) { return JSON.parse(plan.changes.find(row => row.key === WS).after); }
function noPhoto() { const data = clone(fixture); data.records[0].baseballCard.photoDataUrl = ""; return data; }
function bundle(values) { return Object.assign({ format: "copdocx.transfer.v1", leads: [], bookin: [], encounters: [], investigations: [], operations: [], officers: [], vehicles: [], shifts: [] }, values); }
function purePlan() {
  const r = runtime(); const before = r.storage.dump(); const parsed = r.transfer.parseTransfer(fixture);
  const plan = r.transfer.buildImportPlan(parsed, ["bookin"]);
  assert.ok(plan.ok, plan.error);
  assert.deepStrictEqual(r.storage.dump(), before, "preview cannot write browser storage");
  assert.strictEqual(r.storage.writeCount(), 0);
  const next = plannedWorkspace(plan); const people = Object.values(next.people);
  assert.strictEqual(people.length, 1);
  assert.strictEqual(Object.keys(next.leads).length, 1);
  assert.strictEqual(Object.keys(next.encounters).length, 0, "display encounterNumber does not mint an Encounter");
  assert.strictEqual(people[0].arrests.length, 1);
  const cards = people[0].immigration.baseballCards;
  assert.strictEqual(cards.length, 1);
  assert.strictEqual(cards[0].bookinRecordId, fixture.records[0].id);
  assert.strictEqual(plan.mediaPlans.length, 1);
  assert.strictEqual(cards[0].photoMediaId, plan.mediaPlans[0].mediaId, "canonical card joins prepared Media");
  assert.ok(plan.guards.some(row => row.key === PK && row.before === null));
  assert.strictEqual(plan.rows[0].action, "create");
  const declined = r.transfer.applyImport(parsed, ["bookin"]);
  assert.ok(!declined.ok && /asynchronous/i.test(declined.error), "synchronous API cannot silently skip Media");
  assert.deepStrictEqual(r.storage.dump(), before);
}
function realCommitAndReimport() {
  const r = runtime(); const source = noPhoto(); const parsed = r.transfer.parseTransfer(source);
  const result = r.transfer.applyImport(parsed, ["bookin"]);
  assert.ok(result.ok, result.error);
  assert.strictEqual(result.added, 1);
  const packet = r.storage.json(PK)[0], before = r.storage.raw(WS);
  assert.strictEqual(packet.sourceExtension.preserveThis, "unknown extension");
  assert.strictEqual(packet.formState.future_field.value, "preserve custom field");
  assert.ok(packet.personId && packet.arrestId && packet.baseballCardId);
  const repeat = r.transfer.buildImportPlan(r.transfer.parseTransfer(source), ["bookin"]);
  assert.ok(repeat.ok, repeat.error);
  assert.strictEqual(repeat.stats.added, 0);
  const candidate = repeat.changes.find(row => row.key === WS);
  const next = JSON.parse(candidate ? candidate.after : before);
  assert.strictEqual(Object.keys(next.people).length, 1);
  assert.strictEqual(Object.values(next.people)[0].arrests.length, 1);
  assert.strictEqual(Object.values(next.people)[0].immigration.baseballCards.length, 1);
  const exported = r.transfer.collectExport(["bookin"], "", "");
  const roundtrip = r.transfer.buildImportPlan(r.transfer.parseTransfer(exported), ["bookin"]);
  assert.ok(roundtrip.ok, roundtrip.error);
  assert.strictEqual(roundtrip.stats.added, 0);
  const fresh = runtime();
  const restored = fresh.transfer.applyImport(fresh.transfer.parseTransfer(exported), ["bookin"]);
  assert.ok(restored.ok, restored.error);
  assert.strictEqual(fresh.storage.json(PK)[0].personId, packet.personId, "portable Book-In context restores exact native identity in a fresh workspace");
  assert.strictEqual(fresh.storage.json(PK)[0].arrestId, packet.arrestId);
  assert.strictEqual(fresh.storage.json(WS).people[packet.personId].immigration.baseballCards.length, 1);
  const person = r.storage.json(WS).people[packet.personId];
  const edited = clone(r.storage.json(WS));
  edited.people[packet.personId].immigration.baseballCards[0].state.content.narrative = "New canonical card edit";
  edited.people[packet.personId].immigration.baseballCards[0].content.narrative = "New canonical card edit";
  r.storage.setRaw(WS, edited);
  const currentExport = r.transfer.collectExport(["bookin"], "", "");
  assert.strictEqual(currentExport.bookin[0].baseballCard.content.narrative, "New canonical card edit", "export refreshes from canonical card, not old packet snapshot");
  const stale = r.transfer.buildImportPlan(r.transfer.parseTransfer(source), ["bookin"]);
  assert.ok(stale.ok, stale.error);
  const staleWorkspaceChange = stale.changes.find(change => change.key === WS);
  const preserved = staleWorkspaceChange ? JSON.parse(staleWorkspaceChange.after) : r.storage.json(WS);
  assert.strictEqual(preserved.people[packet.personId].immigration.baseballCards[0].state.content.narrative, "New canonical card edit", "reimporting skipped source cannot undo local card edit");
  const replacement = clone(source); replacement.records = []; replacement.recordCount = 0;
  const omission = r.transfer.buildImportPlan(r.transfer.parseTransfer(replacement), ["bookin"], { mode: "replace" });
  assert.ok(!omission.ok && /cannot omit/i.test(omission.error), "replace cannot erase filed history absent from source");
}
function atomicFailureAndGuards() {
  const r = runtime(); const parsed = r.transfer.parseTransfer(noPhoto());
  // One valid row followed by an unpromotable identity: the staged first row is discarded too.
  parsed.bookin.push({ id: "missing-identity", formState: {}, createdAt: "2026-09-05T12:00Z", updatedAt: "2026-09-05T12:00Z" });
  const plan = r.transfer.buildImportPlan(parsed, ["bookin"]);
  assert.ok(!plan.ok && plan.error, "any promotion failure blocks the complete plan");
  assert.deepStrictEqual(r.storage.dump(), {});
  assert.strictEqual(plan.changes.length, 0);
  const admin = bundle({ officers: [{ officerId: "officer_new", id: "officer_new", firstName: "Synthetic", meta: { status: "committed", updatedAt: "2026-09-05T12:00Z" } }], settings: { theme: "test" } });
  const p = r.transfer.buildImportPlan(admin, ["officers"]);
  assert.ok(p.ok, p.error);
  r.storage.setRaw(ADMIN, { officers: [], vehicles: [], shifts: [], externalEdit: true });
  const before = r.storage.dump();
  const blocked = r.context.COPDoc.importWorkflow.commitSync(p);
  assert.ok(!blocked.ok && /changed|conflict/i.test(blocked.error));
  assert.deepStrictEqual(r.storage.dump(), before, "stale preview fails before journal or writes");
  const clean = runtime(); const cleanPlan = clean.transfer.buildImportPlan(admin, ["officers"]);
  clean.storage.failNext(JOURNAL);
  const failed = clean.context.COPDoc.importWorkflow.commitSync(cleanPlan);
  assert.ok(!failed.ok);
  assert.deepStrictEqual(clean.storage.dump(), {}, "recovery backup must persist before data writes");
}
function explicitCustodyReview() {
  const data = noPhoto(); data.records[0].caseType = "NIC";
  const r = runtime(); const parsed = r.transfer.parseTransfer(data);
  let plan = r.transfer.buildImportPlan(parsed, ["bookin"]);
  assert.ok(!plan.ok && /custody decision/i.test(plan.error));
  assert.ok(plan.findings.some(row => row.code === "CUSTODY_REVIEW"));
  assert.strictEqual(plan.rows[0].recordId, data.records[0].id);
  plan = r.transfer.buildImportPlan(parsed, ["bookin"], { recordDecisions: { [data.records[0].id]: { keepDraft: true } } });
  assert.ok(plan.ok, plan.error);
  assert.strictEqual(Object.keys(plannedWorkspace(plan).people).length, 0, "NIC draft never creates Arrest or Person through booking");
  const packet = JSON.parse(plan.changes.find(row => row.key === PK).after)[0];
  assert.ok(packet.encounterProjectionDraft);
  assert.strictEqual(packet.baseballCard.content.heading, "Manual heading", "draft preserves saved card without minting canonical claims");
  plan = r.transfer.buildImportPlan(parsed, ["bookin"], { recordDecisions: { [data.records[0].id]: { outcome: "ARRESTED" } } });
  assert.ok(plan.ok, plan.error);
  assert.strictEqual(Object.values(plannedWorkspace(plan).people)[0].arrests.length, 1);
}
function portablePhotoContext() {
  const source = runtime();
  const plan = source.transfer.buildImportPlan(source.transfer.parseTransfer(fixture), ["bookin"]);
  assert.ok(plan.ok, plan.error);
  // Install the already validated storage after-images as an exported fixture;
  // Media write/recovery itself is tested by the workflow suite.
  plan.changes.forEach(change => source.storage.setRaw(change.key, change.after));
  const exported = source.transfer.collectExport(["bookin"], "", "");
  const media = plan.mediaPlans[0], parts = media.dataUrl.split(",");
  exported.media = [{ meta: { mediaId: media.mediaId, owner: { type: "PERSON", id: media.ownerId }, mime: media.mimeType }, blobs: [{ role: "original", mime: media.mimeType, base64: parts[1] }] }];
  const fresh = runtime();
  let restored = fresh.transfer.buildImportPlan(fresh.transfer.parseTransfer(exported), ["bookin"]);
  assert.ok(restored.ok, restored.error);
  assert.strictEqual(restored.mediaPlans.length, 1, "raw card image and supplied Media bundle share one plan entry");
  assert.strictEqual(restored.mediaPlans[0].meta.mediaId, media.mediaId);
  const data = clone(exported);
  data.bookin[0].baseballCard.photoDataUrl = "";
  restored = fresh.transfer.buildImportPlan(fresh.transfer.parseTransfer(data), ["bookin"]);
  assert.ok(restored.ok, restored.error);
  const person = Object.values(plannedWorkspace(restored).people)[0];
  assert.strictEqual(person.immigration.baseballCards[0].photoMediaId, media.mediaId, "photoMediaId-only native cards retain their photo association");
  data.media = [];
  restored = fresh.transfer.buildImportPlan(fresh.transfer.parseTransfer(data), ["bookin"]);
  assert.ok(!restored.ok && /photo absent/i.test(restored.error), "incomplete portable photo export blocks before writes");
  assert.deepStrictEqual(fresh.storage.dump(), {});
}
async function homeLoadsCompleteModel() {
  const storage = createMemoryStorage(), document = createMinimalDocument("home");
  const context = createTab(storage, { document, console: quietConsole() });
  ["functions/model/util.js", "functions/model/person.js", "functions/model/lead.js", "functions/model/store.js", "functions/transfer.js"].forEach(file => loadScript(context, file));
  assert.ok(context.COPDoc.model.store && !context.COPDoc.model.createLocation, "starts with historically incomplete Home model");
  const originalCreate = document.createElement.bind(document);
  document.createElement = function (name) {
    if (name !== "script") return originalCreate(name);
    const listeners = {};
    return { dataset: {}, addEventListener(event, fn) { listeners[event] = fn; }, _loaded() { listeners.load(); } };
  };
  document.head = { appendChild(script) { loadScript(context, script.src); script._loaded(); } };
  await context.COPDoc.transfer.ensureCanonicalBookInStore();
  ["createLocation", "createVehicle", "createEncounterRecord", "createAssociation", "createBusiness", "createCustomEntity", "createInvestigation", "createOperation"].forEach(fn => assert.strictEqual(typeof context.COPDoc.model[fn], "function", "Home loads " + fn));
  assert.ok(Array.isArray(context.COPDoc.models.ASSOCIATION_MATRIX));
  assert.deepStrictEqual(storage.dump(), {});
}
(async function () {
  purePlan(); realCommitAndReimport(); atomicFailureAndGuards(); explicitCustodyReview(); portablePhotoContext();
  await homeLoadsCompleteModel();
  console.log("ok Stage 6 transfer: pure preview, stable canonical/card joins, complete-plan rejection, shared recovery, stale guards, explicit NIC review, complete Home model");
})().catch(error => { console.error(error); process.exitCode = 1; });
