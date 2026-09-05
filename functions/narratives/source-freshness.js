/**
 * Narrative source comparison. Pure, synchronous and independent of storage.
 * The fingerprint detects changed inputs; it is not a security signature.
 */
(function (global, factory) {
  "use strict";
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  var root = (global.COPDoc = global.COPDoc || {});
  root.narrativeSource = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var SCHEMA = "copdocx.narrative-source.v1";
  var BOOKKEEPING = [
    "meta", "createdAt", "updatedAt", "generatedAt", "capturedAt",
    "encounterRevision", "narratives", "narrativesInitial", "supervisorSummary"
  ];

  function text(value) {
    return value == null ? "" : String(value).trim();
  }

  function stableValue(value) {
    if (Array.isArray(value)) return value.map(stableValue);
    if (!value || typeof value !== "object") {
      return value === undefined ? null : value;
    }
    var result = Object.create(null);
    Object.keys(value).sort().forEach(function (key) {
      if (value[key] !== undefined) result[key] = stableValue(value[key]);
    });
    return result;
  }

  function stableStringify(value) {
    return JSON.stringify(stableValue(value));
  }

  function record(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    var result = Object.create(null);
    Object.keys(value).forEach(function (key) {
      if (BOOKKEEPING.indexOf(key) === -1) result[key] = stableValue(value[key]);
    });
    // Identity capture time is provenance metadata. Actual Encounter/outcome/
    // event times remain in the projection and must invalidate stale drafts.
    if (result.identitySnapshot) result.identitySnapshot = record(result.identitySnapshot);
    if (result.immigrationSnapshot) result.immigrationSnapshot = record(result.immigrationSnapshot);
    return result;
  }

  function records(rows) {
    return (Array.isArray(rows) ? rows : []).map(record);
  }

  function projection(bundle, focusId) {
    bundle = bundle || {};
    return {
      schema: SCHEMA,
      focusSubjectId: text(focusId),
      encounter: record(bundle.encounter),
      operation: record(bundle.operation),
      participants: records(bundle.participants),
      events: records(bundle.events),
      encounterVehicles: records(bundle.encounterVehicles),
      vehicles: records(bundle.vehicles),
      location: record(bundle.location || bundle.primaryLocation),
      officers: records(bundle.officers),
      // Extra facts used to seed choices, intentionally supplied by the same
      // adapter that supplies the engine packet. Never read the live store here.
      sourceFacts: stableValue(bundle.sourceFacts || {})
    };
  }

  function fingerprint(value) {
    var source = stableStringify(value);
    var first = 0x811c9dc5;
    var second = 0x9e3779b9;
    for (var i = 0; i < source.length; i += 1) {
      first = Math.imul(first ^ source.charCodeAt(i), 0x01000193);
      second = Math.imul(second ^ source.charCodeAt(source.length - i - 1), 0x01000193);
    }
    return "fnv1a-pair-" +
      (first >>> 0).toString(16).padStart(8, "0") +
      (second >>> 0).toString(16).padStart(8, "0") +
      "-" + source.length;
  }

  function capture(bundle, focusId) {
    var encounterId = text(bundle && bundle.encounter && bundle.encounter.encounterId);
    var focus = text(focusId);
    if (!encounterId || (bundle && bundle.sourceUnavailable === true) ||
        !Array.isArray(bundle && bundle.participants)) return null;
    if (focus) {
      var matches = bundle.participants.filter(function (row) {
        if (!row) return false;
        var canonical = text(row.encounterParticipantId || row.subjectId);
        return canonical === focus;
      });
      if (matches.length !== 1) return null;
      var matched = matches[0];
      if (matched.subjectId && text(matched.subjectId) !== focus) return null;
      if (matched.encounterId && text(matched.encounterId) !== encounterId) return null;
    }
    return {
      schema: SCHEMA,
      encounterId: encounterId,
      focusSubjectId: focus,
      fingerprint: fingerprint(projection(bundle, focus))
    };
  }

  function valid(snapshot) {
    return !!(snapshot && snapshot.schema === SCHEMA &&
      text(snapshot.encounterId) &&
      typeof snapshot.focusSubjectId === "string" &&
      /^fnv1a-pair-[0-9a-f]{16}-\d+$/.test(snapshot.fingerprint || ""));
  }

  function evaluate(saved, current) {
    if (!valid(saved) || !valid(current)) return "UNKNOWN";
    return saved.encounterId === current.encounterId &&
      saved.focusSubjectId === current.focusSubjectId &&
      saved.fingerprint === current.fingerprint ? "CURRENT" : "STALE";
  }

  return Object.freeze({
    schema: SCHEMA,
    capture: capture,
    evaluate: evaluate,
    projection: projection,
    stableStringify: stableStringify
  });
});
