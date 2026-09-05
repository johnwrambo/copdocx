/**
 * COPDoc Build 9 primary-subject narrative coverage.
 *
 * Coverage is keyed by EncounterParticipant ID, never Person ID. A participant
 * is required when active and assigned TARGET or COLLATERAL. Supplements do not
 * satisfy primary coverage.
 */
(function attachNarrativeCoverage(root, factory) {
  "use strict";
  var domain =
    typeof module === "object" && module.exports
      ? require("./narrative-domain.js")
      : root.COPDocBuild9Domain;
  var api = factory(domain);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.COPDocBuild9Domain = Object.assign(root.COPDocBuild9Domain || {}, api);
})(typeof globalThis !== "undefined" ? globalThis : this, function narrativeCoverageFactory(domain) {
  "use strict";

  if (!domain || !domain.NARRATIVE_KINDS) {
    throw new Error("narrative-domain.js must load before narrative-coverage.js");
  }

  var COVERAGE_SCHEMA = "copdoc.narrative-coverage.v1";
  var REQUIRED_ROLES = Object.freeze(["TARGET", "COLLATERAL"]);

  function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  function isActive(record) {
    return !!record && (record.recordState || "ACTIVE") === "ACTIVE";
  }

  function participantId(record) {
    return String(record && record.encounterParticipantId || "").trim();
  }

  function participantAliases(record) {
    var seen = Object.create(null);
    return [participantId(record), record && record.subjectId].concat(
      record && Array.isArray(record.legacyEncounterParticipantIds)
        ? record.legacyEncounterParticipantIds
        : []
    ).reduce(function (output, value) {
      var id = String(value || "").trim();
      if (id && !seen[id]) {
        seen[id] = true;
        output.push(id);
      }
      return output;
    }, []);
  }

  function participantAliasIndex(participants, warnings) {
    var claims = Object.create(null);
    (participants || []).forEach(function (participant) {
      var canonicalId = participantId(participant);
      participantAliases(participant).forEach(function (alias) {
        claims[alias] = claims[alias] || Object.create(null);
        claims[alias][canonicalId] = true;
      });
    });
    var resolved = Object.create(null);
    Object.keys(claims).forEach(function (alias) {
      var ids = Object.keys(claims[alias]);
      if (ids.length === 1) {
        resolved[alias] = ids[0];
        return;
      }
      warnings.push({
        code: "PARTICIPANT_ALIAS_AMBIGUOUS",
        encounterParticipantAlias: alias,
        encounterParticipantIds: ids.sort(),
        message: "A legacy participant alias matches more than one active participant."
      });
    });
    return resolved;
  }

  function participantRole(record) {
    return String(record && record.encounterRole || "").trim().toUpperCase();
  }

  function participantOrder(a, b) {
    var roleA = REQUIRED_ROLES.indexOf(participantRole(a));
    var roleB = REQUIRED_ROLES.indexOf(participantRole(b));
    return roleA - roleB ||
      (Number(a.roleSequence) || 0) - (Number(b.roleSequence) || 0) ||
      participantId(a).localeCompare(participantId(b));
  }

  function uniqueByParticipantId(participants, warnings) {
    var seen = Object.create(null);
    return (Array.isArray(participants) ? participants : [])
      .filter(isActive)
      .filter(function (record) {
        if (REQUIRED_ROLES.indexOf(participantRole(record)) === -1) return false;
        var id = participantId(record);
        if (!id) {
          warnings.push({
            code: "PARTICIPANT_ID_MISSING",
            message: "An active TARGET/COLLATERAL participant has no encounterParticipantId.",
          });
          return false;
        }
        if (seen[id]) {
          warnings.push({
            code: "PARTICIPANT_ID_DUPLICATE",
            encounterParticipantId: id,
            message: "Duplicate participant input was ignored during coverage calculation.",
          });
          return false;
        }
        seen[id] = true;
        return true;
      })
      .sort(participantOrder);
  }

  function isNarrativeInvalid(record) {
    var validation = domain.validateNarrativeRecord(record);
    return !validation.valid ||
      !!(record && record.validationSnapshot && record.validationSnapshot.valid === false);
  }

  /**
   * @param {object} input
   * @param {string} input.encounterId
   * @param {Array<object>} input.participants
   * @param {Array<object>} input.narratives
   */
  function validatePrimaryNarrativeCoverage(input) {
    var source = input || {};
    var encounterId = String(source.encounterId || "").trim();
    if (!encounterId) {
      throw new domain.DomainError("ENCOUNTER_ID_REQUIRED", "encounterId is required for coverage");
    }

    var warnings = [];
    var errors = [];
    var required = uniqueByParticipantId(source.participants, warnings).filter(function (record) {
      return !record.encounterId || record.encounterId === encounterId;
    });
    var identityCollisionParticipantIds = warnings
      .filter(function (warning) {
        return warning && warning.code === "PARTICIPANT_ID_DUPLICATE";
      })
      .map(function (warning) {
        return warning.encounterParticipantId;
      });
    var missingIdentityCount = warnings.filter(function (warning) {
      return warning && warning.code === "PARTICIPANT_ID_MISSING";
    }).length;
    if (missingIdentityCount) {
      errors.push({
        code: "PARTICIPANT_ID_MISSING",
        count: missingIdentityCount,
        message: "Every required Encounter participant must have a canonical identity.",
      });
    }
    identityCollisionParticipantIds.forEach(function (id) {
      errors.push({
        code: "PARTICIPANT_ID_DUPLICATE",
        encounterParticipantId: id,
        message: "Duplicate canonical Encounter participant identity: " + id,
      });
    });
    var requiredMap = Object.create(null);
    required.forEach(function (record) { requiredMap[participantId(record)] = record; });
    var aliasIndex = participantAliasIndex(required, warnings);

    var activePrimary = (Array.isArray(source.narratives) ? source.narratives : [])
      .filter(isActive)
      .filter(function (record) {
        return record.narrativeKind === domain.NARRATIVE_KINDS.PRIMARY_SUBJECT &&
          record.encounterId === encounterId;
      });

    var grouped = Object.create(null);
    var orphanNarrativeIds = [];
    var invalidNarrativeIds = [];
    var draftNarrativeIds = [];
    var staleNarrativeIds = [];
    var unknownFreshnessNarrativeIds = [];

    activePrimary.forEach(function (record) {
      var id = String(record.narrativeId || "");
      var focusId = String(record.focusEncounterParticipantId || "");
      var canonicalFocusId = aliasIndex[focusId] || "";
      if (!canonicalFocusId || !requiredMap[canonicalFocusId]) {
        if (id) orphanNarrativeIds.push(id);
        return;
      }
      if (!grouped[canonicalFocusId]) grouped[canonicalFocusId] = [];
      grouped[canonicalFocusId].push(record);
      if (record.workflowStatus !== "FINALIZED" && id) draftNarrativeIds.push(id);
      if (record.freshnessStatus === "STALE" && id) staleNarrativeIds.push(id);
      if (record.freshnessStatus !== "CURRENT" && record.freshnessStatus !== "STALE" && id) {
        unknownFreshnessNarrativeIds.push(id);
      }
      if (isNarrativeInvalid(record) && id) invalidNarrativeIds.push(id);
    });

    var coveredParticipantIds = [];
    var missingParticipantIds = [];
    var duplicateParticipantIds = [];
    var participantCoverage = required.map(function (record) {
      var id = participantId(record);
      var matches = (grouped[id] || []).slice().sort(function (a, b) {
        return String(a.narrativeId || "").localeCompare(String(b.narrativeId || ""));
      });
      var status = "COVERED";
      if (matches.length === 0) {
        status = "MISSING";
        missingParticipantIds.push(id);
      } else if (matches.length > 1) {
        status = "DUPLICATE";
        duplicateParticipantIds.push(id);
      } else {
        coveredParticipantIds.push(id);
      }
      return {
        encounterParticipantId: id,
        encounterRole: participantRole(record),
        roleSequence: Number(record.roleSequence) || null,
        status: status,
        primaryNarrativeIds: matches.map(function (narrative) { return narrative.narrativeId; }),
      };
    });

    missingParticipantIds.forEach(function (id) {
      errors.push({
        code: "PRIMARY_NARRATIVE_MISSING",
        encounterParticipantId: id,
        message: "Participant " + id + " requires one active PRIMARY_SUBJECT narrative.",
      });
    });
    duplicateParticipantIds.forEach(function (id) {
      errors.push({
        code: "PRIMARY_NARRATIVE_DUPLICATE",
        encounterParticipantId: id,
        message: "Participant " + id + " has more than one active PRIMARY_SUBJECT narrative.",
      });
    });
    orphanNarrativeIds.forEach(function (id) {
      errors.push({
        code: "PRIMARY_NARRATIVE_ORPHAN",
        narrativeId: id,
        message: "Primary narrative " + id + " does not focus an active TARGET/COLLATERAL participant.",
      });
    });
    draftNarrativeIds.forEach(function (id) {
      warnings.push({ code: "PRIMARY_NARRATIVE_DRAFT", narrativeId: id });
    });
    staleNarrativeIds.forEach(function (id) {
      warnings.push({ code: "PRIMARY_NARRATIVE_STALE", narrativeId: id });
    });
    unknownFreshnessNarrativeIds.forEach(function (id) {
      warnings.push({ code: "PRIMARY_NARRATIVE_FRESHNESS_UNKNOWN", narrativeId: id });
    });
    invalidNarrativeIds.forEach(function (id) {
      warnings.push({ code: "PRIMARY_NARRATIVE_INVALID", narrativeId: id });
    });

    var coverageComplete =
      missingIdentityCount === 0 &&
      identityCollisionParticipantIds.length === 0 &&
      missingParticipantIds.length === 0 &&
      duplicateParticipantIds.length === 0 &&
      orphanNarrativeIds.length === 0;
    var finalizationReady =
      coverageComplete &&
      draftNarrativeIds.length === 0 &&
      staleNarrativeIds.length === 0 &&
      unknownFreshnessNarrativeIds.length === 0 &&
      invalidNarrativeIds.length === 0;

    return {
      schema: COVERAGE_SCHEMA,
      encounterId: encounterId,
      requiredParticipantIds: required.map(participantId),
      coveredParticipantIds: coveredParticipantIds,
      missingParticipantIds: missingParticipantIds,
      duplicateParticipantIds: duplicateParticipantIds,
      identityCollisionParticipantIds: identityCollisionParticipantIds,
      missingIdentityCount: missingIdentityCount,
      draftNarrativeIds: draftNarrativeIds.sort(),
      staleNarrativeIds: staleNarrativeIds.sort(),
      unknownFreshnessNarrativeIds: unknownFreshnessNarrativeIds.sort(),
      invalidNarrativeIds: invalidNarrativeIds.sort(),
      orphanNarrativeIds: orphanNarrativeIds.sort(),
      participantCoverage: participantCoverage,
      requiredCount: required.length,
      coveredCount: coveredParticipantIds.length,
      coverageComplete: coverageComplete,
      finalizationReady: finalizationReady,
      errors: errors,
      warnings: warnings,
    };
  }

  function assertPrimaryNarrativeCoverage(input, options) {
    var report = validatePrimaryNarrativeCoverage(input);
    var requireFinalized = options && options.requireFinalized === true;
    var ok = requireFinalized ? report.finalizationReady : report.coverageComplete;
    if (!ok) {
      throw new domain.DomainError(
        requireFinalized ? "NARRATIVE_FINALIZATION_NOT_READY" : "NARRATIVE_COVERAGE_INCOMPLETE",
        "Encounter narrative coverage requirements are not satisfied",
        clone(report)
      );
    }
    return report;
  }

  return Object.freeze({
    NARRATIVE_COVERAGE_SCHEMA: COVERAGE_SCHEMA,
    REQUIRED_NARRATIVE_PARTICIPANT_ROLES: REQUIRED_ROLES,
    validatePrimaryNarrativeCoverage: validatePrimaryNarrativeCoverage,
    assertPrimaryNarrativeCoverage: assertPrimaryNarrativeCoverage,
  });
});
