/**
 * Persistence for lead snapshots.
 *
 * Browser: localStorage key copdocx.store.v1
 * Node tests: in-memory only (no window.localStorage).
 *
 * The store is a dictionary of snapshots plus a people registry. The
 * registry is how "another saved person" shows up in link-card search —
 * every subject you have ever saved is a person you can link to.
 * Incomplete people stay in the registry. Linking never rewrites names.
 */

(function (global) {
  "use strict";

  var root = (global.COPDoc = global.COPDoc || {});
  var model = (root.model = root.model || {});
  var storagePort = root.repositories.storage;
  var STORAGE_KEY =
    (root.config && root.config.storageKey("workspace")) || "copdocx.store.v1";

  function emptyState() {
    return {
      schema: model.STORE_SCHEMA || "copdocx.store.v1",
      currentLeadId: "",
      people: {},
      leads: {},
      encounters: {},
      investigations: {},
      vehicles: {},
      locations: {},
      businesses: {},
      entities: {},
      associations: {},
      operations: {}
    };
  }

  var state = emptyState();
  var diskError = "";
  var workspaceMutationDepth = 0;
  var importWorkspaceContext = null;

  // Import planning executes the real domain commands against detached data.
  // Storage is an explicit raw-value snapshot, never a replacement for the
  // browser's Storage object; absent snapshot keys cannot leak live records.
  function storageRaw(medium, key) {
    if (importWorkspaceContext) {
      var values = importWorkspaceContext.storageSnapshot[medium] || {};
      return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null;
    }
    return storagePort.has(medium) ? storagePort.read(medium, key) : null;
  }

  function importStorageSnapshot(snapshot) {
    snapshot = snapshot || {};
    var grouped = Object.prototype.hasOwnProperty.call(snapshot, "localStorage") ||
      Object.prototype.hasOwnProperty.call(snapshot, "sessionStorage");
    var out = { localStorage: {}, sessionStorage: {} };
    ["localStorage", "sessionStorage"].forEach(function (medium) {
      var values = grouped ? snapshot[medium] || {} : medium === "localStorage" ? snapshot : {};
      if (!values || typeof values !== "object" || Array.isArray(values)) { throw new Error("Import storage snapshots must contain raw-value dictionaries."); }
      Object.keys(values).forEach(function (key) {
        if (values[key] !== null && typeof values[key] !== "string") { throw new Error("Import snapshot values must be exact strings or null: " + key); }
        Object.defineProperty(out[medium], key, { value: values[key], enumerable: true, writable: true, configurable: true });
      });
    });
    return out;
  }

  function withImportWorkspace(workspace, storageSnapshot, action) {
    if (importWorkspaceContext || workspaceMutationDepth) {
      return { ok: false, code: "IMPORT_STAGE_REENTRANT", error: "An import stage cannot nest inside another workspace operation." };
    }
    if (typeof action !== "function" || action.constructor && action.constructor.name === "AsyncFunction") {
      return { ok: false, code: "IMPORT_STAGE_SYNC_REQUIRED", error: "Import staging requires a synchronous action." };
    }
    var originalState = state;
    var originalError = diskError;
    var originalDepth = workspaceMutationDepth;
    var output;
    try {
      var checked = importWorkspaceShape(workspace);
      if (!checked.ok) { return checked; }
      var stagedStorage = importStorageSnapshot(storageSnapshot);
      state = clone(workspace);
      Object.keys(emptyState()).forEach(function (key) {
        if (state[key] === undefined) { state[key] = clone(emptyState()[key]); }
      });
      stagedStorage.localStorage[STORAGE_KEY] = JSON.stringify(state);
      importWorkspaceContext = { storageSnapshot: stagedStorage, workspaceRaw: stagedStorage.localStorage[STORAGE_KEY] };
      diskError = "";
      workspaceMutationDepth = 1;
      var result = action(model.store, stagedStorage);
      if (result && typeof result.then === "function") { throw new Error("Import staging cannot continue after an asynchronous action."); }
      var fresh = adoptDisk();
      if (!fresh.ok) { throw new Error(fresh.error); }
      output = { ok: !(result && result.ok === false), workspace: clone(state), storageSnapshot: clone(stagedStorage), result: result === undefined ? null : clone(result), error: result && result.ok === false ? result.error || "Import staging failed." : "" };
      if (result && result.code) { output.code = result.code; }
    } catch (error) {
      output = { ok: false, code: "IMPORT_STAGE_FAILED", error: error && error.message || "Import staging failed." };
    } finally {
      state = originalState;
      diskError = originalError;
      workspaceMutationDepth = originalDepth;
      importWorkspaceContext = null;
    }
    return output;
  }

  // Synchronous compound creates stage only workspace state. Child saves/read
  // refreshes remain in the staged graph; the outer call has one durable write.
  function atomicWorkspaceMutation(action) {
    return function () {
      var args = arguments;
      if (workspaceMutationDepth) { return action.apply(null, args); }
      var fresh = adoptDisk();
      if (!fresh.ok) { return { ok: false, error: fresh.error }; }
      var before = clone(state);
      var result;
      workspaceMutationDepth = 1;
      try { result = action.apply(null, args); }
      catch (error) {
        state = before;
        return { ok: false, code: "WORKSPACE_MUTATION_FAILED", error: error && error.message || "Could not prepare the object and its relationships." };
      } finally { workspaceMutationDepth = 0; }
      if (!result || !result.ok) { state = before; return result || { ok: false, error: "The object and relationship could not be prepared." }; }
      if (JSON.stringify(before) === JSON.stringify(state)) { return result; }
      if (!writeDisk()) {
        state = before;
        return Object.assign({}, result, { ok: false, code: "WORKSPACE_WRITE_FAILED", error: "Could not persist the object and its relationships. All changes were rolled back." });
      }
      return result;
    };
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  var canonicalRecords = root.domain.createCanonicalRecords({
    model: model,
    clone: clone,
    getWorkspace: function () { return state; }
  });
  var mergeRecord = canonicalRecords.mergeRecord;
  var canonicalPersonRecord = canonicalRecords.canonicalPersonRecord;
  var matchingById = canonicalRecords.matchingById;
  var canonicalLocationRecord = canonicalRecords.canonicalLocationRecord;
  var canonicalVehicleRecord = canonicalRecords.canonicalVehicleRecord;
  var canonicalLeadGraph = canonicalRecords.canonicalLeadGraph;
  var mergeCasePerson = canonicalRecords.mergeCasePerson;

  /*
   * Read-only pages may omit encounter.js. The subject policy provides legacy
   * normalization and delegates to the model's adapters when they are loaded.
   * Providers follow state replacement during disk refresh and import staging.
   */
  var encounterSubjectPolicy = root.domain.createEncounterSubjectPolicy({
    model: model,
    clone: clone,
    mergeRecord: mergeRecord,
    getWorkspace: function () { return state; }
  });
  var storeSubjectText = encounterSubjectPolicy.storeSubjectText;
  var storeSubjectOwn = encounterSubjectPolicy.storeSubjectOwn;
  var storeSubjectId = encounterSubjectPolicy.storeSubjectId;
  var storeSubjectBookingId = encounterSubjectPolicy.storeSubjectBookingId;
  var leadOwnerIdentity = encounterSubjectPolicy.leadOwnerIdentity;
  var storeSubjectRole = encounterSubjectPolicy.storeSubjectRole;
  var storeSubjectOccupantRole = encounterSubjectPolicy.storeSubjectOccupantRole;
  var normalizeEncounterSubjectsForStore = encounterSubjectPolicy.normalizeEncounterSubjectsForStore;
  var normalizeEncounterSubjectForStore = encounterSubjectPolicy.normalizeEncounterSubjectForStore;
  var mergeEncounterSubjectsForStore = encounterSubjectPolicy.mergeEncounterSubjectsForStore;
  var normalizeEncounterStateRecord = encounterSubjectPolicy.normalizeEncounterStateRecord;
  var encounterOwnershipRows = encounterSubjectPolicy.encounterOwnershipRows;
  var encounterSubjectIdentityConflict = encounterSubjectPolicy.encounterSubjectIdentityConflict;
  var canonicalizeEncounterMapKeys = encounterSubjectPolicy.canonicalizeEncounterMapKeys;

  function normalizeState(next) {
    next = next || emptyState();
    next.schema = next.schema || model.STORE_SCHEMA || "copdocx.store.v1";
    next.people = next.people || {};
    next.leads = next.leads || {};
    next.encounters = next.encounters || {};
    next.investigations = next.investigations || {};
    next.vehicles = next.vehicles || {};
    next.locations = next.locations || {};
    next.businesses = next.businesses || {};
    next.entities = next.entities || {};
    next.associations = next.associations || {};
    next.operations = next.operations || {};
    next.currentLeadId = next.currentLeadId || "";
    Object.keys(next.leads).forEach(function (id) {
      if (typeof model.ensureRecordMeta === "function") {
        model.ensureRecordMeta(next.leads[id]);
      }
    });
    Object.keys(next.encounters).forEach(function (id) {
      normalizeEncounterStateRecord(next.encounters[id], id);
      if (typeof model.ensureRecordMeta === "function") {
        model.ensureRecordMeta(next.encounters[id]);
      }
    });
    Object.keys(next.investigations).forEach(function (id) {
      if (typeof model.ensureRecordMeta === "function") {
        model.ensureRecordMeta(next.investigations[id]);
      }
    });
    Object.keys(next.vehicles).forEach(function (id) {
      if (typeof model.ensureRecordMeta === "function") {
        model.ensureRecordMeta(next.vehicles[id]);
      }
    });
    Object.keys(next.locations).forEach(function (id) {
      if (typeof model.ensureRecordMeta === "function") {
        model.ensureRecordMeta(next.locations[id]);
      }
    });
    Object.keys(next.businesses).forEach(function (id) {
      if (typeof model.ensureRecordMeta === "function") {
        model.ensureRecordMeta(next.businesses[id]);
      }
    });
    Object.keys(next.entities).forEach(function (id) {
      if (typeof model.ensureRecordMeta === "function") {
        model.ensureRecordMeta(next.entities[id]);
      }
    });
    Object.keys(next.operations).forEach(function (id) {
      if (typeof model.ensureRecordMeta === "function") {
        model.ensureRecordMeta(next.operations[id]);
      }
    });
    return next;
  }

  function readDisk() {
    if (!importWorkspaceContext && !storagePort.has("localStorage")) {
      return { ok: true, missing: true, data: null, error: "" };
    }
    var raw = "";
    try {
      raw = storageRaw("localStorage", STORAGE_KEY) || "";
    } catch (err) {
      return {
        ok: false,
        missing: false,
        data: null,
        error: "Cannot read localStorage."
      };
    }
    if (!raw) {
      return { ok: true, missing: true, data: null, error: "" };
    }
    try {
      return { ok: true, missing: false, data: JSON.parse(raw), error: "" };
    } catch (err) {
      return {
        ok: false,
        missing: false,
        data: null,
        error:
          "Lead storage is damaged. Do not Save. Copy the site data out if you have a backup."
      };
    }
  }

  function writeDisk() {
    if (diskError) {
      return false;
    }
    if (importWorkspaceContext) {
      var raw = JSON.stringify(state);
      importWorkspaceContext.storageSnapshot.localStorage[STORAGE_KEY] = raw;
      importWorkspaceContext.workspaceRaw = raw;
      return true;
    }
    if (workspaceMutationDepth) { return true; }
    if (root.importWorkflow && typeof root.importWorkflow.assertWritable === "function") {
      var importGuard = root.importWorkflow.assertWritable();
      if (!importGuard || !importGuard.ok) { return false; }
    }
    if (!storagePort.has("localStorage")) {
      return true;
    }
    try {
      storagePort.write("localStorage", STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch (err) {
      return false;
    }
  }

  function adoptDisk() {
    if (importWorkspaceContext) {
      var stagedRaw = storageRaw("localStorage", STORAGE_KEY);
      if (stagedRaw !== importWorkspaceContext.workspaceRaw) {
        try {
          var staged = JSON.parse(stagedRaw);
          var valid = importWorkspaceShape(staged);
          if (!valid.ok) { diskError = valid.error; return valid; }
          state = staged;
          Object.keys(emptyState()).forEach(function (key) {
            if (state[key] === undefined) { state[key] = clone(emptyState()[key]); }
          });
          importWorkspaceContext.workspaceRaw = stagedRaw;
        } catch (error) {
          diskError = "Staged workspace storage is malformed.";
          return { ok: false, code: "IMPORT_WORKSPACE_INVALID", error: diskError };
        }
      }
      diskError = "";
      return { ok: true, error: "" };
    }
    if (workspaceMutationDepth) { return { ok: true, error: "" }; }
    var disk = readDisk();
    if (!disk.ok) {
      diskError = disk.error;
      return { ok: false, error: disk.error };
    }
    diskError = "";
    if (disk.data) {
      var encounterKeys = canonicalizeEncounterMapKeys(disk.data);
      if (!encounterKeys.ok) {
        diskError = encounterKeys.error;
        return { ok: false, error: encounterKeys.error };
      }
      state = normalizeState(disk.data);
    }
    return { ok: true, error: "" };
  }

  function loadFromDisk() {
    adoptDisk();
    return state;
  }

  function rememberPeople(snapshot) {
    var subject = model.subjectOf ? model.subjectOf(snapshot) : snapshot.person;
    if (subject && subject.personId) {
      state.people[subject.personId] = clone(
        canonicalPersonRecord(subject, state.people[subject.personId])
      );
    }
    (snapshot.people || []).forEach(function (person) {
      if (person && person.personId) {
        state.people[person.personId] = clone(
          state.people[person.personId] || canonicalPersonRecord(person, null)
        );
      }
    });
  }

  /**
   * Save a snapshot. opts.mode: "draft" | "commit" (default commit).
   * Collect's meta does not win — previous committedAt is preserved on draft.
   * rememberPeople on every save so the subject exists in people{} immediately.
   */
  function saveLead(snapshot, opts) {
    if (!snapshot || !snapshot.leadId) {
      return { ok: false, leadId: "", error: "Snapshot is missing a leadId." };
    }
    var fresh = adoptDisk();
    if (!fresh.ok) {
      return { ok: false, leadId: snapshot.leadId, error: fresh.error };
    }
    var mode = (opts && opts.mode) || "commit";
    var saveBefore = clone(state);
    var bookingBefore = opts && opts.bookingWorkflow ? saveBefore : null;
    var previous = state.leads[snapshot.leadId]
      ? clone(state.leads[snapshot.leadId])
      : null;
    if (previous && previous.meta && previous.meta.archivedAt) { return { ok: false, leadId: snapshot.leadId, code: "OBJECT_ARCHIVED", error: "This Case is archived. Restore it explicitly before editing." }; }
    var merged = mergeRecord(previous, snapshot);
    var incomingSubject = model.subjectOf
      ? model.subjectOf(snapshot)
      : snapshot.person;
    var previousSubject = previous && model.subjectOf
      ? model.subjectOf(previous)
      : previous && previous.person;
    var incomingSubjectId =
      (incomingSubject && incomingSubject.personId) || snapshot.subjectPersonId || "";
    var previousSubjectId =
      (previousSubject && previousSubject.personId) ||
      (previous && previous.subjectPersonId) ||
      "";
    if (
      incomingSubject &&
      incomingSubjectId &&
      previousSubjectId &&
      incomingSubjectId !== previousSubjectId
    ) {
      merged.person = clone(incomingSubject);
      merged.subjectPersonId = incomingSubjectId;
    }
    if (incomingSubject) {
      var personIdentity = validateObjectId("PERSON", incomingSubject);
      if (!personIdentity.ok || (snapshot.subjectPersonId && snapshot.subjectPersonId !== personIdentity.objectId)) {
        return { ok: false, leadId: snapshot.leadId, code: "OBJECT_ID_CONFLICT", error: "The Case Person identifiers must agree." };
      }
      var canonical = incomingSubjectId && state.people[incomingSubjectId];
      if (canonical && incomingSubject.objectRevision != null && Number(incomingSubject.objectRevision) !== Number(canonical.objectRevision || 0)) {
        return { ok: false, leadId: snapshot.leadId, code: "OBJECT_STALE", error: "This Person changed since the editor opened. Reload the Case before saving." };
      }
      var personEdit = !previous && canonical && !bookingBefore
        ? { ok: true, record: clone(canonical), error: "" }
        : mergeCasePerson(incomingSubject, incomingSubjectId === previousSubjectId ? previousSubject : null, canonical, !!bookingBefore);
      if (!personEdit.ok) { return { ok: false, leadId: snapshot.leadId, code: "OBJECT_STALE", error: personEdit.error }; }
      var preparedPerson = prepareObjectRecord("PERSON", personEdit.record, {});
      if (!preparedPerson.ok) { return { ok: false, leadId: snapshot.leadId, code: preparedPerson.code, error: preparedPerson.error }; }
      merged.person = preparedPerson.record;
    }
    var graph = stageObjectGraph(merged);
    if (!graph.ok) { state = saveBefore; return { ok: false, leadId: snapshot.leadId, code: graph.code, error: graph.error }; }
    var record = canonicalLeadGraph(merged, previous);
    if (bookingBefore) {
      var bookingSubject = model.subjectOf ? model.subjectOf(record) : record.person;
      var bookingPerson = bookingSubject && state.people[bookingSubject.personId];
      if (bookingPerson && Array.isArray(bookingPerson.encounters)) {
        bookingSubject.encounters = clone(bookingPerson.encounters);
      }
    }
    record.schema = snapshot.schema || model.SCHEMA;
    record.leadId = snapshot.leadId;
    if (typeof model.stampMeta === "function") {
      record.meta = model.stampMeta(previous, mode);
    } else {
      record.meta = snapshot.meta || {};
      record.meta.updatedAt = model.nowIso();
    }
    record.meta.markedComplete = false;
    rememberPeople(record);
    syncNestedOccupancyToAssociations(record);
    syncLeadLinksToAssociations(record, saveBefore.associations);
    applyAssociationNestingToLead(record);
    state.leads[record.leadId] = clone(record);
    state.currentLeadId = record.leadId;
    rememberPeople(record);
    if (bookingBefore && opts.bookingTransactionId) {
      var savedBookingPerson = state.people[record.subjectPersonId];
      var savedBookingArrest = savedBookingPerson && (savedBookingPerson.arrests || []).filter(function (row) {
        return row && row.arrestId === opts.bookingArrestId;
      })[0];
      var leadBookingArrest = record.person && (record.person.arrests || []).filter(function (row) {
        return row && row.arrestId === opts.bookingArrestId;
      })[0];
      if (!savedBookingArrest || !leadBookingArrest) {
        state = bookingBefore;
        return { ok: false, leadId: record.leadId, error: "The booking Arrest acknowledgement could not be prepared." };
      }
      savedBookingArrest.bookingTransactionId = opts.bookingTransactionId;
      savedBookingArrest.bookingTransactionSource = bookingSourceFingerprint(savedBookingPerson, savedBookingArrest);
      leadBookingArrest.bookingTransactionId = savedBookingArrest.bookingTransactionId;
      leadBookingArrest.bookingTransactionSource = savedBookingArrest.bookingTransactionSource;
      state.leads[record.leadId] = clone(record);
    }
    if (!writeDisk()) {
      state = saveBefore;
      return {
        ok: false,
        leadId: record.leadId,
        error: "Could not write localStorage (quota or private mode)."
      };
    }
    return { ok: true, leadId: record.leadId, error: "" };
  }

  function getLead(leadId) {
    var snap = state.leads[leadId];
    return snap ? clone(snap) : null;
  }

  function nameFromLabel(label) {
    var text = String(label || "").trim();
    if (typeof global.parsePersonName === "function") {
      var parsed = global.parsePersonName(text);
      return {
        lastName: (parsed && parsed.last) || "",
        firstName: (parsed && parsed.first) || "",
        middleName: (parsed && parsed.middle) || ""
      };
    }
    var comma = text.indexOf(",");
    if (comma !== -1) {
      var rest = text.slice(comma + 1).trim().split(/\s+/);
      return {
        lastName: text.slice(0, comma).trim(),
        firstName: rest[0] || "",
        middleName: rest.slice(1).join(" ")
      };
    }
    var bits = text.split(/\s+/).filter(Boolean);
    if (bits.length <= 1) {
      return { lastName: bits[0] || "", firstName: "", middleName: "" };
    }
    return {
      firstName: bits[0],
      middleName: bits.slice(1, -1).join(" "),
      lastName: bits[bits.length - 1]
    };
  }

  function parsePlateLabel(label) {
    var text = String(label || "").trim();
    if (!text) {
      return { plate: "", state: "" };
    }
    if (root.plates && typeof root.plates.parse === "function") {
      var parsed = root.plates.parse(text);
      var row = parsed && parsed.rows && parsed.rows[0];
      if (row && (row.plate || row.state)) {
        return {
          plate: String(row.plate || "").toUpperCase(),
          state: String(row.state || "").toUpperCase()
        };
      }
    }
    var bits = text.toUpperCase().split(/\s+/).filter(Boolean);
    if (bits.length >= 2 && /^[A-Z]{2}$/.test(bits[0])) {
      return {
        state: bits[0],
        plate: bits.slice(1).join("").replace(/[^A-Z0-9]/g, "")
      };
    }
    if (bits.length >= 2 && /^[A-Z]{2}$/.test(bits[bits.length - 1])) {
      return {
        state: bits[bits.length - 1],
        plate: bits.slice(0, -1).join("").replace(/[^A-Z0-9]/g, "")
      };
    }
    return {
      plate: text.toUpperCase().replace(/[^A-Z0-9]/g, ""),
      state: ""
    };
  }

  function parseAddressLabel(label) {
    var text = String(label || "").trim();
    if (!text) {
      return { street: "", city: "", state: "", zip: "" };
    }
    var parts = text.split(",").map(function (part) {
      return part.trim();
    }).filter(Boolean);
    var street = parts[0] || text;
    var city = "";
    var state = "";
    var zip = "";
    if (parts.length === 2) {
      var rest = parts[1].split(/\s+/).filter(Boolean);
      if (rest.length && /^[A-Za-z]{2}$/.test(rest[rest.length - 1])) {
        state = rest.pop().toUpperCase();
        city = rest.join(" ");
      } else if (rest.length && /^\d{5}(?:-\d{4})?$/.test(rest[rest.length - 1])) {
        zip = rest.pop();
        if (rest.length && /^[A-Za-z]{2}$/.test(rest[rest.length - 1])) {
          state = rest.pop().toUpperCase();
        }
        city = rest.join(" ");
      } else {
        city = parts[1];
      }
    } else if (parts.length >= 3) {
      city = parts[1];
      var tail = parts.slice(2).join(" ").split(/\s+/).filter(Boolean);
      if (tail.length && /^\d{5}(?:-\d{4})?$/.test(tail[tail.length - 1])) {
        zip = tail.pop();
      }
      if (tail.length && /^[A-Za-z]{2}$/.test(tail[tail.length - 1])) {
        state = tail.pop().toUpperCase();
      } else if (tail.length) {
        city = [city].concat(tail).join(" ");
      }
    }
    return { street: street, city: city, state: state, zip: zip };
  }

  function identityPerson(source, personId) {
    var name =
      source && source.name
        ? clone(source.name)
        : { lastName: "", firstName: "", middleName: "" };
    var extra = {
      caseRole: "LEAD",
      name: name,
      sex: (source && source.sex) || "",
      dateOfBirth: (source && source.dateOfBirth) || "",
      age: (source && source.age) || "",
      citizenship: (source && source.citizenship) || "",
      ssn: (source && source.ssn) || "",
      lexId: (source && source.lexId) || ""
    };
    if (personId) {
      extra.personId = personId;
    }
    return model.createPerson(extra);
  }

  function associationIsPerson(link) {
    if (!link) {
      return false;
    }
    var other = String(link.otherType || (link.to && link.to.type) || "").toUpperCase();
    var toType = String((link.to && link.to.type) || "").toUpperCase();
    if (other && other !== "PERSON") {
      return false;
    }
    if (toType && toType !== "PERSON") {
      return false;
    }
    return true;
  }

  function assignedOfficerStamp(snap) {
    var id = snap && snap.assignedOfficerId ? String(snap.assignedOfficerId) : "";
    if (!id) {
      return { officerId: "", officerAlias: "" };
    }
    var api = root.officers;
    if (importWorkspaceContext) {
      var adminKey = root.config && root.config.storageKey("admin") || "copdoc.admin.v1";
      var stagedRaw = storageRaw("localStorage", adminKey);
      var stagedAdmin = stagedRaw ? JSON.parse(stagedRaw) : { officers: [] };
      var officer = (Array.isArray(stagedAdmin.officers) ? stagedAdmin.officers : []).filter(function (row) { return row && (row.id === id || row.officerId === id); })[0];
      return { officerId: id, officerAlias: api && typeof api.alias === "function" ? api.alias(officer) : "" };
    }
    var code =
      api && typeof api.aliasForId === "function" ? api.aliasForId(id) : "";
    return { officerId: id, officerAlias: code || "" };
  }

  function appendSystemNote(snap, text) {
    if (!snap) {
      return;
    }
    snap.history = Array.isArray(snap.history) ? snap.history : [];
    var stamp = assignedOfficerStamp(snap);
    var event = model.createHistoryEvent
      ? model.createHistoryEvent({
          type: "note",
          source: "system",
          text: text,
          officerId: stamp.officerId,
          officerAlias: stamp.officerAlias
        })
      : {
          eventId: model.newId("evt"),
          at: model.nowIso(),
          type: "note",
          source: "system",
          text: text,
          officerId: stamp.officerId,
          officerAlias: stamp.officerAlias
        };
    snap.history.push(event);
  }

  /**
   * Mint or reuse a committed lead for an associated person.
   * Stays in leads{} (All / Working / Filed). Does not copy RAP.
   */
  function promoteAssociateToCase(sourceLeadId, linkId) {
    var fresh = adoptDisk();
    if (!fresh.ok) {
      return { ok: false, leadId: "", existing: false, error: fresh.error };
    }
    var source = state.leads[sourceLeadId]
      ? clone(state.leads[sourceLeadId])
      : null;
    if (!source) {
      return { ok: false, leadId: "", existing: false, error: "Case not found." };
    }
    if (model.isCommitted && !model.isCommitted(source)) {
      return {
        ok: false,
        leadId: "",
        existing: false,
        error: "Open a filed case to promote an associate."
      };
    }
    var links = source.links || [];
    var link = null;
    var i;
    for (i = 0; i < links.length; i++) {
      if (links[i] && links[i].linkId === linkId) {
        link = links[i];
        break;
      }
    }
    if (!link) {
      return {
        ok: false,
        leadId: "",
        existing: false,
        error: "Association not found."
      };
    }
    if (!associationIsPerson(link)) {
      return {
        ok: false,
        leadId: "",
        existing: false,
        error: "Only a person association can open as a new case."
      };
    }
    var subject = model.subjectOf ? model.subjectOf(source) : source.person;
    var personId = String((link.to && link.to.id) || "").trim();
    var label = String(link.label || "").trim();
    if (!label && personId && state.people[personId] && model.formatPersonLabel) {
      label = model.formatPersonLabel(state.people[personId]) || "";
    }
    if (!label && !personId) {
      return {
        ok: false,
        leadId: "",
        existing: false,
        error: "Enter a name, or link an existing person."
      };
    }
    var existingLeadId = "";
    if (personId) {
      var related = relatedCommittedCases(personId, source.leadId);
      if (related.asSubject && related.asSubject.length) {
        existingLeadId = related.asSubject[0].leadId;
      } else {
        listLeads().some(function (row) {
          if (
            row &&
            row.leadId !== source.leadId &&
            row.subjectPersonId === personId
          ) {
            existingLeadId = row.leadId;
            return true;
          }
          return false;
        });
      }
    }
    var sourceLabel =
      (model.formatPersonLabel && model.formatPersonLabel(subject)) || "Case";
    function resolveSourceLink(id) {
      link.to = { type: "PERSON", id: id };
      link.otherType = "PERSON";
      if (label) {
        link.label = label;
      }
    }
    if (existingLeadId) {
      resolveSourceLink(personId);
      source.links = links;
      var savedExisting = saveLead(source, { mode: "commit" });
      if (!savedExisting || !savedExisting.ok) {
        return {
          ok: false,
          leadId: existingLeadId,
          existing: true,
          error: (savedExisting && savedExisting.error) || "Could not update the association."
        };
      }
      return {
        ok: true,
        leadId: existingLeadId,
        existing: true,
        error: ""
      };
    }
    var person;
    var resolvedPerson = resolveObjectRecord("PERSON", { objectId: personId, name: nameFromLabel(label) });
    if (!resolvedPerson.ok) { return { ok: false, code: resolvedPerson.code, candidates: resolvedPerson.candidates, leadId: "", existing: false, error: resolvedPerson.error }; }
    person = resolvedPerson.record;
    personId = person.personId;
    var next = model.createLead({
      person: person,
      subjectPersonId: person.personId,
      caseRole: "LEAD"
    });
    next.person = person;
    next.subjectPersonId = person.personId;
    next.links = [
      model.createLink({
        from: { type: "PERSON", id: person.personId },
        to: { type: "PERSON", id: subject && subject.personId },
        otherType: "PERSON",
        label: sourceLabel,
        reasons: (link.reasons || []).slice(),
        notes: link.notes || ""
      })
    ];
    appendSystemNote(
      next,
      "Opened from " + sourceLabel + "."
    );
    appendSystemNote(
      source,
      "Opened a case for " + (label || (model.formatPersonLabel && model.formatPersonLabel(person)) || "associate") + "."
    );
    resolveSourceLink(person.personId);
    source.links = links;
    var savedNew = saveLead(next, { mode: "draft" });
    if (!savedNew || !savedNew.ok) {
      return {
        ok: false,
        leadId: "",
        existing: false,
        error: (savedNew && savedNew.error) || "Could not open the case."
      };
    }
    var savedSource = saveLead(source, { mode: "commit" });
    if (!savedSource || !savedSource.ok) {
      return {
        ok: false,
        leadId: next.leadId,
        existing: false,
        error: (savedSource && savedSource.error) || ""
      };
    }
    return { ok: true, leadId: next.leadId, existing: false, error: "" };
  }

  function investigationNodeForPromote(inv, nodeId) {
    var nodes = (inv && inv.nodes) || [];
    var wanted = String(nodeId || "").trim();
    var i;
    var row;
    if (wanted) {
      for (i = 0; i < nodes.length; i++) {
        row = nodes[i];
        if (row && row.nodeId === wanted) {
          return row;
        }
      }
      for (i = 0; i < nodes.length; i++) {
        row = nodes[i];
        if (
          row &&
          String(row.objectType || "").toUpperCase() === "PERSON" &&
          row.objectId === wanted
        ) {
          return row;
        }
      }
      return null;
    }
    for (i = 0; i < nodes.length; i++) {
      row = nodes[i];
      if (row && row.nodeId === inv.focusNodeId) {
        return row;
      }
    }
    return null;
  }

  /**
   * Mint or reuse a working lead for a PERSON on an investigation wall.
   * Same personId. Identity only (no RAP, no wall graph dump).
   */
  function promoteInvestigationPersonToCase(investigationId, nodeId) {
    var blank = { ok: false, leadId: "", existing: false, error: "" };
    var fresh = adoptDisk();
    if (!fresh.ok) {
      blank.error = fresh.error;
      return blank;
    }
    var inv = state.investigations[investigationId]
      ? clone(state.investigations[investigationId])
      : null;
    if (!inv) {
      blank.error = "Investigation not found.";
      return blank;
    }
    var node = investigationNodeForPromote(inv, nodeId);
    if (!node) {
      blank.error = "Focus a person on the wall to open as a case.";
      return blank;
    }
    if (String(node.objectType || "").toUpperCase() !== "PERSON") {
      blank.error = "Only a person on the wall can open as a case.";
      return blank;
    }
    var personId = String(node.objectId || "").trim();
    if (!personId || !state.people[personId]) {
      blank.error = "Person not found.";
      return blank;
    }
    var existingLeadId = leadIdForPerson(personId);
    if (existingLeadId) {
      return {
        ok: true,
        leadId: existingLeadId,
        existing: true,
        error: ""
      };
    }
    var previousPerson = state.people[personId]
      ? clone(state.people[personId])
      : null;
    var person = clone(previousPerson || state.people[personId]);
    if (person.junked || (person.meta && person.meta.archivedAt)) { blank.error = "Restore the inactive Person explicitly before opening a Case."; return blank; }
    var label =
      (model.formatPersonLabel && model.formatPersonLabel(person)) || "Person";
    var next = model.createLead({
      person: person,
      subjectPersonId: person.personId,
      caseRole: "LEAD",
      assignedOfficerId: inv.assignedOfficerId || ""
    });
    next.person = person;
    next.subjectPersonId = person.personId;
    next.caseRole = "LEAD";
    next.links = [];
    next.vehicles = [];
    appendSystemNote(next, "Opened from investigation " + inv.investigationId + ".");
    appendSystemNote(inv, "Opened a case for " + label + ".");
    var savedNew = saveLead(next, { mode: "draft" });
    if (!savedNew || !savedNew.ok) {
      return {
        ok: false,
        leadId: "",
        existing: false,
        error: (savedNew && savedNew.error) || "Could not open the case."
      };
    }
    var savedInv = saveInvestigation(inv, {
      mode: model.isCommitted && model.isCommitted(inv) ? "commit" : "draft"
    });
    if (!savedInv || !savedInv.ok) {
      return {
        ok: false,
        leadId: next.leadId,
        existing: false,
        error: (savedInv && savedInv.error) || ""
      };
    }
    return { ok: true, leadId: next.leadId, existing: false, error: "" };
  }

  function digitsOnly(value) {
    return String(value || "").replace(/\D/g, "");
  }

  function normalizeSex(value) {
    var key = String(value || "").trim().toLowerCase();
    if (key === "male" || key === "m") {
      return "male";
    }
    if (key === "female" || key === "f") {
      return "female";
    }
    return "";
  }

  function leadIdForPerson(personId) {
    var found = "";
    if (!personId) {
      return found;
    }
    listLeads().some(function (row) {
      if (row && row.subjectPersonId === personId) {
        found = row.leadId;
        return true;
      }
      return false;
    });
    return found;
  }

  function personByAlienNumber(aNumber) {
    var digits = digitsOnly(aNumber);
    if (!digits) {
      return null;
    }
    var found = null;
    allPeople().some(function (person) {
      var imm = (person && person.immigration) || {};
      if (digitsOnly(imm.alienNumber) === digits) {
        found = person;
        return true;
      }
      return false;
    });
    if (found) {
      return found;
    }
    listLeads().some(function (row) {
      var snap = row && state.leads[row.leadId];
      var subject = snap
        ? model.subjectOf
          ? model.subjectOf(snap)
          : snap.person
        : null;
      var imm = (subject && subject.immigration) || {};
      if (subject && digitsOnly(imm.alienNumber) === digits) {
        found = subject;
        return true;
      }
      return false;
    });
    return found;
  }

  function normalizedIdentityText(value) {
    return String(value || "")
      .trim()
      .replace(/\s+/g, " ")
      .toUpperCase();
  }

  function personByFbiNumber(fbiNumber) {
    var wanted = normalizedIdentityText(fbiNumber).replace(/\s+/g, "");
    var found = null;
    if (!wanted) {
      return null;
    }
    allPeople().some(function (person) {
      var criminal = (person && person.criminal) || {};
      if (
        normalizedIdentityText(criminal.fbiNumber).replace(/\s+/g, "") === wanted
      ) {
        found = person;
        return true;
      }
      return false;
    });
    return found;
  }

  function personByNameAndBirth(lastName, firstName, dateOfBirth) {
    var wantedLast = normalizedIdentityText(lastName);
    var wantedFirst = normalizedIdentityText(firstName);
    var wantedDob = String(dateOfBirth || "").trim();
    var found = null;
    if (!wantedLast || !wantedFirst || !wantedDob) {
      return null;
    }
    allPeople().some(function (person) {
      var name = (person && person.name) || {};
      if (
        normalizedIdentityText(name.lastName) === wantedLast &&
        normalizedIdentityText(name.firstName) === wantedFirst &&
        String(person.dateOfBirth || "").trim() === wantedDob
      ) {
        found = person;
        return true;
      }
      return false;
    });
    return found;
  }

  function personIdsByBookInIdentity(kind, value) {
    var wanted =
      kind === "alien"
        ? digitsOnly(value)
        : normalizedIdentityText(value).replace(/\s+/g, "");
    var seen = Object.create(null);
    var ids = [];
    if (!wanted) {
      return ids;
    }
    function inspect(person) {
      if (!person || !person.personId) {
        return;
      }
      var actual =
        kind === "alien"
          ? digitsOnly(person.immigration && person.immigration.alienNumber)
          : normalizedIdentityText(
              person.criminal && person.criminal.fbiNumber
            ).replace(/\s+/g, "");
      if (actual === wanted && !seen[person.personId]) {
        seen[person.personId] = true;
        ids.push(person.personId);
      }
    }
    allPeople().forEach(inspect);
    Object.keys(state.leads || {}).forEach(function (leadId) {
      var snap = state.leads[leadId];
      inspect(snap && (model.subjectOf ? model.subjectOf(snap) : snap.person));
    });
    return ids;
  }

  function bookInStateValue(record, stateIds, recordKeys) {
    var state = (record && record.formState) || {};
    var ids = Array.isArray(stateIds) ? stateIds : [stateIds];
    var keys = Array.isArray(recordKeys) ? recordKeys : [recordKeys];
    var i;
    for (i = 0; i < ids.length; i += 1) {
      var entry = state[ids[i]];
      if (entry && entry.value !== undefined && String(entry.value).trim() !== "") {
        return String(entry.value).trim();
      }
    }
    for (i = 0; i < keys.length; i += 1) {
      if (
        record &&
        keys[i] &&
        record[keys[i]] !== undefined &&
        String(record[keys[i]]).trim() !== ""
      ) {
        return String(record[keys[i]]).trim();
      }
    }
    return "";
  }

  function bookInRadioValue(record, choices, recordKeys) {
    var state = (record && record.formState) || {};
    var i;
    for (i = 0; i < choices.length; i += 1) {
      var entry = state[choices[i].id];
      if (entry && entry.checked) {
        return choices[i].value;
      }
    }
    return bookInStateValue(record, [], recordKeys);
  }

  function normalizeBookInRole(value) {
    var role = normalizedIdentityText(value);
    return role === "TARGET" || role === "COLLATERAL" ? role : "";
  }

  function normalizeBookInVehiclePosition(value) {
    var normalized = normalizedIdentityText(value);
    if (normalized === "DRIVER") {
      return "Driver";
    }
    if (normalized === "PASSENGER") {
      return "Passenger";
    }
    if (normalized === "OTHER") {
      return "Other";
    }
    return "";
  }

  function normalizeBookInCatalogCode(value, items) {
    var cleaned = String(value || "").trim();
    if (!cleaned) {
      return "";
    }
    var normalized = cleaned.toLowerCase();
    var match = (Array.isArray(items) ? items : []).filter(function (item) {
      if (!item) {
        return false;
      }
      var labels = [
        item.code,
        item.label,
        item.description,
        item.official,
        String(item.code || "") + " - " + String(item.label || item.description || "")
      ].concat(item.aliases || []);
      return labels.some(function (label) {
        return String(label || "").trim().toLowerCase() === normalized;
      });
    })[0];
    return match && match.code ? String(match.code) : cleaned;
  }

  function normalizeBookInAge(value) {
    if (value === "" || value === null || value === undefined) {
      return "";
    }
    var age = Number(value);
    return isFinite(age) && age >= 0 && age < 130 ? age : "";
  }

  function bookInAgeOnDate(dateOfBirth, asOfDate) {
    var dobMatch = String(dateOfBirth || "")
      .trim()
      .match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!dobMatch) {
      return "";
    }
    var asOfMatch = String(asOfDate || "")
      .trim()
      .match(/^(\d{4})-(\d{2})-(\d{2})/);
    var today = new Date();
    var year = asOfMatch ? Number(asOfMatch[1]) : today.getFullYear();
    var month = asOfMatch ? Number(asOfMatch[2]) : today.getMonth() + 1;
    var day = asOfMatch ? Number(asOfMatch[3]) : today.getDate();
    var birthYear = Number(dobMatch[1]);
    var birthMonth = Number(dobMatch[2]);
    var birthDay = Number(dobMatch[3]);
    var validated = new Date(Date.UTC(birthYear, birthMonth - 1, birthDay));
    if (
      validated.getUTCFullYear() !== birthYear ||
      validated.getUTCMonth() + 1 !== birthMonth ||
      validated.getUTCDate() !== birthDay
    ) {
      return "";
    }
    var age = year - birthYear;
    if (month < birthMonth || (month === birthMonth && day < birthDay)) {
      age -= 1;
    }
    return normalizeBookInAge(age);
  }

  function normalizeBookInDisposition(value) {
    var cleaned = String(value || "").trim();
    var normalized = cleaned.toLowerCase();
    if (normalized === "b&b" || normalized === "b and b") {
      return "B";
    }
    return normalizeBookInCatalogCode(
      cleaned,
      global.IMMIGRATION_DISPOSITIONS
    );
  }

  function normalizeBookInClock(value) {
    var match = String(value || "")
      .trim()
      .match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) {
      return "";
    }
    return String(Number(match[1])).padStart(2, "0") + ":" + match[2];
  }

  function previousDateKey(dateKey) {
    var match = String(dateKey || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) {
      return dateKey || "";
    }
    var date = new Date(
      Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
    );
    date.setUTCDate(date.getUTCDate() - 1);
    return date.toISOString().slice(0, 10);
  }

  function combineBookInArrestDateTime(bookInDateTime, arrestTime) {
    var dateTime = String(bookInDateTime || "").trim();
    var dateMatch = dateTime.match(/^(\d{4}-\d{2}-\d{2})(?:T(\d{2}):(\d{2}))?/);
    var clock = normalizeBookInClock(arrestTime);
    if (!dateMatch || !clock) {
      return dateTime;
    }
    var dateKey = dateMatch[1];
    var bookInClock = dateMatch[2] ? dateMatch[2] + ":" + dateMatch[3] : "";
    if (bookInClock && clock > bookInClock) {
      dateKey = previousDateKey(dateKey);
    }
    return dateKey + "T" + clock;
  }

  function bookInMedicalData(record) {
    var state = (record && record.formState) || {};
    var noMedicalEntry = state.noMedicalIssues || state.no_medical_issues;
    var medical = {
      communicationAnswer: bookInRadioValue(
        record,
        [
          { id: "communication_yes", value: "Yes" },
          { id: "communication_no", value: "No" }
        ],
        ["communicationAnswer"]
      ),
      noMedicalIssues: !!(noMedicalEntry && noMedicalEntry.checked),
      medicalIssues: bookInStateValue(
        record,
        ["medicalIssues", "medical_issues"],
        ["medicalIssues"]
      ),
      medicine: bookInStateValue(record, ["medicine"], ["medicine"]),
      additionalObservations: bookInStateValue(
        record,
        ["additionalObservations", "additional_observations"],
        ["additionalObservations"]
      ),
      referralAnswer: bookInRadioValue(
        record,
        [
          { id: "referral_yes", value: "Yes" },
          { id: "referral_no", value: "No" }
        ],
        ["referralAnswer"]
      )
    };
    var question;
    for (question = 1; question <= 13; question += 1) {
      medical["q" + question + "Answer"] = bookInRadioValue(
        record,
        [
          { id: "q" + question + "_yes", value: "Yes" },
          { id: "q" + question + "_no", value: "No" }
        ],
        ["q" + question + "Answer"]
      );
      if (question >= 3) {
        medical["q" + question + "Details"] = bookInStateValue(
          record,
          ["q" + question + "_details"],
          ["q" + question + "Details"]
        );
      }
    }
    return medical;
  }

  function bookInArrestFieldPresence(record) {
    record = record || {};
    var formState =
      record.formState && typeof record.formState === "object"
        ? record.formState
        : {};
    function hasAny(directKeys, formKeys) {
      return directKeys.some(function (key) {
        return storeSubjectOwn(record, key);
      }) || formKeys.some(function (key) {
        return storeSubjectOwn(formState, key);
      });
    }
    var hasDate = hasAny(
      ["arrestDate", "arrestDateTime", "bookInDateTime", "dateTime"],
      ["dateTime", "date_time"]
    );
    return {
      arrestDate: hasDate,
      arrestTime: hasAny(
        ["arrestTime"],
        ["arrestTime", "arrest_time", "arrestTimeManual", "arrest_time_manual"]
      ),
      arrestDateTime:
        hasDate ||
        hasAny(["arrestTime"], ["arrestTime", "arrest_time"]),
      arrestingOfficer: hasAny(
        ["arrestingOfficer", "officersName"],
        ["arrestingOfficer", "officersName", "officers_name"]
      ),
      team: hasAny(["team"], ["team"]),
      iceEventNumber: hasAny(
        ["iceEventNumber", "iceEvent"],
        ["iceEventNumber", "iceEvent", "ice_event"]
      ),
      encounterNumber: hasAny(
        ["encounterNumber"],
        ["encounterNumber", "encounter_number"]
      ),
      encounterId: hasAny(["encounterId"], []),
      subjectRole: hasAny(
        ["subjectRole", "encounterRole"],
        [
          "subject_role_target",
          "subject_role_collateral",
          "encounterRoleTarget",
          "encounterRoleCollateral"
        ]
      ),
      vehiclePosition: hasAny(
        ["vehiclePosition"],
        ["vehiclePosition", "vehicle_position"]
      ),
      bookInDateTime: hasDate,
      booking: hasAny(
        ["booking", "cash", "travelDocs", "propertyTag", "cellNum", "children"],
        [
          "cash",
          "travelDocs",
          "travel_docs",
          "propertyTag",
          "property_tag",
          "cellNum",
          "cell_num",
          "children",
          "medicalIssues",
          "medical_issues",
          "medicine",
          "additionalObservations",
          "additional_observations"
        ]
      )
    };
  }

  /** Convert either COPDoc or Alien Book-In 1.x saved-record fields to one input. */
  function bookInPromotionInput(record) {
    record = record || {};
    var gender = bookInStateValue(record, ["gender"], ["gender", "sex"]);
    if (!gender) {
      gender = bookInRadioValue(
        record,
        [
          { id: "sexMale", value: "male" },
          { id: "sexFemale", value: "female" }
        ],
        ["sex"]
      );
    }
    var bookInDateTime = bookInStateValue(
      record,
      ["dateTime", "date_time"],
      ["dateTime", "bookInDateTime"]
    );
    var arrestTime = normalizeBookInClock(
      bookInStateValue(record, ["arrestTime", "arrest_time"], ["arrestTime"])
    );
    var arrestDateTime = combineBookInArrestDateTime(bookInDateTime, arrestTime);
    var arrestDate = String(arrestDateTime || bookInDateTime).slice(0, 10);
    var dateOfBirth = bookInStateValue(
      record,
      ["dateOfBirth", "date_of_birth"],
      ["dateOfBirth"]
    );
    var age = normalizeBookInAge(
      bookInStateValue(record, ["age"], ["age"])
    );
    if (age === "") {
      age = bookInAgeOnDate(dateOfBirth, arrestDate);
    }
    var subjectRole = normalizeBookInRole(
      bookInRadioValue(
        record,
        [
          { id: "subject_role_target", value: "TARGET" },
          { id: "subject_role_collateral", value: "COLLATERAL" },
          { id: "encounterRoleTarget", value: "TARGET" },
          { id: "encounterRoleCollateral", value: "COLLATERAL" }
        ],
        ["subjectRole", "encounterRole"]
      )
    );
    var vehiclePosition = normalizeBookInVehiclePosition(
      bookInStateValue(
        record,
        ["vehiclePosition", "vehicle_position"],
        ["vehiclePosition"]
      )
    );
    var foreignWarrants = String(
      bookInStateValue(
        record,
        ["foreignWarrants", "foreign_warrants"],
        ["foreignWarrants"]
      )
    )
      .trim()
      .toLowerCase();
    var bookingId = storeSubjectOwn(record, "bookingId")
      ? storeSubjectText(record.bookingId)
      : storeSubjectText(record.id || record.bookinRecordId);
    return {
      subjectId: storeSubjectText(record.subjectId),
      leadId: String(record.leadId || "").trim(),
      personId: String(record.personId || "").trim(),
      bookingId: bookingId,
      bookinRecordId: bookingId,
      lastName: bookInStateValue(record, ["lastName", "last_name"], ["lastName"]),
      firstName: bookInStateValue(record, ["firstName", "first_name"], ["firstName"]),
      sex: gender,
      dateOfBirth: dateOfBirth,
      age: age,
      citizenship: normalizeBookInCatalogCode(
        bookInStateValue(
          record,
          ["citizenship", "country_of_citizenship"],
          ["countryOfCitizenship", "citizenship"]
        ),
        global.COUNTRIES
      ),
      alienNumber: bookInStateValue(
        record,
        ["alienNumber", "a_number"],
        ["aNumber", "alienNumber"]
      ),
      fbiNumber: bookInStateValue(
        record,
        ["fbiNumber", "fbi_number"],
        ["fbiNumber"]
      ),
      foreignWarrantsKnown:
        foreignWarrants === "yes" || foreignWarrants === "no",
      hasForeignWarrants: foreignWarrants === "yes",
      foreignWarrantCountry:
        foreignWarrants === "yes"
          ? bookInStateValue(
              record,
              ["foreignWarrantCountry", "foreign_warrant_country"],
              ["foreignWarrantCountry"]
            )
          : "",
      disposition: normalizeBookInDisposition(
        bookInStateValue(
          record,
          ["immigrationDisposition", "case_type"],
          ["caseType", "disposition"]
        )
      ),
      status: normalizeBookInCatalogCode(
        bookInStateValue(record, ["immigrationStatus"], ["status"]),
        global.IMMIGRATION_STATUS
      ),
      iceEventNumber: bookInStateValue(
        record,
        ["iceEvent", "ice_event"],
        ["iceEvent"]
      ),
      encounterNumber: bookInStateValue(
        record,
        ["encounterNumber", "encounter_number"],
        ["encounterNumber"]
      ),
      encounterId: String(record.encounterId || "").trim(),
      subjectRole: subjectRole,
      vehiclePosition: vehiclePosition,
      arrestDate: arrestDate,
      arrestTime: arrestTime,
      arrestDateTime: arrestDateTime,
      bookInDateTime: bookInDateTime,
      arrestingOfficer: bookInStateValue(
        record,
        ["officersName", "officers_name"],
        ["officersName"]
      ),
      team: bookInStateValue(record, ["team"], ["team"]),
      arrestFieldPresence:
        record.__copdocImportArrestFieldPresence &&
        typeof record.__copdocImportArrestFieldPresence === "object"
          ? clone(record.__copdocImportArrestFieldPresence)
          : bookInArrestFieldPresence(record),
      booking: {
        cash: bookInStateValue(record, ["cash"], ["cash"]),
        travelDocuments: bookInStateValue(
          record,
          ["travelDocs", "travel_docs"],
          ["travelDocs"]
        ),
        propertyTag: bookInStateValue(
          record,
          ["propertyTag", "property_tag"],
          ["propertyTag"]
        ),
        holdingCellNumber: bookInStateValue(
          record,
          ["cellNum", "cell_num"],
          ["cellNum"]
        ),
        children: bookInStateValue(record, ["children"], ["children"]),
        medical: bookInMedicalData(record)
      }
    };
  }

  function overlayBookInPerson(person, input) {
    var next = person ? clone(person) : model.createPerson({ caseRole: "DETAINEE" });
    next.caseRole = "DETAINEE";
    next.name = next.name || { lastName: "", firstName: "", middleName: "" };
    if (input.lastName) {
      next.name.lastName = input.lastName;
    }
    if (input.firstName) {
      next.name.firstName = input.firstName;
    }
    if (input.sex) {
      next.sex = input.sex;
    }
    if (input.dateOfBirth) {
      next.dateOfBirth = input.dateOfBirth;
    }
    if (input.age !== undefined && input.age !== "") {
      next.age = input.age;
    }
    if (input.citizenship) {
      next.citizenship = input.citizenship;
    }
    next.immigration = next.immigration || {};
    if (input.alienNumber) {
      next.immigration.alienNumber = input.alienNumber;
    }
    if (input.disposition) {
      next.immigration.disposition = input.disposition;
    }
    if (input.status) {
      next.immigration.status = input.status;
    }
    next.criminal = next.criminal || {};
    if (input.fbiNumber) {
      next.criminal.fbiNumber = input.fbiNumber;
    }
    if (input.foreignWarrantsKnown === true) {
      next.criminal.foreignWarrantsKnown = true;
      next.criminal.hasForeignWarrants = input.hasForeignWarrants === true;
      next.criminal.foreignWarrantCountry = input.hasForeignWarrants
        ? String(input.foreignWarrantCountry || "").trim()
        : "";
    }
    return next;
  }

  var bookingProjection = root.domain.createBookingProjection({
    model: model,
    clone: clone,
    getWorkspace: function () { return state; },
    subjectPolicy: encounterSubjectPolicy,
    normalizeRole: normalizeBookInRole,
    normalizeVehiclePosition: normalizeBookInVehiclePosition,
    normalizeClock: normalizeBookInClock,
    encounterPin: function (encounter) { return encounterPin(encounter); }
  });
  var upsertBookInArrest = bookingProjection.upsertBookInArrest;
  var validateBookInEncounterSubject = bookingProjection.validateBookInEncounterSubject;

  /**
   * Book-in Save: mint or reuse a person and file a DETAINEE lead.
   * Packet store stays separate. Identity overlay does not copy RAP.
   */
  function promoteBookInToLead(input) {
    input = clone(input || {});
    if (importWorkspaceContext) {
      var importOutcome = storeSubjectText(input.importOutcome).toUpperCase();
      var disposition = storeSubjectText(input.disposition || input.caseType).toUpperCase();
      if (importOutcome && importOutcome !== "ARRESTED" || /^(NIC|NOT[ _-]?IN[ _-]?CUSTODY)$/.test(disposition) && importOutcome !== "ARRESTED") {
        return { ok: false, code: "IMPORT_CUSTODY_REVIEW", error: "Confirm the source record's custody outcome before creating an Arrest, or import it as an unfiled draft." };
      }
    }
    if (input.voidedAt) { return { ok: false, code: "BOOKING_VOIDED", error: "This booking was voided. Create a new booking with a new ID." }; }
    var directBookingClaims = [
      storeSubjectText(input.id),
      storeSubjectText(input.bookingId),
      storeSubjectText(input.bookinRecordId)
    ].filter(function (value, index, values) {
      return value && values.indexOf(value) === index;
    });
    if (directBookingClaims.length > 1) {
      return {
        ok: false,
        code: "BOOKIN_ARREST_IDENTITY_CONFLICT",
        leadId: storeSubjectText(input.leadId),
        personId: storeSubjectText(input.personId),
        existing: false,
        error: "The Book-In record contains contradictory booking identifiers."
      };
    }
    if (directBookingClaims.length === 1) {
      input.bookingId = directBookingClaims[0];
      input.bookinRecordId = directBookingClaims[0];
    }
    var fresh = adoptDisk();
    if (!fresh.ok) {
      return {
        ok: false,
        leadId: "",
        personId: "",
        existing: false,
        error: fresh.error
      };
    }
    var lastName = String(input.lastName || "").trim();
    var firstName = String(input.firstName || "").trim();
    var aNumber = digitsOnly(input.alienNumber);
    var fbiNumber = String(input.fbiNumber || "").trim();
    var leadId = String(input.leadId || "").trim();
    var personId = String(input.personId || "").trim();
    if (leadId && !state.leads[leadId]) {
      return {
        ok: false,
        code: "BOOKIN_PERSON_IDENTITY_CONFLICT",
        leadId: leadId,
        personId: personId,
        existing: false,
        error: "The selected Case does not exist."
      };
    }
    if (leadId && !leadOwnerIdentity(state.leads[leadId], leadId).ok) {
      return {
        ok: false,
        code: "BOOKIN_PERSON_IDENTITY_CONFLICT",
        leadId: leadId,
        personId: personId,
        existing: false,
        error: "The selected Case has an invalid Person owner."
      };
    }
    if (personId && !state.people[personId]) {
      return {
        ok: false,
        code: "BOOKIN_PERSON_IDENTITY_CONFLICT",
        leadId: leadId,
        personId: personId,
        existing: false,
        error: "The selected Person does not exist."
      };
    }
    var subjectLink = validateBookInEncounterSubject(input, personId, leadId);
    if (!subjectLink.ok) {
      return {
        ok: false,
        code: subjectLink.code,
        leadId: leadId,
        personId: personId,
        existing: false,
        error: subjectLink.error
      };
    }
    if (subjectLink.subject) {
      input.subjectId = storeSubjectId(subjectLink.subject) || input.subjectId;
      personId = storeSubjectText(subjectLink.subject.personId) || personId;
      leadId = storeSubjectText(subjectLink.subject.leadId) || leadId;
    }
    if (!leadId && !personId && !lastName && !firstName && !aNumber && !fbiNumber) {
      return {
        ok: false,
        leadId: "",
        personId: "",
        existing: false,
        error: "Enter a name, A-Number, or FBI Number to file a case."
      };
    }
    var snap = leadId ? getLead(leadId) : null;
    var person = null;
    var existing = false;
    if (snap) {
      person = model.subjectOf ? model.subjectOf(snap) : snap.person;
      var leadPersonId = storeSubjectText(person && person.personId);
      if (personId && leadPersonId && personId !== leadPersonId) {
        return {
          ok: false,
          code: "BOOKIN_PERSON_IDENTITY_CONFLICT",
          leadId: leadId,
          personId: personId,
          existing: false,
          error: "The selected Case belongs to a different Person."
        };
      }
      personId = leadPersonId || personId;
      existing = true;
    } else if (personId && state.people[personId]) {
      person = clone(state.people[personId]);
      leadId = leadIdForPerson(personId);
      snap = leadId ? getLead(leadId) : null;
      existing = !!snap;
    }
    var identityInput = {
      objectId: personId,
      name: { lastName: lastName, firstName: firstName },
      dateOfBirth: input.dateOfBirth || "",
      alienNumber: aNumber,
      fbiNumber: fbiNumber,
      createNew: input.createNew === true
    };
    var resolvedIdentity = resolveObjectIdentity("PERSON", identityInput);
    if (!resolvedIdentity.ok) {
      return { ok: false, code: resolvedIdentity.code, leadId: leadId, personId: personId, existing: existing, candidates: resolvedIdentity.candidates, error: resolvedIdentity.error };
    }
    if (resolvedIdentity.reused) {
      person = resolvedIdentity.record;
      personId = resolvedIdentity.objectId;
      if (!snap) {
        leadId = leadIdForPerson(personId);
        snap = leadId ? getLead(leadId) : null;
        existing = !!snap;
      }
    }
    var resolvedSubjectLink = validateBookInEncounterSubject(input, personId, leadId);
    if (!resolvedSubjectLink.ok) {
      return {
        ok: false,
        code: resolvedSubjectLink.code,
        leadId: leadId,
        personId: personId,
        existing: existing,
        error: resolvedSubjectLink.error
      };
    }
    if (resolvedSubjectLink.subject) {
      var canonicalPersonId = storeSubjectText(
        resolvedSubjectLink.subject.personId
      );
      var canonicalLeadId = storeSubjectText(resolvedSubjectLink.subject.leadId);
      if (canonicalPersonId && !state.people[canonicalPersonId]) {
        return {
          ok: false,
          code: "BOOKIN_PERSON_IDENTITY_CONFLICT",
          leadId: canonicalLeadId || leadId,
          personId: canonicalPersonId,
          existing: existing,
          error: "The Encounter subject's Person does not exist."
        };
      }
      if (canonicalLeadId && !state.leads[canonicalLeadId]) {
        return {
          ok: false,
          code: "BOOKIN_PERSON_IDENTITY_CONFLICT",
          leadId: canonicalLeadId,
          personId: canonicalPersonId || personId,
          existing: existing,
          error: "The Encounter subject's Case does not exist."
        };
      }
      if (
        canonicalLeadId &&
        !leadOwnerIdentity(state.leads[canonicalLeadId], canonicalLeadId).ok
      ) {
        return {
          ok: false,
          code: "BOOKIN_PERSON_IDENTITY_CONFLICT",
          leadId: canonicalLeadId,
          personId: canonicalPersonId || personId,
          existing: existing,
          error: "The Encounter subject's Case has an invalid Person owner."
        };
      }
      if (
        canonicalPersonId &&
        person &&
        person.personId &&
        storeSubjectText(person.personId) !== canonicalPersonId
      ) {
        return {
          ok: false,
          code: "ENCOUNTER_SUBJECT_ID_CONFLICT",
          leadId: leadId,
          personId: personId,
          existing: existing,
          error: "Book-In identity conflicts with the linked Encounter subject."
        };
      }
      input.subjectId =
        storeSubjectId(resolvedSubjectLink.subject) || input.subjectId;
      input.subjectRole =
        storeSubjectRole(resolvedSubjectLink.subject) || input.subjectRole;
      input.vehiclePosition =
        storeSubjectOccupantRole(resolvedSubjectLink.subject) ||
        input.vehiclePosition;
      input.arrestFieldPresence = input.arrestFieldPresence || {};
      input.arrestFieldPresence.encounterId = true;
      input.arrestFieldPresence.subjectRole = true;
      input.arrestFieldPresence.vehiclePosition = true;
      personId = canonicalPersonId || personId;
      leadId = canonicalLeadId || leadId;
      if (canonicalPersonId && !person) {
        person = clone(state.people[canonicalPersonId]);
      }
    }
    if (snap && !leadOwnerIdentity(snap, leadId || snap.leadId).ok) {
      return {
        ok: false,
        code: "BOOKIN_PERSON_IDENTITY_CONFLICT",
        leadId: storeSubjectText(snap.leadId) || leadId,
        personId: personId,
        existing: existing,
        error: "The resolved Case has an invalid Person owner."
      };
    }
    var alienOwners = personIdsByBookInIdentity("alien", aNumber);
    var fbiOwners = personIdsByBookInIdentity("fbi", fbiNumber);
    var conflictingIdentityOwner = alienOwners.concat(fbiOwners).some(function (ownerId) {
      return ownerId && ownerId !== personId;
    });
    if (conflictingIdentityOwner) {
      return {
        ok: false,
        code: "BOOKIN_PERSON_IDENTITY_CONFLICT",
        leadId: leadId,
        personId: personId,
        existing: existing,
        error: "The entered A-Number or FBI Number belongs to a different Person."
      };
    }
    var overlay = {
      lastName: lastName,
      firstName: firstName,
      sex: normalizeSex(input.sex),
      dateOfBirth: String(input.dateOfBirth || "").trim(),
      age: normalizeBookInAge(input.age),
      citizenship: normalizeBookInCatalogCode(
        input.citizenship,
        global.COUNTRIES
      ),
      alienNumber: aNumber,
      fbiNumber: fbiNumber,
      disposition: normalizeBookInDisposition(input.disposition),
      status: normalizeBookInCatalogCode(input.status, global.IMMIGRATION_STATUS),
      foreignWarrantsKnown: input.foreignWarrantsKnown === true,
      hasForeignWarrants: input.hasForeignWarrants === true,
      foreignWarrantCountry: String(input.foreignWarrantCountry || "").trim()
    };
    person = overlayBookInPerson(person, overlay);
    var arrestResult = upsertBookInArrest(person, input);
    if (!arrestResult.ok) {
      return {
        ok: false,
        code: "BOOKIN_ARREST_IDENTITY_CONFLICT",
        leadId: leadId,
        personId: personId,
        existing: existing,
        error: arrestResult.error
      };
    }
    var arrestId = arrestResult.arrestId;
    personId = person.personId;
    var wasDetainee =
      snap &&
      (snap.caseRole === "DETAINEE" ||
        (snap.person && snap.person.caseRole === "DETAINEE"));
    if (!snap) {
      var newLeadInput = {
        person: person,
        subjectPersonId: person.personId,
        caseRole: "DETAINEE"
      };
      if (leadId) {
        newLeadInput.leadId = leadId;
      }
      snap = model.createLead(newLeadInput);
      leadId = snap.leadId;
      appendSystemNote(snap, "Booked in. Detainee / in custody.");
    } else {
      snap.person = person;
      snap.subjectPersonId = person.personId;
      snap.caseRole = "DETAINEE";
      if (!wasDetainee) {
        appendSystemNote(snap, "Booked in. Status set to Detainee / in custody.");
      }
    }
    snap.source = snap.source || (model.createSource ? model.createSource() : {});
    if (!snap.source.leadSource) {
      snap.source.leadSource = "BOOK_IN";
    }
    if (!snap.source.caseNumber) {
      snap.source.caseNumber = String(
        input.iceEventNumber || input.encounterNumber || ""
      ).trim();
    }
    if (input.bookinRecordId) {
      snap.history = Array.isArray(snap.history) ? snap.history : [];
      var hasBookInEvent = snap.history.some(function (row) {
        return (
          row &&
          String(row.bookinRecordId || "") === String(input.bookinRecordId)
        );
      });
      if (!hasBookInEvent) {
        var event = model.createHistoryEvent
          ? model.createHistoryEvent({
              type: "book-in",
              text: "Book-in arrest added to the case.",
              source: "book-in",
              bookinRecordId: String(input.bookinRecordId)
            })
          : {
              type: "book-in",
              text: "Book-in arrest added to the case.",
              source: "book-in",
              bookinRecordId: String(input.bookinRecordId)
            };
        snap.history.push(event);
      }
    }
    snap.person = person;
    snap.subjectPersonId = person.personId;
    snap.caseRole = "DETAINEE";
    var saved = saveLead(snap, {
      mode: "commit", bookingWorkflow: true,
      bookingTransactionId: storeSubjectText(input.bookingTransactionId),
      bookingArrestId: arrestId
    });
    if (!saved || !saved.ok) {
      return {
        ok: false,
        leadId: leadId,
        personId: personId,
        existing: existing,
        error: (saved && saved.error) || "Could not file the case."
      };
    }
    return {
      ok: true,
      leadId: saved.leadId,
      personId: personId,
      subjectId: storeSubjectText(input.subjectId),
      subjectRole: normalizeBookInRole(input.subjectRole),
      vehiclePosition: normalizeBookInVehiclePosition(input.vehiclePosition),
      arrestId: arrestId,
      existing: existing,
      error: ""
    };
  }

  // A local change detector, not a security signature. Only promotion-owned facts
  // participate; later Encounter location/vehicle projections must not invalidate it.
  function bookingSourceFingerprint(person, arrest) {
    person = person || {};
    var imm = person.immigration || {};
    var criminal = person.criminal || {};
    var ownedArrest = {};
    var excluded = ["bookingTransactionId", "bookingTransactionSource", "meta", "createdAt", "updatedAt",
      "arrestLocation", "latitude", "longitude", "sharedStop", "location", "locationId", "vehicleIds"];
    Object.keys(arrest || {}).forEach(function (key) {
      if (excluded.indexOf(key) === -1) { ownedArrest[key] = arrest[key]; }
    });
    var projection = {
      personId: person.personId, caseRole: person.caseRole, name: person.name,
      sex: person.sex, dateOfBirth: person.dateOfBirth, age: person.age,
      citizenship: person.citizenship, alienNumber: imm.alienNumber,
      disposition: imm.disposition, status: imm.status, fbiNumber: criminal.fbiNumber,
      foreignWarrantsKnown: criminal.foreignWarrantsKnown,
      hasForeignWarrants: criminal.hasForeignWarrants,
      foreignWarrantCountry: criminal.foreignWarrantCountry, arrest: ownedArrest
    };
    function stable(value) {
      if (!value || typeof value !== "object") { return value; }
      if (Array.isArray(value)) { return value.map(stable); }
      var sorted = {};
      Object.keys(value).sort().forEach(function (key) { sorted[key] = stable(value[key]); });
      return sorted;
    }
    var serialized = JSON.stringify(stable(projection));
    var hash = 2166136261;
    var second = 2246822507;
    for (var i = 0; i < serialized.length; i += 1) {
      hash = Math.imul(hash ^ serialized.charCodeAt(i), 16777619) >>> 0;
      second = Math.imul(second ^ serialized.charCodeAt(i), 3266489909) >>> 0;
    }
    return "booking-v1:" + serialized.length + ":" + hash.toString(16) + ":" + second.toString(16);
  }

  /** Read durable booking ownership without repairing, normalizing, or writing. */
  function resolveBookInBooking(bookingId) {
    bookingId = storeSubjectText(bookingId);
    var result = {
      ok: true, found: false, bookingId: bookingId, personId: "", leadId: "",
      arrestId: "", subjectId: "", encounterId: "", error: "", code: "",
      bookingTransactionId: "", bookingTransactionSource: "", sourceFingerprint: "", transactionUnchanged: false
    };
    function fail(message) {
      result.ok = false;
      result.code = "BOOKIN_RECOVERY_IDENTITY_CONFLICT";
      result.error = message;
      return result;
    }
    function object(value) {
      return !!value && typeof value === "object" && !Array.isArray(value);
    }
    function claims(row) {
      return [row && row.bookingId, row && row.bookinRecordId]
        .map(storeSubjectText).filter(function (value, index, values) {
          return value && values.indexOf(value) === index;
        });
    }
    function owns(row) { return claims(row).indexOf(bookingId) !== -1; }
    if (!bookingId) { return fail("A booking identifier is required for recovery."); }
    var data;
    if (!importWorkspaceContext && !storagePort.has("localStorage")) { return result; }
    try {
      var raw = storageRaw("localStorage", STORAGE_KEY);
      if (raw === null) { return result; }
      data = JSON.parse(raw);
    } catch (readError) {
      return fail("Cannot read durable workspace booking data. Run Integrity before retrying.");
    }
    if (!object(data) || !object(data.people) || !object(data.leads)) {
      return fail("Workspace Person or Case storage is malformed. Run Integrity before retrying.");
    }
    var canonical = [];
    var projections = [];
    var historyLeads = [];
    var ownerLeads = [];
    var error = "";
    Object.keys(data.people).some(function (personKey) {
      var person = data.people[personKey];
      if (!object(person) || storeSubjectText(person.personId) !== personKey ||
          (person.arrests !== undefined && !Array.isArray(person.arrests))) {
        error = "Person storage has invalid identifiers or Arrest data. Run Integrity before retrying.";
        return true;
      }
      (person.arrests || []).forEach(function (arrest) {
        if (!object(arrest)) {
          error = "Person Arrest storage is malformed. Run Integrity before retrying.";
        } else if (owns(arrest)) {
          if (claims(arrest).length !== 1 || !storeSubjectText(arrest.arrestId) ||
              (storeSubjectText(arrest.personId) && storeSubjectText(arrest.personId) !== personKey)) {
            error = "The booking Arrest has contradictory or missing identity.";
          }
          canonical.push({ personId: personKey, row: arrest });
        }
      });
      return !!error;
    });
    if (error) { return fail(error); }
    Object.keys(data.leads).some(function (leadKey) {
      var lead = data.leads[leadKey];
      var person = lead && (model.subjectOf ? model.subjectOf(lead) : lead.person);
      if (!object(lead) || (lead.history !== undefined && !Array.isArray(lead.history)) ||
          (person && person.arrests !== undefined && !Array.isArray(person.arrests))) {
        error = "Case booking history is malformed. Run Integrity before retrying.";
        return true;
      }
      var leadMatches = (person && person.arrests || []).filter(owns);
      var historyMatches = (lead.history || []).filter(owns);
      var personId = storeSubjectText(person && person.personId);
      var validOwner = storeSubjectText(lead.leadId) === leadKey && personId &&
        data.people[personId] && (!storeSubjectText(lead.subjectPersonId) ||
        storeSubjectText(lead.subjectPersonId) === personId);
      if (validOwner) { ownerLeads.push({ leadId: leadKey, personId: personId }); }
      if (!leadMatches.length && !historyMatches.length) { return false; }
      if (!validOwner || leadMatches.length > 1 || historyMatches.length > 1) {
        error = "A Case has ambiguous booking history or contradictory Person ownership.";
        return true;
      }
      leadMatches.forEach(function (arrest) {
        if (claims(arrest).length !== 1 || !storeSubjectText(arrest.arrestId) ||
            (storeSubjectText(arrest.personId) && storeSubjectText(arrest.personId) !== personId)) {
          error = "The Case Arrest has contradictory or missing identity.";
        }
        projections.push({ leadId: leadKey, personId: personId, row: arrest });
      });
      historyMatches.forEach(function (history) {
        if (claims(history).length !== 1) {
          error = "Case booking history has contradictory identifiers.";
        }
        historyLeads.push({ leadId: leadKey, personId: personId });
      });
      return !!error;
    });
    if (error) { return fail(error); }
    if (!canonical.length && !projections.length && !historyLeads.length) { return result; }
    if (canonical.length !== 1) {
      return fail("The booking does not have exactly one canonical Person Arrest. Run Integrity before retrying.");
    }
    var owner = canonical[0];
    var arrest = owner.row;
    result.personId = owner.personId;
    result.arrestId = storeSubjectText(arrest.arrestId);
    result.subjectId = storeSubjectText(arrest.subjectId);
    result.encounterId = storeSubjectText(arrest.encounterId);
    result.bookingTransactionId = storeSubjectText(arrest.bookingTransactionId);
    result.bookingTransactionSource = storeSubjectText(arrest.bookingTransactionSource);
    result.sourceFingerprint = bookingSourceFingerprint(data.people[result.personId], arrest);
    result.transactionUnchanged = !!result.bookingTransactionId &&
      result.bookingTransactionSource === result.sourceFingerprint;
    projections.forEach(function (projection) {
      if (projection.personId !== result.personId ||
          ["arrestId", "subjectId", "encounterId"].some(function (field) {
            return storeSubjectText(projection.row[field]) !== result[field];
          })) {
        error = "Canonical Person and Case booking Arrest identities disagree.";
      }
      var projectedPerson = model.subjectOf
        ? model.subjectOf(data.leads[projection.leadId])
        : data.leads[projection.leadId].person;
      if (bookingSourceFingerprint(projectedPerson, projection.row) !== result.sourceFingerprint) {
        result.transactionUnchanged = false;
      }
    });
    var matchedLeads = projections.concat(historyLeads);
    if (!matchedLeads.length) {
      matchedLeads = ownerLeads.filter(function (lead) { return lead.personId === result.personId; });
    }
    var leadIds = [];
    matchedLeads.forEach(function (lead) {
      if (lead.personId !== result.personId) { error = "The booking is claimed by a different Case Person."; }
      if (leadIds.indexOf(lead.leadId) === -1) { leadIds.push(lead.leadId); }
    });
    if (error) { return fail(error); }
    if (leadIds.length !== 1) { return fail("The booking does not have exactly one owning Case."); }
    result.leadId = leadIds[0];
    // Arrest IDs are permanent even when another row omits its booking alias.
    Object.keys(data.people).forEach(function (personId) {
      (data.people[personId].arrests || []).forEach(function (other) {
        if (other === arrest || storeSubjectText(other && other.arrestId) !== result.arrestId) { return; }
        error = "The booking Arrest identifier is duplicated or owned by another Person.";
      });
    });
    Object.keys(data.leads).forEach(function (leadId) {
      var lead = data.leads[leadId];
      var leadPerson = model.subjectOf ? model.subjectOf(lead) : lead.person;
      (leadPerson && leadPerson.arrests || []).forEach(function (other) {
        if (storeSubjectText(other && other.arrestId) !== result.arrestId) { return; }
        if (leadId !== result.leadId || storeSubjectText(leadPerson.personId) !== result.personId ||
            claims(other).length !== 1 || claims(other)[0] !== bookingId) {
          error = "The booking Arrest identifier has conflicting Case ownership.";
        }
      });
    });
    if (error) { return fail(error); }
    if (result.subjectId && !result.encounterId) {
      return fail("The booking subject has no Encounter identifier.");
    }
    result.found = true;
    return result;
  }

  function promoteBookInRecord(record, options) {
    record = record || {};
    options = options || {};
    if (record.voidedAt) { return { ok: false, code: "BOOKING_VOIDED", error: "This booking was voided. Create a new booking with a new ID." }; }
    var recordBookingClaims = [
      storeSubjectText(record.id),
      storeSubjectText(record.bookingId),
      storeSubjectText(record.bookinRecordId)
    ].filter(function (value, index, values) {
      return value && values.indexOf(value) === index;
    });
    if (recordBookingClaims.length > 1) {
      return {
        ok: false,
        code: "BOOKIN_ARREST_IDENTITY_CONFLICT",
        leadId: storeSubjectText(record.leadId),
        personId: storeSubjectText(record.personId),
        existing: false,
        error: "The Book-In record contains contradictory booking identifiers."
      };
    }
    var input = bookInPromotionInput(record);
    if (importWorkspaceContext) {
      input.importOutcome = record.importDecision && record.importDecision.outcome || record.outcome || record.encounterOutcome || "";
    }
    var supplied = options.formData || options;
    Object.keys(supplied || {}).forEach(function (key) {
      if (key !== "formData" && supplied[key] !== undefined) {
        input[key] = supplied[key];
      }
    });
    input.leadId = String(record.leadId || input.leadId || "").trim();
    input.personId = String(record.personId || input.personId || "").trim();
    var suppliedBookingClaims = [
      recordBookingClaims[0] || "",
      storeSubjectText(input.bookingId),
      storeSubjectText(input.bookinRecordId)
    ].filter(function (value, index, values) {
      return value && values.indexOf(value) === index;
    });
    if (suppliedBookingClaims.length > 1) {
      return {
        ok: false,
        code: "BOOKIN_ARREST_IDENTITY_CONFLICT",
        leadId: input.leadId,
        personId: input.personId,
        existing: false,
        error: "The Book-In record contains contradictory booking identifiers."
      };
    }
    input.bookingId = suppliedBookingClaims[0] || "";
    input.bookinRecordId = suppliedBookingClaims[0] || "";
    if (options.recoverBooking === true) {
      var recovery = resolveBookInBooking(input.bookingId);
      if (!recovery.ok) { return recovery; }
      if (recovery.found) {
        if (storeSubjectText(options.bookingTransactionId) &&
            storeSubjectText(options.bookingTransactionId) === recovery.bookingTransactionId &&
            !recovery.transactionUnchanged) {
          return { ok: false, code: "BOOKIN_RECOVERY_SOURCE_CHANGED", error: "Booking facts changed after this transaction was saved. Review the current records before retrying." };
        }
        var conflict = ["personId", "leadId", "arrestId", "subjectId", "encounterId"].some(function (field) {
          var recordValue = storeSubjectText(record[field]);
          var suppliedValue = storeSubjectText(supplied && supplied[field]);
          return (recordValue && suppliedValue && recordValue !== suppliedValue) ||
            (recovery[field] && ((recordValue && recordValue !== recovery[field]) ||
            (suppliedValue && suppliedValue !== recovery[field])));
        });
        if (conflict) {
          return { ok: false, code: "BOOKIN_RECOVERY_IDENTITY_CONFLICT", error: "Supplied booking identifiers disagree with durable ownership." };
        }
        ["personId", "leadId", "arrestId", "subjectId", "encounterId"].forEach(function (field) {
          input[field] = recovery[field] || input[field];
        });
      }
    }
    input.alienNumber = input.alienNumber || input.aNumber || "";
    input.citizenship = input.citizenship || input.countryOfCitizenship || "";
    input.disposition = input.disposition || input.caseType || "";
    input.iceEventNumber = input.iceEventNumber || input.iceEvent || "";
    input.subjectRole = input.subjectRole || input.encounterRole || "";
    input.arrestingOfficer = input.arrestingOfficer || input.officersName || "";
    input.bookInDateTime = input.bookInDateTime || input.dateTime || "";
    input.arrestTime = normalizeBookInClock(input.arrestTime);
    input.arrestDateTime =
      input.arrestDateTime ||
      combineBookInArrestDateTime(input.bookInDateTime, input.arrestTime);
    input.arrestDate =
      input.arrestDate ||
      String(input.arrestDateTime || input.bookInDateTime).slice(0, 10);
    input.sex = input.sex || input.gender || "";
    input.booking = Object.assign(
      {},
      bookInPromotionInput(record).booking,
      input.booking || {}
    );
    input.preserveMissingArrestFields =
      options.preserveMissingArrestFields === true;
    input.bookingTransactionId = storeSubjectText(options.bookingTransactionId);
    return promoteBookInToLead(input);
  }

  function promoteBookInRecords(records, options) {
    var rows = (Array.isArray(records) ? records : []).map(clone);
    var summary = {
      ok: true,
      rows: rows,
      promoted: 0,
      created: 0,
      reused: 0,
      failed: 0,
      errors: []
    };
    rows.forEach(function (row) {
      var result = promoteBookInRecord(row, options || {});
      if (!result || !result.ok) {
        summary.ok = false;
        summary.failed += 1;
        summary.errors.push({
          recordId: String((row && row.id) || ""),
          error: (result && result.error) || "Could not create the case."
        });
        delete row.__copdocImportArrestFieldPresence;
        return;
      }
      row.leadId = result.leadId || row.leadId || "";
      row.personId = result.personId || row.personId || "";
      row.subjectId = result.subjectId || row.subjectId || "";
      row.subjectRole = result.subjectRole || row.subjectRole || "";
      row.encounterRole = result.subjectRole || row.encounterRole || "";
      row.vehiclePosition =
        result.vehiclePosition || row.vehiclePosition || "";
      row.arrestId = result.arrestId || row.arrestId || "";
      delete row.__copdocImportArrestFieldPresence;
      summary.promoted += 1;
      if (result.existing) {
        summary.reused += 1;
      } else {
        summary.created += 1;
      }
    });
    return summary;
  }

  /**
   * Add event-scoped person/vehicle facts after a Book-in save.
   * All main-store mutations are persisted together and repeat saves reuse the
   * same vehicle identities and associations.
   */
  function linkEncounterVehiclesToPerson(input) {
    input = input || {};
    var encounterId = String(input.encounterId || "").trim();
    var personId = String(input.personId || "").trim();
    var leadId = String(input.leadId || "").trim();
    var fresh = adoptDisk();
    if (!fresh.ok) {
      return { ok: false, vehicleIds: [], associationIds: [], error: fresh.error };
    }
    var encounter = encounterId && state.encounters[encounterId];
    if (!encounter) {
      return {
        ok: false,
        vehicleIds: [],
        associationIds: [],
        error: "Encounter not found; its vehicles were not linked."
      };
    }
    if (!personId || !state.people[personId]) {
      return {
        ok: false,
        vehicleIds: [],
        associationIds: [],
        error: "Booked person not found; encounter vehicles were not linked."
      };
    }
    if (!leadId) {
      leadId = leadIdForPerson(personId);
    }
    if (!leadId || !state.leads[leadId]) {
      return {
        ok: false,
        vehicleIds: [],
        associationIds: [],
        error: "Filed case not found; encounter vehicles were not linked."
      };
    }

    var vehicleIds = [];
    var associationIds = [];
    var error = "";
    (encounter.vehicles || []).forEach(function (vehicle) {
      if (error || !vehicle) {
        return;
      }
      var vehicleId = vehicle.vehicleId || vehicle.id || "";
      if (!vehicleId) {
        return;
      }
      putIdentityVehicle(vehicle);
      var shared = state.vehicles[vehicleId];
      shared.locations = Array.isArray(shared.locations) ? shared.locations : [];
      (vehicle.locations || []).forEach(function (location) {
        if (!location || !location.locationId) {
          return;
        }
        putIdentityLocation(location);
        var existingLocation = shared.locations.filter(function (row) {
          return row && row.locationId === location.locationId;
        })[0];
        if (existingLocation) {
          Object.assign(existingLocation, clone(location));
        } else {
          shared.locations.push(clone(location));
        }
        var locationReason = reasonFromNestedLocationKind(location.association);
        if (locationReason === "CURRENT_RESIDENCE") {
          locationReason = "VEHICLE_PARKING";
        }
        writePairOccupancy(
          "VEHICLE",
          vehicleId,
          "LOCATION",
          location.locationId,
          location,
          locationReason
        );
      });
      var linked = upsertAssociation(
        {
          from: { type: "PERSON", id: personId },
          to: { type: "VEHICLE", id: vehicleId },
          reason: "LE_ENCOUNTER_IN_VEHICLE",
          source: {
            encounterId: encounterId,
            leadId: leadId,
            bookinRecordId: String(input.bookinRecordId || "")
          }
        },
        { skipAdopt: true, persist: false, skipLeadSync: true }
      );
      if (!linked || !linked.ok) {
        error = (linked && linked.error) || "Could not link an encounter vehicle.";
        return;
      }
      vehicleIds.push(vehicleId);
      associationIds.push(linked.associationId);
    });
    if (error) {
      adoptDisk();
      return { ok: false, vehicleIds: [], associationIds: [], error: error };
    }
    applyAssociationNestingToLead(state.leads[leadId]);
    rememberPeople(state.leads[leadId]);
    if (!writeDisk()) {
      adoptDisk();
      return {
        ok: false,
        vehicleIds: [],
        associationIds: [],
        error: "Could not write encounter vehicle links to localStorage."
      };
    }
    return {
      ok: true,
      vehicleIds: vehicleIds,
      associationIds: associationIds,
      error: ""
    };
  }

  function listLeads() {
    return Object.keys(state.leads)
      .map(function (id) {
        var snap = state.leads[id];
        var subject = model.subjectOf ? model.subjectOf(snap) : snap.person;
        var name = model.formatPersonLabel(subject) || "Untitled case";
        return {
          leadId: id,
          label: name,
          updatedAt: (snap.meta && snap.meta.updatedAt) || "",
          metaStatus: model.metaStatus ? model.metaStatus(snap) : "committed",
          subjectPersonId: snap.subjectPersonId
        };
      })
      .sort(function (a, b) {
        return String(b.updatedAt).localeCompare(String(a.updatedAt));
      });
  }

  function bookInStorageKey() {
    return (root.config && root.config.storageKey("bookin")) ||
      "alien-book-in.saved-records.v1";
  }

  function loadBookInPackets() {
    if (!importWorkspaceContext && !storagePort.has("localStorage")) {
      return [];
    }
    try {
      var raw = storageRaw("localStorage", bookInStorageKey()) || "";
      if (!raw) {
        return [];
      }
      var parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      return [];
    }
  }

  function packetsForQuery(opts) {
    if (opts && Object.prototype.hasOwnProperty.call(opts, "packets")) {
      return Array.isArray(opts.packets) ? opts.packets : [];
    }
    return loadBookInPackets();
  }

  function packetLookup(packets) {
    var map = {};
    (packets || []).forEach(function (record) {
      if (record && record.id) {
        map[String(record.id)] = record;
      }
    });
    return map;
  }

  function listArrests(opts) {
    opts = opts || {};
    var fresh = adoptDisk();
    if (!fresh.ok) {
      return [];
    }
    var packets = packetsForQuery(opts);
    // Roster pages load arrest-report.js so collect fills name, A-number, dates.
    if (root.arrestReport && typeof root.arrestReport.collect === "function") {
      return root.arrestReport.collect(
        {
          loadFromDisk: function () {},
          listLeads: listLeads,
          getLead: getLead,
          getEncounter: getEncounter,
          getPerson: getPerson,
          bookInPromotionInput: bookInPromotionInput
        },
        packets,
        opts
      );
    }
    var records = packetLookup(packets);
    var rows = [];
    Object.keys(state.leads).forEach(function (id) {
      var snap = state.leads[id];
      if (!snap || (model.isCommitted && !model.isCommitted(snap))) {
        return;
      }
      if (opts.leadId && String(snap.leadId || id) !== String(opts.leadId)) {
        return;
      }
      var person = model.subjectOf ? model.subjectOf(snap) : snap.person;
      ((person && person.arrests) || []).forEach(function (arrest) {
        if (!arrest) {
          return;
        }
        var dateKey = String(arrest.arrestDate || arrest.arrestDateTime || "").slice(0, 10);
        if (opts.from && dateKey && dateKey < opts.from) {
          return;
        }
        if (opts.to && dateKey && dateKey > opts.to) {
          return;
        }
        if ((opts.from || opts.to) && !dateKey) {
          return;
        }
        var recordId = String(arrest.bookinRecordId || "");
        var input = bookInPromotionInput(records[recordId] || {});
        var encounterId = String(arrest.encounterId || input.encounterId || "");
        var encounterNumber = String(
          arrest.encounterNumber || input.encounterNumber || encounterId
        );
        if (
          opts.encounterId &&
          encounterId !== String(opts.encounterId) &&
          encounterNumber !== String(opts.encounterId)
        ) {
          return;
        }
        rows.push({
          leadId: snap.leadId || id,
          personId: (person && person.personId) || "",
          arrestId: arrest.arrestId || "",
          bookinRecordId: recordId,
          iceEvent: String(arrest.iceEventNumber || input.iceEventNumber || ""),
          arrestDate: dateKey,
          encounterId: encounterId,
          encounterNumber: encounterNumber
        });
      });
    });
    return rows;
  }

  /**
   * Other committed leads for a person: as the subject, or as a PERSON
   * endpoint on a person-to-person link. Case view uses this to jump.
   */
  function relatedCommittedCases(personId, excludeLeadId) {
    var id = String(personId || "");
    var skip = String(excludeLeadId || "");
    var asSubject = [];
    var asAssociate = [];
    if (!id) {
      return { asSubject: asSubject, asAssociate: asAssociate };
    }
    listLeads().forEach(function (row) {
      if (!row || row.leadId === skip || row.metaStatus !== "committed") {
        return;
      }
      if (row.subjectPersonId === id) {
        asSubject.push(row);
        return;
      }
      var snap = state.leads[row.leadId];
      var links = (snap && snap.links) || [];
      var i;
      for (i = 0; i < links.length; i++) {
        var link = links[i];
        if (!link) {
          continue;
        }
        var from = link.from || {};
        var to = link.to || {};
        if (
          from.type === "PERSON" &&
          to.type === "PERSON" &&
          (from.id === id || to.id === id)
        ) {
          asAssociate.push(row);
          return;
        }
      }
    });
    return { asSubject: asSubject, asAssociate: asAssociate };
  }

  function allPeople() {
    return Object.keys(state.people).map(function (id) {
      return clone(state.people[id]);
    });
  }

  function getPerson(personId) {
    var person = state.people[personId];
    return person ? clone(person) : null;
  }

  function upsertPerson(person, opts) {
    if (!person || !person.personId) {
      return { ok: false, error: "Person is missing a personId." };
    }
    var fresh = adoptDisk();
    if (!fresh.ok) {
      return { ok: false, error: fresh.error };
    }
    var before = clone(state);
    var prepared = prepareObjectRecord("PERSON", person, opts);
    if (!prepared.ok) { return prepared; }
    var locationsPrepared = stageObjectGraph({ locations: prepared.record.locations || [] });
    if (!locationsPrepared.ok) { state = before; return locationsPrepared; }
    prepared.record.locations = (prepared.record.locations || []).map(function (location) { return canonicalLocationRecord(location, null); });
    state.people[person.personId] = clone(prepared.record);
    syncObjectOwnedLocations(
      "PERSON",
      person.personId,
      state.people[person.personId].locations
    );
    if (!writeDisk()) {
      state = before;
      return {
        ok: false,
        error: "Could not write localStorage (quota or private mode)."
      };
    }
    return { ok: true, personId: person.personId, objectRevision: prepared.record.objectRevision, error: "" };
  }

  var encounterCompletion = root.projections.createEncounterCompletion({
    clone: clone,
    getLocations: function () { return state.locations; },
    nowIso: function () { return model.nowIso ? model.nowIso() : new Date().toISOString(); }
  });
  var encounterPin = encounterCompletion.encounterPin;
  var buildEncounterCompleted = encounterCompletion.buildEncounterCompleted;

  function stampArrestsFromEncounter(encounter) {
    var pin = encounterPin(encounter) || (encounter.completed && encounter.completed.pin);
    if (!pin) {
      return;
    }
    var encounterSubjects = Array.isArray(encounter.subjects)
      ? encounter.subjects
      : [];
    encounterSubjects.forEach(function (subject) {
      if (!subject || !subject.leadId || !state.leads[subject.leadId]) {
        return;
      }
      var lead = state.leads[subject.leadId];
      var person = model.subjectOf ? model.subjectOf(lead) : lead.person;
      if (!person || !Array.isArray(person.arrests)) {
        return;
      }
      var changed = false;
      person.arrests.forEach(function (arr) {
        if (!arr) {
          return;
        }
        var subjectId = storeSubjectId(subject);
        var arrestSubjectId = storeSubjectId(arr);
        var bookingId = storeSubjectBookingId(subject);
        var arrestBookingId = storeSubjectBookingId(arr);
        var match = false;
        if (arrestSubjectId) {
          match = !!subjectId && subjectId === arrestSubjectId;
        } else if (arrestBookingId) {
          var bookingOwners = encounterSubjects.filter(function (candidate) {
            return storeSubjectBookingId(candidate) === arrestBookingId;
          });
          var bookingArrests = person.arrests.filter(function (candidate) {
            return (
              !storeSubjectId(candidate) &&
              storeSubjectBookingId(candidate) === arrestBookingId
            );
          });
          match =
            !!bookingId &&
            bookingId === arrestBookingId &&
            bookingOwners.length === 1 &&
            storeSubjectId(bookingOwners[0]) === subjectId &&
            bookingArrests.length === 1;
        } else if (arr.encounterId && arr.encounterId === encounter.encounterId) {
          var relatedSubjects = encounterSubjects.filter(function (candidate) {
            if (subject.personId) {
              return candidate && candidate.personId === subject.personId;
            }
            return candidate && candidate.leadId && candidate.leadId === subject.leadId;
          });
          var encounterArrests = person.arrests.filter(function (candidate) {
            return (
              candidate &&
              !storeSubjectId(candidate) &&
              !storeSubjectBookingId(candidate) &&
              candidate.encounterId === encounter.encounterId
            );
          });
          match =
            relatedSubjects.length === 1 &&
            storeSubjectId(relatedSubjects[0]) === subjectId &&
            encounterArrests.length === 1;
        }
        if (!match) {
          return;
        }
        if (!arrestSubjectId && subjectId) {
          arr.subjectId = subjectId;
        }
        if (!storeSubjectBookingId(arr) && bookingId) {
          arr.bookingId = bookingId;
          arr.bookinRecordId = bookingId;
        }
        if (!arr.latitude) {
          arr.latitude = pin.latitude;
        }
        if (!arr.longitude) {
          arr.longitude = pin.longitude;
        }
        if (!arr.arrestLocation) {
          arr.arrestLocation = pin.arrestLocation;
        }
        changed = true;
      });
      if (!changed) {
        return;
      }
      lead.person = person;
      if (person.personId && state.people[person.personId]) {
        state.people[person.personId].arrests = clone(person.arrests);
      }
    });
  }

  function completeEncounter(encounterId) {
    var fresh = adoptDisk();
    if (!fresh.ok) {
      return { ok: false, encounterId: encounterId || "", error: fresh.error };
    }
    var row = state.encounters[encounterId];
    if (!row) {
      return {
        ok: false,
        encounterId: encounterId || "",
        error: "Encounter not found."
      };
    }
    if (!String(row.startedAt || "").trim()) {
      return {
        ok: false,
        encounterId: encounterId,
        error: "Set the date and time of the stop before completing."
      };
    }
    return saveEncounter(row, { mode: "complete" });
  }

  function applyEncounterLocationToArrests(encounterId) {
    var fresh = adoptDisk();
    if (!fresh.ok) {
      return { ok: false, encounterId: encounterId || "", error: fresh.error };
    }
    var row = state.encounters[encounterId];
    if (!row) {
      return {
        ok: false,
        encounterId: encounterId || "",
        error: "Encounter not found."
      };
    }
    stampArrestsFromEncounter(row);
    if (!writeDisk()) {
      adoptDisk();
      return {
        ok: false,
        encounterId: encounterId,
        error: "Could not write localStorage (quota or private mode)."
      };
    }
    return { ok: true, encounterId: encounterId, error: "" };
  }

  function encounterWriteExpectationConflict(record, previous) {
    if (!previous || !storeSubjectOwn(record, "subjects")) {
      return false;
    }
    var incomingMeta = record.meta || {};
    var previousMeta = previous.meta || {};
    var hasIncomingRevision =
      storeSubjectOwn(incomingMeta, "encounterRevision") &&
      Number.isFinite(Number(incomingMeta.encounterRevision));
    var hasPreviousRevision =
      storeSubjectOwn(previousMeta, "encounterRevision") &&
      Number.isFinite(Number(previousMeta.encounterRevision));
    var incomingRevision = Number(incomingMeta.encounterRevision);
    var previousRevision = Number(previousMeta.encounterRevision);
    /*
     * Only the persisted Encounter revision is a safe compare-and-swap token.
     * normalizeState() supplies compatibility meta to legacy rows in memory;
     * comparing those generated timestamps makes the same untouched legacy
     * Encounter appear stale on every reload. Permit that one-time migration,
     * then require every full-roster writer to present the stored revision.
     */
    if (!hasPreviousRevision) {
      return false;
    }
    return !hasIncomingRevision || incomingRevision !== previousRevision;
  }

  function persistEncounter(record, opts, previous) {
    var mode = (opts && opts.mode) || "commit";
    if (previous && previous.meta && previous.meta.archivedAt) { return { ok: false, code: "OBJECT_ARCHIVED", encounterId: record.encounterId, error: "This Encounter is archived. Restore it explicitly before editing." }; }
    if (previous && previous.meta && previous.meta.markedComplete) {
      return {
        ok: false,
        code: "ENCOUNTER_LOCKED",
        encounterId: (record && record.encounterId) || "",
        error: "This encounter is completed and locked.",
        encounter: clone(previous)
      };
    }
    if (storeSubjectOwn(record, "subjects") && !Array.isArray(record.subjects)) {
      return {
        ok: false,
        code: "ENCOUNTER_SUBJECT_ROSTER_INVALID",
        encounterId: (record && record.encounterId) || "",
        error: "Encounter subjects must be an array.",
        encounter: previous ? clone(previous) : null
      };
    }
    if (encounterWriteExpectationConflict(record, previous)) {
      return {
        ok: false,
        code: "ENCOUNTER_STALE_WRITE",
        encounterId: (record && record.encounterId) || "",
        error: "This encounter changed in another window. Reload it before saving.",
        encounter: clone(previous)
      };
    }
    var subjectsForConflict =
      record && storeSubjectOwn(record, "subjects")
        ? record.subjects
        : previous && previous.subjects;
    var subjectConflict = encounterSubjectIdentityConflict(
      previous && previous.subjects,
      subjectsForConflict,
      record && record.encounterId,
      opts
    );
    if (subjectConflict) {
      return {
        ok: false,
        code: subjectConflict.code,
        encounterId: (record && record.encounterId) || "",
        error:
          "Encounter subject identity conflicts with the existing " +
          subjectConflict.matchedBy +
          " association.",
        conflict: subjectConflict,
        encounter: previous ? clone(previous) : null
      };
    }
    var objectGraphBefore = clone(state);
    var objectGraph = stageObjectGraph(record);
    if (!objectGraph.ok) { return { ok: false, code: objectGraph.code, encounterId: record.encounterId, error: objectGraph.error }; }
    var saved = mergeRecord(previous, record);
    saved.schema = record.schema || "copdocx.encounter.v1";
    saved.encounterId = record.encounterId;
    // Completion snapshots, their audit history, and unlock evidence are
    // store-owned. Caller/import payloads may not mint ownership evidence or
    // erase the last trusted lock transition.
    saved.completedHistory = Array.isArray(previous && previous.completedHistory)
      ? clone(previous.completedHistory)
      : [];
    if (previous && previous.completed) {
      saved.completed = clone(previous.completed);
    } else {
      delete saved.completed;
    }
    if (previous && previous.unlock) {
      saved.unlock = clone(previous.unlock);
    } else {
      delete saved.unlock;
    }
    if (typeof model.stampMeta === "function") {
      saved.meta = model.stampMeta(previous, mode === "complete" ? "complete" : mode);
    } else {
      saved.meta = record.meta || {};
      saved.meta.updatedAt = model.nowIso();
    }
    saved.meta = saved.meta || {};
    saved.meta.encounterRevision =
      (previous && previous.meta && Number.isFinite(Number(previous.meta.encounterRevision))
        ? Number(previous.meta.encounterRevision)
        : 0) + 1;
    if (!Array.isArray(saved.vehicles)) {
      saved.vehicles = [];
    }
    if (!Array.isArray(saved.locations)) {
      saved.locations = [];
    }
    var preserveLegacyRosterShape = !!(
      opts &&
      opts.preserveMissingSubjectRoster === true &&
      previous &&
      !Array.isArray(previous.subjects) &&
      !Array.isArray(record && record.subjects)
    );
    if (!Array.isArray(saved.subjects) && !preserveLegacyRosterShape) {
      saved.subjects = [];
    }
    if (Array.isArray(saved.subjects)) {
      saved.subjects = normalizeEncounterSubjectsForStore(saved.subjects, {
        encounterId: saved.encounterId,
        previousSubjects: (previous && previous.subjects) || [],
        mergePrevious: true
      });
    }
    if (previous && Array.isArray(saved.subjects)) {
      var removingBooked = (previous.subjects || []).some(function (subject) {
        return storeSubjectBookingId(subject) && !saved.subjects.some(function (row) { return storeSubjectId(row) === storeSubjectId(subject); });
      });
      if (removingBooked) { state = objectGraphBefore; return { ok: false, code: "ENCOUNTER_BOOKING_DEPENDENCY", encounterId: record.encounterId, error: "Void the linked booking before removing its Encounter subject." }; }
    }
    var ownershipHistory = Array.isArray(
      previous && previous.subjectIdentityHistory
    )
      ? clone(previous.subjectIdentityHistory)
      : [];
    var activeSubjectIds = Object.create(null);
    (Array.isArray(saved.subjects) ? saved.subjects : []).forEach(function (row) {
      var id = storeSubjectId(row);
      if (id) {
        activeSubjectIds[id] = true;
      }
    });
    (Array.isArray(previous && previous.subjects)
      ? previous.subjects
      : []
    ).forEach(function (row) {
      var id = storeSubjectId(row);
      if (!id || activeSubjectIds[id]) {
        return;
      }
      var bookingId = storeSubjectBookingId(row);
      var alreadyRecorded = ownershipHistory.some(function (entry) {
        return (
          storeSubjectId(entry) === id &&
          storeSubjectBookingId(entry) === bookingId &&
          storeSubjectText(entry && entry.personId) ===
            storeSubjectText(row && row.personId) &&
          storeSubjectText(entry && entry.leadId) ===
            storeSubjectText(row && row.leadId)
        );
      });
      if (!alreadyRecorded) {
        var removed = {
          entityType: "ENCOUNTER_SUBJECT",
          schema: "copdocx.encounter-subject.v1",
          subjectId: id,
          encounterId: saved.encounterId,
          personId: storeSubjectText(row && row.personId),
          leadId: storeSubjectText(row && row.leadId),
          bookingId: bookingId,
          bookinRecordId: bookingId,
          legacyEncounterParticipantIds: Array.isArray(
            row && row.legacyEncounterParticipantIds
          )
            ? clone(row.legacyEncounterParticipantIds)
            : [],
          removedAt:
          typeof model.nowIso === "function"
            ? model.nowIso()
            : new Date().toISOString()
        };
        ownershipHistory.push(removed);
      }
    });
    saved.subjectIdentityHistory = normalizeEncounterSubjectsForStore(
      ownershipHistory,
      {
        encounterId: saved.encounterId,
        previousSubjects: ownershipHistory,
        mergePrevious: false
      }
    );
    var bookingIdentityHistory = Array.isArray(
      previous && previous.bookingIdentityHistory
    )
      ? clone(previous.bookingIdentityHistory)
      : [];
    if (opts && opts.bookingUnlink) {
      var retiredSubjectId = storeSubjectText(opts.bookingUnlink.subjectId);
      var retiredBookingId = storeSubjectText(opts.bookingUnlink.bookingId);
      var alreadyRetired = bookingIdentityHistory.some(function (entry) {
        return (
          storeSubjectId(entry) === retiredSubjectId &&
          storeSubjectBookingId(entry) === retiredBookingId
        );
      });
      if (retiredSubjectId && retiredBookingId && !alreadyRetired) {
        bookingIdentityHistory.push({
          subjectId: retiredSubjectId,
          encounterId: saved.encounterId,
          bookingId: retiredBookingId,
          bookinRecordId: retiredBookingId,
          bookingUnlinked: true,
          removedAt:
            typeof model.nowIso === "function"
              ? model.nowIso()
              : new Date().toISOString()
        });
      }
    }
    saved.bookingIdentityHistory = bookingIdentityHistory;
    if (!Array.isArray(saved.links)) {
      saved.links = [];
    }
    if (!Array.isArray(saved.narratives)) {
      saved.narratives = [];
    }
    var previousVehicles = (previous && previous.vehicles) || [];
    saved.vehicles = saved.vehicles.map(function (vehicle) {
      var id = vehicle && (vehicle.vehicleId || vehicle.id);
      var old = id
        ? matchingById(previousVehicles, "vehicleId", id) || state.vehicles[id]
        : null;
      return canonicalVehicleRecord(vehicle, old);
    });
    var previousLocations = (previous && previous.locations) || [];
    saved.locations = saved.locations.map(function (location) {
      var id = location && (location.locationId || location.id);
      var old = id
        ? matchingById(previousLocations, "locationId", id) || state.locations[id]
        : null;
      return canonicalLocationRecord(location, old);
    });
    saved.links = saved.links.map(function (link) {
      return typeof model.createLink === "function"
        ? model.createLink(link || {})
        : link;
    });
    if (!saved.supervisorSummary || typeof saved.supervisorSummary !== "object") {
      saved.supervisorSummary = { text: "", derivedAt: "", coverage: null };
    }
    syncEncounterObjects(saved);
    if (
      Array.isArray(saved.subjects) &&
      typeof model.sharedStopFromEncounter === "function"
    ) {
      var sharedStop = model.sharedStopFromEncounter(saved);
      saved.subjects = (saved.subjects || []).map(function (row) {
        return model.stampSharedStop
          ? model.stampSharedStop(row, sharedStop)
          : row;
      });
      saved.subjects.forEach(function (subject) {
        if (!subject || !subject.personId || !state.people[subject.personId]) {
          return;
        }
        var person = clone(state.people[subject.personId]);
        if (typeof model.upsertPersonLeEncounter === "function") {
          person = model.upsertPersonLeEncounter(person, subject, sharedStop);
        }
        state.people[person.personId] = clone(
          canonicalPersonRecord(person, state.people[person.personId])
        );
      });
    }
    if (mode === "complete") {
      if (previous && previous.completed) {
        saved.completedHistory.push({
          generatedAt: previous.completed.generatedAt || "",
          unlockedAt: (previous.unlock && previous.unlock.unlockedAt) || "",
          unlockedByAlias: (previous.unlock && previous.unlock.unlockedByAlias) || "",
          reason: (previous.unlock && previous.unlock.reason) || "",
          snapshot: clone(previous.completed)
        });
      }
      saved.completed = buildEncounterCompleted(saved);
      saved.unlock = null;
      stampArrestsFromEncounter(saved);
    }
    normalizeEncounterStateRecord(saved, saved.encounterId);
    state.encounters[saved.encounterId] = clone(saved);
    if (!writeDisk()) {
      state = objectGraphBefore;
      return {
        ok: false,
        encounterId: saved.encounterId,
        error: "Could not write localStorage (quota or private mode).",
        encounter: state.encounters[saved.encounterId]
          ? clone(state.encounters[saved.encounterId])
          : null
      };
    }
    return {
      ok: true,
      encounterId: saved.encounterId,
      error: "",
      encounter: clone(saved)
    };
  }

  function saveEncounterWithObjects(record, opts) {
    opts = opts || {};
    if (!Array.isArray(opts.personEdits)) { return { ok: false, code: "OBJECT_INVALID", error: "Encounter Person edits must be an array." }; }
    var savedIds = [];
    for (var i = 0; i < opts.personEdits.length; i += 1) {
      var edit = opts.personEdits[i] || {};
      var savedPerson = saveObjectRecord("PERSON", edit.record, { intent: edit.intent, expectedRevision: edit.expectedRevision });
      if (!savedPerson.ok) { return savedPerson; }
      savedIds.push(savedPerson.objectId);
    }
    var encounterOptions = Object.assign({}, opts);
    delete encounterOptions.personEdits;
    var result = saveEncounter(record, encounterOptions);
    if (result.ok) { result.objectRecords = savedIds.map(function (id) { return getPerson(id); }); }
    return result;
  }

  function validateEncounterSubjectRoster(record, validationOpts) {
    var encounterId = storeSubjectText(record && record.encounterId);
    if (!record || !encounterId) {
      return {
        ok: false,
        code: "ENCOUNTER_SUBJECT_ID_CONFLICT",
        encounterId: "",
        error: "Encounter is missing an encounterId."
      };
    }
    if (!Array.isArray(record.subjects)) {
      return {
        ok: false,
        code: "ENCOUNTER_SUBJECT_ROSTER_INVALID",
        encounterId: encounterId,
        error: "Encounter subjects must be an array."
      };
    }
    var fresh = adoptDisk();
    if (!fresh.ok) {
      return {
        ok: false,
        encounterId: encounterId,
        error: fresh.error
      };
    }
    var previous = state.encounters[encounterId]
      ? clone(state.encounters[encounterId])
      : null;
    if (previous && previous.meta && previous.meta.markedComplete) {
      return {
        ok: false,
        code: "ENCOUNTER_LOCKED",
        encounterId: encounterId,
        error: "This encounter is completed and locked.",
        encounter: clone(previous)
      };
    }
    if (record.meta && encounterWriteExpectationConflict(record, previous)) {
      return {
        ok: false,
        code: "ENCOUNTER_STALE_WRITE",
        encounterId: encounterId,
        error: "This encounter changed in another window. Reload it before saving.",
        encounter: clone(previous)
      };
    }
    var conflict = encounterSubjectIdentityConflict(
      previous && previous.subjects,
      record.subjects,
      encounterId,
      validationOpts
    );
    if (!conflict) {
      return { ok: true, encounterId: encounterId, error: "" };
    }
    return {
      ok: false,
      code: conflict.code,
      encounterId: encounterId,
      error:
        "Encounter subject identity conflicts with the existing " +
        conflict.matchedBy +
        " association.",
      conflict: conflict
    };
  }

  function saveEncounter(record, opts) {
    var encounterId = storeSubjectText(record && record.encounterId);
    if (!record || !encounterId) {
      return {
        ok: false,
        encounterId: "",
        error: "Encounter is missing an encounterId."
      };
    }
    if (storeSubjectOwn(record, "subjects") && !Array.isArray(record.subjects)) {
      return {
        ok: false,
        code: "ENCOUNTER_SUBJECT_ROSTER_INVALID",
        encounterId: encounterId,
        error: "Encounter subjects must be an array."
      };
    }
    var incoming = clone(record);
    incoming.encounterId = encounterId;
    var fresh = adoptDisk();
    if (!fresh.ok) {
      return {
        ok: false,
        encounterId: encounterId,
        error: fresh.error
      };
    }
    var previous = state.encounters[encounterId]
      ? clone(state.encounters[encounterId])
      : null;
    return persistEncounter(incoming, opts, previous);
  }

  function unlinkEncounterSubjectBooking(encounterId, subjectId, bookingId) {
    encounterId = storeSubjectText(encounterId);
    subjectId = storeSubjectText(subjectId);
    bookingId = storeSubjectText(bookingId);
    if (!encounterId || !subjectId || !bookingId) {
      return {
        ok: false,
        code: "ENCOUNTER_SUBJECT_ID_CONFLICT",
        encounterId: encounterId,
        error: "Encounter, subject, and booking identifiers are required."
      };
    }
    var fresh = adoptDisk();
    if (!fresh.ok) {
      return { ok: false, encounterId: encounterId, error: fresh.error };
    }
    var previous = state.encounters[encounterId]
      ? clone(state.encounters[encounterId])
      : null;
    if (!previous) {
      return {
        ok: false,
        encounterId: encounterId,
        error: "Encounter not found."
      };
    }
    if (previous.meta && previous.meta.markedComplete) {
      return {
        ok: false,
        code: "ENCOUNTER_LOCKED",
        encounterId: encounterId,
        error: "This encounter is completed and locked.",
        encounter: clone(previous)
      };
    }
    var subjects = Array.isArray(previous.subjects) ? previous.subjects : [];
    var subjectMatches = subjects.filter(function (row) {
      return storeSubjectId(row) === subjectId;
    });
    var bookingOwners = subjects.filter(function (row) {
      var claims = [row && row.bookingId, row && row.bookinRecordId]
        .map(storeSubjectText)
        .filter(function (value, index, values) {
          return value && values.indexOf(value) === index;
        });
      return claims.length === 1 && claims[0] === bookingId;
    });
    if (
      subjectMatches.length !== 1 ||
      bookingOwners.length !== 1 ||
      subjectMatches[0] !== bookingOwners[0]
    ) {
      return {
        ok: false,
        code: "ENCOUNTER_SUBJECT_ID_CONFLICT",
        encounterId: encounterId,
        error:
          "The booking does not have one exact Encounter subject owner. Run Integrity before unlinking it.",
        encounter: clone(previous)
      };
    }
    var next = clone(previous);
    next.subjects = next.subjects.map(function (row) {
      if (storeSubjectId(row) !== subjectId) {
        return row;
      }
      var cleared = clone(row);
      cleared.bookingId = "";
      cleared.bookinRecordId = "";
      cleared.packetFiledAt = "";
      cleared.docsGeneratedAt = "";
      return cleared;
    });
    return persistEncounter(
      next,
      {
        mode:
          model.isCommitted && model.isCommitted(previous) ? "commit" : "draft",
        bookingUnlink: { subjectId: subjectId, bookingId: bookingId }
      },
      previous
    );
  }

  /**
   * Read, change, and write one Encounter against the latest disk snapshot.
   * The updater runs synchronously after adoptDisk, reducing stale-state
   * replacements. localStorage has no cross-context transaction, so truly
   * simultaneous writers remain last-writer-wins.
   */
  function updateEncounter(encounterId, updater, opts) {
    encounterId = storeSubjectText(encounterId);
    if (!encounterId || typeof updater !== "function") {
      return {
        ok: false,
        encounterId: encounterId || "",
        error: "Encounter update requires an encounterId and updater."
      };
    }
    var fresh = adoptDisk();
    if (!fresh.ok) {
      return {
        ok: false,
        encounterId: encounterId,
        error: fresh.error
      };
    }
    var previous = state.encounters[encounterId]
      ? clone(state.encounters[encounterId])
      : null;
    if (!previous) {
      return {
        ok: false,
        encounterId: encounterId,
        error: "Encounter not found."
      };
    }
    var next = clone(previous);
    try {
      next = updater(next, clone(previous)) || next;
    } catch (error) {
      return {
        ok: false,
        encounterId: encounterId,
        error: error && error.message ? error.message : "Encounter update failed.",
        cause: error,
        encounter: clone(previous)
      };
    }
    var nextEncounterId = storeSubjectText(next && next.encounterId);
    if (!next || nextEncounterId !== encounterId) {
      return {
        ok: false,
        encounterId: encounterId,
        error: "Encounter updater returned the wrong encounter.",
        encounter: clone(previous)
      };
    }
    next.encounterId = nextEncounterId;
    if (storeSubjectOwn(next, "subjects") && !Array.isArray(next.subjects)) {
      return {
        ok: false,
        code: "ENCOUNTER_SUBJECT_ROSTER_INVALID",
        encounterId: encounterId,
        error: "Encounter subjects must be an array.",
        encounter: clone(previous)
      };
    }
    var updateOpts = Object.assign({}, opts || {});
    if (!updateOpts.mode) {
      updateOpts.mode =
        model.isCommitted && model.isCommitted(previous) ? "commit" : "draft";
    }
    updateOpts.preserveMissingSubjectRoster =
      !Array.isArray(previous.subjects) && !Array.isArray(next.subjects);
    return persistEncounter(next, updateOpts, previous);
  }

  function getEncounter(encounterId) {
    var row = state.encounters[storeSubjectText(encounterId)];
    return row ? clone(row) : null;
  }

  function unlockEncounter(encounterId, input) {
    input = input || {};
    var id = String(encounterId || "").trim();
    var reason = String(input.reason || "").trim();
    var fresh = adoptDisk();
    if (!fresh.ok) {
      return { ok: false, encounterId: id, error: fresh.error };
    }
    if (!id || !state.encounters[id]) {
      return { ok: false, encounterId: id, error: "Encounter not found." };
    }
    if (!reason) {
      return { ok: false, encounterId: id, error: "Unlock requires a reason." };
    }
    var row = clone(state.encounters[id]);
    if (!row.meta || !row.meta.markedComplete) {
      return {
        ok: false,
        encounterId: id,
        error: "This encounter is not locked."
      };
    }
    var now = model.nowIso ? model.nowIso() : new Date().toISOString();
    row.meta = row.meta || {};
    row.meta.markedComplete = false;
    row.meta.updatedAt = now;
    row.meta.encounterRevision =
      (Number.isFinite(Number(row.meta.encounterRevision))
        ? Number(row.meta.encounterRevision)
        : 0) + 1;
    row.unlock = {
      unlockedAt: now,
      reason: reason,
      unlockedByAlias: String(input.unlockedByAlias || "")
    };
    state.encounters[id] = row;
    if (!writeDisk()) {
      adoptDisk();
      return {
        ok: false,
        encounterId: id,
        error: "Could not write localStorage (quota or private mode)."
      };
    }
    return { ok: true, encounterId: id, error: "" };
  }

  function dropOwnedMedia(encounter) {
    var media = root.media;
    if (!media || typeof media.removeByOwner !== "function" || !encounter) {
      return;
    }
    function forget(owner) {
      media.removeByOwner(owner).then(function () {}, function () {});
    }
    forget({ type: "ENCOUNTER", id: encounter.encounterId });
    (encounter.vehicles || []).forEach(function (vehicle) {
      if (vehicle && vehicle.vehicleId) {
        forget({ type: "VEHICLE", id: vehicle.vehicleId });
      }
    });
    (encounter.locations || []).forEach(function (location) {
      if (location && location.locationId) {
        forget({ type: "LOCATION", id: location.locationId });
      }
    });
  }

  function deleteEncounter(encounterId) {
    var fresh = adoptDisk();
    if (!fresh.ok) {
      return {
        ok: false,
        encounterId: encounterId || "",
        error: fresh.error
      };
    }
    if (!encounterId || !state.encounters[encounterId]) {
      return { ok: false, encounterId: encounterId || "", error: "Encounter not found." };
    }
    var protection = stage5DeleteProtection("ENCOUNTER", encounterId);
    if (!protection.ok) {
      protection.encounterId = encounterId;
      return protection;
    }
    var beforeDelete = clone(state);
    delete state.encounters[encounterId];
    if (!writeDisk()) {
      state = beforeDelete;
      return {
        ok: false,
        encounterId: encounterId,
        error: "Could not write localStorage (quota or private mode)."
      };
    }
    // Shared Vehicle/Location media belongs to those objects, never to this
    // Encounter. Retain even Encounter-owned bytes for deliberate media cleanup.
    return { ok: true, encounterId: encounterId, error: "" };
  }

  function saveInvestigation(record, opts) {
    if (!record || !record.investigationId) {
      return {
        ok: false,
        investigationId: "",
        error: "Investigation is missing an investigationId."
      };
    }
    var kind = String(record.kind || "");
    if (model.isInvestigationKind && !model.isInvestigationKind(kind)) {
      return {
        ok: false,
        investigationId: record.investigationId,
        error: "Pick a source for this investigation."
      };
    }
    var fresh = adoptDisk();
    if (!fresh.ok) {
      return {
        ok: false,
        investigationId: record.investigationId,
        error: fresh.error
      };
    }
    var mode = (opts && opts.mode) || "commit";
    var previous = state.investigations[record.investigationId]
      ? clone(state.investigations[record.investigationId])
      : null;
    if (previous && previous.meta && previous.meta.archivedAt) {
      return { ok: false, investigationId: record.investigationId, code: "RECORD_ARCHIVED", error: "This investigation is archived. Its history was preserved." };
    }
    var saved = previous ? Object.assign({}, previous, record) : record;
    saved.schema = record.schema || model.INVESTIGATION_SCHEMA || "copdocx.investigation.v1";
    saved.investigationId = record.investigationId;
    if (typeof model.stampMeta === "function") {
      saved.meta = model.stampMeta(previous, mode);
    } else {
      saved.meta = record.meta || {};
      saved.meta.updatedAt = model.nowIso();
    }
    saved.meta.markedComplete = false;
    if (!Array.isArray(saved.plates)) {
      saved.plates = [];
    }
    if (!Array.isArray(saved.nodes)) {
      saved.nodes = [];
    }
    if (!Array.isArray(saved.links)) {
      saved.links = [];
    }
    saved.links = projectAssociationLinks(saved.links);
    if (!Array.isArray(saved.history)) {
      saved.history = [];
    }
    state.investigations[saved.investigationId] = clone(saved);
    if (!writeDisk()) {
      adoptDisk();
      return {
        ok: false,
        investigationId: saved.investigationId,
        error: "Could not write localStorage (quota or private mode)."
      };
    }
    return { ok: true, investigationId: saved.investigationId, error: "" };
  }

  function getInvestigation(investigationId) {
    var row = state.investigations[investigationId];
    return row ? clone(row) : null;
  }

  function deleteInvestigation(investigationId) {
    var fresh = adoptDisk();
    if (!fresh.ok) {
      return { ok: false, investigationId: investigationId || "", error: fresh.error };
    }
    if (!investigationId || !state.investigations[investigationId]) {
      return {
        ok: false,
        investigationId: investigationId || "",
        error: "Investigation not found."
      };
    }
    var protection = stage5DeleteProtection("INVESTIGATION", investigationId);
    if (!protection.ok) {
      protection.investigationId = investigationId;
      return protection;
    }
    var beforeDelete = clone(state);
    delete state.investigations[investigationId];
    if (!writeDisk()) {
      state = beforeDelete;
      return {
        ok: false,
        investigationId: investigationId,
        error: "Could not write localStorage (quota or private mode)."
      };
    }
    return { ok: true, investigationId: investigationId, error: "" };
  }

  function saveOperation(record, opts) {
    if (!record || !record.operationId) {
      return {
        ok: false,
        operationId: "",
        error: "Operation is missing an operationId."
      };
    }
    var fresh = adoptDisk();
    if (!fresh.ok) {
      return {
        ok: false,
        operationId: record.operationId,
        error: fresh.error
      };
    }
    var mode = (opts && opts.mode) || "commit";
    if (mode === "commit" && !String(record.name || "").trim()) {
      return {
        ok: false,
        operationId: record.operationId,
        error: "Name this operation."
      };
    }
    var previous = state.operations[record.operationId]
      ? clone(state.operations[record.operationId])
      : null;
    if (previous && previous.meta && previous.meta.archivedAt) { return { ok: false, operationId: record.operationId, error: "This Operation is archived. Restore it explicitly before editing." }; }
    var operationBefore = clone(state);
    var locationGraph = stageObjectGraph({ locations: record.opLocations || [] });
    if (!locationGraph.ok) { return { ok: false, operationId: record.operationId, code: locationGraph.code, error: locationGraph.error }; }
    var saved = previous ? Object.assign({}, previous, clone(record)) : clone(record);
    saved.schema = record.schema || model.OPERATION_SCHEMA || "copdocx.operation.v1";
    saved.operationId = record.operationId;
    saved.operationNumber = record.operationNumber || record.operationId;
    saved.entityType = "OPERATION";
    if (typeof model.stampMeta === "function") {
      saved.meta = model.stampMeta(previous, mode);
    } else {
      saved.meta = record.meta || {};
      saved.meta.updatedAt = model.nowIso();
    }
    saved.meta.markedComplete = false;
    saved.targets = Array.isArray(saved.targets) ? saved.targets : [];
    saved.teams = Array.isArray(saved.teams) ? saved.teams : [];
    saved.targetAssignments = Array.isArray(saved.targetAssignments)
      ? saved.targetAssignments
      : [];
    saved.opLocations = (Array.isArray(saved.opLocations) ? saved.opLocations : []).map(function (location) {
      var canonical = canonicalLocationRecord(location, null);
      canonical.opAssociation = location.opAssociation || location.association || "";
      canonical.association = canonical.opAssociation;
      return canonical;
    });
    saved.medevacRoute = Array.isArray(saved.medevacRoute) ? saved.medevacRoute : [];
    saved.history = Array.isArray(saved.history) ? saved.history : [];
    if (mode === "commit" && model.freezeOperationTarget) {
      saved.targets = (saved.targets || []).map(function (row) {
        if (!row || !row.leadId) {
          return row;
        }
        var lead = state.leads[row.leadId];
        if (!lead) {
          return row;
        }
        var next = clone(row);
        next.personId = next.personId || lead.subjectPersonId || "";
        next.freeze = model.freezeOperationTarget(lead);
        return next;
      });
    }
    if (mode === "commit" && model.generateOperationOrder) {
      saved.order = model.generateOperationOrder(saved);
    }
    state.operations[saved.operationId] = clone(saved);
    if (!writeDisk()) {
      state = operationBefore;
      return {
        ok: false,
        operationId: saved.operationId,
        error: "Could not write localStorage (quota or private mode)."
      };
    }
    return { ok: true, operationId: saved.operationId, error: "" };
  }

  function getOperation(operationId) {
    var row = state.operations[operationId];
    return row ? clone(row) : null;
  }

  function deleteOperation(operationId) {
    var fresh = adoptDisk();
    if (!fresh.ok) {
      return { ok: false, operationId: operationId || "", error: fresh.error };
    }
    if (!operationId || !state.operations[operationId]) {
      return {
        ok: false,
        operationId: operationId || "",
        error: "Operation not found."
      };
    }
    var protection = stage5DeleteProtection("OPERATION", operationId);
    if (!protection.ok) {
      protection.operationId = operationId;
      return protection;
    }
    var beforeDelete = clone(state);
    delete state.operations[operationId];
    if (!writeDisk()) {
      state = beforeDelete;
      return {
        ok: false,
        operationId: operationId,
        error: "Could not write localStorage (quota or private mode)."
      };
    }
    return { ok: true, operationId: operationId, error: "" };
  }

  function listImportableOperationTargets() {
    adoptDisk();
    var out = [];
    Object.keys(state.leads || {}).forEach(function (id) {
      var lead = state.leads[id];
      if (!lead || (model.isCommitted && !model.isCommitted(lead))) {
        return;
      }
      if (model.leadIsImportableOperationTarget && !model.leadIsImportableOperationTarget(lead)) {
        return;
      }
      var person = model.subjectOf ? model.subjectOf(lead) : lead.person;
      var places = model.operationPlacesFromLead
        ? model.operationPlacesFromLead(lead)
        : [];
      out.push({
        leadId: id,
        personId: lead.subjectPersonId || (person && person.personId) || "",
        label:
          (model.formatPersonLabel && model.formatPersonLabel(person)) ||
          id,
        caseNumber: (lead.source && lead.source.caseNumber) || "",
        placeCount: places.length,
        vehicleCount: places.filter(function (row) {
          return row && row.vehicleId;
        }).length
      });
    });
    out.sort(function (a, b) {
      return String(a.label || "").localeCompare(String(b.label || ""));
    });
    return out;
  }

  function addOperationTargets(operationId, leadIds) {
    var blank = {
      ok: false,
      operationId: operationId || "",
      added: 0,
      error: ""
    };
    var fresh = adoptDisk();
    if (!fresh.ok) {
      blank.error = fresh.error;
      return blank;
    }
    var op = state.operations[operationId]
      ? clone(state.operations[operationId])
      : null;
    if (!op) {
      blank.error = "Operation not found.";
      return blank;
    }
    op.targets = Array.isArray(op.targets) ? op.targets : [];
    var have = {};
    op.targets.forEach(function (row) {
      if (row && row.leadId) {
        have[row.leadId] = true;
      }
    });
    var added = 0;
    (leadIds || []).forEach(function (leadId) {
      if (!leadId || have[leadId]) {
        return;
      }
      var lead = state.leads[leadId];
      if (!lead || (model.leadIsImportableOperationTarget && !model.leadIsImportableOperationTarget(lead))) {
        return;
      }
      var person = model.subjectOf ? model.subjectOf(lead) : lead.person;
      op.targets.push(
        model.createOperationTarget
          ? model.createOperationTarget({
              leadId: leadId,
              personId: lead.subjectPersonId || (person && person.personId) || ""
            })
          : {
              targetId: model.newId("tgt"),
              leadId: leadId,
              personId: lead.subjectPersonId || "",
              freeze: null
            }
      );
      have[leadId] = true;
      added += 1;
    });
    var saved = saveOperation(op, { mode: "draft" });
    if (!saved.ok) {
      blank.error = saved.error || "Could not save.";
      return blank;
    }
    return {
      ok: true,
      operationId: op.operationId,
      added: added,
      error: ""
    };
  }

  function removeOperationTarget(operationId, targetId) {
    var blank = {
      ok: false,
      operationId: operationId || "",
      removed: false,
      error: ""
    };
    var fresh = adoptDisk();
    if (!fresh.ok) {
      blank.error = fresh.error;
      return blank;
    }
    var op = state.operations[operationId]
      ? clone(state.operations[operationId])
      : null;
    if (!op) {
      blank.error = "Operation not found.";
      return blank;
    }
    var before = (op.targets || []).length;
    op.targets = (op.targets || []).filter(function (row) {
      return !row || row.targetId !== targetId;
    });
    op.targetAssignments = (op.targetAssignments || []).filter(function (row) {
      return !row || row.targetId !== targetId;
    });
    if (op.targets.length === before) {
      return {
        ok: true,
        operationId: op.operationId,
        removed: false,
        error: ""
      };
    }
    var saved = saveOperation(op, { mode: "draft" });
    if (!saved.ok) {
      blank.error = saved.error || "Could not save.";
      return blank;
    }
    return {
      ok: true,
      operationId: op.operationId,
      removed: true,
      error: ""
    };
  }

  function importOperationTeam(operationId, input) {
    input = input || {};
    var blank = {
      ok: false,
      operationId: operationId || "",
      teamId: "",
      error: ""
    };
    var ids = (input.officerIds || []).map(function (id) {
      return String(id || "").trim();
    }).filter(Boolean);
    var unique = [];
    ids.forEach(function (id) {
      if (unique.indexOf(id) === -1) {
        unique.push(id);
      }
    });
    if (unique.length < 2 || unique.length > 4) {
      blank.error = "A cell needs 2 to 4 officers.";
      return blank;
    }
    var fresh = adoptDisk();
    if (!fresh.ok) {
      blank.error = fresh.error;
      return blank;
    }
    var op = state.operations[operationId]
      ? clone(state.operations[operationId])
      : null;
    if (!op) {
      blank.error = "Operation not found.";
      return blank;
    }
    var roles = model.defaultAssignmentRoles
      ? model.defaultAssignmentRoles(unique.length)
      : ["eye", "contact", "primary-backup", "backup"];
    var members = unique.map(function (officerId, index) {
      return model.createOperationMember
        ? model.createOperationMember({
            officerId: officerId,
            assignmentRole: roles[index] || "backup"
          })
        : { officerId: officerId, assignmentRole: roles[index] || "backup" };
    });
    var team = model.createOperationTeam
      ? model.createOperationTeam({
          name: input.name || input.rosterKey || "Cell",
          rosterKey: input.rosterKey || "",
          vehicleId: input.vehicleId || "",
          members: members
        })
      : {
          teamId: model.newId("cell"),
          name: input.name || "Cell",
          rosterKey: input.rosterKey || "",
          vehicleId: input.vehicleId || "",
          members: members
        };
    op.teams = Array.isArray(op.teams) ? op.teams : [];
    op.teams.push(team);
    op.importedTeamKeys = Array.isArray(op.importedTeamKeys)
      ? op.importedTeamKeys
      : [];
    if (team.rosterKey && op.importedTeamKeys.indexOf(team.rosterKey) === -1) {
      op.importedTeamKeys.push(team.rosterKey);
    }
    var saved = saveOperation(op, { mode: "draft" });
    if (!saved.ok) {
      blank.error = saved.error || "Could not save.";
      return blank;
    }
    return {
      ok: true,
      operationId: op.operationId,
      teamId: team.teamId,
      error: ""
    };
  }

  function setOperationMemberRole(operationId, teamId, officerId, role) {
    var blank = {
      ok: false,
      operationId: operationId || "",
      error: ""
    };
    if (model.isOperationAssignmentRole && !model.isOperationAssignmentRole(role)) {
      blank.error = "Pick an assignment role.";
      return blank;
    }
    var fresh = adoptDisk();
    if (!fresh.ok) {
      blank.error = fresh.error;
      return blank;
    }
    var op = state.operations[operationId]
      ? clone(state.operations[operationId])
      : null;
    if (!op) {
      blank.error = "Operation not found.";
      return blank;
    }
    var found = false;
    (op.teams || []).forEach(function (team) {
      if (!team || team.teamId !== teamId) {
        return;
      }
      (team.members || []).forEach(function (member) {
        if (member && member.officerId === officerId) {
          member.assignmentRole = role;
          found = true;
        }
      });
    });
    if (!found) {
      blank.error = "Officer not on that cell.";
      return blank;
    }
    var saved = saveOperation(op, { mode: "draft" });
    if (!saved.ok) {
      blank.error = saved.error || "Could not save.";
      return blank;
    }
    return { ok: true, operationId: op.operationId, error: "" };
  }

  function assignOperationTargetTeam(operationId, targetId, teamId) {
    var blank = {
      ok: false,
      operationId: operationId || "",
      error: ""
    };
    var fresh = adoptDisk();
    if (!fresh.ok) {
      blank.error = fresh.error;
      return blank;
    }
    var op = state.operations[operationId]
      ? clone(state.operations[operationId])
      : null;
    if (!op) {
      blank.error = "Operation not found.";
      return blank;
    }
    var hasTarget = (op.targets || []).some(function (row) {
      return row && row.targetId === targetId;
    });
    if (!hasTarget) {
      blank.error = "Target not found.";
      return blank;
    }
    if (teamId) {
      var hasTeam = (op.teams || []).some(function (row) {
        return row && row.teamId === teamId;
      });
      if (!hasTeam) {
        blank.error = "Cell not found.";
        return blank;
      }
    }
    op.targetAssignments = Array.isArray(op.targetAssignments)
      ? op.targetAssignments
      : [];
    op.targetAssignments = op.targetAssignments.filter(function (row) {
      if (!row) {
        return false;
      }
      if (row.targetId === targetId) {
        return false;
      }
      if (teamId && row.teamId === teamId) {
        return false;
      }
      return true;
    });
    if (teamId) {
      op.targetAssignments.push({ targetId: targetId, teamId: teamId });
    }
    var saved = saveOperation(op, { mode: "draft" });
    if (!saved.ok) {
      blank.error = saved.error || "Could not save.";
      return blank;
    }
    return { ok: true, operationId: op.operationId, error: "" };
  }

  function removeOperationTeam(operationId, teamId) {
    var blank = {
      ok: false,
      operationId: operationId || "",
      removed: false,
      error: ""
    };
    var fresh = adoptDisk();
    if (!fresh.ok) {
      blank.error = fresh.error;
      return blank;
    }
    var op = state.operations[operationId]
      ? clone(state.operations[operationId])
      : null;
    if (!op) {
      blank.error = "Operation not found.";
      return blank;
    }
    var before = (op.teams || []).length;
    op.teams = (op.teams || []).filter(function (row) {
      return !row || row.teamId !== teamId;
    });
    op.targetAssignments = (op.targetAssignments || []).filter(function (row) {
      return !row || row.teamId !== teamId;
    });
    if (op.teams.length === before) {
      return {
        ok: true,
        operationId: op.operationId,
        removed: false,
        error: ""
      };
    }
    var saved = saveOperation(op, { mode: "draft" });
    if (!saved.ok) {
      blank.error = saved.error || "Could not save.";
      return blank;
    }
    return {
      ok: true,
      operationId: op.operationId,
      removed: true,
      error: ""
    };
  }

  function setOperationTeamVehicle(operationId, teamId, vehicleId) {
    var blank = { ok: false, operationId: operationId || "", error: "" };
    var fresh = adoptDisk();
    if (!fresh.ok) {
      blank.error = fresh.error;
      return blank;
    }
    var op = state.operations[operationId]
      ? clone(state.operations[operationId])
      : null;
    if (!op) {
      blank.error = "Operation not found.";
      return blank;
    }
    var found = false;
    (op.teams || []).forEach(function (team) {
      if (team && team.teamId === teamId) {
        team.vehicleId = vehicleId || "";
        found = true;
      }
    });
    if (!found) {
      blank.error = "Cell not found.";
      return blank;
    }
    var saved = saveOperation(op, { mode: "draft" });
    if (!saved.ok) {
      blank.error = saved.error || "Could not save.";
      return blank;
    }
    return { ok: true, operationId: op.operationId, error: "" };
  }

  function findOperationMember(op, teamId, officerId) {
    var found = null;
    ((op && op.teams) || []).forEach(function (team) {
      if (!team || team.teamId !== teamId) {
        return;
      }
      (team.members || []).forEach(function (member) {
        if (member && member.officerId === officerId) {
          found = member;
        }
      });
    });
    return found;
  }

  function setOperationMemberStart(operationId, teamId, officerId, coords) {
    var blank = { ok: false, operationId: operationId || "", error: "" };
    var fresh = adoptDisk();
    if (!fresh.ok) {
      blank.error = fresh.error;
      return blank;
    }
    var op = state.operations[operationId]
      ? clone(state.operations[operationId])
      : null;
    if (!op) {
      blank.error = "Operation not found.";
      return blank;
    }
    var member = findOperationMember(op, teamId, officerId);
    if (!member) {
      blank.error = "Officer not on that cell.";
      return blank;
    }
    var lat = coords && coords.latitude;
    var lng = coords && coords.longitude;
    if (lat === "" || lng === "" || lat == null || lng == null) {
      blank.error = "Click the map to set a start.";
      return blank;
    }
    member.start = { latitude: String(lat), longitude: String(lng) };
    var saved = saveOperation(op, { mode: "draft" });
    if (!saved.ok) {
      blank.error = saved.error || "Could not save.";
      return blank;
    }
    return { ok: true, operationId: op.operationId, error: "" };
  }

  function setOperationMemberHeading(operationId, teamId, officerId, heading) {
    var blank = { ok: false, operationId: operationId || "", error: "" };
    var value = String(heading === 0 ? "0" : heading || "").trim();
    if (value) {
      var num = Number(value);
      if (!isFinite(num) || num < 0 || num > 359) {
        blank.error = "Heading is 0 to 359.";
        return blank;
      }
      value = String(Math.round(num));
    }
    var fresh = adoptDisk();
    if (!fresh.ok) {
      blank.error = fresh.error;
      return blank;
    }
    var op = state.operations[operationId]
      ? clone(state.operations[operationId])
      : null;
    if (!op) {
      blank.error = "Operation not found.";
      return blank;
    }
    var member = findOperationMember(op, teamId, officerId);
    if (!member) {
      blank.error = "Officer not on that cell.";
      return blank;
    }
    member.heading = value;
    var saved = saveOperation(op, { mode: "draft" });
    if (!saved.ok) {
      blank.error = saved.error || "Could not save.";
      return blank;
    }
    return { ok: true, operationId: op.operationId, error: "" };
  }

  function setOperationMemberField(operationId, teamId, officerId, field, value) {
    var blank = { ok: false, operationId: operationId || "", error: "" };
    if (field !== "sector" && field !== "scans") {
      blank.error = "Unknown field.";
      return blank;
    }
    var fresh = adoptDisk();
    if (!fresh.ok) {
      blank.error = fresh.error;
      return blank;
    }
    var op = state.operations[operationId]
      ? clone(state.operations[operationId])
      : null;
    if (!op) {
      blank.error = "Operation not found.";
      return blank;
    }
    var member = findOperationMember(op, teamId, officerId);
    if (!member) {
      blank.error = "Officer not on that cell.";
      return blank;
    }
    member[field] = String(value || "").trim();
    var saved = saveOperation(op, { mode: "draft" });
    if (!saved.ok) {
      blank.error = saved.error || "Could not save.";
      return blank;
    }
    return { ok: true, operationId: op.operationId, error: "" };
  }

  function addOperationLocation(operationId, input) {
    input = input || {};
    var blank = { ok: false, operationId: operationId || "", locationId: "", error: "" };
    var kind = String(input.opAssociation || "").toLowerCase();
    if ((model.OPERATION_LOCATION_KINDS || []).indexOf(kind) === -1) {
      blank.error = "Pick rally, cleanup, medevac, hospital, or landmark.";
      return blank;
    }
    var fresh = adoptDisk();
    if (!fresh.ok) {
      blank.error = fresh.error;
      return blank;
    }
    var op = state.operations[operationId]
      ? clone(state.operations[operationId])
      : null;
    if (!op) {
      blank.error = "Operation not found.";
      return blank;
    }
    var requestedLocationId = input.objectId || input.locationId || "";
    var loc = requestedLocationId ? getLocationRecord(requestedLocationId) : createObjectRecord("LOCATION", {
          latitude: input.latitude || "",
          longitude: input.longitude || "",
          notes: input.label || input.notes || "",
          opAssociation: kind,
          association: kind
        });
    if (!loc || loc.junked || (loc.meta && loc.meta.archivedAt)) { blank.error = "The selected Location is missing or inactive."; return blank; }
    loc.opAssociation = kind;
    loc.association = kind;
    op.opLocations = Array.isArray(op.opLocations) ? op.opLocations : [];
    op.opLocations.push(loc);
    var saved = saveOperation(op, { mode: "draft" });
    if (!saved.ok) {
      blank.error = saved.error || "Could not save.";
      return blank;
    }
    return {
      ok: true,
      operationId: op.operationId,
      locationId: loc.locationId,
      error: ""
    };
  }

  function removeOperationLocation(operationId, locationId) {
    var blank = { ok: false, operationId: operationId || "", removed: false, error: "" };
    var fresh = adoptDisk();
    if (!fresh.ok) {
      blank.error = fresh.error;
      return blank;
    }
    var op = state.operations[operationId]
      ? clone(state.operations[operationId])
      : null;
    if (!op) {
      blank.error = "Operation not found.";
      return blank;
    }
    var before = (op.opLocations || []).length;
    op.opLocations = (op.opLocations || []).filter(function (row) {
      return !row || row.locationId !== locationId;
    });
    if (op.opLocations.length === before) {
      return { ok: true, operationId: op.operationId, removed: false, error: "" };
    }
    var saved = saveOperation(op, { mode: "draft" });
    if (!saved.ok) {
      blank.error = saved.error || "Could not save.";
      return blank;
    }
    return { ok: true, operationId: op.operationId, removed: true, error: "" };
  }

  function addMedevacRoutePoint(operationId, latitude, longitude) {
    var blank = { ok: false, operationId: operationId || "", error: "" };
    var fresh = adoptDisk();
    if (!fresh.ok) {
      blank.error = fresh.error;
      return blank;
    }
    var op = state.operations[operationId]
      ? clone(state.operations[operationId])
      : null;
    if (!op) {
      blank.error = "Operation not found.";
      return blank;
    }
    op.medevacRoute = Array.isArray(op.medevacRoute) ? op.medevacRoute : [];
    op.medevacRoute.push({
      latitude: String(latitude || ""),
      longitude: String(longitude || "")
    });
    var saved = saveOperation(op, { mode: "draft" });
    if (!saved.ok) {
      blank.error = saved.error || "Could not save.";
      return blank;
    }
    return { ok: true, operationId: op.operationId, error: "" };
  }

  function listOperations() {
    return Object.keys(state.operations)
      .map(function (id) {
        var row = state.operations[id];
        return {
          operationId: id,
          operationNumber: (row && row.operationNumber) || id,
          name: (row && row.name) || "",
          team: (row && row.team) || "",
          plannedStart: (row && row.plannedStart) || "",
          plannedEnd: (row && row.plannedEnd) || "",
          targetCount: row && Array.isArray(row.targets) ? row.targets.length : 0,
          teamCount: row && Array.isArray(row.teams) ? row.teams.length : 0,
          updatedAt: (row && row.meta && row.meta.updatedAt) || "",
          metaStatus: model.metaStatus ? model.metaStatus(row) : "committed"
        };
      })
      .sort(function (a, b) {
        return String(b.updatedAt).localeCompare(String(a.updatedAt));
      });
  }

  function listInvestigations() {
    return Object.keys(state.investigations)
      .map(function (id) {
        var row = state.investigations[id];
        return {
          investigationId: id,
          kind: row.kind || "",
          title: row.title || "",
          parentInvestigationId: row.parentInvestigationId || "",
          updatedAt: (row.meta && row.meta.updatedAt) || "",
          metaStatus: model.metaStatus ? model.metaStatus(row) : "committed"
        };
      })
      .sort(function (a, b) {
        return String(b.updatedAt).localeCompare(String(a.updatedAt));
      });
  }

  function normalizePlateKey(state, plate) {
    var st = String(state || "").toUpperCase();
    var pl = String(plate || "")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");
    if (root.plates && typeof root.plates.plateKey === "function") {
      return root.plates.plateKey(st, pl);
    }
    return st + "|" + pl;
  }

  function saveVehicleRecord(record, opts) {
    if (!record) {
      return { ok: false, vehicleId: "", error: "Vehicle is missing." };
    }
    var id = record.vehicleId || record.id || "";
    if (!id) {
      return { ok: false, vehicleId: "", error: "Vehicle is missing a vehicleId." };
    }
    var fresh = adoptDisk();
    if (!fresh.ok) {
      return { ok: false, vehicleId: id, error: fresh.error };
    }
    var mode = (opts && opts.mode) || "commit";
    var previous = state.vehicles[id] ? clone(state.vehicles[id]) : null;
    var before = clone(state);
    var prepared = prepareObjectRecord("VEHICLE", record, opts);
    if (!prepared.ok) { prepared.vehicleId = id; return prepared; }
    var saved = prepared.record;
    var locationsPrepared = stageObjectGraph({ locations: saved.locations || [] });
    if (!locationsPrepared.ok) { state = before; locationsPrepared.vehicleId = id; return locationsPrepared; }
    saved.locations = (saved.locations || []).map(function (location) { return canonicalLocationRecord(location, null); });
    saved.vehicleId = id;
    saved.id = id;
    saved.entityType = "VEHICLE";
    saved.governmentVehicle = false;
    if (typeof model.stampMeta === "function") {
      saved.meta = model.stampMeta(previous, mode);
    } else {
      saved.meta = record.meta || {};
      saved.meta.updatedAt = model.nowIso();
    }
    saved.meta.markedComplete = false;
    state.vehicles[id] = clone(saved);
    syncObjectOwnedLocations("VEHICLE", id, saved.locations);
    if (!writeDisk()) {
      state = before;
      return {
        ok: false,
        vehicleId: id,
        error: "Could not write localStorage (quota or private mode)."
      };
    }
    return { ok: true, vehicleId: id, error: "" };
  }

  function getVehicleRecord(vehicleId) {
    var row = state.vehicles[vehicleId];
    return row ? clone(row) : null;
  }

  function isJunked(record) {
    return !!(record && record.junked);
  }

  function restoreJunkedRecord(objectType, record) {
    if (!record || !isJunked(record)) {
      return record || null;
    }
    record.junked = false;
    record.junkedAt = "";
    var type = String(objectType || "").toUpperCase();
    var restoredId =
      record.personId ||
      record.vehicleId ||
      record.locationId ||
      record.businessId ||
      record.entityId ||
      record.id;
    if (restoredId) {
      setAssociationsJunkedForObject(type, restoredId, false);
    }
    if (type === "PERSON") {
      upsertPerson(record);
      record = getPerson(record.personId);
    } else if (type === "VEHICLE") {
      saveVehicleRecord(record, { mode: "commit" });
      record = getVehicleRecord(record.vehicleId || record.id);
    } else if (type === "LOCATION") {
      saveLocationRecord(record, { mode: "commit" });
      record = getLocationRecord(record.locationId || record.id);
    } else if (type === "BUSINESS") {
      saveBusinessRecord(record, { mode: "commit" });
      record = getBusinessRecord(record.businessId || record.id);
    } else if (type === "ENTITY") {
      saveEntityRecord(record, { mode: "commit" });
      record = getEntityRecord(record.entityId || record.id);
    }
    return record;
  }

  function findVehicleByPlate(stateCode, plate, exceptId, includeJunked) {
    var want = normalizePlateKey(stateCode, plate);
    if (want === "|") {
      return null;
    }
    var ids = Object.keys(state.vehicles);
    var i;
    for (i = 0; i < ids.length; i++) {
      if (exceptId && ids[i] === exceptId) {
        continue;
      }
      var row = state.vehicles[ids[i]];
      if (!row) {
        continue;
      }
      if (!includeJunked && (isJunked(row) || (row.meta && row.meta.archivedAt))) {
        continue;
      }
      var key = normalizePlateKey(
        row.plateState || "",
        row.licensePlate || row.plate || ""
      );
      if (key === want) {
        return clone(row);
      }
    }
    return null;
  }

  function normalizeNameKey(name) {
    var last = String((name && name.lastName) || "")
      .trim()
      .toUpperCase();
    var first = String((name && name.firstName) || "")
      .trim()
      .toUpperCase();
    if (!last && !first) {
      return "";
    }
    return last + "|" + first;
  }

  function findPersonByName(nameOrLabel, exceptId, includeJunked) {
    var label = "";
    var name = null;
    if (typeof nameOrLabel === "string") {
      label = String(nameOrLabel || "").trim();
      name = nameFromLabel(label);
    } else {
      name = nameOrLabel || {};
      label =
        (model.formatPersonLabel &&
          model.formatPersonLabel({ name: name })) ||
        "";
    }
    var want = normalizeNameKey(name);
    var labelWant = label.toUpperCase();
    if (!want && !labelWant) {
      return null;
    }
    var ids = Object.keys(state.people);
    var i;
    for (i = 0; i < ids.length; i++) {
      if (exceptId && ids[i] === exceptId) {
        continue;
      }
      var row = state.people[ids[i]];
      if (!row) {
        continue;
      }
      if (!includeJunked && (isJunked(row) || (row.meta && row.meta.archivedAt))) {
        continue;
      }
      if (want && normalizeNameKey(row.name) === want) {
        return clone(row);
      }
      if (
        labelWant &&
        model.formatPersonLabel &&
        String(model.formatPersonLabel(row) || "").toUpperCase() === labelWant
      ) {
        return clone(row);
      }
    }
    return null;
  }

  function normalizeLocationKey(loc) {
    var street = String((loc && loc.street) || "")
      .trim()
      .toUpperCase()
      .replace(/\s+/g, " ");
    var city = String((loc && loc.city) || "")
      .trim()
      .toUpperCase()
      .replace(/\s+/g, " ");
    var st = String((loc && loc.state) || "")
      .trim()
      .toUpperCase();
    var zip = String((loc && loc.zip) || "")
      .trim()
      .toUpperCase();
    if (!street && !city) {
      return "";
    }
    return [street, city, st, zip].join("|");
  }

  function saveLocationRecord(record, opts) {
    if (!record) {
      return { ok: false, locationId: "", error: "Location is missing." };
    }
    var id = record.locationId || record.id || "";
    if (!id) {
      return { ok: false, locationId: "", error: "Location is missing a locationId." };
    }
    var fresh = adoptDisk();
    if (!fresh.ok) {
      return { ok: false, locationId: id, error: fresh.error };
    }
    var mode = (opts && opts.mode) || "commit";
    var previous = state.locations[id] ? clone(state.locations[id]) : null;
    var before = clone(state);
    var prepared = prepareObjectRecord("LOCATION", record, opts);
    if (!prepared.ok) { prepared.locationId = id; return prepared; }
    var saved = prepared.record;
    saved.locationId = id;
    saved.id = id;
    saved.entityType = "LOCATION";
    if (typeof model.stampMeta === "function") {
      saved.meta = model.stampMeta(previous, mode);
    } else {
      saved.meta = record.meta || {};
      saved.meta.updatedAt = model.nowIso();
    }
    saved.meta.markedComplete = false;
    state.locations[id] = clone(saved);
    if (!writeDisk()) {
      state = before;
      return {
        ok: false,
        locationId: id,
        error: "Could not write localStorage (quota or private mode)."
      };
    }
    return { ok: true, locationId: id, error: "" };
  }

  function getLocationRecord(locationId) {
    var row = state.locations[locationId];
    return row ? clone(row) : null;
  }

  function findLocationByAddress(loc, exceptId, includeJunked) {
    var want = normalizeLocationKey(loc);
    if (!want) {
      return null;
    }
    var ids = Object.keys(state.locations);
    var i;
    for (i = 0; i < ids.length; i++) {
      if (exceptId && ids[i] === exceptId) {
        continue;
      }
      var row = state.locations[ids[i]];
      if (!row || (!includeJunked && (isJunked(row) || (row.meta && row.meta.archivedAt)))) {
        continue;
      }
      if (normalizeLocationKey(row) === want) {
        return clone(row);
      }
    }
    return null;
  }

  function normalizeOrgName(value) {
    return String(value || "")
      .trim()
      .toUpperCase()
      .replace(/\s+/g, " ");
  }

  function saveBusinessRecord(record, opts) {
    if (!record) {
      return { ok: false, businessId: "", error: "Business is missing." };
    }
    var id = record.businessId || record.id || "";
    if (!id) {
      return { ok: false, businessId: "", error: "Business is missing a businessId." };
    }
    var fresh = adoptDisk();
    if (!fresh.ok) {
      return { ok: false, businessId: id, error: fresh.error };
    }
    var mode = (opts && opts.mode) || "commit";
    var previous = state.businesses[id] ? clone(state.businesses[id]) : null;
    var before = clone(state);
    var prepared = prepareObjectRecord("BUSINESS", record, opts);
    if (!prepared.ok) { prepared.businessId = id; return prepared; }
    var saved = prepared.record;
    saved.businessId = id;
    saved.id = id;
    saved.entityType = "BUSINESS";
    if (typeof model.stampMeta === "function") {
      saved.meta = model.stampMeta(previous, mode);
    } else {
      saved.meta = record.meta || {};
      saved.meta.updatedAt = model.nowIso();
    }
    saved.meta.markedComplete = false;
    state.businesses[id] = clone(saved);
    if (!writeDisk()) {
      state = before;
      return {
        ok: false,
        businessId: id,
        error: "Could not write localStorage (quota or private mode)."
      };
    }
    return { ok: true, businessId: id, error: "" };
  }

  function getBusinessRecord(businessId) {
    var row = state.businesses[businessId];
    return row ? clone(row) : null;
  }

  function findBusinessByName(name, exceptId, includeJunked) {
    var want = normalizeOrgName(name);
    if (!want) {
      return null;
    }
    var ids = Object.keys(state.businesses);
    var i;
    for (i = 0; i < ids.length; i++) {
      if (exceptId && ids[i] === exceptId) {
        continue;
      }
      var row = state.businesses[ids[i]];
      if (!row || (!includeJunked && (isJunked(row) || (row.meta && row.meta.archivedAt)))) {
        continue;
      }
      if (normalizeOrgName(row.name) === want) {
        return clone(row);
      }
    }
    return null;
  }

  function saveEntityRecord(record, opts) {
    if (!record) {
      return { ok: false, entityId: "", error: "Entity is missing." };
    }
    var id = record.entityId || record.id || "";
    if (!id) {
      return { ok: false, entityId: "", error: "Entity is missing an entityId." };
    }
    var fresh = adoptDisk();
    if (!fresh.ok) {
      return { ok: false, entityId: id, error: fresh.error };
    }
    var mode = (opts && opts.mode) || "commit";
    var previous = state.entities[id] ? clone(state.entities[id]) : null;
    var before = clone(state);
    var prepared = prepareObjectRecord("ENTITY", record, opts);
    if (!prepared.ok) { prepared.entityId = id; return prepared; }
    var saved = prepared.record;
    saved.entityId = id;
    saved.id = id;
    saved.entityType = "ENTITY";
    if (typeof model.stampMeta === "function") {
      saved.meta = model.stampMeta(previous, mode);
    } else {
      saved.meta = record.meta || {};
      saved.meta.updatedAt = model.nowIso();
    }
    saved.meta.markedComplete = false;
    state.entities[id] = clone(saved);
    if (!writeDisk()) {
      state = before;
      return {
        ok: false,
        entityId: id,
        error: "Could not write localStorage (quota or private mode)."
      };
    }
    return { ok: true, entityId: id, error: "" };
  }

  function getEntityRecord(entityId) {
    var row = state.entities[entityId];
    return row ? clone(row) : null;
  }

  function canonicalObjectType(objectType) {
    var type = String(objectType || "").trim().toUpperCase();
    return type === "PERSON" ||
      type === "VEHICLE" ||
      type === "LOCATION" ||
      type === "BUSINESS" ||
      type === "ENTITY"
      ? type
      : "";
  }

  function objectRecordId(objectType, record) {
    var type = canonicalObjectType(objectType);
    record = record || {};
    if (type === "PERSON") {
      return record.personId || record.id || "";
    }
    if (type === "VEHICLE") {
      return record.vehicleId || record.id || "";
    }
    if (type === "LOCATION") {
      return record.locationId || record.id || "";
    }
    if (type === "BUSINESS") {
      return record.businessId || record.id || "";
    }
    if (type === "ENTITY") {
      return record.entityId || record.id || "";
    }
    return "";
  }

  function objectMap(type) {
    return state[{ PERSON: "people", VEHICLE: "vehicles", LOCATION: "locations", BUSINESS: "businesses", ENTITY: "entities" }[type]] || {};
  }

  function objectIdField(type) {
    return { PERSON: "personId", VEHICLE: "vehicleId", LOCATION: "locationId", BUSINESS: "businessId", ENTITY: "entityId" }[type];
  }

  function objectFailure(code, error) {
    return { ok: false, code: code, error: error, record: null, objectId: "", reused: false, candidates: [] };
  }

  function validateObjectId(type, input) {
    var claims = [input && input[objectIdField(type)], input && input.id, input && input.objectId].filter(function (value) { return value != null && value !== ""; });
    var ids = [];
    var invalid = claims.some(function (value) {
      if (typeof value !== "string" || value !== value.trim() || /[\x00-\x20]/.test(value) || /^(?:__proto__|prototype|constructor)$/.test(value)) { return true; }
      if (ids.indexOf(value) === -1) { ids.push(value); }
      return false;
    });
    if (invalid || ids.length > 1) { return objectFailure("OBJECT_ID_CONFLICT", "Object identifiers must be valid and agree."); }
    return { ok: true, objectId: ids[0] || "", error: "" };
  }

  function objectStrongIdentity(type, input) {
    input = input || {};
    function token(value) { return String(value || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, ""); }
    if (type === "PERSON") {
      return {
        alienNumber: digitsOnly((input.immigration && input.immigration.alienNumber) || input.alienNumber || input.aNumber),
        fbiNumber: token((input.criminal && input.criminal.fbiNumber) || input.fbiNumber),
        ssn: digitsOnly(input.ssn),
        lexId: token(input.lexId)
      };
    }
    if (type === "VEHICLE") { return { vin: token(input.vin) }; }
    return {};
  }

  function objectStrongMatches(type, input) {
    var wanted = objectStrongIdentity(type, input);
    return Object.keys(objectMap(type)).filter(function (id) {
      var identity = objectStrongIdentity(type, objectMap(type)[id]);
      return Object.keys(wanted).some(function (key) { return wanted[key] && wanted[key] === identity[key]; });
    });
  }

  function objectIdentityContradicts(type, input, previous) {
    var requested = objectStrongIdentity(type, input);
    var known = objectStrongIdentity(type, previous);
    return Object.keys(requested).some(function (key) { return requested[key] && known[key] && requested[key] !== known[key]; });
  }

  function validateObjectWorkspace(incoming, current) {
    incoming = incoming || {};
    current = current || {};
    var failure = null;
    Object.keys({ PERSON: 1, VEHICLE: 1, LOCATION: 1, BUSINESS: 1, ENTITY: 1 }).forEach(function (type) {
      var mapName = { PERSON: "people", VEHICLE: "vehicles", LOCATION: "locations", BUSINESS: "businesses", ENTITY: "entities" }[type];
      var rows = incoming[mapName] || {};
      var known = current[mapName] || {};
      var owners = {};
      Object.keys(rows).forEach(function (id) {
        if (failure) { return; }
        var row = rows[id];
        var valid = validateObjectId(type, row);
        if (!row || Array.isArray(row) || !valid.ok || valid.objectId !== id) { failure = objectFailure("OBJECT_ID_CONFLICT", mapName + " contains a registry key that disagrees with its object ID."); return; }
        var prior = known[id];
        if (prior && prior.junked && !row.junked) { failure = objectFailure("OBJECT_JUNKED", "Import cannot restore an inactive object implicitly."); return; }
        var strong = objectStrongIdentity(type, row);
        Object.keys(strong).forEach(function (key) {
          if (!strong[key] || failure) { return; }
          var token = key + ":" + strong[key];
          var priorOwner = owners[token];
          if (priorOwner && priorOwner !== id) {
            var oldA = objectStrongIdentity(type, known[priorOwner]);
            var oldB = objectStrongIdentity(type, known[id]);
            if (oldA[key] !== strong[key] || oldB[key] !== strong[key]) { failure = objectFailure("OBJECT_IDENTITY_CONFLICT", "Import would introduce conflicting " + type + " identifiers. Select and resolve the objects first."); }
          } else { owners[token] = id; }
        });
      });
    });
    return failure || { ok: true, error: "" };
  }

  function importWorkspaceShape(workspace) {
    if (!stage5Object(workspace)) { return objectFailure("IMPORT_WORKSPACE_INVALID", "Import workspace must be an object."); }
    if (workspace.schema && workspace.schema !== (model.STORE_SCHEMA || "copdocx.store.v1")) {
      return objectFailure("IMPORT_WORKSPACE_SCHEMA", "This workspace schema is not supported.");
    }
    var failure = null;
    Object.keys(stage5Collections).some(function (type) {
      var name = stage5Collections[type];
      if (workspace[name] !== undefined && !stage5Object(workspace[name])) {
        failure = objectFailure("IMPORT_WORKSPACE_INVALID", name + " must be an object dictionary.");
      }
      return !!failure;
    });
    function inspect(value, depth) {
      if (!value || typeof value !== "object" || failure) { return; }
      if (depth > 80) { failure = objectFailure("IMPORT_WORKSPACE_INVALID", "Import workspace is too deeply nested."); return; }
      Object.keys(value).some(function (key) {
        if (key === "__proto__" || key === "prototype" || key === "constructor") {
          failure = objectFailure("IMPORT_WORKSPACE_INVALID", "Import workspace contains an unsafe object key."); return true;
        }
        inspect(value[key], depth + 1);
        return !!failure;
      });
    }
    inspect(workspace, 0);
    return failure || { ok: true, error: "" };
  }

  function importSame(a, b) {
    function stable(value) {
      if (Array.isArray(value)) { return value.map(stable); }
      if (!value || typeof value !== "object") { return value; }
      var out = {};
      Object.keys(value).sort().forEach(function (key) { out[key] = stable(value[key]); });
      return out;
    }
    return JSON.stringify(stable(a)) === JSON.stringify(stable(b));
  }

  // Validate the whole proposed graph after all adapters and domain commands,
  // without loading or changing browser storage. Legacy errors already present
  // in unchanged records remain inspectable; an import cannot introduce them.
  function validateImportWorkspace(candidate, current, storageSnapshot) {
    current = current || emptyState();
    var shape = importWorkspaceShape(candidate);
    if (!shape.ok) { return shape; }
    var identity = validateObjectWorkspace(candidate, current);
    if (!identity.ok) { return identity; }
    var previousState = state;
    var failure = null;
    var packetRows = null;
    function fail(code, path, message) {
      if (!failure) { failure = objectFailure(code, message); failure.path = path; }
    }
    function preserveHistory(prior, row, path) {
      if (!prior || failure) { return; }
      var protectedRecord = prior.voidedAt || prior.retractedAt || prior.endedAt;
      if (protectedRecord && !importSame(prior, row)) { fail("IMPORT_LIFECYCLE_CONFLICT", path, "Import cannot alter voided or retracted history."); return; }
      if (!row) {
        if (prior.junked || prior.archivedAt || prior.bookingVoid || prior.meta && prior.meta.archivedAt) { fail("IMPORT_LIFECYCLE_CONFLICT", path, "Import cannot discard lifecycle history."); }
        return;
      }
      if (prior.junked && !row.junked || prior.archivedAt && row.archivedAt !== prior.archivedAt ||
          prior.meta && prior.meta.archivedAt && (!row.meta || row.meta.archivedAt !== prior.meta.archivedAt || row.meta.archiveReason !== prior.meta.archiveReason) ||
          prior.bookingVoid && !importSame(prior.bookingVoid, row.bookingVoid)) {
        fail("IMPORT_LIFECYCLE_CONFLICT", path, "Import cannot reactivate archived records or remove booking void history."); return;
      }
      if (prior.person) { preserveHistory(prior.person, row.person, path + ".person"); }
      [["arrests", "arrestId"], ["subjects", "subjectId"], ["people", "personId"]].forEach(function (pair) {
        (Array.isArray(prior[pair[0]]) ? prior[pair[0]] : []).forEach(function (old) {
          var next = (Array.isArray(row[pair[0]]) ? row[pair[0]] : []).filter(function (item) { return item && old && item[pair[1]] === old[pair[1]]; })[0];
          preserveHistory(old, next, path + "." + pair[0] + "." + (old && old[pair[1]] || ""));
        });
      });
      ["subjectIdentityHistory", "bookingIdentityHistory", "completedHistory"].forEach(function (key) {
        (Array.isArray(prior[key]) ? prior[key] : []).forEach(function (old) {
          if (!(Array.isArray(row[key]) ? row[key] : []).some(function (next) { return importSame(old, next); })) {
            fail("IMPORT_HISTORY_LOSS", path + "." + key, "Import cannot remove historical ownership or completion snapshots.");
          }
        });
      });
    }
    try {
      state = clone(candidate);
      Object.keys(emptyState()).forEach(function (key) { if (state[key] === undefined) { state[key] = clone(emptyState()[key]); } });
      if (storageSnapshot) {
        var raw = importStorageSnapshot(storageSnapshot).localStorage[bookInStorageKey()];
        if (raw != null) {
          packetRows = JSON.parse(raw);
          if (!Array.isArray(packetRows)) { fail("IMPORT_BOOKIN_INVALID", "bookin", "Book-In storage must be an array."); }
        }
      }
      Object.keys(stage5Collections).forEach(function (type) {
        var map = stage5Collections[type];
        var oldRows = current[map] || {};
        Object.keys(oldRows).forEach(function (id) {
          if (!state[map][id]) { fail("IMPORT_OBJECT_REMOVAL", map + "." + id, "Import cannot delete existing canonical objects; use their reviewed lifecycle action."); return; }
          if (type === "ENCOUNTER" && oldRows[id].meta && oldRows[id].meta.markedComplete && !importSame(oldRows[id], state[map][id])) {
            fail("ENCOUNTER_LOCKED", map + "." + id, "Import cannot replace a completed Encounter. Unlock it explicitly before editing.");
          }
          preserveHistory(oldRows[id], state[map][id], map + "." + id);
        });
        Object.keys(state[map]).forEach(function (id) {
          var row = state[map][id];
          var idField = { LEAD: "leadId", ENCOUNTER: "encounterId", INVESTIGATION: "investigationId", OPERATION: "operationId", ASSOCIATION: "associationId" }[type];
          if (!stage5Object(row) || idField && storeSubjectText(row[idField]) !== id) { fail("IMPORT_OBJECT_ID", map + "." + id, "A registry key disagrees with its record identifier."); }
          var expectedSchema = { LEAD: model.SCHEMA || "copdocx.lead.v1", ENCOUNTER: "copdocx.encounter.v1", INVESTIGATION: model.INVESTIGATION_SCHEMA || "copdocx.investigation.v1", OPERATION: model.OPERATION_SCHEMA || "copdocx.operation.v1", ASSOCIATION: "copdocx.association.v1" }[type];
          if (expectedSchema && row && row.schema && row.schema !== expectedSchema && !importSame(oldRows[id], row)) { fail("IMPORT_OBJECT_SCHEMA", map + "." + id, "An imported record uses an unsupported schema version."); }
        });
      });
      Object.keys(state.leads).forEach(function (id) {
        var row = state.leads[id];
        var prior = current.leads && current.leads[id];
        if (importSame(prior, row)) { return; }
        var owner = leadOwnerIdentity(row, id);
        if (!owner.ok || !state.people[owner.personId]) { fail("IMPORT_PERSON_REFERENCE", "leads." + id, "Imported Case has no exact canonical Person owner."); }
      });
      Object.keys(state.encounters).forEach(function (id) {
        var row = state.encounters[id];
        var prior = current.encounters && current.encounters[id];
        if (importSame(prior, row)) { return; }
        if (!Array.isArray(row.subjects)) { fail("ENCOUNTER_SUBJECT_ROSTER_INVALID", "encounters." + id, "Imported Encounter subjects must be an array."); return; }
        if (row.subjects.some(function (subject) { return !stage5Object(subject) || !storeSubjectId(subject) ||
            subject.encounterId && storeSubjectText(subject.encounterId) !== id ||
            storeSubjectOwn(subject, "bookingId") && storeSubjectOwn(subject, "bookinRecordId") && storeSubjectText(subject.bookingId) !== storeSubjectText(subject.bookinRecordId); })) {
          fail("ENCOUNTER_SUBJECT_ID_CONFLICT", "encounters." + id, "Imported Encounter subject identifiers must be explicit and consistent."); return;
        }
        var conflict = encounterSubjectIdentityConflict(prior && prior.subjects, row.subjects, id);
        if (conflict) { fail(conflict.code, "encounters." + id, "Imported Encounter subject ownership conflicts with existing or historical relationships."); }
      });
      Object.keys(state.associations).forEach(function (id) {
        var row = state.associations[id];
        if (!stage5Object(row) || row.retractedAt || row.endedAt || importSame(current.associations && current.associations[id], row)) { return; }
        ["from", "to"].forEach(function (side) {
          var endpoint = row[side] || {};
          var type = stage5Type(endpoint.type || row[side + "EntityType"]);
          var target = storeSubjectText(endpoint.id || row[side + "EntityId"]);
          var map = stage5Collections[type];
          if (!map || !target || !state[map][target]) { fail("IMPORT_ASSOCIATION_REFERENCE", "associations." + id + "." + side, "Imported Association has a missing endpoint."); }
        });
      });
      var arrestOwners = Object.create(null);
      var bookingOwners = Object.create(null);
      Object.keys(state.people).forEach(function (id) {
        var person = state.people[id];
        if (person.arrests !== undefined && !Array.isArray(person.arrests)) { fail("IMPORT_ARREST_INVALID", "people." + id + ".arrests", "Person Arrest history must be an array."); return; }
        (person.arrests || []).forEach(function (arrest) {
          if (!stage5Object(arrest) || !storeSubjectText(arrest.arrestId) || arrest.personId && arrest.personId !== id) { fail("IMPORT_ARREST_IDENTITY", "people." + id + ".arrests", "Imported Arrest identifiers are missing or contradictory."); return; }
          var bookingId = storeSubjectBookingId(arrest);
          if (arrestOwners[arrest.arrestId] || bookingId && bookingOwners[bookingId]) { fail("IMPORT_ARREST_IDENTITY", "people." + id + ".arrests", "An Arrest or booking has multiple canonical owners."); }
          arrestOwners[arrest.arrestId] = id;
          if (bookingId) { bookingOwners[bookingId] = { personId: id, arrest: arrest }; }
        });
      });
      if (Array.isArray(packetRows)) {
        var seenPackets = Object.create(null);
        packetRows.forEach(function (packet) {
          var id = storeSubjectText(packet && packet.id);
          if (!stage5Object(packet) || !id || seenPackets[id]) { fail("IMPORT_BOOKIN_INVALID", "bookin", "Imported Book-In records require unique identifiers."); return; }
          if (packet.bookingId && packet.bookingId !== id || packet.bookinRecordId && packet.bookinRecordId !== id) { fail("IMPORT_BOOKIN_IDENTITY", "bookin." + id, "Imported Book-In aliases disagree with its record identifier."); }
          seenPackets[id] = true;
          var canonical = bookingOwners[id];
          if (canonical && (packet.personId && packet.personId !== canonical.personId || packet.arrestId && packet.arrestId !== canonical.arrest.arrestId ||
              packet.subjectId && packet.subjectId !== canonical.arrest.subjectId || packet.encounterId && packet.encounterId !== canonical.arrest.encounterId ||
              !!packet.voidedAt !== !!canonical.arrest.voidedAt)) { fail("IMPORT_BOOKIN_IDENTITY", "bookin." + id, "Book-In identity or lifecycle disagrees with its canonical Arrest."); }
        });
      }
    } catch (error) {
      fail("IMPORT_WORKSPACE_INVALID", "workspace", "The proposed workspace or storage snapshot is malformed: " + (error && error.message || "invalid data"));
    } finally { state = previousState; }
    return failure || { ok: true, schema: model.STORE_SCHEMA || "copdocx.store.v1", validationVersion: 1, error: "" };
  }

  function validateImportedVoidedBooking(packet, workspace, current) {
    function fail(message) { return objectFailure("IMPORT_VOID_HISTORY_INVALID", message); }
    try {
    if (!stage5Object(packet) || !stage5Object(workspace)) { return fail("A void restore requires its complete booking and canonical workspace graph."); }
    var id = storeSubjectText(packet.id);
    var personId = storeSubjectText(packet.personId);
    var leadId = storeSubjectText(packet.leadId);
    var arrestId = storeSubjectText(packet.arrestId);
    var encounterId = storeSubjectText(packet.encounterId);
    var subjectId = storeSubjectText(packet.subjectId);
    if (!id || !personId || !leadId || !arrestId || !storeSubjectText(packet.voidedAt) || !storeSubjectText(packet.voidReason) || !storeSubjectText(packet.voidTransactionId) ||
        packet.bookingId && packet.bookingId !== id || packet.bookinRecordId && packet.bookinRecordId !== id) { return fail("A restored void requires explicit consistent identifiers, time, reason and transaction."); }
    function matches(row) { return row && (storeSubjectText(row.bookingId) === id || storeSubjectText(row.bookinRecordId) === id); }
    if (current && (current.people && current.people[personId] || current.leads && current.leads[leadId] ||
        Object.keys(current.people || {}).some(function (key) { return ((current.people[key] || {}).arrests || []).some(function (row) { return matches(row) || row && row.arrestId === arrestId; }); }) ||
        Object.keys(current.encounters || {}).some(function (key) { return encounterOwnershipRows(current.encounters[key]).some(matches); }))) {
      return fail("A portable void restore requires a new ownership chain; it cannot replace any existing Person, Case or booking history.");
    }
    function ownedArrest(row) {
      return stage5Object(row) && row.arrestId === arrestId && matches(row) &&
        (!row.bookingId || row.bookingId === id) && (!row.bookinRecordId || row.bookinRecordId === id) &&
        (!row.personId || row.personId === personId) && storeSubjectText(row.encounterId) === encounterId && storeSubjectText(row.subjectId) === subjectId &&
        row.voidedAt === packet.voidedAt && row.voidReason === packet.voidReason && row.voidTransactionId === packet.voidTransactionId;
    }
    var person = workspace.people && workspace.people[personId];
    var lead = workspace.leads && workspace.leads[leadId];
    var leadPerson = lead && (model.subjectOf ? model.subjectOf(lead) : lead.person);
    if (!person || person.personId !== personId || !lead || lead.leadId !== leadId || lead.subjectPersonId !== personId || !leadPerson || leadPerson.personId !== personId ||
        !Array.isArray(person.arrests) || !Array.isArray(leadPerson.arrests)) { return fail("The void restore is missing its exact Person and Case ownership."); }
    var canonical = [];
    Object.keys(workspace.people || {}).forEach(function (key) {
      ((workspace.people[key] || {}).arrests || []).forEach(function (row) { if (matches(row) || row && row.arrestId === arrestId) { canonical.push({ personId: key, row: row }); } });
    });
    var projected = leadPerson.arrests.filter(function (row) { return matches(row) || row && row.arrestId === arrestId; });
    if (canonical.length !== 1 || canonical[0].personId !== personId || !ownedArrest(canonical[0].row) || projected.length !== 1 || !ownedArrest(projected[0])) { return fail("The restored void must have exactly one matching canonical Arrest and matching Case projection."); }
    var inconsistentCase = Object.keys(workspace.leads || {}).some(function (key) {
      var row = workspace.leads[key];
      var subject = row && (model.subjectOf ? model.subjectOf(row) : row.person);
      return (subject && Array.isArray(subject.arrests) ? subject.arrests : []).some(function (arrest) {
        return (matches(arrest) || arrest && arrest.arrestId === arrestId) && (!ownedArrest(arrest) || !subject || subject.personId !== personId);
      });
    });
    if (inconsistentCase) { return fail("A Case projection contradicts the restored void ownership."); }
    var history = Array.isArray(lead.history) ? lead.history : [];
    var original = history.filter(matches);
    var voidEvents = history.filter(function (event) { return event && event.type === "BOOKING_VOIDED" && event.voidedBookingId === id; });
    if (original.length !== 1 || original[0].voidedAt !== packet.voidedAt || original[0].voidReason !== packet.voidReason || original[0].voidTransactionId !== packet.voidTransactionId ||
        voidEvents.length !== 1 || voidEvents[0].arrestId !== arrestId || voidEvents[0].voidedAt !== packet.voidedAt ||
        voidEvents[0].voidReason !== packet.voidReason || voidEvents[0].voidTransactionId !== packet.voidTransactionId) { return fail("The original book-in and immutable void event must both remain in Case history."); }
    if (!!encounterId !== !!subjectId) { return fail("A void restore must preserve both Encounter and subject identity, or neither."); }
    var activeClaim = Object.keys(workspace.encounters || {}).some(function (key) {
      return ((workspace.encounters[key] || {}).subjects || []).some(matches);
    });
    if (activeClaim) { return fail("A restored void cannot remain an active Encounter booking."); }
    if (encounterId) {
      var encounter = workspace.encounters && workspace.encounters[encounterId];
      var retired = encounter && Array.isArray(encounter.bookingIdentityHistory) ? encounter.bookingIdentityHistory.filter(matches) : [];
      var tombstone = retired[0];
      var audit = tombstone && tombstone.bookingVoid;
      if (!encounter || encounter.encounterId !== encounterId || retired.length !== 1 || !tombstone.bookingUnlinked || tombstone.subjectId !== subjectId ||
          tombstone.personId !== personId || tombstone.leadId !== leadId || !audit || audit.bookingId !== id || audit.voidedAt !== packet.voidedAt ||
          audit.reason !== packet.voidReason || audit.transactionId !== packet.voidTransactionId) { return fail("The restored void is missing its exact retired Encounter booking identity."); }
    }
    return { ok: true, personId: personId, leadId: leadId, arrestId: arrestId, bookingId: id, subjectId: subjectId, encounterId: encounterId, error: "" };
    } catch (error) { return fail("The restored void workspace contains malformed ownership or history data."); }
  }

  function stageImportedBookingProjections(packet) {
    if (!importWorkspaceContext) { return objectFailure("IMPORT_STAGE_REQUIRED", "Booking import projections require a staged import."); }
    packet = clone(packet || {});
    var fresh = adoptDisk();
    if (!fresh.ok) { return fresh; }
    var bookingId = storeSubjectText(packet.id);
    var owner = resolveBookInBooking(bookingId);
    if (!owner.ok || !owner.found) { return objectFailure("IMPORT_BOOKING_IDENTITY", owner.error || "The imported booking has no canonical Arrest."); }
    if (["personId", "leadId", "arrestId", "subjectId", "encounterId"].some(function (field) { return packet[field] && storeSubjectText(packet[field]) !== owner[field]; })) { return objectFailure("IMPORT_BOOKING_IDENTITY", "Imported booking identifiers disagree with their canonical owner."); }
    var arrest = (state.people[owner.personId].arrests || []).filter(function (row) { return row.arrestId === owner.arrestId; })[0];
    if (!arrest || arrest.voidedAt || packet.voidedAt) { return objectFailure("BOOKING_VOIDED", "Voided bookings cannot create active import projections."); }
    if (!owner.encounterId) { return { ok: true, record: packet, standalone: true, error: "" }; }
    var encounter = state.encounters[owner.encounterId];
    var subjects = (encounter && Array.isArray(encounter.subjects) ? encounter.subjects : []).filter(function (row) { return storeSubjectId(row) === owner.subjectId; });
    if (subjects.length !== 1) { return objectFailure("IMPORT_BOOKING_IDENTITY", "The imported booking requires exactly one existing Encounter subject."); }
    var subject = subjects[0];
    if (storeSubjectText(subject.outcome).toUpperCase() !== "ARRESTED") { return objectFailure("IMPORT_CUSTODY_REVIEW", "An imported booking cannot change an Encounter subject's outcome to arrested."); }
    if (["personId", "leadId"].some(function (field) { return subject[field] && storeSubjectText(subject[field]) !== owner[field]; }) ||
        storeSubjectBookingId(subject) && storeSubjectBookingId(subject) !== bookingId) { return objectFailure("IMPORT_BOOKING_IDENTITY", "The imported booking contradicts the selected Encounter subject."); }
    var before = clone(state);
    var beforeStorage = clone(importWorkspaceContext.storageSnapshot);
    var beforeRaw = importWorkspaceContext.workspaceRaw;
    var result;
    function reject(value) {
      state = before;
      ["localStorage", "sessionStorage"].forEach(function (medium) {
        var target = importWorkspaceContext.storageSnapshot[medium];
        Object.keys(target).forEach(function (key) { delete target[key]; });
        Object.keys(beforeStorage[medium]).forEach(function (key) { target[key] = beforeStorage[medium][key]; });
      });
      importWorkspaceContext.workspaceRaw = beforeRaw;
      return value;
    }
    try {
      var filedAt = packet.encounterProjectionFiledAt || subject.packetFiledAt || arrest.bookInDateTime || packet.dateTime || packet.updatedAt || model.nowIso();
      var unchanged = storeSubjectBookingId(subject) === bookingId && subject.personId === owner.personId && subject.leadId === owner.leadId && subject.packetFiledAt;
      if (!unchanged) {
        result = updateEncounter(owner.encounterId, function (row) {
          var target = row.subjects.filter(function (item) { return storeSubjectId(item) === owner.subjectId; })[0];
          target.personId = owner.personId; target.leadId = owner.leadId;
          target.bookingId = bookingId; target.bookinRecordId = bookingId;
          target.packetFiledAt = filedAt; target.custody = "IN_CUSTODY";
          return row;
        }, { mode: model.isCommitted && model.isCommitted(encounter) ? "commit" : "draft" });
        if (!result.ok) { return reject(result); }
      }
      packet.encounterProjectionFiledAt = filedAt;
      delete packet.encounterProjectionDraft;
      result = applyEncounterLocationToArrests(owner.encounterId);
      if (!result.ok) { return reject(result); }
      result = linkEncounterVehiclesToPerson({ encounterId: owner.encounterId, subjectId: owner.subjectId, personId: owner.personId, leadId: owner.leadId, bookinRecordId: bookingId });
      if (!result.ok) { return reject(result); }
      var officerId = storeSubjectText(subject.arrestingOfficerId);
      if (officerId) {
        var adminKey = root.config && root.config.storageKey("admin") || "copdoc.admin.v1";
        var raw = storageRaw("localStorage", adminKey);
        var admin = raw === null ? { officers: [], vehicles: [], shifts: [] } : JSON.parse(raw);
        if (!stage5Object(admin) || !Array.isArray(admin.officers)) { return reject(objectFailure("IMPORT_OFFICER_INVALID", "Admin officer storage is malformed.")); }
        var officerMatches = admin.officers.filter(function (row) { return row && (storeSubjectText(row.id) === officerId || storeSubjectText(row.officerId) === officerId); });
        if (officerMatches.length !== 1) { return reject(objectFailure("IMPORT_OFFICER_REFERENCE", "The Encounter arresting officer is missing or ambiguous.")); }
        var officer = officerMatches[0];
        var existing = null;
        var conflict = "";
        admin.officers.forEach(function (other) {
          if (!stage5Object(other) || other.fieldArrests !== undefined && !Array.isArray(other.fieldArrests)) { conflict = "Officer Arrest history is malformed."; return; }
          var count = 0;
          (other.fieldArrests || []).forEach(function (fact) {
            if (!stage5Object(fact)) { conflict = "Officer Arrest history is malformed."; return; }
            var aliases = [fact.bookingId, fact.bookinRecordId].map(storeSubjectText).filter(function (id, index, values) { return id && values.indexOf(id) === index; });
            if (storeSubjectText(fact.arrestId) !== owner.arrestId && aliases.indexOf(bookingId) < 0) { return; }
            count += 1;
            if (aliases.length > 1 || fact.arrestId !== owner.arrestId || aliases.length && aliases[0] !== bookingId ||
                ["personId", "subjectId", "encounterId"].some(function (field) { return fact[field] && storeSubjectText(fact[field]) !== owner[field]; })) { conflict = "Officer Arrest identity disagrees with the imported booking."; }
            if (other === officer) { existing = fact; }
          });
          if (count > 1) { conflict = "Officer Arrest identity is duplicated."; }
        });
        if (conflict) { return reject(objectFailure("IMPORT_OFFICER_IDENTITY", conflict)); }
        if (existing && (existing.voidedAt || existing.voided || storeSubjectText(existing.status).toUpperCase() === "VOIDED")) { return reject(objectFailure("BOOKING_VOIDED", "Import cannot reactivate a voided officer Arrest.")); }
        if (!existing && (officer.inactive || officer.junked || officer.archivedAt || officer.meta && officer.meta.archivedAt)) { return reject(objectFailure("IMPORT_OFFICER_INACTIVE", "A new imported Arrest cannot be assigned to an inactive officer.")); }
        var fact = existing || { bookedAt: filedAt };
        ["personId", "arrestId", "subjectId", "encounterId"].forEach(function (field) { fact[field] = owner[field]; });
        fact.bookingId = bookingId;
        if (Object.prototype.hasOwnProperty.call(fact, "bookinRecordId")) { fact.bookinRecordId = bookingId; }
        if (!existing) { officer.fieldArrests = officer.fieldArrests || []; officer.fieldArrests.push(fact); }
        importWorkspaceContext.storageSnapshot.localStorage[adminKey] = JSON.stringify(admin);
      }
      return { ok: true, record: packet, standalone: false, officerId: officerId, error: "" };
    } catch (error) { return reject(objectFailure("IMPORT_BOOKING_PROJECTION", error && error.message || "Booking projections could not be staged.")); }
  }

  function stageImportedObjectRecord(type, incoming, current) {
    if (!importWorkspaceContext) { return objectFailure("IMPORT_STAGE_REQUIRED", "Native object import must run inside a staged import."); }
    type = canonicalObjectType(type);
    if (!type || !stage5Object(incoming)) { return objectFailure("IMPORT_OBJECT_INVALID", "A supported imported object is required."); }
    var valid = validateObjectId(type, incoming);
    if (!valid.ok) { return valid; }
    var existing = current || objectMap(type)[valid.objectId] || null;
    function data(row) {
      var result = clone(row || {});
      ["meta", "objectRevision", "importSource", "importDataBaseline"].forEach(function (key) { delete result[key]; });
      return result;
    }
    if (existing && importSame(data(existing), data(incoming))) { return { ok: true, objectId: valid.objectId, record: clone(existing), unchanged: true, error: "" }; }
    var sourceRevision = incoming.objectRevision;
    var localRevision = Number(existing && existing.objectRevision || 0);
    if (sourceRevision != null && (!Number.isInteger(Number(sourceRevision)) || Number(sourceRevision) < 0)) { return objectFailure("IMPORT_OBJECT_REVISION", "An imported object revision must be a nonnegative integer."); }
    var importedBaseline = existing && existing.importDataBaseline;
    if (importedBaseline && importSame(importedBaseline.source, data(incoming))) { return { ok: true, objectId: valid.objectId, record: clone(existing), unchanged: true, retainedLocalEdits: true, error: "" }; }
    if (importedBaseline && !importSame(importedBaseline.accepted, data(existing))) { return objectFailure("IMPORT_OBJECT_EDIT_CONFLICT", "The local object and imported source both changed. Review the conflicting versions before replacing either one."); }
    var expectedSourceRevision = importedBaseline && existing.importSource && existing.importSource.nativeObjectRevision;
    if (existing && (importedBaseline ? expectedSourceRevision != null && (sourceRevision == null || Number(sourceRevision) <= Number(expectedSourceRevision)) : localRevision && (sourceRevision == null || Number(sourceRevision) <= localRevision))) {
      return objectFailure("IMPORT_OBJECT_STALE", "The imported object differs from a current local revision. Review the conflicting object before replacing it.");
    }
    var preparedInput = clone(incoming);
    preparedInput.importSource = Object.assign({}, preparedInput.importSource || {}, { nativeObjectRevision: sourceRevision == null ? null : Number(sourceRevision),
      nativeUpdatedAt: incoming.meta && incoming.meta.updatedAt || incoming.updatedAt || "" });
    preparedInput.objectRevision = localRevision;
    var map = objectMap(type);
    var prior = map[valid.objectId];
    try {
      if (existing) { map[valid.objectId] = clone(existing); } else { delete map[valid.objectId]; }
      var prepared = prepareObjectRecord(type, preparedInput, { expectedRevision: localRevision });
      if (!prepared.ok) { return prepared; }
      prepared.record.importDataBaseline = { source: data(incoming), accepted: data(prepared.record) };
      return { ok: true, objectId: prepared.objectId, record: prepared.record, unchanged: false, error: "" };
    } finally {
      if (prior) { map[valid.objectId] = prior; } else { delete map[valid.objectId]; }
    }
  }

  function projectImportedBaseballCard(input) {
    input = input || {};
    if (!importWorkspaceContext) { return objectFailure("IMPORT_STAGE_REQUIRED", "Card import projection must run inside a staged import."); }
    var fresh = adoptDisk();
    if (!fresh.ok) { return fresh; }
    var personId = storeSubjectText(input.personId);
    var bookingId = storeSubjectText(input.bookingId || input.bookinRecordId);
    var person = state.people[personId];
    if (!person || !bookingId) { return objectFailure("IMPORT_CARD_OWNER", "An imported card needs an exact Person and booking owner."); }
    if (isJunked(person) || person.meta && person.meta.archivedAt) { return objectFailure("IMPORT_CARD_OWNER", "An imported card cannot edit an inactive Person."); }
    var owner = resolveBookInBooking(bookingId);
    if (!owner.ok || !owner.found || owner.personId !== personId) { return objectFailure("IMPORT_CARD_OWNER", owner.error || "The imported card's booking belongs to a different Person or has not been filed."); }
    var arrest = (person.arrests || []).filter(function (row) { return row.arrestId === owner.arrestId; })[0];
    if (!arrest || arrest.voidedAt) { return objectFailure("BOOKING_VOIDED", "A card cannot be imported into a voided booking."); }
    if (!root.baseball || typeof root.baseball.toCanonical !== "function") { return objectFailure("CARD_RENDERER_REQUIRED", "The current baseball card adapter is unavailable."); }
    var raw = input.baseballCard;
    if (!stage5Object(raw)) { return objectFailure("IMPORT_CARD_INVALID", "The imported baseball card must be an object."); }
    var photoMediaId = storeSubjectText(input.photoMediaId || raw.photoMediaId);
    if (raw.photoDataUrl && !photoMediaId) { return objectFailure("IMPORT_CARD_MEDIA_REQUIRED", "An imported photo requires a prepared Media identifier."); }
    var cardId = storeSubjectText(input.cardId) || "card_import_" + encodeURIComponent(bookingId);
    var cards = person.immigration && person.immigration.baseballCards;
    if (cards !== undefined && !Array.isArray(cards)) { return objectFailure("IMPORT_CARD_INVALID", "Existing Person card storage is malformed."); }
    cards = cards || [];
    var exact = cards.filter(function (card) { return card && (card.cardId || card.id) === cardId; });
    if (exact.length > 1) { return objectFailure("IMPORT_CARD_IDENTITY", "The imported card identifier has multiple existing owners."); }
    var previous = exact[0] || null;
    if (previous && previous.bookinRecordId && previous.bookinRecordId !== bookingId) { return objectFailure("IMPORT_CARD_IDENTITY", "The imported card identifier belongs to a different booking."); }
    function presentationBaseline(rawState, mediaId) {
      var presentation = root.baseball.normalizeState(rawState || {});
      presentation.photoMediaId = storeSubjectText(mediaId || presentation.photoMediaId);
      delete presentation.photoDataUrl;
      delete presentation.renderedPhotoDataUrl;
      delete presentation.savedAt;
      return presentation;
    }
    var incomingPresentation = presentationBaseline(raw, photoMediaId);
    var retainPresentation = false;
    var retainedLocalEdits = false;
    if (previous) {
      var currentPresentation = presentationBaseline(root.baseball.fromCanonical(previous), previous.photoMediaId);
      var baseline = previous.importPresentationBaseline;
      if (baseline && importSame(baseline, incomingPresentation) || importSame(currentPresentation, incomingPresentation)) {
        retainPresentation = true;
        retainedLocalEdits = !importSame(currentPresentation, incomingPresentation);
      }
      if (!retainPresentation && previous.savedAt && raw.savedAt && String(raw.savedAt) < String(previous.savedAt)) {
        return objectFailure("IMPORT_CARD_STALE", "The imported card predates the saved card. Review the two versions before replacing the newer presentation.");
      }
      if (!retainPresentation && (!baseline || !importSame(baseline, currentPresentation))) {
        return objectFailure("IMPORT_CARD_EDIT_CONFLICT", "The saved card has local edits and the source card also changed. Review the two versions before replacing either one.");
      }
    }
    var card = retainPresentation ? clone(previous) : root.baseball.toCanonical(clone(raw), { cardId: cardId, personId: personId, bookinRecordId: bookingId,
      photoMediaId: photoMediaId, source: clone(input.source || {}), existing: previous ? clone(previous) : null });
    if (!stage5Object(card)) { return objectFailure("IMPORT_CARD_INVALID", "The baseball card adapter returned invalid data."); }
    card.cardId = cardId;
    card.personId = personId;
    card.bookinRecordId = bookingId;
    if (!retainPresentation) { card.photoMediaId = photoMediaId; }
    // External saved-record revisions describe the source, never local object
    // concurrency. Source metadata stays alongside the presentation snapshot.
    if (!retainPresentation) {
      card.importSource = clone(input.source || {});
      card.importPresentationBaseline = clone(incomingPresentation);
    }
    if (input.finalizedSnapshot !== undefined && input.finalizedSnapshot !== null) {
      var finalized = clone(input.finalizedSnapshot);
      var arrestDate = String(arrest.arrestDate || arrest.arrestDateTime || arrest.bookInDateTime || "").slice(0, 10);
      if (!stage5Object(finalized) || finalized.status !== "FINALIZED" || finalized.version !== 2 ||
          !stage5Object(finalized.content) || !storeSubjectText(finalized.content.narrative) || !Array.isArray(finalized.content.bullets) ||
          !finalized.photoMediaId && !finalized.photoDataUrl || finalized.arrestDateKey !== arrestDate ||
          storeSubjectText(finalized.bookinRecordId || finalized.recordId) !== bookingId ||
          ["personId", "leadId", "arrestId", "subjectId", "encounterId"].some(function (field) { return finalized[field] && storeSubjectText(finalized[field]) !== owner[field]; }) ||
          finalized.cardId && finalized.cardId !== cardId || finalized.recordId && finalized.recordId !== bookingId) {
        return objectFailure("IMPORT_CARD_FINALIZED_IDENTITY", "The finalized card snapshot must match the exact Person, booking, Arrest and arrest date.");
      }
      if (previous && previous.finalizedSnapshot && !importSame(previous.finalizedSnapshot, finalized)) { return objectFailure("IMPORT_CARD_FINALIZED_CONFLICT", "Import cannot replace an existing finalized card snapshot. Preserve and review both versions."); }
      card.finalizedSnapshot = finalized;
    }
    if (input.arrestOfDay !== undefined) {
      var designation = input.arrestOfDay;
      if (designation && (!stage5Object(designation) || !card.finalizedSnapshot || designation.date !== card.finalizedSnapshot.arrestDateKey)) { return objectFailure("IMPORT_CARD_DESIGNATION", "An arrest-of-day selection must refer to this booking's finalized card and date."); }
      if (previous && previous.arrestOfDay && !importSame(previous.arrestOfDay, designation)) { return objectFailure("IMPORT_CARD_DESIGNATION", "Import cannot replace an existing daily card selection implicitly."); }
      if (designation) { card.arrestOfDay = clone(designation); }
    }
    if (previous && importSame(previous, card)) { return { ok: true, personId: personId, cardId: cardId, card: clone(card), unchanged: true, retainedLocalEdits: retainedLocalEdits, error: "" }; }
    var before = clone(state);
    person = clone(person);
    person.immigration = person.immigration || {};
    person.immigration.baseballCards = cards.filter(function (row) { return !row || (row.cardId || row.id) !== cardId; }).concat([card]);
    var saved = upsertPerson(person, { intent: "update" });
    if (!saved.ok) { return saved; }
    Object.keys(state.leads).forEach(function (id) {
      var lead = state.leads[id];
      var leadPerson = lead && (model.subjectOf ? model.subjectOf(lead) : lead.person);
      if (!leadPerson || leadPerson.personId !== personId || lead.meta && lead.meta.archivedAt) { return; }
      leadPerson.immigration = leadPerson.immigration || {};
      leadPerson.immigration.baseballCards = clone(state.people[personId].immigration.baseballCards);
      leadPerson.objectRevision = state.people[personId].objectRevision;
    });
    if (!writeDisk()) { state = before; return objectFailure("IMPORT_CARD_FAILED", "The imported card could not be staged."); }
    return { ok: true, personId: personId, cardId: cardId, card: clone(card), unchanged: false, error: "" };
  }

  function prepareObjectRecord(type, input, opts) {
    opts = opts || {};
    if (!type || !input || typeof input !== "object" || Array.isArray(input)) { return objectFailure("OBJECT_INVALID", "A valid object is required."); }
    var checked = validateObjectId(type, input);
    if (!checked.ok) { return checked; }
    var id = checked.objectId;
    var previous = id && objectMap(type)[id];
    if (previous && previous.meta && previous.meta.archivedAt && !opts.restore) { return objectFailure("OBJECT_ARCHIVED", "This object is archived. Restore it explicitly before editing."); }
    if (previous && objectRecordId(type, previous) !== id) { return objectFailure("OBJECT_ID_CONFLICT", "The stored object ID contradicts its registry key."); }
    if (opts.intent === "create" && previous) { return objectFailure("OBJECT_EXISTS", "That object already exists. Select it or update it explicitly."); }
    if (opts.intent === "update" && !previous) { return objectFailure("OBJECT_NOT_FOUND", "The object to update no longer exists."); }
    if (previous && isJunked(previous) && !opts.restore && !input.junked) { return objectFailure("OBJECT_JUNKED", "The object is inactive. Restore it explicitly before editing or reusing it."); }
    var expected = opts.expectedRevision != null ? opts.expectedRevision : input.objectRevision;
    if (previous && expected != null && Number(expected) !== Number(previous.objectRevision || 0)) { return objectFailure("OBJECT_STALE", "This object changed in another workflow. Reload it before saving."); }
    var conflicts = objectStrongMatches(type, input).filter(function (owner) { return owner !== id; });
    if (conflicts.length) {
      var collision = objectFailure("OBJECT_IDENTITY_CONFLICT", "A supplied identifier belongs to another object. Select the existing record explicitly.");
      collision.candidates = conflicts;
      return collision;
    }
    var merged = mergeRecord(previous, input);
    delete merged._objectEdit;
    delete merged.objectId;
    delete merged.createNew;
    if (id) { merged[objectIdField(type)] = id; }
    var candidate = createObjectRecord(type, merged);
    if (!candidate) { return objectFailure("OBJECT_INVALID", "The object constructor is not available."); }
    function revisionContent(row) {
      var copy = clone(row || {});
      delete copy.meta;
      delete copy.objectRevision;
      delete copy._objectEdit;
      return JSON.stringify(copy);
    }
    candidate.objectRevision = Number(previous && previous.objectRevision || 0) + (previous && revisionContent(previous) === revisionContent(candidate) ? 0 : 1);
    return { ok: true, objectId: objectRecordId(type, candidate), record: candidate, previous: previous || null, error: "" };
  }

  // Stage editor-owned changes in the same workspace write as their aggregate.
  // Unmarked embedded objects are references/snapshots and never write backward.
  function stageObjectGraph(aggregate) {
    var before = clone(state);
    var error = null;
    function visit(type, record) {
      if (!record || error) { return; }
      var valid = validateObjectId(type, record);
      if (!valid.ok) { error = valid; return; }
      var old = valid.objectId && objectMap(type)[valid.objectId];
      if (old && isJunked(old)) { error = objectFailure("OBJECT_JUNKED", "An attached object is inactive. Restore it explicitly first."); return; }
      (record.locations || []).forEach(function (location) { visit("LOCATION", location); });
      if (error) { return; }
      if (record._objectEdit || !old) {
        var prepared = prepareObjectRecord(type, record, {});
        if (!prepared.ok) { error = prepared; return; }
        if (Array.isArray(prepared.record.locations)) { prepared.record.locations = prepared.record.locations.map(function (location) { return canonicalLocationRecord(location, null); }); }
        objectMap(type)[prepared.objectId] = clone(prepared.record);
      }
    }
    (aggregate.vehicles || []).forEach(function (row) { visit("VEHICLE", row); });
    (aggregate.locations || []).forEach(function (row) { visit("LOCATION", row); });
    var subject = model.subjectOf ? model.subjectOf(aggregate) : aggregate.person;
    if (subject) { (subject.locations || []).forEach(function (row) { visit("LOCATION", row); }); }
    (aggregate.people || []).forEach(function (person) { visit("PERSON", person); });
    if (error) { state = before; return error; }
    return { ok: true, error: "" };
  }

  /**
   * The one context-free constructor gateway for case, Book-In, encounter,
   * and investigation object editors.
   */
  function createObjectRecord(objectType, extra) {
    var type = canonicalObjectType(objectType);
    extra = clone(extra || {});
    var identity = validateObjectId(type, extra);
    if (!type || !identity.ok) { return null; }
    if (identity.objectId) { extra[objectIdField(type)] = identity.objectId; }
    delete extra.objectId;
    delete extra._objectEdit;
    delete extra.createNew;
    if (type === "PERSON" && typeof model.createPerson === "function") {
      return model.createPerson(extra);
    }
    if (type === "VEHICLE" && typeof model.createVehicle === "function") {
      var normalizedPlate = String(extra.licensePlate || extra.plate || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
      extra.licensePlate = normalizedPlate;
      extra.plate = normalizedPlate;
      extra.plateState = String(extra.plateState || "").trim().toUpperCase();
      return model.createVehicle(extra);
    }
    if (type === "LOCATION" && typeof model.createLocation === "function") {
      return model.createLocation(extra);
    }
    if (type === "BUSINESS" && typeof model.createBusiness === "function") {
      return model.createBusiness(extra);
    }
    if (type === "ENTITY" && typeof model.createCustomEntity === "function") {
      return model.createCustomEntity(extra);
    }
    return null;
  }

  function getObjectRecord(objectType, objectId) {
    var type = canonicalObjectType(objectType);
    if (type === "PERSON") {
      return getPerson(objectId);
    }
    if (type === "VEHICLE") {
      return getVehicleRecord(objectId);
    }
    if (type === "LOCATION") {
      return getLocationRecord(objectId);
    }
    if (type === "BUSINESS") {
      return getBusinessRecord(objectId);
    }
    if (type === "ENTITY") {
      return getEntityRecord(objectId);
    }
    return null;
  }

  /**
   * Persist any canonical object through its normal constructor and store.
   * Callers never need to know which backing map owns the object.
   */
  function saveObjectRecord(objectType, record, opts) {
    var type = canonicalObjectType(objectType);
    var blank = {
      ok: false,
      objectType: type,
      objectId: "",
      record: null,
      error: ""
    };
    if (!type) {
      blank.error = "Pick a person, vehicle, location, business, or entity.";
      return blank;
    }
    var fresh = adoptDisk();
    if (!fresh.ok) {
      blank.error = fresh.error;
      return blank;
    }
    var input = record || {};
    var requestedId = objectRecordId(type, input);
    var prepared = prepareObjectRecord(type, input, opts);
    if (!prepared.ok) { prepared.objectType = type; return prepared; }
    var candidate = prepared.record;
    // The typed save boundary performs the revision increment once.
    if (prepared.previous) { candidate.objectRevision = prepared.previous.objectRevision || 0; }
    else { delete candidate.objectRevision; }
    var result;
    if (type === "PERSON") {
      result = upsertPerson(candidate, opts);
    } else if (type === "VEHICLE") {
      result = saveVehicleRecord(candidate, opts);
    } else if (type === "LOCATION") {
      result = saveLocationRecord(candidate, opts);
    } else if (type === "BUSINESS") {
      result = saveBusinessRecord(candidate, opts);
    } else {
      result = saveEntityRecord(candidate, opts);
    }
    if (!result || !result.ok) {
      blank.error = (result && result.error) || "Could not save that object.";
      blank.code = result && result.code;
      return blank;
    }
    var id = objectRecordId(type, candidate);
    return {
      ok: true,
      objectType: type,
      objectId: id,
      record: getObjectRecord(type, id),
      error: ""
    };
  }

  function findEntityByName(name, exceptId, includeJunked) {
    var want = normalizeOrgName(name);
    if (!want) {
      return null;
    }
    var ids = Object.keys(state.entities);
    var i;
    for (i = 0; i < ids.length; i++) {
      if (exceptId && ids[i] === exceptId) {
        continue;
      }
      var row = state.entities[ids[i]];
      if (!row || (!includeJunked && (isJunked(row) || (row.meta && row.meta.archivedAt)))) {
        continue;
      }
      if (normalizeOrgName(row.name) === want) {
        return clone(row);
      }
    }
    return null;
  }

  function ensureInvestigationNode(inv, objectType, objectId, pos) {
    inv.nodes = Array.isArray(inv.nodes) ? inv.nodes : [];
    var i;
    for (i = 0; i < inv.nodes.length; i++) {
      if (
        inv.nodes[i] &&
        inv.nodes[i].objectType === objectType &&
        inv.nodes[i].objectId === objectId
      ) {
        if (pos && typeof pos.x === "number") {
          inv.nodes[i].x = pos.x;
        }
        if (pos && typeof pos.y === "number") {
          inv.nodes[i].y = pos.y;
        }
        return inv.nodes[i];
      }
    }
    var node = model.createInvestigationNode
      ? model.createInvestigationNode({
          objectType: objectType,
          objectId: objectId,
          x: pos && typeof pos.x === "number" ? pos.x : 48,
          y: pos && typeof pos.y === "number" ? pos.y : 48
        })
      : {
          nodeId: model.newId("node"),
          objectType: objectType,
          objectId: objectId,
          x: pos && typeof pos.x === "number" ? pos.x : 48,
          y: pos && typeof pos.y === "number" ? pos.y : 48
        };
    inv.nodes.push(node);
    return node;
  }

  function defaultInvestigationReason(fromType, toType) {
    var a = String(fromType || "").toUpperCase();
    var b = String(toType || "").toUpperCase();
    if (
      (a === "PERSON" && b === "VEHICLE") ||
      (a === "VEHICLE" && b === "PERSON")
    ) {
      return "REGISTERED_OWNER_OF";
    }
    if (
      (a === "PERSON" && b === "LOCATION") ||
      (a === "LOCATION" && b === "PERSON")
    ) {
      return "CURRENT_RESIDENCE";
    }
    if (
      (a === "VEHICLE" && b === "LOCATION") ||
      (a === "LOCATION" && b === "VEHICLE")
    ) {
      return "VEHICLE_PARKING";
    }
    if (a === "PERSON" && b === "PERSON") {
      return "ASSOCIATE_OF";
    }
    if (
      (a === "PERSON" && b === "BUSINESS") ||
      (a === "BUSINESS" && b === "PERSON")
    ) {
      return "EMPLOYED_BY";
    }
    if (
      (a === "BUSINESS" && b === "LOCATION") ||
      (a === "LOCATION" && b === "BUSINESS")
    ) {
      return "OPERATES_AT";
    }
    if (
      (a === "BUSINESS" && b === "VEHICLE") ||
      (a === "VEHICLE" && b === "BUSINESS")
    ) {
      return "FLEET_OF";
    }
    if (
      (a === "PERSON" && b === "ENTITY") ||
      (a === "ENTITY" && b === "PERSON")
    ) {
      return "MEMBER_OF";
    }
    if (
      (a === "ENTITY" && b === "LOCATION") ||
      (a === "LOCATION" && b === "ENTITY")
    ) {
      return "BASED_AT";
    }
    if (
      (a === "ENTITY" && b === "VEHICLE") ||
      (a === "VEHICLE" && b === "ENTITY")
    ) {
      return "USES_VEHICLE";
    }
    if (
      (a === "BUSINESS" && b === "ENTITY") ||
      (a === "ENTITY" && b === "BUSINESS")
    ) {
      return "AFFILIATED_WITH";
    }
    return "";
  }

  function canonicalLinkEnds(fromType, fromId, toType, toId, reason) {
    if (model.canonicalAssociationEnds) {
      return model.canonicalAssociationEnds(fromType, fromId, toType, toId, reason);
    }
    return {
      fromType: fromType,
      fromId: fromId,
      toType: toType,
      toId: toId,
      reason: reason || ""
    };
  }

  function investigationReasonPhrase(code) {
    var map = {
      REGISTERED_OWNER_OF: "registered owner",
      KNOWN_OPERATOR_OF: "known operator",
      CURRENT_RESIDENCE: "current residence",
      KNOWN_RESIDENCE: "known residence",
      LAST_KNOWN_ADDRESS: "last known address",
      EMPLOYMENT_ADDRESS: "employment address",
      BUSINESS_ADDRESS: "business address",
      FREQUENTED_LOCATION: "frequented location",
      REGISTERED_ADDRESS: "registered address",
      VEHICLE_PARKING: "parking",
      STORED_AT: "stored at",
      ASSOCIATE_OF: "associate",
      COHABITANT_OF: "cohabitant",
      SPOUSE_OF: "spouse",
      PARENT_OF: "parent",
      SIBLING_OF: "sibling",
      EMPLOYED_BY: "employed by",
      PRINCIPAL_OF: "principal of",
      CUSTOMER_OF: "customer of",
      OPERATES_AT: "operates at",
      FLEET_OF: "fleet of",
      MEMBER_OF: "member of",
      BASED_AT: "based at",
      USES_VEHICLE: "uses vehicle",
      AFFILIATED_WITH: "affiliated with"
    };
    return map[code] || "linked";
  }

  function investigationObjectLabel(objectType, objectId) {
    if (objectType === "PERSON") {
      var person = getPerson(objectId);
      return (
        (person && model.formatPersonLabel && model.formatPersonLabel(person)) ||
        objectId
      );
    }
    if (objectType === "VEHICLE") {
      var vehicle = getVehicleRecord(objectId);
      if (!vehicle) {
        return objectId;
      }
      return (
        [vehicle.plateState, vehicle.licensePlate || vehicle.plate]
          .filter(Boolean)
          .join(" ") || objectId
      );
    }
    if (objectType === "LOCATION") {
      var loc = getLocationRecord(objectId);
      if (!loc) {
        return objectId;
      }
      return (
        [loc.street, loc.city, loc.state].filter(Boolean).join(", ") || objectId
      );
    }
    if (objectType === "BUSINESS") {
      var biz = getBusinessRecord(objectId);
      return (
        (biz && model.formatBusinessLabel && model.formatBusinessLabel(biz)) ||
        (biz && biz.name) ||
        objectId
      );
    }
    if (objectType === "ENTITY") {
      var ent = getEntityRecord(objectId);
      return (
        (ent && model.formatEntityLabel && model.formatEntityLabel(ent)) ||
        (ent && ent.name) ||
        objectId
      );
    }
    return objectId;
  }

  /**
   * Resolve identity without writes. Weak labels suggest candidates; they never
   * establish Person identity. createNew acknowledges a weak candidate list only.
   */
  function resolveObjectIdentity(objectType, input) {
    var type = canonicalObjectType(objectType);
    input = clone(input || {});
    if (!type) { return objectFailure("OBJECT_INVALID", "Pick a person, vehicle, location, business, or entity."); }
    var fresh = adoptDisk();
    if (!fresh.ok) { return objectFailure("OBJECT_STORAGE_UNAVAILABLE", fresh.error); }
    var checked = validateObjectId(type, input);
    if (!checked.ok) { return checked; }
    var requestedId = checked.objectId;
    var exact = requestedId && objectMap(type)[requestedId];
    if (requestedId && !exact) { return objectFailure("OBJECT_NOT_FOUND", "The selected object no longer exists. Create a new object explicitly if needed."); }
    var matches = objectStrongMatches(type, input);
    if (matches.length > 1 || (exact && matches.some(function (id) { return id !== requestedId; })) || (exact && objectIdentityContradicts(type, input, exact))) {
      var conflict = objectFailure("OBJECT_IDENTITY_CONFLICT", "The supplied identifiers refer to conflicting objects. Select and correct the identity explicitly.");
      conflict.candidates = matches;
      return conflict;
    }
    var matchedId = requestedId || matches[0] || "";
    var matched = matchedId && objectMap(type)[matchedId];
    if (matched && (objectRecordId(type, matched) !== matchedId || objectIdentityContradicts(type, input, matched))) {
      return objectFailure("OBJECT_IDENTITY_CONFLICT", "The selected object's stored identifiers contradict the request.");
    }
    if (matched && (isJunked(matched) || (matched.meta && matched.meta.archivedAt))) { return objectFailure("OBJECT_JUNKED", "The matching object is inactive. Restore it explicitly before reuse."); }
    if (matched) { return { ok: true, objectType: type, objectId: matchedId, record: clone(matched), reused: true, candidates: [], error: "" }; }
    var name = typeof input.name === "string" ? nameFromLabel(input.name) : input.name || nameFromLabel(input.label || "");
    var weak = Object.keys(objectMap(type)).filter(function (id) {
      var row = objectMap(type)[id];
      if (type === "PERSON") { var key = normalizeNameKey(name); return key && normalizeNameKey(row.name) === key; }
      if (type === "VEHICLE") {
        var plate = input.licensePlate || input.plate || "";
        var region = input.plateState || input.state || "";
        return plate && region && normalizePlateKey(region, plate) === normalizePlateKey(row.plateState, row.licensePlate || row.plate);
      }
      if (type === "LOCATION") { var address = normalizeLocationKey(input); return address && address === normalizeLocationKey(row); }
      var label = normalizeOrgName(input.name);
      return label && label === normalizeOrgName(row.name);
    });
    if (weak.length && !input.createNew && weak.every(function (id) { var row = objectMap(type)[id]; return isJunked(row) || (row.meta && row.meta.archivedAt); })) {
      return objectFailure("OBJECT_JUNKED", "The matching object is inactive. Restore it explicitly or create a separate object intentionally.");
    }
    weak = weak.filter(function (id) { var row = objectMap(type)[id]; return !isJunked(row) && !(row.meta && row.meta.archivedAt); });
    // Plate+state and full addresses preserve established non-Person reuse.
    // Multiple candidates or conflicting strong data always require selection.
    if (weak.length === 1 && (type === "VEHICLE" || type === "LOCATION") && !input.createNew && !objectIdentityContradicts(type, input, objectMap(type)[weak[0]])) {
      return { ok: true, objectType: type, objectId: weak[0], record: clone(objectMap(type)[weak[0]]), reused: true, candidates: [], error: "" };
    }
    if (weak.length && !input.createNew) {
      var ambiguous = objectFailure("OBJECT_SELECTION_REQUIRED", "Possible matching objects exist. Select an existing object or explicitly create a separate one.");
      ambiguous.candidates = weak;
      return ambiguous;
    }
    return { ok: true, objectType: type, objectId: "", record: null, reused: false, candidates: weak, error: "" };
  }

  function resolveObjectRecord(objectType, input) {
    var type = canonicalObjectType(objectType);
    input = clone(input || {});
    var identity = resolveObjectIdentity(type, input);
    if (!identity.ok || identity.reused) { return identity; }
    if (type === "PERSON") {
      input.name = typeof input.name === "string" ? nameFromLabel(input.name) : input.name || nameFromLabel(input.label || "");
      if (input.alienNumber || input.aNumber) { input.immigration = mergeRecord(input.immigration, { alienNumber: input.alienNumber || input.aNumber }); }
      if (input.fbiNumber) { input.criminal = mergeRecord(input.criminal, { fbiNumber: input.fbiNumber }); }
    }
    if (type === "VEHICLE") {
      input.licensePlate = input.licensePlate || input.plate || "";
      input.plateState = input.plateState || input.state || "";
    }
    delete input.objectType;
    delete input.label;
    var saved = saveObjectRecord(type, input, { mode: "commit", intent: "create" });
    saved.reused = false;
    return saved;
  }

  function addInvestigationObject(investigationId, input) {
    input = input || {};
    var blank = {
      ok: false,
      objectType: "",
      objectId: "",
      nodeId: "",
      linkId: "",
      reused: false,
      error: ""
    };
    var fresh = adoptDisk();
    if (!fresh.ok) {
      blank.error = fresh.error;
      return blank;
    }
    if (!state.investigations[investigationId]) {
      blank.error = "Investigation not found.";
      return blank;
    }
    var objectType = String(input.objectType || "").toUpperCase();
    if (
      objectType !== "PERSON" &&
      objectType !== "VEHICLE" &&
      objectType !== "LOCATION" &&
      objectType !== "BUSINESS" &&
      objectType !== "ENTITY"
    ) {
      blank.error = "Pick a person, vehicle, location, business, or entity.";
      return blank;
    }
    var resolved = resolveObjectRecord(objectType, input);
    if (!resolved.ok) {
      blank.objectType = objectType;
      blank.error = resolved.error;
      return blank;
    }
    fresh = adoptDisk();
    if (!fresh.ok) {
      blank.error = fresh.error;
      return blank;
    }
    var inv = clone(state.investigations[investigationId]);
    var fromNode = null;
    var fromNodeId = Object.prototype.hasOwnProperty.call(input, "fromNodeId")
      ? input.fromNodeId || ""
      : inv.focusNodeId || "";
    var i;
    if (fromNodeId) {
      for (i = 0; i < (inv.nodes || []).length; i++) {
        if (inv.nodes[i] && inv.nodes[i].nodeId === fromNodeId) {
          fromNode = inv.nodes[i];
          break;
        }
      }
    }
    if (
      fromNode &&
      fromNode.objectType === objectType &&
      fromNode.objectId === resolved.objectId
    ) {
      return {
        ok: false,
        objectType: objectType,
        objectId: resolved.objectId,
        nodeId: fromNode.nodeId,
        linkId: "",
        reused: resolved.reused,
        error: "Cannot link an object to itself."
      };
    }
    var node = ensureInvestigationNode(inv, objectType, resolved.objectId, {
      x: typeof input.x === "number" ? input.x : undefined,
      y: typeof input.y === "number" ? input.y : undefined
    });
    if (typeof input.x === "number") {
      node.x = input.x;
    }
    if (typeof input.y === "number") {
      node.y = input.y;
    }
    var linkId = "";
    var associationId = "";
    var reason = String(input.reason || "").trim();
    if (fromNode) {
      if (!reason) {
        reason = defaultInvestigationReason(fromNode.objectType, objectType);
      }
      if (!reason) {
        return {
          ok: false,
          objectType: objectType,
          objectId: resolved.objectId,
          nodeId: node.nodeId,
          linkId: "",
          reused: resolved.reused,
          error: "Pick a link type."
        };
      }
      var ends = canonicalLinkEnds(
        fromNode.objectType,
        fromNode.objectId,
        objectType,
        resolved.objectId,
        reason
      );
      inv.links = Array.isArray(inv.links) ? inv.links : [];
      var existingLink = null;
      for (i = 0; i < inv.links.length; i++) {
        var row = inv.links[i];
        if (!row || !row.from || !row.to) {
          continue;
        }
        var sameEnds =
          (row.from.type === ends.fromType &&
            row.from.id === ends.fromId &&
            row.to.type === ends.toType &&
            row.to.id === ends.toId) ||
          (row.from.type === ends.toType &&
            row.from.id === ends.toId &&
            row.to.type === ends.fromType &&
            row.to.id === ends.fromId);
        var reasons = row.reasons || [];
        if (sameEnds && reasons.indexOf(reason) !== -1) {
          existingLink = row;
          break;
        }
      }
      if (existingLink) {
        linkId = existingLink.linkId;
        var existingCitation = citeWallAssociation(
          existingLink,
          fromNode.objectType,
          fromNode.objectId,
          objectType,
          resolved.objectId,
          reason,
          inv.investigationId
        );
        if (!existingCitation.ok) { return existingCitation; }
        associationId = existingLink.associationId || "";
      } else {
        var link = model.createLink
          ? model.createLink({
              from: { type: ends.fromType, id: ends.fromId },
              to: { type: ends.toType, id: ends.toId },
              otherType: ends.toType,
              reasons: [reason],
              label: investigationObjectLabel(ends.toType, ends.toId)
            })
          : {
              linkId: model.newId("link"),
              from: { type: ends.fromType, id: ends.fromId },
              to: { type: ends.toType, id: ends.toId },
              reasons: [reason],
              notes: "",
              label: "",
              otherType: ends.toType
            };
        var newCitation = citeWallAssociation(
          link,
          fromNode.objectType,
          fromNode.objectId,
          objectType,
          resolved.objectId,
          reason,
          inv.investigationId
        );
        if (!newCitation.ok) { return newCitation; }
        inv.links.push(link);
        linkId = link.linkId;
        associationId = link.associationId || "";
      }
    }
    if (input.focus !== false) {
      inv.focusNodeId = node.nodeId;
    }
    var addedLabel = investigationObjectLabel(objectType, resolved.objectId);
    var note = "Added " + objectType.toLowerCase() + " " + addedLabel;
    if (fromNode && reason) {
      note += " (" + investigationReasonPhrase(reason) + ")";
    }
    note += ".";
    appendSystemNote(inv, note);
    var savedInv = saveInvestigation(inv, {
      mode: model.isCommitted && model.isCommitted(inv) ? "commit" : "draft"
    });
    if (!savedInv.ok) {
      return {
        ok: false,
        objectType: objectType,
        objectId: resolved.objectId,
        nodeId: node.nodeId,
        linkId: linkId,
        associationId: associationId,
        reused: resolved.reused,
        error: savedInv.error || "Could not update the investigation."
      };
    }
    return {
      ok: true,
      objectType: objectType,
      objectId: resolved.objectId,
      nodeId: node.nodeId,
      linkId: linkId,
      associationId: associationId,
      reused: resolved.reused,
      error: ""
    };
  }

  function connectInvestigationNodes(investigationId, fromNodeId, toNodeId, reason) {
    var blank = {
      ok: false,
      linkId: "",
      error: ""
    };
    var fresh = adoptDisk();
    if (!fresh.ok) {
      blank.error = fresh.error;
      return blank;
    }
    var inv = state.investigations[investigationId]
      ? clone(state.investigations[investigationId])
      : null;
    if (!inv) {
      blank.error = "Investigation not found.";
      return blank;
    }
    var fromNode = null;
    var toNode = null;
    var i;
    for (i = 0; i < (inv.nodes || []).length; i++) {
      if (inv.nodes[i] && inv.nodes[i].nodeId === fromNodeId) {
        fromNode = inv.nodes[i];
      }
      if (inv.nodes[i] && inv.nodes[i].nodeId === toNodeId) {
        toNode = inv.nodes[i];
      }
    }
    if (!fromNode || !toNode) {
      blank.error = "Both objects must be on this investigation.";
      return blank;
    }
    if (fromNode.nodeId === toNode.nodeId) {
      blank.error = "Cannot link an object to itself.";
      return blank;
    }
    reason = String(reason || "").trim();
    if (!reason) {
      reason = defaultInvestigationReason(fromNode.objectType, toNode.objectType);
    }
    if (!reason) {
      blank.error = "Those objects cannot be linked.";
      return blank;
    }
    var ends = canonicalLinkEnds(
      fromNode.objectType,
      fromNode.objectId,
      toNode.objectType,
      toNode.objectId,
      reason
    );
    inv.links = Array.isArray(inv.links) ? inv.links : [];
    for (i = 0; i < inv.links.length; i++) {
      var row = inv.links[i];
      if (!row || !row.from || !row.to) {
        continue;
      }
      var sameEnds =
        (row.from.type === ends.fromType &&
          row.from.id === ends.fromId &&
          row.to.type === ends.toType &&
          row.to.id === ends.toId) ||
        (row.from.type === ends.toType &&
          row.from.id === ends.toId &&
          row.to.type === ends.fromType &&
          row.to.id === ends.fromId);
      if (sameEnds && (row.reasons || []).indexOf(reason) !== -1) {
        citeWallAssociation(
          row,
          fromNode.objectType,
          fromNode.objectId,
          toNode.objectType,
          toNode.objectId,
          reason,
          inv.investigationId
        );
        saveInvestigation(inv, {
          mode: model.isCommitted && model.isCommitted(inv) ? "commit" : "draft"
        });
        return {
          ok: true,
          linkId: row.linkId,
          associationId: row.associationId || "",
          reused: true,
          error: ""
        };
      }
    }
    var link = model.createLink
      ? model.createLink({
          from: { type: ends.fromType, id: ends.fromId },
          to: { type: ends.toType, id: ends.toId },
          otherType: ends.toType,
          reasons: [reason],
          label: investigationObjectLabel(ends.toType, ends.toId)
        })
      : {
          linkId: model.newId("link"),
          from: { type: ends.fromType, id: ends.fromId },
          to: { type: ends.toType, id: ends.toId },
          reasons: [reason],
          notes: "",
          label: "",
          otherType: ends.toType
        };
    citeWallAssociation(
      link,
      fromNode.objectType,
      fromNode.objectId,
      toNode.objectType,
      toNode.objectId,
      reason,
      inv.investigationId
    );
    inv.links.push(link);
    appendSystemNote(
      inv,
      "Linked " +
        investigationObjectLabel(fromNode.objectType, fromNode.objectId) +
        " to " +
        investigationObjectLabel(toNode.objectType, toNode.objectId) +
        " (" +
        investigationReasonPhrase(reason) +
        ")."
    );
    var saved = saveInvestigation(inv, {
      mode: model.isCommitted && model.isCommitted(inv) ? "commit" : "draft"
    });
    if (!saved.ok) {
      blank.error = saved.error || "Could not save the link.";
      return blank;
    }
    return {
      ok: true,
      linkId: link.linkId,
      associationId: link.associationId || "",
      reused: false,
      error: ""
    };
  }

  function associationTouches(row, objectType, objectId) {
    if (!row || !objectId) {
      return false;
    }
    var type = String(objectType || "").toUpperCase();
    var id = String(objectId || "");
    return (
      (row.from &&
        String(row.from.type || "").toUpperCase() === type &&
        String(row.from.id || "") === id) ||
      (row.to &&
        String(row.to.type || "").toUpperCase() === type &&
        String(row.to.id || "") === id)
    );
  }

  // Associations own relationship state. Embedded rows are compatibility projections;
  // closed facts remain addressable so an old Case cannot silently assert them again.
  function associationStatus(row) {
    if (row && (row.relationshipStatus === "RETRACTED" || row.retractedAt)) {
      return "RETRACTED";
    }
    if (row && (row.relationshipStatus === "ENDED" || row.endedAt)) {
      return "ENDED";
    }
    return "ACTIVE";
  }

  function associationIsActive(row) {
    return !!row && !isJunked(row) && associationStatus(row) === "ACTIVE";
  }

  function associationForLink(link) {
    if (!link) { return null; }
    if (link.associationId && state.associations[link.associationId]) {
      return state.associations[link.associationId];
    }
    if (!link.from || !link.to || !link.from.id || !link.to.id) { return null; }
    return findAssociationByEnds(link.from.type, link.from.id,
      link.to.type || link.otherType, link.to.id,
      link.reason || (link.reasons && link.reasons[0]) || "", true) ||
      findAssociationByPair(link.from.type, link.from.id, link.to.type || link.otherType, link.to.id, true);
  }

  function projectAssociationLinks(links) {
    return (links || []).filter(function (link) {
      var association = associationForLink(link);
      return !association || associationIsActive(association);
    }).map(function (link) {
      var association = associationForLink(link);
      if (!association) { return link; }
      var projected = clone(link);
      projected.associationId = association.associationId;
      projected.from = clone(association.from);
      projected.to = clone(association.to);
      projected.otherType = association.to.type;
      projected.reasons = [association.reason || (association.reasons || [])[0]];
      projected.notes = association.notes || "";
      return projected;
    });
  }

  function associationEndsEqual(row, fromType, fromId, toType, toId, reason) {
    if (!row || !row.from || !row.to) {
      return false;
    }
    var rowReason = row.reason || (row.reasons && row.reasons[0]) || "";
    if (reason && rowReason !== reason && (row.reasons || []).indexOf(reason) === -1) {
      return false;
    }
    var fwd =
      row.from.type === fromType &&
      row.from.id === fromId &&
      row.to.type === toType &&
      row.to.id === toId;
    if (fwd) {
      return true;
    }
    var rev =
      row.from.type === toType &&
      row.from.id === toId &&
      row.to.type === fromType &&
      row.to.id === fromId;
    if (!rev) {
      return false;
    }
    return !reason || model.isSymmetricAssociation(reason) || rowReason === reason;
  }

  function findAssociationByEnds(fromType, fromId, toType, toId, reason, includeJunked) {
    var ends = canonicalLinkEnds(fromType, fromId, toType, toId, reason);
    var ids = Object.keys(state.associations || {});
    var i;
    for (i = 0; i < ids.length; i++) {
      var row = state.associations[ids[i]];
      if (!row) {
        continue;
      }
      if (!includeJunked && !associationIsActive(row)) {
        continue;
      }
      if (
        associationEndsEqual(
          row,
          ends.fromType,
          ends.fromId,
          ends.toType,
          ends.toId,
          ends.reason || reason
        )
      ) {
        return row;
      }
    }
    return null;
  }

  function putAssociation(record) {
    if (!record || !record.associationId) {
      return null;
    }
    state.associations = state.associations || {};
    state.associations[record.associationId] = clone(record);
    return state.associations[record.associationId];
  }

  function saveAssociationRecord(associationId, input, opts) {
    opts = opts || {};
    var blank = {
      ok: false,
      reused: false,
      associationId: associationId || "",
      error: ""
    };
    if (!opts.skipAdopt) {
      var fresh = adoptDisk();
      if (!fresh.ok) {
        blank.error = fresh.error;
        return blank;
      }
    }
    input = input || {};
    var existing = associationId && state.associations
      ? state.associations[associationId]
      : null;
    if (existing && !associationIsActive(existing)) {
      blank.code = "ASSOCIATION_CLOSED";
      blank.error = "This relationship has ended or was retracted. Review it and explicitly reassert it before changing it.";
      return blank;
    }
    if (opts.projection && existing) {
      return { ok: true, reused: true, associationId: existing.associationId, error: "" };
    }
    var before = clone(state);
    var previousAssociation = existing ? clone(existing) : null;
    var fromType = (input.from && input.from.type) || input.fromEntityType ||
      (existing && existing.from && existing.from.type) || "";
    var fromId = (input.from && input.from.id) || input.fromEntityId ||
      (existing && existing.from && existing.from.id) || "";
    var toType = (input.to && input.to.type) || input.toEntityType ||
      (existing && existing.to && existing.to.type) || "";
    var toId = (input.to && input.to.id) || input.toEntityId ||
      (existing && existing.to && existing.to.id) || "";
    var reason = input.reason || input.associationTypeCode ||
      (input.reasons && input.reasons[0]) ||
      (existing && (existing.reason || (existing.reasons && existing.reasons[0]))) ||
      "";
    if (!reason) {
      blank.error = "Pick a link type.";
      return blank;
    }
    if (model.validateAssociationEnds) {
      var valid = model.validateAssociationEnds(fromType, toType, reason);
      if (!valid || !valid.ok) {
        blank.error =
          (valid && valid.errors && valid.errors[0]) ||
          "Those objects cannot be linked as " + reason + ".";
        return blank;
      }
    }
    var ends = canonicalLinkEnds(fromType, fromId, toType, toId, reason);
    if (!ends.fromId || !ends.toId || !objectExists(ends.fromType, ends.fromId) ||
        !objectExists(ends.toType, ends.toId)) {
      blank.code = "ASSOCIATION_ENDPOINT_MISSING";
      blank.error = "Both relationship objects must exist before they can be linked.";
      return blank;
    }
    if (
      ends.fromType === ends.toType &&
      ends.fromId &&
      ends.fromId === ends.toId
    ) {
      blank.error = "Cannot link an object to itself.";
      return blank;
    }
    var merged = mergeRecord(existing, input);
    var duplicate = findAssociationByEnds(ends.fromType, ends.fromId, ends.toType, ends.toId, ends.reason || reason, true);
    if (duplicate && duplicate.associationId !== associationId) {
      blank.code = associationIsActive(duplicate) ? "ASSOCIATION_ALREADY_EXISTS" : "ASSOCIATION_CLOSED";
      blank.associationId = duplicate.associationId;
      blank.error = associationIsActive(duplicate)
        ? "This relationship already exists. Update its existing association."
        : "This relationship has ended or was retracted. Review it before explicitly reasserting it.";
      return blank;
    }
    merged.associationId = associationId || merged.associationId || model.newId("asoc");
    merged.from = { type: ends.fromType, id: ends.fromId };
    merged.to = { type: ends.toType, id: ends.toId };
    merged.reason = ends.reason || reason;
    merged.reasons = [merged.reason];
    merged.otherType = ends.toType;
    // Lifecycle fields are only writable through explicit lifecycle commands.
    ["relationshipStatus", "retractedAt", "endedAt", "retractionReason", "lifecycleHistory", "junked", "junkedAt"].forEach(function (key) {
      if (existing && Object.prototype.hasOwnProperty.call(existing, key)) { merged[key] = clone(existing[key]); }
      else { delete merged[key]; }
    });
    var record = model.createAssociation
      ? model.createAssociation(merged)
      : merged;
    record.associationId = merged.associationId;
    record.from = merged.from;
    record.to = merged.to;
    record.reason = merged.reason;
    record.reasons = [merged.reason];
    if (previousAssociation && !associationEndsEqual(previousAssociation,
        record.from.type, record.from.id, record.to.type, record.to.id, "")) {
      var superseded = clone(previousAssociation);
      var correctionTime = model.nowIso ? model.nowIso() : new Date().toISOString();
      superseded.associationId = model.newId("asoc");
      superseded.linkId = superseded.associationId;
      superseded.relationshipStatus = "RETRACTED";
      superseded.retractedAt = correctionTime;
      superseded.retractionReason = "Relationship endpoints corrected.";
      superseded.junked = true;
      superseded.junkedAt = correctionTime;
      superseded.supersededBy = record.associationId;
      superseded.lifecycleHistory = Array.isArray(superseded.lifecycleHistory) ? superseded.lifecycleHistory : [];
      superseded.lifecycleHistory.push({ from: associationStatus(previousAssociation), to: "RETRACTED",
        at: correctionTime, reason: superseded.retractionReason, supersededBy: record.associationId,
        validFrom: previousAssociation.validFrom || "", validTo: previousAssociation.validTo || "",
        occupancy: previousAssociation.occupancy || "" });
      putAssociation(superseded);
    }
    putAssociation(record);
    if (previousAssociation) {
      pruneAssociationProjections(previousAssociation);
    }
    if (!opts.skipLeadSync) {
      if (record.from.type === "PERSON") {
        syncLeadsForPerson(record.from.id);
      }
      if (record.to.type === "PERSON") {
        syncLeadsForPerson(record.to.id);
      }
    }
    if (opts.persist !== false && !writeDisk()) {
      state = before;
      blank.error = "Could not write localStorage (quota or private mode).";
      return blank;
    }
    return {
      ok: true,
      reused: !!existing,
      associationId: record.associationId,
      error: ""
    };
  }

  function upsertAssociation(input, opts) {
    opts = opts || {};
    var blank = {
      ok: false,
      reused: false,
      associationId: "",
      error: ""
    };
    if (!opts.skipAdopt) {
      var fresh = adoptDisk();
      if (!fresh.ok) {
        blank.error = fresh.error;
        return blank;
      }
    }
    input = input || {};
    var fromType = (input.from && input.from.type) || input.fromEntityType || "";
    var fromId = (input.from && input.from.id) || input.fromEntityId || "";
    var toType = (input.to && input.to.type) || input.toEntityType || "";
    var toId = (input.to && input.to.id) || input.toEntityId || "";
    var reason =
      input.reason ||
      input.associationTypeCode ||
      (input.reasons && input.reasons[0]) ||
      "";
    if (!reason) {
      blank.error = "Pick a link type.";
      return blank;
    }
    if (fromType && toType && model.validateAssociationEnds) {
      var valid = model.validateAssociationEnds(fromType, toType, reason);
      if (!valid || !valid.ok) {
        blank.error =
          (valid && valid.errors && valid.errors[0]) ||
          "Those objects cannot be linked as " + reason + ".";
        return blank;
      }
    }
    var ends = canonicalLinkEnds(fromType, fromId, toType, toId, reason);
    if (!ends.fromId || !ends.toId || !objectExists(ends.fromType, ends.fromId) ||
        !objectExists(ends.toType, ends.toId)) {
      blank.code = "ASSOCIATION_ENDPOINT_MISSING";
      blank.error = "Both relationship objects must exist before they can be linked.";
      return blank;
    }
    if (
      ends.fromType &&
      ends.toType &&
      ends.fromType === ends.toType &&
      ends.fromId &&
      ends.fromId === ends.toId
    ) {
      blank.error = "Cannot link an object to itself.";
      return blank;
    }
    var existing = findAssociationByEnds(
      ends.fromType,
      ends.fromId,
      ends.toType,
      ends.toId,
      ends.reason || reason,
      true
    );
    if (!existing && opts.projection) {
      existing = findAssociationByPair(ends.fromType, ends.fromId, ends.toType, ends.toId, true);
    }
    if (existing) {
      return saveAssociationRecord(existing.associationId, input, {
        skipAdopt: true,
        persist: opts.persist,
        skipLeadSync: opts.skipLeadSync,
        projection: opts.projection
      });
    }
    var before = clone(state);
    var record = model.createAssociation
      ? model.createAssociation({
          from: { type: ends.fromType, id: ends.fromId },
          to: { type: ends.toType, id: ends.toId },
          reason: ends.reason || reason,
          reasons: [ends.reason || reason],
          otherType: ends.toType,
          label: input.label || "",
          notes: input.notes || "",
          occupancy: input.occupancy || "",
          validFrom: input.validFrom || "",
          validTo: input.validTo || "",
          source: input.source || {
            investigationId: input.investigationId || "",
            leadId: input.leadId || "",
            encounterId: input.encounterId || "",
            officerId: input.officerId || ""
          },
          assertedAt: input.assertedAt || (model.nowIso ? model.nowIso() : "")
        })
      : {
          associationId: model.newId("asoc"),
          from: { type: ends.fromType, id: ends.fromId },
          to: { type: ends.toType, id: ends.toId },
          reason: ends.reason || reason,
          reasons: [ends.reason || reason]
        };
    putAssociation(record);
    if (!opts.skipLeadSync) {
      if (ends.fromType === "PERSON") {
        syncLeadsForPerson(ends.fromId);
      }
      if (ends.toType === "PERSON") {
        syncLeadsForPerson(ends.toId);
      }
    }
    if (opts.persist !== false) {
      if (!writeDisk()) {
        state = before;
        blank.code = "ASSOCIATION_WRITE_FAILED";
        blank.error = "Could not write localStorage (quota or private mode).";
        return blank;
      }
    }
    return {
      ok: true,
      reused: false,
      associationId: record.associationId,
      error: ""
    };
  }

  function citeWallAssociation(link, fromType, fromId, toType, toId, reason, investigationId) {
    var result = upsertAssociation(
      {
        from: { type: fromType, id: fromId },
        to: { type: toType, id: toId },
        reason: reason,
        source: { investigationId: investigationId || "" }
      },
      { skipAdopt: true, persist: true }
    );
    if (result.ok && link) {
      link.associationId = result.associationId;
    }
    return result;
  }

  function getAssociation(associationId) {
    adoptDisk();
    var row = state.associations && state.associations[associationId];
    return row ? clone(row) : null;
  }

  function associationsFor(objectType, objectId, opts) {
    opts = opts || {};
    adoptDisk();
    var out = [];
    Object.keys(state.associations || {}).forEach(function (id) {
      var row = state.associations[id];
      if (!row) {
        return;
      }
      if (!opts.includeJunked && isJunked(row)) {
        return;
      }
      if (!opts.includeHistorical && associationStatus(row) !== "ACTIVE") {
        return;
      }
      if (associationTouches(row, objectType, objectId)) {
        out.push(clone(row));
      }
    });
    return out;
  }

  function nestedLocationKind(reason) {
    var code = String(reason || "").toUpperCase();
    if (code === "EMPLOYMENT_ADDRESS" || code === "BUSINESS_ADDRESS") {
      return "work";
    }
    if (code === "REGISTERED_ADDRESS") {
      return "registration";
    }
    if (code === "VEHICLE_PARKING" || code === "STORED_AT") {
      return "known-parking";
    }
    return "residence";
  }

  function reasonFromNestedLocationKind(kind) {
    var key = String(kind || "").toLowerCase();
    if (key === "work") {
      return "EMPLOYMENT_ADDRESS";
    }
    if (key === "registration") {
      return "REGISTERED_ADDRESS";
    }
    if (key === "known-parking") {
      return "VEHICLE_PARKING";
    }
    return "CURRENT_RESIDENCE";
  }

  function associationOccupancyValue(row) {
    return String((row && row.occupancy) || "").toLowerCase() === "historical"
      ? "historical"
      : "current";
  }

  function occupancyPayload(row) {
    return {
      occupancy: associationOccupancyValue(row),
      validFrom: (row && (row.validFrom || row.occupiedFrom)) || "",
      validTo: (row && (row.validTo || row.occupiedTo)) || ""
    };
  }

  function applyAssociationOccupancy(target, asoc) {
    if (!target || !asoc) {
      return false;
    }
    var next = occupancyPayload(asoc);
    var changed = false;
    if (target.occupancy !== next.occupancy) {
      target.occupancy = next.occupancy;
      changed = true;
    }
    if (target.occupiedFrom !== next.validFrom) {
      target.occupiedFrom = next.validFrom;
      changed = true;
    }
    if (target.occupiedTo !== next.validTo) {
      target.occupiedTo = next.validTo;
      changed = true;
    }
    return changed;
  }

  function findAssociationByPair(typeA, idA, typeB, idB, includeJunked) {
    var aType = String(typeA || "").toUpperCase();
    var bType = String(typeB || "").toUpperCase();
    var aId = String(idA || "");
    var bId = String(idB || "");
    if (!aType || !aId || !bType || !bId) {
      return null;
    }
    var ids = Object.keys(state.associations || {});
    var i;
    for (i = 0; i < ids.length; i++) {
      var row = state.associations[ids[i]];
      if (!row) {
        continue;
      }
      if (!includeJunked && !associationIsActive(row)) {
        continue;
      }
      if (associationTouches(row, aType, aId) && associationTouches(row, bType, bId)) {
        return row;
      }
    }
    return null;
  }

  function occupancyFor(typeA, idA, typeB, idB) {
    adoptDisk();
    var row = findAssociationByPair(typeA, idA, typeB, idB);
    if (!row) {
      return null;
    }
    var occ = occupancyPayload(row);
    return {
      occupancy: occ.occupancy,
      occupiedFrom: occ.validFrom,
      occupiedTo: occ.validTo,
      associationId: row.associationId
    };
  }

  function putIdentityLocation(loc) {
    if (!loc || !loc.locationId) {
      return;
    }
    state.locations = state.locations || {};
    var prev = state.locations[loc.locationId];
    if (!prev) {
      var copy = typeof model.createLocation === "function"
        ? model.createLocation(clone(loc))
        : clone(loc);
      copy.entityType = "LOCATION";
      copy.locationId = loc.locationId;
      copy.id = copy.id || loc.locationId;
      state.locations[loc.locationId] = copy;
      return;
    }
    // Existing canonical identity is edited only by the explicit object gateway.
  }

  function putIdentityVehicle(veh) {
    if (!veh) {
      return;
    }
    var id = veh.vehicleId || veh.id;
    if (!id) {
      return;
    }
    state.vehicles = state.vehicles || {};
    var prev = state.vehicles[id];
    if (!prev) {
      var copy = typeof model.createVehicle === "function"
        ? model.createVehicle(clone(veh))
        : clone(veh);
      copy.entityType = "VEHICLE";
      copy.vehicleId = id;
      copy.id = copy.id || id;
      copy.governmentVehicle = false;
      state.vehicles[id] = copy;
      return;
    }
    // Embedded parent snapshots never write backward into this registry.
  }

  function syncObjectOwnedLocations(ownerType, ownerId, locations) {
    if (!ownerId) {
      return;
    }
    (locations || []).forEach(function (location) {
      if (!location || !location.locationId) {
        return;
      }
      putIdentityLocation(location);
      var reason = reasonFromNestedLocationKind(location.association);
      if (ownerType === "VEHICLE" && reason === "CURRENT_RESIDENCE") {
        reason = "VEHICLE_PARKING";
      }
      upsertAssociation(
        {
          from: { type: ownerType, id: ownerId },
          to: { type: "LOCATION", id: location.locationId },
          reason: reason,
          occupancy: location.occupancy || "current",
          validFrom: location.occupiedFrom || "",
          validTo: location.occupiedTo || ""
        },
        { skipAdopt: true, persist: false, skipLeadSync: true, projection: true }
      );
    });
    projectObjectOwnedLocations(ownerType, ownerId, locations);
  }

  function syncEncounterObjects(encounter) {
    if (!encounter) {
      return;
    }
    (encounter.vehicles || []).forEach(function (vehicle) {
      if (!vehicle) {
        return;
      }
      putIdentityVehicle(vehicle);
      var vehicleId = vehicle.vehicleId || vehicle.id || "";
      (vehicle.locations || []).forEach(function (location) {
        if (!vehicleId || !location || !location.locationId) {
          return;
        }
        putIdentityLocation(location);
        var reason = reasonFromNestedLocationKind(location.association);
        if (reason === "CURRENT_RESIDENCE") {
          reason = "VEHICLE_PARKING";
        }
        upsertAssociation(
          {
            from: { type: "VEHICLE", id: vehicleId },
            to: { type: "LOCATION", id: location.locationId },
            reason: reason,
            source: { encounterId: encounter.encounterId || "" }
          },
          { skipAdopt: true, persist: false, skipLeadSync: true, projection: true }
        );
      });
    });
    (encounter.locations || []).forEach(putIdentityLocation);
    (encounter.links || []).forEach(function (link) {
      if (!link || !link.from || !link.to) {
        return;
      }
      var fromType = canonicalObjectType(link.from.type);
      var toType = canonicalObjectType(link.to.type || link.otherType);
      var fromId = String(link.from.id || "");
      var toId = String(link.to.id || "");
      var reason = String((link.reasons && link.reasons[0]) || "").trim();
      if (
        !fromType ||
        !toType ||
        !fromId ||
        !toId ||
        !reason ||
        !objectExists(fromType, fromId) ||
        !objectExists(toType, toId)
      ) {
        return;
      }
      var result = upsertAssociation(
        Object.assign({
          from: { type: fromType, id: fromId },
          to: { type: toType, id: toId },
          reason: reason,
          label: link.label || investigationObjectLabel(toType, toId),
          source: { encounterId: encounter.encounterId || "" }
        }, link.notes ? { notes: link.notes } : {}),
        { skipAdopt: true, persist: false, skipLeadSync: true, projection: true }
      );
      if (result && result.ok) {
        link.associationId = result.associationId;
      }
    });
    encounter.links = projectAssociationLinks(encounter.links);
    (encounter.vehicles || []).forEach(function (vehicle) {
      if (!vehicle) { return; }
      projectObjectOwnedLocations("VEHICLE", vehicle.vehicleId || vehicle.id, vehicle.locations);
    });
  }

  function writePairOccupancy(fromType, fromId, toType, toId, row, defaultReason) {
    if (!fromId || !toId || !row) {
      return;
    }
    var occ = occupancyPayload(row);
    var existing = findAssociationByPair(fromType, fromId, toType, toId, true);
    if (existing) {
      // Once materialized, the relationship record wins over nested copies.
      return;
    }
    upsertAssociation(
      {
        from: { type: fromType, id: fromId },
        to: { type: toType, id: toId },
        reason: defaultReason,
        occupancy: occ.occupancy,
        validFrom: occ.validFrom,
        validTo: occ.validTo
      },
      { skipAdopt: true, persist: false, skipLeadSync: true }
    );
  }

  function syncNestedOccupancyToAssociations(lead) {
    if (!lead || !lead.person) {
      return;
    }
    var personId = lead.subjectPersonId || lead.person.personId;
    if (!personId) {
      return;
    }
    (lead.person.locations || []).forEach(function (loc) {
      if (!loc || !loc.locationId) {
        return;
      }
      putIdentityLocation(loc);
      writePairOccupancy(
        "PERSON",
        personId,
        "LOCATION",
        loc.locationId,
        loc,
        reasonFromNestedLocationKind(loc.association)
      );
    });
    (lead.vehicles || []).forEach(function (veh) {
      if (!veh) {
        return;
      }
      var vehicleId = veh.vehicleId || veh.id;
      if (!vehicleId) {
        return;
      }
      putIdentityVehicle(veh);
      writePairOccupancy(
        "PERSON",
        personId,
        "VEHICLE",
        vehicleId,
        veh,
        "REGISTERED_OWNER_OF"
      );
      (veh.locations || []).forEach(function (loc) {
        if (!loc || !loc.locationId) {
          return;
        }
        putIdentityLocation(loc);
        var reason = reasonFromNestedLocationKind(loc.association);
        if (reason === "CURRENT_RESIDENCE") {
          reason = "VEHICLE_PARKING";
        }
        writePairOccupancy("VEHICLE", vehicleId, "LOCATION", loc.locationId, loc, reason);
      });
    });
  }

  /** Materialize every resolvable lead link as the same world association used by investigations. */
  function syncLeadLinksToAssociations(lead, persistedAssociations) {
    if (!lead || !Array.isArray(lead.links)) {
      return;
    }
    lead.links.forEach(function (link) {
      if (!link || !link.from || !link.to) {
        return;
      }
      var fromType = canonicalObjectType(link.from.type);
      var toType = canonicalObjectType(link.to.type || link.otherType);
      var fromId = String(link.from.id || "");
      var toId = String(link.to.id || "");
      var reason = String((link.reasons && link.reasons[0]) || "").trim();
      if (
        !fromType ||
        !toType ||
        !fromId ||
        !toId ||
        !reason ||
        !objectExists(fromType, fromId) ||
        !objectExists(toType, toId)
      ) {
        return;
      }
      var input = {
        from: { type: fromType, id: fromId },
        to: { type: toType, id: toId },
        reason: reason,
        label: link.label || investigationObjectLabel(toType, toId),
        source: { leadId: lead.leadId || "" }
      };
      if (link.notes) {
        input.notes = link.notes;
      }
      var matching = (link.associationId && state.associations[link.associationId]) ||
        findAssociationByEnds(fromType, fromId, toType, toId, reason, true) ||
        findAssociationByPair(fromType, fromId, toType, toId, true);
      // Nested cards may have materialized this relationship earlier in the same
      // save. Its first explicit link supplies its annotations; later snapshots
      // cannot overwrite a relationship that was already durable.
      var initialAssertion = !!(matching && persistedAssociations &&
        !Object.prototype.hasOwnProperty.call(persistedAssociations, matching.associationId));
      if (initialAssertion && model.validateAssociationEnds &&
          !model.validateAssociationEnds(fromType, toType, reason).ok) {
        // A legacy display reason may be unreadable by the modern matrix. The
        // freshly materialized canonical pair still accepts the original notes;
        // retain the old reason as provenance instead of minting a guessed fact.
        input.from = clone(matching.from);
        input.to = clone(matching.to);
        input.reason = matching.reason;
        input.source.legacyLinkReason = reason;
      }
      var result = matching
        ? saveAssociationRecord(matching.associationId, input, {
            skipAdopt: true,
            persist: false,
            skipLeadSync: true,
            projection: !initialAssertion
          })
        : upsertAssociation(input, {
            skipAdopt: true,
            persist: false,
            skipLeadSync: true,
            projection: true
          });
      if (result && result.ok) {
        link.associationId = result.associationId;
      }
    });
  }

  function otherEnd(row, type, id) {
    if (!row || !row.from || !row.to) {
      return null;
    }
    if (row.from.type === type && row.from.id === id) {
      return row.to;
    }
    if (row.to.type === type && row.to.id === id) {
      return row.from;
    }
    return null;
  }

  function hasLiveAssociationBetween(typeA, idA, typeB, idB) {
    return Object.keys(state.associations || {}).some(function (associationId) {
      var row = state.associations[associationId];
      if (!associationIsActive(row) || !row.from || !row.to) {
        return false;
      }
      return (
        (row.from.type === typeA &&
          row.from.id === idA &&
          row.to.type === typeB &&
          row.to.id === idB) ||
        (row.from.type === typeB &&
          row.from.id === idB &&
          row.to.type === typeA &&
          row.to.id === idA)
      );
    });
  }

  /** Remove only denormalized case projections no longer backed by a world fact. */
  function pruneAssociationProjectionFromLead(lead, association) {
    if (!lead || !association || !association.from || !association.to) {
      return false;
    }
    var person = model.subjectOf ? model.subjectOf(lead) : lead.person;
    var personId = (person && person.personId) || lead.subjectPersonId || "";
    var changed = false;
    var other = personId ? otherEnd(association, "PERSON", personId) : null;
    if (
      other &&
      other.type === "LOCATION" &&
      !hasLiveAssociationBetween("PERSON", personId, "LOCATION", other.id)
    ) {
      var beforeLocations = (person.locations || []).length;
      person.locations = (person.locations || []).filter(function (row) {
        return !row || row.locationId !== other.id;
      });
      changed = changed || person.locations.length !== beforeLocations;
    }
    if (
      other &&
      other.type === "VEHICLE" &&
      !hasLiveAssociationBetween("PERSON", personId, "VEHICLE", other.id)
    ) {
      var beforeVehicles = (lead.vehicles || []).length;
      lead.vehicles = (lead.vehicles || []).filter(function (row) {
        return !row || (row.vehicleId || row.id) !== other.id;
      });
      changed = changed || lead.vehicles.length !== beforeVehicles;
    }
    (lead.vehicles || []).forEach(function (vehicle) {
      if (!vehicle) {
        return;
      }
      var vehicleId = vehicle.vehicleId || vehicle.id || "";
      var place = vehicleId
        ? otherEnd(association, "VEHICLE", vehicleId)
        : null;
      if (
        !place ||
        place.type !== "LOCATION" ||
        hasLiveAssociationBetween("VEHICLE", vehicleId, "LOCATION", place.id)
      ) {
        return;
      }
      var before = (vehicle.locations || []).length;
      vehicle.locations = (vehicle.locations || []).filter(function (row) {
        return !row || row.locationId !== place.id;
      });
      changed = changed || vehicle.locations.length !== before;
    });
    if (changed && person) {
      lead.person = person;
    }
    return changed;
  }

  function pruneAssociationProjections(association) {
    Object.keys(state.leads || {}).forEach(function (leadId) {
      var lead = state.leads[leadId];
      if (pruneAssociationProjectionFromLead(lead, association)) {
        rememberPeople(lead);
      }
    });
    ["people", "vehicles", "businesses", "entities"].forEach(function (collection) {
      var type = collection === "people" ? "PERSON" : collection === "vehicles" ? "VEHICLE" : collection === "businesses" ? "BUSINESS" : "ENTITY";
      Object.keys(state[collection] || {}).forEach(function (id) {
        var record = state[collection][id];
        var other = otherEnd(association, type, id);
        if (record && other && other.type === "LOCATION" && !hasLiveAssociationBetween(type, id, "LOCATION", other.id)) {
          record.locations = (record.locations || []).filter(function (location) { return !location || location.locationId !== other.id; });
        }
      });
    });
  }

  function projectObjectOwnedLocations(type, id, locations) {
    if (!Array.isArray(locations)) { return; }
    for (var i = locations.length - 1; i >= 0; i -= 1) {
      var location = locations[i];
      if (!location || !location.locationId) { continue; }
      var association = findAssociationByPair(type, id, "LOCATION", location.locationId, true);
      if (association && !associationIsActive(association) && !hasLiveAssociationBetween(type, id, "LOCATION", location.locationId)) {
        locations.splice(i, 1);
      } else if (association && associationIsActive(association)) {
        applyAssociationOccupancy(location, association);
      }
    }
  }

  function ensureNestedLocation(list, locationId, reason, asoc) {
    var src = getLocationRecord(locationId);
    if (!src) {
      return false;
    }
    var i;
    for (i = 0; i < list.length; i++) {
      if (list[i] && list[i].locationId === locationId) {
        list[i].street = src.street || list[i].street;
        list[i].street2 = src.street2 || list[i].street2;
        list[i].city = src.city || list[i].city;
        list[i].state = src.state || list[i].state;
        list[i].zip = src.zip || list[i].zip;
        list[i].latitude = src.latitude || list[i].latitude;
        list[i].longitude = src.longitude || list[i].longitude;
        list[i].association = nestedLocationKind(reason);
        if (asoc) {
          applyAssociationOccupancy(list[i], asoc);
        }
        return true;
      }
    }
    var copy = clone(src);
    copy.association = nestedLocationKind(reason);
    if (asoc) {
      applyAssociationOccupancy(copy, asoc);
    } else if (!copy.occupancy) {
      copy.occupancy = "current";
    }
    list.push(copy);
    return true;
  }

  function ensureNestedVehicle(list, vehicleId, asoc) {
    var src = getVehicleRecord(vehicleId);
    if (!src) {
      return null;
    }
    var i;
    for (i = 0; i < list.length; i++) {
      if (list[i] && (list[i].vehicleId || list[i].id) === vehicleId) {
        list[i].licensePlate = src.licensePlate || src.plate || list[i].licensePlate;
        list[i].plate = list[i].licensePlate;
        list[i].plateState = src.plateState || list[i].plateState;
        list[i].vehicleYear = src.vehicleYear || list[i].vehicleYear;
        list[i].vehicleMake = src.vehicleMake || list[i].vehicleMake;
        list[i].vehicleModel = src.vehicleModel || list[i].vehicleModel;
        list[i].vehicleColor = src.vehicleColor || list[i].vehicleColor;
        list[i].vehicleBodyStyle = src.vehicleBodyStyle || list[i].vehicleBodyStyle;
        list[i].vin = src.vin || list[i].vin;
        if (!list[i].registeredOwnerName && src.registeredOwnerName) {
          list[i].registeredOwnerName = src.registeredOwnerName;
        }
        list[i].governmentVehicle = false;
        list[i].locations = list[i].locations || [];
        if (asoc) {
          applyAssociationOccupancy(list[i], asoc);
        }
        return list[i];
      }
    }
    var copy = clone(src);
    copy.governmentVehicle = false;
    copy.locations = Array.isArray(copy.locations) ? copy.locations : [];
    if (asoc) {
      applyAssociationOccupancy(copy, asoc);
    }
    list.push(copy);
    return copy;
  }

  function applyAssociationNestingToLead(lead) {
    if (!lead || !lead.person) {
      return false;
    }
    var personId = lead.subjectPersonId || lead.person.personId;
    if (!personId) {
      return false;
    }
    var person = lead.person;
    person.locations = Array.isArray(person.locations) ? person.locations : [];
    lead.vehicles = Array.isArray(lead.vehicles) ? lead.vehicles : [];
    var changed = false;
    lead.links = projectAssociationLinks(lead.links);
    Object.keys(state.associations || {}).forEach(function (id) {
      var association = state.associations[id];
      if (association && !associationIsActive(association)) {
        changed = pruneAssociationProjectionFromLead(lead, association) || changed;
      }
    });
    Object.keys(state.associations || {}).forEach(function (id) {
      var row = state.associations[id];
      if (!associationIsActive(row)) {
        return;
      }
      var other = otherEnd(row, "PERSON", personId);
      if (!other || !other.type || !other.id) {
        return;
      }
      var reason = row.reason || (row.reasons && row.reasons[0]) || "";
      if (other.type === "LOCATION") {
        if (ensureNestedLocation(person.locations, other.id, reason, row)) {
          changed = true;
        }
      }
      if (other.type === "VEHICLE") {
        var nested = ensureNestedVehicle(lead.vehicles, other.id, row);
        if (nested) {
          changed = true;
        }
      }
    });
    lead.vehicles.forEach(function (vehicle) {
      if (!vehicle) {
        return;
      }
      var vehicleId = vehicle.vehicleId || vehicle.id;
      if (!vehicleId) {
        return;
      }
      vehicle.locations = Array.isArray(vehicle.locations) ? vehicle.locations : [];
      Object.keys(state.associations || {}).forEach(function (id) {
        var row = state.associations[id];
        if (!associationIsActive(row)) {
          return;
        }
        var other = otherEnd(row, "VEHICLE", vehicleId);
        if (!other || other.type !== "LOCATION" || !other.id) {
          return;
        }
        var reason = row.reason || (row.reasons && row.reasons[0]) || "";
        if (ensureNestedLocation(vehicle.locations, other.id, reason, row)) {
          changed = true;
        }
      });
    });
    return changed;
  }

  function syncLeadsForPerson(personId) {
    Object.keys(state.leads || {}).forEach(function (leadId) {
      var lead = state.leads[leadId];
      if (!lead || ((lead.subjectPersonId || (lead.person && lead.person.personId)) !== personId)) { return; }
      applyAssociationNestingToLead(lead);
      rememberPeople(lead);
    });
  }

  function setAssociationReason(associationId, reason) {
    var blank = { ok: false, associationId: associationId || "", error: "" };
    var fresh = adoptDisk();
    if (!fresh.ok) {
      blank.error = fresh.error;
      return blank;
    }
    var row = state.associations && state.associations[associationId];
    if (!row) {
      blank.error = "Association not found.";
      return blank;
    }
    reason = String(reason || "").trim();
    if (!reason) {
      blank.error = "Pick a link type.";
      return blank;
    }
    if (model.validateAssociationEnds) {
      var valid = model.validateAssociationEnds(row.from.type, row.to.type, reason);
      if (!valid || !valid.ok) {
        blank.error =
          (valid && valid.errors && valid.errors[0]) ||
          "Those objects cannot be linked as " + reason + ".";
        return blank;
      }
    }
    return saveAssociationRecord(associationId, { reason: reason }, { skipAdopt: true });
  }

  function stripAssociationCitations(associationId) {
    if (!associationId) {
      return;
    }
    Object.keys(state.investigations || {}).forEach(function (id) {
      var inv = state.investigations[id];
      if (!inv || !Array.isArray(inv.links)) {
        return;
      }
      inv.links = inv.links.filter(function (row) {
        return !row || row.associationId !== associationId;
      });
    });
    Object.keys(state.leads || {}).forEach(function (id) {
      var lead = state.leads[id];
      if (!lead || !Array.isArray(lead.links)) {
        return;
      }
      lead.links = lead.links.filter(function (row) {
        return !row || row.associationId !== associationId;
      });
    });
    Object.keys(state.encounters || {}).forEach(function (id) {
      var encounter = state.encounters[id];
      if (!encounter || !Array.isArray(encounter.links)) { return; }
      // Completed snapshots and saved narratives remain historical evidence.
      encounter.links = encounter.links.filter(function (row) {
        return !row || row.associationId !== associationId;
      });
    });
  }

  function transitionAssociation(row, status, opts) {
    opts = opts || {};
    var priorStatus = associationStatus(row);
    var at = model.nowIso ? model.nowIso() : new Date().toISOString();
    var reason = String(opts.reason || (status === "RETRACTED" ? "Relationship removed by user." : "Relationship ended by user.")).trim();
    var history = Array.isArray(row.lifecycleHistory) ? row.lifecycleHistory.slice() : [];
    var citations = [];
    if (status !== "ACTIVE") {
      ["leads", "investigations", "encounters"].forEach(function (collection) {
        Object.keys(state[collection] || {}).forEach(function (id) {
          (state[collection][id].links || []).forEach(function (link) {
            var referenced = associationForLink(link);
            if (referenced && referenced.associationId === row.associationId) {
              citations.push({ collection: collection, objectId: id, link: clone(link) });
            }
          });
        });
      });
    }
    history.push({ from: priorStatus, to: status, at: at, reason: reason,
      officerId: String(opts.officerId || ""), citations: citations,
      validFrom: row.validFrom || "", validTo: row.validTo || "", occupancy: row.occupancy || "" });
    row.lifecycleHistory = history;
    row.relationshipStatus = status;
    row.updatedAt = at;
    if (status === "RETRACTED") {
      row.retractedAt = at;
      row.retractionReason = reason;
      row.junked = true;
      row.junkedAt = at;
    } else if (status === "ENDED") {
      row.endedAt = String(opts.endedAt || at);
      row.endReason = reason;
      row.validTo = row.endedAt;
      row.occupancy = "historical";
    } else {
      row.retractedAt = "";
      row.endedAt = "";
      row.retractionReason = "";
      row.junked = false;
      row.junkedAt = "";
      row.validFrom = String(opts.validFrom || at);
      row.validTo = "";
      row.occupancy = "current";
    }
    putAssociation(row);
    if (status !== "ACTIVE") {
      // Remove citations by identity and by legacy endpoints before stale links can
      // be materialized again. Snapshot copies survive in lifecycleHistory above.
      ["leads", "investigations", "encounters"].forEach(function (collection) {
        Object.keys(state[collection] || {}).forEach(function (id) {
          var owner = state[collection][id];
          owner.links = projectAssociationLinks(owner.links);
        });
      });
      pruneAssociationProjections(row);
    }
    if (row.from.type === "PERSON") { syncLeadsForPerson(row.from.id); }
    if (row.to.type === "PERSON") { syncLeadsForPerson(row.to.id); }
  }

  function mutateAssociationLifecycle(associationId, status, opts) {
    opts = opts || {};
    var blank = { ok: false, associationId: associationId || "", removed: false, error: "" };
    var fresh = adoptDisk();
    if (!fresh.ok) {
      blank.error = fresh.error;
      return blank;
    }
    var row = state.associations && state.associations[associationId];
    if (!row) {
      blank.code = "ASSOCIATION_NOT_FOUND";
      blank.error = "Relationship not found.";
      return blank;
    }
    if (associationStatus(row) === status && (status !== "ACTIVE" || !isJunked(row))) {
      return { ok: true, associationId: associationId, status: status, removed: false, reused: true, error: "" };
    }
    if (status === "ACTIVE" && !String(opts.reason || "").trim()) {
      blank.code = "REASSERTION_REASON_REQUIRED";
      blank.error = "Explain why this relationship is being asserted again.";
      return blank;
    }
    if (status === "ENDED" && associationStatus(row) === "RETRACTED") {
      blank.code = "ASSOCIATION_RETRACTED";
      blank.error = "A retracted relationship cannot be marked as a historical fact.";
      return blank;
    }
    if (opts.endedAt && !isFinite(Date.parse(opts.endedAt))) {
      blank.code = "INVALID_END_DATE";
      blank.error = "Enter a valid relationship end date.";
      return blank;
    }
    if (status === "ACTIVE" && (!objectExists(row.from.type, row.from.id) || !objectExists(row.to.type, row.to.id))) {
      blank.code = "ASSOCIATION_ENDPOINT_MISSING";
      blank.error = "Both objects must still exist before this relationship can be asserted again.";
      return blank;
    }
    var before = clone(state);
    transitionAssociation(row, status, opts);
    if (!writeDisk()) {
      state = before;
      blank.code = "ASSOCIATION_WRITE_FAILED";
      blank.error = "Could not write localStorage (quota or private mode).";
      return blank;
    }
    return { ok: true, associationId: associationId, status: status, removed: status !== "ACTIVE", error: "" };
  }

  function retractAssociation(associationId, opts) {
    return mutateAssociationLifecycle(associationId, "RETRACTED", opts);
  }

  function endAssociation(associationId, opts) {
    return mutateAssociationLifecycle(associationId, "ENDED", opts);
  }

  function reassertAssociation(associationId, opts) {
    return mutateAssociationLifecycle(associationId, "ACTIVE", opts);
  }

  function dropAssociation(associationId) {
    var fresh = adoptDisk();
    if (!fresh.ok) { return { ok: false, associationId: associationId || "", removed: false, error: fresh.error }; }
    if (!state.associations[associationId]) {
      return { ok: true, associationId: associationId || "", removed: false, error: "" };
    }
    return retractAssociation(associationId, { reason: "Relationship removed by user." });
  }

  function removeObjectRelationship(ownerType, ownerId, otherType, otherId, opts) {
    opts = opts || {};
    var blank = { ok: false, associationIds: [], removed: false, error: "" };
    var fresh = adoptDisk();
    if (!fresh.ok) { blank.error = fresh.error; return blank; }
    ownerType = canonicalObjectType(ownerType);
    otherType = canonicalObjectType(otherType);
    ownerId = String(ownerId || "");
    otherId = String(otherId || "");
    if (!ownerId || !otherId || !objectExists(ownerType, ownerId) || !objectExists(otherType, otherId)) {
      blank.code = "ASSOCIATION_ENDPOINT_MISSING";
      blank.error = "Both relationship objects must exist.";
      return blank;
    }
    if (opts.mode && opts.mode !== "retract" && opts.mode !== "end") {
      blank.code = "INVALID_RELATIONSHIP_ACTION";
      blank.error = "Choose retract or end for this relationship.";
      return blank;
    }
    if (opts.endedAt && !isFinite(Date.parse(opts.endedAt))) {
      blank.code = "INVALID_END_DATE";
      blank.error = "Enter a valid relationship end date.";
      return blank;
    }
    var rows = Object.keys(state.associations || {}).map(function (id) { return state.associations[id]; }).filter(function (row) {
      return row && associationTouches(row, ownerType, ownerId) && associationTouches(row, otherType, otherId);
    });
    var before = clone(state);
    var status = opts.mode === "end" ? "ENDED" : "RETRACTED";
    var changed = [];
    rows.forEach(function (row) {
      if (associationStatus(row) === status || (status === "ENDED" && associationStatus(row) === "RETRACTED")) { return; }
      transitionAssociation(row, status, opts);
      changed.push(row.associationId);
    });
    if (changed.length && !writeDisk()) {
      state = before;
      blank.code = "ASSOCIATION_WRITE_FAILED";
      blank.error = "Could not write localStorage (quota or private mode).";
      return blank;
    }
    return { ok: true, associationIds: rows.map(function (row) { return row.associationId; }), removed: changed.length > 0, status: status, error: "" };
  }

  function dropAssociationsForObject(objectType, objectId) {
    Object.keys(state.associations || {}).forEach(function (id) {
      if (associationTouches(state.associations[id], objectType, objectId)) {
        delete state.associations[id];
      }
    });
  }

  function setAssociationsJunkedForObject(objectType, objectId, junked) {
    Object.keys(state.associations || {}).forEach(function (id) {
      var row = state.associations[id];
      if (!associationTouches(row, objectType, objectId)) {
        return;
      }
      row.junked = !!junked;
      row.junkedAt = junked && model.nowIso ? model.nowIso() : "";
    });
  }

  function retargetAssociations(objectType, fromId, toId) {
    if (!fromId || !toId || fromId === toId) {
      return;
    }
    Object.keys(state.associations || {}).forEach(function (id) {
      var row = state.associations[id];
      if (!row) {
        return;
      }
      if (row.from && row.from.type === objectType && row.from.id === fromId) {
        row.from.id = toId;
      }
      if (row.to && row.to.type === objectType && row.to.id === fromId) {
        row.to.id = toId;
      }
      if (
        row.from &&
        row.to &&
        row.from.type === row.to.type &&
        row.from.id === row.to.id
      ) {
        delete state.associations[id];
      }
    });
    var seen = {};
    Object.keys(state.associations || {}).forEach(function (id) {
      var row = state.associations[id];
      if (!row || !row.from || !row.to) {
        return;
      }
      var key =
        row.from.type +
        "|" +
        row.from.id +
        "|" +
        row.to.type +
        "|" +
        row.to.id +
        "|" +
        (row.reason || "");
      var symmetric =
        model.isSymmetricAssociation && model.isSymmetricAssociation(row.reason);
      if (symmetric) {
        var a = row.from.type + "|" + row.from.id;
        var b = row.to.type + "|" + row.to.id;
        key =
          (a < b ? a + "|" + b : b + "|" + a) + "|" + (row.reason || "");
      }
      if (seen[key] && seen[key] !== id) {
        retargetWallAssociationIds(id, seen[key]);
        delete state.associations[id];
        return;
      }
      seen[key] = id;
    });
  }

  function retargetWallAssociationIds(fromAssociationId, toAssociationId) {
    if (!fromAssociationId || !toAssociationId || fromAssociationId === toAssociationId) {
      return;
    }
    Object.keys(state.investigations || {}).forEach(function (id) {
      var inv = state.investigations[id];
      if (!inv) {
        return;
      }
      (inv.links || []).forEach(function (link) {
        if (link && link.associationId === fromAssociationId) {
          link.associationId = toAssociationId;
        }
      });
    });
  }

  function restorePersonRegistry(previous, identity) {
    if (!previous || !previous.personId) {
      return;
    }
    var kept = clone(previous);
    if (identity && identity.name) {
      kept.name = clone(identity.name);
    }
    if (identity) {
      if (identity.sex) {
        kept.sex = identity.sex;
      }
      if (identity.dateOfBirth) {
        kept.dateOfBirth = identity.dateOfBirth;
      }
      if (identity.age) {
        kept.age = identity.age;
      }
      if (identity.citizenship) {
        kept.citizenship = identity.citizenship;
      }
      if (identity.ssn) {
        kept.ssn = identity.ssn;
      }
      if (identity.lexId) {
        kept.lexId = identity.lexId;
      }
      if (identity.caseRole) {
        kept.caseRole = identity.caseRole;
      }
    }
    state.people[kept.personId] = kept;
    writeDisk();
  }

  function objectExists(objectType, objectId) {
    var type = String(objectType || "").toUpperCase();
    var id = String(objectId || "");
    if (!id) {
      return false;
    }
    if (type === "PERSON") {
      return !!state.people[id];
    }
    if (type === "VEHICLE") {
      return !!state.vehicles[id];
    }
    if (type === "LOCATION") {
      return !!state.locations[id];
    }
    if (type === "BUSINESS") {
      return !!state.businesses[id];
    }
    if (type === "ENTITY") {
      return !!state.entities[id];
    }
    return false;
  }

  function objectIsReferenced(objectType, objectId, skip) {
    var checked = stage5DependencyScan(objectType, objectId, state, skip);
    return !checked.ok || checked.dependencies.length > 0;
  }

  function overlayIdentityOnto(objectType, fromId, toId) {
    var type = String(objectType || "").toUpperCase();
    if (type === "PERSON") {
      var fromP = state.people[fromId];
      var toP = state.people[toId];
      if (!fromP || !toP) {
        return;
      }
      toP.name = toP.name || {};
      fromP.name = fromP.name || {};
      if (fromP.name.lastName) {
        toP.name.lastName = fromP.name.lastName;
      }
      if (fromP.name.firstName) {
        toP.name.firstName = fromP.name.firstName;
      }
      if (fromP.name.middleName) {
        toP.name.middleName = fromP.name.middleName;
      }
      if (fromP.sex) {
        toP.sex = fromP.sex;
      }
      if (fromP.dateOfBirth) {
        toP.dateOfBirth = fromP.dateOfBirth;
      }
      return;
    }
    if (type === "VEHICLE") {
      var fromV = state.vehicles[fromId];
      var toV = state.vehicles[toId];
      if (!fromV || !toV) {
        return;
      }
      [
        "licensePlate",
        "plate",
        "plateState",
        "vehicleYear",
        "vehicleMake",
        "vehicleModel",
        "vehicleColor",
        "vehicleBodyStyle",
        "vin",
        "registeredOwnerName"
      ].forEach(function (key) {
        if (fromV[key]) {
          toV[key] = fromV[key];
        }
      });
      return;
    }
    if (type === "LOCATION") {
      var fromL = state.locations[fromId];
      var toL = state.locations[toId];
      if (!fromL || !toL) {
        return;
      }
      ["street", "street2", "city", "state", "zip"].forEach(function (key) {
        if (fromL[key]) {
          toL[key] = fromL[key];
        }
      });
      return;
    }
    if (type === "BUSINESS") {
      var fromB = state.businesses[fromId];
      var toB = state.businesses[toId];
      if (!fromB || !toB) {
        return;
      }
      if (fromB.name) {
        toB.name = fromB.name;
      }
      if (fromB.phone) {
        toB.phone = fromB.phone;
      }
      return;
    }
    if (type === "ENTITY") {
      var fromE = state.entities[fromId];
      var toE = state.entities[toId];
      if (!fromE || !toE) {
        return;
      }
      if (fromE.name) {
        toE.name = fromE.name;
      }
      if (fromE.kind) {
        toE.kind = fromE.kind;
      }
    }
  }

  function dropUnreferencedObject(objectType, objectId, skip) {
    if (!stage5DeleteProtection(objectType, objectId, skip).ok) {
      return false;
    }
    var type = String(objectType || "").toUpperCase();
    var id = String(objectId || "");
    if (type === "PERSON") {
      delete state.people[id];
    } else if (type === "VEHICLE") {
      delete state.vehicles[id];
    } else if (type === "LOCATION") {
      delete state.locations[id];
    } else if (type === "BUSINESS") {
      delete state.businesses[id];
    } else if (type === "ENTITY") {
      delete state.entities[id];
    } else {
      return false;
    }
    // Media bytes are retained until explicit dependency-checked cleanup.
    return true;
  }

  function investigationIntegrity(investigationId) {
    var blank = { ok: false, issues: [], investigationId: investigationId || "" };
    adoptDisk();
    var inv = state.investigations[investigationId];
    if (!inv) {
      blank.issues.push({ code: "missing-investigation" });
      return blank;
    }
    var seen = {};
    var issues = [];
    ((inv.nodes || [])).forEach(function (node) {
      if (!node) {
        return;
      }
      var key = objectKey(node.objectType, node.objectId);
      if (seen[key]) {
        issues.push({
          code: "duplicate-node",
          nodeId: node.nodeId,
          objectType: node.objectType,
          objectId: node.objectId
        });
      }
      seen[key] = true;
      if (!objectExists(node.objectType, node.objectId)) {
        issues.push({
          code: "dangling-node",
          nodeId: node.nodeId,
          objectType: node.objectType,
          objectId: node.objectId
        });
      }
    });
    ((inv.links || [])).forEach(function (link) {
      if (!link || !link.from || !link.to) {
        issues.push({ code: "broken-link", linkId: (link && link.linkId) || "" });
        return;
      }
      var fromKey = objectKey(link.from.type, link.from.id);
      var toKey = objectKey(link.to.type, link.to.id);
      if (!seen[fromKey] || !seen[toKey]) {
        issues.push({
          code: "link-missing-node",
          linkId: link.linkId || ""
        });
      }
      if (link.associationId) {
        var asoc = state.associations && state.associations[link.associationId];
        if (!asoc) {
          issues.push({
            code: "dangling-association",
            linkId: link.linkId || "",
            associationId: link.associationId
          });
        }
      }
    });
    return {
      ok: issues.length === 0,
      issues: issues,
      investigationId: investigationId
    };
  }

  function associationIntegrity() {
    adoptDisk();
    var issues = [];
    Object.keys(state.associations || {}).forEach(function (id) {
      var row = state.associations[id];
      if (!row || !row.from || !row.to) {
        issues.push({ code: "broken-association", associationId: id });
        return;
      }
      var reason = row.reason || (row.reasons && row.reasons[0]) || "";
      if (reason && model.validateAssociationEnds) {
        var valid = model.validateAssociationEnds(row.from.type, row.to.type, reason);
        if (!valid || !valid.ok) {
          issues.push({
            code: "invalid-reason",
            associationId: id,
            reason: reason
          });
        }
      }
      if (row.from.id && !objectExists(row.from.type, row.from.id)) {
        issues.push({
          code: "dangling-from",
          associationId: id,
          objectType: row.from.type,
          objectId: row.from.id
        });
      }
      if (row.to.id && !objectExists(row.to.type, row.to.id)) {
        issues.push({
          code: "dangling-to",
          associationId: id,
          objectType: row.to.type,
          objectId: row.to.id
        });
      }
    });
    return { ok: issues.length === 0, issues: issues };
  }

  function dropSelfLinks(inv) {
    if (!inv) {
      return;
    }
    inv.links = (inv.links || []).filter(function (link) {
      if (!link || !link.from || !link.to) {
        return false;
      }
      return !(link.from.type === link.to.type && link.from.id === link.to.id);
    });
  }

  function collapseDuplicateNodes(inv, objectType, objectId) {
    if (!inv) {
      return;
    }
    var kept = null;
    ((inv.nodes || [])).forEach(function (node) {
      if (
        node &&
        node.objectType === objectType &&
        node.objectId === objectId &&
        !kept
      ) {
        kept = node;
      }
    });
    if (!kept) {
      return;
    }
    inv.nodes = (inv.nodes || []).filter(function (node) {
      if (!node) {
        return false;
      }
      if (
        node.objectType === objectType &&
        node.objectId === objectId &&
        node.nodeId !== kept.nodeId
      ) {
        if (inv.focusNodeId === node.nodeId) {
          inv.focusNodeId = kept.nodeId;
        }
        return false;
      }
      return true;
    });
  }

  function retargetObjectAcrossInvestigations(objectType, fromId, toId) {
    if (!fromId || !toId || fromId === toId) {
      return;
    }
    Object.keys(state.investigations).forEach(function (id) {
      var inv = state.investigations[id];
      if (!inv) {
        return;
      }
      ((inv.nodes || [])).forEach(function (node) {
        if (
          node &&
          node.objectType === objectType &&
          node.objectId === fromId
        ) {
          node.objectId = toId;
        }
      });
      rewriteInvestigationObjectId(inv, objectType, fromId, toId);
      if (objectType === "VEHICLE") {
        ((inv.plates || [])).forEach(function (plate) {
          if (plate && plate.vehicleId === fromId) {
            plate.vehicleId = toId;
          }
        });
      }
      collapseDuplicateNodes(inv, objectType, toId);
      dropSelfLinks(inv);
    });
    retargetAssociations(objectType, fromId, toId);
  }

  function rewriteInvestigationObjectId(inv, objectType, fromId, toId) {
    (inv.links || []).forEach(function (link) {
      if (!link) {
        return;
      }
      if (link.from && link.from.type === objectType && link.from.id === fromId) {
        link.from.id = toId;
      }
      if (link.to && link.to.type === objectType && link.to.id === fromId) {
        link.to.id = toId;
      }
    });
  }

  function retargetInvestigationNode(inv, node, nextId) {
    var oldId = node.objectId;
    if (!nextId || nextId === oldId) {
      return node.nodeId;
    }
    var existing = null;
    var i;
    for (i = 0; i < (inv.nodes || []).length; i++) {
      if (
        inv.nodes[i] &&
        inv.nodes[i].nodeId !== node.nodeId &&
        inv.nodes[i].objectType === node.objectType &&
        inv.nodes[i].objectId === nextId
      ) {
        existing = inv.nodes[i];
        break;
      }
    }
    rewriteInvestigationObjectId(inv, node.objectType, oldId, nextId);
    if (existing) {
      inv.nodes = inv.nodes.filter(function (row) {
        return row && row.nodeId !== node.nodeId;
      });
      if (inv.focusNodeId === node.nodeId) {
        inv.focusNodeId = existing.nodeId;
      }
      return existing.nodeId;
    }
    node.objectId = nextId;
    return node.nodeId;
  }

  function reuseInvestigationIdentity(investigationId, nodeId, targetObjectId) {
    var fresh = adoptDisk();
    if (!fresh.ok) { return objectFailure("OBJECT_STORAGE_UNAVAILABLE", fresh.error); }
    var inv = state.investigations[investigationId] ? clone(state.investigations[investigationId]) : null;
    if (!inv) { return objectFailure("OBJECT_NOT_FOUND", "Investigation not found."); }
    var node = (inv.nodes || []).filter(function (row) { return row && row.nodeId === nodeId; })[0];
    if (!node) { return objectFailure("OBJECT_NOT_FOUND", "Object not found on this investigation."); }
    var record = getObjectRecord(node.objectType, node.objectId);
    if (!record) { return objectFailure("OBJECT_NOT_FOUND", "The investigation object no longer exists."); }
    if (!targetObjectId || targetObjectId === node.objectId) {
      return { ok: true, reused: false, objectId: node.objectId, nodeId: node.nodeId, error: "" };
    }
    var selected = resolveObjectIdentity(node.objectType, { objectId: targetObjectId });
    if (!selected.ok) { return selected; }
    if (objectIdentityContradicts(node.objectType, record, selected.record)) {
      return objectFailure("OBJECT_IDENTITY_CONFLICT", "The selected objects have conflicting identifiers and cannot be reused interchangeably.");
    }
    var keptId = retargetInvestigationNode(inv, node, selected.objectId);
    var saved = saveInvestigation(inv, { mode: model.isCommitted && model.isCommitted(inv) ? "commit" : "draft" });
    if (!saved.ok) { return saved; }
    // Explicitly retarget this membership only; merging canonical objects and
    // their histories is a separate operation and never a side effect of edit.
    return { ok: true, reused: true, objectId: selected.objectId, nodeId: keptId, error: "" };
  }

  function disconnectInvestigationLink(investigationId, linkId, opts) {
    var blank = { ok: false, linkId: linkId || "", error: "" };
    var fresh = adoptDisk();
    if (!fresh.ok) {
      blank.error = fresh.error;
      return blank;
    }
    var inv = state.investigations[investigationId]
      ? clone(state.investigations[investigationId])
      : null;
    if (!inv) {
      blank.error = "Investigation not found.";
      return blank;
    }
    var selectedLink = (inv.links || []).filter(function (row) { return row && row.linkId === linkId; })[0];
    var association = associationForLink(selectedLink);
    if (association) {
      var retracted = retractAssociation(association.associationId, opts || { reason: "Relationship disconnected from investigation." });
      retracted.linkId = linkId;
      return retracted;
    }
    var before = (inv.links || []).length;
    inv.links = (inv.links || []).filter(function (row) {
      return row && row.linkId !== linkId;
    });
    if (inv.links.length === before) {
      blank.error = "Link not found.";
      return blank;
    }
    appendSystemNote(inv, "Removed a link.");
    var saved = saveInvestigation(inv, {
      mode: model.isCommitted && model.isCommitted(inv) ? "commit" : "draft"
    });
    if (!saved.ok) {
      blank.error = saved.error || "Could not remove the link.";
      return blank;
    }
    return { ok: true, linkId: linkId, error: "" };
  }

  function associateInvestigationObject(investigationId, hostNodeId, input) {
    input = input || {};
    var blank = {
      ok: false,
      objectType: "",
      objectId: "",
      personId: "",
      nodeId: "",
      associationId: "",
      reused: false,
      placed: false,
      error: ""
    };
    var fresh = adoptDisk();
    if (!fresh.ok) {
      blank.error = fresh.error;
      return blank;
    }
    var inv = state.investigations[investigationId];
    if (!inv) {
      blank.error = "Investigation not found.";
      return blank;
    }
    var host = null;
    var i;
    for (i = 0; i < (inv.nodes || []).length; i++) {
      if (inv.nodes[i] && inv.nodes[i].nodeId === hostNodeId) {
        host = inv.nodes[i];
        break;
      }
    }
    if (!host) {
      blank.error = "Focus an object first.";
      return blank;
    }
    var objectType = String(
      input.objectType || (input.personId ? "PERSON" : "") || "PERSON"
    ).toUpperCase();
    var objectId = input.objectId || input.personId || "";
    var label = String(input.label || input.name || "").trim();
    if (!objectId) {
      if (objectType === "PERSON") {
        var parsedName = nameFromLabel(label);
        if (!parsedName.lastName && !parsedName.firstName) {
          blank.error = "Type a name.";
          return blank;
        }
      } else if (objectType === "VEHICLE") {
        var plateBits = parsePlateLabel(label);
        if (!plateBits.plate) {
          blank.error = "Type a plate.";
          return blank;
        }
      } else if (objectType === "LOCATION") {
        var addr = parseAddressLabel(label);
        if (!addr.street && !addr.city) {
          blank.error = "Type a street or city.";
          return blank;
        }
      } else if (objectType === "BUSINESS" || objectType === "ENTITY") {
        if (!label) {
          blank.error = "Type a name.";
          return blank;
        }
      } else {
        blank.error = "Pick an object type.";
        return blank;
      }
    }
    var reason = String(input.reason || "").trim();
    if (!reason && objectType === "PERSON" && model.defaultPersonAssociationReason) {
      reason = model.defaultPersonAssociationReason(host.objectType);
    }
    if (
      !reason &&
      ((host.objectType === "PERSON" && objectType === "BUSINESS") ||
        (host.objectType === "BUSINESS" && objectType === "PERSON"))
    ) {
      reason = "CUSTOMER_OF";
    }
    if (!reason) {
      reason = defaultInvestigationReason(host.objectType, objectType);
    }
    if (!reason) {
      blank.error = "Those objects cannot be linked.";
      return blank;
    }
    var already = null;
    if (objectId) {
      for (i = 0; i < (inv.nodes || []).length; i++) {
        if (
          inv.nodes[i] &&
          inv.nodes[i].objectType === objectType &&
          inv.nodes[i].objectId === objectId
        ) {
          already = inv.nodes[i];
          break;
        }
      }
    }
    var payload = {
      objectType: objectType,
      objectId: objectId,
      fromNodeId: host.nodeId,
      reason: reason,
      x: Number(host.x || 0) + 300,
      y: Number(host.y || 0),
      focus: false
    };
    if (objectType === "PERSON") {
      payload.name = input.name || label;
      payload.label = label;
    } else if (objectType === "VEHICLE") {
      var plate = parsePlateLabel(label);
      payload.licensePlate = plate.plate;
      payload.plate = plate.plate;
      payload.plateState = plate.state;
    } else if (objectType === "LOCATION") {
      var loc = parseAddressLabel(label);
      payload.street = loc.street;
      payload.city = loc.city;
      payload.state = loc.state;
      payload.zip = loc.zip;
    } else if (objectType === "BUSINESS" || objectType === "ENTITY") {
      payload.name = label;
    }
    var result = addInvestigationObject(investigationId, payload);
    if (!result || !result.ok) {
      blank.error = (result && result.error) || "Could not add that object.";
      return blank;
    }
    if (
      ((host.objectType === "VEHICLE" && objectType === "PERSON") ||
        (host.objectType === "PERSON" && objectType === "VEHICLE")) &&
      reason === "REGISTERED_OWNER_OF"
    ) {
      var vehicleId = host.objectType === "VEHICLE" ? host.objectId : result.objectId;
      var personId = host.objectType === "PERSON" ? host.objectId : result.objectId;
      var vehicle = getVehicleRecord(vehicleId);
      if (vehicle && !String(vehicle.registeredOwnerName || "").trim()) {
        vehicle.registeredOwnerName = investigationObjectLabel("PERSON", personId);
        var savedVehicle = saveVehicleRecord(vehicle, { mode: "commit" });
        if (!savedVehicle.ok) { return savedVehicle; }
      }
    }
    return {
      ok: true,
      objectType: objectType,
      objectId: result.objectId,
      personId: objectType === "PERSON" ? result.objectId : "",
      nodeId: result.nodeId,
      associationId: result.associationId || "",
      reused: !!result.reused,
      placed: !already,
      error: ""
    };
  }

  function associateInvestigationPerson(investigationId, hostNodeId, input) {
    input = input || {};
    input.objectType = "PERSON";
    if (input.personId && !input.objectId) {
      input.objectId = input.personId;
    }
    return associateInvestigationObject(investigationId, hostNodeId, input);
  }

  function listObjects(objectType, includeJunked) {
    adoptDisk();
    var type = String(objectType || "").toUpperCase();
    var map = null;
    var idKey = "";
    if (type === "PERSON") {
      map = state.people;
      idKey = "personId";
    } else if (type === "VEHICLE") {
      map = state.vehicles;
      idKey = "vehicleId";
    } else if (type === "LOCATION") {
      map = state.locations;
      idKey = "locationId";
    } else if (type === "BUSINESS") {
      map = state.businesses;
      idKey = "businessId";
    } else if (type === "ENTITY") {
      map = state.entities;
      idKey = "entityId";
    }
    if (!map) {
      return [];
    }
    var out = [];
    Object.keys(map).forEach(function (id) {
      var row = map[id];
      if (!row) {
        return;
      }
      if (!includeJunked && (isJunked(row) || (row.meta && row.meta.archivedAt))) {
        return;
      }
      var copy = clone(row);
      if (!copy[idKey]) {
        copy[idKey] = id;
      }
      out.push(copy);
    });
    return out;
  }

  function associateCaseObject(leadId, input) {
    input = input || {};
    var blank = {
      ok: false,
      leadId: leadId || "",
      objectType: "",
      objectId: "",
      associationId: "",
      linkId: "",
      reused: false,
      error: ""
    };
    var fresh = adoptDisk();
    if (!fresh.ok) {
      blank.error = fresh.error;
      return blank;
    }
    var lead = state.leads[leadId] ? clone(state.leads[leadId]) : null;
    if (!lead) {
      blank.error = "Case not found.";
      return blank;
    }
    var person = model.subjectOf ? model.subjectOf(lead) : lead.person;
    var personId = (person && person.personId) || lead.subjectPersonId || "";
    if (!personId) {
      blank.error = "Case has no subject.";
      return blank;
    }
    var objectType = String(input.objectType || "PERSON").toUpperCase();
    var objectId = String(input.objectId || input.personId || "").trim();
    var label = String(input.label || input.name || "").trim();
    var notes = String(input.notes || "").trim();
    var reason = String(input.reason || "").trim();
    if (objectType === "OTHER") {
      if (!label) {
        blank.error = "Enter a name.";
        return blank;
      }
      lead.links = Array.isArray(lead.links) ? lead.links : [];
      var otherLink = model.createLink
        ? model.createLink({
            label: label,
            otherType: "OTHER",
            from: { type: "PERSON", id: personId },
            to: { type: "OTHER", id: "" },
            reasons: reason ? [reason] : [],
            notes: notes
          })
        : {
            linkId: model.newId("link"),
            label: label,
            otherType: "OTHER",
            from: { type: "PERSON", id: personId },
            to: { type: "OTHER", id: "" },
            reasons: reason ? [reason] : [],
            notes: notes
          };
      if (input.linkId) {
        otherLink.linkId = input.linkId;
      }
      var replaced = false;
      var i;
      for (i = 0; i < lead.links.length; i++) {
        if (lead.links[i] && lead.links[i].linkId === otherLink.linkId) {
          lead.links[i] = otherLink;
          replaced = true;
          break;
        }
      }
      if (!replaced) {
        lead.links.push(otherLink);
      }
      var savedOther = saveLead(lead, {
        mode: model.isCommitted && model.isCommitted(lead) ? "commit" : "draft"
      });
      if (!savedOther.ok) {
        blank.error = savedOther.error || "Could not save.";
        return blank;
      }
      return {
        ok: true,
        leadId: lead.leadId,
        objectType: "OTHER",
        objectId: "",
        associationId: "",
        linkId: otherLink.linkId,
        reused: false,
        error: ""
      };
    }
    if (!reason) {
      if (objectType === "PERSON" && model.defaultPersonAssociationReason) {
        reason = model.defaultPersonAssociationReason("PERSON");
      }
      if (!reason && objectType === "BUSINESS") {
        reason = "CUSTOMER_OF";
      }
      if (!reason) {
        reason = defaultInvestigationReason("PERSON", objectType);
      }
    }
    if (!reason) {
      blank.error = "Pick a relationship.";
      return blank;
    }
    var payload = {
      objectType: objectType,
      objectId: objectId,
      label: label,
      name: input.name || label
    };
    if (input.objectRecord && typeof input.objectRecord === "object") {
      var savedObject = saveObjectRecord(objectType, input.objectRecord, {
        mode: "commit"
      });
      if (!savedObject || !savedObject.ok) {
        blank.error =
          (savedObject && savedObject.error) || "Could not save that object.";
        return blank;
      }
      objectId = savedObject.objectId;
      payload.objectId = objectId;
      label = investigationObjectLabel(objectType, objectId) || label;
    }
    if (objectType === "VEHICLE") {
      var plate = parsePlateLabel(label);
      payload.licensePlate = plate.plate;
      payload.plate = plate.plate;
      payload.plateState = plate.state;
    }
    if (objectType === "LOCATION") {
      var addr = parseAddressLabel(label);
      payload.street = addr.street;
      payload.city = addr.city;
      payload.state = addr.state;
      payload.zip = addr.zip;
    }
    if (!objectId) {
      if (objectType === "PERSON") {
        var parsedName = nameFromLabel(label);
        if (!parsedName.lastName && !parsedName.firstName) {
          blank.error = "Type a name.";
          return blank;
        }
      } else if (objectType === "VEHICLE" && !payload.licensePlate) {
        blank.error = "Type a plate.";
        return blank;
      } else if (objectType === "LOCATION" && !payload.street && !payload.city) {
        blank.error = "Type a street or city.";
        return blank;
      } else if (
        (objectType === "BUSINESS" || objectType === "ENTITY") &&
        !label
      ) {
        blank.error = "Type a name.";
        return blank;
      }
    }
    var resolved = resolveObjectRecord(objectType, payload);
    if (!resolved || !resolved.ok) {
      blank.error = (resolved && resolved.error) || "Could not save that object.";
      return blank;
    }
    objectId = resolved.objectId;
    var associationInput = {
      from: { type: "PERSON", id: personId },
      to: { type: objectType, id: objectId },
      reason: reason,
      notes: notes,
      label: investigationObjectLabel(objectType, objectId),
      source: { leadId: lead.leadId }
    };
    var asoc = input.associationId && state.associations[input.associationId]
      ? saveAssociationRecord(input.associationId, associationInput, {
          skipAdopt: true,
          persist: true
        })
      : upsertAssociation(associationInput, {
          skipAdopt: true,
          persist: true
        });
    if (!asoc || !asoc.ok) {
      blank.error = (asoc && asoc.error) || "Could not save the association.";
      return blank;
    }
    lead = state.leads[leadId] ? clone(state.leads[leadId]) : lead;
    lead.links = Array.isArray(lead.links) ? lead.links : [];
    var link = null;
    for (i = 0; i < lead.links.length; i++) {
      var row = lead.links[i];
      if (!row) {
        continue;
      }
      if (input.linkId && row.linkId === input.linkId) {
        link = row;
        break;
      }
      if (row.associationId && row.associationId === asoc.associationId) {
        link = row;
        break;
      }
    }
    var display = investigationObjectLabel(objectType, objectId);
    if (!link) {
      link = model.createLink
        ? model.createLink({
            from: { type: "PERSON", id: personId },
            to: { type: objectType, id: objectId },
            otherType: objectType,
            reasons: [reason],
            notes: notes,
            label: display,
            associationId: asoc.associationId
          })
        : {
            linkId: model.newId("link"),
            from: { type: "PERSON", id: personId },
            to: { type: objectType, id: objectId },
            otherType: objectType,
            reasons: [reason],
            notes: notes,
            label: display,
            associationId: asoc.associationId
          };
      if (input.linkId) {
        link.linkId = input.linkId;
      }
      lead.links.push(link);
    } else {
      link.to = { type: objectType, id: objectId };
      link.otherType = objectType;
      link.reasons = [reason];
      link.notes = notes;
      link.label = display;
      link.associationId = asoc.associationId;
    }
    var saved = saveLead(lead, {
      mode: model.isCommitted && model.isCommitted(lead) ? "commit" : "draft"
    });
    if (!saved.ok) {
      blank.error = saved.error || "Could not save.";
      return blank;
    }
    return {
      ok: true,
      leadId: lead.leadId,
      objectType: objectType,
      objectId: objectId,
      associationId: asoc.associationId,
      linkId: link.linkId,
      reused: !!resolved.reused,
      error: ""
    };
  }

  function removeCaseLink(leadId, linkId, opts) {
    var blank = {
      ok: false,
      leadId: leadId || "",
      linkId: linkId || "",
      removed: false,
      error: ""
    };
    var fresh = adoptDisk();
    if (!fresh.ok) {
      blank.error = fresh.error;
      return blank;
    }
    var lead = state.leads[leadId] ? clone(state.leads[leadId]) : null;
    if (!lead) {
      blank.error = "Case not found.";
      return blank;
    }
    var selectedLink = (lead.links || []).filter(function (row) { return row && row.linkId === linkId; })[0];
    var association = associationForLink(selectedLink);
    if (association) {
      var retracted = retractAssociation(association.associationId, opts || { reason: "Relationship removed from Case." });
      retracted.leadId = leadId;
      retracted.linkId = linkId;
      return retracted;
    }
    var before = (lead.links || []).length;
    lead.links = (lead.links || []).filter(function (row) {
      return !row || row.linkId !== linkId;
    });
    if (lead.links.length === before) {
      return {
        ok: true,
        leadId: lead.leadId,
        linkId: linkId || "",
        removed: false,
        error: ""
      };
    }
    var saved = saveLead(lead, {
      mode: model.isCommitted && model.isCommitted(lead) ? "commit" : "draft"
    });
    if (!saved.ok) {
      blank.error = saved.error || "Could not save.";
      return blank;
    }
    return {
      ok: true,
      leadId: lead.leadId,
      linkId: linkId,
      removed: true,
      error: ""
    };
  }

  function setInvestigationAssociationReason(investigationId, associationId, reason) {
    var blank = {
      ok: false,
      associationId: associationId || "",
      error: ""
    };
    var changed = setAssociationReason(associationId, reason);
    if (!changed.ok) {
      return changed;
    }
    var fresh = adoptDisk();
    if (!fresh.ok) {
      blank.error = fresh.error;
      return blank;
    }
    var inv = state.investigations[investigationId]
      ? clone(state.investigations[investigationId])
      : null;
    if (!inv) {
      return { ok: true, associationId: associationId, error: "" };
    }
    var asoc = state.associations[associationId];
    var nextReason = (asoc && asoc.reason) || reason;
    (inv.links || []).forEach(function (link) {
      if (!link || link.associationId !== associationId) {
        return;
      }
      link.reasons = [nextReason];
      if (asoc && asoc.from && asoc.to) {
        link.from = { type: asoc.from.type, id: asoc.from.id };
        link.to = { type: asoc.to.type, id: asoc.to.id };
      }
    });
    var saved = saveInvestigation(inv, {
      mode: model.isCommitted && model.isCommitted(inv) ? "commit" : "draft"
    });
    if (!saved.ok) {
      blank.error = saved.error || "Could not update the link.";
      return blank;
    }
    return { ok: true, associationId: associationId, error: "" };
  }

  function disconnectInvestigationAssociation(investigationId, associationId, opts) {
    var blank = {
      ok: false,
      associationId: associationId || "",
      removed: false,
      error: ""
    };
    var fresh = adoptDisk();
    if (!fresh.ok) {
      blank.error = fresh.error;
      return blank;
    }
    var inv = state.investigations[investigationId]
      ? clone(state.investigations[investigationId])
      : null;
    if (!inv) {
      blank.error = "Investigation not found.";
      return blank;
    }
    var association = state.associations && state.associations[associationId];
    if (association) {
      var belongs = (inv.links || []).some(function (row) { return row && row.associationId === associationId; }) ||
        (inv.nodes || []).some(function (node) { return node && associationTouches(association, node.objectType, node.objectId); });
      if (!belongs) {
        blank.code = "ASSOCIATION_CONTEXT_MISMATCH";
        blank.error = "This relationship is not connected to an object in this investigation.";
        return blank;
      }
      return retractAssociation(associationId, opts || { reason: "Relationship disconnected from investigation." });
    }
    var before = (inv.links || []).length;
    inv.links = (inv.links || []).filter(function (row) {
      return !row || row.associationId !== associationId;
    });
    if (inv.links.length === before) {
      return {
        ok: true,
        associationId: associationId,
        removed: false,
        error: ""
      };
    }
    appendSystemNote(inv, "Removed a link.");
    var saved = saveInvestigation(inv, {
      mode: model.isCommitted && model.isCommitted(inv) ? "commit" : "draft"
    });
    if (!saved.ok) {
      blank.error = saved.error || "Could not remove the link.";
      return blank;
    }
    return {
      ok: true,
      associationId: associationId,
      removed: true,
      error: ""
    };
  }

  function stripObjectFromInvestigation(inv, objectType, objectId) {
    var key = objectKey(objectType, objectId);
    var dropped = {};
    inv.nodes = (inv.nodes || []).filter(function (row) {
      if (row && row.objectType === objectType && row.objectId === objectId) {
        dropped[row.nodeId] = true;
        return false;
      }
      return !!row;
    });
    inv.links = (inv.links || []).filter(function (link) {
      if (!link || !link.from || !link.to) {
        return false;
      }
      return (
        objectKey(link.from.type, link.from.id) !== key &&
        objectKey(link.to.type, link.to.id) !== key
      );
    });
    if (String(objectType || "").toUpperCase() === "VEHICLE") {
      (inv.plates || []).forEach(function (plate) {
        if (
          plate &&
          plate.vehicleId === objectId &&
          plate.status === "promoted"
        ) {
          plate.status = "hit";
        }
      });
    }
    if (dropped[inv.focusNodeId]) {
      inv.focusNodeId = "";
    }
    return Object.keys(dropped).length;
  }

  function objectIsCaseSubject(objectId) {
    var id = String(objectId || "");
    if (!id) {
      return false;
    }
    var leadIds = Object.keys(state.leads);
    var i;
    for (i = 0; i < leadIds.length; i++) {
      var lead = state.leads[leadIds[i]];
      if (lead && (lead.subjectPersonId === id || (lead.person && lead.person.personId === id))) {
        return true;
      }
    }
    return false;
  }

  function setRecordJunked(objectType, objectId, junked) {
    var type = String(objectType || "").toUpperCase();
    var id = String(objectId || "");
    var rec = null;
    if (type === "PERSON") {
      rec = state.people[id];
    } else if (type === "VEHICLE") {
      rec = state.vehicles[id];
    } else if (type === "LOCATION") {
      rec = state.locations[id];
    } else if (type === "BUSINESS") {
      rec = state.businesses[id];
    } else if (type === "ENTITY") {
      rec = state.entities[id];
    }
    if (!rec) {
      return false;
    }
    rec.junked = !!junked;
    rec.junkedAt = junked ? model.nowIso() : "";
    return true;
  }

  /**
   * Drop a node from this investigation wall. Keeps the shared
   * person/vehicle/location/business/entity. Drops links on this
   * investigation only. Promoted plates for a removed vehicle return to hit.
   */
  function removeInvestigationObject(investigationId, nodeId) {
    var blank = {
      ok: false,
      nodeId: nodeId || "",
      objectType: "",
      objectId: "",
      error: ""
    };
    var fresh = adoptDisk();
    if (!fresh.ok) {
      blank.error = fresh.error;
      return blank;
    }
    var inv = state.investigations[investigationId]
      ? clone(state.investigations[investigationId])
      : null;
    if (!inv) {
      blank.error = "Investigation not found.";
      return blank;
    }
    var wanted = String(nodeId || "").trim();
    var node = null;
    var i;
    for (i = 0; i < (inv.nodes || []).length; i++) {
      if (inv.nodes[i] && inv.nodes[i].nodeId === wanted) {
        node = inv.nodes[i];
        break;
      }
    }
    if (!node) {
      blank.error = "Focus an object to remove it from the wall.";
      return blank;
    }
    var label = investigationObjectLabel(node.objectType, node.objectId) || "object";
    stripObjectFromInvestigation(inv, node.objectType, node.objectId);
    appendSystemNote(inv, "Removed " + label + " from the wall.");
    var saved = saveInvestigation(inv, {
      mode: model.isCommitted && model.isCommitted(inv) ? "commit" : "draft"
    });
    if (!saved.ok) {
      blank.error = saved.error || "Could not remove that object.";
      return blank;
    }
    return {
      ok: true,
      nodeId: node.nodeId,
      objectType: node.objectType,
      objectId: node.objectId,
      error: ""
    };
  }

  /**
   * Empty this investigation's wall and plate queue.
   * Does not delete people/vehicles/locations/businesses/entities.
   * Does not change child or parent investigations.
   */
  function clearInvestigationWorkspace(investigationId) {
    var blank = {
      ok: false,
      investigationId: investigationId || "",
      cleared: false,
      error: ""
    };
    var fresh = adoptDisk();
    if (!fresh.ok) {
      blank.error = fresh.error;
      return blank;
    }
    var inv = state.investigations[investigationId]
      ? clone(state.investigations[investigationId])
      : null;
    if (!inv) {
      blank.error = "Investigation not found.";
      return blank;
    }
    var nodeCount = (inv.nodes || []).length;
    var linkCount = (inv.links || []).length;
    var plateCount = (inv.plates || []).length;
    if (!nodeCount && !linkCount && !plateCount && !inv.focusNodeId) {
      return {
        ok: true,
        investigationId: inv.investigationId,
        cleared: false,
        error: ""
      };
    }
    inv.nodes = [];
    inv.links = [];
    inv.plates = [];
    inv.focusNodeId = "";
    appendSystemNote(inv, "Cleared the workspace.");
    var saved = saveInvestigation(inv, {
      mode: model.isCommitted && model.isCommitted(inv) ? "commit" : "draft"
    });
    if (!saved.ok) {
      blank.error = saved.error || "Could not clear the workspace.";
      return blank;
    }
    return {
      ok: true,
      investigationId: inv.investigationId,
      cleared: true,
      error: ""
    };
  }

  function objectDisposition(objectType, objectId, skip) {
    adoptDisk();
    var rec = null;
    var type = String(objectType || "").toUpperCase();
    if (type === "PERSON") {
      rec = state.people[objectId];
    } else if (type === "VEHICLE") {
      rec = state.vehicles[objectId];
    } else if (type === "LOCATION") {
      rec = state.locations[objectId];
    } else if (type === "BUSINESS") {
      rec = state.businesses[objectId];
    } else if (type === "ENTITY") {
      rec = state.entities[objectId];
    }
    var caseSubject = type === "PERSON" && objectIsCaseSubject(objectId);
    var protection = stage5DeleteProtection(objectType, objectId, skip);
    var referenced = objectIsReferenced(objectType, objectId, skip);
    var archived = !!(rec && rec.meta && rec.meta.archivedAt);
    return {
      junked: isJunked(rec) || archived,
      archived: archived,
      caseSubject: caseSubject,
      referenced: referenced,
      canJunk: !!rec && !isJunked(rec) && !archived && !caseSubject,
      canDelete: !!rec && !caseSubject && protection.ok,
      dependencies: protection.dependencies,
      error: protection.ok ? "" : protection.error
    };
  }

  function junkInvestigationObject(investigationId, nodeId) {
    var blank = { ok: false, objectId: "", objectType: "", error: "" };
    var fresh = adoptDisk();
    if (!fresh.ok) { blank.error = fresh.error; return blank; }
    var inv = state.investigations[investigationId];
    var node = inv && (inv.nodes || []).filter(function (row) { return row && row.nodeId === nodeId; })[0];
    if (!node) { blank.error = "Focus an existing object to archive it."; return blank; }
    var archived = archiveRecord(node.objectType, node.objectId, { reason: "Archived from investigation " + investigationId + "." });
    archived.objectType = node.objectType;
    archived.objectId = node.objectId;
    return archived;
  }

  function deleteInvestigationObject(investigationId, nodeId) {
    var blank = { ok: false, objectId: "", objectType: "", error: "" };
    var fresh = adoptDisk();
    if (!fresh.ok) { blank.error = fresh.error; return blank; }
    var inv = state.investigations[investigationId];
    var node = inv && (inv.nodes || []).filter(function (row) { return row && row.nodeId === nodeId; })[0];
    if (!node) { blank.error = "Focus an existing object to delete it."; return blank; }
    if (inv.meta && inv.meta.archivedAt) { blank.error = "This investigation is archived."; return blank; }
    var checked = stage5DeleteProtection(node.objectType, node.objectId, { investigationId: investigationId, nodeId: nodeId });
    checked.objectType = node.objectType;
    checked.objectId = node.objectId;
    if (!checked.ok) { return checked; }
    var previous = clone(state);
    var label = investigationObjectLabel(node.objectType, node.objectId) || "object";
    stripObjectFromInvestigation(inv, node.objectType, node.objectId);
    appendSystemNote(inv, "Deleted " + label + ".");
    delete state[stage5Collections[stage5Type(node.objectType)]][node.objectId];
    inv.meta = inv.meta || {};
    inv.meta.updatedAt = model.nowIso ? model.nowIso() : new Date().toISOString();
    if (!writeDisk()) {
      state = previous; checked.ok = false;
      checked.error = "Could not delete the object. Existing records were preserved.";
    }
    return checked;
  }

  function objectKey(type, id) {
    return String(type || "") + "|" + String(id || "");
  }

  function spawnInvestigation(parentId, opts) {
    opts = opts || {};
    var blank = {
      ok: false,
      investigationId: "",
      parentInvestigationId: parentId || "",
      error: ""
    };
    var fresh = adoptDisk();
    if (!fresh.ok) {
      blank.error = fresh.error;
      return blank;
    }
    var parent = state.investigations[parentId]
      ? clone(state.investigations[parentId])
      : null;
    if (!parent) {
      blank.error = "Investigation not found.";
      return blank;
    }
    var focus = null;
    var i;
    for (i = 0; i < (parent.nodes || []).length; i++) {
      if (parent.nodes[i] && parent.nodes[i].nodeId === parent.focusNodeId) {
        focus = parent.nodes[i];
        break;
      }
    }
    if (!focus) {
      blank.error = "Focus an object to spawn a child investigation.";
      return blank;
    }
    var seed = {};
    seed[objectKey(focus.objectType, focus.objectId)] = true;
    (parent.links || []).forEach(function (link) {
      if (!link || !link.from || !link.to) {
        return;
      }
      var fromKey = objectKey(link.from.type, link.from.id);
      var toKey = objectKey(link.to.type, link.to.id);
      var focusKey = objectKey(focus.objectType, focus.objectId);
      if (fromKey === focusKey) {
        seed[toKey] = true;
      }
      if (toKey === focusKey) {
        seed[fromKey] = true;
      }
    });
    var nodes = [];
    var focusNodeId = "";
    (parent.nodes || []).forEach(function (row) {
      if (!row || !seed[objectKey(row.objectType, row.objectId)]) {
        return;
      }
      var node = model.createInvestigationNode
        ? model.createInvestigationNode({
            objectType: row.objectType,
            objectId: row.objectId,
            x: typeof row.x === "number" ? row.x : 48,
            y: typeof row.y === "number" ? row.y : 48
          })
        : {
            nodeId: model.newId("node"),
            objectType: row.objectType,
            objectId: row.objectId,
            x: typeof row.x === "number" ? row.x : 48,
            y: typeof row.y === "number" ? row.y : 48
          };
      nodes.push(node);
      if (
        row.objectType === focus.objectType &&
        row.objectId === focus.objectId
      ) {
        focusNodeId = node.nodeId;
      }
    });
    var links = [];
    (parent.links || []).forEach(function (row) {
      if (!row || !row.from || !row.to) {
        return;
      }
      if (!seed[objectKey(row.from.type, row.from.id)]) {
        return;
      }
      if (!seed[objectKey(row.to.type, row.to.id)]) {
        return;
      }
      var link = model.createLink
        ? model.createLink({
            from: { type: row.from.type, id: row.from.id },
            to: { type: row.to.type, id: row.to.id },
            reasons: (row.reasons || []).slice(),
            notes: row.notes || "",
            label: row.label || "",
            otherType: row.otherType || row.to.type,
            associationId: row.associationId || ""
          })
        : {
            linkId: model.newId("link"),
            associationId: row.associationId || "",
            from: { type: row.from.type, id: row.from.id },
            to: { type: row.to.type, id: row.to.id },
            reasons: (row.reasons || []).slice(),
            notes: row.notes || "",
            label: row.label || "",
            otherType: row.otherType || row.to.type
          };
      if (!link.associationId) {
        citeWallAssociation(
          link,
          row.from.type,
          row.from.id,
          row.to.type,
          row.to.id,
          (row.reasons && row.reasons[0]) || row.reason || "",
          parent.investigationId
        );
      }
      links.push(link);
    });
    var kind = opts.kind || parent.kind || "tag";
    var child = model.createInvestigation
      ? model.createInvestigation({
          kind: kind,
          mode: opts.mode || (kind === "tag" ? parent.mode : "") || "",
          team: parent.team,
          parentInvestigationId: parent.investigationId,
          sourceLeadId: parent.sourceLeadId || "",
          assignedOfficerId: parent.assignedOfficerId || "",
          title:
            opts.title != null
              ? opts.title
              : investigationObjectLabel(focus.objectType, focus.objectId),
          nodes: nodes,
          links: links,
          plates: [],
          focusNodeId: focusNodeId,
          existingIds: Object.keys(state.investigations)
        })
      : {
          investigationId: model.newId("inv"),
          parentInvestigationId: parent.investigationId,
          kind: kind,
          nodes: nodes,
          links: links,
          plates: [],
          focusNodeId: focusNodeId,
          history: []
        };
    var label = investigationObjectLabel(focus.objectType, focus.objectId);
    appendSystemNote(
      child,
      "Spawned from " + parent.investigationId + " focusing " + label + "."
    );
    var savedChild = saveInvestigation(child, { mode: "draft" });
    if (!savedChild.ok) {
      blank.error = savedChild.error || "Could not save the child investigation.";
      return blank;
    }
    appendSystemNote(
      parent,
      "Spawned child " + child.investigationId + " focusing " + label + "."
    );
    saveInvestigation(parent, {
      mode: model.isCommitted && model.isCommitted(parent) ? "commit" : "draft"
    });
    return {
      ok: true,
      investigationId: child.investigationId,
      parentInvestigationId: parent.investigationId,
      nodeCount: nodes.length,
      error: ""
    };
  }

  function promoteInvestigationPlate(investigationId, plateId, opts) {
    var fresh = adoptDisk();
    if (!fresh.ok) {
      return { ok: false, vehicleId: "", nodeId: "", error: fresh.error };
    }
    var inv = state.investigations[investigationId]
      ? clone(state.investigations[investigationId])
      : null;
    if (!inv) {
      return {
        ok: false,
        vehicleId: "",
        nodeId: "",
        error: "Investigation not found."
      };
    }
    var plate = null;
    var i;
    for (i = 0; i < (inv.plates || []).length; i++) {
      if (inv.plates[i] && inv.plates[i].plateId === plateId) {
        plate = inv.plates[i];
        break;
      }
    }
    if (!plate) {
      return { ok: false, vehicleId: "", nodeId: "", error: "Plate not found." };
    }
    if (plate.status === "discarded") {
      return {
        ok: false,
        vehicleId: "",
        nodeId: "",
        error: "Discarded plates cannot be promoted."
      };
    }
    var resolution = resolveObjectRecord("VEHICLE", {
      objectId: plate.vehicleId || (opts && opts.objectId) || "",
      licensePlate: plate.plate,
      plateState: plate.state || "",
      createNew: !!(opts && opts.createNew)
    });
    if (!resolution.ok) { return { ok: false, vehicleId: "", nodeId: "", code: resolution.code, candidates: resolution.candidates, error: resolution.error }; }
    var vehicle = resolution.record;
    var vehicleId = vehicle.vehicleId || vehicle.id;
    opts = opts || {};
    var node = ensureInvestigationNode(inv, "VEHICLE", vehicleId, {
      x: typeof opts.x === "number" ? opts.x : undefined,
      y: typeof opts.y === "number" ? opts.y : undefined
    });
    if (typeof opts.x === "number") {
      node.x = opts.x;
    } else if (typeof node.x !== "number") {
      node.x = 48;
    }
    if (typeof opts.y === "number") {
      node.y = opts.y;
    } else if (typeof node.y !== "number") {
      node.y = 48;
    }
    plate.status = "promoted";
    plate.vehicleId = vehicleId;
    inv.focusNodeId = node.nodeId;
    var plateLabel = [plate.state, plate.plate].filter(Boolean).join(" ");
    appendSystemNote(inv, "Promoted plate " + plateLabel + " to a vehicle.");
    var savedInv = saveInvestigation(inv, {
      mode: model.isCommitted && model.isCommitted(inv) ? "commit" : "draft"
    });
    if (!savedInv.ok) {
      return {
        ok: false,
        vehicleId: vehicleId,
        nodeId: node.nodeId,
        error: savedInv.error || "Could not update the investigation."
      };
    }
    return {
      ok: true,
      vehicleId: vehicleId,
      nodeId: node.nodeId,
      existing: Boolean(plate.vehicleId && plate.status === "promoted"),
      error: ""
    };
  }

  function listEncounters() {
    return Object.keys(state.encounters)
      .map(function (id) {
        var row = state.encounters[id];
        return {
          encounterId: id,
          startedAt: row.startedAt || "",
          updatedAt: (row.meta && row.meta.updatedAt) || "",
          metaStatus: model.metaStatus ? model.metaStatus(row) : "committed",
          markedComplete: !!(row.meta && row.meta.markedComplete),
          completedAt: (row.meta && row.meta.completedAt) || "",
          subjects: Array.isArray(row.subjects) ? row.subjects.slice() : [],
          vehicles: (row.vehicles || []).slice(),
          locations: (row.locations || []).slice()
        };
      })
      .sort(function (a, b) {
        return String(b.updatedAt).localeCompare(String(a.updatedAt));
      });
  }

  // Stage 5: dependency inspection uses stored identifiers, including historical
  // snapshots. It never repairs records or guesses identity from display text.
  function stage5Type(type) {
    var value = String(type || "").trim().toUpperCase();
    return ({ CASE: "LEAD", ADDRESS: "LOCATION", BOOKIN: "BOOKING", PHOTO: "MEDIA" })[value] || value;
  }

  var stage5Collections = {
    PERSON: "people", LEAD: "leads", ENCOUNTER: "encounters",
    INVESTIGATION: "investigations", VEHICLE: "vehicles", LOCATION: "locations",
    BUSINESS: "businesses", ENTITY: "entities", ASSOCIATION: "associations", OPERATION: "operations"
  };
  var stage5IdFields = {
    PERSON: ["personId", "personIds", "subjectPersonId", "targetPersonId", "ownerPersonId"],
    LEAD: ["leadId", "leadIds", "caseId", "caseIds", "sourceLeadId", "parentLeadId"],
    ENCOUNTER: ["encounterId", "encounterIds", "sourceEncounterId"],
    INVESTIGATION: ["investigationId", "investigationIds", "parentInvestigationId", "sourceInvestigationId"],
    VEHICLE: ["vehicleId", "vehicleIds", "assignedVehicleId", "fleetVehicleId"],
    LOCATION: ["locationId", "locationIds", "addressId", "addressIds", "arrestLocationId", "targetLocationId", "centerLocationId"],
    BUSINESS: ["businessId", "businessIds"], ENTITY: ["entityId", "entityIds"],
    OPERATION: ["operationId", "operationIds", "opId"],
    ASSOCIATION: ["associationId", "associationIds"],
    OFFICER: ["officerId", "officerIds", "assignedOfficerId", "primaryOfficerId", "arrestingOfficerId", "caseOfficerId"],
    BOOKING: ["bookingId", "bookingIds", "bookinRecordId", "bookinRecordIds", "voidedBookingId"],
    ENCOUNTER_SUBJECT: ["subjectId", "subjectIds", "focusSubjectId", "encounterParticipantId"],
    MEDIA: ["mediaId", "mediaIds", "photoId", "photoIds", "primaryPhotoId", "primaryMediaId", "headshotMediaId", "photoMediaId", "attachmentId", "attachmentIds"]
  };

  function stage5Object(value) {
    return !!value && typeof value === "object" && !Array.isArray(value);
  }

  function stage5DependencyScan(type, id, data, skip) {
    type = stage5Type(type);
    id = storeSubjectText(id);
    skip = skip || {};
    var result = { ok: true, type: type, id: id, dependencies: [], error: "" };
    var seen = Object.create(null);
    var fields = stage5IdFields[type];
    if (!fields || !id) {
      result.ok = false;
      result.error = "A supported object type and identifier are required.";
      return result;
    }
    function add(store, recordType, recordId, path, reason) {
      var key = [store, recordType, recordId, path].join("|");
      if (seen[key]) { return; }
      seen[key] = true;
      result.dependencies.push({ store: store, recordType: recordType, recordId: String(recordId || ""), path: path, reason: reason || "Stored reference" });
    }
    function walk(value, path, store, recordType, recordId, depth) {
      if (!value || typeof value !== "object") { return; }
      if (depth > 80) { throw new Error("Dependency data is too deeply nested to verify."); }
      if (Array.isArray(value)) {
        value.forEach(function (row, index) { walk(row, path + "[" + index + "]", store, recordType, recordId, depth + 1); });
        return;
      }
      if (recordType === "INVESTIGATION" && String(recordId) === String(skip.investigationId || "") &&
          value.nodeId && value.nodeId === skip.nodeId && /\.nodes\[\d+\]$/.test(path)) { return; }
      var endpointType = stage5Type(value.type || value.objectType || value.entityType || value.ownerType);
      if (endpointType === type) {
        ["id", "objectId", "ownerId"].forEach(function (field) {
          if (storeSubjectText(value[field]) === id) { add(store, recordType, recordId, path + "." + field); }
        });
      }
      Object.keys(value).forEach(function (field) {
        var next = value[field];
        if (fields.indexOf(field) !== -1) {
          if (Array.isArray(next)) {
            next.forEach(function (reference, index) {
              if (typeof reference !== "object" && storeSubjectText(reference) === id) { add(store, recordType, recordId, path + "." + field + "[" + index + "]"); }
            });
          } else if (typeof next !== "object" && storeSubjectText(next) === id) {
            add(store, recordType, recordId, path + "." + field);
          }
        }
        walk(next, path + "." + field, store, recordType, recordId, depth + 1);
      });
    }
    try {
      if (!stage5Object(data)) { throw new Error("Workspace storage is malformed."); }
      Object.keys(stage5Collections).forEach(function (recordType) {
        var collection = stage5Collections[recordType];
        if (data[collection] === undefined) { return; }
        if (!stage5Object(data[collection])) { throw new Error("Workspace " + collection + " storage is malformed."); }
        Object.keys(data[collection]).forEach(function (recordId) {
          var record = data[collection][recordId];
          if (!stage5Object(record)) { throw new Error("Workspace " + collection + " record " + recordId + " is malformed."); }
          if (recordType === type && recordId === id) { return; }
          walk(record, collection + "." + recordId, STORAGE_KEY, recordType, recordId, 0);
        });
      });
      var sources = [
        { id: "bookin", key: "alien-book-in.saved-records.v1", medium: "localStorage" },
        { id: "admin", key: "copdoc.admin.v1", medium: "localStorage" },
        { id: "bookingTransactions", key: "copdocx.booking-transactions.v1", medium: "localStorage" },
        { id: "importTransactions", key: "copdocx.import-transactions.v1", medium: "localStorage" }
      ];
      if (root.config && Array.isArray(root.config.storageEntries)) {
        root.config.storageEntries.forEach(function (entry) {
          if (entry.id !== "workspace" && (entry.medium === "localStorage" || entry.medium === "sessionStorage") &&
              sources.every(function (source) { return source.id !== entry.id; })) { sources.push(entry); }
        });
      }
      sources.forEach(function (source) {
        var key = root.config && root.config.storageKey(source.id) || source.key;
        var raw = storageRaw(source.medium, key);
        if (raw === null) { return; }
        // These preferences are deliberately plain text, not record containers.
        if (["mapBasemap", "importDoneSignal"].indexOf(source.id) !== -1) { return; }
        var value;
        try { value = JSON.parse(raw); } catch (parseError) { throw new Error("Cannot verify dependencies in " + key + "."); }
        if (source.id === "bookin") {
          if (!Array.isArray(value)) { throw new Error("Book-In storage is malformed."); }
          value.forEach(function (row, index) {
            if (!stage5Object(row) || !storeSubjectText(row.id)) { throw new Error("Book-In record identity is malformed."); }
            if (type === "BOOKING" && storeSubjectText(row.id) === id) { return; }
            walk(row, "records[" + index + "]", key, "BOOKING", row.id, 0);
          });
        } else if (source.id === "bookingTransactions") {
          if (!stage5Object(value) || !stage5Object(value.transactions)) { throw new Error("Booking recovery journal is malformed."); }
          Object.keys(value.transactions).forEach(function (transactionId) {
            walk(value.transactions[transactionId], "transactions." + transactionId, key, "BOOKING_TRANSACTION", transactionId, 0);
          });
        } else if (source.id === "importTransactions") {
          if (!stage5Object(value) || value.schema !== "copdocx.import-transactions.v1" || value.version !== 1 || !stage5Object(value.transactions)) { throw new Error("Import recovery journal is malformed."); }
          Object.keys(value.transactions).forEach(function (transactionId) {
            var entry = value.transactions[transactionId];
            if (!stage5Object(entry) || entry.transactionId !== transactionId ||
                ["PENDING", "APPLYING", "ROLLING_BACK", "COMPLETED", "ROLLED_BACK"].indexOf(entry.status) === -1 ||
                !Number.isInteger(entry.revision) || entry.revision < 0 || !Array.isArray(entry.appliedKeys) || !Array.isArray(entry.mediaCreated) ||
                typeof entry.mediaPrepared !== "boolean" || !stage5Object(entry.plan) || entry.plan.ok !== true || !Array.isArray(entry.plan.changes) ||
                entry.media !== undefined && !Array.isArray(entry.media)) { throw new Error("Import recovery entry is malformed."); }
            if (entry.status === "COMPLETED" || entry.status === "ROLLED_BACK") { return; }
            walk(entry, "importTransactions.transactions." + transactionId, key, "IMPORT_TRANSACTION", transactionId, 0);
          });
        } else if (source.id === "admin") {
          if (!stage5Object(value)) { throw new Error("Admin storage is malformed."); }
          ["officers", "vehicles", "shifts"].forEach(function (collection) {
            if (value[collection] !== undefined && !Array.isArray(value[collection])) {
              throw new Error("Admin " + collection + " storage is malformed.");
            }
          });
          Object.keys(value).forEach(function (collection) {
            var entries = value[collection];
            if (Array.isArray(entries)) {
              entries.forEach(function (row, index) {
                var recordType = collection === "officers" ? "OFFICER" : collection === "vehicles" ? "FLEET_VEHICLE" : "ADMIN";
                var recordId = row && (row.officerId || row.vehicleId || row.id) || String(index);
                if (recordType === type && String(recordId) === id) { return; }
                walk(row, collection + "[" + index + "]", key, recordType, recordId, 0);
              });
            } else { walk(entries, collection, key, "ADMIN", collection, 0); }
          });
        } else { walk(value, source.id, key, source.id.toUpperCase(), source.id, 0); }
      });
    } catch (error) {
      result.ok = false;
      result.error = String(error.message || error) + " Existing records were preserved.";
    }
    result.dependencies.sort(function (a, b) {
      return [a.store, a.recordType, a.recordId, a.path].join("|").localeCompare([b.store, b.recordType, b.recordId, b.path].join("|"));
    });
    return result;
  }

  function dependenciesFor(type, id) {
    var disk = readDisk();
    if (!disk.ok) { return { ok: false, type: stage5Type(type), id: storeSubjectText(id), dependencies: [], error: disk.error }; }
    return stage5DependencyScan(type, id, disk.data || state);
  }

  function stage5DependencyError(result) {
    var labels = [];
    (result.dependencies || []).forEach(function (row) {
      var label = row.recordType + " " + row.recordId;
      if (labels.indexOf(label) === -1) { labels.push(label); }
    });
    return "Cannot delete: referenced by " + labels.join(", ") + ". Archive the record or review these dependencies.";
  }

  function stage5DeleteProtection(type, id, skip) {
    type = stage5Type(type);
    var inspection = stage5DependencyScan(type, id, state, skip);
    if (!inspection.ok) { inspection.code = "DEPENDENCIES_UNVERIFIED"; return inspection; }
    if (inspection.dependencies.length) {
      inspection.ok = false;
      inspection.code = "DEPENDENCIES_EXIST";
      inspection.error = stage5DependencyError(inspection);
      return inspection;
    }
    var row = state[stage5Collections[type]] && state[stage5Collections[type]][id];
    var historic = row && (row.meta && (row.meta.status !== "draft" || row.meta.committedAt || row.meta.markedComplete || row.meta.completedAt || row.meta.archivedAt) ||
      !row.meta || row.voidedAt || (Array.isArray(row.arrests) && row.arrests.length) || (Array.isArray(row.encounters) && row.encounters.length) ||
      (Array.isArray(row.warrants) && row.warrants.length) || (Array.isArray(row.documents) && row.documents.length) ||
      (Array.isArray(row.narratives) && row.narratives.length) || (Array.isArray(row.subjectIdentityHistory) && row.subjectIdentityHistory.length) ||
      (Array.isArray(row.bookingIdentityHistory) && row.bookingIdentityHistory.length));
    if (historic) {
      inspection.ok = false;
      inspection.code = "RECORD_FILED";
      inspection.dependencies.push({ store: STORAGE_KEY, recordType: type, recordId: String(id), path: "meta", reason: "Filed or historical record" });
      inspection.error = "Cannot delete " + type + " " + id + ": filed or historical records must be archived.";
    }
    return inspection;
  }

  function archiveRecord(type, id, input) {
    type = stage5Type(type);
    id = storeSubjectText(id);
    input = input || {};
    var result = { ok: false, type: type, id: id, dependencies: [], error: "" };
    var reason = storeSubjectText(input.reason);
    if (!stage5Collections[type] || !id || !reason) { result.error = "An object type, identifier, and archive reason are required."; return result; }
    var fresh = adoptDisk();
    if (!fresh.ok) { result.error = fresh.error; return result; }
    var row = state[stage5Collections[type]] && state[stage5Collections[type]][id];
    if (!row) { result.error = "Record not found."; return result; }
    var inspection = stage5DependencyScan(type, id, state);
    if (!inspection.ok) { return inspection; }
    result.dependencies = inspection.dependencies;
    if (row.meta && row.meta.archivedAt) {
      result.ok = true; result.archivedAt = row.meta.archivedAt; result.alreadyArchived = true; return result;
    }
    var previous = clone(state);
    var now = model.nowIso ? model.nowIso() : new Date().toISOString();
    row.meta = row.meta || {};
    row.meta.archivedAt = now;
    row.meta.archiveReason = reason;
    row.meta.updatedAt = now;
    if (type === "ENCOUNTER") { row.meta.encounterRevision = Number(row.meta.encounterRevision || 0) + 1; }
    if (!writeDisk()) { state = previous; result.error = "Could not persist the archive. Existing records were preserved."; return result; }
    result.ok = true; result.archivedAt = now;
    return result;
  }

  function voidBookingProjection(input, options) {
    input = input || {};
    options = options || {};
    var validateOnly = input.validateOnly === true || options.validateOnly === true;
    var bookingId = storeSubjectText(input.bookingId);
    var transactionId = storeSubjectText(input.transactionId);
    var reason = storeSubjectText(input.reason);
    var result = { ok: false, bookingId: bookingId, dependencies: [], error: "", alreadyVoided: false };
    function fail(code, message) { result.code = code; result.error = message; return result; }
    if (!bookingId || !reason || (!transactionId && !validateOnly)) {
      return fail("BOOKING_VOID_INPUT", "Booking, void transaction, and reason are required.");
    }
    var resolved = resolveBookInBooking(bookingId);
    if (!resolved.ok || !resolved.found) { return fail("BOOKING_VOID_IDENTITY", resolved.error || "The booking has no canonical Arrest to void."); }
    var conflict = ["personId", "leadId", "arrestId", "subjectId", "encounterId"].some(function (field) {
      result[field] = resolved[field];
      return Object.prototype.hasOwnProperty.call(input, field) && storeSubjectText(input[field]) !== storeSubjectText(resolved[field]);
    });
    if (conflict) { return fail("BOOKING_VOID_IDENTITY", "Supplied identifiers disagree with the canonical booking ownership."); }
    var fresh = adoptDisk();
    if (!fresh.ok) { return fail("BOOKING_VOID_UNVERIFIED", fresh.error); }
    var inspection = stage5DependencyScan("BOOKING", bookingId, state);
    if (!inspection.ok) { return fail("BOOKING_VOID_UNVERIFIED", inspection.error); }
    var person = state.people[resolved.personId];
    var lead = state.leads[resolved.leadId];
    var arrest = (person.arrests || []).filter(function (row) { return row.arrestId === resolved.arrestId; })[0];
    if (!arrest) { return fail("BOOKING_VOID_IDENTITY", "The canonical Arrest disappeared before voiding."); }
    if (arrest.voidedAt) {
      if (arrest.voidTransactionId !== transactionId || arrest.voidReason !== reason) {
        return fail("BOOKING_ALREADY_VOIDED", "This booking was already voided by a different command. Its audit history was preserved.");
      }
      result.ok = true; result.alreadyVoided = true;
      result.voidedAt = arrest.voidedAt; result.voidReason = arrest.voidReason;
      result.voidTransactionId = arrest.voidTransactionId;
      return result;
    }
    try {
      var journalKey = root.config && root.config.storageKey("bookingTransactions") || "copdocx.booking-transactions.v1";
      var journalRaw = storageRaw("localStorage", journalKey);
      var journalRows = journalRaw ? JSON.parse(journalRaw).transactions : {};
      Object.keys(journalRows || {}).forEach(function (id) {
        var command = journalRows[id];
        if (command && storeSubjectText(command.bookingId) === bookingId && command.status !== "COMPLETED" && id !== transactionId) {
          result.dependencies.push({ store: journalKey, recordType: "BOOKING_TRANSACTION", recordId: id, path: "transactions." + id, reason: "Unfinished booking command" });
        }
      });
    } catch (journalError) { return fail("BOOKING_VOID_UNVERIFIED", "Cannot verify pending booking commands."); }
    var encounter = resolved.encounterId ? state.encounters[resolved.encounterId] : null;
    var subject = null;
    if (resolved.encounterId || resolved.subjectId) {
      if (!encounter || !Array.isArray(encounter.subjects)) { return fail("BOOKING_VOID_IDENTITY", "The booking Encounter or subject roster is missing."); }
      var subjects = encounter.subjects.filter(function (row) { return storeSubjectId(row) === resolved.subjectId; });
      if (subjects.length !== 1 || storeSubjectText(subjects[0].personId) !== resolved.personId ||
          (storeSubjectText(subjects[0].leadId) && storeSubjectText(subjects[0].leadId) !== resolved.leadId)) {
        return fail("BOOKING_VOID_IDENTITY", "The booking has no exact Encounter subject owner.");
      }
      subject = subjects[0];
      var bookingClaims = [subject.bookingId, subject.bookinRecordId].map(storeSubjectText).filter(function (value, index, values) { return value && values.indexOf(value) === index; });
      if (bookingClaims.length !== 1 || bookingClaims[0] !== bookingId) { return fail("BOOKING_VOID_IDENTITY", "The subject booking link has changed. Review it before voiding."); }
      if (encounter.meta && (encounter.meta.markedComplete || encounter.meta.archivedAt)) {
        result.dependencies.push({ store: STORAGE_KEY, recordType: "ENCOUNTER", recordId: encounter.encounterId, path: "encounters." + encounter.encounterId + ".meta", reason: "Completed or archived Encounter" });
      }
      function finalized(value, path) {
        if (!value || typeof value !== "object") { return; }
        if (value.workflowStatus === "FINALIZED") {
          result.dependencies.push({ store: STORAGE_KEY, recordType: "NARRATIVE", recordId: value.narrativeId || value.id || encounter.encounterId,
            path: path, reason: "Finalized narrative depends on the Encounter source" });
          return;
        }
        Object.keys(value).forEach(function (key) { finalized(value[key], path + "." + key); });
      }
      finalized(encounter.narratives, "encounters." + encounter.encounterId + ".narratives");
      finalized(encounter.narrativesInitial, "encounters." + encounter.encounterId + ".narrativesInitial");
    }
    if (result.dependencies.length) {
      return fail("BOOKING_VOID_DEPENDENCIES", "Cannot void booking: " + result.dependencies.map(function (row) {
        return row.recordType + " " + row.recordId + " (" + row.reason + ")";
      }).join(", ") + ".");
    }
    result.voidedAt = storeSubjectText(input.voidedAt) || (model.nowIso ? model.nowIso() : new Date().toISOString());
    result.voidReason = reason; result.voidTransactionId = transactionId;
    if (validateOnly) { result.ok = true; return result; }
    var previous = clone(state);
    var audit = { bookingId: bookingId, voidedAt: result.voidedAt, reason: reason, transactionId: transactionId };
    function markArrest(row) {
      if (row && row.arrestId === resolved.arrestId) {
        row.voidedAt = result.voidedAt; row.voidReason = reason; row.voidTransactionId = transactionId;
      }
    }
    (person.arrests || []).forEach(markArrest);
    var leadPerson = model.subjectOf ? model.subjectOf(lead) : lead.person;
    (leadPerson && leadPerson.arrests || []).forEach(markArrest);
    [person, leadPerson].forEach(function (row) {
      (row && row.encounters || []).forEach(function (event) {
        if (event && storeSubjectText(event.encounterId) === resolved.encounterId &&
            (storeSubjectId(event) === resolved.subjectId || storeSubjectBookingId(event) === bookingId)) { event.bookingVoid = clone(audit); }
      });
    });
    lead.history = Array.isArray(lead.history) ? lead.history : [];
    lead.history.forEach(function (row) {
      if (storeSubjectBookingId(row) === bookingId) { row.voidedAt = result.voidedAt; row.voidReason = reason; row.voidTransactionId = transactionId; }
    });
    lead.history.push({ type: "BOOKING_VOIDED", eventId: "booking_void_" + transactionId, voidedBookingId: bookingId,
      arrestId: resolved.arrestId, subjectId: resolved.subjectId, encounterId: resolved.encounterId,
      voidedAt: result.voidedAt, voidReason: reason, voidTransactionId: transactionId });
    if (subject) {
      var retired = clone(subject);
      retired.bookingUnlinked = true; retired.removedAt = result.voidedAt; retired.bookingVoid = clone(audit);
      encounter.bookingIdentityHistory = Array.isArray(encounter.bookingIdentityHistory) ? encounter.bookingIdentityHistory : [];
      encounter.bookingIdentityHistory.push(retired);
      subject.bookingId = ""; subject.bookinRecordId = "";
      subject.packetFiledAt = ""; subject.docsGeneratedAt = ""; subject.bookingVoid = clone(audit);
      encounter.meta = encounter.meta || {}; encounter.meta.updatedAt = result.voidedAt;
      encounter.meta.encounterRevision = Number(encounter.meta.encounterRevision || 0) + 1;
    }
    if (!writeDisk()) { state = previous; return fail("BOOKING_VOID_WRITE_FAILED", "Could not persist the void. Existing records were preserved."); }
    result.ok = true;
    return result;
  }

  model.store = {
    withImportWorkspace: withImportWorkspace,
    validateImportWorkspace: validateImportWorkspace,
    projectImportedBaseballCard: projectImportedBaseballCard,
    stageImportedObjectRecord: stageImportedObjectRecord,
    stageImportedBookingProjections: stageImportedBookingProjections,
    validateImportedVoidedBooking: validateImportedVoidedBooking,
    voidBookingProjection: voidBookingProjection,
    dependenciesFor: dependenciesFor,
    archiveRecord: archiveRecord,
    STORAGE_KEY: STORAGE_KEY,
    loadFromDisk: loadFromDisk,
    saveLead: saveLead,
    getLead: getLead,
    listLeads: listLeads,
    listArrests: listArrests,
    relatedCommittedCases: relatedCommittedCases,
    promoteAssociateToCase: atomicWorkspaceMutation(promoteAssociateToCase),
    promoteInvestigationPersonToCase: atomicWorkspaceMutation(promoteInvestigationPersonToCase),
    promoteBookInToLead: promoteBookInToLead,
    bookInPromotionInput: bookInPromotionInput,
    promoteBookInRecord: promoteBookInRecord,
    resolveBookInBooking: resolveBookInBooking,
    promoteBookInRecords: promoteBookInRecords,
    linkEncounterVehiclesToPerson: linkEncounterVehiclesToPerson,
    allPeople: allPeople,
    getPerson: getPerson,
    upsertPerson: upsertPerson,
    normalizeEncounterSubject: normalizeEncounterSubjectForStore,
    normalizeEncounterSubjects: normalizeEncounterSubjectsForStore,
    mergeEncounterSubjects: mergeEncounterSubjectsForStore,
    validateEncounterSubjectRoster: validateEncounterSubjectRoster,
    saveEncounter: saveEncounter,
    saveEncounterWithObjects: atomicWorkspaceMutation(saveEncounterWithObjects),
    unlinkEncounterSubjectBooking: unlinkEncounterSubjectBooking,
    updateEncounter: updateEncounter,
    unlockEncounter: unlockEncounter,
    completeEncounter: completeEncounter,
    applyEncounterLocationToArrests: applyEncounterLocationToArrests,
    getEncounter: getEncounter,
    deleteEncounter: deleteEncounter,
    listEncounters: listEncounters,
    saveInvestigation: saveInvestigation,
    getInvestigation: getInvestigation,
    listInvestigations: listInvestigations,
    deleteInvestigation: deleteInvestigation,
    saveOperation: saveOperation,
    getOperation: getOperation,
    listOperations: listOperations,
    deleteOperation: deleteOperation,
    listImportableOperationTargets: listImportableOperationTargets,
    addOperationTargets: addOperationTargets,
    removeOperationTarget: removeOperationTarget,
    importOperationTeam: importOperationTeam,
    setOperationMemberRole: setOperationMemberRole,
    assignOperationTargetTeam: assignOperationTargetTeam,
    removeOperationTeam: removeOperationTeam,
    setOperationTeamVehicle: setOperationTeamVehicle,
    setOperationMemberStart: setOperationMemberStart,
    setOperationMemberHeading: setOperationMemberHeading,
    setOperationMemberField: setOperationMemberField,
    addOperationLocation: addOperationLocation,
    removeOperationLocation: removeOperationLocation,
    addMedevacRoutePoint: addMedevacRoutePoint,
    saveVehicleRecord: saveVehicleRecord,
    getVehicleRecord: getVehicleRecord,
    findVehicleByPlate: findVehicleByPlate,
    saveLocationRecord: saveLocationRecord,
    getLocationRecord: getLocationRecord,
    findLocationByAddress: findLocationByAddress,
    saveBusinessRecord: saveBusinessRecord,
    getBusinessRecord: getBusinessRecord,
    findBusinessByName: findBusinessByName,
    saveEntityRecord: saveEntityRecord,
    getEntityRecord: getEntityRecord,
    findEntityByName: findEntityByName,
    findPersonByName: findPersonByName,
    createObjectRecord: createObjectRecord,
    getObjectRecord: getObjectRecord,
    saveObjectRecord: saveObjectRecord,
    resolveObjectRecord: resolveObjectRecord,
    resolveObjectIdentity: resolveObjectIdentity,
    validateObjectWorkspace: validateObjectWorkspace,
    promoteInvestigationPlate: atomicWorkspaceMutation(promoteInvestigationPlate),
    addInvestigationObject: atomicWorkspaceMutation(addInvestigationObject),
    connectInvestigationNodes: connectInvestigationNodes,
    upsertAssociation: upsertAssociation,
    saveAssociationRecord: saveAssociationRecord,
    getAssociation: getAssociation,
    associationsFor: associationsFor,
    occupancyFor: occupancyFor,
    setAssociationReason: setAssociationReason,
    associationIntegrity: associationIntegrity,
    reuseInvestigationIdentity: reuseInvestigationIdentity,
    disconnectInvestigationLink: disconnectInvestigationLink,
    associateInvestigationPerson: atomicWorkspaceMutation(associateInvestigationPerson),
    associateInvestigationObject: atomicWorkspaceMutation(associateInvestigationObject),
    associateCaseObject: atomicWorkspaceMutation(associateCaseObject),
    dropAssociation: dropAssociation,
    retractAssociation: retractAssociation,
    endAssociation: endAssociation,
    reassertAssociation: reassertAssociation,
    removeObjectRelationship: removeObjectRelationship,
    removeCaseLink: removeCaseLink,
    listObjects: listObjects,
    setInvestigationAssociationReason: setInvestigationAssociationReason,
    disconnectInvestigationAssociation: disconnectInvestigationAssociation,
    removeInvestigationObject: removeInvestigationObject,
    clearInvestigationWorkspace: clearInvestigationWorkspace,
    junkInvestigationObject: junkInvestigationObject,
    deleteInvestigationObject: deleteInvestigationObject,
    objectDisposition: objectDisposition,
    isJunked: isJunked,
    investigationIntegrity: investigationIntegrity,
    spawnInvestigation: spawnInvestigation,
    listRelatedInvestigations: function (investigationId) {
      adoptDisk();
      var inv = state.investigations[investigationId];
      if (!inv) {
        return [];
      }
      var out = [];
      if (
        inv.parentInvestigationId &&
        state.investigations[inv.parentInvestigationId]
      ) {
        out.push(clone(state.investigations[inv.parentInvestigationId]));
      }
      Object.keys(state.investigations).forEach(function (id) {
        var row = state.investigations[id];
        if (row && row.parentInvestigationId === investigationId) {
          out.push(clone(row));
        }
      });
      return out;
    },
    getCurrentLeadId: function () {
      return state.currentLeadId || "";
    },
    setCurrentLeadId: function (leadId) {
      var fresh = adoptDisk();
      if (!fresh.ok) {
        return;
      }
      state.currentLeadId = leadId || "";
      if (!writeDisk()) {
        adoptDisk();
      }
    },
    getState: function () {
      return clone(state);
    },
    diskError: function () {
      return diskError;
    }
  };

  if (typeof window !== "undefined" && window.addEventListener) {
    window.addEventListener("storage", function (event) {
      if (event.key !== STORAGE_KEY) {
        return;
      }
      adoptDisk();
    });
  }
})(typeof window !== "undefined" ? window : globalThis);
