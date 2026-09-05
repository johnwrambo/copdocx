/**
 * Canonical registry precedence and three-way Case edits, extracted from the workspace store.
 * Dependencies are explicit; this module never reads browser storage or DOM.
 */
(function (global) {
  "use strict";
  var root = (global.COPDoc = global.COPDoc || {});
  var namespace = (root.domain = root.domain || {});

  namespace.createCanonicalRecords = function (dependencies) {
    var model = dependencies.model;
    var clone = dependencies.clone;
    var getWorkspace = dependencies.getWorkspace;

    function mergeRecord(previous, incoming) {
      var merged = previous ? clone(previous) : {};
      Object.keys(incoming || {}).forEach(function (key) {
        var next = incoming[key];
        var prior = merged[key];
        if (
          next &&
          prior &&
          typeof next === "object" &&
          typeof prior === "object" &&
          !Array.isArray(next) &&
          !Array.isArray(prior)
        ) {
          merged[key] = mergeRecord(prior, next);
        } else {
          merged[key] = next;
        }
      });
      return merged;
    }

    function canonicalPersonRecord(person, previous) {
      var merged = mergeRecord(previous, person);
      return typeof model.createPerson === "function"
        ? model.createPerson(merged)
        : merged;
    }

    function matchingById(list, idKey, id) {
      var rows = Array.isArray(list) ? list : [];
      var i;
      for (i = 0; i < rows.length; i++) {
        if (rows[i] && (rows[i][idKey] || rows[i].id) === id) {
          return rows[i];
        }
      }
      return null;
    }

    function canonicalLocationRecord(location, previous) {
      var canonicalId = location && (location.locationId || location.id);
      if (canonicalId && getWorkspace().locations[canonicalId]) {
        return clone(getWorkspace().locations[canonicalId]);
      }
      var merged = mergeRecord(previous, location);
      return typeof model.createLocation === "function"
        ? model.createLocation(merged)
        : merged;
    }

    function canonicalVehicleRecord(vehicle, previous) {
      var canonicalId = vehicle && (vehicle.vehicleId || vehicle.id);
      if (canonicalId && getWorkspace().vehicles[canonicalId]) {
        var canonicalVehicle = clone(getWorkspace().vehicles[canonicalId]);
        canonicalVehicle.locations = (canonicalVehicle.locations || []).map(function (location) { return canonicalLocationRecord(location, null); });
        return canonicalVehicle;
      }
      var merged = mergeRecord(previous, vehicle);
      var built = typeof model.createVehicle === "function"
        ? model.createVehicle(merged)
        : merged;
      var previousLocations = (previous && previous.locations) || [];
      built.locations = (built.locations || []).map(function (location) {
        var id = location && (location.locationId || location.id);
        var old = id
          ? matchingById(previousLocations, "locationId", id) || getWorkspace().locations[id]
          : null;
        return canonicalLocationRecord(location, old);
      });
      return built;
    }

    function canonicalLeadGraph(record, previous) {
      var previousSubject = previous && model.subjectOf
        ? model.subjectOf(previous)
        : previous && previous.person;
      var subject = model.subjectOf ? model.subjectOf(record) : record.person;
      if (subject) {
        var subjectId = subject.personId || record.subjectPersonId || "";
        if (!subject.personId && subjectId) {
          subject.personId = subjectId;
        }
        var knownSubject = (subjectId && getWorkspace().people[subjectId]) || (
          previousSubject &&
          (!subjectId || previousSubject.personId === subjectId)
            ? previousSubject
            : null);
        subject = canonicalPersonRecord(subject, knownSubject);
        var previousLocations = (knownSubject && knownSubject.locations) || [];
        subject.locations = (subject.locations || []).map(function (location) {
          var id = location && (location.locationId || location.id);
          var old = id
            ? matchingById(previousLocations, "locationId", id) || getWorkspace().locations[id]
            : null;
          return canonicalLocationRecord(location, old);
        });
        record.person = subject;
        record.subjectPersonId = subject.personId;
        record.caseRole = record.caseRole || subject.caseRole || "LEAD";
        subject.caseRole = record.caseRole;
      }
      record.source = typeof model.createSource === "function"
        ? model.createSource(record.source || {})
        : record.source || {};
      var previousVehicles = (previous && previous.vehicles) || [];
      record.vehicles = (Array.isArray(record.vehicles) ? record.vehicles : []).map(
        function (vehicle) {
          var id = vehicle && (vehicle.vehicleId || vehicle.id);
          var old = id
            ? matchingById(previousVehicles, "vehicleId", id) || getWorkspace().vehicles[id]
            : null;
          return canonicalVehicleRecord(vehicle, old);
        }
      );
      record.links = (Array.isArray(record.links) ? record.links : []).map(
        function (link) {
          return typeof model.createLink === "function"
            ? model.createLink(link || {})
            : link;
        }
      );
      ["followUps", "history"].forEach(function (key) {
        if (!Array.isArray(record[key])) {
          record[key] = [];
        }
      });
      return record;
    }

    // A Case edits a Person; its last embedded copy is the edit baseline, never
    // the authority for fields updated by another workflow since that baseline.
    function mergeCasePerson(incoming, baseline, canonical, allowArrests) {
      var conflict = "";
      function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
      function apply(current, old, next, path) {
        var result = current && typeof current === "object" ? clone(current) : {};
        Object.keys(next || {}).forEach(function (key) {
          if (!path && (key === "encounters" || (key === "arrests" && !allowArrests) || key === "objectRevision" || key === "meta")) {
            return;
          }
          var value = next[key];
          var prior = old && old[key];
          var existing = current && current[key];
          if (same(value, prior) || same(value, existing)) { return; }
          if (value && prior && existing && typeof value === "object" && typeof prior === "object" && typeof existing === "object" && !Array.isArray(value) && !Array.isArray(prior) && !Array.isArray(existing)) {
            result[key] = apply(existing, prior, value, path + key + ".");
          } else if (baseline && !same(existing, prior) && !(allowArrests && !path && key === "arrests")) {
            conflict = conflict || path + key;
          } else {
            result[key] = clone(value);
          }
        });
        return result;
      }
      var record = canonical ? apply(canonical, baseline || canonical, incoming, "") : clone(incoming || {});
      return { ok: !conflict, record: record, error: conflict ? "Person field " + conflict + " changed in another workflow. Reload the Case before saving." : "" };
    }

    return {
      mergeRecord: mergeRecord,
      canonicalPersonRecord: canonicalPersonRecord,
      matchingById: matchingById,
      canonicalLocationRecord: canonicalLocationRecord,
      canonicalVehicleRecord: canonicalVehicleRecord,
      canonicalLeadGraph: canonicalLeadGraph,
      mergeCasePerson: mergeCasePerson
    };
  };
})(typeof window !== "undefined" ? window : globalThis);
