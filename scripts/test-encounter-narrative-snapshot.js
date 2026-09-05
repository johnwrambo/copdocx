"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { ROOT, createMemoryStorage, createMinimalDocument, loadModelTab, quietConsole } = require("./support/copdoc-vm-harness.js");

const WORKSPACE_KEY = "copdocx.store.v1";
function plain(value) { return JSON.parse(JSON.stringify(value)); }
function ok(result) { assert.ok(result && result.ok, result && result.error); return result; }
function narrative(text, revision) {
  return {
    narrativeId: "nar_snapshot", encounterId: "enc_snapshot", narrativeKind: "PRIMARY_SUBJECT",
    focusEncounterParticipantId: "subject_snapshot", workflowStatus: "DRAFT", revision,
    title: "Saved primary narrative", updatedAt: "2026-09-05T10:00:00.000Z",
    output: { finalPlainText: text, generatedResolvedText: "Generated text remains distinct", plainTextIsManual: true, sections: [] },
    engine: { state: { narrative: { manualText: text }, template: "saved template" } },
    sourceSnapshot: { fingerprint: "source-v" + revision, facts: { outcome: "RELEASED" } }
  };
}
function setup() {
  const storage = createMemoryStorage();
  const tab = loadModelTab(storage, { console: quietConsole() });
  const model = tab.model;
  model.store.loadFromDisk();
  ok(model.store.upsertPerson(model.createPerson({ personId: "person_snapshot", name: { firstName: "Test", lastName: "Snapshot" } })));
  ok(model.store.saveEncounter(model.createEncounterRecord({
    encounterId: "enc_snapshot", startedAt: "2026-09-05T09:00",
    subjects: [{ subjectId: "subject_snapshot", personId: "person_snapshot", outcome: "RELEASED", subjectRole: "TARGET" }]
  }), { mode: "draft" }));
  return Object.assign(tab, { storage });
}

// Save captures the working narrative; only reviewed close creates its frozen
// completion copy, and later corrections preserve the prior exact prose.
{
  const { model, storage } = setup();
  const savedNarrative = narrative("Exact manually edited narrative.\nSecond paragraph.", 1);
  ok(model.store.updateEncounter("enc_snapshot", enc => { enc.narratives = [savedNarrative]; return enc; }));
  let enc = model.store.getEncounter("enc_snapshot");
  assert.ok(!enc.completed, "ordinary Narrative Save must not commit a completion snapshot");
  assert.strictEqual(enc.meta.markedComplete, false);
  ok(model.store.completeEncounter("enc_snapshot"));
  enc = model.store.getEncounter("enc_snapshot");
  assert.deepStrictEqual(plain(enc.completed.narratives), [savedNarrative], "close preserves exact prose, engine state, source facts and identity");
  assert.strictEqual(enc.narratives[0].workflowStatus, "DRAFT", "Encounter close does not alter separate Narrative finalization semantics");
  const firstSnapshot = plain(enc.completed);
  enc.completed.narratives[0].output.finalPlainText = "caller mutation";
  assert.deepStrictEqual(plain(model.store.getEncounter("enc_snapshot").completed), firstSnapshot, "returned snapshots are detached");
  const rejected = model.store.updateEncounter("enc_snapshot", row => { row.narratives[0].output.finalPlainText = "locked write"; return row; });
  assert.strictEqual(rejected.ok, false);
  assert.strictEqual(rejected.code, "ENCOUNTER_LOCKED");
  ok(model.store.unlockEncounter("enc_snapshot", { reason: "Correct reviewed prose" }));
  const revisedNarrative = narrative("Reviewed correction, still a working snapshot.", 2);
  ok(model.store.updateEncounter("enc_snapshot", row => { row.narratives = [revisedNarrative]; return row; }));
  enc = model.store.getEncounter("enc_snapshot");
  assert.deepStrictEqual(plain(enc.completed), firstSnapshot, "editing after unlock leaves the published copy unchanged");
  ok(model.store.completeEncounter("enc_snapshot"));
  const reopened = loadModelTab(storage, { console: quietConsole() }).model;
  reopened.store.loadFromDisk();
  enc = reopened.store.getEncounter("enc_snapshot");
  assert.deepStrictEqual(plain(enc.completed.narratives), [revisedNarrative]);
  assert.deepStrictEqual(plain(enc.completedHistory[0].snapshot), firstSnapshot);
  assert.strictEqual(enc.completedHistory[0].reason, "Correct reviewed prose");
}

// A failed close cannot claim a committed narrative in memory or on disk.
{
  const { model, storage } = setup();
  ok(model.store.updateEncounter("enc_snapshot", enc => { enc.narratives = [narrative("Still a draft", 1)]; return enc; }));
  const before = storage.raw(WORKSPACE_KEY);
  storage.failNext(WORKSPACE_KEY);
  assert.strictEqual(model.store.completeEncounter("enc_snapshot").ok, false);
  assert.strictEqual(storage.raw(WORKSPACE_KEY), before);
  assert.ok(!model.store.getEncounter("enc_snapshot").completed);
  assert.strictEqual(model.store.getEncounter("enc_snapshot").meta.markedComplete, false);
}

// A review opened before another window saves a new narrative cannot commit
// the old prose over the newer revision.
{
  const { model, storage } = setup();
  ok(model.store.updateEncounter("enc_snapshot", enc => { enc.narratives = [narrative("Old review", 1)]; return enc; }));
  const oldReview = model.store.getEncounter("enc_snapshot");
  const other = loadModelTab(storage, { console: quietConsole() }).model;
  other.store.loadFromDisk();
  ok(other.store.updateEncounter("enc_snapshot", enc => { enc.narratives = [narrative("Latest saved prose", 2)]; return enc; }));
  const conflict = model.store.saveEncounter(oldReview, { mode: "complete" });
  assert.strictEqual(conflict.ok, false);
  assert.strictEqual(conflict.code, "ENCOUNTER_STALE_WRITE");
  assert.ok(!model.store.getEncounter("enc_snapshot").completed);
  ok(model.store.completeEncounter("enc_snapshot"));
  assert.strictEqual(model.store.getEncounter("enc_snapshot").completed.narratives[0].output.finalPlainText, "Latest saved prose");
}

// Exercise the actual Encounter controller with DOM doubles, including
// explicit tab routing and saved-text presentation (never HTML execution).
{
  const document = createMinimalDocument("encounter-form");
  function element(tag) {
    return { tagName: tag, textContent: "", className: "", style: {}, childNodes: [],
      replaceChildren() { this.childNodes.length = 0; }, appendChild(child) { this.childNodes.push(child); return child; } };
  }
  const ids = { reviewNarratives: element("div"), reviewNarrativeStatus: element("p") };
  document.getElementById = id => ids[id] || null;
  document.createElement = element;
  const { context } = loadModelTab(createMemoryStorage(), { document, console: quietConsole() });
  require("./support/module-dependencies.js").loadDependencies(context, "functions/encounters.js");
  let source = fs.readFileSync(path.join(ROOT, "functions/encounters.js"), "utf8");
  const end = source.lastIndexOf("})();");
  assert.ok(end >= 0);
  source = source.slice(0, end) + "\nshowEncounterTab = function (id) { window.__openedTab = id; }; window.__review = { route: openRequestedEncounterTab, paint: paintReviewNarratives };\n" + source.slice(end);
  vm.runInContext(source, context, { filename: "functions/encounters.js" });
  ["evidence", "review"].forEach(tab => {
    context.location.search = "?id=enc_snapshot&tab=" + tab;
    context.__review.route();
    assert.strictEqual(context.__openedTab, "tab-" + tab);
  });
  context.__openedTab = "unchanged";
  context.location.search = "?id=enc_snapshot&tab=untrusted";
  context.__review.route();
  assert.strictEqual(context.__openedTab, "unchanged");
  const saved = narrative("<script>not executable</script>\nSaved manual text", 1);
  context.__review.paint({ meta: { markedComplete: false }, narratives: [saved] });
  assert.strictEqual(ids.reviewNarratives.childNodes[0].childNodes[1].textContent, saved.output.finalPlainText);
  assert.match(ids.reviewNarrativeStatus.textContent, /Confirm and close commits these exact copies/);
  context.__review.paint({ meta: { markedComplete: true }, completed: { narratives: [saved] }, narratives: [narrative("Different working text", 2)] });
  assert.strictEqual(ids.reviewNarratives.childNodes[0].childNodes[1].textContent, saved.output.finalPlainText);
  assert.match(ids.reviewNarrativeStatus.textContent, /committed when/);
  context.__review.paint({ meta: { markedComplete: false }, narratives: [] });
  assert.match(ids.reviewNarratives.childNodes[0].textContent, /No narrative snapshot saved/);
}

console.log("Encounter narrative snapshots: save/close/history, quota failure, stale review, navigation and review output passed.");
