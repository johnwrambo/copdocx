"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const {
  createMemoryStorage, createMinimalDocument, quietConsole,
  loadScript, loadModelTab, run
} = require("./support/copdoc-vm-harness.js");

const BOOKIN_KEY = "alien-book-in.saved-records.v1";

function runtime(initial) {
  const storage = createMemoryStorage(initial);
  const tab = loadModelTab(storage, {
    console: quietConsole(), document: createMinimalDocument("bookin"),
    location: { href: "http://copdoc.test/bookin.html", pathname: "/bookin.html", search: "" }
  });
  loadScript(tab.context, "functions/book-in.js");
  run(tab.context, `
    __form = { firstName: 'TEST', lastName: 'BOOKING', foreignWarrants: 'no',
      dateTime: '2026-09-05T14:00', arrestTime: '13:00' };
    __fields = { lastName: { value: 'BOOKING', type: 'text' } };
    __statuses = []; __calls = []; __autosaves = 0;
    collectFormData = function () { return Object.assign({}, __form); };
    captureFormState = function () { return JSON.parse(JSON.stringify(__fields)); };
    setStatus = function (text, kind) { __statuses.push({ text: text, kind: kind }); };
    renderSavedRecords = function () {};
    requestAutoSave = function () { __autosaves += 1; };
    COPDoc.booking = {
      pendingBookingId: function () { return ''; },
      bookSubject: function (record, options) {
        __calls.push({record: record, options: options});
        return new Promise(function (resolve) { __finish = resolve; });
      }
    };
  `);
  return { ...tab, storage };
}

async function reservedIdentityAndFailure() {
  const { context, storage } = runtime();
  const promise = run(context, "saveCurrentRecord({ stay: true })");
  assert.strictEqual(context.__calls.length, 1);
  const reserved = run(context, "activeRecordId");
  assert.ok(reserved);
  assert.strictEqual(context.__calls[0].record.id, reserved);
  assert.strictEqual(await run(context, "saveCurrentRecord({ stay: true })"), false,
    "a second click must not start a concurrent booking");
  run(context, "startNewRecord()");
  assert.strictEqual(run(context, "activeRecordId"), reserved,
    "New must not abandon the form while a transaction owns it");
  assert.ok(!Object.hasOwn(context.__calls[0].options.formData, "arrestDateTime"),
    "Book-In time must not be supplied as the arrest timestamp");
  context.__finish({ ok: false, bookingId: reserved, error: "Injected packet failure" });
  assert.strictEqual(await promise, false);
  assert.strictEqual(storage.raw(BOOKIN_KEY), null, "UI must not write a packet outside the workflow");
  assert.strictEqual(run(context, "activeRecordId"), reserved);
  assert.strictEqual(context.__fields.lastName.value, "BOOKING");
  assert.ok(!context.__statuses.some(row => row.kind === "success"));
  const retry = run(context, "saveCurrentRecord({ stay: true })");
  assert.strictEqual(context.__calls[1].record.id, reserved, "retry keeps its reserved packet ID");
  context.__finish({ ok: false, bookingId: reserved, error: "Still pending" });
  assert.strictEqual(await retry, false);
}

async function draftsAndFiledAutosave() {
  const { context, storage } = runtime();
  assert.strictEqual(await run(context, "saveCurrentRecord({ quiet: true, stay: true })"), true);
  assert.strictEqual(context.__calls.length, 0, "an unfiled draft only writes the packet");
  const draft = storage.json(BOOKIN_KEY)[0];
  assert.strictEqual(draft.encounterProjectionDraft, true);
  draft.arrestId = "arrest_test";
  draft.encounterProjectionFiledAt = "2026-09-05T14:00:00Z";
  storage.setRaw(BOOKIN_KEY, [draft]);
  const filing = run(context, "saveCurrentRecord({ quiet: true, stay: true })");
  assert.strictEqual(context.__calls.length, 1, "filed autosave must use recoverable workflow");
  assert.strictEqual(context.__calls[0].options.expectedUpdatedAt, draft.updatedAt);
  const written = { ...context.__calls[0].record, updatedAt: "2026-09-05T14:02:00Z" };
  storage.setRaw(BOOKIN_KEY, [written]);
  context.__finish({ ok: true, record: written });
  assert.strictEqual(await filing, true);
  assert.strictEqual(run(context, "activeRecordBaseUpdatedAt"), written.updatedAt);
}

async function preserveEditsMadeDuringSave() {
  const { context } = runtime();
  const pending = run(context, "saveCurrentRecord({ stay: true })");
  context.__fields.lastName.value = "NEWER INPUT";
  const saved = { ...context.__calls[0].record, updatedAt: "2026-09-05T14:02:00Z" };
  context.__finish({ ok: true, record: saved });
  assert.strictEqual(await pending, true);
  assert.strictEqual(context.__fields.lastName.value, "NEWER INPUT");
  assert.notStrictEqual(run(context, "currentFormSignature()"), run(context, "lastSavedSignature"),
    "completion must not mark newer unsaved input as persisted");
  assert.strictEqual(context.__autosaves, 1);
}

async function strictWriteReadsAndStaleForm() {
  for (const malformed of ["broken JSON", "{}", '[{"id":"duplicate","formState":{}},{"id":"duplicate","formState":{}}]']) {
    const { context, storage } = runtime({ [BOOKIN_KEY]: malformed });
    assert.strictEqual(await run(context, "saveCurrentRecord({ quiet: true })"), false);
    assert.strictEqual(storage.raw(BOOKIN_KEY), malformed);
    assert.strictEqual(context.__calls.length, 0);
  }
  const packet = { id: "booking_stale", updatedAt: "new", formState: {} };
  const { context, storage } = runtime({ [BOOKIN_KEY]: [packet] });
  run(context, "activeRecordId = 'booking_stale'; activeRecordBaseUpdatedAt = 'old';");
  assert.strictEqual(await run(context, "saveCurrentRecord({ stay: true })"), false);
  assert.strictEqual(context.__calls.length, 0);
  assert.strictEqual(storage.json(BOOKIN_KEY)[0].updatedAt, "new");
}

async function pendingBookingBlocksQuietOverwrite() {
  const { context, storage } = runtime();
  run(context, `
    activeRecordId = 'booking_pending';
    COPDoc.booking.listTransactions = function () { return { ok: true, transactions: [
      { bookingId: 'booking_pending', transactionId: 'txn_pending', status: 'FAILED' }
    ] }; };
  `);
  assert.strictEqual(await run(context, "saveCurrentRecord({ quiet: true })"), false);
  assert.strictEqual(storage.raw(BOOKIN_KEY), null, "quiet input must not overwrite a pending recovery packet");
  assert.strictEqual(context.__calls.length, 0);
  assert.strictEqual(run(context, "activeRecordId"), "booking_pending");
}

async function inlineFailurePreservesDraft() {
  const { context, storage } = runtime({ [BOOKIN_KEY]: [{
    id: "booking_inline", updatedAt: "prior", formState: {}, firstName: "TEST", lastName: "BOOKING"
  }] });
  run(context, `inlineRecordEditState = {
    recordId: 'booking_inline', baseUpdatedAt: 'prior',
    draft: { firstName: 'TABLE', lastName: 'CHANGE', dateTime: '2026-09-05T14:00', arrestTime: '13:00' }
  };`);
  const pending = run(context, "saveInlineRecordEdit()");
  assert.strictEqual(context.__calls.length, 1);
  assert.strictEqual(context.__calls[0].options.expectedUpdatedAt, "prior");
  context.__finish({ ok: false, error: "Injected failure" });
  assert.strictEqual(await pending, false);
  assert.strictEqual(run(context, "inlineRecordEditState.draft.lastName"), "CHANGE");
  assert.strictEqual(storage.json(BOOKIN_KEY)[0].lastName, "BOOKING");
}

async function recoveryPanelResumesWithoutReplacingInput() {
  const { context } = runtime();
  const nodes = {};
  function element(tag) {
    return {
      tagName: tag, dataset: {}, children: [], listeners: {}, textContent: "",
      appendChild(child) { this.children.push(child); if (child.id) nodes[child.id] = child; return child; },
      append(...children) { children.forEach(child => this.appendChild(child)); },
      replaceChildren() { this.children = []; this.textContent = ""; },
      setAttribute() {},
      addEventListener(type, listener) { this.listeners[type] = listener; }
    };
  }
  const host = element("fieldset");
  context.document.querySelector = selector => selector === ".records-panel" ? host : null;
  context.document.getElementById = id => nodes[id] || null;
  context.document.createElement = element;
  run(context, `
    __receiptDone = false;
    activeRecordId = 'booking_recovery';
    COPDoc.booking.listTransactions = function () { return { ok: true, transactions: [
      { transactionId: 'txn_recovery', bookingId: 'booking_recovery', status: __receiptDone ? 'COMPLETED' : 'FAILED',
        request: { firstName: 'PII_MUST_NOT_RENDER' }, lastError: 'PRIVATE_FORM_CONTENT' }
    ] }; };
    COPDoc.booking.resume = function (id) {
      __resumeId = id;
      return new Promise(function (resolve) { __resumeFinish = resolve; });
    };
    renderBookingRecovery();
  `);
  const panel = nodes.bookingRecoveryPanel;
  function allText(node) { return (node.textContent || "") + node.children.map(allText).join(" "); }
  assert.ok(!allText(panel).includes("PII_MUST_NOT_RENDER"));
  assert.ok(!allText(panel).includes("PRIVATE_FORM_CONTENT"));
  const row = panel.children[1];
  const button = row.children[1];
  const pending = button.listeners.click();
  assert.strictEqual(button.disabled, true);
  assert.strictEqual(context.__resumeId, "txn_recovery");
  context.__fields.lastName.value = "UNSAVED MANUAL EDIT";
  context.__receiptDone = true;
  context.__resumeFinish({ ok: true, record: { id: "booking_recovery", updatedAt: "recovered", leadId: "lead_recovered" } });
  await pending;
  assert.strictEqual(context.__fields.lastName.value, "UNSAVED MANUAL EDIT");
  assert.strictEqual(run(context, "activeRecordBaseUpdatedAt"), "recovered");
  assert.ok(allText(panel).includes("1 completed booking receipt."));
  assert.ok(!allText(panel).includes("Resume booking"), "completed receipts stay compact");
}

async function navigationWaitsForSave() {
  const { context } = runtime();
  run(context, `
    __newCalls = 0;
    startNewRecord = function () { __newCalls += 1; };
    getValue = function (id) { return id === 'lastName' ? 'BOOKING' : ''; };
    saveCurrentRecord = function () { return new Promise(function (resolve) { __saveFinish = resolve; }); };
  `);
  const add = run(context, "addAnotherEncounterSubject()");
  assert.strictEqual(context.__newCalls, 0);
  context.__saveFinish(false);
  await add;
  assert.strictEqual(context.__newCalls, 0, "a failed filing must keep the current form");
  const oldHref = context.location.href;
  const baseball = run(context, "openBaseballCard()");
  assert.strictEqual(context.location.href, oldHref);
  context.__saveFinish(false);
  await baseball;
  assert.strictEqual(context.location.href, oldHref, "baseball handoff waits for a successful filing");
}

async function quickBookUsesWorkflow() {
  const source = fs.readFileSync(path.join(__dirname, "..", "functions/encounters.js"), "utf8");
  const start = source.indexOf("  async function saveBookToEncounter()");
  const end = source.indexOf("  function bindBookFloat()", start);
  assert.ok(start >= 0 && end > start);
  const subject = { subjectId: "subject_test", outcome: "ARRESTED", personId: "person_test" };
  const encounter = { encounterId: "enc_test", subjects: [subject] };
  const calls = [];
  const elements = { bookSubjectKey: { value: subject.subjectId }, confirmBookin: { disabled: false } };
  let finish;
  const context = {
    Promise, Date, JSON, String,
    quickBookingInProgress: false,
    byId: id => elements[id] || null,
    encounterSubjects: [subject],
    subjectKey: row => row.subjectId,
    subjectBookingId: row => row.bookingId || "",
    subjectRole: () => "TARGET", subjectOccupantRole: () => "",
    subjectLabel: () => "Synthetic subject",
    setStatus: () => {},
    readBookinRecords: () => ({ ok: true, records: [] }),
    saveDraftQuiet: () => true,
    collectEncounter: () => encounter,
    officerDisplayName: () => "",
    bookFormStateField: value => ({ value: String(value || ""), type: "text" }),
    closeBookFloat: () => { calls.push("close"); },
    hydrateEncounter: () => { calls.push("hydrate"); },
    model: () => ({ store: {
      loadFromDisk: () => calls.push("reload"), getEncounter: () => encounter
    } }),
    window: { COPDoc: { booking: {
      pendingBookingId: () => "booking_reserved",
      bookSubject: (record, options) => {
        calls.push({ record, options });
        return new Promise(resolve => { finish = resolve; });
      }
    } } }
  };
  context.COPDoc = context.window.COPDoc;
  vm.createContext(context);
  vm.runInContext(source.slice(start, end), context);
  const first = context.saveBookToEncounter();
  assert.strictEqual(calls[0].record.id, "booking_reserved");
  assert.ok(calls[0].options.promotionInput);
  assert.strictEqual(await context.saveBookToEncounter(), false);
  assert.strictEqual(elements.confirmBookin.disabled, true);
  finish({ ok: false, error: "Injected failure" });
  assert.strictEqual(await first, false);
  assert.ok(!calls.includes("close"), "failure keeps quick-book input visible");
  assert.strictEqual(elements.confirmBookin.disabled, false);
  const retry = context.saveBookToEncounter();
  assert.strictEqual(calls[1].record.id, "booking_reserved");
  finish({ ok: true, record: calls[1].record });
  assert.strictEqual(await retry, true);
  assert.deepStrictEqual(calls.slice(-3), ["reload", "close", "hydrate"]);
}

(async function main() {
  await reservedIdentityAndFailure();
  await draftsAndFiledAutosave();
  await preserveEditsMadeDuringSave();
  await strictWriteReadsAndStaleForm();
  await pendingBookingBlocksQuietOverwrite();
  await inlineFailurePreservesDraft();
  await recoveryPanelResumesWithoutReplacingInput();
  await navigationWaitsForSave();
  await quickBookUsesWorkflow();
  console.log("STAGE4_BOOKING_UI_PASSED reserved IDs, async saves, draft/filed routing, stale guards, form preservation, and quick-book retries.");
})().catch(error => { console.error(error); process.exitCode = 1; });
