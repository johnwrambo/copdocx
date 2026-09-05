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
  var STORAGE_KEY =
    (root.config && root.config.storageKey("workspace")) || "copdocx.store.v1";

  function emptyState() {
    return {
      schema: model.STORE_SCHEMA || "copdocx.store.v1",
      currentLeadId: "",
      people: {},
      leads: {},
      encounters: {},
      investigations: {},
      vehicles: {},
      locations: {},
      businesses: {},
      entities: {},
      associations: {},
      operations: {}
    };
  }

  var state = emptyState();
  var diskError = "";

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

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
    var merged = mergeRecord(previous, location);
    return typeof model.createLocation === "function"
      ? model.createLocation(merged)
      : merged;
  }

  function canonicalVehicleRecord(vehicle, previous) {
    var merged = mergeRecord(previous, vehicle);
    var built = typeof model.createVehicle === "function"
      ? model.createVehicle(merged)
      : merged;
    var previousLocations = (previous && previous.locations) || [];
    built.locations = (built.locations || []).map(function (location) {
      var id = location && (location.locationId || location.id);
      var old = id
        ? matchingById(previousLocations, "locationId", id) || state.locations[id]
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
      var knownSubject =
        previousSubject &&
        (!subjectId || previousSubject.personId === subjectId)
          ? previousSubject
          : (subjectId && state.people[subjectId]) || null;
      subject = canonicalPersonRecord(subject, knownSubject);
      var previousLocations = (knownSubject && knownSubject.locations) || [];
      subject.locations = (subject.locations || []).map(function (location) {
        var id = location && (location.locationId || location.id);
        var old = id
          ? matchingById(previousLocations, "locationId", id) || state.locations[id]
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
          ? matchingById(previousVehicles, "vehicleId", id) || state.vehicles[id]
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

  /*
   * Some read-only pages load store.js without encounter.js. Keep a small
   * compatibility normalizer here so every Workspace read still upgrades the
   * embedded EncounterSubject identity contract. When encounter.js is present,
   * its public helpers remain the single implementation used by the store.
   */
  var storeHasOwn = Object.prototype.hasOwnProperty;

  function storeSubjectText(value) {
    return String(value == null ? "" : value).trim();
  }

  function storeSubjectOwn(row, key) {
    return !!row && storeHasOwn.call(row, key);
  }

  function storeSubjectId(row) {
    return storeSubjectText(row && row.subjectId);
  }

  function storeSubjectBookingId(row) {
    if (storeSubjectOwn(row, "bookingId")) {
      return storeSubjectText(row.bookingId);
    }
    return storeSubjectText(row && row.bookinRecordId);
  }

  function leadOwnerIdentity(lead, expectedLeadId) {
    if (!lead) {
      return { ok: false, personId: "" };
    }
    var subject = model.subjectOf ? model.subjectOf(lead) : lead.person;
    var payloadLeadId = storeSubjectText(lead.leadId);
    var expected = storeSubjectText(expectedLeadId);
    var embeddedPersonId = storeSubjectText(subject && subject.personId);
    var declaredPersonId = storeSubjectText(lead.subjectPersonId);
    var personId = embeddedPersonId || declaredPersonId;
    return {
      ok: !!(
        payloadLeadId &&
        (!expected || payloadLeadId === expected) &&
        embeddedPersonId &&
        (!declaredPersonId || declaredPersonId === embeddedPersonId) &&
        state.people[embeddedPersonId]
      ),
      personId: personId
    };
  }

  function storeSubjectRole(row) {
    if (storeSubjectOwn(row, "role")) {
      return storeSubjectText(row.role).toUpperCase();
    }
    return storeSubjectText(row && row.encounterRole).toUpperCase();
  }

  function storeSubjectOccupantRole(row) {
    if (storeSubjectOwn(row, "occupantRole")) {
      return storeSubjectText(row.occupantRole).toUpperCase();
    }
    return storeSubjectText(row && row.vehicleRole).toUpperCase();
  }

  function fallbackDeterministicSubjectId(encounterId, row, index) {
    row = row || {};
    var identity = "";
    var bookingId = storeSubjectBookingId(row);
    var personId = storeSubjectText(row.personId);
    var leadId = storeSubjectText(row.leadId);
    var alienNumber = storeSubjectText(row.alienNumber).replace(/\D/g, "");
    var name = [
      storeSubjectText(row.lastName).toUpperCase(),
      storeSubjectText(row.firstName).toUpperCase()
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
    var seed = storeSubjectText(encounterId) + "|" + identity;
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

  function fallbackNormalizeSubject(row, opts) {
    row = row && typeof row === "object" && !Array.isArray(row) ? row : {};
    opts = opts || {};
    var next = clone(row);
    var encounterId =
      storeSubjectText(opts.encounterId) ||
      storeSubjectText(row.encounterId) ||
      storeSubjectText(row.shared && row.shared.encounterId);
    var subjectId = storeSubjectId(row);
    if (!subjectId) {
      subjectId = fallbackDeterministicSubjectId(encounterId, row, opts.index);
    }
    var bookingId = storeSubjectBookingId(row);
    var role = storeSubjectRole(row);
    var occupantRole = storeSubjectOccupantRole(row);
    next.entityType = next.entityType || "ENCOUNTER_SUBJECT";
    next.schema = next.schema || "copdocx.encounter-subject.v1";
    next.subjectId = subjectId;
    next.encounterId = encounterId;
    next.personId = storeSubjectText(next.personId);
    next.leadId = storeSubjectText(next.leadId);
    next.bookingId = bookingId;
    next.bookinRecordId = bookingId;
    next.role = role;
    next.encounterRole = role;
    next.occupantRole = occupantRole;
    next.vehicleRole = occupantRole;
    var seenLegacyIds = {};
    next.legacyEncounterParticipantIds = (
      Array.isArray(next.legacyEncounterParticipantIds)
        ? next.legacyEncounterParticipantIds
        : []
    ).reduce(function (ids, value) {
      var id = storeSubjectText(value);
      if (id && !seenLegacyIds[id]) {
        seenLegacyIds[id] = true;
        ids.push(id);
      }
      return ids;
    }, []);
    var bookingAlias = bookingId ? "ep_" + bookingId : "";
    if (bookingAlias && !seenLegacyIds[bookingAlias]) {
      next.legacyEncounterParticipantIds.push(bookingAlias);
    }
    return next;
  }

  function fallbackApplyIncomingSubjectAliases(merged, incoming) {
    var value;
    if (storeSubjectOwn(incoming, "bookingId")) {
      value = storeSubjectText(incoming.bookingId);
      merged.bookingId = value;
      merged.bookinRecordId = value;
    } else if (storeSubjectOwn(incoming, "bookinRecordId")) {
      value = storeSubjectText(incoming.bookinRecordId);
      merged.bookingId = value;
      merged.bookinRecordId = value;
    }
    if (storeSubjectOwn(incoming, "role")) {
      value = storeSubjectText(incoming.role);
      merged.role = value;
      merged.encounterRole = value;
    } else if (storeSubjectOwn(incoming, "encounterRole")) {
      value = storeSubjectText(incoming.encounterRole);
      merged.role = value;
      merged.encounterRole = value;
    }
    if (storeSubjectOwn(incoming, "occupantRole")) {
      value = storeSubjectText(incoming.occupantRole);
      merged.occupantRole = value;
      merged.vehicleRole = value;
    } else if (storeSubjectOwn(incoming, "vehicleRole")) {
      value = storeSubjectText(incoming.vehicleRole);
      merged.occupantRole = value;
      merged.vehicleRole = value;
    }
    return merged;
  }

  function fallbackUnusedSubjectMatch(rows, used, valueFor, value) {
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

  function fallbackPreviousSubject(rows, used, subject) {
    var requestedSubjectId = storeSubjectId(subject);
    if (requestedSubjectId) {
      return fallbackUnusedSubjectMatch(
        rows,
        used,
        storeSubjectId,
        requestedSubjectId
      );
    }
    var match = fallbackUnusedSubjectMatch(
      rows,
      used,
      storeSubjectBookingId,
      storeSubjectBookingId(subject)
    );
    if (match >= 0) {
      return match;
    }
    match = fallbackUnusedSubjectMatch(rows, used, function (row) {
      return storeSubjectText(row && row.personId);
    }, storeSubjectText(subject && subject.personId));
    if (match >= 0) {
      return match;
    }
    return fallbackUnusedSubjectMatch(rows, used, function (row) {
      return storeSubjectText(row && row.leadId);
    }, storeSubjectText(subject && subject.leadId));
  }

  function fallbackNormalizeSubjectRows(rows, opts) {
    opts = opts || {};
    rows = Array.isArray(rows) ? rows : [];
    var encounterId = storeSubjectText(opts.encounterId);
    var previous = Array.isArray(opts.previousSubjects)
      ? fallbackNormalizeSubjectRows(opts.previousSubjects, { encounterId: encounterId })
      : [];
    var usedPrevious = {};
    var reservedIds = {};
    previous.forEach(function (row) {
      var id = storeSubjectId(row);
      if (id) {
        reservedIds[id] = true;
      }
    });
    rows.forEach(function (row) {
      var id = storeSubjectId(row);
      if (id) {
        reservedIds[id] = true;
      }
    });
    return rows.map(function (row, index) {
      var incoming = row && typeof row === "object" && !Array.isArray(row) ? row : {};
      var previousIndex = fallbackPreviousSubject(previous, usedPrevious, incoming);
      var prior = previousIndex >= 0 ? previous[previousIndex] : null;
      var incomingHasCanonicalShape =
        storeSubjectText(incoming.entityType) === "ENCOUNTER_SUBJECT" &&
        storeSubjectText(incoming.schema) === "copdocx.encounter-subject.v1";
      var priorHasCanonicalShape = !!(
        prior &&
        storeSubjectText(prior.entityType) === "ENCOUNTER_SUBJECT" &&
        storeSubjectText(prior.schema) === "copdocx.encounter-subject.v1"
      );
      var source = incoming;
      if (prior && opts.mergePrevious !== false) {
        source = mergeRecord(prior, incoming);
        source = fallbackApplyIncomingSubjectAliases(source, incoming);
        source.subjectId = prior.subjectId;
      } else if (prior && !storeSubjectId(incoming)) {
        source = clone(incoming);
        source.subjectId = prior.subjectId;
      }
      if (previousIndex >= 0) {
        usedPrevious[previousIndex] = true;
      }
      var hadStableId = !!storeSubjectId(source);
      var normalized = fallbackNormalizeSubject(source, {
        encounterId: encounterId,
        index: index
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

  function normalizeEncounterSubjectsForStore(rows, opts) {
    opts = opts || {};
    if (typeof model.normalizeEncounterSubjects === "function") {
      return model.normalizeEncounterSubjects(rows, opts);
    }
    return fallbackNormalizeSubjectRows(rows, opts);
  }

  function normalizeEncounterSubjectForStore(row, opts) {
    if (typeof model.normalizeEncounterSubject === "function") {
      return model.normalizeEncounterSubject(row, opts || {});
    }
    return fallbackNormalizeSubject(row, opts || {});
  }

  function mergeEncounterSubjectsForStore(previousSubjects, incomingSubjects, opts) {
    opts = opts || {};
    if (typeof model.mergeEncounterSubjects === "function") {
      return model.mergeEncounterSubjects(previousSubjects, incomingSubjects, opts);
    }
    return fallbackNormalizeSubjectRows(incomingSubjects, {
      encounterId: opts.encounterId,
      previousSubjects: previousSubjects,
      mergePrevious: true
    });
  }

  function normalizeEncounterStateRecord(record, stateKey) {
    if (!record || typeof record !== "object" || Array.isArray(record)) {
      return record;
    }
    var encounterId = storeSubjectText(record.encounterId) || storeSubjectText(stateKey);
    record.encounterId = encounterId;
    var activeSubjects = [];
    if (Array.isArray(record.subjects)) {
      record.subjects = normalizeEncounterSubjectsForStore(record.subjects, {
        encounterId: encounterId
      });
      activeSubjects = record.subjects;
    }
    if (Array.isArray(record.subjectIdentityHistory)) {
      record.subjectIdentityHistory = normalizeEncounterSubjectsForStore(
        record.subjectIdentityHistory,
        {
          encounterId: encounterId,
          previousSubjects: activeSubjects,
          mergePrevious: false
        }
      );
    }
    if (Array.isArray(record.bookingIdentityHistory)) {
      record.bookingIdentityHistory = record.bookingIdentityHistory.map(function (row) {
        if (!row || typeof row !== "object" || Array.isArray(row)) {
          // Preserve malformed legacy/imported evidence for Integrity without
          // letting property assignment crash every Workspace load.
          return row;
        }
        var next = clone(row || {});
        next.subjectId = storeSubjectId(next);
        next.encounterId = storeSubjectText(next.encounterId) || encounterId;
        next.bookingId = storeSubjectBookingId(next);
        next.bookinRecordId = next.bookingId;
        next.bookingUnlinked = true;
        return next;
      });
    }
    function normalizeSnapshot(snapshot) {
      if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
        return;
      }
      snapshot.encounterId = storeSubjectText(snapshot.encounterId) || encounterId;
      if (Array.isArray(snapshot.subjects)) {
        snapshot.subjects = normalizeEncounterSubjectsForStore(snapshot.subjects, {
          encounterId: encounterId,
          previousSubjects: activeSubjects,
          mergePrevious: false
        });
      }
    }
    normalizeSnapshot(record.completed);
    (Array.isArray(record.completedHistory) ? record.completedHistory : []).forEach(
      function (entry) {
        normalizeSnapshot(entry && entry.snapshot);
      }
    );
    return record;
  }

  function encounterOwnershipRows(encounter, includeActive) {
    var rows = [];
    function append(snapshot) {
      if (snapshot && Array.isArray(snapshot.subjects)) {
        rows = rows.concat(snapshot.subjects);
      }
    }
    if (includeActive !== false) {
      append(encounter);
    }
    if (encounter && Array.isArray(encounter.subjectIdentityHistory)) {
      rows = rows.concat(encounter.subjectIdentityHistory);
    }
    if (encounter && Array.isArray(encounter.bookingIdentityHistory)) {
      rows = rows.concat(encounter.bookingIdentityHistory);
    }
    append(encounter && encounter.completed);
    (Array.isArray(encounter && encounter.completedHistory)
      ? encounter.completedHistory
      : []
    ).forEach(function (entry) {
      append(entry && entry.snapshot);
    });
    return rows;
  }

  function encounterSubjectIdentityConflict(
    previousSubjects,
    incomingSubjects,
    encounterId,
    validationOpts
  ) {
    validationOpts = validationOpts || {};
    var prospectivePersonIds = Object.create(null);
    (validationOpts.prospectivePersonIds || []).forEach(function (id) {
      id = storeSubjectText(id);
      if (id) {
        prospectivePersonIds[id] = true;
      }
    });
    var previous = Array.isArray(previousSubjects) ? previousSubjects : [];
    /*
     * Resolve legacy rows through the same compatibility merge used by the
     * write path before validating ownership. Otherwise an incoming row can
     * omit subjectId, match a prior subject by booking, and silently replace
     * that subject's Person or Lead link before the validator ever sees its
     * permanent identity.
     */
    var incoming = mergeEncounterSubjectsForStore(
      previous,
      Array.isArray(incomingSubjects) ? incomingSubjects : [],
      { encounterId: encounterId }
    );
    var conflict = null;
    var incomingIds = Object.create(null);
    var incomingBookingIds = Object.create(null);

    function makeConflict(incomingIndex, subjectId, existingSubjectId, matchedBy, reason) {
      return {
        code: "ENCOUNTER_SUBJECT_ID_CONFLICT",
        incomingIndex: incomingIndex,
        subjectId: subjectId,
        existingSubjectId: existingSubjectId || "",
        matchedBy: matchedBy,
        reason: reason
      };
    }

    incoming.some(function (subject, incomingIndex) {
      var subjectId = storeSubjectId(subject);
      if (!subjectId) {
        return false;
      }
      if (incomingIds[subjectId]) {
        conflict = makeConflict(
          incomingIndex,
          subjectId,
          subjectId,
          "subjectId",
          "duplicate-incoming-subject-id"
        );
        return true;
      }
      incomingIds[subjectId] = true;
      var exactMatches = previous.filter(function (prior) {
        return storeSubjectId(prior) === subjectId;
      });
      if (exactMatches.length > 1) {
        conflict = makeConflict(
          incomingIndex,
          subjectId,
          subjectId,
          "subjectId",
          "duplicate-existing-subject-id"
        );
        return true;
      }
      var exact = exactMatches.length === 1 ? exactMatches[0] : null;
      var bookingId = storeSubjectBookingId(subject);
      if (bookingId && incomingBookingIds[bookingId]) {
        conflict = makeConflict(
          incomingIndex,
          subjectId,
          incomingBookingIds[bookingId],
          "bookingId",
          "duplicate-incoming-booking-id"
        );
        return true;
      }
      if (bookingId) {
        incomingBookingIds[bookingId] = subjectId;
      }
      var personId = storeSubjectText(subject && subject.personId);
      var leadId = storeSubjectText(subject && subject.leadId);
      var suppliedSubjectId = storeSubjectId(
        Array.isArray(incomingSubjects) ? incomingSubjects[incomingIndex] : null
      );
      var bookingMatch = bookingId
        ? previous.filter(function (prior) {
            return (
              storeSubjectId(prior) !== subjectId &&
              storeSubjectBookingId(prior) === bookingId
            );
          })
        : [];
      var personMatch = personId
        ? previous.filter(function (prior) {
            return (
              storeSubjectId(prior) !== subjectId &&
              storeSubjectText(prior && prior.personId) === personId
            );
          })
        : [];
      var leadMatch = leadId
        ? previous.filter(function (prior) {
            return (
              storeSubjectId(prior) !== subjectId &&
              storeSubjectText(prior && prior.leadId) === leadId
            );
          })
        : [];
      var matchedBy = "";
      var prior = null;
      var reason = "reference-owned-by-another-subject";
      if (exact) {
        var previousBookingId = storeSubjectBookingId(exact);
        var previousPersonId = storeSubjectText(exact.personId);
        var previousLeadId = storeSubjectText(exact.leadId);
        var permittedBookingUnlink = !!(
          validationOpts.bookingUnlink &&
          storeSubjectText(validationOpts.bookingUnlink.subjectId) === subjectId &&
          storeSubjectText(validationOpts.bookingUnlink.bookingId) ===
            previousBookingId &&
          !bookingId &&
          personId === previousPersonId &&
          leadId === previousLeadId
        );
        if (
          previousBookingId &&
          bookingId !== previousBookingId &&
          !permittedBookingUnlink
        ) {
          matchedBy = "bookingId";
          prior = exact;
          reason = "existing-reference-retargeted";
        } else if (previousPersonId && personId !== previousPersonId) {
          matchedBy = "personId";
          prior = exact;
          reason = "existing-reference-retargeted";
        } else if (previousLeadId && leadId !== previousLeadId) {
          matchedBy = "leadId";
          prior = exact;
          reason = "existing-reference-retargeted";
        } else if (bookingMatch.length) {
          matchedBy = "bookingId";
          prior = bookingMatch[0];
        } else {
          return false;
        }
      }
      if (!exact && bookingMatch.length) {
        matchedBy = "bookingId";
        prior = bookingMatch[0];
      } else if (!exact && !suppliedSubjectId && personMatch.length) {
        matchedBy = "personId";
        prior = personMatch[0];
      } else if (!exact && !suppliedSubjectId && leadMatch.length) {
        matchedBy = "leadId";
        prior = leadMatch[0];
      }
      if (!prior || !storeSubjectId(prior)) {
        return false;
      }
      conflict = makeConflict(
        incomingIndex,
        subjectId,
        storeSubjectId(prior),
        matchedBy,
        reason
      );
      return true;
    });
    if (conflict) {
      return conflict;
    }
    /*
     * A removed participant remains an owned identity. Without this tombstone
     * check, a stale tab could silently reactivate a deleted subjectId or
     * booking and attach it to different facts.
     */
    var currentEncounter = encounterId && state.encounters[encounterId];
    var removedSubjects = Array.isArray(
      currentEncounter && currentEncounter.subjectIdentityHistory
    )
      ? currentEncounter.subjectIdentityHistory
      : [];
    incoming.some(function (subject, incomingIndex) {
      var subjectId = storeSubjectId(subject);
      var bookingId = storeSubjectBookingId(subject);
      var stillActive = previous.some(function (prior) {
        return storeSubjectId(prior) === subjectId;
      });
      if (stillActive) {
        return false;
      }
      var prior = removedSubjects.filter(function (row) {
        return subjectId && storeSubjectId(row) === subjectId;
      })[0];
      var matchedBy = prior ? "subjectId" : "";
      if (!prior && bookingId) {
        prior = removedSubjects.filter(function (row) {
          return storeSubjectBookingId(row) === bookingId;
        })[0];
        matchedBy = prior ? "bookingId" : "";
      }
      if (!prior) {
        return false;
      }
      conflict = makeConflict(
        incomingIndex,
        subjectId,
        storeSubjectId(prior),
        matchedBy,
        "removed-subject-reactivated"
      );
      conflict.removed = true;
      return true;
    });
    if (conflict) {
      return conflict;
    }
    var retiredBookings = Array.isArray(
      currentEncounter && currentEncounter.bookingIdentityHistory
    )
      ? currentEncounter.bookingIdentityHistory
      : [];
    incoming.some(function (subject, incomingIndex) {
      var bookingId = storeSubjectBookingId(subject);
      if (!bookingId) {
        return false;
      }
      var retired = retiredBookings.filter(function (row) {
        return storeSubjectBookingId(row) === bookingId;
      })[0];
      if (!retired) {
        return false;
      }
      conflict = makeConflict(
        incomingIndex,
        storeSubjectId(subject),
        storeSubjectId(retired),
        "bookingId",
        "retired-booking-reactivated"
      );
      conflict.historical = true;
      return true;
    });
    if (conflict) {
      return conflict;
    }
    incoming.some(function (subject, incomingIndex) {
      var subjectId = storeSubjectId(subject);
      var personId = storeSubjectText(subject && subject.personId);
      var leadId = storeSubjectText(subject && subject.leadId);
      var lead = leadId && state.leads[leadId];
      var leadOwner = leadOwnerIdentity(lead, leadId);
      var leadPersonId = leadOwner.ok ? leadOwner.personId : "";
      var prior = previous.filter(function (row) {
        return storeSubjectId(row) === subjectId;
      })[0];
      var unchangedLegacyPerson = !!(
        prior &&
        personId &&
        storeSubjectText(prior.personId) === personId &&
        !state.people[personId]
      );
      if (
        personId &&
        !state.people[personId] &&
        !prospectivePersonIds[personId] &&
        !unchangedLegacyPerson
      ) {
        conflict = makeConflict(
          incomingIndex,
          subjectId,
          subjectId,
          "personId",
          "person-reference-dangling"
        );
        return true;
      }
      var unchangedLegacyLead = !!(
        prior &&
        leadId &&
        storeSubjectText(prior.leadId) === leadId &&
        !lead
      );
      if (leadId && !lead && !unchangedLegacyLead) {
        conflict = makeConflict(
          incomingIndex,
          subjectId,
          subjectId,
          "leadId",
          "lead-reference-dangling"
        );
        return true;
      }
      var unchangedInvalidLead = !!(
        prior &&
        leadId &&
        storeSubjectText(prior.leadId) === leadId &&
        storeSubjectText(prior.personId) === personId &&
        lead &&
        !leadOwner.ok
      );
      if (leadId && lead && !leadOwner.ok && !unchangedInvalidLead) {
        conflict = makeConflict(
          incomingIndex,
          subjectId,
          subjectId,
          "leadId",
          "lead-reference-invalid"
        );
        return true;
      }
      var unchangedLeadOnlyReference = !!(
        prior &&
        !personId &&
        !storeSubjectText(prior.personId) &&
        storeSubjectText(prior.leadId) === leadId
      );
      if (
        leadId &&
        leadOwner.ok &&
        !personId &&
        !unchangedLeadOnlyReference
      ) {
        conflict = makeConflict(
          incomingIndex,
          subjectId,
          subjectId,
          "personId",
          "lead-person-missing"
        );
        return true;
      }
      if (!personId || !leadId || !leadPersonId || personId === leadPersonId) {
        return false;
      }
      if (
        prior &&
        storeSubjectText(prior.personId) === personId &&
        storeSubjectText(prior.leadId) === leadId
      ) {
        return false;
      }
      conflict = makeConflict(
        incomingIndex,
        subjectId,
        subjectId,
        "leadId",
        "lead-person-mismatch"
      );
      return true;
    });
    if (conflict) {
      return conflict;
    }
    function historicalOwnershipConflict(encounter) {
      var archived = encounterOwnershipRows(encounter, false).filter(function (row) {
        return !(row && row.bookingUnlinked === true);
      });
      return incoming.some(function (subject, incomingIndex) {
        var subjectId = storeSubjectId(subject);
        var bookingId = storeSubjectBookingId(subject);
        var personId = storeSubjectText(subject && subject.personId);
        var leadId = storeSubjectText(subject && subject.leadId);
        var exact = archived.filter(function (prior) {
          return storeSubjectId(prior) === subjectId;
        })[0];
        var prior = exact;
        var matchedBy = "";
        var reason = "historical-reference-retargeted";
        if (exact) {
          var priorBookingId = storeSubjectBookingId(exact);
          var priorPersonId = storeSubjectText(exact.personId);
          var priorLeadId = storeSubjectText(exact.leadId);
          var permittedHistoricalBookingUnlink = !!(
            validationOpts.bookingUnlink &&
            storeSubjectText(validationOpts.bookingUnlink.subjectId) ===
              subjectId &&
            storeSubjectText(validationOpts.bookingUnlink.bookingId) ===
              priorBookingId &&
            !bookingId
          );
          var recordedHistoricalBookingUnlink = !!(
            retiredBookings.some(function (row) {
              return (
                row &&
                row.bookingUnlinked === true &&
                storeSubjectId(row) === subjectId &&
                storeSubjectBookingId(row) === priorBookingId
              );
            })
          );
          // An exact, store-recorded unlink retires this historical booking
          // constraint. The same participation may receive a fresh packet;
          // the retired-booking guard above still rejects the old packet ID.
          if (
            priorBookingId &&
            bookingId !== priorBookingId &&
            !permittedHistoricalBookingUnlink &&
            !recordedHistoricalBookingUnlink
          ) {
            matchedBy = "bookingId";
          } else if (priorPersonId && personId !== priorPersonId) {
            matchedBy = "personId";
          } else if (priorLeadId && leadId !== priorLeadId) {
            matchedBy = "leadId";
          } else {
            prior = null;
          }
        }
        if (!prior && bookingId) {
          prior = archived.filter(function (row) {
            return (
              storeSubjectId(row) !== subjectId &&
              storeSubjectBookingId(row) === bookingId
            );
          })[0];
          matchedBy = prior ? "bookingId" : "";
          reason = "historical-reference-owned-by-another-subject";
        }
        if (!prior) {
          return false;
        }
        conflict = makeConflict(
          incomingIndex,
          subjectId,
          storeSubjectId(prior),
          matchedBy,
          reason
        );
        conflict.existingEncounterId = encounterId;
        conflict.historical = true;
        return true;
      });
    }

    if (
      encounterId &&
      state.encounters[encounterId] &&
      historicalOwnershipConflict(state.encounters[encounterId])
    ) {
      return conflict;
    }

    Object.keys(state.encounters || {}).some(function (otherEncounterId) {
      if (otherEncounterId === encounterId) {
        return false;
      }
      var other = state.encounters[otherEncounterId];
      return encounterOwnershipRows(other).some(
        function (subject) {
          var subjectId = storeSubjectId(subject);
          if (!subjectId || !incomingIds[subjectId]) {
            var otherBookingId = storeSubjectBookingId(subject);
            if (!otherBookingId || !incomingBookingIds[otherBookingId]) {
              return false;
            }
            conflict = makeConflict(
              -1,
              incomingBookingIds[otherBookingId],
              storeSubjectId(subject),
              "bookingId",
              "booking-id-owned-by-another-encounter"
            );
            conflict.existingEncounterId = otherEncounterId;
            return true;
          }
          conflict = makeConflict(
            -1,
            subjectId,
            subjectId,
            "subjectId",
            "subject-id-owned-by-another-encounter"
          );
          conflict.existingEncounterId = otherEncounterId;
          return true;
        }
      );
    });
    return conflict;
  }

  function canonicalizeEncounterMapKeys(next) {
    var source = next && next.encounters;
    if (!source || typeof source !== "object" || Array.isArray(source)) {
      return { ok: true, error: "" };
    }
    var canonical = {};
    var owners = {};
    var error = "";
    Object.keys(source).some(function (storedKey) {
      var row = source[storedKey];
      var keyId = storeSubjectText(storedKey);
      var payloadId = storeSubjectText(row && row.encounterId);
      if (payloadId && keyId && payloadId !== keyId) {
        error =
          "Encounter storage key " +
          keyId +
          " disagrees with payload identifier " +
          payloadId +
          ". Do not Save; run Integrity.";
        return true;
      }
      var id = payloadId || keyId;
      if (!id) {
        error = "Encounter storage contains a blank identifier. Do not Save; run Integrity.";
        return true;
      }
      if (owners[id] !== undefined) {
        error =
          "Encounter storage contains duplicate canonical identifier " +
          id +
          ". Do not Save; run Integrity.";
        return true;
      }
      owners[id] = storedKey;
      canonical[id] = row;
      if (canonical[id] && typeof canonical[id] === "object") {
        canonical[id].encounterId = id;
      }
      return false;
    });
    if (error) {
      return { ok: false, error: error };
    }
    next.encounters = canonical;
    return { ok: true, error: "" };
  }

  function normalizeState(next) {
    next = next || emptyState();
    next.schema = next.schema || model.STORE_SCHEMA || "copdocx.store.v1";
    next.people = next.people || {};
    next.leads = next.leads || {};
    next.encounters = next.encounters || {};
    next.investigations = next.investigations || {};
    next.vehicles = next.vehicles || {};
    next.locations = next.locations || {};
    next.businesses = next.businesses || {};
    next.entities = next.entities || {};
    next.associations = next.associations || {};
    next.operations = next.operations || {};
    next.currentLeadId = next.currentLeadId || "";
    Object.keys(next.leads).forEach(function (id) {
      if (typeof model.ensureRecordMeta === "function") {
        model.ensureRecordMeta(next.leads[id]);
      }
    });
    Object.keys(next.encounters).forEach(function (id) {
      normalizeEncounterStateRecord(next.encounters[id], id);
      if (typeof model.ensureRecordMeta === "function") {
        model.ensureRecordMeta(next.encounters[id]);
      }
    });
    Object.keys(next.investigations).forEach(function (id) {
      if (typeof model.ensureRecordMeta === "function") {
        model.ensureRecordMeta(next.investigations[id]);
      }
    });
    Object.keys(next.vehicles).forEach(function (id) {
      if (typeof model.ensureRecordMeta === "function") {
        model.ensureRecordMeta(next.vehicles[id]);
      }
    });
    Object.keys(next.locations).forEach(function (id) {
      if (typeof model.ensureRecordMeta === "function") {
        model.ensureRecordMeta(next.locations[id]);
      }
    });
    Object.keys(next.businesses).forEach(function (id) {
      if (typeof model.ensureRecordMeta === "function") {
        model.ensureRecordMeta(next.businesses[id]);
      }
    });
    Object.keys(next.entities).forEach(function (id) {
      if (typeof model.ensureRecordMeta === "function") {
        model.ensureRecordMeta(next.entities[id]);
      }
    });
    Object.keys(next.operations).forEach(function (id) {
      if (typeof model.ensureRecordMeta === "function") {
        model.ensureRecordMeta(next.operations[id]);
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
      var encounterKeys = canonicalizeEncounterMapKeys(disk.data);
      if (!encounterKeys.ok) {
        diskError = encounterKeys.error;
        return { ok: false, error: encounterKeys.error };
      }
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
      state.people[subject.personId] = clone(
        canonicalPersonRecord(subject, state.people[subject.personId])
      );
    }
    (snapshot.people || []).forEach(function (person) {
      if (person && person.personId) {
        state.people[person.personId] = clone(
          canonicalPersonRecord(person, state.people[person.personId])
        );
      }
    });
  }

  /**
   * Save a snapshot. opts.mode: "draft" | "commit" (default commit).
   * Collect's meta does not win — previous committedAt is preserved on draft.
   * rememberPeople on every save so the subject exists in people{} immediately.
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
    var merged = mergeRecord(previous, snapshot);
    var incomingSubject = model.subjectOf
      ? model.subjectOf(snapshot)
      : snapshot.person;
    var previousSubject = previous && model.subjectOf
      ? model.subjectOf(previous)
      : previous && previous.person;
    var incomingSubjectId =
      (incomingSubject && incomingSubject.personId) || snapshot.subjectPersonId || "";
    var previousSubjectId =
      (previousSubject && previousSubject.personId) ||
      (previous && previous.subjectPersonId) ||
      "";
    if (
      incomingSubject &&
      incomingSubjectId &&
      previousSubjectId &&
      incomingSubjectId !== previousSubjectId
    ) {
      merged.person = clone(incomingSubject);
      merged.subjectPersonId = incomingSubjectId;
    }
    var record = canonicalLeadGraph(merged, previous);
    record.schema = snapshot.schema || model.SCHEMA;
    record.leadId = snapshot.leadId;
    if (typeof model.stampMeta === "function") {
      record.meta = model.stampMeta(previous, mode);
    } else {
      record.meta = snapshot.meta || {};
      record.meta.updatedAt = model.nowIso();
    }
    record.meta.markedComplete = false;
    syncNestedOccupancyToAssociations(record);
    rememberPeople(record);
    syncLeadLinksToAssociations(record);
    applyAssociationNestingToLead(record);
    state.leads[record.leadId] = clone(record);
    state.currentLeadId = record.leadId;
    rememberPeople(record);
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

  function nameFromLabel(label) {
    var text = String(label || "").trim();
    if (typeof global.parsePersonName === "function") {
      var parsed = global.parsePersonName(text);
      return {
        lastName: (parsed && parsed.last) || "",
        firstName: (parsed && parsed.first) || "",
        middleName: (parsed && parsed.middle) || ""
      };
    }
    var comma = text.indexOf(",");
    if (comma !== -1) {
      var rest = text.slice(comma + 1).trim().split(/\s+/);
      return {
        lastName: text.slice(0, comma).trim(),
        firstName: rest[0] || "",
        middleName: rest.slice(1).join(" ")
      };
    }
    var bits = text.split(/\s+/).filter(Boolean);
    if (bits.length <= 1) {
      return { lastName: bits[0] || "", firstName: "", middleName: "" };
    }
    return {
      firstName: bits[0],
      middleName: bits.slice(1, -1).join(" "),
      lastName: bits[bits.length - 1]
    };
  }

  function parsePlateLabel(label) {
    var text = String(label || "").trim();
    if (!text) {
      return { plate: "", state: "" };
    }
    if (root.plates && typeof root.plates.parse === "function") {
      var parsed = root.plates.parse(text);
      var row = parsed && parsed.rows && parsed.rows[0];
      if (row && (row.plate || row.state)) {
        return {
          plate: String(row.plate || "").toUpperCase(),
          state: String(row.state || "").toUpperCase()
        };
      }
    }
    var bits = text.toUpperCase().split(/\s+/).filter(Boolean);
    if (bits.length >= 2 && /^[A-Z]{2}$/.test(bits[0])) {
      return {
        state: bits[0],
        plate: bits.slice(1).join("").replace(/[^A-Z0-9]/g, "")
      };
    }
    if (bits.length >= 2 && /^[A-Z]{2}$/.test(bits[bits.length - 1])) {
      return {
        state: bits[bits.length - 1],
        plate: bits.slice(0, -1).join("").replace(/[^A-Z0-9]/g, "")
      };
    }
    return {
      plate: text.toUpperCase().replace(/[^A-Z0-9]/g, ""),
      state: ""
    };
  }

  function parseAddressLabel(label) {
    var text = String(label || "").trim();
    if (!text) {
      return { street: "", city: "", state: "", zip: "" };
    }
    var parts = text.split(",").map(function (part) {
      return part.trim();
    }).filter(Boolean);
    var street = parts[0] || text;
    var city = "";
    var state = "";
    var zip = "";
    if (parts.length === 2) {
      var rest = parts[1].split(/\s+/).filter(Boolean);
      if (rest.length && /^[A-Za-z]{2}$/.test(rest[rest.length - 1])) {
        state = rest.pop().toUpperCase();
        city = rest.join(" ");
      } else if (rest.length && /^\d{5}(?:-\d{4})?$/.test(rest[rest.length - 1])) {
        zip = rest.pop();
        if (rest.length && /^[A-Za-z]{2}$/.test(rest[rest.length - 1])) {
          state = rest.pop().toUpperCase();
        }
        city = rest.join(" ");
      } else {
        city = parts[1];
      }
    } else if (parts.length >= 3) {
      city = parts[1];
      var tail = parts.slice(2).join(" ").split(/\s+/).filter(Boolean);
      if (tail.length && /^\d{5}(?:-\d{4})?$/.test(tail[tail.length - 1])) {
        zip = tail.pop();
      }
      if (tail.length && /^[A-Za-z]{2}$/.test(tail[tail.length - 1])) {
        state = tail.pop().toUpperCase();
      } else if (tail.length) {
        city = [city].concat(tail).join(" ");
      }
    }
    return { street: street, city: city, state: state, zip: zip };
  }

  function identityPerson(source, personId) {
    var name =
      source && source.name
        ? clone(source.name)
        : { lastName: "", firstName: "", middleName: "" };
    var extra = {
      caseRole: "LEAD",
      name: name,
      sex: (source && source.sex) || "",
      dateOfBirth: (source && source.dateOfBirth) || "",
      age: (source && source.age) || "",
      citizenship: (source && source.citizenship) || "",
      ssn: (source && source.ssn) || "",
      lexId: (source && source.lexId) || ""
    };
    if (personId) {
      extra.personId = personId;
    }
    return model.createPerson(extra);
  }

  function associationIsPerson(link) {
    if (!link) {
      return false;
    }
    var other = String(link.otherType || (link.to && link.to.type) || "").toUpperCase();
    var toType = String((link.to && link.to.type) || "").toUpperCase();
    if (other && other !== "PERSON") {
      return false;
    }
    if (toType && toType !== "PERSON") {
      return false;
    }
    return true;
  }

  function assignedOfficerStamp(snap) {
    var id = snap && snap.assignedOfficerId ? String(snap.assignedOfficerId) : "";
    if (!id) {
      return { officerId: "", officerAlias: "" };
    }
    var api = root.officers;
    var code =
      api && typeof api.aliasForId === "function" ? api.aliasForId(id) : "";
    return { officerId: id, officerAlias: code || "" };
  }

  function appendSystemNote(snap, text) {
    if (!snap) {
      return;
    }
    snap.history = Array.isArray(snap.history) ? snap.history : [];
    var stamp = assignedOfficerStamp(snap);
    var event = model.createHistoryEvent
      ? model.createHistoryEvent({
          type: "note",
          source: "system",
          text: text,
          officerId: stamp.officerId,
          officerAlias: stamp.officerAlias
        })
      : {
          eventId: model.newId("evt"),
          at: model.nowIso(),
          type: "note",
          source: "system",
          text: text,
          officerId: stamp.officerId,
          officerAlias: stamp.officerAlias
        };
    snap.history.push(event);
  }

  /**
   * Mint or reuse a committed lead for an associated person.
   * Stays in leads{} (All / Working / Filed). Does not copy RAP.
   */
  function promoteAssociateToCase(sourceLeadId, linkId) {
    var fresh = adoptDisk();
    if (!fresh.ok) {
      return { ok: false, leadId: "", existing: false, error: fresh.error };
    }
    var source = state.leads[sourceLeadId]
      ? clone(state.leads[sourceLeadId])
      : null;
    if (!source) {
      return { ok: false, leadId: "", existing: false, error: "Case not found." };
    }
    if (model.isCommitted && !model.isCommitted(source)) {
      return {
        ok: false,
        leadId: "",
        existing: false,
        error: "Open a filed case to promote an associate."
      };
    }
    var links = source.links || [];
    var link = null;
    var i;
    for (i = 0; i < links.length; i++) {
      if (links[i] && links[i].linkId === linkId) {
        link = links[i];
        break;
      }
    }
    if (!link) {
      return {
        ok: false,
        leadId: "",
        existing: false,
        error: "Association not found."
      };
    }
    if (!associationIsPerson(link)) {
      return {
        ok: false,
        leadId: "",
        existing: false,
        error: "Only a person association can open as a new case."
      };
    }
    var subject = model.subjectOf ? model.subjectOf(source) : source.person;
    var personId = String((link.to && link.to.id) || "").trim();
    var label = String(link.label || "").trim();
    if (!label && personId && state.people[personId] && model.formatPersonLabel) {
      label = model.formatPersonLabel(state.people[personId]) || "";
    }
    if (!label && !personId) {
      return {
        ok: false,
        leadId: "",
        existing: false,
        error: "Enter a name, or link an existing person."
      };
    }
    var existingLeadId = "";
    if (personId) {
      var related = relatedCommittedCases(personId, source.leadId);
      if (related.asSubject && related.asSubject.length) {
        existingLeadId = related.asSubject[0].leadId;
      } else {
        listLeads().some(function (row) {
          if (
            row &&
            row.leadId !== source.leadId &&
            row.subjectPersonId === personId
          ) {
            existingLeadId = row.leadId;
            return true;
          }
          return false;
        });
      }
    }
    var sourceLabel =
      (model.formatPersonLabel && model.formatPersonLabel(subject)) || "Case";
    function resolveSourceLink(id) {
      link.to = { type: "PERSON", id: id };
      link.otherType = "PERSON";
      if (label) {
        link.label = label;
      }
    }
    if (existingLeadId) {
      resolveSourceLink(personId);
      source.links = links;
      var savedExisting = saveLead(source, { mode: "commit" });
      if (!savedExisting || !savedExisting.ok) {
        return {
          ok: false,
          leadId: existingLeadId,
          existing: true,
          error: (savedExisting && savedExisting.error) || "Could not update the association."
        };
      }
      return {
        ok: true,
        leadId: existingLeadId,
        existing: true,
        error: ""
      };
    }
    var person;
    if (personId && state.people[personId]) {
      person = identityPerson(state.people[personId], personId);
    } else {
      person = identityPerson({ name: nameFromLabel(label) }, "");
      personId = person.personId;
    }
    var next = model.createLead({
      person: person,
      subjectPersonId: person.personId,
      caseRole: "LEAD"
    });
    next.person = person;
    next.subjectPersonId = person.personId;
    next.links = [
      model.createLink({
        from: { type: "PERSON", id: person.personId },
        to: { type: "PERSON", id: subject && subject.personId },
        otherType: "PERSON",
        label: sourceLabel,
        reasons: (link.reasons || []).slice(),
        notes: link.notes || ""
      })
    ];
    appendSystemNote(
      next,
      "Opened from " + sourceLabel + "."
    );
    appendSystemNote(
      source,
      "Opened a case for " + (label || (model.formatPersonLabel && model.formatPersonLabel(person)) || "associate") + "."
    );
    resolveSourceLink(person.personId);
    source.links = links;
    upsertPerson(person);
    var savedNew = saveLead(next, { mode: "draft" });
    if (!savedNew || !savedNew.ok) {
      return {
        ok: false,
        leadId: "",
        existing: false,
        error: (savedNew && savedNew.error) || "Could not open the case."
      };
    }
    var savedSource = saveLead(source, { mode: "commit" });
    if (!savedSource || !savedSource.ok) {
      return {
        ok: true,
        leadId: next.leadId,
        existing: false,
        error: (savedSource && savedSource.error) || ""
      };
    }
    return { ok: true, leadId: next.leadId, existing: false, error: "" };
  }

  function investigationNodeForPromote(inv, nodeId) {
    var nodes = (inv && inv.nodes) || [];
    var wanted = String(nodeId || "").trim();
    var i;
    var row;
    if (wanted) {
      for (i = 0; i < nodes.length; i++) {
        row = nodes[i];
        if (row && row.nodeId === wanted) {
          return row;
        }
      }
      for (i = 0; i < nodes.length; i++) {
        row = nodes[i];
        if (
          row &&
          String(row.objectType || "").toUpperCase() === "PERSON" &&
          row.objectId === wanted
        ) {
          return row;
        }
      }
      return null;
    }
    for (i = 0; i < nodes.length; i++) {
      row = nodes[i];
      if (row && row.nodeId === inv.focusNodeId) {
        return row;
      }
    }
    return null;
  }

  /**
   * Mint or reuse a working lead for a PERSON on an investigation wall.
   * Same personId. Identity only (no RAP, no wall graph dump).
   */
  function promoteInvestigationPersonToCase(investigationId, nodeId) {
    var blank = { ok: false, leadId: "", existing: false, error: "" };
    var fresh = adoptDisk();
    if (!fresh.ok) {
      blank.error = fresh.error;
      return blank;
    }
    var inv = state.investigations[investigationId]
      ? clone(state.investigations[investigationId])
      : null;
    if (!inv) {
      blank.error = "Investigation not found.";
      return blank;
    }
    var node = investigationNodeForPromote(inv, nodeId);
    if (!node) {
      blank.error = "Focus a person on the wall to open as a case.";
      return blank;
    }
    if (String(node.objectType || "").toUpperCase() !== "PERSON") {
      blank.error = "Only a person on the wall can open as a case.";
      return blank;
    }
    var personId = String(node.objectId || "").trim();
    if (!personId || !state.people[personId]) {
      blank.error = "Person not found.";
      return blank;
    }
    var existingLeadId = leadIdForPerson(personId);
    if (existingLeadId) {
      return {
        ok: true,
        leadId: existingLeadId,
        existing: true,
        error: ""
      };
    }
    var previousPerson = state.people[personId]
      ? clone(state.people[personId])
      : null;
    var person = identityPerson(previousPerson || state.people[personId], personId);
    var label =
      (model.formatPersonLabel && model.formatPersonLabel(person)) || "Person";
    var next = model.createLead({
      person: person,
      subjectPersonId: person.personId,
      caseRole: "LEAD",
      assignedOfficerId: inv.assignedOfficerId || ""
    });
    next.person = person;
    next.subjectPersonId = person.personId;
    next.caseRole = "LEAD";
    next.links = [];
    next.vehicles = [];
    appendSystemNote(next, "Opened from investigation " + inv.investigationId + ".");
    appendSystemNote(inv, "Opened a case for " + label + ".");
    upsertPerson(person);
    var savedNew = saveLead(next, { mode: "draft" });
    if (savedNew && savedNew.ok && previousPerson) {
      restorePersonRegistry(previousPerson, person);
    }
    if (!savedNew || !savedNew.ok) {
      return {
        ok: false,
        leadId: "",
        existing: false,
        error: (savedNew && savedNew.error) || "Could not open the case."
      };
    }
    var savedInv = saveInvestigation(inv, {
      mode: model.isCommitted && model.isCommitted(inv) ? "commit" : "draft"
    });
    if (!savedInv || !savedInv.ok) {
      return {
        ok: true,
        leadId: next.leadId,
        existing: false,
        error: (savedInv && savedInv.error) || ""
      };
    }
    return { ok: true, leadId: next.leadId, existing: false, error: "" };
  }

  function digitsOnly(value) {
    return String(value || "").replace(/\D/g, "");
  }

  function normalizeSex(value) {
    var key = String(value || "").trim().toLowerCase();
    if (key === "male" || key === "m") {
      return "male";
    }
    if (key === "female" || key === "f") {
      return "female";
    }
    return "";
  }

  function leadIdForPerson(personId) {
    var found = "";
    if (!personId) {
      return found;
    }
    listLeads().some(function (row) {
      if (row && row.subjectPersonId === personId) {
        found = row.leadId;
        return true;
      }
      return false;
    });
    return found;
  }

  function personByAlienNumber(aNumber) {
    var digits = digitsOnly(aNumber);
    if (!digits) {
      return null;
    }
    var found = null;
    allPeople().some(function (person) {
      var imm = (person && person.immigration) || {};
      if (digitsOnly(imm.alienNumber) === digits) {
        found = person;
        return true;
      }
      return false;
    });
    if (found) {
      return found;
    }
    listLeads().some(function (row) {
      var snap = row && state.leads[row.leadId];
      var subject = snap
        ? model.subjectOf
          ? model.subjectOf(snap)
          : snap.person
        : null;
      var imm = (subject && subject.immigration) || {};
      if (subject && digitsOnly(imm.alienNumber) === digits) {
        found = subject;
        return true;
      }
      return false;
    });
    return found;
  }

  function normalizedIdentityText(value) {
    return String(value || "")
      .trim()
      .replace(/\s+/g, " ")
      .toUpperCase();
  }

  function personByFbiNumber(fbiNumber) {
    var wanted = normalizedIdentityText(fbiNumber).replace(/\s+/g, "");
    var found = null;
    if (!wanted) {
      return null;
    }
    allPeople().some(function (person) {
      var criminal = (person && person.criminal) || {};
      if (
        normalizedIdentityText(criminal.fbiNumber).replace(/\s+/g, "") === wanted
      ) {
        found = person;
        return true;
      }
      return false;
    });
    return found;
  }

  function personByNameAndBirth(lastName, firstName, dateOfBirth) {
    var wantedLast = normalizedIdentityText(lastName);
    var wantedFirst = normalizedIdentityText(firstName);
    var wantedDob = String(dateOfBirth || "").trim();
    var found = null;
    if (!wantedLast || !wantedFirst || !wantedDob) {
      return null;
    }
    allPeople().some(function (person) {
      var name = (person && person.name) || {};
      if (
        normalizedIdentityText(name.lastName) === wantedLast &&
        normalizedIdentityText(name.firstName) === wantedFirst &&
        String(person.dateOfBirth || "").trim() === wantedDob
      ) {
        found = person;
        return true;
      }
      return false;
    });
    return found;
  }

  function personIdsByBookInIdentity(kind, value) {
    var wanted =
      kind === "alien"
        ? digitsOnly(value)
        : normalizedIdentityText(value).replace(/\s+/g, "");
    var seen = Object.create(null);
    var ids = [];
    if (!wanted) {
      return ids;
    }
    function inspect(person) {
      if (!person || !person.personId) {
        return;
      }
      var actual =
        kind === "alien"
          ? digitsOnly(person.immigration && person.immigration.alienNumber)
          : normalizedIdentityText(
              person.criminal && person.criminal.fbiNumber
            ).replace(/\s+/g, "");
      if (actual === wanted && !seen[person.personId]) {
        seen[person.personId] = true;
        ids.push(person.personId);
      }
    }
    allPeople().forEach(inspect);
    Object.keys(state.leads || {}).forEach(function (leadId) {
      var snap = state.leads[leadId];
      inspect(snap && (model.subjectOf ? model.subjectOf(snap) : snap.person));
    });
    return ids;
  }

  function bookInStateValue(record, stateIds, recordKeys) {
    var state = (record && record.formState) || {};
    var ids = Array.isArray(stateIds) ? stateIds : [stateIds];
    var keys = Array.isArray(recordKeys) ? recordKeys : [recordKeys];
    var i;
    for (i = 0; i < ids.length; i += 1) {
      var entry = state[ids[i]];
      if (entry && entry.value !== undefined && String(entry.value).trim() !== "") {
        return String(entry.value).trim();
      }
    }
    for (i = 0; i < keys.length; i += 1) {
      if (
        record &&
        keys[i] &&
        record[keys[i]] !== undefined &&
        String(record[keys[i]]).trim() !== ""
      ) {
        return String(record[keys[i]]).trim();
      }
    }
    return "";
  }

  function bookInRadioValue(record, choices, recordKeys) {
    var state = (record && record.formState) || {};
    var i;
    for (i = 0; i < choices.length; i += 1) {
      var entry = state[choices[i].id];
      if (entry && entry.checked) {
        return choices[i].value;
      }
    }
    return bookInStateValue(record, [], recordKeys);
  }

  function normalizeBookInRole(value) {
    var role = normalizedIdentityText(value);
    return role === "TARGET" || role === "COLLATERAL" ? role : "";
  }

  function normalizeBookInVehiclePosition(value) {
    var normalized = normalizedIdentityText(value);
    if (normalized === "DRIVER") {
      return "Driver";
    }
    if (normalized === "PASSENGER") {
      return "Passenger";
    }
    if (normalized === "OTHER") {
      return "Other";
    }
    return "";
  }

  function normalizeBookInCatalogCode(value, items) {
    var cleaned = String(value || "").trim();
    if (!cleaned) {
      return "";
    }
    var normalized = cleaned.toLowerCase();
    var match = (Array.isArray(items) ? items : []).filter(function (item) {
      if (!item) {
        return false;
      }
      var labels = [
        item.code,
        item.label,
        item.description,
        item.official,
        String(item.code || "") + " - " + String(item.label || item.description || "")
      ].concat(item.aliases || []);
      return labels.some(function (label) {
        return String(label || "").trim().toLowerCase() === normalized;
      });
    })[0];
    return match && match.code ? String(match.code) : cleaned;
  }

  function normalizeBookInAge(value) {
    if (value === "" || value === null || value === undefined) {
      return "";
    }
    var age = Number(value);
    return isFinite(age) && age >= 0 && age < 130 ? age : "";
  }

  function bookInAgeOnDate(dateOfBirth, asOfDate) {
    var dobMatch = String(dateOfBirth || "")
      .trim()
      .match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!dobMatch) {
      return "";
    }
    var asOfMatch = String(asOfDate || "")
      .trim()
      .match(/^(\d{4})-(\d{2})-(\d{2})/);
    var today = new Date();
    var year = asOfMatch ? Number(asOfMatch[1]) : today.getFullYear();
    var month = asOfMatch ? Number(asOfMatch[2]) : today.getMonth() + 1;
    var day = asOfMatch ? Number(asOfMatch[3]) : today.getDate();
    var birthYear = Number(dobMatch[1]);
    var birthMonth = Number(dobMatch[2]);
    var birthDay = Number(dobMatch[3]);
    var validated = new Date(Date.UTC(birthYear, birthMonth - 1, birthDay));
    if (
      validated.getUTCFullYear() !== birthYear ||
      validated.getUTCMonth() + 1 !== birthMonth ||
      validated.getUTCDate() !== birthDay
    ) {
      return "";
    }
    var age = year - birthYear;
    if (month < birthMonth || (month === birthMonth && day < birthDay)) {
      age -= 1;
    }
    return normalizeBookInAge(age);
  }

  function normalizeBookInDisposition(value) {
    var cleaned = String(value || "").trim();
    var normalized = cleaned.toLowerCase();
    if (normalized === "b&b" || normalized === "b and b") {
      return "B";
    }
    return normalizeBookInCatalogCode(
      cleaned,
      global.IMMIGRATION_DISPOSITIONS
    );
  }

  function normalizeBookInClock(value) {
    var match = String(value || "")
      .trim()
      .match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) {
      return "";
    }
    return String(Number(match[1])).padStart(2, "0") + ":" + match[2];
  }

  function previousDateKey(dateKey) {
    var match = String(dateKey || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) {
      return dateKey || "";
    }
    var date = new Date(
      Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
    );
    date.setUTCDate(date.getUTCDate() - 1);
    return date.toISOString().slice(0, 10);
  }

  function combineBookInArrestDateTime(bookInDateTime, arrestTime) {
    var dateTime = String(bookInDateTime || "").trim();
    var dateMatch = dateTime.match(/^(\d{4}-\d{2}-\d{2})(?:T(\d{2}):(\d{2}))?/);
    var clock = normalizeBookInClock(arrestTime);
    if (!dateMatch || !clock) {
      return dateTime;
    }
    var dateKey = dateMatch[1];
    var bookInClock = dateMatch[2] ? dateMatch[2] + ":" + dateMatch[3] : "";
    if (bookInClock && clock > bookInClock) {
      dateKey = previousDateKey(dateKey);
    }
    return dateKey + "T" + clock;
  }

  function bookInMedicalData(record) {
    var state = (record && record.formState) || {};
    var noMedicalEntry = state.noMedicalIssues || state.no_medical_issues;
    var medical = {
      communicationAnswer: bookInRadioValue(
        record,
        [
          { id: "communication_yes", value: "Yes" },
          { id: "communication_no", value: "No" }
        ],
        ["communicationAnswer"]
      ),
      noMedicalIssues: !!(noMedicalEntry && noMedicalEntry.checked),
      medicalIssues: bookInStateValue(
        record,
        ["medicalIssues", "medical_issues"],
        ["medicalIssues"]
      ),
      medicine: bookInStateValue(record, ["medicine"], ["medicine"]),
      additionalObservations: bookInStateValue(
        record,
        ["additionalObservations", "additional_observations"],
        ["additionalObservations"]
      ),
      referralAnswer: bookInRadioValue(
        record,
        [
          { id: "referral_yes", value: "Yes" },
          { id: "referral_no", value: "No" }
        ],
        ["referralAnswer"]
      )
    };
    var question;
    for (question = 1; question <= 13; question += 1) {
      medical["q" + question + "Answer"] = bookInRadioValue(
        record,
        [
          { id: "q" + question + "_yes", value: "Yes" },
          { id: "q" + question + "_no", value: "No" }
        ],
        ["q" + question + "Answer"]
      );
      if (question >= 3) {
        medical["q" + question + "Details"] = bookInStateValue(
          record,
          ["q" + question + "_details"],
          ["q" + question + "Details"]
        );
      }
    }
    return medical;
  }

  function bookInArrestFieldPresence(record) {
    record = record || {};
    var formState =
      record.formState && typeof record.formState === "object"
        ? record.formState
        : {};
    function hasAny(directKeys, formKeys) {
      return directKeys.some(function (key) {
        return storeSubjectOwn(record, key);
      }) || formKeys.some(function (key) {
        return storeSubjectOwn(formState, key);
      });
    }
    var hasDate = hasAny(
      ["arrestDate", "arrestDateTime", "bookInDateTime", "dateTime"],
      ["dateTime", "date_time"]
    );
    return {
      arrestDate: hasDate,
      arrestTime: hasAny(
        ["arrestTime"],
        ["arrestTime", "arrest_time", "arrestTimeManual", "arrest_time_manual"]
      ),
      arrestDateTime:
        hasDate ||
        hasAny(["arrestTime"], ["arrestTime", "arrest_time"]),
      arrestingOfficer: hasAny(
        ["arrestingOfficer", "officersName"],
        ["arrestingOfficer", "officersName", "officers_name"]
      ),
      team: hasAny(["team"], ["team"]),
      iceEventNumber: hasAny(
        ["iceEventNumber", "iceEvent"],
        ["iceEventNumber", "iceEvent", "ice_event"]
      ),
      encounterNumber: hasAny(
        ["encounterNumber"],
        ["encounterNumber", "encounter_number"]
      ),
      encounterId: hasAny(["encounterId"], []),
      subjectRole: hasAny(
        ["subjectRole", "encounterRole"],
        [
          "subject_role_target",
          "subject_role_collateral",
          "encounterRoleTarget",
          "encounterRoleCollateral"
        ]
      ),
      vehiclePosition: hasAny(
        ["vehiclePosition"],
        ["vehiclePosition", "vehicle_position"]
      ),
      bookInDateTime: hasDate,
      booking: hasAny(
        ["booking", "cash", "travelDocs", "propertyTag", "cellNum", "children"],
        [
          "cash",
          "travelDocs",
          "travel_docs",
          "propertyTag",
          "property_tag",
          "cellNum",
          "cell_num",
          "children",
          "medicalIssues",
          "medical_issues",
          "medicine",
          "additionalObservations",
          "additional_observations"
        ]
      )
    };
  }

  /** Convert either COPDoc or Alien Book-In 1.x saved-record fields to one input. */
  function bookInPromotionInput(record) {
    record = record || {};
    var gender = bookInStateValue(record, ["gender"], ["gender", "sex"]);
    if (!gender) {
      gender = bookInRadioValue(
        record,
        [
          { id: "sexMale", value: "male" },
          { id: "sexFemale", value: "female" }
        ],
        ["sex"]
      );
    }
    var bookInDateTime = bookInStateValue(
      record,
      ["dateTime", "date_time"],
      ["dateTime", "bookInDateTime"]
    );
    var arrestTime = normalizeBookInClock(
      bookInStateValue(record, ["arrestTime", "arrest_time"], ["arrestTime"])
    );
    var arrestDateTime = combineBookInArrestDateTime(bookInDateTime, arrestTime);
    var arrestDate = String(arrestDateTime || bookInDateTime).slice(0, 10);
    var dateOfBirth = bookInStateValue(
      record,
      ["dateOfBirth", "date_of_birth"],
      ["dateOfBirth"]
    );
    var age = normalizeBookInAge(
      bookInStateValue(record, ["age"], ["age"])
    );
    if (age === "") {
      age = bookInAgeOnDate(dateOfBirth, arrestDate);
    }
    var subjectRole = normalizeBookInRole(
      bookInRadioValue(
        record,
        [
          { id: "subject_role_target", value: "TARGET" },
          { id: "subject_role_collateral", value: "COLLATERAL" },
          { id: "encounterRoleTarget", value: "TARGET" },
          { id: "encounterRoleCollateral", value: "COLLATERAL" }
        ],
        ["subjectRole", "encounterRole"]
      )
    );
    var vehiclePosition = normalizeBookInVehiclePosition(
      bookInStateValue(
        record,
        ["vehiclePosition", "vehicle_position"],
        ["vehiclePosition"]
      )
    );
    var foreignWarrants = String(
      bookInStateValue(
        record,
        ["foreignWarrants", "foreign_warrants"],
        ["foreignWarrants"]
      )
    )
      .trim()
      .toLowerCase();
    var bookingId = storeSubjectOwn(record, "bookingId")
      ? storeSubjectText(record.bookingId)
      : storeSubjectText(record.id || record.bookinRecordId);
    return {
      subjectId: storeSubjectText(record.subjectId),
      leadId: String(record.leadId || "").trim(),
      personId: String(record.personId || "").trim(),
      bookingId: bookingId,
      bookinRecordId: bookingId,
      lastName: bookInStateValue(record, ["lastName", "last_name"], ["lastName"]),
      firstName: bookInStateValue(record, ["firstName", "first_name"], ["firstName"]),
      sex: gender,
      dateOfBirth: dateOfBirth,
      age: age,
      citizenship: normalizeBookInCatalogCode(
        bookInStateValue(
          record,
          ["citizenship", "country_of_citizenship"],
          ["countryOfCitizenship", "citizenship"]
        ),
        global.COUNTRIES
      ),
      alienNumber: bookInStateValue(
        record,
        ["alienNumber", "a_number"],
        ["aNumber", "alienNumber"]
      ),
      fbiNumber: bookInStateValue(
        record,
        ["fbiNumber", "fbi_number"],
        ["fbiNumber"]
      ),
      foreignWarrantsKnown:
        foreignWarrants === "yes" || foreignWarrants === "no",
      hasForeignWarrants: foreignWarrants === "yes",
      foreignWarrantCountry:
        foreignWarrants === "yes"
          ? bookInStateValue(
              record,
              ["foreignWarrantCountry", "foreign_warrant_country"],
              ["foreignWarrantCountry"]
            )
          : "",
      disposition: normalizeBookInDisposition(
        bookInStateValue(
          record,
          ["immigrationDisposition", "case_type"],
          ["caseType", "disposition"]
        )
      ),
      status: normalizeBookInCatalogCode(
        bookInStateValue(record, ["immigrationStatus"], ["status"]),
        global.IMMIGRATION_STATUS
      ),
      iceEventNumber: bookInStateValue(
        record,
        ["iceEvent", "ice_event"],
        ["iceEvent"]
      ),
      encounterNumber: bookInStateValue(
        record,
        ["encounterNumber", "encounter_number"],
        ["encounterNumber"]
      ),
      encounterId: String(record.encounterId || "").trim(),
      subjectRole: subjectRole,
      vehiclePosition: vehiclePosition,
      arrestDate: arrestDate,
      arrestTime: arrestTime,
      arrestDateTime: arrestDateTime,
      bookInDateTime: bookInDateTime,
      arrestingOfficer: bookInStateValue(
        record,
        ["officersName", "officers_name"],
        ["officersName"]
      ),
      team: bookInStateValue(record, ["team"], ["team"]),
      arrestFieldPresence:
        record.__copdocImportArrestFieldPresence &&
        typeof record.__copdocImportArrestFieldPresence === "object"
          ? clone(record.__copdocImportArrestFieldPresence)
          : bookInArrestFieldPresence(record),
      booking: {
        cash: bookInStateValue(record, ["cash"], ["cash"]),
        travelDocuments: bookInStateValue(
          record,
          ["travelDocs", "travel_docs"],
          ["travelDocs"]
        ),
        propertyTag: bookInStateValue(
          record,
          ["propertyTag", "property_tag"],
          ["propertyTag"]
        ),
        holdingCellNumber: bookInStateValue(
          record,
          ["cellNum", "cell_num"],
          ["cellNum"]
        ),
        children: bookInStateValue(record, ["children"], ["children"]),
        medical: bookInMedicalData(record)
      }
    };
  }

  function overlayBookInPerson(person, input) {
    var next = person ? clone(person) : model.createPerson({ caseRole: "DETAINEE" });
    next.caseRole = "DETAINEE";
    next.name = next.name || { lastName: "", firstName: "", middleName: "" };
    if (input.lastName) {
      next.name.lastName = input.lastName;
    }
    if (input.firstName) {
      next.name.firstName = input.firstName;
    }
    if (input.sex) {
      next.sex = input.sex;
    }
    if (input.dateOfBirth) {
      next.dateOfBirth = input.dateOfBirth;
    }
    if (input.age !== undefined && input.age !== "") {
      next.age = input.age;
    }
    if (input.citizenship) {
      next.citizenship = input.citizenship;
    }
    next.immigration = next.immigration || {};
    if (input.alienNumber) {
      next.immigration.alienNumber = input.alienNumber;
    }
    if (input.disposition) {
      next.immigration.disposition = input.disposition;
    }
    if (input.status) {
      next.immigration.status = input.status;
    }
    next.criminal = next.criminal || {};
    if (input.fbiNumber) {
      next.criminal.fbiNumber = input.fbiNumber;
    }
    if (input.foreignWarrantsKnown === true) {
      next.criminal.foreignWarrantsKnown = true;
      next.criminal.hasForeignWarrants = input.hasForeignWarrants === true;
      next.criminal.foreignWarrantCountry = input.hasForeignWarrants
        ? String(input.foreignWarrantCountry || "").trim()
        : "";
    }
    return next;
  }

  function upsertBookInArrest(person, input) {
    var subjectId = storeSubjectText(input.subjectId);
    var recordId = storeSubjectOwn(input, "bookingId")
      ? storeSubjectText(input.bookingId)
      : storeSubjectText(input.bookinRecordId);
    var hasArrestData = !!(
      recordId ||
      input.arrestDate ||
      input.arrestDateTime ||
      input.bookInDateTime
    );
    if (!hasArrestData) {
      return { ok: true, arrestId: "", error: "" };
    }
    var canonicalPersonId = storeSubjectText(person && person.personId);
    person.arrests = Array.isArray(person.arrests) ? person.arrests : [];
    var externalClaim = null;
    var splitProjectionClaim = null;

    function localContainsProjection(row) {
      var rowArrestId = storeSubjectText(row && row.arrestId);
      var rowSubjectId = storeSubjectText(row && row.subjectId);
      var rowBookingId = storeSubjectBookingId(row);
      return person.arrests.some(function (local) {
        var localArrestId = storeSubjectText(local && local.arrestId);
        var localSubjectId = storeSubjectText(local && local.subjectId);
        var localBookingId = storeSubjectBookingId(local);
        if (rowArrestId && localArrestId === rowArrestId) {
          return true;
        }
        if (rowSubjectId && rowBookingId) {
          return (
            localSubjectId === rowSubjectId &&
            localBookingId === rowBookingId
          );
        }
        if (rowSubjectId) {
          return localSubjectId === rowSubjectId;
        }
        return !!rowBookingId && localBookingId === rowBookingId;
      });
    }

    function inspectOwnerArrests(ownerPersonId, rows) {
      return (Array.isArray(rows) ? rows : []).some(function (row) {
        var ownsSubject =
          subjectId && storeSubjectText(row && row.subjectId) === subjectId;
        var ownsBooking = recordId && storeSubjectBookingId(row) === recordId;
        if (!ownsSubject && !ownsBooking) {
          return false;
        }
        if (ownerPersonId !== canonicalPersonId) {
          externalClaim = {
            ownerPersonId: ownerPersonId,
            matchedBy: ownsSubject ? "subjectId" : "bookingId"
          };
          return true;
        }
        if (!localContainsProjection(row)) {
          splitProjectionClaim = {
            matchedBy: ownsSubject ? "subjectId" : "bookingId"
          };
          return true;
        }
        return false;
      });
    }

    Object.keys(state.people || {}).some(function (ownerId) {
      var owner = state.people[ownerId];
      var ownerPersonId = storeSubjectText(owner && owner.personId) || ownerId;
      return inspectOwnerArrests(ownerPersonId, owner && owner.arrests);
    });
    if (!externalClaim && !splitProjectionClaim) {
      Object.keys(state.leads || {}).some(function (leadId) {
        var lead = state.leads[leadId];
        var owner = leadOwnerIdentity(lead, leadId);
        var leadSubject = model.subjectOf ? model.subjectOf(lead) : lead.person;
        if (!owner.ok) {
          return (Array.isArray(leadSubject && leadSubject.arrests)
            ? leadSubject.arrests
            : []
          ).some(function (row) {
            var ownsSubject =
              subjectId && storeSubjectText(row && row.subjectId) === subjectId;
            var ownsBooking = recordId && storeSubjectBookingId(row) === recordId;
            if (!ownsSubject && !ownsBooking) {
              return false;
            }
            externalClaim = {
              ownerPersonId: "",
              matchedBy: ownsSubject ? "subjectId" : "bookingId",
              invalidLead: true
            };
            return true;
          });
        }
        return inspectOwnerArrests(
          owner.personId,
          leadSubject && leadSubject.arrests
        );
      });
    }
    if (externalClaim) {
      return {
        ok: false,
        arrestId: "",
        error: externalClaim.invalidLead
          ? "A Case with an invalid Person owner already claims this Book-In " +
            externalClaim.matchedBy +
            ". Run Integrity before saving."
          : "The Book-In " +
            externalClaim.matchedBy +
            " is already owned by another Person."
      };
    }
    if (splitProjectionClaim) {
      return {
        ok: false,
        arrestId: "",
        error:
          "The Person's canonical and Case Arrest projections disagree on this Book-In " +
          splitProjectionClaim.matchedBy +
          ". Run Integrity before saving."
      };
    }
    var index = -1;
    function matchingIndexes(predicate) {
      var matches = [];
      person.arrests.forEach(function (row, rowIndex) {
        if (row && predicate(row)) {
          matches.push(rowIndex);
        }
      });
      return matches;
    }
    function failed(error) {
      return { ok: false, arrestId: "", error: error };
    }
    var subjectMatches = subjectId
      ? matchingIndexes(function (row) {
          return storeSubjectText(row.subjectId) === subjectId;
        })
      : [];
    var bookingMatches = recordId
      ? matchingIndexes(function (row) {
          return storeSubjectBookingId(row) === recordId;
        })
      : [];
    if (subjectId && recordId) {
      var exactPair = subjectMatches.filter(function (rowIndex) {
        return storeSubjectBookingId(person.arrests[rowIndex]) === recordId;
      });
      if (exactPair.length > 1) {
        return failed("Multiple Arrests already own this subject and booking identity.");
      }
      if (exactPair.length === 1) {
        index = exactPair[0];
      } else if (
        subjectMatches.length &&
        bookingMatches.length &&
        !subjectMatches.some(function (rowIndex) {
          return bookingMatches.indexOf(rowIndex) !== -1;
        })
      ) {
        return failed(
          "The subject and booking are already split across different Arrests."
        );
      } else if (subjectMatches.length) {
        var blankBooking = subjectMatches.filter(function (rowIndex) {
          return !storeSubjectBookingId(person.arrests[rowIndex]);
        });
        if (subjectMatches.length === 1 && blankBooking.length === 1) {
          index = blankBooking[0];
        } else {
          return failed("The subject is already linked to a different or ambiguous Arrest booking.");
        }
      } else if (bookingMatches.length) {
        var blankSubject = bookingMatches.filter(function (rowIndex) {
          return !storeSubjectId(person.arrests[rowIndex]);
        });
        if (bookingMatches.length === 1 && blankSubject.length === 1) {
          index = blankSubject[0];
        } else {
          return failed("The booking is already linked to a different or ambiguous Arrest subject.");
        }
      }
    } else if (subjectId) {
      if (subjectMatches.length > 1) {
        return failed("Multiple Arrests already use this Encounter subject identity.");
      }
      index = subjectMatches.length === 1 ? subjectMatches[0] : -1;
    } else if (recordId) {
      if (bookingMatches.length > 1) {
        return failed("Multiple Arrests already use this Book-In identity.");
      }
      index = bookingMatches.length === 1 ? bookingMatches[0] : -1;
    }
    var previous = index >= 0 ? person.arrests[index] : null;
    var preserveMissing = !!(
      previous && input.preserveMissingArrestFields === true
    );
    var fieldPresence = input.arrestFieldPresence || {};
    function arrestField(field, incoming, normalize) {
      if (preserveMissing && fieldPresence[field] !== true) {
        return previous && previous[field] !== undefined
          ? previous[field]
          : incoming;
      }
      return normalize ? normalize(incoming) : incoming;
    }
    var pin = encounterPin(
      input.encounterId && state.encounters[input.encounterId]
    );
    var bookingValue = preserveMissing && fieldPresence.booking !== true
      ? clone((previous && previous.booking) || {})
      : Object.assign(
          {},
          (previous && previous.booking) || {},
          input.booking || {}
        );
    var arrestInput = Object.assign({}, previous || {}, {
        arrestDate: arrestField("arrestDate", input.arrestDate, function (value) {
          return String(value || "").trim();
        }),
        arrestTime: arrestField(
          "arrestTime",
          input.arrestTime,
          normalizeBookInClock
        ),
        arrestDateTime: arrestField(
          "arrestDateTime",
          input.arrestDateTime,
          function (value) {
            return String(value || "").trim();
          }
        ),
        arrestingOfficer: arrestField(
          "arrestingOfficer",
          input.arrestingOfficer,
          function (value) {
            return String(value || "").trim();
          }
        ),
        team: arrestField("team", input.team, function (value) {
          return String(value || "").trim();
        }),
        iceEventNumber: arrestField(
          "iceEventNumber",
          input.iceEventNumber,
          function (value) {
            return String(value || "").trim();
          }
        ),
        encounterNumber: arrestField(
          "encounterNumber",
          input.encounterNumber,
          function (value) {
            return String(value || "").trim();
          }
        ),
        encounterId: arrestField(
          "encounterId",
          input.encounterId,
          function (value) {
            return String(value || "").trim();
          }
        ),
        subjectId:
          subjectId || storeSubjectText(previous && previous.subjectId),
        subjectRole: arrestField(
          "subjectRole",
          input.subjectRole,
          normalizeBookInRole
        ),
        vehiclePosition: arrestField(
          "vehiclePosition",
          input.vehiclePosition,
          normalizeBookInVehiclePosition
        ),
        bookingId: recordId,
        bookinRecordId: recordId,
        bookInDateTime: arrestField(
          "bookInDateTime",
          input.bookInDateTime,
          function (value) {
            return String(value || "").trim();
          }
        ),
        arrestLocation:
          String(input.arrestLocation || "").trim() ||
          (previous && previous.arrestLocation) ||
          (pin && pin.arrestLocation) ||
          "",
        latitude:
          String(input.latitude || "").trim() ||
          (previous && previous.latitude) ||
          (pin && pin.latitude) ||
          "",
        longitude:
          String(input.longitude || "").trim() ||
          (previous && previous.longitude) ||
          (pin && pin.longitude) ||
          "",
        booking: bookingValue
      });
    var linkedArrestId =
      (previous && previous.arrestId) || String(input.arrestId || "");
    if (linkedArrestId) {
      arrestInput.arrestId = linkedArrestId;
    }
    var arrest = model.createArrest(arrestInput);
    if (index >= 0) {
      person.arrests[index] = arrest;
    } else {
      person.arrests.push(arrest);
    }
    return { ok: true, arrestId: arrest.arrestId, error: "" };
  }

  function validateBookInEncounterSubject(input, resolvedPersonId, resolvedLeadId) {
    input = input || {};
    var encounterId = storeSubjectText(input.encounterId);
    var subjectId = storeSubjectText(input.subjectId);
    if (!encounterId) {
      if (subjectId) {
        return {
          ok: false,
          subject: null,
          code: "ENCOUNTER_SUBJECT_ID_CONFLICT",
          error: "A Book-In subjectId requires a linked Encounter."
        };
      }
      return { ok: true, subject: null, error: "" };
    }
    var encounter = state.encounters[encounterId];
    if (!encounter) {
      return {
        ok: false,
        subject: null,
        code: "ENCOUNTER_SUBJECT_ID_CONFLICT",
        error: "The linked Encounter does not exist."
      };
    }
    if (encounter.meta && encounter.meta.markedComplete) {
      return {
        ok: false,
        subject: null,
        code: "ENCOUNTER_LOCKED",
        error: "The linked Encounter is completed and locked."
      };
    }
    var subjects = Array.isArray(encounter && encounter.subjects)
      ? encounter.subjects
      : [];
    var bookingId = storeSubjectOwn(input, "bookingId")
      ? storeSubjectText(input.bookingId)
      : storeSubjectText(input.bookinRecordId);
    var personId = storeSubjectText(
      resolvedPersonId === undefined ? input.personId : resolvedPersonId
    );
    var leadId = storeSubjectText(
      resolvedLeadId === undefined ? input.leadId : resolvedLeadId
    );
    var subjectIndex = -1;

    function indexesMatching(predicate) {
      var indexes = [];
      subjects.forEach(function (row, index) {
        if (row && predicate(row)) {
          indexes.push(index);
        }
      });
      return indexes;
    }

    function failed(error) {
      return {
        ok: false,
        subject: null,
        code: "ENCOUNTER_SUBJECT_ID_CONFLICT",
        error: error
      };
    }

    var claimedElsewhere = Object.keys(state.encounters || {}).some(function (
      ownerEncounterId
    ) {
      if (ownerEncounterId === encounterId) {
        return false;
      }
      return encounterOwnershipRows(state.encounters[ownerEncounterId]).some(
        function (row) {
          return (
            (subjectId && storeSubjectId(row) === subjectId) ||
            (bookingId && storeSubjectBookingId(row) === bookingId)
          );
        }
      );
    });
    if (claimedElsewhere) {
      return failed(
        "The Book-In subject or booking reference belongs to another Encounter."
      );
    }
    var historicalClaimWithoutActiveOwner = encounterOwnershipRows(
      encounter,
      false
    ).some(function (archived) {
      var matches =
        (subjectId && storeSubjectId(archived) === subjectId) ||
        (bookingId && storeSubjectBookingId(archived) === bookingId);
      if (!matches) {
        return false;
      }
      var archivedSubjectId = storeSubjectId(archived);
      return !subjects.some(function (active) {
        return (
          archivedSubjectId && storeSubjectId(active) === archivedSubjectId
        );
      });
    });
    if (historicalClaimWithoutActiveOwner) {
      return failed(
        "The Book-In subject or booking reference belongs to a historical Encounter association."
      );
    }
    var retiredBookingClaim = (Array.isArray(encounter.bookingIdentityHistory)
      ? encounter.bookingIdentityHistory
      : []
    ).some(function (row) {
      return bookingId && storeSubjectBookingId(row) === bookingId;
    });
    if (retiredBookingClaim) {
      return failed(
        "The Book-In booking reference was previously unlinked from this Encounter."
      );
    }

    if (subjectId) {
      var exactMatches = indexesMatching(function (subject) {
        return storeSubjectId(subject) === subjectId;
      });
      if (exactMatches.length !== 1) {
        return failed("The linked Encounter subject is missing or ambiguous.");
      }
      subjectIndex = exactMatches[0];
    } else {
      var exactClaimExists = false;
      var compatibleMatches = indexesMatching(function (candidate, index) {
        var candidateBookingId = storeSubjectBookingId(candidate);
        var candidatePersonId = storeSubjectText(candidate.personId);
        var candidateLeadId = storeSubjectText(candidate.leadId);
        var exactClaim = !!(
          (bookingId && candidateBookingId === bookingId) ||
          (personId && candidatePersonId === personId) ||
          (leadId && candidateLeadId === leadId)
        );
        exactClaimExists = exactClaimExists || exactClaim;
        if (!exactClaim) {
          return false;
        }
        if (
          (bookingId && candidateBookingId && candidateBookingId !== bookingId) ||
          (personId && candidatePersonId && candidatePersonId !== personId) ||
          (leadId && candidateLeadId && candidateLeadId !== leadId)
        ) {
          return false;
        }
        return !subjects.some(function (other, otherIndex) {
          if (!other || otherIndex === index) {
            return false;
          }
          return (
            (bookingId &&
              !candidateBookingId &&
              storeSubjectBookingId(other) === bookingId) ||
            (personId &&
              !candidatePersonId &&
              storeSubjectText(other.personId) === personId) ||
            (leadId &&
              !candidateLeadId &&
              storeSubjectText(other.leadId) === leadId)
          );
        });
      });
      if (compatibleMatches.length > 1) {
        return failed(
          "The Book-In identity matches multiple compatible Encounter subjects."
        );
      }
      if (compatibleMatches.length === 1) {
        subjectIndex = compatibleMatches[0];
      } else if (exactClaimExists) {
        return failed(
          "The Book-In identity conflicts with the linked Encounter subjects."
        );
      } else {
        return { ok: true, subject: null, error: "" };
      }
    }

    var subject = subjects[subjectIndex];
    subjectId = storeSubjectId(subject);
    var subjectBookingId = storeSubjectBookingId(subject);
    var subjectPersonId = storeSubjectText(subject.personId);
    var subjectLeadId = storeSubjectText(subject.leadId);
    var anotherOwnsBooking = bookingId && subjects.some(function (row, index) {
      return index !== subjectIndex && storeSubjectBookingId(row) === bookingId;
    });
    var anotherOwnsPerson =
      !subjectPersonId &&
      personId &&
      subjects.some(function (row, index) {
        return (
          index !== subjectIndex &&
          storeSubjectText(row && row.personId) === personId
        );
      });
    var anotherOwnsLead =
      !subjectLeadId &&
      leadId &&
      subjects.some(function (row, index) {
        return (
          index !== subjectIndex &&
          storeSubjectText(row && row.leadId) === leadId
        );
      });
    if (
      anotherOwnsBooking ||
      anotherOwnsPerson ||
      anotherOwnsLead ||
      (bookingId && subjectBookingId && bookingId !== subjectBookingId) ||
      (personId && subjectPersonId && personId !== subjectPersonId) ||
      (leadId && subjectLeadId && leadId !== subjectLeadId)
    ) {
      var mismatch = failed("Book-In identity conflicts with the linked Encounter subject.");
      mismatch.subject = subject;
      return mismatch;
    }
    return { ok: true, subject: subject, error: "" };
  }

  /**
   * Book-in Save: mint or reuse a person and file a DETAINEE lead.
   * Packet store stays separate. Identity overlay does not copy RAP.
   */
  function promoteBookInToLead(input) {
    input = clone(input || {});
    var directBookingClaims = [
      storeSubjectText(input.id),
      storeSubjectText(input.bookingId),
      storeSubjectText(input.bookinRecordId)
    ].filter(function (value, index, values) {
      return value && values.indexOf(value) === index;
    });
    if (directBookingClaims.length > 1) {
      return {
        ok: false,
        code: "BOOKIN_ARREST_IDENTITY_CONFLICT",
        leadId: storeSubjectText(input.leadId),
        personId: storeSubjectText(input.personId),
        existing: false,
        error: "The Book-In record contains contradictory booking identifiers."
      };
    }
    if (directBookingClaims.length === 1) {
      input.bookingId = directBookingClaims[0];
      input.bookinRecordId = directBookingClaims[0];
    }
    var fresh = adoptDisk();
    if (!fresh.ok) {
      return {
        ok: false,
        leadId: "",
        personId: "",
        existing: false,
        error: fresh.error
      };
    }
    var lastName = String(input.lastName || "").trim();
    var firstName = String(input.firstName || "").trim();
    var aNumber = digitsOnly(input.alienNumber);
    var fbiNumber = String(input.fbiNumber || "").trim();
    var leadId = String(input.leadId || "").trim();
    var personId = String(input.personId || "").trim();
    if (leadId && !state.leads[leadId]) {
      return {
        ok: false,
        code: "BOOKIN_PERSON_IDENTITY_CONFLICT",
        leadId: leadId,
        personId: personId,
        existing: false,
        error: "The selected Case does not exist."
      };
    }
    if (leadId && !leadOwnerIdentity(state.leads[leadId], leadId).ok) {
      return {
        ok: false,
        code: "BOOKIN_PERSON_IDENTITY_CONFLICT",
        leadId: leadId,
        personId: personId,
        existing: false,
        error: "The selected Case has an invalid Person owner."
      };
    }
    if (personId && !state.people[personId]) {
      return {
        ok: false,
        code: "BOOKIN_PERSON_IDENTITY_CONFLICT",
        leadId: leadId,
        personId: personId,
        existing: false,
        error: "The selected Person does not exist."
      };
    }
    var subjectLink = validateBookInEncounterSubject(input, personId, leadId);
    if (!subjectLink.ok) {
      return {
        ok: false,
        code: subjectLink.code,
        leadId: leadId,
        personId: personId,
        existing: false,
        error: subjectLink.error
      };
    }
    if (subjectLink.subject) {
      input.subjectId = storeSubjectId(subjectLink.subject) || input.subjectId;
      personId = storeSubjectText(subjectLink.subject.personId) || personId;
      leadId = storeSubjectText(subjectLink.subject.leadId) || leadId;
    }
    if (!leadId && !personId && !lastName && !firstName && !aNumber && !fbiNumber) {
      return {
        ok: false,
        leadId: "",
        personId: "",
        existing: false,
        error: "Enter a name, A-Number, or FBI Number to file a case."
      };
    }
    var snap = leadId ? getLead(leadId) : null;
    var person = null;
    var existing = false;
    if (snap) {
      person = model.subjectOf ? model.subjectOf(snap) : snap.person;
      var leadPersonId = storeSubjectText(person && person.personId);
      if (personId && leadPersonId && personId !== leadPersonId) {
        return {
          ok: false,
          code: "BOOKIN_PERSON_IDENTITY_CONFLICT",
          leadId: leadId,
          personId: personId,
          existing: false,
          error: "The selected Case belongs to a different Person."
        };
      }
      personId = leadPersonId || personId;
      existing = true;
    } else if (personId && state.people[personId]) {
      person = clone(state.people[personId]);
      leadId = leadIdForPerson(personId);
      snap = leadId ? getLead(leadId) : null;
      existing = !!snap;
    } else if (aNumber) {
      var match = personByAlienNumber(aNumber);
      if (match) {
        person = clone(match);
        personId = person.personId || "";
        leadId = leadIdForPerson(personId);
        snap = leadId ? getLead(leadId) : null;
        existing = !!snap;
      }
    }
    if (!person && !snap && fbiNumber) {
      var fbiMatch = personByFbiNumber(fbiNumber);
      if (fbiMatch) {
        person = clone(fbiMatch);
        personId = person.personId || "";
        leadId = leadIdForPerson(personId);
        snap = leadId ? getLead(leadId) : null;
        existing = !!snap;
      }
    }
    if (!person && !snap) {
      var identityMatch = personByNameAndBirth(
        lastName,
        firstName,
        input.dateOfBirth
      );
      if (identityMatch) {
        person = clone(identityMatch);
        personId = person.personId || "";
        leadId = leadIdForPerson(personId);
        snap = leadId ? getLead(leadId) : null;
        existing = !!snap;
      }
    }
    var resolvedSubjectLink = validateBookInEncounterSubject(input, personId, leadId);
    if (!resolvedSubjectLink.ok) {
      return {
        ok: false,
        code: resolvedSubjectLink.code,
        leadId: leadId,
        personId: personId,
        existing: existing,
        error: resolvedSubjectLink.error
      };
    }
    if (resolvedSubjectLink.subject) {
      var canonicalPersonId = storeSubjectText(
        resolvedSubjectLink.subject.personId
      );
      var canonicalLeadId = storeSubjectText(resolvedSubjectLink.subject.leadId);
      if (canonicalPersonId && !state.people[canonicalPersonId]) {
        return {
          ok: false,
          code: "BOOKIN_PERSON_IDENTITY_CONFLICT",
          leadId: canonicalLeadId || leadId,
          personId: canonicalPersonId,
          existing: existing,
          error: "The Encounter subject's Person does not exist."
        };
      }
      if (canonicalLeadId && !state.leads[canonicalLeadId]) {
        return {
          ok: false,
          code: "BOOKIN_PERSON_IDENTITY_CONFLICT",
          leadId: canonicalLeadId,
          personId: canonicalPersonId || personId,
          existing: existing,
          error: "The Encounter subject's Case does not exist."
        };
      }
      if (
        canonicalLeadId &&
        !leadOwnerIdentity(state.leads[canonicalLeadId], canonicalLeadId).ok
      ) {
        return {
          ok: false,
          code: "BOOKIN_PERSON_IDENTITY_CONFLICT",
          leadId: canonicalLeadId,
          personId: canonicalPersonId || personId,
          existing: existing,
          error: "The Encounter subject's Case has an invalid Person owner."
        };
      }
      if (
        canonicalPersonId &&
        person &&
        person.personId &&
        storeSubjectText(person.personId) !== canonicalPersonId
      ) {
        return {
          ok: false,
          code: "ENCOUNTER_SUBJECT_ID_CONFLICT",
          leadId: leadId,
          personId: personId,
          existing: existing,
          error: "Book-In identity conflicts with the linked Encounter subject."
        };
      }
      input.subjectId =
        storeSubjectId(resolvedSubjectLink.subject) || input.subjectId;
      input.subjectRole =
        storeSubjectRole(resolvedSubjectLink.subject) || input.subjectRole;
      input.vehiclePosition =
        storeSubjectOccupantRole(resolvedSubjectLink.subject) ||
        input.vehiclePosition;
      input.arrestFieldPresence = input.arrestFieldPresence || {};
      input.arrestFieldPresence.encounterId = true;
      input.arrestFieldPresence.subjectRole = true;
      input.arrestFieldPresence.vehiclePosition = true;
      personId = canonicalPersonId || personId;
      leadId = canonicalLeadId || leadId;
      if (canonicalPersonId && !person) {
        person = clone(state.people[canonicalPersonId]);
      }
    }
    if (snap && !leadOwnerIdentity(snap, leadId || snap.leadId).ok) {
      return {
        ok: false,
        code: "BOOKIN_PERSON_IDENTITY_CONFLICT",
        leadId: storeSubjectText(snap.leadId) || leadId,
        personId: personId,
        existing: existing,
        error: "The resolved Case has an invalid Person owner."
      };
    }
    var alienOwners = personIdsByBookInIdentity("alien", aNumber);
    var fbiOwners = personIdsByBookInIdentity("fbi", fbiNumber);
    var conflictingIdentityOwner = alienOwners.concat(fbiOwners).some(function (ownerId) {
      return ownerId && ownerId !== personId;
    });
    if (conflictingIdentityOwner) {
      return {
        ok: false,
        code: "BOOKIN_PERSON_IDENTITY_CONFLICT",
        leadId: leadId,
        personId: personId,
        existing: existing,
        error: "The entered A-Number or FBI Number belongs to a different Person."
      };
    }
    var overlay = {
      lastName: lastName,
      firstName: firstName,
      sex: normalizeSex(input.sex),
      dateOfBirth: String(input.dateOfBirth || "").trim(),
      age: normalizeBookInAge(input.age),
      citizenship: normalizeBookInCatalogCode(
        input.citizenship,
        global.COUNTRIES
      ),
      alienNumber: aNumber,
      fbiNumber: fbiNumber,
      disposition: normalizeBookInDisposition(input.disposition),
      status: normalizeBookInCatalogCode(input.status, global.IMMIGRATION_STATUS),
      foreignWarrantsKnown: input.foreignWarrantsKnown === true,
      hasForeignWarrants: input.hasForeignWarrants === true,
      foreignWarrantCountry: String(input.foreignWarrantCountry || "").trim()
    };
    person = overlayBookInPerson(person, overlay);
    var arrestResult = upsertBookInArrest(person, input);
    if (!arrestResult.ok) {
      return {
        ok: false,
        code: "BOOKIN_ARREST_IDENTITY_CONFLICT",
        leadId: leadId,
        personId: personId,
        existing: existing,
        error: arrestResult.error
      };
    }
    var arrestId = arrestResult.arrestId;
    personId = person.personId;
    var wasDetainee =
      snap &&
      (snap.caseRole === "DETAINEE" ||
        (snap.person && snap.person.caseRole === "DETAINEE"));
    if (!snap) {
      var newLeadInput = {
        person: person,
        subjectPersonId: person.personId,
        caseRole: "DETAINEE"
      };
      if (leadId) {
        newLeadInput.leadId = leadId;
      }
      snap = model.createLead(newLeadInput);
      leadId = snap.leadId;
      appendSystemNote(snap, "Booked in. Detainee / in custody.");
    } else {
      snap.person = person;
      snap.subjectPersonId = person.personId;
      snap.caseRole = "DETAINEE";
      if (!wasDetainee) {
        appendSystemNote(snap, "Booked in. Status set to Detainee / in custody.");
      }
    }
    snap.source = snap.source || (model.createSource ? model.createSource() : {});
    if (!snap.source.leadSource) {
      snap.source.leadSource = "BOOK_IN";
    }
    if (!snap.source.caseNumber) {
      snap.source.caseNumber = String(
        input.iceEventNumber || input.encounterNumber || ""
      ).trim();
    }
    if (input.bookinRecordId) {
      snap.history = Array.isArray(snap.history) ? snap.history : [];
      var hasBookInEvent = snap.history.some(function (row) {
        return (
          row &&
          String(row.bookinRecordId || "") === String(input.bookinRecordId)
        );
      });
      if (!hasBookInEvent) {
        var event = model.createHistoryEvent
          ? model.createHistoryEvent({
              type: "book-in",
              text: "Book-in arrest added to the case.",
              source: "book-in",
              bookinRecordId: String(input.bookinRecordId)
            })
          : {
              type: "book-in",
              text: "Book-in arrest added to the case.",
              source: "book-in",
              bookinRecordId: String(input.bookinRecordId)
            };
        snap.history.push(event);
      }
    }
    snap.person = person;
    snap.subjectPersonId = person.personId;
    snap.caseRole = "DETAINEE";
    var saved = saveLead(snap, { mode: "commit" });
    if (!saved || !saved.ok) {
      return {
        ok: false,
        leadId: leadId,
        personId: personId,
        existing: existing,
        error: (saved && saved.error) || "Could not file the case."
      };
    }
    return {
      ok: true,
      leadId: saved.leadId,
      personId: personId,
      subjectId: storeSubjectText(input.subjectId),
      subjectRole: normalizeBookInRole(input.subjectRole),
      vehiclePosition: normalizeBookInVehiclePosition(input.vehiclePosition),
      arrestId: arrestId,
      existing: existing,
      error: ""
    };
  }

  function promoteBookInRecord(record, options) {
    record = record || {};
    options = options || {};
    var recordBookingClaims = [
      storeSubjectText(record.id),
      storeSubjectText(record.bookingId),
      storeSubjectText(record.bookinRecordId)
    ].filter(function (value, index, values) {
      return value && values.indexOf(value) === index;
    });
    if (recordBookingClaims.length > 1) {
      return {
        ok: false,
        code: "BOOKIN_ARREST_IDENTITY_CONFLICT",
        leadId: storeSubjectText(record.leadId),
        personId: storeSubjectText(record.personId),
        existing: false,
        error: "The Book-In record contains contradictory booking identifiers."
      };
    }
    var input = bookInPromotionInput(record);
    var supplied = options.formData || options;
    Object.keys(supplied || {}).forEach(function (key) {
      if (key !== "formData" && supplied[key] !== undefined) {
        input[key] = supplied[key];
      }
    });
    input.leadId = String(record.leadId || input.leadId || "").trim();
    input.personId = String(record.personId || input.personId || "").trim();
    var suppliedBookingClaims = [
      recordBookingClaims[0] || "",
      storeSubjectText(input.bookingId),
      storeSubjectText(input.bookinRecordId)
    ].filter(function (value, index, values) {
      return value && values.indexOf(value) === index;
    });
    if (suppliedBookingClaims.length > 1) {
      return {
        ok: false,
        code: "BOOKIN_ARREST_IDENTITY_CONFLICT",
        leadId: input.leadId,
        personId: input.personId,
        existing: false,
        error: "The Book-In record contains contradictory booking identifiers."
      };
    }
    input.bookingId = suppliedBookingClaims[0] || "";
    input.bookinRecordId = suppliedBookingClaims[0] || "";
    input.alienNumber = input.alienNumber || input.aNumber || "";
    input.citizenship = input.citizenship || input.countryOfCitizenship || "";
    input.disposition = input.disposition || input.caseType || "";
    input.iceEventNumber = input.iceEventNumber || input.iceEvent || "";
    input.subjectRole = input.subjectRole || input.encounterRole || "";
    input.arrestingOfficer = input.arrestingOfficer || input.officersName || "";
    input.bookInDateTime = input.bookInDateTime || input.dateTime || "";
    input.arrestTime = normalizeBookInClock(input.arrestTime);
    input.arrestDateTime =
      input.arrestDateTime ||
      combineBookInArrestDateTime(input.bookInDateTime, input.arrestTime);
    input.arrestDate =
      input.arrestDate ||
      String(input.arrestDateTime || input.bookInDateTime).slice(0, 10);
    input.sex = input.sex || input.gender || "";
    input.booking = Object.assign(
      {},
      bookInPromotionInput(record).booking,
      input.booking || {}
    );
    input.preserveMissingArrestFields =
      options.preserveMissingArrestFields === true;
    return promoteBookInToLead(input);
  }

  function promoteBookInRecords(records, options) {
    var rows = (Array.isArray(records) ? records : []).map(clone);
    var summary = {
      ok: true,
      rows: rows,
      promoted: 0,
      created: 0,
      reused: 0,
      failed: 0,
      errors: []
    };
    rows.forEach(function (row) {
      var result = promoteBookInRecord(row, options || {});
      if (!result || !result.ok) {
        summary.ok = false;
        summary.failed += 1;
        summary.errors.push({
          recordId: String((row && row.id) || ""),
          error: (result && result.error) || "Could not create the case."
        });
        delete row.__copdocImportArrestFieldPresence;
        return;
      }
      row.leadId = result.leadId || row.leadId || "";
      row.personId = result.personId || row.personId || "";
      row.subjectId = result.subjectId || row.subjectId || "";
      row.subjectRole = result.subjectRole || row.subjectRole || "";
      row.encounterRole = result.subjectRole || row.encounterRole || "";
      row.vehiclePosition =
        result.vehiclePosition || row.vehiclePosition || "";
      row.arrestId = result.arrestId || row.arrestId || "";
      delete row.__copdocImportArrestFieldPresence;
      summary.promoted += 1;
      if (result.existing) {
        summary.reused += 1;
      } else {
        summary.created += 1;
      }
    });
    return summary;
  }

  /**
   * Add event-scoped person/vehicle facts after a Book-in save.
   * All main-store mutations are persisted together and repeat saves reuse the
   * same vehicle identities and associations.
   */
  function linkEncounterVehiclesToPerson(input) {
    input = input || {};
    var encounterId = String(input.encounterId || "").trim();
    var personId = String(input.personId || "").trim();
    var leadId = String(input.leadId || "").trim();
    var fresh = adoptDisk();
    if (!fresh.ok) {
      return { ok: false, vehicleIds: [], associationIds: [], error: fresh.error };
    }
    var encounter = encounterId && state.encounters[encounterId];
    if (!encounter) {
      return {
        ok: false,
        vehicleIds: [],
        associationIds: [],
        error: "Encounter not found; its vehicles were not linked."
      };
    }
    if (!personId || !state.people[personId]) {
      return {
        ok: false,
        vehicleIds: [],
        associationIds: [],
        error: "Booked person not found; encounter vehicles were not linked."
      };
    }
    if (!leadId) {
      leadId = leadIdForPerson(personId);
    }
    if (!leadId || !state.leads[leadId]) {
      return {
        ok: false,
        vehicleIds: [],
        associationIds: [],
        error: "Filed case not found; encounter vehicles were not linked."
      };
    }

    var vehicleIds = [];
    var associationIds = [];
    var error = "";
    (encounter.vehicles || []).forEach(function (vehicle) {
      if (error || !vehicle) {
        return;
      }
      var vehicleId = vehicle.vehicleId || vehicle.id || "";
      if (!vehicleId) {
        return;
      }
      putIdentityVehicle(vehicle);
      var shared = state.vehicles[vehicleId];
      shared.locations = Array.isArray(shared.locations) ? shared.locations : [];
      (vehicle.locations || []).forEach(function (location) {
        if (!location || !location.locationId) {
          return;
        }
        putIdentityLocation(location);
        var existingLocation = shared.locations.filter(function (row) {
          return row && row.locationId === location.locationId;
        })[0];
        if (existingLocation) {
          Object.assign(existingLocation, clone(location));
        } else {
          shared.locations.push(clone(location));
        }
        var locationReason = reasonFromNestedLocationKind(location.association);
        if (locationReason === "CURRENT_RESIDENCE") {
          locationReason = "VEHICLE_PARKING";
        }
        writePairOccupancy(
          "VEHICLE",
          vehicleId,
          "LOCATION",
          location.locationId,
          location,
          locationReason
        );
      });
      var linked = upsertAssociation(
        {
          from: { type: "PERSON", id: personId },
          to: { type: "VEHICLE", id: vehicleId },
          reason: "LE_ENCOUNTER_IN_VEHICLE",
          source: {
            encounterId: encounterId,
            leadId: leadId,
            bookinRecordId: String(input.bookinRecordId || "")
          }
        },
        { skipAdopt: true, persist: false, skipLeadSync: true }
      );
      if (!linked || !linked.ok) {
        error = (linked && linked.error) || "Could not link an encounter vehicle.";
        return;
      }
      vehicleIds.push(vehicleId);
      associationIds.push(linked.associationId);
    });
    if (error) {
      adoptDisk();
      return { ok: false, vehicleIds: [], associationIds: [], error: error };
    }
    applyAssociationNestingToLead(state.leads[leadId]);
    rememberPeople(state.leads[leadId]);
    if (!writeDisk()) {
      adoptDisk();
      return {
        ok: false,
        vehicleIds: [],
        associationIds: [],
        error: "Could not write encounter vehicle links to localStorage."
      };
    }
    return {
      ok: true,
      vehicleIds: vehicleIds,
      associationIds: associationIds,
      error: ""
    };
  }

  function listLeads() {
    return Object.keys(state.leads)
      .map(function (id) {
        var snap = state.leads[id];
        var subject = model.subjectOf ? model.subjectOf(snap) : snap.person;
        var name = model.formatPersonLabel(subject) || "Untitled case";
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

  function bookInStorageKey() {
    return (root.config && root.config.storageKey("bookin")) ||
      "alien-book-in.saved-records.v1";
  }

  function loadBookInPackets() {
    if (typeof localStorage === "undefined") {
      return [];
    }
    try {
      var raw = localStorage.getItem(bookInStorageKey()) || "";
      if (!raw) {
        return [];
      }
      var parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      return [];
    }
  }

  function packetsForQuery(opts) {
    if (opts && Object.prototype.hasOwnProperty.call(opts, "packets")) {
      return Array.isArray(opts.packets) ? opts.packets : [];
    }
    return loadBookInPackets();
  }

  function packetLookup(packets) {
    var map = {};
    (packets || []).forEach(function (record) {
      if (record && record.id) {
        map[String(record.id)] = record;
      }
    });
    return map;
  }

  function listArrests(opts) {
    opts = opts || {};
    var fresh = adoptDisk();
    if (!fresh.ok) {
      return [];
    }
    var packets = packetsForQuery(opts);
    // Roster pages load arrest-report.js so collect fills name, A-number, dates.
    if (root.arrestReport && typeof root.arrestReport.collect === "function") {
      return root.arrestReport.collect(
        {
          loadFromDisk: function () {},
          listLeads: listLeads,
          getLead: getLead,
          bookInPromotionInput: bookInPromotionInput
        },
        packets,
        opts
      );
    }
    var records = packetLookup(packets);
    var rows = [];
    Object.keys(state.leads).forEach(function (id) {
      var snap = state.leads[id];
      if (!snap || (model.isCommitted && !model.isCommitted(snap))) {
        return;
      }
      if (opts.leadId && String(snap.leadId || id) !== String(opts.leadId)) {
        return;
      }
      var person = model.subjectOf ? model.subjectOf(snap) : snap.person;
      ((person && person.arrests) || []).forEach(function (arrest) {
        if (!arrest) {
          return;
        }
        var dateKey = String(arrest.arrestDate || arrest.arrestDateTime || "").slice(0, 10);
        if (opts.from && dateKey && dateKey < opts.from) {
          return;
        }
        if (opts.to && dateKey && dateKey > opts.to) {
          return;
        }
        if ((opts.from || opts.to) && !dateKey) {
          return;
        }
        var recordId = String(arrest.bookinRecordId || "");
        var input = bookInPromotionInput(records[recordId] || {});
        var encounterId = String(arrest.encounterId || input.encounterId || "");
        var encounterNumber = String(
          arrest.encounterNumber || input.encounterNumber || encounterId
        );
        if (
          opts.encounterId &&
          encounterId !== String(opts.encounterId) &&
          encounterNumber !== String(opts.encounterId)
        ) {
          return;
        }
        rows.push({
          leadId: snap.leadId || id,
          personId: (person && person.personId) || "",
          arrestId: arrest.arrestId || "",
          bookinRecordId: recordId,
          iceEvent: String(arrest.iceEventNumber || input.iceEventNumber || ""),
          arrestDate: dateKey,
          encounterId: encounterId,
          encounterNumber: encounterNumber
        });
      });
    });
    return rows;
  }

  /**
   * Other committed leads for a person: as the subject, or as a PERSON
   * endpoint on a person-to-person link. Case view uses this to jump.
   */
  function relatedCommittedCases(personId, excludeLeadId) {
    var id = String(personId || "");
    var skip = String(excludeLeadId || "");
    var asSubject = [];
    var asAssociate = [];
    if (!id) {
      return { asSubject: asSubject, asAssociate: asAssociate };
    }
    listLeads().forEach(function (row) {
      if (!row || row.leadId === skip || row.metaStatus !== "committed") {
        return;
      }
      if (row.subjectPersonId === id) {
        asSubject.push(row);
        return;
      }
      var snap = state.leads[row.leadId];
      var links = (snap && snap.links) || [];
      var i;
      for (i = 0; i < links.length; i++) {
        var link = links[i];
        if (!link) {
          continue;
        }
        var from = link.from || {};
        var to = link.to || {};
        if (
          from.type === "PERSON" &&
          to.type === "PERSON" &&
          (from.id === id || to.id === id)
        ) {
          asAssociate.push(row);
          return;
        }
      }
    });
    return { asSubject: asSubject, asAssociate: asAssociate };
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
    state.people[person.personId] = clone(
      canonicalPersonRecord(person, state.people[person.personId])
    );
    syncObjectOwnedLocations(
      "PERSON",
      person.personId,
      state.people[person.personId].locations
    );
    if (!writeDisk()) {
      adoptDisk();
      return {
        ok: false,
        error: "Could not write localStorage (quota or private mode)."
      };
    }
    return { ok: true, error: "" };
  }

  function locationPin(location) {
    if (!location) {
      return null;
    }
    var canon =
      location.locationId && state.locations[location.locationId]
        ? state.locations[location.locationId]
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
      location && location.locationId && state.locations[location.locationId]
        ? state.locations[location.locationId]
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
      generatedAt: model.nowIso ? model.nowIso() : new Date().toISOString(),
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

  function stampArrestsFromEncounter(encounter) {
    var pin = encounterPin(encounter) || (encounter.completed && encounter.completed.pin);
    if (!pin) {
      return;
    }
    var encounterSubjects = Array.isArray(encounter.subjects)
      ? encounter.subjects
      : [];
    encounterSubjects.forEach(function (subject) {
      if (!subject || !subject.leadId || !state.leads[subject.leadId]) {
        return;
      }
      var lead = state.leads[subject.leadId];
      var person = model.subjectOf ? model.subjectOf(lead) : lead.person;
      if (!person || !Array.isArray(person.arrests)) {
        return;
      }
      var changed = false;
      person.arrests.forEach(function (arr) {
        if (!arr) {
          return;
        }
        var subjectId = storeSubjectId(subject);
        var arrestSubjectId = storeSubjectId(arr);
        var bookingId = storeSubjectBookingId(subject);
        var arrestBookingId = storeSubjectBookingId(arr);
        var match = false;
        if (arrestSubjectId) {
          match = !!subjectId && subjectId === arrestSubjectId;
        } else if (arrestBookingId) {
          var bookingOwners = encounterSubjects.filter(function (candidate) {
            return storeSubjectBookingId(candidate) === arrestBookingId;
          });
          var bookingArrests = person.arrests.filter(function (candidate) {
            return (
              !storeSubjectId(candidate) &&
              storeSubjectBookingId(candidate) === arrestBookingId
            );
          });
          match =
            !!bookingId &&
            bookingId === arrestBookingId &&
            bookingOwners.length === 1 &&
            storeSubjectId(bookingOwners[0]) === subjectId &&
            bookingArrests.length === 1;
        } else if (arr.encounterId && arr.encounterId === encounter.encounterId) {
          var relatedSubjects = encounterSubjects.filter(function (candidate) {
            if (subject.personId) {
              return candidate && candidate.personId === subject.personId;
            }
            return candidate && candidate.leadId && candidate.leadId === subject.leadId;
          });
          var encounterArrests = person.arrests.filter(function (candidate) {
            return (
              candidate &&
              !storeSubjectId(candidate) &&
              !storeSubjectBookingId(candidate) &&
              candidate.encounterId === encounter.encounterId
            );
          });
          match =
            relatedSubjects.length === 1 &&
            storeSubjectId(relatedSubjects[0]) === subjectId &&
            encounterArrests.length === 1;
        }
        if (!match) {
          return;
        }
        if (!arrestSubjectId && subjectId) {
          arr.subjectId = subjectId;
        }
        if (!storeSubjectBookingId(arr) && bookingId) {
          arr.bookingId = bookingId;
          arr.bookinRecordId = bookingId;
        }
        if (!arr.latitude) {
          arr.latitude = pin.latitude;
        }
        if (!arr.longitude) {
          arr.longitude = pin.longitude;
        }
        if (!arr.arrestLocation) {
          arr.arrestLocation = pin.arrestLocation;
        }
        changed = true;
      });
      if (!changed) {
        return;
      }
      lead.person = person;
      if (person.personId && state.people[person.personId]) {
        state.people[person.personId].arrests = clone(person.arrests);
      }
    });
  }

  function completeEncounter(encounterId) {
    var fresh = adoptDisk();
    if (!fresh.ok) {
      return { ok: false, encounterId: encounterId || "", error: fresh.error };
    }
    var row = state.encounters[encounterId];
    if (!row) {
      return {
        ok: false,
        encounterId: encounterId || "",
        error: "Encounter not found."
      };
    }
    if (!String(row.startedAt || "").trim()) {
      return {
        ok: false,
        encounterId: encounterId,
        error: "Set the date and time of the stop before completing."
      };
    }
    return saveEncounter(row, { mode: "complete" });
  }

  function applyEncounterLocationToArrests(encounterId) {
    var fresh = adoptDisk();
    if (!fresh.ok) {
      return { ok: false, encounterId: encounterId || "", error: fresh.error };
    }
    var row = state.encounters[encounterId];
    if (!row) {
      return {
        ok: false,
        encounterId: encounterId || "",
        error: "Encounter not found."
      };
    }
    stampArrestsFromEncounter(row);
    if (!writeDisk()) {
      adoptDisk();
      return {
        ok: false,
        encounterId: encounterId,
        error: "Could not write localStorage (quota or private mode)."
      };
    }
    return { ok: true, encounterId: encounterId, error: "" };
  }

  function encounterWriteExpectationConflict(record, previous) {
    if (!previous || !storeSubjectOwn(record, "subjects")) {
      return false;
    }
    var incomingMeta = record.meta || {};
    var previousMeta = previous.meta || {};
    var hasIncomingRevision =
      storeSubjectOwn(incomingMeta, "encounterRevision") &&
      Number.isFinite(Number(incomingMeta.encounterRevision));
    var hasPreviousRevision =
      storeSubjectOwn(previousMeta, "encounterRevision") &&
      Number.isFinite(Number(previousMeta.encounterRevision));
    var incomingRevision = Number(incomingMeta.encounterRevision);
    var previousRevision = Number(previousMeta.encounterRevision);
    /*
     * Only the persisted Encounter revision is a safe compare-and-swap token.
     * normalizeState() supplies compatibility meta to legacy rows in memory;
     * comparing those generated timestamps makes the same untouched legacy
     * Encounter appear stale on every reload. Permit that one-time migration,
     * then require every full-roster writer to present the stored revision.
     */
    if (!hasPreviousRevision) {
      return false;
    }
    return !hasIncomingRevision || incomingRevision !== previousRevision;
  }

  function persistEncounter(record, opts, previous) {
    var mode = (opts && opts.mode) || "commit";
    if (previous && previous.meta && previous.meta.markedComplete) {
      return {
        ok: false,
        code: "ENCOUNTER_LOCKED",
        encounterId: (record && record.encounterId) || "",
        error: "This encounter is completed and locked.",
        encounter: clone(previous)
      };
    }
    if (storeSubjectOwn(record, "subjects") && !Array.isArray(record.subjects)) {
      return {
        ok: false,
        code: "ENCOUNTER_SUBJECT_ROSTER_INVALID",
        encounterId: (record && record.encounterId) || "",
        error: "Encounter subjects must be an array.",
        encounter: previous ? clone(previous) : null
      };
    }
    if (encounterWriteExpectationConflict(record, previous)) {
      return {
        ok: false,
        code: "ENCOUNTER_STALE_WRITE",
        encounterId: (record && record.encounterId) || "",
        error: "This encounter changed in another window. Reload it before saving.",
        encounter: clone(previous)
      };
    }
    var subjectsForConflict =
      record && storeSubjectOwn(record, "subjects")
        ? record.subjects
        : previous && previous.subjects;
    var subjectConflict = encounterSubjectIdentityConflict(
      previous && previous.subjects,
      subjectsForConflict,
      record && record.encounterId,
      opts
    );
    if (subjectConflict) {
      return {
        ok: false,
        code: subjectConflict.code,
        encounterId: (record && record.encounterId) || "",
        error:
          "Encounter subject identity conflicts with the existing " +
          subjectConflict.matchedBy +
          " association.",
        conflict: subjectConflict,
        encounter: previous ? clone(previous) : null
      };
    }
    var saved = mergeRecord(previous, record);
    saved.schema = record.schema || "copdocx.encounter.v1";
    saved.encounterId = record.encounterId;
    // Completion snapshots, their audit history, and unlock evidence are
    // store-owned. Caller/import payloads may not mint ownership evidence or
    // erase the last trusted lock transition.
    saved.completedHistory = Array.isArray(previous && previous.completedHistory)
      ? clone(previous.completedHistory)
      : [];
    if (previous && previous.completed) {
      saved.completed = clone(previous.completed);
    } else {
      delete saved.completed;
    }
    if (previous && previous.unlock) {
      saved.unlock = clone(previous.unlock);
    } else {
      delete saved.unlock;
    }
    if (typeof model.stampMeta === "function") {
      saved.meta = model.stampMeta(previous, mode === "complete" ? "complete" : mode);
    } else {
      saved.meta = record.meta || {};
      saved.meta.updatedAt = model.nowIso();
    }
    saved.meta = saved.meta || {};
    saved.meta.encounterRevision =
      (previous && previous.meta && Number.isFinite(Number(previous.meta.encounterRevision))
        ? Number(previous.meta.encounterRevision)
        : 0) + 1;
    if (!Array.isArray(saved.vehicles)) {
      saved.vehicles = [];
    }
    if (!Array.isArray(saved.locations)) {
      saved.locations = [];
    }
    var preserveLegacyRosterShape = !!(
      opts &&
      opts.preserveMissingSubjectRoster === true &&
      previous &&
      !Array.isArray(previous.subjects) &&
      !Array.isArray(record && record.subjects)
    );
    if (!Array.isArray(saved.subjects) && !preserveLegacyRosterShape) {
      saved.subjects = [];
    }
    if (Array.isArray(saved.subjects)) {
      saved.subjects = normalizeEncounterSubjectsForStore(saved.subjects, {
        encounterId: saved.encounterId,
        previousSubjects: (previous && previous.subjects) || [],
        mergePrevious: true
      });
    }
    var ownershipHistory = Array.isArray(
      previous && previous.subjectIdentityHistory
    )
      ? clone(previous.subjectIdentityHistory)
      : [];
    var activeSubjectIds = Object.create(null);
    (Array.isArray(saved.subjects) ? saved.subjects : []).forEach(function (row) {
      var id = storeSubjectId(row);
      if (id) {
        activeSubjectIds[id] = true;
      }
    });
    (Array.isArray(previous && previous.subjects)
      ? previous.subjects
      : []
    ).forEach(function (row) {
      var id = storeSubjectId(row);
      if (!id || activeSubjectIds[id]) {
        return;
      }
      var bookingId = storeSubjectBookingId(row);
      var alreadyRecorded = ownershipHistory.some(function (entry) {
        return (
          storeSubjectId(entry) === id &&
          storeSubjectBookingId(entry) === bookingId &&
          storeSubjectText(entry && entry.personId) ===
            storeSubjectText(row && row.personId) &&
          storeSubjectText(entry && entry.leadId) ===
            storeSubjectText(row && row.leadId)
        );
      });
      if (!alreadyRecorded) {
        var removed = {
          entityType: "ENCOUNTER_SUBJECT",
          schema: "copdocx.encounter-subject.v1",
          subjectId: id,
          encounterId: saved.encounterId,
          personId: storeSubjectText(row && row.personId),
          leadId: storeSubjectText(row && row.leadId),
          bookingId: bookingId,
          bookinRecordId: bookingId,
          legacyEncounterParticipantIds: Array.isArray(
            row && row.legacyEncounterParticipantIds
          )
            ? clone(row.legacyEncounterParticipantIds)
            : [],
          removedAt:
          typeof model.nowIso === "function"
            ? model.nowIso()
            : new Date().toISOString()
        };
        ownershipHistory.push(removed);
      }
    });
    saved.subjectIdentityHistory = normalizeEncounterSubjectsForStore(
      ownershipHistory,
      {
        encounterId: saved.encounterId,
        previousSubjects: ownershipHistory,
        mergePrevious: false
      }
    );
    var bookingIdentityHistory = Array.isArray(
      previous && previous.bookingIdentityHistory
    )
      ? clone(previous.bookingIdentityHistory)
      : [];
    if (opts && opts.bookingUnlink) {
      var retiredSubjectId = storeSubjectText(opts.bookingUnlink.subjectId);
      var retiredBookingId = storeSubjectText(opts.bookingUnlink.bookingId);
      var alreadyRetired = bookingIdentityHistory.some(function (entry) {
        return (
          storeSubjectId(entry) === retiredSubjectId &&
          storeSubjectBookingId(entry) === retiredBookingId
        );
      });
      if (retiredSubjectId && retiredBookingId && !alreadyRetired) {
        bookingIdentityHistory.push({
          subjectId: retiredSubjectId,
          encounterId: saved.encounterId,
          bookingId: retiredBookingId,
          bookinRecordId: retiredBookingId,
          bookingUnlinked: true,
          removedAt:
            typeof model.nowIso === "function"
              ? model.nowIso()
              : new Date().toISOString()
        });
      }
    }
    saved.bookingIdentityHistory = bookingIdentityHistory;
    if (!Array.isArray(saved.links)) {
      saved.links = [];
    }
    if (!Array.isArray(saved.narratives)) {
      saved.narratives = [];
    }
    var previousVehicles = (previous && previous.vehicles) || [];
    saved.vehicles = saved.vehicles.map(function (vehicle) {
      var id = vehicle && (vehicle.vehicleId || vehicle.id);
      var old = id
        ? matchingById(previousVehicles, "vehicleId", id) || state.vehicles[id]
        : null;
      return canonicalVehicleRecord(vehicle, old);
    });
    var previousLocations = (previous && previous.locations) || [];
    saved.locations = saved.locations.map(function (location) {
      var id = location && (location.locationId || location.id);
      var old = id
        ? matchingById(previousLocations, "locationId", id) || state.locations[id]
        : null;
      return canonicalLocationRecord(location, old);
    });
    saved.links = saved.links.map(function (link) {
      return typeof model.createLink === "function"
        ? model.createLink(link || {})
        : link;
    });
    if (!saved.supervisorSummary || typeof saved.supervisorSummary !== "object") {
      saved.supervisorSummary = { text: "", derivedAt: "", coverage: null };
    }
    syncEncounterObjects(saved);
    if (
      Array.isArray(saved.subjects) &&
      typeof model.sharedStopFromEncounter === "function"
    ) {
      var sharedStop = model.sharedStopFromEncounter(saved);
      saved.subjects = (saved.subjects || []).map(function (row) {
        return model.stampSharedStop
          ? model.stampSharedStop(row, sharedStop)
          : row;
      });
      saved.subjects.forEach(function (subject) {
        if (!subject || !subject.personId || !state.people[subject.personId]) {
          return;
        }
        var person = clone(state.people[subject.personId]);
        if (typeof model.upsertPersonLeEncounter === "function") {
          person = model.upsertPersonLeEncounter(person, subject, sharedStop);
        }
        state.people[person.personId] = clone(
          canonicalPersonRecord(person, state.people[person.personId])
        );
      });
    }
    if (mode === "complete") {
      if (previous && previous.completed) {
        saved.completedHistory.push({
          generatedAt: previous.completed.generatedAt || "",
          unlockedAt: (previous.unlock && previous.unlock.unlockedAt) || "",
          unlockedByAlias: (previous.unlock && previous.unlock.unlockedByAlias) || "",
          reason: (previous.unlock && previous.unlock.reason) || "",
          snapshot: clone(previous.completed)
        });
      }
      saved.completed = buildEncounterCompleted(saved);
      saved.unlock = null;
      stampArrestsFromEncounter(saved);
    }
    normalizeEncounterStateRecord(saved, saved.encounterId);
    state.encounters[saved.encounterId] = clone(saved);
    if (!writeDisk()) {
      adoptDisk();
      return {
        ok: false,
        encounterId: saved.encounterId,
        error: "Could not write localStorage (quota or private mode).",
        encounter: state.encounters[saved.encounterId]
          ? clone(state.encounters[saved.encounterId])
          : null
      };
    }
    return {
      ok: true,
      encounterId: saved.encounterId,
      error: "",
      encounter: clone(saved)
    };
  }

  function validateEncounterSubjectRoster(record, validationOpts) {
    var encounterId = storeSubjectText(record && record.encounterId);
    if (!record || !encounterId) {
      return {
        ok: false,
        code: "ENCOUNTER_SUBJECT_ID_CONFLICT",
        encounterId: "",
        error: "Encounter is missing an encounterId."
      };
    }
    if (!Array.isArray(record.subjects)) {
      return {
        ok: false,
        code: "ENCOUNTER_SUBJECT_ROSTER_INVALID",
        encounterId: encounterId,
        error: "Encounter subjects must be an array."
      };
    }
    var fresh = adoptDisk();
    if (!fresh.ok) {
      return {
        ok: false,
        encounterId: encounterId,
        error: fresh.error
      };
    }
    var previous = state.encounters[encounterId]
      ? clone(state.encounters[encounterId])
      : null;
    if (previous && previous.meta && previous.meta.markedComplete) {
      return {
        ok: false,
        code: "ENCOUNTER_LOCKED",
        encounterId: encounterId,
        error: "This encounter is completed and locked.",
        encounter: clone(previous)
      };
    }
    if (record.meta && encounterWriteExpectationConflict(record, previous)) {
      return {
        ok: false,
        code: "ENCOUNTER_STALE_WRITE",
        encounterId: encounterId,
        error: "This encounter changed in another window. Reload it before saving.",
        encounter: clone(previous)
      };
    }
    var conflict = encounterSubjectIdentityConflict(
      previous && previous.subjects,
      record.subjects,
      encounterId,
      validationOpts
    );
    if (!conflict) {
      return { ok: true, encounterId: encounterId, error: "" };
    }
    return {
      ok: false,
      code: conflict.code,
      encounterId: encounterId,
      error:
        "Encounter subject identity conflicts with the existing " +
        conflict.matchedBy +
        " association.",
      conflict: conflict
    };
  }

  function saveEncounter(record, opts) {
    var encounterId = storeSubjectText(record && record.encounterId);
    if (!record || !encounterId) {
      return {
        ok: false,
        encounterId: "",
        error: "Encounter is missing an encounterId."
      };
    }
    if (storeSubjectOwn(record, "subjects") && !Array.isArray(record.subjects)) {
      return {
        ok: false,
        code: "ENCOUNTER_SUBJECT_ROSTER_INVALID",
        encounterId: encounterId,
        error: "Encounter subjects must be an array."
      };
    }
    var incoming = clone(record);
    incoming.encounterId = encounterId;
    var fresh = adoptDisk();
    if (!fresh.ok) {
      return {
        ok: false,
        encounterId: encounterId,
        error: fresh.error
      };
    }
    var previous = state.encounters[encounterId]
      ? clone(state.encounters[encounterId])
      : null;
    return persistEncounter(incoming, opts, previous);
  }

  function unlinkEncounterSubjectBooking(encounterId, subjectId, bookingId) {
    encounterId = storeSubjectText(encounterId);
    subjectId = storeSubjectText(subjectId);
    bookingId = storeSubjectText(bookingId);
    if (!encounterId || !subjectId || !bookingId) {
      return {
        ok: false,
        code: "ENCOUNTER_SUBJECT_ID_CONFLICT",
        encounterId: encounterId,
        error: "Encounter, subject, and booking identifiers are required."
      };
    }
    var fresh = adoptDisk();
    if (!fresh.ok) {
      return { ok: false, encounterId: encounterId, error: fresh.error };
    }
    var previous = state.encounters[encounterId]
      ? clone(state.encounters[encounterId])
      : null;
    if (!previous) {
      return {
        ok: false,
        encounterId: encounterId,
        error: "Encounter not found."
      };
    }
    if (previous.meta && previous.meta.markedComplete) {
      return {
        ok: false,
        code: "ENCOUNTER_LOCKED",
        encounterId: encounterId,
        error: "This encounter is completed and locked.",
        encounter: clone(previous)
      };
    }
    var subjects = Array.isArray(previous.subjects) ? previous.subjects : [];
    var subjectMatches = subjects.filter(function (row) {
      return storeSubjectId(row) === subjectId;
    });
    var bookingOwners = subjects.filter(function (row) {
      var claims = [row && row.bookingId, row && row.bookinRecordId]
        .map(storeSubjectText)
        .filter(function (value, index, values) {
          return value && values.indexOf(value) === index;
        });
      return claims.length === 1 && claims[0] === bookingId;
    });
    if (
      subjectMatches.length !== 1 ||
      bookingOwners.length !== 1 ||
      subjectMatches[0] !== bookingOwners[0]
    ) {
      return {
        ok: false,
        code: "ENCOUNTER_SUBJECT_ID_CONFLICT",
        encounterId: encounterId,
        error:
          "The booking does not have one exact Encounter subject owner. Run Integrity before unlinking it.",
        encounter: clone(previous)
      };
    }
    var next = clone(previous);
    next.subjects = next.subjects.map(function (row) {
      if (storeSubjectId(row) !== subjectId) {
        return row;
      }
      var cleared = clone(row);
      cleared.bookingId = "";
      cleared.bookinRecordId = "";
      cleared.packetFiledAt = "";
      cleared.docsGeneratedAt = "";
      return cleared;
    });
    return persistEncounter(
      next,
      {
        mode:
          model.isCommitted && model.isCommitted(previous) ? "commit" : "draft",
        bookingUnlink: { subjectId: subjectId, bookingId: bookingId }
      },
      previous
    );
  }

  /**
   * Read, change, and write one Encounter against the latest disk snapshot.
   * The updater runs synchronously after adoptDisk, reducing stale-state
   * replacements. localStorage has no cross-context transaction, so truly
   * simultaneous writers remain last-writer-wins.
   */
  function updateEncounter(encounterId, updater, opts) {
    encounterId = storeSubjectText(encounterId);
    if (!encounterId || typeof updater !== "function") {
      return {
        ok: false,
        encounterId: encounterId || "",
        error: "Encounter update requires an encounterId and updater."
      };
    }
    var fresh = adoptDisk();
    if (!fresh.ok) {
      return {
        ok: false,
        encounterId: encounterId,
        error: fresh.error
      };
    }
    var previous = state.encounters[encounterId]
      ? clone(state.encounters[encounterId])
      : null;
    if (!previous) {
      return {
        ok: false,
        encounterId: encounterId,
        error: "Encounter not found."
      };
    }
    var next = clone(previous);
    try {
      next = updater(next, clone(previous)) || next;
    } catch (error) {
      return {
        ok: false,
        encounterId: encounterId,
        error: error && error.message ? error.message : "Encounter update failed.",
        cause: error,
        encounter: clone(previous)
      };
    }
    var nextEncounterId = storeSubjectText(next && next.encounterId);
    if (!next || nextEncounterId !== encounterId) {
      return {
        ok: false,
        encounterId: encounterId,
        error: "Encounter updater returned the wrong encounter.",
        encounter: clone(previous)
      };
    }
    next.encounterId = nextEncounterId;
    if (storeSubjectOwn(next, "subjects") && !Array.isArray(next.subjects)) {
      return {
        ok: false,
        code: "ENCOUNTER_SUBJECT_ROSTER_INVALID",
        encounterId: encounterId,
        error: "Encounter subjects must be an array.",
        encounter: clone(previous)
      };
    }
    var updateOpts = Object.assign({}, opts || {});
    if (!updateOpts.mode) {
      updateOpts.mode =
        model.isCommitted && model.isCommitted(previous) ? "commit" : "draft";
    }
    updateOpts.preserveMissingSubjectRoster =
      !Array.isArray(previous.subjects) && !Array.isArray(next.subjects);
    return persistEncounter(next, updateOpts, previous);
  }

  function getEncounter(encounterId) {
    var row = state.encounters[storeSubjectText(encounterId)];
    return row ? clone(row) : null;
  }

  function unlockEncounter(encounterId, input) {
    input = input || {};
    var id = String(encounterId || "").trim();
    var reason = String(input.reason || "").trim();
    var fresh = adoptDisk();
    if (!fresh.ok) {
      return { ok: false, encounterId: id, error: fresh.error };
    }
    if (!id || !state.encounters[id]) {
      return { ok: false, encounterId: id, error: "Encounter not found." };
    }
    if (!reason) {
      return { ok: false, encounterId: id, error: "Unlock requires a reason." };
    }
    var row = clone(state.encounters[id]);
    if (!row.meta || !row.meta.markedComplete) {
      return {
        ok: false,
        encounterId: id,
        error: "This encounter is not locked."
      };
    }
    var now = model.nowIso ? model.nowIso() : new Date().toISOString();
    row.meta = row.meta || {};
    row.meta.markedComplete = false;
    row.meta.updatedAt = now;
    row.meta.encounterRevision =
      (Number.isFinite(Number(row.meta.encounterRevision))
        ? Number(row.meta.encounterRevision)
        : 0) + 1;
    row.unlock = {
      unlockedAt: now,
      reason: reason,
      unlockedByAlias: String(input.unlockedByAlias || "")
    };
    state.encounters[id] = row;
    if (!writeDisk()) {
      adoptDisk();
      return {
        ok: false,
        encounterId: id,
        error: "Could not write localStorage (quota or private mode)."
      };
    }
    return { ok: true, encounterId: id, error: "" };
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

  function saveInvestigation(record, opts) {
    if (!record || !record.investigationId) {
      return {
        ok: false,
        investigationId: "",
        error: "Investigation is missing an investigationId."
      };
    }
    var kind = String(record.kind || "");
    if (model.isInvestigationKind && !model.isInvestigationKind(kind)) {
      return {
        ok: false,
        investigationId: record.investigationId,
        error: "Pick a source for this investigation."
      };
    }
    var fresh = adoptDisk();
    if (!fresh.ok) {
      return {
        ok: false,
        investigationId: record.investigationId,
        error: fresh.error
      };
    }
    var mode = (opts && opts.mode) || "commit";
    var previous = state.investigations[record.investigationId]
      ? clone(state.investigations[record.investigationId])
      : null;
    var saved = previous ? Object.assign({}, previous, record) : record;
    saved.schema = record.schema || model.INVESTIGATION_SCHEMA || "copdocx.investigation.v1";
    saved.investigationId = record.investigationId;
    if (typeof model.stampMeta === "function") {
      saved.meta = model.stampMeta(previous, mode);
    } else {
      saved.meta = record.meta || {};
      saved.meta.updatedAt = model.nowIso();
    }
    saved.meta.markedComplete = false;
    if (!Array.isArray(saved.plates)) {
      saved.plates = [];
    }
    if (!Array.isArray(saved.nodes)) {
      saved.nodes = [];
    }
    if (!Array.isArray(saved.links)) {
      saved.links = [];
    }
    if (!Array.isArray(saved.history)) {
      saved.history = [];
    }
    state.investigations[saved.investigationId] = clone(saved);
    if (!writeDisk()) {
      adoptDisk();
      return {
        ok: false,
        investigationId: saved.investigationId,
        error: "Could not write localStorage (quota or private mode)."
      };
    }
    return { ok: true, investigationId: saved.investigationId, error: "" };
  }

  function getInvestigation(investigationId) {
    var row = state.investigations[investigationId];
    return row ? clone(row) : null;
  }

  function deleteInvestigation(investigationId) {
    var fresh = adoptDisk();
    if (!fresh.ok) {
      return { ok: false, investigationId: investigationId || "", error: fresh.error };
    }
    if (!investigationId || !state.investigations[investigationId]) {
      return {
        ok: false,
        investigationId: investigationId || "",
        error: "Investigation not found."
      };
    }
    delete state.investigations[investigationId];
    if (!writeDisk()) {
      adoptDisk();
      return {
        ok: false,
        investigationId: investigationId,
        error: "Could not write localStorage (quota or private mode)."
      };
    }
    return { ok: true, investigationId: investigationId, error: "" };
  }

  function saveOperation(record, opts) {
    if (!record || !record.operationId) {
      return {
        ok: false,
        operationId: "",
        error: "Operation is missing an operationId."
      };
    }
    var fresh = adoptDisk();
    if (!fresh.ok) {
      return {
        ok: false,
        operationId: record.operationId,
        error: fresh.error
      };
    }
    var mode = (opts && opts.mode) || "commit";
    if (mode === "commit" && !String(record.name || "").trim()) {
      return {
        ok: false,
        operationId: record.operationId,
        error: "Name this operation."
      };
    }
    var previous = state.operations[record.operationId]
      ? clone(state.operations[record.operationId])
      : null;
    var saved = previous ? Object.assign({}, previous, record) : record;
    saved.schema = record.schema || model.OPERATION_SCHEMA || "copdocx.operation.v1";
    saved.operationId = record.operationId;
    saved.operationNumber = record.operationNumber || record.operationId;
    saved.entityType = "OPERATION";
    if (typeof model.stampMeta === "function") {
      saved.meta = model.stampMeta(previous, mode);
    } else {
      saved.meta = record.meta || {};
      saved.meta.updatedAt = model.nowIso();
    }
    saved.meta.markedComplete = false;
    saved.targets = Array.isArray(saved.targets) ? saved.targets : [];
    saved.teams = Array.isArray(saved.teams) ? saved.teams : [];
    saved.targetAssignments = Array.isArray(saved.targetAssignments)
      ? saved.targetAssignments
      : [];
    saved.opLocations = Array.isArray(saved.opLocations) ? saved.opLocations : [];
    saved.medevacRoute = Array.isArray(saved.medevacRoute) ? saved.medevacRoute : [];
    saved.history = Array.isArray(saved.history) ? saved.history : [];
    if (mode === "commit" && model.freezeOperationTarget) {
      saved.targets = (saved.targets || []).map(function (row) {
        if (!row || !row.leadId) {
          return row;
        }
        var lead = state.leads[row.leadId];
        if (!lead) {
          return row;
        }
        var next = clone(row);
        next.personId = next.personId || lead.subjectPersonId || "";
        next.freeze = model.freezeOperationTarget(lead);
        return next;
      });
    }
    if (mode === "commit" && model.generateOperationOrder) {
      saved.order = model.generateOperationOrder(saved);
    }
    state.operations[saved.operationId] = clone(saved);
    if (!writeDisk()) {
      adoptDisk();
      return {
        ok: false,
        operationId: saved.operationId,
        error: "Could not write localStorage (quota or private mode)."
      };
    }
    return { ok: true, operationId: saved.operationId, error: "" };
  }

  function getOperation(operationId) {
    var row = state.operations[operationId];
    return row ? clone(row) : null;
  }

  function deleteOperation(operationId) {
    var fresh = adoptDisk();
    if (!fresh.ok) {
      return { ok: false, operationId: operationId || "", error: fresh.error };
    }
    if (!operationId || !state.operations[operationId]) {
      return {
        ok: false,
        operationId: operationId || "",
        error: "Operation not found."
      };
    }
    delete state.operations[operationId];
    if (!writeDisk()) {
      adoptDisk();
      return {
        ok: false,
        operationId: operationId,
        error: "Could not write localStorage (quota or private mode)."
      };
    }
    return { ok: true, operationId: operationId, error: "" };
  }

  function listImportableOperationTargets() {
    adoptDisk();
    var out = [];
    Object.keys(state.leads || {}).forEach(function (id) {
      var lead = state.leads[id];
      if (!lead || (model.isCommitted && !model.isCommitted(lead))) {
        return;
      }
      if (model.leadIsImportableOperationTarget && !model.leadIsImportableOperationTarget(lead)) {
        return;
      }
      var person = model.subjectOf ? model.subjectOf(lead) : lead.person;
      var places = model.operationPlacesFromLead
        ? model.operationPlacesFromLead(lead)
        : [];
      out.push({
        leadId: id,
        personId: lead.subjectPersonId || (person && person.personId) || "",
        label:
          (model.formatPersonLabel && model.formatPersonLabel(person)) ||
          id,
        caseNumber: (lead.source && lead.source.caseNumber) || "",
        placeCount: places.length,
        vehicleCount: places.filter(function (row) {
          return row && row.vehicleId;
        }).length
      });
    });
    out.sort(function (a, b) {
      return String(a.label || "").localeCompare(String(b.label || ""));
    });
    return out;
  }

  function addOperationTargets(operationId, leadIds) {
    var blank = {
      ok: false,
      operationId: operationId || "",
      added: 0,
      error: ""
    };
    var fresh = adoptDisk();
    if (!fresh.ok) {
      blank.error = fresh.error;
      return blank;
    }
    var op = state.operations[operationId]
      ? clone(state.operations[operationId])
      : null;
    if (!op) {
      blank.error = "Operation not found.";
      return blank;
    }
    op.targets = Array.isArray(op.targets) ? op.targets : [];
    var have = {};
    op.targets.forEach(function (row) {
      if (row && row.leadId) {
        have[row.leadId] = true;
      }
    });
    var added = 0;
    (leadIds || []).forEach(function (leadId) {
      if (!leadId || have[leadId]) {
        return;
      }
      var lead = state.leads[leadId];
      if (!lead || (model.leadIsImportableOperationTarget && !model.leadIsImportableOperationTarget(lead))) {
        return;
      }
      var person = model.subjectOf ? model.subjectOf(lead) : lead.person;
      op.targets.push(
        model.createOperationTarget
          ? model.createOperationTarget({
              leadId: leadId,
              personId: lead.subjectPersonId || (person && person.personId) || ""
            })
          : {
              targetId: model.newId("tgt"),
              leadId: leadId,
              personId: lead.subjectPersonId || "",
              freeze: null
            }
      );
      have[leadId] = true;
      added += 1;
    });
    var saved = saveOperation(op, { mode: "draft" });
    if (!saved.ok) {
      blank.error = saved.error || "Could not save.";
      return blank;
    }
    return {
      ok: true,
      operationId: op.operationId,
      added: added,
      error: ""
    };
  }

  function removeOperationTarget(operationId, targetId) {
    var blank = {
      ok: false,
      operationId: operationId || "",
      removed: false,
      error: ""
    };
    var fresh = adoptDisk();
    if (!fresh.ok) {
      blank.error = fresh.error;
      return blank;
    }
    var op = state.operations[operationId]
      ? clone(state.operations[operationId])
      : null;
    if (!op) {
      blank.error = "Operation not found.";
      return blank;
    }
    var before = (op.targets || []).length;
    op.targets = (op.targets || []).filter(function (row) {
      return !row || row.targetId !== targetId;
    });
    op.targetAssignments = (op.targetAssignments || []).filter(function (row) {
      return !row || row.targetId !== targetId;
    });
    if (op.targets.length === before) {
      return {
        ok: true,
        operationId: op.operationId,
        removed: false,
        error: ""
      };
    }
    var saved = saveOperation(op, { mode: "draft" });
    if (!saved.ok) {
      blank.error = saved.error || "Could not save.";
      return blank;
    }
    return {
      ok: true,
      operationId: op.operationId,
      removed: true,
      error: ""
    };
  }

  function importOperationTeam(operationId, input) {
    input = input || {};
    var blank = {
      ok: false,
      operationId: operationId || "",
      teamId: "",
      error: ""
    };
    var ids = (input.officerIds || []).map(function (id) {
      return String(id || "").trim();
    }).filter(Boolean);
    var unique = [];
    ids.forEach(function (id) {
      if (unique.indexOf(id) === -1) {
        unique.push(id);
      }
    });
    if (unique.length < 2 || unique.length > 4) {
      blank.error = "A cell needs 2 to 4 officers.";
      return blank;
    }
    var fresh = adoptDisk();
    if (!fresh.ok) {
      blank.error = fresh.error;
      return blank;
    }
    var op = state.operations[operationId]
      ? clone(state.operations[operationId])
      : null;
    if (!op) {
      blank.error = "Operation not found.";
      return blank;
    }
    var roles = model.defaultAssignmentRoles
      ? model.defaultAssignmentRoles(unique.length)
      : ["eye", "contact", "primary-backup", "backup"];
    var members = unique.map(function (officerId, index) {
      return model.createOperationMember
        ? model.createOperationMember({
            officerId: officerId,
            assignmentRole: roles[index] || "backup"
          })
        : { officerId: officerId, assignmentRole: roles[index] || "backup" };
    });
    var team = model.createOperationTeam
      ? model.createOperationTeam({
          name: input.name || input.rosterKey || "Cell",
          rosterKey: input.rosterKey || "",
          vehicleId: input.vehicleId || "",
          members: members
        })
      : {
          teamId: model.newId("cell"),
          name: input.name || "Cell",
          rosterKey: input.rosterKey || "",
          vehicleId: input.vehicleId || "",
          members: members
        };
    op.teams = Array.isArray(op.teams) ? op.teams : [];
    op.teams.push(team);
    op.importedTeamKeys = Array.isArray(op.importedTeamKeys)
      ? op.importedTeamKeys
      : [];
    if (team.rosterKey && op.importedTeamKeys.indexOf(team.rosterKey) === -1) {
      op.importedTeamKeys.push(team.rosterKey);
    }
    var saved = saveOperation(op, { mode: "draft" });
    if (!saved.ok) {
      blank.error = saved.error || "Could not save.";
      return blank;
    }
    return {
      ok: true,
      operationId: op.operationId,
      teamId: team.teamId,
      error: ""
    };
  }

  function setOperationMemberRole(operationId, teamId, officerId, role) {
    var blank = {
      ok: false,
      operationId: operationId || "",
      error: ""
    };
    if (model.isOperationAssignmentRole && !model.isOperationAssignmentRole(role)) {
      blank.error = "Pick an assignment role.";
      return blank;
    }
    var fresh = adoptDisk();
    if (!fresh.ok) {
      blank.error = fresh.error;
      return blank;
    }
    var op = state.operations[operationId]
      ? clone(state.operations[operationId])
      : null;
    if (!op) {
      blank.error = "Operation not found.";
      return blank;
    }
    var found = false;
    (op.teams || []).forEach(function (team) {
      if (!team || team.teamId !== teamId) {
        return;
      }
      (team.members || []).forEach(function (member) {
        if (member && member.officerId === officerId) {
          member.assignmentRole = role;
          found = true;
        }
      });
    });
    if (!found) {
      blank.error = "Officer not on that cell.";
      return blank;
    }
    var saved = saveOperation(op, { mode: "draft" });
    if (!saved.ok) {
      blank.error = saved.error || "Could not save.";
      return blank;
    }
    return { ok: true, operationId: op.operationId, error: "" };
  }

  function assignOperationTargetTeam(operationId, targetId, teamId) {
    var blank = {
      ok: false,
      operationId: operationId || "",
      error: ""
    };
    var fresh = adoptDisk();
    if (!fresh.ok) {
      blank.error = fresh.error;
      return blank;
    }
    var op = state.operations[operationId]
      ? clone(state.operations[operationId])
      : null;
    if (!op) {
      blank.error = "Operation not found.";
      return blank;
    }
    var hasTarget = (op.targets || []).some(function (row) {
      return row && row.targetId === targetId;
    });
    if (!hasTarget) {
      blank.error = "Target not found.";
      return blank;
    }
    if (teamId) {
      var hasTeam = (op.teams || []).some(function (row) {
        return row && row.teamId === teamId;
      });
      if (!hasTeam) {
        blank.error = "Cell not found.";
        return blank;
      }
    }
    op.targetAssignments = Array.isArray(op.targetAssignments)
      ? op.targetAssignments
      : [];
    op.targetAssignments = op.targetAssignments.filter(function (row) {
      if (!row) {
        return false;
      }
      if (row.targetId === targetId) {
        return false;
      }
      if (teamId && row.teamId === teamId) {
        return false;
      }
      return true;
    });
    if (teamId) {
      op.targetAssignments.push({ targetId: targetId, teamId: teamId });
    }
    var saved = saveOperation(op, { mode: "draft" });
    if (!saved.ok) {
      blank.error = saved.error || "Could not save.";
      return blank;
    }
    return { ok: true, operationId: op.operationId, error: "" };
  }

  function removeOperationTeam(operationId, teamId) {
    var blank = {
      ok: false,
      operationId: operationId || "",
      removed: false,
      error: ""
    };
    var fresh = adoptDisk();
    if (!fresh.ok) {
      blank.error = fresh.error;
      return blank;
    }
    var op = state.operations[operationId]
      ? clone(state.operations[operationId])
      : null;
    if (!op) {
      blank.error = "Operation not found.";
      return blank;
    }
    var before = (op.teams || []).length;
    op.teams = (op.teams || []).filter(function (row) {
      return !row || row.teamId !== teamId;
    });
    op.targetAssignments = (op.targetAssignments || []).filter(function (row) {
      return !row || row.teamId !== teamId;
    });
    if (op.teams.length === before) {
      return {
        ok: true,
        operationId: op.operationId,
        removed: false,
        error: ""
      };
    }
    var saved = saveOperation(op, { mode: "draft" });
    if (!saved.ok) {
      blank.error = saved.error || "Could not save.";
      return blank;
    }
    return {
      ok: true,
      operationId: op.operationId,
      removed: true,
      error: ""
    };
  }

  function setOperationTeamVehicle(operationId, teamId, vehicleId) {
    var blank = { ok: false, operationId: operationId || "", error: "" };
    var fresh = adoptDisk();
    if (!fresh.ok) {
      blank.error = fresh.error;
      return blank;
    }
    var op = state.operations[operationId]
      ? clone(state.operations[operationId])
      : null;
    if (!op) {
      blank.error = "Operation not found.";
      return blank;
    }
    var found = false;
    (op.teams || []).forEach(function (team) {
      if (team && team.teamId === teamId) {
        team.vehicleId = vehicleId || "";
        found = true;
      }
    });
    if (!found) {
      blank.error = "Cell not found.";
      return blank;
    }
    var saved = saveOperation(op, { mode: "draft" });
    if (!saved.ok) {
      blank.error = saved.error || "Could not save.";
      return blank;
    }
    return { ok: true, operationId: op.operationId, error: "" };
  }

  function findOperationMember(op, teamId, officerId) {
    var found = null;
    ((op && op.teams) || []).forEach(function (team) {
      if (!team || team.teamId !== teamId) {
        return;
      }
      (team.members || []).forEach(function (member) {
        if (member && member.officerId === officerId) {
          found = member;
        }
      });
    });
    return found;
  }

  function setOperationMemberStart(operationId, teamId, officerId, coords) {
    var blank = { ok: false, operationId: operationId || "", error: "" };
    var fresh = adoptDisk();
    if (!fresh.ok) {
      blank.error = fresh.error;
      return blank;
    }
    var op = state.operations[operationId]
      ? clone(state.operations[operationId])
      : null;
    if (!op) {
      blank.error = "Operation not found.";
      return blank;
    }
    var member = findOperationMember(op, teamId, officerId);
    if (!member) {
      blank.error = "Officer not on that cell.";
      return blank;
    }
    var lat = coords && coords.latitude;
    var lng = coords && coords.longitude;
    if (lat === "" || lng === "" || lat == null || lng == null) {
      blank.error = "Click the map to set a start.";
      return blank;
    }
    member.start = { latitude: String(lat), longitude: String(lng) };
    var saved = saveOperation(op, { mode: "draft" });
    if (!saved.ok) {
      blank.error = saved.error || "Could not save.";
      return blank;
    }
    return { ok: true, operationId: op.operationId, error: "" };
  }

  function setOperationMemberHeading(operationId, teamId, officerId, heading) {
    var blank = { ok: false, operationId: operationId || "", error: "" };
    var value = String(heading === 0 ? "0" : heading || "").trim();
    if (value) {
      var num = Number(value);
      if (!isFinite(num) || num < 0 || num > 359) {
        blank.error = "Heading is 0 to 359.";
        return blank;
      }
      value = String(Math.round(num));
    }
    var fresh = adoptDisk();
    if (!fresh.ok) {
      blank.error = fresh.error;
      return blank;
    }
    var op = state.operations[operationId]
      ? clone(state.operations[operationId])
      : null;
    if (!op) {
      blank.error = "Operation not found.";
      return blank;
    }
    var member = findOperationMember(op, teamId, officerId);
    if (!member) {
      blank.error = "Officer not on that cell.";
      return blank;
    }
    member.heading = value;
    var saved = saveOperation(op, { mode: "draft" });
    if (!saved.ok) {
      blank.error = saved.error || "Could not save.";
      return blank;
    }
    return { ok: true, operationId: op.operationId, error: "" };
  }

  function setOperationMemberField(operationId, teamId, officerId, field, value) {
    var blank = { ok: false, operationId: operationId || "", error: "" };
    if (field !== "sector" && field !== "scans") {
      blank.error = "Unknown field.";
      return blank;
    }
    var fresh = adoptDisk();
    if (!fresh.ok) {
      blank.error = fresh.error;
      return blank;
    }
    var op = state.operations[operationId]
      ? clone(state.operations[operationId])
      : null;
    if (!op) {
      blank.error = "Operation not found.";
      return blank;
    }
    var member = findOperationMember(op, teamId, officerId);
    if (!member) {
      blank.error = "Officer not on that cell.";
      return blank;
    }
    member[field] = String(value || "").trim();
    var saved = saveOperation(op, { mode: "draft" });
    if (!saved.ok) {
      blank.error = saved.error || "Could not save.";
      return blank;
    }
    return { ok: true, operationId: op.operationId, error: "" };
  }

  function addOperationLocation(operationId, input) {
    input = input || {};
    var blank = { ok: false, operationId: operationId || "", locationId: "", error: "" };
    var kind = String(input.opAssociation || "").toLowerCase();
    if ((model.OPERATION_LOCATION_KINDS || []).indexOf(kind) === -1) {
      blank.error = "Pick rally, cleanup, medevac, hospital, or landmark.";
      return blank;
    }
    var fresh = adoptDisk();
    if (!fresh.ok) {
      blank.error = fresh.error;
      return blank;
    }
    var op = state.operations[operationId]
      ? clone(state.operations[operationId])
      : null;
    if (!op) {
      blank.error = "Operation not found.";
      return blank;
    }
    var loc = model.createLocation
      ? model.createLocation({
          latitude: input.latitude || "",
          longitude: input.longitude || "",
          notes: input.label || input.notes || "",
          opAssociation: kind,
          association: kind
        })
      : {
          locationId: model.newId("loc"),
          latitude: input.latitude || "",
          longitude: input.longitude || "",
          opAssociation: kind,
          association: kind
        };
    op.opLocations = Array.isArray(op.opLocations) ? op.opLocations : [];
    op.opLocations.push(loc);
    var saved = saveOperation(op, { mode: "draft" });
    if (!saved.ok) {
      blank.error = saved.error || "Could not save.";
      return blank;
    }
    return {
      ok: true,
      operationId: op.operationId,
      locationId: loc.locationId,
      error: ""
    };
  }

  function removeOperationLocation(operationId, locationId) {
    var blank = { ok: false, operationId: operationId || "", removed: false, error: "" };
    var fresh = adoptDisk();
    if (!fresh.ok) {
      blank.error = fresh.error;
      return blank;
    }
    var op = state.operations[operationId]
      ? clone(state.operations[operationId])
      : null;
    if (!op) {
      blank.error = "Operation not found.";
      return blank;
    }
    var before = (op.opLocations || []).length;
    op.opLocations = (op.opLocations || []).filter(function (row) {
      return !row || row.locationId !== locationId;
    });
    if (op.opLocations.length === before) {
      return { ok: true, operationId: op.operationId, removed: false, error: "" };
    }
    var saved = saveOperation(op, { mode: "draft" });
    if (!saved.ok) {
      blank.error = saved.error || "Could not save.";
      return blank;
    }
    return { ok: true, operationId: op.operationId, removed: true, error: "" };
  }

  function addMedevacRoutePoint(operationId, latitude, longitude) {
    var blank = { ok: false, operationId: operationId || "", error: "" };
    var fresh = adoptDisk();
    if (!fresh.ok) {
      blank.error = fresh.error;
      return blank;
    }
    var op = state.operations[operationId]
      ? clone(state.operations[operationId])
      : null;
    if (!op) {
      blank.error = "Operation not found.";
      return blank;
    }
    op.medevacRoute = Array.isArray(op.medevacRoute) ? op.medevacRoute : [];
    op.medevacRoute.push({
      latitude: String(latitude || ""),
      longitude: String(longitude || "")
    });
    var saved = saveOperation(op, { mode: "draft" });
    if (!saved.ok) {
      blank.error = saved.error || "Could not save.";
      return blank;
    }
    return { ok: true, operationId: op.operationId, error: "" };
  }

  function listOperations() {
    return Object.keys(state.operations)
      .map(function (id) {
        var row = state.operations[id];
        return {
          operationId: id,
          operationNumber: (row && row.operationNumber) || id,
          name: (row && row.name) || "",
          team: (row && row.team) || "",
          plannedStart: (row && row.plannedStart) || "",
          plannedEnd: (row && row.plannedEnd) || "",
          targetCount: row && Array.isArray(row.targets) ? row.targets.length : 0,
          teamCount: row && Array.isArray(row.teams) ? row.teams.length : 0,
          updatedAt: (row && row.meta && row.meta.updatedAt) || "",
          metaStatus: model.metaStatus ? model.metaStatus(row) : "committed"
        };
      })
      .sort(function (a, b) {
        return String(b.updatedAt).localeCompare(String(a.updatedAt));
      });
  }

  function listInvestigations() {
    return Object.keys(state.investigations)
      .map(function (id) {
        var row = state.investigations[id];
        return {
          investigationId: id,
          kind: row.kind || "",
          title: row.title || "",
          parentInvestigationId: row.parentInvestigationId || "",
          updatedAt: (row.meta && row.meta.updatedAt) || "",
          metaStatus: model.metaStatus ? model.metaStatus(row) : "committed"
        };
      })
      .sort(function (a, b) {
        return String(b.updatedAt).localeCompare(String(a.updatedAt));
      });
  }

  function normalizePlateKey(state, plate) {
    var st = String(state || "").toUpperCase();
    var pl = String(plate || "")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");
    if (root.plates && typeof root.plates.plateKey === "function") {
      return root.plates.plateKey(st, pl);
    }
    return st + "|" + pl;
  }

  function saveVehicleRecord(record, opts) {
    if (!record) {
      return { ok: false, vehicleId: "", error: "Vehicle is missing." };
    }
    var id = record.vehicleId || record.id || "";
    if (!id) {
      return { ok: false, vehicleId: "", error: "Vehicle is missing a vehicleId." };
    }
    var fresh = adoptDisk();
    if (!fresh.ok) {
      return { ok: false, vehicleId: id, error: fresh.error };
    }
    var mode = (opts && opts.mode) || "commit";
    var previous = state.vehicles[id] ? clone(state.vehicles[id]) : null;
    var merged = mergeRecord(previous, record);
    var saved = typeof model.createVehicle === "function"
      ? model.createVehicle(merged)
      : merged;
    saved.vehicleId = id;
    saved.id = id;
    saved.entityType = "VEHICLE";
    saved.governmentVehicle = false;
    if (typeof model.stampMeta === "function") {
      saved.meta = model.stampMeta(previous, mode);
    } else {
      saved.meta = record.meta || {};
      saved.meta.updatedAt = model.nowIso();
    }
    saved.meta.markedComplete = false;
    state.vehicles[id] = clone(saved);
    syncObjectOwnedLocations("VEHICLE", id, saved.locations);
    if (!writeDisk()) {
      adoptDisk();
      return {
        ok: false,
        vehicleId: id,
        error: "Could not write localStorage (quota or private mode)."
      };
    }
    return { ok: true, vehicleId: id, error: "" };
  }

  function getVehicleRecord(vehicleId) {
    var row = state.vehicles[vehicleId];
    return row ? clone(row) : null;
  }

  function isJunked(record) {
    return !!(record && record.junked);
  }

  function restoreJunkedRecord(objectType, record) {
    if (!record || !isJunked(record)) {
      return record || null;
    }
    record.junked = false;
    record.junkedAt = "";
    var type = String(objectType || "").toUpperCase();
    var restoredId =
      record.personId ||
      record.vehicleId ||
      record.locationId ||
      record.businessId ||
      record.entityId ||
      record.id;
    if (restoredId) {
      setAssociationsJunkedForObject(type, restoredId, false);
    }
    if (type === "PERSON") {
      upsertPerson(record);
      record = getPerson(record.personId);
    } else if (type === "VEHICLE") {
      saveVehicleRecord(record, { mode: "commit" });
      record = getVehicleRecord(record.vehicleId || record.id);
    } else if (type === "LOCATION") {
      saveLocationRecord(record, { mode: "commit" });
      record = getLocationRecord(record.locationId || record.id);
    } else if (type === "BUSINESS") {
      saveBusinessRecord(record, { mode: "commit" });
      record = getBusinessRecord(record.businessId || record.id);
    } else if (type === "ENTITY") {
      saveEntityRecord(record, { mode: "commit" });
      record = getEntityRecord(record.entityId || record.id);
    }
    return record;
  }

  function findVehicleByPlate(stateCode, plate, exceptId, includeJunked) {
    var want = normalizePlateKey(stateCode, plate);
    if (want === "|") {
      return null;
    }
    var ids = Object.keys(state.vehicles);
    var i;
    for (i = 0; i < ids.length; i++) {
      if (exceptId && ids[i] === exceptId) {
        continue;
      }
      var row = state.vehicles[ids[i]];
      if (!row) {
        continue;
      }
      if (!includeJunked && isJunked(row)) {
        continue;
      }
      var key = normalizePlateKey(
        row.plateState || "",
        row.licensePlate || row.plate || ""
      );
      if (key === want) {
        return clone(row);
      }
    }
    return null;
  }

  function normalizeNameKey(name) {
    var last = String((name && name.lastName) || "")
      .trim()
      .toUpperCase();
    var first = String((name && name.firstName) || "")
      .trim()
      .toUpperCase();
    if (!last && !first) {
      return "";
    }
    return last + "|" + first;
  }

  function findPersonByName(nameOrLabel, exceptId, includeJunked) {
    var label = "";
    var name = null;
    if (typeof nameOrLabel === "string") {
      label = String(nameOrLabel || "").trim();
      name = nameFromLabel(label);
    } else {
      name = nameOrLabel || {};
      label =
        (model.formatPersonLabel &&
          model.formatPersonLabel({ name: name })) ||
        "";
    }
    var want = normalizeNameKey(name);
    var labelWant = label.toUpperCase();
    if (!want && !labelWant) {
      return null;
    }
    var ids = Object.keys(state.people);
    var i;
    for (i = 0; i < ids.length; i++) {
      if (exceptId && ids[i] === exceptId) {
        continue;
      }
      var row = state.people[ids[i]];
      if (!row) {
        continue;
      }
      if (!includeJunked && isJunked(row)) {
        continue;
      }
      if (want && normalizeNameKey(row.name) === want) {
        return clone(row);
      }
      if (
        labelWant &&
        model.formatPersonLabel &&
        String(model.formatPersonLabel(row) || "").toUpperCase() === labelWant
      ) {
        return clone(row);
      }
    }
    return null;
  }

  function normalizeLocationKey(loc) {
    var street = String((loc && loc.street) || "")
      .trim()
      .toUpperCase()
      .replace(/\s+/g, " ");
    var city = String((loc && loc.city) || "")
      .trim()
      .toUpperCase()
      .replace(/\s+/g, " ");
    var st = String((loc && loc.state) || "")
      .trim()
      .toUpperCase();
    var zip = String((loc && loc.zip) || "")
      .trim()
      .toUpperCase();
    if (!street && !city) {
      return "";
    }
    return [street, city, st, zip].join("|");
  }

  function saveLocationRecord(record, opts) {
    if (!record) {
      return { ok: false, locationId: "", error: "Location is missing." };
    }
    var id = record.locationId || record.id || "";
    if (!id) {
      return { ok: false, locationId: "", error: "Location is missing a locationId." };
    }
    var fresh = adoptDisk();
    if (!fresh.ok) {
      return { ok: false, locationId: id, error: fresh.error };
    }
    var mode = (opts && opts.mode) || "commit";
    var previous = state.locations[id] ? clone(state.locations[id]) : null;
    var merged = mergeRecord(previous, record);
    var saved = typeof model.createLocation === "function"
      ? model.createLocation(merged)
      : merged;
    saved.locationId = id;
    saved.id = id;
    saved.entityType = "LOCATION";
    if (typeof model.stampMeta === "function") {
      saved.meta = model.stampMeta(previous, mode);
    } else {
      saved.meta = record.meta || {};
      saved.meta.updatedAt = model.nowIso();
    }
    saved.meta.markedComplete = false;
    state.locations[id] = clone(saved);
    if (!writeDisk()) {
      adoptDisk();
      return {
        ok: false,
        locationId: id,
        error: "Could not write localStorage (quota or private mode)."
      };
    }
    return { ok: true, locationId: id, error: "" };
  }

  function getLocationRecord(locationId) {
    var row = state.locations[locationId];
    return row ? clone(row) : null;
  }

  function findLocationByAddress(loc, exceptId, includeJunked) {
    var want = normalizeLocationKey(loc);
    if (!want) {
      return null;
    }
    var ids = Object.keys(state.locations);
    var i;
    for (i = 0; i < ids.length; i++) {
      if (exceptId && ids[i] === exceptId) {
        continue;
      }
      var row = state.locations[ids[i]];
      if (!row || (!includeJunked && isJunked(row))) {
        continue;
      }
      if (normalizeLocationKey(row) === want) {
        return clone(row);
      }
    }
    return null;
  }

  function normalizeOrgName(value) {
    return String(value || "")
      .trim()
      .toUpperCase()
      .replace(/\s+/g, " ");
  }

  function saveBusinessRecord(record, opts) {
    if (!record) {
      return { ok: false, businessId: "", error: "Business is missing." };
    }
    var id = record.businessId || record.id || "";
    if (!id) {
      return { ok: false, businessId: "", error: "Business is missing a businessId." };
    }
    var fresh = adoptDisk();
    if (!fresh.ok) {
      return { ok: false, businessId: id, error: fresh.error };
    }
    var mode = (opts && opts.mode) || "commit";
    var previous = state.businesses[id] ? clone(state.businesses[id]) : null;
    var merged = mergeRecord(previous, record);
    var saved = typeof model.createBusiness === "function"
      ? model.createBusiness(merged)
      : merged;
    saved.businessId = id;
    saved.id = id;
    saved.entityType = "BUSINESS";
    if (typeof model.stampMeta === "function") {
      saved.meta = model.stampMeta(previous, mode);
    } else {
      saved.meta = record.meta || {};
      saved.meta.updatedAt = model.nowIso();
    }
    saved.meta.markedComplete = false;
    state.businesses[id] = clone(saved);
    if (!writeDisk()) {
      adoptDisk();
      return {
        ok: false,
        businessId: id,
        error: "Could not write localStorage (quota or private mode)."
      };
    }
    return { ok: true, businessId: id, error: "" };
  }

  function getBusinessRecord(businessId) {
    var row = state.businesses[businessId];
    return row ? clone(row) : null;
  }

  function findBusinessByName(name, exceptId, includeJunked) {
    var want = normalizeOrgName(name);
    if (!want) {
      return null;
    }
    var ids = Object.keys(state.businesses);
    var i;
    for (i = 0; i < ids.length; i++) {
      if (exceptId && ids[i] === exceptId) {
        continue;
      }
      var row = state.businesses[ids[i]];
      if (!row || (!includeJunked && isJunked(row))) {
        continue;
      }
      if (normalizeOrgName(row.name) === want) {
        return clone(row);
      }
    }
    return null;
  }

  function saveEntityRecord(record, opts) {
    if (!record) {
      return { ok: false, entityId: "", error: "Entity is missing." };
    }
    var id = record.entityId || record.id || "";
    if (!id) {
      return { ok: false, entityId: "", error: "Entity is missing an entityId." };
    }
    var fresh = adoptDisk();
    if (!fresh.ok) {
      return { ok: false, entityId: id, error: fresh.error };
    }
    var mode = (opts && opts.mode) || "commit";
    var previous = state.entities[id] ? clone(state.entities[id]) : null;
    var merged = mergeRecord(previous, record);
    var saved = typeof model.createCustomEntity === "function"
      ? model.createCustomEntity(merged)
      : merged;
    saved.entityId = id;
    saved.id = id;
    saved.entityType = "ENTITY";
    if (typeof model.stampMeta === "function") {
      saved.meta = model.stampMeta(previous, mode);
    } else {
      saved.meta = record.meta || {};
      saved.meta.updatedAt = model.nowIso();
    }
    saved.meta.markedComplete = false;
    state.entities[id] = clone(saved);
    if (!writeDisk()) {
      adoptDisk();
      return {
        ok: false,
        entityId: id,
        error: "Could not write localStorage (quota or private mode)."
      };
    }
    return { ok: true, entityId: id, error: "" };
  }

  function getEntityRecord(entityId) {
    var row = state.entities[entityId];
    return row ? clone(row) : null;
  }

  function canonicalObjectType(objectType) {
    var type = String(objectType || "").trim().toUpperCase();
    return type === "PERSON" ||
      type === "VEHICLE" ||
      type === "LOCATION" ||
      type === "BUSINESS" ||
      type === "ENTITY"
      ? type
      : "";
  }

  function objectRecordId(objectType, record) {
    var type = canonicalObjectType(objectType);
    record = record || {};
    if (type === "PERSON") {
      return record.personId || record.id || "";
    }
    if (type === "VEHICLE") {
      return record.vehicleId || record.id || "";
    }
    if (type === "LOCATION") {
      return record.locationId || record.id || "";
    }
    if (type === "BUSINESS") {
      return record.businessId || record.id || "";
    }
    if (type === "ENTITY") {
      return record.entityId || record.id || "";
    }
    return "";
  }

  /**
   * The one context-free constructor gateway for case, Book-In, encounter,
   * and investigation object editors.
   */
  function createObjectRecord(objectType, extra) {
    var type = canonicalObjectType(objectType);
    extra = extra || {};
    if (type === "PERSON" && typeof model.createPerson === "function") {
      return model.createPerson(extra);
    }
    if (type === "VEHICLE" && typeof model.createVehicle === "function") {
      return model.createVehicle(extra);
    }
    if (type === "LOCATION" && typeof model.createLocation === "function") {
      return model.createLocation(extra);
    }
    if (type === "BUSINESS" && typeof model.createBusiness === "function") {
      return model.createBusiness(extra);
    }
    if (type === "ENTITY" && typeof model.createCustomEntity === "function") {
      return model.createCustomEntity(extra);
    }
    return null;
  }

  function getObjectRecord(objectType, objectId) {
    var type = canonicalObjectType(objectType);
    if (type === "PERSON") {
      return getPerson(objectId);
    }
    if (type === "VEHICLE") {
      return getVehicleRecord(objectId);
    }
    if (type === "LOCATION") {
      return getLocationRecord(objectId);
    }
    if (type === "BUSINESS") {
      return getBusinessRecord(objectId);
    }
    if (type === "ENTITY") {
      return getEntityRecord(objectId);
    }
    return null;
  }

  /**
   * Persist any canonical object through its normal constructor and store.
   * Callers never need to know which backing map owns the object.
   */
  function saveObjectRecord(objectType, record, opts) {
    var type = canonicalObjectType(objectType);
    var blank = {
      ok: false,
      objectType: type,
      objectId: "",
      record: null,
      error: ""
    };
    if (!type) {
      blank.error = "Pick a person, vehicle, location, business, or entity.";
      return blank;
    }
    var fresh = adoptDisk();
    if (!fresh.ok) {
      blank.error = fresh.error;
      return blank;
    }
    var input = record || {};
    var requestedId = objectRecordId(type, input);
    var previous = requestedId ? getObjectRecord(type, requestedId) : null;
    var candidate = createObjectRecord(type, mergeRecord(previous, input));
    if (!candidate) {
      blank.error = "The object constructor is not available.";
      return blank;
    }
    var result;
    if (type === "PERSON") {
      result = upsertPerson(candidate);
    } else if (type === "VEHICLE") {
      result = saveVehicleRecord(candidate, opts);
    } else if (type === "LOCATION") {
      result = saveLocationRecord(candidate, opts);
    } else if (type === "BUSINESS") {
      result = saveBusinessRecord(candidate, opts);
    } else {
      result = saveEntityRecord(candidate, opts);
    }
    if (!result || !result.ok) {
      blank.error = (result && result.error) || "Could not save that object.";
      return blank;
    }
    var id = objectRecordId(type, candidate);
    return {
      ok: true,
      objectType: type,
      objectId: id,
      record: getObjectRecord(type, id),
      error: ""
    };
  }

  function findEntityByName(name, exceptId, includeJunked) {
    var want = normalizeOrgName(name);
    if (!want) {
      return null;
    }
    var ids = Object.keys(state.entities);
    var i;
    for (i = 0; i < ids.length; i++) {
      if (exceptId && ids[i] === exceptId) {
        continue;
      }
      var row = state.entities[ids[i]];
      if (!row || (!includeJunked && isJunked(row))) {
        continue;
      }
      if (normalizeOrgName(row.name) === want) {
        return clone(row);
      }
    }
    return null;
  }

  function ensureInvestigationNode(inv, objectType, objectId, pos) {
    inv.nodes = Array.isArray(inv.nodes) ? inv.nodes : [];
    var i;
    for (i = 0; i < inv.nodes.length; i++) {
      if (
        inv.nodes[i] &&
        inv.nodes[i].objectType === objectType &&
        inv.nodes[i].objectId === objectId
      ) {
        if (pos && typeof pos.x === "number") {
          inv.nodes[i].x = pos.x;
        }
        if (pos && typeof pos.y === "number") {
          inv.nodes[i].y = pos.y;
        }
        return inv.nodes[i];
      }
    }
    var node = model.createInvestigationNode
      ? model.createInvestigationNode({
          objectType: objectType,
          objectId: objectId,
          x: pos && typeof pos.x === "number" ? pos.x : 48,
          y: pos && typeof pos.y === "number" ? pos.y : 48
        })
      : {
          nodeId: model.newId("node"),
          objectType: objectType,
          objectId: objectId,
          x: pos && typeof pos.x === "number" ? pos.x : 48,
          y: pos && typeof pos.y === "number" ? pos.y : 48
        };
    inv.nodes.push(node);
    return node;
  }

  function defaultInvestigationReason(fromType, toType) {
    var a = String(fromType || "").toUpperCase();
    var b = String(toType || "").toUpperCase();
    if (
      (a === "PERSON" && b === "VEHICLE") ||
      (a === "VEHICLE" && b === "PERSON")
    ) {
      return "REGISTERED_OWNER_OF";
    }
    if (
      (a === "PERSON" && b === "LOCATION") ||
      (a === "LOCATION" && b === "PERSON")
    ) {
      return "CURRENT_RESIDENCE";
    }
    if (
      (a === "VEHICLE" && b === "LOCATION") ||
      (a === "LOCATION" && b === "VEHICLE")
    ) {
      return "VEHICLE_PARKING";
    }
    if (a === "PERSON" && b === "PERSON") {
      return "ASSOCIATE_OF";
    }
    if (
      (a === "PERSON" && b === "BUSINESS") ||
      (a === "BUSINESS" && b === "PERSON")
    ) {
      return "EMPLOYED_BY";
    }
    if (
      (a === "BUSINESS" && b === "LOCATION") ||
      (a === "LOCATION" && b === "BUSINESS")
    ) {
      return "OPERATES_AT";
    }
    if (
      (a === "BUSINESS" && b === "VEHICLE") ||
      (a === "VEHICLE" && b === "BUSINESS")
    ) {
      return "FLEET_OF";
    }
    if (
      (a === "PERSON" && b === "ENTITY") ||
      (a === "ENTITY" && b === "PERSON")
    ) {
      return "MEMBER_OF";
    }
    if (
      (a === "ENTITY" && b === "LOCATION") ||
      (a === "LOCATION" && b === "ENTITY")
    ) {
      return "BASED_AT";
    }
    if (
      (a === "ENTITY" && b === "VEHICLE") ||
      (a === "VEHICLE" && b === "ENTITY")
    ) {
      return "USES_VEHICLE";
    }
    if (
      (a === "BUSINESS" && b === "ENTITY") ||
      (a === "ENTITY" && b === "BUSINESS")
    ) {
      return "AFFILIATED_WITH";
    }
    return "";
  }

  function canonicalLinkEnds(fromType, fromId, toType, toId, reason) {
    if (model.canonicalAssociationEnds) {
      return model.canonicalAssociationEnds(fromType, fromId, toType, toId, reason);
    }
    return {
      fromType: fromType,
      fromId: fromId,
      toType: toType,
      toId: toId,
      reason: reason || ""
    };
  }

  function investigationReasonPhrase(code) {
    var map = {
      REGISTERED_OWNER_OF: "registered owner",
      KNOWN_OPERATOR_OF: "known operator",
      CURRENT_RESIDENCE: "current residence",
      KNOWN_RESIDENCE: "known residence",
      LAST_KNOWN_ADDRESS: "last known address",
      EMPLOYMENT_ADDRESS: "employment address",
      BUSINESS_ADDRESS: "business address",
      FREQUENTED_LOCATION: "frequented location",
      REGISTERED_ADDRESS: "registered address",
      VEHICLE_PARKING: "parking",
      STORED_AT: "stored at",
      ASSOCIATE_OF: "associate",
      COHABITANT_OF: "cohabitant",
      SPOUSE_OF: "spouse",
      PARENT_OF: "parent",
      SIBLING_OF: "sibling",
      EMPLOYED_BY: "employed by",
      PRINCIPAL_OF: "principal of",
      CUSTOMER_OF: "customer of",
      OPERATES_AT: "operates at",
      FLEET_OF: "fleet of",
      MEMBER_OF: "member of",
      BASED_AT: "based at",
      USES_VEHICLE: "uses vehicle",
      AFFILIATED_WITH: "affiliated with"
    };
    return map[code] || "linked";
  }

  function investigationObjectLabel(objectType, objectId) {
    if (objectType === "PERSON") {
      var person = getPerson(objectId);
      return (
        (person && model.formatPersonLabel && model.formatPersonLabel(person)) ||
        objectId
      );
    }
    if (objectType === "VEHICLE") {
      var vehicle = getVehicleRecord(objectId);
      if (!vehicle) {
        return objectId;
      }
      return (
        [vehicle.plateState, vehicle.licensePlate || vehicle.plate]
          .filter(Boolean)
          .join(" ") || objectId
      );
    }
    if (objectType === "LOCATION") {
      var loc = getLocationRecord(objectId);
      if (!loc) {
        return objectId;
      }
      return (
        [loc.street, loc.city, loc.state].filter(Boolean).join(", ") || objectId
      );
    }
    if (objectType === "BUSINESS") {
      var biz = getBusinessRecord(objectId);
      return (
        (biz && model.formatBusinessLabel && model.formatBusinessLabel(biz)) ||
        (biz && biz.name) ||
        objectId
      );
    }
    if (objectType === "ENTITY") {
      var ent = getEntityRecord(objectId);
      return (
        (ent && model.formatEntityLabel && model.formatEntityLabel(ent)) ||
        (ent && ent.name) ||
        objectId
      );
    }
    return objectId;
  }

  function resolveObjectRecord(objectType, input) {
    input = input || {};
    var reused = false;
    var record = null;
    if (objectType === "PERSON") {
      if (input.objectId) {
        record = getPerson(input.objectId);
        reused = !!record;
      }
      var name = input.name;
      if (typeof name === "string") {
        name = nameFromLabel(name);
      }
      if (!name || (!name.lastName && !name.firstName)) {
        name = nameFromLabel(input.label || "");
      }
      if (!record && name && (name.lastName || name.firstName)) {
        record = findPersonByName(name);
        reused = !!record;
        if (!record) {
          record = restoreJunkedRecord("PERSON", findPersonByName(name, "", true));
          reused = !!record;
        }
      }
      if (!record) {
        if (!name) {
          name = { lastName: "", firstName: "", middleName: "" };
        }
        record = model.createPerson
          ? model.createPerson({ name: name, caseRole: "" })
          : {
              personId: model.newId("p"),
              entityType: "PERSON",
              name: name,
              caseRole: ""
            };
        var savedPerson = saveObjectRecord("PERSON", record, { mode: "commit" });
        if (!savedPerson.ok) {
          return {
            ok: false,
            record: null,
            objectId: "",
            reused: false,
            error: savedPerson.error || "Could not save the person."
          };
        }
        record = savedPerson.record || record;
        reused = false;
      }
      return {
        ok: true,
        record: record,
        objectId: record.personId,
        reused: reused,
        error: ""
      };
    }
    if (objectType === "VEHICLE") {
      var plate = String(input.licensePlate || input.plate || "")
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "");
      var plateState = String(input.plateState || input.state || "").toUpperCase();
      if (input.objectId) {
        record = getVehicleRecord(input.objectId);
        reused = !!record;
      }
      if (!record && plate) {
        record = findVehicleByPlate(plateState, plate);
        reused = !!record;
        if (!record) {
          record = restoreJunkedRecord(
            "VEHICLE",
            findVehicleByPlate(plateState, plate, "", true)
          );
          reused = !!record;
        }
      }
      if (!record) {
        record = model.createVehicle
          ? model.createVehicle({
              licensePlate: plate,
              plate: plate,
              plateState: plateState,
              governmentVehicle: false
            })
          : {
              vehicleId: model.newId("veh"),
              licensePlate: plate,
              plate: plate,
              plateState: plateState,
              governmentVehicle: false
            };
        var savedVeh = saveObjectRecord("VEHICLE", record, { mode: "commit" });
        if (!savedVeh.ok) {
          return {
            ok: false,
            record: null,
            objectId: "",
            reused: false,
            error: savedVeh.error || "Could not save the vehicle."
          };
        }
        record = savedVeh.record || getVehicleRecord(savedVeh.objectId);
        reused = false;
      }
      return {
        ok: true,
        record: record,
        objectId: record.vehicleId || record.id,
        reused: reused,
        error: ""
      };
    }
    if (objectType === "LOCATION") {
      var locInput = {
        street: String(input.street || "").trim(),
        city: String(input.city || "").trim(),
        state: String(input.state || "").trim().toUpperCase(),
        zip: String(input.zip || "").trim()
      };
      if (input.objectId) {
        record = getLocationRecord(input.objectId);
        reused = !!record;
      }
      if (!record && (locInput.street || locInput.city)) {
        record = findLocationByAddress(locInput);
        reused = !!record;
        if (!record) {
          record = restoreJunkedRecord(
            "LOCATION",
            findLocationByAddress(locInput, "", true)
          );
          reused = !!record;
        }
      }
      if (!record) {
        record = model.createLocation
          ? model.createLocation(locInput)
          : Object.assign(
              { locationId: model.newId("loc"), entityType: "LOCATION" },
              locInput
            );
        var savedLoc = saveObjectRecord("LOCATION", record, { mode: "commit" });
        if (!savedLoc.ok) {
          return {
            ok: false,
            record: null,
            objectId: "",
            reused: false,
            error: savedLoc.error || "Could not save the location."
          };
        }
        record = savedLoc.record || getLocationRecord(savedLoc.objectId);
        reused = false;
      }
      return {
        ok: true,
        record: record,
        objectId: record.locationId || record.id,
        reused: reused,
        error: ""
      };
    }
    if (objectType === "BUSINESS") {
      if (input.objectId) {
        record = getBusinessRecord(input.objectId);
        reused = !!record;
      }
      var bizName = String(input.name || "").trim();
      if (!record && bizName) {
        record = findBusinessByName(bizName);
        reused = !!record;
        if (!record) {
          record = restoreJunkedRecord("BUSINESS", findBusinessByName(bizName, "", true));
          reused = !!record;
        }
      }
      if (!record) {
        record = model.createBusiness
          ? model.createBusiness({
              name: bizName,
              phone: input.phone || ""
            })
          : {
              businessId: model.newId("biz"),
              entityType: "BUSINESS",
              name: bizName,
              phone: input.phone || ""
            };
        var savedBiz = saveObjectRecord("BUSINESS", record, { mode: "commit" });
        if (!savedBiz.ok) {
          return {
            ok: false,
            record: null,
            objectId: "",
            reused: false,
            error: savedBiz.error || "Could not save the business."
          };
        }
        record = savedBiz.record || getBusinessRecord(savedBiz.objectId);
        reused = false;
      }
      return {
        ok: true,
        record: record,
        objectId: record.businessId || record.id,
        reused: reused,
        error: ""
      };
    }
    if (objectType === "ENTITY") {
      if (input.objectId) {
        record = getEntityRecord(input.objectId);
        reused = !!record;
      }
      var entName = String(input.name || "").trim();
      if (!record && entName) {
        record = findEntityByName(entName);
        reused = !!record;
        if (!record) {
          record = restoreJunkedRecord("ENTITY", findEntityByName(entName, "", true));
          reused = !!record;
        }
      }
      if (!record) {
        record = model.createCustomEntity
          ? model.createCustomEntity({
              name: entName,
              kind: input.kind || ""
            })
          : {
              entityId: model.newId("ent"),
              entityType: "ENTITY",
              name: entName,
              kind: input.kind || ""
            };
        var savedEnt = saveObjectRecord("ENTITY", record, { mode: "commit" });
        if (!savedEnt.ok) {
          return {
            ok: false,
            record: null,
            objectId: "",
            reused: false,
            error: savedEnt.error || "Could not save the entity."
          };
        }
        record = savedEnt.record || getEntityRecord(savedEnt.objectId);
        reused = false;
      }
      return {
        ok: true,
        record: record,
        objectId: record.entityId || record.id,
        reused: reused,
        error: ""
      };
    }
    return {
      ok: false,
      record: null,
      objectId: "",
      reused: false,
      error: "Pick a person, vehicle, location, business, or entity."
    };
  }

  function addInvestigationObject(investigationId, input) {
    input = input || {};
    var blank = {
      ok: false,
      objectType: "",
      objectId: "",
      nodeId: "",
      linkId: "",
      reused: false,
      error: ""
    };
    var fresh = adoptDisk();
    if (!fresh.ok) {
      blank.error = fresh.error;
      return blank;
    }
    if (!state.investigations[investigationId]) {
      blank.error = "Investigation not found.";
      return blank;
    }
    var objectType = String(input.objectType || "").toUpperCase();
    if (
      objectType !== "PERSON" &&
      objectType !== "VEHICLE" &&
      objectType !== "LOCATION" &&
      objectType !== "BUSINESS" &&
      objectType !== "ENTITY"
    ) {
      blank.error = "Pick a person, vehicle, location, business, or entity.";
      return blank;
    }
    var resolved = resolveObjectRecord(objectType, input);
    if (!resolved.ok) {
      blank.objectType = objectType;
      blank.error = resolved.error;
      return blank;
    }
    fresh = adoptDisk();
    if (!fresh.ok) {
      blank.error = fresh.error;
      return blank;
    }
    var inv = clone(state.investigations[investigationId]);
    var fromNode = null;
    var fromNodeId = Object.prototype.hasOwnProperty.call(input, "fromNodeId")
      ? input.fromNodeId || ""
      : inv.focusNodeId || "";
    var i;
    if (fromNodeId) {
      for (i = 0; i < (inv.nodes || []).length; i++) {
        if (inv.nodes[i] && inv.nodes[i].nodeId === fromNodeId) {
          fromNode = inv.nodes[i];
          break;
        }
      }
    }
    if (
      fromNode &&
      fromNode.objectType === objectType &&
      fromNode.objectId === resolved.objectId
    ) {
      return {
        ok: false,
        objectType: objectType,
        objectId: resolved.objectId,
        nodeId: fromNode.nodeId,
        linkId: "",
        reused: resolved.reused,
        error: "Cannot link an object to itself."
      };
    }
    var node = ensureInvestigationNode(inv, objectType, resolved.objectId, {
      x: typeof input.x === "number" ? input.x : undefined,
      y: typeof input.y === "number" ? input.y : undefined
    });
    if (typeof input.x === "number") {
      node.x = input.x;
    }
    if (typeof input.y === "number") {
      node.y = input.y;
    }
    var linkId = "";
    var associationId = "";
    var reason = String(input.reason || "").trim();
    if (fromNode) {
      if (!reason) {
        reason = defaultInvestigationReason(fromNode.objectType, objectType);
      }
      if (!reason) {
        return {
          ok: false,
          objectType: objectType,
          objectId: resolved.objectId,
          nodeId: node.nodeId,
          linkId: "",
          reused: resolved.reused,
          error: "Pick a link type."
        };
      }
      var ends = canonicalLinkEnds(
        fromNode.objectType,
        fromNode.objectId,
        objectType,
        resolved.objectId,
        reason
      );
      inv.links = Array.isArray(inv.links) ? inv.links : [];
      var existingLink = null;
      for (i = 0; i < inv.links.length; i++) {
        var row = inv.links[i];
        if (!row || !row.from || !row.to) {
          continue;
        }
        var sameEnds =
          (row.from.type === ends.fromType &&
            row.from.id === ends.fromId &&
            row.to.type === ends.toType &&
            row.to.id === ends.toId) ||
          (row.from.type === ends.toType &&
            row.from.id === ends.toId &&
            row.to.type === ends.fromType &&
            row.to.id === ends.fromId);
        var reasons = row.reasons || [];
        if (sameEnds && reasons.indexOf(reason) !== -1) {
          existingLink = row;
          break;
        }
      }
      if (existingLink) {
        linkId = existingLink.linkId;
        citeWallAssociation(
          existingLink,
          fromNode.objectType,
          fromNode.objectId,
          objectType,
          resolved.objectId,
          reason,
          inv.investigationId
        );
        associationId = existingLink.associationId || "";
      } else {
        var link = model.createLink
          ? model.createLink({
              from: { type: ends.fromType, id: ends.fromId },
              to: { type: ends.toType, id: ends.toId },
              otherType: ends.toType,
              reasons: [reason],
              label: investigationObjectLabel(ends.toType, ends.toId)
            })
          : {
              linkId: model.newId("link"),
              from: { type: ends.fromType, id: ends.fromId },
              to: { type: ends.toType, id: ends.toId },
              reasons: [reason],
              notes: "",
              label: "",
              otherType: ends.toType
            };
        citeWallAssociation(
          link,
          fromNode.objectType,
          fromNode.objectId,
          objectType,
          resolved.objectId,
          reason,
          inv.investigationId
        );
        inv.links.push(link);
        linkId = link.linkId;
        associationId = link.associationId || "";
      }
    }
    if (input.focus !== false) {
      inv.focusNodeId = node.nodeId;
    }
    var addedLabel = investigationObjectLabel(objectType, resolved.objectId);
    var note = "Added " + objectType.toLowerCase() + " " + addedLabel;
    if (fromNode && reason) {
      note += " (" + investigationReasonPhrase(reason) + ")";
    }
    note += ".";
    appendSystemNote(inv, note);
    var savedInv = saveInvestigation(inv, {
      mode: model.isCommitted && model.isCommitted(inv) ? "commit" : "draft"
    });
    if (!savedInv.ok) {
      return {
        ok: false,
        objectType: objectType,
        objectId: resolved.objectId,
        nodeId: node.nodeId,
        linkId: linkId,
        associationId: associationId,
        reused: resolved.reused,
        error: savedInv.error || "Could not update the investigation."
      };
    }
    return {
      ok: true,
      objectType: objectType,
      objectId: resolved.objectId,
      nodeId: node.nodeId,
      linkId: linkId,
      associationId: associationId,
      reused: resolved.reused,
      error: ""
    };
  }

  function connectInvestigationNodes(investigationId, fromNodeId, toNodeId, reason) {
    var blank = {
      ok: false,
      linkId: "",
      error: ""
    };
    var fresh = adoptDisk();
    if (!fresh.ok) {
      blank.error = fresh.error;
      return blank;
    }
    var inv = state.investigations[investigationId]
      ? clone(state.investigations[investigationId])
      : null;
    if (!inv) {
      blank.error = "Investigation not found.";
      return blank;
    }
    var fromNode = null;
    var toNode = null;
    var i;
    for (i = 0; i < (inv.nodes || []).length; i++) {
      if (inv.nodes[i] && inv.nodes[i].nodeId === fromNodeId) {
        fromNode = inv.nodes[i];
      }
      if (inv.nodes[i] && inv.nodes[i].nodeId === toNodeId) {
        toNode = inv.nodes[i];
      }
    }
    if (!fromNode || !toNode) {
      blank.error = "Both objects must be on this investigation.";
      return blank;
    }
    if (fromNode.nodeId === toNode.nodeId) {
      blank.error = "Cannot link an object to itself.";
      return blank;
    }
    reason = String(reason || "").trim();
    if (!reason) {
      reason = defaultInvestigationReason(fromNode.objectType, toNode.objectType);
    }
    if (!reason) {
      blank.error = "Those objects cannot be linked.";
      return blank;
    }
    var ends = canonicalLinkEnds(
      fromNode.objectType,
      fromNode.objectId,
      toNode.objectType,
      toNode.objectId,
      reason
    );
    inv.links = Array.isArray(inv.links) ? inv.links : [];
    for (i = 0; i < inv.links.length; i++) {
      var row = inv.links[i];
      if (!row || !row.from || !row.to) {
        continue;
      }
      var sameEnds =
        (row.from.type === ends.fromType &&
          row.from.id === ends.fromId &&
          row.to.type === ends.toType &&
          row.to.id === ends.toId) ||
        (row.from.type === ends.toType &&
          row.from.id === ends.toId &&
          row.to.type === ends.fromType &&
          row.to.id === ends.fromId);
      if (sameEnds && (row.reasons || []).indexOf(reason) !== -1) {
        citeWallAssociation(
          row,
          fromNode.objectType,
          fromNode.objectId,
          toNode.objectType,
          toNode.objectId,
          reason,
          inv.investigationId
        );
        saveInvestigation(inv, {
          mode: model.isCommitted && model.isCommitted(inv) ? "commit" : "draft"
        });
        return {
          ok: true,
          linkId: row.linkId,
          associationId: row.associationId || "",
          reused: true,
          error: ""
        };
      }
    }
    var link = model.createLink
      ? model.createLink({
          from: { type: ends.fromType, id: ends.fromId },
          to: { type: ends.toType, id: ends.toId },
          otherType: ends.toType,
          reasons: [reason],
          label: investigationObjectLabel(ends.toType, ends.toId)
        })
      : {
          linkId: model.newId("link"),
          from: { type: ends.fromType, id: ends.fromId },
          to: { type: ends.toType, id: ends.toId },
          reasons: [reason],
          notes: "",
          label: "",
          otherType: ends.toType
        };
    citeWallAssociation(
      link,
      fromNode.objectType,
      fromNode.objectId,
      toNode.objectType,
      toNode.objectId,
      reason,
      inv.investigationId
    );
    inv.links.push(link);
    appendSystemNote(
      inv,
      "Linked " +
        investigationObjectLabel(fromNode.objectType, fromNode.objectId) +
        " to " +
        investigationObjectLabel(toNode.objectType, toNode.objectId) +
        " (" +
        investigationReasonPhrase(reason) +
        ")."
    );
    var saved = saveInvestigation(inv, {
      mode: model.isCommitted && model.isCommitted(inv) ? "commit" : "draft"
    });
    if (!saved.ok) {
      blank.error = saved.error || "Could not save the link.";
      return blank;
    }
    return {
      ok: true,
      linkId: link.linkId,
      associationId: link.associationId || "",
      reused: false,
      error: ""
    };
  }

  function associationTouches(row, objectType, objectId) {
    if (!row || !objectId) {
      return false;
    }
    var type = String(objectType || "").toUpperCase();
    var id = String(objectId || "");
    return (
      (row.from &&
        String(row.from.type || "").toUpperCase() === type &&
        String(row.from.id || "") === id) ||
      (row.to &&
        String(row.to.type || "").toUpperCase() === type &&
        String(row.to.id || "") === id)
    );
  }

  function associationEndsEqual(row, fromType, fromId, toType, toId, reason) {
    if (!row || !row.from || !row.to) {
      return false;
    }
    var rowReason = row.reason || (row.reasons && row.reasons[0]) || "";
    if (reason && rowReason !== reason && (row.reasons || []).indexOf(reason) === -1) {
      return false;
    }
    var fwd =
      row.from.type === fromType &&
      row.from.id === fromId &&
      row.to.type === toType &&
      row.to.id === toId;
    if (fwd) {
      return true;
    }
    var rev =
      row.from.type === toType &&
      row.from.id === toId &&
      row.to.type === fromType &&
      row.to.id === fromId;
    if (!rev) {
      return false;
    }
    return !reason || model.isSymmetricAssociation(reason) || rowReason === reason;
  }

  function findAssociationByEnds(fromType, fromId, toType, toId, reason, includeJunked) {
    var ends = canonicalLinkEnds(fromType, fromId, toType, toId, reason);
    var ids = Object.keys(state.associations || {});
    var i;
    for (i = 0; i < ids.length; i++) {
      var row = state.associations[ids[i]];
      if (!row) {
        continue;
      }
      if (!includeJunked && isJunked(row)) {
        continue;
      }
      if (
        associationEndsEqual(
          row,
          ends.fromType,
          ends.fromId,
          ends.toType,
          ends.toId,
          ends.reason || reason
        )
      ) {
        return row;
      }
    }
    return null;
  }

  function putAssociation(record) {
    if (!record || !record.associationId) {
      return null;
    }
    state.associations = state.associations || {};
    state.associations[record.associationId] = clone(record);
    return state.associations[record.associationId];
  }

  function saveAssociationRecord(associationId, input, opts) {
    opts = opts || {};
    var blank = {
      ok: false,
      reused: false,
      associationId: associationId || "",
      error: ""
    };
    if (!opts.skipAdopt) {
      var fresh = adoptDisk();
      if (!fresh.ok) {
        blank.error = fresh.error;
        return blank;
      }
    }
    input = input || {};
    var existing = associationId && state.associations
      ? state.associations[associationId]
      : null;
    var previousAssociation = existing ? clone(existing) : null;
    var fromType = (input.from && input.from.type) || input.fromEntityType ||
      (existing && existing.from && existing.from.type) || "";
    var fromId = (input.from && input.from.id) || input.fromEntityId ||
      (existing && existing.from && existing.from.id) || "";
    var toType = (input.to && input.to.type) || input.toEntityType ||
      (existing && existing.to && existing.to.type) || "";
    var toId = (input.to && input.to.id) || input.toEntityId ||
      (existing && existing.to && existing.to.id) || "";
    var reason = input.reason || input.associationTypeCode ||
      (input.reasons && input.reasons[0]) ||
      (existing && (existing.reason || (existing.reasons && existing.reasons[0]))) ||
      "";
    if (!reason) {
      blank.error = "Pick a link type.";
      return blank;
    }
    if (model.validateAssociationEnds) {
      var valid = model.validateAssociationEnds(fromType, toType, reason);
      if (!valid || !valid.ok) {
        blank.error =
          (valid && valid.errors && valid.errors[0]) ||
          "Those objects cannot be linked as " + reason + ".";
        return blank;
      }
    }
    var ends = canonicalLinkEnds(fromType, fromId, toType, toId, reason);
    if (
      ends.fromType === ends.toType &&
      ends.fromId &&
      ends.fromId === ends.toId
    ) {
      blank.error = "Cannot link an object to itself.";
      return blank;
    }
    var merged = mergeRecord(existing, input);
    merged.associationId = associationId || merged.associationId || model.newId("asoc");
    merged.from = { type: ends.fromType, id: ends.fromId };
    merged.to = { type: ends.toType, id: ends.toId };
    merged.reason = ends.reason || reason;
    merged.reasons = [merged.reason];
    merged.otherType = ends.toType;
    var record = model.createAssociation
      ? model.createAssociation(merged)
      : merged;
    record.associationId = merged.associationId;
    record.from = merged.from;
    record.to = merged.to;
    record.reason = merged.reason;
    record.reasons = [merged.reason];
    putAssociation(record);
    if (previousAssociation) {
      pruneAssociationProjections(previousAssociation);
    }
    if (!opts.skipLeadSync) {
      if (record.from.type === "PERSON") {
        syncLeadsForPerson(record.from.id);
      }
      if (record.to.type === "PERSON") {
        syncLeadsForPerson(record.to.id);
      }
    }
    if (opts.persist !== false && !writeDisk()) {
      blank.error = "Could not write localStorage (quota or private mode).";
      return blank;
    }
    return {
      ok: true,
      reused: !!existing,
      associationId: record.associationId,
      error: ""
    };
  }

  function upsertAssociation(input, opts) {
    opts = opts || {};
    var blank = {
      ok: false,
      reused: false,
      associationId: "",
      error: ""
    };
    if (!opts.skipAdopt) {
      var fresh = adoptDisk();
      if (!fresh.ok) {
        blank.error = fresh.error;
        return blank;
      }
    }
    input = input || {};
    var fromType = (input.from && input.from.type) || input.fromEntityType || "";
    var fromId = (input.from && input.from.id) || input.fromEntityId || "";
    var toType = (input.to && input.to.type) || input.toEntityType || "";
    var toId = (input.to && input.to.id) || input.toEntityId || "";
    var reason =
      input.reason ||
      input.associationTypeCode ||
      (input.reasons && input.reasons[0]) ||
      "";
    if (!reason) {
      blank.error = "Pick a link type.";
      return blank;
    }
    if (fromType && toType && model.validateAssociationEnds) {
      var valid = model.validateAssociationEnds(fromType, toType, reason);
      if (!valid || !valid.ok) {
        blank.error =
          (valid && valid.errors && valid.errors[0]) ||
          "Those objects cannot be linked as " + reason + ".";
        return blank;
      }
    }
    var ends = canonicalLinkEnds(fromType, fromId, toType, toId, reason);
    if (
      ends.fromType &&
      ends.toType &&
      ends.fromType === ends.toType &&
      ends.fromId &&
      ends.fromId === ends.toId
    ) {
      blank.error = "Cannot link an object to itself.";
      return blank;
    }
    var existing = findAssociationByEnds(
      ends.fromType,
      ends.fromId,
      ends.toType,
      ends.toId,
      ends.reason || reason,
      true
    );
    if (existing) {
      if (isJunked(existing)) {
        input.junked = false;
        input.junkedAt = "";
      }
      return saveAssociationRecord(existing.associationId, input, {
        skipAdopt: true,
        persist: opts.persist,
        skipLeadSync: opts.skipLeadSync
      });
    }
    var record = model.createAssociation
      ? model.createAssociation({
          from: { type: ends.fromType, id: ends.fromId },
          to: { type: ends.toType, id: ends.toId },
          reason: ends.reason || reason,
          reasons: [ends.reason || reason],
          otherType: ends.toType,
          label: input.label || "",
          notes: input.notes || "",
          occupancy: input.occupancy || "",
          validFrom: input.validFrom || "",
          validTo: input.validTo || "",
          source: input.source || {
            investigationId: input.investigationId || "",
            leadId: input.leadId || "",
            encounterId: input.encounterId || "",
            officerId: input.officerId || ""
          },
          assertedAt: input.assertedAt || (model.nowIso ? model.nowIso() : "")
        })
      : {
          associationId: model.newId("asoc"),
          from: { type: ends.fromType, id: ends.fromId },
          to: { type: ends.toType, id: ends.toId },
          reason: ends.reason || reason,
          reasons: [ends.reason || reason]
        };
    putAssociation(record);
    if (!opts.skipLeadSync) {
      if (ends.fromType === "PERSON") {
        syncLeadsForPerson(ends.fromId);
      }
      if (ends.toType === "PERSON") {
        syncLeadsForPerson(ends.toId);
      }
    }
    if (opts.persist !== false) {
      writeDisk();
    }
    return {
      ok: true,
      reused: false,
      associationId: record.associationId,
      error: ""
    };
  }

  function citeWallAssociation(link, fromType, fromId, toType, toId, reason, investigationId) {
    var result = upsertAssociation(
      {
        from: { type: fromType, id: fromId },
        to: { type: toType, id: toId },
        reason: reason,
        source: { investigationId: investigationId || "" }
      },
      { skipAdopt: true, persist: true }
    );
    if (result.ok && link) {
      link.associationId = result.associationId;
    }
    return result;
  }

  function getAssociation(associationId) {
    adoptDisk();
    var row = state.associations && state.associations[associationId];
    return row ? clone(row) : null;
  }

  function associationsFor(objectType, objectId, opts) {
    opts = opts || {};
    adoptDisk();
    var out = [];
    Object.keys(state.associations || {}).forEach(function (id) {
      var row = state.associations[id];
      if (!row) {
        return;
      }
      if (!opts.includeJunked && isJunked(row)) {
        return;
      }
      if (associationTouches(row, objectType, objectId)) {
        out.push(clone(row));
      }
    });
    return out;
  }

  function nestedLocationKind(reason) {
    var code = String(reason || "").toUpperCase();
    if (code === "EMPLOYMENT_ADDRESS" || code === "BUSINESS_ADDRESS") {
      return "work";
    }
    if (code === "REGISTERED_ADDRESS") {
      return "registration";
    }
    if (code === "VEHICLE_PARKING" || code === "STORED_AT") {
      return "known-parking";
    }
    return "residence";
  }

  function reasonFromNestedLocationKind(kind) {
    var key = String(kind || "").toLowerCase();
    if (key === "work") {
      return "EMPLOYMENT_ADDRESS";
    }
    if (key === "registration") {
      return "REGISTERED_ADDRESS";
    }
    if (key === "known-parking") {
      return "VEHICLE_PARKING";
    }
    return "CURRENT_RESIDENCE";
  }

  function associationOccupancyValue(row) {
    return String((row && row.occupancy) || "").toLowerCase() === "historical"
      ? "historical"
      : "current";
  }

  function occupancyPayload(row) {
    return {
      occupancy: associationOccupancyValue(row),
      validFrom: (row && (row.validFrom || row.occupiedFrom)) || "",
      validTo: (row && (row.validTo || row.occupiedTo)) || ""
    };
  }

  function applyAssociationOccupancy(target, asoc) {
    if (!target || !asoc) {
      return false;
    }
    var next = occupancyPayload(asoc);
    var changed = false;
    if (target.occupancy !== next.occupancy) {
      target.occupancy = next.occupancy;
      changed = true;
    }
    if (target.occupiedFrom !== next.validFrom) {
      target.occupiedFrom = next.validFrom;
      changed = true;
    }
    if (target.occupiedTo !== next.validTo) {
      target.occupiedTo = next.validTo;
      changed = true;
    }
    return changed;
  }

  function findAssociationByPair(typeA, idA, typeB, idB, includeJunked) {
    var aType = String(typeA || "").toUpperCase();
    var bType = String(typeB || "").toUpperCase();
    var aId = String(idA || "");
    var bId = String(idB || "");
    if (!aType || !aId || !bType || !bId) {
      return null;
    }
    var ids = Object.keys(state.associations || {});
    var i;
    for (i = 0; i < ids.length; i++) {
      var row = state.associations[ids[i]];
      if (!row) {
        continue;
      }
      if (!includeJunked && isJunked(row)) {
        continue;
      }
      if (associationTouches(row, aType, aId) && associationTouches(row, bType, bId)) {
        return row;
      }
    }
    return null;
  }

  function occupancyFor(typeA, idA, typeB, idB) {
    adoptDisk();
    var row = findAssociationByPair(typeA, idA, typeB, idB);
    if (!row) {
      return null;
    }
    var occ = occupancyPayload(row);
    return {
      occupancy: occ.occupancy,
      occupiedFrom: occ.validFrom,
      occupiedTo: occ.validTo,
      associationId: row.associationId
    };
  }

  function putIdentityLocation(loc) {
    if (!loc || !loc.locationId) {
      return;
    }
    state.locations = state.locations || {};
    var prev = state.locations[loc.locationId];
    if (!prev) {
      var copy = typeof model.createLocation === "function"
        ? model.createLocation(clone(loc))
        : clone(loc);
      copy.entityType = "LOCATION";
      copy.locationId = loc.locationId;
      copy.id = copy.id || loc.locationId;
      state.locations[loc.locationId] = copy;
      return;
    }
    prev.street = loc.street || prev.street;
    prev.street2 = loc.street2 || prev.street2;
    prev.city = loc.city || prev.city;
    prev.state = loc.state || prev.state;
    prev.zip = loc.zip || prev.zip;
    prev.latitude = loc.latitude || prev.latitude;
    prev.longitude = loc.longitude || prev.longitude;
  }

  function putIdentityVehicle(veh) {
    if (!veh) {
      return;
    }
    var id = veh.vehicleId || veh.id;
    if (!id) {
      return;
    }
    state.vehicles = state.vehicles || {};
    var prev = state.vehicles[id];
    if (!prev) {
      var copy = typeof model.createVehicle === "function"
        ? model.createVehicle(clone(veh))
        : clone(veh);
      copy.entityType = "VEHICLE";
      copy.vehicleId = id;
      copy.id = copy.id || id;
      copy.governmentVehicle = false;
      state.vehicles[id] = copy;
      return;
    }
    prev.licensePlate = veh.licensePlate || veh.plate || prev.licensePlate;
    prev.plate = prev.licensePlate;
    prev.plateState = veh.plateState || prev.plateState;
    prev.vehicleYear = veh.vehicleYear || prev.vehicleYear;
    prev.vehicleMake = veh.vehicleMake || prev.vehicleMake;
    prev.vehicleModel = veh.vehicleModel || prev.vehicleModel;
    prev.vehicleColor = veh.vehicleColor || prev.vehicleColor;
    prev.vehicleBodyStyle = veh.vehicleBodyStyle || prev.vehicleBodyStyle;
    prev.vin = veh.vin || prev.vin;
    if (!prev.registeredOwnerName && veh.registeredOwnerName) {
      prev.registeredOwnerName = veh.registeredOwnerName;
    }
    prev.governmentVehicle = false;
  }

  function syncObjectOwnedLocations(ownerType, ownerId, locations) {
    if (!ownerId) {
      return;
    }
    (locations || []).forEach(function (location) {
      if (!location || !location.locationId) {
        return;
      }
      putIdentityLocation(location);
      var reason = reasonFromNestedLocationKind(location.association);
      if (ownerType === "VEHICLE" && reason === "CURRENT_RESIDENCE") {
        reason = "VEHICLE_PARKING";
      }
      upsertAssociation(
        {
          from: { type: ownerType, id: ownerId },
          to: { type: "LOCATION", id: location.locationId },
          reason: reason,
          occupancy: location.occupancy || "current",
          validFrom: location.occupiedFrom || "",
          validTo: location.occupiedTo || ""
        },
        { skipAdopt: true, persist: false, skipLeadSync: true }
      );
    });
  }

  function syncEncounterObjects(encounter) {
    if (!encounter) {
      return;
    }
    (encounter.vehicles || []).forEach(function (vehicle) {
      if (!vehicle) {
        return;
      }
      putIdentityVehicle(vehicle);
      var vehicleId = vehicle.vehicleId || vehicle.id || "";
      (vehicle.locations || []).forEach(function (location) {
        if (!vehicleId || !location || !location.locationId) {
          return;
        }
        putIdentityLocation(location);
        var reason = reasonFromNestedLocationKind(location.association);
        if (reason === "CURRENT_RESIDENCE") {
          reason = "VEHICLE_PARKING";
        }
        upsertAssociation(
          {
            from: { type: "VEHICLE", id: vehicleId },
            to: { type: "LOCATION", id: location.locationId },
            reason: reason,
            source: { encounterId: encounter.encounterId || "" }
          },
          { skipAdopt: true, persist: false, skipLeadSync: true }
        );
      });
    });
    (encounter.locations || []).forEach(putIdentityLocation);
    (encounter.links || []).forEach(function (link) {
      if (!link || !link.from || !link.to) {
        return;
      }
      var fromType = canonicalObjectType(link.from.type);
      var toType = canonicalObjectType(link.to.type || link.otherType);
      var fromId = String(link.from.id || "");
      var toId = String(link.to.id || "");
      var reason = String((link.reasons && link.reasons[0]) || "").trim();
      if (
        !fromType ||
        !toType ||
        !fromId ||
        !toId ||
        !reason ||
        !objectExists(fromType, fromId) ||
        !objectExists(toType, toId)
      ) {
        return;
      }
      var result = upsertAssociation(
        Object.assign({
          from: { type: fromType, id: fromId },
          to: { type: toType, id: toId },
          reason: reason,
          label: link.label || investigationObjectLabel(toType, toId),
          source: { encounterId: encounter.encounterId || "" }
        }, link.notes ? { notes: link.notes } : {}),
        { skipAdopt: true, persist: false, skipLeadSync: true }
      );
      if (result && result.ok) {
        link.associationId = result.associationId;
      }
    });
  }

  function writePairOccupancy(fromType, fromId, toType, toId, row, defaultReason) {
    if (!fromId || !toId || !row) {
      return;
    }
    var occ = occupancyPayload(row);
    var existing = findAssociationByPair(fromType, fromId, toType, toId);
    if (existing) {
      existing.occupancy = occ.occupancy;
      existing.validFrom = occ.validFrom;
      existing.validTo = occ.validTo;
      putAssociation(existing);
      return;
    }
    upsertAssociation(
      {
        from: { type: fromType, id: fromId },
        to: { type: toType, id: toId },
        reason: defaultReason,
        occupancy: occ.occupancy,
        validFrom: occ.validFrom,
        validTo: occ.validTo
      },
      { skipAdopt: true, persist: false, skipLeadSync: true }
    );
  }

  function syncNestedOccupancyToAssociations(lead) {
    if (!lead || !lead.person) {
      return;
    }
    var personId = lead.subjectPersonId || lead.person.personId;
    if (!personId) {
      return;
    }
    (lead.person.locations || []).forEach(function (loc) {
      if (!loc || !loc.locationId) {
        return;
      }
      putIdentityLocation(loc);
      writePairOccupancy(
        "PERSON",
        personId,
        "LOCATION",
        loc.locationId,
        loc,
        reasonFromNestedLocationKind(loc.association)
      );
    });
    (lead.vehicles || []).forEach(function (veh) {
      if (!veh) {
        return;
      }
      var vehicleId = veh.vehicleId || veh.id;
      if (!vehicleId) {
        return;
      }
      putIdentityVehicle(veh);
      writePairOccupancy(
        "PERSON",
        personId,
        "VEHICLE",
        vehicleId,
        veh,
        "REGISTERED_OWNER_OF"
      );
      (veh.locations || []).forEach(function (loc) {
        if (!loc || !loc.locationId) {
          return;
        }
        putIdentityLocation(loc);
        var reason = reasonFromNestedLocationKind(loc.association);
        if (reason === "CURRENT_RESIDENCE") {
          reason = "VEHICLE_PARKING";
        }
        writePairOccupancy("VEHICLE", vehicleId, "LOCATION", loc.locationId, loc, reason);
      });
    });
  }

  /** Materialize every resolvable lead link as the same world association used by investigations. */
  function syncLeadLinksToAssociations(lead) {
    if (!lead || !Array.isArray(lead.links)) {
      return;
    }
    lead.links.forEach(function (link) {
      if (!link || !link.from || !link.to) {
        return;
      }
      var fromType = canonicalObjectType(link.from.type);
      var toType = canonicalObjectType(link.to.type || link.otherType);
      var fromId = String(link.from.id || "");
      var toId = String(link.to.id || "");
      var reason = String((link.reasons && link.reasons[0]) || "").trim();
      if (
        !fromType ||
        !toType ||
        !fromId ||
        !toId ||
        !reason ||
        !objectExists(fromType, fromId) ||
        !objectExists(toType, toId)
      ) {
        return;
      }
      var input = {
        from: { type: fromType, id: fromId },
        to: { type: toType, id: toId },
        reason: reason,
        label: link.label || investigationObjectLabel(toType, toId),
        source: { leadId: lead.leadId || "" }
      };
      if (link.notes) {
        input.notes = link.notes;
      }
      var result = link.associationId && state.associations[link.associationId]
        ? saveAssociationRecord(link.associationId, input, {
            skipAdopt: true,
            persist: false,
            skipLeadSync: true
          })
        : upsertAssociation(input, {
            skipAdopt: true,
            persist: false,
            skipLeadSync: true
          });
      if (result && result.ok) {
        link.associationId = result.associationId;
      }
    });
  }

  function otherEnd(row, type, id) {
    if (!row || !row.from || !row.to) {
      return null;
    }
    if (row.from.type === type && row.from.id === id) {
      return row.to;
    }
    if (row.to.type === type && row.to.id === id) {
      return row.from;
    }
    return null;
  }

  function hasLiveAssociationBetween(typeA, idA, typeB, idB) {
    return Object.keys(state.associations || {}).some(function (associationId) {
      var row = state.associations[associationId];
      if (!row || isJunked(row) || !row.from || !row.to) {
        return false;
      }
      return (
        (row.from.type === typeA &&
          row.from.id === idA &&
          row.to.type === typeB &&
          row.to.id === idB) ||
        (row.from.type === typeB &&
          row.from.id === idB &&
          row.to.type === typeA &&
          row.to.id === idA)
      );
    });
  }

  /** Remove only denormalized case projections no longer backed by a world fact. */
  function pruneAssociationProjectionFromLead(lead, association) {
    if (!lead || !association || !association.from || !association.to) {
      return false;
    }
    var person = model.subjectOf ? model.subjectOf(lead) : lead.person;
    var personId = (person && person.personId) || lead.subjectPersonId || "";
    var changed = false;
    var other = personId ? otherEnd(association, "PERSON", personId) : null;
    if (
      other &&
      other.type === "LOCATION" &&
      !hasLiveAssociationBetween("PERSON", personId, "LOCATION", other.id)
    ) {
      var beforeLocations = (person.locations || []).length;
      person.locations = (person.locations || []).filter(function (row) {
        return !row || row.locationId !== other.id;
      });
      changed = changed || person.locations.length !== beforeLocations;
    }
    if (
      other &&
      other.type === "VEHICLE" &&
      !hasLiveAssociationBetween("PERSON", personId, "VEHICLE", other.id)
    ) {
      var beforeVehicles = (lead.vehicles || []).length;
      lead.vehicles = (lead.vehicles || []).filter(function (row) {
        return !row || (row.vehicleId || row.id) !== other.id;
      });
      changed = changed || lead.vehicles.length !== beforeVehicles;
    }
    (lead.vehicles || []).forEach(function (vehicle) {
      if (!vehicle) {
        return;
      }
      var vehicleId = vehicle.vehicleId || vehicle.id || "";
      var place = vehicleId
        ? otherEnd(association, "VEHICLE", vehicleId)
        : null;
      if (
        !place ||
        place.type !== "LOCATION" ||
        hasLiveAssociationBetween("VEHICLE", vehicleId, "LOCATION", place.id)
      ) {
        return;
      }
      var before = (vehicle.locations || []).length;
      vehicle.locations = (vehicle.locations || []).filter(function (row) {
        return !row || row.locationId !== place.id;
      });
      changed = changed || vehicle.locations.length !== before;
    });
    if (changed && person) {
      lead.person = person;
    }
    return changed;
  }

  function pruneAssociationProjections(association) {
    Object.keys(state.leads || {}).forEach(function (leadId) {
      var lead = state.leads[leadId];
      if (pruneAssociationProjectionFromLead(lead, association)) {
        rememberPeople(lead);
      }
    });
  }

  function ensureNestedLocation(list, locationId, reason, asoc) {
    var src = getLocationRecord(locationId);
    if (!src) {
      return false;
    }
    var i;
    for (i = 0; i < list.length; i++) {
      if (list[i] && list[i].locationId === locationId) {
        list[i].street = src.street || list[i].street;
        list[i].street2 = src.street2 || list[i].street2;
        list[i].city = src.city || list[i].city;
        list[i].state = src.state || list[i].state;
        list[i].zip = src.zip || list[i].zip;
        list[i].latitude = src.latitude || list[i].latitude;
        list[i].longitude = src.longitude || list[i].longitude;
        list[i].association = nestedLocationKind(reason);
        if (asoc) {
          applyAssociationOccupancy(list[i], asoc);
        }
        return true;
      }
    }
    var copy = clone(src);
    copy.association = nestedLocationKind(reason);
    if (asoc) {
      applyAssociationOccupancy(copy, asoc);
    } else if (!copy.occupancy) {
      copy.occupancy = "current";
    }
    list.push(copy);
    return true;
  }

  function ensureNestedVehicle(list, vehicleId, asoc) {
    var src = getVehicleRecord(vehicleId);
    if (!src) {
      return null;
    }
    var i;
    for (i = 0; i < list.length; i++) {
      if (list[i] && (list[i].vehicleId || list[i].id) === vehicleId) {
        list[i].licensePlate = src.licensePlate || src.plate || list[i].licensePlate;
        list[i].plate = list[i].licensePlate;
        list[i].plateState = src.plateState || list[i].plateState;
        list[i].vehicleYear = src.vehicleYear || list[i].vehicleYear;
        list[i].vehicleMake = src.vehicleMake || list[i].vehicleMake;
        list[i].vehicleModel = src.vehicleModel || list[i].vehicleModel;
        list[i].vehicleColor = src.vehicleColor || list[i].vehicleColor;
        list[i].vehicleBodyStyle = src.vehicleBodyStyle || list[i].vehicleBodyStyle;
        list[i].vin = src.vin || list[i].vin;
        if (!list[i].registeredOwnerName && src.registeredOwnerName) {
          list[i].registeredOwnerName = src.registeredOwnerName;
        }
        list[i].governmentVehicle = false;
        list[i].locations = list[i].locations || [];
        if (asoc) {
          applyAssociationOccupancy(list[i], asoc);
        }
        return list[i];
      }
    }
    var copy = clone(src);
    copy.governmentVehicle = false;
    copy.locations = Array.isArray(copy.locations) ? copy.locations : [];
    if (asoc) {
      applyAssociationOccupancy(copy, asoc);
    }
    list.push(copy);
    return copy;
  }

  function applyAssociationNestingToLead(lead) {
    if (!lead || !lead.person) {
      return false;
    }
    var personId = lead.subjectPersonId || lead.person.personId;
    if (!personId) {
      return false;
    }
    var person = lead.person;
    person.locations = Array.isArray(person.locations) ? person.locations : [];
    lead.vehicles = Array.isArray(lead.vehicles) ? lead.vehicles : [];
    var changed = false;
    Object.keys(state.associations || {}).forEach(function (id) {
      var row = state.associations[id];
      if (!row || isJunked(row)) {
        return;
      }
      var other = otherEnd(row, "PERSON", personId);
      if (!other || !other.type || !other.id) {
        return;
      }
      var reason = row.reason || (row.reasons && row.reasons[0]) || "";
      if (other.type === "LOCATION") {
        if (ensureNestedLocation(person.locations, other.id, reason, row)) {
          changed = true;
        }
      }
      if (other.type === "VEHICLE") {
        var nested = ensureNestedVehicle(lead.vehicles, other.id, row);
        if (nested) {
          changed = true;
        }
      }
    });
    lead.vehicles.forEach(function (vehicle) {
      if (!vehicle) {
        return;
      }
      var vehicleId = vehicle.vehicleId || vehicle.id;
      if (!vehicleId) {
        return;
      }
      vehicle.locations = Array.isArray(vehicle.locations) ? vehicle.locations : [];
      Object.keys(state.associations || {}).forEach(function (id) {
        var row = state.associations[id];
        if (!row || isJunked(row)) {
          return;
        }
        var other = otherEnd(row, "VEHICLE", vehicleId);
        if (!other || other.type !== "LOCATION" || !other.id) {
          return;
        }
        var reason = row.reason || (row.reasons && row.reasons[0]) || "";
        if (ensureNestedLocation(vehicle.locations, other.id, reason, row)) {
          changed = true;
        }
      });
    });
    return changed;
  }

  function syncLeadsForPerson(personId) {
    var leadId = leadIdForPerson(personId);
    if (!leadId || !state.leads[leadId]) {
      return;
    }
    applyAssociationNestingToLead(state.leads[leadId]);
    rememberPeople(state.leads[leadId]);
  }

  function setAssociationReason(associationId, reason) {
    var blank = { ok: false, associationId: associationId || "", error: "" };
    var fresh = adoptDisk();
    if (!fresh.ok) {
      blank.error = fresh.error;
      return blank;
    }
    var row = state.associations && state.associations[associationId];
    if (!row) {
      blank.error = "Association not found.";
      return blank;
    }
    reason = String(reason || "").trim();
    if (!reason) {
      blank.error = "Pick a link type.";
      return blank;
    }
    if (model.validateAssociationEnds) {
      var valid = model.validateAssociationEnds(row.from.type, row.to.type, reason);
      if (!valid || !valid.ok) {
        blank.error =
          (valid && valid.errors && valid.errors[0]) ||
          "Those objects cannot be linked as " + reason + ".";
        return blank;
      }
    }
    var ends = canonicalLinkEnds(
      row.from.type,
      row.from.id,
      row.to.type,
      row.to.id,
      reason
    );
    row.from = { type: ends.fromType, id: ends.fromId };
    row.to = { type: ends.toType, id: ends.toId };
    row.reason = ends.reason || reason;
    row.reasons = [row.reason];
    putAssociation(row);
    if (row.from.type === "PERSON") {
      syncLeadsForPerson(row.from.id);
    }
    if (row.to.type === "PERSON") {
      syncLeadsForPerson(row.to.id);
    }
    writeDisk();
    return { ok: true, associationId: row.associationId, error: "" };
  }

  function stripAssociationCitations(associationId) {
    if (!associationId) {
      return;
    }
    Object.keys(state.investigations || {}).forEach(function (id) {
      var inv = state.investigations[id];
      if (!inv || !Array.isArray(inv.links)) {
        return;
      }
      inv.links = inv.links.filter(function (row) {
        return !row || row.associationId !== associationId;
      });
    });
    Object.keys(state.leads || {}).forEach(function (id) {
      var lead = state.leads[id];
      if (!lead || !Array.isArray(lead.links)) {
        return;
      }
      lead.links = lead.links.filter(function (row) {
        return !row || row.associationId !== associationId;
      });
    });
  }

  function dropAssociation(associationId) {
    var blank = {
      ok: false,
      associationId: associationId || "",
      removed: false,
      error: ""
    };
    var fresh = adoptDisk();
    if (!fresh.ok) {
      blank.error = fresh.error;
      return blank;
    }
    if (!associationId || !state.associations || !state.associations[associationId]) {
      return {
        ok: true,
        associationId: associationId || "",
        removed: false,
        error: ""
      };
    }
    var removedAssociation = clone(state.associations[associationId]);
    delete state.associations[associationId];
    stripAssociationCitations(associationId);
    pruneAssociationProjections(removedAssociation);
    if (!writeDisk()) {
      adoptDisk();
      blank.error = "Could not write localStorage (quota or private mode).";
      return blank;
    }
    return {
      ok: true,
      associationId: associationId,
      removed: true,
      error: ""
    };
  }

  function dropAssociationsForObject(objectType, objectId) {
    Object.keys(state.associations || {}).forEach(function (id) {
      if (associationTouches(state.associations[id], objectType, objectId)) {
        delete state.associations[id];
      }
    });
  }

  function setAssociationsJunkedForObject(objectType, objectId, junked) {
    Object.keys(state.associations || {}).forEach(function (id) {
      var row = state.associations[id];
      if (!associationTouches(row, objectType, objectId)) {
        return;
      }
      row.junked = !!junked;
      row.junkedAt = junked && model.nowIso ? model.nowIso() : "";
    });
  }

  function retargetAssociations(objectType, fromId, toId) {
    if (!fromId || !toId || fromId === toId) {
      return;
    }
    Object.keys(state.associations || {}).forEach(function (id) {
      var row = state.associations[id];
      if (!row) {
        return;
      }
      if (row.from && row.from.type === objectType && row.from.id === fromId) {
        row.from.id = toId;
      }
      if (row.to && row.to.type === objectType && row.to.id === fromId) {
        row.to.id = toId;
      }
      if (
        row.from &&
        row.to &&
        row.from.type === row.to.type &&
        row.from.id === row.to.id
      ) {
        delete state.associations[id];
      }
    });
    var seen = {};
    Object.keys(state.associations || {}).forEach(function (id) {
      var row = state.associations[id];
      if (!row || !row.from || !row.to) {
        return;
      }
      var key =
        row.from.type +
        "|" +
        row.from.id +
        "|" +
        row.to.type +
        "|" +
        row.to.id +
        "|" +
        (row.reason || "");
      var symmetric =
        model.isSymmetricAssociation && model.isSymmetricAssociation(row.reason);
      if (symmetric) {
        var a = row.from.type + "|" + row.from.id;
        var b = row.to.type + "|" + row.to.id;
        key =
          (a < b ? a + "|" + b : b + "|" + a) + "|" + (row.reason || "");
      }
      if (seen[key] && seen[key] !== id) {
        retargetWallAssociationIds(id, seen[key]);
        delete state.associations[id];
        return;
      }
      seen[key] = id;
    });
  }

  function retargetWallAssociationIds(fromAssociationId, toAssociationId) {
    if (!fromAssociationId || !toAssociationId || fromAssociationId === toAssociationId) {
      return;
    }
    Object.keys(state.investigations || {}).forEach(function (id) {
      var inv = state.investigations[id];
      if (!inv) {
        return;
      }
      (inv.links || []).forEach(function (link) {
        if (link && link.associationId === fromAssociationId) {
          link.associationId = toAssociationId;
        }
      });
    });
  }

  function restorePersonRegistry(previous, identity) {
    if (!previous || !previous.personId) {
      return;
    }
    var kept = clone(previous);
    if (identity && identity.name) {
      kept.name = clone(identity.name);
    }
    if (identity) {
      if (identity.sex) {
        kept.sex = identity.sex;
      }
      if (identity.dateOfBirth) {
        kept.dateOfBirth = identity.dateOfBirth;
      }
      if (identity.age) {
        kept.age = identity.age;
      }
      if (identity.citizenship) {
        kept.citizenship = identity.citizenship;
      }
      if (identity.ssn) {
        kept.ssn = identity.ssn;
      }
      if (identity.lexId) {
        kept.lexId = identity.lexId;
      }
      if (identity.caseRole) {
        kept.caseRole = identity.caseRole;
      }
    }
    state.people[kept.personId] = kept;
    writeDisk();
  }

  function objectExists(objectType, objectId) {
    var type = String(objectType || "").toUpperCase();
    var id = String(objectId || "");
    if (!id) {
      return false;
    }
    if (type === "PERSON") {
      return !!state.people[id];
    }
    if (type === "VEHICLE") {
      return !!state.vehicles[id];
    }
    if (type === "LOCATION") {
      return !!state.locations[id];
    }
    if (type === "BUSINESS") {
      return !!state.businesses[id];
    }
    if (type === "ENTITY") {
      return !!state.entities[id];
    }
    return false;
  }

  function objectIsReferenced(objectType, objectId, skip) {
    var type = String(objectType || "").toUpperCase();
    var id = String(objectId || "");
    skip = skip || {};
    if (!id) {
      return false;
    }
    var skipInv = skip.investigationId || "";
    var skipNode = skip.nodeId || "";
    var invIds = Object.keys(state.investigations);
    var i;
    var j;
    for (i = 0; i < invIds.length; i++) {
      var inv = state.investigations[invIds[i]];
      var nodes = (inv && inv.nodes) || [];
      for (j = 0; j < nodes.length; j++) {
        var node = nodes[j];
        if (
          skipInv &&
          invIds[i] === skipInv &&
          node &&
          node.nodeId === skipNode
        ) {
          continue;
        }
        if (node && node.objectType === type && node.objectId === id) {
          return true;
        }
      }
    }
    var leadIds = Object.keys(state.leads);
    for (i = 0; i < leadIds.length; i++) {
      var lead = state.leads[leadIds[i]];
      if (!lead) {
        continue;
      }
      if (type === "PERSON") {
        if (lead.subjectPersonId === id) {
          return true;
        }
        if (lead.person && lead.person.personId === id) {
          return true;
        }
        var links = lead.links || [];
        for (j = 0; j < links.length; j++) {
          var link = links[j];
          if (
            (link.from && link.from.type === "PERSON" && link.from.id === id) ||
            (link.to && link.to.type === "PERSON" && link.to.id === id)
          ) {
            return true;
          }
        }
      }
      if (type === "VEHICLE") {
        var vehs = lead.vehicles || [];
        for (j = 0; j < vehs.length; j++) {
          if (vehs[j] && (vehs[j].vehicleId || vehs[j].id) === id) {
            return true;
          }
        }
      }
      if (type === "LOCATION") {
        var subject = model.subjectOf ? model.subjectOf(lead) : lead.person;
        var locs = (subject && subject.locations) || [];
        for (j = 0; j < locs.length; j++) {
          if (locs[j] && (locs[j].locationId || locs[j].id) === id) {
            return true;
          }
        }
      }
    }
    var encIds = Object.keys(state.encounters);
    for (i = 0; i < encIds.length; i++) {
      var enc = state.encounters[encIds[i]];
      if (!enc) {
        continue;
      }
      if (type === "PERSON") {
        var subjects = enc.subjects || [];
        for (j = 0; j < subjects.length; j++) {
          if (subjects[j] && subjects[j].personId === id) {
            return true;
          }
        }
      }
      if (type === "VEHICLE") {
        var eVeh = enc.vehicles || [];
        for (j = 0; j < eVeh.length; j++) {
          if (eVeh[j] && (eVeh[j].vehicleId || eVeh[j].id) === id) {
            return true;
          }
        }
      }
      if (type === "LOCATION") {
        var eLoc = enc.locations || [];
        for (j = 0; j < eLoc.length; j++) {
          if (eLoc[j] && (eLoc[j].locationId || eLoc[j].id) === id) {
            return true;
          }
        }
      }
    }
    return false;
  }

  function overlayIdentityOnto(objectType, fromId, toId) {
    var type = String(objectType || "").toUpperCase();
    if (type === "PERSON") {
      var fromP = state.people[fromId];
      var toP = state.people[toId];
      if (!fromP || !toP) {
        return;
      }
      toP.name = toP.name || {};
      fromP.name = fromP.name || {};
      if (fromP.name.lastName) {
        toP.name.lastName = fromP.name.lastName;
      }
      if (fromP.name.firstName) {
        toP.name.firstName = fromP.name.firstName;
      }
      if (fromP.name.middleName) {
        toP.name.middleName = fromP.name.middleName;
      }
      if (fromP.sex) {
        toP.sex = fromP.sex;
      }
      if (fromP.dateOfBirth) {
        toP.dateOfBirth = fromP.dateOfBirth;
      }
      return;
    }
    if (type === "VEHICLE") {
      var fromV = state.vehicles[fromId];
      var toV = state.vehicles[toId];
      if (!fromV || !toV) {
        return;
      }
      [
        "licensePlate",
        "plate",
        "plateState",
        "vehicleYear",
        "vehicleMake",
        "vehicleModel",
        "vehicleColor",
        "vehicleBodyStyle",
        "vin",
        "registeredOwnerName"
      ].forEach(function (key) {
        if (fromV[key]) {
          toV[key] = fromV[key];
        }
      });
      return;
    }
    if (type === "LOCATION") {
      var fromL = state.locations[fromId];
      var toL = state.locations[toId];
      if (!fromL || !toL) {
        return;
      }
      ["street", "street2", "city", "state", "zip"].forEach(function (key) {
        if (fromL[key]) {
          toL[key] = fromL[key];
        }
      });
      return;
    }
    if (type === "BUSINESS") {
      var fromB = state.businesses[fromId];
      var toB = state.businesses[toId];
      if (!fromB || !toB) {
        return;
      }
      if (fromB.name) {
        toB.name = fromB.name;
      }
      if (fromB.phone) {
        toB.phone = fromB.phone;
      }
      return;
    }
    if (type === "ENTITY") {
      var fromE = state.entities[fromId];
      var toE = state.entities[toId];
      if (!fromE || !toE) {
        return;
      }
      if (fromE.name) {
        toE.name = fromE.name;
      }
      if (fromE.kind) {
        toE.kind = fromE.kind;
      }
    }
  }

  function dropUnreferencedObject(objectType, objectId, skip) {
    if (objectIsReferenced(objectType, objectId, skip)) {
      return false;
    }
    var type = String(objectType || "").toUpperCase();
    var id = String(objectId || "");
    if (type === "PERSON") {
      delete state.people[id];
    } else if (type === "VEHICLE") {
      delete state.vehicles[id];
    } else if (type === "LOCATION") {
      delete state.locations[id];
    } else if (type === "BUSINESS") {
      delete state.businesses[id];
    } else if (type === "ENTITY") {
      delete state.entities[id];
    } else {
      return false;
    }
    dropAssociationsForObject(type, id);
    if (root.media && typeof root.media.removeByOwner === "function") {
      root.media.removeByOwner({ type: type, id: id }).then(
        function () {},
        function () {}
      );
    }
    return true;
  }

  function investigationIntegrity(investigationId) {
    var blank = { ok: false, issues: [], investigationId: investigationId || "" };
    adoptDisk();
    var inv = state.investigations[investigationId];
    if (!inv) {
      blank.issues.push({ code: "missing-investigation" });
      return blank;
    }
    var seen = {};
    var issues = [];
    ((inv.nodes || [])).forEach(function (node) {
      if (!node) {
        return;
      }
      var key = objectKey(node.objectType, node.objectId);
      if (seen[key]) {
        issues.push({
          code: "duplicate-node",
          nodeId: node.nodeId,
          objectType: node.objectType,
          objectId: node.objectId
        });
      }
      seen[key] = true;
      if (!objectExists(node.objectType, node.objectId)) {
        issues.push({
          code: "dangling-node",
          nodeId: node.nodeId,
          objectType: node.objectType,
          objectId: node.objectId
        });
      }
    });
    ((inv.links || [])).forEach(function (link) {
      if (!link || !link.from || !link.to) {
        issues.push({ code: "broken-link", linkId: (link && link.linkId) || "" });
        return;
      }
      var fromKey = objectKey(link.from.type, link.from.id);
      var toKey = objectKey(link.to.type, link.to.id);
      if (!seen[fromKey] || !seen[toKey]) {
        issues.push({
          code: "link-missing-node",
          linkId: link.linkId || ""
        });
      }
      if (link.associationId) {
        var asoc = state.associations && state.associations[link.associationId];
        if (!asoc) {
          issues.push({
            code: "dangling-association",
            linkId: link.linkId || "",
            associationId: link.associationId
          });
        }
      }
    });
    return {
      ok: issues.length === 0,
      issues: issues,
      investigationId: investigationId
    };
  }

  function associationIntegrity() {
    adoptDisk();
    var issues = [];
    Object.keys(state.associations || {}).forEach(function (id) {
      var row = state.associations[id];
      if (!row || !row.from || !row.to) {
        issues.push({ code: "broken-association", associationId: id });
        return;
      }
      var reason = row.reason || (row.reasons && row.reasons[0]) || "";
      if (reason && model.validateAssociationEnds) {
        var valid = model.validateAssociationEnds(row.from.type, row.to.type, reason);
        if (!valid || !valid.ok) {
          issues.push({
            code: "invalid-reason",
            associationId: id,
            reason: reason
          });
        }
      }
      if (row.from.id && !objectExists(row.from.type, row.from.id)) {
        issues.push({
          code: "dangling-from",
          associationId: id,
          objectType: row.from.type,
          objectId: row.from.id
        });
      }
      if (row.to.id && !objectExists(row.to.type, row.to.id)) {
        issues.push({
          code: "dangling-to",
          associationId: id,
          objectType: row.to.type,
          objectId: row.to.id
        });
      }
    });
    return { ok: issues.length === 0, issues: issues };
  }

  function dropSelfLinks(inv) {
    if (!inv) {
      return;
    }
    inv.links = (inv.links || []).filter(function (link) {
      if (!link || !link.from || !link.to) {
        return false;
      }
      return !(link.from.type === link.to.type && link.from.id === link.to.id);
    });
  }

  function collapseDuplicateNodes(inv, objectType, objectId) {
    if (!inv) {
      return;
    }
    var kept = null;
    ((inv.nodes || [])).forEach(function (node) {
      if (
        node &&
        node.objectType === objectType &&
        node.objectId === objectId &&
        !kept
      ) {
        kept = node;
      }
    });
    if (!kept) {
      return;
    }
    inv.nodes = (inv.nodes || []).filter(function (node) {
      if (!node) {
        return false;
      }
      if (
        node.objectType === objectType &&
        node.objectId === objectId &&
        node.nodeId !== kept.nodeId
      ) {
        if (inv.focusNodeId === node.nodeId) {
          inv.focusNodeId = kept.nodeId;
        }
        return false;
      }
      return true;
    });
  }

  function retargetObjectAcrossInvestigations(objectType, fromId, toId) {
    if (!fromId || !toId || fromId === toId) {
      return;
    }
    Object.keys(state.investigations).forEach(function (id) {
      var inv = state.investigations[id];
      if (!inv) {
        return;
      }
      ((inv.nodes || [])).forEach(function (node) {
        if (
          node &&
          node.objectType === objectType &&
          node.objectId === fromId
        ) {
          node.objectId = toId;
        }
      });
      rewriteInvestigationObjectId(inv, objectType, fromId, toId);
      if (objectType === "VEHICLE") {
        ((inv.plates || [])).forEach(function (plate) {
          if (plate && plate.vehicleId === fromId) {
            plate.vehicleId = toId;
          }
        });
      }
      collapseDuplicateNodes(inv, objectType, toId);
      dropSelfLinks(inv);
    });
    retargetAssociations(objectType, fromId, toId);
  }

  function rewriteInvestigationObjectId(inv, objectType, fromId, toId) {
    (inv.links || []).forEach(function (link) {
      if (!link) {
        return;
      }
      if (link.from && link.from.type === objectType && link.from.id === fromId) {
        link.from.id = toId;
      }
      if (link.to && link.to.type === objectType && link.to.id === fromId) {
        link.to.id = toId;
      }
    });
  }

  function retargetInvestigationNode(inv, node, nextId) {
    var oldId = node.objectId;
    if (!nextId || nextId === oldId) {
      return node.nodeId;
    }
    var existing = null;
    var i;
    for (i = 0; i < (inv.nodes || []).length; i++) {
      if (
        inv.nodes[i] &&
        inv.nodes[i].nodeId !== node.nodeId &&
        inv.nodes[i].objectType === node.objectType &&
        inv.nodes[i].objectId === nextId
      ) {
        existing = inv.nodes[i];
        break;
      }
    }
    rewriteInvestigationObjectId(inv, node.objectType, oldId, nextId);
    if (existing) {
      inv.nodes = inv.nodes.filter(function (row) {
        return row && row.nodeId !== node.nodeId;
      });
      if (inv.focusNodeId === node.nodeId) {
        inv.focusNodeId = existing.nodeId;
      }
      return existing.nodeId;
    }
    node.objectId = nextId;
    return node.nodeId;
  }

  function reuseInvestigationIdentity(investigationId, nodeId) {
    var blank = { ok: false, reused: false, objectId: "", nodeId: nodeId || "", error: "" };
    var fresh = adoptDisk();
    if (!fresh.ok) {
      blank.error = fresh.error;
      return blank;
    }
    var inv = state.investigations[investigationId]
      ? clone(state.investigations[investigationId])
      : null;
    if (!inv) {
      blank.error = "Investigation not found.";
      return blank;
    }
    var node = null;
    var i;
    for (i = 0; i < (inv.nodes || []).length; i++) {
      if (inv.nodes[i] && inv.nodes[i].nodeId === nodeId) {
        node = inv.nodes[i];
        break;
      }
    }
    if (!node) {
      blank.error = "Object not found on this investigation.";
      return blank;
    }
    var other = null;
    if (node.objectType === "VEHICLE") {
      var vehicle = getVehicleRecord(node.objectId);
      other =
        vehicle &&
        findVehicleByPlate(
          vehicle.plateState || "",
          vehicle.licensePlate || vehicle.plate || "",
          node.objectId
        );
      if (!other && vehicle) {
        other = restoreJunkedRecord(
          "VEHICLE",
          findVehicleByPlate(
            vehicle.plateState || "",
            vehicle.licensePlate || vehicle.plate || "",
            node.objectId,
            true
          )
        );
      }
      if (other) {
        other = { id: other.vehicleId || other.id };
      }
    } else if (node.objectType === "PERSON") {
      var person = getPerson(node.objectId);
      var match = person && findPersonByName(person.name, node.objectId);
      if (!match && person) {
        match = restoreJunkedRecord(
          "PERSON",
          findPersonByName(person.name, node.objectId, true)
        );
      }
      if (match) {
        other = { id: match.personId };
      }
    } else if (node.objectType === "LOCATION") {
      var loc = getLocationRecord(node.objectId);
      var locMatch = loc && findLocationByAddress(loc, node.objectId);
      if (!locMatch && loc) {
        locMatch = restoreJunkedRecord(
          "LOCATION",
          findLocationByAddress(loc, node.objectId, true)
        );
      }
      if (locMatch) {
        other = { id: locMatch.locationId || locMatch.id };
      }
    } else if (node.objectType === "BUSINESS") {
      var biz = getBusinessRecord(node.objectId);
      var bizMatch = biz && findBusinessByName(biz.name, node.objectId);
      if (!bizMatch && biz) {
        bizMatch = restoreJunkedRecord(
          "BUSINESS",
          findBusinessByName(biz.name, node.objectId, true)
        );
      }
      if (bizMatch) {
        other = { id: bizMatch.businessId || bizMatch.id };
      }
    } else if (node.objectType === "ENTITY") {
      var ent = getEntityRecord(node.objectId);
      var entMatch = ent && findEntityByName(ent.name, node.objectId);
      if (!entMatch && ent) {
        entMatch = restoreJunkedRecord(
          "ENTITY",
          findEntityByName(ent.name, node.objectId, true)
        );
      }
      if (entMatch) {
        other = { id: entMatch.entityId || entMatch.id };
      }
    }
    if (!other || !other.id) {
      return {
        ok: true,
        reused: false,
        objectId: node.objectId,
        nodeId: node.nodeId,
        error: ""
      };
    }
    var abandonedId = node.objectId;
    var abandonedType = node.objectType;
    var keptId = retargetInvestigationNode(inv, node, other.id);
    var saved = saveInvestigation(inv, {
      mode: model.isCommitted && model.isCommitted(inv) ? "commit" : "draft"
    });
    if (!saved.ok) {
      blank.error = saved.error || "Could not reuse that object.";
      return blank;
    }
    overlayIdentityOnto(abandonedType, abandonedId, other.id);
    retargetObjectAcrossInvestigations(abandonedType, abandonedId, other.id);
    dropUnreferencedObject(abandonedType, abandonedId);
    writeDisk();
    return {
      ok: true,
      reused: true,
      objectId: other.id,
      nodeId: keptId,
      error: ""
    };
  }

  function disconnectInvestigationLink(investigationId, linkId) {
    var blank = { ok: false, linkId: linkId || "", error: "" };
    var fresh = adoptDisk();
    if (!fresh.ok) {
      blank.error = fresh.error;
      return blank;
    }
    var inv = state.investigations[investigationId]
      ? clone(state.investigations[investigationId])
      : null;
    if (!inv) {
      blank.error = "Investigation not found.";
      return blank;
    }
    var before = (inv.links || []).length;
    inv.links = (inv.links || []).filter(function (row) {
      return row && row.linkId !== linkId;
    });
    if (inv.links.length === before) {
      blank.error = "Link not found.";
      return blank;
    }
    appendSystemNote(inv, "Removed a link.");
    var saved = saveInvestigation(inv, {
      mode: model.isCommitted && model.isCommitted(inv) ? "commit" : "draft"
    });
    if (!saved.ok) {
      blank.error = saved.error || "Could not remove the link.";
      return blank;
    }
    return { ok: true, linkId: linkId, error: "" };
  }

  function associateInvestigationObject(investigationId, hostNodeId, input) {
    input = input || {};
    var blank = {
      ok: false,
      objectType: "",
      objectId: "",
      personId: "",
      nodeId: "",
      associationId: "",
      reused: false,
      placed: false,
      error: ""
    };
    var fresh = adoptDisk();
    if (!fresh.ok) {
      blank.error = fresh.error;
      return blank;
    }
    var inv = state.investigations[investigationId];
    if (!inv) {
      blank.error = "Investigation not found.";
      return blank;
    }
    var host = null;
    var i;
    for (i = 0; i < (inv.nodes || []).length; i++) {
      if (inv.nodes[i] && inv.nodes[i].nodeId === hostNodeId) {
        host = inv.nodes[i];
        break;
      }
    }
    if (!host) {
      blank.error = "Focus an object first.";
      return blank;
    }
    var objectType = String(
      input.objectType || (input.personId ? "PERSON" : "") || "PERSON"
    ).toUpperCase();
    var objectId = input.objectId || input.personId || "";
    var label = String(input.label || input.name || "").trim();
    if (!objectId) {
      if (objectType === "PERSON") {
        var parsedName = nameFromLabel(label);
        if (!parsedName.lastName && !parsedName.firstName) {
          blank.error = "Type a name.";
          return blank;
        }
      } else if (objectType === "VEHICLE") {
        var plateBits = parsePlateLabel(label);
        if (!plateBits.plate) {
          blank.error = "Type a plate.";
          return blank;
        }
      } else if (objectType === "LOCATION") {
        var addr = parseAddressLabel(label);
        if (!addr.street && !addr.city) {
          blank.error = "Type a street or city.";
          return blank;
        }
      } else if (objectType === "BUSINESS" || objectType === "ENTITY") {
        if (!label) {
          blank.error = "Type a name.";
          return blank;
        }
      } else {
        blank.error = "Pick an object type.";
        return blank;
      }
    }
    var reason = String(input.reason || "").trim();
    if (!reason && objectType === "PERSON" && model.defaultPersonAssociationReason) {
      reason = model.defaultPersonAssociationReason(host.objectType);
    }
    if (
      !reason &&
      ((host.objectType === "PERSON" && objectType === "BUSINESS") ||
        (host.objectType === "BUSINESS" && objectType === "PERSON"))
    ) {
      reason = "CUSTOMER_OF";
    }
    if (!reason) {
      reason = defaultInvestigationReason(host.objectType, objectType);
    }
    if (!reason) {
      blank.error = "Those objects cannot be linked.";
      return blank;
    }
    var already = null;
    if (objectId) {
      for (i = 0; i < (inv.nodes || []).length; i++) {
        if (
          inv.nodes[i] &&
          inv.nodes[i].objectType === objectType &&
          inv.nodes[i].objectId === objectId
        ) {
          already = inv.nodes[i];
          break;
        }
      }
    }
    var payload = {
      objectType: objectType,
      objectId: objectId,
      fromNodeId: host.nodeId,
      reason: reason,
      x: Number(host.x || 0) + 300,
      y: Number(host.y || 0),
      focus: false
    };
    if (objectType === "PERSON") {
      payload.name = input.name || label;
      payload.label = label;
    } else if (objectType === "VEHICLE") {
      var plate = parsePlateLabel(label);
      payload.licensePlate = plate.plate;
      payload.plate = plate.plate;
      payload.plateState = plate.state;
    } else if (objectType === "LOCATION") {
      var loc = parseAddressLabel(label);
      payload.street = loc.street;
      payload.city = loc.city;
      payload.state = loc.state;
      payload.zip = loc.zip;
    } else if (objectType === "BUSINESS" || objectType === "ENTITY") {
      payload.name = label;
    }
    var result = addInvestigationObject(investigationId, payload);
    if (!result || !result.ok) {
      blank.error = (result && result.error) || "Could not add that object.";
      return blank;
    }
    if (
      ((host.objectType === "VEHICLE" && objectType === "PERSON") ||
        (host.objectType === "PERSON" && objectType === "VEHICLE")) &&
      reason === "REGISTERED_OWNER_OF"
    ) {
      var vehicleId = host.objectType === "VEHICLE" ? host.objectId : result.objectId;
      var personId = host.objectType === "PERSON" ? host.objectId : result.objectId;
      var vehicle = getVehicleRecord(vehicleId);
      if (vehicle && !String(vehicle.registeredOwnerName || "").trim()) {
        vehicle.registeredOwnerName = investigationObjectLabel("PERSON", personId);
        saveVehicleRecord(vehicle, { mode: "commit" });
      }
    }
    return {
      ok: true,
      objectType: objectType,
      objectId: result.objectId,
      personId: objectType === "PERSON" ? result.objectId : "",
      nodeId: result.nodeId,
      associationId: result.associationId || "",
      reused: !!result.reused,
      placed: !already,
      error: ""
    };
  }

  function associateInvestigationPerson(investigationId, hostNodeId, input) {
    input = input || {};
    input.objectType = "PERSON";
    if (input.personId && !input.objectId) {
      input.objectId = input.personId;
    }
    return associateInvestigationObject(investigationId, hostNodeId, input);
  }

  function listObjects(objectType, includeJunked) {
    adoptDisk();
    var type = String(objectType || "").toUpperCase();
    var map = null;
    var idKey = "";
    if (type === "PERSON") {
      map = state.people;
      idKey = "personId";
    } else if (type === "VEHICLE") {
      map = state.vehicles;
      idKey = "vehicleId";
    } else if (type === "LOCATION") {
      map = state.locations;
      idKey = "locationId";
    } else if (type === "BUSINESS") {
      map = state.businesses;
      idKey = "businessId";
    } else if (type === "ENTITY") {
      map = state.entities;
      idKey = "entityId";
    }
    if (!map) {
      return [];
    }
    var out = [];
    Object.keys(map).forEach(function (id) {
      var row = map[id];
      if (!row) {
        return;
      }
      if (!includeJunked && isJunked(row)) {
        return;
      }
      var copy = clone(row);
      if (!copy[idKey]) {
        copy[idKey] = id;
      }
      out.push(copy);
    });
    return out;
  }

  function associateCaseObject(leadId, input) {
    input = input || {};
    var blank = {
      ok: false,
      leadId: leadId || "",
      objectType: "",
      objectId: "",
      associationId: "",
      linkId: "",
      reused: false,
      error: ""
    };
    var fresh = adoptDisk();
    if (!fresh.ok) {
      blank.error = fresh.error;
      return blank;
    }
    var lead = state.leads[leadId] ? clone(state.leads[leadId]) : null;
    if (!lead) {
      blank.error = "Case not found.";
      return blank;
    }
    var person = model.subjectOf ? model.subjectOf(lead) : lead.person;
    var personId = (person && person.personId) || lead.subjectPersonId || "";
    if (!personId) {
      blank.error = "Case has no subject.";
      return blank;
    }
    var objectType = String(input.objectType || "PERSON").toUpperCase();
    var objectId = String(input.objectId || input.personId || "").trim();
    var label = String(input.label || input.name || "").trim();
    var notes = String(input.notes || "").trim();
    var reason = String(input.reason || "").trim();
    if (objectType === "OTHER") {
      if (!label) {
        blank.error = "Enter a name.";
        return blank;
      }
      lead.links = Array.isArray(lead.links) ? lead.links : [];
      var otherLink = model.createLink
        ? model.createLink({
            label: label,
            otherType: "OTHER",
            from: { type: "PERSON", id: personId },
            to: { type: "OTHER", id: "" },
            reasons: reason ? [reason] : [],
            notes: notes
          })
        : {
            linkId: model.newId("link"),
            label: label,
            otherType: "OTHER",
            from: { type: "PERSON", id: personId },
            to: { type: "OTHER", id: "" },
            reasons: reason ? [reason] : [],
            notes: notes
          };
      if (input.linkId) {
        otherLink.linkId = input.linkId;
      }
      var replaced = false;
      var i;
      for (i = 0; i < lead.links.length; i++) {
        if (lead.links[i] && lead.links[i].linkId === otherLink.linkId) {
          lead.links[i] = otherLink;
          replaced = true;
          break;
        }
      }
      if (!replaced) {
        lead.links.push(otherLink);
      }
      var savedOther = saveLead(lead, {
        mode: model.isCommitted && model.isCommitted(lead) ? "commit" : "draft"
      });
      if (!savedOther.ok) {
        blank.error = savedOther.error || "Could not save.";
        return blank;
      }
      return {
        ok: true,
        leadId: lead.leadId,
        objectType: "OTHER",
        objectId: "",
        associationId: "",
        linkId: otherLink.linkId,
        reused: false,
        error: ""
      };
    }
    if (!reason) {
      if (objectType === "PERSON" && model.defaultPersonAssociationReason) {
        reason = model.defaultPersonAssociationReason("PERSON");
      }
      if (!reason && objectType === "BUSINESS") {
        reason = "CUSTOMER_OF";
      }
      if (!reason) {
        reason = defaultInvestigationReason("PERSON", objectType);
      }
    }
    if (!reason) {
      blank.error = "Pick a relationship.";
      return blank;
    }
    var payload = {
      objectType: objectType,
      objectId: objectId,
      label: label,
      name: input.name || label
    };
    if (input.objectRecord && typeof input.objectRecord === "object") {
      var savedObject = saveObjectRecord(objectType, input.objectRecord, {
        mode: "commit"
      });
      if (!savedObject || !savedObject.ok) {
        blank.error =
          (savedObject && savedObject.error) || "Could not save that object.";
        return blank;
      }
      objectId = savedObject.objectId;
      payload.objectId = objectId;
      label = investigationObjectLabel(objectType, objectId) || label;
    }
    if (objectType === "VEHICLE") {
      var plate = parsePlateLabel(label);
      payload.licensePlate = plate.plate;
      payload.plate = plate.plate;
      payload.plateState = plate.state;
    }
    if (objectType === "LOCATION") {
      var addr = parseAddressLabel(label);
      payload.street = addr.street;
      payload.city = addr.city;
      payload.state = addr.state;
      payload.zip = addr.zip;
    }
    if (!objectId) {
      if (objectType === "PERSON") {
        var parsedName = nameFromLabel(label);
        if (!parsedName.lastName && !parsedName.firstName) {
          blank.error = "Type a name.";
          return blank;
        }
      } else if (objectType === "VEHICLE" && !payload.licensePlate) {
        blank.error = "Type a plate.";
        return blank;
      } else if (objectType === "LOCATION" && !payload.street && !payload.city) {
        blank.error = "Type a street or city.";
        return blank;
      } else if (
        (objectType === "BUSINESS" || objectType === "ENTITY") &&
        !label
      ) {
        blank.error = "Type a name.";
        return blank;
      }
    }
    var resolved = resolveObjectRecord(objectType, payload);
    if (!resolved || !resolved.ok) {
      blank.error = (resolved && resolved.error) || "Could not save that object.";
      return blank;
    }
    objectId = resolved.objectId;
    var associationInput = {
      from: { type: "PERSON", id: personId },
      to: { type: objectType, id: objectId },
      reason: reason,
      notes: notes,
      label: investigationObjectLabel(objectType, objectId),
      source: { leadId: lead.leadId }
    };
    var asoc = input.associationId && state.associations[input.associationId]
      ? saveAssociationRecord(input.associationId, associationInput, {
          skipAdopt: true,
          persist: true
        })
      : upsertAssociation(associationInput, {
          skipAdopt: true,
          persist: true
        });
    if (!asoc || !asoc.ok) {
      blank.error = (asoc && asoc.error) || "Could not save the association.";
      return blank;
    }
    lead = state.leads[leadId] ? clone(state.leads[leadId]) : lead;
    lead.links = Array.isArray(lead.links) ? lead.links : [];
    var link = null;
    for (i = 0; i < lead.links.length; i++) {
      var row = lead.links[i];
      if (!row) {
        continue;
      }
      if (input.linkId && row.linkId === input.linkId) {
        link = row;
        break;
      }
      if (row.associationId && row.associationId === asoc.associationId) {
        link = row;
        break;
      }
    }
    var display = investigationObjectLabel(objectType, objectId);
    if (!link) {
      link = model.createLink
        ? model.createLink({
            from: { type: "PERSON", id: personId },
            to: { type: objectType, id: objectId },
            otherType: objectType,
            reasons: [reason],
            notes: notes,
            label: display,
            associationId: asoc.associationId
          })
        : {
            linkId: model.newId("link"),
            from: { type: "PERSON", id: personId },
            to: { type: objectType, id: objectId },
            otherType: objectType,
            reasons: [reason],
            notes: notes,
            label: display,
            associationId: asoc.associationId
          };
      if (input.linkId) {
        link.linkId = input.linkId;
      }
      lead.links.push(link);
    } else {
      link.to = { type: objectType, id: objectId };
      link.otherType = objectType;
      link.reasons = [reason];
      link.notes = notes;
      link.label = display;
      link.associationId = asoc.associationId;
    }
    var saved = saveLead(lead, {
      mode: model.isCommitted && model.isCommitted(lead) ? "commit" : "draft"
    });
    if (!saved.ok) {
      blank.error = saved.error || "Could not save.";
      return blank;
    }
    return {
      ok: true,
      leadId: lead.leadId,
      objectType: objectType,
      objectId: objectId,
      associationId: asoc.associationId,
      linkId: link.linkId,
      reused: !!resolved.reused,
      error: ""
    };
  }

  function removeCaseLink(leadId, linkId) {
    var blank = {
      ok: false,
      leadId: leadId || "",
      linkId: linkId || "",
      removed: false,
      error: ""
    };
    var fresh = adoptDisk();
    if (!fresh.ok) {
      blank.error = fresh.error;
      return blank;
    }
    var lead = state.leads[leadId] ? clone(state.leads[leadId]) : null;
    if (!lead) {
      blank.error = "Case not found.";
      return blank;
    }
    var before = (lead.links || []).length;
    lead.links = (lead.links || []).filter(function (row) {
      return !row || row.linkId !== linkId;
    });
    if (lead.links.length === before) {
      return {
        ok: true,
        leadId: lead.leadId,
        linkId: linkId || "",
        removed: false,
        error: ""
      };
    }
    var saved = saveLead(lead, {
      mode: model.isCommitted && model.isCommitted(lead) ? "commit" : "draft"
    });
    if (!saved.ok) {
      blank.error = saved.error || "Could not save.";
      return blank;
    }
    return {
      ok: true,
      leadId: lead.leadId,
      linkId: linkId,
      removed: true,
      error: ""
    };
  }

  function setInvestigationAssociationReason(investigationId, associationId, reason) {
    var blank = {
      ok: false,
      associationId: associationId || "",
      error: ""
    };
    var changed = setAssociationReason(associationId, reason);
    if (!changed.ok) {
      return changed;
    }
    var fresh = adoptDisk();
    if (!fresh.ok) {
      blank.error = fresh.error;
      return blank;
    }
    var inv = state.investigations[investigationId]
      ? clone(state.investigations[investigationId])
      : null;
    if (!inv) {
      return { ok: true, associationId: associationId, error: "" };
    }
    var asoc = state.associations[associationId];
    var nextReason = (asoc && asoc.reason) || reason;
    (inv.links || []).forEach(function (link) {
      if (!link || link.associationId !== associationId) {
        return;
      }
      link.reasons = [nextReason];
      if (asoc && asoc.from && asoc.to) {
        link.from = { type: asoc.from.type, id: asoc.from.id };
        link.to = { type: asoc.to.type, id: asoc.to.id };
      }
    });
    var saved = saveInvestigation(inv, {
      mode: model.isCommitted && model.isCommitted(inv) ? "commit" : "draft"
    });
    if (!saved.ok) {
      blank.error = saved.error || "Could not update the link.";
      return blank;
    }
    return { ok: true, associationId: associationId, error: "" };
  }

  function disconnectInvestigationAssociation(investigationId, associationId) {
    var blank = {
      ok: false,
      associationId: associationId || "",
      removed: false,
      error: ""
    };
    var fresh = adoptDisk();
    if (!fresh.ok) {
      blank.error = fresh.error;
      return blank;
    }
    var inv = state.investigations[investigationId]
      ? clone(state.investigations[investigationId])
      : null;
    if (!inv) {
      blank.error = "Investigation not found.";
      return blank;
    }
    var before = (inv.links || []).length;
    inv.links = (inv.links || []).filter(function (row) {
      return !row || row.associationId !== associationId;
    });
    if (inv.links.length === before) {
      return {
        ok: true,
        associationId: associationId,
        removed: false,
        error: ""
      };
    }
    appendSystemNote(inv, "Removed a link.");
    var saved = saveInvestigation(inv, {
      mode: model.isCommitted && model.isCommitted(inv) ? "commit" : "draft"
    });
    if (!saved.ok) {
      blank.error = saved.error || "Could not remove the link.";
      return blank;
    }
    return {
      ok: true,
      associationId: associationId,
      removed: true,
      error: ""
    };
  }

  function stripObjectFromInvestigation(inv, objectType, objectId) {
    var key = objectKey(objectType, objectId);
    var dropped = {};
    inv.nodes = (inv.nodes || []).filter(function (row) {
      if (row && row.objectType === objectType && row.objectId === objectId) {
        dropped[row.nodeId] = true;
        return false;
      }
      return !!row;
    });
    inv.links = (inv.links || []).filter(function (link) {
      if (!link || !link.from || !link.to) {
        return false;
      }
      return (
        objectKey(link.from.type, link.from.id) !== key &&
        objectKey(link.to.type, link.to.id) !== key
      );
    });
    if (String(objectType || "").toUpperCase() === "VEHICLE") {
      (inv.plates || []).forEach(function (plate) {
        if (
          plate &&
          plate.vehicleId === objectId &&
          plate.status === "promoted"
        ) {
          plate.status = "hit";
        }
      });
    }
    if (dropped[inv.focusNodeId]) {
      inv.focusNodeId = "";
    }
    return Object.keys(dropped).length;
  }

  function objectIsCaseSubject(objectId) {
    var id = String(objectId || "");
    if (!id) {
      return false;
    }
    var leadIds = Object.keys(state.leads);
    var i;
    for (i = 0; i < leadIds.length; i++) {
      var lead = state.leads[leadIds[i]];
      if (lead && (lead.subjectPersonId === id || (lead.person && lead.person.personId === id))) {
        return true;
      }
    }
    return false;
  }

  function setRecordJunked(objectType, objectId, junked) {
    var type = String(objectType || "").toUpperCase();
    var id = String(objectId || "");
    var rec = null;
    if (type === "PERSON") {
      rec = state.people[id];
    } else if (type === "VEHICLE") {
      rec = state.vehicles[id];
    } else if (type === "LOCATION") {
      rec = state.locations[id];
    } else if (type === "BUSINESS") {
      rec = state.businesses[id];
    } else if (type === "ENTITY") {
      rec = state.entities[id];
    }
    if (!rec) {
      return false;
    }
    rec.junked = !!junked;
    rec.junkedAt = junked ? model.nowIso() : "";
    return true;
  }

  /**
   * Drop a node from this investigation wall. Keeps the shared
   * person/vehicle/location/business/entity. Drops links on this
   * investigation only. Promoted plates for a removed vehicle return to hit.
   */
  function removeInvestigationObject(investigationId, nodeId) {
    var blank = {
      ok: false,
      nodeId: nodeId || "",
      objectType: "",
      objectId: "",
      error: ""
    };
    var fresh = adoptDisk();
    if (!fresh.ok) {
      blank.error = fresh.error;
      return blank;
    }
    var inv = state.investigations[investigationId]
      ? clone(state.investigations[investigationId])
      : null;
    if (!inv) {
      blank.error = "Investigation not found.";
      return blank;
    }
    var wanted = String(nodeId || "").trim();
    var node = null;
    var i;
    for (i = 0; i < (inv.nodes || []).length; i++) {
      if (inv.nodes[i] && inv.nodes[i].nodeId === wanted) {
        node = inv.nodes[i];
        break;
      }
    }
    if (!node) {
      blank.error = "Focus an object to remove it from the wall.";
      return blank;
    }
    var label = investigationObjectLabel(node.objectType, node.objectId) || "object";
    stripObjectFromInvestigation(inv, node.objectType, node.objectId);
    appendSystemNote(inv, "Removed " + label + " from the wall.");
    var saved = saveInvestigation(inv, {
      mode: model.isCommitted && model.isCommitted(inv) ? "commit" : "draft"
    });
    if (!saved.ok) {
      blank.error = saved.error || "Could not remove that object.";
      return blank;
    }
    return {
      ok: true,
      nodeId: node.nodeId,
      objectType: node.objectType,
      objectId: node.objectId,
      error: ""
    };
  }

  /**
   * Empty this investigation's wall and plate queue.
   * Does not delete people/vehicles/locations/businesses/entities.
   * Does not change child or parent investigations.
   */
  function clearInvestigationWorkspace(investigationId) {
    var blank = {
      ok: false,
      investigationId: investigationId || "",
      cleared: false,
      error: ""
    };
    var fresh = adoptDisk();
    if (!fresh.ok) {
      blank.error = fresh.error;
      return blank;
    }
    var inv = state.investigations[investigationId]
      ? clone(state.investigations[investigationId])
      : null;
    if (!inv) {
      blank.error = "Investigation not found.";
      return blank;
    }
    var nodeCount = (inv.nodes || []).length;
    var linkCount = (inv.links || []).length;
    var plateCount = (inv.plates || []).length;
    if (!nodeCount && !linkCount && !plateCount && !inv.focusNodeId) {
      return {
        ok: true,
        investigationId: inv.investigationId,
        cleared: false,
        error: ""
      };
    }
    inv.nodes = [];
    inv.links = [];
    inv.plates = [];
    inv.focusNodeId = "";
    appendSystemNote(inv, "Cleared the workspace.");
    var saved = saveInvestigation(inv, {
      mode: model.isCommitted && model.isCommitted(inv) ? "commit" : "draft"
    });
    if (!saved.ok) {
      blank.error = saved.error || "Could not clear the workspace.";
      return blank;
    }
    return {
      ok: true,
      investigationId: inv.investigationId,
      cleared: true,
      error: ""
    };
  }

  function objectDisposition(objectType, objectId, skip) {
    adoptDisk();
    var rec = null;
    var type = String(objectType || "").toUpperCase();
    if (type === "PERSON") {
      rec = state.people[objectId];
    } else if (type === "VEHICLE") {
      rec = state.vehicles[objectId];
    } else if (type === "LOCATION") {
      rec = state.locations[objectId];
    } else if (type === "BUSINESS") {
      rec = state.businesses[objectId];
    } else if (type === "ENTITY") {
      rec = state.entities[objectId];
    }
    var caseSubject = type === "PERSON" && objectIsCaseSubject(objectId);
    var referenced = objectIsReferenced(objectType, objectId, skip);
    return {
      junked: isJunked(rec),
      caseSubject: caseSubject,
      referenced: referenced,
      canJunk: !!rec && !isJunked(rec) && !caseSubject,
      canDelete: !!rec && !caseSubject && !referenced
    };
  }

  function junkInvestigationObject(investigationId, nodeId) {
    var blank = { ok: false, objectId: "", objectType: "", error: "" };
    var fresh = adoptDisk();
    if (!fresh.ok) {
      blank.error = fresh.error;
      return blank;
    }
    var inv = state.investigations[investigationId]
      ? clone(state.investigations[investigationId])
      : null;
    if (!inv) {
      blank.error = "Investigation not found.";
      return blank;
    }
    var node = null;
    var i;
    for (i = 0; i < (inv.nodes || []).length; i++) {
      if (inv.nodes[i] && inv.nodes[i].nodeId === nodeId) {
        node = inv.nodes[i];
        break;
      }
    }
    if (!node) {
      blank.error = "Focus an object to junk it.";
      return blank;
    }
    if (node.objectType === "PERSON" && objectIsCaseSubject(node.objectId)) {
      blank.error = "Cannot junk a person who is a case subject.";
      return blank;
    }
    var label = investigationObjectLabel(node.objectType, node.objectId) || "object";
    if (!setRecordJunked(node.objectType, node.objectId, true)) {
      blank.error = "Record not found.";
      return blank;
    }
    setAssociationsJunkedForObject(node.objectType, node.objectId, true);
    Object.keys(state.investigations).forEach(function (id) {
      var row = id === investigationId ? inv : clone(state.investigations[id]);
      stripObjectFromInvestigation(row, node.objectType, node.objectId);
      if (id === investigationId) {
        appendSystemNote(row, "Junked " + label + ".");
      }
      state.investigations[id] = row;
    });
    writeDisk();
    return {
      ok: true,
      objectType: node.objectType,
      objectId: node.objectId,
      error: ""
    };
  }

  function deleteInvestigationObject(investigationId, nodeId) {
    var blank = { ok: false, objectId: "", objectType: "", error: "" };
    var fresh = adoptDisk();
    if (!fresh.ok) {
      blank.error = fresh.error;
      return blank;
    }
    var inv = state.investigations[investigationId]
      ? clone(state.investigations[investigationId])
      : null;
    if (!inv) {
      blank.error = "Investigation not found.";
      return blank;
    }
    var node = null;
    var i;
    for (i = 0; i < (inv.nodes || []).length; i++) {
      if (inv.nodes[i] && inv.nodes[i].nodeId === nodeId) {
        node = inv.nodes[i];
        break;
      }
    }
    if (!node) {
      blank.error = "Focus an object to delete it.";
      return blank;
    }
    if (node.objectType === "PERSON" && objectIsCaseSubject(node.objectId)) {
      blank.error = "Cannot delete a person who is a case subject.";
      return blank;
    }
    if (
      objectIsReferenced(node.objectType, node.objectId, {
        investigationId: inv.investigationId,
        nodeId: node.nodeId
      })
    ) {
      blank.objectType = node.objectType;
      blank.objectId = node.objectId;
      blank.error = "Cannot delete: this record is still on another wall or a case. Junk it, or remove it from other walls first.";
      return blank;
    }
    var label = investigationObjectLabel(node.objectType, node.objectId) || "object";
    stripObjectFromInvestigation(inv, node.objectType, node.objectId);
    appendSystemNote(inv, "Deleted " + label + ".");
    var saved = saveInvestigation(inv, {
      mode: model.isCommitted && model.isCommitted(inv) ? "commit" : "draft"
    });
    if (!saved.ok) {
      blank.error = saved.error || "Could not update the investigation.";
      return blank;
    }
    dropUnreferencedObject(node.objectType, node.objectId);
    writeDisk();
    return {
      ok: true,
      objectType: node.objectType,
      objectId: node.objectId,
      error: ""
    };
  }

  function objectKey(type, id) {
    return String(type || "") + "|" + String(id || "");
  }

  function spawnInvestigation(parentId, opts) {
    opts = opts || {};
    var blank = {
      ok: false,
      investigationId: "",
      parentInvestigationId: parentId || "",
      error: ""
    };
    var fresh = adoptDisk();
    if (!fresh.ok) {
      blank.error = fresh.error;
      return blank;
    }
    var parent = state.investigations[parentId]
      ? clone(state.investigations[parentId])
      : null;
    if (!parent) {
      blank.error = "Investigation not found.";
      return blank;
    }
    var focus = null;
    var i;
    for (i = 0; i < (parent.nodes || []).length; i++) {
      if (parent.nodes[i] && parent.nodes[i].nodeId === parent.focusNodeId) {
        focus = parent.nodes[i];
        break;
      }
    }
    if (!focus) {
      blank.error = "Focus an object to spawn a child investigation.";
      return blank;
    }
    var seed = {};
    seed[objectKey(focus.objectType, focus.objectId)] = true;
    (parent.links || []).forEach(function (link) {
      if (!link || !link.from || !link.to) {
        return;
      }
      var fromKey = objectKey(link.from.type, link.from.id);
      var toKey = objectKey(link.to.type, link.to.id);
      var focusKey = objectKey(focus.objectType, focus.objectId);
      if (fromKey === focusKey) {
        seed[toKey] = true;
      }
      if (toKey === focusKey) {
        seed[fromKey] = true;
      }
    });
    var nodes = [];
    var focusNodeId = "";
    (parent.nodes || []).forEach(function (row) {
      if (!row || !seed[objectKey(row.objectType, row.objectId)]) {
        return;
      }
      var node = model.createInvestigationNode
        ? model.createInvestigationNode({
            objectType: row.objectType,
            objectId: row.objectId,
            x: typeof row.x === "number" ? row.x : 48,
            y: typeof row.y === "number" ? row.y : 48
          })
        : {
            nodeId: model.newId("node"),
            objectType: row.objectType,
            objectId: row.objectId,
            x: typeof row.x === "number" ? row.x : 48,
            y: typeof row.y === "number" ? row.y : 48
          };
      nodes.push(node);
      if (
        row.objectType === focus.objectType &&
        row.objectId === focus.objectId
      ) {
        focusNodeId = node.nodeId;
      }
    });
    var links = [];
    (parent.links || []).forEach(function (row) {
      if (!row || !row.from || !row.to) {
        return;
      }
      if (!seed[objectKey(row.from.type, row.from.id)]) {
        return;
      }
      if (!seed[objectKey(row.to.type, row.to.id)]) {
        return;
      }
      var link = model.createLink
        ? model.createLink({
            from: { type: row.from.type, id: row.from.id },
            to: { type: row.to.type, id: row.to.id },
            reasons: (row.reasons || []).slice(),
            notes: row.notes || "",
            label: row.label || "",
            otherType: row.otherType || row.to.type,
            associationId: row.associationId || ""
          })
        : {
            linkId: model.newId("link"),
            associationId: row.associationId || "",
            from: { type: row.from.type, id: row.from.id },
            to: { type: row.to.type, id: row.to.id },
            reasons: (row.reasons || []).slice(),
            notes: row.notes || "",
            label: row.label || "",
            otherType: row.otherType || row.to.type
          };
      if (!link.associationId) {
        citeWallAssociation(
          link,
          row.from.type,
          row.from.id,
          row.to.type,
          row.to.id,
          (row.reasons && row.reasons[0]) || row.reason || "",
          parent.investigationId
        );
      }
      links.push(link);
    });
    var kind = opts.kind || parent.kind || "tag";
    var child = model.createInvestigation
      ? model.createInvestigation({
          kind: kind,
          mode: opts.mode || (kind === "tag" ? parent.mode : "") || "",
          team: parent.team,
          parentInvestigationId: parent.investigationId,
          sourceLeadId: parent.sourceLeadId || "",
          assignedOfficerId: parent.assignedOfficerId || "",
          title:
            opts.title != null
              ? opts.title
              : investigationObjectLabel(focus.objectType, focus.objectId),
          nodes: nodes,
          links: links,
          plates: [],
          focusNodeId: focusNodeId,
          existingIds: Object.keys(state.investigations)
        })
      : {
          investigationId: model.newId("inv"),
          parentInvestigationId: parent.investigationId,
          kind: kind,
          nodes: nodes,
          links: links,
          plates: [],
          focusNodeId: focusNodeId,
          history: []
        };
    var label = investigationObjectLabel(focus.objectType, focus.objectId);
    appendSystemNote(
      child,
      "Spawned from " + parent.investigationId + " focusing " + label + "."
    );
    var savedChild = saveInvestigation(child, { mode: "draft" });
    if (!savedChild.ok) {
      blank.error = savedChild.error || "Could not save the child investigation.";
      return blank;
    }
    appendSystemNote(
      parent,
      "Spawned child " + child.investigationId + " focusing " + label + "."
    );
    saveInvestigation(parent, {
      mode: model.isCommitted && model.isCommitted(parent) ? "commit" : "draft"
    });
    return {
      ok: true,
      investigationId: child.investigationId,
      parentInvestigationId: parent.investigationId,
      nodeCount: nodes.length,
      error: ""
    };
  }

  function promoteInvestigationPlate(investigationId, plateId, opts) {
    var fresh = adoptDisk();
    if (!fresh.ok) {
      return { ok: false, vehicleId: "", nodeId: "", error: fresh.error };
    }
    var inv = state.investigations[investigationId]
      ? clone(state.investigations[investigationId])
      : null;
    if (!inv) {
      return {
        ok: false,
        vehicleId: "",
        nodeId: "",
        error: "Investigation not found."
      };
    }
    var plate = null;
    var i;
    for (i = 0; i < (inv.plates || []).length; i++) {
      if (inv.plates[i] && inv.plates[i].plateId === plateId) {
        plate = inv.plates[i];
        break;
      }
    }
    if (!plate) {
      return { ok: false, vehicleId: "", nodeId: "", error: "Plate not found." };
    }
    if (plate.status === "discarded") {
      return {
        ok: false,
        vehicleId: "",
        nodeId: "",
        error: "Discarded plates cannot be promoted."
      };
    }
    var vehicle = plate.vehicleId ? getVehicleRecord(plate.vehicleId) : null;
    if (!vehicle) {
      vehicle = findVehicleByPlate(plate.state, plate.plate);
    }
    if (!vehicle) {
      vehicle = model.createVehicle
        ? model.createVehicle({
            licensePlate: plate.plate,
            plate: plate.plate,
            plateState: plate.state || "",
            governmentVehicle: false
          })
        : {
            vehicleId: model.newId("veh"),
            licensePlate: plate.plate,
            plateState: plate.state || ""
          };
      var savedVeh = saveVehicleRecord(vehicle, { mode: "commit" });
      if (!savedVeh.ok) {
        return {
          ok: false,
          vehicleId: "",
          nodeId: "",
          error: savedVeh.error || "Could not save the vehicle."
        };
      }
      vehicle = getVehicleRecord(savedVeh.vehicleId);
    }
    var vehicleId = vehicle.vehicleId || vehicle.id;
    opts = opts || {};
    var node = ensureInvestigationNode(inv, "VEHICLE", vehicleId, {
      x: typeof opts.x === "number" ? opts.x : undefined,
      y: typeof opts.y === "number" ? opts.y : undefined
    });
    if (typeof opts.x === "number") {
      node.x = opts.x;
    } else if (typeof node.x !== "number") {
      node.x = 48;
    }
    if (typeof opts.y === "number") {
      node.y = opts.y;
    } else if (typeof node.y !== "number") {
      node.y = 48;
    }
    plate.status = "promoted";
    plate.vehicleId = vehicleId;
    inv.focusNodeId = node.nodeId;
    var plateLabel = [plate.state, plate.plate].filter(Boolean).join(" ");
    appendSystemNote(inv, "Promoted plate " + plateLabel + " to a vehicle.");
    var savedInv = saveInvestigation(inv, {
      mode: model.isCommitted && model.isCommitted(inv) ? "commit" : "draft"
    });
    if (!savedInv.ok) {
      return {
        ok: false,
        vehicleId: vehicleId,
        nodeId: node.nodeId,
        error: savedInv.error || "Could not update the investigation."
      };
    }
    return {
      ok: true,
      vehicleId: vehicleId,
      nodeId: node.nodeId,
      existing: Boolean(plate.vehicleId && plate.status === "promoted"),
      error: ""
    };
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
          markedComplete: !!(row.meta && row.meta.markedComplete),
          completedAt: (row.meta && row.meta.completedAt) || "",
          subjects: Array.isArray(row.subjects) ? row.subjects.slice() : [],
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
    listArrests: listArrests,
    relatedCommittedCases: relatedCommittedCases,
    promoteAssociateToCase: promoteAssociateToCase,
    promoteInvestigationPersonToCase: promoteInvestigationPersonToCase,
    promoteBookInToLead: promoteBookInToLead,
    bookInPromotionInput: bookInPromotionInput,
    promoteBookInRecord: promoteBookInRecord,
    promoteBookInRecords: promoteBookInRecords,
    linkEncounterVehiclesToPerson: linkEncounterVehiclesToPerson,
    allPeople: allPeople,
    getPerson: getPerson,
    upsertPerson: upsertPerson,
    normalizeEncounterSubject: normalizeEncounterSubjectForStore,
    normalizeEncounterSubjects: normalizeEncounterSubjectsForStore,
    mergeEncounterSubjects: mergeEncounterSubjectsForStore,
    validateEncounterSubjectRoster: validateEncounterSubjectRoster,
    saveEncounter: saveEncounter,
    unlinkEncounterSubjectBooking: unlinkEncounterSubjectBooking,
    updateEncounter: updateEncounter,
    unlockEncounter: unlockEncounter,
    completeEncounter: completeEncounter,
    applyEncounterLocationToArrests: applyEncounterLocationToArrests,
    getEncounter: getEncounter,
    deleteEncounter: deleteEncounter,
    listEncounters: listEncounters,
    saveInvestigation: saveInvestigation,
    getInvestigation: getInvestigation,
    listInvestigations: listInvestigations,
    deleteInvestigation: deleteInvestigation,
    saveOperation: saveOperation,
    getOperation: getOperation,
    listOperations: listOperations,
    deleteOperation: deleteOperation,
    listImportableOperationTargets: listImportableOperationTargets,
    addOperationTargets: addOperationTargets,
    removeOperationTarget: removeOperationTarget,
    importOperationTeam: importOperationTeam,
    setOperationMemberRole: setOperationMemberRole,
    assignOperationTargetTeam: assignOperationTargetTeam,
    removeOperationTeam: removeOperationTeam,
    setOperationTeamVehicle: setOperationTeamVehicle,
    setOperationMemberStart: setOperationMemberStart,
    setOperationMemberHeading: setOperationMemberHeading,
    setOperationMemberField: setOperationMemberField,
    addOperationLocation: addOperationLocation,
    removeOperationLocation: removeOperationLocation,
    addMedevacRoutePoint: addMedevacRoutePoint,
    saveVehicleRecord: saveVehicleRecord,
    getVehicleRecord: getVehicleRecord,
    findVehicleByPlate: findVehicleByPlate,
    saveLocationRecord: saveLocationRecord,
    getLocationRecord: getLocationRecord,
    findLocationByAddress: findLocationByAddress,
    saveBusinessRecord: saveBusinessRecord,
    getBusinessRecord: getBusinessRecord,
    findBusinessByName: findBusinessByName,
    saveEntityRecord: saveEntityRecord,
    getEntityRecord: getEntityRecord,
    findEntityByName: findEntityByName,
    findPersonByName: findPersonByName,
    createObjectRecord: createObjectRecord,
    getObjectRecord: getObjectRecord,
    saveObjectRecord: saveObjectRecord,
    resolveObjectRecord: resolveObjectRecord,
    promoteInvestigationPlate: promoteInvestigationPlate,
    addInvestigationObject: addInvestigationObject,
    connectInvestigationNodes: connectInvestigationNodes,
    upsertAssociation: upsertAssociation,
    saveAssociationRecord: saveAssociationRecord,
    getAssociation: getAssociation,
    associationsFor: associationsFor,
    occupancyFor: occupancyFor,
    setAssociationReason: setAssociationReason,
    associationIntegrity: associationIntegrity,
    reuseInvestigationIdentity: reuseInvestigationIdentity,
    disconnectInvestigationLink: disconnectInvestigationLink,
    associateInvestigationPerson: associateInvestigationPerson,
    associateInvestigationObject: associateInvestigationObject,
    associateCaseObject: associateCaseObject,
    dropAssociation: dropAssociation,
    removeCaseLink: removeCaseLink,
    listObjects: listObjects,
    setInvestigationAssociationReason: setInvestigationAssociationReason,
    disconnectInvestigationAssociation: disconnectInvestigationAssociation,
    removeInvestigationObject: removeInvestigationObject,
    clearInvestigationWorkspace: clearInvestigationWorkspace,
    junkInvestigationObject: junkInvestigationObject,
    deleteInvestigationObject: deleteInvestigationObject,
    objectDisposition: objectDisposition,
    isJunked: isJunked,
    investigationIntegrity: investigationIntegrity,
    spawnInvestigation: spawnInvestigation,
    listRelatedInvestigations: function (investigationId) {
      adoptDisk();
      var inv = state.investigations[investigationId];
      if (!inv) {
        return [];
      }
      var out = [];
      if (
        inv.parentInvestigationId &&
        state.investigations[inv.parentInvestigationId]
      ) {
        out.push(clone(state.investigations[inv.parentInvestigationId]));
      }
      Object.keys(state.investigations).forEach(function (id) {
        var row = state.investigations[id];
        if (row && row.parentInvestigationId === investigationId) {
          out.push(clone(row));
        }
      });
      return out;
    },
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
