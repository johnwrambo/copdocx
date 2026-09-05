"use strict";

const assert = require("assert");
const { createMemoryStorage, createTab, loadScript, quietConsole } = require("./support/copdoc-vm-harness.js");

const JOURNAL = "copdocx.import-transactions.v1";
const SETTINGS = "copdocx.settings.v1";
const PACKETS = "alien-book-in.saved-records.v1";
const MAPS = "copdocx.map.views.v1";
const COLUMNS = "alien-book-in.saved-record-columns.v1";
const SESSION = "addrGeoCache_v1";
const UNRELATED = "copdocx.map.icons.v1";
const json = value => JSON.stringify(value);
const copy = value => JSON.parse(JSON.stringify(value));
const ok = result => {
  assert.ok(result && result.ok, result && result.error || "Import operation must succeed.");
  return result;
};

// One deterministic write counter covers both browser media and removals.
// Seeding and simulated independent-window edits bypass the failure injector.
function storagePair() {
  const local = createMemoryStorage(), session = createMemoryStorage();
  let failureAt = 0, writes = 0;
  const history = [];
  const pair = {
    local, session, history,
    reset() { writes = 0; history.length = 0; failureAt = 0; },
    failAt(number) { failureAt = number; },
    snapshot() { return { local: local.dump(), session: session.dump() }; },
    raw(change) { return (change.medium === "sessionStorage" ? session : local).raw(change.key); },
    seed(change, value) {
      const target = change.medium === "sessionStorage" ? session : local;
      if (value === null) target.storage.removeItem(change.key);
      else target.setRaw(change.key, value);
    }
  };
  function wrapper(control, medium) {
    return {
      get length() { return control.storage.length; },
      key(index) { return control.storage.key(index); },
      getItem(key) { return control.storage.getItem(key); },
      setItem(key, value) { mutate("setItem", key, value); },
      removeItem(key) { mutate("removeItem", key); }
    };
    function mutate(operation, key, value) {
      const row = { operation, key, medium, number: ++writes, failed: false };
      history.push(row);
      if (failureAt === writes) {
        row.failed = true; failureAt = 0;
        throw new Error("Injected import storage failure " + writes + " at " + key);
      }
      control.storage[operation](key, value);
    }
  }
  pair.localStorage = wrapper(local, "localStorage");
  pair.sessionStorage = wrapper(session, "sessionStorage");
  return pair;
}

function runtime(pair) {
  const context = createTab(pair.local, { console: quietConsole() });
  context.localStorage = pair.localStorage;
  context.sessionStorage = pair.sessionStorage;
  loadScript(context, "functions/workspace-config.js");
  loadScript(context, "functions/import-workflow.js");
  const api = context.COPDoc.importWorkflow;
  assert.ok(api, "The production import workflow must be loaded.");
  return { context, api, pair };
}

function fixture() {
  const pair = storagePair();
  const plan = {
    ok: true,
    changes: [
      { key: SETTINGS, medium: "localStorage", before: '{ "team": "Synthetic before", "keep": false }', after: json({ team: "Synthetic imported", keep: true }) },
      { key: PACKETS, medium: "localStorage", before: json([{ id: "before", formState: {} }]), after: json([{ id: "before", formState: {} }, { id: "imported", firstName: "Synthetic", formState: { medical: false } }]) },
      { key: MAPS, medium: "localStorage", before: null, after: json({ imported: { latitude: 0, longitude: 0 } }) },
      { key: COLUMNS, medium: "localStorage", before: '["name"]', after: null },
      { key: SESSION, medium: "sessionStorage", before: json({ before: [0, 0] }), after: json({ after: [1, 1] }) }
    ],
    mediaPlans: [],
    stats: { added: 1, updated: 1, skipped: 0 }
  };
  plan.changes.forEach(change => pair.seed(change, change.before));
  pair.local.setRaw(UNRELATED, json({ original: true }));
  pair.reset();
  return { ...runtime(pair), plan };
}

function transactions(r) {
  const result = ok(r.api.listTransactions());
  assert.ok(Array.isArray(result.transactions));
  return result.transactions;
}

function assertBytes(r, plan, field) {
  plan.changes.forEach(change => {
    assert.strictEqual(r.pair.raw(change), change[field], change.medium + ":" + change.key + " must equal the exact " + field + " bytes");
  });
}

function assertDomainUntouched(r, plan) {
  assertBytes(r, plan, "before");
  assert.strictEqual(r.pair.local.raw(UNRELATED), json({ original: true }));
}

async function runEveryWriteRecovery() {
  const baseline = fixture(), result = ok(baseline.api.commitSync(baseline.plan));
  assertBytes(baseline, baseline.plan, "after");
  const writes = baseline.pair.history.slice();
  assert.ok(writes.length > baseline.plan.changes.length, "A successful import journals progress around writes.");
  assert.strictEqual(writes[0].key, JOURNAL, "The before-image journal precedes every domain mutation.");
  assert.strictEqual(transactions(baseline).find(row => row.transactionId === result.transactionId).status, "COMPLETED");

  for (let number = 1; number <= writes.length; number += 1) {
    const r = fixture(); r.pair.failAt(number);
    const failed = r.api.commitSync(r.plan);
    assert.strictEqual(failed.ok, false, "Injected write " + number + " must never report success.");
    const next = runtime(r.pair), saved = transactions(next);
    let recovered;
    if (saved.length) {
      assert.strictEqual(saved.length, 1, "One request owns one recovery command.");
      recovered = ok(await next.api.resume(saved[0].transactionId));
    } else {
      assertDomainUntouched(next, r.plan);
      recovered = ok(next.api.commitSync(r.plan));
    }
    assertBytes(next, r.plan, "after");
    assert.strictEqual(r.pair.local.json(PACKETS).filter(row => row.id === "imported").length, 1);
    assert.strictEqual(transactions(next).filter(row => row.status !== "COMPLETED").length, 0);
    const before = r.pair.snapshot();
    ok(await next.api.resume(recovered.transactionId));
    assert.deepStrictEqual(r.pair.snapshot(), before, "Completed resume must be read-only, including its receipt.");
  }
  return writes;
}

async function runEveryWriteRollback(writes) {
  for (let number = 2; number <= writes.length; number += 1) {
    const r = fixture(); r.pair.failAt(number);
    const failed = r.api.commitSync(r.plan);
    assert.strictEqual(failed.ok, false);
    const next = runtime(r.pair), command = transactions(next)[0];
    assert.ok(command, "A failure after journal creation must remain recoverable.");
    ok(await next.api.rollback(command.transactionId));
    assertDomainUntouched(next, r.plan);
    assert.strictEqual(transactions(next)[0].status, "ROLLED_BACK");
    const before = r.pair.snapshot();
    ok(await next.api.rollback(command.transactionId));
    assert.deepStrictEqual(r.pair.snapshot(), before, "Repeated rollback cannot reapply or mutate receipts.");
    assert.strictEqual((await next.api.resume(command.transactionId)).ok, false, "A rolled-back command cannot be accidentally resumed.");
    assert.deepStrictEqual(r.pair.snapshot(), before);
  }
}

async function runRollbackWriteRecovery(writes) {
  // Stop after the last store has been applied but before its completion
  // receipt. This exercises reversal of additions, updates, and removals.
  const pauseAt = writes.length;
  const seed = fixture(); seed.pair.failAt(pauseAt);
  assert.strictEqual(seed.api.commitSync(seed.plan).ok, false);
  const seedCommand = transactions(seed)[0]; seed.pair.reset();
  ok(await seed.api.rollback(seedCommand.transactionId));
  const rollbackWrites = seed.pair.history.slice();
  assert.ok(rollbackWrites.length, "Recovery rollback persists its state.");
  for (let number = 1; number <= rollbackWrites.length; number += 1) {
    const r = fixture(); r.pair.failAt(pauseAt);
    assert.strictEqual(r.api.commitSync(r.plan).ok, false);
    const command = transactions(r)[0]; r.pair.reset(); r.pair.failAt(number);
    assert.strictEqual((await r.api.rollback(command.transactionId)).ok, false, "Failed rollback write " + number + " cannot report success.");
    const next = runtime(r.pair);
    ok(await next.api.rollback(command.transactionId));
    assertDomainUntouched(next, r.plan);
    assert.strictEqual(transactions(next)[0].status, "ROLLED_BACK");
  }
}

async function runValidationAndConflicts(writes) {
  for (const mutate of [
    plan => { plan.ok = false; },
    plan => { plan.changes[0].key = "unregistered.private.store"; },
    plan => { plan.changes[0].key = JOURNAL; },
    plan => { plan.changes[0].medium = "indexedDB"; },
    plan => { plan.changes[0].medium = "sessionStorage"; },
    plan => { plan.changes.push(copy(plan.changes[0])); },
    plan => { plan.changes[0].before = { team: "Synthetic before" }; },
    plan => { plan.changes[0].after = { team: "Synthetic imported" }; },
    plan => { delete plan.changes[0].before; },
    plan => { delete plan.changes[0].after; },
    plan => { plan.mediaPlans = [{ mediaId: "test_photo", ownerType: "BOOKING", ownerId: "imported", kind: "PHOTO", dataUrl: "data:image/png;base64,AA==", mimeType: "image/png", filename: "test.png" }]; }
  ]) {
    const r = fixture(); mutate(r.plan); const before = r.pair.snapshot();
    assert.strictEqual(r.api.commitSync(r.plan).ok, false, "An invalid change plan is rejected before journaling.");
    assert.deepStrictEqual(r.pair.snapshot(), before);
  }
  for (const value of ["{", "null", "[]", '{"schema":"unknown","transactions":{}}']) {
    const r = fixture(); r.pair.local.setRaw(JOURNAL, value); const before = r.pair.snapshot();
    assert.strictEqual(r.api.commitSync(r.plan).ok, false);
    assert.deepStrictEqual(r.pair.snapshot(), before, "Malformed existing journals must be preserved.");
  }
  for (const mutate of [
    row => { delete row.revision; },
    row => { row.revision = -1; },
    row => { row.revision = "1"; },
    row => { row.revision = 1.5; },
    row => { row.appliedKeys = {}; },
    row => { row.appliedKeys = ["localStorage:" + SETTINGS, "localStorage:" + SETTINGS]; },
    row => { row.appliedKeys = [null]; },
    row => { row.mediaCreated = "photo"; },
    row => { row.mediaCreated = [""]; },
    row => { row.mediaCreated = ["photo", "photo"]; },
    row => { row.mediaPrepared = 1; },
    row => { row.media = {}; }
  ]) {
    const r = fixture(); r.pair.failAt(2);
    assert.strictEqual(r.api.commitSync(r.plan).ok, false);
    const command = transactions(r)[0], journal = r.pair.local.json(JOURNAL);
    mutate(journal.transactions[command.transactionId]);
    r.pair.local.setRaw(JOURNAL, json(journal));
    const before = r.pair.snapshot(), next = runtime(r.pair);
    assert.strictEqual(next.api.listTransactions().ok, false, "Malformed checkpoint shapes are rejected by read-only inspection.");
    for (const action of ["resume", "rollback"]) {
      const result = await next.api[action](command.transactionId);
      assert.strictEqual(result.ok, false);
      assert.strictEqual(result.code, "IMPORT_JOURNAL_INVALID");
      assert.deepStrictEqual(r.pair.snapshot(), before, "Malformed checkpoint cannot be mutated before rejection.");
    }
  }
  // Every preflight value, including the final session-store value, is checked
  // before the first import write; a late mismatch cannot leave an early store applied.
  for (const changeIndex of [0, 1, 4]) {
    const r = fixture(), target = r.plan.changes[changeIndex];
    r.pair.seed(target, json({ independentWindow: true })); const before = r.pair.snapshot();
    assert.strictEqual(r.api.commitSync(r.plan).ok, false);
    assert.deepStrictEqual(r.pair.snapshot(), before, "Stale preflight must not change any store or journal.");
  }

  const secondDomainWrite = writes.find(row => row.key === PACKETS);
  assert.ok(secondDomainWrite);
  for (const action of ["resume", "rollback"]) {
    const r = fixture(); r.pair.failAt(secondDomainWrite.number);
    assert.strictEqual(r.api.commitSync(r.plan).ok, false);
    const command = transactions(r)[0];
    r.pair.local.setRaw(UNRELATED, json({ independentWindow: "preserve" }));
    const next = runtime(r.pair);
    ok(await next.api[action](command.transactionId));
    assert.strictEqual(r.pair.local.raw(UNRELATED), json({ independentWindow: "preserve" }), action + " must preserve unrelated writes.");
    assertBytes(next, r.plan, action === "resume" ? "after" : "before");
  }
  for (const action of ["resume", "rollback"]) {
    for (const changeIndex of [0, 1, 4]) {
      const r = fixture(); r.pair.failAt(secondDomainWrite.number);
      assert.strictEqual(r.api.commitSync(r.plan).ok, false);
      const command = transactions(r)[0], target = r.plan.changes[changeIndex];
      const conflict = json({ laterEdit: "must survive", changeIndex }); r.pair.seed(target, conflict);
      const domainBefore = r.plan.changes.map(change => r.pair.raw(change));
      assert.strictEqual((await runtime(r.pair).api[action](command.transactionId)).ok, false);
      assert.strictEqual(r.pair.raw(target), conflict, action + " must never overwrite a conflicting later edit.");
      assert.deepStrictEqual(r.plan.changes.map(change => r.pair.raw(change)), domainBefore, "Recovery validates all owned stores before any mutation.");
      assert.ok(transactions(runtime(r.pair)).some(row => row.transactionId === command.transactionId && row.status !== "COMPLETED" && row.status !== "ROLLED_BACK"), "The conflicted command remains visible for recovery.");
    }
  }
}

async function main() {
  const writes = await runEveryWriteRecovery();
  await runEveryWriteRollback(writes);
  await runRollbackWriteRecovery(writes);
  await runValidationAndConflicts(writes);
  {
    const r = fixture(), first = ok(await r.api.apply(r.plan));
    assertBytes(r, r.plan, "after");
    const refreshedPlan = copy(r.plan);
    refreshedPlan.changes.forEach(change => { change.before = change.after; });
    ok(await r.api.apply(refreshedPlan));
    assertBytes(r, r.plan, "after");
    assert.strictEqual(r.pair.local.json(PACKETS).filter(row => row.id === "imported").length, 1, "Reimport of the same prepared data adds no duplicate packet.");
    assert.ok(first.transactionId);
    const before = r.pair.snapshot();
    assert.strictEqual((await r.api.rollback(first.transactionId)).ok, false, "Completed imports require a new reviewed change rather than recovery rollback.");
    assert.deepStrictEqual(r.pair.snapshot(), before);
  }
  {
    const first = fixture(), second = runtime(first.pair), competing = copy(first.plan);
    competing.changes[0].after = json({ team: "Competing import", keep: false });
    competing.changes[1].after = json([{ id: "before", formState: {} }, { id: "competing", formState: {} }]);
    const queues = new Map(), acquisitions = new Map();
    const locks = { request(name, options, action) {
      if (typeof options === "function") { action = options; options = {}; }
      assert.ok(name);
      assert.ok(!options.mode || options.mode === "exclusive");
      acquisitions.set(name, (acquisitions.get(name) || 0) + 1);
      const run = (queues.get(name) || Promise.resolve()).then(action);
      queues.set(name, run.catch(() => {})); return run;
    } };
    first.context.navigator.locks = locks; second.context.navigator.locks = locks;
    const results = await Promise.all([first.api.apply(first.plan), second.api.apply(competing)]);
    assert.ok(Array.from(acquisitions.entries()).some(([name, count]) => /import/.test(name) && count === 2), "Both windows acquire the shared import lock.");
    assert.strictEqual(results.filter(result => result.ok).length, 1, "Only one of two competing stale plans commits.");
    assertBytes(first, results[0].ok ? first.plan : competing, "after");
    assert.strictEqual(first.pair.local.json(PACKETS).length, 2, "A losing concurrent import cannot add partial records.");
  }
  console.log("STAGE6_IMPORT_RECOVERY_PASSED every storage write/restart, exact rollback, stale preflight, conflicts, invalid plans and repeated import.");
}

main().catch(error => { console.error(error); process.exitCode = 1; });
