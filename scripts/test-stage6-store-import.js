"use strict";

const assert = require("assert");
const { createMemoryStorage, loadModelTab, loadScript, quietConsole } = require("./support/copdoc-vm-harness.js");
const KEY = "copdocx.store.v1";
const PACKETS = "alien-book-in.saved-records.v1";
const J = value => JSON.parse(JSON.stringify(value));
const ok = value => { assert.ok(value && value.ok, value && value.error); return value; };
function setup() {
  const storage = createMemoryStorage();
  const { model, context } = loadModelTab(storage, { console: quietConsole() });
  loadScript(context, "data/association-matrix.js");
  loadScript(context, "functions/baseball-card-contract.js");
  return { storage, model, context, store: model.store };
}

// A real promotion is completely detached from both live workspace state and
// browser storage, including recovery queries that formerly read disk directly.
{
  const { storage, model, store } = setup();
  const live = ok(store.saveObjectRecord("PERSON", { personId: "p_live", name: { lastName: "LIVE" }, alienNumber: "111111111" })).record;
  const before = storage.raw(KEY), memory = store.getState();
  const packets = [{ id: "bk_stage", lastName: "STAGED", firstName: "Test", aNumber: "222222222", dateTime: "2026-09-05T10:00", formState: {} }];
  const initial = {};
  const snapshot = { localStorage: { [PACKETS]: JSON.stringify(packets) }, sessionStorage: {} };
  storage.resetWriteHistory();
  const planned = ok(store.withImportWorkspace(initial, snapshot, (api, staged) => {
    assert.strictEqual(api.getPerson(live.personId), null);
    const promotion = ok(api.promoteBookInRecord(packets[0]));
    const durable = ok(api.resolveBookInBooking("bk_stage"));
    assert.strictEqual(durable.personId, promotion.personId);
    assert.ok(durable.found, "recovery resolves freshly staged ownership without disk writes");
    const outputPackets = [Object.assign({}, packets[0], promotion)];
    staged.localStorage[PACKETS] = JSON.stringify(outputPackets);
    const data = JSON.parse(staged.localStorage[KEY]);
    data.people[promotion.personId].notes = "facade update";
    staged.localStorage[KEY] = JSON.stringify(data);
    api.loadFromDisk();
    assert.strictEqual(api.getPerson(promotion.personId).notes, "facade update");
    return promotion;
  }));
  assert.strictEqual(planned.workspace.people[planned.result.personId].notes, "facade update");
  assert.strictEqual(planned.storageSnapshot.localStorage[KEY], JSON.stringify(planned.workspace));
  assert.strictEqual(storage.writeCount(), 0);
  assert.strictEqual(storage.raw(KEY), before);
  assert.deepStrictEqual(J(store.getState()), J(memory));
  assert.deepStrictEqual(initial, {});
  assert.strictEqual(snapshot.localStorage[PACKETS], JSON.stringify(packets));
  ok(store.validateImportWorkspace(planned.workspace, {}, planned.storageSnapshot));
  assert.strictEqual(model.store, store);
}

// Missing snapshot keys are absent even when the live browser stores contain
// malformed data. Exceptions, malformed staged writes, and failed actions all
// restore the prior live state/error without attempting a browser write.
{
  const { storage, store } = setup();
  ok(store.saveObjectRecord("PERSON", { personId: "p_original", name: { lastName: "ORIGINAL" } }));
  const memory = store.getState();
  storage.setRaw(PACKETS, "{invalid");
  storage.setRaw(KEY, "{invalid");
  store.loadFromDisk();
  const priorError = store.diskError();
  assert.ok(priorError);
  const before = storage.raw(KEY);
  storage.resetWriteHistory();
  ok(store.withImportWorkspace({}, {}, api => {
    assert.strictEqual(api.diskError(), "");
    ok(api.dependenciesFor("PERSON", "p_unrelated"));
    assert.strictEqual(api.resolveBookInBooking("missing").found, false);
    ok(api.saveObjectRecord("PERSON", { personId: "p_stage" }));
    return { ok: true };
  }));
  const failed = store.withImportWorkspace({}, {}, api => {
    ok(api.saveObjectRecord("PERSON", { personId: "p_stage" }));
    throw new Error("planned failure");
  });
  assert.strictEqual(failed.code, "IMPORT_STAGE_FAILED");
  assert.strictEqual(failed.error, "planned failure");
  assert.strictEqual(store.withImportWorkspace({}, {}, (api, staged) => { staged.localStorage[KEY] = "bad JSON"; return { ok: true }; }).ok, false);
  assert.strictEqual(store.withImportWorkspace({}, {}, () => ({ ok: false, code: "REVIEW", error: "review" })).code, "REVIEW");
  assert.strictEqual(store.withImportWorkspace({}, {}, async () => ({ ok: true })).code, "IMPORT_STAGE_SYNC_REQUIRED");
  ok(store.withImportWorkspace({}, {}, api => {
    assert.strictEqual(api.withImportWorkspace({}, {}, () => ({ ok: true })).code, "IMPORT_STAGE_REENTRANT");
    return { ok: true };
  }));
  assert.strictEqual(store.diskError(), priorError);
  assert.deepStrictEqual(J(store.getState()), J(memory));
  assert.strictEqual(storage.raw(KEY), before);
  assert.strictEqual(storage.writeCount(), 0);
}

// Staged Book-In cannot convert ambiguous NIC/released/fled records into
// canonical Arrests or statistics without an explicit reviewed decision.
{
  const { store } = setup();
  for (const packet of [
    { id: "bk_nic", lastName: "NIC", caseType: "NIC" },
    { id: "bk_released", lastName: "RELEASED", outcome: "RELEASED" },
    { id: "bk_draft", lastName: "DRAFT", importDecision: { outcome: "DRAFT" } }
  ]) {
    const result = store.withImportWorkspace({}, {}, api => api.promoteBookInRecord(packet));
    assert.strictEqual(result.code, "IMPORT_CUSTODY_REVIEW");
    assert.strictEqual(Object.keys(result.workspace.people).length, 0);
  }
  const accepted = ok(store.withImportWorkspace({}, {}, api => api.promoteBookInRecord({ id: "bk_reviewed", lastName: "REVIEWED", caseType: "NIC", importDecision: { outcome: "ARRESTED" } })));
  assert.ok(accepted.result.arrestId);
}

// Full-graph validation rejects new identity splits, subject reuse, missing
// endpoints, unsupported versions, and loss of preserved lifecycle history.
{
  const { model, store, storage } = setup();
  const person = ok(store.saveObjectRecord("PERSON", { personId: "p_graph", name: { lastName: "GRAPH" } })).record;
  const encounter = model.createEncounter({ encounterId: "enc_graph", subjects: [{ subjectId: "sub_graph", personId: person.personId, role: "TARGET", outcome: "RELEASED" }] });
  ok(store.saveEncounter(encounter));
  const baseline = store.getState();
  const valid = J(baseline);
  ok(store.validateImportWorkspace(valid, baseline));
  const duplicate = J(valid); duplicate.encounters.enc_other = J(duplicate.encounters.enc_graph); duplicate.encounters.enc_other.encounterId = "enc_other";
  duplicate.encounters.enc_other.subjects[0].encounterId = "enc_other";
  assert.strictEqual(store.validateImportWorkspace(duplicate, baseline).code, "ENCOUNTER_SUBJECT_ID_CONFLICT");
  const dangling = J(valid); dangling.associations.a_new = { associationId: "a_new", from: { type: "PERSON", id: "p_graph" }, to: { type: "VEHICLE", id: "missing" } };
  assert.strictEqual(store.validateImportWorkspace(dangling, baseline).code, "IMPORT_ASSOCIATION_REFERENCE");
  const unsupported = J(valid); unsupported.encounters.enc_graph.schema = "copdocx.encounter.v99";
  assert.strictEqual(store.validateImportWorkspace(unsupported, baseline).code, "IMPORT_OBJECT_SCHEMA");
  const invalidShape = J(valid); invalidShape.people = [];
  assert.strictEqual(store.validateImportWorkspace(invalidShape, baseline).code, "IMPORT_WORKSPACE_INVALID");
  const retired = J(valid); retired.encounters.enc_graph.bookingIdentityHistory = [{ subjectId: "sub_graph", bookingId: "bk_retired", bookingUnlinked: true }];
  assert.strictEqual(store.validateImportWorkspace(valid, retired).code, "IMPORT_HISTORY_LOSS");
  const archived = J(valid); archived.people.p_graph.meta = { archivedAt: "2026-09-05", archiveReason: "history" };
  assert.strictEqual(store.validateImportWorkspace(valid, archived).code, "IMPORT_LIFECYCLE_CONFLICT");
  assert.strictEqual(store.validateImportWorkspace(JSON.parse('{"people":{"__proto__":{"personId":"x"}}}'), {}).code, "IMPORT_WORKSPACE_INVALID");
  assert.strictEqual(store.validateImportWorkspace(valid, baseline, { localStorage: { [PACKETS]: JSON.stringify([{ id: "bk_alias", bookingId: "bk_wrong" }]) } }).code, "IMPORT_BOOKIN_IDENTITY");
  assert.deepStrictEqual(J(store.getState()), baseline);
  assert.strictEqual(storage.raw(KEY), JSON.stringify(baseline));
}

// Imported saved cards retain presentation overrides, ordered convictions,
// media references and source revision without changing canonical identity.
{
  const { store, storage } = setup();
  const rawCard = { version: 2, fields: { baseballFirstName: "Presentation", baseballLastName: "OVERRIDE", baseballArrestDate: "2026-09-05" },
    content: { narrative: "Manually edited <text>", heading: "Custom heading", bullets: ["Custom bullet"] },
    criminalHistory: [{ charge: "Second", convictionDate: "2025-02-02", jurisdictionType: "County", jurisdiction: "Tarrant" }, { charge: "First", convictionDate: "2020-01-01", jurisdictionType: "City", jurisdiction: "Dallas" }],
    photoDataUrl: "data:image/png;base64,iVBORw0KGgo=", photoAdjustments: { zoom: 1.5, positionX: 30, rotation: 90, flipX: true },
    layout: { cardWidthPx: 900, photoWidthPercent: 40 }, savedAt: "2026-09-05T10:00:00Z" };
  const plan = ok(store.withImportWorkspace({}, {}, api => {
    const booking = ok(api.promoteBookInRecord({ id: "bk_card", firstName: "Canonical", lastName: "IDENTITY", dateTime: "2026-09-05T09:00" }));
    const source = { app: "alien-book-in", version: "1.12.0", schema: 5, recordId: "bk_card", revision: 800 };
    const input = { personId: booking.personId, bookingId: "bk_card", photoMediaId: "media_staged", baseballCard: rawCard, source };
    const card = ok(api.projectImportedBaseballCard(input));
    const person = api.getPerson(booking.personId);
    assert.strictEqual(person.name.firstName, "Canonical");
    assert.strictEqual(person.immigration.baseballCards.length, 1);
    assert.ok(person.objectRevision < 800);
    assert.strictEqual(card.card.importSource.revision, 800);
    assert.strictEqual(card.card.state.fields.baseballLastName, "OVERRIDE");
    assert.strictEqual(card.card.state.criminalHistory[0].charge, "Second");
    assert.strictEqual(card.card.state.criminalHistory[0].jurisdictionType, "County");
    assert.strictEqual(card.card.state.photoAdjustments.rotation, 90);
    assert.strictEqual(card.card.photoMediaId, "media_staged");
    assert.ok(card.card.html.includes("&lt;text&gt;"));
    const again = ok(api.projectImportedBaseballCard(input));
    assert.strictEqual(again.unchanged, true);
    assert.strictEqual(api.getPerson(booking.personId).objectRevision, person.objectRevision);
    assert.strictEqual(api.getLead(booking.leadId).person.immigration.baseballCards.length, 1);
    assert.strictEqual(api.projectImportedBaseballCard({ ...input, photoMediaId: "" }).code, "IMPORT_CARD_MEDIA_REQUIRED");
    return booking;
  }));
  assert.strictEqual(Object.keys(plan.workspace.people).length, 1);
  assert.strictEqual(storage.writeCount(), 0);
  assert.strictEqual(store.projectImportedBaseballCard({}).code, "IMPORT_STAGE_REQUIRED");
}

// An unfinished import blocks ordinary store writes, while preview staging
// remains possible and failed writes leave no phantom canonical objects.
{
  const { store, context, storage } = setup();
  context.COPDoc.importWorkflow = { assertWritable: () => ({ ok: false, error: "Recovery required" }) };
  assert.strictEqual(store.saveObjectRecord("PERSON", { personId: "p_blocked" }).ok, false);
  assert.strictEqual(store.getPerson("p_blocked"), null);
  ok(store.withImportWorkspace({}, {}, api => api.saveObjectRecord("PERSON", { personId: "p_staged" })));
  assert.strictEqual(storage.writeCount(), 0);
}

// Canonical import projections include the exact Encounter subject, shared
// vehicle association and officer statistic. Replays create no duplicate facts,
// and malformed/inactive officer paths roll the complete projection stage back.
{
  const { store, model, storage } = setup();
  const person = ok(store.saveObjectRecord("PERSON", { personId: "p_linked", name: { lastName: "LINKED" } })).record;
  const vehicle = ok(store.saveObjectRecord("VEHICLE", { vehicleId: "v_linked", licensePlate: "STAGE6", plateState: "TX" })).record;
  ok(store.saveEncounter(model.createEncounter({ encounterId: "enc_linked", startedAt: "2026-09-05T10:00", vehicles: [vehicle],
    subjects: [{ subjectId: "sub_linked", personId: person.personId, role: "TARGET", outcome: "ARRESTED", custody: "IN_CUSTODY", arrestingOfficerId: "officer_exact" }] })));
  const baseline = store.getState(), bytes = storage.raw(KEY);
  const ADMIN = "copdoc.admin.v1";
  function plan(officer) {
    return store.withImportWorkspace(baseline, { localStorage: { [ADMIN]: JSON.stringify({ officers: [officer], vehicles: [], shifts: [] }) } }, api => {
      const packet = { id: "bk_linked", encounterId: "enc_linked", subjectId: "sub_linked", personId: person.personId, dateTime: "2026-09-05T11:00" };
      Object.assign(packet, ok(api.promoteBookInRecord(packet)));
      const afterPromotion = api.getState();
      const projected = api.stageImportedBookingProjections(packet);
      if (!projected.ok) { assert.deepStrictEqual(J(api.getState()), J(afterPromotion), "projection failure restores canonical state"); return projected; }
      const first = api.getState();
      ok(api.stageImportedBookingProjections(projected.record));
      assert.strictEqual(api.getEncounter("enc_linked").subjects[0].bookingId, "bk_linked");
      assert.strictEqual(Object.keys(api.getState().associations).length, Object.keys(first.associations).length);
      return projected;
    });
  }
  const success = ok(plan({ id: "officer_exact", firstName: "Test", lastName: "Officer", meta: { status: "committed" } }));
  const admin = JSON.parse(success.storageSnapshot.localStorage[ADMIN]);
  assert.strictEqual(admin.officers[0].fieldArrests.length, 1);
  assert.strictEqual(admin.officers[0].fieldArrests[0].subjectId, "sub_linked");
  assert.strictEqual(admin.officers[0].fieldArrests[0].personId, person.personId);
  assert.strictEqual(admin.officers[0].fieldArrests[0].bookingId, "bk_linked");
  assert.strictEqual(plan({ id: "officer_exact", inactive: true }).code, "IMPORT_OFFICER_INACTIVE");
  assert.strictEqual(plan({ id: "officer_wrong" }).code, "IMPORT_OFFICER_REFERENCE");
  assert.strictEqual(storage.raw(KEY), bytes);
  assert.deepStrictEqual(J(store.getState()), J(baseline));
}

// Native Investigation objects use source revisions for conflict review only;
// their local concurrency revision increments through the common object rules.
{
  const { store } = setup();
  const person = ok(store.saveObjectRecord("PERSON", { personId: "p_native", name: { lastName: "NATIVE" }, notes: "local" })).record;
  const base = store.getState();
  ok(store.withImportWorkspace(base, {}, api => {
    assert.strictEqual(api.stageImportedObjectRecord("PERSON", { ...person, notes: "stale" }, person).code, "IMPORT_OBJECT_STALE");
    const changed = ok(api.stageImportedObjectRecord("PERSON", { ...person, objectRevision: 300, notes: "source update" }, person));
    assert.strictEqual(changed.record.objectRevision, person.objectRevision + 1);
    assert.strictEqual(changed.record.importSource.nativeObjectRevision, 300);
    const created = ok(api.stageImportedObjectRecord("PERSON", { personId: "p_imported", objectRevision: 400, name: { lastName: "IMPORTED" } }));
    assert.strictEqual(created.record.objectRevision, 1);
    assert.strictEqual(created.record.importSource.nativeObjectRevision, 400);
    const edited = J(created.record); edited.notes = "edited locally"; edited.objectRevision = 2;
    const repeated = ok(api.stageImportedObjectRecord("PERSON", { personId: "p_imported", objectRevision: 400, name: { lastName: "IMPORTED" } }, edited));
    assert.strictEqual(repeated.record.notes, "edited locally");
    assert.strictEqual(repeated.unchanged, true);
    assert.strictEqual(api.stageImportedObjectRecord("PERSON", { personId: "p_imported", objectRevision: 401, name: { lastName: "IMPORTED" }, notes: "source edit" }, edited).code, "IMPORT_OBJECT_EDIT_CONFLICT");
    assert.strictEqual(api.getPerson("p_native").notes, "local", "preparation leaves insertion to the full candidate graph");
    return { ok: true };
  }));
}

// Reimporting an unchanged source card preserves newer local edits; changing
// both versions requires review. Finalized/daily extensions are accepted only
// with exact booking ownership and are never synthesized from saved content.
{
  const { store, context } = setup();
  const sourceCard = { version: 2, fields: { baseballArrestDate: "2026-09-05" }, content: { narrative: "Original source", heading: "Heading", bullets: ["Original"] }, photoMediaId: "media_reference", savedAt: "2026-09-05T10:00:00Z" };
  ok(store.withImportWorkspace({}, {}, api => {
    const booking = ok(api.promoteBookInRecord({ id: "bk_versions", lastName: "VERSIONS", dateTime: "2026-09-05T09:00" }));
    const input = { personId: booking.personId, bookingId: "bk_versions", baseballCard: sourceCard };
    const first = ok(api.projectImportedBaseballCard(input));
    const person = api.getPerson(booking.personId), edited = person.immigration.baseballCards[0];
    edited.state.content.narrative = "Local manual edit";
    edited.state.photoDataUrl = ""; // Normal card UI stores Media references instead of embedded raw bytes.
    edited.state.savedAt = "2026-09-05T12:00:00Z";
    ok(api.upsertPerson(person));
    const unchanged = ok(api.projectImportedBaseballCard(input));
    assert.strictEqual(unchanged.retainedLocalEdits, true);
    assert.strictEqual(unchanged.card.state.content.narrative, "Local manual edit");
    const changedSource = J(sourceCard); changedSource.content.narrative = "Source edited separately"; changedSource.savedAt = "2026-09-05T13:00:00Z";
    assert.strictEqual(api.projectImportedBaseballCard({ ...input, baseballCard: changedSource }).code, "IMPORT_CARD_EDIT_CONFLICT");
    const finalized = J(context.COPDoc.baseball.finalize(sourceCard, { cardId: first.cardId, personId: booking.personId, bookinRecordId: "bk_versions", arrestId: booking.arrestId, arrestDateKey: "2026-09-05", photoMediaId: "media_reference", generatedAt: "2026-09-05T11:00:00Z" }));
    const importedFinal = ok(api.projectImportedBaseballCard({ ...input, finalizedSnapshot: finalized, arrestOfDay: { date: "2026-09-05", markedAt: "2026-09-05T11:00:00Z" } }));
    assert.strictEqual(importedFinal.card.state.content.narrative, "Local manual edit");
    assert.strictEqual(importedFinal.card.finalizedSnapshot.content.narrative, "Original source");
    assert.strictEqual(importedFinal.card.arrestOfDay.date, "2026-09-05");
    assert.strictEqual(api.projectImportedBaseballCard({ ...input, finalizedSnapshot: { ...finalized, personId: "other" } }).code, "IMPORT_CARD_FINALIZED_IDENTITY");
    assert.strictEqual(api.projectImportedBaseballCard({ ...input, arrestOfDay: { date: "2026-09-06" } }).code, "IMPORT_CARD_DESIGNATION");
    return { ok: true };
  }));
}

// Recovery receipts keep backup bytes for audit without becoming live object
// references. Pending commands remain dependencies and malformed journals block.
{
  const { store, storage } = setup();
  const JOURNAL = "copdocx.import-transactions.v1";
  const row = { transactionId: "import_one", status: "COMPLETED", revision: 2, appliedKeys: [], mediaCreated: ["media_recovery"], mediaPrepared: true,
    plan: { ok: true, changes: [], mediaPlans: [{ mediaId: "media_recovery", ownerType: "PERSON", ownerId: "p_recovery" }] } };
  const journal = { schema: JOURNAL, version: 1, transactions: { import_one: row } };
  storage.setRaw(JOURNAL, journal);
  assert.strictEqual(ok(store.dependenciesFor("PERSON", "p_recovery")).dependencies.length, 0);
  assert.strictEqual(ok(store.dependenciesFor("MEDIA", "media_recovery")).dependencies.length, 0);
  row.status = "APPLYING"; storage.setRaw(JOURNAL, journal);
  const pending = ok(store.dependenciesFor("MEDIA", "media_recovery"));
  assert.ok(pending.dependencies.length);
  assert.ok(pending.dependencies.every(item => item.path.startsWith("importTransactions.transactions.import_one.")));
  row.status = "ROLLED_BACK"; storage.setRaw(JOURNAL, journal);
  assert.strictEqual(ok(store.dependenciesFor("MEDIA", "media_recovery")).dependencies.length, 0);
  journal.version = 99; storage.setRaw(JOURNAL, journal);
  assert.strictEqual(store.dependenciesFor("PERSON", "p_recovery").ok, false);
}

// Own exports may restore a coordinated historical void into a fresh identity
// chain. A packet alone, altered reason, live link or preexisting owner cannot
// masquerade as a completed void or overwrite live history.
{
  const { store, storage } = setup();
  const booked = ok(store.promoteBookInRecord({ id: "bk_void_restore", lastName: "VOID_RESTORE", dateTime: "2026-09-05T09:00" }));
  const active = store.getState();
  const voided = ok(store.voidBookingProjection({ bookingId: "bk_void_restore", transactionId: "void_restore_tx", reason: "Duplicate entry", voidedAt: "2026-09-05T12:00:00Z" }));
  const candidate = store.getState();
  const packet = { id: "bk_void_restore", personId: booked.personId, leadId: booked.leadId, arrestId: booked.arrestId,
    voidedAt: voided.voidedAt, voidReason: voided.voidReason, voidTransactionId: voided.voidTransactionId };
  const before = storage.raw(KEY);
  ok(store.validateImportedVoidedBooking(packet, candidate, {}));
  assert.strictEqual(store.validateImportedVoidedBooking(packet, {}, {}).ok, false);
  assert.strictEqual(store.validateImportedVoidedBooking({ ...packet, voidReason: "Altered" }, candidate, {}).ok, false);
  assert.strictEqual(store.validateImportedVoidedBooking(packet, candidate, active).ok, false);
  const noEvent = J(candidate); noEvent.leads[booked.leadId].history = [];
  assert.strictEqual(store.validateImportedVoidedBooking(packet, noEvent, {}).ok, false);
  const activeLink = J(candidate); activeLink.encounters.enc_bad = { subjects: [{ subjectId: "s_bad", bookingId: packet.id }] };
  assert.strictEqual(store.validateImportedVoidedBooking(packet, activeLink, {}).ok, false);
  assert.strictEqual(storage.raw(KEY), before);
}

console.log("STAGE6_STORE_IMPORT_PASSED detached staging, durable identity, custody review, graph validation, card projection, and recovery write guards.");
