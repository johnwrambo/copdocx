/**
 * Encounter subject normalization, permanent identity and historical ownership policies.
 * Model adapters remain optional for read-only pages that omit encounter.js.
 * Dependencies are explicit; this module never reads browser storage or DOM.
 */
(function (global) {
  "use strict";
  var root = (global.COPDoc = global.COPDoc || {});
  var namespace = (root.domain = root.domain || {});

  namespace.createEncounterSubjectPolicy = function (dependencies) {
    var model = dependencies.model;
    var clone = dependencies.clone;
    var mergeRecord = dependencies.mergeRecord;
    var getWorkspace = dependencies.getWorkspace;

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
          getWorkspace().people[embeddedPersonId]
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
      var currentEncounter = encounterId && getWorkspace().encounters[encounterId];
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
        var lead = leadId && getWorkspace().leads[leadId];
        var leadOwner = leadOwnerIdentity(lead, leadId);
        var leadPersonId = leadOwner.ok ? leadOwner.personId : "";
        var prior = previous.filter(function (row) {
          return storeSubjectId(row) === subjectId;
        })[0];
        var unchangedLegacyPerson = !!(
          prior &&
          personId &&
          storeSubjectText(prior.personId) === personId &&
          !getWorkspace().people[personId]
        );
        if (
          personId &&
          !getWorkspace().people[personId] &&
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
        getWorkspace().encounters[encounterId] &&
        historicalOwnershipConflict(getWorkspace().encounters[encounterId])
      ) {
        return conflict;
      }

      Object.keys(getWorkspace().encounters || {}).some(function (otherEncounterId) {
        if (otherEncounterId === encounterId) {
          return false;
        }
        var other = getWorkspace().encounters[otherEncounterId];
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

    return {
      storeSubjectText: storeSubjectText,
      storeSubjectOwn: storeSubjectOwn,
      storeSubjectId: storeSubjectId,
      storeSubjectBookingId: storeSubjectBookingId,
      leadOwnerIdentity: leadOwnerIdentity,
      storeSubjectRole: storeSubjectRole,
      storeSubjectOccupantRole: storeSubjectOccupantRole,
      normalizeEncounterSubjectsForStore: normalizeEncounterSubjectsForStore,
      normalizeEncounterSubjectForStore: normalizeEncounterSubjectForStore,
      mergeEncounterSubjectsForStore: mergeEncounterSubjectsForStore,
      normalizeEncounterStateRecord: normalizeEncounterStateRecord,
      encounterOwnershipRows: encounterOwnershipRows,
      encounterSubjectIdentityConflict: encounterSubjectIdentityConflict,
      canonicalizeEncounterMapKeys: canonicalizeEncounterMapKeys
    };
  };
})(typeof window !== "undefined" ? window : globalThis);
