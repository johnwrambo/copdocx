const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const dataLibraries = [
  "data/narratives/narrative-shared-options.js",
  "data/narratives/sections/01-origin.js",
  "data/narratives/sections/02-authority.js",
  "data/narratives/sections/03-context.js",
  "data/narratives/sections/04-observation.js",
  "data/narratives/sections/05-contact.js",
  "data/narratives/sections/06-conduct-incidents.js",
  "data/narratives/sections/07-confirmation.js",
  "data/narratives/sections/08-custody.js",
  "data/narratives/sections/09-vehicle-property.js",
  "data/narratives/sections/10-final-disposition.js",
  "data/narratives/narrative-master.js"
];

dataLibraries.forEach((file) => require(path.join(root, file)));
require(path.join(root, "functions/narratives/narrative-markup.js"));
const workspaceUi = require(path.join(
  root,
  "functions/narratives/narrative-workspace-ui.js"
));
require(path.join(root, "functions/narratives/packet-builder.js"));
const build9 = require(path.join(root, "functions/narratives/build9/index.js"));
require(path.join(root, "data/narratives/build9/demo-fixtures.js"));

const narratives = global.COPDoc.narratives;
const fixture = global.COPDocNarrativeDemoFixture;
const master = narratives.MASTER_NARRATIVE_SECTIONS;
const fields = master.flatMap((section) => section.fields || []);
const options = fields.flatMap((field) => field.options || []);

assert.equal(
  typeof workspaceUi.enhanceWorkspace,
  "function",
  "workspace enhancement should expose a host adapter"
);

assert.equal(master.length, 10, "master library should include all 10 sections");
assert.deepEqual(
  master.map((section) => section.id),
  narratives.REQUIRED_MASTER_SECTION_IDS,
  "master sections should remain in canonical order"
);
assert.equal(new Set(fields.map((field) => field.id)).size, fields.length, "field IDs should be unique");
assert.ok(fields.length > 35, "master library should contain the Build 9 field set");
assert.ok(options.length > 150, "master library should contain the Build 9 prose options");

const bundle = {
  encounter: fixture.encounter,
  operation: fixture.operation,
  participants: fixture.participants,
  events: fixture.events,
  vehicles: fixture.encounterVehicles,
  primaryLocation: fixture.location,
  officers: fixture.officers,
  narratives: fixture.narrativesInitial,
  narrativeFacts: { command: "unlock the vehicle and exit" }
};
const packet = narratives.buildPacketFromBundle(bundle, "ep_demo_t1", {
  isTestData: true,
  vehicleResolver: (vehicleId) => fixture.vehicles.find((vehicle) => vehicle.vehicleId === vehicleId)
});

assert.equal(packet.schema_version, "copdoc.narrative-data.v3");
assert.equal(packet.metadata.focus_participant_id, "ep_demo_t1");
assert.ok(packet.objects.some((object) => object.type === "person"));
assert.ok(packet.objects.some((object) => object.type === "vehicle"));
assert.ok(packet.objects.some((object) => object.type === "event"));

const encounterPacketObject = packet.objects.find((object) => object.type === "encounter");
assert.equal(encounterPacketObject.fields.date, "2026-08-09");
assert.equal(encounterPacketObject.fields.time, "13:10");
const operationPacketObject = packet.objects.find((object) => object.type === "operation");
assert.equal(operationPacketObject.fields.field_office, "Dallas Field Office");
const vehiclePacketObject = packet.objects.find((object) => object.type === "vehicle");
assert.equal(vehiclePacketObject.fields.plate, fixture.vehicles[0].plate.value);
const packetOfficerIds = new Set(
  packet.objects.filter((object) => object.type === "officer").map((object) => object.id)
);
fixture.officers.forEach((officer) => assert.ok(packetOfficerIds.has(officer.officerProfileId)));
packet.objects.filter((object) => object.type === "event").forEach((eventObject) => {
  assert.ok(eventObject.fields.description, `event ${eventObject.id} should include its summary`);
  eventObject.metadata.officer_links.forEach((link) => {
    assert.ok(packetOfficerIds.has(link.officerProfileId), `event ${eventObject.id} officer link should resolve`);
  });
});
const reportingOfficer = packet.objects.find((object) => object.id === fixture.encounter.reportingOfficerId);
assert.ok(reportingOfficer.roles.some((role) => role.role === "reporting"));
assert.ok(reportingOfficer.roles.some((role) => role.role === "actor"));

const zeroCoordinatePacket = narratives.buildPacketFromBundle(Object.assign({}, bundle, {
  primaryLocation: Object.assign({}, fixture.location, { coordinates: { latitude: 0, longitude: 0 } })
}), "ep_demo_t1", {
  isTestData: true,
  vehicleResolver: (vehicleId) => fixture.vehicles.find((vehicle) => vehicle.vehicleId === vehicleId)
});
const zeroLocation = zeroCoordinatePacket.objects.find((object) => object.type === "location");
assert.equal(zeroLocation.fields.latitude, "0");
assert.equal(zeroLocation.fields.longitude, "0");

const coverage = build9.validateCoverage({
  encounterId: fixture.encounter.encounterId,
  participants: fixture.participants,
  narratives: fixture.narrativesInitial
});
assert.equal(coverage.coverageComplete, false);
assert.deepEqual(coverage.missingParticipantIds, [fixture.missingPrimaryParticipantId]);

const completeNarratives = fixture.narrativesInitial.concat(fixture.makeMissingPrimaryNarrative());
const completeCoverage = build9.validateCoverage({
  encounterId: fixture.encounter.encounterId,
  participants: fixture.participants,
  narratives: completeNarratives
});
assert.equal(completeCoverage.coverageComplete, true);

const revisionTarget = completeNarratives[0];
const revisionTargetBase = Number(revisionTarget.revision) || 0;
const revisionSave = build9.saveNarrativeById(
  completeNarratives,
  revisionTarget.narrativeId,
  { title: revisionTarget.title + " updated" },
  { expectedRevision: revisionTargetBase }
);
assert.equal(
  revisionSave.record.revision,
  revisionTargetBase + 1,
  "per-narrative saves should advance only the requested record revision"
);
assert.equal(revisionSave.narratives.length, completeNarratives.length);
assert.throws(
  () => build9.saveNarrativeById(
    revisionSave.narratives,
    revisionTarget.narrativeId,
    { title: "stale write" },
    { expectedRevision: revisionTargetBase }
  ),
  (error) => error && error.code === "REVISION_CONFLICT",
  "stale narrative tabs should not silently overwrite a newer revision"
);

const finalizedNarratives = completeNarratives.map((narrative) =>
  narrative.narrativeKind === build9.NARRATIVE_KINDS.PRIMARY_SUBJECT
    ? Object.assign({}, narrative, { workflowStatus: "FINALIZED", freshnessStatus: "CURRENT" })
    : narrative
);
const finalizedCoverage = build9.validateCoverage({
  encounterId: fixture.encounter.encounterId,
  participants: fixture.participants,
  narratives: finalizedNarratives
});
assert.equal(finalizedCoverage.finalizationReady, true);

const unknownFreshnessNarrativeId = finalizedNarratives.find(
  (narrative) => narrative.narrativeKind === build9.NARRATIVE_KINDS.PRIMARY_SUBJECT
).narrativeId;
const unknownFreshnessCoverage = build9.validateCoverage({
  encounterId: fixture.encounter.encounterId,
  participants: fixture.participants,
  narratives: finalizedNarratives.map((narrative) => narrative.narrativeId === unknownFreshnessNarrativeId
    ? Object.assign({}, narrative, { freshnessStatus: "UNKNOWN" })
    : narrative)
});
assert.equal(unknownFreshnessCoverage.finalizationReady, false);
assert.deepEqual(unknownFreshnessCoverage.unknownFreshnessNarrativeIds, [unknownFreshnessNarrativeId]);

const malformedOutputValidation = build9.validateNarrativeRecord(Object.assign({}, completeNarratives[0], {
  output: { schema: "copdoc.narrative-output.v3", sections: {} }
}));
assert.equal(malformedOutputValidation.valid, false);
assert.ok(malformedOutputValidation.errors.some((error) => error.code === "NARRATIVE_OUTPUT_INVALID"));
assert.throws(
  () => build9.createNarrativeVersionRecord(completeNarratives[0], {
    narrativeVersionId: "narver_demo_draft"
  }),
  (error) => error && error.code === "NARRATIVE_NOT_FINALIZED"
);

const summary = build9.deriveEncounterSummary(
  Object.assign({}, bundle, { narratives: completeNarratives }),
  { narrativeCoverage: completeCoverage, now: "2026-08-09T19:10:00.000Z" }
);
const summaryAcceptanceProjection = (value) => ({
  schema: value.schema,
  encounterId: value.encounterId,
  algorithmVersion: value.algorithmVersion,
  who: {
    participantCount: value.who.participantCount,
    targetCount: value.who.targetCount,
    collateralCount: value.who.collateralCount,
    officerCount: value.who.officerCount,
    arrestedParticipantIds: value.who.arrestedParticipantIds
  },
  what: {
    encounterTypeCode: value.what.encounterTypeCode,
    outcomesByCode: value.what.outcomesByCode,
    arrestedCount: value.what.arrestedCount,
    detainedCount: value.what.detainedCount,
    releasedCount: value.what.releasedCount,
    transferredCount: value.what.transferredCount,
    notContactedCount: value.what.notContactedCount,
    immigrationDispositionPeopleByCode: value.what.immigrationDispositionPeopleByCode,
    earmDispositionPeopleByCode: value.what.earmDispositionPeopleByCode,
    finalOrders: {
      confirmed: value.what.finalOrders.confirmed,
      notConfirmed: value.what.finalOrders.notConfirmed,
      unknown: value.what.finalOrders.unknown
    }
  },
  where: value.where,
  when: value.when,
  how: {
    eventsByType: value.how.eventsByType,
    vehicleStopOccurred: value.how.vehicleStopOccurred,
    forceIncidentCount: value.how.forceIncidentCount,
    forceSubjectCount: value.how.forceSubjectCount,
    windowBreakIncidentCount: value.how.windowBreakIncidentCount,
    collisionCount: value.how.collisionCount,
    injuryIncidentCount: value.how.injuryIncidentCount
  },
  generatedSupervisorText: value.generatedSupervisorText
});
assert.deepEqual(
  summaryAcceptanceProjection(summary),
  fixture.expectedSummary,
  "derived supervisor summary should match the deterministic fixture"
);

const manifestKeys = summary.sourceManifest.map((record) => `${record.recordType}:${record.recordId}`);
assert.equal(new Set(manifestKeys).size, manifestKeys.length, "summary manifest keys should be unique");
assert.ok(summary.sourceManifest.every((record) => record.recordType !== "UNKNOWN"));
fixture.officers.forEach((officer) => {
  assert.ok(
    manifestKeys.includes(`OFFICER_PROFILE:${officer.officerProfileId}`),
    `summary manifest should include officer ${officer.officerProfileId}`
  );
});

const renamedOfficerSummary = build9.deriveEncounterSummary(Object.assign({}, bundle, {
  narratives: completeNarratives,
  officers: fixture.officers.map((officer, index) => index === 0
    ? Object.assign({}, officer, { displayName: "Changed Officer Name" })
    : officer)
}));
assert.notEqual(
  renamedOfficerSummary.sourceFingerprint,
  summary.sourceFingerprint,
  "officer projections should participate in the summary fingerprint"
);

const unrelatedNarrative = Object.assign({}, completeNarratives[0], {
  narrativeId: "nar_other_encounter",
  encounterId: "enc_other"
});
const unrelatedSummary = build9.deriveEncounterSummary(Object.assign({}, bundle, {
  narratives: completeNarratives.concat(unrelatedNarrative)
}));
assert.equal(
  unrelatedSummary.sourceFingerprint,
  build9.deriveEncounterSummary(Object.assign({}, bundle, { narratives: completeNarratives })).sourceFingerprint,
  "unrelated encounter narratives should not affect the summary"
);
assert.ok(!unrelatedSummary.sourceManifest.some((record) => record.recordId === "nar_other_encounter"));

const coverageOnlyBundle = Object.assign({}, bundle, { narratives: undefined });
assert.throws(
  () => build9.deriveEncounterSummary(coverageOnlyBundle, {
    narrativeCoverage: Object.assign({}, completeCoverage, { encounterId: "enc_other" })
  }),
  /encounterId does not match/,
  "caller-supplied coverage should be validated before it is accepted"
);

const page = fs.readFileSync(path.join(root, "narrative.html"), "utf8");
assert.match(page, /<body data-page="narrative">/);
assert.match(page, /data-version="0\.\d+\.\d+"/);
assert.doesNotMatch(page, /<style\b/i, "narrative page should use shared CSS");
assert.doesNotMatch(page, /<script(?![^>]*\bsrc=)/i, "narrative page should use extracted scripts");
assert.match(page, /id="appBarStatus"[\s\S]*?role="status"[\s\S]*?aria-live="polite"/);
dataLibraries.forEach((file) => {
  assert.match(page, new RegExp(`src=["']${file.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`));
});

const scriptOrder = Array.from(page.matchAll(/<script\s+src="([^"]+)"/g), (match) => match[1]);
assert.deepEqual(scriptOrder, [
  "functions/workspace-config.js",
  "functions/app-bar.js",
  "functions/date.js",
  ...dataLibraries,
  "functions/narratives/narrative-markup.js",
  "functions/narratives/narrative-builder-engine.js",
  "functions/narratives/narrative-workspace-ui.js",
  "functions/narratives/packet-builder.js",
  "functions/narratives/build9/narrative-domain.js",
  "functions/narratives/build9/narrative-coverage.js",
  "functions/narratives/build9/encounter-summary.js",
  "functions/narratives/build9/index.js",
  "data/narratives/build9/demo-fixtures.js",
  "data/countries.js",
  "data/immigration.js",
  "functions/model/util.js",
  "functions/model/person.js",
  "functions/model/lead.js",
  "functions/model/encounter.js",
  "functions/model/store.js",
  "functions/encounter-narrative.js",
  "functions/narratives/narrative-page.js"
]);
assert.match(narratives.ENGINE_MARKUP, /class="narrative-engine-container"/);
assert.match(narratives.ENGINE_MARKUP, /class="narrative-engine-workspace"/);
assert.match(narratives.ENGINE_MARKUP, /class="narrative-input-column"/);
assert.doesNotMatch(narratives.ENGINE_MARKUP, /<main\b/i, "embedded engine should not nest a main landmark");
assert.doesNotMatch(narratives.ENGINE_MARKUP, /class="(?:container|workspace|input-column)"/);

const workspaceSource = fs.readFileSync(
  path.join(root, "functions/narratives/narrative-workspace-ui.js"),
  "utf8"
);
assert.match(workspaceSource, /narrativeSectionFilter/);
assert.match(workspaceSource, /narrative-section-selection-count/);
assert.match(workspaceSource, /narrative-ui-collapsed/);
assert.match(workspaceSource, /advanced-tools-open/);
assert.match(workspaceSource, /lockFactScroll/);
assert.match(workspaceSource, /clearLockedBox/);
assert.match(workspaceSource, /if \(badge\.textContent !== label\)/);
assert.match(workspaceSource, /button\.setAttribute\("aria-label", button\.title\)/);

const engineSource = fs.readFileSync(
  path.join(root, "functions/narratives/narrative-builder-engine.js"),
  "utf8"
);
assert.match(engineSource, /canComposeNarrative:\s*true/);
assert.match(
  engineSource,
  /field-add-button, \.field-remove-button, \.field-drag-handle/
);
assert.match(engineSource, /editButton\.hidden = !moduleConfig\.canEditTemplates/);
assert.match(engineSource, /addButton\.hidden = !moduleConfig\.canComposeNarrative/);
assert.match(engineSource, /fieldHandle\.hidden = !moduleConfig\.canComposeNarrative/);

const pageControllerSource = fs.readFileSync(
  path.join(root, "functions/narratives/narrative-page.js"),
  "utf8"
);
assert.match(pageControllerSource, /bootWorkspace/);
assert.match(pageControllerSource, /domain\.saveNarrativeById/);
assert.match(pageControllerSource, /expectedRevision: change\.expectedRevision/);
assert.match(pageControllerSource, /model\.store\.updateEncounter/);
assert.match(pageControllerSource, /conflictedParticipantIds\.has\(activeParticipantId\)/);
assert.match(pageControllerSource, /Object\.assign\(\{\}, summary/);
assert.match(pageControllerSource, /FINALIZED_NARRATIVE_IMMUTABLE/);

const legacyPage = fs.readFileSync(path.join(root, "Narrative_Builder.html"), "utf8");
assert.match(legacyPage, /url=narrative\.html/i, "legacy Build 9 entry should redirect to the integrated page");

const sharedCss = fs.readFileSync(path.join(root, "style/style.css"), "utf8");
assert.match(sharedCss, /body\.narrative-inpage \.narrative-engine-host/);
const narrativeBlockStart = sharedCss.indexOf("/* NARRATIVE BUILD 9 */");
const scopedEngineStart = sharedCss.indexOf("/* Scoped narrative engine */");
const narrativeEnd = sharedCss.indexOf("/* END NARRATIVE BUILD 9 */");
const photoPickerStart = sharedCss.indexOf("PHOTO PICKER");
assert.ok(narrativeBlockStart >= 0, "narrative build 9 CSS marker should exist");
assert.ok(scopedEngineStart > narrativeBlockStart, "scoped narrative engine CSS should follow the build 9 marker");
assert.ok(narrativeEnd > scopedEngineStart, "narrative CSS should have scoped boundaries");
assert.ok(photoPickerStart > scopedEngineStart, "photo picker CSS should follow the narrative block");
const narrativeAllCss = sharedCss.slice(narrativeBlockStart, narrativeEnd);
const narrativeCss = sharedCss.slice(scopedEngineStart, narrativeEnd);
assert.ok(narrativeCss.length > 1000, "scoped narrative engine CSS should be present");
assert.match(narrativeCss, /\.narrative-section-filter/);
assert.match(narrativeCss, /\.narrative-input-pane/);
assert.match(narrativeCss, /\.advanced-tools-open/);
assert.doesNotMatch(narrativeAllCss, /#[0-9a-f]{3,8}\b/i, "narrative styles should use app theme tokens");
assert.doesNotMatch(narrativeCss, /var\(--card-background\)[0-9a-f]/i);
assert.doesNotMatch(narrativeCss, /\.token-dialog-\.token-dialog/);
assert.doesNotMatch(narrativeCss, /\.element-editor-\.modal-section/);

console.log(
  `Narrative Build 9 tests passed (${master.length} sections, ${fields.length} fields, ${options.length} options).`
);
