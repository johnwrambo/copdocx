/** Compatibility entry point: compose the Encounter Narrative projection with live repositories. */
(function (global) {
  "use strict";
  var root = global.COPDoc = global.COPDoc || {};
  if (!root.projections || !root.projections.createEncounterNarrative) {
    throw new Error("Load the Encounter Narrative projection before its application adapter.");
  }
  root.encounterNarrative = root.projections.createEncounterNarrative({
    getModel: function () { return root.model; },
    readBookins: function () { return root.repositories.bookin.readAll(); },
    readAdmin: function () { return root.repositories.admin.readSnapshot(); },
    readSettings: function () { return root.repositories.preferences.readSettings(); },
    countries: global.COUNTRIES || [],
    immigrationDispositions: global.IMMIGRATION_DISPOSITIONS || []
  });
})(typeof window !== "undefined" ? window : globalThis);
