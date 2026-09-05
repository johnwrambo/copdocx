"use strict";

const assert = require("node:assert/strict");
const { createEncounterNarrative } = require("../functions/projections/encounter-narrative.js");

function instance(firstName, options) {
  const person = { personId: "person_a", name: { firstName: firstName, lastName: "EXAMPLE" }, immigration: {} };
  const encounter = {
    encounterId: "encounter_a", startedAt: "2026-09-05T10:00:00Z", officerIds: [],
    subjects: [{ subjectId: "subject_a", personId: "person_a", role: "TARGET", outcome: "RELEASED" }],
    locations: [], vehicles: [], narratives: []
  };
  const calls = [];
  const deps = {
    model: { store: {
      loadFromDisk() { calls.push("reload"); },
      getEncounter(id) { return id === encounter.encounterId ? encounter : null; },
      getPerson(id) { return id === person.personId ? person : null; }
    } },
    readBookins() { calls.push("bookins"); return []; },
    readAdmin() { calls.push("admin"); return {}; },
    readSettings() { calls.push("settings"); return {}; },
    countries: [{ code: "TEST", label: "Test Country" }],
    immigrationDispositions: []
  };
  Object.assign(deps, options || {});
  return { projection: createEncounterNarrative(deps), encounter, person, calls };
}

const a = instance("First");
const b = instance("Second");
const before = JSON.stringify([a.person, a.encounter]);
const first = a.projection.bundleFromEncounter("encounter_a");
const second = b.projection.bundleFromEncounterRecord(b.encounter);
assert.equal(first.participants[0].encounterParticipantId, "subject_a");
assert.equal(first.participants[0].personId, "person_a");
assert.equal(first.participants[0].finalOutcome, "RELEASED");
assert.notDeepEqual(first.participants[0], second.participants[0], "Factories must keep their supplied data sources separate.");
assert.equal(first.sourceUnavailable, false);
assert.equal(JSON.stringify([a.person, a.encounter]), before, "Projection cannot mutate source Person or Encounter records.");
assert.deepEqual(a.calls, ["reload", "bookins", "admin", "settings"]);
assert.deepEqual(b.calls, ["bookins", "admin", "settings"]);
assert.equal(a.projection.bundleFromEncounter("missing"), null);

const failing = instance("Failure", {
  readBookins() { throw new Error("injected unavailable source"); },
  readAdmin() { return []; },
  readSettings() { return null; }
});
const unavailable = failing.projection.bundleFromEncounterRecord(failing.encounter);
assert.equal(unavailable.sourceUnavailable, true, "Source failure must invalidate freshness rather than silently become canonical empty data.");
assert.equal(unavailable.participants.length, 1, "Encounter roster remains available despite unrelated reader failures.");
const optionsOnly = instance("Override", { readBookins() { throw new Error("must not read unused source"); } });
assert.equal(optionsOnly.projection.bundleFromEncounterRecord(optionsOnly.encounter, { bookinRecords: [] }).sourceUnavailable, false);

const state = { data: { encounterParticipantId: "subject_a" } };
assert.deepEqual(a.projection.remapNarrativeStateParticipantIds(state, first), state);
console.log("Stage 8 narrative projection: injected source isolation, stable joins, failure freshness and immutable inputs passed.");

const { createNarrativeTemplates } = require("../functions/repositories/narrative-templates.js");
const currentKey = "opdoc.narrative.templates.v2";
const legacyKey = "opdoc.narrative.templates.v1";
const memory = new Map([[legacyKey, JSON.stringify([{ id: "legacy", name: "Kept" }, { unsupported: true }])]]);
const writes = [];
let rejectWrite = false;
const repository = createNarrativeTemplates({
  storage: {
    read(medium, key) { assert.equal(medium, "localStorage"); return memory.get(key) || null; },
    write(medium, key, raw) {
      assert.equal(medium, "localStorage");
      if (rejectWrite) throw new Error("injected quota failure");
      writes.push(key); memory.set(key, raw);
    }
  },
  normalize(record) {
    if (!record.id) throw new Error("unsupported template");
    return Object.assign({}, record, { normalized: true });
  }
});
const legacyBytes = memory.get(legacyKey);
const loaded = repository.load();
assert.equal(loaded.ok, true);
assert.deepEqual(loaded.records, [{ id: "legacy", name: "Kept", normalized: true }]);
assert.equal(writes.length, 0, "Loading a legacy template never migrates or overwrites stored bytes.");
assert.equal(repository.save(loaded.records).ok, true);
assert.deepEqual(writes, [currentKey]);
assert.equal(memory.get(legacyKey), legacyBytes, "A template save leaves the legacy fallback intact.");
const savedBytes = memory.get(currentKey);
rejectWrite = true;
assert.equal(repository.save([{ id: "unsaved" }]).ok, false);
assert.equal(memory.get(currentKey), savedBytes);
memory.set(currentKey, "{bad JSON");
assert.equal(repository.load().ok, false, "Unreadable current storage must not silently fall back to a stale legacy library.");
assert.deepEqual(repository.load().records, []);
memory.set(currentKey, JSON.stringify({ wrongShape: true }));
assert.deepEqual(repository.load(), { ok: true, records: [], error: "" }, "Preserve the engine's established non-array library handling.");
console.log("Stage 8 Narrative template repository: legacy fallback, normalization, non-writing reads and failed-save preservation passed.");
