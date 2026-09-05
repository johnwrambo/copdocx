"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const source = fs.readFileSync(
  path.join(__dirname, "..", "functions", "encounters.js"),
  "utf8"
);

function section(name, nextName) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name}() must exist`);
  const end = nextName ? source.indexOf(`function ${nextName}(`, start + 1) : source.length;
  assert.ok(end > start, `${name}() must end before ${nextName || "EOF"}`);
  return source.slice(start, end);
}

function ordered(text, labels) {
  let cursor = -1;
  labels.forEach(label => {
    const index = text.indexOf(label, cursor + 1);
    assert.ok(index > cursor, `${JSON.stringify(label)} must appear in order`);
    cursor = index;
  });
}

// A form must keep the revision/meta from the version it actually hydrated.
// Reloading the store before a write may discover a newer record, but must not
// silently adopt that newer revision into the stale form payload.
assert.ok(source.includes("var encounterEditMeta = null;"));
const hydrate = section("hydrateEncounter", "lockEncounterForm");
assert.ok(hydrate.includes("encounterEditMeta = record.meta"));
const collect = section("collectEncounter", "addCard");
assert.ok(collect.includes("encounterEditMeta || {}"));
const remember = section("rememberPersistedEncounter", "saveDraftQuiet");
assert.ok(remember.includes("encounterEditMeta = record && record.meta"));
const saveDraft = section("saveDraftQuiet", "commitEncounter");
ordered(saveDraft, [
  "m.store.loadFromDisk()",
  "m.store.getEncounter(record.encounterId)",
  "m.store.saveEncounter(record, { mode: mode })",
  "rememberPersistedEncounter(saved.encounter || record)"
]);
const commit = section("commitEncounter", "openEncounterBookIn");
ordered(commit, [
  'm.store.saveEncounter(record, { mode: "commit" })',
  "rememberPersistedEncounter(saved.encounter || record)"
]);

// Transient Encounter evidence controls must not expose a usable href to a
// normal click, context menu, or middle click. The click path persists first,
// rebuilds the href from the stored record, then navigates explicitly.
const evidenceLinks = section("setEvidenceLinks", "paintEvidence");
assert.ok(evidenceLinks.includes("!id || !stored || isComplete(persisted)"));
assert.ok(evidenceLinks.includes('link.removeAttribute("href")'));
assert.ok(evidenceLinks.includes('link.setAttribute("aria-disabled", "true")'));
const evidenceBindingStart = source.indexOf(
  '[byId("addEncounterPhoto"), byId("addEncounterFile")].forEach'
);
const evidenceBindingEnd = source.indexOf("var narrativeBtn", evidenceBindingStart);
assert.ok(evidenceBindingStart >= 0 && evidenceBindingEnd > evidenceBindingStart);
const evidenceBinding = source.slice(evidenceBindingStart, evidenceBindingEnd);
ordered(evidenceBinding, [
  "if (!existing && saveDraftQuiet({ force: true }) === false)",
  "if (!existing)",
  "event.preventDefault()",
  "setEvidenceLinks()",
  'window.location.href = href'
]);

// A lead-backed subject is invalid without its canonical Person. This guard
// and the complete-roster preflight must both run before upsertPerson can make
// any durable side effect.
const saveSubject = section("saveSubjectToEncounter", "bindSubjectFloat");
const leadGuard = saveSubject.indexOf("if (fields.leadId && !fields.personId)");
const rosterPreflight = saveSubject.indexOf("validateEncounterSubjectRoster");
const personWrite = saveSubject.indexOf("upsertSubjectPerson(fields)");
assert.ok(leadGuard >= 0 && leadGuard < rosterPreflight);
assert.ok(rosterPreflight > leadGuard && rosterPreflight < personWrite);

// Encounter deletion must parse and prewrite detached Book-In packets before
// the Workspace record is removed, then restore them if deletion fails.
const deleteEncounter = section("deleteEncounterRecord", "deleteCurrentEncounter");
ordered(deleteEncounter, [
  "var packetStore = readBookinRecords()",
  "if (!packetStore.ok)",
  "unlinkBookinPacketsFromEncounter(",
  "if (!packetUnlink.ok)",
  "m.store.deleteEncounter(id)",
  "writeBookinRecords(packetUnlink.original)"
]);

// Subject removal writes the detached packet set first. If the Encounter save
// fails, both the in-memory roster and the exact prior packet array are restored.
const unlink = section("unlinkEncounterSubject", "packetCell");
ordered(unlink, [
  "if (contradictoryPacket)",
  "writeBookinRecords(list)",
  "encounterSubjects = encounterSubjects.filter",
  "if (saveDraftQuiet({ force: true }) === false)",
  "encounterSubjects = rosterBeforeSave",
  "writeBookinRecords(originalPackets)"
]);

// Document generation is authorized only by one exact Encounter + subject +
// canonical booking packet. A failed marker save restores the roster and never
// reaches navigation.
const docs = section("generateSubjectDocs", "saveBookToEncounter");
assert.ok(docs.includes("packetBookingIds.length === 1"));
assert.ok(docs.includes("packetBookingIds[0] === bookingId"));
assert.ok(docs.includes('String(item.subjectId || "").trim() === key'));
ordered(docs, [
  "if (packetMatches.length !== 1)",
  "var rosterBeforeSave",
  "if (saveDraftQuiet({ force: true }) === false)",
  "encounterSubjects = rosterBeforeSave",
  "window.location.href = bookinHref(encId, bookingId, key)"
]);

console.log(
  "STAGE2_ENCOUNTER_UI_INTEGRITY_PASSED stale edits, evidence, delete, unlink, lead, and document guards remain wired."
);
