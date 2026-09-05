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

  function readAdmin() {
    try {
      var raw = localStorage.getItem("copdoc.admin.v1");
      var data = raw ? JSON.parse(raw) : {};
      return data && typeof data === "object" ? data : {};
    } catch (error) {
      return {};
    }
  }

  function readSettings() {
    try {
      var raw = localStorage.getItem("copdocx.settings.v1");
      var data = raw ? JSON.parse(raw) : {};
      return data && typeof data === "object" ? data : {};
    } catch (error) {
      return {};
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

  function formEntry(record, id) {
    return record && record.formState && record.formState[id]
      ? record.formState[id]
      : null;
  }

  function formValue(record, id) {
    var entry = formEntry(record, id);
    if (!entry) {
      return record && record[id] != null ? String(record[id]).trim() : "";
    }
    var type = String(entry.type || "").toLowerCase();
    if (type === "checkbox" || type === "radio") {
      return entry.checked ? String(entry.value || "").trim() : "";
    }
    return String(entry.value == null ? "" : entry.value).trim();
  }

  function formChecked(record, id) {
    var entry = formEntry(record, id);
    return !!(entry && entry.checked);
  }

  function encounterRole(record) {
    var role = String(formValue(record, "encounterRole") || "").toUpperCase();
    return role === "TARGET" || role === "COLLATERAL" ? role : "";
  }

  function formSex(record) {
    if (formChecked(record, "sexMale")) {
      return "MALE";
    }
    if (formChecked(record, "sexFemale")) {
      return "FEMALE";
    }
    return "";
  }

  function countryLabel(code) {
    var key = String(code || "").trim();
    if (!key) {
      return "";
    }
    var list = global.COUNTRIES || [];
    var i;
    for (i = 0; i < list.length; i++) {
      if (
        list[i] &&
        (list[i].code === key ||
          String(list[i].label || "").toLowerCase() === key.toLowerCase())
      ) {
        return list[i].label || key;
      }
    }
    return key;
  }

  function dispositionLabel(code) {
    var key = String(code || "").trim();
    if (!key) {
      return "";
    }
    var list =
      typeof global.IMMIGRATION_DISPOSITIONS !== "undefined"
        ? global.IMMIGRATION_DISPOSITIONS
        : [];
    var i;
    for (i = 0; i < list.length; i++) {
      if (list[i] && list[i].code === key) {
        return list[i].label || key;
      }
    }
    return key;
  }

  function closingOrUnknown(value) {
    var text = String(value == null ? "" : value).trim();
    return text || "UNKNOWN";
  }

  function locationTypeCode(association) {
    var key = String(association || "").toLowerCase();
    if (key === "stop") {
      return "PUBLIC_ROADWAY";
    }
    if (key === "staging") {
      return "PROCESSING";
    }
    return "OTHER";
  }

  function officerLabel(officer) {
    if (!officer) {
      return "";
    }
    var last = String(officer.lastName || "").trim();
    var first = String(officer.firstName || "").trim();
    if (last && first) {
      return last + ", " + first;
    }
    return [first, last].filter(Boolean).join(" ") || String(officer.displayName || "").trim();
  }

  function matchRosterOfficer(name) {
    var needle = String(name || "")
      .replace(/\s+/g, " ")
      .trim()
      .toUpperCase();
    if (!needle) {
      return null;
    }
    var officers = readAdmin().officers || [];
    var i;
    for (i = 0; i < officers.length; i++) {
      var row = officers[i];
      var label = officerLabel(row).toUpperCase();
      var flipped = [row.firstName, row.lastName].filter(Boolean).join(" ").toUpperCase();
      if (label === needle || flipped === needle || String(row.displayName || "").toUpperCase() === needle) {
        return row;
      }
    }
    return null;
  }

  function enforcementBasis(person) {
    var model = global.COPDoc && COPDoc.model;
    var warrants = (person && person.warrants) || [];
    var i;
    for (i = 0; i < warrants.length; i++) {
      if (model && model.isIssuedWarrant && model.isIssuedWarrant(warrants[i])) {
        return warrants[i].formType === "I-205" ? "I_205" : "I_200";
      }
    }
    return "WARRANTLESS_ADMINISTRATIVE";
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
    var started = enc.startedAt || (enc.meta && enc.meta.createdAt) || "";
    var linkedBookinSubjects = bookinRecords().filter(function (row) {
      return row && row.encounterId === encounterId;
    });
    var subjects = [];
    var subjectSourceIndexes = [];
    var unassignedParticipantCount = 0;
    linkedBookinSubjects.forEach(function (row, sourceIndex) {
      if (encounterRole(row)) {
        subjects.push(row);
        subjectSourceIndexes.push(sourceIndex);
      } else {
        unassignedParticipantCount += 1;
      }
    });
    if (!linkedBookinSubjects.length) {
      var encounterSubjects = enc.subjects || [];
      subjects = [];
      subjectSourceIndexes = [];
      unassignedParticipantCount = 0;
      encounterSubjects.forEach(function (row, sourceIndex) {
        var role = encounterRole(row);
        if (!role) {
          unassignedParticipantCount += 1;
          return;
        }
        subjects.push({
          id: row.bookinRecordId,
          lastName: row.lastName,
          firstName: row.firstName,
          aNumber: row.alienNumber,
          leadId: row.leadId,
          encounterRole: role
        });
        subjectSourceIndexes.push(sourceIndex);
      });
    }
    var firstTarget = -1;
    var targetSeq = 0;
    var collateralSeq = 0;
    var sequences = subjects.map(function (row, index) {
      var role = encounterRole(row);
      if (role === "TARGET") {
        targetSeq += 1;
        if (firstTarget < 0) {
          firstTarget = index;
        }
        return { role: role, sequence: targetSeq };
      }
      collateralSeq += 1;
      return { role: role, sequence: collateralSeq };
    });
    if (firstTarget < 0 && subjects.length) {
      firstTarget = 0;
    }
    var reportingName = "";
    var participants = subjects.map(function (row, index) {
      var lead = row.leadId && model.store.getLead(row.leadId);
      var person = lead && model.subjectOf ? model.subjectOf(lead) : null;
      var immigration = (person && person.immigration) || {};
      var seq = sequences[index];
      var lastName = formValue(row, "lastName") || row.lastName || "";
      var firstName = formValue(row, "firstName") || row.firstName || "";
      var aNumber =
        formValue(row, "alienNumber") ||
        row.aNumber ||
        row.alienNumber ||
        immigration.alienNumber ||
        "";
      var dob =
        formValue(row, "dateOfBirth") || (person && person.dateOfBirth) || "";
      var sex = formSex(row) || String((person && person.sex) || "").toUpperCase();
      if (sex === "M") {
        sex = "MALE";
      }
      if (sex === "F") {
        sex = "FEMALE";
      }
      var countryCode =
        formValue(row, "citizenship") || (person && person.citizenship) || "";
      var iceEvent = formValue(row, "iceEvent") || row.iceEvent || "";
      var arrestAt = formValue(row, "dateTime") || started;
      var officerName = formValue(row, "officersName") || row.officersName || "";
      if (!reportingName && officerName) {
        reportingName = officerName;
      }
      var cash = formValue(row, "cash");
      var medicine = formValue(row, "medicine");
      var children = formValue(row, "children");
      var medical = formValue(row, "medicalIssues");
      var travelDocs = formValue(row, "travelDocs");
      var disposition =
        formValue(row, "immigrationDisposition") || immigration.disposition || "";
      var display =
        person && model.formatPersonLabel
          ? model.formatPersonLabel({
              name: {
                lastName: lastName || (person.name && person.name.lastName) || "",
                firstName: firstName || (person.name && person.name.firstName) || ""
              }
            })
          : displayName({ lastName: lastName, firstName: firstName });
      return {
        encounterParticipantId:
          "ep_" + (row.id || subjectSourceIndexes[index]),
        encounterId: enc.encounterId,
        personId:
          (person && person.personId) ||
          ("p_enc_" + subjectSourceIndexes[index]),
        encounterRole: seq.role,
        roleSequence: seq.sequence,
        primaryForReport: index === firstTarget,
        identitySnapshot: {
          displayName: display || displayName(row),
          dateOfBirth: dob,
          aNumber: String(aNumber).replace(/\D/g, ""),
          nationalityCountryCode: countryCode,
          nationalityDisplay: countryLabel(countryCode),
          sex: sex || "UNKNOWN",
          capturedAt: started
        },
        finalOutcome: "ARRESTED",
        finalOutcomeAt: arrestAt,
        enforcementBasisCode: enforcementBasis(person),
        iceEventNumber: iceEvent || null,
        immigrationSnapshot: {
          statusCode: immigration.status || null,
          dispositionCode: disposition || "UNKNOWN",
          earmDispositionCode: immigration.disposition || disposition || "UNKNOWN",
          displayText: dispositionLabel(disposition || immigration.disposition),
          finalOrder: {
            statusCode: immigration.finalOrder ? "CONFIRMED" : "UNKNOWN",
            orderDate: immigration.finalOrderDate || null
          }
        },
        closing: {
          health: closingOrUnknown(medical),
          minors: closingOrUnknown(children),
          medication: closingOrUnknown(medicine),
          currency: cash
            ? { code: "YES", amountUsd: cash }
            : null,
          identityDocuments: closingOrUnknown(travelDocs)
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
        displayName: [
          vehicle.vehicleColor,
          vehicle.vehicleYear,
          vehicle.vehicleMake,
          vehicle.vehicleModel
        ]
          .filter(Boolean)
          .join(" ")
      };
    });
    var primaryParticipantId =
      (participants[firstTarget] &&
        participants[firstTarget].encounterParticipantId) ||
      (participants[0] && participants[0].encounterParticipantId) ||
      "";
    var encounterVehicles = vehicles.map(function (vehicle, index) {
      var gov = !!(enc.vehicles[index] && enc.vehicles[index].governmentVehicle);
      return {
        schema: "copdoc.encounter-vehicle.v1",
        recordType: "ENCOUNTER_VEHICLE",
        encounterVehicleId: "evh_" + vehicle.vehicleId,
        encounterId: enc.encounterId,
        vehicleId: vehicle.vehicleId,
        vehicleRole: gov ? "GOVERNMENT_VEHICLE" : "SUBJECT_VEHICLE",
        linkedEncounterParticipantId: primaryParticipantId,
        sequence: index + 1
      };
    });
    var locationId = loc.locationId || "loc_" + enc.encounterId;
    var officers = [];
    if (reportingName) {
      var roster = matchRosterOfficer(reportingName);
      officers.push({
        officerProfileId: (roster && (roster.officerId || roster.id)) || "ofc_reporting",
        personId: (roster && (roster.officerId || roster.id)) || "",
        displayName: roster ? officerLabel(roster) : reportingName,
        fullName: roster ? officerLabel(roster) : reportingName,
        title: (roster && roster.role) || "",
        badgeNumber: (roster && roster.badge) || "",
        team: (roster && roster.team) || "",
        roles: ["REPORTING"]
      });
    }
    var settings = readSettings();
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
        primaryEncounterParticipantId: primaryParticipantId,
        reportingOfficerId: (officers[0] && officers[0].officerProfileId) || "",
        notes: ""
      },
      operation: {
        operationId: "",
        operationNumber: "",
        displayName: "",
        fieldOffice: settings.issuingOffice || "",
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
        locationTypeCode: locationTypeCode(loc.association),
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
      officers: officers,
      unassignedParticipantCount: unassignedParticipantCount,
      narrativesInitial: Array.isArray(enc.narratives) ? enc.narratives : []
    };
  }

  global.COPDoc = global.COPDoc || {};
  global.COPDoc.encounterNarrative = {
    bundleFromEncounter: bundleFromEncounter
  };
})(typeof window !== "undefined" ? window : globalThis);
