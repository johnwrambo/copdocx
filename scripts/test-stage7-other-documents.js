/* Actual export adapters: fixed output contracts, capture boundaries, ledger failures and one click/one output. */
"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const root = path.resolve(__dirname, "..");
const fixture = name => fs.readFileSync(path.join(__dirname, "fixtures/stage7-other-documents", name), "utf8");
const clone = value => JSON.parse(JSON.stringify(value));
function freeze(value) { if (value && typeof value === "object") { Object.freeze(value); Object.values(value).forEach(freeze); } return value; }
function harness(page) {
  const listeners = [];
  const downloads = [];
  const deliveries = [];
  const generated = [];
  const statuses = [];
  const nodes = {};
  let gateError = false;
  let beforeRender = null;
  let printed = 0;
  let printedHtml = "";
  const lead = { leadId: "L1", assignedOfficerId: "O1", subjectPersonId: "P1", person: { personId: "P1", name: { lastName: "STALE" } }, source: { caseNumber: "C-1", leadSource: "REFERRAL" }, vehicles: [{ vehicleId: "V1", plate: "OLD" }], meta: { status: "committed", updatedAt: "2026-09-01T00:00:00.000Z" } };
  const person = { personId: "P1", name: { lastName: 'Doe, "Example"', firstName: "=formula", middleName: "Q" }, sex: "F", dateOfBirth: "1990-01-02", age: 36, citizenship: "TEST", immigration: { alienNumber: "000000001" } };
  const vehicle = { vehicleId: "V1", plate: "NEW", plateState: "ZZ" };
  const operation = { operationId: "OP1", operationNumber: "OP-1", name: "Example & Training", plannedStart: "2026-09-01T00:00", targets: [{ targetId: "T1", personId: "P1", leadId: "L1", freeze: { subjectLabel: "Example Person", places: [{ street: "Example Street" }] } }], teams: [{ teamId: "TEAM1", members: [{ officerId: "O1", assignmentRole: "PRIMARY" }] }], order: { narrative: "Training only", officerBriefs: [] }, meta: { status: "committed", updatedAt: "2026-09-01T00:00:00.000Z" } };
  const sheet = { hidden: false, outerHTML: '<article id="operationBriefSheet"><h1>Example &amp; Training</h1><p>Training only</p></article>', cloneNode() { return { outerHTML: this.outerHTML, querySelector() { return null; }, querySelectorAll() { return []; } }; } };
  if (page === "operation-brief") { nodes.operationBriefSheet = sheet; }
  if (page === "mobile-target-sheet") { nodes.mobileFowSheet = sheet; nodes.targetName = { textContent: "" }; }
  const button = { dataset: {}, handlers: [], addEventListener(event, fn) { if (event === "click") { this.handlers.push(fn); } } };
  nodes.downloadLeadCsvButton = button;
  class LocalURL extends URL {}
  LocalURL.createObjectURL = () => "blob:test";
  LocalURL.revokeObjectURL = () => {};
  const api = {
    captureContext(options) { return freeze(clone({ schemaVersion: 1, documentType: options.documentType, input: options.input, sources: options.sources || [], entities: { person: options.person || null, officers: options.officers || [] } })); },
    async generate(options) {
      if (gateError) { throw new Error("Generation ledger write failed."); }
      generated.push(options);
      if (beforeRender) { beforeRender(); }
      const artifact = await options.render(options.context);
      return { artifact, record: { generationId: "G" + generated.length } };
    },
    async recordDelivery(id, value) { deliveries.push({ id, ...value }); }
  };
  const document = {
    readyState: "loading", body: { getAttribute: () => page, appendChild() {} },
    addEventListener(event, callback) { if (event === "DOMContentLoaded") { listeners.push(callback); } },
    getElementById(id) { return nodes[id] || null; },
    querySelector() { return null; }, querySelectorAll() { return []; },
    createElement(tag) { return { dataset: {}, classList: { add() {}, remove() {} }, appendChild() {}, replaceChildren() {}, setAttribute() {}, addEventListener() {}, remove() {}, click() { downloads.push({ filename: this.download, href: this.href }); } }; }
  };
  const sandbox = { console, document, URL: LocalURL, URLSearchParams, Blob, Promise, Date, setTimeout, clearTimeout, fetch: async () => ({ ok: true, text: async () => "" }), location: { search: "?id=L1", href: "http://localhost/operation-brief.html?id=OP1" },
    open() { return { opener: null, document: { readyState: "complete", open() {}, write(html) { printedHtml = html; }, close() {} }, focus() {}, print() { printed++; }, close() {} }; },
    COPDoc: { documents: api, officers: { get: id => ({ id: id, name: "Example Officer" }), display: row => row.name }, setAppBarStatus: message => statuses.push(message), model: {
      subjectOf: row => row.person, formatPersonLabel: row => [row.name.lastName, row.name.firstName].join(" "), isCommitted: row => row.meta.status !== "draft",
      store: { loadFromDisk() {}, getLead: () => clone(lead), getPerson: () => clone(person), getVehicleRecord: () => clone(vehicle), listLeads: () => [{ leadId: "L1" }], getOperation: () => clone(operation) }
    } }
  };
  sandbox.window = sandbox;
  const context = vm.createContext(sandbox);
  function load(file) { require("./support/module-dependencies.js").loadDependencies(context, file); vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context, { filename: file }); }
  return { context, sandbox, load, api, person, vehicle, operation, sheet, button, downloads, deliveries, generated, statuses, listeners,
    fail(value) { gateError = value; }, before(fn) { beforeRender = fn; }, printed: () => printed, printedHtml: () => printedHtml };
}
(async function () {
  const h = harness("test");
  h.load("functions/leads.js");
  h.load("functions/lead-csv.js");
  const api = h.sandbox.COPDoc.leadDocuments;
  const result = await api.exportOneCsv();
  assert.strictEqual(result.artifact.data, fixture("lead.csv"), "CSV retains exact columns, escaping and CRLF while reading canonical Person/Vehicle");
  assert.strictEqual(h.downloads.length, 1);
  assert.strictEqual(h.deliveries[0].status, "SUBMITTED", "browser handoff never claims disk delivery success");
  assert(h.generated[0].context.sources.some(row => row.type === "person" && row.id === "P1"));
  h.before(() => { h.person.name.lastName = "MUTATED AFTER CAPTURE"; h.vehicle.plate = "LATER"; });
  const captured = await api.exportOneCsv();
  assert.strictEqual(captured.artifact.data, fixture("lead.csv"), "render reads only frozen input despite edits during async generation");
  h.fail(true);
  const denied = await api.exportOneCsv();
  assert.strictEqual(denied, null);
  assert.strictEqual(h.downloads.length, 2, "failed ledger persistence blocks untracked downloads");
  assert(/ledger write failed/.test(h.statuses.at(-1)));
  h.button.dataset.csvExportBound = "true";
  h.listeners.at(-1)();
  assert.strictEqual(h.button.handlers.length, 0, "legacy CSV script does not rebind an already owned button");
  delete h.sandbox.COPDoc.documents;
  await api.exportOneCsv();
  assert.strictEqual(h.downloads.length, 2, "missing generator blocks export visibly");

  const op = harness("operation-brief");
  op.load("functions/operations.js");
  op.listeners[0]();
  const opApi = op.sandbox.COPDoc.operationDocuments;
  const initial = opApi.capture("operation-brief.html");
  assert.strictEqual(opApi.renderHtml(initial.context), fixture("operation-brief.html"));
  op.before(() => { op.sheet.outerHTML = "<article>Later unrelated edit</article>"; op.operation.name = "Later operation"; });
  const saved = await op.sandbox.saveOperationBrief();
  assert.strictEqual(saved.artifact.data, fixture("operation-brief.html"), "operation export consumes pre-await detached rendering");
  assert.strictEqual(op.downloads.length, 1);
  assert.strictEqual(op.deliveries[0].method, "download");
  assert(op.generated[0].context.sources.some(row => row.type === "officer" && row.id === "O1"), "Admin Officer id alias is represented in provenance");
  assert(op.generated[0].context.sources.every(row => row.authority === "snapshot"), "issued brief provenance is an explicit painted snapshot");
  op.sheet.outerHTML = initial.context.input.presentationHtml;
  op.before(null);
  const printResult = await op.sandbox.printOperationBrief();
  assert.strictEqual(op.printed(), 1);
  assert.strictEqual(op.printedHtml(), printResult.artifact.data, "print receives the actual hashed artifact, not the live app document");
  assert(op.printedHtml().includes('<base href="http://localhost/">'));
  assert.strictEqual(op.deliveries.at(-1).status, "SUBMITTED");
  op.fail(true);
  await op.sandbox.saveOperationBrief();
  await op.sandbox.printOperationBrief();
  assert.strictEqual(op.downloads.length, 1);
  assert.strictEqual(op.printed(), 1, "failed ledger prevents print submission");
  const target = harness("mobile-target-sheet");
  target.load("functions/leads.js");
  target.listeners[0]();
  const capturedTargetHtml = target.sheet.outerHTML;
  target.before(() => { target.sheet.outerHTML = "<article>Changed after capture</article>"; target.person.name.lastName = "Later"; });
  const targetResult = await target.sandbox.saveTargetSheet();
  assert(targetResult, "Target sheet generation succeeds");
  assert(targetResult.artifact.data.includes(capturedTargetHtml), "Target export clones painted HTML before asynchronous assets are loaded");
  assert(!targetResult.artifact.data.includes("Changed after capture"));
  assert.strictEqual(target.generated[0].context.entities.person.name.lastName, 'Doe, "Example"');
  assert.strictEqual(target.deliveries[0].status, "SUBMITTED");
  target.fail(true);
  await target.sandbox.saveTargetSheet();
  assert.strictEqual(target.downloads.length, 1, "Target export fails closed on ledger failure");

  // A delivery receipt failing after the browser accepts the artifact must not claim failed delivery.
  for (const page of ["test", "mobile-target-sheet", "operation-brief"]) {
    const delivered = harness(page);
    delivered.load(page === "operation-brief" ? "functions/operations.js" : "functions/leads.js");
    if (page !== "test") { delivered.listeners[0](); }
    const attempts = [];
    delivered.api.recordDelivery = async (_id, value) => {
      attempts.push(value.status);
      if (attempts.length === 1) { throw new Error("One-shot delivery quota failure"); }
    };
    const output = await (page === "test" ? delivered.sandbox.COPDoc.leadDocuments.exportOneCsv() :
      page === "mobile-target-sheet" ? delivered.sandbox.saveTargetSheet() : delivered.sandbox.saveOperationBrief());
    assert(output, "a successfully submitted artifact remains available when the receipt write fails");
    assert.strictEqual(delivered.downloads.length, 1);
    assert.deepStrictEqual(attempts, ["SUBMITTED"], "do not manufacture a FAILED delivery after a successful browser handoff");
    assert(/was submitted.*history could not be saved/.test(delivered.statuses.at(-1)));
    if (page === "operation-brief") {
      attempts.length = 0;
      const print = await delivered.sandbox.printOperationBrief();
      assert(print);
      assert.strictEqual(delivered.printed(), 1);
      assert.deepStrictEqual(attempts, ["SUBMITTED"]);
      assert(/was submitted for print.*history could not be saved/.test(delivered.statuses.at(-1)));
    }
  }

  // Run the case adapter against the actual Stage 7 boundary, registry and durable ledger.
  const real = harness("test");
  const data = new Map();
  real.sandbox.crypto = require("crypto").webcrypto;
  real.sandbox.TextEncoder = TextEncoder;
  real.sandbox.navigator = { locks: { request: async (_name, _options, fn) => fn() } };
  let actualWrites = 0;
  real.sandbox.localStorage = { getItem: key => data.has(key) ? data.get(key) : null, setItem: (key, value) => {
    actualWrites++;
    if (actualWrites === 3) { throw new Error("One-shot quota at delivery receipt"); }
    data.set(key, String(value));
  } };
  real.load("functions/document-context.js");
  real.load("functions/document-registry.js");
  real.load("functions/document-fingerprints.js");
  real.load("functions/document-generation.js");
  real.load("functions/leads.js");
  const actual = await real.sandbox.COPDoc.leadDocuments.exportOneCsv();
  assert(actual, real.statuses.join("; "));
  assert.strictEqual(actual.artifact.data, fixture("lead.csv"));
  const ledger = JSON.parse(data.get("copdocx.document-generations.v1"));
  const record = ledger.records[actual.record.generationId];
  assert.strictEqual(record.status, "GENERATED");
  assert.strictEqual(actualWrites, 3, "actual ledger delivery write failure does not trigger a false FAILED rewrite");
  assert.deepStrictEqual(record.deliveries, []);
  assert(/was submitted.*history could not be saved/.test(real.statuses.at(-1)));
  assert.strictEqual(record.outputHash, require("crypto").createHash("sha256").update(fixture("lead.csv")).digest("hex"));
  assert(!JSON.stringify(ledger).includes('Doe'), "generation history never duplicates raw personal fields");
  console.log("PASS Stage 7 case CSV, target and operation contracts, real provenance ledger, frozen capture and failure gates");
})().catch(error => { console.error(error); process.exitCode = 1; });
