/**
 * Completed Encounter snapshots, shared location pins and outcome counts.
 * Dependencies are explicit; this module never reads browser storage or DOM.
 */
(function (global) {
  "use strict";
  var root = (global.COPDoc = global.COPDoc || {});
  var namespace = (root.projections = root.projections || {});

  namespace.createEncounterCompletion = function (dependencies) {
    var clone = dependencies.clone;
    var getLocations = dependencies.getLocations;
    var nowIso = dependencies.nowIso;

    function locationPin(location) {
      if (!location) {
        return null;
      }
      var canon =
        location.locationId && getLocations()[location.locationId]
          ? getLocations()[location.locationId]
          : null;
      var lat = String(
        location.latitude || (canon && canon.latitude) || ""
      ).trim();
      var lng = String(
        location.longitude || (canon && canon.longitude) || ""
      ).trim();
      if (!lat || !lng) {
        var parsed = String(
          location.latLong || (canon && canon.latLong) || ""
        ).match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
        if (parsed) {
          lat = parsed[1];
          lng = parsed[2];
        }
      }
      if (!lat || !lng || !isFinite(Number(lat)) || !isFinite(Number(lng))) {
        return null;
      }
      if (Number(lat) === 0 && Number(lng) === 0) {
        return null;
      }
      var street = location.street || (canon && canon.street) || "";
      var city = location.city || (canon && canon.city) || "";
      var region = location.state || (canon && canon.state) || "";
      var zip = location.zip || (canon && canon.zip) || "";
      var address = [street, [city, region].filter(Boolean).join(", "), zip]
        .filter(Boolean)
        .join(", ");
      return {
        latitude: lat,
        longitude: lng,
        arrestLocation: address,
        locationId: location.locationId || (canon && canon.locationId) || ""
      };
    }

    function encounterPin(encounter) {
      if (!encounter) {
        return null;
      }
      var i;
      var pin;
      var locations = encounter.locations || [];
      var centerId =
        encounter.centerLocationId ||
        (encounter.completed && encounter.completed.centerLocationId) ||
        "";
      if (centerId) {
        for (i = 0; i < locations.length; i += 1) {
          if (locations[i] && locations[i].locationId === centerId) {
            pin = locationPin(locations[i]);
            if (pin) {
              return pin;
            }
          }
        }
      }
      for (i = 0; i < locations.length; i += 1) {
        pin = locationPin(locations[i]);
        if (pin) {
          return pin;
        }
      }
      var vehicles = encounter.vehicles || [];
      for (i = 0; i < vehicles.length; i += 1) {
        var nested = (vehicles[i] && vehicles[i].locations) || [];
        var j;
        for (j = 0; j < nested.length; j += 1) {
          pin = locationPin(nested[j]);
          if (pin) {
            return pin;
          }
        }
      }
      return null;
    }

    function snapshotLocation(location) {
      var pin = locationPin(location);
      var canon =
        location && location.locationId && getLocations()[location.locationId]
          ? getLocations()[location.locationId]
          : null;
      return {
        locationId: (location && location.locationId) || "",
        street: (location && location.street) || (canon && canon.street) || "",
        street2: (location && location.street2) || (canon && canon.street2) || "",
        city: (location && location.city) || (canon && canon.city) || "",
        state: (location && location.state) || (canon && canon.state) || "",
        zip: (location && location.zip) || (canon && canon.zip) || "",
        latitude: (pin && pin.latitude) || "",
        longitude: (pin && pin.longitude) || "",
        association:
          (location && location.association) || (canon && canon.association) || "",
        isCenter: false
      };
    }

    function outcomeCountsFromSubjects(subjects) {
      var counts = { arrested: 0, released: 0, fled: 0 };
      (Array.isArray(subjects) ? subjects : []).forEach(function (row) {
        var outcome = String((row && row.outcome) || "").toUpperCase();
        if (outcome === "ARRESTED") {
          counts.arrested += 1;
        } else if (outcome === "RELEASED") {
          counts.released += 1;
        } else if (outcome.indexOf("FLED") === 0) {
          counts.fled += 1;
        }
      });
      return counts;
    }

    function buildEncounterCompleted(encounter) {
      var pin = encounterPin(encounter);
      var locations = (encounter.locations || []).map(function (location) {
        var row = snapshotLocation(location);
        row.isCenter = !!(
          encounter.centerLocationId &&
          row.locationId &&
          row.locationId === encounter.centerLocationId
        );
        return row;
      });
      return {
        schema: "copdocx.encounter-snapshot.v1",
        generatedAt: nowIso(),
        encounterId: encounter.encounterId,
        startedAt: encounter.startedAt || "",
        eventType: encounter.eventType || "",
        operationId: encounter.operationId || "",
        officerIds: Array.isArray(encounter.officerIds)
          ? encounter.officerIds.slice()
          : [],
        centerLocationId: encounter.centerLocationId || "",
        team: encounter.team || "",
        officeCode: encounter.officeCode || "",
        subjects: clone(Array.isArray(encounter.subjects) ? encounter.subjects : []),
        locations: locations,
        vehicles: (encounter.vehicles || []).map(function (vehicle) {
          return {
            vehicleId: (vehicle && (vehicle.vehicleId || vehicle.id)) || "",
            licensePlate: (vehicle && vehicle.licensePlate) || "",
            plateState: (vehicle && vehicle.plateState) || "",
            year: (vehicle && vehicle.vehicleYear) || "",
            make: (vehicle && vehicle.make) || (vehicle && vehicle.vehicleMake) || "",
            model: (vehicle && vehicle.model) || (vehicle && vehicle.vehicleModel) || "",
            locations: ((vehicle && vehicle.locations) || []).map(snapshotLocation)
          };
        }),
        outcomeCounts: outcomeCountsFromSubjects(encounter.subjects),
        // Capture the saved prose and its exact engine/source state at close.
        // Draft saves must not change the last completed narrative, and an
        // unlock/re-confirm must retain the previous prose in completedHistory.
        narratives: clone(Array.isArray(encounter.narratives) ? encounter.narratives : []),
        supervisorSummary: clone(encounter.supervisorSummary || {
          text: "",
          derivedAt: "",
          coverage: null
        }),
        pin: pin
          ? {
              latitude: pin.latitude,
              longitude: pin.longitude,
              arrestLocation: pin.arrestLocation,
              locationId: pin.locationId
            }
          : null
      };
    }

    return {
      locationPin: locationPin,
      encounterPin: encounterPin,
      snapshotLocation: snapshotLocation,
      outcomeCountsFromSubjects: outcomeCountsFromSubjects,
      buildEncounterCompleted: buildEncounterCompleted
    };
  };
})(typeof window !== "undefined" ? window : globalThis);
