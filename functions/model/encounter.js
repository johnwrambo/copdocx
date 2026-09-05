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

  var hasOwn = Object.prototype.hasOwnProperty;

  function subjectText(value) {
    return String(value == null ? "" : value).trim();
  }

  function subjectOwn(row, key) {
    return !!row && hasOwn.call(row, key);
  }

  function encounterSubjectId(subject) {
    return subjectText(subject && subject.subjectId);
  }

  function encounterSubjectBookingId(subject) {
    if (subjectOwn(subject, "bookingId")) {
      return subjectText(subject.bookingId);
    }
    return subjectText(subject && subject.bookinRecordId);
  }

  function encounterSubjectRole(subject) {
    if (subjectOwn(subject, "role")) {
      return subjectText(subject.role).toUpperCase();
    }
    return subjectText(subject && subject.encounterRole).toUpperCase();
  }

  function encounterSubjectOccupantRole(subject) {
    if (subjectOwn(subject, "occupantRole")) {
      return subjectText(subject.occupantRole).toUpperCase();
    }
    return subjectText(subject && subject.vehicleRole).toUpperCase();
  }

  /**
   * A stable migration identifier for an embedded EncounterSubject that predates
   * subjectId. It is deliberately based on the owning Encounter and the
   * strongest legacy reference available. The row index is used only when the
   * legacy row has no usable reference of its own.
   */
  function deterministicEncounterSubjectId(encounterId, subject, index) {
    subject = subject || {};
    var identity = "";
    var bookingId = encounterSubjectBookingId(subject);
    var personId = subjectText(subject.personId);
    var leadId = subjectText(subject.leadId);
    var alienNumber = subjectText(subject.alienNumber).replace(/\D/g, "");
    var name = [
      subjectText(subject.lastName).toUpperCase(),
      subjectText(subject.firstName).toUpperCase()
    ].join("|");
    if (bookingId) {
      identity = "booking|" + bookingId;
    } else if (personId) {
      identity = "person|" + personId;
    } else if (leadId) {
      identity = "lead|" + leadId;
    } else if (alienNumber) {
      identity = "alien|" + alienNumber + "|" + name;
    } else if (name !== "|") {
      identity = "name|" + name;
    } else {
      identity = "row|" + String(index == null ? 0 : index);
    }
    var seed = subjectText(encounterId) + "|" + identity;
    var hash = 5381;
    var secondaryHash = 2166136261;
    var i;
    for (i = 0; i < seed.length; i += 1) {
      hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
      secondaryHash ^= seed.charCodeAt(i);
      secondaryHash =
        (secondaryHash +
          (secondaryHash << 1) +
          (secondaryHash << 4) +
          (secondaryHash << 7) +
          (secondaryHash << 8) +
          (secondaryHash << 24)) |
        0;
    }
    var encoded = (hash >>> 0).toString(36);
    var secondaryEncoded = (secondaryHash >>> 0).toString(36);
    while (encoded.length < 7) {
      encoded = "0" + encoded;
    }
    while (secondaryEncoded.length < 7) {
      secondaryEncoded = "0" + secondaryEncoded;
    }
    return "sub_legacy_" + encoded + secondaryEncoded;
  }

  function normalizeEncounterSubject(extra, opts) {
    extra = extra && typeof extra === "object" && !Array.isArray(extra) ? extra : {};
    opts = opts || {};
    var encounterId =
      subjectText(opts.encounterId) ||
      subjectText(extra.encounterId) ||
      subjectText(extra.shared && extra.shared.encounterId);
    var bookingId = encounterSubjectBookingId(extra);
    var role = encounterSubjectRole(extra);
    var occupantRole = encounterSubjectOccupantRole(extra);
    var subjectId = encounterSubjectId(extra) || subjectText(opts.subjectId);
    if (!subjectId && encounterId && opts.deterministic !== false) {
      subjectId = deterministicEncounterSubjectId(encounterId, extra, opts.index);
    }
    if (!subjectId && opts.mintId !== false) {
      subjectId = model.newId
        ? model.newId("sub")
        : "sub_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
    }
    var built = model.assign(
      {
        entityType: "ENCOUNTER_SUBJECT",
        schema: "copdocx.encounter-subject.v1",
        subjectId: subjectId,
        encounterId: encounterId,
        personId: "",
        leadId: "",
        bookingId: bookingId,
        bookinRecordId: bookingId,
        lastName: "",
        firstName: "",
        alienNumber: "",
        role: role,
        encounterRole: role,
        roleOther: "",
        citizenship: "",
        occupantRole: occupantRole,
        vehicleRole: occupantRole,
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
    built.entityType = built.entityType || "ENCOUNTER_SUBJECT";
    built.schema = built.schema || "copdocx.encounter-subject.v1";
    built.subjectId = subjectId;
    built.encounterId = encounterId;
    built.personId = subjectText(built.personId);
    built.leadId = subjectText(built.leadId);
    built.bookingId = bookingId;
    built.bookinRecordId = bookingId;
    built.role = role;
    built.encounterRole = role;
    built.occupantRole = occupantRole;
    built.vehicleRole = occupantRole;
    if (!Array.isArray(built.techniques)) {
      built.techniques = [];
    } else {
      built.techniques = built.techniques.slice();
    }
    built.unidentified = !!built.unidentified;
    if (!built.shared || typeof built.shared !== "object" || Array.isArray(built.shared)) {
      built.shared = {};
    }
    if (!Array.isArray(built.shared.officerIds)) {
      built.shared.officerIds = built.shared.officerIds ? [].concat(built.shared.officerIds) : [];
    } else {
      built.shared.officerIds = built.shared.officerIds.slice();
    }
    if (!Array.isArray(built.shared.vehicles)) {
      built.shared.vehicles = [];
    } else {
      built.shared.vehicles = built.shared.vehicles.slice();
    }
    var seenLegacyIds = {};
    built.legacyEncounterParticipantIds = (
      Array.isArray(built.legacyEncounterParticipantIds)
        ? built.legacyEncounterParticipantIds
        : []
    ).reduce(function (ids, value) {
      var id = subjectText(value);
      if (id && !seenLegacyIds[id]) {
        seenLegacyIds[id] = true;
        ids.push(id);
      }
      return ids;
    }, []);
    var bookingAlias = bookingId ? "ep_" + bookingId : "";
    if (bookingAlias && !seenLegacyIds[bookingAlias]) {
      built.legacyEncounterParticipantIds.push(bookingAlias);
    }
    return built;
  }

  function cloneSubject(subject) {
    return JSON.parse(JSON.stringify(subject || {}));
  }

  function applyIncomingSubjectAliases(merged, incoming) {
    var value;
    if (subjectOwn(incoming, "bookingId")) {
      value = subjectText(incoming.bookingId);
      merged.bookingId = value;
      merged.bookinRecordId = value;
    } else if (subjectOwn(incoming, "bookinRecordId")) {
      value = subjectText(incoming.bookinRecordId);
      merged.bookingId = value;
      merged.bookinRecordId = value;
    }
    if (subjectOwn(incoming, "role")) {
      value = subjectText(incoming.role);
      merged.role = value;
      merged.encounterRole = value;
    } else if (subjectOwn(incoming, "encounterRole")) {
      value = subjectText(incoming.encounterRole);
      merged.role = value;
      merged.encounterRole = value;
    }
    if (subjectOwn(incoming, "occupantRole")) {
      value = subjectText(incoming.occupantRole);
      merged.occupantRole = value;
      merged.vehicleRole = value;
    } else if (subjectOwn(incoming, "vehicleRole")) {
      value = subjectText(incoming.vehicleRole);
      merged.occupantRole = value;
      merged.vehicleRole = value;
    }
    return merged;
  }

  function unusedSubjectMatch(rows, used, valueFor, value) {
    if (!value) {
      return -1;
    }
    var matches = [];
    rows.forEach(function (row, index) {
      if (!used[index] && valueFor(row) === value) {
        matches.push(index);
      }
    });
    return matches.length === 1 ? matches[0] : -1;
  }

  function matchingPreviousSubject(rows, used, subject) {
    var requestedSubjectId = encounterSubjectId(subject);
    if (requestedSubjectId) {
      return unusedSubjectMatch(
        rows,
        used,
        encounterSubjectId,
        requestedSubjectId
      );
    }
    var match = unusedSubjectMatch(
      rows,
      used,
      encounterSubjectBookingId,
      encounterSubjectBookingId(subject)
    );
    if (match >= 0) {
      return match;
    }
    match = unusedSubjectMatch(rows, used, function (row) {
      return subjectText(row && row.personId);
    }, subjectText(subject && subject.personId));
    if (match >= 0) {
      return match;
    }
    return unusedSubjectMatch(rows, used, function (row) {
      return subjectText(row && row.leadId);
    }, subjectText(subject && subject.leadId));
  }

  function normalizeEncounterSubjects(subjects, opts) {
    opts = opts || {};
    var rows = Array.isArray(subjects) ? subjects : [];
    var encounterId = subjectText(opts.encounterId);
    var previous = Array.isArray(opts.previousSubjects)
      ? normalizeEncounterSubjects(opts.previousSubjects, { encounterId: encounterId })
      : [];
    var usedPrevious = {};
    var reservedIds = {};
    previous.forEach(function (row) {
      var id = encounterSubjectId(row);
      if (id) {
        reservedIds[id] = true;
      }
    });
    rows.forEach(function (row) {
      var id = encounterSubjectId(row);
      if (id) {
        reservedIds[id] = true;
      }
    });
    return rows.map(function (row, index) {
      var incoming = row && typeof row === "object" && !Array.isArray(row) ? row : {};
      var previousIndex = matchingPreviousSubject(previous, usedPrevious, incoming);
      var prior = previousIndex >= 0 ? previous[previousIndex] : null;
      var incomingHasCanonicalShape =
        subjectText(incoming.entityType) === "ENCOUNTER_SUBJECT" &&
        subjectText(incoming.schema) === "copdocx.encounter-subject.v1";
      var priorHasCanonicalShape = !!(
        prior &&
        subjectText(prior.entityType) === "ENCOUNTER_SUBJECT" &&
        subjectText(prior.schema) === "copdocx.encounter-subject.v1"
      );
      var source = incoming;
      if (prior && opts.mergePrevious !== false) {
        source = model.assign(cloneSubject(prior), incoming);
        source = applyIncomingSubjectAliases(source, incoming);
        source.subjectId = prior.subjectId;
      } else if (prior && !encounterSubjectId(incoming)) {
        source = cloneSubject(incoming);
        source.subjectId = prior.subjectId;
      }
      if (previousIndex >= 0) {
        usedPrevious[previousIndex] = true;
      }
      var hadStableId = !!encounterSubjectId(source);
      var normalized = normalizeEncounterSubject(source, {
        encounterId: encounterId,
        index: index,
        deterministic: true
      });
      if (!hadStableId) {
        var baseId = normalized.subjectId;
        var candidate = baseId;
        var suffix = 2;
        while (reservedIds[candidate]) {
          candidate = baseId + "_" + suffix;
          suffix += 1;
        }
        normalized.subjectId = candidate;
      }
      /*
       * The former Narrative adapter focused unbooked rows by ep_<index>,
       * including older rows that already carried an ad-hoc subjectId. Stamp
       * that alias only while upgrading a pre-v1 shape. Reordering a canonical
       * row must never manufacture a new index alias.
       */
      if (!incomingHasCanonicalShape && !priorHasCanonicalShape) {
        var legacyAlias = "ep_" + index;
        normalized.legacyEncounterParticipantIds = Array.isArray(
          normalized.legacyEncounterParticipantIds
        )
          ? normalized.legacyEncounterParticipantIds.slice()
          : [];
        if (normalized.legacyEncounterParticipantIds.indexOf(legacyAlias) === -1) {
          normalized.legacyEncounterParticipantIds.push(legacyAlias);
        }
      }
      reservedIds[normalized.subjectId] = true;
      return normalized;
    });
  }

  function mergeEncounterSubjects(previousSubjects, incomingSubjects, opts) {
    opts = opts || {};
    return normalizeEncounterSubjects(incomingSubjects, {
      encounterId: opts.encounterId,
      previousSubjects: previousSubjects,
      mergePrevious: true
    });
  }

  function encounterSubjectMatches(subject, reference) {
    reference = reference || {};
    var value = encounterSubjectId(reference);
    if (value) {
      return encounterSubjectId(subject) === value;
    }
    value = encounterSubjectBookingId(reference);
    if (value) {
      return encounterSubjectBookingId(subject) === value;
    }
    value = subjectText(reference.personId);
    if (value) {
      return subjectText(subject && subject.personId) === value;
    }
    value = subjectText(reference.leadId);
    if (value) {
      return subjectText(subject && subject.leadId) === value;
    }
    return false;
  }

  function createEncounterSubject(extra) {
    return normalizeEncounterSubject(extra, { deterministic: false, mintId: true });
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
    var built = normalizeEncounterSubject(subject || {}, {
      encounterId: subjectText(sharedOrEncounter && sharedOrEncounter.encounterId)
    });
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
    built.encounterId = built.shared.encounterId || built.encounterId || "";
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
      encounterRole: encounterSubjectRole(subject),
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
    var exactIndexes = [];
    var legacyIndexes = [];
    person.encounters.forEach(function (item, i) {
      if (!item || String(item.encounterId || "") !== key) {
        return;
      }
      var itemSubjectId = String(item.subjectId || "");
      if (subjectId && itemSubjectId === subjectId) {
        exactIndexes.push(i);
      } else if (!itemSubjectId) {
        legacyIndexes.push(i);
      }
    });
    if (exactIndexes.length) {
      index = exactIndexes[0];
    } else if (legacyIndexes.length === 1) {
      index = legacyIndexes[0];
    }
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
    var occupantRole = encounterSubjectOccupantRole(subject);
    var subjectRole = encounterSubjectRole(subject);
    var bookingId = subjectOwn(extra, "bookingId")
      ? subjectText(extra.bookingId)
      : subjectOwn(extra, "bookinRecordId")
        ? subjectText(extra.bookinRecordId)
        : encounterSubjectBookingId(subject);
    if (occupantRole === "DRIVER") {
      vehiclePosition = "driver";
    } else if (occupantRole === "PASSENGER") {
      vehiclePosition = "passenger";
    }
    return {
      subjectId: encounterSubjectId(subject) || subjectText(extra.subjectId),
      personId: subject.personId || extra.personId || "",
      leadId: subject.leadId || extra.leadId || "",
      lastName: subject.lastName || extra.lastName || "",
      firstName: subject.firstName || extra.firstName || "",
      alienNumber: subject.alienNumber || extra.alienNumber || "",
      citizenship: subject.citizenship || extra.citizenship || "",
      encounterId: shared.encounterId || extra.encounterId || "",
      encounterNumber: shared.encounterId || extra.encounterNumber || "",
      subjectRole: subjectRole || extra.subjectRole || "",
      role: subjectRole || extra.role || extra.subjectRole || "",
      vehiclePosition: extra.vehiclePosition || vehiclePosition,
      occupantRole: occupantRole || extra.occupantRole || "",
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
      bookingId: bookingId,
      bookinRecordId: bookingId,
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
    built.subjects = normalizeEncounterSubjects(built.subjects, {
      encounterId: built.encounterId
    });
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
          encounterId: encounter.encounterId || "",
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
              encounterId: encounter.encounterId || "",
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
  model.normalizeEncounterSubject = normalizeEncounterSubject;
  model.normalizeEncounterSubjects = normalizeEncounterSubjects;
  model.mergeEncounterSubjects = mergeEncounterSubjects;
  model.deterministicEncounterSubjectId = deterministicEncounterSubjectId;
  model.encounterSubjectId = encounterSubjectId;
  model.encounterSubjectBookingId = encounterSubjectBookingId;
  model.encounterSubjectRole = encounterSubjectRole;
  model.encounterSubjectOccupantRole = encounterSubjectOccupantRole;
  model.encounterSubjectMatches = encounterSubjectMatches;
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
