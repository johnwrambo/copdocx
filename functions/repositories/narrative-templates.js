/** Saved Narrative template library. The host supplies storage and template normalization. */
(function (global) {
  "use strict";

  function createNarrativeTemplates(options) {
    var deps = options || {};
    var normalize = typeof deps.normalize === "function" ? deps.normalize : function (record) { return record; };
    var currentKey = deps.currentKey || "opdoc.narrative.templates.v2";
    var legacyKey = deps.legacyKey || "opdoc.narrative.templates.v1";
    return Object.freeze({
      load: function () {
        try {
          var raw = deps.storage.read("localStorage", currentKey) || deps.storage.read("localStorage", legacyKey);
          var parsed = raw ? JSON.parse(raw) : [];
          var records = Array.isArray(parsed) ? parsed.reduce(function (output, record) {
            try { output.push(normalize(record)); } catch (error) { /* Unsupported templates remain excluded from the picker. */ }
            return output;
          }, []) : [];
          return { ok: true, records: records, error: "" };
        } catch (error) {
          return { ok: false, records: [], error: String(error && error.message || error) };
        }
      },
      save: function (records) {
        try {
          deps.storage.write("localStorage", currentKey, JSON.stringify(records));
          return { ok: true, error: "" };
        } catch (error) {
          return { ok: false, error: String(error && error.message || error) };
        }
      }
    });
  }

  var api = { createNarrativeTemplates: createNarrativeTemplates };
  if (typeof module === "object" && module.exports) module.exports = api;
  global.COPDoc = global.COPDoc || {};
  global.COPDoc.repositories = global.COPDoc.repositories || {};
  global.COPDoc.repositories.createNarrativeTemplates = createNarrativeTemplates;
  global.COPDoc.repositories.templateLibrary = function (normalize) {
    return createNarrativeTemplates({ storage: global.COPDoc.repositories.storage, normalize: normalize });
  };
})(typeof window !== "undefined" ? window : globalThis);
