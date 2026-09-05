/** Validated document-generation receipt repository. Owns the existing ledger and lock. */
(function (global) {
  "use strict";
  var app = global.COPDoc = global.COPDoc || {};
  var repositories = app.repositories = app.repositories || {};
  repositories.createDocumentGenerations = function (deps) {
  var KEY = "copdocx.document-generations.v1";
  var LOCK = KEY + ":write";
  var MAX_RECORDS = 5000;
  var HASH = /^[a-f0-9]{64}$/;
  var ID = /^[A-Za-z0-9_.:-]{1,160}$/;
  var own = function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); };
  function fail(code, message) { var e = new Error(message); e.code = code; return e; }
  function object(v) { return !!v && typeof v === "object" && !Array.isArray(v); }
  function copy(v) { return JSON.parse(JSON.stringify(v)); }
  function timestamp(value) { return typeof value === "string" && isFinite(Date.parse(value)); }
  function validSource(s) {
    return object(s) && typeof s.type === "string" && typeof s.id === "string" &&
      !!s.type.trim() && !!s.id.trim() && s.type.length <= 80 && s.id.length <= 200 && ["canonical", "draft", "snapshot"].indexOf(s.authority) >= 0;
  }
  function validate(ledger) {
    if (!object(ledger) || ledger.schema !== KEY || ledger.version !== 1 ||
        !Number.isInteger(ledger.revision) || ledger.revision < 0 || !object(ledger.records) ||
        Object.keys(ledger.records).length > MAX_RECORDS) throw fail("LEDGER_INVALID", "Document history is unreadable or uses an unsupported schema. Run Data integrity before generating more documents.");
    Object.keys(ledger.records).forEach(function (id) {
      var r = ledger.records[id];
      if (!ID.test(id) || !object(r) || r.generationId !== id || typeof r.documentType !== "string" ||
          !object(r.template) || !HASH.test(r.inputHash) || !HASH.test(r.sourceFingerprint) || !HASH.test(r.templateHash) ||
          !timestamp(r.startedAt) || !Array.isArray(r.sources) || !r.sources.every(validSource) ||
          ["PENDING", "GENERATED", "FAILED"].indexOf(r.status) < 0 || !Array.isArray(r.deliveries) ||
          (r.status === "GENERATED" && (!HASH.test(r.outputHash) || !timestamp(r.generatedAt) || !Number.isInteger(r.outputBytes) || r.outputBytes < 0)) ||
          (r.status === "FAILED" && (!timestamp(r.failedAt) || typeof r.failureCode !== "string")) ||
          r.deliveries.some(function (d) { return !object(d) || !timestamp(d.at) ||
            ["clipboard", "download", "print", "save"].indexOf(d.method) < 0 ||
            ["SUBMITTED", "SUCCEEDED", "FAILED"].indexOf(d.status) < 0 || !HASH.test(d.outputHash); })) {
        throw fail("LEDGER_INVALID", "A document history record is invalid. It has been preserved for inspection.");
      }
    });
    return ledger;
  }
  function read() {
    var raw;
    try { raw = deps.storage.read("localStorage", KEY); }
    catch (e) { throw fail("LEDGER_READ_FAILED", "Document history could not be read."); }
    if (raw === null) return { schema: KEY, version: 1, revision: 0, records: {} };
    try { return validate(JSON.parse(raw)); }
    catch (e) { if (e.code) throw e; throw fail("LEDGER_INVALID", "Document history contains invalid JSON. Existing history was not changed."); }
  }
  async function mutate(change) {
    if (!deps.getLocks() || typeof deps.getLocks().request !== "function") {
      throw fail("LOCK_UNAVAILABLE", "Document history requires a browser with Web Locks support. Open COPDoc in a current secure browser context.");
    }
    return deps.getLocks().request(LOCK, { mode: "exclusive" }, function () {
      // Honor pending import recovery before adding any new durable output.
      if (deps.getImportWorkflow() && typeof deps.getImportWorkflow().assertWritable === "function") {
        var guard = deps.getImportWorkflow().assertWritable();
        if (!guard || !guard.ok) throw fail("IMPORT_BLOCKED", "Resume or roll back the pending import before generating documents.");
      }
      var ledger = read();
      var result = change(ledger);
      ledger.revision += 1;
      validate(ledger);
      try { deps.storage.write("localStorage", KEY, JSON.stringify(ledger)); }
      catch (e) { throw fail("LEDGER_WRITE_FAILED", "Document history could not be saved. Free storage or export a safety backup before retrying."); }
      return copy(result);
    });
  }
  return { storageKey: KEY, validate: validate, validSource: validSource, read: read, mutate: mutate,
    list: function () { var rows = read().records; return Object.keys(rows).map(function (id) { return copy(rows[id]); }).sort(function (a, b) { return b.startedAt.localeCompare(a.startedAt) || a.generationId.localeCompare(b.generationId); }); },
    get: function (id) { var rows = read().records; return own(rows, id) ? copy(rows[id]) : null; }
  };
  };
})(typeof window !== "undefined" ? window : globalThis);
