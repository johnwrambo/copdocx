/** Admin application commands. UI collectors do not own persistence or lifecycle rules. */
(function (global) {
  "use strict";
  var root = (global.COPDoc = global.COPDoc || {});
  root.application = root.application || {};
  function repo() { return root.repositories.admin; }
  function readAdminStrict() { return repo().read(); }
  function writeAdmin(loaded) { return repo().save(loaded); }
  function plain(row) { return Boolean(row && typeof row === "object" && !Array.isArray(row)); }
  function own(row, key) { return Object.prototype.hasOwnProperty.call(row || {}, key); }
  function text(value) { return String(value == null ? "" : value).trim(); }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
  function fail(error) { return { ok: false, error: error }; }
  function rowId(row, kind) { return text(row && (row[kind === "officers" ? "officerId" : "vehicleId"] || row.id)); }
  function isActive(row) { return Boolean(row && !row.junked && !row.inactive && !row.archivedAt); }
  function isVoided(row) { return Boolean(row && (row.voided || row.voidedAt || String(row.status || "").toUpperCase() === "VOIDED")); }

  function mergePatch(current, patch) {
    var result = clone(current || {});
    Object.keys(patch || {}).forEach(function (field) {
      if (field === "__proto__" || field === "constructor" || field === "prototype" || patch[field] === undefined) { return; }
      result[field] = plain(patch[field]) && plain(result[field]) ? mergePatch(result[field], patch[field]) : clone(patch[field]);
    });
    return result;
  }

  // One Admin-owned create/update contract. Officer and fleet ownership intentionally
  // remains separate from workspace Person and civilian Vehicle ownership.
  function saveRecord(kind, patch, options) {
    options = options || {};
    if (["officers", "vehicles"].indexOf(kind) < 0 || !plain(patch)) { return fail("An officer or fleet record is required."); }
    var loaded = readAdminStrict();
    if (!loaded.ok) { return loaded; }
    var alias = kind === "officers" ? "officerId" : "vehicleId";
    var claims = [patch.id, patch[alias], options.id].filter(function (id) { return id !== undefined && id !== ""; });
    if (claims.some(function (id) { return typeof id !== "string" || !text(id) || id !== text(id) || id !== claims[0]; })) {
      return fail("Admin identity aliases must agree.");
    }
    var id = claims[0] || "";
    var existing = loaded.data[kind].filter(function (row) { return rowId(row, kind) === id; })[0] || null;
    if (options.createOnly && existing) { return fail("That Admin identity already exists. Open it to edit."); }
    if (options.updateOnly && !existing) { return fail("That Admin record no longer exists. Reload before saving."); }
    if (existing && options.expectedRecord) {
      var stale = Object.keys(patch).some(function (field) {
        return ["id", alias, "meta"].indexOf(field) < 0 && !same(existing[field], options.expectedRecord[field]) && !same(existing[field], patch[field]);
      });
      if (stale) { return fail("An edited Admin field changed in another window. Reload before saving."); }
    }
    if (["fieldArrests", "inactive", "archivedAt", "junked", "junkedAt", "voidedAt"].some(function (field) {
      return own(patch, field) && !same(patch[field], existing ? existing[field] : undefined);
    })) { return fail("Historical facts and archive state use their own workflow."); }
    if (["locations", "qualifications", "equipment", "assignedOfficerIds"].some(function (field) {
      return own(patch, field) && !Array.isArray(patch[field]);
    }) || (own(patch, "address") && !plain(patch.address)) || (own(patch, "meta") && !plain(patch.meta))) {
      return fail("Admin object fields have an invalid shape.");
    }
    var model = root.model || {};
    var factory = kind === "officers" ? model.createOfficer : model.createVehicle;
    if (typeof factory !== "function") { return fail("The Admin object factory is unavailable."); }
    var record = mergePatch(existing || {}, patch);
    if (id) { record.id = record[alias] = id; }
    if (kind === "vehicles") {
      if (own(patch, "governmentVehicle") && patch.governmentVehicle !== true) { return fail("Fleet ownership cannot be changed through the Admin form."); }
      if (own(patch, "plate") && own(patch, "licensePlate") && text(patch.plate).toUpperCase() !== text(patch.licensePlate).toUpperCase()) { return fail("Fleet plate aliases must agree."); }
      if (own(patch, "plate") || own(patch, "licensePlate")) { record.plate = record.licensePlate = text(own(patch, "licensePlate") ? patch.licensePlate : patch.plate).toUpperCase(); }
      record.governmentVehicle = true;
      if (own(patch, "assignedOfficerIds") && (!Array.isArray(patch.assignedOfficerIds) || patch.assignedOfficerIds.some(function (officerId) {
        var matches = loaded.data.officers.filter(function (row) { return rowId(row, "officers") === officerId; });
        var retained = existing && (existing.assignedOfficerIds || []).indexOf(officerId) !== -1;
        return typeof officerId !== "string" || officerId !== text(officerId) || matches.length !== 1 || (!retained && (!isActive(matches[0]) || !isCommitted(matches[0])));
      }))) { return fail("New fleet assignments require an active, saved officer."); }
    }
    var retainedPlaces = kind === "officers" && own(patch, "address") ? clone((record.locations || []).slice(1)) : null;
    var clearedAddress = kind === "officers" && own(patch, "address") && !["street", "street2", "city", "state", "zip", "latitude", "longitude", "latLong", "association", "locationAssociation"].some(function (field) { return text(record.address[field]); });
    if (clearedAddress) { record.locations = []; }
    record = factory(record);
    if (retainedPlaces) {
      record.locations = (clearedAddress ? [] : record.locations).concat(retainedPlaces.filter(function (place) {
        return !(record.locations || []).some(function (current) { return place.locationId && current.locationId === place.locationId; });
      }));
    }
    id = rowId(record, kind);
    record.id = record[alias] = id;
    if (!id || (!existing && loaded.data[kind].some(function (row) { return rowId(row, kind) === id; }))) { return fail("The new Admin identity is already in use. Retry creating the record."); }
    var duplicate = loaded.data[kind].filter(function (row) {
      if (rowId(row, kind) === id) { return false; }
      if (kind === "officers") { return text(record.badge) && text(row.badge).toUpperCase() === text(record.badge).toUpperCase(); }
      return (text(record.vin) && text(row.vin).toUpperCase() === text(record.vin).toUpperCase()) ||
        (text(record.licensePlate) && text(record.plateState) && text(row.licensePlate || row.plate).toUpperCase() === text(record.licensePlate).toUpperCase() && text(row.plateState).toUpperCase() === text(record.plateState).toUpperCase());
    });
    if (duplicate.length) { return { ok: false, error: kind === "officers" ? "That badge belongs to an existing officer. Review the existing record." : "That VIN or plate/state belongs to an existing fleet vehicle. Review the existing record.", candidates: duplicate.map(function (row) { return rowId(row, kind); }) }; }
    if (existing) { loaded.data[kind][loaded.data[kind].indexOf(existing)] = record; }
    else { loaded.data[kind].push(record); }
    var saved = writeAdmin(loaded);
    return saved.ok ? { ok: true, error: "", record: clone(record), created: !existing } : saved;
  }

  function isCommitted(row) {
    if (root.model && typeof root.model.isCommitted === "function") {
      return root.model.isCommitted(row);
    }
    return !row || !row.meta || row.meta.status !== "draft";
  }

  function archiveRecord(kind, id, options) {
    options = options || {};
    var loaded = readAdminStrict();
    if (!loaded.ok) { return loaded; }
    if (["officers", "vehicles"].indexOf(kind) < 0) { return fail("Unknown Admin record type."); }
    var row = loaded.data[kind].filter(function (candidate) { return rowId(candidate, kind) === text(id); })[0];
    if (!row) { return fail("Admin record not found."); }
    if (!isActive(row)) { return { ok: true, error: "", alreadyArchived: true, record: clone(row) }; }
    row.inactive = true;
    row.archivedAt = text(options.archivedAt) || new Date().toISOString();
    row.junked = true;
    row.junkedAt = row.archivedAt;
    if (text(options.reason)) { row.archiveReason = text(options.reason); }
    var result = writeAdmin(loaded);
    return result.ok ? { ok: true, error: "", record: clone(row) } : result;
  }

  function restoreRecord(kind, id) {
    var loaded = readAdminStrict();
    if (!loaded.ok) { return loaded; }
    if (["officers", "vehicles"].indexOf(kind) < 0) { return fail("Unknown Admin record type."); }
    var row = loaded.data[kind].filter(function (candidate) { return rowId(candidate, kind) === text(id); })[0];
    if (!row) { return fail("Admin record not found."); }
    row.inactive = false; row.archivedAt = ""; row.junked = false; row.junkedAt = "";
    return writeAdmin(loaded);
  }

  // Reference inspection is intentionally ID-based. Neither names nor badges
  // establish historical ownership. Malformed stores block hard deletion.
  async function inspectDependencies(kind, id) {
    if (["officers", "vehicles"].indexOf(kind) < 0 || !text(id)) { return fail("An Admin identity is required."); }
    id = text(id);
    var loaded = readAdminStrict();
    if (!loaded.ok) { return loaded; }
    var row = loaded.data[kind].filter(function (candidate) { return rowId(candidate, kind) === id; })[0];
    if (!row) { return fail("Admin record not found."); }
    var references = [];
    var snapshots = [{ key: repo().key, raw: loaded.raw }];
    function ref(type, path) { references.push({ type: type, id: id, path: path, label: path }); }
    function inspect(value, path, parentKey) {
      if (Array.isArray(value)) {
        value.forEach(function (entry, index) {
          if (typeof entry === "string" && entry === id && new RegExp(kind === "officers" ? "officerIds$" : "vehicleIds$", "i").test(parentKey || "")) { ref("reference", path + "[" + index + "]"); }
          else { inspect(entry, path + "[" + index + "]", parentKey); }
        });
        return;
      }
      if (!plain(value)) { return; }
      var type = text(value.type || value.entityType).toUpperCase();
      if (type === (kind === "officers" ? "OFFICER" : "VEHICLE") && text(value.id || value.entityId) === id) { ref("reference", path); }
      Object.keys(value).forEach(function (field) {
        var next = value[field];
        if (path !== "Workspace" && ["subjects", "bookins", "teams", "members", "arrests", "fieldArrests", "locations", "vehicles", "links", "history"].indexOf(field) !== -1 && !Array.isArray(next)) {
          throw new Error("Malformed relationship list at " + path + "." + field);
        }
        var singular = new RegExp(kind === "officers" ? "officerId$" : "vehicleId$", "i");
        var plural = new RegExp(kind === "officers" ? "officerIds$" : "vehicleIds$", "i");
        if (singular.test(field)) {
          // Book-In formState controls carry their value in a wrapper.
          if (plain(next) && own(next, "value")) { if (text(next.value) === id) { ref("reference", path + "." + field); } }
          else if (next !== null && next !== undefined && typeof next !== "string") { throw new Error("Malformed identifier at " + path + "." + field); }
          else if (text(next) === id) { ref("reference", path + "." + field); }
        } else if (plural.test(field) && !Array.isArray(next)) { throw new Error("Malformed reference list at " + path + "." + field); }
        inspect(next, path + "." + field, field);
      });
    }
    function source(name, fallback, validate) {
      var loaded = repo().readReferenceStore(name);
      if (!validate(loaded.data)) { throw new Error("Malformed dependent store " + loaded.key); }
      snapshots.push({ key: loaded.key, raw: loaded.raw });
      return loaded.data;
    }
    try {
      if (isCommitted(row) || text(row.meta && row.meta.committedAt)) { ref("history", "Committed " + (kind === "officers" ? "officer " : "fleet vehicle ") + id + "; retain its identity in Archive"); }
      if ((row.fieldArrests || []).length) { ref("arrest-history", "Admin " + id + ".fieldArrests (including voided history)"); }
      ["officers", "vehicles", "shifts"].forEach(function (bucket) {
        loaded.data[bucket].forEach(function (candidate, index) {
          if (candidate !== row) { inspect(candidate, "Admin." + bucket + "[" + index + "]"); }
        });
      });
      var workspace = source("workspace", {}, plain);
      Object.keys(workspace).forEach(function (bucket) {
        if (["leads", "people", "vehicles", "locations", "encounters", "operations", "investigations", "associations", "businesses", "entities"].indexOf(bucket) !== -1) {
          if (!plain(workspace[bucket]) || Object.keys(workspace[bucket]).some(function (recordId) { return !plain(workspace[bucket][recordId]); })) { throw new Error("Malformed Workspace " + bucket + " references"); }
        }
      });
      inspect(workspace, "Workspace");
      var packets = source("bookin", [], function (data) { return Array.isArray(data) && data.every(plain); });
      inspect(packets, "Book-In");
      var journal = source("bookingTransactions", { transactions: {} }, function (data) { return plain(data) && plain(data.transactions) && Object.keys(data.transactions).every(function (txId) { return plain(data.transactions[txId]); }); });
      inspect(journal, "Booking recovery");
      if (typeof global.indexedDB === "undefined" || !root.media || typeof root.media.listAll !== "function") { return fail("Durable Media references could not be inspected. Archive the record instead."); }
      var media = await root.media.listAll();
      if (!Array.isArray(media) || media.some(function (item) { return !plain(item) || !plain(item.owner) || !text(item.owner.id) || !text(item.owner.type); })) { return fail("Media references are malformed. Archive the record instead."); }
      media.forEach(function (item, index) { inspect(item, "Media[" + index + "]"); });
      var unique = Object.create(null);
      references = references.filter(function (entry) { if (unique[entry.path]) { return false; } unique[entry.path] = true; return true; });
      return { ok: true, error: "", references: references, snapshots: snapshots, mediaSignature: JSON.stringify(media), record: clone(row) };
    } catch (error) { return fail("Dependency inspection failed: " + error.message + ". Archive the record instead."); }
  }

  async function deleteDraft(kind, id) {
    var inspection = await inspectDependencies(kind, id);
    if (!inspection.ok) { return inspection; }
    if (inspection.references.length) { return { ok: false, error: "Delete blocked: " + inspection.references.map(function (entry) { return entry.label; }).join("; "), references: inspection.references }; }
    if (isActive(inspection.record)) { return fail("Archive the unused draft before permanent deletion."); }
    try {
      // Re-read media after the asynchronous scan and compare every durable source
      // immediately before the single Admin write. Media is never auto-deleted.
      if (JSON.stringify(await root.media.listAll()) !== inspection.mediaSignature) { return fail("Media references changed during deletion. Review and retry."); }
      if (!repo().referencesMatch(inspection.snapshots)) { return fail("A dependent record changed during deletion. Review and retry."); }
      var loaded = readAdminStrict();
      if (!loaded.ok) { return loaded; }
      loaded.data[kind] = loaded.data[kind].filter(function (candidate) { return rowId(candidate, kind) !== text(id); });
      return writeAdmin(loaded);
    } catch (error) { return fail("Deletion could not verify its dependencies. No record was deleted."); }
  }

  function voidFieldArrest(officerId, entry) {
    entry = entry || {};
    var id = text(officerId), arrestId = text(entry.arrestId), bookingId = text(entry.bookingId || entry.bookinRecordId);
    var reason = text(entry.voidReason || entry.reason), transactionId = text(entry.voidTransactionId || entry.transactionId);
    if (!id || !arrestId || !bookingId || !reason ||
        (text(entry.reason) && text(entry.voidReason) && text(entry.reason) !== text(entry.voidReason)) ||
        (text(entry.transactionId) && text(entry.voidTransactionId) && text(entry.transactionId) !== text(entry.voidTransactionId)) ||
        (text(entry.bookingId) && text(entry.bookinRecordId) && text(entry.bookingId) !== text(entry.bookinRecordId))) { return fail("Voiding an officer Arrest requires consistent officer, Arrest and booking IDs and a reason."); }
    var loaded = readAdminStrict();
    if (!loaded.ok) { return loaded; }
    var officer = loaded.data.officers.filter(function (candidate) { return rowId(candidate, "officers") === id; })[0];
    if (!officer) { return fail("Officer not found. Historical identity must be retained."); }
    var matches = (officer.fieldArrests || []).filter(function (fact) {
      return text(fact.arrestId) === arrestId || [text(fact.bookingId), text(fact.bookinRecordId)].indexOf(bookingId) !== -1;
    });
    if (!matches.length) { return { ok: true, error: "", missing: true }; }
    if (matches.length !== 1) { return fail("Officer Arrest identity is duplicated."); }
    var fact = matches[0];
    if (text(fact.arrestId) !== arrestId || ["bookingId", "bookinRecordId"].some(function (field) { return text(fact[field]) && text(fact[field]) !== bookingId; }) ||
        ["subjectId", "encounterId", "personId"].some(function (field) { return text(entry[field]) && text(fact[field]) && text(entry[field]) !== text(fact[field]); })) { return fail("Officer Arrest identity conflicts with this void command."); }
    if (isVoided(fact)) {
      if ((text(fact.voidReason) && text(fact.voidReason) !== reason) || (text(fact.voidTransactionId) && text(fact.voidTransactionId) !== transactionId)) { return fail("This officer Arrest was voided by another command. Review its history."); }
      return { ok: true, error: "", alreadyVoided: true };
    }
    fact.voided = true; fact.status = "VOIDED";
    fact.voidedAt = text(entry.voidedAt) || new Date().toISOString();
    fact.voidReason = reason; fact.voidTransactionId = transactionId;
    return writeAdmin(loaded);
  }

  function listFieldArrests(officerId, options) {
    var officer = repo().getOfficer(officerId);
    return (officer && officer.fieldArrests || []).filter(function (fact) { return options && options.includeVoided || !isVoided(fact); });
  }

  function recordFieldArrest(officerId, entry) {
    entry = entry || {};
    var id = String(officerId || "").trim();
    if (!id) {
      return { ok: false, error: "Officer is missing." };
    }
    function text(value) { return String(value == null ? "" : value).trim(); }
    function bookingClaims(row) {
      return [text(row && row.bookingId), text(row && row.bookinRecordId)]
        .filter(function (value, index, values) { return value && values.indexOf(value) === index; });
    }
    var arrestId = text(entry.arrestId);
    var bookingIds = bookingClaims(entry);
    if (!arrestId || bookingIds.length > 1) {
      return { ok: false, error: "A stable Arrest identifier and consistent booking identifiers are required." };
    }
    var loaded = readAdminStrict();
    if (!loaded.ok) { return loaded; }
    var admin = loaded.data;
    var matches = admin.officers.filter(function (row) {
      return row && (text(row.id) === id || text(row.officerId) === id);
    });
    if (matches.length !== 1) {
      return { ok: false, error: matches.length ? "Officer identity is duplicated." : "Officer not found." };
    }
    var officer = matches[0];
    var incoming = {
      arrestId: arrestId, bookingId: bookingIds[0] || "", subjectId: text(entry.subjectId),
      encounterId: text(entry.encounterId), personId: text(entry.personId)
    };
    var conflict = "";
    var existing = null;
    admin.officers.forEach(function (owner) {
      if (!owner || typeof owner !== "object" || Array.isArray(owner) ||
          (owner.fieldArrests !== undefined && !Array.isArray(owner.fieldArrests))) {
        conflict = "Officer Arrest storage is malformed. Run Integrity before retrying.";
        return;
      }
      var arrestMatches = 0;
      (owner.fieldArrests || []).forEach(function (row) {
        var aliases = bookingClaims(row);
        var sameArrest = text(row && row.arrestId) === arrestId;
        var sameBooking = incoming.bookingId && aliases.indexOf(incoming.bookingId) !== -1;
        if (!sameArrest && !sameBooking) { return; }
        arrestMatches += 1;
        if (!row || aliases.length > 1 || !sameArrest ||
            ["subjectId", "personId", "encounterId"].some(function (field) {
              return incoming[field] && text(row[field]) && incoming[field] !== text(row[field]);
            }) || (incoming.bookingId && aliases.length && aliases[0] !== incoming.bookingId)) {
          conflict = "Officer Arrest identity conflicts with this booking.";
        }
        if (owner === officer) { existing = row; }
      });
      if (arrestMatches > 1) { conflict = "Officer Arrest identity is duplicated."; }
    });
    if (conflict) { return { ok: false, error: conflict }; }
    if (existing && isVoided(existing)) { return fail("A voided officer Arrest cannot be reactivated by booking replay."); }
    if (!existing && !isActive(officer)) { return fail("New arrests cannot be assigned to an inactive officer."); }
    officer.fieldArrests = officer.fieldArrests || [];
    var before = JSON.stringify(existing);
    if (existing) {
      Object.keys(incoming).forEach(function (field) {
        if (incoming[field]) { existing[field] = incoming[field]; }
      });
      if (incoming.bookingId && Object.prototype.hasOwnProperty.call(existing, "bookinRecordId")) {
        existing.bookinRecordId = incoming.bookingId;
      }
      if (JSON.stringify(existing) === before) { return { ok: true, error: "" }; }
    } else {
      incoming.bookedAt = text(entry.bookedAt) || new Date().toISOString();
      officer.fieldArrests.push(incoming);
    }
    return writeAdmin(loaded);
  }

  function migrateOfficerRow(row) {
    var dirty = false;
    if (root && root.model && root.model.syncOfficerPlaces) {
      var before = JSON.stringify({
        id: row.id,
        officerId: row.officerId,
        address: row.address,
        locations: row.locations
      });
      var retainedPlaces = Array.isArray(row.locations) ? row.locations.slice(1) : [];
      root.model.syncOfficerPlaces(row);
      row.locations = (row.locations || []).concat(retainedPlaces.filter(function (place) {
        return !(row.locations || []).some(function (current) { return place.locationId && current.locationId === place.locationId; });
      }));
      if (
        JSON.stringify({
          id: row.id,
          officerId: row.officerId,
          address: row.address,
          locations: row.locations
        }) !== before
      ) {
        dirty = true;
      }
    } else {
      if (row.id && !row.officerId) {
        row.officerId = row.id;
        dirty = true;
      }
      if (row.officerId && !row.id) {
        row.id = row.officerId;
        dirty = true;
      }
    }
    return dirty;
  }

  function migrateVehicleRow(row) {
    var dirty = false;
    if (row.governmentVehicle !== true) {
      row.governmentVehicle = true;
      dirty = true;
    }
    if (row.id && !row.vehicleId) {
      row.vehicleId = row.id;
      dirty = true;
    }
    if (row.vehicleId && !row.id) {
      row.id = row.vehicleId;
      dirty = true;
    }
    if (row.plate && !row.licensePlate) {
      row.licensePlate = row.plate;
      dirty = true;
    }
    if (row.licensePlate && !row.plate) {
      row.plate = row.licensePlate;
      dirty = true;
    }
    return dirty;
  }

  function migrateAdminList(list, kind) {
    var dirty = false;
    (list || []).forEach(function (row) {
      if (!row.meta || !row.meta.status) {
        dirty = true;
        if (root && root.model && root.model.ensureRecordMeta) {
          root.model.ensureRecordMeta(row);
        } else {
          row.meta = row.meta || {};
          row.meta.status = "committed";
          row.meta.committedAt = row.meta.updatedAt || new Date().toISOString();
        }
      }
      if (kind === "officers" && migrateOfficerRow(row)) {
        dirty = true;
      }
      if (kind === "vehicles" && migrateVehicleRow(row)) {
        dirty = true;
      }
    });
    return dirty;
  }

  function migrateLegacy() {
    var loaded = readAdminStrict();
    if (!loaded.ok) { return loaded; }
    var dirty = migrateAdminList(loaded.data.officers, "officers") || migrateAdminList(loaded.data.vehicles, "vehicles");
    if (!dirty) { return loaded; }
    var result = writeAdmin(loaded);
    return result.ok ? readAdminStrict() : result;
  }

  function addShift(patch) {
    patch = patch || {};
    if (!text(patch.date) || !text(patch.officerId)) { return fail("Pick a date and an officer."); }
    var loaded = readAdminStrict();
    if (!loaded.ok) { return loaded; }
    var officer = loaded.data.officers.filter(function (row) { return rowId(row, "officers") === patch.officerId; })[0];
    var vehicle = patch.vehicleId && loaded.data.vehicles.filter(function (row) { return rowId(row, "vehicles") === patch.vehicleId; })[0];
    if (!officer || !isActive(officer) || !isCommitted(officer) || (patch.vehicleId && (!vehicle || !isActive(vehicle) || !isCommitted(vehicle)))) {
      return fail("New shifts require an active saved officer and fleet vehicle.");
    }
    var id = "sft-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7);
    loaded.data.shifts.push({ id: id, date: text(patch.date), officerId: patch.officerId, vehicleId: patch.vehicleId || "", start: text(patch.start) || "06:00", end: text(patch.end) || "14:00", assignment: text(patch.assignment) || "field" });
    return writeAdmin(loaded);
  }

  function removeShift(id, expectedRecord) {
    var loaded = readAdminStrict();
    if (!loaded.ok) { return loaded; }
    var current = loaded.data.shifts.filter(function (row) { return row.id === id; })[0];
    if (!current) { return fail("That shift no longer exists."); }
    if (expectedRecord && !same(current, expectedRecord)) { return fail("That shift changed in another window. Review and retry."); }
    loaded.data.shifts = loaded.data.shifts.filter(function (row) { return row.id !== id; });
    return writeAdmin(loaded);
  }

  function removeScheduleAssignments(kind, id, expectedShifts) {
    if (["officers", "vehicles"].indexOf(kind) === -1) { return fail("Unknown Admin record type."); }
    var loaded = readAdminStrict();
    if (!loaded.ok) { return loaded; }
    var field = kind === "officers" ? "officerId" : "vehicleId";
    var current = loaded.data.shifts.filter(function (row) { return row[field] === id; });
    if (expectedShifts && !same(current, expectedShifts)) { return fail("Schedule assignments changed in another window. Review and retry."); }
    if (kind === "officers") { loaded.data.shifts = loaded.data.shifts.filter(function (row) { return row.officerId !== id; }); }
    else { loaded.data.shifts.forEach(function (row) { if (row.vehicleId === id) { row.vehicleId = ""; } }); }
    return writeAdmin(loaded);
  }

  root.application.admin = Object.freeze({
    readAdmin: readAdminStrict, migrateLegacy: migrateLegacy, addShift: addShift, removeShift: removeShift, removeScheduleAssignments: removeScheduleAssignments,
    saveOfficer: function (patch, options) { return saveRecord("officers", patch, options); },
    saveFleetVehicle: function (patch, options) { return saveRecord("vehicles", patch, options); },
    archiveRecord: archiveRecord, restoreRecord: restoreRecord,
    inspectDependencies: inspectDependencies, deleteDraft: deleteDraft,
    recordFieldArrest: recordFieldArrest, voidFieldArrest: voidFieldArrest,
    retractFieldArrest: voidFieldArrest, listFieldArrests: listFieldArrests,
    isActive: isActive, isVoided: isVoided
  });
})(typeof window !== "undefined" ? window : globalThis);
