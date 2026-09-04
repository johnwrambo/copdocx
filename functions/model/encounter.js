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
    var when = opts.date;
    if (!when || typeof when.getFullYear !== "function") {
      when = new Date();
    }
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
    extra = extra || {};
    var built = model.assign(
      {
        subjectId: extra.subjectId || (model.newId ? model.newId("sub") : ""),
        personId: "",
        leadId: "",
        bookinRecordId: "",
        lastName: "",
        firstName: "",
        alienNumber: "",
        encounterRole: "",
        roleOther: "",
        citizenship: "",
        vehicleRole: "",
        custody: "",
        outcome: "",
        releaseReason: "",
        techniques: [],
        unidentified: false,
        notes: "",
        packetFiledAt: "",
        fledAt: "",
        fledAtPrecision: "",
        arrestingOfficerId: "",
        compliance: "",
        useOfForce: "",
        forceLevel: "",
        docsGeneratedAt: "",
        shared: {}
      },
      extra
    );
    if (!Array.isArray(built.techniques)) {
      built.techniques = [];
    }
    built.unidentified = !!built.unidentified;
    if (!built.shared || typeof built.shared !== "object" || Array.isArray(built.shared)) {
      built.shared = {};
    }
    if (!Array.isArray(built.shared.officerIds)) {
      built.shared.officerIds = built.shared.officerIds ? [].concat(built.shared.officerIds) : [];
    }
    if (!Array.isArray(built.shared.vehicles)) {
      built.shared.vehicles = [];
    }
    if (!built.subjectId && model.newId) {
      built.subjectId = model.newId("sub");
    }
    return built;
  }

  function formatSharedAddress(loc) {
    if (!loc) {
      return "";
    }
    var cityState = [loc.city, loc.state].filter(Boolean).join(", ");
    return [loc.street, loc.street2, cityState, loc.zip].filter(Boolean).join(", ");
  }

  function sharedStopFromEncounter(record) {
    record = record || {};
    var center = null;
    (record.locations || []).forEach(function (loc) {
      if (
        record.centerLocationId &&
        loc &&
        loc.locationId === record.centerLocationId
      ) {
        center = loc;
      }
    });
    if (!center) {
      center = (record.locations || [])[0] || null;
    }
    return {
      encounterId: record.encounterId || "",
      startedAt: record.startedAt || "",
      eventType: record.eventType || "",
      operationId: record.operationId || "",
      officerIds: Array.isArray(record.officerIds) ? record.officerIds.slice() : [],
      team: record.team || "",
      officeCode: record.officeCode || "",
      centerLocationId: (center && center.locationId) || record.centerLocationId || "",
      city: (center && center.city) || "",
      address: formatSharedAddress(center),
      latitude: (center && center.latitude) || "",
      longitude: (center && center.longitude) || "",
      vehicles: (record.vehicles || []).map(function (vehicle) {
        vehicle = vehicle || {};
        return {
          vehicleId: vehicle.vehicleId || vehicle.id || "",
          vehicleColor: vehicle.vehicleColor || "",
          vehicleMake: vehicle.vehicleMake || "",
          vehicleModel: vehicle.vehicleModel || "",
          licensePlate: vehicle.licensePlate || vehicle.plate || "",
          plateState: vehicle.plateState || "",
          encounterDisposition: vehicle.encounterDisposition || ""
        };
      })
    };
  }

  function stampSharedStop(subject, sharedOrEncounter) {
    var built = createEncounterSubject(subject || {});
    if (
      sharedOrEncounter &&
      (sharedOrEncounter.entityType === "ENCOUNTER" ||
        Array.isArray(sharedOrEncounter.locations))
    ) {
      built.shared = sharedStopFromEncounter(sharedOrEncounter);
      return built;
    }
    sharedOrEncounter = sharedOrEncounter || {};
    built.shared = {
      encounterId: sharedOrEncounter.encounterId || "",
      startedAt: sharedOrEncounter.startedAt || "",
      eventType: sharedOrEncounter.eventType || "",
      operationId: sharedOrEncounter.operationId || "",
      officerIds: Array.isArray(sharedOrEncounter.officerIds)
        ? sharedOrEncounter.officerIds.slice()
        : [],
      team: sharedOrEncounter.team || "",
      officeCode: sharedOrEncounter.officeCode || "",
      centerLocationId: sharedOrEncounter.centerLocationId || "",
      city: sharedOrEncounter.city || "",
      address: sharedOrEncounter.address || "",
      latitude: sharedOrEncounter.latitude || "",
      longitude: sharedOrEncounter.longitude || "",
      vehicles: Array.isArray(sharedOrEncounter.vehicles)
        ? sharedOrEncounter.vehicles.slice()
        : []
    };
    return built;
  }

  function leEncounterFromSubject(subject, shared) {
    subject = subject || {};
    shared = shared || subject.shared || {};
    return model.createEncounter({
      encounterId: shared.encounterId || "",
      subjectId: subject.subjectId || "",
      personId: subject.personId || "",
      encounterDate: shared.startedAt || "",
      encounterRole: subject.encounterRole || "",
      encounterType: shared.eventType || "",
      encounterDisposition: subject.outcome || "",
      encounterLocation: shared.address || shared.city || "",
      encounterReportNumber: shared.encounterId || "",
      encounterAgency: "",
      encounterNarrative: ""
    });
  }

  function upsertPersonLeEncounter(person, subject, shared) {
    if (!person) {
      return person;
    }
    shared = shared || (subject && subject.shared) || {};
    var key = String(shared.encounterId || "");
    var subjectId = String((subject && subject.subjectId) || "");
    if (!key) {
      return person;
    }
    person.encounters = Array.isArray(person.encounters) ? person.encounters : [];
    var row = leEncounterFromSubject(subject, shared);
    var index = -1;
    person.encounters.forEach(function (item, i) {
      if (!item || String(item.encounterId || "") !== key) {
        return;
      }
      if (subjectId && item.subjectId && String(item.subjectId) !== subjectId) {
        return;
      }
      if (index < 0) {
        index = i;
      }
    });
    if (index >= 0) {
      person.encounters[index] = model.assign(person.encounters[index], row);
    } else {
      person.encounters.push(row);
    }
    return person;
  }

  function arrestInputFromSubject(subject, shared, extra) {
    extra = extra || {};
    subject = subject || {};
    shared = shared || subject.shared || {};
    var started = String(shared.startedAt || extra.arrestDateTime || "");
    var vehiclePosition = "";
    if (subject.vehicleRole === "DRIVER") {
      vehiclePosition = "driver";
    } else if (subject.vehicleRole === "PASSENGER") {
      vehiclePosition = "passenger";
    }
    return {
      personId: subject.personId || extra.personId || "",
      leadId: subject.leadId || extra.leadId || "",
      lastName: subject.lastName || extra.lastName || "",
      firstName: subject.firstName || extra.firstName || "",
      alienNumber: subject.alienNumber || extra.alienNumber || "",
      citizenship: subject.citizenship || extra.citizenship || "",
      encounterId: shared.encounterId || extra.encounterId || "",
      encounterNumber: shared.encounterId || extra.encounterNumber || "",
      subjectRole: subject.encounterRole || extra.subjectRole || "",
      vehiclePosition: extra.vehiclePosition || vehiclePosition,
      arrestingOfficer: extra.arrestingOfficer || "",
      arrestingOfficerId: subject.arrestingOfficerId || extra.arrestingOfficerId || "",
      team: shared.team || extra.team || "",
      arrestDateTime: extra.arrestDateTime || started,
      arrestDate: extra.arrestDate || started.slice(0, 10),
      arrestTime:
        extra.arrestTime ||
        (started.length >= 16 ? started.slice(11, 16) : ""),
      arrestLocation: extra.arrestLocation || shared.address || "",
      latitude: extra.latitude || shared.latitude || "",
      longitude: extra.longitude || shared.longitude || "",
      bookinRecordId: extra.bookinRecordId || subject.bookinRecordId || "",
      bookInDateTime: extra.bookInDateTime || "",
      booking: extra.booking || {}
    };
  }

  function encounterSubjectFromPerson(person, extra) {
    person = person || {};
    var name = person.name && typeof person.name === "object" ? person.name : {};
    var immigration = person.immigration && typeof person.immigration === "object"
      ? person.immigration
      : {};
    return createEncounterSubject(
      model.assign(
        {
          personId: person.personId || "",
          lastName: name.lastName || "",
          firstName: name.firstName || "",
          alienNumber: immigration.alienNumber || "",
          citizenship: person.citizenship || ""
        },
        extra || {}
      )
    );
  }

  function officerIdsFromOperation(operation) {
    var ids = [];
    var seen = Object.create(null);
    if (!operation) {
      return ids;
    }
    (operation.teams || []).forEach(function (team) {
      (team.members || []).forEach(function (member) {
        var id = member && (member.officerId || member.id);
        if (!id || seen[id]) {
          return;
        }
        seen[id] = true;
        ids.push(id);
      });
    });
    return ids;
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
        eventType: "",
        operationId: "",
        officerIds: [],
        centerLocationId: "",
        vehicles: [],
        locations: [],
        subjects: [],
        links: [],
        narratives: [],
        supervisorSummary: {
          text: "",
          derivedAt: "",
          coverage: null
        },
        completed: null,
        completedHistory: [],
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
    if (!Array.isArray(built.links)) {
      built.links = [];
    }
    if (!Array.isArray(built.narratives)) {
      built.narratives = [];
    }
    if (!Array.isArray(built.officerIds)) {
      built.officerIds = [];
    }
    if (!Array.isArray(built.completedHistory)) {
      built.completedHistory = [];
    }
    built.eventType = built.eventType || "";
    built.operationId = built.operationId || "";
    built.centerLocationId = built.centerLocationId || "";
    if (!built.supervisorSummary || typeof built.supervisorSummary !== "object") {
      built.supervisorSummary = { text: "", derivedAt: "", coverage: null };
    }
    return built;
  }

  function copyPlaceAsEncounterLocation(place) {
    if (!place || !model.createLocation) {
      return null;
    }
    var loc = model.createLocation({
      street: place.street || "",
      street2: place.street2 || "",
      city: place.city || "",
      state: place.state || "",
      zip: place.zip || "",
      latitude: place.latitude || "",
      longitude: place.longitude || "",
      association: place.association || "target"
    });
    if (!loc.association) {
      loc.association = "target";
    }
    return loc;
  }

  function parseYmm(text) {
    var bits = String(text || "").trim().split(/\s+/);
    var out = { vehicleYear: "", vehicleMake: "", vehicleModel: "" };
    if (!bits.length || (bits.length === 1 && !bits[0])) {
      return out;
    }
    if (/^\d{4}$/.test(bits[0])) {
      out.vehicleYear = bits[0];
      out.vehicleMake = bits[1] || "";
      out.vehicleModel = bits.slice(2).join(" ");
      return out;
    }
    out.vehicleMake = bits[0] || "";
    out.vehicleModel = bits.slice(1).join(" ");
    return out;
  }

  function copyFreezeVehicle(row) {
    if (!row || !model.createVehicle) {
      return null;
    }
    var ymm = parseYmm(row.ymm);
    return model.createVehicle({
      licensePlate: row.plate || row.licensePlate || "",
      plateState: row.plateState || "",
      vehicleYear: ymm.vehicleYear,
      vehicleMake: ymm.vehicleMake,
      vehicleModel: ymm.vehicleModel
    });
  }

  function subjectAlreadyListed(subjects, personId) {
    if (!personId) {
      return false;
    }
    return (subjects || []).some(function (row) {
      return row && row.personId === personId;
    });
  }

  function roleFromCaseRole(caseRole) {
    var stage = String(caseRole || "").toUpperCase();
    if (stage === "LEAD" || stage === "TARGET" || !stage) {
      return "TARGET";
    }
    return "COLLATERAL";
  }

  function seedEncounterFromLead(encounter, lead, opts) {
    opts = opts || {};
    encounter = encounter || createEncounterRecord();
    if (!lead) {
      return encounter;
    }
    var seedPlaces = opts.seedPlaces !== false;
    var seedVehicles = opts.seedVehicles !== false;
    var seedSubject = opts.seedSubject !== false;
    var person = model.subjectOf ? model.subjectOf(lead) : lead.person;
    encounter.locations = Array.isArray(encounter.locations)
      ? encounter.locations
      : [];
    encounter.vehicles = Array.isArray(encounter.vehicles)
      ? encounter.vehicles
      : [];
    encounter.subjects = Array.isArray(encounter.subjects)
      ? encounter.subjects
      : [];
    if (
      seedSubject &&
      person &&
      person.personId &&
      !subjectAlreadyListed(encounter.subjects, person.personId)
    ) {
      encounter.subjects.push(
        encounterSubjectFromPerson(person, {
          leadId: lead.leadId || "",
          encounterRole: roleFromCaseRole(person.caseRole || lead.caseRole)
        })
      );
    }
    if (seedPlaces) {
      ((person && person.locations) || []).forEach(function (loc) {
        if (model.isHistoricalOccupancy && model.isHistoricalOccupancy(loc)) {
          return;
        }
        var copy = copyPlaceAsEncounterLocation(
          Object.assign({}, loc, { association: "target" })
        );
        if (copy) {
          encounter.locations.push(copy);
        }
      });
    }
    if (seedVehicles) {
      (lead.vehicles || []).forEach(function (vehicle) {
        var copy = copyFreezeVehicle({
          plate: vehicle.licensePlate || vehicle.plate,
          plateState: vehicle.plateState,
          ymm: [vehicle.vehicleYear, vehicle.vehicleMake, vehicle.vehicleModel]
            .filter(Boolean)
            .join(" ")
        });
        if (copy) {
          encounter.vehicles.push(copy);
        }
      });
    }
    if (!encounter.centerLocationId && encounter.locations[0]) {
      encounter.centerLocationId = encounter.locations[0].locationId;
    }
    return encounter;
  }

  function seedEncounterFromPerson(encounter, person, extra) {
    extra = extra || {};
    encounter = encounter || createEncounterRecord();
    if (!person) {
      return encounter;
    }
    return seedEncounterFromLead(
      encounter,
      {
        leadId: extra.leadId || "",
        caseRole: person.caseRole || extra.caseRole || "",
        person: person,
        vehicles: extra.vehicles || []
      },
      extra
    );
  }

  function seedEncounterFromOperation(encounter, operation, opts) {
    opts = opts || {};
    encounter = encounter || createEncounterRecord();
    operation = operation || {};
    var getLead = typeof opts.getLead === "function" ? opts.getLead : null;
    encounter.operationId = operation.operationId || encounter.operationId || "";
    var ids = officerIdsFromOperation(operation);
    if (ids.length && !(encounter.officerIds || []).length) {
      encounter.officerIds = ids.slice();
    }
    encounter.locations = Array.isArray(encounter.locations)
      ? encounter.locations
      : [];
    encounter.vehicles = Array.isArray(encounter.vehicles)
      ? encounter.vehicles
      : [];
    encounter.subjects = Array.isArray(encounter.subjects)
      ? encounter.subjects
      : [];
    var seedPlaces = encounter.locations.length === 0;
    var seedVehicles = encounter.vehicles.length === 0;
    var seedSubjects = encounter.subjects.length === 0;
    (operation.targets || []).forEach(function (target) {
      if (!target) {
        return;
      }
      var lead = target.leadId && getLead ? getLead(target.leadId) : null;
      var freeze = target.freeze;
      if (!freeze && lead && model.freezeOperationTarget) {
        freeze = model.freezeOperationTarget(lead);
      }
      if (lead) {
        seedEncounterFromLead(encounter, lead, {
          seedPlaces: seedPlaces,
          seedVehicles: seedVehicles,
          seedSubject: seedSubjects
        });
        return;
      }
      if (seedSubjects && freeze && freeze.subjectLabel && target.personId) {
        var bits = String(freeze.subjectLabel).split(",");
        if (!subjectAlreadyListed(encounter.subjects, target.personId)) {
          encounter.subjects.push(
            createEncounterSubject({
              personId: target.personId,
              leadId: target.leadId || "",
              lastName: String(bits[0] || "").trim(),
              firstName: String((bits[1] || "").trim()),
              encounterRole: "TARGET"
            })
          );
        }
      }
      if (seedPlaces) {
        ((freeze && freeze.places) || []).forEach(function (place) {
          var copy = copyPlaceAsEncounterLocation(
            Object.assign({}, place, { association: "target" })
          );
          if (copy) {
            encounter.locations.push(copy);
          }
        });
      }
      if (seedVehicles) {
        ((freeze && freeze.vehicles) || []).forEach(function (veh) {
          var copy = copyFreezeVehicle(veh);
          if (copy) {
            encounter.vehicles.push(copy);
          }
        });
      }
    });
    if (!encounter.centerLocationId && encounter.locations[0]) {
      encounter.centerLocationId = encounter.locations[0].locationId;
    }
    return encounter;
  }

  model.nextEncounterId = nextEncounterId;
  model.createEncounterRecord = createEncounterRecord;
  model.createEncounterSubject = createEncounterSubject;
  model.encounterSubjectFromPerson = encounterSubjectFromPerson;
  model.sharedStopFromEncounter = sharedStopFromEncounter;
  model.stampSharedStop = stampSharedStop;
  model.leEncounterFromSubject = leEncounterFromSubject;
  model.upsertPersonLeEncounter = upsertPersonLeEncounter;
  model.arrestInputFromSubject = arrestInputFromSubject;
  model.officerIdsFromOperation = officerIdsFromOperation;
  model.seedEncounterFromOperation = seedEncounterFromOperation;
  model.seedEncounterFromLead = seedEncounterFromLead;
  model.seedEncounterFromPerson = seedEncounterFromPerson;
})(typeof window !== "undefined" ? window : globalThis);
