/**
 * COPDoc Build 9 Encounter-domain public facade.
 *
 * Browser namespace: `COPDoc.narratives.build9`
 * Node/CommonJS: `require("./index.js")`
 */
(function attachBuild9Facade(root, factory) {
  "use strict";
  var base;
  if (typeof module === "object" && module.exports) {
    base = Object.assign(
      {},
      require("./narrative-domain.js"),
      require("./narrative-coverage.js"),
      require("./encounter-summary.js")
    );
  } else {
    base = root.COPDocBuild9Domain || {};
  }
  var api = factory(base);
  if (typeof module === "object" && module.exports) module.exports = api;

  root.COPDoc = root.COPDoc || {};
  root.COPDoc.narratives = root.COPDoc.narratives || {};
  root.COPDoc.narratives.build9 = api;
  // Compatibility alias for isolated demo pages that loaded earlier staging files.
  root.COPDocBuild9Domain = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function build9FacadeFactory(base) {
  "use strict";

  function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  function inferEncounterId(input) {
    if (input && input.encounterId) return String(input.encounterId);
    var ids = Object.create(null);
    (input && input.participants || []).forEach(function (record) {
      if (record && record.encounterId) ids[String(record.encounterId)] = true;
    });
    (input && input.narratives || []).forEach(function (record) {
      if (record && record.encounterId) ids[String(record.encounterId)] = true;
    });
    var values = Object.keys(ids);
    if (values.length === 1) return values[0];
    throw new base.DomainError(
      values.length ? "ENCOUNTER_ID_AMBIGUOUS" : "ENCOUNTER_ID_REQUIRED",
      "validateCoverage requires one unambiguous encounterId"
    );
  }

  function validateCoverage(input) {
    var source = input || {};
    return base.validatePrimaryNarrativeCoverage({
      encounterId: inferEncounterId(source),
      participants: source.participants || [],
      narratives: source.narratives || [],
    });
  }

  function deriveEncounterSummary(bundle, options) {
    var opts = Object.assign({}, options || {});
    var source = Object.assign({}, bundle || {});
    if (opts.narrativeCoverage) source.narrativeCoverage = opts.narrativeCoverage;
    delete opts.narrativeCoverage;
    return base.deriveEncounterSummary(source, opts);
  }

  /**
   * Small in-memory adapter for the standalone demonstration. Production
   * persistence should call the same pure functions through workspaceRepository.
   */
  function NarrativeStore(initialNarratives) {
    this._narratives = clone(Array.isArray(initialNarratives) ? initialNarratives : []);
  }

  NarrativeStore.prototype.create = function create(input, options) {
    var result = base.addNarrative(this._narratives, input, options);
    this._narratives = result.narratives;
    return result.record;
  };

  NarrativeStore.prototype.addAdditional = function addAdditional(input, options) {
    var result = base.addAdditionalNarrative(this._narratives, input, options);
    this._narratives = result.narratives;
    return result.record;
  };

  NarrativeStore.prototype.save = function save(narrativeId, patch, options) {
    var result = base.saveNarrativeById(this._narratives, narrativeId, patch, options);
    this._narratives = result.narratives;
    return result.record;
  };

  NarrativeStore.prototype.archive = function archive(narrativeId, options) {
    var result = base.archiveNarrativeById(this._narratives, narrativeId, options);
    this._narratives = result.narratives;
    return result.record;
  };

  NarrativeStore.prototype.get = function get(narrativeId) {
    var record = this._narratives.find(function (candidate) {
      return candidate && candidate.narrativeId === narrativeId;
    });
    return record ? clone(record) : null;
  };

  NarrativeStore.prototype.listByEncounter = function listByEncounter(encounterId, options) {
    return base.listNarrativesByEncounter(this._narratives, encounterId, options);
  };

  NarrativeStore.prototype.all = function all() {
    return clone(this._narratives);
  };

  NarrativeStore.prototype.replaceAll = function replaceAll(narratives) {
    this._narratives = clone(Array.isArray(narratives) ? narratives : []);
    return this.all();
  };

  var facade = Object.assign({}, base, {
    NarrativeStore: NarrativeStore,
    createNarrativeStore: function createNarrativeStore(initialNarratives) {
      return new NarrativeStore(initialNarratives);
    },
    createNarrative: base.createNarrativeRecord,
    storeNarrative: base.addNarrative,
    saveNarrative: base.saveNarrativeById,
    validateCoverage: validateCoverage,
    deriveEncounterSummary: deriveEncounterSummary,
    fingerprint: base.fingerprintStructuredSource,
  });

  return Object.freeze(facade);
});
