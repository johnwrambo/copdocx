/**
 * Field encounter aggregate (stop / arrest event).
 * Not Person RAP createEncounter.
 */
(function (global) {
  "use strict";

  var root = (global.COPDoc = global.COPDoc || {});
  var model = (root.model = root.model || {});

  function padDay(value) {
    return String(value).length < 2 ? "0" + value : String(value);
  }

  function nextEncounterId(opts) {
    opts = opts || {};
    var office = String(opts.office || "DAL")
      .replace(/[^A-Za-z]/g, "")
      .toUpperCase() || "DAL";
    var teamNum = parseInt(opts.team, 10);
    if (!isFinite(teamNum) || teamNum < 1) {
      teamNum = 3;
    }
    var when = opts.date instanceof Date ? opts.date : new Date();
    var stamp =
      String(when.getFullYear()) +
      padDay(when.getMonth() + 1) +
      padDay(when.getDate());
    var prefix = office + String(teamNum) + "-" + stamp + "-";
    var max = 0;
    (opts.existingIds || []).forEach(function (id) {
      var text = String(id || "");
      if (text.indexOf(prefix) !== 0) {
        return;
      }
      var seq = parseInt(text.slice(prefix.length), 10);
      if (isFinite(seq) && seq > max) {
        max = seq;
      }
    });
    var next = String(max + 1);
    while (next.length < 3) {
      next = "0" + next;
    }
    return prefix + next;
  }

  function createEncounterSubject(extra) {
    return model.assign(
      {
        personId: "",
        leadId: "",
        bookinRecordId: "",
        lastName: "",
        firstName: "",
        alienNumber: "",
        encounterRole: ""
      },
      extra
    );
  }

  function createEncounterRecord(extra) {
    extra = extra || {};
    var now = model.nowIso ? model.nowIso() : new Date().toISOString();
    var built = model.assign(
      {
        encounterId:
          extra.encounterId ||
          (model.nextEncounterId
            ? model.nextEncounterId({
                office: extra.officeCode || extra.office || "DAL",
                team: extra.team || 3,
                date: extra.date,
                existingIds: extra.existingIds || []
              })
            : model.newId
              ? model.newId("enc")
              : "enc"),
        entityType: "ENCOUNTER",
        schema: "copdocx.encounter.v1",
        officeCode: extra.officeCode || extra.office || "DAL",
        team: extra.team != null && extra.team !== "" ? String(extra.team) : "3",
        startedAt: "",
        vehicles: [],
        locations: [],
        subjects: [],
        narratives: [],
        supervisorSummary: {
          text: "",
          derivedAt: "",
          coverage: null
        },
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
    delete built.existingIds;
    delete built.date;
    delete built.office;
    if (!Array.isArray(built.vehicles)) {
      built.vehicles = [];
    }
    if (!Array.isArray(built.locations)) {
      built.locations = [];
    }
    if (!Array.isArray(built.subjects)) {
      built.subjects = [];
    }
    if (!Array.isArray(built.narratives)) {
      built.narratives = [];
    }
    if (!built.supervisorSummary || typeof built.supervisorSummary !== "object") {
      built.supervisorSummary = { text: "", derivedAt: "", coverage: null };
    }
    return built;
  }

  model.nextEncounterId = nextEncounterId;
  model.createEncounterRecord = createEncounterRecord;
  model.createEncounterSubject = createEncounterSubject;
})(typeof window !== "undefined" ? window : globalThis);
