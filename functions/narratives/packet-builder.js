/**
 * COPDoc Narrative Build 9 packet builder.
 *
 * Converts an Encounter aggregate into the deliberately small
 * copdoc.narrative-data.v3 projection consumed by the Narrative engine.
 * Canonical records stay host-owned. Narrative object IDs are Encounter
 * Participant IDs; reusable Person IDs remain entity_id.
 */
(function (global) {
  "use strict";

  var root = (global.COPDoc = global.COPDoc || {});
  var N = (root.narratives = root.narratives || {});
  var DATA_SCHEMA = "copdoc.narrative-data.v3";

  function codedError(code, message) {
    var error = new Error(code + ": " + message);
    error.code = code;
    return error;
  }

  function clean(value) {
    return value == null ? "" : String(value).trim();
  }

  function cleanScalarValue(value) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return clean(value.value);
    }
    return clean(value);
  }

  function firstPresent(primary, fallback) {
    return primary !== undefined && primary !== null && primary !== ""
      ? primary
      : fallback;
  }

  function datePart(value) {
    var text = clean(value);
    var match = text.match(/^(\d{4}-\d{2}-\d{2})/);
    return match ? match[1] : text;
  }

  function timePart(value) {
    var text = clean(value);
    var match = text.match(/(?:T|\s)(\d{2}):(\d{2})/);
    return match ? match[1] + ":" + match[2] : text;
  }

  function roleForParticipant(participant) {
    var role = clean(participant && participant.encounterRole).toUpperCase();
    if (role === "TARGET") return "target";
    if (role === "COLLATERAL") return "collateral";
    if (role === "WITNESS") return "witness";
    return "encounter_subject";
  }

  function eligibleNarrativeParticipants(participants) {
    return (participants || []).filter(function (participant) {
      var role = clean(participant && participant.encounterRole).toUpperCase();
      return role === "TARGET" || role === "COLLATERAL";
    });
  }

  function resolveFocusParticipantId(participants, requestedFocusId) {
    var eligible = eligibleNarrativeParticipants(participants);
    var focusId = clean(requestedFocusId);
    if (!focusId && eligible.length === 1) {
      focusId = clean(eligible[0].encounterParticipantId);
    }
    if (!focusId && eligible.length > 1) {
      throw codedError(
        "FOCAL_PARTICIPANT_REQUIRED",
        "an encounter with multiple Target/Collateral participants requires an explicit focus Encounter Participant ID"
      );
    }
    if (focusId && !eligible.some(function (participant) {
      return clean(participant.encounterParticipantId) === focusId;
    })) {
      throw codedError(
        "FOCAL_PARTICIPANT_NOT_FOUND",
        "the requested focus is not an active Target/Collateral participant in this encounter"
      );
    }
    return focusId || null;
  }

  function allocateOrdinals(participants) {
    var nextByRole = {};
    var usedByRole = {};
    var ordinalByParticipantId = {};

    (participants || []).forEach(function (participant) {
      var role = roleForParticipant(participant);
      var participantId = clean(participant.encounterParticipantId);
      var requested = Number.parseInt(participant.roleSequence, 10);
      usedByRole[role] = usedByRole[role] || {};
      if (Number.isFinite(requested) && requested > 0 && !usedByRole[role][requested]) {
        ordinalByParticipantId[participantId] = requested;
        usedByRole[role][requested] = true;
        nextByRole[role] = Math.max(nextByRole[role] || 1, requested + 1);
      }
    });

    (participants || []).forEach(function (participant) {
      var role = roleForParticipant(participant);
      var participantId = clean(participant.encounterParticipantId);
      if (ordinalByParticipantId[participantId]) return;
      usedByRole[role] = usedByRole[role] || {};
      var next = nextByRole[role] || 1;
      while (usedByRole[role][next]) next += 1;
      ordinalByParticipantId[participantId] = next;
      usedByRole[role][next] = true;
      nextByRole[role] = next + 1;
    });
    return ordinalByParticipantId;
  }

  function participantLabel(participant) {
    var snapshot = participant.identitySnapshot || {};
    return clean(
      snapshot.displayName ||
      participant.subjectDisplayName ||
      participant.displayName ||
      participant.fullName ||
      participant.encounterParticipantId
    );
  }

  function participantObject(participant, focusId, ordinal) {
    var participantId = clean(participant.encounterParticipantId);
    if (!participantId) {
      throw codedError("ENCOUNTER_PARTICIPANT_ID_REQUIRED", "every narrative participant needs a stable Encounter Participant ID");
    }
    var snapshot = participant.identitySnapshot || {};
    var immigration = participant.immigrationSnapshot || {};
    var closing = participant.closingAnswers || participant.closing || {};
    var currency = closing.currency || {};
    var role = roleForParticipant(participant);
    var isFocus = participantId === focusId;
    var roles = [{ role: role, ordinal: ordinal || 1 }];
    if (isFocus) {
      roles.push({ role: "narrative_subject", ordinal: 1 });
      roles.push({ role: "primary_target", ordinal: 1 });
    }
    return {
      id: participantId,
      entity_id: clean(participant.personId) || participantId,
      type: "person",
      roles: roles,
      label: participantLabel(participant) || "Subject (pending)",
      fields: {
        full_name: participantLabel(participant),
        date_of_birth: clean(snapshot.dateOfBirth || participant.dateOfBirth),
        a_number: clean(snapshot.aNumber || participant.aNumber),
        sex: clean(snapshot.sex || participant.sex),
        country: clean(
          snapshot.nationalityDisplay ||
          snapshot.nationalityCountryCode ||
          participant.country
        ),
        ice_event: clean(participant.iceEventNumber),
        encounter_participant_id: participantId,
        encounter_role: clean(participant.encounterRole).toUpperCase(),
        outcome_code: clean(participant.finalOutcome).toUpperCase(),
        arrest_time: clean(participant.finalOutcomeAt),
        final_order_status: clean(
          immigration.finalOrderStatus || (immigration.finalOrder && immigration.finalOrder.statusCode)
        ).toUpperCase(),
        immigration_disposition_code: clean(
          immigration.dispositionCode
        ).toUpperCase(),
        immigration_status_or_disposition: clean(
          immigration.displayText || immigration.dispositionCode
        ),
        health: clean(closing.health),
        medications: clean(closing.medications || closing.medication),
        currency_usd: clean(closing.currencyUsd != null ? closing.currencyUsd : currency.amountUsd)
      },
      metadata: {
        encounter_participant_id: participantId,
        person_id: clean(participant.personId) || null,
        focus: isFocus,
        primary_for_report: Boolean(participant.primaryForReport),
        outcome_code: clean(participant.finalOutcome).toUpperCase(),
        arrest_time: clean(participant.finalOutcomeAt) || null
      }
    };
  }

  function encounterObject(encounter) {
    return {
      id: clean(encounter.encounterId),
      entity_id: clean(encounter.encounterId),
      type: "encounter",
      roles: [{ role: "current_encounter", ordinal: 1 }],
      label: clean(encounter.encounterNumber || encounter.encounterId),
      fields: {
        encounter_number: clean(encounter.encounterNumber),
        event_type: clean(encounter.eventType),
        status: clean(encounter.status),
        started_at: clean(encounter.startedAt),
        ended_at: clean(encounter.endedAt),
        date: datePart(encounter.date || encounter.startedAt),
        time: timePart(encounter.time || encounter.startedAt),
        language: clean(encounter.language),
        event: clean(encounter.eventType),
        action: clean(encounter.action),
        disposition: clean(encounter.disposition),
        notes: clean(encounter.notes)
      }
    };
  }

  function operationObject(operation, encounter) {
    if (!operation) return null;
    var operationId = clean(operation.operationId || operation.id) || "current-operation";
    var fieldOffice = clean(
      operation.fieldOffice || operation.fieldOfficeName || operation.field_office
    );
    return {
      id: operationId,
      entity_id: operationId,
      type: "operation",
      roles: [{ role: "current_operation", ordinal: 1 }],
      label: clean(operation.displayName || operation.name || operation.operationNumber) || operationId,
      fields: {
        date: datePart(operation.date || (encounter && encounter.startedAt)),
        field_office: fieldOffice,
        ice_office: clean(operation.iceOffice || operation.iceOfficeName) || fieldOffice
      }
    };
  }

  function eventObject(event, index) {
    var eventId = clean(event.encounterEventId || event.eventId) || "event:" + (index + 1);
    return {
      id: eventId,
      entity_id: eventId,
      type: "event",
      roles: [{ role: "encounter_event", ordinal: Number.parseInt(event.sequence, 10) || index + 1 }],
      label: clean(event.label || event.eventType || "Encounter event"),
      fields: {
        event: clean(event.eventType),
        time: timePart(event.time || event.occurredAt),
        action: clean(event.action),
        disposition: clean(event.disposition),
        description: clean(event.description || event.summary || event.notes)
      },
      metadata: {
        event_type: clean(event.eventType),
        sequence: Number.parseInt(event.sequence, 10) || index + 1,
        participant_links: event.participantLinks || [],
        officer_links: event.officerLinks || [],
        details: event.details || null
      }
    };
  }

  function vehicleObject(link, index, resolver) {
    var vehicle = resolver ? resolver(link.vehicleId, link) : null;
    vehicle = vehicle || link.vehicle || link;
    var objectId = clean(link.encounterVehicleId || link.vehicleId || vehicle.vehicleId) || "vehicle:" + (index + 1);
    var description = clean(
      vehicle.displayName || vehicle.generatedDisplayName || vehicle.description ||
      [vehicle.color, vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ")
    );
    return {
      id: objectId,
      entity_id: clean(link.vehicleId || vehicle.vehicleId) || objectId,
      type: "vehicle",
      roles: [{
        role: clean(link.vehicleRole).toUpperCase() === "GOVERNMENT_VEHICLE"
          ? "government_vehicle"
          : "encountered_vehicle",
        ordinal: Number.parseInt(link.sequence, 10) || index + 1
      }],
      label: description || objectId,
      fields: {
        display_name: description,
        description: description,
        plate: cleanScalarValue(vehicle.plate) || cleanScalarValue(vehicle.licensePlate),
        year_make_model: clean(
          vehicle.yearMakeModel || [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ")
        )
      }
    };
  }

  function locationObject(location) {
    if (!location) return null;
    var locationId = clean(location.locationId || location.id);
    var address = clean(
      location.displayName || location.generatedDisplayName || location.fullAddress ||
      location.formattedAddress || location.address
    );
    return {
      id: locationId || "encounter-location",
      entity_id: locationId || "encounter-location",
      type: "location",
      roles: [{ role: "contact_location", ordinal: 1 }],
      label: address || "Encounter location",
      fields: {
        location: address,
        full_address: address,
        address: address,
        contact_location: address,
        city: clean(location.city || (location.postalAddress && location.postalAddress.city)),
        state: clean(location.state || (location.postalAddress && location.postalAddress.stateOrRegion)),
        latitude: clean(firstPresent(
          location.latitude,
          location.coordinates && location.coordinates.latitude
        )),
        longitude: clean(firstPresent(
          location.longitude,
          location.coordinates && location.coordinates.longitude
        ))
      }
    };
  }

  function factsObject(bundle) {
    var facts = bundle.narrativeFacts || {};
    if (!facts || !Object.keys(facts).length) return null;
    return {
      id: "narrative-facts:" + clean(bundle.encounter && bundle.encounter.encounterId),
      entity_id: "narrative-facts:" + clean(bundle.encounter && bundle.encounter.encounterId),
      type: "narrative_detail",
      roles: [{ role: "case_facts", ordinal: 1 }],
      label: "Encounter narrative facts",
      fields: facts
    };
  }

  function buildPacketFromBundle(bundle, focusParticipantId, options) {
    options = options || {};
    if (!bundle || !bundle.encounter) {
      throw codedError("ENCOUNTER_BUNDLE_REQUIRED", "buildPacketFromBundle requires an encounter aggregate");
    }
    var participants = (bundle.participants || []).slice();
    var focusId = resolveFocusParticipantId(participants, focusParticipantId);
    var ordinalByParticipantId = allocateOrdinals(participants);
    var objects = [encounterObject(bundle.encounter)];
    var operation = operationObject(bundle.operation, bundle.encounter);
    if (operation) objects.push(operation);

    participants.forEach(function (participant) {
      objects.push(participantObject(
        participant,
        focusId,
        ordinalByParticipantId[clean(participant.encounterParticipantId)]
      ));
    });

    (bundle.events || []).forEach(function (event, index) {
      objects.push(eventObject(event, index));
    });
    (bundle.vehicles || []).forEach(function (vehicle, index) {
      objects.push(vehicleObject(vehicle, index, options.vehicleResolver));
    });
    var location = locationObject(bundle.primaryLocation);
    if (location) objects.push(location);
    var officerRoleOrdinals = {};
    (bundle.officers || []).forEach(function (officer, index) {
      var officerId = clean(
        officer.officerProfileId || officer.officerId || officer.personId || officer.id
      ) || "officer:" + (index + 1);
      var rawRoles = Array.isArray(officer.roles) && officer.roles.length
        ? officer.roles
        : [officer.role || "officer"];
      var roles = rawRoles.map(function (value) {
        var role = clean(value).toLowerCase() || "officer";
        officerRoleOrdinals[role] = (officerRoleOrdinals[role] || 0) + 1;
        return { role: role, ordinal: officerRoleOrdinals[role] };
      });
      objects.push({
        id: officerId,
        entity_id: clean(officer.personId) || officerId,
        type: "officer",
        roles: roles,
        label: clean(officer.displayName || officer.fullName || officerId),
        fields: {
          display_name: clean(officer.displayName || officer.fullName),
          full_name: clean(officer.fullName || officer.displayName),
          badge_number: clean(officer.badgeNumber),
          team: clean(officer.team),
          officer_profile_id: clean(officer.officerProfileId || officer.officerId)
        }
      });
    });
    var facts = factsObject(bundle);
    if (facts) objects.push(facts);

    return {
      schema_version: DATA_SCHEMA,
      packet_id: clean(bundle.encounter.encounterId) + (focusId ? "::" + focusId : "::placeholder"),
      packet_name: (clean(bundle.encounter.encounterNumber) || clean(bundle.encounter.encounterId)) +
        (focusId ? " · subject narrative" : " · placeholder narrative"),
      is_test_data: Boolean(options.isTestData),
      objects: objects,
      metadata: {
        encounter_id: clean(bundle.encounter.encounterId),
        focus_participant_id: focusId,
        source: "copdoc.packet-builder.v3"
      }
    };
  }

  function buildPacketFromEncounter(encounterId, focusParticipantId) {
    var encounterService = root.services && root.services.encounter;
    if (!encounterService || typeof encounterService.getBundle !== "function") {
      throw codedError("ENCOUNTER_SERVICE_UNAVAILABLE", "COPDoc encounter service is not loaded");
    }
    var bundle = encounterService.getBundle(encounterId);
    if (!bundle) {
      throw codedError("ENCOUNTER_NOT_FOUND", clean(encounterId));
    }
    if (!bundle.primaryLocation && bundle.encounter.primaryLocationId && root.services.location) {
      bundle.primaryLocation = root.services.location.get(bundle.encounter.primaryLocationId);
    }
    return buildPacketFromBundle(bundle, focusParticipantId, {
      vehicleResolver: function (vehicleId) {
        return root.services.vehicle && root.services.vehicle.get
          ? root.services.vehicle.get(vehicleId)
          : null;
      }
    });
  }

  N.DATA_SCHEMA = DATA_SCHEMA;
  N.buildPacketFromBundle = buildPacketFromBundle;
  N.buildPacketFromEncounter = buildPacketFromEncounter;
  N.resolveFocusParticipantId = resolveFocusParticipantId;
})(typeof window !== "undefined" ? window : globalThis);
