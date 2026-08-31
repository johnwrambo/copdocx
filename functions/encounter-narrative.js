/**
 * Map a saved encounter + Book-in subjects into the Build 9 bundle shape.
 */
(function (global) {
  "use strict";

  function bookinRecords() {
    try {
      var raw = localStorage.getItem("alien-book-in.saved-records.v1");
      var list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch (error) {
      return [];
    }
  }

  function displayName(row) {
    var last = String((row && row.lastName) || "").trim();
    var first = String((row && row.firstName) || "").trim();
    if (last && first) {
      return last + ", " + first;
    }
    return [first, last].filter(Boolean).join(" ") || "Subject";
  }

  function bundleFromEncounter(encounterId) {
    var model = global.COPDoc && COPDoc.model;
    if (!model || !model.store || !encounterId) {
      return null;
    }
    model.store.loadFromDisk();
    var enc = model.store.getEncounter(encounterId);
    if (!enc) {
      return null;
    }
    var loc = (enc.locations && enc.locations[0]) || {};
    var started = enc.startedAt || enc.meta && enc.meta.createdAt || "";
    var subjects = bookinRecords().filter(function (row) {
      return row && row.encounterId === encounterId;
    });
    if (!subjects.length) {
      subjects = (enc.subjects || []).map(function (row) {
        return {
          id: row.bookinRecordId,
          lastName: row.lastName,
          firstName: row.firstName,
          aNumber: row.alienNumber,
          leadId: row.leadId
        };
      });
    }
    var participants = subjects.map(function (row, index) {
      var lead = row.leadId && model.store.getLead(row.leadId);
      var person = lead && model.subjectOf ? model.subjectOf(lead) : null;
      var name = (person && person.name) || {};
      var immigration = (person && person.immigration) || {};
      return {
        encounterParticipantId: "ep_" + (row.id || index),
        encounterId: enc.encounterId,
        personId: (person && person.personId) || ("p_enc_" + index),
        encounterRole: "TARGET",
        roleSequence: index + 1,
        primaryForReport: index === 0,
        identitySnapshot: {
          displayName: person
            ? model.formatPersonLabel(person)
            : displayName(row),
          dateOfBirth: (person && person.dateOfBirth) || "",
          aNumber: String(row.aNumber || immigration.alienNumber || "").replace(/\D/g, ""),
          nationalityCountryCode: (person && person.citizenship) || "",
          sex: String((person && person.sex) || "").toUpperCase() || "UNKNOWN",
          capturedAt: started
        },
        finalOutcome: "ARRESTED",
        finalOutcomeAt: started,
        enforcementBasisCode: "WARRANTLESS_ADMINISTRATIVE",
        iceEventNumber: row.iceEvent || null,
        immigrationSnapshot: {
          statusCode: immigration.status || null,
          dispositionCode: immigration.disposition || "UNKNOWN",
          earmDispositionCode: immigration.disposition || "UNKNOWN",
          finalOrder: {
            statusCode: immigration.finalOrder ? "CONFIRMED" : "UNKNOWN",
            orderDate: immigration.finalOrderDate || null
          }
        },
        closing: {
          health: "UNKNOWN",
          minors: "UNKNOWN",
          medication: "UNKNOWN",
          currency: null,
          identityDocuments: "UNKNOWN"
        }
      };
    });
    var vehicles = (enc.vehicles || []).map(function (vehicle, index) {
      return {
        schema: "copdoc.vehicle.v1",
        recordType: "VEHICLE",
        vehicleId: vehicle.vehicleId || "veh_enc_" + index,
        year: vehicle.vehicleYear || "",
        make: vehicle.vehicleMake || "",
        model: vehicle.vehicleModel || "",
        color: vehicle.vehicleColor || "",
        plate: {
          value: vehicle.licensePlate || vehicle.plate || "",
          stateCode: vehicle.plateState || ""
        },
        displayName: [vehicle.vehicleColor, vehicle.vehicleYear, vehicle.vehicleMake, vehicle.vehicleModel]
          .filter(Boolean)
          .join(" ")
      };
    });
    var encounterVehicles = vehicles.map(function (vehicle, index) {
      return {
        schema: "copdoc.encounter-vehicle.v1",
        recordType: "ENCOUNTER_VEHICLE",
        encounterVehicleId: "evh_" + vehicle.vehicleId,
        encounterId: enc.encounterId,
        vehicleId: vehicle.vehicleId,
        vehicleRole: "SUBJECT_VEHICLE",
        linkedEncounterParticipantId:
          (participants[0] && participants[0].encounterParticipantId) || "",
        sequence: index + 1
      };
    });
    var locationId = loc.locationId || "loc_" + enc.encounterId;
    return {
      encounter: {
        schema: "copdoc.encounter.v1",
        recordType: "ENCOUNTER",
        encounterId: enc.encounterId,
        encounterNumber: enc.encounterId,
        eventType: vehicles.length ? "VEHICLE_STOP" : "OTHER",
        status: "COMPLETED",
        startedAt: started,
        endedAt: started,
        primaryLocationId: locationId,
        primaryEncounterParticipantId:
          (participants[0] && participants[0].encounterParticipantId) || "",
        reportingOfficerId: "",
        notes: ""
      },
      operation: {
        operationId: "",
        operationNumber: "",
        displayName: "",
        fieldOffice: "",
        date: String(started).slice(0, 10)
      },
      participants: participants,
      events: [],
      encounterVehicles: encounterVehicles,
      vehicles: vehicles,
      location: {
        schema: "copdoc.location.v1",
        recordType: "LOCATION",
        locationId: locationId,
        generatedDisplayName: [loc.street, loc.city, loc.state, loc.zip]
          .filter(Boolean)
          .join(", "),
        locationTypeCode: "PUBLIC_ROADWAY",
        postalAddress: {
          addressLine1: loc.street || "",
          city: loc.city || "",
          stateOrRegion: loc.state || "",
          postalCode: loc.zip || "",
          countryCode: "US"
        },
        coordinates: {
          latitude: Number(loc.latitude) || 0,
          longitude: Number(loc.longitude) || 0
        }
      },
      officers: [],
      narrativesInitial: []
    };
  }

  global.COPDoc = global.COPDoc || {};
  global.COPDoc.encounterNarrative = {
    bundleFromEncounter: bundleFromEncounter
  };
})(typeof window !== "undefined" ? window : globalThis);
