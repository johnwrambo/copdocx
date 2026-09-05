/**
 * COPDoc Build 9 narrative domain.
 *
 * Framework-free UMD module. In a browser it extends
 * `globalThis.COPDocBuild9Domain`; in Node it exports CommonJS.
 *
 * This file owns narrative collection semantics only. It does not read the
 * DOM, browser storage, or canonical Person records.
 */
(function attachNarrativeDomain(root, factory) {
  "use strict";
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.COPDocBuild9Domain = Object.assign(root.COPDocBuild9Domain || {}, api);
})(typeof globalThis !== "undefined" ? globalThis : this, function narrativeDomainFactory() {
  "use strict";

  var NARRATIVE_SCHEMA = "copdoc.narrative.v2";
  var NARRATIVE_VERSION_SCHEMA = "copdoc.narrative-version.v1";
  var NARRATIVE_OUTPUT_SCHEMA = "copdoc.narrative-output.v3";

  var NARRATIVE_KINDS = Object.freeze({
    PRIMARY_SUBJECT: "PRIMARY_SUBJECT",
    SUBJECT_SUPPLEMENT: "SUBJECT_SUPPLEMENT",
    ENCOUNTER_OVERVIEW: "ENCOUNTER_OVERVIEW",
    ENCOUNTER_SUPPLEMENT: "ENCOUNTER_SUPPLEMENT",
  });
  var NARRATIVE_KIND_VALUES = Object.freeze(Object.keys(NARRATIVE_KINDS).map(function (key) {
    return NARRATIVE_KINDS[key];
  }));
  var WORKFLOW_STATUSES = Object.freeze(["DRAFT", "FINALIZED"]);
  var FRESHNESS_STATUSES = Object.freeze(["CURRENT", "STALE", "UNKNOWN"]);
  var RECORD_STATES = Object.freeze(["ACTIVE", "ARCHIVED", "VOIDED", "SUPERSEDED"]);

  function DomainError(code, message, details) {
    this.name = "COPDocDomainError";
    this.code = code;
    this.message = message;
    this.details = details || null;
    if (Error.captureStackTrace) Error.captureStackTrace(this, DomainError);
  }
  DomainError.prototype = Object.create(Error.prototype);
  DomainError.prototype.constructor = DomainError;

  function clone(value) {
    if (value === undefined) return undefined;
    return JSON.parse(JSON.stringify(value));
  }

  function deepFreeze(value) {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
    Object.freeze(value);
    Object.keys(value).forEach(function (key) { deepFreeze(value[key]); });
    return value;
  }

  function nowIso(options) {
    var supplied = options && options.now;
    var value = typeof supplied === "function" ? supplied() : supplied;
    return String(value || new Date().toISOString());
  }

  function requiredString(value, field, code) {
    var text = String(value == null ? "" : value).trim();
    if (!text) {
      throw new DomainError(code || "FIELD_REQUIRED", field + " is required", { field: field });
    }
    return text;
  }

  function uniqueStrings(values) {
    var seen = Object.create(null);
    return (Array.isArray(values) ? values : [])
      .map(function (value) { return String(value == null ? "" : value).trim(); })
      .filter(function (value) {
        if (!value || seen[value]) return false;
        seen[value] = true;
        return true;
      });
  }

  function sectionFinalText(section) {
    if (!section) return "";
    if (typeof section.manualTextOverride === "string") {
      return section.manualTextOverride.trim();
    }
    return String(section.resolvedText || "").trim();
  }

  function normalizeSections(sections) {
    return (Array.isArray(sections) ? sections : [])
      .map(function (raw, index) {
        var section = raw || {};
        return {
          sectionId: requiredString(
            section.sectionId || section.id || "section-" + (index + 1),
            "output.sections[" + index + "].sectionId"
          ),
          sequence:
            Number.isFinite(Number(section.sequence)) && Number(section.sequence) > 0
              ? Number(section.sequence)
              : index + 1,
          title: section.title == null ? null : String(section.title),
          sectionType: section.sectionType ? String(section.sectionType) : "TEMPLATE",
          templateText: section.templateText == null ? "" : String(section.templateText),
          resolvedText: section.resolvedText == null ? "" : String(section.resolvedText),
          manualTextOverride:
            typeof section.manualTextOverride === "string"
              ? section.manualTextOverride
              : null,
          sourceFieldInstanceIds: uniqueStrings(section.sourceFieldInstanceIds),
          sourceObjectIds: uniqueStrings(section.sourceObjectIds),
          sourceEncounterParticipantIds: uniqueStrings(section.sourceEncounterParticipantIds),
        };
      })
      .sort(function (a, b) {
        return a.sequence - b.sequence || a.sectionId.localeCompare(b.sectionId);
      });
  }

  function joinSections(sections) {
    return normalizeSections(sections)
      .map(sectionFinalText)
      .filter(Boolean)
      .join("\n\n");
  }

  function normalizeOutput(output) {
    var source = output || {};
    var sections = normalizeSections(source.sections);
    var sectionText = joinSections(sections);
    var generatedResolvedText = sections.length
      ? sectionText
      : String(source.generatedResolvedText || "").trim();
    var plainTextIsManual = !!source.plainTextIsManual;
    var suppliedFinal = source.finalPlainText != null
      ? source.finalPlainText
      : source.plainText;
    var finalPlainText = plainTextIsManual && suppliedFinal != null
      ? String(suppliedFinal).trim()
      : generatedResolvedText;
    return {
      schema: NARRATIVE_OUTPUT_SCHEMA,
      sections: sections,
      generatedResolvedText: generatedResolvedText,
      finalPlainText: finalPlainText,
      plainTextIsManual: plainTextIsManual,
    };
  }

  function isSubjectKind(kind) {
    return kind === NARRATIVE_KINDS.PRIMARY_SUBJECT || kind === NARRATIVE_KINDS.SUBJECT_SUPPLEMENT;
  }

  function isSupplementKind(kind) {
    return kind === NARRATIVE_KINDS.SUBJECT_SUPPLEMENT || kind === NARRATIVE_KINDS.ENCOUNTER_SUPPLEMENT;
  }

  function defaultTitle(kind, focusParticipantId) {
    if (kind === NARRATIVE_KINDS.PRIMARY_SUBJECT) return "Primary subject narrative";
    if (kind === NARRATIVE_KINDS.SUBJECT_SUPPLEMENT) return "Subject supplement";
    if (kind === NARRATIVE_KINDS.ENCOUNTER_OVERVIEW) return "Encounter overview";
    if (kind === NARRATIVE_KINDS.ENCOUNTER_SUPPLEMENT) return "Encounter supplement";
    return focusParticipantId ? "Subject narrative" : "Encounter narrative";
  }

  function createNarrativeRecord(input, options) {
    var source = input || {};
    var narrativeId = requiredString(source.narrativeId, "narrativeId", "NARRATIVE_ID_REQUIRED");
    var encounterId = requiredString(source.encounterId, "encounterId", "ENCOUNTER_ID_REQUIRED");
    var kind = requiredString(source.narrativeKind, "narrativeKind", "NARRATIVE_KIND_REQUIRED");
    if (NARRATIVE_KIND_VALUES.indexOf(kind) === -1) {
      throw new DomainError("NARRATIVE_KIND_INVALID", "Unsupported narrativeKind: " + kind, {
        narrativeKind: kind,
      });
    }

    var focusParticipantId = source.focusEncounterParticipantId
      ? String(source.focusEncounterParticipantId).trim()
      : null;
    if (isSubjectKind(kind) && !focusParticipantId) {
      throw new DomainError(
        "FOCUS_PARTICIPANT_REQUIRED",
        kind + " requires focusEncounterParticipantId"
      );
    }
    if (!isSubjectKind(kind) && focusParticipantId) {
      throw new DomainError(
        "FOCUS_PARTICIPANT_NOT_ALLOWED",
        kind + " cannot have focusEncounterParticipantId"
      );
    }

    var timestamp = nowIso(options);
    var workflowStatus = source.workflowStatus || "DRAFT";
    var freshnessStatus = source.freshnessStatus || "CURRENT";
    if (WORKFLOW_STATUSES.indexOf(workflowStatus) === -1) {
      throw new DomainError("WORKFLOW_STATUS_INVALID", "Invalid workflowStatus: " + workflowStatus);
    }
    if (FRESHNESS_STATUSES.indexOf(freshnessStatus) === -1) {
      throw new DomainError("FRESHNESS_STATUS_INVALID", "Invalid freshnessStatus: " + freshnessStatus);
    }
    var recordState = source.recordState || "ACTIVE";
    if (RECORD_STATES.indexOf(recordState) === -1) {
      throw new DomainError("RECORD_STATE_INVALID", "Invalid recordState: " + recordState);
    }

    return {
      schema: NARRATIVE_SCHEMA,
      recordType: "NARRATIVE",
      narrativeId: narrativeId,
      encounterId: encounterId,
      narrativeKind: kind,
      focusEncounterParticipantId: focusParticipantId,
      relatedEncounterParticipantIds: uniqueStrings(source.relatedEncounterParticipantIds),
      title: String(source.title || defaultTitle(kind, focusParticipantId)),
      sequence:
        Number.isFinite(Number(source.sequence)) && Number(source.sequence) > 0
          ? Number(source.sequence)
          : 1,
      workflowStatus: workflowStatus,
      freshnessStatus: freshnessStatus,
      engine: clone(source.engine || {
        version: null,
        build: 9,
        stateSchema: "copdoc.narrative-state.v3",
        state: null,
      }),
      output: normalizeOutput(source.output),
      bindings: clone(source.bindings || []),
      factsManifest: clone(source.factsManifest || null),
      validationSnapshot: clone(source.validationSnapshot || null),
      sourceSnapshot: clone(source.sourceSnapshot || null),
      notes: source.notes == null ? null : String(source.notes),
      recordState: recordState,
      revision:
        Number.isFinite(Number(source.revision)) && Number(source.revision) > 0
          ? Number(source.revision)
          : 1,
      createdAt: source.createdAt || timestamp,
      updatedAt: source.updatedAt || timestamp,
    };
  }

  function activeNarratives(collection) {
    return (Array.isArray(collection) ? collection : []).filter(function (record) {
      return record && (record.recordState || "ACTIVE") === "ACTIVE";
    });
  }

  function findById(collection, narrativeId) {
    return (Array.isArray(collection) ? collection : []).find(function (record) {
      return record && record.narrativeId === narrativeId;
    }) || null;
  }

  function assertLogicalUniqueness(collection, record, options) {
    if (options && options.allowLogicalDuplicate === true) return;
    var active = activeNarratives(collection).filter(function (candidate) {
      return candidate.encounterId === record.encounterId && candidate.narrativeId !== record.narrativeId;
    });
    var conflict = null;
    if (record.narrativeKind === NARRATIVE_KINDS.PRIMARY_SUBJECT) {
      conflict = active.find(function (candidate) {
        return candidate.narrativeKind === NARRATIVE_KINDS.PRIMARY_SUBJECT &&
          candidate.focusEncounterParticipantId === record.focusEncounterParticipantId;
      });
    } else if (record.narrativeKind === NARRATIVE_KINDS.ENCOUNTER_OVERVIEW) {
      conflict = active.find(function (candidate) {
        return candidate.narrativeKind === NARRATIVE_KINDS.ENCOUNTER_OVERVIEW;
      });
    }
    if (conflict) {
      throw new DomainError(
        "NARRATIVE_LOGICAL_DUPLICATE",
        "An active " + record.narrativeKind + " narrative already exists for this scope",
        { existingNarrativeId: conflict.narrativeId }
      );
    }
  }

  function nextSequence(collection, encounterId, kind) {
    return activeNarratives(collection).reduce(function (max, record) {
      if (record.encounterId !== encounterId || record.narrativeKind !== kind) return max;
      return Math.max(max, Number(record.sequence) || 0);
    }, 0) + 1;
  }

  /**
   * Adds a new record. IDs are caller-owned and mandatory; this layer never
   * invents an ID or chooses an existing narrative implicitly.
   */
  function addNarrative(collection, input, options) {
    var current = Array.isArray(collection) ? collection.slice() : [];
    var source = Object.assign({}, input || {});
    if (findById(current, source.narrativeId)) {
      throw new DomainError("NARRATIVE_ID_DUPLICATE", "narrativeId already exists", {
        narrativeId: source.narrativeId,
      });
    }
    if (!(Number.isFinite(Number(source.sequence)) && Number(source.sequence) > 0)) {
      source.sequence = nextSequence(current, source.encounterId, source.narrativeKind);
    }
    var record = createNarrativeRecord(source, options);
    assertLogicalUniqueness(current, record, options);
    current.push(record);
    return { record: clone(record), narratives: current.map(clone) };
  }

  /** Adds an unlimited subject- or encounter-level supplement. */
  function addAdditionalNarrative(collection, input, options) {
    var source = Object.assign({}, input || {});
    var inferredKind = source.focusEncounterParticipantId
      ? NARRATIVE_KINDS.SUBJECT_SUPPLEMENT
      : NARRATIVE_KINDS.ENCOUNTER_SUPPLEMENT;
    source.narrativeKind = source.narrativeKind || inferredKind;
    if (!isSupplementKind(source.narrativeKind)) {
      throw new DomainError(
        "ADDITIONAL_NARRATIVE_KIND_INVALID",
        "Additional narratives must be SUBJECT_SUPPLEMENT or ENCOUNTER_SUPPLEMENT"
      );
    }
    return addNarrative(collection, source, options);
  }

  var MUTABLE_FIELDS = Object.freeze([
    "relatedEncounterParticipantIds",
    "title",
    "sequence",
    "workflowStatus",
    "freshnessStatus",
    "engine",
    "output",
    "bindings",
    "factsManifest",
    "validationSnapshot",
    "sourceSnapshot",
    "notes",
  ]);

  /** Saves exactly the requested narrative; no participant/latest fallback. */
  function saveNarrativeById(collection, narrativeId, patch, options) {
    var id = requiredString(narrativeId, "narrativeId", "NARRATIVE_ID_REQUIRED");
    var current = Array.isArray(collection) ? collection.slice() : [];
    var index = current.findIndex(function (record) { return record && record.narrativeId === id; });
    if (index < 0) throw new DomainError("NARRATIVE_NOT_FOUND", "Narrative not found: " + id);
    var existing = current[index];
    var expected = options && options.expectedRevision;
    var actualRevision = Number(existing.revision) || 0;
    if (expected != null && Number(expected) !== actualRevision) {
      throw new DomainError("REVISION_CONFLICT", "Narrative revision conflict", {
        expectedRevision: Number(expected),
        actualRevision: actualRevision,
      });
    }

    var sourcePatch = patch || {};
    ["narrativeId", "encounterId", "narrativeKind", "focusEncounterParticipantId", "schema", "recordType"]
      .forEach(function (field) {
        if (Object.prototype.hasOwnProperty.call(sourcePatch, field) && sourcePatch[field] !== existing[field]) {
          throw new DomainError("NARRATIVE_IDENTITY_IMMUTABLE", field + " cannot be changed", { field: field });
        }
      });

    if (existing.workflowStatus === "FINALIZED" && !(options && options.allowFinalizedMutation)) {
      var changesFinalizedContent = MUTABLE_FIELDS.some(function (field) {
        return field !== "freshnessStatus" && Object.prototype.hasOwnProperty.call(sourcePatch, field);
      });
      if (changesFinalizedContent) {
        throw new DomainError(
          "FINALIZED_NARRATIVE_IMMUTABLE",
          "Finalize a new version or create a supplement instead of editing finalized content"
        );
      }
    }

    var next = clone(existing);
    MUTABLE_FIELDS.forEach(function (field) {
      if (!Object.prototype.hasOwnProperty.call(sourcePatch, field)) return;
      next[field] = field === "output"
        ? normalizeOutput(sourcePatch[field])
        : field === "relatedEncounterParticipantIds"
          ? uniqueStrings(sourcePatch[field])
          : clone(sourcePatch[field]);
    });
    next.revision = (Number(existing.revision) || 0) + 1;
    next.updatedAt = nowIso(options);
    next = createNarrativeRecord(next, {
      now: next.updatedAt,
    });
    next.revision = (Number(existing.revision) || 0) + 1;
    next.createdAt = existing.createdAt;
    next.updatedAt = nowIso(options);
    assertLogicalUniqueness(current, next, options);
    current[index] = next;
    return { record: clone(next), narratives: current.map(clone) };
  }

  function archiveNarrativeById(collection, narrativeId, options) {
    var id = requiredString(narrativeId, "narrativeId", "NARRATIVE_ID_REQUIRED");
    var current = Array.isArray(collection) ? collection.slice() : [];
    var index = current.findIndex(function (record) { return record && record.narrativeId === id; });
    if (index < 0) throw new DomainError("NARRATIVE_NOT_FOUND", "Narrative not found: " + id);
    var existing = current[index];
    var expected = options && options.expectedRevision;
    if (expected != null && Number(expected) !== (Number(existing.revision) || 0)) {
      throw new DomainError("REVISION_CONFLICT", "Narrative revision conflict");
    }
    var next = clone(existing);
    next.recordState = "ARCHIVED";
    next.revision = (Number(existing.revision) || 0) + 1;
    next.updatedAt = nowIso(options);
    current[index] = next;
    return { record: clone(next), narratives: current.map(clone) };
  }

  function listNarrativesByEncounter(collection, encounterId, options) {
    var id = requiredString(encounterId, "encounterId", "ENCOUNTER_ID_REQUIRED");
    var includeInactive = options && options.includeInactive === true;
    return (Array.isArray(collection) ? collection : [])
      .filter(function (record) {
        return record && record.encounterId === id &&
          (includeInactive || (record.recordState || "ACTIVE") === "ACTIVE");
      })
      .slice()
      .sort(function (a, b) {
        return (Number(a.sequence) || 0) - (Number(b.sequence) || 0) ||
          String(a.narrativeId).localeCompare(String(b.narrativeId));
      })
      .map(clone);
  }

  function validateNarrativeRecord(record) {
    var errors = [];
    var warnings = [];
    if (!record || typeof record !== "object") {
      return { valid: false, errors: [{ code: "NARRATIVE_REQUIRED" }], warnings: warnings };
    }
    if (record.schema !== NARRATIVE_SCHEMA) errors.push({ code: "NARRATIVE_SCHEMA_INVALID", path: "schema" });
    if (!record.narrativeId) errors.push({ code: "NARRATIVE_ID_REQUIRED", path: "narrativeId" });
    if (!record.encounterId) errors.push({ code: "ENCOUNTER_ID_REQUIRED", path: "encounterId" });
    if (NARRATIVE_KIND_VALUES.indexOf(record.narrativeKind) === -1) {
      errors.push({ code: "NARRATIVE_KIND_INVALID", path: "narrativeKind" });
    }
    if (isSubjectKind(record.narrativeKind) && !record.focusEncounterParticipantId) {
      errors.push({ code: "FOCUS_PARTICIPANT_REQUIRED", path: "focusEncounterParticipantId" });
    }
    if (!isSubjectKind(record.narrativeKind) && record.focusEncounterParticipantId) {
      errors.push({ code: "FOCUS_PARTICIPANT_NOT_ALLOWED", path: "focusEncounterParticipantId" });
    }
    if (WORKFLOW_STATUSES.indexOf(record.workflowStatus) === -1) {
      errors.push({ code: "WORKFLOW_STATUS_INVALID", path: "workflowStatus" });
    }
    if (FRESHNESS_STATUSES.indexOf(record.freshnessStatus) === -1) {
      errors.push({ code: "FRESHNESS_STATUS_INVALID", path: "freshnessStatus" });
    }
    if (RECORD_STATES.indexOf(record.recordState || "ACTIVE") === -1) {
      errors.push({ code: "RECORD_STATE_INVALID", path: "recordState" });
    }
    var outputIsValid = !!record.output &&
      record.output.schema === NARRATIVE_OUTPUT_SCHEMA &&
      Array.isArray(record.output.sections);
    if (!outputIsValid) {
      errors.push({ code: "NARRATIVE_OUTPUT_INVALID", path: "output" });
    }
    if (outputIsValid && record.output.finalPlainText && record.output.sections.length === 0) {
      warnings.push({ code: "STRUCTURED_SECTIONS_MISSING", path: "output.sections" });
    }
    return { valid: errors.length === 0, errors: errors, warnings: warnings };
  }

  function createNarrativeVersionRecord(narrative, input, options) {
    var source = input || {};
    var validation = validateNarrativeRecord(narrative);
    if (!validation.valid) {
      throw new DomainError("NARRATIVE_INVALID", "Cannot version an invalid narrative", validation);
    }
    if (narrative.workflowStatus !== "FINALIZED") {
      throw new DomainError(
        "NARRATIVE_NOT_FINALIZED",
        "Only a FINALIZED narrative can be stored as a narrative version",
        { workflowStatus: narrative.workflowStatus || null }
      );
    }
    var versionId = requiredString(
      source.narrativeVersionId,
      "narrativeVersionId",
      "NARRATIVE_VERSION_ID_REQUIRED"
    );
    var timestamp = nowIso(options);
    return deepFreeze({
      schema: NARRATIVE_VERSION_SCHEMA,
      recordType: "NARRATIVE_VERSION",
      narrativeVersionId: versionId,
      narrativeId: narrative.narrativeId,
      encounterId: narrative.encounterId,
      focusEncounterParticipantId: narrative.focusEncounterParticipantId || null,
      narrativeKind: narrative.narrativeKind,
      versionNumber:
        Number.isFinite(Number(source.versionNumber)) && Number(source.versionNumber) > 0
          ? Number(source.versionNumber)
          : 1,
      finalizedAt: source.finalizedAt || timestamp,
      finalizedByUserId: source.finalizedByUserId || null,
      snapshot: clone(narrative),
      sourceFingerprint: source.sourceFingerprint || null,
      recordState: "ACTIVE",
      revision: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  }

  return Object.freeze({
    DomainError: DomainError,
    NARRATIVE_SCHEMA: NARRATIVE_SCHEMA,
    NARRATIVE_VERSION_SCHEMA: NARRATIVE_VERSION_SCHEMA,
    NARRATIVE_OUTPUT_SCHEMA: NARRATIVE_OUTPUT_SCHEMA,
    NARRATIVE_KINDS: NARRATIVE_KINDS,
    NARRATIVE_KIND_VALUES: NARRATIVE_KIND_VALUES,
    WORKFLOW_STATUSES: WORKFLOW_STATUSES,
    FRESHNESS_STATUSES: FRESHNESS_STATUSES,
    createNarrativeRecord: createNarrativeRecord,
    addNarrative: addNarrative,
    addAdditionalNarrative: addAdditionalNarrative,
    saveNarrativeById: saveNarrativeById,
    archiveNarrativeById: archiveNarrativeById,
    listNarrativesByEncounter: listNarrativesByEncounter,
    validateNarrativeRecord: validateNarrativeRecord,
    createNarrativeVersionRecord: createNarrativeVersionRecord,
    normalizeNarrativeOutput: normalizeOutput,
    normalizeNarrativeSections: normalizeSections,
    joinNarrativeSections: joinSections,
    sectionFinalText: sectionFinalText,
  });
});
