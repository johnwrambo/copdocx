"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const source = fs.readFileSync(
  path.join(__dirname, "..", "functions", "encounters.js"),
  "utf8"
);

const remintStart = source.indexOf("function bindTeamRemint()");
const persistedGuard = source.indexOf(
  "if (stored) {\n        setStatus(\"Team is locked after the encounter is first saved.\")",
  remintStart
);
const rosterGuard = source.indexOf(
  "Array.isArray(current.subjects) && current.subjects.length",
  remintStart
);
const remintMutation = source.indexOf("current.encounterId = nextId", remintStart);
const handlerEnd = source.indexOf("function bindEncounterWorkspace()", remintStart);

assert.ok(remintStart >= 0, "team-remint handler must exist");
assert.ok(
  persistedGuard > remintStart && persistedGuard < rosterGuard,
  "a persisted draft must be locked before team remint becomes destructive"
);
assert.ok(
  rosterGuard > persistedGuard && rosterGuard < remintMutation,
  "a transient draft with an Encounter subject must be locked before ID remint"
);
assert.strictEqual(
  source.slice(remintStart, handlerEnd).indexOf("deleteEncounter("),
  -1,
  "team remint must not clone then delete a persisted Encounter"
);

console.log(
  "STAGE2_TEAM_REMINT_SAFETY_PASSED persisted drafts stay put and remint never deletes records or media."
);
