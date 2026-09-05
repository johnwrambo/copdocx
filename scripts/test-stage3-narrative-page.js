"use strict";

const assert = require("assert");
const {
  createMemoryStorage, quietConsole, loadModelTab, loadScript
} = require("./support/copdoc-vm-harness.js");

const WORKSPACE_KEY = "copdocx.store.v1";
const ENCOUNTER_ID = "enc_stage3_page";
const SUBJECT_ID = "sub_stage3_target";
const OTHER_ID = "sub_stage3_collateral";
const clone = (value) => JSON.parse(JSON.stringify(value));

// Exercise the real page controller, domain, source comparer, packet builder,
// adapter, and persistent model. Only browser DOM and the text editor are
// doubled: this suite checks lifecycle behavior, not editor rendering.
function documentDouble() {
  const elements = new Map();
  const listeners = {};
  function element(tag) {
    const value = {
      tagName: String(tag).toUpperCase(), children: [], dataset: {}, listeners: {},
      hidden: false, disabled: false, textContent: "", attributes: {},
      classList: { add() {}, remove() {}, toggle() {} },
      setAttribute(name, text) { this.attributes[name] = text; },
      getAttribute(name) { return this.attributes[name] || null; },
      append(...children) { children.forEach((child) => this.appendChild(child)); },
      appendChild(child) { this.children.push(child); child.parentNode = this; return child; },
      insertBefore(child, sibling) {
        const index = this.children.indexOf(sibling);
        this.children.splice(index < 0 ? this.children.length : index, 0, child);
        child.parentNode = this;
      },
      replaceChildren(...children) { this.children = []; this.append(...children); },
      addEventListener(type, handler) {
        this.listeners[type] = this.listeners[type] || [];
        this.listeners[type].push(handler);
      },
      click() { if (!this.disabled) (this.listeners.click || []).forEach((fn) => fn({})); },
      querySelector() { return null; },
      querySelectorAll(selector) {
        if (selector !== "input, select, textarea, button, [contenteditable]") return [];
        const descendants = [];
        function visit(node) {
          node.children.forEach((child) => {
            if (/^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(child.tagName) ||
                child.getAttribute("contenteditable") != null) descendants.push(child);
            visit(child);
          });
        }
        visit(this);
        return descendants;
      },
      remove() { elements.delete(this.id); }
    };
    Object.defineProperty(value, "id", {
      get() { return this._id || ""; },
      set(id) { this._id = id; elements.set(id, this); }
    });
    return value;
  }
  const body = element("body");
  const doc = {
    body, readyState: "complete", hidden: false,
    createElement: element,
    getElementById(id) { return elements.get(id) || null; },
    querySelector() { return null; }, querySelectorAll() { return []; },
    addEventListener(type, fn) { listeners[type] = (listeners[type] || []).concat(fn); },
    dispatch(type) { (listeners[type] || []).forEach((fn) => fn({})); },
    add(id, tag = "div") { const node = element(tag); node.id = id; body.append(node); return node; }
  };
  ["narrativeEngineHost", "narrativeWorkspace", "participantNarratives", "coverageBadge",
    "coverageDetails", "sectionAudit", "outputJson", "activeNarrativeTitle",
    "supervisorSummaryText", "completeMissingNarrativeButton", "appBarPrimaryAction", "copyNarrativeButton",
    "narrativeBackToEvidenceButton", "narrativeContinueToReviewButton"
  ].forEach((id) => doc.add(id));
  [["testSelection", "select"], ["resolvedDraft", "textarea"], ["narrativeDraft", "div"],
    ["rebuildButton", "button"], ["copyButton", "button"], ["valuesViewButton", "button"]
  ].forEach(([id, tag]) => {
    const control = element(tag);
    control.id = id;
    control.readOnly = false;
    if (id === "narrativeDraft") control.setAttribute("contenteditable", "true");
    doc.getElementById("narrativeEngineHost").append(control);
  });
  return doc;
}

function editorDouble() {
  let packet = null;
  let state;
  function reset() {
    state = {
      schema: "copdoc.narrative-state.v3",
      template: { sections: [] }, encounter: { selections: {}, times: {} }, narrative: {}
    };
  }
  reset();
  function generated() {
    const person = packet && packet.objects.find((row) => row.metadata && row.metadata.focus);
    return person ? person.fields.full_name + " · " + person.fields.outcome_code : "";
  }
  return {
    version: "test", build: 9, schemas: { state: "copdoc.narrative-state.v3" },
    events: { narrativeChange: "opdoc:narrative-change" },
    resetEncounter() { reset(); packet = null; },
    setDataPacket(value) { packet = clone(value); },
    getDataPacket() { return clone(packet); },
    getState() { return clone(state); },
    loadState(value) { state = clone(value); },
    setSelections(value) { Object.assign(state.encounter.selections, value); },
    setView() {},
    setManualText(text) {
      state.narrative.plainText = text;
      state.narrative.plainTextIsManual = true;
    },
    setSelection(field, value) { state.encounter.selections[field] = value; },
    getOutput() {
      const text = generated();
      const manual = !!state.narrative.plainTextIsManual;
      return {
        schema: "copdoc.narrative-output.v3",
        sections: [{ sectionId: "test", sequence: 1, title: "Test", resolvedText: text }],
        generatedResolvedText: text,
        plainText: manual ? state.narrative.plainText : text,
        finalPlainText: manual ? state.narrative.plainText : text,
        plainTextIsManual: manual, bindings: [], factsManifest: {}, validation: { valid: true }
      };
    }
  };
}

function boot(options = {}) {
  const storage = createMemoryStorage();
  const document = documentDouble();
  const { context, model } = loadModelTab(storage, { document, console: quietConsole() });
  context.requestAnimationFrame = (fn) => fn();
  context.COUNTRIES = [];
  context.IMMIGRATION_DISPOSITIONS = [];
  ["functions/narratives/build9/narrative-domain.js",
    "functions/narratives/build9/narrative-coverage.js",
    "functions/narratives/build9/encounter-summary.js",
    "functions/narratives/build9/index.js", "functions/narratives/packet-builder.js",
    "functions/encounter-narrative.js", "functions/narratives/source-freshness.js"
  ].forEach((file) => loadScript(context, file));
  const domain = context.COPDoc.narratives.build9;
  const source = context.COPDoc.narrativeSource;
  const encounter = model.createEncounterRecord({
    encounterId: ENCOUNTER_ID, startedAt: "2026-09-05T10:00", eventType: "KNOCK_AND_TALK"
  });
  encounter.subjects = [
    model.createEncounterSubject({
      subjectId: SUBJECT_ID, encounterId: ENCOUNTER_ID, role: "TARGET", outcome: "ARRESTED",
      firstName: "ONE", lastName: "SAME", useOfForce: "no", compliance: "COMPLIANT"
    }),
    model.createEncounterSubject({
      subjectId: OTHER_ID, encounterId: ENCOUNTER_ID, role: "COLLATERAL", outcome: "RELEASED",
      firstName: "TWO", lastName: "SAME", useOfForce: "yes", forceLevel: "HARD"
    })
  ];
  assert.equal(model.store.saveEncounter(encounter, { mode: "draft" }).ok, true);
  const adapter = context.COPDoc.encounterNarrative;
  if (options.patchBundle) {
    const originalBundle = adapter.bundleFromEncounter;
    const originalRecord = adapter.bundleFromEncounterRecord;
    adapter.bundleFromEncounter = function (id) {
      return options.patchBundle(originalBundle(id));
    };
    adapter.bundleFromEncounterRecord = function (record) {
      return options.patchBundle(originalRecord(record));
    };
  }
  function bundle() { return adapter.bundleFromEncounter(ENCOUNTER_ID); }
  function update(fn) {
    const result = model.store.updateEncounter(ENCOUNTER_ID, fn);
    assert.equal(result.ok, true, result.error);
  }
  function rawEdit(fn) {
    const workspace = storage.json(WORKSPACE_KEY);
    fn(workspace.encounters[ENCOUNTER_ID]);
    storage.setRaw(WORKSPACE_KEY, workspace);
  }
  const engine = editorDouble();
  if (options.existing) {
    const initial = domain.createNarrativeRecord({
      narrativeId: "nar_existing", encounterId: ENCOUNTER_ID,
      narrativeKind: "PRIMARY_SUBJECT", focusEncounterParticipantId: SUBJECT_ID,
      sourceSnapshot: options.legacy ? { encounterId: ENCOUNTER_ID } : source.capture(bundle(), SUBJECT_ID),
      freshnessStatus: "CURRENT", workflowStatus: options.finalized ? "FINALIZED" : "DRAFT",
      engine: { state: engine.getState() },
      output: {
        sections: [{ sectionId: "initial", resolvedText: "Original generated narrative" }],
        finalPlainText: "Existing manual narrative", plainTextIsManual: true
      }
    });
    initial.engine.state.narrative = { plainTextIsManual: true, plainText: "Existing manual narrative" };
    update((row) => { row.narratives = [initial]; return row; });
  }
  if (options.locked) rawEdit((row) => { row.meta.markedComplete = true; });
  let status = "";
  const copied = [];
  context.navigator.clipboard = { writeText(text) { copied.push(text); return Promise.resolve(); } };
  context.COPDoc.setAppBarStatus = (message) => { status = message; };
  context.COPDoc.narratives.ENGINE_MARKUP = "";
  context.COPDoc.narratives.MASTER_NARRATIVE_SECTIONS = [];
  context.__opdocNarrativeBootstrap = () => engine;
  loadScript(context, "functions/narratives/narrative-page.js");
  context.COPDoc.narratives.bootWorkspace({ encounterId: ENCOUNTER_ID });
  return {
    storage, context, model, domain, source, document, engine, update, rawEdit, bundle, copied,
    status: () => status,
    click(id) { const node = document.getElementById(id); assert.ok(node, id); node.click(); },
    save() { document.getElementById("appBarPrimaryAction").click(); },
    narrative(id = SUBJECT_ID) {
      model.store.loadFromDisk();
      return model.store.getEncounter(ENCOUNTER_ID).narratives.find((row) => row.focusEncounterParticipantId === id);
    },
    switchSubject(id) {
      const button = document.getElementById("participantNarratives").children.find((row) => row.dataset.participantId === id);
      assert.ok(button, id); button.click();
    },
    windowEvent(type) { context._dispatchWindowEvent(type, {}); },
    sourceText() { return document.getElementById("narrativeSourceStatusText").textContent; }
  };
}

function testCaptureAndStaleSave() {
  const app = boot();
  assert.equal(app.engine.getState().encounter.selections.enforcement_action, undefined,
    "ARRESTED alone cannot seed warrantless authority");
  assert.equal(app.engine.getState().encounter.selections.final_outcome, undefined,
    "ARRESTED alone cannot invent transport to the ICE office");
  app.engine.setManualText("Officer's working manual text");
  app.save();
  const original = clone(app.narrative());
  assert.equal(original.freshnessStatus, "CURRENT");
  assert.equal(original.sourceSnapshot.schema, "copdocx.narrative-source.v1");
  app.save();
  assert.equal(app.narrative().freshnessStatus, "CURRENT", "narrative-only save cannot stale itself");
  app.update((row) => { row.subjects[0].outcome = "FLED"; row.subjects[0].flightMode = "FOOT"; return row; });
  const beforeWarning = app.storage.raw(WORKSPACE_KEY);
  app.windowEvent("storage");
  assert.match(app.sourceText(), /Source facts changed/);
  assert.equal(app.storage.raw(WORKSPACE_KEY), beforeWarning, "freshness warning must be read-only");
  assert.equal(app.engine.getOutput().plainText, "Officer's working manual text");
  assert.equal(app.engine.getDataPacket().objects.find((row) => row.metadata && row.metadata.focus).fields.outcome_code,
    "ARRESTED", "a storage notification must not replace the working packet");
  app.save();
  const stale = app.narrative();
  assert.equal(stale.freshnessStatus, "STALE");
  assert.deepEqual(stale.sourceSnapshot, original.sourceSnapshot, "stale saves retain the source actually used");
  assert.equal(stale.output.finalPlainText, "Officer's working manual text");
  assert.equal(app.document.getElementById("reviewNarrativeSourceButton").disabled, true);
  app.click("refreshNarrativeSourceButton");
  assert.equal(app.engine.getState().encounter.selections.flight, "fled_on_foot");
  assert.equal(app.engine.getOutput().plainText, "Officer's working manual text", "refresh preserves manual prose");
  assert.equal(app.narrative().freshnessStatus, "STALE", "refresh is not acceptance");
  app.click("reviewNarrativeSourceButton");
  assert.equal(app.narrative().freshnessStatus, "CURRENT");
  assert.equal(app.narrative().output.finalPlainText, "Officer's working manual text");
  assert.notEqual(app.narrative().sourceSnapshot.fingerprint, original.sourceSnapshot.fingerprint);
}

function testReviewRaceAndLegacy() {
  const app = boot({ existing: true, legacy: true });
  assert.match(app.sourceText(), /Source not verified/);
  app.save();
  assert.equal(app.narrative().freshnessStatus, "UNKNOWN", "legacy save cannot fabricate source review");
  app.click("refreshNarrativeSourceButton");
  app.update((row) => { row.subjects[0].compliance = "NONCOMPLIANT"; return row; });
  app.click("reviewNarrativeSourceButton");
  assert.match(app.status(), /changed again/);
  assert.equal(app.narrative().freshnessStatus, "UNKNOWN");
  app.click("refreshNarrativeSourceButton");
  app.click("reviewNarrativeSourceButton");
  assert.equal(app.narrative().freshnessStatus, "CURRENT");
  assert.equal(app.narrative().output.finalPlainText, "Existing manual narrative");

  // A last-moment source write after the UI check must also stay stale at the
  // real persistence boundary, without certifying a packet never displayed.
  app.click("refreshNarrativeSourceButton");
  const updateEncounter = app.model.store.updateEncounter;
  let once = true;
  app.model.store.updateEncounter = function (id, updater, opts) {
    if (once) {
      once = false;
      app.rawEdit((row) => { row.subjects[0].compliance = "COMPLIANT"; });
    }
    return updateEncounter(id, updater, opts);
  };
  app.click("reviewNarrativeSourceButton");
  assert.equal(app.narrative().freshnessStatus, "STALE");
  assert.match(app.status(), /changed again/);
}

function testRevisionFailureAndSwitch() {
  const app = boot();
  app.save();
  const saved = app.narrative();
  app.engine.setManualText("Switch should save this edit");
  app.switchSubject(OTHER_ID);
  assert.equal(app.narrative().output.finalPlainText, "Switch should save this edit");
  assert.equal(app.narrative(OTHER_ID), undefined, "switching does not create missing primary narratives");
  app.switchSubject(SUBJECT_ID);
  app.update((row) => {
    row.narratives = app.domain.saveNarrativeById(row.narratives, saved.narrativeId,
      { title: "Changed in another tab" }, { expectedRevision: row.narratives[0].revision }).narratives;
    return row;
  });
  app.engine.setManualText("Stale tab edit");
  app.save();
  assert.match(app.status(), /changed in another window/);
  assert.notEqual(app.narrative().output.finalPlainText, "Stale tab edit");
  assert.equal(app.engine.getOutput().plainText, "Stale tab edit", "conflict preserves editor draft");

  const failing = boot();
  failing.storage.failNext(WORKSPACE_KEY);
  failing.save();
  assert.equal(failing.narrative(), undefined, "failed first write must not leave a stored phantom");
  failing.save();
  assert.ok(failing.narrative(), "retry creates the narrative after in-memory rollback");
}

function testFinalizedAndLocked() {
  const app = boot({ existing: true, finalized: true });
  const finalized = clone(app.narrative());
  app.update((row) => { row.subjects[0].outcome = "RELEASED"; return row; });
  app.windowEvent("focus");
  assert.match(app.sourceText(), /Finalized narrative.*source facts changed/);
  assert.equal(app.document.getElementById("refreshNarrativeSourceButton").disabled, true);
  assert.equal(app.document.getElementById("reviewNarrativeSourceButton").disabled, true);
  assert.equal(app.document.getElementById("testSelection").disabled, true);
  assert.equal(app.document.getElementById("rebuildButton").disabled, true);
  assert.equal(app.document.getElementById("resolvedDraft").readOnly, true);
  assert.equal(app.document.getElementById("narrativeDraft").getAttribute("contenteditable"), "false");
  assert.equal(app.document.getElementById("copyButton").disabled, false);
  assert.equal(app.document.getElementById("valuesViewButton").disabled, false);
  app.click("copyNarrativeButton");
  assert.equal(app.copied[0], finalized.output.finalPlainText, "readonly Copy uses saved prose");
  app.save();
  app.context.COPDoc.narratives.flushWorkspace();
  assert.deepEqual(app.narrative(), finalized, "finalized content, revision and source snapshot are immutable");
  app.switchSubject(OTHER_ID);
  assert.equal(app.document.getElementById("testSelection").disabled, false);
  assert.equal(app.document.getElementById("rebuildButton").disabled, false);
  assert.equal(app.document.getElementById("resolvedDraft").readOnly, false);
  assert.equal(app.document.getElementById("narrativeDraft").getAttribute("contenteditable"), "true");
  app.switchSubject(SUBJECT_ID);
  assert.equal(app.engine.getOutput().plainText, finalized.output.finalPlainText,
    "revisiting finalized narrative displays the saved prose");

  const locked = boot({ existing: true, locked: true });
  const lockedBefore = locked.storage.raw(WORKSPACE_KEY);
  assert.match(locked.sourceText(), /completed and locked/);
  locked.save();
  locked.context.COPDoc.narratives.flushWorkspace();
  assert.equal(locked.storage.raw(WORKSPACE_KEY), lockedBefore);
}

function testNoSurnameFallbackAndSupplementPreservation() {
  const app = boot({ patchBundle(bundle) {
    delete bundle.sourceFacts.subjects[SUBJECT_ID];
    return bundle;
  } });
  assert.equal(app.engine.getState().encounter.selections.force_type, undefined,
    "same-surname collateral cannot provide missing target force facts");
  app.save();
  app.update((row) => {
    row.narratives = app.domain.addAdditionalNarrative(row.narratives, {
      narrativeId: "nar_supplement", encounterId: ENCOUNTER_ID,
      focusEncounterParticipantId: SUBJECT_ID,
      output: { sections: [{ sectionId: "supp", resolvedText: "Supplement unchanged" }] }
    }).narratives;
    return row;
  });
  app.save();
  const narratives = app.model.store.getEncounter(ENCOUNTER_ID).narratives;
  assert.equal(narratives.find((row) => row.narrativeId === "nar_supplement").output.finalPlainText,
    "Supplement unchanged", "primary saves preserve concurrent supplements");
  const coverage = app.domain.validateCoverage({
    encounterId: ENCOUNTER_ID, participants: app.bundle().participants, narratives
  });
  assert.deepEqual(Array.from(coverage.missingParticipantIds), [OTHER_ID],
    "a supplement cannot satisfy another subject's primary coverage");
}

function testNoInventedConductAndFlightBeforeArrest() {
  const app = boot({ patchBundle(bundle) {
    Object.assign(bundle.sourceFacts.subjects[SUBJECT_ID], {
      compliance: "NONCOMPLIANT", useOfForce: "yes", forceLevel: "HARD", flightMode: "FOOT"
    });
    return bundle;
  } });
  const selections = app.engine.getState().encounter.selections;
  assert.equal(selections.subject_conduct, undefined,
    "noncompliance alone does not establish refusal of commands");
  assert.equal(selections.force_type, undefined,
    "a broad force category does not establish a specific takedown technique");
  assert.equal(selections.flight, "fled_on_foot", "flight may precede a final ARRESTED outcome");
}

function testUnavailableSourceCannotBeReviewed() {
  let unavailable = false;
  const app = boot({ patchBundle(bundle) {
    bundle.sourceUnavailable = unavailable;
    return bundle;
  } });
  app.save();
  const originalSnapshot = clone(app.narrative().sourceSnapshot);
  unavailable = true;
  app.windowEvent("storage");
  assert.match(app.sourceText(), /source is unavailable/);
  assert.equal(app.document.getElementById("refreshNarrativeSourceButton").disabled, true);
  assert.equal(app.document.getElementById("reviewNarrativeSourceButton").disabled, true);
  app.save();
  assert.equal(app.narrative().freshnessStatus, "UNKNOWN");
  assert.deepEqual(app.narrative().sourceSnapshot, originalSnapshot,
    "read failures cannot replace a verified source signature with partial facts");
}

function testEncounterNavigationSavesSnapshots() {
  const app = boot();
  app.engine.setManualText("Target draft before changing focus");
  app.switchSubject(OTHER_ID);
  app.engine.setManualText("Collateral reviewed draft");
  app.click("narrativeContinueToReviewButton");
  assert.equal(app.narrative().output.finalPlainText, "Target draft before changing focus");
  assert.equal(app.narrative(OTHER_ID).output.finalPlainText, "Collateral reviewed draft");
  assert.equal(app.narrative().workflowStatus, "DRAFT", "Save must not close or finalize the Encounter");
  assert.equal(app.model.store.getEncounter(ENCOUNTER_ID).meta.markedComplete, false);
  assert.equal(app.context.location.href, "encounter-form.html?id=" + ENCOUNTER_ID + "&tab=review");

  const back = boot();
  back.engine.setManualText("Draft retained before returning to evidence");
  back.click("narrativeBackToEvidenceButton");
  assert.equal(back.narrative().output.finalPlainText, "Draft retained before returning to evidence");
  assert.equal(back.context.location.href, "encounter-form.html?id=" + ENCOUNTER_ID + "&tab=evidence");

  const failed = boot();
  const before = failed.context.location.href;
  failed.engine.setManualText("Do not lose this draft");
  failed.storage.failNext(WORKSPACE_KEY);
  failed.click("narrativeContinueToReviewButton");
  assert.equal(failed.context.location.href, before, "A failed save cannot leave the narrative workspace");
  assert.equal(failed.engine.getOutput().finalPlainText, "Do not lose this draft");
  assert.equal(failed.narrative(), undefined);
  failed.click("narrativeContinueToReviewButton");
  assert.equal(failed.narrative().output.finalPlainText, "Do not lose this draft");

  const closed = boot({ existing: true, locked: true });
  const bytes = closed.storage.raw(WORKSPACE_KEY);
  closed.click("narrativeContinueToReviewButton");
  assert.equal(closed.context.location.href, "encounter-form.html?id=" + ENCOUNTER_ID + "&tab=review");
  assert.equal(closed.storage.raw(WORKSPACE_KEY), bytes, "Navigating a closed Encounter is read-only");
}

testCaptureAndStaleSave();
testReviewRaceAndLegacy();
testRevisionFailureAndSwitch();
testFinalizedAndLocked();
testNoSurnameFallbackAndSupplementPreservation();
testNoInventedConductAndFlightBeforeArrest();
testUnavailableSourceCannotBeReviewed();
testEncounterNavigationSavesSnapshots();
console.log("STAGE3_NARRATIVE_PAGE_PASSED source review, races, manual drafts, revisions, finalized and legacy lifecycle.");
