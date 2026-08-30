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
      leads: {}
    };
  }

  var state = emptyState();

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function readDisk() {
    if (typeof localStorage === "undefined") {
      return null;
    }
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return null;
      }
      return JSON.parse(raw);
    } catch (err) {
      return null;
    }
  }

  function writeDisk() {
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

  function loadFromDisk() {
    var disk = readDisk();
    if (disk && disk.leads) {
      state = disk;
      state.people = state.people || {};
      state.leads = state.leads || {};
    }
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
   * Save a snapshot as-is. No completeness check. Empty leads are fine.
   * Returns { ok, leadId, error }.
   */
  function saveLead(snapshot) {
    if (!snapshot || !snapshot.leadId) {
      return { ok: false, leadId: "", error: "Snapshot is missing a leadId." };
    }
    snapshot.schema = snapshot.schema || model.SCHEMA;
    snapshot.meta = snapshot.meta || {};
    snapshot.meta.updatedAt = model.nowIso();
    if (!snapshot.meta.createdAt) {
      snapshot.meta.createdAt = snapshot.meta.updatedAt;
    }
    snapshot.meta.markedComplete = false;
    state.leads[snapshot.leadId] = clone(snapshot);
    state.currentLeadId = snapshot.leadId;
    rememberPeople(snapshot);
    if (!writeDisk()) {
      return {
        ok: false,
        leadId: snapshot.leadId,
        error: "Could not write localStorage (quota or private mode)."
      };
    }
    return { ok: true, leadId: snapshot.leadId, error: "" };
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
      return;
    }
    state.people[person.personId] = clone(person);
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
    getCurrentLeadId: function () {
      return state.currentLeadId || "";
    },
    setCurrentLeadId: function (leadId) {
      state.currentLeadId = leadId || "";
      writeDisk();
    },
    getState: function () {
      return clone(state);
    }
  };
})(typeof window !== "undefined" ? window : globalThis);
