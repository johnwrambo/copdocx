/**
 * Persistence for lead snapshots.
 *
 * Browser: localStorage key copdocx.store.v1
 * Node tests: in-memory only (no window.localStorage).
 *
 * The store is a dictionary of snapshots plus a people registry. The
 * registry is how "another saved person" shows up in link-card search —
 * every subject you have ever saved is a person you can link to.
 * Incomplete people stay in the registry. Linking never rewrites names.
 */

(function (global) {
  "use strict";

  var root = (global.COPDoc = global.COPDoc || {});
  var model = (root.model = root.model || {});
  var STORAGE_KEY = "copdocx.store.v1";

  function emptyState() {
    return {
      schema: model.STORE_SCHEMA || "copdocx.store.v1",
      currentLeadId: "",
      people: {},
      leads: {},
      encounters: {}
    };
  }

  var state = emptyState();
  var diskError = "";

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function normalizeState(next) {
    next = next || emptyState();
    next.schema = next.schema || model.STORE_SCHEMA || "copdocx.store.v1";
    next.people = next.people || {};
    next.leads = next.leads || {};
    next.encounters = next.encounters || {};
    next.currentLeadId = next.currentLeadId || "";
    Object.keys(next.leads).forEach(function (id) {
      if (typeof model.ensureRecordMeta === "function") {
        model.ensureRecordMeta(next.leads[id]);
      }
    });
    Object.keys(next.encounters).forEach(function (id) {
      if (typeof model.ensureRecordMeta === "function") {
        model.ensureRecordMeta(next.encounters[id]);
      }
    });
    return next;
  }

  function readDisk() {
    if (typeof localStorage === "undefined") {
      return { ok: true, missing: true, data: null, error: "" };
    }
    var raw = "";
    try {
      raw = localStorage.getItem(STORAGE_KEY) || "";
    } catch (err) {
      return {
        ok: false,
        missing: false,
        data: null,
        error: "Cannot read localStorage."
      };
    }
    if (!raw) {
      return { ok: true, missing: true, data: null, error: "" };
    }
    try {
      return { ok: true, missing: false, data: JSON.parse(raw), error: "" };
    } catch (err) {
      return {
        ok: false,
        missing: false,
        data: null,
        error:
          "Lead storage is damaged. Do not Save. Copy the site data out if you have a backup."
      };
    }
  }

  function writeDisk() {
    if (diskError) {
      return false;
    }
    if (typeof localStorage === "undefined") {
      return true;
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch (err) {
      return false;
    }
  }

  function adoptDisk() {
    var disk = readDisk();
    if (!disk.ok) {
      diskError = disk.error;
      return { ok: false, error: disk.error };
    }
    diskError = "";
    if (disk.data) {
      state = normalizeState(disk.data);
    }
    return { ok: true, error: "" };
  }

  function loadFromDisk() {
    adoptDisk();
    return state;
  }

  function rememberPeople(snapshot) {
    var subject = model.subjectOf ? model.subjectOf(snapshot) : snapshot.person;
    if (subject && subject.personId) {
      state.people[subject.personId] = clone(subject);
    }
    (snapshot.people || []).forEach(function (person) {
      if (person && person.personId) {
        state.people[person.personId] = clone(person);
      }
    });
  }

  /**
   * Save a snapshot. opts.mode: "draft" | "commit" (default commit).
   * Collect's meta does not win — previous committedAt is preserved on draft.
   * rememberPeople only on commit.
   */
  function saveLead(snapshot, opts) {
    if (!snapshot || !snapshot.leadId) {
      return { ok: false, leadId: "", error: "Snapshot is missing a leadId." };
    }
    var fresh = adoptDisk();
    if (!fresh.ok) {
      return { ok: false, leadId: snapshot.leadId, error: fresh.error };
    }
    var mode = (opts && opts.mode) || "commit";
    var previous = state.leads[snapshot.leadId]
      ? clone(state.leads[snapshot.leadId])
      : null;
    var record = previous ? Object.assign({}, previous, snapshot) : snapshot;
    record.schema = snapshot.schema || model.SCHEMA;
    record.leadId = snapshot.leadId;
    if (typeof model.stampMeta === "function") {
      record.meta = model.stampMeta(previous, mode);
    } else {
      record.meta = snapshot.meta || {};
      record.meta.updatedAt = model.nowIso();
    }
    record.meta.markedComplete = false;
    state.leads[record.leadId] = clone(record);
    state.currentLeadId = record.leadId;
    if (mode === "commit") {
      rememberPeople(record);
    }
    if (!writeDisk()) {
      adoptDisk();
      return {
        ok: false,
        leadId: record.leadId,
        error: "Could not write localStorage (quota or private mode)."
      };
    }
    return { ok: true, leadId: record.leadId, error: "" };
  }

  function getLead(leadId) {
    var snap = state.leads[leadId];
    return snap ? clone(snap) : null;
  }

  function listLeads() {
    return Object.keys(state.leads)
      .map(function (id) {
        var snap = state.leads[id];
        var subject = model.subjectOf ? model.subjectOf(snap) : snap.person;
        var name = model.formatPersonLabel(subject) || "Untitled lead";
        return {
          leadId: id,
          label: name,
          updatedAt: (snap.meta && snap.meta.updatedAt) || "",
          metaStatus: model.metaStatus ? model.metaStatus(snap) : "committed",
          subjectPersonId: snap.subjectPersonId
        };
      })
      .sort(function (a, b) {
        return String(b.updatedAt).localeCompare(String(a.updatedAt));
      });
  }

  function allPeople() {
    return Object.keys(state.people).map(function (id) {
      return clone(state.people[id]);
    });
  }

  function getPerson(personId) {
    var person = state.people[personId];
    return person ? clone(person) : null;
  }

  function upsertPerson(person) {
    if (!person || !person.personId) {
      return { ok: false, error: "Person is missing a personId." };
    }
    var fresh = adoptDisk();
    if (!fresh.ok) {
      return { ok: false, error: fresh.error };
    }
    state.people[person.personId] = clone(person);
    if (!writeDisk()) {
      adoptDisk();
      return {
        ok: false,
        error: "Could not write localStorage (quota or private mode)."
      };
    }
    return { ok: true, error: "" };
  }

  function saveEncounter(record, opts) {
    if (!record || !record.encounterId) {
      return {
        ok: false,
        encounterId: "",
        error: "Encounter is missing an encounterId."
      };
    }
    var fresh = adoptDisk();
    if (!fresh.ok) {
      return {
        ok: false,
        encounterId: record.encounterId,
        error: fresh.error
      };
    }
    var mode = (opts && opts.mode) || "commit";
    var previous = state.encounters[record.encounterId]
      ? clone(state.encounters[record.encounterId])
      : null;
    var saved = previous ? Object.assign({}, previous, record) : record;
    saved.schema = record.schema || "copdocx.encounter.v1";
    saved.encounterId = record.encounterId;
    if (typeof model.stampMeta === "function") {
      saved.meta = model.stampMeta(previous, mode);
    } else {
      saved.meta = record.meta || {};
      saved.meta.updatedAt = model.nowIso();
    }
    saved.meta.markedComplete = false;
    if (!Array.isArray(saved.vehicles)) {
      saved.vehicles = [];
    }
    if (!Array.isArray(saved.locations)) {
      saved.locations = [];
    }
    if (!Array.isArray(saved.subjects)) {
      saved.subjects = [];
    }
    if (!Array.isArray(saved.links)) {
      saved.links = [];
    }
    if (!Array.isArray(saved.narratives)) {
      saved.narratives = [];
    }
    if (!saved.supervisorSummary || typeof saved.supervisorSummary !== "object") {
      saved.supervisorSummary = { text: "", derivedAt: "", coverage: null };
    }
    state.encounters[saved.encounterId] = clone(saved);
    if (!writeDisk()) {
      adoptDisk();
      return {
        ok: false,
        encounterId: saved.encounterId,
        error: "Could not write localStorage (quota or private mode)."
      };
    }
    return { ok: true, encounterId: saved.encounterId, error: "" };
  }

  function getEncounter(encounterId) {
    var row = state.encounters[encounterId];
    return row ? clone(row) : null;
  }

  function dropOwnedMedia(encounter) {
    var media = root.media;
    if (!media || typeof media.removeByOwner !== "function" || !encounter) {
      return;
    }
    function forget(owner) {
      media.removeByOwner(owner).then(function () {}, function () {});
    }
    forget({ type: "ENCOUNTER", id: encounter.encounterId });
    (encounter.vehicles || []).forEach(function (vehicle) {
      if (vehicle && vehicle.vehicleId) {
        forget({ type: "VEHICLE", id: vehicle.vehicleId });
      }
    });
    (encounter.locations || []).forEach(function (location) {
      if (location && location.locationId) {
        forget({ type: "LOCATION", id: location.locationId });
      }
    });
  }

  function deleteEncounter(encounterId) {
    var fresh = adoptDisk();
    if (!fresh.ok) {
      return {
        ok: false,
        encounterId: encounterId || "",
        error: fresh.error
      };
    }
    if (!encounterId || !state.encounters[encounterId]) {
      return { ok: false, encounterId: encounterId || "", error: "Encounter not found." };
    }
    var doomed = clone(state.encounters[encounterId]);
    delete state.encounters[encounterId];
    if (!writeDisk()) {
      adoptDisk();
      return {
        ok: false,
        encounterId: encounterId,
        error: "Could not write localStorage (quota or private mode)."
      };
    }
    dropOwnedMedia(doomed);
    return { ok: true, encounterId: encounterId, error: "" };
  }

  function listEncounters() {
    return Object.keys(state.encounters)
      .map(function (id) {
        var row = state.encounters[id];
        return {
          encounterId: id,
          startedAt: row.startedAt || "",
          updatedAt: (row.meta && row.meta.updatedAt) || "",
          metaStatus: model.metaStatus ? model.metaStatus(row) : "committed",
          subjects: (row.subjects || []).slice(),
          vehicles: (row.vehicles || []).slice(),
          locations: (row.locations || []).slice()
        };
      })
      .sort(function (a, b) {
        return String(b.updatedAt).localeCompare(String(a.updatedAt));
      });
  }

  model.store = {
    STORAGE_KEY: STORAGE_KEY,
    loadFromDisk: loadFromDisk,
    saveLead: saveLead,
    getLead: getLead,
    listLeads: listLeads,
    allPeople: allPeople,
    getPerson: getPerson,
    upsertPerson: upsertPerson,
    saveEncounter: saveEncounter,
    getEncounter: getEncounter,
    deleteEncounter: deleteEncounter,
    listEncounters: listEncounters,
    getCurrentLeadId: function () {
      return state.currentLeadId || "";
    },
    setCurrentLeadId: function (leadId) {
      var fresh = adoptDisk();
      if (!fresh.ok) {
        return;
      }
      state.currentLeadId = leadId || "";
      if (!writeDisk()) {
        adoptDisk();
      }
    },
    getState: function () {
      return clone(state);
    },
    diskError: function () {
      return diskError;
    }
  };

  if (typeof window !== "undefined" && window.addEventListener) {
    window.addEventListener("storage", function (event) {
      if (event.key !== STORAGE_KEY) {
        return;
      }
      adoptDisk();
    });
  }
})(typeof window !== "undefined" ? window : globalThis);
