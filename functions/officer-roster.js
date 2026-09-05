/**
 * Cross-store officer roster reads (copdoc.admin.v1).
 * Alias is initials + badge. Search-select for assigning one officer to a case.
 */
(function (global) {
  "use strict";

  var root = (global.COPDoc = global.COPDoc || {});
  var ADMIN_KEY =
    (root.config && root.config.storageKey("admin")) || "copdoc.admin.v1";

  function plain(row) { return Boolean(row && typeof row === "object" && !Array.isArray(row)); }
  function own(row, key) { return Object.prototype.hasOwnProperty.call(row || {}, key); }
  function text(value) { return String(value == null ? "" : value).trim(); }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
  function fail(error) { return { ok: false, error: error }; }
  function key(name, fallback) { return root.config && root.config.storageKey(name) || fallback; }
  function rowId(row, kind) { return text(row && (row[kind === "officers" ? "officerId" : "vehicleId"] || row.id)); }
  function isActive(row) { return Boolean(row && !row.junked && !row.inactive && !row.archivedAt); }
  function isVoided(row) { return Boolean(row && (row.voided || row.voidedAt || String(row.status || "").toUpperCase() === "VOIDED")); }

  function readAdminStrict() {
    try {
      var raw = global.localStorage.getItem(ADMIN_KEY);
      var data = raw === null ? { officers: [], vehicles: [], shifts: [] } : JSON.parse(raw);
      if (!plain(data)) { return fail("Admin storage is malformed. Run Integrity before saving."); }
      var error = "";
      ["officers", "vehicles", "shifts"].forEach(function (kind) {
        if (!own(data, kind)) { data[kind] = []; }
        if (!Array.isArray(data[kind])) { error = "Admin " + kind + " storage is malformed."; return; }
        var seen = Object.create(null);
        data[kind].forEach(function (row) {
          if (!plain(row)) { error = "Admin " + kind + " contains an invalid record."; return; }
          var alias = kind === "officers" ? "officerId" : kind === "vehicles" ? "vehicleId" : "id";
          var id = rowId(row, kind);
          if (kind === "shifts") { id = text(row.id); }
          if (!id || seen[id] || ["id", alias].some(function (field) {
            return own(row, field) && (typeof row[field] !== "string" || text(row[field]) !== row[field] || row[field] !== id);
          })) { error = "Admin " + kind + " identity is missing, conflicting or duplicated."; }
          seen[id] = true;
          ["fieldArrests", "assignedOfficerIds", "locations", "qualifications", "equipment"].forEach(function (field) {
            if (own(row, field) && !Array.isArray(row[field])) { error = "Admin " + kind + " " + field + " is malformed."; }
          });
          if (row.fieldArrests && row.fieldArrests.some(function (fact) { return !plain(fact); })) {
            error = "Officer Arrest storage is malformed.";
          }
          if ((own(row, "meta") && !plain(row.meta)) || (row.assignedOfficerIds && row.assignedOfficerIds.some(function (id) { return typeof id !== "string" || !id || id !== text(id); }))) {
            error = "Admin " + kind + " metadata or assignment identity is malformed.";
          }
        });
      });
      return error ? fail(error) : { ok: true, raw: raw, data: data };
    } catch (error) { return fail("Could not read Admin storage. Run Integrity before retrying."); }
  }

  function writeAdmin(loaded) {
    try {
      if (global.localStorage.getItem(ADMIN_KEY) !== loaded.raw) { return fail("Admin changed in another window. Reload before saving."); }
      var serialized = JSON.stringify(loaded.data);
      global.localStorage.setItem(ADMIN_KEY, serialized);
      if (global.localStorage.getItem(ADMIN_KEY) !== serialized) { return fail("The Admin write could not be verified. Reload before retrying."); }
      return { ok: true, error: "" };
    } catch (error) { return fail("Could not write Admin storage. Existing records were not accepted as saved."); }
  }

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

  function readAdmin() {
    var loaded = readAdminStrict();
    return loaded.ok ? loaded.data : { officers: [], vehicles: [], shifts: [] };
  }

  function listCommitted() {
    var officers = readAdmin().officers || [];
    return officers.filter(function (row) {
      return isActive(row) && isCommitted(row);
    });
  }

  function listShifts() {
    var shifts = readAdmin().shifts || [];
    return Array.isArray(shifts) ? shifts.slice() : [];
  }

  function listFleet() {
    var vehicles = readAdmin().vehicles || [];
    return vehicles.filter(function (row) {
      return isActive(row) && isCommitted(row) && row.governmentVehicle;
    });
  }

  function groupsByTeam() {
    var groups = {};
    listCommitted().forEach(function (officer) {
      var key = String(officer.team || "").trim() || "(no team)";
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(officer);
    });
    return Object.keys(groups)
      .sort()
      .map(function (key) {
        return { teamKey: key, officers: groups[key] };
      });
  }

  function get(id) {
    if (!id) {
      return null;
    }
    var list = readAdmin().officers || [];
    var i;
    for (i = 0; i < list.length; i++) {
      if (list[i].id === id || list[i].officerId === id) {
        return list[i];
      }
    }
    return null;
  }

  function initials(officer) {
    if (!officer) {
      return "";
    }
    return [officer.firstName, officer.middleName, officer.lastName]
      .map(function (part) {
        return String(part || "")
          .trim()
          .charAt(0);
      })
      .filter(Boolean)
      .join("")
      .toUpperCase();
  }

  function alias(officer) {
    if (!officer) {
      return "";
    }
    var badge = String(officer.badge || "").replace(/\s/g, "").toUpperCase();
    return (initials(officer) + badge).toUpperCase();
  }

  function aliasForId(id) {
    return alias(get(id));
  }

  function label(officer) {
    if (!officer) {
      return "";
    }
    var first = [officer.firstName, officer.middleName].filter(Boolean).join(" ");
    return [officer.lastName, first].filter(Boolean).join(", ");
  }

  function display(officer) {
    if (!officer) {
      return "";
    }
    var code = alias(officer);
    var name = label(officer);
    if (name && code) {
      return name + " · " + code;
    }
    return name || code;
  }

  function hay(officer) {
    return [
      officer.lastName,
      officer.firstName,
      officer.middleName,
      officer.badge,
      officer.callSign,
      alias(officer)
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
  }

  function search(query) {
    var q = String(query || "")
      .trim()
      .toLowerCase();
    var rows = listCommitted().slice().sort(function (a, b) {
      return label(a).localeCompare(label(b));
    });
    if (!q) {
      return rows;
    }
    return rows.filter(function (officer) {
      return hay(officer).indexOf(q) !== -1;
    });
  }

  function bindAssign(opts) {
    opts = opts || {};
    var searchEl = opts.search;
    var hidden = opts.hidden;
    var results = opts.results;
    if (!searchEl || !hidden || !results) {
      return;
    }

    function showChosen(id) {
      hidden.value = id || "";
      var officer = get(id);
      searchEl.value = officer ? display(officer) : "";
    }

    function hideResults() {
      results.hidden = true;
      results.replaceChildren();
      searchEl.setAttribute("aria-expanded", "false");
    }

    function pick(id) {
      var prev = hidden.value || "";
      showChosen(id);
      hideResults();
      if (prev === (id || "")) {
        return;
      }
      if (typeof searchEl._officerOnChange === "function") {
        searchEl._officerOnChange(id || "");
      }
    }

    function paintResults(query) {
      var rows = search(query);
      results.replaceChildren();
      if (!rows.length) {
        var empty = document.createElement("li");
        empty.className = "search-empty";
        empty.textContent = "No matching officers.";
        results.appendChild(empty);
      } else {
        rows.slice(0, 20).forEach(function (officer) {
          var li = document.createElement("li");
          li.setAttribute("role", "option");
          li.dataset.officerId = officer.officerId || officer.id;
          li.textContent = label(officer);
          var meta = document.createElement("span");
          meta.className = "search-meta";
          meta.textContent = [alias(officer), officer.badge, officer.callSign]
            .filter(Boolean)
            .filter(function (bit, i, arr) {
              return arr.indexOf(bit) === i;
            })
            .join(" · ");
          if (meta.textContent) {
            li.appendChild(meta);
          }
          li.addEventListener("mousedown", function (event) {
            event.preventDefault();
            pick(li.dataset.officerId);
          });
          results.appendChild(li);
        });
      }
      results.hidden = false;
      searchEl.setAttribute("aria-expanded", "true");
    }

    searchEl._officerOnChange = opts.onChange;
    if (searchEl.dataset.officerAssignBound === "true") {
      if (document.activeElement !== searchEl) {
        showChosen(opts.value || hidden.value || "");
      }
      return;
    }
    searchEl.dataset.officerAssignBound = "true";
    searchEl.setAttribute("role", "combobox");
    searchEl.setAttribute("aria-autocomplete", "list");
    searchEl.setAttribute("aria-expanded", "false");
    if (results.id) {
      searchEl.setAttribute("aria-controls", results.id);
    }
    showChosen(opts.value || "");

    searchEl.addEventListener("focus", function () {
      paintResults("");
      if (typeof searchEl.select === "function") {
        searchEl.select();
      }
    });
    searchEl.addEventListener("input", function () {
      if (!String(searchEl.value || "").trim()) {
        if (hidden.value) {
          pick("");
        }
        paintResults("");
        return;
      }
      paintResults(searchEl.value);
    });
    searchEl.addEventListener("blur", function () {
      global.setTimeout(function () {
        hideResults();
        if (!String(searchEl.value || "").trim()) {
          if (hidden.value) {
            pick("");
          } else {
            showChosen("");
          }
          return;
        }
        showChosen(hidden.value);
      }, 150);
    });
    searchEl.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        hideResults();
        showChosen(hidden.value);
        searchEl.blur();
      }
    });
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
    var snapshots = [{ key: ADMIN_KEY, raw: loaded.raw }];
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
    function source(storageKey, fallback, validate) {
      var raw = global.localStorage.getItem(storageKey);
      var data = raw === null ? fallback : JSON.parse(raw);
      if (!validate(data)) { throw new Error("Malformed dependent store " + storageKey); }
      snapshots.push({ key: storageKey, raw: raw });
      return data;
    }
    try {
      if (isCommitted(row) || text(row.meta && row.meta.committedAt)) { ref("history", "Committed " + (kind === "officers" ? "officer " : "fleet vehicle ") + id + "; retain its identity in Archive"); }
      if ((row.fieldArrests || []).length) { ref("arrest-history", "Admin " + id + ".fieldArrests (including voided history)"); }
      ["officers", "vehicles", "shifts"].forEach(function (bucket) {
        loaded.data[bucket].forEach(function (candidate, index) {
          if (candidate !== row) { inspect(candidate, "Admin." + bucket + "[" + index + "]"); }
        });
      });
      var workspace = source(key("workspace", "copdocx.store.v1"), {}, plain);
      Object.keys(workspace).forEach(function (bucket) {
        if (["leads", "people", "vehicles", "locations", "encounters", "operations", "investigations", "associations", "businesses", "entities"].indexOf(bucket) !== -1) {
          if (!plain(workspace[bucket]) || Object.keys(workspace[bucket]).some(function (recordId) { return !plain(workspace[bucket][recordId]); })) { throw new Error("Malformed Workspace " + bucket + " references"); }
        }
      });
      inspect(workspace, "Workspace");
      var packets = source(key("bookin", "alien-book-in.saved-records.v1"), [], function (data) { return Array.isArray(data) && data.every(plain); });
      inspect(packets, "Book-In");
      var journal = source(key("bookingTransactions", "copdocx.booking-transactions.v1"), { transactions: {} }, function (data) { return plain(data) && plain(data.transactions) && Object.keys(data.transactions).every(function (txId) { return plain(data.transactions[txId]); }); });
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
      if (inspection.snapshots.some(function (snapshot) { return global.localStorage.getItem(snapshot.key) !== snapshot.raw; })) { return fail("A dependent record changed during deletion. Review and retry."); }
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
    var officer = get(officerId);
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

  root.officers = {
    listCommitted: listCommitted,
    listShifts: listShifts,
    listFleet: listFleet,
    groupsByTeam: groupsByTeam,
    get: get,
    initials: initials,
    alias: alias,
    aliasForId: aliasForId,
    label: label,
    display: display,
    search: search,
    bindAssign: bindAssign,
    recordFieldArrest: recordFieldArrest,
    voidFieldArrest: voidFieldArrest,
    retractFieldArrest: voidFieldArrest,
    listFieldArrests: listFieldArrests,
    isActive: isActive,
    isVoided: isVoided,
    readAdmin: readAdminStrict,
    saveOfficer: function (patch, options) { return saveRecord("officers", patch, options); },
    saveFleetVehicle: function (patch, options) { return saveRecord("vehicles", patch, options); },
    archiveRecord: archiveRecord,
    restoreRecord: restoreRecord,
    inspectDependencies: inspectDependencies,
    deleteDraft: deleteDraft
  };
})(typeof window !== "undefined" ? window : globalThis);
