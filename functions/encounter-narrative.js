/**
 * Map a saved encounter + Book-in subjects into the Build 9 bundle shape.
 */
(function (global) {
  "use strict";

  function bookinRecords(unavailable) {
    try {
      var raw = localStorage.getItem("alien-book-in.saved-records.v1");
      var list = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(list)) throw new Error("Book-In store is not an array.");
      return list;
    } catch (error) {
      if (unavailable) unavailable.push("bookin");
      return [];
    }
  }

  function readAdmin(unavailable) {
    try {
      var raw = localStorage.getItem("copdoc.admin.v1");
      var data = raw ? JSON.parse(raw) : {};
      if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Admin store is not an object.");
      return data;
    } catch (error) {
      if (unavailable) unavailable.push("admin");
      return {};
    }
  }

  function readSettings(unavailable) {
    try {
      var raw = localStorage.getItem("copdocx.settings.v1");
      var data = raw ? JSON.parse(raw) : {};
      if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Settings store is not an object.");
      return data;
    } catch (error) {
      if (unavailable) unavailable.push("settings");
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
      if (record && record.formState && Object.prototype.hasOwnProperty.call(record.formState, id)) {
        return "";
      }
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

  function matchRosterOfficer(name, officers) {
    var needle = String(name || "")
      .replace(/\s+/g, " ")
      .trim()
      .toUpperCase();
    if (!needle) {
      return null;
    }
    var matches = (Array.isArray(officers) ? officers : []).filter(function (row) {
      if (!row) return false;
      var label = officerLabel(row).toUpperCase();
      var flipped = [row.firstName, row.lastName].filter(Boolean).join(" ").toUpperCase();
      return label === needle || flipped === needle || String(row.displayName || "").toUpperCase() === needle;
    });
    return matches.length === 1 ? matches[0] : null;
  }

  function enforcementBasis(person, subject) {
    var explicit = text(subject && subject.enforcementBasisCode).toUpperCase();
    if (explicit) return explicit;
    var model = global.COPDoc && COPDoc.model;
    var warrants = (person && person.warrants) || [];
    var i;
    for (i = 0; i < warrants.length; i++) {
      if (model && model.isIssuedWarrant && model.isIssuedWarrant(warrants[i])) {
        return warrants[i].formType === "I-205" ? "I_205" : "I_200";
      }
    }
    return "UNKNOWN";
  }

  function text(value) {
    return String(value == null ? "" : value).trim();
  }

  function owns(object, key) {
    return !!object && Object.prototype.hasOwnProperty.call(object, key);
  }

  function canonicalValue(object, key, fallback) {
    return owns(object, key) ? text(object[key]) : text(fallback);
  }

  // An explicit clear is a value, not permission to revive an older snapshot.
  function packetValue(record, id, aliases, fallback) {
    if (record && owns(record.formState, id)) return formValue(record, id);
    var fields = [id].concat(aliases || []);
    for (var i = 0; i < fields.length; i += 1) {
      if (owns(record, fields[i])) return text(record[fields[i]]);
    }
    return text(fallback);
  }

  function packetSex(record) {
    if (record && (owns(record.formState, "sexMale") || owns(record.formState, "sexFemale"))) {
      return formSex(record);
    }
    return packetValue(record, "gender");
  }

  function packetHas(record, id) {
    return !!record && (owns(record.formState, id) || owns(record, id));
  }

  function participantOutcomeTime(subject, record, outcome, started) {
    if (owns(subject, "outcomeAt")) return text(subject.outcomeAt);
    if (owns(subject, "finalOutcomeAt")) return text(subject.finalOutcomeAt);
    if (outcome.indexOf("FLED") === 0) return text(subject.fledAt) || started;
    if (outcome !== "ARRESTED") return started;
    if (packetHas(record, "arrestDateTime")) return packetValue(record, "arrestDateTime");
    var arrestTime = packetValue(record, "arrestTime");
    if (packetHas(record, "arrestTime") && !arrestTime) return "";
    var bookingDay = packetValue(record, "dateTime").slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(bookingDay) && /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(arrestTime)) {
      return bookingDay + "T" + arrestTime;
    }
    // Booking time alone is not an arrest timestamp.
    return started;
  }

  function detached(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function coordinate(value, limit) {
    if (value == null || typeof value === "boolean" || text(value) === "") return null;
    var number = Number(value);
    return Number.isFinite(number) && Math.abs(number) <= limit ? number : null;
  }

  function centerLocation(enc) {
    var locations = Array.isArray(enc.locations) ? enc.locations : [];
    var centerId = text(enc.centerLocationId);
    var matches = centerId ? locations.filter(function (row) {
      return row && text(row.locationId) === centerId;
    }) : [];
    return matches.length === 1 ? matches[0] : locations[0] || {};
  }

  function encounterEvents(enc, participants) {
    function remapReferences(value) {
      if (!value || typeof value !== "object") return;
      Object.keys(value).forEach(function (key) {
        var current = value[key];
        if (key === "encounterParticipantId" || key === "subjectEncounterParticipantId") {
          value[key] = resolveEncounterParticipantId(participants, current) || current;
        } else if (key === "encounterParticipantIds" && Array.isArray(current)) {
          value[key] = current.map(function (id) {
            return resolveEncounterParticipantId(participants, id) || id;
          });
        } else if (current && typeof current === "object") {
          remapReferences(current);
        }
      });
    }
    return (Array.isArray(enc.events) ? enc.events : []).filter(function (row) {
      return row && typeof row === "object" && !Array.isArray(row) &&
        (!text(row.encounterId) || text(row.encounterId) === text(enc.encounterId));
    }).map(function (row) {
      var event = detached(row);
      remapReferences(event);
      return event;
    });
  }

  function encounterOfficers(enc, subjects, events, unavailable) {
    var admin = readAdmin(unavailable);
    if (owns(admin, "officers") && !Array.isArray(admin.officers)) unavailable.push("admin.officers");
    var roster = Array.isArray(admin.officers) ? admin.officers : [];
    var officers = [];
    var byId = Object.create(null);
    var legacyNameIds = Object.create(null);
    var reportingOfficerId = text(enc.reportingOfficerId);

    function add(id, role, suppliedName) {
      id = text(id);
      if (!id) return null;
      var found = roster.filter(function (row) {
        return row && text(row.officerId || row.id) === id;
      });
      var profile = found.length === 1 ? found[0] : null;
      if (!byId[id]) {
        var label = profile ? officerLabel(profile) : text(suppliedName);
        byId[id] = {
          officerProfileId: id,
          personId: text(profile && profile.personId),
          displayName: label,
          fullName: label,
          title: text(profile && (profile.title || profile.role)),
          badgeNumber: text(profile && (profile.badgeNumber || profile.badge)),
          team: text(profile && profile.team),
          roles: []
        };
        officers.push(byId[id]);
      }
      var code = text(role).toUpperCase() || "OFFICER";
      if (byId[id].roles.indexOf(code) < 0) byId[id].roles.push(code);
      return byId[id];
    }

    (Array.isArray(enc.officerIds) ? enc.officerIds : []).forEach(function (id) {
      add(id, "OFFICER");
    });
    if (reportingOfficerId) add(reportingOfficerId, "REPORTING");
    subjects.forEach(function (source) {
      var subject = source.subject || {};
      var packet = source.bookin || {};
      var officerId = text(subject.arrestingOfficerId || packet.arrestingOfficerId);
      if (officerId) add(officerId, "ARRESTING");
      var name = packetValue(packet, "officersName");
      if (name) {
        // A packet's text cannot retarget a subject's explicit officer ID.
        var matched = officerId ? null : matchRosterOfficer(name, roster);
        var nameKey = name.replace(/\s+/g, " ").trim().toUpperCase();
        var resolvedId = officerId || text(matched && (matched.officerId || matched.id));
        if (!resolvedId) {
          resolvedId = legacyNameIds[nameKey] || (!reportingOfficerId ? "ofc_reporting" : "ofc_legacy_" + encodeURIComponent(nameKey));
          legacyNameIds[nameKey] = resolvedId;
        }
        var role = !reportingOfficerId ? "REPORTING" : "OFFICER";
        if (!reportingOfficerId) reportingOfficerId = resolvedId;
        add(resolvedId, role, officerId ? "" : name);
      }
    });
    events.forEach(function (event) {
      (Array.isArray(event.officerLinks) ? event.officerLinks : []).forEach(function (link) {
        if (link) add(link.officerProfileId || link.officerId, link.role);
      });
    });
    return { officers: officers, reportingOfficerId: reportingOfficerId };
  }

  function uniqueStrings(values) {
    var seen = Object.create(null);
    return (values || []).reduce(function (output, value) {
      var key = text(value);
      if (key && !seen[key]) {
        seen[key] = true;
        output.push(key);
      }
      return output;
    }, []);
  }

  function subjectRole(subject) {
    var model = global.COPDoc && global.COPDoc.model;
    var role = text(
      model && typeof model.encounterSubjectRole === "function"
        ? model.encounterSubjectRole(subject)
        : subject && (subject.role || subject.encounterRole)
    ).toUpperCase();
    return role === "TARGET" || role === "COLLATERAL" ? role : "";
  }

  function subjectBookingId(subject) {
    var model = global.COPDoc && global.COPDoc.model;
    return text(
      model && typeof model.encounterSubjectBookingId === "function"
        ? model.encounterSubjectBookingId(subject)
        : subject && (subject.bookingId || subject.bookinRecordId)
    );
  }

  function subjectBookingIds(subject) {
    return uniqueStrings([
      subjectBookingId(subject),
      subject && subject.bookingId,
      subject && subject.bookinRecordId
    ]);
  }

  function recordBookingIds(record) {
    return uniqueStrings([
      record && record.bookingId,
      record && record.bookinRecordId,
      record && record.id
    ]);
  }

  function legacySubjectFromBookin(record, encounterId, index, model) {
    record = record || {};
    var role = text(
      formValue(record, "encounterRole") ||
      record.role ||
      record.encounterRole ||
      record.subjectRole
    ).toUpperCase();
    var input = {
      subjectId: text(record.subjectId),
      encounterId: encounterId,
      personId: text(record.personId),
      leadId: text(record.leadId),
      bookingId: text(record.bookingId || record.bookinRecordId || record.id),
      bookinRecordId: text(record.bookingId || record.bookinRecordId || record.id),
      lastName: packetValue(record, "lastName"),
      firstName: packetValue(record, "firstName"),
      alienNumber: packetValue(record, "alienNumber", ["aNumber"]),
      role: role,
      encounterRole: role,
      occupantRole: record.occupantRole || record.vehiclePosition || "",
      vehicleRole: record.occupantRole || record.vehiclePosition || "",
      outcome: "ARRESTED",
      custody: "IN_CUSTODY",
      packetFiledAt: record.updatedAt || record.createdAt || ""
    };
    if (model && typeof model.normalizeEncounterSubject === "function") {
      return model.normalizeEncounterSubject(input, {
        encounterId: encounterId,
        index: index
      });
    }
    return input;
  }

  function valuesIntersect(left, right) {
    var lookup = Object.create(null);
    (left || []).forEach(function (value) {
      var key = text(value);
      if (key) {
        lookup[key] = true;
      }
    });
    return (right || []).some(function (value) {
      return !!lookup[text(value)];
    });
  }

  function identifiersAgree(left, right) {
    var leftIds = uniqueStrings(left);
    var rightIds = uniqueStrings(right);
    if (leftIds.length > 1 || rightIds.length > 1) {
      return false;
    }
    if (!leftIds.length || !rightIds.length) {
      return true;
    }
    return uniqueStrings(leftIds.concat(rightIds)).length === 1;
  }

  /**
   * Assign each Book-In packet to at most one EncounterSubject. Strong IDs are
   * considered before legacy references, and a fallback is used only when the
   * match is unique in both directions.
   */
  function matchBookinRecords(subjects, records) {
    var assignments = new Array(subjects.length);
    var usedRecords = Object.create(null);
    var blockedSubjects = Object.create(null);

    function claimedByOtherSubject(
      subjectIndex,
      subject,
      record,
      ignoreWeakOwnership
    ) {
      var recordSubjectId = text(record && record.subjectId);
      var recordBookings = recordBookingIds(record);
      var recordPersonId = text(record && record.personId);
      var recordLeadId = text(record && record.leadId);
      return subjects.some(function (other, otherIndex) {
        if (!other || otherIndex === subjectIndex) {
          return false;
        }
        return (
          (recordSubjectId && text(other.subjectId) === recordSubjectId) ||
          (recordBookings.length &&
            valuesIntersect(subjectBookingIds(other), recordBookings)) ||
          ((!ignoreWeakOwnership || !text(subject && subject.personId)) &&
            recordPersonId &&
            text(other.personId) === recordPersonId) ||
          ((!ignoreWeakOwnership || !text(subject && subject.leadId)) &&
            recordLeadId &&
            text(other.leadId) === recordLeadId)
        );
      });
    }

    function identifiersCompatible(subject, record, subjectIndex, tierOptions) {
      if (!subject || !record || record.voidedAt || subject.bookingUnlinked === true ||
          (subject.bookingVoid && recordBookingIds(record).indexOf(text(subject.bookingVoid.bookingId)) !== -1)) {
        return false;
      }
      if (
        !identifiersAgree([subject.subjectId], [record.subjectId]) ||
        !identifiersAgree(subjectBookingIds(subject), recordBookingIds(record)) ||
        !identifiersAgree([subject.personId], [record.personId]) ||
        !identifiersAgree([subject.leadId], [record.leadId])
      ) {
        return false;
      }
      return !claimedByOtherSubject(
        subjectIndex,
        subject,
        record,
        tierOptions && tierOptions.ignoreWeakOwnership
      );
    }

    function assignTier(matches, tierOptions) {
      subjects.forEach(function (subject, subjectIndex) {
        if (assignments[subjectIndex] || blockedSubjects[subjectIndex]) {
          return;
        }
        var candidates = [];
        records.forEach(function (record, recordIndex) {
          if (
            !usedRecords[recordIndex] &&
            identifiersCompatible(subject, record, subjectIndex, tierOptions) &&
            matches(subject, record)
          ) {
            candidates.push({ record: record, recordIndex: recordIndex });
          }
        });
        if (candidates.length > 1) {
          blockedSubjects[subjectIndex] = true;
          return;
        }
        if (!candidates.length) {
          return;
        }
        var candidate = candidates[0];
        var competingSubjects = [];
        subjects.forEach(function (other, otherIndex) {
          if (
            !assignments[otherIndex] &&
            !blockedSubjects[otherIndex] &&
            identifiersCompatible(other, candidate.record, otherIndex, tierOptions) &&
            matches(other, candidate.record)
          ) {
            competingSubjects.push(otherIndex);
          }
        });
        if (competingSubjects.length === 1) {
          assignments[subjectIndex] = candidate.record;
          usedRecords[candidate.recordIndex] = true;
        } else if (competingSubjects.length > 1) {
          competingSubjects.forEach(function (otherIndex) {
            blockedSubjects[otherIndex] = true;
          });
        }
      });
    }

    assignTier(function (subject, record) {
      var subjectId = text(subject && subject.subjectId);
      return subjectId && subjectId === text(record && record.subjectId);
    }, { ignoreWeakOwnership: true });
    assignTier(function (subject, record) {
      var bookingId = subjectBookingId(subject);
      return (
        bookingId &&
        valuesIntersect([bookingId], recordBookingIds(record))
      );
    }, { ignoreWeakOwnership: true });
    assignTier(function (subject, record) {
      var personId = text(subject && subject.personId);
      return (
        personId &&
        personId === text(record && record.personId)
      );
    });
    assignTier(function (subject, record) {
      var leadId = text(subject && subject.leadId);
      return (
        leadId &&
        leadId === text(record && record.leadId)
      );
    });

    return assignments;
  }

  function participantIds(participant) {
    return uniqueStrings([
      participant && participant.encounterParticipantId,
      participant && participant.subjectId
    ].concat(
      participant && Array.isArray(participant.legacyEncounterParticipantIds)
        ? participant.legacyEncounterParticipantIds
        : []
    ));
  }

  function resolveEncounterParticipantId(participants, candidateId) {
    var candidate = text(candidateId);
    if (!candidate) {
      return "";
    }
    var matches = (Array.isArray(participants) ? participants : []).filter(function (participant) {
      return participantIds(participant).indexOf(candidate) !== -1;
    });
    if (matches.length !== 1) {
      return "";
    }
    return text(matches[0].encounterParticipantId || matches[0].subjectId);
  }

  /**
   * Return a detached engine state whose legacy participant object bindings
   * point at the current packet objects. Focus IDs and narrative text are not
   * touched, and ambiguous aliases remain unchanged for manual review.
   */
  function remapNarrativeStateParticipantIds(state, participants) {
    if (!state || typeof state !== "object") {
      return state;
    }
    var remapped = JSON.parse(JSON.stringify(state));
    var encounterState = remapped.encounter;
    var bindings = encounterState && encounterState.tokenBindings;

    function remapBinding(binding) {
      if (
        !binding ||
        binding.mode !== "object" ||
        text(binding.objectId).indexOf("ep_") !== 0
      ) {
        return;
      }
      var canonicalId = resolveEncounterParticipantId(
        participants,
        binding.objectId
      );
      if (canonicalId) {
        binding.objectId = canonicalId;
      }
    }

    if (Array.isArray(bindings)) {
      bindings.forEach(function (entry) {
        if (Array.isArray(entry) && entry.length > 1) {
          remapBinding(entry[1]);
        }
      });
    } else if (bindings && typeof bindings === "object") {
      Object.keys(bindings).forEach(function (key) {
        remapBinding(bindings[key]);
      });
    }
    return remapped;
  }

  function bundleFromEncounterRecord(enc, options) {
    options = options || {};
    var model = global.COPDoc && COPDoc.model;
    var encounterId = text(enc && enc.encounterId);
    if (!model || !model.store || !encounterId) {
      return null;
    }
    var loc = centerLocation(enc);
    var started = text(enc.startedAt);
    var unavailable = [];
    var packetSource = Array.isArray(options.bookinRecords)
      ? options.bookinRecords
      : bookinRecords(unavailable);
    var linkedBookinSubjects = packetSource.filter(function (row) {
      return (
        row &&
        !row.voidedAt &&
        row.encounterId === encounterId &&
        row.encounterProjectionDraft !== true
      );
    });
    var hasEncounterRoster = Array.isArray(enc.subjects);
    var encounterSubjects = hasEncounterRoster
      ? enc.subjects
      : linkedBookinSubjects.map(function (record, index) {
          return legacySubjectFromBookin(record, encounterId, index, model);
        });
    var matchedBookins = matchBookinRecords(encounterSubjects, linkedBookinSubjects);
    var subjects = [];
    var unassignedParticipantCount = 0;
    encounterSubjects.forEach(function (subject, sourceIndex) {
      var role = subjectRole(subject);
      if (!role) {
        unassignedParticipantCount += 1;
        return;
      }
      subjects.push({
        subject: subject,
        bookin: matchedBookins[sourceIndex] || null,
        sourceIndex: sourceIndex,
        role: role
      });
    });
    var firstTarget = -1;
    var targetSeq = 0;
    var collateralSeq = 0;
    var sequences = subjects.map(function (row, index) {
      var role = row.role;
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
    var participants = subjects.map(function (source, index) {
      var row = source.subject || {};
      var bookin = source.bookin || {};
      var leadId = text(row.leadId || bookin.leadId);
      var lead = leadId && model.store.getLead && model.store.getLead(leadId);
      var personId = text(row.personId);
      var person = personId && model.store.getPerson
        ? model.store.getPerson(personId)
        : null;
      if (person && text(person.personId) !== personId) person = null;
      if (!personId && lead && model.subjectOf) {
        var leadPerson = model.subjectOf(lead);
        if (leadPerson && text(leadPerson.personId)) {
          personId = text(leadPerson.personId);
          person = model.store.getPerson && model.store.getPerson(personId);
          if (person && text(person.personId) !== personId) person = null;
        }
      }
      var immigration = (person && person.immigration) || {};
      var seq = sequences[index];
      var personName = (person && person.name) || {};
      var lastName = canonicalValue(personName, "lastName", packetValue(bookin, "lastName", [], row.lastName));
      var firstName = canonicalValue(personName, "firstName", packetValue(bookin, "firstName", [], row.firstName));
      var aNumber = canonicalValue(immigration, "alienNumber", packetValue(bookin, "alienNumber", ["aNumber"], row.aNumber || row.alienNumber));
      var dob = canonicalValue(person, "dateOfBirth", packetValue(bookin, "dateOfBirth", [], row.dateOfBirth));
      var sex = canonicalValue(person, "sex", packetSex(bookin));
      sex = String(sex || "").toUpperCase();
      if (sex === "M") {
        sex = "MALE";
      }
      if (sex === "F") {
        sex = "FEMALE";
      }
      sex = String(sex || "").toUpperCase();
      var countryCode = canonicalValue(person, "citizenship", packetValue(bookin, "citizenship", ["countryOfCitizenship"], row.citizenship));
      var iceEvent = packetValue(bookin, "iceEvent", [], row.iceEvent);
      var outcome = text(row.outcome || row.outcomeCategory).toUpperCase() || "UNKNOWN";
      var outcomeAt = participantOutcomeTime(row, bookin, outcome, started);
      var cash = packetValue(bookin, "cash");
      var medicine = packetValue(bookin, "medicine");
      var children = packetValue(bookin, "children");
      var medical = packetValue(bookin, "medicalIssues");
      var travelDocs = packetValue(bookin, "travelDocs");
      var disposition = packetValue(bookin, "immigrationDisposition", ["caseType"], immigration.disposition);
      var display =
        person && model.formatPersonLabel
          ? model.formatPersonLabel({
              name: {
                lastName: lastName,
                firstName: firstName
              }
            })
          : lastName || firstName ? displayName({ lastName: lastName, firstName: firstName }) : "";
      var subjectId = text(row.subjectId);
      var bookingId = subjectBookingId(row) || text(bookin.id || bookin.bookingId);
      var legacyParticipantIds = uniqueStrings(
        [bookingId && "ep_" + bookingId, bookin.id && "ep_" + bookin.id].concat(
          Array.isArray(row.legacyEncounterParticipantIds)
            ? row.legacyEncounterParticipantIds
            : []
        )
      );
      return {
        encounterParticipantId: subjectId,
        subjectId: subjectId,
        encounterId: enc.encounterId,
        personId: personId,
        leadId: leadId,
        bookingId: bookingId,
        bookinRecordId: bookingId,
        legacyEncounterParticipantIds: legacyParticipantIds,
        encounterRole: seq.role,
        roleSequence: seq.sequence,
        primaryForReport: index === firstTarget,
        identitySnapshot: {
          displayName: display,
          dateOfBirth: dob,
          aNumber: String(aNumber).replace(/\D/g, ""),
          nationalityCountryCode: countryCode,
          nationalityDisplay: countryLabel(countryCode),
          sex: sex || "UNKNOWN",
          capturedAt: started
        },
        finalOutcome: outcome,
        finalOutcomeAt: outcomeAt,
        enforcementBasisCode: enforcementBasis(person, row),
        iceEventNumber: iceEvent || null,
        immigrationSnapshot: {
          statusCode: immigration.status || null,
          dispositionCode: disposition || "UNKNOWN",
          earmDispositionCode: immigration.disposition || disposition || "UNKNOWN",
          displayText: dispositionLabel(disposition),
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
    var events = encounterEvents(enc, participants);
    var officerContext = encounterOfficers(enc, subjects, events, unavailable);
    var settings = readSettings(unavailable);
    var operationId = text(enc.operationId);
    var operation = operationId && model.store.getOperation
      ? model.store.getOperation(operationId)
      : null;
    if (operation && text(operation.operationId) !== operationId) operation = null;
    var sourceSubjects = Object.create(null);
    subjects.forEach(function (source, index) {
      var row = source.subject;
      var participant = participants[index];
      sourceSubjects[participant.subjectId] = {
        subjectId: participant.subjectId,
        outcome: participant.finalOutcome,
        citizenship: participant.identitySnapshot.nationalityCountryCode,
        flightMode: text(row.flightMode).toUpperCase(),
        compliance: text(row.compliance).toUpperCase(),
        useOfForce: text(row.useOfForce).toLowerCase(),
        forceLevel: text(row.forceLevel).toUpperCase()
      };
    });
    var meta = enc.meta || {};
    return {
      encounter: {
        schema: "copdoc.encounter.v1",
        recordType: "ENCOUNTER",
        encounterId: enc.encounterId,
        encounterNumber: text(enc.encounterNumber) || enc.encounterId,
        eventType: text(enc.eventType).toUpperCase() || "UNKNOWN",
        status: meta.markedComplete === true
          ? "COMPLETED"
          : text(enc.status || meta.status).toUpperCase() || "UNKNOWN",
        startedAt: started,
        endedAt: text(enc.endedAt),
        primaryLocationId: locationId,
        primaryEncounterParticipantId: primaryParticipantId,
        reportingOfficerId: officerContext.reportingOfficerId,
        language: text(enc.language),
        action: text(enc.action),
        disposition: text(enc.disposition),
        notes: text(enc.notes)
      },
      operation: {
        operationId: operationId,
        operationNumber: text(operation && operation.operationNumber),
        displayName: text(operation && (operation.displayName || operation.name)),
        fieldOffice: text(operation && (operation.fieldOffice || operation.fieldOfficeName)) || settings.issuingOffice || "",
        iceOffice: text(operation && (operation.iceOffice || operation.iceOfficeName)),
        date: text(operation && (operation.date || operation.plannedStart)).slice(0, 10) || String(started).slice(0, 10),
        plannedStart: text(operation && operation.plannedStart),
        plannedEnd: text(operation && operation.plannedEnd),
        team: text(operation && operation.team)
      },
      participants: participants,
      events: events,
      encounterVehicles: encounterVehicles,
      vehicles: vehicles,
      location: {
        schema: "copdoc.location.v1",
        recordType: "LOCATION",
        locationId: locationId,
        generatedDisplayName: [loc.street, loc.street2, loc.city, loc.state, loc.zip]
          .filter(Boolean)
          .join(", "),
        locationTypeCode: locationTypeCode(loc.association || loc.locationAssociation),
        postalAddress: {
          addressLine1: loc.street || "",
          addressLine2: loc.street2 || "",
          city: loc.city || "",
          stateOrRegion: loc.state || "",
          postalCode: loc.zip || "",
          countryCode: loc.countryCode || "US"
        },
        coordinates: {
          latitude: coordinate(loc.latitude, 90),
          longitude: coordinate(loc.longitude, 180)
        }
      },
      officers: officerContext.officers,
      encounterLocked: meta.markedComplete === true,
      sourceUnavailable: unavailable.length > 0,
      sourceFacts: {
        encounter: {
          eventType: text(enc.eventType).toUpperCase(),
          centerLocationId: text(loc.locationId),
          centerAssociation: text(loc.association || loc.locationAssociation).toLowerCase()
        },
        vehicles: (Array.isArray(enc.vehicles) ? enc.vehicles : []).map(function (vehicle, index) {
          return {
            vehicleId: text(vehicle.vehicleId) || vehicles[index].vehicleId,
            encounterDisposition: text(vehicle.encounterDisposition).toUpperCase()
          };
        }),
        subjects: sourceSubjects
      },
      unassignedParticipantCount: unassignedParticipantCount,
      narrativesInitial: Array.isArray(enc.narratives) ? enc.narratives : []
    };
  }

  function bundleFromEncounter(encounterId) {
    var model = global.COPDoc && COPDoc.model;
    if (!model || !model.store || !encounterId) {
      return null;
    }
    model.store.loadFromDisk();
    if (typeof model.store.diskError === "function" && model.store.diskError()) return null;
    var enc = model.store.getEncounter(encounterId);
    return enc ? bundleFromEncounterRecord(enc) : null;
  }

  global.COPDoc = global.COPDoc || {};
  global.COPDoc.encounterNarrative = {
    bundleFromEncounter: bundleFromEncounter,
    bundleFromEncounterRecord: bundleFromEncounterRecord,
    resolveEncounterParticipantId: resolveEncounterParticipantId,
    remapNarrativeStateParticipantIds: remapNarrativeStateParticipantIds
  };
})(typeof window !== "undefined" ? window : globalThis);
