/**
 * Field encounter aggregate (stop / arrest event).
 * Not Person RAP createEncounter.
 */
(function (global) {
  "use strict";

  var root = (global.COPDoc = global.COPDoc || {});
  var model = (root.model = root.model || {});

  function createEncounterSubject(extra) {
    return model.assign(
      {
        personId: "",
        leadId: "",
        bookinRecordId: "",
        lastName: "",
        firstName: "",
        alienNumber: ""
      },
      extra
    );
  }

  function createEncounterRecord(extra) {
    extra = extra || {};
    var now = model.nowIso ? model.nowIso() : new Date().toISOString();
    var built = model.assign(
      {
        encounterId: model.newId ? model.newId("enc") : "enc",
        entityType: "ENCOUNTER",
        schema: "copdocx.encounter.v1",
        startedAt: "",
        vehicles: [],
        locations: [],
        subjects: [],
        meta: {
          createdAt: now,
          updatedAt: now,
          markedComplete: false,
          status: "draft",
          committedAt: ""
        }
      },
      extra
    );
    if (!Array.isArray(built.vehicles)) {
      built.vehicles = [];
    }
    if (!Array.isArray(built.locations)) {
      built.locations = [];
    }
    if (!Array.isArray(built.subjects)) {
      built.subjects = [];
    }
    return built;
  }

  model.createEncounterRecord = createEncounterRecord;
  model.createEncounterSubject = createEncounterSubject;
})(typeof window !== "undefined" ? window : globalThis);
