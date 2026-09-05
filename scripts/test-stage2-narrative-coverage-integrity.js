"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const build9 = require(path.resolve(
  __dirname,
  "..",
  "functions/narratives/build9/index.js"
));

const encounterId = "enc_coverage_identity";

function requiredParticipant(values) {
  return Object.assign(
    {
      encounterId,
      encounterParticipantId: "sub_coverage",
      encounterRole: "TARGET",
      recordState: "ACTIVE"
    },
    values || {}
  );
}

function primaryNarrative(participantId) {
  return {
    narrativeId: "nar_" + participantId,
    encounterId,
    narrativeKind: build9.NARRATIVE_KINDS.PRIMARY_SUBJECT,
    focusEncounterParticipantId: participantId,
    workflowStatus: "DRAFT",
    freshnessStatus: "CURRENT",
    recordState: "ACTIVE"
  };
}

function errorCodes(coverage) {
  return coverage.errors.map((error) => error.code);
}

function warningCodes(coverage) {
  return coverage.warnings.map((warning) => warning.code);
}

function exerciseMissingCanonicalIdentity() {
  const coverage = build9.validateCoverage({
    encounterId,
    participants: [requiredParticipant({ encounterParticipantId: "" })],
    narratives: []
  });

  assert.strictEqual(coverage.coverageComplete, false);
  assert.strictEqual(coverage.finalizationReady, false);
  assert.strictEqual(coverage.missingIdentityCount, 1);
  assert.deepStrictEqual(coverage.requiredParticipantIds, []);
  assert.ok(
    errorCodes(coverage).includes("PARTICIPANT_ID_MISSING"),
    "a required participant without canonical identity must be a blocking coverage error"
  );
  assert.ok(
    warningCodes(coverage).includes("PARTICIPANT_ID_MISSING"),
    "coverage diagnostics must preserve the row-level missing identity warning"
  );
}

function exerciseDuplicateCanonicalIdentity() {
  const duplicateId = "sub_duplicate";
  const coverage = build9.validateCoverage({
    encounterId,
    participants: [
      requiredParticipant({ encounterParticipantId: duplicateId, encounterRole: "TARGET" }),
      requiredParticipant({ encounterParticipantId: duplicateId, encounterRole: "COLLATERAL" })
    ],
    narratives: [primaryNarrative(duplicateId)]
  });

  assert.strictEqual(coverage.coveredCount, 1, "one primary narrative may cover the deduplicated row");
  assert.deepStrictEqual(coverage.missingParticipantIds, []);
  assert.strictEqual(
    coverage.coverageComplete,
    false,
    "a matching narrative must not hide a duplicate canonical participant identity"
  );
  assert.strictEqual(coverage.finalizationReady, false);
  assert.deepStrictEqual(coverage.identityCollisionParticipantIds, [duplicateId]);
  assert.ok(
    errorCodes(coverage).includes("PARTICIPANT_ID_DUPLICATE"),
    "duplicate canonical identity must be a blocking coverage error"
  );
  assert.ok(
    warningCodes(coverage).includes("PARTICIPANT_ID_DUPLICATE"),
    "coverage diagnostics must preserve the duplicate input warning"
  );
}

exerciseMissingCanonicalIdentity();
exerciseDuplicateCanonicalIdentity();

console.log(
  "STAGE2_NARRATIVE_COVERAGE_INTEGRITY_PASSED missing and duplicate canonical participant identities block coverage."
);
