"use strict";

// Run the production controller closures with isolated storage and small DOM
// doubles. No application hooks or user data are involved.
const assert = require("assert");
const fs = require("fs");
const vm = require("vm");
const path = require("path");
const {
  ROOT, createMemoryStorage, createMinimalDocument, loadModelTab, loadScript, quietConsole
} = require("./support/copdoc-vm-harness");

function controller(context, file, exports, setupSource) {
  require("./support/module-dependencies.js").loadDependencies(context, file);
  let source = fs.readFileSync(path.join(ROOT, file), "utf8");
  let end = source.lastIndexOf("})(typeof window");
  if (end < 0) end = source.lastIndexOf("})();");
  assert.ok(end >= 0);
  source = source.slice(0, end) + (setupSource || "") + "\nwindow.__ui = {" + exports.map(x => x + ":" + x).join(",") + "};\n" + source.slice(end);
  vm.runInContext(source, context, { filename: file });
  return context.__ui;
}
function card(kind, id, values) {
  const result = {
    dataset: { entityId: id },
    getAttribute(key) { return key === "data-card" ? kind : null; },
    querySelector(selector) {
      const match = selector.match(/data-field="([^"]+)"/);
      return match ? fields[match[1]] || null : null;
    },
    querySelectorAll(selector) {
      if (selector === "input, select, textarea") return Object.values(fields);
      const match = selector.match(/data-field="([^"]+)"/);
      return match && fields[match[1]] ? [fields[match[1]]] : [];
    }
  };
  const fields = Object.fromEntries(Object.entries(values || {}).map(([key, value]) => [key, {
    value, type: "text", getAttribute(name) { return name === "data-field" ? key : null; }, closest() { return result; }
  }]));
  result.fields = fields;
  return result;
}
function setup(page) {
  const document = createMinimalDocument(page);
  const ids = {};
  document.getElementById = id => ids[id] || null;
  const storage = createMemoryStorage();
  const tab = loadModelTab(storage, { document, console: quietConsole() });
  const messages = [];
  tab.context.COPDoc.setAppBarStatus = (text) => messages.push(text);
  return Object.assign(tab, { document, ids, messages });
}
function save(model, type, record) {
  const result = model.store.saveObjectRecord(type, record, { intent: "create", mode: "commit" });
  assert.strictEqual(result.ok, true, result.error);
  return model.store.getObjectRecord(type, result.objectId || record.personId || record.locationId || record.vehicleId);
}

// A canonical Location revision, including explicit clears, survives hydrate ->
// collect. A later independent edit makes the original form stale.
{
  const { model, context, document } = setup("lead");
  loadScript(context, "functions/model/collect.js");
  loadScript(context, "functions/model/hydrate.js");
  const first = save(model, "LOCATION", model.createLocation({ locationId: "loc_ui", street: "Old", city: "Dallas", notes: "Canonical notes outside this card", customEvidence: { source: "retained" } }));
  const newer = Object.assign({}, first, { street: "Current" });
  assert.ok(model.store.saveObjectRecord("LOCATION", newer).ok);
  const locationCard = card("location", first.locationId, { street: "", city: "", state: "", zip: "" });
  model.fillLocationCard(locationCard, first);
  assert.strictEqual(locationCard.fields.street.value, "Current");
  assert.strictEqual(Number(locationCard.dataset.objectRevision), 2);
  locationCard.fields.street.value = "";
  const edit = model.collectLocation(locationCard);
  assert.strictEqual(edit.street, "");
  assert.strictEqual(edit.objectRevision, 2);
  assert.strictEqual(edit._objectEdit, true);
  assert.strictEqual(edit.notes, "Canonical notes outside this card");
  assert.strictEqual(edit.customEvidence.source, "retained");
  assert.ok(model.store.saveObjectRecord("LOCATION", edit).ok);
  document.querySelectorAll = () => [locationCard];
  model.acknowledgeObjectEdits();
  assert.strictEqual(Number(locationCard.dataset.objectRevision), 3);
  const next = model.store.getLocationRecord("loc_ui");
  next.city = "Fort Worth";
  assert.ok(model.store.saveObjectRecord("LOCATION", next).ok);
  const stale = model.collectLocation(locationCard);
  const rejected = model.store.saveObjectRecord("LOCATION", stale);
  assert.strictEqual(rejected.ok, false);
  assert.strictEqual(rejected.code, "OBJECT_STALE");
  assert.strictEqual(model.store.getLocationRecord("loc_ui").city, "Fort Worth");
}

// Clearing the modern plate field clears its legacy alias in every collector,
// and the canonical save must not restore the previously registered plate.
["model", "case", "encounter"].forEach(kind => {
  const { model, context } = setup(kind === "encounter" ? "encounter-form" : "case");
  loadScript(context, "functions/model/collect.js");
  const original = save(model, "VEHICLE", model.createVehicle({ vehicleId: "veh_plate_" + kind, licensePlate: "OLD123", plateState: "TX", notes: "Keep unseen notes" }));
  const editor = card("vehicle", original.vehicleId, { licensePlate: "", plateState: "TX" });
  editor._objectEditRecord = JSON.parse(JSON.stringify(original));
  editor.dataset.objectRevision = String(original.objectRevision);
  let collected;
  if (kind === "model") {
    // The full Case collector uses this production object-field collection step.
    collected = model.collectObjectEdit(model.createVehicle({ vehicleId: original.vehicleId, licensePlate: "", plateState: "TX" }), editor);
  } else if (kind === "case") {
    collected = controller(context, "functions/case-edit.js", ["collectVehicleCard"]).collectVehicleCard(editor);
  } else {
    collected = controller(context, "functions/encounters.js", ["collectVehicle"]).collectVehicle(editor, []);
  }
  assert.strictEqual(collected.licensePlate, "");
  assert.strictEqual(collected.plate, "");
  const saved = model.store.saveObjectRecord("VEHICLE", collected);
  assert.strictEqual(saved.ok, true, saved.error);
  const canonical = model.store.getVehicleRecord(original.vehicleId);
  assert.strictEqual(canonical.licensePlate, "");
  assert.strictEqual(canonical.plate, "");
  assert.strictEqual(canonical.notes, "Keep unseen notes");
});

// The Encounter path uses the same identity decisions as Investigation. A name
// produces candidates; explicit new acknowledgement preserves a separate ID.
{
  const { model, context } = setup("encounter-form");
  const ui = controller(context, "functions/encounters.js", ["resolveSubjectPerson", "upsertSubjectPerson"]);
  const first = save(model, "PERSON", model.createPerson({ personId: "p_original", name: { firstName: "Pat", lastName: "Example" }, immigration: { alienNumber: "111222333" } }));
  const fields = { personId: "p_new", firstName: "Pat", lastName: "Example", citizenship: "", dateOfBirth: "", alienNumber: "" };
  assert.strictEqual(ui.resolveSubjectPerson(fields).code, "OBJECT_SELECTION_REQUIRED");
  fields.createNew = true;
  const created = ui.upsertSubjectPerson(fields);
  assert.strictEqual(created.ok, true, created.error);
  assert.strictEqual(created.person.personId, "p_new");
  assert.ok(model.store.getPerson("p_original"));
  const reuse = ui.resolveSubjectPerson({ personId: "p_provisional", firstName: "Pat", lastName: "Example", alienNumber: "111222333" });
  assert.strictEqual(reuse.objectId, first.personId);
  const conflicting = ui.resolveSubjectPerson({ personId: "p_new", lockedPersonId: "p_new", firstName: "Pat", lastName: "Example", alienNumber: "111222333" });
  assert.strictEqual(conflicting.ok, false);
  assert.strictEqual(conflicting.code, "OBJECT_IDENTITY_CONFLICT");
  const edited = model.store.getPerson("p_new");
  const revision = edited.objectRevision;
  edited.citizenship = "Canada";
  assert.ok(model.store.saveObjectRecord("PERSON", edited).ok);
  const stale = ui.upsertSubjectPerson(Object.assign({}, fields, { sourcePersonId: "p_new", objectRevision: revision }));
  assert.strictEqual(stale.code, "OBJECT_STALE");
  assert.strictEqual(model.store.getPerson("p_new").citizenship, "Canada");
}

// Strong-ID reuse from an Add New form cannot clear canonical facts that
// were never displayed in that form. An actual editor can still clear them.
{
  const { model, context } = setup("encounter-form");
  const original = save(model, "PERSON", model.createPerson({ personId: "p_reused_ui", name: { firstName: "Canonical", lastName: "Person" }, dateOfBirth: "1980-01-02", citizenship: "Mexico", immigration: { alienNumber: "555666777" } }));
  const ui = controller(context, "functions/encounters.js", ["upsertSubjectPerson"]);
  const reused = ui.upsertSubjectPerson({ personId: "p_provisional", sourcePersonId: "", firstName: "Typed", lastName: "Label", alienNumber: "555666777", dateOfBirth: "", citizenship: "" });
  assert.strictEqual(reused.ok, true, reused.error);
  assert.strictEqual(reused.person.personId, original.personId);
  assert.strictEqual(reused.person.dateOfBirth, "1980-01-02");
  assert.strictEqual(reused.person.citizenship, "Mexico");
  assert.strictEqual(reused.person.name.firstName, "Canonical");
  const cleared = ui.upsertSubjectPerson({ personId: original.personId, sourcePersonId: original.personId, objectRevision: reused.person.objectRevision, firstName: "Canonical", lastName: "Person", alienNumber: "555666777", dateOfBirth: "", citizenship: "" });
  assert.strictEqual(cleared.ok, true, cleared.error);
  assert.strictEqual(cleared.person.dateOfBirth, "");
  assert.strictEqual(cleared.person.citizenship, "");
}

// The actual Add Subject action derives its display snapshot from the reused
// canonical Person, including canonical blanks, and attaches that exact ID.
{
  const { model, context, ids, document } = setup("encounter-form");
  const original = save(model, "PERSON", model.createPerson({ personId: "p_display_ui", name: { firstName: "", lastName: "Canonical" }, dateOfBirth: "1980-01-02", citizenship: "Mexico", immigration: { alienNumber: "444555666" } }));
  const encounter = model.createEncounterRecord({ encounterId: "enc_display_ui", subjects: [] });
  assert.ok(model.store.saveEncounter(encounter, { mode: "draft" }).ok);
  context.__testMeta = model.store.getEncounter(encounter.encounterId).meta;
  Object.assign(ids, {
    encounterId: { value: encounter.encounterId }, subLast: { value: "Typed label" }, subFirst: { value: "Typed first" },
    subPersonId: { value: "p_new_display_provisional" }, subAlien: { value: "444555666" }, subCitizen: { value: "" }, subDob: { value: "" }
  });
  document.querySelector = selector => selector === 'input[name="subRole"]:checked' ? { value: "TARGET" } : selector === 'input[name="subOutcome"]:checked' ? { value: "RELEASED" } : null;
  const ui = controller(context, "functions/encounters.js", ["saveSubjectToEncounter"], "encounterEditMeta = window.__testMeta; paintSubjectsTable = function () {}; paintBanner = function () {}; closeSubjectFloat = function () {}; showEncounterTab = function () {};");
  ui.saveSubjectToEncounter();
  const subjects = model.store.getEncounter(encounter.encounterId).subjects;
  assert.strictEqual(subjects.length, 1);
  assert.strictEqual(subjects[0].personId, original.personId);
  assert.strictEqual(subjects[0].lastName, "Canonical");
  assert.strictEqual(subjects[0].firstName, "");
  assert.strictEqual(subjects[0].citizenship, "Mexico");
  assert.strictEqual(subjects[0].alienNumber, "444555666");
  assert.strictEqual(model.store.getPerson(original.personId).dateOfBirth, "1980-01-02");
  assert.strictEqual(model.store.getPerson("p_new_display_provisional"), null);
}

// Opening a subject edits canonical identity, including deliberate clears.
// The Encounter's cached A-number must never refill the canonical Person.
{
  const { model, context } = setup("encounter-form");
  save(model, "PERSON", model.createPerson({ personId: "p_clear_ui", name: { firstName: "", lastName: "" }, citizenship: "", immigration: { alienNumber: "" } }));
  const ui = controller(context, "functions/encounters.js", ["openEditSubject"], "openSubjectFields = function (options) { window.__subjectFields = options; };");
  ui.openEditSubject({ subjectId: "sub_clear_ui", personId: "p_clear_ui", firstName: "Old", lastName: "Snapshot", citizenship: "Old country", alienNumber: "111222333" });
  assert.strictEqual(context.__subjectFields.firstName, "");
  assert.strictEqual(context.__subjectFields.lastName, "");
  assert.strictEqual(context.__subjectFields.citizenship, "");
  assert.strictEqual(context.__subjectFields.alienNumber, "");
}

// Inspector errors remain visible and do not rebind an object to a name match.
// On a successful retry the same DOM card advances to the persisted revision.
{
  const { model, context, ids, messages } = setup("investigate");
  const original = save(model, "PERSON", model.createPerson({ personId: "p_inspector", name: { firstName: "Original", lastName: "Example" } }));
  const editor = card("person", original.personId, { firstName: "Typed", lastName: "Example", middleName: "" });
  editor._objectRecord = JSON.parse(JSON.stringify(original));
  editor.dataset.objectRevision = String(original.objectRevision);
  ids.investigationInspector = { getAttribute(key) { return { "data-object-type": "PERSON", "data-object-id": original.personId, "data-node-id": "node_ui" }[key]; } };
  ids.investigationInspectorCard = { querySelector() { return editor; } };
  const ui = controller(context, "functions/investigation-wall.js", ["persistInspector"]);
  const newer = model.store.getPerson(original.personId);
  newer.name.firstName = "Elsewhere";
  assert.ok(model.store.saveObjectRecord("PERSON", newer).ok);
  ui.persistInspector();
  assert.ok(messages.some(text => /changed.*workflow/i.test(text)));
  assert.strictEqual(model.store.getPerson(original.personId).name.firstName, "Elsewhere");
  assert.strictEqual(editor.fields.firstName.value, "Typed");
  assert.strictEqual(editor.dataset.objectRevision, "1");
  editor._objectRecord = model.store.getPerson(original.personId);
  editor.dataset.objectRevision = String(editor._objectRecord.objectRevision);
  ui.persistInspector();
  assert.strictEqual(model.store.getPerson(original.personId).name.firstName, "Typed");
  assert.strictEqual(editor.dataset.objectRevision, "3");
}

// Blocked destructive actions must not detach Book-In packets as a prelude to
// discovering that deletion is forbidden.
{
  const { model, context, storage, messages } = setup("encounter-form");
  const encounter = model.createEncounterRecord({ encounterId: "enc_ui", startedAt: "2026-09-05T10:00" });
  assert.ok(model.store.saveEncounter(encounter, { mode: "commit" }).ok);
  storage.storage.setItem("alien-book-in.saved-records.v1", JSON.stringify([{ id: "bk_ui", encounterId: "enc_ui", subjectId: "subject_ui", arrestId: "arr_ui" }]));
  const bytes = storage.storage.getItem("alien-book-in.saved-records.v1");
  context.confirm = () => false;
  const ui = controller(context, "functions/encounters.js", ["deleteEncounterRecord"]);
  const before = storage.writeCount();
  assert.strictEqual(ui.deleteEncounterRecord("enc_ui"), false);
  assert.strictEqual(storage.storage.getItem("alien-book-in.saved-records.v1"), bytes);
  assert.strictEqual(storage.writeCount(), before);
  assert.ok(model.store.getEncounter("enc_ui"));
  assert.ok(messages.some(text => /retained|dependenc/i.test(text)));
}

// The Encounter controller prepares identity without writes, then atomically
// saves Person and membership. Failure cannot leave a newly minted Person.
{
  const { model, context, ids, storage } = setup("encounter-form");
  const encounter = model.createEncounterRecord({ encounterId: "enc_atomic_ui", subjects: [] });
  assert.ok(model.store.saveEncounter(encounter, { mode: "draft" }).ok);
  ids.encounterId = { value: encounter.encounterId };
  context.__testMeta = model.store.getEncounter(encounter.encounterId).meta;
  context.__testRoster = [{ subjectId: "sub_atomic_ui", encounterId: encounter.encounterId, personId: "p_atomic_ui", role: "TARGET", outcome: "RELEASED" }];
  const ui = controller(context, "functions/encounters.js", ["upsertSubjectPerson", "saveDraftQuiet", "applyTestRoster"], "encounterEditMeta = window.__testMeta; function applyTestRoster() { encounterSubjects = window.__testRoster; }");
  const before = storage.raw("copdocx.store.v1");
  const prepared = ui.upsertSubjectPerson({ personId: "p_atomic_ui", firstName: "Atomic", lastName: "Example", citizenship: "", dateOfBirth: "", alienNumber: "", prepareOnly: true });
  assert.strictEqual(prepared.ok, true, prepared.error);
  assert.strictEqual(storage.raw("copdocx.store.v1"), before);
  assert.strictEqual(model.store.getPerson("p_atomic_ui"), null);
  ui.applyTestRoster();
  storage.failNext("copdocx.store.v1");
  assert.strictEqual(ui.saveDraftQuiet({ force: true, personEdits: [prepared.objectEdit] }), false);
  assert.strictEqual(storage.raw("copdocx.store.v1"), before);
  assert.strictEqual(model.store.getPerson("p_atomic_ui"), null);
  assert.strictEqual(model.store.getEncounter(encounter.encounterId).subjects.length, 0);
  assert.strictEqual(ui.saveDraftQuiet({ force: true, personEdits: [prepared.objectEdit] }), true);
  assert.strictEqual(model.store.getEncounter(encounter.encounterId).subjects[0].personId, "p_atomic_ui");
  assert.ok(model.store.getPerson("p_atomic_ui"));
}

console.log("STAGE5_OBJECT_UI_PASSED canonical editor revisions, explicit identity reuse, inspector conflicts, dependency-first delete, and atomic Person attachment.");
