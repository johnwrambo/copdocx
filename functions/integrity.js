/**
 * COPDoc read-only integrity scanner.
 *
 * This module deliberately reads persistence without adopting, normalizing, or
 * writing it.  It is safe to load before the domain model and is also usable by
 * Node-based fixture tests through globalThis.COPDoc.integrity.
 */
(function (global) {
  "use strict";

  var root = (global.COPDoc = global.COPDoc || {});
  var REPORT_SCHEMA = "copdocx.integrity-report.v1";
  var RULESET_VERSION = "copdocx.integrity-rules.v1";
  var SCANNER_VERSION = "0.2.0";
  var MEDIA_DB_NAME = "copdocx.media.v1";
  var FALLBACK_ENTRIES = [
    { id: "workspace", key: "copdocx.store.v1", medium: "localStorage" },
    { id: "admin", key: "copdoc.admin.v1", medium: "localStorage" },
    { id: "bookin", key: "alien-book-in.saved-records.v1", medium: "localStorage" },
    { id: "bookingTransactions", key: "copdocx.booking-transactions.v1", medium: "localStorage" },
    { id: "bookinColumns", key: "alien-book-in.saved-record-columns.v1", medium: "localStorage" },
    { id: "settings", key: "copdocx.settings.v1", medium: "localStorage" },
    { id: "importDoneSignal", key: "copdocx.import.done.v1", medium: "localStorage" },
    { id: "mapViews", key: "copdocx.map.views.v1", medium: "localStorage" },
    { id: "mapLayers", key: "copdocx.map.layers.v1", medium: "localStorage" },
    { id: "mapIcons", key: "copdocx.map.icons.v1", medium: "localStorage" },
    { id: "mapMarkup", key: "copdocx.map.markup.v1", medium: "localStorage" },
    { id: "mapBasemap", key: "copdocx.location-map.basemap", medium: "localStorage" },
    { id: "narrativeTemplates", key: "opdoc.narrative.templates.v2", medium: "localStorage" },
    { id: "narrativeTemplatesLegacy", key: "opdoc.narrative.templates.v1", medium: "localStorage" },
    { id: "photoPickerLab", key: "copdocx.photo-picker.v1", medium: "localStorage" },
    { id: "fileUploadLab", key: "copdocx.file-upload.v1", medium: "localStorage" },
    { id: "baseballCardStyle", key: "copdocx.baseball.card-style.v1", medium: "localStorage" },
    { id: "investigationWindows", key: "copdocx.investigation-windows.v1", medium: "sessionStorage" },
    { id: "baseballHandoff", key: "copdocx.baseball.handoff.v1", medium: "sessionStorage" },
    { id: "geocodeCache", key: "addrGeoCache_v1", medium: "sessionStorage" }
  ];

  function isObject(value) {
    return !!value && typeof value === "object" && !Array.isArray(value);
  }

  function list(value) {
    return Array.isArray(value) ? value : [];
  }

  function dictionary(value) {
    return isObject(value) ? value : {};
  }

  function own(object, key) {
    return Object.prototype.hasOwnProperty.call(object || {}, key);
  }

  function text(value) {
    return value == null ? "" : String(value).trim();
  }

  function upper(value) {
    return text(value).toUpperCase();
  }

  function stableValue(value, stack) {
    var seen = stack || [];
    if (value === null || typeof value !== "object") {
      return JSON.stringify(value);
    }
    if (seen.indexOf(value) !== -1) {
      return '"[Circular]"';
    }
    seen.push(value);
    var out;
    if (Array.isArray(value)) {
      out = "[" + value.map(function (item) {
        return stableValue(item, seen);
      }).join(",") + "]";
    } else {
      out = "{" + Object.keys(value).sort().map(function (key) {
        return JSON.stringify(key) + ":" + stableValue(value[key], seen);
      }).join(",") + "}";
    }
    seen.pop();
    return out;
  }

  function stableStringify(value) {
    return stableValue(value, []);
  }

  function hash(value) {
    var source = typeof value === "string" ? value : stableStringify(value);
    var result = 2166136261;
    var i;
    for (i = 0; i < source.length; i += 1) {
      result ^= source.charCodeAt(i);
      result = Math.imul ? Math.imul(result, 16777619) : (result * 16777619);
    }
    return (result >>> 0).toString(16);
  }

  function typeName(value) {
    if (Array.isArray(value)) return "array";
    if (value === null) return "null";
    return typeof value;
  }

  function scrubError(error) {
    var name = error && error.name ? String(error.name) : "Error";
    return name.replace(/[^A-Za-z0-9_.-]/g, "").slice(0, 80) || "Error";
  }

  function affectedKey(item) {
    item = item || {};
    return [item.store || "", item.type || "", item.id || "", item.path || ""].join("/");
  }

  function createContext(snapshot, options) {
    var requestedMax = Number(options && options.maxFindings);
    return {
      snapshot: snapshot,
      options: options || {},
      findings: [],
      seenFindings: Object.create(null),
      maxFindings: isFinite(requestedMax) && requestedMax > 0
        ? Math.floor(requestedMax)
        : 5000,
      findingCounts: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
      categoryCounts: Object.create(null),
      totalFindings: 0,
      suppressedFindings: 0,
      scanned: Object.create(null),
      blockedChecks: [],
      indexes: null
    };
  }

  function addBlocked(ctx, value) {
    if (ctx.blockedChecks.indexOf(value) === -1) ctx.blockedChecks.push(value);
  }

  function addFinding(ctx, finding) {
    var affected = list(finding.affected).map(function (item) {
      return {
        store: text(item && item.store),
        type: upper(item && item.type),
        id: text(item && item.id),
        path: text(item && item.path)
      };
    }).sort(function (a, b) {
      return affectedKey(a).localeCompare(affectedKey(b));
    });
    var evidence = list(finding.evidence).map(function (row) {
      var safe = {
        store: text(row && row.store),
        path: text(row && row.path)
      };
      if (row && own(row, "expected")) safe.expected = row.expected;
      if (row && own(row, "actual")) safe.actual = row.actual;
      return safe;
    });
    var signature = text(finding.ruleId) + "|" + affected.map(affectedKey).join("|");
    var id = text(finding.findingId) || text(finding.ruleId) + "-" + hash(signature);
    if (ctx.seenFindings[id]) return;
    ctx.seenFindings[id] = true;
    var severity = ["critical", "high", "medium", "low", "info"].indexOf(finding.severity) >= 0
      ? finding.severity
      : "medium";
    var category = text(finding.category) || "integrity";
    ctx.totalFindings += 1;
    ctx.findingCounts[severity] += 1;
    ctx.categoryCounts[category] = (ctx.categoryCounts[category] || 0) + 1;
    if (ctx.findings.length >= ctx.maxFindings) {
      ctx.suppressedFindings += 1;
      return;
    }
    ctx.findings.push({
      findingId: id,
      ruleId: text(finding.ruleId) || "UNCLASSIFIED",
      severity: severity,
      category: category,
      title: text(finding.title) || text(finding.ruleId),
      message: text(finding.message),
      confidence: finding.confidence === "inferred" ? "inferred" : "verified",
      affected: affected,
      evidence: evidence,
      suggestedAction: text(finding.suggestedAction),
      repairable: false
    });
  }

  function finding(ctx, ruleId, severity, category, title, affected, evidence, message, confidence) {
    addFinding(ctx, {
      ruleId: ruleId,
      severity: severity,
      category: category,
      title: title,
      message: message || title,
      confidence: confidence || "verified",
      affected: affected,
      evidence: evidence || []
    });
  }

  function registryEntries() {
    var entries = root.config && Array.isArray(root.config.storageEntries)
      ? root.config.storageEntries
      : FALLBACK_ENTRIES;
    return entries.filter(function (entry) {
      return entry && (entry.medium === "localStorage" || entry.medium === "sessionStorage");
    });
  }

  /** Capture every registered Web Storage value verbatim. No parse and no write. */
  function captureRegisteredStorage() {
    return {
      capturedAt: new Date().toISOString(),
      stores: registryEntries().map(function (entry) {
        var storage = entry.medium === "sessionStorage" ? global.sessionStorage : global.localStorage;
        if (!storage || typeof storage.getItem !== "function") {
          return {
            id: entry.id,
            key: entry.key,
            medium: entry.medium,
            status: "unavailable",
            raw: null,
            error: "StorageUnavailable"
          };
        }
        try {
          var raw = storage.getItem(entry.key);
          return {
            id: entry.id,
            key: entry.key,
            medium: entry.medium,
            status: raw == null ? "missing" : "ok",
            raw: raw,
            characters: raw == null ? 0 : raw.length,
            fingerprint: raw == null ? "" : hash(raw),
            error: ""
          };
        } catch (error) {
          return {
            id: entry.id,
            key: entry.key,
            medium: entry.medium,
            status: "unavailable",
            raw: null,
            error: scrubError(error)
          };
        }
      })
    };
  }

  function parseStoreEntry(entry) {
    entry = entry || {};
    var status = entry.status || (entry.raw == null ? "missing" : "ok");
    if (status !== "ok") {
      return { status: status, value: null, error: entry.error || "", entry: entry };
    }
    try {
      return { status: "ok", value: JSON.parse(entry.raw), error: "", entry: entry };
    } catch (error) {
      return { status: "invalid", value: null, error: "InvalidJSON", entry: entry };
    }
  }

  function directStore(id, value, expected) {
    if (value === undefined || value === null) {
      return {
        id: id,
        key: expected,
        medium: id === "media" ? "indexedDB" : "fixture",
        status: "missing",
        value: null,
        error: ""
      };
    }
    return {
      id: id,
      key: expected,
      medium: id === "media" ? "indexedDB" : "fixture",
      status: "ok",
      value: value,
      error: ""
    };
  }

  function normalizeSnapshot(input) {
    input = input || {};
    var byId = Object.create(null);
    var all = [];
    if (Array.isArray(input.stores)) {
      input.stores.forEach(function (entry) {
        if (!entry || !entry.id) return;
        var isDomainStore = ["workspace", "admin", "bookin", "bookingTransactions"].indexOf(entry.id) >= 0;
        var parsed = isDomainStore
          ? parseStoreEntry(entry)
          : { status: entry.status || (entry.raw == null ? "missing" : "ok"), value: null, error: entry.error || "" };
        var row = {
          id: entry.id,
          key: entry.key || "",
          medium: entry.medium || "",
          status: parsed.status,
          value: parsed.value,
          error: parsed.error,
          characters: entry.characters,
          fingerprint: entry.fingerprint || (entry.raw == null ? "" : hash(entry.raw))
        };
        byId[row.id] = row;
        all.push(row);
      });
    }
    [
      ["workspace", "copdocx.store.v1"],
      ["admin", "copdoc.admin.v1"],
      ["bookin", "alien-book-in.saved-records.v1"],
      ["bookingTransactions", "copdocx.booking-transactions.v1"]
    ].forEach(function (spec) {
      if (own(input, spec[0])) byId[spec[0]] = directStore(spec[0], input[spec[0]], spec[1]);
      if (!byId[spec[0]]) byId[spec[0]] = directStore(spec[0], undefined, spec[1]);
    });
    var mediaInput = own(input, "media") ? input.media : undefined;
    if (isObject(mediaInput) && own(mediaInput, "status")) {
      byId.media = {
        id: "media",
        key: MEDIA_DB_NAME,
        medium: "indexedDB",
        status: mediaInput.status,
        value: Array.isArray(mediaInput.metadata) ? mediaInput.metadata : null,
        blobKeys: Array.isArray(mediaInput.blobKeys) ? mediaInput.blobKeys : [],
        blobKeysKnown: Array.isArray(mediaInput.blobKeys),
        error: mediaInput.error || "",
        fingerprint: mediaInput.fingerprint || ""
      };
    } else {
      byId.media = directStore("media", mediaInput, MEDIA_DB_NAME);
      byId.media.blobKeys = list(input.mediaBlobKeys);
      byId.media.blobKeysKnown = own(input, "mediaBlobKeys");
    }
    return {
      capturedAt: input.capturedAt || "",
      stores: all,
      workspace: byId.workspace,
      admin: byId.admin,
      bookin: byId.bookin,
      bookingTransactions: byId.bookingTransactions,
      media: byId.media
    };
  }

  function idbRequest(request) {
    return new Promise(function (resolve, reject) {
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error || new Error("IndexedDBRequestFailed")); };
    });
  }

  function transactionDone(transaction) {
    return new Promise(function (resolve, reject) {
      transaction.oncomplete = function () { resolve(); };
      transaction.onabort = function () { reject(transaction.error || new Error("IndexedDBTransactionAborted")); };
      transaction.onerror = function () { reject(transaction.error || new Error("IndexedDBTransactionFailed")); };
    });
  }

  /**
   * Read metadata and compound blob keys from an already-existing Media DB.
   * Blob values are never requested.  If existence cannot be proven first, the
   * scan is skipped because indexedDB.open() would otherwise create the DB.
   */
  function readExistingMediaSnapshot() {
    var idb = global.indexedDB;
    if (!idb) {
      return Promise.resolve({
        status: "unavailable",
        metadata: [],
        blobKeys: [],
        error: "IndexedDBUnavailable"
      });
    }
    if (typeof idb.databases !== "function") {
      return Promise.resolve({
        status: "skipped",
        metadata: [],
        blobKeys: [],
        error: "DatabasePreflightUnavailable"
      });
    }
    return idb.databases().then(function (databases) {
      var exists = list(databases).some(function (row) {
        return row && row.name === MEDIA_DB_NAME;
      });
      if (!exists) {
        return { status: "missing", metadata: [], blobKeys: [], error: "" };
      }
      return new Promise(function (resolve) {
        var request;
        var createdRace = false;
        var settled = false;
        var activeDb = null;
        var timeout = typeof global.setTimeout === "function"
          ? global.setTimeout(function () {
              if (activeDb) activeDb.close();
              finish({
                status: "unavailable",
                metadata: [],
                blobKeys: [],
                error: "IndexedDBTimedOut"
              });
            }, 8000)
          : null;
        function finish(result) {
          if (settled) return false;
          settled = true;
          if (timeout !== null && typeof global.clearTimeout === "function") {
            global.clearTimeout(timeout);
          }
          resolve(result);
          return true;
        }
        try {
          request = idb.open(MEDIA_DB_NAME);
        } catch (error) {
          finish({ status: "unavailable", metadata: [], blobKeys: [], error: scrubError(error) });
          return;
        }
        request.onupgradeneeded = function () {
          // The database disappeared after preflight. Abort creation.
          createdRace = true;
          try { request.transaction.abort(); } catch (ignore) { /* no-op */ }
        };
        request.onerror = function () {
          finish({
            status: createdRace ? "missing" : "unavailable",
            metadata: [],
            blobKeys: [],
            error: createdRace ? "DatabaseChangedAfterPreflight" : scrubError(request.error)
          });
        };
        request.onblocked = function () {
          finish({
            status: "unavailable",
            metadata: [],
            blobKeys: [],
            error: "IndexedDBBlocked"
          });
        };
        request.onsuccess = function () {
          var db = request.result;
          activeDb = db;
          if (settled) {
            db.close();
            return;
          }
          var names = db.objectStoreNames;
          var hasMeta = names.contains("meta");
          var hasBlobs = names.contains("blobs");
          var wanted = [];
          if (hasMeta) wanted.push("meta");
          if (hasBlobs) wanted.push("blobs");
          if (!wanted.length) {
            db.close();
            finish({ status: "invalid", metadata: [], blobKeys: [], error: "MediaStoresMissing" });
            return;
          }
          var tx;
          try {
            tx = db.transaction(wanted, "readonly");
          } catch (error) {
            db.close();
            finish({ status: "unavailable", metadata: [], blobKeys: [], error: scrubError(error) });
            return;
          }
          var metaPromise = hasMeta
            ? idbRequest(tx.objectStore("meta").getAll())
            : Promise.resolve([]);
          var keysPromise = hasBlobs
            ? idbRequest(tx.objectStore("blobs").getAllKeys())
            : Promise.resolve([]);
          Promise.all([metaPromise, keysPromise, transactionDone(tx)]).then(function (values) {
            db.close();
            var metadata = list(values[0]);
            var blobKeys = list(values[1]);
            finish({
              status: hasMeta && hasBlobs ? "ok" : "invalid",
              metadata: metadata,
              blobKeys: blobKeys,
              error: hasMeta && hasBlobs ? "" : "MediaStoreMissing",
              fingerprint: hash({ metadata: metadata, blobKeys: blobKeys })
            });
          }, function (error) {
            db.close();
            finish({ status: "unavailable", metadata: [], blobKeys: [], error: scrubError(error) });
          });
        };
      });
    }, function (error) {
      return { status: "unavailable", metadata: [], blobKeys: [], error: scrubError(error) };
    });
  }

  function reportInput(row, counts) {
    var out = {
      key: row.key || "",
      status: row.status || "missing"
    };
    if (row.medium) out.medium = row.medium;
    if (typeof row.characters === "number") out.characters = row.characters;
    if (counts) out.counts = counts;
    if (row.error) out.error = row.error;
    return out;
  }

  function scanInputStatus(ctx, row, label) {
    if (row.status === "invalid") {
      finding(ctx, "STORAGE_JSON_INVALID", "critical", "storage",
        label + " storage is invalid",
        [{ store: row.id, type: "STORE", path: row.key }],
        [{ store: row.id, path: row.key, expected: "valid persisted shape", actual: row.error || "invalid" }],
        "The scanner could not safely interpret this persisted store.");
      addBlocked(ctx, label + " domain checks");
    } else if (row.status === "unavailable") {
      finding(ctx, "STORAGE_READ_FAILED", "critical", "storage",
        label + " storage could not be read",
        [{ store: row.id, type: "STORE", path: row.key }],
        [{ store: row.id, path: row.key, expected: "readable", actual: row.error || "unavailable" }],
        "The scan is incomplete because this store could not be read.");
      addBlocked(ctx, label + " domain checks");
    } else if (row.status === "skipped") {
      finding(ctx, row.id === "media" ? "MEDIA_PREFLIGHT_UNAVAILABLE" : "STORAGE_SCAN_SKIPPED",
        "info", "storage", label + " storage was not opened",
        [{ store: row.id, type: "STORE", path: row.key }],
        [{ store: row.id, path: row.key, expected: "proven-existing read-only source", actual: row.error || "skipped" }],
        "This check was skipped to preserve the scanner's read-only guarantee.");
      addBlocked(ctx, label + " domain checks");
    }
  }

  function scanRootShapes(ctx) {
    var ws = ctx.snapshot.workspace;
    var admin = ctx.snapshot.admin;
    var bookin = ctx.snapshot.bookin;
    scanInputStatus(ctx, ws, "Workspace");
    scanInputStatus(ctx, admin, "Admin");
    scanInputStatus(ctx, bookin, "Book-In");
    scanInputStatus(ctx, ctx.snapshot.bookingTransactions, "Booking recovery");
    scanInputStatus(ctx, ctx.snapshot.media, "Media");
    ctx.snapshot.stores.forEach(function (row) {
      if (["workspace", "admin", "bookin", "bookingTransactions"].indexOf(row.id) >= 0) return;
      if (row.status === "unavailable") scanInputStatus(ctx, row, row.id || row.key || "Registered");
    });
    if (ws.status === "ok") {
      if (!isObject(ws.value)) {
        finding(ctx, "STORAGE_ROOT_SHAPE_INVALID", "critical", "storage", "Workspace root is not an object",
          [{ store: "workspace", type: "STORE", path: "$" }],
          [{ store: "workspace", path: "$", expected: "object", actual: typeName(ws.value) }]);
        addBlocked(ctx, "Workspace domain checks");
      } else {
        if (ws.value.schema && ws.value.schema !== "copdocx.store.v1") {
          finding(ctx, "WORKSPACE_SCHEMA_UNEXPECTED", "high", "schema", "Workspace schema is unexpected",
            [{ store: "workspace", type: "STORE", path: "schema" }],
            [{ store: "workspace", path: "schema", expected: "copdocx.store.v1", actual: "different schema" }]);
        }
        ["people", "leads", "encounters", "investigations", "vehicles", "locations", "businesses", "entities", "associations", "operations"].forEach(function (bucket) {
          if (own(ws.value, bucket) && !isObject(ws.value[bucket])) {
            finding(ctx, "WORKSPACE_BUCKET_INVALID", "high", "schema", "Workspace bucket is not a dictionary",
              [{ store: "workspace", type: "STORE", path: bucket }],
              [{ store: "workspace", path: bucket, expected: "object", actual: typeName(ws.value[bucket]) }]);
          }
        });
        if (text(ws.value.currentLeadId) && !dictionary(ws.value.leads)[ws.value.currentLeadId]) {
          finding(ctx, "CURRENT_LEAD_DANGLING", "medium", "relationship", "Current lead selection is dangling",
            [{ store: "workspace", type: "LEAD", id: ws.value.currentLeadId, path: "currentLeadId" }], [],
            "The selected lead no longer exists; domain records are not necessarily damaged.");
        }
      }
    }
    if (admin.status === "ok" && !isObject(admin.value)) {
      finding(ctx, "STORAGE_ROOT_SHAPE_INVALID", "critical", "storage", "Admin root is not an object",
        [{ store: "admin", type: "STORE", path: "$" }],
        [{ store: "admin", path: "$", expected: "object", actual: typeName(admin.value) }]);
      addBlocked(ctx, "Admin domain checks");
    } else if (admin.status === "ok") {
      ["officers", "vehicles", "shifts"].forEach(function (bucket) {
        if (own(admin.value, bucket) && !Array.isArray(admin.value[bucket])) {
          finding(ctx, "ADMIN_BUCKET_INVALID", "high", "schema", "Admin bucket is not an array",
            [{ store: "admin", type: "STORE", path: bucket }],
            [{ store: "admin", path: bucket, expected: "array", actual: typeName(admin.value[bucket]) }]);
        }
      });
    }
    if (bookin.status === "ok" && !Array.isArray(bookin.value)) {
      finding(ctx, "BOOKIN_ROOT_NOT_ARRAY", "critical", "schema", "Book-In root is not an array",
        [{ store: "bookin", type: "STORE", path: "$" }],
        [{ store: "bookin", path: "$", expected: "array", actual: typeName(bookin.value) }]);
      addBlocked(ctx, "Book-In domain checks");
    }
  }

  function recordId(row, keys) {
    var i;
    for (i = 0; i < keys.length; i += 1) {
      if (text(row && row[keys[i]])) return text(row[keys[i]]);
    }
    return "";
  }

  function arrayIndex(rows, keys) {
    var map = Object.create(null);
    list(rows).forEach(function (row) {
      var id = recordId(row, keys);
      if (id && !map[id]) map[id] = row;
    });
    return map;
  }

  function createIndexes(ctx) {
    var ws = isObject(ctx.snapshot.workspace.value) ? ctx.snapshot.workspace.value : {};
    var admin = isObject(ctx.snapshot.admin.value) ? ctx.snapshot.admin.value : {};
    var bookin = Array.isArray(ctx.snapshot.bookin.value) ? ctx.snapshot.bookin.value : [];
    var media = Array.isArray(ctx.snapshot.media.value) ? ctx.snapshot.media.value : [];
    var indexes = {
      ws: ws,
      people: dictionary(ws.people),
      leads: dictionary(ws.leads),
      encounters: dictionary(ws.encounters),
      investigations: dictionary(ws.investigations),
      vehicles: dictionary(ws.vehicles),
      locations: dictionary(ws.locations),
      businesses: dictionary(ws.businesses),
      entities: dictionary(ws.entities),
      associations: dictionary(ws.associations),
      operations: dictionary(ws.operations),
      admin: admin,
      officers: arrayIndex(admin.officers, ["officerId", "id"]),
      fleet: arrayIndex(admin.vehicles, ["vehicleId", "id"]),
      shifts: list(admin.shifts),
      bookinRows: bookin,
      bookin: arrayIndex(bookin, ["id", "bookinRecordId"]),
      mediaRows: media,
      media: arrayIndex(media, ["mediaId"]),
      blobKeys: list(ctx.snapshot.media.blobKeys)
    };
    ctx.indexes = indexes;
    ctx.scanned.people = Object.keys(indexes.people).length;
    ctx.scanned.leads = Object.keys(indexes.leads).length;
    ctx.scanned.encounters = Object.keys(indexes.encounters).length;
    ctx.scanned.investigations = Object.keys(indexes.investigations).length;
    ctx.scanned.vehicles = Object.keys(indexes.vehicles).length;
    ctx.scanned.locations = Object.keys(indexes.locations).length;
    ctx.scanned.businesses = Object.keys(indexes.businesses).length;
    ctx.scanned.entities = Object.keys(indexes.entities).length;
    ctx.scanned.associations = Object.keys(indexes.associations).length;
    ctx.scanned.operations = Object.keys(indexes.operations).length;
    ctx.scanned.officers = list(admin.officers).length;
    ctx.scanned.adminVehicles = list(admin.vehicles).length;
    ctx.scanned.shifts = indexes.shifts.length;
    ctx.scanned.bookinRecords = bookin.length;
    ctx.scanned.media = media.length;
    ctx.scanned.mediaBlobKeys = indexes.blobKeys.length;
    return indexes;
  }

  function scanDictionary(ctx, bucket, type, idKeys, expectedEntityType, aliases) {
    var rows = ctx.indexes[bucket];
    var seenIds = Object.create(null);
    Object.keys(rows).forEach(function (key) {
      var row = rows[key];
      var path = bucket + "." + key;
      if (!isObject(row)) {
        finding(ctx, "RECORD_SHAPE_INVALID", "high", "schema", type + " record is not an object",
          [{ store: "workspace", type: type, id: key, path: path }],
          [{ store: "workspace", path: path, expected: "object", actual: typeName(row) }]);
        return;
      }
      var id = recordId(row, idKeys);
      if (!id) {
        finding(ctx, "RECORD_ID_MISSING", "high", "identity", type + " identifier is missing",
          [{ store: "workspace", type: type, id: key, path: path }],
          [{ store: "workspace", path: path, expected: idKeys.join(" or "), actual: "missing" }]);
      } else {
        if (id !== key) {
          finding(ctx, "DICTIONARY_KEY_ID_MISMATCH", "high", "identity", type + " dictionary key differs from its identifier",
            [{ store: "workspace", type: type, id: id, path: path }],
            [{ store: "workspace", path: path, expected: "dictionary key equals record ID", actual: "mismatch" }]);
        }
        if (seenIds[id]) {
          finding(ctx, "DUPLICATE_RECORD_ID", "high", "identity", type + " identifier is duplicated",
            [{ store: "workspace", type: type, id: id, path: path },
             { store: "workspace", type: type, id: id, path: seenIds[id] }]);
        } else {
          seenIds[id] = path;
        }
      }
      if (expectedEntityType && row.entityType && upper(row.entityType) !== expectedEntityType) {
        finding(ctx, "ENTITY_TYPE_MISMATCH", "medium", "schema", type + " record has a conflicting entityType",
          [{ store: "workspace", type: type, id: id || key, path: path + ".entityType" }],
          [{ store: "workspace", path: path + ".entityType", expected: expectedEntityType, actual: upper(row.entityType) }]);
      }
      list(aliases).forEach(function (pair) {
        var a = text(row[pair[0]]);
        var b = text(row[pair[1]]);
        if (a && b && a !== b) {
          finding(ctx, "ID_ALIAS_MISMATCH", "high", "identity", type + " identifier aliases conflict",
            [{ store: "workspace", type: type, id: id || key, path: path }],
            [{ store: "workspace", path: path, expected: pair[0] + " equals " + pair[1], actual: "mismatch" }]);
        }
      });
    });
  }

  function scanWorkspaceIdentifiers(ctx) {
    scanDictionary(ctx, "people", "PERSON", ["personId"], "PERSON", []);
    scanDictionary(ctx, "leads", "LEAD", ["leadId"], "LEAD", []);
    scanDictionary(ctx, "encounters", "ENCOUNTER", ["encounterId"], "ENCOUNTER", []);
    scanDictionary(ctx, "investigations", "INVESTIGATION", ["investigationId"], "INVESTIGATION", []);
    scanDictionary(ctx, "vehicles", "VEHICLE", ["vehicleId", "id"], "VEHICLE", [["vehicleId", "id"]]);
    scanDictionary(ctx, "locations", "LOCATION", ["locationId", "id"], "LOCATION", [["locationId", "id"]]);
    scanDictionary(ctx, "businesses", "BUSINESS", ["businessId", "id"], "BUSINESS", [["businessId", "id"]]);
    scanDictionary(ctx, "entities", "ENTITY", ["entityId", "id"], "ENTITY", [["entityId", "id"]]);
    scanDictionary(ctx, "associations", "ASSOCIATION", ["associationId", "linkId"], "ASSOCIATION", [["associationId", "linkId"]]);
    scanDictionary(ctx, "operations", "OPERATION", ["operationId", "operationNumber"], "OPERATION", []);
  }

  function duplicateArrayIds(ctx, rows, keys, store, type, basePath, ruleId) {
    var seen = Object.create(null);
    list(rows).forEach(function (row, index) {
      var id = recordId(row, keys);
      var path = basePath + "[" + index + "]";
      if (!isObject(row)) {
        finding(ctx, "RECORD_SHAPE_INVALID", "high", "schema", type + " record is not an object",
          [{ store: store, type: type, path: path }],
          [{ store: store, path: path, expected: "object", actual: typeName(row) }]);
        return;
      }
      if (!id) {
        finding(ctx, "RECORD_ID_MISSING", "high", "identity", type + " identifier is missing",
          [{ store: store, type: type, path: path }],
          [{ store: store, path: path, expected: keys.join(" or "), actual: "missing" }]);
      } else if (seen[id]) {
        finding(ctx, ruleId || "DUPLICATE_RECORD_ID", "high", "identity", type + " identifier is duplicated",
          [{ store: store, type: type, id: id, path: path },
           { store: store, type: type, id: id, path: seen[id] }]);
      } else {
        seen[id] = path;
      }
    });
  }

  function scanAdminIdentifiers(ctx) {
    var admin = ctx.indexes.admin;
    duplicateArrayIds(ctx, admin.officers, ["officerId", "id"], "admin", "OFFICER", "officers");
    duplicateArrayIds(ctx, admin.vehicles, ["vehicleId", "id"], "admin", "VEHICLE", "vehicles");
    duplicateArrayIds(ctx, admin.shifts, ["shiftId", "id"], "admin", "SHIFT", "shifts");
    list(admin.officers).forEach(function (row, index) {
      if (!isObject(row)) return;
      var id = recordId(row, ["officerId", "id"]);
      if (row.officerId && row.id && row.officerId !== row.id) {
        finding(ctx, "ID_ALIAS_MISMATCH", "high", "identity", "Officer identifier aliases conflict",
          [{ store: "admin", type: "OFFICER", id: id, path: "officers[" + index + "]" }]);
      }
      var firstLocation = Array.isArray(row.locations) ? row.locations[0] : null;
      var mirrorFields = ["locationId", "association", "locationAssociation", "targetPriority", "parksHere", "street", "street2", "city", "state", "zip", "latLong", "latitude", "longitude"];
      var addressMirror = {};
      var locationMirror = {};
      mirrorFields.forEach(function (field) {
        addressMirror[field] = row.address && row.address[field] || "";
        locationMirror[field] = firstLocation && firstLocation[field] || "";
      });
      if (row.address && firstLocation && stableStringify(addressMirror) !== stableStringify(locationMirror)) {
        finding(ctx, "OFFICER_LOCATION_MIRROR_DIVERGED", "medium", "duplication", "Officer address mirrors differ",
          [{ store: "admin", type: "OFFICER", id: id, path: "officers[" + index + "]" }], [],
          "The legacy address and locations copies do not match.", "inferred");
      }
    });
    list(admin.vehicles).forEach(function (row, index) {
      if (!isObject(row)) return;
      var id = recordId(row, ["vehicleId", "id"]);
      if (row.vehicleId && row.id && row.vehicleId !== row.id) {
        finding(ctx, "ID_ALIAS_MISMATCH", "high", "identity", "Fleet vehicle identifier aliases conflict",
          [{ store: "admin", type: "VEHICLE", id: id, path: "vehicles[" + index + "]" }]);
      }
      if (row.plate && row.licensePlate && upper(row.plate) !== upper(row.licensePlate)) {
        finding(ctx, "VEHICLE_PLATE_ALIAS_MISMATCH", "medium", "duplication", "Fleet vehicle plate aliases conflict",
          [{ store: "admin", type: "VEHICLE", id: id, path: "vehicles[" + index + "]" }]);
      }
      if (row.governmentVehicle === false) {
        finding(ctx, "ADMIN_FLEET_CLASSIFICATION_INVALID", "medium", "schema", "Admin fleet row is not classified as a government vehicle",
          [{ store: "admin", type: "VEHICLE", id: id, path: "vehicles[" + index + "].governmentVehicle" }]);
      }
      if (id && ctx.indexes.vehicles[id]) {
        finding(ctx, "VEHICLE_ID_CROSS_STORE_COLLISION", "high", "identity", "Vehicle identifier exists in both workspace and Admin stores",
          [{ store: "admin", type: "VEHICLE", id: id, path: "vehicles[" + index + "]" },
           { store: "workspace", type: "VEHICLE", id: id, path: "vehicles." + id }], [],
          "Media ownership and reference resolution are ambiguous for this identifier.");
      }
    });
    list(admin.shifts).forEach(function (shift, index) {
      if (!isObject(shift)) return;
      var shiftId = recordId(shift, ["shiftId", "id"]);
      if (text(shift.officerId) && !ctx.indexes.officers[shift.officerId]) {
        finding(ctx, "SHIFT_OFFICER_DANGLING", "high", "relationship", "Shift references a missing officer",
          [{ store: "admin", type: "SHIFT", id: shiftId, path: "shifts[" + index + "].officerId" },
           { store: "admin", type: "OFFICER", id: shift.officerId, path: "officers" }]);
      }
      if (text(shift.vehicleId) && !ctx.indexes.fleet[shift.vehicleId]) {
        finding(ctx, "SHIFT_VEHICLE_DANGLING", "high", "relationship", "Shift references a missing fleet vehicle",
          [{ store: "admin", type: "SHIFT", id: shiftId, path: "shifts[" + index + "].vehicleId" },
           { store: "admin", type: "VEHICLE", id: shift.vehicleId, path: "vehicles" }]);
      }
    });
  }

  function personCopyFingerprint(person) {
    person = person || {};
    return hash({
      personId: person.personId || "",
      caseRole: person.caseRole || "",
      name: person.name || {},
      sex: person.sex || "",
      dateOfBirth: person.dateOfBirth || "",
      citizenship: person.citizenship || "",
      ssn: person.ssn || "",
      criminal: person.criminal || {},
      immigration: person.immigration || {},
      locations: person.locations || [],
      aliases: person.aliases || [],
      documents: person.documents || [],
      encounters: person.encounters || [],
      arrests: person.arrests || [],
      convictions: person.convictions || [],
      warrants: person.warrants || []
    });
  }

  function scanPersonChildren(ctx, person, personPath, personId) {
    [
      ["locations", ["locationId", "id"], "LOCATION"],
      ["aliases", ["aliasId"], "ALIAS"],
      ["documents", ["documentId"], "DOCUMENT"],
      ["encounters", ["encounterId"], "PERSON_ENCOUNTER"],
      ["arrests", ["arrestId"], "ARREST"],
      ["convictions", ["convictionId"], "CONVICTION"],
      ["warrants", ["warrantId"], "WARRANT"]
    ].forEach(function (spec) {
      if (!Array.isArray(person[spec[0]])) return;
      var seen = Object.create(null);
      person[spec[0]].forEach(function (row, index) {
        var childId = recordId(row, spec[1]);
        if (!childId) return;
        if (seen[childId]) {
          finding(ctx, "DUPLICATE_EMBEDDED_ID", "high", "identity", spec[2] + " identifier is duplicated inside a Person",
            [{ store: "workspace", type: "PERSON", id: personId, path: personPath + "." + spec[0] },
             { store: "workspace", type: spec[2], id: childId, path: personPath + "." + spec[0] + "[" + index + "]" }]);
        } else {
          seen[childId] = true;
        }
      });
    });
    var cards = person.immigration && person.immigration.baseballCards;
    if (Array.isArray(cards)) {
      var seenCards = Object.create(null);
      cards.forEach(function (card, index) {
        var cardId = recordId(card, ["cardId", "baseballCardId"]);
        if (cardId && seenCards[cardId]) {
          finding(ctx, "DUPLICATE_EMBEDDED_ID", "high", "identity", "Baseball Card identifier is duplicated inside a Person",
            [{ store: "workspace", type: "PERSON", id: personId, path: personPath + ".immigration.baseballCards" },
             { store: "workspace", type: "BASEBALL_CARD", id: cardId, path: personPath + ".immigration.baseballCards[" + index + "]" }]);
        }
        if (cardId) seenCards[cardId] = true;
      });
    }
  }

  function scanLeadPersonIntegrity(ctx) {
    var idx = ctx.indexes;
    Object.keys(idx.people).forEach(function (personId) {
      var person = idx.people[personId];
      if (!isObject(person)) return;
      scanPersonChildren(ctx, person, "people." + personId, personId);
      list(person.locations).forEach(function (location, index) {
        scanCanonicalCopy(
          ctx,
          location,
          "locations",
          "people." + personId + ".locations[" + index + "]",
          "PERSON",
          personId
        );
      });
    });
    Object.keys(idx.vehicles).forEach(function (vehicleId) {
      var vehicle = idx.vehicles[vehicleId];
      if (isObject(vehicle)) {
        scanVehicleLocationCopies(
          ctx,
          vehicle,
          "vehicles." + vehicleId,
          "VEHICLE",
          vehicleId
        );
      }
    });
    Object.keys(idx.leads).forEach(function (leadId) {
      var lead = idx.leads[leadId];
      if (!isObject(lead)) return;
      var path = "leads." + leadId;
      var person = isObject(lead.person) ? lead.person : null;
      if (!person) {
        finding(ctx, "LEAD_PERSON_MISSING", "critical", "relationship", "Lead has no embedded subject Person",
          [{ store: "workspace", type: "LEAD", id: leadId, path: path + ".person" }]);
        return;
      }
      var embeddedId = text(person.personId);
      var subjectId = text(lead.subjectPersonId);
      if (!embeddedId || !subjectId) {
        finding(ctx, "LEAD_SUBJECT_ID_MISSING", "critical", "relationship", "Lead subject identifier is incomplete",
          [{ store: "workspace", type: "LEAD", id: leadId, path: path },
           { store: "workspace", type: "PERSON", id: embeddedId || subjectId, path: path + ".person" }]);
      } else if (embeddedId !== subjectId) {
        finding(ctx, "LEAD_SUBJECT_ID_MISMATCH", "critical", "relationship", "Lead subjectPersonId differs from embedded Person",
          [{ store: "workspace", type: "LEAD", id: leadId, path: path + ".subjectPersonId" },
           { store: "workspace", type: "PERSON", id: embeddedId, path: path + ".person.personId" }]);
      }
      var canonical = embeddedId && idx.people[embeddedId];
      if (embeddedId && !canonical) {
        finding(ctx, "LEAD_PERSON_REGISTRY_MISSING", "high", "relationship", "Lead subject is absent from the Person registry",
          [{ store: "workspace", type: "LEAD", id: leadId, path: path + ".person" },
           { store: "workspace", type: "PERSON", id: embeddedId, path: "people." + embeddedId }]);
      } else if (canonical && personCopyFingerprint(canonical) !== personCopyFingerprint(person)) {
        finding(ctx, "LEAD_PERSON_COPY_DIVERGED", "medium", "duplication", "Embedded Lead Person differs from the Person registry copy",
          [{ store: "workspace", type: "LEAD", id: leadId, path: path + ".person" },
           { store: "workspace", type: "PERSON", id: embeddedId, path: "people." + embeddedId }],
          [{ store: "workspace", path: path + ".person", expected: "same canonical projection", actual: "different fingerprints" }],
          "This may be an older Lead snapshot; review before treating either copy as authoritative.", "inferred");
      }
      if (lead.caseRole && person.caseRole && lead.caseRole !== person.caseRole) {
        finding(ctx, "LEAD_ROLE_DIVERGED", "medium", "duplication", "Lead and embedded Person case roles differ",
          [{ store: "workspace", type: "LEAD", id: leadId, path: path + ".caseRole" },
           { store: "workspace", type: "PERSON", id: embeddedId, path: path + ".person.caseRole" }]);
      }
      if (text(lead.assignedOfficerId) && ctx.snapshot.admin.status === "ok" && !idx.officers[lead.assignedOfficerId]) {
        finding(ctx, "LEAD_OFFICER_DANGLING", "high", "relationship", "Lead references a missing officer",
          [{ store: "workspace", type: "LEAD", id: leadId, path: path + ".assignedOfficerId" },
           { store: "admin", type: "OFFICER", id: lead.assignedOfficerId, path: "officers" }]);
      }
      list(person.locations).forEach(function (location, index) {
        scanCanonicalCopy(
          ctx,
          location,
          "locations",
          path + ".person.locations[" + index + "]",
          "LEAD",
          leadId
        );
      });
      list(lead.vehicles).forEach(function (vehicle, index) {
        var vehiclePath = path + ".vehicles[" + index + "]";
        scanCanonicalCopy(ctx, vehicle, "vehicles", vehiclePath, "LEAD", leadId);
        scanVehicleLocationCopies(ctx, vehicle, vehiclePath, "LEAD", leadId);
      });
    });
  }

  function encounterProjection(person, encounterId, subjectId) {
    var loose = null;
    var exact = null;
    list(person && person.encounters).forEach(function (row) {
      if (!row || text(row.encounterId) !== encounterId) return;
      if (!loose) loose = row;
      if (subjectId && text(row.subjectId) === subjectId && !exact) exact = row;
    });
    return exact || loose;
  }

  function scanPersonEncounterReverse(ctx) {
    var idx = ctx.indexes;
    Object.keys(idx.people).forEach(function (personId) {
      var person = idx.people[personId];
      if (!isObject(person)) return;
      list(person.encounters).forEach(function (row, index) {
        if (!row || !text(row.encounterId)) return;
        var encounter = idx.encounters[row.encounterId];
        if (!encounter) {
          finding(ctx, "PERSON_ENCOUNTER_DANGLING", "high", "relationship", "Person encounter projection references a missing Encounter",
            [{ store: "workspace", type: "PERSON", id: personId, path: "people." + personId + ".encounters[" + index + "]" },
             { store: "workspace", type: "ENCOUNTER", id: row.encounterId, path: "encounters." + row.encounterId }]);
          return;
        }
        var found = list(encounter.subjects).some(function (subject) {
          if (!subject || text(subject.personId) !== personId) return false;
          return !row.subjectId || !subject.subjectId || text(subject.subjectId) === text(row.subjectId);
        });
        if (!found) {
          finding(ctx, "PERSON_ENCOUNTER_SUBJECT_MISSING", "high", "relationship", "Person encounter projection has no matching Encounter subject",
            [{ store: "workspace", type: "PERSON", id: personId, path: "people." + personId + ".encounters[" + index + "]" },
             { store: "workspace", type: "ENCOUNTER", id: row.encounterId, path: "encounters." + row.encounterId + ".subjects" }]);
        }
      });
    });
  }

  function finalish(record) {
    var meta = isObject(record && record.meta) ? record.meta : {};
    return meta.markedComplete === true || meta.status === "committed" || meta.status === "completed";
  }

  function canonicalNestedId(row, kind) {
    return kind === "locations"
      ? recordId(row, ["locationId", "id"])
      : recordId(row, ["vehicleId", "id"]);
  }

  function canonicalProjection(row, kind) {
    row = row || {};
    if (kind === "locations") {
      return {
        locationId: recordId(row, ["locationId", "id"]),
        association: upper(row.association || row.locationAssociation),
        street: text(row.street),
        street2: text(row.street2),
        city: text(row.city),
        state: upper(row.state),
        zip: text(row.zip),
        latitude: text(row.latitude),
        longitude: text(row.longitude),
        latLong: text(row.latLong),
        occupancy: upper(row.occupancy),
        occupiedFrom: text(row.occupiedFrom),
        occupiedTo: text(row.occupiedTo),
        junked: row.junked === true
      };
    }
    return {
      vehicleId: recordId(row, ["vehicleId", "id"]),
      licensePlate: upper(row.licensePlate || row.plate),
      plateState: upper(row.plateState || row.state),
      vehicleYear: text(row.vehicleYear || row.year),
      vehicleMake: text(row.vehicleMake || row.make),
      vehicleModel: text(row.vehicleModel || row.model),
      vehicleColor: text(row.vehicleColor || row.color),
      vehicleBodyStyle: text(row.vehicleBodyStyle || row.bodyStyle),
      vin: upper(row.vin),
      registeredOwnerName: text(row.registeredOwnerName),
      governmentVehicle: row.governmentVehicle === true,
      junked: row.junked === true
    };
  }

  function scanCanonicalCopy(ctx, row, kind, path, ownerType, ownerId) {
    if (!isObject(row)) return;
    var id = canonicalNestedId(row, kind);
    var registry = kind === "locations" ? ctx.indexes.locations : ctx.indexes.vehicles;
    var canonical = id && registry[id];
    if (!id || !isObject(canonical)) return;
    if (stableStringify(canonicalProjection(row, kind)) ===
        stableStringify(canonicalProjection(canonical, kind))) {
      return;
    }
    var type = kind === "locations" ? "LOCATION" : "VEHICLE";
    finding(
      ctx,
      "EMBEDDED_CANONICAL_OBJECT_DIVERGED",
      "high",
      "duplication",
      "Embedded " + type + " differs from its canonical registry copy",
      [
        { store: "workspace", type: ownerType, id: ownerId, path: path },
        { store: "workspace", type: type, id: id, path: kind + "." + id }
      ],
      [
        {
          store: "workspace",
          path: path,
          expected: "same canonical fields",
          actual: "different fingerprints"
        }
      ],
      "Saving the embedded copy can overwrite newer canonical fields; review both copies first.",
      "inferred"
    );
  }

  function scanVehicleLocationCopies(ctx, vehicle, vehiclePath, ownerType, ownerId) {
    list(vehicle && vehicle.locations).forEach(function (location, index) {
      scanCanonicalCopy(
        ctx,
        location,
        "locations",
        vehiclePath + ".locations[" + index + "]",
        ownerType,
        ownerId
      );
    });
  }

  function scanNestedCanonical(ctx, encounter, encounterId, kind) {
    var canonical = kind === "locations" ? ctx.indexes.locations : ctx.indexes.vehicles;
    var type = kind === "locations" ? "LOCATION" : "VEHICLE";
    list(encounter[kind]).forEach(function (row, index) {
      if (!isObject(row)) return;
      var id = canonicalNestedId(row, kind);
      if (!id) {
        finding(ctx, "ENCOUNTER_NESTED_ID_MISSING", "high", "identity", "Encounter " + type + " has no identifier",
          [{ store: "workspace", type: "ENCOUNTER", id: encounterId, path: "encounters." + encounterId + "." + kind + "[" + index + "]" }]);
      } else if (!canonical[id]) {
        finding(ctx, "ENCOUNTER_CANONICAL_OBJECT_MISSING", "high", "relationship", "Encounter embeds a missing canonical " + type,
          [{ store: "workspace", type: "ENCOUNTER", id: encounterId, path: "encounters." + encounterId + "." + kind + "[" + index + "]" },
           { store: "workspace", type: type, id: id, path: kind + "." + id }]);
      } else {
        scanCanonicalCopy(
          ctx,
          row,
          kind,
          "encounters." + encounterId + "." + kind + "[" + index + "]",
          "ENCOUNTER",
          encounterId
        );
        if (kind === "vehicles") {
          scanVehicleLocationCopies(
            ctx,
            row,
            "encounters." + encounterId + ".vehicles[" + index + "]",
            "ENCOUNTER",
            encounterId
          );
        }
      }
    });
  }

  function scanEncounters(ctx) {
    var idx = ctx.indexes;
    var globalSubjects = Object.create(null);
    Object.keys(idx.encounters).forEach(function (encounterId) {
      var encounter = idx.encounters[encounterId];
      if (!isObject(encounter)) return;
      var path = "encounters." + encounterId;
      var completed = finalish(encounter);
      if (text(encounter.operationId) && !idx.operations[encounter.operationId]) {
        finding(ctx, "ENCOUNTER_OPERATION_DANGLING", "high", "relationship", "Encounter references a missing Operation",
          [{ store: "workspace", type: "ENCOUNTER", id: encounterId, path: path + ".operationId" },
           { store: "workspace", type: "OPERATION", id: encounter.operationId, path: "operations." + encounter.operationId }]);
      }
      if (ctx.snapshot.admin.status === "ok") {
        list(encounter.officerIds).forEach(function (officerId, index) {
          if (text(officerId) && !idx.officers[officerId]) {
            finding(ctx, "ENCOUNTER_OFFICER_DANGLING", "high", "relationship", "Encounter references a missing officer",
              [{ store: "workspace", type: "ENCOUNTER", id: encounterId, path: path + ".officerIds[" + index + "]" },
               { store: "admin", type: "OFFICER", id: officerId, path: "officers" }]);
          }
        });
      }
      scanNestedCanonical(ctx, encounter, encounterId, "locations");
      scanNestedCanonical(ctx, encounter, encounterId, "vehicles");
      if (text(encounter.centerLocationId)) {
        var centerNested = list(encounter.locations).some(function (row) {
          return canonicalNestedId(row, "locations") === text(encounter.centerLocationId);
        });
        if (!centerNested || !idx.locations[encounter.centerLocationId]) {
          finding(ctx, "ENCOUNTER_CENTER_LOCATION_DANGLING", "high", "relationship", "Encounter center location is not present in both location representations",
            [{ store: "workspace", type: "ENCOUNTER", id: encounterId, path: path + ".centerLocationId" },
             { store: "workspace", type: "LOCATION", id: encounter.centerLocationId, path: "locations." + encounter.centerLocationId }],
            [{ store: "workspace", path: path + ".locations", expected: "contains centerLocationId", actual: centerNested ? "present" : "missing" }]);
        }
      }
      var localSubjects = Object.create(null);
      list(encounter.subjects).forEach(function (subject, index) {
        var subjectPath = path + ".subjects[" + index + "]";
        if (!isObject(subject)) {
          finding(ctx, "ENCOUNTER_SUBJECT_SHAPE_INVALID", "high", "schema", "Encounter subject is not an object",
            [{ store: "workspace", type: "ENCOUNTER", id: encounterId, path: subjectPath }]);
          return;
        }
        var subjectId = text(subject.subjectId);
        var personId = text(subject.personId);
        if (!subjectId) {
          finding(ctx, "ENCOUNTER_SUBJECT_ID_MISSING", "high", "identity", "Encounter subject identifier is missing",
            [{ store: "workspace", type: "ENCOUNTER_SUBJECT", path: subjectPath }]);
        } else {
          if (localSubjects[subjectId] || globalSubjects[subjectId]) {
            finding(ctx, "DUPLICATE_ENCOUNTER_SUBJECT_ID", "high", "identity", "Encounter subject identifier is duplicated",
              [{ store: "workspace", type: "ENCOUNTER_SUBJECT", id: subjectId, path: subjectPath },
               { store: "workspace", type: "ENCOUNTER_SUBJECT", id: subjectId, path: localSubjects[subjectId] || globalSubjects[subjectId] }]);
          }
          localSubjects[subjectId] = subjectPath;
          globalSubjects[subjectId] = subjectPath;
        }
        if (personId) {
          var person = idx.people[personId];
          if (!person) {
            finding(ctx, "ENCOUNTER_PERSON_DANGLING", "high", "relationship", "Encounter subject references a missing Person",
              [{ store: "workspace", type: "ENCOUNTER_SUBJECT", id: subjectId, path: subjectPath + ".personId" },
               { store: "workspace", type: "PERSON", id: personId, path: "people." + personId }]);
          } else if (!encounterProjection(person, encounterId, subjectId)) {
            finding(ctx, "PERSON_ENCOUNTER_MISSING", "high", "relationship", "Person is missing the Encounter projection written during save",
              [{ store: "workspace", type: "ENCOUNTER_SUBJECT", id: subjectId, path: subjectPath },
               { store: "workspace", type: "PERSON", id: personId, path: "people." + personId + ".encounters" }]);
          }
        } else if (subject.unidentified !== true) {
          finding(ctx, "IDENTIFIED_SUBJECT_PERSON_MISSING", "high", "relationship", "Identified Encounter subject has no Person reference",
            [{ store: "workspace", type: "ENCOUNTER_SUBJECT", id: subjectId, path: subjectPath + ".personId" }]);
        }
        if (text(subject.leadId)) {
          var lead = idx.leads[subject.leadId];
          if (!lead) {
            finding(ctx, "ENCOUNTER_LEAD_DANGLING", "high", "relationship", "Encounter subject references a missing Lead",
              [{ store: "workspace", type: "ENCOUNTER_SUBJECT", id: subjectId, path: subjectPath + ".leadId" },
               { store: "workspace", type: "LEAD", id: subject.leadId, path: "leads." + subject.leadId }]);
          } else if (personId && text(lead.subjectPersonId) && text(lead.subjectPersonId) !== personId) {
            finding(ctx, "ENCOUNTER_LEAD_PERSON_MISMATCH", "high", "relationship", "Encounter subject Lead and Person references disagree",
              [{ store: "workspace", type: "ENCOUNTER_SUBJECT", id: subjectId, path: subjectPath },
               { store: "workspace", type: "LEAD", id: subject.leadId, path: "leads." + subject.leadId + ".subjectPersonId" }]);
          }
        }
        if (text(subject.bookinRecordId) && !idx.bookin[subject.bookinRecordId]) {
          finding(ctx, "ENCOUNTER_BOOKIN_DANGLING", "high", "relationship", "Encounter subject references a missing Book-In packet",
            [{ store: "workspace", type: "ENCOUNTER_SUBJECT", id: subjectId, path: subjectPath + ".bookinRecordId" },
             { store: "bookin", type: "BOOKIN", id: subject.bookinRecordId, path: "$" }]);
        }
        var role = upper(subject.encounterRole);
        if (role && ["TARGET", "COLLATERAL", "OTHER"].indexOf(role) === -1) {
          finding(ctx, "ENCOUNTER_ROLE_INVALID", "high", "schema", "Encounter subject role is invalid",
            [{ store: "workspace", type: "ENCOUNTER_SUBJECT", id: subjectId, path: subjectPath + ".encounterRole" }]);
        } else if (completed && !role) {
          finding(ctx, "COMPLETED_ENCOUNTER_ROLE_MISSING", "high", "workflow", "Completed Encounter subject has no role",
            [{ store: "workspace", type: "ENCOUNTER_SUBJECT", id: subjectId, path: subjectPath + ".encounterRole" }]);
        } else if (role === "OTHER" && !text(subject.roleOther)) {
          finding(ctx, "ENCOUNTER_ROLE_OTHER_MISSING", "medium", "schema", "OTHER Encounter role has no explanation",
            [{ store: "workspace", type: "ENCOUNTER_SUBJECT", id: subjectId, path: subjectPath + ".roleOther" }]);
        }
        var outcome = upper(subject.outcome);
        if (outcome && ["ARRESTED", "RELEASED", "FLED_FOOT", "FLED_VEHICLE"].indexOf(outcome) === -1) {
          finding(ctx, "ENCOUNTER_OUTCOME_INVALID", "high", "schema", "Encounter subject outcome is invalid",
            [{ store: "workspace", type: "ENCOUNTER_SUBJECT", id: subjectId, path: subjectPath + ".outcome" }]);
        } else if (completed && !outcome) {
          finding(ctx, "COMPLETED_ENCOUNTER_OUTCOME_MISSING", "high", "workflow", "Completed Encounter subject has no outcome",
            [{ store: "workspace", type: "ENCOUNTER_SUBJECT", id: subjectId, path: subjectPath + ".outcome" }]);
        }
        if (outcome) {
          var expectedCustody = outcome === "ARRESTED" ? "IN_CUSTODY" : "NOT_IN_CUSTODY";
          if (upper(subject.custody) !== expectedCustody) {
            finding(ctx, "ENCOUNTER_CUSTODY_OUTCOME_MISMATCH", "high", "workflow", "Encounter custody state conflicts with outcome",
              [{ store: "workspace", type: "ENCOUNTER_SUBJECT", id: subjectId, path: subjectPath }],
              [{ store: "workspace", path: subjectPath + ".custody", expected: expectedCustody, actual: upper(subject.custody) || "missing" }]);
          }
        }
        if (text(subject.bookinRecordId) && outcome && outcome !== "ARRESTED") {
          finding(ctx, "BOOKIN_SUBJECT_NOT_ARRESTED", "high", "workflow", "Booked subject does not have ARRESTED outcome",
            [{ store: "workspace", type: "ENCOUNTER_SUBJECT", id: subjectId, path: subjectPath }]);
        }
        var sharedId = text(subject.shared && subject.shared.encounterId);
        if (sharedId && sharedId !== encounterId) {
          finding(ctx, "ENCOUNTER_SHARED_STOP_MISMATCH", "high", "duplication", "Subject shared-stop snapshot names another Encounter",
            [{ store: "workspace", type: "ENCOUNTER_SUBJECT", id: subjectId, path: subjectPath + ".shared.encounterId" }]);
        } else if (completed && !sharedId) {
          finding(ctx, "ENCOUNTER_SHARED_STOP_MISSING", "medium", "duplication", "Completed Encounter subject lacks its shared-stop snapshot",
            [{ store: "workspace", type: "ENCOUNTER_SUBJECT", id: subjectId, path: subjectPath + ".shared" }]);
        }
        if (ctx.snapshot.admin.status === "ok" && text(subject.arrestingOfficerId) && !idx.officers[subject.arrestingOfficerId]) {
          finding(ctx, "ARRESTING_OFFICER_DANGLING", "high", "relationship", "Encounter subject references a missing arresting officer",
            [{ store: "workspace", type: "ENCOUNTER_SUBJECT", id: subjectId, path: subjectPath + ".arrestingOfficerId" },
             { store: "admin", type: "OFFICER", id: subject.arrestingOfficerId, path: "officers" }]);
        }
      });
      if (encounter.meta && encounter.meta.markedComplete === true && !isObject(encounter.completed)) {
        finding(ctx, "COMPLETED_ENCOUNTER_SNAPSHOT_MISSING", "high", "workflow", "Encounter marked complete has no completion snapshot",
          [{ store: "workspace", type: "ENCOUNTER", id: encounterId, path: path + ".completed" }]);
      }
      if (isObject(encounter.completed)) {
        if (encounter.completed.schema !== "copdocx.encounter-snapshot.v1" || text(encounter.completed.encounterId) !== encounterId) {
          finding(ctx, "ENCOUNTER_COMPLETED_SNAPSHOT_INVALID", "high", "schema", "Encounter completion snapshot identity is invalid",
            [{ store: "workspace", type: "ENCOUNTER", id: encounterId, path: path + ".completed" }]);
        }
        var counts = { arrested: 0, released: 0, fled: 0 };
        list(encounter.completed.subjects).forEach(function (subject) {
          var outcome = upper(subject && subject.outcome);
          if (outcome === "ARRESTED") counts.arrested += 1;
          else if (outcome === "RELEASED") counts.released += 1;
          else if (outcome.indexOf("FLED") === 0) counts.fled += 1;
        });
        if (!isObject(encounter.completed.outcomeCounts) ||
            Number(encounter.completed.outcomeCounts.arrested) !== counts.arrested ||
            Number(encounter.completed.outcomeCounts.released) !== counts.released ||
            Number(encounter.completed.outcomeCounts.fled) !== counts.fled) {
          finding(ctx, "ENCOUNTER_COMPLETED_COUNTS_MISMATCH", "high", "derived", "Encounter completion outcome counts do not match its snapshot subjects",
            [{ store: "workspace", type: "ENCOUNTER", id: encounterId, path: path + ".completed.outcomeCounts" }]);
        }
      }
    });
  }

  function buildArrestIndexes(ctx) {
    var byId = Object.create(null);
    var byBookin = Object.create(null);
    var duplicateIds = Object.create(null);
    Object.keys(ctx.indexes.people).forEach(function (personId) {
      var person = ctx.indexes.people[personId];
      list(person && person.arrests).forEach(function (arrest, index) {
        if (!isObject(arrest)) return;
        var path = "people." + personId + ".arrests[" + index + "]";
        var arrestId = text(arrest.arrestId);
        var bookinId = text(arrest.bookinRecordId);
        if (arrestId) {
          if (byId[arrestId]) duplicateIds[arrestId] = [byId[arrestId].path, path];
          else byId[arrestId] = { row: arrest, personId: personId, path: path };
        }
        if (bookinId) {
          if (!byBookin[bookinId]) byBookin[bookinId] = [];
          byBookin[bookinId].push({ row: arrest, personId: personId, path: path });
        }
      });
    });
    Object.keys(duplicateIds).forEach(function (arrestId) {
      finding(ctx, "DUPLICATE_ARREST_ID", "high", "identity", "Arrest identifier is duplicated",
        [{ store: "workspace", type: "ARREST", id: arrestId, path: duplicateIds[arrestId][0] },
         { store: "workspace", type: "ARREST", id: arrestId, path: duplicateIds[arrestId][1] }]);
    });
    ctx.indexes.arrests = byId;
    ctx.indexes.arrestsByBookin = byBookin;
  }

  function scanBookingsAndArrests(ctx) {
    var idx = ctx.indexes;
    buildArrestIndexes(ctx);
    duplicateArrayIds(ctx, idx.bookinRows, ["id", "bookinRecordId"], "bookin", "BOOKIN", "$", "DUPLICATE_BOOKIN_ID");
    idx.bookinRows.forEach(function (record, index) {
      var path = "$[" + index + "]";
      if (!isObject(record)) return;
      var id = recordId(record, ["id", "bookinRecordId"]);
      if (!isObject(record.formState)) {
        finding(ctx, "BOOKIN_FORM_STATE_INVALID", "high", "schema", "Book-In record has no usable formState",
          [{ store: "bookin", type: "BOOKIN", id: id, path: path + ".formState" }],
          [{ store: "bookin", path: path + ".formState", expected: "object", actual: typeName(record.formState) }]);
      }
      var leadId = text(record.leadId);
      var personId = text(record.personId);
      var arrestId = text(record.arrestId);
      var supplied = [leadId, personId, arrestId].filter(Boolean).length;
      if (supplied > 0 && supplied < 3) {
        finding(ctx, "BOOKIN_PROMOTION_PARTIAL", "high", "transaction", "Book-In promotion identifiers are only partially recorded",
          [{ store: "bookin", type: "BOOKIN", id: id, path: path }],
          [{ store: "bookin", path: path, expected: "leadId, personId, and arrestId together", actual: supplied + " of 3 present" }],
          "The non-transactional promotion may have stopped between stores.");
      }
      var lead = leadId && idx.leads[leadId];
      var person = personId && idx.people[personId];
      var arrestEntry = arrestId && idx.arrests[arrestId];
      if (leadId && !lead) {
        finding(ctx, "BOOKIN_LEAD_DANGLING", "high", "relationship", "Book-In record references a missing Lead",
          [{ store: "bookin", type: "BOOKIN", id: id, path: path + ".leadId" },
           { store: "workspace", type: "LEAD", id: leadId, path: "leads." + leadId }]);
      }
      if (personId && !person) {
        finding(ctx, "BOOKIN_PERSON_DANGLING", "high", "relationship", "Book-In record references a missing Person",
          [{ store: "bookin", type: "BOOKIN", id: id, path: path + ".personId" },
           { store: "workspace", type: "PERSON", id: personId, path: "people." + personId }]);
      }
      if (arrestId && !arrestEntry) {
        finding(ctx, "BOOKIN_ARREST_DANGLING", "high", "relationship", "Book-In record references a missing Arrest",
          [{ store: "bookin", type: "BOOKIN", id: id, path: path + ".arrestId" },
           { store: "workspace", type: "ARREST", id: arrestId, path: "people.*.arrests" }]);
      }
      if (lead && personId && text(lead.subjectPersonId) !== personId) {
        finding(ctx, "BOOKIN_LEAD_PERSON_MISMATCH", "critical", "relationship", "Book-In Lead and Person references disagree",
          [{ store: "bookin", type: "BOOKIN", id: id, path: path },
           { store: "workspace", type: "LEAD", id: leadId, path: "leads." + leadId + ".subjectPersonId" },
           { store: "workspace", type: "PERSON", id: personId, path: "people." + personId }]);
      }
      if (arrestEntry) {
        if (personId && arrestEntry.personId !== personId) {
          finding(ctx, "BOOKIN_ARREST_PERSON_MISMATCH", "critical", "relationship", "Book-In Arrest is embedded under a different Person",
            [{ store: "bookin", type: "BOOKIN", id: id, path: path + ".personId" },
             { store: "workspace", type: "ARREST", id: arrestId, path: arrestEntry.path }]);
        }
        if (id && text(arrestEntry.row.bookinRecordId) !== id) {
          finding(ctx, "BOOKIN_ARREST_BACKREF_MISMATCH", "high", "relationship", "Arrest does not point back to its Book-In record",
            [{ store: "bookin", type: "BOOKIN", id: id, path: path },
             { store: "workspace", type: "ARREST", id: arrestId, path: arrestEntry.path + ".bookinRecordId" }]);
        }
      }
      if (id && idx.arrestsByBookin[id] && idx.arrestsByBookin[id].length > 1) {
        finding(ctx, "BOOKIN_MULTIPLE_ARRESTS", "high", "relationship", "Book-In record is linked to multiple Arrest rows",
          [{ store: "bookin", type: "BOOKIN", id: id, path: path },
           { store: "workspace", type: "ARREST", path: "people.*.arrests" }],
          [{ store: "workspace", path: "people.*.arrests", expected: 1, actual: idx.arrestsByBookin[id].length }]);
      }
      var encounterId = text(record.encounterId);
      if (encounterId) {
        var encounter = idx.encounters[encounterId];
        if (!encounter) {
          finding(ctx, "BOOKIN_ENCOUNTER_DANGLING", "high", "relationship", "Book-In record references a missing Encounter",
            [{ store: "bookin", type: "BOOKIN", id: id, path: path + ".encounterId" },
             { store: "workspace", type: "ENCOUNTER", id: encounterId, path: "encounters." + encounterId }]);
        } else {
          var matching = list(encounter.subjects).filter(function (subject) {
            return subject && text(subject.bookinRecordId) === id;
          });
          if (matching.length === 0 && supplied > 0) {
            finding(ctx, "BOOKIN_ENCOUNTER_SUBJECT_MISSING", "high", "relationship", "Promoted Book-In record is absent from its Encounter subjects",
              [{ store: "bookin", type: "BOOKIN", id: id, path: path },
               { store: "workspace", type: "ENCOUNTER", id: encounterId, path: "encounters." + encounterId + ".subjects" }]);
          } else if (matching.length > 1) {
            finding(ctx, "BOOKIN_ENCOUNTER_SUBJECT_DUPLICATE", "high", "relationship", "Book-In record appears multiple times in its Encounter",
              [{ store: "bookin", type: "BOOKIN", id: id, path: path },
               { store: "workspace", type: "ENCOUNTER", id: encounterId, path: "encounters." + encounterId + ".subjects" }]);
          } else if (matching.length === 1 && personId && text(matching[0].personId) !== personId) {
            finding(ctx, "BOOKIN_ENCOUNTER_PERSON_MISMATCH", "critical", "relationship", "Book-In and Encounter subject Person references disagree",
              [{ store: "bookin", type: "BOOKIN", id: id, path: path + ".personId" },
               { store: "workspace", type: "ENCOUNTER_SUBJECT", id: matching[0].subjectId, path: "encounters." + encounterId + ".subjects" }]);
          }
        }
      }
      var created = Date.parse(record.createdAt || "");
      var updated = Date.parse(record.updatedAt || "");
      if (isFinite(created) && isFinite(updated) && updated < created) {
        finding(ctx, "BOOKIN_TIMESTAMP_ORDER_INVALID", "medium", "schema", "Book-In updatedAt precedes createdAt",
          [{ store: "bookin", type: "BOOKIN", id: id, path: path }]);
      }
    });
    Object.keys(idx.arrestsByBookin).forEach(function (bookinId) {
      if (!idx.bookin[bookinId]) {
        idx.arrestsByBookin[bookinId].forEach(function (entry) {
          finding(ctx, "ARREST_BOOKIN_DANGLING", "high", "relationship", "Arrest references a missing Book-In packet",
            [{ store: "workspace", type: "ARREST", id: entry.row.arrestId, path: entry.path + ".bookinRecordId" },
             { store: "bookin", type: "BOOKIN", id: bookinId, path: "$" }]);
        });
      }
    });
  }

  var ASSOCIATION_SPEC = {
    REGISTERED_OWNER_OF: ["PERSON", "VEHICLE"],
    KNOWN_OPERATOR_OF: ["PERSON", "VEHICLE"],
    CURRENT_RESIDENCE: ["PERSON", "LOCATION"],
    KNOWN_RESIDENCE: ["PERSON", "LOCATION"],
    LAST_KNOWN_ADDRESS: ["PERSON", "LOCATION"],
    EMPLOYMENT_ADDRESS: ["PERSON", "LOCATION"],
    BUSINESS_ADDRESS: ["PERSON", "LOCATION"],
    FREQUENTED_LOCATION: ["PERSON", "LOCATION"],
    ENCOUNTER_LOCATION: ["PERSON", "LOCATION"],
    ARREST_LOCATION: ["PERSON", "LOCATION"],
    STAGING_LOCATION: ["PERSON", "LOCATION"],
    PROCESSING_LOCATION: ["PERSON", "LOCATION"],
    REGISTERED_ADDRESS: ["VEHICLE", "LOCATION"],
    VEHICLE_PARKING: ["VEHICLE", "LOCATION"],
    STORED_AT: ["VEHICLE", "LOCATION"],
    ASSOCIATE_OF: ["PERSON", "PERSON"],
    COHABITANT_OF: ["PERSON", "PERSON"],
    SPOUSE_OF: ["PERSON", "PERSON"],
    PARENT_OF: ["PERSON", "PERSON"],
    SIBLING_OF: ["PERSON", "PERSON"],
    EMPLOYED_BY: ["PERSON", "BUSINESS"],
    PRINCIPAL_OF: ["PERSON", "BUSINESS"],
    CUSTOMER_OF: ["PERSON", "BUSINESS"],
    OPERATES_AT: ["BUSINESS", "LOCATION"],
    FLEET_OF: ["BUSINESS", "VEHICLE"],
    MEMBER_OF: ["PERSON", "ENTITY"],
    BASED_AT: ["ENTITY", "LOCATION"],
    USES_VEHICLE: ["ENTITY", "VEHICLE"],
    AFFILIATED_WITH: ["BUSINESS", "ENTITY"]
  };

  function resolveEndpoint(ctx, type, id) {
    var idx = ctx.indexes;
    var map = {
      PERSON: idx.people,
      VEHICLE: idx.vehicles,
      LOCATION: idx.locations,
      BUSINESS: idx.businesses,
      ENTITY: idx.entities,
      OFFICER: idx.officers,
      ENCOUNTER: idx.encounters,
      LEAD: idx.leads,
      INVESTIGATION: idx.investigations,
      OPERATION: idx.operations,
      BOOKIN: idx.bookin
    };
    var canonical = map[upper(type)];
    if (!canonical) return { knownType: false, exists: false, row: null, ambiguous: false };
    var found = canonical[text(id)] || null;
    var ambiguous = upper(type) === "VEHICLE" && !!idx.vehicles[text(id)] && !!idx.fleet[text(id)];
    if (upper(type) === "VEHICLE" && !found) found = idx.fleet[text(id)] || null;
    return { knownType: true, exists: !!found, row: found, ambiguous: ambiguous };
  }

  function associationValidation(fromType, toType, reason) {
    var model = root.model || {};
    if (typeof model.validateAssociationEnds === "function") {
      try { return model.validateAssociationEnds(fromType, toType, reason); } catch (ignore) { /* fallback */ }
    }
    var spec = ASSOCIATION_SPEC[reason];
    if (!spec) return { ok: false, unknownReason: true };
    var a = upper(fromType);
    var b = upper(toType);
    return { ok: (a === spec[0] && b === spec[1]) || (a === spec[1] && b === spec[0]) };
  }

  function canonicalAssociationKey(association) {
    var reason = text(association.reason || association.associationTypeCode || list(association.reasons)[0]);
    var fromType = upper(association.from && association.from.type || association.fromEntityType);
    var fromId = text(association.from && association.from.id || association.fromEntityId);
    var toType = upper(association.to && association.to.type || association.toEntityType);
    var toId = text(association.to && association.to.id || association.toEntityId);
    var spec = ASSOCIATION_SPEC[reason];
    if (spec && fromType === spec[1] && toType === spec[0]) {
      return [reason, toType, toId, fromType, fromId].join("|");
    }
    if (spec && spec[0] === spec[1] && fromId > toId && ["ASSOCIATE_OF", "COHABITANT_OF", "SPOUSE_OF", "SIBLING_OF"].indexOf(reason) >= 0) {
      return [reason, fromType, toId, toType, fromId].join("|");
    }
    return [reason, fromType, fromId, toType, toId].join("|");
  }

  function scanAssociations(ctx) {
    var idx = ctx.indexes;
    var logical = Object.create(null);
    Object.keys(idx.associations).forEach(function (associationId) {
      var row = idx.associations[associationId];
      if (!isObject(row)) return;
      var path = "associations." + associationId;
      var fromType = upper(row.from && row.from.type || row.fromEntityType);
      var fromId = text(row.from && row.from.id || row.fromEntityId);
      var toType = upper(row.to && row.to.type || row.toEntityType);
      var toId = text(row.to && row.to.id || row.toEntityId);
      var reason = text(row.reason || row.associationTypeCode || list(row.reasons)[0]);
      if (!fromType || !fromId || !toType || !toId || !reason) {
        finding(ctx, "ASSOCIATION_ROW_INCOMPLETE", "high", "relationship", "Association is missing an endpoint or reason",
          [{ store: "workspace", type: "ASSOCIATION", id: associationId, path: path }]);
        return;
      }
      if (fromType === toType && fromId === toId) {
        finding(ctx, "ASSOCIATION_SELF_LINK", "high", "relationship", "Association links an object to itself",
          [{ store: "workspace", type: "ASSOCIATION", id: associationId, path: path }]);
      }
      var validation = associationValidation(fromType, toType, reason);
      if (!validation.ok) {
        finding(ctx, validation.unknownReason ? "ASSOCIATION_REASON_INVALID" : "ASSOCIATION_PAIR_INVALID",
          "high", "relationship", "Association reason does not support its endpoint types",
          [{ store: "workspace", type: "ASSOCIATION", id: associationId, path: path }],
          [{ store: "workspace", path: path, expected: "valid association matrix row", actual: "invalid" }]);
      }
      [[fromType, fromId, "from"], [toType, toId, "to"]].forEach(function (end) {
        var resolved = resolveEndpoint(ctx, end[0], end[1]);
        if (!resolved.knownType || !resolved.exists) {
          finding(ctx, "ASSOCIATION_ENDPOINT_DANGLING", "high", "relationship", "Association endpoint cannot be resolved",
            [{ store: "workspace", type: "ASSOCIATION", id: associationId, path: path + "." + end[2] },
             { store: end[0] === "OFFICER" ? "admin" : "workspace", type: end[0], id: end[1], path: "canonical registry" }]);
        }
        if (resolved.row && resolved.row.junked === true && row.junked !== true) {
          finding(ctx, "ASSOCIATION_ACTIVE_TO_JUNKED_OBJECT", "high", "relationship", "Active Association references a junked object",
            [{ store: "workspace", type: "ASSOCIATION", id: associationId, path: path },
             { store: "workspace", type: end[0], id: end[1], path: "canonical registry" }]);
        }
      });
      if (row.reason && Array.isArray(row.reasons) && row.reasons.length && row.reasons[0] !== row.reason) {
        finding(ctx, "ASSOCIATION_REASON_MIRROR_MISMATCH", "medium", "duplication", "Association reason mirrors disagree",
          [{ store: "workspace", type: "ASSOCIATION", id: associationId, path: path }]);
      }
      var start = Date.parse(row.validFrom || row.occupiedFrom || "");
      var end = Date.parse(row.validTo || row.occupiedTo || "");
      if (isFinite(start) && isFinite(end) && end < start) {
        finding(ctx, "ASSOCIATION_DATE_RANGE_INVALID", "medium", "schema", "Association end date precedes start date",
          [{ store: "workspace", type: "ASSOCIATION", id: associationId, path: path }]);
      }
      var key = canonicalAssociationKey(row);
      if (logical[key] && row.junked !== true && logical[key].row.junked !== true) {
        finding(ctx, "DUPLICATE_LOGICAL_ASSOCIATION", "high", "duplication", "Two active Associations assert the same relationship",
          [{ store: "workspace", type: "ASSOCIATION", id: associationId, path: path },
           { store: "workspace", type: "ASSOCIATION", id: logical[key].id, path: logical[key].path }]);
      } else {
        logical[key] = { id: associationId, path: path, row: row };
      }
      var source = isObject(row.source) ? row.source : {};
      [
        ["leadId", "LEAD", idx.leads],
        ["encounterId", "ENCOUNTER", idx.encounters],
        ["investigationId", "INVESTIGATION", idx.investigations],
        ["officerId", "OFFICER", idx.officers]
      ].forEach(function (spec) {
        var sourceId = text(source[spec[0]] || row[spec[0]]);
        if (sourceId && !spec[2][sourceId]) {
          finding(ctx, "ASSOCIATION_SOURCE_DANGLING", "medium", "provenance", "Association provenance references a missing source",
            [{ store: "workspace", type: "ASSOCIATION", id: associationId, path: path + ".source." + spec[0] },
             { store: spec[1] === "OFFICER" ? "admin" : "workspace", type: spec[1], id: sourceId, path: "canonical registry" }]);
        }
      });
      var sourceBookin = text(row.bookinRecordId || source.bookinRecordId);
      if (sourceBookin && !idx.bookin[sourceBookin]) {
        finding(ctx, "ASSOCIATION_SOURCE_DANGLING", "medium", "provenance", "Association provenance references a missing Book-In record",
          [{ store: "workspace", type: "ASSOCIATION", id: associationId, path: path + ".bookinRecordId" },
           { store: "bookin", type: "BOOKIN", id: sourceBookin, path: "$" }]);
      }
    });
  }

  function scanInvestigations(ctx) {
    var idx = ctx.indexes;
    var parentOf = Object.create(null);
    Object.keys(idx.investigations).forEach(function (id) {
      var inv = idx.investigations[id];
      if (!isObject(inv)) return;
      var path = "investigations." + id;
      var parentId = text(inv.parentInvestigationId);
      parentOf[id] = parentId;
      if (parentId && (!idx.investigations[parentId] || parentId === id)) {
        finding(ctx, parentId === id ? "INVESTIGATION_PARENT_SELF" : "INVESTIGATION_PARENT_DANGLING", "high", "relationship", "Investigation parent reference is invalid",
          [{ store: "workspace", type: "INVESTIGATION", id: id, path: path + ".parentInvestigationId" },
           { store: "workspace", type: "INVESTIGATION", id: parentId, path: "investigations." + parentId }]);
      }
      if (text(inv.sourceLeadId) && !idx.leads[inv.sourceLeadId]) {
        finding(ctx, "INVESTIGATION_LEAD_DANGLING", "high", "relationship", "Investigation references a missing source Lead",
          [{ store: "workspace", type: "INVESTIGATION", id: id, path: path + ".sourceLeadId" },
           { store: "workspace", type: "LEAD", id: inv.sourceLeadId, path: "leads." + inv.sourceLeadId }]);
      }
      if (ctx.snapshot.admin.status === "ok" && text(inv.assignedOfficerId) && !idx.officers[inv.assignedOfficerId]) {
        finding(ctx, "INVESTIGATION_OFFICER_DANGLING", "high", "relationship", "Investigation references a missing assigned officer",
          [{ store: "workspace", type: "INVESTIGATION", id: id, path: path + ".assignedOfficerId" },
           { store: "admin", type: "OFFICER", id: inv.assignedOfficerId, path: "officers" }]);
      }
      if (inv.kind && ["tag", "otherLe", "elite", "other", "discovered"].indexOf(inv.kind) === -1) {
        finding(ctx, "INVESTIGATION_KIND_INVALID", "medium", "schema", "Investigation kind is invalid",
          [{ store: "workspace", type: "INVESTIGATION", id: id, path: path + ".kind" }]);
      }
      var nodeIds = Object.create(null);
      list(inv.nodes).forEach(function (node, nodeIndex) {
        var nodePath = path + ".nodes[" + nodeIndex + "]";
        var nodeId = text(node && node.nodeId);
        if (!nodeId || nodeIds[nodeId]) {
          finding(ctx, nodeId ? "INVESTIGATION_NODE_ID_DUPLICATE" : "INVESTIGATION_NODE_ID_MISSING", "high", "identity", "Investigation node identifier is invalid",
            [{ store: "workspace", type: "INVESTIGATION_NODE", id: nodeId, path: nodePath }]);
        }
        if (nodeId) nodeIds[nodeId] = node;
        if (node && text(node.objectType) && text(node.objectId)) {
          var resolved = resolveEndpoint(ctx, node.objectType, node.objectId);
          if (!resolved.exists) {
            finding(ctx, "INVESTIGATION_NODE_OBJECT_DANGLING", "high", "relationship", "Investigation node references a missing object",
              [{ store: "workspace", type: "INVESTIGATION_NODE", id: nodeId, path: nodePath },
               { store: "workspace", type: node.objectType, id: node.objectId, path: "canonical registry" }]);
          }
        }
      });
      if (text(inv.focusNodeId) && !nodeIds[inv.focusNodeId]) {
        finding(ctx, "INVESTIGATION_FOCUS_NODE_DANGLING", "medium", "relationship", "Investigation focus references a missing node",
          [{ store: "workspace", type: "INVESTIGATION", id: id, path: path + ".focusNodeId" }]);
      }
      duplicateArrayIds(ctx, inv.plates, ["plateId"], "workspace", "INVESTIGATION_PLATE", path + ".plates");
      list(inv.plates).forEach(function (plate, plateIndex) {
        if (plate && text(plate.vehicleId) && !idx.vehicles[plate.vehicleId]) {
          finding(ctx, "INVESTIGATION_PLATE_VEHICLE_DANGLING", "high", "relationship", "Investigation plate references a missing Vehicle",
            [{ store: "workspace", type: "INVESTIGATION_PLATE", id: plate.plateId, path: path + ".plates[" + plateIndex + "].vehicleId" },
             { store: "workspace", type: "VEHICLE", id: plate.vehicleId, path: "vehicles." + plate.vehicleId }]);
        }
      });
      duplicateArrayIds(ctx, inv.links, ["linkId"], "workspace", "INVESTIGATION_LINK", path + ".links");
      list(inv.links).forEach(function (link, linkIndex) {
        if (!isObject(link)) return;
        var linkPath = path + ".links[" + linkIndex + "]";
        if (text(link.associationId) && !idx.associations[link.associationId]) {
          finding(ctx, "INVESTIGATION_LINK_ASSOCIATION_DANGLING", "high", "relationship", "Investigation link cites a missing Association",
            [{ store: "workspace", type: "INVESTIGATION_LINK", id: link.linkId, path: linkPath + ".associationId" },
             { store: "workspace", type: "ASSOCIATION", id: link.associationId, path: "associations." + link.associationId }]);
        }
        var fromId = text(link.from && link.from.id);
        var toId = text(link.to && link.to.id);
        if (fromId && toId && fromId === toId && upper(link.from.type) === upper(link.to.type)) {
          finding(ctx, "INVESTIGATION_LINK_SELF", "high", "relationship", "Investigation link joins a node to itself",
            [{ store: "workspace", type: "INVESTIGATION_LINK", id: link.linkId, path: linkPath }]);
        }
      });
    });
    Object.keys(parentOf).forEach(function (start) {
      var cursor = start;
      var visited = Object.create(null);
      while (cursor && parentOf[cursor]) {
        if (visited[cursor]) {
          finding(ctx, "INVESTIGATION_PARENT_CYCLE", "high", "relationship", "Investigation parent chain contains a cycle",
            [{ store: "workspace", type: "INVESTIGATION", id: start, path: "investigations." + start + ".parentInvestigationId" }]);
          break;
        }
        visited[cursor] = true;
        cursor = parentOf[cursor];
      }
    });
  }

  function scanOperations(ctx) {
    var idx = ctx.indexes;
    Object.keys(idx.operations).forEach(function (id) {
      var op = idx.operations[id];
      if (!isObject(op)) return;
      var path = "operations." + id;
      var targetIds = Object.create(null);
      var teamIds = Object.create(null);
      list(op.targets).forEach(function (target, targetIndex) {
        var targetPath = path + ".targets[" + targetIndex + "]";
        var targetId = text(target && target.targetId);
        if (!targetId || targetIds[targetId]) {
          finding(ctx, targetId ? "OPERATION_TARGET_ID_DUPLICATE" : "OPERATION_TARGET_ID_MISSING", "high", "identity", "Operation Target identifier is invalid",
            [{ store: "workspace", type: "OPERATION_TARGET", id: targetId, path: targetPath }]);
        }
        if (targetId) targetIds[targetId] = target;
        if (target && text(target.leadId) && !idx.leads[target.leadId]) {
          finding(ctx, "OPERATION_TARGET_LEAD_DANGLING", "high", "relationship", "Operation Target references a missing Lead",
            [{ store: "workspace", type: "OPERATION_TARGET", id: targetId, path: targetPath + ".leadId" },
             { store: "workspace", type: "LEAD", id: target.leadId, path: "leads." + target.leadId }]);
        }
        if (target && text(target.personId) && !idx.people[target.personId]) {
          finding(ctx, "OPERATION_TARGET_PERSON_DANGLING", "high", "relationship", "Operation Target references a missing Person",
            [{ store: "workspace", type: "OPERATION_TARGET", id: targetId, path: targetPath + ".personId" },
             { store: "workspace", type: "PERSON", id: target.personId, path: "people." + target.personId }]);
        }
        if (target && target.leadId && target.personId && idx.leads[target.leadId] && text(idx.leads[target.leadId].subjectPersonId) !== text(target.personId)) {
          finding(ctx, "OPERATION_TARGET_LEAD_PERSON_MISMATCH", "high", "relationship", "Operation Target Lead and Person references disagree",
            [{ store: "workspace", type: "OPERATION_TARGET", id: targetId, path: targetPath }]);
        }
      });
      var usedOfficers = Object.create(null);
      list(op.teams).forEach(function (team, teamIndex) {
        var teamPath = path + ".teams[" + teamIndex + "]";
        var teamId = text(team && team.teamId);
        if (!teamId || teamIds[teamId]) {
          finding(ctx, teamId ? "OPERATION_TEAM_ID_DUPLICATE" : "OPERATION_TEAM_ID_MISSING", "high", "identity", "Operation Team identifier is invalid",
            [{ store: "workspace", type: "OPERATION_TEAM", id: teamId, path: teamPath }]);
        }
        if (teamId) teamIds[teamId] = team;
        if (team && text(team.vehicleId) && ctx.snapshot.admin.status === "ok" && !idx.fleet[team.vehicleId]) {
          finding(ctx, "OPERATION_TEAM_VEHICLE_DANGLING", "high", "relationship", "Operation Team references a missing fleet Vehicle",
            [{ store: "workspace", type: "OPERATION_TEAM", id: teamId, path: teamPath + ".vehicleId" },
             { store: "admin", type: "VEHICLE", id: team.vehicleId, path: "vehicles" }]);
        }
        list(team && team.members).forEach(function (member, memberIndex) {
          var memberPath = teamPath + ".members[" + memberIndex + "]";
          var officerId = text(member && member.officerId);
          if (officerId && ctx.snapshot.admin.status === "ok" && !idx.officers[officerId]) {
            finding(ctx, "OPERATION_MEMBER_OFFICER_DANGLING", "high", "relationship", "Operation Team member references a missing Officer",
              [{ store: "workspace", type: "OPERATION_TEAM", id: teamId, path: memberPath + ".officerId" },
               { store: "admin", type: "OFFICER", id: officerId, path: "officers" }]);
          }
          if (officerId && usedOfficers[officerId]) {
            finding(ctx, "OPERATION_OFFICER_MULTIPLE_TEAMS", "high", "relationship", "Officer appears on multiple teams in one Operation",
              [{ store: "workspace", type: "OFFICER", id: officerId, path: memberPath },
               { store: "workspace", type: "OPERATION", id: id, path: path + ".teams" }]);
          }
          if (officerId) usedOfficers[officerId] = true;
          if (member && member.assignmentRole && ["eye", "contact", "primary-backup", "backup"].indexOf(member.assignmentRole) === -1) {
            finding(ctx, "OPERATION_ASSIGNMENT_ROLE_INVALID", "medium", "schema", "Operation assignment role is invalid",
              [{ store: "workspace", type: "OPERATION_TEAM", id: teamId, path: memberPath + ".assignmentRole" }]);
          }
        });
      });
      var assignedTargets = Object.create(null);
      var assignedTeams = Object.create(null);
      list(op.targetAssignments).forEach(function (assignment, assignmentIndex) {
        var assignmentPath = path + ".targetAssignments[" + assignmentIndex + "]";
        var targetId = text(assignment && assignment.targetId);
        var teamId = text(assignment && assignment.teamId);
        if (!targetIds[targetId] || !teamIds[teamId]) {
          finding(ctx, "OPERATION_TARGET_ASSIGNMENT_DANGLING", "high", "relationship", "Operation Target assignment has a missing endpoint",
            [{ store: "workspace", type: "OPERATION", id: id, path: assignmentPath }]);
        }
        if ((targetId && assignedTargets[targetId]) || (teamId && assignedTeams[teamId])) {
          finding(ctx, "OPERATION_TARGET_ASSIGNMENT_NOT_ONE_TO_ONE", "high", "relationship", "Operation Target assignments violate one-to-one wiring",
            [{ store: "workspace", type: "OPERATION", id: id, path: path + ".targetAssignments" }]);
        }
        if (targetId) assignedTargets[targetId] = true;
        if (teamId) assignedTeams[teamId] = true;
      });
      var start = Date.parse(op.plannedStart || "");
      var end = Date.parse(op.plannedEnd || "");
      if (isFinite(start) && isFinite(end) && end < start) {
        finding(ctx, "OPERATION_TIME_RANGE_INVALID", "medium", "schema", "Operation planned end precedes start",
          [{ store: "workspace", type: "OPERATION", id: id, path: path }]);
      }
    });
  }

  function scanAdminReferences(ctx) {
    var idx = ctx.indexes;
    list(idx.admin.vehicles).forEach(function (vehicle, vehicleIndex) {
      list(vehicle && vehicle.assignedOfficerIds).forEach(function (officerId, officerIndex) {
        if (text(officerId) && !idx.officers[officerId]) {
          finding(ctx, "FLEET_ASSIGNED_OFFICER_DANGLING", "high", "relationship", "Fleet Vehicle references a missing assigned Officer",
            [{ store: "admin", type: "VEHICLE", id: recordId(vehicle, ["vehicleId", "id"]), path: "vehicles[" + vehicleIndex + "].assignedOfficerIds[" + officerIndex + "]" },
             { store: "admin", type: "OFFICER", id: officerId, path: "officers" }]);
        }
      });
    });
    Object.keys(idx.officers).forEach(function (officerId) {
      var officer = idx.officers[officerId];
      var seen = Object.create(null);
      list(officer.fieldArrests).forEach(function (entry, arrestIndex) {
        var path = "officers.*.fieldArrests[" + arrestIndex + "]";
        var arrestId = text(entry && entry.arrestId);
        if (arrestId && seen[arrestId]) {
          finding(ctx, "OFFICER_FIELD_ARREST_DUPLICATE", "high", "derived", "Officer field-arrest statistic contains a duplicate Arrest",
            [{ store: "admin", type: "OFFICER", id: officerId, path: path },
             { store: "workspace", type: "ARREST", id: arrestId, path: "people.*.arrests" }]);
        }
        if (arrestId) seen[arrestId] = true;
        var arrest = arrestId && idx.arrests && idx.arrests[arrestId];
        if (arrestId && !arrest) {
          finding(ctx, "OFFICER_FIELD_ARREST_DANGLING", "high", "derived", "Officer field-arrest statistic references a missing Arrest",
            [{ store: "admin", type: "OFFICER", id: officerId, path: path },
             { store: "workspace", type: "ARREST", id: arrestId, path: "people.*.arrests" }]);
        } else if (arrest && ((entry.encounterId && text(entry.encounterId) !== text(arrest.row.encounterId)) ||
                             (entry.personId && text(entry.personId) !== arrest.personId))) {
          finding(ctx, "OFFICER_FIELD_ARREST_MISMATCH", "high", "derived", "Officer field-arrest statistic disagrees with the Arrest",
            [{ store: "admin", type: "OFFICER", id: officerId, path: path },
             { store: "workspace", type: "ARREST", id: arrestId, path: arrest.path }]);
        }
      });
    });
  }

  function blobKeyParts(key) {
    if (Array.isArray(key)) return { mediaId: text(key[0]), role: text(key[1]) };
    if (isObject(key)) return { mediaId: text(key.mediaId || key[0]), role: text(key.role || key[1]) };
    return { mediaId: "", role: "" };
  }

  function scanMedia(ctx) {
    if (ctx.snapshot.media.status !== "ok" && ctx.snapshot.media.status !== "invalid") return;
    var idx = ctx.indexes;
    duplicateArrayIds(ctx, idx.mediaRows, ["mediaId"], "media", "MEDIA", "meta");
    var blobMap = Object.create(null);
    idx.blobKeys.forEach(function (key, index) {
      var parts = blobKeyParts(key);
      if (!parts.mediaId || !parts.role) {
        finding(ctx, "MEDIA_BLOB_KEY_INVALID", "high", "media", "Media blob key is malformed",
          [{ store: "media", type: "MEDIA_BLOB", path: "blobs.keys[" + index + "]" }]);
        return;
      }
      blobMap[parts.mediaId + "|" + parts.role] = true;
      if (!idx.media[parts.mediaId]) {
        finding(ctx, "MEDIA_BLOB_METADATA_MISSING", "high", "media", "Media blob key has no metadata row",
          [{ store: "media", type: "MEDIA", id: parts.mediaId, path: "blobs.keys[" + index + "]" }]);
      }
    });
    var primaries = Object.create(null);
    idx.mediaRows.forEach(function (row, index) {
      if (!isObject(row)) return;
      var mediaId = text(row.mediaId);
      var path = "meta[" + index + "]";
      var ownerType = upper(row.owner && row.owner.type);
      var ownerId = text(row.owner && row.owner.id);
      if (row.schema !== "copdocx.media.v1" || row.entityType !== "MEDIA" || ["photo", "file"].indexOf(row.mediaClass) === -1) {
        finding(ctx, "MEDIA_METADATA_SCHEMA_INVALID", "high", "media", "Media metadata identity or class is invalid",
          [{ store: "media", type: "MEDIA", id: mediaId, path: path }]);
      }
      var resolved = resolveEndpoint(ctx, ownerType, ownerId);
      if (!ownerType || !ownerId || !resolved.knownType || !resolved.exists) {
        finding(ctx, "MEDIA_OWNER_DANGLING", "high", "media", "Media metadata owner cannot be resolved",
          [{ store: "media", type: "MEDIA", id: mediaId, path: path + ".owner" },
           { store: ownerType === "OFFICER" ? "admin" : ownerType === "BOOKIN" ? "bookin" : "workspace", type: ownerType, id: ownerId, path: "canonical registry" }]);
      }
      if (resolved.ambiguous) {
        finding(ctx, "MEDIA_OWNER_AMBIGUOUS", "high", "media", "Media Vehicle owner identifier is ambiguous across stores",
          [{ store: "media", type: "MEDIA", id: mediaId, path: path + ".owner" },
           { store: "workspace", type: "VEHICLE", id: ownerId, path: "vehicles." + ownerId },
           { store: "admin", type: "VEHICLE", id: ownerId, path: "vehicles" }]);
      }
      var expectedOwnerKey = ownerType && ownerId ? ownerType + ":" + ownerId : "";
      if (expectedOwnerKey && text(row.ownerKey) !== expectedOwnerKey) {
        finding(ctx, "MEDIA_OWNER_KEY_MISMATCH", "high", "media", "Media ownerKey disagrees with owner fields",
          [{ store: "media", type: "MEDIA", id: mediaId, path: path + ".ownerKey" }]);
      }
      if (row.sha256 && row.ownerSha && row.ownerSha !== expectedOwnerKey + ":" + row.sha256) {
        finding(ctx, "MEDIA_OWNER_SHA_MISMATCH", "high", "media", "Media ownerSha disagrees with owner and content digest",
          [{ store: "media", type: "MEDIA", id: mediaId, path: path + ".ownerSha" }]);
      }
      if (row.mediaClass === "photo" && ownerType === "LEAD") {
        finding(ctx, "MEDIA_PHOTO_OWNED_BY_LEAD", "high", "media", "Photo is attached to a Lead instead of an allowed concrete object",
          [{ store: "media", type: "MEDIA", id: mediaId, path: path + ".owner" }]);
      }
      var roles = list(row.roles);
      if (roles.indexOf("original") === -1) {
        finding(ctx, "MEDIA_ORIGINAL_ROLE_MISSING", "high", "media", "Media metadata omits the original blob role",
          [{ store: "media", type: "MEDIA", id: mediaId, path: path + ".roles" }]);
      }
      roles.forEach(function (role) {
        if (!ctx.snapshot.media.blobKeysKnown) return;
        if (!blobMap[mediaId + "|" + role]) {
          finding(ctx, "MEDIA_ROLE_BLOB_MISSING", "high", "media", "Media metadata role has no blob key",
            [{ store: "media", type: "MEDIA", id: mediaId, path: path + ".roles" },
             { store: "media", type: "MEDIA_BLOB", id: mediaId, path: "blobs.keys" }],
            [{ store: "media", path: path + ".roles", expected: "blob key for every role", actual: "missing role key" }]);
        }
      });
      if (row.mediaClass === "file" && row.primary === true) {
        finding(ctx, "MEDIA_FILE_PRIMARY_INVALID", "medium", "media", "File metadata is marked as a primary photo",
          [{ store: "media", type: "MEDIA", id: mediaId, path: path + ".primary" }]);
      }
      if (row.mediaClass === "photo" && row.primary === true) {
        if (primaries[expectedOwnerKey]) {
          finding(ctx, "MEDIA_MULTIPLE_PRIMARY_PHOTOS", "high", "media", "Media owner has multiple primary photos",
            [{ store: "media", type: "MEDIA", id: mediaId, path: path + ".primary" },
             { store: "media", type: "MEDIA", id: primaries[expectedOwnerKey], path: "meta" }]);
        } else primaries[expectedOwnerKey] = mediaId;
      }
    });
  }

  function checkMediaReference(ctx, mediaId, ownerType, ownerId, sourceType, sourceId, path) {
    if (!mediaId || ctx.snapshot.media.status !== "ok") return;
    var row = ctx.indexes.media[mediaId];
    if (!row) {
      finding(ctx, "EXPLICIT_MEDIA_REFERENCE_DANGLING", "high", "media", sourceType + " references missing Media",
        [{ store: "workspace", type: sourceType, id: sourceId, path: path },
         { store: "media", type: "MEDIA", id: mediaId, path: "meta" }]);
    } else if (upper(row.owner && row.owner.type) !== ownerType || text(row.owner && row.owner.id) !== ownerId) {
      finding(ctx, "EXPLICIT_MEDIA_OWNER_MISMATCH", "high", "media", sourceType + " Media reference is owned by another object",
        [{ store: "workspace", type: sourceType, id: sourceId, path: path },
         { store: "media", type: "MEDIA", id: mediaId, path: "meta" }]);
    }
  }

  function scanExplicitMediaReferences(ctx) {
    Object.keys(ctx.indexes.people).forEach(function (personId) {
      var person = ctx.indexes.people[personId];
      list(person && person.warrants).forEach(function (row, index) {
        checkMediaReference(ctx, text(row && row.mediaId), "PERSON", personId, "WARRANT", text(row && row.warrantId), "people." + personId + ".warrants[" + index + "].mediaId");
      });
      list(person && person.immigration && person.immigration.baseballCards).forEach(function (row, index) {
        checkMediaReference(ctx, text(row && row.photoMediaId), "PERSON", personId, "BASEBALL_CARD", recordId(row, ["cardId", "baseballCardId"]), "people." + personId + ".immigration.baseballCards[" + index + "].photoMediaId");
      });
    });
    Object.keys(ctx.indexes.operations).forEach(function (operationId) {
      list(ctx.indexes.operations[operationId] && ctx.indexes.operations[operationId].targets).forEach(function (target, index) {
        var personId = text(target && target.personId);
        checkMediaReference(ctx, text(target && target.freeze && target.freeze.photoMediaId), "PERSON", personId, "OPERATION_TARGET", text(target && target.targetId), "operations." + operationId + ".targets[" + index + "].freeze.photoMediaId");
      });
    });
  }

  function scanNarratives(ctx) {
    var globalIds = Object.create(null);
    Object.keys(ctx.indexes.encounters).forEach(function (encounterId) {
      var encounter = ctx.indexes.encounters[encounterId];
      if (!isObject(encounter)) return;
      var path = "encounters." + encounterId + ".narratives";
      var participantIds = Object.create(null);
      var requiredParticipants = [];
      list(encounter.subjects).forEach(function (subject, index) {
        if (!subject) return;
        var subjectId = text(subject.subjectId);
        var bookinId = text(subject.bookinRecordId);
        if (subjectId) participantIds[subjectId] = true;
        if (bookinId) participantIds["ep_" + bookinId] = true;
        if (["TARGET", "COLLATERAL"].indexOf(upper(subject.encounterRole)) >= 0) {
          requiredParticipants.push({ subjectId: subjectId, bookinId: bookinId, index: index });
        }
      });
      var activePrimary = Object.create(null);
      var activeOverview = [];
      list(encounter.narratives).forEach(function (record, narrativeIndex) {
        var narrativePath = path + "[" + narrativeIndex + "]";
        if (!isObject(record)) {
          finding(ctx, "NARRATIVE_RECORD_INVALID", "high", "narrative", "Narrative record is not an object",
            [{ store: "workspace", type: "NARRATIVE", path: narrativePath }]);
          return;
        }
        var narrativeId = text(record.narrativeId);
        if (narrativeId && globalIds[narrativeId]) {
          finding(ctx, "NARRATIVE_ID_DUPLICATE", "high", "identity", "Narrative identifier is duplicated",
            [{ store: "workspace", type: "NARRATIVE", id: narrativeId, path: narrativePath },
             { store: "workspace", type: "NARRATIVE", id: narrativeId, path: globalIds[narrativeId] }]);
        } else if (narrativeId) globalIds[narrativeId] = narrativePath;
        if (text(record.encounterId) !== encounterId) {
          finding(ctx, "NARRATIVE_ENCOUNTER_MISMATCH", "high", "narrative", "Narrative encounterId differs from its container",
            [{ store: "workspace", type: "NARRATIVE", id: narrativeId, path: narrativePath + ".encounterId" },
             { store: "workspace", type: "ENCOUNTER", id: encounterId, path: "encounters." + encounterId }]);
        }
        var validation = null;
        if (global.COPDocBuild9Domain && typeof global.COPDocBuild9Domain.validateNarrativeRecord === "function") {
          try { validation = global.COPDocBuild9Domain.validateNarrativeRecord(record); } catch (ignore) { validation = null; }
        }
        var basicInvalid = !narrativeId || record.schema !== "copdoc.narrative.v2" ||
          ["PRIMARY_SUBJECT", "SUBJECT_SUPPLEMENT", "ENCOUNTER_OVERVIEW", "ENCOUNTER_SUPPLEMENT"].indexOf(record.narrativeKind) === -1;
        if (basicInvalid || (validation && !validation.valid)) {
          finding(ctx, "NARRATIVE_RECORD_INVALID", record.workflowStatus === "FINALIZED" ? "high" : "medium", "narrative", "Narrative record fails domain validation",
            [{ store: "workspace", type: "NARRATIVE", id: narrativeId, path: narrativePath }],
            [{ store: "workspace", path: narrativePath, expected: "valid copdoc.narrative.v2", actual: validation ? "domain errors: " + list(validation.errors).length : "basic validation failed" }]);
        }
        var focus = text(record.focusEncounterParticipantId);
        if (focus.indexOf("ep_") === 0) {
          finding(ctx, "NARRATIVE_UNSTABLE_PARTICIPANT_ID", "high", "narrative", "Narrative uses an adapter-derived participant identifier",
            [{ store: "workspace", type: "NARRATIVE", id: narrativeId, path: narrativePath + ".focusEncounterParticipantId" }], [],
            "The identifier can change when Book-In rows are deleted or reordered.");
        }
        if (focus && !participantIds[focus] && !/^ep_\d+$/.test(focus)) {
          finding(ctx, "NARRATIVE_FOCUS_ORPHAN", "high", "narrative", "Narrative focus does not resolve to an Encounter subject",
            [{ store: "workspace", type: "NARRATIVE", id: narrativeId, path: narrativePath + ".focusEncounterParticipantId" },
             { store: "workspace", type: "ENCOUNTER", id: encounterId, path: "encounters." + encounterId + ".subjects" }]);
        }
        list(record.relatedEncounterParticipantIds).forEach(function (relatedId, relatedIndex) {
          if (!participantIds[text(relatedId)] && !/^ep_\d+$/.test(text(relatedId))) {
            finding(ctx, "NARRATIVE_RELATED_PARTICIPANT_ORPHAN", "high", "narrative", "Narrative related participant does not resolve",
              [{ store: "workspace", type: "NARRATIVE", id: narrativeId, path: narrativePath + ".relatedEncounterParticipantIds[" + relatedIndex + "]" }]);
          }
        });
        var active = !record.recordState || record.recordState === "ACTIVE";
        if (active && record.narrativeKind === "PRIMARY_SUBJECT") {
          if (!activePrimary[focus]) activePrimary[focus] = [];
          activePrimary[focus].push(narrativeId);
        }
        if (active && record.narrativeKind === "ENCOUNTER_OVERVIEW") activeOverview.push(narrativeId);
        if (record.workflowStatus === "FINALIZED" && record.freshnessStatus === "STALE") {
          finding(ctx, "NARRATIVE_FINALIZED_STALE", "high", "narrative", "Finalized Narrative is marked stale",
            [{ store: "workspace", type: "NARRATIVE", id: narrativeId, path: narrativePath + ".freshnessStatus" }]);
        }
      });
      Object.keys(activePrimary).forEach(function (focus) {
        if (activePrimary[focus].length > 1) {
          finding(ctx, "NARRATIVE_PRIMARY_DUPLICATE", "high", "narrative", "Participant has multiple active primary Narratives",
            [{ store: "workspace", type: "ENCOUNTER", id: encounterId, path: path }],
            [{ store: "workspace", path: path, expected: 1, actual: activePrimary[focus].length }]);
        }
      });
      if (activeOverview.length > 1) {
        finding(ctx, "NARRATIVE_OVERVIEW_DUPLICATE", "high", "narrative", "Encounter has multiple active overview Narratives",
          [{ store: "workspace", type: "ENCOUNTER", id: encounterId, path: path }],
          [{ store: "workspace", path: path, expected: 1, actual: activeOverview.length }]);
      }
      if (encounter.meta && encounter.meta.markedComplete === true) {
        requiredParticipants.forEach(function (participant) {
          var candidates = [participant.subjectId, participant.bookinId ? "ep_" + participant.bookinId : ""].filter(Boolean);
          var covered = candidates.some(function (candidate) {
            return activePrimary[candidate] && activePrimary[candidate].length === 1;
          });
          // Numeric adapter IDs cannot be safely attributed, so do not infer a
          // missing narrative when any such legacy focus exists.
          var hasUnstableNumeric = Object.keys(activePrimary).some(function (focus) { return /^ep_\d+$/.test(focus); });
          if (!covered && !hasUnstableNumeric) {
            finding(ctx, "COMPLETED_ENCOUNTER_NARRATIVE_MISSING", "high", "narrative", "Completed Encounter participant lacks an active primary Narrative",
              [{ store: "workspace", type: "ENCOUNTER_SUBJECT", id: participant.subjectId, path: "encounters." + encounterId + ".subjects[" + participant.index + "]" },
               { store: "workspace", type: "ENCOUNTER", id: encounterId, path: path }]);
          }
        });
      }
    });
  }

  /** Journal findings deliberately exclude request values and lastError text. */
  function scanBookingTransactions(ctx) {
    var store = ctx.snapshot.bookingTransactions;
    if (store.status !== "ok") return;
    var journal = store.value;
    function report(rule, severity, title, id, field, actual) {
      var path = id ? "transactions." + id + (field ? "." + field : "") : "$";
      finding(ctx, rule, severity, "transaction", title,
        [{ store: "bookingTransactions", type: "BOOKING_TRANSACTION", id: id || "", path: path }],
        [{ store: "bookingTransactions", path: path, expected: "valid consistent booking journal", actual: actual }]);
    }
    if (!isObject(journal) || journal.schema !== "copdocx.booking-transactions.v1" || !isObject(journal.transactions)) {
      report("BOOKING_JOURNAL_INVALID", "critical", "Booking recovery journal has an unsupported shape", "", "", "invalid root or schema");
      addBlocked(ctx, "Booking recovery domain checks");
      return;
    }
    var ids = ["transactionId", "bookingId", "encounterId", "subjectId", "personId", "leadId", "arrestId"];
    var claimsByBooking = Object.create(null);
    var activeBySubject = Object.create(null);
    var activeByBooking = Object.create(null);
    var count = 0;
    function mismatch(a, b, fields) {
      return fields.some(function (field) {
        return text(a && a[field]) && text(b && b[field]) && text(a[field]) !== text(b[field]);
      });
    }
    Object.keys(journal.transactions).sort().forEach(function (key) {
      var row = journal.transactions[key];
      count += 1;
      var invalid = !isObject(row) || !key || key !== text(key);
      if (!invalid) {
        invalid = ids.some(function (field) {
          return typeof row[field] !== "string" || row[field] !== text(row[field]);
        }) || row.transactionId !== key || !row.bookingId ||
          ["PENDING", "COMPLETED", "FAILED"].indexOf(row.status) < 0 ||
          !Array.isArray(row.completedSteps) || row.completedSteps.some(function (step, index, steps) {
            return typeof step !== "string" || !text(step) || step !== text(step) || steps.indexOf(step) !== index;
          }) || ["createdAt", "updatedAt"].some(function (field) {
            return typeof row[field] !== "string" || !row[field] || !isFinite(Date.parse(row[field]));
          }) || (own(row, "lastError") && typeof row.lastError !== "string") ||
          Boolean(row.encounterId) !== Boolean(row.subjectId);
      }
      if (!invalid && row.status !== "COMPLETED") {
        invalid = !isObject(row.request) || !isObject(row.request.packet) || !isObject(row.request.options);
      }
      if (!invalid && own(row, "request")) {
        invalid = !isObject(row.request) || !isObject(row.request.packet) || !isObject(row.request.options);
      }
      if (invalid) {
        report("BOOKING_TRANSACTION_INVALID", "critical", "Booking recovery transaction is malformed", key, "", "invalid transaction fields");
        return;
      }
      var unfinished = row.status !== "COMPLETED";
      if (unfinished) {
        report("BOOKING_TRANSACTION_INCOMPLETE", "high", "A booking requires recovery", key, "status", row.status);
      }
      var conflictFields = [];
      function conflict(field) {
        if (conflictFields.indexOf(field) < 0) conflictFields.push(field);
      }
      var requestPacket = row.request && row.request.packet;
      if (requestPacket) {
        ["id", "bookingId", "bookinRecordId"].forEach(function (field) {
          if (text(requestPacket[field]) && text(requestPacket[field]) !== row.bookingId) conflict("request.packet." + field);
        });
        if (mismatch(row, requestPacket, ["encounterId", "subjectId", "personId", "leadId", "arrestId"])) conflict("request.packet");
      }
      var prior = claimsByBooking[row.bookingId];
      if (prior && mismatch(prior, row, ["encounterId", "subjectId", "personId", "leadId", "arrestId"])) conflict("bookingId");
      claimsByBooking[row.bookingId] = row;
      if (unfinished) {
        var subjectKey = row.encounterId && JSON.stringify([row.encounterId, row.subjectId]);
        if (activeByBooking[row.bookingId] || (subjectKey && activeBySubject[subjectKey])) {
          report("BOOKING_TRANSACTION_DUPLICATE_ACTIVE", "critical", "Multiple unfinished bookings claim the same owner", key, "bookingId", "competing unfinished transactions");
        }
        activeByBooking[row.bookingId] = key;
        if (subjectKey) activeBySubject[subjectKey] = key;
      }
      var packets = ctx.indexes.bookinRows.filter(function (packet) {
        return text(packet && packet.id) === row.bookingId;
      });
      if (packets.length > 1) conflict("bookingId");
      packets.forEach(function (packet) {
        if (mismatch(row, packet, ["encounterId", "subjectId", "personId", "leadId", "arrestId"]) ||
          (text(packet.bookingId) && text(packet.bookingId) !== row.bookingId) ||
          (text(packet.bookinRecordId) && text(packet.bookinRecordId) !== row.bookingId)) conflict("bookingId");
      });
      if (row.encounterId && ctx.snapshot.workspace.status === "ok") {
        var encounter = ctx.indexes.encounters[row.encounterId];
        var subjects = list(encounter && encounter.subjects).filter(function (subject) {
          return text(subject && subject.subjectId) === row.subjectId;
        });
        if ((unfinished && subjects.length !== 1) || subjects.length > 1) conflict("subjectId");
        subjects.forEach(function (subject) {
          if (mismatch(row, subject, ["encounterId", "personId", "leadId"]) ||
            (text(subject.bookingId) && text(subject.bookingId) !== row.bookingId) ||
            (text(subject.bookinRecordId) && text(subject.bookinRecordId) !== row.bookingId)) conflict("subjectId");
        });
      }
      var lead = row.leadId && ctx.indexes.leads[row.leadId];
      if (lead && row.personId && text(lead.subjectPersonId) && text(lead.subjectPersonId) !== row.personId) conflict("leadId");
      var arrest = row.arrestId && ctx.indexes.arrests[row.arrestId];
      if (arrest && ((row.personId && arrest.personId !== row.personId) ||
        mismatch(row, arrest.row, ["encounterId", "subjectId"]) ||
        (text(arrest.row.bookinRecordId) && text(arrest.row.bookinRecordId) !== row.bookingId))) conflict("arrestId");
      conflictFields.forEach(function (field) {
        report("BOOKING_TRANSACTION_IDENTITY_CONFLICT", "critical", "Booking recovery identifiers disagree", key, field, "contradictory identity references");
      });
    });
    ctx.scanned.bookingTransactions = count;
  }

  function countsForInputs(ctx) {
    var idx = ctx.indexes;
    return {
      workspace: {
        people: Object.keys(idx.people).length,
        leads: Object.keys(idx.leads).length,
        encounters: Object.keys(idx.encounters).length,
        investigations: Object.keys(idx.investigations).length,
        vehicles: Object.keys(idx.vehicles).length,
        locations: Object.keys(idx.locations).length,
        businesses: Object.keys(idx.businesses).length,
        entities: Object.keys(idx.entities).length,
        associations: Object.keys(idx.associations).length,
        operations: Object.keys(idx.operations).length
      },
      admin: {
        officers: list(idx.admin.officers).length,
        vehicles: list(idx.admin.vehicles).length,
        shifts: list(idx.admin.shifts).length
      },
      bookin: { records: idx.bookinRows.length },
      bookingTransactions: { transactions: ctx.scanned.bookingTransactions || 0 },
      media: { metadata: idx.mediaRows.length, blobKeys: idx.blobKeys.length }
    };
  }

  function finalizeReport(ctx) {
    var severityOrder = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
    ctx.findings.sort(function (a, b) {
      return severityOrder[a.severity] - severityOrder[b.severity] ||
        a.ruleId.localeCompare(b.ruleId) || a.findingId.localeCompare(b.findingId);
    });
    var counts = {
      critical: ctx.findingCounts.critical,
      high: ctx.findingCounts.high,
      medium: ctx.findingCounts.medium,
      low: ctx.findingCounts.low,
      info: ctx.findingCounts.info
    };
    var byCategory = Object.create(null);
    Object.keys(ctx.categoryCounts).sort().forEach(function (category) {
      byCategory[category] = ctx.categoryCounts[category];
    });
    var status = counts.critical ? "unsafe" : (counts.high || counts.medium ? "attention" : "pass");
    var inputCounts = countsForInputs(ctx);
    var registered = ctx.snapshot.stores.map(function (row) {
      var item = { id: row.id, key: row.key, medium: row.medium, status: row.status };
      if (typeof row.characters === "number") item.characters = row.characters;
      if (row.error) item.error = row.error;
      return item;
    });
    return {
      schema: REPORT_SCHEMA,
      scanner: { version: SCANNER_VERSION, ruleset: RULESET_VERSION },
      generatedAt: ctx.options.now || ctx.snapshot.capturedAt || new Date().toISOString(),
      readOnly: true,
      inputs: {
        workspace: reportInput(ctx.snapshot.workspace, inputCounts.workspace),
        admin: reportInput(ctx.snapshot.admin, inputCounts.admin),
        bookin: reportInput(ctx.snapshot.bookin, inputCounts.bookin),
        bookingTransactions: reportInput(ctx.snapshot.bookingTransactions, inputCounts.bookingTransactions),
        media: reportInput(ctx.snapshot.media, inputCounts.media),
        registered: registered
      },
      summary: {
        status: status,
        totalFindings: ctx.totalFindings,
        retainedFindings: ctx.findings.length,
        suppressedFindings: ctx.suppressedFindings,
        counts: counts,
        byCategory: byCategory,
        scanned: ctx.scanned,
        blockedChecks: ctx.blockedChecks.slice().sort()
      },
      findings: ctx.findings
    };
  }

  function scanSnapshot(input, options) {
    var snapshot = normalizeSnapshot(input);
    var ctx = createContext(snapshot, options);
    scanRootShapes(ctx);
    createIndexes(ctx);
    scanWorkspaceIdentifiers(ctx);
    scanAdminIdentifiers(ctx);
    scanLeadPersonIntegrity(ctx);
    scanPersonEncounterReverse(ctx);
    scanEncounters(ctx);
    scanBookingsAndArrests(ctx);
    scanBookingTransactions(ctx);
    scanAssociations(ctx);
    scanInvestigations(ctx);
    scanOperations(ctx);
    scanAdminReferences(ctx);
    scanMedia(ctx);
    scanExplicitMediaReferences(ctx);
    scanNarratives(ctx);
    list(options && options.nonAtomicChanges).forEach(function (change) {
      finding(ctx, "NON_ATOMIC_SNAPSHOT", "high", "storage", "Persistence changed while the scan was being captured",
        [{ store: change.id, type: "STORE", path: change.key || change.id }],
        [{ store: change.id, path: change.key || change.id, expected: "unchanged during capture", actual: "fingerprint changed" }],
        "Run the scan again after saves and other COPDoc windows are idle.");
    });
    return finalizeReport(ctx);
  }

  function changedRegisteredStores(before, after) {
    var second = Object.create(null);
    list(after && after.stores).forEach(function (row) { second[row.id] = row; });
    var changes = [];
    list(before && before.stores).forEach(function (row) {
      var next = second[row.id];
      if (!next || row.status !== next.status || row.fingerprint !== next.fingerprint) {
        changes.push({ id: row.id, key: row.key });
      }
    });
    return changes;
  }

  function scanCurrent(options) {
    var first = captureRegisteredStorage();
    return readExistingMediaSnapshot().then(function (firstMedia) {
      var second = captureRegisteredStorage();
      return readExistingMediaSnapshot().then(function (secondMedia) {
        var changes = changedRegisteredStores(first, second);
        if (firstMedia.status !== secondMedia.status || firstMedia.fingerprint !== secondMedia.fingerprint) {
          changes.push({ id: "media", key: MEDIA_DB_NAME });
        }
        return scanSnapshot({
          capturedAt: first.capturedAt,
          stores: first.stores,
          media: firstMedia
        }, {
          now: options && options.now,
          nonAtomicChanges: changes
        });
      });
    });
  }

  /** Download exactly the privacy-safe report; returns JSON in non-DOM tests. */
  function downloadReport(report, filename) {
    if (!report || report.schema !== REPORT_SCHEMA || report.readOnly !== true) {
      throw new Error("Integrity report is invalid and was not downloaded.");
    }
    var json = JSON.stringify(report, null, 2) + "\n";
    if (!global.document || !global.URL || typeof global.Blob !== "function") return json;
    var blob = new global.Blob([json], { type: "application/json" });
    var url = global.URL.createObjectURL(blob);
    var link = global.document.createElement("a");
    link.href = url;
    var stamp = String(report.generatedAt || new Date().toISOString())
      .replace(/[^0-9]/g, "")
      .slice(0, 14);
    link.download = filename || "COPDoc_integrity_report_" + stamp + ".json";
    link.hidden = true;
    (global.document.body || global.document.documentElement).appendChild(link);
    link.click();
    link.remove();
    global.setTimeout(function () { global.URL.revokeObjectURL(url); }, 0);
    return link.download;
  }

  root.integrity = Object.freeze({
    REPORT_SCHEMA: REPORT_SCHEMA,
    RULESET_VERSION: RULESET_VERSION,
    SCANNER_VERSION: SCANNER_VERSION,
    captureRegisteredStorage: captureRegisteredStorage,
    scanSnapshot: scanSnapshot,
    scanCurrent: scanCurrent,
    downloadReport: downloadReport
  });
})(typeof window !== "undefined" ? window : globalThis);
