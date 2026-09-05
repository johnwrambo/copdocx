"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { createMemoryStorage, loadModelTab, loadScript, quietConsole } = require("./support/copdoc-vm-harness.js");

const ROOT = path.resolve(__dirname, "..");
const WS = "copdocx.store.v1";
const PK = "alien-book-in.saved-records.v1";
const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures/stage6-bookin-v1.12-schema5.json"), "utf8"));
const clone = value => JSON.parse(JSON.stringify(value));

// The application service lives in a VM without a controller, DOM or storage.
// Its collaborators are real model/repository instances in a separate context.
const serviceContext = vm.createContext({ COPDoc: {} });
for (const property of ["localStorage", "sessionStorage", "document", "navigator", "fetch"]) {
  Object.defineProperty(serviceContext, property, { get() { throw new Error("Transfer service accessed " + property); } });
}
vm.runInContext(fs.readFileSync(path.join(ROOT, "functions/application/transfer.js"), "utf8"), serviceContext);
const createTransfer = serviceContext.COPDoc.application.createTransfer;

function runtime() {
  const storage = createMemoryStorage();
  const runtime = loadModelTab(storage, { console: quietConsole() });
  for (const file of ["functions/workspace-config.js", "functions/baseball-card-contract.js", "functions/import-schema.js", "functions/import-workflow.js", "functions/repositories/transfer.js"]) {
    loadScript(runtime.context, file);
  }
  const app = runtime.context.COPDoc;
  const service = createTransfer({
    config: app.config, getModel: () => app.model, getBaseball: () => app.baseball,
    getDecoder: () => app.importSchema, getImportWorkflow: () => app.importWorkflow,
    getAppVersion: () => "stage8-test", repository: app.repositories.transfer
  });
  assert.strictEqual(app.transfer, undefined, "the application service needs no UI controller");
  return { ...runtime, storage, service, app };
}

async function main() {
  const r = runtime();
  r.storage.setRaw("unregistered-byte-fixture", " exact bytes\nwith whitespace ");
  r.context.sessionStorage.setItem("unregistered-session-fixture", " session bytes ");
  const captured = r.app.repositories.transfer.capture([], []);
  assert.strictEqual(captured.localStorage["unregistered-byte-fixture"], " exact bytes\nwith whitespace ");
  assert.strictEqual(captured.sessionStorage["unregistered-session-fixture"], " session bytes ");

  const source = clone(fixture);
  source.records[0].baseballCard.photoDataUrl = "";
  const before = r.storage.dump();
  const parsed = r.service.parseTransfer(source);
  const plan = r.service.buildImportPlan(parsed, ["bookin"]);
  assert.ok(plan.ok, plan.error);
  assert.deepStrictEqual(r.storage.dump(), before, "preview does not write through the repository channel");
  assert.strictEqual(r.storage.writeCount(), 0);
  assert.ok(plan.reads.some(row => row.key === "unregistered-byte-fixture" && row.before === " exact bytes\nwith whitespace "));
  assert.strictEqual(plan.changes.some(row => row.key === "unregistered-byte-fixture"), false);
  const stagedWorkspace = JSON.parse(plan.changes.find(row => row.key === WS).after);
  assert.strictEqual(Object.keys(stagedWorkspace.people).length, 1);
  assert.strictEqual(Object.values(stagedWorkspace.people)[0].arrests.length, 1);

  const invalid = clone(parsed);
  invalid.bookin.push({ id: "invalid-person", formState: {} });
  const failedPlan = r.service.buildImportPlan(invalid, ["bookin"]);
  assert.strictEqual(failedPlan.ok, false);
  assert.strictEqual(failedPlan.changes.length, 0);
  assert.deepStrictEqual(r.storage.dump(), before, "failure discards every staged object");
  assert.strictEqual(r.service.listType("bookin").length, 0, "failed planning restores the live read channel");
  assert.ok(r.service.buildImportPlan(parsed, ["bookin"]).ok, "a fresh plan is independent of a discarded facade");

  const committed = r.service.applyImport(parsed, ["bookin"]);
  assert.ok(committed.ok, committed.error);
  const packet = r.storage.json(PK)[0];
  assert.ok(packet.personId && packet.leadId && packet.arrestId);
  const exported = r.service.collectExport(["bookin"], "", "");
  assert.strictEqual(exported.appVersion, "stage8-test");
  assert.strictEqual(exported.bookin[0].sourceExtension.preserveThis, "unknown extension");
  assert.ok(exported.canonicalContext.people[packet.personId]);
  const repeat = r.service.buildImportPlan(r.service.parseTransfer(exported), ["bookin"]);
  assert.ok(repeat.ok, repeat.error);
  assert.strictEqual(repeat.stats.added, 0, "portable round trips retain canonical identity");

  // Independent factory instances cannot share a pending import's storage facade.
  const other = runtime();
  assert.strictEqual(other.service.listType("bookin").length, 0);
  assert.strictEqual(r.service.listType("bookin").length, 1);

  const media = owner => ({ meta: { mediaId: "media-" + owner, owner: { type: "PERSON", id: owner } }, blobs: [{ role: "original", base64: "cGhvdG8=" }] });
  const build = await r.service.buildExport(["bookin"], "", "", { includeMedia: true, exportMedia: async () => [media(packet.personId), media("outside-selection")] });
  assert.strictEqual(build.count, 1);
  assert.strictEqual(build.mediaCount, 1, "Media is limited to the exported canonical graph");
  assert.strictEqual(build.bundle.media[0].meta.owner.id, packet.personId);
  await assert.rejects(r.service.buildExport(["bookin"], "", "", { includeMedia: true, exportMedia: async () => ({}) }), /could not be verified/);
  await assert.rejects(r.service.buildExport(["bookin"], "", "", {
    includeMedia: true,
    exportMedia: async () => {
      const changed = r.storage.json(WS); changed.externalEdit = true; r.storage.setRaw(WS, changed);
      return [];
    }
  }), /Workspace changed while collecting export data/);
  const current = r.storage.json(WS);
  const card = current.people[packet.personId].immigration.baseballCards[0];
  card.photoMediaId = "missing-photo";
  card.state.photoMediaId = "missing-photo";
  r.storage.setRaw(WS, current);
  await assert.rejects(r.service.buildExport(["bookin"], "", "", { includeMedia: true, exportMedia: async () => [] }), /references missing Media missing-photo/);

  assert.strictEqual(r.service.typeCsv("operations", [{ operationId: "op1", name: '=OP,"North"', targets: [] }]),
    "operationId,name,plannedStart,plannedEnd,targets,updatedAt\r\nop1,\"'=OP,\"\"North\"\"\",,,0,\r\n",
    "CSV escaping, formula protection and CRLF remain unchanged");
  let mediaCalled = false;
  const empty = await other.service.buildExport(["bookin"], "", "", { includeMedia: true, exportMedia: async () => { mediaCalled = true; return []; } });
  assert.strictEqual(empty.count, 0);
  assert.strictEqual(mediaCalled, false);
  console.log("Stage 8 transfer modules: isolated service, exact raw snapshots, detached planning, failed-plan recovery, stable joins, CSV, Media closure and stale-export guards passed.");
}

main().catch(error => { console.error(error); process.exitCode = 1; });
