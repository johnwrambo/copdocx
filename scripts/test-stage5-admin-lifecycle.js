"use strict";

const assert = require("assert");
const vm = require("vm");
const { createMemoryStorage, loadScript } = require("./support/copdoc-vm-harness.js");
const ADMIN = "copdoc.admin.v1", WORKSPACE = "copdocx.store.v1", BOOKIN = "alien-book-in.saved-records.v1";
const JOURNAL = "copdocx.booking-transactions.v1";
function ok(result) { assert.ok(result && result.ok, result && result.error); return result; }
function copy(value) { return JSON.parse(JSON.stringify(value)); }
function setup(initial) {
  const storage = createMemoryStorage(initial);
  const context = { localStorage: storage.storage, indexedDB: {}, console, Date, Math, Promise, URLSearchParams, setTimeout, clearTimeout };
  context.window = context;
  vm.createContext(context);
  ["functions/model/util.js", "functions/model/location.js", "functions/model/officer.js", "functions/model/vehicle.js", "functions/officer-roster.js"].forEach(file => loadScript(context, file));
  context.COPDoc.media = { listAll: async () => [] };
  return { context, storage, api: context.COPDoc.officers };
}
function officer(id, extra) { return Object.assign({ id, officerId: id, firstName: "Test", lastName: "Officer", meta: { status: "draft", createdAt: "2026-09-01" } }, extra); }

async function main() {
  // Fresh writes share the actual constructors and retain IDs/custom history on
  // partial updates. Matching a name never silently merges distinct officers.
  {
    const { api, storage } = setup();
    const first = ok(api.saveOfficer({ firstName: "John", lastName: "Example", badge: "101" })).record;
    const second = ok(api.saveOfficer({ firstName: "John", lastName: "Example", badge: "102" })).record;
    assert.notStrictEqual(first.officerId, second.officerId);
    assert.strictEqual(first.id, first.officerId);
    assert.strictEqual(first.entityType, "OFFICER");
    let data = storage.json(ADMIN);
    data.custom = { preserve: true };
    data.officers[0].custom = "canonical extension";
    data.officers[0].fieldArrests = [{ arrestId: "arr_existing", bookingId: "bk_existing" }];
    storage.setRaw(ADMIN, data);
    ok(api.saveOfficer({ officerId: first.id, lastName: "Updated" }, { updateOnly: true }));
    data = storage.json(ADMIN);
    assert.strictEqual(data.officers[0].firstName, "John");
    assert.strictEqual(data.officers[0].fieldArrests.length, 1);
    assert.strictEqual(data.officers[0].custom, "canonical extension");
    assert.strictEqual(data.custom.preserve, true);
    const before = storage.raw(ADMIN);
    for (const patch of [
      { id: first.id, officerId: second.id }, { id: " bad " }, { id: 42 },
      { badge: "101" }, { id: first.id, fieldArrests: [] }, { id: first.id, inactive: true },
      { id: first.id, qualifications: {} }
    ]) {
      assert.strictEqual(api.saveOfficer(patch).ok, false);
      assert.strictEqual(storage.raw(ADMIN), before);
    }
    assert.strictEqual(api.saveOfficer({ id: "gone", lastName: "Lost" }, { updateOnly: true }).ok, false);
    assert.strictEqual(api.saveOfficer({ id: first.id }, { createOnly: true }).ok, false);
    storage.failNext(ADMIN);
    assert.strictEqual(api.saveOfficer({ id: first.id, lastName: "Not saved" }).ok, false);
    assert.strictEqual(storage.raw(ADMIN), before);
    assert.strictEqual(storage.json(ADMIN).officers[0].lastName, "Updated");
    const baseline = copy(data.officers[0]);
    ok(api.saveOfficer({ id: first.id, lastName: "Other tab" }));
    assert.strictEqual(api.saveOfficer({ id: first.id, lastName: "Stale overwrite" }, { expectedRecord: baseline }).ok, false);
    ok(api.saveOfficer({ id: first.id, phoneGov: "555" }, { expectedRecord: baseline }));
    assert.strictEqual(storage.json(ADMIN).officers[0].lastName, "Other tab", "unrelated fields survive a deliberate partial patch");
  }

  // Fleet is intentionally Admin-owned. Name or alias edits retain custom fields,
  // existing Location data and historical assignment IDs without registry copies.
  {
    const { api, storage } = setup({ [ADMIN]: { officers: [officer("active", { meta: { status: "committed" } }), officer("inactive", { inactive: true })], vehicles: [], shifts: [] } });
    const vehicle = ok(api.saveFleetVehicle({ unit: "Unit 1", plate: "ABC", plateState: "TX", vin: "VIN1", assignedOfficerIds: ["active"], locations: [{ locationId: "garage", street: "Base" }], registeredOwnerName: "Agency", meta: { status: "committed" } })).record;
    assert.strictEqual(vehicle.id, vehicle.vehicleId);
    assert.strictEqual(vehicle.governmentVehicle, true);
    assert.strictEqual(storage.raw(WORKSPACE), null, "fleet does not mint a civilian Vehicle");
    ok(api.saveFleetVehicle({ id: vehicle.id, unit: "Unit 2" }));
    let stored = storage.json(ADMIN).vehicles[0];
    assert.strictEqual(stored.locations[0].locationId, "garage");
    assert.strictEqual(stored.registeredOwnerName, "Agency");
    assert.strictEqual(stored.licensePlate, "ABC");
    for (const patch of [ { plate: "abc", plateState: "tx" }, { vin: "vin1" }, { id: vehicle.id, plate: "ABC", licensePlate: "XYZ" }, { id: vehicle.id, governmentVehicle: false }, { id: vehicle.id, assignedOfficerIds: ["inactive"] }, { id: vehicle.id, assignedOfficerIds: ["missing"] } ]) {
      assert.strictEqual(api.saveFleetVehicle(patch).ok, false);
    }
    ok(api.archiveRecord("officers", "active"));
    ok(api.saveFleetVehicle({ id: vehicle.id, unit: "Historical assignment retained", assignedOfficerIds: ["active"] }));
    ok(api.archiveRecord("vehicles", vehicle.id));
    assert.strictEqual(api.listFleet().length, 0);
    assert.ok(storage.json(ADMIN).vehicles[0].archivedAt);
    ok(api.restoreRecord("vehicles", vehicle.id));
    assert.strictEqual(api.listFleet().length, 1);
  }

  // Archiving is nondestructive even with uninspectable dependencies. Explicit
  // deletion is confined to archived, unreferenced drafts and never deletes Media.
  {
    const { api, context, storage } = setup({ [ADMIN]: { officers: [officer("draft"), officer("historic", { meta: { status: "committed" } }), officer("formerly-filed", { inactive: true, meta: { status: "draft", committedAt: "2026-09-01" } })], vehicles: [], shifts: [] } });
    ok(api.archiveRecord("officers", "historic"));
    assert.strictEqual(api.listCommitted().length, 0);
    assert.strictEqual(api.get("historic").officerId, "historic", "historical labels remain available");
    assert.strictEqual((await api.deleteDraft("officers", "historic")).ok, false);
    assert.strictEqual((await api.deleteDraft("officers", "formerly-filed")).ok, false, "later autosave cannot make a filed identity disposable");
    ok(api.restoreRecord("officers", "historic"));
    assert.strictEqual(api.listCommitted().length, 1);
    ok(api.archiveRecord("officers", "draft"));
    const clean = storage.raw(ADMIN);
    for (const [storeKey, value] of [
      [WORKSPACE, { encounters: { enc1: { encounterId: "enc1", subjects: [{ subjectId: "sub1", arrestingOfficerId: "draft" }] } } }],
      [WORKSPACE, { people: { p1: { arrests: [{ arrestId: "a1", arrestingOfficerId: "draft" }] } } }],
      [WORKSPACE, { operations: { op1: { teams: [{ members: [{ officerId: "draft" }] }] } } }],
      [WORKSPACE, { investigations: { inv1: { assignedOfficerId: "draft" } } }],
      [BOOKIN, [{ id: "bk1", formState: { arrestingOfficerId: { value: "draft" } } }]],
      [JOURNAL, { transactions: { tx1: { request: { packet: { arrestingOfficerId: "draft" } } } } }]
    ]) {
      storage.setRaw(storeKey, value);
      const inspection = ok(await api.inspectDependencies("officers", "draft"));
      assert.ok(inspection.references.length, storeKey);
      assert.strictEqual((await api.deleteDraft("officers", "draft")).ok, false);
      assert.strictEqual(storage.raw(ADMIN), clean);
      storage.storage.removeItem(storeKey);
    }
    for (const [storeKey, value] of [[WORKSPACE, "{"], [WORKSPACE, { encounters: [] }], [WORKSPACE, { encounters: { bad: null } }], [WORKSPACE, { encounters: { bad: { subjects: "malformed" } } }], [BOOKIN, {}], [JOURNAL, { transactions: [] }]]) {
      storage.setRaw(storeKey, value);
      assert.strictEqual((await api.deleteDraft("officers", "draft")).ok, false);
      assert.strictEqual(storage.raw(ADMIN), clean);
      storage.storage.removeItem(storeKey);
    }
    context.COPDoc.media.listAll = async () => [{ mediaId: "photo", owner: { type: "OFFICER", id: "draft" } }];
    assert.strictEqual((await api.deleteDraft("officers", "draft")).ok, false);
    context.COPDoc.media.listAll = async () => { throw new Error("media unreadable"); };
    assert.strictEqual((await api.deleteDraft("officers", "draft")).ok, false);
    context.COPDoc.media.listAll = async () => [];
    delete context.indexedDB;
    assert.strictEqual((await api.deleteDraft("officers", "draft")).ok, false, "an in-memory Media fallback cannot prove durable references absent");
    context.indexedDB = {};
    storage.failNext(ADMIN);
    assert.strictEqual((await api.deleteDraft("officers", "draft")).ok, false);
    assert.strictEqual(storage.raw(ADMIN), clean);
    ok(await api.deleteDraft("officers", "draft"));
    assert.strictEqual(storage.json(ADMIN).officers.some(row => row.id === "draft"), false);
  }

  // A new reference introduced during asynchronous media inspection is detected
  // before deletion; nested owners and fleet snapshots use the same dependency rule.
  {
    const { api, context, storage } = setup({ [ADMIN]: { officers: [officer("race", { inactive: true })], vehicles: [{ id: "fleet", vehicleId: "fleet", governmentVehicle: true, inactive: true, meta: { status: "draft" } }], shifts: [] } });
    let reads = 0;
    context.COPDoc.media.listAll = async () => { reads++; if (reads === 1) storage.setRaw(BOOKIN, [{ id: "new-booking", arrestingOfficerId: "race" }]); return []; };
    assert.strictEqual((await api.deleteDraft("officers", "race")).ok, false);
    assert.strictEqual(storage.json(ADMIN).officers.length, 1);
    storage.storage.removeItem(BOOKIN);
    context.COPDoc.media.listAll = async () => [];
    storage.setRaw(WORKSPACE, { operations: { op: { teams: [{ vehicleId: "fleet" }] } } });
    assert.strictEqual((await api.deleteDraft("vehicles", "fleet")).ok, false);
    storage.setRaw(WORKSPACE, { associations: { ref: { a: { type: "VEHICLE", id: "fleet" } } } });
    assert.strictEqual((await api.deleteDraft("vehicles", "fleet")).ok, false);
  }

  // Voiding a durable officer fact is idempotent, retains exact provenance and
  // excludes the fact from active counts. Rebooking cannot resurrect it.
  {
    const { api, storage } = setup({ [ADMIN]: { officers: [officer("a", { meta: { status: "committed" } }), officer("b", { meta: { status: "committed" } })], vehicles: [], shifts: [] } });
    const fact = { arrestId: "arrest", bookingId: "booking", subjectId: "subject", encounterId: "encounter", personId: "person", bookedAt: "2026-09-05T10:00" };
    ok(api.recordFieldArrest("a", fact));
    ok(api.recordFieldArrest("b", fact));
    const request = { ...fact, reason: "Entered twice", voidedAt: "2026-09-05T12:00", transactionId: "void1" };
    const before = storage.raw(ADMIN);
    for (const requestBad of [{ ...request, personId: "wrong" }, { ...request, bookingId: "wrong" }, { ...request, arrestId: "wrong" }, { ...request, bookinRecordId: "split" }, { ...request, reason: "" }]) {
      assert.strictEqual(api.voidFieldArrest("a", requestBad).ok, false);
      assert.strictEqual(storage.raw(ADMIN), before);
    }
    storage.failNext(ADMIN);
    assert.strictEqual(api.voidFieldArrest("a", request).ok, false);
    assert.strictEqual(storage.raw(ADMIN), before);
    ok(api.voidFieldArrest("a", request));
    assert.strictEqual(api.listFieldArrests("a").length, 0);
    assert.strictEqual(api.listFieldArrests("a", { includeVoided: true }).length, 1);
    assert.strictEqual(api.listFieldArrests("b").length, 1, "other officers remain independently recoverable");
    storage.resetWriteHistory();
    assert.strictEqual(ok(api.voidFieldArrest("a", request)).alreadyVoided, true);
    assert.strictEqual(storage.writeCount(), 0);
    assert.strictEqual(api.recordFieldArrest("a", fact).ok, false);
    assert.strictEqual(api.voidFieldArrest("a", { ...request, transactionId: "different" }).ok, false);
    ok(api.voidFieldArrest("b", request));
    const stored = storage.json(ADMIN).officers[0].fieldArrests[0];
    assert.strictEqual(stored.voidReason, request.reason);
    assert.strictEqual(stored.voidTransactionId, request.transactionId);
    assert.strictEqual(stored.bookedAt, fact.bookedAt);
    assert.strictEqual(stored.personId, fact.personId);
    ok(api.archiveRecord("officers", "a"));
    assert.strictEqual((await api.deleteDraft("officers", "a")).ok, false);
    assert.strictEqual(api.recordFieldArrest("a", { arrestId: "new", bookingId: "new" }).ok, false);
    assert.strictEqual(ok(api.voidFieldArrest("a", { ...request, arrestId: "absent", bookingId: "absent" })).missing, true);
  }

  // Parseable corruption and alias collisions must not be treated as an empty
  // roster. Read-only pickers return no candidates instead of throwing.
  for (const raw of ["{broken", "null", "[]", '{"officers":{}}', JSON.stringify({ officers: [officer("same"), officer("same")] }), JSON.stringify({ officers: [{ id: "a", officerId: "b" }] }), JSON.stringify({ officers: [officer("a", { fieldArrests: {} })] })]) {
    const { api, storage } = setup({ [ADMIN]: raw });
    assert.strictEqual(api.saveOfficer({ firstName: "New" }).ok, false);
    assert.strictEqual(api.archiveRecord("officers", "a").ok, false);
    assert.strictEqual((await api.deleteDraft("officers", "a")).ok, false);
    assert.strictEqual(api.listCommitted().length, 0);
    assert.strictEqual(storage.raw(ADMIN), raw);
  }

  // Execute the actual Admin form controller against a minimal DOM: a stale tab
  // cannot overwrite a newer name or erase a concurrently recorded Arrest fact.
  {
    const { api, context, storage } = setup({ [ADMIN]: { officers: [officer("form", { badge: "99", address: { locationId: "home", street: "Home" }, locations: [{ locationId: "home", street: "Home" }, { locationId: "office", street: "Office" }], meta: { status: "committed" } })], vehicles: [], shifts: [], custom: "preserve" } });
    function element(id) { return { id, value: "", dataset: {}, listeners: {}, addEventListener(name, fn) { this.listeners[name] = fn; }, focus() {}, matches() { return false; }, querySelector() { return null; }, querySelectorAll() { return []; }, replaceChildren() {}, setAttribute() {} }; }
    const nodes = Object.fromEntries(["appBarPrimaryAction", "officerLastName", "officerFirstName", "officerBadge", "officerDuty", "officerTeam", "statOfficers", "statVehicles", "statArrestsWeek", "statArrestsFy"].map(id => [id, element(id)]));
    context.COPDoc.model.store = { loadFromDisk() {}, listArrests: () => [{ arrest: { arrestId: "active" } }, { arrest: { arrestId: "void1", voidedAt: "2026-09-05" } }, { arrest: { arrestId: "void2", status: "VOIDED" } }] };
    const messages = [];
    context.COPDoc.setAppBarStatus = message => messages.push(message);
    context.location = { search: "?id=form", href: "" };
    context.addEventListener = () => {};
    context.document = {
      readyState: "complete", body: { getAttribute: () => "officer-form" },
      getElementById: id => nodes[id] || null,
      querySelector: selector => selector === '#appBarPrimaryAction[data-chrome-action="save"]' ? nodes.appBarPrimaryAction : null,
      querySelectorAll: () => [], addEventListener() {}
    };
    loadScript(context, "functions/admin.js");
    assert.strictEqual(nodes.officerLastName.value, "Officer");
    assert.strictEqual(nodes.statArrestsWeek.textContent, "1", "Admin week count excludes voided facts");
    assert.strictEqual(nodes.statArrestsFy.textContent, "1", "Admin fiscal-year count excludes voided facts");
    assert.strictEqual(storage.json(ADMIN).officers[0].locations[1].locationId, "office", "loading Admin preserves additional canonical places");
    ok(api.recordFieldArrest("form", { arrestId: "form_arrest", bookingId: "form_booking" }));
    nodes.officerFirstName.value = "Edited";
    nodes.appBarPrimaryAction.listeners.click({});
    assert.strictEqual(storage.json(ADMIN).officers[0].firstName, "Edited");
    assert.strictEqual(storage.json(ADMIN).officers[0].fieldArrests.length, 1);
    assert.strictEqual(storage.json(ADMIN).custom, "preserve");
    ok(api.saveOfficer({ id: "form", lastName: "Other tab" }));
    nodes.officerLastName.value = "Stale";
    nodes.appBarPrimaryAction.listeners.click({});
    assert.strictEqual(storage.json(ADMIN).officers[0].lastName, "Other tab");
    assert.ok(messages.some(message => /changed in another window/.test(message)));
  }

  console.log("STAGE5_ADMIN_LIFECYCLE_PASSED shared officer/fleet creation, partial edits, failure handling, archive/dependency policy, safe draft deletion, voided statistics and real Admin save controller.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
