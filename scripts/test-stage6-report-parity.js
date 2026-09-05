"use strict";

// Synthetic fixtures only. Exercise canonical report joins and production roster
// events, with the unmodified v1.12.0 builder as the presentation reference.
const assert = require("assert");
const fs = require("fs");
const vm = require("vm");
const path = require("path");
const { ROOT, createMemoryStorage, createTab, loadScript } = require("./support/copdoc-vm-harness");
const clone = value => JSON.parse(JSON.stringify(value));
const photo = "data:image/png;base64,AA==";
const baked = "data:image/png;base64,AQ==";

function documentDouble() {
  class Element {
    constructor(tag) { this.tagName = tag.toUpperCase(); this.children = []; this.attributes = {}; this.listeners = {}; this._text = ""; this._html = ""; this.value = ""; this.hidden = false; this.disabled = false; this.checked = false; this.style = {}; }
    set id(value) { this.attributes.id = value; } get id() { return this.attributes.id || ""; }
    set innerHTML(html) {
      this.children = []; this._text = ""; this._html = String(html);
      const stack = [this];
      const tokens = String(html).match(/<[^>]+>|[^<]+/g) || [];
      tokens.forEach(token => {
        if (token.startsWith("</")) { if (stack.length > 1) stack.pop(); return; }
        if (token.startsWith("<")) {
          const match = token.match(/^<([\w-]+)/); if (!match) return;
          const child = new Element(match[1]);
          const attrs = token.slice(match[0].length, -1);
          for (const match of attrs.matchAll(/([\w-]+)(?:="([^"]*)")?/g)) child.setAttribute(match[1], match[2] === undefined ? "" : match[2]);
          stack[stack.length - 1].appendChild(child);
          if (!["input", "br", "img", "hr"].includes(match[1]) && !token.endsWith("/>")) stack.push(child);
        } else if (token.trim()) { stack[stack.length - 1].appendChild({ textContent: token, children: [] }); }
      });
    }
    get innerHTML() { return this._html; }
    get textContent() { return this._text + this.children.map(child => child.textContent || "").join(""); }
    set textContent(value) { this._text = String(value); this.children = []; }
    setAttribute(key, value) { this.attributes[key] = String(value); if (key === "hidden") this.hidden = true; if (key === "value") this.value = String(value); }
    getAttribute(key) { return Object.prototype.hasOwnProperty.call(this.attributes, key) ? this.attributes[key] : null; }
    appendChild(child) { child.parent = this; this.children.push(child); return child; }
    append(...children) { children.forEach(child => this.appendChild(child)); }
    replaceChildren(...children) { this.children = []; this.append(...children); }
    remove() { if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this); }
    addEventListener(type, callback) { (this.listeners[type] ||= []).push(callback); }
    dispatch(type) { return Promise.all((this.listeners[type] || []).map(callback => callback({ target: this, preventDefault() {} }))); }
    select() {} focus() {}
    querySelectorAll(selector) {
      const output = [];
      const match = element => {
        if (!element.tagName) return false;
        if (selector.startsWith("#")) return element.id === selector.slice(1);
        const attr = selector.match(/^(\w+)?\[([^=\]]+)(?:="([^"]+)")?\]$/);
        if (attr) return (!attr[1] || element.tagName === attr[1].toUpperCase()) && element.getAttribute(attr[2]) !== null && (attr[3] === undefined || element.getAttribute(attr[2]) === attr[3]);
        return element.tagName === selector.toUpperCase();
      };
      const walk = element => (element.children || []).forEach(child => { if (match(child)) output.push(child); walk(child); });
      walk(this); return output;
    }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  }
  const body = new Element("body");
  return { body, createElement: tag => new Element(tag), createTextNode: value => ({ textContent: String(value), children: [] }), getElementById: id => body.querySelector("#" + id), createRange: () => ({ selectNodeContents() {} }), execCommand: () => false };
}
function setup() {
  const document = documentDouble();
  const storage = createMemoryStorage({ "copdocx.settings.v1": { retainedPreference: "untouched" } });
  const context = createTab(storage, { document });
  context.COPDoc = {};
  require("./support/document-ui-test-runtime").installDocumentRuntime(context);
  const messages = [];
  context.COPDoc.setAppBarStatus = message => messages.push(message);
  context.getSelection = () => ({ removeAllRanges() {}, addRange() {} });
  loadScript(context, "functions/baseball-card-contract.js");
  loadScript(context, "functions/arrest-report.js");
  return { context, document, storage, messages, api: context.COPDoc.arrestReport };
}
function dataFixture(t) {
  const people = {}, leads = {}, encounters = {}, packets = [];
  const definitions = [
    ["1", "Ada", "2026-09-05", "e1", "2026-09-05T12:00:00Z"],
    ["2", "Blake", "2026-09-05", "e1", "2026-09-05T13:00:00Z"],
    ["3", "Casey", "2026-09-06", "e2", "2026-09-06T12:00:00Z"],
    ["4", "Drew", "2026-09-05", "missing", ""],
    ["5", "Voided", "2026-09-05", "e1", ""]
  ];
  definitions.forEach(([id, firstName, date, encounterId, markedAt]) => {
    const personId = "p" + id, subjectId = "s" + id, bookingId = "b" + id;
    const arrest = { arrestId: "a" + id, subjectId, bookinRecordId: bookingId, encounterId, encounterNumber: encounterId === "e1" ? (id === "1" ? " E-1 " : "e-1") : "E-2", arrestDate: date, arrestDateTime: date + "T09:15", iceEventNumber: "EVENT-" + id };
    if (id === "5") arrest.voidedAt = "2026-09-05T14:00:00Z";
    const person = { personId, name: { firstName, lastName: "TEST" }, citizenship: "Mexico", age: id === "1" ? "10" : "2", immigration: { alienNumber: "00000000" + id, baseballCards: [] }, arrests: [arrest] };
    if (markedAt) {
      const state = t.context.COPDoc.baseball.normalizeState({ fields: { baseballFirstName: firstName, baseballLastName: "TEST", baseballArrestDate: date }, photoDataUrl: photo, content: { narrative: "FINAL " + id, heading: "Edited background", bullets: ["Kept manual bullet " + id] }, layout: { cardWidthPx: 880, photoWidthPercent: 40, photoHeightPx: 480, lineWidthPx: 3, contentFontSizePx: 15 }, photoAdjustments: { zoom: 1.7, rotation: 18, positionX: 20, positionY: 70, flipX: true, brightness: 120, contrast: 85 } });
      const card = t.context.COPDoc.baseball.toCanonical(state, { cardId: "card" + id, personId, subjectId, bookinRecordId: bookingId, encounterId, generatedAt: markedAt });
      card.finalizedSnapshot = t.context.COPDoc.baseball.finalize(state, { cardId: card.cardId, personId, subjectId, bookinRecordId: bookingId, encounterId, arrestId: arrest.arrestId, arrestDateKey: date, generatedAt: markedAt, displayName: firstName + " TEST" });
      card.arrestOfDay = { date, markedAt };
      card.content = { narrative: "UNFINALIZED EDIT " + id, heading: "Changed", bullets: [] };
      person.immigration.baseballCards.push(card);
    }
    people[personId] = person;
    leads["l" + id] = { leadId: "l" + id, person: clone(person), meta: { status: "committed", updatedAt: date + "T10:00:00Z" } };
    packets.push({ id: bookingId, personId, subjectId, leadId: "l" + id, encounterId, updatedAt: date + "T10:30:00Z" });
    if (encounterId !== "missing") {
      encounters[encounterId] ||= { encounterId, subjects: [] };
      encounters[encounterId].subjects.push({ personId, subjectId, bookingId });
    }
  });
  // A stale duplicate Case snapshot must neither duplicate an arrest nor overwrite canonical identity.
  leads.duplicate = clone(leads.l1); leads.duplicate.leadId = "duplicate"; leads.duplicate.person.name.firstName = "STALE";
  const store = { loadFromDisk() {}, listLeads: () => Object.values(leads).map(lead => ({ leadId: lead.leadId })), getLead: id => leads[id], getPerson: id => people[id], getEncounter: id => encounters[id], bookInPromotionInput: () => ({}) };
  t.context.COPDoc.model = { store, isCommitted: lead => lead.meta.status === "committed", subjectOf: lead => lead.person };
  store.listArrests = opts => t.api.collect(store, packets, opts);
  return { store, people, leads, encounters, packets };
}

function referenceReport(rows, columns, mode) {
  const context = { Intl, Date, Number, String, Set, Array, DAILY_REPORT_UNIT_LABEL: "DAL-3", getLocalDateKey: () => "2026-09-05", getBaseballCardSnapshotsForReport: () => [], getVisibleSavedRecordColumns: () => columns, generatedEmailReportHtml: "", generatedEmailReportPlainText: "" };
  const views = rows.map(row => ({ ...row, arrestDateKey: row.arrestDate }));
  context.buildDailyArrestSummary = () => ({ todayViews: views, alienCount: views.length, encounterCount: new Set(views.map(row => row.encounterNumber.trim().toUpperCase())).size, missingEncounterCount: 0, headline: "DAL-3 Arrested " + views.length + " aliens today in 1 encounter.", arrestOfDayLine: "The arrest of the day has not been selected." });
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "scripts/fixtures/stage6/report-reference-v1.12.0.js"), "utf8"), context);
  const result = context.buildSelectedRecordsReport(views, { mode, todayKey: "2026-09-05" });
  return { ...result, html: context.generatedEmailReportHtml, plainText: context.generatedEmailReportPlainText, formatDateTime: context.formatDateTime, formatSavedTimestamp: context.formatSavedTimestamp };
}

async function main() {
  const t = setup(), data = dataFixture(t), before = t.storage.dump();
  let rows = data.store.listArrests({});
  assert.strictEqual(rows.length, 4, "only deduplicated active canonical Arrests count");
  assert.ok(!rows.some(row => row.name.includes("STALE")));
  assert.strictEqual(rows.find(row => row.personId === "p4").encounterLinkValid, false, "displayed Encounter Number alone is not a real relationship");
  assert.strictEqual(t.api.uniqueEncounterCount(rows), 2, "same canonical Encounter is counted once despite display casing/spacing");
  assert.deepStrictEqual(t.storage.dump(), before, "collection performs no writes");
  assert.strictEqual(rows.filter(row => row.reportCard).length, 2, "one globally designated finalized card per date");
  assert.strictEqual(rows.find(row => row.personId === "p1").reportCard, null, "earlier designation loses");
  assert.strictEqual(t.api.build(data.store.listArrests({ bookinRecordIds: ["b1"] })).cardCount, 0, "selection must not revive an earlier daily designation");
  assert.strictEqual(t.api.build(data.store.listArrests({ leadId: "l1" })).cardCount, 0, "Case filter does not change global designation");
  const invalidCard = clone(data.people.p2.immigration.baseballCards[0]);
  invalidCard.finalizedSnapshot.recordId = "contradicts-booking";
  data.people.p2.immigration.baseballCards[0] = invalidCard;
  assert.strictEqual(data.store.listArrests({ bookinRecordIds: ["b2"] })[0].reportCard, null, "contradictory supplied snapshot IDs block inclusion");
  data.people.p2.immigration.baseballCards[0] = clone(data.leads.l2.person.immigration.baseballCards[0]);
  const saved = data.people.p1.immigration.baseballCards[0];
  const snapshot = saved.finalizedSnapshot; delete saved.finalizedSnapshot;
  assert.strictEqual(t.api.build(data.store.listArrests({ bookinRecordIds: ["b1"] })).cardCount, 0, "saved/legacy cards are not silently finalized");
  saved.finalizedSnapshot = snapshot;
  const transforms = [];
  t.context.COPDoc.baseball.renderPhoto = (state, source) => { transforms.push({ state, source }); return Promise.resolve(baked); };
  rows = await t.api.hydratePhotos(data.store.listArrests({}), null);
  const result = t.api.build(rows);
  assert.strictEqual(result.cardCount, 2);
  assert.strictEqual(result.missingEncounterCount, 1);
  assert.match(result.warnings[0], /valid Encounter link/);
  assert.ok(result.html.includes("FINAL 2") && result.html.includes("FINAL 3") && !result.html.includes("UNFINALIZED EDIT"));
  assert.ok(result.html.includes("max-width:880px") && result.html.includes("border:3px") && result.html.includes(baked), "snapshot layout and baked image survive report rendering");
  assert.ok(!result.html.includes("transform:") && !result.html.includes("filter:"), "email does not rely on client CSS photo transforms");
  assert.strictEqual(transforms.length, 2);
  assert.strictEqual(transforms[0].state.photoAdjustments.rotation, 18);
  assert.strictEqual(transforms[0].state.photoAdjustments.flipX, true);
  const daily = t.api.build(rows.filter(row => row.arrestDate === "2026-09-05"), { mode: "today" });
  assert.strictEqual(daily.summary, "The arrest of the day is Blake TEST.");
  const emptyColumns = t.api.build(rows, { columns: [] });
  assert.deepStrictEqual(Array.from(emptyColumns.visibleColumns), []);
  assert.ok(!emptyColumns.html.includes(">A-Number<"), "explicit zero columns cannot reveal default hidden fields");

  // Same known-good rows/columns must produce the latest standalone table and text exactly.
  const comparable = data.store.listArrests({ bookinRecordIds: ["b1", "b2"] }).map(row => ({ ...row, reportCard: null }));
  const ids = ["name", "age", "iceEvent", "arrestDateTime", "updatedAt"];
  const columns = ids.map(id => { const col = t.api.columns.find(c => c.id === id); return { key: id, tableLabel: col.label, reportLabel: col.reportLabel || col.label, value: row => t.api.columnValue(row, id) }; });
  ["selected", "today"].forEach(mode => {
    const expected = referenceReport(comparable, columns, mode);
    const actual = t.api.build(comparable, { mode, columns: ids });
    assert.strictEqual(actual.html, expected.html, mode + " HTML matches actual v1.12.0 builder");
    assert.strictEqual(actual.plainText, expected.plainText, mode + " plain text matches actual v1.12.0 builder");
    assert.strictEqual(t.api.columnValue(comparable[0], "arrestDateTime"), expected.formatDateTime(comparable[0].arrestDateTime), "arrest date display matches latest formatter");
    assert.strictEqual(t.api.columnValue(comparable[0], "updatedAt"), expected.formatSavedTimestamp(comparable[0].updatedAt), "last saved display matches latest formatter");
  });
  const sorted = t.api.sortRows([{ name: "Zulu", age: "2" }, { name: "Alpha", age: "10" }, { name: "Beta", age: "" }, { name: "Aaron", age: "2" }], "age", "asc");
  assert.deepStrictEqual(Array.from(sorted, row => row.name), ["Aaron", "Zulu", "Alpha", "Beta"]);
  assert.strictEqual(t.api.sortRows(sorted, "age", "desc").at(-1).name, "Beta", "empty values remain last descending too");
  const gifRow = clone(rows.find(row => row.reportCard));
  gifRow.reportCard.photoDataUrl = "data:image/gif;base64,AA==";
  gifRow.photoDataUrl = "";
  await t.api.hydratePhotos([gifRow], null);
  assert.strictEqual(transforms.at(-1).source, "data:image/gif;base64,AA==", "latest supported GIF source reaches crop baking");
  gifRow.reportCard.photoDataUrl = "";
  gifRow.reportCard.photoMediaId = "";
  await assert.rejects(t.api.hydratePhotos([gifRow], null), /photo is unavailable/, "missing finalized photo must not produce a blank card");
  t.context.COPDoc.baseball.renderPhoto = () => Promise.reject(new Error("canvas failed"));
  await assert.rejects(t.api.hydratePhotos(data.store.listArrests({}), null), /canvas failed/);
  await rosterEvents();
  console.log("Stage 6 report parity: canonical joins, daily snapshots, v1.12.0 HTML/text, roster and clipboard passed.");
}

async function rosterEvents() {
  const t = setup(), data = dataFixture(t);
  t.context.COPDoc.baseball.renderPhoto = () => Promise.resolve(baked);
  loadScript(t.context, "functions/arrest-roster.js");
  const host = t.document.createElement("div"); t.document.body.appendChild(host);
  const roster = t.context.COPDoc.arrestRoster.mount(host, { defaultToday: true });
  const from = host.querySelector("#arrestRosterFrom"), to = host.querySelector("#arrestRosterTo");
  assert.ok(from && to && from.value && from.value === to.value, "Admin defaults today while permitting other dates");
  from.value = "2026-09-05"; to.value = "2026-09-05"; await from.dispatch("change");
  await host.querySelector("[data-arrest-select]").dispatch("click");
  from.value = "2026-09-06"; to.value = "2026-09-06"; await from.dispatch("change");
  await host.querySelector("[data-arrest-select]").dispatch("click");
  assert.match(host.querySelector("[data-arrest-selected]").textContent, /4 selected \(3 hidden/);
  const columns = host.querySelectorAll("input[data-col]");
  for (const box of columns.slice(1)) { box.checked = false; await box.dispatch("change"); }
  assert.strictEqual(columns[0].disabled, true, "last column disabled");
  columns[0].checked = false; await columns[0].dispatch("change");
  assert.strictEqual(columns[0].checked, true, "programmatic attempt to hide last column also blocked");
  const settings = t.storage.json("copdocx.settings.v1");
  assert.strictEqual(settings.retainedPreference, "untouched");
  assert.deepStrictEqual(settings.arrestReportRoster.visibleColumns, ["name"]);
  const search = host.querySelector("#arrestRosterSearch");
  search.value = "Casey"; await search.dispatch("input");
  await host.querySelector("[data-arrest-head]").querySelector("button").dispatch("click");
  const table = host.querySelector("[data-arrest-body]");
  const chosenCount = host.querySelector("[data-arrest-selected]").textContent;
  const beforeLiveWrites = t.storage.writeCount();
  data.people.p3.name.lastName = "LIVE";
  t.context._dispatchWindowEvent("storage", { key: "copdocx.store.v1" });
  assert.ok(table.textContent.includes("Casey LIVE"), "workspace storage event refreshes displayed canonical identity");
  assert.strictEqual(search.value, "Casey");
  assert.strictEqual(from.value, "2026-09-06"); assert.strictEqual(to.value, "2026-09-06");
  assert.strictEqual(host.querySelector("[data-arrest-selected]").textContent, chosenCount, "cross-filter selection remains selected");
  assert.strictEqual(host.querySelectorAll("input[data-col]").filter(box => box.checked).length, 1, "live update preserves hidden columns");
  assert.strictEqual(host.querySelector("th[aria-sort]").getAttribute("aria-sort"), "ascending", "live update preserves the chosen sort");
  const lastSaved = columns.find(box => box.getAttribute("data-col") === "updatedAt");
  lastSaved.checked = true; await lastSaved.dispatch("change");
  data.packets.find(packet => packet.id === "b3").updatedAt = "2026-09-07T08:30:00Z";
  t.context._dispatchWindowEvent("storage", { key: "alien-book-in.saved-records.v1" });
  assert.ok(table.textContent.includes("09/07/2026"), "Book-In storage event refreshes Last Saved");
  lastSaved.checked = false; await lastSaved.dispatch("change");
  data.people.p3.name.lastName = "RECOVERED";
  t.context._dispatchWindowEvent("copdocx-import-recovered", {});
  assert.ok(table.textContent.includes("Casey RECOVERED"), "same-window import recovery refreshes roster");
  assert.strictEqual(search.value, "Casey");
  assert.strictEqual(host.querySelector("[data-arrest-selected]").textContent, chosenCount);
  // Only explicit column toggles write preferences; the data notifications do not.
  assert.strictEqual(t.storage.writeCount(), beforeLiveWrites + 2);
  const report = await roster.generate();
  assert.strictEqual(report.arrestCount, 4, "selected rows across filters all included");
  assert.deepStrictEqual(Array.from(report.visibleColumns), ["name"]);
  assert.ok(!report.html.includes(">A-Number<") && report.html.includes(">Name<"));
  const host2 = t.document.createElement("div"); t.document.body.appendChild(host2);
  t.context.COPDoc.arrestRoster.mount(host2, { showGenerate: false, showSelection: false });
  assert.strictEqual(host2.querySelectorAll("input[data-col]").filter(box => box.checked).length, 1, "column visibility survives remount");
  const clipboardWrites = [];
  t.context.isSecureContext = true;
  t.context.ClipboardItem = class { constructor(data) { this.data = data; } };
  t.context.navigator.clipboard = { write: async entries => clipboardWrites.push(entries[0].data) };
  assert.strictEqual(await t.context.COPDoc.arrestRoster.copyReport(), true);
  assert.strictEqual(await clipboardWrites[0]["text/plain"].text(), report.plainText, "clipboard uses generated text, not DOM innerText");
  assert.strictEqual(await clipboardWrites[0]["text/html"].text(), report.html);
  let fallbackText = "";
  t.context.navigator.clipboard = { write: () => Promise.reject(new Error("denied")), writeText: async value => { fallbackText = value; } };
  assert.strictEqual(await t.context.COPDoc.arrestRoster.copyReport(), true);
  assert.strictEqual(fallbackText, report.plainText);
  assert.match(t.document.getElementById("arrestReportCopyStatus").textContent, /plain text/);
  t.context.navigator.clipboard.writeText = () => Promise.reject(new Error("denied"));
  assert.strictEqual(await t.context.COPDoc.arrestRoster.copyReport(), false);
  assert.match(t.document.getElementById("arrestReportCopyStatus").textContent, /Copy failed/);
  t.context.navigator.clipboard.write = () => { throw new Error("synchronous security failure"); };
  t.context.navigator.clipboard.writeText = () => { throw new Error("synchronous text security failure"); };
  assert.strictEqual(await t.context.COPDoc.arrestRoster.copyReport(), false, "synchronous clipboard failures also reach visible fallback status");
  t.context.COPDoc.baseball.renderPhoto = () => Promise.reject(new Error("missing photo"));
  assert.strictEqual(await roster.generate(), null, "failed crop baking cannot silently produce a different image");
  assert.match(t.messages.at(-1), /missing photo/);
  assert.ok(data.store.listArrests({}).length === 4);
  roster.destroy();
  const detachedText = table.textContent;
  data.people.p3.name.lastName = "AFTER_DESTROY";
  t.context._dispatchWindowEvent("storage", { key: "copdocx.store.v1" });
  assert.strictEqual(table.textContent, detachedText, "unmounted roster subscription is removed");
}
if (require.main === module) main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
module.exports = { setup, dataFixture, rosterEvents };
