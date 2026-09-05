/** Pure, lossless decoder for standalone Alien Book-In records exports. */
(function (global) {
  "use strict";
  var FORMAT = "alien-book-in-records";
  var MAX_BYTES = 32 * 1024 * 1024;
  var MAX_RECORDS = 5000;
  var MAX_FIELD = 100000;
  var ID_KEYS = ["id", "bookingId", "bookinRecordId", "personId", "leadId", "subjectId", "encounterSubjectId", "arrestId", "encounterId"];
  function owns(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function plain(o) { return Boolean(o && typeof o === "object" && !Array.isArray(o)); }
  function text(v) { return String(v == null ? "" : v).trim(); }
  function fail(message) { throw new Error(message); }
  function safeTree(value, depth) {
    if (depth > 40) fail("Import data is nested too deeply.");
    if (value === null || typeof value === "string" || typeof value === "boolean") return;
    if (typeof value === "number") { if (!Number.isFinite(value)) fail("Import contains a non-finite number."); return; }
    if (typeof value !== "object") fail("Import contains a value that cannot be represented as JSON.");
    Object.keys(value).forEach(function (key) {
      if (key === "__proto__" || key === "prototype" || key === "constructor") fail("Import contains an unsafe property name.");
      safeTree(value[key], depth + 1);
    });
  }
  function scalar(v, label, limit) {
    if (v !== null && ["string", "number", "boolean"].indexOf(typeof v) === -1) fail(label + " must be a scalar value.");
    if (String(v == null ? "" : v).length > (limit || MAX_FIELD)) fail(label + " is too long.");
  }
  function aliases(record, keys, label) {
    var values = [];
    keys.forEach(function (key) {
      if (owns(record, key) && text(record[key]) && values.indexOf(text(record[key])) === -1) values.push(text(record[key]));
    });
    if (values.length > 1) fail(label + " contains contradictory " + keys.join(" / ") + " identifiers.");
  }
  function changedSuppliedValues(original, normalized) {
    if (original === null || typeof original !== "object") return original !== normalized;
    if (!normalized || typeof normalized !== "object") return true;
    return Object.keys(original).some(function (key) { return changedSuppliedValues(original[key], normalized[key]); });
  }
  function normalizeCard(raw, label, findings) {
    if (raw == null) return raw;
    if (!plain(raw)) fail(label + " baseball card must be an object.");
    if (owns(raw, "version") && (!Number.isInteger(Number(raw.version)) || Number(raw.version) < 1 || Number(raw.version) > 2)) fail(label + " baseball card uses an unsupported version.");
    ["fields", "layout", "photoAdjustments"].forEach(function (key) {
      if (owns(raw, key) && raw[key] != null && !plain(raw[key])) fail(label + " baseball card " + key + " is invalid.");
    });
    if (owns(raw, "criminalHistory") && !Array.isArray(raw.criminalHistory)) fail(label + " baseball card criminal history is invalid.");
    if ((raw.criminalHistory || []).length > 500) fail(label + " baseball card criminal history is too large.");
    (raw.criminalHistory || []).forEach(function (row) { if (!plain(row)) fail(label + " baseball card criminal history contains a non-object row."); });
    if (raw.content != null) {
      if (!plain(raw.content) || (owns(raw.content, "bullets") && !Array.isArray(raw.content.bullets))) fail(label + " baseball card content is invalid.");
      if ((raw.content.bullets || []).length > 200) fail(label + " baseball card has too many bullets.");
    }
    if (raw.photoDataUrl && (typeof raw.photoDataUrl !== "string" || raw.photoDataUrl.length > 12 * 1024 * 1024 || !/^data:image\/(?:png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/.test(raw.photoDataUrl))) fail(label + " baseball card photo must be an embedded supported image.");
    var api = global.COPDoc && global.COPDoc.baseball;
    if (!api || typeof api.normalizeState !== "function") {
      findings.push({ code: "CARD_RENDERER_REQUIRED", severity: "review", message: "The baseball card compatibility module must load before this import can be applied." });
      return raw;
    }
    var normalized = api.normalizeState(raw);
    if (normalized && normalized.ok === false) fail(normalized.error || label + " baseball card is invalid.");
    if (normalized && normalized.ok === true && normalized.state) normalized = normalized.state;
    if (!plain(normalized)) fail(label + " baseball card could not be normalized.");
    // Retain future/extension data while applying the current card contract.
    var result = Object.assign({}, raw, normalized);
    ["fields", "layout", "photoAdjustments", "content"].forEach(function (key) {
      if (plain(raw[key]) && plain(normalized[key])) result[key] = Object.assign({}, raw[key], normalized[key]);
    });
    if (Array.isArray(raw.criminalHistory) && Array.isArray(normalized.criminalHistory)) result.criminalHistory = normalized.criminalHistory.map(function (row, i) { return Object.assign({}, raw.criminalHistory[i] || {}, row); });
    return result;
  }
  function decode(input, options) {
    options = options || {};
    try {
      var rawText = typeof input === "string" ? input : JSON.stringify(input);
      if (!rawText || rawText.length > MAX_BYTES || (typeof TextEncoder !== "undefined" && new TextEncoder().encode(rawText).length > MAX_BYTES)) fail("The import exceeds the 32 MiB limit.");
      var payload;
      try { payload = JSON.parse(rawText); } catch (_) { fail("The selected file is not valid JSON."); }
      safeTree(payload, 0);
      if (!plain(payload) || payload.format !== FORMAT) fail("The selected file is not an Alien Book-In records backup.");
      var findings = [];
      var version = Number(payload.schemaVersion);
      if (!owns(payload, "schemaVersion")) {
        if (!options.allowUnversionedLegacy) fail("This Book-In backup has no schemaVersion. Select the explicit legacy import option to inspect it as schema 1.");
        version = 1;
        findings.push({ code: "UNVERSIONED_LEGACY", severity: "warning", message: "The file has no schemaVersion; the explicit legacy option treats it as schema 1." });
      }
      if (!Number.isInteger(version) || version < 1 || version > 5) fail("Unsupported Book-In records schema " + text(payload.schemaVersion) + "; supported versions are 1 through 5.");
      if (!Array.isArray(payload.records)) fail("The records backup does not contain a records list.");
      if (payload.records.length > MAX_RECORDS) fail("The backup contains more than 5,000 records.");
      if (owns(payload, "recordCount") && (!Number.isInteger(payload.recordCount) || payload.recordCount !== payload.records.length)) fail("The backup recordCount does not match its records list.");
      var source = { format: FORMAT, schemaVersion: version, appVersion: text(payload.appVersion), exportedAt: text(payload.exportedAt) };
      var metadata = {};
      Object.keys(payload).forEach(function (key) { if (["format", "schemaVersion", "appVersion", "exportedAt", "recordCount", "records", "canonicalContext", "media"].indexOf(key) === -1) metadata[key] = payload[key]; });
      if (owns(payload, "media") && !Array.isArray(payload.media)) fail("The backup Media bundle must be a list.");
      if (Object.keys(metadata).length) source.metadata = metadata;
      var seen = Object.create(null);
      var records = payload.records.map(function (row, index) {
        var label = "Imported record " + (index + 1);
        if (!plain(row)) fail(label + " is not a valid object.");
        if (typeof row.id !== "string" || !text(row.id) || text(row.id).length > 200) fail(label + " has an invalid record ID.");
        ID_KEYS.forEach(function (key) { if (owns(row, key) && row[key] != null && (typeof row[key] !== "string" || text(row[key]).length > 200)) fail(label + " has an invalid " + key + "."); });
        aliases(row, ["id", "bookingId", "bookinRecordId"], label);
        aliases(row, ["subjectId", "encounterSubjectId"], label);
        row.id = text(row.id);
        if (seen[row.id]) fail("The import contains duplicate record ID " + row.id + ".");
        seen[row.id] = true;
        if (owns(row, "revision") && (!Number.isInteger(row.revision) || row.revision < 0)) fail(label + " has an invalid revision.");
        if (owns(row, "formState") && !plain(row.formState)) fail(label + " has invalid formState data.");
        Object.keys(row.formState || {}).forEach(function (id) {
          var field = row.formState[id];
          if (!plain(field)) fail(label + " form field " + id + " is invalid.");
          if (owns(field, "value")) scalar(field.value, label + " form field " + id);
          if (owns(field, "checked") && typeof field.checked !== "boolean") fail(label + " form field " + id + " has invalid checked state.");
          if (owns(field, "type") && typeof field.type !== "string") fail(label + " form field " + id + " has invalid type.");
        });
        ["firstName", "lastName", "aNumber", "fbiNumber", "iceEvent", "encounterNumber", "dateTime", "arrestTime", "dateOfBirth", "countryOfCitizenship", "caseType", "subjectRole", "vehiclePosition", "team"].forEach(function (key) { if (owns(row, key)) scalar(row[key], label + " " + key); });
        ["createdAt", "updatedAt"].forEach(function (key) { if (owns(row, key) && row[key] && (typeof row[key] !== "string" || !Number.isFinite(Date.parse(row[key])))) fail(label + " has an invalid " + key + "."); });
        var originalCard = row.baseballCard;
        if (owns(row, "baseballCard")) row.baseballCard = normalizeCard(row.baseballCard, label, findings);
        var disposition = text(row.caseType || (row.formState && row.formState.case_type && row.formState.case_type.value)).toUpperCase();
        var outcome = text(row.outcome || row.finalOutcome).toUpperCase();
        if ((/^(NIC|NOT IN CUSTODY)(?:\b|$)/.test(disposition) || (outcome && outcome !== "ARRESTED")) && !row.voidedAt) findings.push({ code: "CUSTODY_REVIEW", severity: "review", recordId: row.id, message: "This record does not establish an arrested booking. Keep it as a draft or explicitly confirm its booking outcome; an Encounter outcome will not be invented." });
        row.importSource = Object.assign({}, plain(row.importSource) ? row.importSource : {}, source, { recordId: row.id });
        if (originalCard && changedSuppliedValues(originalCard, row.baseballCard) && !row.importSource.originalBaseballCard) row.importSource.originalBaseballCard = originalCard;
        return row;
      });
      return { ok: true, kind: "bookin", format: FORMAT, schema: version, schemaVersion: version, records: records, canonicalContext: payload.canonicalContext || null, media: payload.media || [], source: source, findings: findings, error: "" };
    } catch (error) { return { ok: false, records: [], findings: [], error: error.message || String(error) }; }
  }
  var api = { FORMAT: FORMAT, MIN_SCHEMA: 1, MAX_SCHEMA: 5, MAX_BYTES: MAX_BYTES, MAX_RECORDS: MAX_RECORDS, decode: decode,
    validateStructure: function (value) { safeTree(value, 0); return true; } };
  (global.COPDoc = global.COPDoc || {}).importSchema = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
