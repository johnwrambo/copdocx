/**
 * COPDoc Narrative Build 9 standalone-demo fixture.
 *
 * Every identity and identifier is synthetic. This fixture is deliberately
 * deterministic so narrative, coverage, grouping, and summary tests can use
 * exact assertions. It is a design/acceptance fixture, not production seed.
 */
(function (global) {
  "use strict";

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  var encounter = {
    schema: "copdoc.encounter.v1",
    recordType: "ENCOUNTER",
    encounterId: "enc_demo_vehicle_stop_001",
    encounterNumber: "DEMO-2026-001",
    eventType: "VEHICLE_STOP",
    status: "COMPLETED",
    startedAt: "2026-08-09T13:10:00-05:00",
    endedAt: "2026-08-09T14:05:00-05:00",
    primaryLocationId: "loc_demo_primary",
    primaryEncounterParticipantId: "ep_demo_t1",
    reportingOfficerId: "ofp_demo_1",
    notes: "SYNTHETIC TRAINING ENCOUNTER — NO REAL PERSON OR CASE DATA"
  };

  var operation = {
    operationId: "op_demo_arlington_001",
    operationNumber: "TRAINING-OP-001",
    displayName: "Arlington Training Operation",
    fieldOffice: "Dallas Field Office",
    date: "2026-08-09"
  };

  var location = {
    schema: "copdoc.location.v1",
    recordType: "LOCATION",
    locationId: "loc_demo_primary",
    generatedDisplayName: "Training Location — 100 Demo Parkway, Arlington, TX 76010",
    locationTypeCode: "PUBLIC_ROADWAY",
    postalAddress: {
      addressLine1: "100 Demo Parkway",
      city: "Arlington",
      stateOrRegion: "TX",
      postalCode: "76010",
      countryCode: "US"
    },
    coordinates: { latitude: 32.7357, longitude: -97.1081 }
  };

  var vehicles = [
    {
      schema: "copdoc.vehicle.v1",
      recordType: "VEHICLE",
      vehicleId: "veh_demo_subject_1",
      year: 2020,
      make: "Toyota",
      model: "Camry",
      color: "Gray",
      plate: { value: "DEMO01", stateCode: "TX" },
      displayName: "gray 2020 Toyota Camry bearing Texas plate DEMO01"
    }
  ];

  var encounterVehicles = [
    {
      schema: "copdoc.encounter-vehicle.v1",
      recordType: "ENCOUNTER_VEHICLE",
      encounterVehicleId: "evh_demo_subject_1",
      encounterId: encounter.encounterId,
      vehicleId: "veh_demo_subject_1",
      vehicleRole: "SUBJECT_VEHICLE",
      linkedEncounterParticipantId: "ep_demo_t1",
      sequence: 1
    }
  ];

  var officers = [
    {
      officerProfileId: "ofp_demo_1",
      personId: "per_demo_officer_1",
      displayName: "ALEX RIVERA",
      title: "Deportation Officer",
      badgeNumber: "D-101",
      roles: ["REPORTING", "ACTOR"]
    },
    {
      officerProfileId: "ofp_demo_2",
      personId: "per_demo_officer_2",
      displayName: "CASEY MORGAN",
      title: "Deportation Officer",
      badgeNumber: "D-102",
      roles: ["ACTOR"]
    },
    {
      officerProfileId: "ofp_demo_3",
      personId: "per_demo_officer_3",
      displayName: "JORDAN BLAKE",
      title: "Deportation Officer",
      badgeNumber: "D-103",
      roles: ["ASSISTING", "OBSERVER"]
    }
  ];

  var participants = [
    {
      encounterParticipantId: "ep_demo_t1",
      encounterId: encounter.encounterId,
      personId: "per_demo_t1",
      encounterRole: "TARGET",
      roleSequence: 1,
      primaryForReport: true,
      identitySnapshot: {
        displayName: "MARA VEGA",
        dateOfBirth: "1986-03-14",
        aNumber: "999000001",
        nationalityCountryCode: "MX",
        sex: "FEMALE",
        capturedAt: "2026-08-09T13:10:00-05:00"
      },
      finalOutcome: "ARRESTED",
      finalOutcomeAt: "2026-08-09T13:22:00-05:00",
      enforcementBasisCode: "I_200",
      iceEventNumber: "DAL-DEMO-001",
      immigrationSnapshot: {
        statusCode: "D",
        dispositionCode: "FINAL_ORDER",
        earmDispositionCode: "REINST",
        finalOrder: { statusCode: "CONFIRMED", orderDate: "2018-04-17" }
      },
      closing: {
        health: "GOOD",
        minors: "NONE",
        medication: "NONE",
        currency: { code: "YES", amountUsd: 86 },
        identityDocuments: "PROPERTY"
      }
    },
    {
      encounterParticipantId: "ep_demo_t2",
      encounterId: encounter.encounterId,
      personId: "per_demo_t2",
      encounterRole: "TARGET",
      roleSequence: 2,
      primaryForReport: false,
      identitySnapshot: {
        displayName: "TOMAS ROOK",
        dateOfBirth: "1990-07-09",
        aNumber: "999000002",
        nationalityCountryCode: "GT",
        sex: "MALE",
        capturedAt: "2026-08-09T13:10:00-05:00"
      },
      finalOutcome: "ARRESTED",
      finalOutcomeAt: "2026-08-09T13:23:00-05:00",
      enforcementBasisCode: "FINAL_ORDER",
      iceEventNumber: "DAL-DEMO-002",
      immigrationSnapshot: {
        statusCode: "D",
        dispositionCode: "FINAL_ORDER",
        earmDispositionCode: "B",
        finalOrder: { statusCode: "CONFIRMED", orderDate: "2020-09-02" }
      },
      closing: {
        health: "GOOD",
        minors: "YES",
        medication: "NONE",
        currency: { code: "NONE", amountUsd: 0 },
        identityDocuments: "NONE"
      }
    },
    {
      encounterParticipantId: "ep_demo_t3",
      encounterId: encounter.encounterId,
      personId: "per_demo_t3",
      encounterRole: "TARGET",
      roleSequence: 3,
      primaryForReport: false,
      identitySnapshot: {
        displayName: "NOVA QUILL",
        dateOfBirth: "1984-11-21",
        aNumber: "999000003",
        nationalityCountryCode: "HN",
        sex: "FEMALE",
        capturedAt: "2026-08-09T13:10:00-05:00"
      },
      finalOutcome: "NOT_CONTACTED",
      finalOutcomeAt: "2026-08-09T14:05:00-05:00",
      enforcementBasisCode: "I_200",
      iceEventNumber: null,
      immigrationSnapshot: {
        statusCode: null,
        dispositionCode: "UNKNOWN",
        earmDispositionCode: "UNKNOWN",
        finalOrder: { statusCode: "UNKNOWN", orderDate: null }
      },
      closing: { health: null, minors: null, medication: null, currency: null, identityDocuments: null }
    },
    {
      encounterParticipantId: "ep_demo_c1",
      encounterId: encounter.encounterId,
      personId: "per_demo_c1",
      encounterRole: "COLLATERAL",
      roleSequence: 1,
      primaryForReport: false,
      identitySnapshot: {
        displayName: "CARLOS VOSS",
        dateOfBirth: "1994-01-28",
        aNumber: "999000004",
        nationalityCountryCode: "SV",
        sex: "MALE",
        capturedAt: "2026-08-09T13:10:00-05:00"
      },
      finalOutcome: "ARRESTED",
      finalOutcomeAt: "2026-08-09T13:24:00-05:00",
      enforcementBasisCode: "WARRANTLESS_ADMINISTRATIVE",
      iceEventNumber: "DAL-DEMO-003",
      immigrationSnapshot: {
        statusCode: "IA",
        dispositionCode: "PENDING_IJ",
        earmDispositionCode: "WA/NTA",
        finalOrder: { statusCode: "NOT_CONFIRMED", orderDate: null }
      },
      closing: {
        health: "GOOD",
        minors: "NONE",
        medication: "NONE",
        currency: { code: "NONE", amountUsd: 0 },
        identityDocuments: "NONE"
      }
    },
    {
      encounterParticipantId: "ep_demo_c2",
      encounterId: encounter.encounterId,
      personId: "per_demo_c2",
      encounterRole: "COLLATERAL",
      roleSequence: 2,
      primaryForReport: false,
      identitySnapshot: {
        displayName: "LENA ORBIT",
        dateOfBirth: "1988-06-03",
        aNumber: null,
        nationalityCountryCode: "US",
        sex: "FEMALE",
        capturedAt: "2026-08-09T13:10:00-05:00"
      },
      finalOutcome: "RELEASED",
      finalOutcomeAt: "2026-08-09T13:31:00-05:00",
      finalOutcomeReason: "Citizenship confirmed during records checks",
      releaseReasonCode: "US_CITIZEN",
      enforcementBasisCode: "CONSENT",
      iceEventNumber: null,
      immigrationSnapshot: {
        statusCode: "USC",
        dispositionCode: "USC",
        earmDispositionCode: "FBUSC",
        finalOrder: { statusCode: "NOT_CONFIRMED", orderDate: null }
      },
      closing: { health: null, minors: null, medication: null, currency: null, identityDocuments: null }
    }
  ];

  function participantLinks(rows) {
    return rows.map(function (row) {
      return { encounterParticipantId: row[0], role: row[1] };
    });
  }

  function officerLinks(rows) {
    return rows.map(function (row) {
      return { officerProfileId: row[0], role: row[1] };
    });
  }

  var events = [
    {
      encounterEventId: "eev_demo_01",
      encounterId: encounter.encounterId,
      eventType: "ARRIVAL",
      sequence: 1,
      occurredAt: "2026-08-09T13:10:00-05:00",
      timePrecision: "EXACT",
      locationId: location.locationId,
      summary: "Officers arrived at the training location.",
      detailFamily: "CONTACT",
      details: { family: "CONTACT", contactMannerCode: "NON_CONSENSUAL", initiatedByCode: "OFFICER", bwcActive: true },
      participantLinks: [],
      officerLinks: officerLinks([["ofp_demo_1", "REPORTING"], ["ofp_demo_2", "ACTOR"], ["ofp_demo_3", "ASSISTING"]])
    },
    {
      encounterEventId: "eev_demo_02",
      encounterId: encounter.encounterId,
      eventType: "SURVEILLANCE",
      sequence: 2,
      occurredAt: "2026-08-09T13:12:00-05:00",
      timePrecision: "EXACT",
      locationId: location.locationId,
      summary: "Mobile surveillance of the subject vehicle.",
      detailFamily: "CONTACT",
      details: { family: "CONTACT", contactMannerCode: "NON_CONSENSUAL", initiatedByCode: "OFFICER", bwcActive: true },
      participantLinks: participantLinks([["ep_demo_t1", "OBSERVED"], ["ep_demo_t2", "OBSERVED"], ["ep_demo_c1", "OBSERVED"], ["ep_demo_c2", "OBSERVED"]]),
      officerLinks: officerLinks([["ofp_demo_1", "ACTOR"], ["ofp_demo_3", "OBSERVER"]])
    },
    {
      encounterEventId: "eev_demo_03",
      encounterId: encounter.encounterId,
      eventType: "VEHICLE_STOP",
      sequence: 3,
      occurredAt: "2026-08-09T13:18:00-05:00",
      timePrecision: "EXACT",
      locationId: location.locationId,
      summary: "Emergency lights activated and vehicle stop initiated.",
      detailFamily: "VEHICLE",
      details: { family: "VEHICLE", encounterVehicleId: "evh_demo_subject_1", vehicleId: "veh_demo_subject_1", actionCode: "STOP" },
      participantLinks: participantLinks([["ep_demo_t1", "RECIPIENT"], ["ep_demo_t2", "RECIPIENT"], ["ep_demo_c1", "RECIPIENT"], ["ep_demo_c2", "RECIPIENT"]]),
      officerLinks: officerLinks([["ofp_demo_1", "ACTOR"], ["ofp_demo_2", "ASSISTING"]])
    },
    {
      encounterEventId: "eev_demo_04",
      encounterId: encounter.encounterId,
      eventType: "VEHICLE_CONTAINMENT",
      sequence: 4,
      occurredAt: "2026-08-09T13:18:30-05:00",
      timePrecision: "EXACT",
      locationId: location.locationId,
      summary: "Government vehicles contained the subject vehicle.",
      detailFamily: "VEHICLE",
      details: { family: "VEHICLE", encounterVehicleId: "evh_demo_subject_1", vehicleId: "veh_demo_subject_1", actionCode: "CONTAINED" },
      participantLinks: participantLinks([["ep_demo_t1", "RECIPIENT"], ["ep_demo_t2", "RECIPIENT"]]),
      officerLinks: officerLinks([["ofp_demo_1", "ACTOR"], ["ofp_demo_2", "ACTOR"]])
    },
    {
      encounterEventId: "eev_demo_05",
      encounterId: encounter.encounterId,
      eventType: "VEHICLE_ENTRY",
      sequence: 5,
      occurredAt: "2026-08-09T13:19:00-05:00",
      timePrecision: "EXACT",
      locationId: location.locationId,
      summary: "Front-passenger window broken after repeated refusal to unlock and exit.",
      detailFamily: "VEHICLE",
      details: {
        family: "VEHICLE",
        encounterVehicleId: "evh_demo_subject_1",
        vehicleId: "veh_demo_subject_1",
        actionCode: "WINDOW_BREAK",
        entryMethodCode: "WINDOW_BREAK",
        windowPositionCode: "FRONT_PASSENGER",
        toolCode: "WINDOW_PUNCH",
        reasonCode: "REFUSED_EXIT",
        propertyDamageObserved: true,
        subjectEncounterParticipantId: "ep_demo_t2"
      },
      participantLinks: participantLinks([["ep_demo_t2", "AFFECTED"]]),
      officerLinks: officerLinks([["ofp_demo_2", "ACTOR"]])
    },
    {
      encounterEventId: "eev_demo_06",
      encounterId: encounter.encounterId,
      eventType: "USE_OF_FORCE",
      sequence: 6,
      occurredAt: "2026-08-09T13:20:00-05:00",
      timePrecision: "EXACT",
      locationId: location.locationId,
      summary: "Control hold used against an actively resisting collateral subject.",
      detailFamily: "FORCE",
      details: {
        family: "FORCE",
        forceIncidentId: "ufi_demo_01",
        techniqueCode: "CONTROL_HOLD",
        toolCode: null,
        reasonCode: "RESISTING",
        injuryObserved: false,
        medicalDispositionCode: "NOT_REQUIRED",
        subjectEncounterParticipantId: "ep_demo_c1"
      },
      participantLinks: participantLinks([["ep_demo_c1", "AFFECTED"], ["ep_demo_t1", "PRESENT"]]),
      officerLinks: officerLinks([["ofp_demo_1", "ACTOR"], ["ofp_demo_2", "ASSISTING"]])
    },
    {
      encounterEventId: "eev_demo_07",
      encounterId: encounter.encounterId,
      eventType: "ARREST",
      sequence: 7,
      occurredAt: "2026-08-09T13:22:00-05:00",
      timePrecision: "EXACT",
      locationId: location.locationId,
      summary: "Mara Vega arrested.",
      detailFamily: "DETENTION",
      details: { family: "DETENTION", custodyTypeCode: "ADMINISTRATIVE", restraintUsed: false, authoritySummary: "I-200" },
      participantLinks: participantLinks([["ep_demo_t1", "RECIPIENT"]]),
      officerLinks: officerLinks([["ofp_demo_1", "ACTOR"]])
    },
    {
      encounterEventId: "eev_demo_08",
      encounterId: encounter.encounterId,
      eventType: "ARREST",
      sequence: 8,
      occurredAt: "2026-08-09T13:23:00-05:00",
      timePrecision: "EXACT",
      locationId: location.locationId,
      summary: "Tomas Rook arrested.",
      detailFamily: "DETENTION",
      details: { family: "DETENTION", custodyTypeCode: "ADMINISTRATIVE", restraintUsed: false, authoritySummary: "Final order" },
      participantLinks: participantLinks([["ep_demo_t2", "RECIPIENT"]]),
      officerLinks: officerLinks([["ofp_demo_2", "ACTOR"]])
    },
    {
      encounterEventId: "eev_demo_09",
      encounterId: encounter.encounterId,
      eventType: "ARREST",
      sequence: 9,
      occurredAt: "2026-08-09T13:24:00-05:00",
      timePrecision: "EXACT",
      locationId: location.locationId,
      summary: "Carlos Voss arrested.",
      detailFamily: "DETENTION",
      details: { family: "DETENTION", custodyTypeCode: "ADMINISTRATIVE", restraintUsed: false, authoritySummary: "Warrantless administrative basis" },
      participantLinks: participantLinks([["ep_demo_c1", "RECIPIENT"]]),
      officerLinks: officerLinks([["ofp_demo_1", "ACTOR"]])
    },
    {
      encounterEventId: "eev_demo_10",
      encounterId: encounter.encounterId,
      eventType: "RESTRAINT",
      sequence: 10,
      occurredAt: "2026-08-09T13:25:00-05:00",
      timePrecision: "EXACT",
      locationId: location.locationId,
      summary: "Routine handcuffing following arrest.",
      detailFamily: "DETENTION",
      details: { family: "DETENTION", custodyTypeCode: "ADMINISTRATIVE", restraintUsed: true, authoritySummary: "Routine post-arrest restraint" },
      participantLinks: participantLinks([["ep_demo_t1", "RECIPIENT"], ["ep_demo_t2", "RECIPIENT"], ["ep_demo_c1", "RECIPIENT"]]),
      officerLinks: officerLinks([["ofp_demo_1", "ACTOR"], ["ofp_demo_2", "ACTOR"]])
    },
    {
      encounterEventId: "eev_demo_11",
      encounterId: encounter.encounterId,
      eventType: "RELEASE",
      sequence: 11,
      occurredAt: "2026-08-09T13:31:00-05:00",
      timePrecision: "EXACT",
      locationId: location.locationId,
      summary: "Lena Orbit released after citizenship was confirmed.",
      detailFamily: "DETENTION",
      details: { family: "DETENTION", custodyTypeCode: "UNKNOWN", restraintUsed: false, authoritySummary: "Released — U.S. citizenship confirmed" },
      participantLinks: participantLinks([["ep_demo_c2", "RECIPIENT"]]),
      officerLinks: officerLinks([["ofp_demo_3", "ACTOR"]])
    },
    {
      encounterEventId: "eev_demo_12",
      encounterId: encounter.encounterId,
      eventType: "TRANSPORT",
      sequence: 12,
      occurredAt: "2026-08-09T13:45:00-05:00",
      timePrecision: "EXACT",
      locationId: location.locationId,
      summary: "Three arrested subjects transported to the Dallas Field Office.",
      detailFamily: "DETENTION",
      details: { family: "DETENTION", custodyTypeCode: "ADMINISTRATIVE", restraintUsed: true, transportDestination: "Dallas Field Office" },
      participantLinks: participantLinks([["ep_demo_t1", "RECIPIENT"], ["ep_demo_t2", "RECIPIENT"], ["ep_demo_c1", "RECIPIENT"]]),
      officerLinks: officerLinks([["ofp_demo_1", "ACTOR"], ["ofp_demo_2", "ACTOR"]])
    }
  ];

  var participantById = {};
  participants.forEach(function (part) { participantById[part.encounterParticipantId] = part; });

  function arrestedExcept(focusId) {
    return participants
      .filter(function (part) {
        return part.encounterParticipantId !== focusId && part.finalOutcome === "ARRESTED";
      })
      .sort(function (a, b) {
        return String(a.finalOutcomeAt).localeCompare(String(b.finalOutcomeAt)) ||
          a.encounterRole.localeCompare(b.encounterRole) || a.roleSequence - b.roleSequence;
      });
  }

  function otherArrestedText(focusId) {
    var rows = arrestedExcept(focusId);
    if (!rows.length) return "";
    return "The following other individuals were arrested during this encounter: " +
      rows.map(function (part) {
        var snap = part.identitySnapshot || {};
        return snap.displayName + (snap.aNumber ? " (A" + snap.aNumber + ")" : "");
      }).join("; ") + ".";
  }

  function primaryNarrative(id, focusId, options) {
    options = options || {};
    var part = participantById[focusId];
    var name = part.identitySnapshot.displayName;
    var outcomeText = part.finalOutcome === "ARRESTED"
      ? name + " was arrested and transported to the Dallas Field Office for processing."
      : part.finalOutcome === "RELEASED"
        ? name + " was released at the scene after U.S. citizenship was confirmed."
        : "Officers did not locate " + name + " during the operation, and no enforcement action was taken.";
    var otherText = otherArrestedText(focusId);
    var sections = [
      {
        sectionId: "origin",
        sequence: 10,
        title: "Origin",
        sectionType: "TEMPLATE",
        resolvedText: part.encounterRole === "TARGET"
          ? "Officers conducted a preplanned enforcement action to locate and arrest " + name + "."
          : "Officers encountered " + name + " while conducting a preplanned enforcement action."
      },
      {
        sectionId: "final_disposition",
        sequence: 100,
        title: "Final Disposition",
        sectionType: "TEMPLATE",
        resolvedText: outcomeText
      }
    ];
    if (otherText) {
      sections.splice(1, 0, {
        sectionId: "other_persons_arrested",
        sequence: 85,
        title: "Other Persons Arrested",
        sectionType: "SYSTEM_OTHER_ARRESTED",
        resolvedText: otherText,
        sourceEncounterParticipantIds: arrestedExcept(focusId).map(function (row) {
          return row.encounterParticipantId;
        })
      });
    }
    var text = sections.map(function (section) { return section.resolvedText.trim(); }).join("\n\n");
    return {
      schema: "copdoc.narrative.v2",
      recordType: "NARRATIVE",
      narrativeId: id,
      encounterId: encounter.encounterId,
      narrativeKind: "PRIMARY_SUBJECT",
      focusEncounterParticipantId: focusId,
      relatedEncounterParticipantIds: participants.map(function (row) { return row.encounterParticipantId; }),
      title: name + " — Primary subject narrative",
      sequence: options.sequence || 1,
      workflowStatus: options.workflowStatus || "DRAFT",
      freshnessStatus: "CURRENT",
      engine: {
        version: "9.0.0",
        build: 9,
        stateSchema: "copdoc.narrative-state.v3",
        state: {
          schema: "copdoc.narrative-state.v3",
          encounter: {
            focusEncounterParticipantId: focusId,
            selections: clone(options.selections || {}),
            times: clone(options.times || {}),
            tokenBindings: [],
            tokenTypeOverrides: [],
            view: "values"
          },
          narrative: { plainText: text, plainTextIsManual: false }
        }
      },
      output: {
        schema: "copdoc.narrative-output.v3",
        sections: sections,
        generatedResolvedText: text,
        finalPlainText: text,
        plainTextIsManual: false
      },
      bindings: [],
      factsManifest: {
        focusEncounterParticipantId: focusId,
        otherArrestedEncounterParticipantIds: arrestedExcept(focusId).map(function (row) {
          return row.encounterParticipantId;
        })
      },
      validationSnapshot: { valid: true, errors: [], warnings: [] },
      sourceSnapshot: { encounterId: encounter.encounterId, participantRevision: 1 }
    };
  }

  var narratives = [
    primaryNarrative("nar_demo_t1_primary", "ep_demo_t1", {
      selections: {
        origin_type: "preplanned_targeted_arrest",
        existing_authority: "form_i200",
        encounter_location_type: "moving_vehicle",
        contact_method: "vehicle_stop",
        enforcement_action: "administrative_arrest_i200",
        final_outcome: "transported_ice_office"
      },
      times: { contact_method: { value: "13:18", mode: "manual" } }
    }),
    primaryNarrative("nar_demo_t2_primary", "ep_demo_t2", {
      selections: {
        origin_type: "preplanned_targeted_arrest",
        existing_authority: "final_order",
        encounter_location_type: "moving_vehicle",
        contact_method: "vehicle_stop",
        subject_conduct: "locked_vehicle_refused_exit",
        window_break: "passenger_front_window",
        window_break_tool: "window_punch",
        enforcement_action: "administrative_arrest_i200",
        final_outcome: "transported_ice_office"
      },
      times: { contact_method: { value: "13:18", mode: "manual" } }
    }),
    primaryNarrative("nar_demo_c1_primary", "ep_demo_c1", {
      selections: {
        origin_type: "collateral_encounter",
        existing_authority: "warrantless_basis",
        encounter_location_type: "moving_vehicle",
        contact_method: "vehicle_stop",
        subject_conduct: "active_resistance",
        force_type: "control_hold",
        force_result: "no_injury",
        enforcement_action: "warrantless_administrative_arrest",
        final_outcome: "transported_ice_office"
      },
      times: { force_type: { value: "13:20", mode: "manual" } }
    }),
    primaryNarrative("nar_demo_c2_primary", "ep_demo_c2", {
      selections: {
        origin_type: "collateral_encounter",
        encounter_location_type: "moving_vehicle",
        contact_method: "vehicle_stop",
        enforcement_action: "released_no_action",
        final_outcome: "released_scene"
      },
      times: { contact_method: { value: "13:18", mode: "manual" } }
    }),
    {
      schema: "copdoc.narrative.v2",
      recordType: "NARRATIVE",
      narrativeId: "nar_demo_t1_supplement_1",
      encounterId: encounter.encounterId,
      narrativeKind: "SUBJECT_SUPPLEMENT",
      focusEncounterParticipantId: "ep_demo_t1",
      relatedEncounterParticipantIds: ["ep_demo_t1"],
      title: "MARA VEGA — Records-check supplement",
      sequence: 2,
      workflowStatus: "DRAFT",
      freshnessStatus: "CURRENT",
      engine: null,
      output: {
        sections: [{
          sectionId: "supplement",
          sequence: 1,
          title: "Supplement",
          sectionType: "MANUAL_SUPPLEMENT",
          manualTextOverride: "Supplemental note: Officers later confirmed the final-order date through agency records."
        }],
        generatedResolvedText: "",
        finalPlainText: "Supplemental note: Officers later confirmed the final-order date through agency records.",
        plainTextIsManual: true
      }
    },
    {
      schema: "copdoc.narrative.v2",
      recordType: "NARRATIVE",
      narrativeId: "nar_demo_encounter_overview",
      encounterId: encounter.encounterId,
      narrativeKind: "ENCOUNTER_OVERVIEW",
      focusEncounterParticipantId: null,
      relatedEncounterParticipantIds: participants.map(function (row) { return row.encounterParticipantId; }),
      title: "Encounter overview",
      sequence: 1,
      workflowStatus: "DRAFT",
      freshnessStatus: "CURRENT",
      output: { sections: [], generatedResolvedText: "", finalPlainText: "Synthetic vehicle-stop encounter overview.", plainTextIsManual: true }
    },
    {
      schema: "copdoc.narrative.v2",
      recordType: "NARRATIVE",
      narrativeId: "nar_demo_encounter_supplement_1",
      encounterId: encounter.encounterId,
      narrativeKind: "ENCOUNTER_SUPPLEMENT",
      focusEncounterParticipantId: null,
      relatedEncounterParticipantIds: [],
      title: "Encounter equipment supplement",
      sequence: 2,
      workflowStatus: "DRAFT",
      freshnessStatus: "CURRENT",
      output: { sections: [], generatedResolvedText: "", finalPlainText: "Training-only equipment note.", plainTextIsManual: true }
    }
  ];

  function packetForFocus(focusId) {
    if (!participantById[focusId]) throw new Error("Unknown demo focus participant: " + focusId);
    var arrestedOrdinal = 0;
    var objects = [{
      id: encounter.encounterId,
      entity_id: encounter.encounterId,
      type: "encounter",
      roles: [{ role: "encounter", ordinal: 1 }],
      label: encounter.encounterNumber,
      fields: {
        encounter_number: encounter.encounterNumber,
        encounter_type: encounter.eventType,
        started_at: encounter.startedAt,
        ended_at: encounter.endedAt
      }
    }];

    participants.forEach(function (part) {
      var roles = [{
        role: part.encounterRole === "TARGET" ? "target" : "collateral",
        ordinal: part.roleSequence
      }];
      if (part.encounterParticipantId === focusId) {
        roles.push({ role: "narrative_subject", ordinal: 1 });
        // Transitional Build 8 alias. Only the focus receives it.
        roles.push({ role: "primary_target", ordinal: 1 });
      }
      if (part.finalOutcome === "ARRESTED") {
        arrestedOrdinal += 1;
        roles.push({ role: "arrested_subject", ordinal: arrestedOrdinal });
      }
      objects.push({
        id: part.encounterParticipantId,
        entity_id: part.personId,
        type: "person",
        roles: roles,
        label: part.identitySnapshot.displayName,
        fields: {
          full_name: part.identitySnapshot.displayName,
          date_of_birth: part.identitySnapshot.dateOfBirth || "",
          a_number: part.identitySnapshot.aNumber || "",
          sex: part.identitySnapshot.sex || "",
          country: part.identitySnapshot.nationalityCountryCode || "",
          ice_event: part.iceEventNumber || "",
          encounter_role: part.encounterRole,
          final_outcome: part.finalOutcome || "",
          final_outcome_at: part.finalOutcomeAt || "",
          immigration_disposition: part.immigrationSnapshot.dispositionCode,
          final_order_status: part.immigrationSnapshot.finalOrder.statusCode
        },
        metadata: {
          encounter_participant_id: part.encounterParticipantId,
          focus: part.encounterParticipantId === focusId,
          primary_for_report: !!part.primaryForReport
        }
      });
    });

    objects.push({
      id: location.locationId,
      entity_id: location.locationId,
      type: "location",
      roles: [{ role: "contact_location", ordinal: 1 }],
      label: location.generatedDisplayName,
      fields: {
        location: location.generatedDisplayName,
        address: location.generatedDisplayName,
        city: location.postalAddress.city,
        state: location.postalAddress.stateOrRegion
      }
    });

    objects.push({
      id: vehicles[0].vehicleId,
      entity_id: vehicles[0].vehicleId,
      type: "vehicle",
      roles: [{ role: "encountered_vehicle", ordinal: 1 }],
      label: vehicles[0].displayName,
      fields: {
        display_name: vehicles[0].displayName,
        vehicle: vehicles[0].displayName,
        plate: vehicles[0].plate.value
      },
      relationships: { associated_with: ["ep_demo_t1", "ep_demo_t2", "ep_demo_c1", "ep_demo_c2"] }
    });

    officers.forEach(function (officer, index) {
      objects.push({
        id: officer.officerProfileId,
        entity_id: officer.personId,
        type: "officer",
        roles: [{ role: "officer", ordinal: index + 1 }],
        label: officer.displayName,
        fields: { full_name: officer.displayName, officer: officer.displayName, badge_number: officer.badgeNumber }
      });
    });

    events.forEach(function (event) {
      objects.push({
        id: event.encounterEventId,
        entity_id: event.encounterEventId,
        type: "event",
        roles: [{ role: "timeline_event", ordinal: event.sequence }],
        label: event.eventType,
        fields: {
          event_type: event.eventType,
          occurred_at: event.occurredAt,
          sequence: event.sequence,
          summary: event.summary
        },
        relationships: {
          participants: event.participantLinks.map(function (link) { return link.encounterParticipantId; }),
          officers: event.officerLinks.map(function (link) { return link.officerProfileId; }),
          location: event.locationId
        },
        metadata: { detailFamily: event.detailFamily, details: clone(event.details) }
      });
    });

    return {
      schema_version: "copdoc.narrative-data.v3",
      packet_id: encounter.encounterId + "::" + focusId,
      packet_name: encounter.encounterNumber + " · " + participantById[focusId].identitySnapshot.displayName,
      is_test_data: true,
      objects: objects,
      metadata: {
        encounter_id: encounter.encounterId,
        focus_encounter_participant_id: focusId,
        source: "copdoc.narrative-demo-fixture.v1",
        synthetic: true
      }
    };
  }

  var expectedSummary = {
    schema: "copdoc.encounter-summary.v1",
    encounterId: encounter.encounterId,
    algorithmVersion: "1.0.0",
    who: {
      participantCount: 5,
      targetCount: 3,
      collateralCount: 2,
      officerCount: 3,
      arrestedParticipantIds: ["ep_demo_t1", "ep_demo_t2", "ep_demo_c1"]
    },
    what: {
      encounterTypeCode: "VEHICLE_STOP",
      outcomesByCode: { ARRESTED: 3, RELEASED: 1, NOT_CONTACTED: 1 },
      arrestedCount: 3,
      detainedCount: 0,
      releasedCount: 1,
      transferredCount: 0,
      notContactedCount: 1,
      immigrationDispositionPeopleByCode: { FINAL_ORDER: 2, PENDING_IJ: 1, USC: 1, UNKNOWN: 1 },
      earmDispositionPeopleByCode: { REINST: 1, B: 1, "WA/NTA": 1, FBUSC: 1, UNKNOWN: 1 },
      finalOrders: { confirmed: 2, notConfirmed: 2, unknown: 1 }
    },
    where: {
      primaryLocationId: location.locationId,
      formattedAddress: location.generatedDisplayName,
      latitude: 32.7357,
      longitude: -97.1081
    },
    when: {
      startedAt: encounter.startedAt,
      endedAt: encounter.endedAt,
      durationMinutes: 55
    },
    how: {
      eventsByType: {
        ARRIVAL: 1,
        SURVEILLANCE: 1,
        VEHICLE_STOP: 1,
        VEHICLE_CONTAINMENT: 1,
        VEHICLE_ENTRY: 1,
        USE_OF_FORCE: 1,
        ARREST: 3,
        RESTRAINT: 1,
        RELEASE: 1,
        TRANSPORT: 1
      },
      vehicleStopOccurred: true,
      forceIncidentCount: 1,
      forceSubjectCount: 1,
      windowBreakIncidentCount: 1,
      collisionCount: 0,
      injuryIncidentCount: 0
    },
    generatedSupervisorText: "On August 9, 2026, three Officers conducted a vehicle stop at Training Location — 100 Demo Parkway, Arlington, Texas. The encounter recorded five participants: three targets and two collaterals. Three people were arrested, one was released, and one target was not contacted. Two participants had confirmed final orders. The encounter included one window-break entry and one reportable use-of-force incident; no injuries or collisions were reported. Primary narrative coverage was complete for all five participants."
  };

  var fixture = {
    schema: "copdoc.narrative-demo-fixture.v1",
    fixtureId: "multi-target-vehicle-stop",
    synthetic: true,
    encounter: encounter,
    operation: operation,
    location: location,
    vehicles: vehicles,
    encounterVehicles: encounterVehicles,
    officers: officers,
    participants: participants,
    events: events,
    narrativesInitial: narratives,
    missingPrimaryParticipantId: "ep_demo_t3",
    makeMissingPrimaryNarrative: function () {
      return primaryNarrative("nar_demo_t3_primary", "ep_demo_t3", {
        selections: {
          origin_type: "preplanned_targeted_arrest",
          existing_authority: "form_i200",
          final_outcome: "target_not_located"
        }
      });
    },
    packetForFocus: packetForFocus,
    otherArrestedText: otherArrestedText,
    expectedSummary: expectedSummary
  };

  global.COPDocNarrativeDemoFixture = fixture;
})(typeof window !== "undefined" ? window : globalThis);
