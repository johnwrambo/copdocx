/**
 * COPDoc Build 9 deterministic supervisor encounter summary.
 *
 * The algorithm consumes structured Encounter-domain records only. It never
 * searches or interprets narrative prose. The fingerprint is a deterministic
 * change detector (FNV-1a), not a cryptographic signature.
 */
(function attachEncounterSummary(root, factory) {
  "use strict";
  var coverage =
    typeof module === "object" && module.exports
      ? require("./narrative-coverage.js")
      : root.COPDocBuild9Domain;
  var api = factory(coverage);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.COPDocBuild9Domain = Object.assign(root.COPDocBuild9Domain || {}, api);
})(typeof globalThis !== "undefined" ? globalThis : this, function encounterSummaryFactory(coverageApi) {
  "use strict";

  var SUMMARY_SCHEMA = "copdoc.encounter-summary.v1";
  var ALGORITHM_VERSION = "1.0.0";
  var FINAL_OUTCOMES = Object.freeze([
    "ARRESTED",
    "DETAINED",
    "RELEASED",
    "TRANSFERRED",
    "INTERVIEWED",
    "NOT_CONTACTED",
    "NOT_IN_CUSTODY",
    "OTHER",
    "UNKNOWN",
  ]);

  function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  function isActive(record) {
    return !!record && (record.recordState || "ACTIVE") === "ACTIVE";
  }

  function toCode(value, fallback) {
    var code = String(value == null ? "" : value).trim().toUpperCase();
    return code || fallback || "UNKNOWN";
  }

  function recordId(record) {
    if (!record) return "";
    var fields = [
      "encounterParticipantId",
      "encounterEventId",
      "encounterVehicleId",
      "vehicleId",
      "locationId",
      "officerProfileId",
      "narrativeId",
      "summaryId",
      "encounterId",
    ];
    for (var i = 0; i < fields.length; i += 1) {
      if (record[fields[i]]) return String(record[fields[i]]);
    }
    return "";
  }

  function inferredRecordType(record) {
    if (!record) return "UNKNOWN";
    if (record.recordType) return String(record.recordType).toUpperCase();
    if (record.encounterParticipantId) return "ENCOUNTER_PARTICIPANT";
    if (record.encounterEventId) return "ENCOUNTER_EVENT";
    if (record.encounterVehicleId) return "ENCOUNTER_VEHICLE";
    if (record.vehicleId) return "VEHICLE";
    if (record.locationId) return "LOCATION";
    if (record.officerProfileId) return "OFFICER_PROFILE";
    if (record.narrativeId) return "NARRATIVE";
    if (record.summaryId) return "ENCOUNTER_SUMMARY";
    if (record.encounterId) return "ENCOUNTER";
    return "UNKNOWN";
  }

  function stableNormalize(value) {
    if (Array.isArray(value)) return value.map(stableNormalize);
    if (!value || typeof value !== "object") return value === undefined ? null : value;
    var output = {};
    Object.keys(value).sort().forEach(function (key) {
      if (value[key] !== undefined) output[key] = stableNormalize(value[key]);
    });
    return output;
  }

  function stableStringify(value) {
    return JSON.stringify(stableNormalize(value));
  }

  function fnv1aFingerprint(value) {
    var text = typeof value === "string" ? value : stableStringify(value);
    var hash = 0x811c9dc5;
    for (var i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    return "fnv1a32-" + (hash >>> 0).toString(16).padStart(8, "0");
  }

  function sortedRecords(records) {
    return (Array.isArray(records) ? records : [])
      .filter(isActive)
      .slice()
      .sort(function (a, b) {
        var sequenceDiff = (Number(a.sequence || a.roleSequence) || 0) -
          (Number(b.sequence || b.roleSequence) || 0);
        return sequenceDiff || recordId(a).localeCompare(recordId(b));
      });
  }

  function participantName(participant) {
    var snapshot = participant && participant.identitySnapshot || {};
    return String(snapshot.displayName || participant.subjectDisplayName || participant.personId ||
      participant.encounterParticipantId || "Unknown participant");
  }

  function finalOrderCode(participant) {
    var snapshot = participant && participant.immigrationSnapshot || {};
    var nested = snapshot.finalOrder || {};
    var raw = snapshot.finalOrderStatus != null
      ? snapshot.finalOrderStatus
      : (nested.statusCode != null ? nested.statusCode : nested.status);
    var code = toCode(raw, "UNKNOWN");
    if (["YES", "CONFIRMED", "TRUE"].indexOf(code) !== -1) return "YES";
    if (["NO", "NOT_CONFIRMED", "FALSE"].indexOf(code) !== -1) return "NO";
    return "UNKNOWN";
  }

  function immigrationDispositionCode(participant) {
    var snapshot = participant && participant.immigrationSnapshot || {};
    return toCode(
      snapshot.dispositionCode != null
        ? snapshot.dispositionCode
        : snapshot.immigrationDispositionCode,
      "UNKNOWN"
    );
  }

  function earmDispositionCode(participant) {
    var snapshot = participant && participant.immigrationSnapshot || {};
    return toCode(snapshot.earmDispositionCode, "UNKNOWN");
  }

  function countByCode(values, allowed) {
    var counts = {};
    (allowed || []).forEach(function (code) { counts[code] = 0; });
    values.forEach(function (value) {
      var code = toCode(value, "UNKNOWN");
      counts[code] = (counts[code] || 0) + 1;
    });
    return counts;
  }

  function nonZeroCounts(counts) {
    var output = {};
    Object.keys(counts || {}).forEach(function (code) {
      if (counts[code] > 0) output[code] = counts[code];
    });
    return output;
  }

  function participantProjection(participant) {
    return {
      encounterParticipantId: participant.encounterParticipantId,
      personId: participant.personId || null,
      displayName: participantName(participant),
      encounterRole: toCode(participant.encounterRole, "OTHER"),
      roleSequence: Number(participant.roleSequence) || null,
      finalOutcome: toCode(participant.finalOutcome, "UNKNOWN"),
      finalOutcomeAt: participant.finalOutcomeAt || null,
      immigrationDispositionCode: immigrationDispositionCode(participant),
      earmDispositionCode: earmDispositionCode(participant),
      finalOrderStatus: finalOrderCode(participant),
      iceEventNumber: participant.iceEventNumber || null,
    };
  }

  function eventType(event) {
    return toCode(event && event.eventType, "OTHER");
  }

  function eventHasWindowBreak(event) {
    if (eventType(event) !== "VEHICLE_ENTRY") return false;
    var details = event && event.details || {};
    return details.windowBreakOccurred === true ||
      !!(details.windowBreak && details.windowBreak.occurred === true) ||
      toCode(details.actionCode, "") === "WINDOW_BREAK";
  }

  function eventHasCollision(event) {
    var details = event && event.details || {};
    return eventType(event) === "COLLISION" || details.collisionOccurred === true;
  }

  function eventHasInjury(event) {
    if (eventType(event) !== "USE_OF_FORCE") return false;
    var details = event && event.details || {};
    var resultCode = toCode(details.resultCode, "");
    return details.injuryObserved === true || details.injuryOccurred === true ||
      resultCode === "INJURY" || resultCode === "FATALITY";
  }

  function forceSubjectIds(events) {
    var seen = Object.create(null);
    events.forEach(function (event) {
      if (eventType(event) !== "USE_OF_FORCE") return;
      var details = event.details || {};
      if (details.subjectEncounterParticipantId) {
        seen[String(details.subjectEncounterParticipantId)] = true;
      }
      (event.participantLinks || []).forEach(function (link) {
        if (!link || !link.encounterParticipantId) return;
        var role = toCode(link.role, "");
        if (!role || ["RECIPIENT", "AFFECTED"].indexOf(role) !== -1) {
          seen[String(link.encounterParticipantId)] = true;
        }
      });
    });
    return Object.keys(seen).sort();
  }

  function resolveLocation(bundle, encounter) {
    if (bundle.primaryLocation) return bundle.primaryLocation;
    var id = encounter && encounter.primaryLocationId;
    if (!id) return null;
    var locations = Array.isArray(bundle.locations) ? bundle.locations : [];
    return locations.find(function (location) { return location && location.locationId === id; }) || null;
  }

  function postalAddressText(address) {
    if (!address) return "";
    var street = [address.addressLine1 || address.street1, address.addressLine2 || address.unit]
      .filter(Boolean).join(", ");
    var locality = [address.city, address.stateOrRegion || address.state, address.postalCode]
      .filter(Boolean).join(" ");
    return [street, locality].filter(Boolean).join(", ");
  }

  function locationProjection(location, fallbackId) {
    if (!location) {
      return {
        primaryLocationId: fallbackId || null,
        formattedAddress: null,
        latitude: null,
        longitude: null,
      };
    }
    var coordinates = location.coordinates || location.geo || {};
    return {
      primaryLocationId: location.locationId || fallbackId || null,
      formattedAddress: location.formattedAddress || location.generatedDisplayName ||
        location.nameOverride || postalAddressText(location.postalAddress) || null,
      latitude:
        coordinates.latitude != null ? Number(coordinates.latitude) :
          location.latitude != null ? Number(location.latitude) : null,
      longitude:
        coordinates.longitude != null ? Number(coordinates.longitude) :
          location.longitude != null ? Number(location.longitude) : null,
    };
  }

  function parseTime(value) {
    if (!value) return null;
    var ms = Date.parse(value);
    return Number.isFinite(ms) ? ms : null;
  }

  function durationMinutes(startedAt, endedAt) {
    var start = parseTime(startedAt);
    var end = parseTime(endedAt);
    if (start == null || end == null || end < start) return null;
    return Math.round((end - start) / 60000);
  }

  function officerDirectory(bundle) {
    var map = Object.create(null);
    (Array.isArray(bundle.officers) ? bundle.officers : []).forEach(function (officer) {
      if (!officer || !officer.officerProfileId) return;
      map[String(officer.officerProfileId)] = officer;
    });
    return map;
  }

  function officerProjection(bundle, encounter, events) {
    var ids = Object.create(null);
    if (encounter.reportingOfficerId) ids[String(encounter.reportingOfficerId)] = true;
    events.forEach(function (event) {
      (event.officerLinks || []).forEach(function (link) {
        if (link && link.officerProfileId) ids[String(link.officerProfileId)] = true;
      });
    });
    var directory = officerDirectory(bundle);
    return Object.keys(ids).sort().map(function (id) {
      var officer = directory[id] || {};
      return {
        officerProfileId: id,
        displayName: officer.displayName || officer.name || id,
      };
    });
  }

  function sourceManifest(records) {
    var unique = Object.create(null);
    records.filter(Boolean).forEach(function (record) {
      var id = recordId(record);
      if (!id) return;
      var type = inferredRecordType(record);
      unique[type + ":" + id] = {
        recordType: type,
        recordId: id,
        revision: Number(record.revision) || null,
        updatedAt: record.updatedAt || null,
      };
    });
    return Object.keys(unique).sort().map(function (key) { return unique[key]; });
  }

  function humanizeCode(code) {
    return String(code || "Unknown")
      .toLowerCase()
      .replace(/_/g, " ")
      .replace(/\b\w/g, function (character) { return character.toUpperCase(); });
  }

  function plural(count, singular, pluralWord) {
    return count + " " + (count === 1 ? singular : pluralWord || singular + "s");
  }

  function numberWord(value) {
    var words = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
    var count = Number(value) || 0;
    return count >= 0 && count < words.length && Math.floor(count) === count
      ? words[count]
      : String(count);
  }

  function wordCount(count, singular, pluralWord) {
    return numberWord(count) + " " + (count === 1 ? singular : pluralWord || singular + "s");
  }

  function capitalize(value) {
    var text = String(value || "");
    return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
  }

  function naturalList(parts) {
    if (parts.length < 2) return parts[0] || "";
    if (parts.length === 2) return parts[0] + " and " + parts[1];
    return parts.slice(0, -1).join(", ") + ", and " + parts[parts.length - 1];
  }

  function summaryDate(value) {
    if (!value) return "";
    var parsed = new Date(value);
    if (!Number.isFinite(parsed.getTime())) return "";
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "UTC",
      month: "long",
      day: "numeric",
      year: "numeric",
    }).format(parsed);
  }

  function summaryLocation(value) {
    return String(value || "")
      .replace(/,\s*TX\s+\d{5}(?:-\d{4})?$/i, ", Texas")
      .trim();
  }

  function indefiniteArticle(value) {
    return /^[aeiou]/i.test(String(value || "")) ? "an" : "a";
  }

  function summaryText(summary) {
    var sentences = [];
    var who = summary.who;
    var what = summary.what;
    var how = summary.how;
    var type = summary.what.encounterTypeCode !== "UNKNOWN"
      ? humanizeCode(summary.what.encounterTypeCode).toLowerCase()
      : "encounter";
    var date = summaryDate(summary.when.startedAt);
    var location = summaryLocation(summary.where.formattedAddress);
    var opening = (date ? "On " + date + ", " : "") +
      wordCount(who.officerCount, "Officer") +
      " conducted " + indefiniteArticle(type) + " " + type +
      (location ? " at " + location : "") + ".";
    sentences.push(opening);

    var roleParts = [];
    if (who.targetCount) roleParts.push(wordCount(who.targetCount, "target"));
    if (who.collateralCount) roleParts.push(wordCount(who.collateralCount, "collateral"));
    sentences.push(
      "The encounter recorded " + wordCount(who.participantCount, "participant") +
      (roleParts.length ? ": " + naturalList(roleParts) : "") + "."
    );

    var outcomeParts = [];
    if (what.arrestedCount) outcomeParts.push(wordCount(what.arrestedCount, "person", "people") + " " +
      (what.arrestedCount === 1 ? "was" : "were") + " arrested");
    if (what.detainedCount) outcomeParts.push(wordCount(what.detainedCount, "person", "people") + " " +
      (what.detainedCount === 1 ? "was" : "were") + " detained");
    if (what.releasedCount) outcomeParts.push(numberWord(what.releasedCount) + " " +
      (what.releasedCount === 1 ? "was" : "were") + " released");
    if (what.transferredCount) outcomeParts.push(numberWord(what.transferredCount) + " " +
      (what.transferredCount === 1 ? "was" : "were") + " transferred");
    if (what.notInCustodyCount) outcomeParts.push(numberWord(what.notInCustodyCount) + " remained out of custody");
    if (what.notContactedCount) outcomeParts.push(
      wordCount(what.notContactedCount, "target") + " " +
      (what.notContactedCount === 1 ? "was" : "were") + " not contacted"
    );
    if (outcomeParts.length) sentences.push(capitalize(naturalList(outcomeParts)) + ".");

    var confirmedOrders = what.finalOrders.confirmed != null
      ? what.finalOrders.confirmed
      : what.finalOrders.yesCount;
    sentences.push(
      capitalize(wordCount(confirmedOrders, "participant")) +
      " had confirmed final orders."
    );

    var incidentParts = [];
    if (how.windowBreakIncidentCount) incidentParts.push(wordCount(how.windowBreakIncidentCount, "window-break entry"));
    if (how.forceIncidentCount) incidentParts.push(wordCount(how.forceIncidentCount, "reportable use-of-force incident"));
    if (incidentParts.length) {
      var safetyParts = [];
      if (!how.injuryIncidentCount) safetyParts.push("injuries");
      if (!how.collisionCount) safetyParts.push("collisions");
      sentences.push(
        "The encounter included " + naturalList(incidentParts) +
        (safetyParts.length ? "; no " + safetyParts.join(" or ") + " were reported" : "") + "."
      );
    }

    if (summary.narrativeCoverage) {
      var coverage = summary.narrativeCoverage;
      sentences.push(
        "Primary narrative coverage was " +
        (coverage.coverageComplete ? "complete for all " + wordCount(coverage.requiredCount, "participant") :
          "incomplete; " + wordCount(coverage.coveredCount, "participant") + " of " +
            numberWord(coverage.requiredCount) + " had coverage") + "."
      );
    }
    return sentences.join(" ");
  }

  function validatedCoverageSnapshot(candidate, encounterId) {
    if (!candidate) return null;
    var expectedSchema = coverageApi && coverageApi.NARRATIVE_COVERAGE_SCHEMA ||
      "copdoc.narrative-coverage.v1";
    if (candidate.schema !== expectedSchema) throw new Error("narrativeCoverage schema is invalid");
    if (String(candidate.encounterId || "") !== encounterId) {
      throw new Error("narrativeCoverage encounterId does not match the summary encounter");
    }
    if (!Array.isArray(candidate.requiredParticipantIds) ||
        !Array.isArray(candidate.coveredParticipantIds) ||
        typeof candidate.coverageComplete !== "boolean") {
      throw new Error("narrativeCoverage shape is invalid");
    }
    return clone(candidate);
  }

  function deriveCoverage(bundle, encounterId, suppliedCoverage) {
    if (coverageApi && typeof coverageApi.validatePrimaryNarrativeCoverage === "function" &&
        Array.isArray(bundle.narratives)) {
      return coverageApi.validatePrimaryNarrativeCoverage({
        encounterId: encounterId,
        participants: bundle.participants || [],
        narratives: bundle.narratives,
      });
    }
    return validatedCoverageSnapshot(suppliedCoverage || bundle.narrativeCoverage, encounterId);
  }

  function buildCompletenessWarnings(encounter, participants, events, where, narrativeCoverage) {
    var warnings = [];
    if (!encounter.eventType) warnings.push({ code: "ENCOUNTER_TYPE_UNKNOWN", path: "encounter.eventType" });
    if (!encounter.startedAt) warnings.push({ code: "ENCOUNTER_START_UNKNOWN", path: "encounter.startedAt" });
    if (!where.primaryLocationId && !where.formattedAddress) {
      warnings.push({ code: "PRIMARY_LOCATION_UNKNOWN", path: "encounter.primaryLocationId" });
    }
    participants.forEach(function (participant) {
      if (!participant.finalOutcome) warnings.push({
        code: "PARTICIPANT_OUTCOME_UNKNOWN",
        encounterParticipantId: participant.encounterParticipantId,
      });
      var snapshot = participant.immigrationSnapshot || {};
      if (!snapshot.dispositionCode && !snapshot.immigrationDispositionCode) warnings.push({
        code: "IMMIGRATION_DISPOSITION_UNKNOWN",
        encounterParticipantId: participant.encounterParticipantId,
      });
      if (finalOrderCode(participant) === "UNKNOWN") warnings.push({
        code: "FINAL_ORDER_STATUS_UNKNOWN",
        encounterParticipantId: participant.encounterParticipantId,
      });
    });
    events.filter(function (event) { return eventType(event) === "VEHICLE_ENTRY"; }).forEach(function (event) {
      var details = event.details || {};
      var hasStructuredAnswer = details.windowBreakOccurred === true || details.windowBreakOccurred === false ||
        !!(details.windowBreak && typeof details.windowBreak.occurred === "boolean") ||
        !!details.actionCode;
      if (!hasStructuredAnswer) warnings.push({
        code: "WINDOW_BREAK_STATUS_UNKNOWN",
        encounterEventId: event.encounterEventId,
      });
    });
    if (narrativeCoverage && !narrativeCoverage.coverageComplete) {
      warnings.push({ code: "NARRATIVE_COVERAGE_INCOMPLETE" });
    } else if (narrativeCoverage && narrativeCoverage.finalizationReady === false) {
      warnings.push({ code: "NARRATIVE_FINALIZATION_NOT_READY" });
    }
    return warnings;
  }

  /**
   * Deterministically derives a supervisor summary from a structured bundle.
   * `generatedAt` is excluded from the source fingerprint.
   */
  function deriveEncounterSummary(bundle, options) {
    var source = bundle || {};
    var encounter = source.encounter || {};
    var encounterId = String(encounter.encounterId || source.encounterId || "").trim();
    if (!encounterId) throw new Error("encounter.encounterId is required");

    var participants = sortedRecords(source.participants).filter(function (participant) {
      return !participant.encounterId || participant.encounterId === encounterId;
    });
    var events = sortedRecords(source.events).filter(function (event) {
      return !event.encounterId || event.encounterId === encounterId;
    });
    var narrativesProvided = Array.isArray(source.narratives);
    var narratives = sortedRecords(source.narratives).filter(function (narrative) {
      return !narrative.encounterId || narrative.encounterId === encounterId;
    });
    var participantViews = participants.map(participantProjection);
    var outcomeCounts = countByCode(participantViews.map(function (p) { return p.finalOutcome; }), FINAL_OUTCOMES);
    var immigrationCounts = countByCode(participantViews.map(function (p) {
      return p.immigrationDispositionCode;
    }), ["UNKNOWN"]);
    var earmDispositionCounts = countByCode(participantViews.map(function (p) {
      return p.earmDispositionCode;
    }), ["UNKNOWN"]);
    var finalOrderCounts = countByCode(participantViews.map(function (p) {
      return p.finalOrderStatus;
    }), ["YES", "NO", "UNKNOWN"]);
    var eventCounts = countByCode(events.map(eventType), []);
    var forceEvents = events.filter(function (event) { return eventType(event) === "USE_OF_FORCE"; });
    var forceSubjects = forceSubjectIds(events);
    var location = resolveLocation(source, encounter);
    var where = locationProjection(location, encounter.primaryLocationId);
    var officers = officerProjection(source, encounter, events);
    var officerIds = Object.create(null);
    officers.forEach(function (officer) { officerIds[officer.officerProfileId] = true; });
    var officerRecords = sortedRecords(source.officers).filter(function (officer) {
      return officerIds[officer.officerProfileId];
    });
    var summarySource = Object.assign({}, source, { narratives: narratives });
    if (!narrativesProvided) summarySource.narratives = undefined;
    var narrativeCoverage = deriveCoverage(
      summarySource,
      encounterId,
      options && options.narrativeCoverage
    );

    var summary = {
      schema: SUMMARY_SCHEMA,
      recordType: "ENCOUNTER_SUMMARY",
      summaryId: options && options.summaryId || null,
      encounterId: encounterId,
      generatedAt: options && options.now || new Date().toISOString(),
      algorithmVersion: ALGORITHM_VERSION,
      sourceFingerprint: null,
      sourceManifest: sourceManifest([
        encounter,
        location,
      ].concat(participants, events, officerRecords, narratives)),
      who: {
        participantCount: participantViews.length,
        targetCount: participantViews.filter(function (p) { return p.encounterRole === "TARGET"; }).length,
        collateralCount: participantViews.filter(function (p) { return p.encounterRole === "COLLATERAL"; }).length,
        arrestedParticipantIds: participantViews
          .filter(function (participant) { return participant.finalOutcome === "ARRESTED"; })
          .sort(function (a, b) {
            var roleOrder = { TARGET: 0, COLLATERAL: 1 };
            return (roleOrder[a.encounterRole] == null ? 2 : roleOrder[a.encounterRole]) -
              (roleOrder[b.encounterRole] == null ? 2 : roleOrder[b.encounterRole]) ||
              (a.roleSequence || 0) - (b.roleSequence || 0) ||
              String(a.encounterParticipantId).localeCompare(String(b.encounterParticipantId));
          })
          .map(function (participant) { return participant.encounterParticipantId; }),
        participants: participantViews,
        officerCount: officers.length,
        officers: officers,
      },
      what: {
        encounterTypeCode: toCode(encounter.eventType, "UNKNOWN"),
        outcomesByCode: nonZeroCounts(outcomeCounts),
        arrestedCount: outcomeCounts.ARRESTED || 0,
        detainedCount: outcomeCounts.DETAINED || 0,
        releasedCount: outcomeCounts.RELEASED || 0,
        transferredCount: outcomeCounts.TRANSFERRED || 0,
        notInCustodyCount: outcomeCounts.NOT_IN_CUSTODY || 0,
        notContactedCount: outcomeCounts.NOT_CONTACTED || 0,
        immigrationDispositionPeopleByCode: immigrationCounts,
        earmDispositionPeopleByCode: earmDispositionCounts,
        finalOrders: {
          confirmed: finalOrderCounts.YES || 0,
          notConfirmed: finalOrderCounts.NO || 0,
          unknown: finalOrderCounts.UNKNOWN || 0,
          yesCount: finalOrderCounts.YES || 0,
          noCount: finalOrderCounts.NO || 0,
          unknownCount: finalOrderCounts.UNKNOWN || 0,
          totalParticipants: participantViews.length,
        },
      },
      where: where,
      when: {
        startedAt: encounter.startedAt || null,
        endedAt: encounter.endedAt || null,
        durationMinutes: durationMinutes(encounter.startedAt, encounter.endedAt),
      },
      how: {
        eventsByType: eventCounts,
        vehicleStopOccurred:
          toCode(encounter.eventType, "") === "VEHICLE_STOP" ||
          events.some(function (event) { return eventType(event) === "VEHICLE_STOP"; }),
        forceIncidentCount: forceEvents.length,
        forceSubjectCount: forceSubjects.length,
        forceSubjectEncounterParticipantIds: forceSubjects,
        windowBreakIncidentCount: events.filter(eventHasWindowBreak).length,
        collisionCount: events.filter(eventHasCollision).length,
        injuryIncidentCount: events.filter(eventHasInjury).length,
      },
      narrativeCoverage: narrativeCoverage,
      completenessWarnings: [],
      generatedSupervisorText: "",
    };

    summary.completenessWarnings = buildCompletenessWarnings(
      encounter,
      participants,
      events,
      where,
      narrativeCoverage
    );

    var fingerprintProjection = {
      algorithmVersion: ALGORITHM_VERSION,
      encounter: {
        encounterId: encounterId,
        eventType: encounter.eventType || null,
        startedAt: encounter.startedAt || null,
        endedAt: encounter.endedAt || null,
        primaryLocationId: encounter.primaryLocationId || null,
        reportingOfficerId: encounter.reportingOfficerId || null,
      },
      participants: participantViews.slice().sort(function (a, b) {
        return String(a.encounterParticipantId).localeCompare(String(b.encounterParticipantId));
      }),
      officers: officers.slice().sort(function (a, b) {
        return String(a.officerProfileId).localeCompare(String(b.officerProfileId));
      }),
      events: events.map(function (event) {
        return {
          encounterEventId: event.encounterEventId || null,
          sequence: Number(event.sequence) || null,
          eventType: eventType(event),
          occurredAt: event.occurredAt || null,
          participantLinks: clone(event.participantLinks || []),
          officerLinks: clone(event.officerLinks || []),
          details: clone(event.details || {}),
        };
      }).sort(function (a, b) {
        return String(a.encounterEventId || "").localeCompare(String(b.encounterEventId || ""));
      }),
      location: where,
      sourceManifest: summary.sourceManifest,
      narrativeCoverage: narrativeCoverage ? {
        requiredParticipantIds: narrativeCoverage.requiredParticipantIds,
        coveredParticipantIds: narrativeCoverage.coveredParticipantIds,
        missingParticipantIds: narrativeCoverage.missingParticipantIds,
        duplicateParticipantIds: narrativeCoverage.duplicateParticipantIds,
        coverageComplete: narrativeCoverage.coverageComplete,
      } : null,
    };
    summary.sourceFingerprint = fnv1aFingerprint(fingerprintProjection);
    summary.generatedSupervisorText = summaryText(summary);
    return summary;
  }

  /** Creates the persistable completion/finalization snapshot envelope. */
  function createEncounterSummarySnapshot(bundle, input) {
    var options = input || {};
    var summaryId = String(options.summaryId || "").trim();
    if (!summaryId) throw new Error("summaryId is required for a stored summary snapshot");
    var timestamp = options.now || new Date().toISOString();
    var snapshot = deriveEncounterSummary(bundle, {
      summaryId: summaryId,
      now: timestamp,
    });
    snapshot.recordState = "ACTIVE";
    snapshot.revision = 1;
    snapshot.createdAt = timestamp;
    snapshot.updatedAt = timestamp;
    snapshot.completedByUserId = options.completedByUserId || null;
    snapshot.override = options.override ? clone(options.override) : null;
    return snapshot;
  }

  /** Re-derives the fingerprint without mutating the stored historical snapshot. */
  function assessEncounterSummaryFreshness(storedSummary, currentBundle) {
    if (!storedSummary || !storedSummary.sourceFingerprint) {
      return {
        freshnessStatus: "UNKNOWN",
        storedFingerprint: storedSummary && storedSummary.sourceFingerprint || null,
        currentFingerprint: null,
      };
    }
    var current = deriveEncounterSummary(currentBundle);
    return {
      freshnessStatus:
        current.sourceFingerprint === storedSummary.sourceFingerprint ? "CURRENT" : "STALE",
      storedFingerprint: storedSummary.sourceFingerprint,
      currentFingerprint: current.sourceFingerprint,
    };
  }

  return Object.freeze({
    ENCOUNTER_SUMMARY_SCHEMA: SUMMARY_SCHEMA,
    ENCOUNTER_SUMMARY_ALGORITHM_VERSION: ALGORITHM_VERSION,
    deriveEncounterSummary: deriveEncounterSummary,
    buildEncounterSummary: deriveEncounterSummary,
    createEncounterSummarySnapshot: createEncounterSummarySnapshot,
    assessEncounterSummaryFreshness: assessEncounterSummaryFreshness,
    stableStringify: stableStringify,
    fingerprintStructuredSource: fnv1aFingerprint,
    eventHasStructuredWindowBreak: eventHasWindowBreak,
  });
});
