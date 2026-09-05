"use strict";

const assert = require("assert");
const { createHash, webcrypto } = require("crypto");
const { TextEncoder, TextDecoder } = require("util");
const { createMemoryStorage, createTab, loadScript, quietConsole } = require("./support/copdoc-vm-harness.js");

const KEY = "copdocx.document-generations.v1";
const TYPE = "bookin.combined-pdf";
const TEMPLATE = "Synthetic Stage 7 renderer template v1\n";
const SECRET = "SYNTHETIC_PRIVATE_MEDICAL_NARRATIVE_92473";
const hash = value => createHash("sha256").update(value).digest("hex");
const plain = value => JSON.parse(JSON.stringify(value));
function canonical(value) {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object") return "{" + Object.keys(value).sort().map(key => JSON.stringify(key) + ":" + canonical(value[key])).join(",") + "}";
  return JSON.stringify(value);
}

// Each runtime is a separate browser tab. Only storage and the Web Locks
// coordinator are shared; no production application data is read or written.
function lockCoordinator() {
  const queues = new Map();
  return { request(name, options, callback) {
    if (typeof options === "function") { callback = options; options = {}; }
    assert.ok(typeof name === "string" && name.length, "Mutations need a named lock.");
    if (options.mode) assert.strictEqual(options.mode, "exclusive");
    const previous = queues.get(name) || Promise.resolve();
    const pending = previous.then(() => callback({ name, mode: "exclusive" }));
    queues.set(name, pending.catch(() => {}));
    return pending;
  } };
}

function runtime(storage = createMemoryStorage(), locks = lockCoordinator()) {
  const context = createTab(storage, { console: quietConsole() });
  Object.assign(context, { crypto: webcrypto, TextEncoder, TextDecoder, Uint8Array, ArrayBuffer });
  context.navigator.locks = locks;
  loadScript(context, "functions/document-context.js");
  loadScript(context, "functions/document-registry.js");
  loadScript(context, "functions/document-fingerprints.js");
  loadScript(context, "functions/document-generation.js");
  const api = context.COPDoc.documents;
  assert.strictEqual(typeof api.generate, "function", "Load the production generation service.");
  return { context, storage, locks, api };
}

function capture(r, overrides = {}) {
  return r.api.captureContext(Object.assign({
    documentType: TYPE,
    capturedAt: "2026-09-05T12:00:00.000Z",
    generatingOfficerId: "officer_synthetic_7",
    person: { personId: "person_synthetic_7", name: { firstName: SECRET } },
    sources: [{ type: "Person", id: "person_synthetic_7", revision: "rev_1", authority: "canonical" }],
    input: { medical: SECRET, count: 7, nested: { narrative: SECRET } }
  }, overrides));
}

function request(r, overrides = {}) {
  return Object.assign({
    documentType: TYPE,
    context: capture(r),
    templateContent: TEMPLATE,
    render: async context => ({ data: context.input.nested.narrative, mimeType: "text/plain", filename: SECRET + ".txt" })
  }, overrides);
}

function receiptRows(r) {
  const ledger = r.storage.json(KEY);
  return ledger ? Object.values(ledger.records) : [];
}

function assertPrivate(r) {
  const raw = r.storage.raw(KEY) || "";
  assert.ok(!raw.includes(SECRET), "Generation receipts must not persist narrative, medical, name, filename, or renderer error text.");
}

async function runHashesAndContext() {
  const r = runtime();
  const input = { medical: SECRET, count: 7, nested: { narrative: SECRET } };
  const person = { personId: "person_synthetic_7", name: { firstName: SECRET } };
  const frozen = capture(r, { input, person });
  input.nested.narrative = "A later unsaved edit";
  person.name.firstName = "A later canonical edit";
  assert.strictEqual(frozen.input.nested.narrative, SECRET);
  assert.strictEqual(frozen.entities.person.name.firstName, SECRET);
  let renderCalled = 0;
  const first = await r.api.generate(request(r, { context: frozen, render: async context => {
    renderCalled++;
    assert.strictEqual(receiptRows(r)[0].status, "PENDING", "The durable start precedes generation.");
    await Promise.resolve();
    assert.strictEqual(context.input.nested.narrative, SECRET, "Awaiting cannot change the captured renderer input.");
    assert.ok(Object.isFrozen(context) && Object.isFrozen(context.input.nested));
    return { data: "Unicode output: é 漢字\n" + SECRET, mimeType: "text/plain", filename: SECRET + ".txt" };
  } }));
  assert.strictEqual(renderCalled, 1);
  assert.strictEqual(first.record.status, "GENERATED");
  assert.strictEqual(first.record.outputHash, hash("Unicode output: é 漢字\n" + SECRET));
  assert.strictEqual(first.record.templateHash, hash(canonical({ template: plain(r.api.registry.get(TYPE).template), sources: plain(r.api.templateFingerprints[TYPE]), runtimeHash: hash(TEMPLATE) })));
  assert.match(first.record.inputHash, /^[a-f0-9]{64}$/);
  assert.ok(first.record.generationId);
  assertPrivate(r);

  const reordered = capture(r, {
    capturedAt: "2026-09-06T12:00:00.000Z",
    input: { nested: { narrative: SECRET }, count: 7, medical: SECRET }
  });
  const equivalent = await r.api.generate(request(r, { context: reordered }));
  assert.strictEqual(equivalent.record.inputHash, first.record.inputHash, "Object key order and capture clock must not change the source fingerprint.");
  assert.notStrictEqual(equivalent.record.generationId, first.record.generationId, "Separate user generations have separate receipts.");
  const changedInput = await r.api.generate(request(r, { context: capture(r, { input: { medical: SECRET, count: 8, nested: { narrative: SECRET } } }) }));
  assert.notStrictEqual(changedInput.record.inputHash, first.record.inputHash, "Changed rendered facts must alter the input hash.");
  const changedRevision = await r.api.generate(request(r, { context: capture(r, { sources: [{ type: "Person", id: "person_synthetic_7", revision: "rev_2", authority: "canonical" }] }) }));
  assert.strictEqual(changedRevision.record.inputHash, first.record.inputHash, "An unchanged semantic input has the same input hash.");
  assert.notStrictEqual(changedRevision.record.sourceFingerprint, first.record.sourceFingerprint, "A changed source revision must change provenance.");
  const changedOfficer = await r.api.generate(request(r, { context: capture(r, { generatingOfficerId: "officer_synthetic_other" }) }));
  assert.strictEqual(changedOfficer.record.generatingOfficerId, "officer_synthetic_other");
  assert.strictEqual(changedOfficer.record.inputHash, first.record.inputHash, "Receipt authorship alone does not alter rendered input.");
  const newTemplate = await r.api.generate(request(r, { templateContent: TEMPLATE + "changed" }));
  assert.notStrictEqual(newTemplate.record.templateHash, first.record.templateHash);
  const mutableTemplate = { rules: ["captured rule"], metadata: { version: 7 } };
  const originalTemplate = plain(mutableTemplate);
  const awaitingTemplate = r.api.generate(request(r, { templateContent: mutableTemplate }));
  mutableTemplate.rules[0] = "Later template editor change";
  mutableTemplate.metadata.version = 8;
  const capturedTemplate = await awaitingTemplate;
  assert.strictEqual(capturedTemplate.record.templateHash, hash(canonical({ template: plain(r.api.registry.get(TYPE).template), sources: plain(r.api.templateFingerprints[TYPE]), runtimeHash: hash(canonical(originalTemplate)) })), "Template configuration must be captured before hashing awaits, just like renderer input.");

  // Subarray bytes intentionally exclude buffer prefix/suffix. Hashing the
  // underlying buffer would claim an incorrect PDF/artifact fingerprint.
  const whole = new Uint8Array([99, 0, 127, 255, 33, 88]);
  const slice = whole.subarray(1, 5);
  const binary = await r.api.generate(request(r, { render: async () => ({ data: slice, mimeType: "application/pdf", filename: "synthetic.pdf" }) }));
  assert.strictEqual(binary.record.outputHash, hash(Buffer.from([0, 127, 255, 33])));
  const blob = await r.api.generate(request(r, { render: async () => ({ data: new Blob([slice], { type: "application/pdf" }), mimeType: "application/pdf", filename: "synthetic.pdf" }) }));
  assert.strictEqual(blob.record.outputHash, binary.record.outputHash);
  slice.fill(19);
  assert.deepStrictEqual(Array.from(binary.artifact.data), [0, 127, 255, 33], "The renderer cannot mutate the bytes released after verification.");

  const copied = r.api.get(first.record.generationId);
  copied.status = "FAILED";
  assert.strictEqual(r.api.get(first.record.generationId).status, "GENERATED", "Read helpers cannot expose mutable ledger ownership.");
  assertPrivate(r);
}

async function runRendererMutationDuringHash() {
  const r = runtime();
  const original = { data: "ORIGINAL_OUTPUT", mimeType: "text/plain", filename: "original.txt" };
  let mutated = false;
  r.context.crypto = {
    getRandomValues: webcrypto.getRandomValues.bind(webcrypto),
    subtle: { async digest(algorithm, data) {
      if (Buffer.from(data).equals(Buffer.from("ORIGINAL_OUTPUT"))) {
        mutated = true;
        original.data = "REPLACEMENT_OUTPUT";
        original.mimeType = "application/pdf";
        original.filename = "replacement.pdf";
      }
      return webcrypto.subtle.digest(algorithm, data);
    } }
  };
  const generated = await r.api.generate(request(r, { render: async () => original }));
  assert.strictEqual(mutated, true, "The asynchronous hash boundary actually changed the renderer-owned object.");
  assert.strictEqual(generated.record.outputHash, hash("ORIGINAL_OUTPUT"));
  assert.strictEqual(generated.artifact.data, "ORIGINAL_OUTPUT", "Only the bytes that were hashed may be released.");
  assert.strictEqual(generated.artifact.mimeType, "text/plain");
  assert.strictEqual(generated.artifact.filename, "original.txt");
  assert.strictEqual(generated.record.mimeType, "text/plain");
}

async function runFailureBoundaries() {
  for (const write of [1, 2]) {
    const r = runtime(); let rendered = 0;
    r.storage.setRaw("unrelated.synthetic", "keep exact bytes");
    r.storage.failOnWrite(write);
    await assert.rejects(r.api.generate(request(r, { render: async () => {
      rendered++;
      return { data: SECRET, mimeType: "text/plain", filename: SECRET };
    } })));
    assert.strictEqual(rendered, write === 1 ? 0 : 1, "A failed start must not generate; a failed completion must not return an artifact.");
    assert.strictEqual(receiptRows(r).filter(row => row.status === "GENERATED").length, 0);
    assert.strictEqual(r.storage.raw("unrelated.synthetic"), "keep exact bytes");
    assertPrivate(r);
  }

  {
    const r = runtime();
    await assert.rejects(r.api.generate(request(r, { render: async () => { throw new Error(SECRET); } })));
    const rows = receiptRows(r);
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].status, "FAILED");
    assertPrivate(r);
    const recovered = await runtime(r.storage, r.locks).api.generate(request(r));
    assert.strictEqual(recovered.record.status, "GENERATED");
    assert.strictEqual(receiptRows(r).length, 2, "A fresh retry preserves the previous failure receipt.");
  }

  for (const bad of ["{", "null", "[]", "{}", '{"schemaVersion":999,"records":{}}', '{"schemaVersion":1,"records":[]}']) {
    const r = runtime(); r.storage.setRaw(KEY, bad); const before = r.storage.dump();
    await assert.rejects(r.api.generate(request(r)));
    assert.throws(() => r.api.list());
    assert.deepStrictEqual(r.storage.dump(), before, "A corrupt or unsupported ledger must not be replaced.");
  }
  for (const missing of ["locks", "crypto", "fingerprints", "complete fingerprints"]) {
    const r = runtime();
    if (missing === "locks") delete r.context.navigator.locks;
    else if (missing === "crypto") delete r.context.crypto;
    else if (missing === "fingerprints") delete r.api.templateFingerprints;
    else r.api.templateFingerprints[TYPE] = {};
    let rendered = false;
    await assert.rejects(r.api.generate(request(r, { render: async () => { rendered = true; return { data: SECRET, mimeType: "text/plain" }; } })));
    assert.strictEqual(rendered, false, "Missing " + missing + " must fail before rendering.");
    assert.strictEqual(r.storage.raw(KEY), null);
  }

  {
    const r = runtime(); let rendered = false;
    r.context.COPDoc.importWorkflow = { assertWritable() { return { ok: false, code: "IMPORT_PENDING", error: "Resume the pending synthetic import." }; } };
    await assert.rejects(r.api.generate(request(r, { render: async () => { rendered = true; return { data: SECRET, mimeType: "text/plain" }; } })));
    assert.strictEqual(rendered, false, "The import guard returns a failure object; it need not throw to block document mutation.");
    assert.strictEqual(r.storage.raw(KEY), null);
  }
  {
    const r = runtime();
    const generated = await r.api.generate(request(r));
    const original = r.storage.json(KEY);
    for (const damage of [
      ledger => { ledger.records[generated.record.generationId].generationId = "different_generation"; },
      ledger => { ledger.records[generated.record.generationId].outputHash = "not-sha256"; },
      ledger => { ledger.records[generated.record.generationId].status = "MADE_UP"; },
      ledger => { ledger.records[generated.record.generationId].deliveries = [{ method: "clipboard", status: "SUCCEEDED", at: "2026-09-05T12:00:00Z", outputHash: "bad" }]; }
    ]) {
      const corrupted = plain(original); damage(corrupted); r.storage.setRaw(KEY, corrupted);
      const before = r.storage.dump();
      assert.throws(() => r.api.get(generated.record.generationId));
      await assert.rejects(r.api.generate(request(r)));
      assert.deepStrictEqual(r.storage.dump(), before, "Invalid historical receipts cannot be silently repaired or discarded by new generation.");
    }
  }
}

async function runPendingAndDuplicates() {
  const r = runtime(); let release, started;
  const entered = new Promise(resolve => { started = resolve; });
  const hold = new Promise(resolve => { release = resolve; });
  const pending = r.api.generate(request(r, { requestId: "request_synthetic_pending", render: async () => {
    started(); await hold;
    return { data: SECRET, mimeType: "text/plain", filename: "synthetic.txt" };
  } }));
  await entered;
  const rows = receiptRows(r);
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].status, "PENDING");
  const reopened = runtime(r.storage, r.locks);
  assert.strictEqual(reopened.api.get(rows[0].generationId).status, "PENDING", "Reload retains interruption evidence without pretending the output exists.");
  await assert.rejects(reopened.api.generate(request(reopened, { requestId: "request_synthetic_pending" })));
  assert.strictEqual(receiptRows(r).length, 1, "An active request cannot be started twice.");
  release(); const done = await pending;
  const before = r.storage.dump();
  for (const changed of [{}, { templateContent: TEMPLATE + "different" }]) {
    await assert.rejects(reopened.api.generate(request(reopened, { requestId: "request_synthetic_pending", ...changed })));
    assert.deepStrictEqual(r.storage.dump(), before, "Reusing a request ID cannot overwrite its receipt.");
  }
  assert.strictEqual(reopened.api.get(done.record.generationId).status, "GENERATED");
  await reopened.api.generate(request(reopened, { requestId: "request_synthetic_new" }));
  assert.strictEqual(receiptRows(r).length, 2);
}

async function runConcurrentWindows() {
  const storage = createMemoryStorage(), locks = lockCoordinator();
  const tabs = Array.from({ length: 4 }, () => runtime(storage, locks));
  const results = await Promise.all(Array.from({ length: 20 }, (_, i) => {
    const r = tabs[i % tabs.length];
    return r.api.generate(request(r, {
      requestId: "request_parallel_" + i,
      render: async () => { await Promise.resolve(); return { data: "output " + i, mimeType: "text/plain", filename: "synthetic.txt" }; }
    }));
  }));
  assert.strictEqual(new Set(results.map(row => row.record.generationId)).size, 20);
  assert.strictEqual(receiptRows(tabs[0]).length, 20);
  assert.ok(receiptRows(tabs[0]).every(row => row.status === "GENERATED"), "Independent tab completions cannot lose another tab's start or completion.");
  results.forEach((row, i) => assert.strictEqual(tabs[(i + 1) % tabs.length].api.get(row.record.generationId).outputHash, hash("output " + i)));
  const duplicates = await Promise.allSettled([tabs[0], tabs[1]].map(r => r.api.generate(request(r, { requestId: "parallel_same_request" }))));
  assert.strictEqual(duplicates.filter(row => row.status === "fulfilled").length, 1, "Cross-window duplicate submission generates once.");
  assert.strictEqual(duplicates.filter(row => row.status === "rejected" && row.reason.code === "DUPLICATE_REQUEST").length, 1);
  assert.strictEqual(receiptRows(tabs[0]).length, 21);
}

async function runDeliveryProvenance() {
  const r = runtime();
  const generated = await r.api.generate(request(r));
  const id = generated.record.generationId;
  await r.api.recordDelivery(id, { method: "download", status: "SUBMITTED" });
  const html = "<p>Synthetic HTML alternate</p>";
  await r.api.recordDelivery(id, { method: "clipboard", status: "SUCCEEDED", artifact: { data: html, mimeType: "text/html" } });
  const saved = r.api.get(id), deliveries = saved.deliveries;
  assert.strictEqual(deliveries.length, 2);
  assert.strictEqual(deliveries[0].status, "SUBMITTED", "Requesting a browser download does not claim confirmed delivery.");
  assert.strictEqual(deliveries[1].outputHash, hash(html), "Alternate clipboard markup has its own actual-byte hash.");
  assert.strictEqual(saved.outputHash, generated.record.outputHash, "Delivery alternatives cannot replace the generated artifact fingerprint.");
  assertPrivate(r);
  const before = r.storage.dump();
  await assert.rejects(r.api.recordDelivery("generation_missing", { method: "save", status: "SUCCEEDED" }));
  await assert.rejects(r.api.recordDelivery(id, { method: "made-up", status: "SUCCEEDED" }));
  assert.deepStrictEqual(r.storage.dump(), before, "Invalid delivery references cannot create or alter a generation.");
  r.storage.failNext(KEY);
  await assert.rejects(r.api.recordDelivery(id, { method: "print", status: "SUBMITTED" }));
  assert.deepStrictEqual(r.storage.dump(), before, "Failed delivery persistence leaves the last complete receipt intact.");

  await r.api.attachMedia(id, "media_synthetic_7");
  assert.strictEqual(r.api.get(id).mediaId, "media_synthetic_7");
  await r.api.attachMedia(id, "media_synthetic_7");
  const attached = r.storage.dump();
  await assert.rejects(r.api.attachMedia(id, "media_conflicting_other"));
  await assert.rejects(r.api.attachMedia("generation_missing", "media_synthetic_7"));
  assert.deepStrictEqual(r.storage.dump(), attached, "A saved artifact reference cannot be reassigned to another Media object.");
}

async function main() {
  await runHashesAndContext();
  await runRendererMutationDuringHash();
  await runFailureBoundaries();
  await runPendingAndDuplicates();
  await runConcurrentWindows();
  await runDeliveryProvenance();
  console.log("STAGE7_DOCUMENT_GENERATION_PASSED exact hashes, immutable input, durable failures, private receipts, interrupted requests, concurrent tabs and alternate delivery provenance.");
}

main().catch(error => { console.error(error); process.exitCode = 1; });
