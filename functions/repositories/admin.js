/** Admin persistence boundary: strict detached reads and compare-before-write commits. */
(function (global) {
  "use strict";
  var root = (global.COPDoc = global.COPDoc || {});
  root.repositories = root.repositories || {};
  var ADMIN_KEY = root.config && root.config.storageKey("admin") || "copdoc.admin.v1";
  function port() { return root.repositories.storage; }
  function plain(row) { return Boolean(row && typeof row === "object" && !Array.isArray(row)); }
  function own(row, key) { return Object.prototype.hasOwnProperty.call(row || {}, key); }
  function text(value) { return String(value == null ? "" : value).trim(); }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function fail(error) { return { ok: false, error: error }; }
  function key(name, fallback) { return root.config && root.config.storageKey(name) || fallback; }
  function rowId(row, kind) { return text(row && (row[kind === "officers" ? "officerId" : "vehicleId"] || row.id)); }

  function readAdminStrict() {
    try {
      var raw = port().read("localStorage", ADMIN_KEY);
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
      if (port().read("localStorage", ADMIN_KEY) !== loaded.raw) { return fail("Admin changed in another window. Reload before saving."); }
      var serialized = JSON.stringify(loaded.data);
      port().write("localStorage", ADMIN_KEY, serialized);
      if (port().read("localStorage", ADMIN_KEY) !== serialized) { return fail("The Admin write could not be verified. Reload before retrying."); }
      return { ok: true, error: "" };
    } catch (error) { return fail("Could not write Admin storage. Existing records were not accepted as saved."); }
  }

  function readSnapshot() {
    var value = JSON.parse(port().read("localStorage", ADMIN_KEY) || "{}");
    if (!plain(value)) { throw new Error("Admin storage is malformed."); }
    return value;
  }
  function getRecord(kind, id) {
    if (!text(id)) { return null; }
    var loaded = readAdminStrict();
    if (!loaded.ok) { return null; }
    return loaded.data[kind].filter(function (row) { return rowId(row, kind) === text(id); })[0] || null;
  }
  function readReferenceStore(name) {
    var entries = {
      workspace: ["copdocx.store.v1", {}],
      bookin: ["alien-book-in.saved-records.v1", []],
      bookingTransactions: ["copdocx.booking-transactions.v1", { transactions: {} }]
    };
    if (!own(entries, name)) { throw new Error("Unknown Admin dependency store."); }
    var storageKey = key(name, entries[name][0]);
    var raw = port().read("localStorage", storageKey);
    return { key: storageKey, raw: raw, data: raw === null ? clone(entries[name][1]) : JSON.parse(raw) };
  }
  function referencesMatch(snapshots) {
    return snapshots.every(function (snapshot) { return port().read("localStorage", snapshot.key) === snapshot.raw; });
  }
  root.repositories.admin = Object.freeze({
    key: ADMIN_KEY, read: readAdminStrict, readSnapshot: readSnapshot, save: writeAdmin,
    getOfficer: function (id) { return getRecord("officers", id); },
    getFleetVehicle: function (id) { return getRecord("vehicles", id); },
    readReferenceStore: readReferenceStore, referencesMatch: referencesMatch
  });
})(typeof window !== "undefined" ? window : globalThis);
