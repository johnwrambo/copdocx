/**
 * Local RAP-sheet text importer for COPDoc.
 *
 * This first adapter is intentionally conservative. It parses pasted
 * Texas/III-style text into an in-memory review object, preserves the exact
 * source line for every fact, and stages parser results for review before an
 * explicit apply action can populate compatible lead fields. Existing values
 * are never overwritten silently. Arrest, filing, amended charge, disposition,
 * and sentence stages remain separate so an arrest charge cannot silently
 * become a conviction.
 */
(function (root) {
  "use strict";

  var PARSER_VERSION = "0.2.0";
  var DEFAULT_LIMITS = {
    maxCharacters: 2 * 1024 * 1024,
    maxPages: 200,
    maxLines: 50000,
    maxLineLength: 12000,
    maxFieldsPerLine: 100,
    maxFacts: 1500,
    maxCycles: 250,
    maxUnparsedSections: 250
  };
  var fallbackIdCounter = 0;
  var NON_ALPHANUMERIC_COMPARISON_PATTERN = null;
  try {
    NON_ALPHANUMERIC_COMPARISON_PATTERN = new RegExp(
      "[^\\p{L}\\p{N}]+",
      "gu"
    );
  } catch (unicodePatternError) {
    NON_ALPHANUMERIC_COMPARISON_PATTERN = null;
  }

  var FIELD_DEFINITIONS = [
    { key: "primaryName", aliases: ["PRIMARY NAME", "SUBJECT NAME", "NAME", "NAM"] },
    { key: "aliasName", aliases: ["ALTERNATE NAME", "ALIASES", "ALIAS", "AKA"] },
    { key: "dateOfBirth", aliases: ["ALTERNATE DOB", "DATE OF BIRTH", "BIRTH DATE", "DOB"] },
    { key: "fbiNumber", aliases: ["FBI NUMBER", "FBI NO.", "FBI NO", "FBIN", "FBI"] },
    { key: "stateId", aliases: ["STATE IDENTIFICATION NUMBER", "STATE IDENTIFICATION", "STATE ID", "SID"] },
    { key: "driverLicense", aliases: ["DRIVER LICENSE NUMBER", "DRIVER LICENSE", "DL NUMBER", "DLN", "DL"] },
    { key: "sex", aliases: ["SEX"] },
    { key: "race", aliases: ["RACE", "RAC"] },
    { key: "height", aliases: ["HEIGHT", "HGT"] },
    { key: "weight", aliases: ["WEIGHT", "WGT"] },
    { key: "hairColor", aliases: ["HAIR COLOR", "HAIR", "HAI"] },
    { key: "eyeColor", aliases: ["EYE COLOR", "EYES", "EYE"] },
    { key: "smt", aliases: ["SCARS MARKS TATTOOS", "SCARS/MARKS/TATTOOS", "SCARS MARKS AND TATTOOS", "SMT"] },
    { key: "recordWarning", aliases: ["IDENTITY CAUTION", "RECORD WARNING", "CAUTION", "WARNING"] },

    { key: "arrestDate", aliases: ["DATE OF ARREST", "ARREST DATE", "DOA"] },
    { key: "arrestLocation", aliases: ["ARREST LOCATION", "PLACE OF ARREST"] },
    { key: "arrestAgency", aliases: ["ARRESTING AGENCY", "ARREST AGENCY"] },
    { key: "arrestOri", aliases: ["ARRESTING ORI", "AGENCY ORI", "ORI"] },
    { key: "arrestNumber", aliases: ["ARREST TRACKING NUMBER", "ARREST NUMBER", "ARREST NO.", "ARREST NO"] },
    { key: "bookingDate", aliases: ["DATE BOOKED", "BOOKING DATE", "BOOKED DATE"] },
    { key: "bookingNumber", aliases: ["BOOKING NUMBER", "BOOKING NO.", "BOOKING NO", "BOOK NO.", "BOOK NO"] },
    { key: "bookingFacility", aliases: ["BOOKING FACILITY", "BOOKED AT"] },

    { key: "arrestCharge", aliases: ["CHARGE AT ARREST", "ARREST CHARGE", "ARREST OFFENSE"] },
    { key: "filedCharge", aliases: ["PROSECUTOR CHARGE", "CHARGE FILED", "FILED CHARGE", "FILED OFFENSE"] },
    { key: "amendedCharge", aliases: ["AMENDED/REDUCED CHARGE", "AMENDED CHARGE", "REDUCED CHARGE", "FINAL CHARGE"] },
    { key: "courtCharge", aliases: ["COURT CHARGE", "COURT OFFENSE"] },
    { key: "genericCharge", aliases: ["CHARGE", "OFFENSE"] },
    { key: "statute", aliases: ["OFFENSE CODE", "STATUTE/ORDINANCE", "STATUTE", "ORDINANCE", "CODE"] },
    { key: "classification", aliases: ["OFFENSE CLASS", "CLASSIFICATION", "SEVERITY", "GRADE", "CLASS"] },

    { key: "filingDate", aliases: ["PROSECUTOR FILING DATE", "DATE FILED", "FILING DATE", "FILED DATE"] },
    { key: "prosecutingAgency", aliases: ["PROSECUTING AGENCY", "PROSECUTOR"] },
    { key: "prosecutionCaseNumber", aliases: ["PROSECUTOR CASE NUMBER", "PROSECUTION CASE NUMBER"] },
    { key: "courtName", aliases: ["COURT NAME", "COURT"] },
    { key: "docketNumber", aliases: ["DOCKET NUMBER", "DOCKET NO.", "DOCKET NO", "CAUSE NUMBER", "CAUSE NO.", "CAUSE NO", "CASE NUMBER", "CASE NO.", "CASE NO", "DOCKET", "CAUSE", "CASE"] },
    { key: "disposition", aliases: ["COURT DISPOSITION", "DISPOSITION", "DISP"] },
    { key: "dispositionDate", aliases: ["DATE OF DISPOSITION", "DISPOSITION DATE", "DISP DATE"] },
    { key: "convictionDate", aliases: ["DATE OF CONVICTION", "CONVICTION DATE"] },

    { key: "sentence", aliases: ["COURT SENTENCE", "SENTENCE"] },
    { key: "incarceration", aliases: ["INCARCERATION", "CONFINEMENT", "JAIL TERM", "PRISON TERM"] },
    { key: "suspendedSentence", aliases: ["SUSPENDED SENTENCE", "SUSPENDED TIME"] },
    { key: "fine", aliases: ["COURT COSTS/FINE", "COURT COSTS", "FINE"] },
    { key: "probation", aliases: ["PROBATION"] },
    { key: "parole", aliases: ["PAROLE"] },
    { key: "supervision", aliases: ["COMMUNITY SUPERVISION", "SUPERVISION"] },
    { key: "release", aliases: ["RELEASE INFORMATION", "RELEASE DATE", "RELEASE"] }
  ];

  var LABEL_TO_KEY = {};
  var ALL_LABELS = [];
  var DELIMITED_FIELD_PATTERN;
  var SINGLE_FIELD_PATTERN;

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function normalizeLabel(value) {
    return String(value || "")
      .toUpperCase()
      .replace(/\s+/g, " ")
      .trim();
  }

  function initializeFieldPatterns() {
    var i;
    var j;
    for (i = 0; i < FIELD_DEFINITIONS.length; i += 1) {
      for (j = 0; j < FIELD_DEFINITIONS[i].aliases.length; j += 1) {
        var alias = normalizeLabel(FIELD_DEFINITIONS[i].aliases[j]);
        LABEL_TO_KEY[alias] = FIELD_DEFINITIONS[i].key;
        ALL_LABELS.push(alias);
      }
    }

    ALL_LABELS.sort(function (left, right) {
      return right.length - left.length;
    });

    var source = ALL_LABELS.map(escapeRegExp).join("|");
    DELIMITED_FIELD_PATTERN = new RegExp(
      "(^|[;|]|\\s+)(" + source + ")\\s*[:/#=]\\s*",
      "gi"
    );
    SINGLE_FIELD_PATTERN = new RegExp(
      "^\\s*(" + source + ")(?:\\s*[:/#=]\\s*|\\s+-\\s+|\\s+)(.+?)\\s*$",
      "i"
    );
  }

  initializeFieldPatterns();

  var FIELD_DOMAINS = {
    primaryName: "identity",
    aliasName: "identity",
    dateOfBirth: "identity",
    fbiNumber: "identity",
    stateId: "identity",
    driverLicense: "identity",
    sex: "identity",
    race: "identity",
    height: "identity",
    weight: "identity",
    hairColor: "identity",
    eyeColor: "identity",
    smt: "identity",
    recordWarning: "identity",
    arrestDate: "arrest",
    arrestLocation: "arrest",
    arrestAgency: "arrest",
    arrestOri: "arrest",
    arrestNumber: "arrest",
    bookingDate: "booking",
    bookingNumber: "booking",
    bookingFacility: "booking",
    arrestCharge: "charge",
    filedCharge: "charge",
    amendedCharge: "charge",
    courtCharge: "charge",
    genericCharge: "charge",
    statute: "charge",
    classification: "charge",
    filingDate: "prosecution",
    prosecutingAgency: "prosecution",
    prosecutionCaseNumber: "prosecution",
    courtName: "court",
    docketNumber: "court",
    disposition: "disposition",
    dispositionDate: "disposition",
    convictionDate: "disposition",
    sentence: "sentence",
    incarceration: "sentence",
    suspendedSentence: "sentence",
    fine: "sentence",
    probation: "supervision",
    parole: "supervision",
    supervision: "supervision",
    release: "supervision"
  };

  var ALLOWED_FIELD_TRANSITIONS = {
    identity: { identity: true },
    arrest: { arrest: true, booking: true, charge: true },
    booking: { arrest: true, booking: true, charge: true },
    charge: { charge: true, disposition: true },
    prosecution: { prosecution: true, charge: true, court: true, disposition: true },
    court: { court: true, charge: true, disposition: true, sentence: true },
    disposition: { disposition: true, sentence: true, supervision: true },
    sentence: { sentence: true, supervision: true },
    supervision: { supervision: true }
  };

  function fieldCanFollow(firstKey, candidateKey) {
    var firstDomain = FIELD_DOMAINS[firstKey];
    var candidateDomain = FIELD_DOMAINS[candidateKey];
    return !!(
      firstDomain &&
      candidateDomain &&
      ALLOWED_FIELD_TRANSITIONS[firstDomain] &&
      ALLOWED_FIELD_TRANSITIONS[firstDomain][candidateDomain]
    );
  }

  function createDefaultId(prefix) {
    fallbackIdCounter += 1;
    if (
      root.crypto &&
      typeof root.crypto.randomUUID === "function"
    ) {
      return prefix + "-" + root.crypto.randomUUID();
    }
    return (
      prefix +
      "-" +
      Date.now().toString(36) +
      "-" +
      fallbackIdCounter.toString(36)
    );
  }

  function resolveImportedAt(options) {
    var supplied = options && options.now;
    var value = typeof supplied === "function" ? supplied() : supplied;
    var date = value instanceof Date ? value : new Date(value || Date.now());
    if (isNaN(date.getTime())) {
      date = new Date();
    }
    return date.toISOString();
  }

  function makeContext(options) {
    options = options || {};
    return {
      options: options,
      importedAt: resolveImportedAt(options),
      idFactory:
        typeof options.idFactory === "function"
          ? options.idFactory
          : createDefaultId,
      factCount: 0
    };
  }

  function nextId(context, prefix) {
    return String(context.idFactory(prefix));
  }

  function mergeLimits(options) {
    var supplied = (options && options.limits) || {};
    return {
      maxCharacters: supplied.maxCharacters || DEFAULT_LIMITS.maxCharacters,
      maxPages: supplied.maxPages || DEFAULT_LIMITS.maxPages,
      maxLines: supplied.maxLines || DEFAULT_LIMITS.maxLines,
      maxLineLength: supplied.maxLineLength || DEFAULT_LIMITS.maxLineLength,
      maxFieldsPerLine:
        supplied.maxFieldsPerLine || DEFAULT_LIMITS.maxFieldsPerLine,
      maxFacts: supplied.maxFacts || DEFAULT_LIMITS.maxFacts,
      maxCycles: supplied.maxCycles || DEFAULT_LIMITS.maxCycles,
      maxUnparsedSections:
        supplied.maxUnparsedSections || DEFAULT_LIMITS.maxUnparsedSections
    };
  }

  function normalizedValue(value) {
    return String(value == null ? "" : value)
      .replace(/\s+/g, " ")
      .trim()
      .replace(/^[;|]+|[;|]+$/g, "")
      .trim();
  }

  function sourceReference(line) {
    if (!line) {
      return {
        sourcePage: null,
        sourceLine: null,
        sourceOffset: null,
        sourceText: null
      };
    }
    return {
      sourcePage: line.pageNumber == null ? null : line.pageNumber,
      sourceLine: {
        start: line.documentLine,
        end: line.documentLine,
        pageLineStart: line.pageLine,
        pageLineEnd: line.pageLine
      },
      sourceOffset: {
        start: line.startOffset,
        end: line.endOffset
      },
      sourceText: line.raw
    };
  }

  function parserLimitError(code, message, line, details) {
    var error = new Error(message);
    error.isRapSheetParserLimit = true;
    error.code = code;
    error.sourceLineObject = line || null;
    error.details = details || null;
    return error;
  }

  function makeFact(state, field, rawValue, line, confidence, basis) {
    if (
      state.context.limits &&
      state.context.factCount >= state.context.limits.maxFacts
    ) {
      throw parserLimitError(
        "fact_limit_exceeded",
        "The input produced more facts than the local review limit and was not parsed.",
        line,
        { maximum: state.context.limits.maxFacts }
      );
    }
    var reference = sourceReference(line);
    var fact = {
      factId: nextId(state.context, "fact"),
      field: field,
      value: normalizedValue(rawValue),
      rawValue: String(rawValue == null ? "" : rawValue).trim(),
      sourceText: reference.sourceText,
      sourcePage: reference.sourcePage,
      sourceLine: reference.sourceLine,
      sourceOffset: reference.sourceOffset,
      confidence: confidence == null ? 0.95 : confidence,
      verified: false,
      reviewStatus: "pending",
      basis: basis || "explicitly_stated"
    };
    state.context.factCount += 1;
    return fact;
  }

  function addWarning(state, code, message, severity, line, details) {
    var reference = sourceReference(line);
    var warning = {
      warningId: nextId(state.context, "warning"),
      code: code,
      message: message,
      severity: severity || "warning",
      sourcePage: reference.sourcePage,
      sourceLine: reference.sourceLine,
      sourceText: reference.sourceText
    };
    if (details) {
      warning.details = details;
    }
    state.result.warnings.push(warning);
    return warning;
  }

  function splitSourceLines(text, pageNumber, startingDocumentLine, baseOffset) {
    var value = String(text == null ? "" : text);
    var lines = [];
    var separator = /\r\n|\r|\n|\f/g;
    var lastIndex = 0;
    var pageLine = 1;
    var match;

    while ((match = separator.exec(value))) {
      lines.push({
        raw: value.slice(lastIndex, match.index),
        pageNumber: pageNumber == null ? null : pageNumber,
        pageLine: pageLine,
        documentLine: startingDocumentLine + lines.length,
        startOffset: baseOffset + lastIndex,
        endOffset: baseOffset + match.index
      });
      lastIndex = separator.lastIndex;
      pageLine += 1;
    }

    lines.push({
      raw: value.slice(lastIndex),
      pageNumber: pageNumber == null ? null : pageNumber,
      pageLine: pageLine,
      documentLine: startingDocumentLine + lines.length,
      startOffset: baseOffset + lastIndex,
      endOffset: baseOffset + value.length
    });

    return lines;
  }

  function detectRapSheetFormat(text) {
    var value = String(text || "");
    var upper = value.toUpperCase();

    if (/^\s*<\?XML\b|^\s*<[A-Z][^>]*>/i.test(value)) {
      return {
        id: "xml",
        label: "XML",
        system: "unknown",
        jurisdiction: null,
        confidence: 0.99,
        supported: false
      };
    }

    if (/\bNLETS\b|\bCHIEF\b/.test(upper)) {
      return {
        id: "nlets-chief-text",
        label: "Nlets / CHIEF text",
        system: "NLETS",
        jurisdiction: /\bTEXAS\b|\bTXDPS\b|\bTCIC\b/.test(upper) ? "TX" : null,
        confidence: 0.9,
        supported: true
      };
    }

    if (
      /INTERSTATE IDENTIFICATION INDEX|\bIII\b|FBI IDENTIFICATION RECORD/.test(
        upper
      )
    ) {
      return {
        id: "fbi-iii-text",
        label: "FBI / III text",
        system: "III",
        jurisdiction: /\bTEXAS\b|\bTXDPS\b|\bTCIC\b/.test(upper) ? "TX" : null,
        confidence: 0.9,
        supported: true
      };
    }

    if (
      /TEXAS DEPARTMENT OF PUBLIC SAFETY|\bTXDPS\b|\bTCIC\b|TEXAS CRIMINAL HISTORY/.test(
        upper
      )
    ) {
      return {
        id: "texas-text",
        label: "Texas criminal-history text",
        system: "TXDPS",
        jurisdiction: "TX",
        confidence: 0.9,
        supported: true
      };
    }

    return {
      id: "generic-text",
      label: "Generic criminal-history text",
      system: "unknown",
      jurisdiction: null,
      confidence: 0.5,
      supported: true
    };
  }

  function createEmptyResult(context, detection, options, rawReference) {
    options = options || {};
    return {
      id: nextId(context, "rap-import"),
      source: {
        system: options.system || detection.system,
        jurisdiction: options.jurisdiction || detection.jurisdiction,
        format: "text",
        detectedFormat: detection.id,
        detectedFormatLabel: detection.label,
        formatConfidence: detection.confidence,
        importedAt: context.importedAt,
        parserVersion: PARSER_VERSION
      },
      subjectCandidate: {
        names: [],
        datesOfBirth: [],
        identifiers: {
          fbiNumber: null,
          additionalFbiNumbers: [],
          stateIds: [],
          driverLicenses: [],
          ncicNumber: null
        },
        descriptors: {
          sex: [],
          race: [],
          height: [],
          weight: [],
          hairColor: [],
          eyeColor: [],
          scarsMarksTattoos: []
        },
        recordWarnings: []
      },
      cycles: [],
      warnings: [],
      unparsedSections: [],
      reviewStatus: "pending",
      rawDocumentReference: rawReference,
      auditTrail: [],
      summary: null
    };
  }

  function isValidDateParts(year, month, day) {
    var y = Number(year);
    var m = Number(month);
    var d = Number(day);
    if (y < 1800 || y > 2200 || m < 1 || m > 12 || d < 1 || d > 31) {
      return false;
    }
    var date = new Date(Date.UTC(y, m - 1, d));
    return (
      date.getUTCFullYear() === y &&
      date.getUTCMonth() === m - 1 &&
      date.getUTCDate() === d
    );
  }

  function padTwo(value) {
    return String(value).length === 1 ? "0" + value : String(value);
  }

  function strictDate(value) {
    var raw = normalizedValue(value);
    var match;
    var year;
    var month;
    var day;

    match = raw.match(/^(\d{4})[-/]?(\d{2})[-/]?(\d{2})$/);
    if (match) {
      year = match[1];
      month = match[2];
      day = match[3];
      if (isValidDateParts(year, month, day)) {
        return { iso: year + "-" + month + "-" + day, precision: "day" };
      }
    }

    match = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if (match) {
      month = match[1];
      day = match[2];
      year = match[3];
      if (isValidDateParts(year, month, day)) {
        return {
          iso: year + "-" + padTwo(month) + "-" + padTwo(day),
          precision: "day"
        };
      }
    }

    match = raw.match(/^(\d{2})(\d{2})(\d{4})$/);
    if (match) {
      month = match[1];
      day = match[2];
      year = match[3];
      if (isValidDateParts(year, month, day)) {
        return {
          iso: year + "-" + month + "-" + day,
          precision: "day"
        };
      }
    }

    return null;
  }

  function looksLikeAmbiguousDate(value) {
    var raw = normalizedValue(value);
    return (
      /\b\d{1,2}[/-]\d{1,2}[/-]\d{2}\b/.test(raw) ||
      /\b\d{6}\b/.test(raw) ||
      /\b\d{1,2}[/-]\d{4}\b/.test(raw)
    );
  }

  function isDateFact(fact) {
    return !!(
      fact &&
      (fact.normalizedValue ||
        fact.datePrecision ||
        /(?:date|dateOfBirth)$/i.test(String(fact.field || "")))
    );
  }

  function syncCorrectedDateFact(fact, reviewedValue, isCorrection) {
    if (!isDateFact(fact)) {
      return;
    }
    var owns = Object.prototype.hasOwnProperty;

    if (isCorrection) {
      if (!owns.call(fact, "originalNormalizedValue")) {
        fact.originalNormalizedValue =
          fact.normalizedValue == null ? null : fact.normalizedValue;
        fact.originalDatePrecision =
          fact.datePrecision == null ? null : fact.datePrecision;
      }
      var parsed = strictDate(reviewedValue);
      if (parsed) {
        fact.normalizedValue = parsed.iso;
        fact.correctedNormalizedValue = parsed.iso;
        fact.datePrecision = parsed.precision;
      } else {
        delete fact.normalizedValue;
        delete fact.datePrecision;
        fact.correctedNormalizedValue = null;
      }
      return;
    }

    if (owns.call(fact, "originalNormalizedValue")) {
      if (fact.originalNormalizedValue == null) {
        delete fact.normalizedValue;
      } else {
        fact.normalizedValue = fact.originalNormalizedValue;
      }
      if (fact.originalDatePrecision == null) {
        delete fact.datePrecision;
      } else {
        fact.datePrecision = fact.originalDatePrecision;
      }
      delete fact.originalNormalizedValue;
      delete fact.originalDatePrecision;
      delete fact.correctedNormalizedValue;
    }
  }

  function makeDateFact(state, field, rawValue, line, confidence) {
    var fact = makeFact(
      state,
      field,
      rawValue,
      line,
      confidence == null ? 0.98 : confidence,
      "explicitly_stated"
    );
    var parsed = strictDate(fact.value);
    if (parsed) {
      fact.normalizedValue = parsed.iso;
      fact.datePrecision = parsed.precision;
    } else if (looksLikeAmbiguousDate(fact.value)) {
      addWarning(
        state,
        "ambiguous_date",
        "A date was preserved exactly because its order or century is ambiguous.",
        "warning",
        line,
        { field: field, factId: fact.factId }
      );
    }
    return fact;
  }

  function splitRepeatedValues(value, allowComma) {
    var raw = String(value || "");
    var parts = raw.split(/\s*[;|]\s*/);
    if (allowComma && parts.length === 1) {
      var commaParts = raw.split(/\s*,\s*/);
      if (
        commaParts.length > 1 &&
        commaParts.every(function (part) {
          return !!strictDate(part) || looksLikeAmbiguousDate(part);
        })
      ) {
        parts = commaParts;
      }
    }
    return parts.filter(function (part) {
      return normalizedValue(part) !== "";
    });
  }

  function scanDelimitedFields(rawLine) {
    var matches = [];
    var match;
    DELIMITED_FIELD_PATTERN.lastIndex = 0;

    while ((match = DELIMITED_FIELD_PATTERN.exec(rawLine))) {
      matches.push({
        matchStart: match.index,
        label: match[2],
        key: LABEL_TO_KEY[normalizeLabel(match[2])],
        valueStart: DELIMITED_FIELD_PATTERN.lastIndex
      });
    }

    if (matches.length > 1) {
      var filteredMatches = [matches[0]];
      var previousKey = matches[0].key;
      matches.slice(1).forEach(function (entry) {
        if (fieldCanFollow(previousKey, entry.key)) {
          filteredMatches.push(entry);
          previousKey = entry.key;
        }
      });
      matches = filteredMatches;
    }

    return matches.map(function (entry, index) {
      var end =
        index + 1 < matches.length ? matches[index + 1].matchStart : rawLine.length;
      return {
        key: entry.key,
        label: entry.label,
        value: rawLine.slice(entry.valueStart, end).replace(/[;|\s]+$/g, "")
      };
    }).filter(function (entry) {
      return entry.key && normalizedValue(entry.value) !== "";
    });
  }

  function scanSingleField(rawLine) {
    var raw = String(rawLine || "");
    var arrestNumberMatch = raw.match(
      /^\s*ARREST\s*(?:#|NO\.?|NUMBER)\s*(?:[:/#=]\s*)?(.+?)\s*$/i
    );
    if (arrestNumberMatch) {
      return [
        {
          key: "arrestNumber",
          label: "ARREST NUMBER",
          value: arrestNumberMatch[1]
        }
      ];
    }
    var match = raw.match(SINGLE_FIELD_PATTERN);
    if (!match) {
      return [];
    }
    return [
      {
        key: LABEL_TO_KEY[normalizeLabel(match[1])],
        label: match[1],
        value: match[2]
      }
    ];
  }

  function createCycle(state, line) {
    if (
      state.context.limits &&
      state.result.cycles.length >= state.context.limits.maxCycles
    ) {
      throw parserLimitError(
        "cycle_limit_exceeded",
        "The input produced more criminal-history cycles than the local review limit and was not parsed.",
        line,
        { maximum: state.context.limits.maxCycles }
      );
    }
    var cycle = {
      cycleId: nextId(state.context, "cycle"),
      sourceCycleNumber: null,
      sourceCycleMarker: null,
      sourceRange: {
        startPage: line && line.pageNumber != null ? line.pageNumber : null,
        endPage: line && line.pageNumber != null ? line.pageNumber : null,
        startLine: line ? line.documentLine : null,
        endLine: line ? line.documentLine : null
      },
      arrest: {
        date: null,
        location: null,
        agency: null,
        ori: null,
        arrestNumber: null
      },
      booking: {
        number: null,
        date: null,
        facility: null
      },
      arrestCharges: [],
      unclassifiedCharges: [],
      prosecution: {
        filingDate: null,
        agency: null,
        caseNumber: null,
        filedCharges: [],
        amendedCharges: []
      },
      courtCases: [],
      dispositions: [],
      convictionDate: null,
      sentences: [],
      supervision: []
    };
    state.result.cycles.push(cycle);
    state.currentCycle = cycle;
    state.currentCourt = null;
    state.lastCharge = null;
    state.lastDisposition = null;
    return cycle;
  }

  function setSection(state, nextSection) {
    if (!nextSection || state.section === nextSection) {
      state.section = nextSection || state.section;
      return;
    }

    if (
      nextSection === "arrest" ||
      nextSection === "booking" ||
      nextSection === "prosecution" ||
      nextSection === "court"
    ) {
      state.currentCourt = null;
      state.lastCharge = null;
      state.lastDisposition = null;
    } else if (nextSection === "disposition") {
      state.lastCharge = null;
      state.lastDisposition = null;
    } else if (nextSection === "sentence" || nextSection === "supervision") {
      state.lastCharge = null;
    }

    state.section = nextSection;
  }

  function cycleHasData(cycle) {
    if (!cycle) {
      return false;
    }
    return !!(
      cycle.arrest.date ||
      cycle.arrest.location ||
      cycle.arrest.agency ||
      cycle.arrest.ori ||
      cycle.arrest.arrestNumber ||
      cycle.booking.number ||
      cycle.booking.date ||
      cycle.booking.facility ||
      cycle.arrestCharges.length ||
      cycle.unclassifiedCharges.length ||
      cycle.prosecution.filingDate ||
      cycle.prosecution.agency ||
      cycle.prosecution.caseNumber ||
      cycle.prosecution.filedCharges.length ||
      cycle.prosecution.amendedCharges.length ||
      cycle.courtCases.length ||
      cycle.dispositions.length ||
      cycle.convictionDate ||
      cycle.sentences.length ||
      cycle.supervision.length
    );
  }

  function startCycle(state, line) {
    if (!state.currentCycle || cycleHasData(state.currentCycle)) {
      return createCycle(state, line);
    }
    touchCycle(state, line);
    return state.currentCycle;
  }

  function ensureCycle(state, line) {
    if (!state.currentCycle) {
      createCycle(state, line);
    }
    touchCycle(state, line);
    return state.currentCycle;
  }

  function touchCycle(state, line) {
    if (!state.currentCycle || !line) {
      return;
    }
    state.currentCycle.sourceRange.endLine = line.documentLine;
    state.currentCycle.sourceRange.endPage =
      line.pageNumber == null ? null : line.pageNumber;
  }

  function ensureCourt(state, line) {
    var cycle = ensureCycle(state, line);
    if (!state.currentCourt) {
      state.currentCourt = {
        caseId: nextId(state.context, "court-case"),
        court: null,
        docketNumber: null,
        charges: [],
        dispositionIds: [],
        sentenceIds: []
      };
      cycle.courtCases.push(state.currentCourt);
    }
    return state.currentCourt;
  }

  function createCharge(state, stage, rawValue, line, confidence) {
    var cycle = ensureCycle(state, line);
    var charge = {
      chargeId: nextId(state.context, "charge"),
      stage: stage,
      description: rawValue
        ? makeFact(
            state,
            "criminalHistory.charge.description",
            rawValue,
            line,
            confidence == null ? 0.98 : confidence,
            "explicitly_stated"
          )
        : null,
      statute: null,
      classification: null,
      possibleSourceChargeId: null,
      linkBasis: null,
      dispositionIds: []
    };

    if (stage === "arrest") {
      cycle.arrestCharges.push(charge);
    } else if (stage === "filed") {
      cycle.prosecution.filedCharges.push(charge);
      if (cycle.arrestCharges.length) {
        charge.possibleSourceChargeId =
          cycle.arrestCharges[cycle.arrestCharges.length - 1].chargeId;
        charge.linkBasis = "nearest_preceding_charge_needs_review";
      }
    } else if (stage === "amended") {
      cycle.prosecution.amendedCharges.push(charge);
      var filed = cycle.prosecution.filedCharges;
      if (filed.length) {
        charge.possibleSourceChargeId = filed[filed.length - 1].chargeId;
        charge.linkBasis = "nearest_preceding_charge_needs_review";
      }
    } else if (stage === "court") {
      ensureCourt(state, line).charges.push(charge);
      var amended = cycle.prosecution.amendedCharges;
      var filedCharges = cycle.prosecution.filedCharges;
      if (amended.length) {
        charge.possibleSourceChargeId = amended[amended.length - 1].chargeId;
        charge.linkBasis = "nearest_preceding_charge_needs_review";
      } else if (filedCharges.length) {
        charge.possibleSourceChargeId =
          filedCharges[filedCharges.length - 1].chargeId;
        charge.linkBasis = "nearest_preceding_charge_needs_review";
      }
    } else {
      cycle.unclassifiedCharges.push(charge);
      addWarning(
        state,
        "unclassified_charge_stage",
        "A charge was found without an explicit arrest, filing, amendment, or court stage.",
        "warning",
        line,
        { chargeId: charge.chargeId }
      );
    }

    state.lastCharge = charge;
    return charge;
  }

  function mostRelevantCharges(state) {
    var cycle = state.currentCycle;
    if (!cycle) {
      return [];
    }
    if (state.currentCourt && state.currentCourt.charges.length) {
      return state.currentCourt.charges;
    }
    if (cycle.prosecution.amendedCharges.length) {
      return cycle.prosecution.amendedCharges;
    }
    if (cycle.prosecution.filedCharges.length) {
      return cycle.prosecution.filedCharges;
    }
    if (cycle.arrestCharges.length) {
      return cycle.arrestCharges;
    }
    return cycle.unclassifiedCharges;
  }

  function classifyDisposition(value) {
    var upper = normalizedValue(value).toUpperCase();
    var strongNegativePattern =
      /\b(?:NOT|NEVER)\s+(?:A\s+)?CONVICT(?:ED|ION)\b|\bNON[-\s]?CONVICTION\b|\bNO\s+(?:(?:FINAL|KNOWN|RECORD\s+OF)\s+)?CONVICTION\b|\bDID\s+NOT\s+RESULT\s+IN\s+(?:A\s+)?CONVICTION\b|\bNOT\s+RESULT(?:ING|ED)\s+IN\s+(?:A\s+)?CONVICTION\b|\bWITHOUT\s+(?:A\s+)?CONVICTION\b|\bCONVICTION\s*(?:[:=-]\s*|\s+)(?:NONE|NO|N\/A)\b/;
    var uncertainConvictionPattern =
      /\bCONVICTION(?:\s+STATUS)?\s*[:=-]?\s*(?:UNKNOWN|UNDETERMINED|NOT\s+REPORTED)\b|\b(?:POSSIBLE|POSSIBLY|ALLEGED|ALLEGEDLY|UNCONFIRMED|SUSPECTED)\b[A-Z\s-]{0,24}\bCONVICT(?:ED|ION)\b/;
    var positiveText = upper
      .replace(new RegExp(strongNegativePattern.source, "g"), " ")
      .replace(new RegExp(uncertainConvictionPattern.source, "g"), " ");
    var hasExplicitConvictionPhrase =
      /\bCONVICTED\b|\bFOUND\s+GUILTY\b|\bADJUDGED\s+GUILTY\b|\bJUDGMENT\s+OF\s+GUILT\b/.test(
        positiveText
      ) ||
      /^CONVICTION(?:\s*(?:[:=-]\s*)?(?:YES|ENTERED|FINAL|REPORTED))?(?:\s+(?:ON\s+)?(?:\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{8}))?$/.test(
        positiveText.trim()
      );
    var hasExplicitGuilty =
      /^GUILTY(?:\b|\s*[-,;])/.test(positiveText.trim()) &&
      !/\bPLEA\b/.test(upper);
    var hasExplicitConviction =
      hasExplicitConvictionPhrase || hasExplicitGuilty;
    var hasStrongNegative = strongNegativePattern.test(upper);
    var hasUncertainConviction = uncertainConvictionPattern.test(upper);

    if (hasStrongNegative && hasExplicitConviction) {
      return { label: "Conflicting conviction terms", status: "uncertain", basis: "conflicting_disposition_terms" };
    }
    if (hasStrongNegative) {
      return { label: "Not convicted", status: "not_conviction", basis: "explicit_negative_disposition" };
    }
    if (hasUncertainConviction) {
      return { label: "Conviction status uncertain", status: "uncertain", basis: "explicit_unknown_disposition" };
    }
    if (/\bNOT\s+GUILTY\b|\bACQUITT(?:ED|AL)\b/.test(upper)) {
      return hasExplicitConviction
        ? { label: "Conflicting disposition terms", status: "uncertain", basis: "conflicting_disposition_terms" }
        : { label: "Not guilty / acquitted", status: "not_conviction", basis: "explicit_negative_disposition" };
    }
    if (/\bDISMISS(?:ED|AL)?\b/.test(upper)) {
      return hasExplicitConviction
        ? { label: "Conflicting disposition terms", status: "uncertain", basis: "conflicting_disposition_terms" }
        : { label: "Dismissed", status: "not_conviction", basis: "explicit_negative_disposition" };
    }
    if (/\bNO[-\s]?BILL(?:ED)?\b|\bNOLLE\s+PROSEQUI\b|\bNOL\s+PROS\b/.test(upper)) {
      return hasExplicitConviction
        ? { label: "Conflicting disposition terms", status: "uncertain", basis: "conflicting_disposition_terms" }
        : { label: "No bill / nolle prosequi", status: "not_conviction", basis: "explicit_negative_disposition" };
    }
    if (
      /\bDEFERRED\s+(?:ADJUDICATION|DISPOSITION)\b|\bADJUDICATION\s+(?:DEFERRED|WITHHELD)\b|\bWITHHELD\s+ADJUDICATION\b|\bPRETRIAL\s+DIVERSION\b/.test(
        upper
      ) &&
      !hasExplicitConvictionPhrase
    ) {
      return { label: "Deferred / diversion", status: "not_conviction", basis: "explicit_nonconviction_disposition" };
    }
    if (/\bDECLINED\b|\bREJECTED\b|\bWITHDRAWN\b/.test(upper)) {
      return hasExplicitConviction
        ? { label: "Conflicting disposition terms", status: "uncertain", basis: "conflicting_disposition_terms" }
        : { label: "Declined / rejected", status: "not_conviction", basis: "explicit_negative_disposition" };
    }
    if (/\bVACAT(?:ED|UR)\b|\bSET\s+ASIDE\b|\bEXPUNG(?:ED|EMENT)\b|\bREVERS(?:ED|AL)\b|\bOVERTURNED\b/.test(upper)) {
      return { label: "Vacated / set aside", status: "not_conviction", basis: "explicit_post_disposition_change" };
    }
    if (/\bPENDING\b|\bAWAITING\b|\bOPEN\b/.test(upper)) {
      return hasExplicitConviction
        ? { label: "Conflicting disposition terms", status: "uncertain", basis: "conflicting_disposition_terms" }
        : { label: "Pending", status: "pending", basis: "explicit_pending_disposition" };
    }
    if (hasExplicitConvictionPhrase) {
      return { label: "Convicted", status: "explicit_conviction", basis: "explicit_conviction_disposition" };
    }
    if (hasExplicitGuilty) {
      return { label: "Guilty", status: "explicit_conviction", basis: "explicit_guilty_disposition" };
    }
    if (/\bGUILTY\s+PLEA\b|\bPLEA\s*:?\s*GUILTY\b|\bNOLO\s+CONTENDERE\b/.test(upper)) {
      return { label: "Plea reported; adjudication unclear", status: "uncertain", basis: "plea_is_not_disposition" };
    }

    return { label: normalizedValue(value) || "Unknown", status: "uncertain", basis: "unclassified_disposition" };
  }

  function findDateToken(value) {
    var raw = String(value || "");
    var match = raw.match(
      /\b(?:\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{8}|\d{6})\b/
    );
    return match ? match[0] : null;
  }

  function createDisposition(state, rawValue, line) {
    var cycle = ensureCycle(state, line);
    var classification = classifyDisposition(rawValue);
    var rawFact = makeFact(
      state,
      "criminalHistory.disposition.sourceValue",
      rawValue,
      line,
      0.99,
      "explicitly_stated"
    );
    var outcomeFact = makeFact(
      state,
      "criminalHistory.disposition.outcome",
      classification.label,
      line,
      classification.status === "uncertain" ? 0.65 : 0.97,
      classification.basis
    );
    outcomeFact.derivedFromFactId = rawFact.factId;

    var disposition = {
      dispositionId: nextId(state.context, "disposition"),
      rawDisposition: rawFact,
      outcome: outcomeFact,
      date: null,
      convictionStatus: classification.status,
      chargeId: null,
      possibleChargeId: null,
      linkBasis: null
    };

    var dateToken = findDateToken(rawValue);
    if (dateToken) {
      disposition.date = makeDateFact(
        state,
        "criminalHistory.disposition.date",
        dateToken,
        line,
        0.92
      );
    }

    var candidates = mostRelevantCharges(state);
    if (candidates.length === 1) {
      disposition.chargeId = candidates[0].chargeId;
      disposition.linkBasis = "single_charge_in_current_stage";
      candidates[0].dispositionIds.push(disposition.dispositionId);
    } else if (candidates.length > 1) {
      var likely = candidates[candidates.length - 1];
      disposition.possibleChargeId = likely.chargeId;
      disposition.linkBasis = "nearest_preceding_charge_needs_review";
      addWarning(
        state,
        "ambiguous_disposition_link",
        "A disposition follows multiple possible charges; the nearest charge is only a review candidate.",
        "warning",
        line,
        { dispositionId: disposition.dispositionId, possibleChargeId: likely.chargeId }
      );
    } else {
      addWarning(
        state,
        "orphan_disposition",
        "A disposition was found without a preceding charge to link it to.",
        "warning",
        line,
        { dispositionId: disposition.dispositionId }
      );
    }

    cycle.dispositions.push(disposition);
    if (state.currentCourt) {
      state.currentCourt.dispositionIds.push(disposition.dispositionId);
    }
    state.lastDisposition = disposition;

    if (classification.status === "uncertain") {
      addWarning(
        state,
        classification.basis === "conflicting_disposition_terms"
          ? "conflicting_disposition_terms"
          : "uncertain_disposition",
        classification.basis === "conflicting_disposition_terms"
          ? "This disposition contains conflicting outcome terms and is not counted as a conviction."
          : "The parser could not safely classify this disposition as a conviction or non-conviction.",
        "warning",
        line,
        { dispositionId: disposition.dispositionId }
      );
    }
    return disposition;
  }

  function createSentence(state, type, rawValue, line) {
    var cycle = ensureCycle(state, line);
    var sentence = {
      sentenceId: nextId(state.context, "sentence"),
      type: type,
      detail: makeFact(
        state,
        "criminalHistory.sentence." + type,
        rawValue,
        line,
        0.98,
        "explicitly_stated"
      ),
      dispositionId: state.lastDisposition
        ? state.lastDisposition.dispositionId
        : null,
      linkBasis: state.lastDisposition
        ? "nearest_preceding_disposition_needs_review"
        : null,
      linkReviewStatus: state.lastDisposition ? "pending" : "not_applicable",
      linkVerified: false
    };
    cycle.sentences.push(sentence);
    if (state.currentCourt) {
      state.currentCourt.sentenceIds.push(sentence.sentenceId);
    }
    if (!state.lastDisposition) {
      addWarning(
        state,
        "sentence_without_disposition",
        "A sentence was preserved, but it is not proof of a conviction without an explicit disposition.",
        "warning",
        line,
        { sentenceId: sentence.sentenceId }
      );
    }
    return sentence;
  }

  function addSubjectFact(state, key, rawValue, line, sourceLabel) {
    var subject = state.result.subjectCandidate;
    var parts;
    var fact;
    var i;

    if (key === "primaryName" || key === "aliasName") {
      parts =
        key === "aliasName"
          ? splitRepeatedValues(rawValue, false)
          : [rawValue];
      for (i = 0; i < parts.length; i += 1) {
        fact = makeFact(
          state,
          "subjectCandidate.name",
          parts[i],
          line,
          0.98,
          "explicitly_stated"
        );
        fact.nameType = key === "primaryName" ? "primary" : "alias";
        subject.names.push(fact);
      }
      return true;
    }

    if (key === "dateOfBirth") {
      parts = splitRepeatedValues(rawValue, true);
      for (i = 0; i < parts.length; i += 1) {
        fact = makeDateFact(
          state,
          "subjectCandidate.dateOfBirth",
          parts[i],
          line,
          0.98
        );
        fact.dateType =
          normalizeLabel(sourceLabel).indexOf("ALTERNATE") !== -1
            ? "alternate"
            : "reported_primary";
        subject.datesOfBirth.push(fact);
      }
      return true;
    }

    if (key === "fbiNumber") {
      fact = makeFact(
        state,
        "subjectCandidate.identifiers.fbiNumber",
        rawValue,
        line,
        0.99,
        "explicitly_stated"
      );
      if (!subject.identifiers.fbiNumber) {
        subject.identifiers.fbiNumber = fact;
      } else {
        subject.identifiers.additionalFbiNumbers.push(fact);
        addWarning(
          state,
          "multiple_fbi_numbers",
          "More than one FBI number was found and requires identity review.",
          "warning",
          line
        );
      }
      return true;
    }

    if (key === "stateId" || key === "driverLicense") {
      fact = makeFact(
        state,
        key === "stateId"
          ? "subjectCandidate.identifiers.stateId"
          : "subjectCandidate.identifiers.driverLicense",
        rawValue,
        line,
        0.98,
        "explicitly_stated"
      );
      if (key === "stateId") {
        subject.identifiers.stateIds.push(fact);
      } else {
        subject.identifiers.driverLicenses.push(fact);
      }
      return true;
    }

    var descriptorMap = {
      sex: "sex",
      race: "race",
      height: "height",
      weight: "weight",
      hairColor: "hairColor",
      eyeColor: "eyeColor",
      smt: "scarsMarksTattoos"
    };
    if (descriptorMap[key]) {
      subject.descriptors[descriptorMap[key]].push(
        makeFact(
          state,
          "subjectCandidate.descriptors." + descriptorMap[key],
          rawValue,
          line,
          0.96,
          "explicitly_stated"
        )
      );
      return true;
    }

    if (key === "recordWarning") {
      subject.recordWarnings.push(
        makeFact(
          state,
          "subjectCandidate.recordWarning",
          rawValue,
          line,
          0.99,
          "explicitly_stated"
        )
      );
      return true;
    }

    return false;
  }

  function processField(state, field, line) {
    var key = field.key;
    var value = field.value;
    var cycle;
    var court;

    if (addSubjectFact(state, key, value, line, field.label)) {
      return true;
    }

    if (key === "arrestDate") {
      if (
        state.currentCycle &&
        state.currentCycle.arrest.date &&
        cycleHasData(state.currentCycle)
      ) {
        createCycle(state, line);
      }
      setSection(state, "arrest");
      cycle = ensureCycle(state, line);
      cycle.arrest.date = makeDateFact(
        state,
        "criminalHistory.arrest.date",
        value,
        line,
        0.99
      );
      return true;
    }

    if (key === "arrestLocation" || key === "arrestAgency" || key === "arrestOri" || key === "arrestNumber") {
      setSection(state, "arrest");
      cycle = ensureCycle(state, line);
      var arrestProperty = {
        arrestLocation: "location",
        arrestAgency: "agency",
        arrestOri: "ori",
        arrestNumber: "arrestNumber"
      }[key];
      cycle.arrest[arrestProperty] = makeFact(
        state,
        "criminalHistory.arrest." + arrestProperty,
        value,
        line,
        0.98,
        "explicitly_stated"
      );
      return true;
    }

    if (key === "bookingDate" || key === "bookingNumber" || key === "bookingFacility") {
      setSection(state, "booking");
      cycle = ensureCycle(state, line);
      var bookingProperty = {
        bookingDate: "date",
        bookingNumber: "number",
        bookingFacility: "facility"
      }[key];
      cycle.booking[bookingProperty] =
        key === "bookingDate"
          ? makeDateFact(
              state,
              "criminalHistory.booking.date",
              value,
              line,
              0.98
            )
          : makeFact(
              state,
              "criminalHistory.booking." + bookingProperty,
              value,
              line,
              0.98,
              "explicitly_stated"
            );
      return true;
    }

    if (key === "arrestCharge") {
      setSection(state, "arrest");
      createCharge(state, "arrest", value, line, 0.99);
      return true;
    }
    if (key === "filedCharge") {
      setSection(state, "prosecution");
      createCharge(state, "filed", value, line, 0.99);
      return true;
    }
    if (key === "amendedCharge") {
      setSection(state, "prosecution");
      createCharge(state, "amended", value, line, 0.99);
      return true;
    }
    if (key === "courtCharge") {
      setSection(state, "court");
      createCharge(state, "court", value, line, 0.99);
      return true;
    }
    if (key === "genericCharge") {
      var inferredStage =
        state.section === "arrest"
          ? "arrest"
          : state.section === "prosecution"
          ? "filed"
          : state.section === "court"
          ? "court"
          : "unknown";
      createCharge(
        state,
        inferredStage,
        value,
        line,
        inferredStage === "unknown" ? 0.72 : 0.86
      );
      return true;
    }

    if (key === "statute" || key === "classification") {
      ensureCycle(state, line);
      if (!state.lastCharge) {
        var placeholderStage =
          state.section === "court"
            ? "court"
            : state.section === "prosecution"
            ? "filed"
            : state.section === "arrest"
            ? "arrest"
            : "unknown";
        createCharge(state, placeholderStage, "", line, 0.7);
      }
      state.lastCharge[key] = makeFact(
        state,
        "criminalHistory.charge." + key,
        value,
        line,
        0.96,
        "explicitly_stated"
      );
      return true;
    }

    if (key === "filingDate" || key === "prosecutingAgency" || key === "prosecutionCaseNumber") {
      setSection(state, "prosecution");
      cycle = ensureCycle(state, line);
      if (key === "filingDate") {
        cycle.prosecution.filingDate = makeDateFact(
          state,
          "criminalHistory.prosecution.filingDate",
          value,
          line,
          0.98
        );
      } else if (key === "prosecutingAgency") {
        cycle.prosecution.agency = makeFact(
          state,
          "criminalHistory.prosecution.agency",
          value,
          line,
          0.98,
          "explicitly_stated"
        );
      } else {
        cycle.prosecution.caseNumber = makeFact(
          state,
          "criminalHistory.prosecution.caseNumber",
          value,
          line,
          0.98,
          "explicitly_stated"
        );
      }
      return true;
    }

    if (key === "courtName") {
      setSection(state, "court");
      court = ensureCourt(state, line);
      if (court.court && normalizedValue(court.court.value) !== normalizedValue(value)) {
        state.currentCourt = null;
        court = ensureCourt(state, line);
      }
      court.court = makeFact(
        state,
        "criminalHistory.court.name",
        value,
        line,
        0.98,
        "explicitly_stated"
      );
      return true;
    }

    if (key === "docketNumber") {
      setSection(state, "court");
      court = ensureCourt(state, line);
      if (
        court.docketNumber &&
        normalizedValue(court.docketNumber.value) !== normalizedValue(value) &&
        (court.charges.length || court.dispositionIds.length)
      ) {
        state.currentCourt = null;
        court = ensureCourt(state, line);
      }
      court.docketNumber = makeFact(
        state,
        "criminalHistory.court.docketNumber",
        value,
        line,
        0.98,
        "explicitly_stated"
      );
      return true;
    }

    if (key === "disposition") {
      setSection(state, "disposition");
      createDisposition(state, value, line);
      return true;
    }

    if (key === "dispositionDate") {
      setSection(state, "disposition");
      ensureCycle(state, line);
      if (state.lastDisposition && !state.lastDisposition.date) {
        state.lastDisposition.date = makeDateFact(
          state,
          "criminalHistory.disposition.date",
          value,
          line,
          0.98
        );
      } else {
        addWarning(
          state,
          "orphan_disposition_date",
          "A disposition date was found without a preceding disposition.",
          "warning",
          line
        );
      }
      return true;
    }

    if (key === "convictionDate") {
      setSection(state, "disposition");
      cycle = ensureCycle(state, line);
      cycle.convictionDate = makeDateFact(
        state,
        "criminalHistory.convictionDate",
        value,
        line,
        0.98
      );
      return true;
    }

    var sentenceTypes = {
      sentence: "reportedSentence",
      incarceration: "incarceration",
      suspendedSentence: "suspendedTime",
      fine: "fine"
    };
    if (sentenceTypes[key]) {
      setSection(state, "sentence");
      createSentence(state, sentenceTypes[key], value, line);
      return true;
    }

    var supervisionTypes = {
      probation: "probation",
      parole: "parole",
      supervision: "supervision",
      release: "release"
    };
    if (supervisionTypes[key]) {
      setSection(state, "supervision");
      cycle = ensureCycle(state, line);
      cycle.supervision.push({
        supervisionId: nextId(state.context, "supervision"),
        type: supervisionTypes[key],
        detail: makeFact(
          state,
          "criminalHistory.supervision." + supervisionTypes[key],
          value,
          line,
          0.97,
          "explicitly_stated"
        )
      });
      return true;
    }

    return false;
  }

  function isDocumentBoilerplate(line) {
    var text = normalizedValue(line.raw).toUpperCase();
    return (
      text === "" ||
      /^[-=*_\.]{3,}$/.test(text) ||
      /^PAGE\s+\d+(?:\s+OF\s+\d+)?$/.test(text) ||
      /^(?:END OF RECORD|END OF RESPONSE|NO MORE RECORD)$/.test(text) ||
      /^(?:TEXAS CRIMINAL HISTORY|CRIMINAL HISTORY RECORD|INTERSTATE IDENTIFICATION INDEX|FBI IDENTIFICATION RECORD)$/.test(text)
    );
  }

  function sectionHeading(line) {
    var text = normalizedValue(line.raw).toUpperCase().replace(/[:\-]+$/, "").trim();
    if (/^(?:SUBJECT|PERSON|IDENTIFICATION|PERSONAL DESCRIPTORS)$/.test(text)) {
      return "identity";
    }
    if (/^(?:BOOKING|BOOKING INFORMATION|BOOKING DATA)$/.test(text)) {
      return "booking";
    }
    if (/^(?:PROSECUTION|PROSECUTOR|PROSECUTION INFORMATION)$/.test(text)) {
      return "prosecution";
    }
    if (/^(?:COURT|COURT INFORMATION|JUDICIAL)$/.test(text)) {
      return "court";
    }
    if (/^(?:DISPOSITION|DISPOSITION INFORMATION)$/.test(text)) {
      return "disposition";
    }
    if (/^(?:SENTENCE|SENTENCING|SENTENCE INFORMATION)$/.test(text)) {
      return "sentence";
    }
    if (/^(?:SUPERVISION|PROBATION|PAROLE|RELEASE INFORMATION)$/.test(text)) {
      return "supervision";
    }
    if (/^(?:ARREST|ARREST INFORMATION|ARREST DATA)$/.test(text)) {
      return "arrest";
    }
    return null;
  }

  function cycleHeadingInfo(line) {
    var text = normalizedValue(line.raw).toUpperCase().replace(/[:\-]+$/, "").trim();
    var match = text.match(
      /^(?:CRIMINAL HISTORY\s+)?CYCLE(?:\s*(?:#|NO\.?|NUMBER)?\s*(\d+))?$/
    );
    if (!match) {
      match = text.match(
        /^ARREST\s+(?:CYCLE|EVENT)(?:\s*(?:#|NO\.?|NUMBER)?\s*(\d+))?$/
      );
    }
    if (!match) {
      return null;
    }
    return {
      label: text,
      number: match[1] ? String(Number(match[1])) : null,
      rawNumber: match[1] || null
    };
  }

  function flushUnparsed(state) {
    if (!state.unparsedBuffer.length) {
      return;
    }
    var first = state.unparsedBuffer[0];
    var last = state.unparsedBuffer[state.unparsedBuffer.length - 1];
    if (
      state.context.limits &&
      state.result.unparsedSections.length >=
        state.context.limits.maxUnparsedSections
    ) {
      throw parserLimitError(
        "unparsed_section_limit_exceeded",
        "The input produced more unparsed review sections than the local limit and was not parsed.",
        first,
        { maximum: state.context.limits.maxUnparsedSections }
      );
    }
    var onePage = state.unparsedBuffer.every(function (line) {
      return line.pageNumber === first.pageNumber;
    });
    state.result.unparsedSections.push({
      sectionId: nextId(state.context, "unparsed"),
      reason: "unrecognized_text",
      sourceText: state.unparsedBuffer.map(function (line) {
        return line.raw;
      }).join("\n"),
      sourcePage: onePage ? first.pageNumber : null,
      sourceLine: { start: first.documentLine, end: last.documentLine },
      reviewStatus: "pending"
    });
    state.unparsedBuffer = [];
  }

  function parseLines(state, lines) {
    var i;
    for (i = 0; i < lines.length; i += 1) {
      var line = lines[i];
      var text = normalizedValue(line.raw);

      if (!text) {
        flushUnparsed(state);
        continue;
      }

      var cycleHeading = cycleHeadingInfo(line);
      if (cycleHeading) {
        flushUnparsed(state);
        var existingCycle = cycleHeading.number
          ? state.cyclesBySourceNumber[cycleHeading.number]
          : null;
        if (existingCycle) {
          if (state.currentCycle !== existingCycle) {
            state.currentCycle = existingCycle;
            state.currentCourt = null;
            state.lastCharge = null;
            state.lastDisposition = null;
            state.section = null;
          }
          touchCycle(state, line);
        } else {
          var headedCycle = startCycle(state, line);
          headedCycle.sourceCycleNumber = cycleHeading.number;
          headedCycle.sourceCycleMarker = cycleHeading.label;
          if (cycleHeading.number) {
            state.cyclesBySourceNumber[cycleHeading.number] = headedCycle;
          }
          setSection(state, "arrest");
        }
        continue;
      }

      var heading = sectionHeading(line);
      if (heading) {
        flushUnparsed(state);
        if (heading === "arrest") {
          startCycle(state, line);
        } else if (heading !== "identity") {
          ensureCycle(state, line);
        }
        setSection(state, heading);
        continue;
      }

      if (isDocumentBoilerplate(line)) {
        flushUnparsed(state);
        continue;
      }

      var fields = scanDelimitedFields(line.raw);
      if (!fields.length) {
        fields = scanSingleField(line.raw);
      }
      if (
        state.context.limits &&
        fields.length > state.context.limits.maxFieldsPerLine
      ) {
        throw parserLimitError(
          "fields_per_line_limit_exceeded",
          "A source line contains more labeled fields than the local review limit and was not parsed.",
          line,
          {
            maximum: state.context.limits.maxFieldsPerLine,
            actual: fields.length
          }
        );
      }

      var processed = false;
      var j;
      for (j = 0; j < fields.length; j += 1) {
        processed = processField(state, fields[j], line) || processed;
      }

      if (processed) {
        flushUnparsed(state);
      } else {
        state.unparsedBuffer.push(line);
      }
    }
    flushUnparsed(state);
  }

  function allCharges(cycle) {
    var charges = [];
    charges = charges.concat(cycle.arrestCharges || []);
    charges = charges.concat(cycle.unclassifiedCharges || []);
    charges = charges.concat((cycle.prosecution && cycle.prosecution.filedCharges) || []);
    charges = charges.concat((cycle.prosecution && cycle.prosecution.amendedCharges) || []);
    (cycle.courtCases || []).forEach(function (court) {
      charges = charges.concat(court.charges || []);
    });
    return charges;
  }

  function effectiveFactValue(fact) {
    if (!fact) {
      return "";
    }
    if (fact.reviewStatus === "rejected") {
      return "";
    }
    return normalizedValue(
      fact.correctedValue == null ? fact.value : fact.correctedValue
    );
  }

  function currentDispositionClassification(disposition) {
    if (!disposition || !disposition.rawDisposition) {
      return { label: "Unknown", status: "uncertain", basis: "missing_disposition" };
    }
    var value = effectiveFactValue(disposition.rawDisposition);
    if (!value) {
      return { label: "Rejected", status: "rejected", basis: "review_rejected" };
    }
    if (disposition.outcome && disposition.outcome.reviewStatus === "rejected") {
      return { label: "Rejected", status: "rejected", basis: "review_rejected" };
    }
    if (
      disposition.outcome &&
      disposition.outcome.reviewStatus === "accepted" &&
      disposition.outcome.correctedValue != null
    ) {
      return classifyDisposition(disposition.outcome.correctedValue);
    }
    return classifyDisposition(value);
  }

  function chargeById(cycle, chargeId) {
    var charges = allCharges(cycle);
    var i;
    for (i = 0; i < charges.length; i += 1) {
      if (charges[i].chargeId === chargeId) {
        return charges[i];
      }
    }
    return null;
  }

  function newestIsoDate(facts) {
    var values = facts
      .filter(function (fact) {
        return !!effectiveFactDate(fact);
      })
      .map(function (fact) {
        return effectiveFactDate(fact);
      })
      .sort();
    return values.length ? values[values.length - 1] : null;
  }

  function effectiveFactDate(fact) {
    var value = effectiveFactValue(fact);
    if (!value) {
      return null;
    }
    var parsed = strictDate(value);
    return parsed ? parsed.iso : null;
  }

  function cycleNeedsReview(cycle) {
    var charges = allCharges(cycle);
    var statuses = {};
    var uncertain = false;

    (cycle.dispositions || []).forEach(function (disposition) {
      var classification = currentDispositionClassification(disposition);
      if (
        classification.status === "uncertain" ||
        disposition.possibleChargeId ||
        !disposition.chargeId
      ) {
        uncertain = true;
      }
      var linkId = disposition.chargeId || disposition.possibleChargeId;
      if (linkId && classification.status !== "rejected") {
        statuses[linkId] = statuses[linkId] || {};
        statuses[linkId][classification.status] = true;
      }
    });

    Object.keys(statuses).forEach(function (chargeId) {
      var values = Object.keys(statuses[chargeId]);
      if (values.indexOf("explicit_conviction") !== -1 && values.indexOf("not_conviction") !== -1) {
        uncertain = true;
      }
    });

    return (
      uncertain ||
      (charges.length > 0 && cycle.dispositions.length === 0) ||
      (cycle.sentences.length > 0 && cycle.dispositions.length === 0)
    );
  }

  function generateRapSheetSummary(rapSheetImport) {
    var result = rapSheetImport || {};
    var subject = result.subjectCandidate || { names: [] };
    var cycles = result.cycles || [];
    var aliases = (subject.names || []).filter(function (name) {
      return name.nameType === "alias" && name.reviewStatus !== "rejected";
    });
    var convictions = [];
    var historyItems = [];
    var arrestDates = [];
    var convictionDates = [];
    var incomplete = 0;

    cycles.forEach(function (cycle) {
      if (cycle.arrest && cycle.arrest.date) {
        arrestDates.push(cycle.arrest.date);
      }
      if (cycleNeedsReview(cycle)) {
        incomplete += 1;
      }

      (cycle.dispositions || []).forEach(function (disposition) {
        var classification = currentDispositionClassification(disposition);
        disposition.convictionStatus = classification.status;
        if (classification.status === "rejected" || classification.status === "uncertain" || classification.status === "pending") {
          return;
        }
        var linkedId = disposition.chargeId || disposition.possibleChargeId;
        var charge = linkedId ? chargeById(cycle, linkedId) : null;
        var chargeText =
          charge && charge.description
            ? effectiveFactValue(charge.description)
            : "Unlinked disposition";
        var dateFact = disposition.date;
        var dateText = dateFact
          ? effectiveFactDate(dateFact) || effectiveFactValue(dateFact) || null
          : null;
        var linkNote = disposition.possibleChargeId
          ? "; charge link needs review"
          : "";

        if (classification.status === "explicit_conviction") {
          convictions.push(disposition);
          if (dateFact) {
            convictionDates.push(dateFact);
          } else if (cycle.convictionDate) {
            convictionDates.push(cycle.convictionDate);
          }
          historyItems.push({
            text:
              chargeText +
              " — conviction explicitly reported" +
              (dateText ? " on " + dateText : "") +
              linkNote,
            basis: classification.basis,
            dispositionId: disposition.dispositionId
          });
        } else if (classification.status === "not_conviction") {
          historyItems.push({
            text:
              chargeText +
              " — " +
              classification.label.toLowerCase() +
              (dateText ? " on " + dateText : "") +
              linkNote,
            basis: classification.basis,
            dispositionId: disposition.dispositionId
          });
        }
      });

      (cycle.supervision || []).forEach(function (entry) {
        if (entry.detail && entry.detail.reviewStatus !== "rejected") {
          historyItems.push({
            text:
              "Supervision reported (" +
              entry.type +
              "): " +
              effectiveFactValue(entry.detail),
            basis: "explicitly_stated",
            supervisionId: entry.supervisionId
          });
        }
      });
    });

    var statusLabel =
      result.reviewStatus === "reviewed"
        ? "REVIEWED"
        : result.reviewStatus === "stale"
        ? "STALE / REPARSE REQUIRED"
        : result.reviewStatus === "rejected" || result.reviewStatus === "needs_source_adapter"
        ? "NOT PARSED"
        : "DRAFT / UNVERIFIED";
    var mostRecentArrest = newestIsoDate(arrestDates);
    var mostRecentConviction = newestIsoDate(convictionDates);
    var lines = [
      "CRIMINAL HISTORY SUMMARY — " + statusLabel,
      "Known aliases: " + aliases.length,
      "Reported arrest cycles: " + cycles.length,
      "Explicit convictions located: " + convictions.length,
      "Most recent arrest: " + (mostRecentArrest || "Not established"),
      "Most recent conviction: " + (mostRecentConviction || "Not established")
    ];

    if (historyItems.length) {
      lines.push("", "Potentially relevant history:");
      historyItems.forEach(function (item) {
        lines.push("- " + item.text + " [basis: " + item.basis + "]");
      });
    }

    if (incomplete) {
      lines.push(
        "",
        incomplete +
          " arrest cycle" +
          (incomplete === 1 ? " contains" : "s contain") +
          " incomplete, ambiguous, or conflicting disposition data."
      );
    }

    return {
      statusLabel: statusLabel,
      knownAliases: aliases.length,
      reportedArrestCycles: cycles.length,
      explicitConvictions: convictions.length,
      mostRecentArrest: mostRecentArrest,
      mostRecentConviction: mostRecentConviction,
      historyItems: historyItems,
      incompleteOrConflictingCycles: incomplete,
      text: lines.join("\n")
    };
  }

  function finalizeResult(state) {
    var subject = state.result.subjectCandidate;
    var primaryNames = subject.names.filter(function (fact) {
      return fact.nameType === "primary";
    });
    var uniquePrimaryNames = {};
    primaryNames.forEach(function (fact) {
      uniquePrimaryNames[normalizeLabel(fact.value)] = true;
    });
    if (Object.keys(uniquePrimaryNames).length > 1) {
      addWarning(
        state,
        "multiple_primary_names",
        "More than one different primary name was found; verify that the text contains only one subject.",
        "warning",
        null
      );
    }

    if (!state.result.cycles.length) {
      addWarning(
        state,
        "no_arrest_cycles",
        "No arrest cycles were recognized. Review the unparsed text or add a source-specific adapter.",
        "warning",
        null
      );
    }

    state.result.cycles.forEach(function (cycle) {
      var charges = allCharges(cycle);
      if (charges.length && !cycle.dispositions.length) {
        addWarning(
          state,
          "charges_without_disposition",
          "This cycle contains charges but no explicit court disposition; it is not counted as a conviction.",
          "warning",
          null,
          { cycleId: cycle.cycleId }
        );
      }
      if (
        cycle.convictionDate &&
        !cycle.dispositions.some(function (disposition) {
          return currentDispositionClassification(disposition).status === "explicit_conviction";
        })
      ) {
        addWarning(
          state,
          "conviction_date_without_conviction_disposition",
          "A conviction-date label was preserved, but no explicit conviction disposition was found; it is not counted as a conviction.",
          "warning",
          null,
          { cycleId: cycle.cycleId, factId: cycle.convictionDate.factId }
        );
      }
    });

    state.result.summary = generateRapSheetSummary(state.result);
    state.result.auditTrail.push({
      eventId: nextId(state.context, "audit"),
      action: "parsed",
      at: state.context.importedAt,
      parserVersion: PARSER_VERSION,
      factCount: state.context.factCount,
      cycleCount: state.result.cycles.length,
      warningCount: state.result.warnings.length
    });
    return state.result;
  }

  function parseRapSheetPages(pages, options) {
    options = options || {};
    var context = makeContext(options);
    var limits = mergeLimits(options);
    context.limits = limits;
    var normalizedPages = Array.isArray(pages) ? pages : [];
    var characterCount = normalizedPages.reduce(function (total, page) {
      return total + String(page && page.text != null ? page.text : "").length;
    }, 0);
    var exceedsInputLimit =
      normalizedPages.length > limits.maxPages ||
      characterCount > limits.maxCharacters;
    var combinedText = exceedsInputLimit
      ? ""
      : normalizedPages.map(function (page) {
          return String(page && page.text != null ? page.text : "");
        }).join("\n");
    var detection = exceedsInputLimit
      ? {
          id: "not-inspected",
          label: "Input rejected before format inspection",
          system: "unknown",
          jurisdiction: null,
          confidence: 0,
          supported: true
        }
      : detectRapSheetFormat(combinedText);
    var result = createEmptyResult(
      context,
      detection,
      options,
      {
        kind: options.sourceKind || "pages",
        pageCount: normalizedPages.length,
        characterCount: characterCount,
        retainedInImport: false
      }
    );
    var state = {
      context: context,
      result: result,
      currentCycle: null,
      currentCourt: null,
      lastCharge: null,
      lastDisposition: null,
      section: null,
      cyclesBySourceNumber: {},
      unparsedBuffer: []
    };

    if (normalizedPages.length > limits.maxPages) {
      addWarning(
        state,
        "page_limit_exceeded",
        "The input exceeds the local parser page limit and was not parsed.",
        "error",
        null,
        { maximum: limits.maxPages, actual: normalizedPages.length }
      );
      result.reviewStatus = "rejected";
      return finalizeResult(state);
    }

    if (characterCount > limits.maxCharacters) {
      addWarning(
        state,
        "character_limit_exceeded",
        "The input exceeds the local parser size limit and was not parsed.",
        "error",
        null,
        { maximum: limits.maxCharacters, actual: characterCount }
      );
      result.reviewStatus = "rejected";
      return finalizeResult(state);
    }

    if (!normalizedPages.length || !normalizedValue(combinedText)) {
      addWarning(state, "empty_input", "No RAP-sheet text was provided.", "error", null);
      result.reviewStatus = "rejected";
      return finalizeResult(state);
    }

    if (!detection.supported) {
      addWarning(
        state,
        "unsupported_xml",
        "XML was detected, but version 0.2.0 supports pasted text only. No XML fields were imported.",
        "error",
        null
      );
      result.reviewStatus = "needs_source_adapter";
      return finalizeResult(state);
    }

    if (detection.id === "generic-text") {
      addWarning(
        state,
        "generic_format",
        "The source format was not identified. Generic labeled-field rules were used and every result requires review.",
        "warning",
        null
      );
    }

    var lines = [];
    var baseOffset = 0;
    var i;
    for (i = 0; i < normalizedPages.length; i += 1) {
      var page = normalizedPages[i] || {};
      var pageText = String(page.text == null ? "" : page.text);
      var pageNumber =
        page.pageNumber == null
          ? options.sourceKind === "pasted-text"
            ? null
            : i + 1
          : page.pageNumber;
      var pageLines = splitSourceLines(
        pageText,
        pageNumber,
        lines.length + 1,
        baseOffset
      );
      lines = lines.concat(pageLines);
      baseOffset += pageText.length + 1;
    }

    if (lines.length > limits.maxLines) {
      addWarning(
        state,
        "line_limit_exceeded",
        "The input exceeds the local parser line limit and was not parsed.",
        "error",
        null,
        { maximum: limits.maxLines, actual: lines.length }
      );
      result.reviewStatus = "rejected";
      return finalizeResult(state);
    }

    var overlongLine = lines.filter(function (line) {
      return line.raw.length > limits.maxLineLength;
    })[0];
    if (overlongLine) {
      addWarning(
        state,
        "line_length_limit_exceeded",
        "At least one line exceeds the local parser line-length limit. The input was not parsed.",
        "error",
        overlongLine,
        { maximum: limits.maxLineLength, actual: overlongLine.raw.length }
      );
      result.reviewStatus = "rejected";
      return finalizeResult(state);
    }

    try {
      parseLines(state, lines);
    } catch (error) {
      if (!error || !error.isRapSheetParserLimit) {
        throw error;
      }
      var rejectedResult = createEmptyResult(
        context,
        detection,
        options,
        result.rawDocumentReference
      );
      rejectedResult.id = result.id;
      context.factCount = 0;
      state.result = rejectedResult;
      state.currentCycle = null;
      state.currentCourt = null;
      state.lastCharge = null;
      state.lastDisposition = null;
      state.unparsedBuffer = [];
      addWarning(
        state,
        error.code,
        error.message,
        "error",
        error.sourceLineObject,
        error.details
      );
      rejectedResult.reviewStatus = "rejected";
      return finalizeResult(state);
    }
    return finalizeResult(state);
  }

  function parseRapSheetText(text, options) {
    options = options || {};
    var parseOptions = {};
    Object.keys(options).forEach(function (key) {
      parseOptions[key] = options[key];
    });
    parseOptions.sourceKind = options.sourceKind || "pasted-text";
    return parseRapSheetPages(
      [{ pageNumber: null, text: String(text == null ? "" : text) }],
      parseOptions
    );
  }

  function collectFacts(value, output, seen) {
    if (!value || typeof value !== "object") {
      return;
    }
    if (value.factId) {
      if (!seen[value.factId]) {
        seen[value.factId] = true;
        output.push(value);
      }
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(function (entry) {
        collectFacts(entry, output, seen);
      });
      return;
    }
    Object.keys(value).forEach(function (key) {
      if (key !== "auditTrail" && key !== "summary") {
        collectFacts(value[key], output, seen);
      }
    });
  }

  function allFacts(rapSheetImport) {
    var facts = [];
    collectFacts(rapSheetImport, facts, {});
    return facts;
  }

  function reviewableSentenceLinks(rapSheetImport) {
    var links = [];
    (rapSheetImport && rapSheetImport.cycles || []).forEach(function (cycle) {
      (cycle.sentences || []).forEach(function (sentence) {
        if (
          sentence.dispositionId &&
          sentence.detail &&
          sentence.detail.reviewStatus !== "rejected"
        ) {
          links.push(sentence);
        }
      });
    });
    return links;
  }

  var MERGE_CARD_CONFIGS = {
    alias: {
      listId: "aliasList",
      fields: ["firstName", "middleName", "lastName"]
    },
    document: {
      listId: "documentList",
      fields: [
        "documentType",
        "documentNumber",
        "issuingState",
        "issuingCountry",
        "documentIssueDate",
        "documentExpiration"
      ]
    },
    arrest: {
      listId: "arrestList",
      fields: [
        "arrestDate",
        "arrestCharge",
        "arrestStatute",
        "arrestClass",
        "arrestAgency",
        "arrestAgencyCode",
        "arrestLocation"
      ]
    },
    conviction: {
      listId: "convictionList",
      fields: [
        "crime",
        "convictionStatute",
        "convictionClass",
        "disposition",
        "convictionDate",
        "dispositionDate",
        "court",
        "docketNumber",
        "sentence"
      ]
    }
  };

  function arrayFrom(value) {
    return Array.prototype.slice.call(value || []);
  }

  function directCards(list) {
    return arrayFrom(list && list.children).filter(function (child) {
      return child && String(child.tagName || "").toUpperCase() === "FIELDSET";
    });
  }

  function cardField(card, fieldName) {
    if (!card || typeof card.querySelector !== "function") {
      return null;
    }
    return card.querySelector('[data-field="' + fieldName + '"]');
  }

  function controlValue(control) {
    return control ? normalizedValue(control.value) : "";
  }

  function readCard(card, fieldNames) {
    var values = {};
    (fieldNames || []).forEach(function (fieldName) {
      values[fieldName] = controlValue(cardField(card, fieldName));
    });
    if (card && typeof card.getAttribute === "function") {
      values.__rapImportId = normalizedValue(
        card.getAttribute("data-rap-import-id")
      );
      values.__rapCycleId = normalizedValue(
        card.getAttribute("data-rap-cycle-id")
      );
      values.__rapChargeId = normalizedValue(
        card.getAttribute("data-rap-charge-id")
      );
      values.__rapDispositionId = normalizedValue(
        card.getAttribute("data-rap-disposition-id")
      );
    }
    values.__fromSnapshot = true;
    values.__matchedDuringPlan = false;
    return values;
  }

  function snapshotRapSheetMergeTargets(doc) {
    doc = doc || root.document;
    var snapshot = {
      mainName: {
        first: controlValue(doc && doc.getElementById("firstName")),
        middle: controlValue(doc && doc.getElementById("middleName")),
        last: controlValue(doc && doc.getElementById("lastName"))
      },
      dateOfBirth: controlValue(doc && doc.getElementById("dateOfBirth")),
      sex: "",
      fbiNumber: controlValue(doc && doc.getElementById("fbiNumber")),
      stateId: controlValue(doc && doc.getElementById("stateId")),
      aliases: [],
      documents: [],
      arrests: [],
      convictions: []
    };

    var male = doc && doc.getElementById("sexMale");
    var female = doc && doc.getElementById("sexFemale");
    if (male && male.checked) {
      snapshot.sex = "male";
    } else if (female && female.checked) {
      snapshot.sex = "female";
    }

    ["alias", "document", "arrest", "conviction"].forEach(function (type) {
      var config = MERGE_CARD_CONFIGS[type];
      var list = doc && doc.getElementById(config.listId);
      var target = type === "alias" ? "aliases" : type + "s";
      snapshot[target] = directCards(list).map(function (card) {
        return readCard(card, config.fields);
      });
    });

    return snapshot;
  }

  function comparisonKey(value) {
    var text = String(value == null ? "" : value);
    if (typeof text.normalize === "function") {
      text = text.normalize("NFKD");
    }
    text = text
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase();
    if (NON_ALPHANUMERIC_COMPARISON_PATTERN) {
      return text.replace(NON_ALPHANUMERIC_COMPARISON_PATTERN, "");
    }
    var basicSeparators = " \t\r\n.,'\"/\\():;_-";
    return text.split("").filter(function (character) {
      return basicSeparators.indexOf(character) === -1;
    }).join("");
  }

  function sameValue(left, right) {
    return comparisonKey(left) === comparisonKey(right);
  }

  function simpleNameParse(value) {
    var raw = normalizedValue(value);
    var first = "";
    var middle = "";
    var last = "";
    if (!raw) {
      return { first: "", middle: "", last: "" };
    }
    var comma = raw.indexOf(",");
    var parts;
    if (comma !== -1) {
      last = normalizedValue(raw.slice(0, comma));
      parts = normalizedValue(raw.slice(comma + 1)).split(/\s+/).filter(Boolean);
      first = parts.shift() || "";
      middle = parts.join(" ");
    } else {
      parts = raw.split(/\s+/).filter(Boolean);
      first = parts.shift() || "";
      last = parts.length ? parts.pop() : "";
      middle = parts.join(" ");
    }
    return { first: first, middle: middle, last: last };
  }

  function parseMergeName(value, parseName) {
    var parser =
      typeof parseName === "function"
        ? parseName
        : typeof root.parsePersonName === "function"
        ? root.parsePersonName
        : null;
    var parsed = parser
      ? parser(value, { field: "firstName" })
      : simpleNameParse(value);
    return {
      first: normalizedValue(parsed && parsed.first),
      middle: normalizedValue(parsed && parsed.middle),
      last: normalizedValue(parsed && parsed.last)
    };
  }

  function nameKey(name) {
    name = name || {};
    return [name.first, name.middle, name.last].map(comparisonKey).join("|");
  }

  function nameIsEmpty(name) {
    return !comparisonKey(name && name.first) &&
      !comparisonKey(name && name.middle) &&
      !comparisonKey(name && name.last);
  }

  function namesCompatible(existing, incoming) {
    return ["first", "middle", "last"].every(function (part) {
      var left = comparisonKey(existing && existing[part]);
      var right = comparisonKey(incoming && incoming[part]);
      return !left || !right || left === right;
    });
  }

  function acceptedFactValue(fact) {
    if (!fact || fact.reviewStatus !== "accepted") {
      return "";
    }
    return normalizedValue(
      fact.correctedValue == null ? fact.value : fact.correctedValue
    );
  }

  function acceptedDateValue(fact) {
    var value = acceptedFactValue(fact);
    if (!value) {
      return "";
    }
    if (fact.normalizedValue) {
      return fact.normalizedValue;
    }
    var parsed = strictDate(value);
    return parsed ? parsed.iso : "";
  }

  function normalizedSex(value) {
    var key = comparisonKey(value);
    if (key === "M" || key === "MALE") {
      return "male";
    }
    if (key === "F" || key === "FEMALE") {
      return "female";
    }
    return "";
  }

  function coarseOffenseClass(value) {
    var text = normalizedValue(value).toUpperCase();
    if (!text) {
      return "";
    }
    if (
      /\bFELONY\b/.test(text) ||
      /^(?:F[123]?|FS|SJF)$/.test(text.replace(/\s+/g, ""))
    ) {
      return "felony";
    }
    if (
      /\bMISDEMEANOR\b/.test(text) ||
      /^(?:M|M[ABC])$/.test(text.replace(/\s+/g, ""))
    ) {
      return "misdemeanor";
    }
    return "unknown";
  }

  function mergeRecordKey(record, fieldNames) {
    return (fieldNames || []).map(function (fieldName) {
      return comparisonKey(record && record[fieldName]);
    }).join("|");
  }

  function mergeRecordHasData(record, fieldNames) {
    return (fieldNames || []).some(function (fieldName) {
      return comparisonKey(record && record[fieldName]) !== "";
    });
  }

  function matchHistoryRecord(records, incoming, fieldNames, provenance) {
    var incomingKey = mergeRecordKey(incoming, fieldNames);
    var sourceMatch = (records || []).filter(function (record) {
      if (!provenance || !provenance.importId) {
        return false;
      }
      if (record.__rapImportId !== provenance.importId) {
        return false;
      }
      if (
        provenance.dispositionId &&
        record.__rapDispositionId !== provenance.dispositionId
      ) {
        return false;
      }
      if (
        provenance.chargeId &&
        record.__rapChargeId !== provenance.chargeId
      ) {
        return false;
      }
      return !provenance.cycleId || record.__rapCycleId === provenance.cycleId;
    })[0];
    if (sourceMatch) {
      sourceMatch.__matchedDuringPlan = true;
      return {
        kind:
          mergeRecordKey(sourceMatch, fieldNames) === incomingKey
            ? "duplicate"
            : "source_conflict",
        record: sourceMatch
      };
    }

    var valueMatch = (records || []).filter(function (record) {
      return (
        record.__fromSnapshot &&
        !record.__matchedDuringPlan &&
        mergeRecordKey(record, fieldNames) === incomingKey
      );
    })[0];
    if (valueMatch) {
      valueMatch.__matchedDuringPlan = true;
      return { kind: "duplicate", record: valueMatch };
    }
    return null;
  }

  function factReference(fact, target, reason) {
    return {
      factId: fact && fact.factId ? fact.factId : null,
      field: fact && fact.field ? fact.field : null,
      target: target || null,
      reason: reason || null
    };
  }

  function findChargeById(cycle, chargeId) {
    if (!cycle || !chargeId) {
      return null;
    }
    var charges = [];
    charges = charges.concat(cycle.arrestCharges || []);
    charges = charges.concat(cycle.prosecution.filedCharges || []);
    charges = charges.concat(cycle.prosecution.amendedCharges || []);
    charges = charges.concat(cycle.unclassifiedCharges || []);
    (cycle.courtCases || []).forEach(function (courtCase) {
      charges = charges.concat(courtCase.charges || []);
    });
    return charges.filter(function (charge) {
      return charge.chargeId === chargeId;
    })[0] || null;
  }

  function findCourtForDisposition(cycle, dispositionId) {
    return (cycle && cycle.courtCases || []).filter(function (courtCase) {
      return (courtCase.dispositionIds || []).indexOf(dispositionId) !== -1;
    })[0] || null;
  }

  function sentenceTextForDisposition(cycle, dispositionId) {
    if (!cycle) {
      return { value: "", facts: [], unlinkedFacts: [], lossyFacts: [] };
    }
    var labels = {
      reportedSentence: "",
      incarceration: "Incarceration: ",
      suspendedTime: "Suspended: ",
      fine: "Fine: "
    };
    var pieces = [];
    var facts = [];
    var unlinkedFacts = [];
    var lossyFacts = [];
    (cycle.sentences || []).forEach(function (sentence) {
      if (sentence.dispositionId !== dispositionId) {
        return;
      }
      var value = acceptedFactValue(sentence.detail);
      if (!value) {
        return;
      }
      if (sentence.linkReviewStatus !== "accepted") {
        unlinkedFacts.push(sentence.detail);
        return;
      }
      pieces.push((labels[sentence.type] || "") + value);
      facts.push(sentence.detail);
      if (sentence.type !== "reportedSentence") {
        lossyFacts.push(sentence.detail);
      }
    });
    return {
      value: pieces.join("; "),
      facts: facts,
      unlinkedFacts: unlinkedFacts,
      lossyFacts: lossyFacts
    };
  }

  function buildRapSheetMergePlan(rapSheetImport, snapshot, options) {
    options = options || {};
    snapshot = snapshot || {};
    var plan = {
      importId: rapSheetImport && rapSheetImport.id || null,
      blockedReason: null,
      scalarWrites: [],
      sexWrite: null,
      aliases: [],
      documents: [],
      arrests: [],
      convictions: [],
      setCriminal: false,
      matchedExistingConviction: false,
      skipped: [],
      conflicts: [],
      unmapped: [],
      lossyMappings: []
    };

    if (!rapSheetImport || rapSheetImport.reviewStatus !== "reviewed") {
      plan.blockedReason = "import_not_fully_reviewed";
      return plan;
    }

    var consumed = {};
    function consume(fact) {
      if (fact && fact.factId) {
        consumed[fact.factId] = true;
      }
    }
    function skip(fact, target, reason) {
      consume(fact);
      plan.skipped.push(factReference(fact, target, reason));
    }
    function conflict(fact, target, reason) {
      consume(fact);
      plan.conflicts.push(factReference(fact, target, reason));
    }
    function unmapped(fact, reason) {
      consume(fact);
      plan.unmapped.push(factReference(fact, null, reason));
    }

    var virtualMain = {
      first: normalizedValue(snapshot.mainName && snapshot.mainName.first),
      middle: normalizedValue(snapshot.mainName && snapshot.mainName.middle),
      last: normalizedValue(snapshot.mainName && snapshot.mainName.last)
    };
    var virtualAliases = (snapshot.aliases || []).map(function (entry) {
      return {
        first: normalizedValue(entry.firstName || entry.first),
        middle: normalizedValue(entry.middleName || entry.middle),
        last: normalizedValue(entry.lastName || entry.last)
      };
    });

    function aliasExists(name) {
      var key = nameKey(name);
      return key === nameKey(virtualMain) || virtualAliases.some(function (alias) {
        return nameKey(alias) === key;
      });
    }

    function addAlias(fact, parsedName, reason) {
      if (nameIsEmpty(parsedName)) {
        conflict(fact, "aliasList", "name_could_not_be_structured");
        return;
      }
      if (aliasExists(parsedName)) {
        skip(fact, "aliasList", "equivalent_name_already_present");
        return;
      }
      consume(fact);
      virtualAliases.push(parsedName);
      plan.aliases.push({
        values: {
          firstName: parsedName.first,
          middleName: parsedName.middle,
          lastName: parsedName.last
        },
        sourceFactIds: [fact.factId],
        reason: reason
      });
    }

    var subject = rapSheetImport.subjectCandidate || {};
    (subject.names || []).forEach(function (fact) {
      var value = acceptedFactValue(fact);
      if (!value) {
        return;
      }
      var parsedName = parseMergeName(value, options.parseName);
      if (fact.nameType === "alias") {
        addAlias(fact, parsedName, "source_reported_alias");
        return;
      }
      if (nameIsEmpty(virtualMain)) {
        consume(fact);
        plan.scalarWrites.push({
          kind: "name",
          values: {
            firstName: parsedName.first,
            middleName: parsedName.middle,
            lastName: parsedName.last
          },
          sourceFactIds: [fact.factId]
        });
        virtualMain = parsedName;
        return;
      }
      if (namesCompatible(virtualMain, parsedName)) {
        var additions = {};
        ["first", "middle", "last"].forEach(function (part) {
          if (!comparisonKey(virtualMain[part]) && comparisonKey(parsedName[part])) {
            additions[part + "Name"] = parsedName[part];
            virtualMain[part] = parsedName[part];
          }
        });
        consume(fact);
        if (Object.keys(additions).length) {
          plan.scalarWrites.push({
            kind: "name",
            values: additions,
            sourceFactIds: [fact.factId]
          });
        } else {
          plan.skipped.push(
            factReference(fact, "primaryName", "equivalent_name_already_present")
          );
        }
        return;
      }
      addAlias(fact, parsedName, "primary_name_conflicts_with_existing_name");
    });

    function planScalar(fact, targetId, currentValue, incomingValue, reason) {
      if (!fact || !incomingValue) {
        return currentValue;
      }
      if (!normalizedValue(currentValue)) {
        consume(fact);
        plan.scalarWrites.push({
          kind: "scalar",
          targetId: targetId,
          value: incomingValue,
          sourceFactIds: [fact.factId]
        });
        return incomingValue;
      }
      if (sameValue(currentValue, incomingValue)) {
        skip(fact, targetId, "equivalent_value_already_present");
        return currentValue;
      }
      conflict(fact, targetId, reason || "existing_value_differs");
      return currentValue;
    }

    var virtualDob = normalizedValue(snapshot.dateOfBirth);
    var dateOfBirthFacts = (subject.datesOfBirth || []).slice();
    dateOfBirthFacts = dateOfBirthFacts.filter(function (fact) {
      return fact.dateType !== "alternate";
    }).concat(dateOfBirthFacts.filter(function (fact) {
      return fact.dateType === "alternate";
    }));
    dateOfBirthFacts.forEach(function (fact) {
      var dateValue = acceptedDateValue(fact);
      if (!acceptedFactValue(fact)) {
        return;
      }
      if (!dateValue) {
        conflict(fact, "dateOfBirth", "accepted_date_is_not_unambiguous");
        return;
      }
      if (fact.dateType === "alternate") {
        if (virtualDob && sameValue(virtualDob, dateValue)) {
          skip(
            fact,
            "dateOfBirth",
            "alternate_dob_matches_primary_value"
          );
        } else {
          conflict(
            fact,
            "dateOfBirth",
            "alternate_date_of_birth_field_missing"
          );
        }
        return;
      }
      virtualDob = planScalar(
        fact,
        "dateOfBirth",
        virtualDob,
        dateValue,
        "alternate_date_of_birth_field_missing"
      );
    });

    var virtualSex = normalizedValue(snapshot.sex);
    ((subject.descriptors && subject.descriptors.sex) || []).forEach(function (fact) {
      var rawSex = acceptedFactValue(fact);
      if (!rawSex) {
        return;
      }
      var sex = normalizedSex(rawSex);
      if (!sex) {
        conflict(fact, "sex", "unsupported_sex_value");
        return;
      }
      if (!virtualSex) {
        consume(fact);
        plan.sexWrite = { value: sex, sourceFactIds: [fact.factId] };
        virtualSex = sex;
      } else if (virtualSex === sex) {
        skip(fact, "sex", "equivalent_value_already_present");
      } else {
        conflict(fact, "sex", "alternate_sex_field_missing");
      }
    });

    var fbiFacts = [];
    if (subject.identifiers && subject.identifiers.fbiNumber) {
      fbiFacts.push(subject.identifiers.fbiNumber);
    }
    fbiFacts = fbiFacts.concat(
      subject.identifiers && subject.identifiers.additionalFbiNumbers || []
    );
    var virtualFbi = normalizedValue(snapshot.fbiNumber);
    fbiFacts.forEach(function (fact) {
      var value = acceptedFactValue(fact);
      if (value) {
        virtualFbi = planScalar(
          fact,
          "fbiNumber",
          virtualFbi,
          value,
          "additional_fbi_identifier_field_missing"
        );
      }
    });

    var virtualSid = normalizedValue(snapshot.stateId);
    ((subject.identifiers && subject.identifiers.stateIds) || []).forEach(function (fact) {
      var value = acceptedFactValue(fact);
      if (value) {
        virtualSid = planScalar(
          fact,
          "stateId",
          virtualSid,
          value,
          "additional_sid_identifier_field_missing"
        );
      }
    });

    var documentFields = MERGE_CARD_CONFIGS.document.fields;
    var virtualDocuments = (snapshot.documents || []).filter(function (record) {
      return mergeRecordHasData(record, documentFields);
    }).slice();
    ((subject.identifiers && subject.identifiers.driverLicenses) || []).forEach(function (fact) {
      var value = acceptedFactValue(fact);
      if (!value) {
        return;
      }
      var record = {
        documentType: "DRIVERS_LICENSE",
        documentNumber: value,
        issuingState: "",
        issuingCountry: "",
        documentIssueDate: "",
        documentExpiration: ""
      };
      var key = mergeRecordKey(record, ["documentType", "documentNumber"]);
      if (virtualDocuments.some(function (existing) {
        return mergeRecordKey(existing, ["documentType", "documentNumber"]) === key;
      })) {
        skip(fact, "documentList", "equivalent_driver_license_already_present");
        return;
      }
      consume(fact);
      virtualDocuments.push(record);
      plan.documents.push({ values: record, sourceFactIds: [fact.factId] });
    });

    var arrestKeyFields = [
      "arrestDate",
      "arrestCharge",
      "arrestStatute",
      "arrestClass",
      "arrestAgency",
      "arrestLocation"
    ];
    var virtualArrests = (snapshot.arrests || []).filter(function (record) {
      return mergeRecordHasData(record, arrestKeyFields);
    }).map(function (record) {
      var copy = Object.assign({}, record);
      copy.__fromSnapshot = true;
      copy.__matchedDuringPlan = false;
      return copy;
    });

    (rapSheetImport.cycles || []).forEach(function (cycle) {
      var rawArrestDate = acceptedFactValue(cycle.arrest && cycle.arrest.date);
      var normalizedArrestDate = acceptedDateValue(
        cycle.arrest && cycle.arrest.date
      );
      if (rawArrestDate && !normalizedArrestDate) {
        conflict(
          cycle.arrest.date,
          "arrestDate",
          "accepted_date_is_not_unambiguous"
        );
      }
      var common = {
        arrestDate: normalizedArrestDate,
        arrestAgency: acceptedFactValue(cycle.arrest && cycle.arrest.agency),
        arrestLocation: acceptedFactValue(cycle.arrest && cycle.arrest.location)
      };
      var commonFacts = [
        normalizedArrestDate ? cycle.arrest && cycle.arrest.date : null,
        cycle.arrest && cycle.arrest.agency,
        cycle.arrest && cycle.arrest.location
      ].filter(function (fact) {
        return acceptedFactValue(fact);
      });
      var chargeRecords = [];
      (cycle.arrestCharges || []).forEach(function (charge) {
        var description = acceptedFactValue(charge.description);
        var statute = acceptedFactValue(charge.statute);
        var exactClass = acceptedFactValue(charge.classification);
        if (!description && !statute && !exactClass) {
          return;
        }
        var facts = [charge.description, charge.statute, charge.classification].filter(
          function (fact) {
            return acceptedFactValue(fact);
          }
        );
        chargeRecords.push({
          values: {
            arrestDate: common.arrestDate,
            arrestCharge: description,
            arrestStatute: statute,
            arrestClass: exactClass ? coarseOffenseClass(exactClass) : "",
            arrestAgency: common.arrestAgency,
            arrestLocation: common.arrestLocation
          },
          facts: commonFacts.concat(facts),
          exactClassFact: exactClass ? charge.classification : null,
          sourceChargeId: charge.chargeId
        });
      });
      if (!chargeRecords.length && mergeRecordHasData(common, ["arrestDate", "arrestAgency", "arrestLocation"])) {
        chargeRecords.push({
          values: {
            arrestDate: common.arrestDate,
            arrestCharge: "",
            arrestStatute: "",
            arrestClass: "",
            arrestAgency: common.arrestAgency,
            arrestLocation: common.arrestLocation
          },
          facts: commonFacts,
          exactClassFact: null,
          sourceChargeId: null
        });
      }

      chargeRecords.forEach(function (entry) {
        var provenance = {
          importId: rapSheetImport.id,
          cycleId: cycle.cycleId,
          chargeId: entry.sourceChargeId
        };
        var existingMatch = matchHistoryRecord(
          virtualArrests,
          entry.values,
          arrestKeyFields,
          provenance
        );
        entry.facts.forEach(consume);
        if (existingMatch) {
          entry.facts.forEach(function (fact) {
            if (existingMatch.kind === "source_conflict") {
              plan.conflicts.push(
                factReference(
                  fact,
                  "arrestList",
                  "previously_applied_arrest_differs"
                )
              );
            } else {
              plan.skipped.push(
                factReference(
                  fact,
                  "arrestList",
                  "equivalent_arrest_already_present"
                )
              );
            }
          });
          return;
        }
        virtualArrests.push(
          Object.assign({}, entry.values, {
            __rapImportId: rapSheetImport.id,
            __rapCycleId: cycle.cycleId,
            __rapChargeId: entry.sourceChargeId || "",
            __fromSnapshot: false,
            __matchedDuringPlan: true
          })
        );
        plan.arrests.push({
          values: entry.values,
          sourceFactIds: entry.facts.map(function (fact) { return fact.factId; }),
          sourceImportId: rapSheetImport.id,
          sourceCycleId: cycle.cycleId,
          sourceChargeId: entry.sourceChargeId
        });
        if (entry.exactClassFact) {
          plan.lossyMappings.push(
            factReference(
              entry.exactClassFact,
              "arrestClass",
              "full_offense_grade_reduced_to_broad_class"
            )
          );
        }
      });
    });

    var convictionKeyFields = [
      "crime",
      "convictionStatute",
      "convictionClass",
      "disposition",
      "convictionDate",
      "dispositionDate",
      "court",
      "docketNumber",
      "sentence"
    ];
    var virtualConvictions = (snapshot.convictions || []).filter(function (record) {
      return mergeRecordHasData(record, convictionKeyFields);
    }).map(function (record) {
      var copy = Object.assign({}, record);
      copy.__fromSnapshot = true;
      copy.__matchedDuringPlan = false;
      return copy;
    });

    (rapSheetImport.cycles || []).forEach(function (cycle) {
      var explicitDispositions = (cycle.dispositions || []).filter(function (disposition) {
        var raw = acceptedFactValue(disposition.rawDisposition);
        return raw &&
          currentDispositionClassification(disposition).status ===
            "explicit_conviction";
      });

      (cycle.dispositions || []).forEach(function (disposition) {
        var rawDisposition = acceptedFactValue(disposition.rawDisposition);
        if (!rawDisposition) {
          return;
        }
        var classification = currentDispositionClassification(disposition);
        if (classification.status !== "explicit_conviction") {
          unmapped(disposition.rawDisposition, "non_conviction_case_destination_missing");
          if (disposition.outcome && disposition.outcome.reviewStatus === "accepted") {
            unmapped(disposition.outcome, "non_conviction_case_destination_missing");
          }
          if (disposition.date && disposition.date.reviewStatus === "accepted") {
            unmapped(disposition.date, "non_conviction_case_destination_missing");
          }
          return;
        }

        var charge = findChargeById(cycle, disposition.chargeId);
        if (!charge) {
          unmapped(
            disposition.rawDisposition,
            "ambiguous_or_missing_conviction_charge_link"
          );
          if (disposition.outcome && disposition.outcome.reviewStatus === "accepted") {
            unmapped(
              disposition.outcome,
              "ambiguous_or_missing_conviction_charge_link"
            );
          }
          if (disposition.date && disposition.date.reviewStatus === "accepted") {
            unmapped(
              disposition.date,
              "ambiguous_or_missing_conviction_charge_link"
            );
          }
          return;
        }

        var facts = [disposition.rawDisposition];
        if (disposition.outcome && disposition.outcome.reviewStatus === "accepted") {
          facts.push(disposition.outcome);
        }
        var crime = acceptedFactValue(charge && charge.description);
        var statute = acceptedFactValue(charge && charge.statute);
        var exactClass = acceptedFactValue(charge && charge.classification);
        [charge && charge.description, charge && charge.statute, charge && charge.classification]
          .filter(function (fact) { return acceptedFactValue(fact); })
          .forEach(function (fact) { facts.push(fact); });

        var courtCase = findCourtForDisposition(cycle, disposition.dispositionId);
        var court = acceptedFactValue(courtCase && courtCase.court);
        var docket = acceptedFactValue(courtCase && courtCase.docketNumber);
        [courtCase && courtCase.court, courtCase && courtCase.docketNumber]
          .filter(function (fact) { return acceptedFactValue(fact); })
          .forEach(function (fact) { facts.push(fact); });

        var rawDispositionDate = acceptedFactValue(disposition.date);
        var dispositionDate = acceptedDateValue(disposition.date);
        if (rawDispositionDate && !dispositionDate) {
          conflict(
            disposition.date,
            "dispositionDate",
            "accepted_date_is_not_unambiguous"
          );
        } else if (rawDispositionDate) {
          facts.push(disposition.date);
        }
        var convictionDate = "";
        if (
          explicitDispositions.length === 1 &&
          acceptedFactValue(cycle.convictionDate)
        ) {
          convictionDate = acceptedDateValue(cycle.convictionDate);
          if (convictionDate) {
            facts.push(cycle.convictionDate);
          } else {
            conflict(
              cycle.convictionDate,
              "convictionDate",
              "accepted_date_is_not_unambiguous"
            );
          }
        } else {
          convictionDate = dispositionDate;
        }

        var sentence = sentenceTextForDisposition(cycle, disposition.dispositionId);
        sentence.facts.forEach(function (fact) { facts.push(fact); });
        sentence.unlinkedFacts.forEach(function (fact) {
          unmapped(fact, "sentence_relationship_not_accepted");
        });
        sentence.lossyFacts.forEach(function (fact) {
          plan.lossyMappings.push(
            factReference(
              fact,
              "sentence",
              "structured_sentence_component_flattened"
            )
          );
        });

        var record = {
          crime: crime,
          convictionStatute: statute,
          convictionClass: exactClass ? coarseOffenseClass(exactClass) : "",
          disposition:
            disposition.outcome &&
            disposition.outcome.reviewStatus === "accepted" &&
            disposition.outcome.correctedValue != null
              ? acceptedFactValue(disposition.outcome)
              : rawDisposition,
          convictionDate: convictionDate,
          dispositionDate: dispositionDate,
          court: court,
          docketNumber: docket,
          sentence: sentence.value
        };
        var provenance = {
          importId: rapSheetImport.id,
          cycleId: cycle.cycleId,
          dispositionId: disposition.dispositionId
        };
        var existingMatch = matchHistoryRecord(
          virtualConvictions,
          record,
          convictionKeyFields,
          provenance
        );
        facts.forEach(consume);
        if (existingMatch) {
          facts.forEach(function (fact) {
            if (existingMatch.kind === "source_conflict") {
              plan.conflicts.push(
                factReference(
                  fact,
                  "convictionList",
                  "previously_applied_conviction_differs"
                )
              );
            } else {
              plan.skipped.push(
                factReference(
                  fact,
                  "convictionList",
                  "equivalent_conviction_already_present"
                )
              );
            }
          });
          if (existingMatch.kind === "duplicate") {
            plan.setCriminal = true;
            plan.matchedExistingConviction = true;
          }
          return;
        }
        virtualConvictions.push(
          Object.assign({}, record, {
            __rapImportId: rapSheetImport.id,
            __rapCycleId: cycle.cycleId,
            __rapDispositionId: disposition.dispositionId,
            __fromSnapshot: false,
            __matchedDuringPlan: true
          })
        );
        plan.convictions.push({
          values: record,
          sourceFactIds: facts.map(function (fact) { return fact.factId; }),
          sourceImportId: rapSheetImport.id,
          sourceCycleId: cycle.cycleId,
          sourceDispositionId: disposition.dispositionId
        });
        plan.setCriminal = true;
        if (exactClass) {
          plan.lossyMappings.push(
            factReference(
              charge.classification,
              "convictionClass",
              "full_offense_grade_reduced_to_broad_class"
            )
          );
        }
      });
    });

    allFacts(rapSheetImport).forEach(function (fact) {
      if (fact.reviewStatus === "accepted" && !consumed[fact.factId]) {
        plan.unmapped.push(
          factReference(fact, null, "no_compatible_existing_form_field")
        );
        consumed[fact.factId] = true;
      }
    });

    return plan;
  }

  function dispatchControlEvent(control, eventName) {
    if (!control || typeof control.dispatchEvent !== "function") {
      return;
    }
    var doc = control.ownerDocument || root.document;
    var event = null;
    if (typeof root.Event === "function") {
      event = new root.Event(eventName, { bubbles: true });
    } else if (doc && typeof doc.createEvent === "function") {
      event = doc.createEvent("Event");
      if (event && typeof event.initEvent === "function") {
        event.initEvent(eventName, true, false);
      } else if (event) {
        event.type = eventName;
      }
    }
    if (event) {
      control.dispatchEvent(event);
    }
  }

  function writeControlValue(control, value, report, target) {
    if (!normalizedValue(value)) {
      return false;
    }
    if (!control) {
      report.conflicts.push({
        factId: null,
        field: null,
        target: target,
        reason: "target_control_unavailable"
      });
      return false;
    }
    var current = controlValue(control);
    if (current && !sameValue(current, value)) {
      report.conflicts.push({
        factId: null,
        field: null,
        target: target,
        reason: "target_changed_after_merge_plan"
      });
      return false;
    }
    if (current && sameValue(current, value)) {
      return true;
    }
    control.value = value;
    dispatchControlEvent(control, "input");
    dispatchControlEvent(control, "change");
    report.applied.push({ target: target });
    return true;
  }

  function cardIsEmpty(card, fieldNames) {
    return !(fieldNames || []).some(function (fieldName) {
      return controlValue(cardField(card, fieldName)) !== "";
    });
  }

  function addMergeCard(type, doc, options) {
    if (typeof options.createCard === "function") {
      return options.createCard(type);
    }
    var cardsApi = options.cardsApi ||
      (root.COPDoc && root.COPDoc.cards ? root.COPDoc.cards : null);
    if (cardsApi) {
      var namedMethod = {
        alias: "addAlias",
        document: "addDocument",
        arrest: "addArrest",
        conviction: "addConviction"
      }[type];
      if (namedMethod && typeof cardsApi[namedMethod] === "function") {
        return cardsApi[namedMethod]();
      }
      if (typeof cardsApi.add === "function") {
        return cardsApi.add(type);
      }
    }
    return null;
  }

  function acquireMergeCard(type, doc, options) {
    var config = MERGE_CARD_CONFIGS[type];
    var list = doc && doc.getElementById(config.listId);
    var empty = directCards(list).filter(function (card) {
      return cardIsEmpty(card, config.fields);
    })[0];
    return empty || addMergeCard(type, doc, options);
  }

  function applyCardOperation(type, operation, doc, options, report) {
    var card = acquireMergeCard(type, doc, options);
    if (!card) {
      report.conflicts.push({
        factId: null,
        field: null,
        target: MERGE_CARD_CONFIGS[type].listId,
        reason: "repeatable_card_factory_unavailable"
      });
      return false;
    }
    var wrote = false;
    Object.keys(operation.values || {}).forEach(function (fieldName) {
      var value = operation.values[fieldName];
      if (!normalizedValue(value)) {
        return;
      }
      if (
        writeControlValue(
          cardField(card, fieldName),
          value,
          report,
          type + "." + fieldName
        )
      ) {
        wrote = true;
      }
    });
    if (typeof card.setAttribute === "function") {
      if (operation.sourceImportId) {
        card.setAttribute("data-rap-import-id", operation.sourceImportId);
      }
      if (operation.sourceCycleId) {
        card.setAttribute("data-rap-cycle-id", operation.sourceCycleId);
      }
      if (operation.sourceChargeId) {
        card.setAttribute("data-rap-charge-id", operation.sourceChargeId);
      }
      if (operation.sourceDispositionId) {
        card.setAttribute(
          "data-rap-disposition-id",
          operation.sourceDispositionId
        );
      }
      if (operation.sourceFactIds && operation.sourceFactIds.length) {
        card.setAttribute(
          "data-rap-source-facts",
          operation.sourceFactIds.join(" ")
        );
      }
    }
    if (wrote) {
      report.cardsApplied[type] += 1;
    }
    return wrote;
  }

  function applyRapSheetMergePlan(plan, options) {
    options = options || {};
    var doc = options.document || root.document;
    var report = {
      blockedReason: plan && plan.blockedReason || null,
      applied: [],
      skipped: arrayFrom(plan && plan.skipped),
      conflicts: arrayFrom(plan && plan.conflicts),
      unmapped: arrayFrom(plan && plan.unmapped),
      lossyMappings: arrayFrom(plan && plan.lossyMappings),
      cardsApplied: {
        alias: 0,
        document: 0,
        arrest: 0,
        conviction: 0
      },
      criminalFlagSet: false
    };
    if (!plan || plan.blockedReason || !doc) {
      if (!report.blockedReason) {
        report.blockedReason = "merge_target_document_unavailable";
      }
      return report;
    }

    (plan.scalarWrites || []).forEach(function (write) {
      if (write.kind === "name") {
        Object.keys(write.values || {}).forEach(function (fieldId) {
          writeControlValue(
            doc.getElementById(fieldId),
            write.values[fieldId],
            report,
            fieldId
          );
        });
        return;
      }
      writeControlValue(
        doc.getElementById(write.targetId),
        write.value,
        report,
        write.targetId
      );
    });

    if (plan.sexWrite) {
      var sexTarget = doc.getElementById(
        plan.sexWrite.value === "male" ? "sexMale" : "sexFemale"
      );
      var otherSex = doc.getElementById(
        plan.sexWrite.value === "male" ? "sexFemale" : "sexMale"
      );
      if (sexTarget && !(otherSex && otherSex.checked)) {
        if (!sexTarget.checked) {
          sexTarget.checked = true;
          dispatchControlEvent(sexTarget, "change");
          report.applied.push({ target: "sex" });
        }
      } else if (!sexTarget) {
        report.conflicts.push({
          factId: null,
          field: null,
          target: "sex",
          reason: "sex_controls_unavailable"
        });
      }
    }

    ["alias", "document", "arrest", "conviction"].forEach(function (type) {
      var operations =
        type === "alias" ? plan.aliases : plan[type + "s"];
      (operations || []).forEach(function (operation) {
        applyCardOperation(type, operation, doc, options, report);
      });
    });

    if (
      plan.setCriminal &&
      (plan.matchedExistingConviction || report.cardsApplied.conviction > 0)
    ) {
      var criminal = doc.getElementById("isCriminal");
      if (criminal) {
        if (!criminal.checked) {
          criminal.checked = true;
          dispatchControlEvent(criminal, "change");
          report.applied.push({ target: "isCriminal" });
        }
        report.criminalFlagSet = true;
      }
    }

    return report;
  }

  function mergeRapSheetImportIntoForm(rapSheetImport, options) {
    options = options || {};
    var doc = options.document || root.document;
    var snapshot = options.snapshot || snapshotRapSheetMergeTargets(doc);
    var plan = buildRapSheetMergePlan(rapSheetImport, snapshot, options);
    return {
      plan: plan,
      report: applyRapSheetMergePlan(plan, options)
    };
  }

  function appendTextElement(doc, parent, tagName, className, textValue) {
    var element = doc.createElement(tagName);
    if (className) {
      element.className = className;
    }
    element.textContent = textValue;
    parent.appendChild(element);
    return element;
  }

  function clearElement(element) {
    while (element && element.firstChild) {
      element.removeChild(element.firstChild);
    }
  }

  function factLocation(fact) {
    var pieces = [];
    if (fact.sourcePage != null) {
      pieces.push("page " + fact.sourcePage);
    }
    if (fact.sourceLine && fact.sourceLine.start != null) {
      pieces.push("line " + fact.sourceLine.start);
    }
    return pieces.length ? pieces.join(", ") : "source location unavailable";
  }

  function reviewControlsHaveUnsavedChanges(container, rapSheetImport) {
    if (!container || !rapSheetImport) {
      return false;
    }
    var facts = allFacts(rapSheetImport);
    var factMap = {};
    facts.forEach(function (fact) {
      factMap[fact.factId] = fact;
    });
    var valueInputs = container.querySelectorAll("[data-rap-value-for]");
    var statusInputs = container.querySelectorAll("[data-rap-status-for]");
    var i;
    for (i = 0; i < valueInputs.length; i += 1) {
      var valueId = valueInputs[i].getAttribute("data-rap-value-for");
      if (
        factMap[valueId] &&
        normalizedValue(valueInputs[i].value) !==
          normalizedValue(
            factMap[valueId].correctedValue == null
              ? factMap[valueId].value
              : factMap[valueId].correctedValue
          )
      ) {
        return true;
      }
    }
    for (i = 0; i < statusInputs.length; i += 1) {
      var statusId = statusInputs[i].getAttribute("data-rap-status-for");
      if (
        factMap[statusId] &&
        statusInputs[i].value !== factMap[statusId].reviewStatus
      ) {
        return true;
      }
    }
    var unparsedMap = {};
    (rapSheetImport.unparsedSections || []).forEach(function (section) {
      unparsedMap[section.sectionId] = section;
    });
    var unparsedInputs = container.querySelectorAll(
      "[data-rap-unparsed-status-for]"
    );
    for (i = 0; i < unparsedInputs.length; i += 1) {
      var sectionId = unparsedInputs[i].getAttribute(
        "data-rap-unparsed-status-for"
      );
      if (
        unparsedMap[sectionId] &&
        unparsedInputs[i].value !== unparsedMap[sectionId].reviewStatus
      ) {
        return true;
      }
    }
    var sentenceLinkMap = {};
    reviewableSentenceLinks(rapSheetImport).forEach(function (sentence) {
      sentenceLinkMap[sentence.sentenceId] = sentence;
    });
    var sentenceLinkInputs = container.querySelectorAll(
      "[data-rap-sentence-link-for]"
    );
    for (i = 0; i < sentenceLinkInputs.length; i += 1) {
      var sentenceId = sentenceLinkInputs[i].getAttribute(
        "data-rap-sentence-link-for"
      );
      if (
        sentenceLinkMap[sentenceId] &&
        sentenceLinkInputs[i].value !==
          sentenceLinkMap[sentenceId].linkReviewStatus
      ) {
        return true;
      }
    }
    return false;
  }

  function renderFactEditor(doc, parent, labelText, fact) {
    if (!fact) {
      return;
    }
    var row = doc.createElement("div");
    row.className = "rap-fact-row";

    var label = appendTextElement(doc, row, "label", "rap-fact-label", labelText);
    var input = doc.createElement("input");
    input.type = "text";
    input.value =
      fact.correctedValue == null ? String(fact.value || "") : String(fact.correctedValue);
    input.setAttribute("data-rap-value-for", fact.factId);
    input.id = "rap-value-" + fact.factId;
    input.autocomplete = "off";
    label.htmlFor = input.id;
    row.appendChild(input);

    var select = doc.createElement("select");
    select.setAttribute("data-rap-status-for", fact.factId);
    select.setAttribute("aria-label", "Review status for " + labelText);
    [
      { value: "pending", label: "Needs review" },
      { value: "accepted", label: "Accept" },
      { value: "rejected", label: "Reject" }
    ].forEach(function (choice) {
      var option = doc.createElement("option");
      option.value = choice.value;
      option.textContent = choice.label;
      option.selected = fact.reviewStatus === choice.value;
      select.appendChild(option);
    });
    row.appendChild(select);

    var provenance = appendTextElement(
      doc,
      row,
      "small",
      "rap-fact-source",
      "Source " + factLocation(fact) + ": " + String(fact.sourceText || "")
    );
    provenance.title =
      "Confidence " + fact.confidence + "; basis " + String(fact.basis || "unknown");
    parent.appendChild(row);
  }

  function renderCharge(doc, parent, label, charge) {
    if (!charge) {
      return;
    }
    var group = doc.createElement("div");
    group.className = "rap-review-group rap-charge-group";
    appendTextElement(doc, group, "h5", "", label);
    renderFactEditor(doc, group, "Description", charge.description);
    renderFactEditor(doc, group, "Statute / code", charge.statute);
    renderFactEditor(doc, group, "Classification", charge.classification);
    if (charge.linkBasis) {
      appendTextElement(
        doc,
        group,
        "p",
        "rap-link-note",
        "Possible prior-stage link: " + charge.linkBasis
      );
    }
    parent.appendChild(group);
  }

  function renderRapSheetReview(reviewElement, rapSheetImport, onSave, onApply) {
    if (!reviewElement || !rapSheetImport) {
      return;
    }
    var doc = reviewElement.ownerDocument || root.document;
    clearElement(reviewElement);

    appendTextElement(
      doc,
      reviewElement,
      "h3",
      "rap-review-title",
      "RAP Sheet Import Review — " + rapSheetImport.summary.statusLabel
    );
    appendTextElement(
      doc,
      reviewElement,
      "p",
      "rap-review-notice",
      "Review each parsed fact first. After every item is resolved, use Apply accepted facts to populate compatible existing lead fields. Existing nonblank values are never overwritten; differing names become deduplicated aliases."
    );
    appendTextElement(
      doc,
      reviewElement,
      "pre",
      "rap-summary",
      rapSheetImport.summary.text
    );

    var subject = rapSheetImport.subjectCandidate;
    var identity = doc.createElement("section");
    identity.className = "rap-review-section";
    appendTextElement(doc, identity, "h4", "", "Subject candidates");
    subject.names.forEach(function (fact, index) {
      renderFactEditor(
        doc,
        identity,
        (fact.nameType === "alias" ? "Alias " : "Primary name ") + (index + 1),
        fact
      );
    });
    subject.datesOfBirth.forEach(function (fact, index) {
      renderFactEditor(
        doc,
        identity,
        (fact.dateType === "alternate" ? "Alternate date of birth " : "Date of birth ") +
          (index + 1),
        fact
      );
    });
    renderFactEditor(doc, identity, "FBI number", subject.identifiers.fbiNumber);
    subject.identifiers.additionalFbiNumbers.forEach(function (fact, index) {
      renderFactEditor(doc, identity, "Additional FBI number " + (index + 1), fact);
    });
    subject.identifiers.stateIds.forEach(function (fact, index) {
      renderFactEditor(doc, identity, "State ID " + (index + 1), fact);
    });
    subject.identifiers.driverLicenses.forEach(function (fact, index) {
      renderFactEditor(doc, identity, "Driver license " + (index + 1), fact);
    });
    Object.keys(subject.descriptors).forEach(function (key) {
      subject.descriptors[key].forEach(function (fact, index) {
        renderFactEditor(doc, identity, key + " " + (index + 1), fact);
      });
    });
    subject.recordWarnings.forEach(function (fact, index) {
      renderFactEditor(doc, identity, "Record warning " + (index + 1), fact);
    });
    if (identity.querySelector(".rap-fact-row")) {
      reviewElement.appendChild(identity);
    }

    rapSheetImport.cycles.forEach(function (cycle, cycleIndex) {
      var details = doc.createElement("details");
      details.className = "rap-cycle";
      details.open = cycleIndex === 0;
      appendTextElement(
        doc,
        details,
        "summary",
        "",
        "Arrest cycle " + (cycleIndex + 1)
      );
      var body = doc.createElement("div");
      body.className = "rap-cycle-body";

      renderFactEditor(doc, body, "Arrest date", cycle.arrest.date);
      renderFactEditor(doc, body, "Arrest location", cycle.arrest.location);
      renderFactEditor(doc, body, "Arresting agency", cycle.arrest.agency);
      renderFactEditor(doc, body, "Arresting ORI", cycle.arrest.ori);
      renderFactEditor(doc, body, "Arrest number", cycle.arrest.arrestNumber);
      renderFactEditor(doc, body, "Booking date", cycle.booking.date);
      renderFactEditor(doc, body, "Booking number", cycle.booking.number);
      renderFactEditor(doc, body, "Booking facility", cycle.booking.facility);

      cycle.arrestCharges.forEach(function (charge, index) {
        renderCharge(doc, body, "Arrest charge " + (index + 1), charge);
      });
      cycle.prosecution.filedCharges.forEach(function (charge, index) {
        renderCharge(doc, body, "Filed charge " + (index + 1), charge);
      });
      cycle.prosecution.amendedCharges.forEach(function (charge, index) {
        renderCharge(doc, body, "Amended / reduced charge " + (index + 1), charge);
      });
      cycle.unclassifiedCharges.forEach(function (charge, index) {
        renderCharge(doc, body, "Unclassified charge " + (index + 1), charge);
      });

      renderFactEditor(doc, body, "Prosecutor filing date", cycle.prosecution.filingDate);
      renderFactEditor(doc, body, "Prosecuting agency", cycle.prosecution.agency);
      renderFactEditor(doc, body, "Prosecution case number", cycle.prosecution.caseNumber);

      cycle.courtCases.forEach(function (court, courtIndex) {
        var courtGroup = doc.createElement("section");
        courtGroup.className = "rap-review-group";
        appendTextElement(doc, courtGroup, "h5", "", "Court case " + (courtIndex + 1));
        renderFactEditor(doc, courtGroup, "Court", court.court);
        renderFactEditor(doc, courtGroup, "Docket / cause number", court.docketNumber);
        court.charges.forEach(function (charge, index) {
          renderCharge(doc, courtGroup, "Court charge " + (index + 1), charge);
        });
        body.appendChild(courtGroup);
      });

      cycle.dispositions.forEach(function (disposition, index) {
        var dispositionGroup = doc.createElement("section");
        dispositionGroup.className = "rap-review-group";
        appendTextElement(doc, dispositionGroup, "h5", "", "Disposition " + (index + 1));
        renderFactEditor(doc, dispositionGroup, "Source disposition", disposition.rawDisposition);
        renderFactEditor(doc, dispositionGroup, "Normalized outcome", disposition.outcome);
        renderFactEditor(doc, dispositionGroup, "Disposition date", disposition.date);
        appendTextElement(
          doc,
          dispositionGroup,
          "p",
          "rap-link-note",
          "Conviction classification: " +
            currentDispositionClassification(disposition).status +
            "; charge link: " +
            (disposition.linkBasis || "none")
        );
        body.appendChild(dispositionGroup);
      });

      renderFactEditor(doc, body, "Reported conviction date", cycle.convictionDate);
      cycle.sentences.forEach(function (sentence, index) {
        var sentenceGroup = doc.createElement("section");
        sentenceGroup.className = "rap-review-group";
        renderFactEditor(
          doc,
          sentenceGroup,
          "Sentence " + (index + 1) + " (" + sentence.type + ")",
          sentence.detail
        );
        if (
          sentence.dispositionId &&
          sentence.detail &&
          sentence.detail.reviewStatus !== "rejected"
        ) {
          var linkLabel = appendTextElement(
            doc,
            sentenceGroup,
            "label",
            "rap-unparsed-decision-label",
            "Link this sentence to the preceding disposition"
          );
          var linkSelect = doc.createElement("select");
          linkSelect.id = "rap-sentence-link-" + sentence.sentenceId;
          linkSelect.setAttribute(
            "data-rap-sentence-link-for",
            sentence.sentenceId
          );
          linkLabel.htmlFor = linkSelect.id;
          [
            { value: "pending", label: "Needs relationship review" },
            { value: "accepted", label: "Confirm disposition link" },
            { value: "rejected", label: "Do not link to disposition" }
          ].forEach(function (choice) {
            var option = doc.createElement("option");
            option.value = choice.value;
            option.textContent = choice.label;
            option.selected = sentence.linkReviewStatus === choice.value;
            linkSelect.appendChild(option);
          });
          sentenceGroup.appendChild(linkSelect);
          appendTextElement(
            doc,
            sentenceGroup,
            "p",
            "rap-link-note",
            "Proposed relationship basis: " + sentence.linkBasis
          );
        }
        body.appendChild(sentenceGroup);
      });
      cycle.supervision.forEach(function (entry, index) {
        renderFactEditor(doc, body, "Supervision " + (index + 1) + " (" + entry.type + ")", entry.detail);
      });

      details.appendChild(body);
      reviewElement.appendChild(details);
    });

    if (rapSheetImport.warnings.length) {
      var warnings = doc.createElement("section");
      warnings.className = "rap-review-section rap-warnings";
      appendTextElement(doc, warnings, "h4", "", "Parser warnings");
      var warningList = doc.createElement("ul");
      rapSheetImport.warnings.forEach(function (warning) {
        appendTextElement(
          doc,
          warningList,
          "li",
          "rap-warning rap-warning-" + warning.severity,
          warning.message + (warning.sourceLine ? " (line " + warning.sourceLine.start + ")" : "")
        );
      });
      warnings.appendChild(warningList);
      reviewElement.appendChild(warnings);
    }

    var reviewableFacts = allFacts(rapSheetImport);
    var canSaveReview =
      reviewableFacts.length > 0 &&
      rapSheetImport.reviewStatus !== "rejected" &&
      rapSheetImport.reviewStatus !== "needs_source_adapter" &&
      rapSheetImport.reviewStatus !== "stale";

    if (rapSheetImport.unparsedSections.length) {
      var unparsed = doc.createElement("section");
      unparsed.className = "rap-review-section rap-unparsed";
      appendTextElement(doc, unparsed, "h4", "", "Unparsed text");
      appendTextElement(
        doc,
        unparsed,
        "p",
        "rap-link-note",
        "These lines were preserved because the generic adapter did not recognize them."
      );
      rapSheetImport.unparsedSections.forEach(function (section) {
        var unparsedBlock = doc.createElement("div");
        unparsedBlock.className = "rap-unparsed-block";
        appendTextElement(
          doc,
          unparsedBlock,
          "pre",
          "rap-source-block",
          section.sourceText
        );
        if (canSaveReview) {
          var decisionLabel = appendTextElement(
            doc,
            unparsedBlock,
            "label",
            "rap-unparsed-decision-label",
            "Review decision"
          );
          var decision = doc.createElement("select");
          decision.id = "rap-unparsed-status-" + section.sectionId;
          decision.setAttribute("data-rap-unparsed-status-for", section.sectionId);
          decisionLabel.htmlFor = decision.id;
          [
            { value: "pending", label: "Needs review" },
            { value: "accepted", label: "Acknowledge as unparsed" },
            { value: "rejected", label: "Exclude from import review" }
          ].forEach(function (choice) {
            var option = doc.createElement("option");
            option.value = choice.value;
            option.textContent = choice.label;
            option.selected = section.reviewStatus === choice.value;
            decision.appendChild(option);
          });
          unparsedBlock.appendChild(decision);
        }
        unparsed.appendChild(unparsedBlock);
      });
      reviewElement.appendChild(unparsed);
    }

    if (canSaveReview) {
      var saveButton = doc.createElement("button");
      saveButton.type = "button";
      saveButton.className = "rap-review-save";
      saveButton.textContent = "Save review decisions";
      saveButton.addEventListener("click", function () {
        onSave(reviewElement);
      });
      reviewElement.appendChild(saveButton);
    } else {
      appendTextElement(
        doc,
        reviewElement,
        "p",
        "rap-review-notice",
        rapSheetImport.reviewStatus === "stale"
          ? "The source text changed after this import was parsed. Reparse before continuing review."
          : "This import cannot be marked reviewed because no supported facts were parsed. Correct or replace the source text and parse again."
      );
    }

    if (
      rapSheetImport.reviewStatus === "reviewed" &&
      typeof onApply === "function"
    ) {
      var applyButton = doc.createElement("button");
      applyButton.type = "button";
      applyButton.className = "rap-review-apply";
      applyButton.textContent = "Apply accepted facts to existing fields";
      applyButton.addEventListener("click", function () {
        onApply();
      });
      reviewElement.appendChild(applyButton);
    }
  }

  function dispatchImportEvent(element, eventName, detail) {
    if (!element || typeof element.dispatchEvent !== "function") {
      return;
    }
    var doc = element.ownerDocument || root.document;
    var event;
    if (typeof root.CustomEvent === "function") {
      event = new root.CustomEvent(eventName, { bubbles: true, detail: detail });
    } else if (doc && typeof doc.createEvent === "function") {
      event = doc.createEvent("CustomEvent");
      event.initCustomEvent(eventName, true, false, detail);
    }
    if (event) {
      element.dispatchEvent(event);
    }
  }

  function attachRapSheetImport(textarea, options) {
    if (!textarea) {
      return null;
    }
    options = options || {};
    var doc = textarea.ownerDocument || root.document;
    var parseButton =
      options.parseButton || doc.getElementById("rapSheetParseButton");
    var discardButton =
      options.discardButton || doc.getElementById("rapSheetDiscardButton");
    var statusElement =
      options.statusElement || doc.getElementById("rapSheetImportStatus");
    var reviewElement =
      options.reviewElement || doc.getElementById("rapSheetReview");
    var importIdElement =
      options.importIdElement || doc.getElementById("rapSheetImportId");
    var currentImport = null;
    var parsedSourceText = null;
    var statusBeforeSourceEdit = null;
    var lastMergeReport = null;

    function setStatus(message, kind) {
      if (!statusElement) {
        return;
      }
      statusElement.textContent = message;
      statusElement.className = "rap-import-status" + (kind ? " rap-import-status-" + kind : "");
      statusElement.hidden = !message;
    }

    function saveReview(container) {
      if (!currentImport) {
        return;
      }
      if (parsedSourceText !== String(textarea.value || "")) {
        currentImport.reviewStatus = "stale";
        currentImport.summary = generateRapSheetSummary(currentImport);
        if (reviewElement) {
          renderRapSheetReview(
            reviewElement,
            currentImport,
            saveReview,
            applyCurrentImport
          );
        }
        setStatus(
          "The source text changed after parsing. Reparse it before saving review decisions.",
          "warning"
        );
        return;
      }
      var facts = allFacts(currentImport);
      if (
        !facts.length ||
        currentImport.reviewStatus === "rejected" ||
        currentImport.reviewStatus === "needs_source_adapter"
      ) {
        setStatus(
          "This import has no supported parsed facts and cannot be marked reviewed.",
          "error"
        );
        return;
      }
      var factMap = {};
      var factStateBefore = {};
      var changedFacts = {};
      facts.forEach(function (fact) {
        factMap[fact.factId] = fact;
        factStateBefore[fact.factId] = {
          reviewStatus: fact.reviewStatus,
          verified: fact.verified,
          value: normalizedValue(
            fact.correctedValue == null ? fact.value : fact.correctedValue
          ),
          normalizedValue:
            fact.normalizedValue == null ? null : fact.normalizedValue
        };
      });
      var unparsedStateBefore = {};
      currentImport.unparsedSections.forEach(function (section) {
        unparsedStateBefore[section.sectionId] = section.reviewStatus;
      });
      var sentenceLinks = reviewableSentenceLinks(currentImport);
      var sentenceLinkStateBefore = {};
      sentenceLinks.forEach(function (sentence) {
        sentenceLinkStateBefore[sentence.sentenceId] = {
          reviewStatus: sentence.linkReviewStatus,
          verified: sentence.linkVerified
        };
      });

      var valueInputs = container.querySelectorAll("[data-rap-value-for]");
      var statusInputs = container.querySelectorAll("[data-rap-status-for]");
      var i;
      for (i = 0; i < valueInputs.length; i += 1) {
        var valueId = valueInputs[i].getAttribute("data-rap-value-for");
        if (factMap[valueId]) {
          var previousValue = effectiveFactValue(factMap[valueId]);
          var reviewedValue = normalizedValue(valueInputs[i].value);
          if (reviewedValue !== previousValue) {
            changedFacts[valueId] = true;
          }
          if (reviewedValue !== normalizedValue(factMap[valueId].value)) {
            factMap[valueId].correctedValue = reviewedValue;
            syncCorrectedDateFact(factMap[valueId], reviewedValue, true);
          } else {
            delete factMap[valueId].correctedValue;
            syncCorrectedDateFact(factMap[valueId], reviewedValue, false);
          }
        }
      }

      for (i = 0; i < statusInputs.length; i += 1) {
        var statusId = statusInputs[i].getAttribute("data-rap-status-for");
        if (factMap[statusId]) {
          factMap[statusId].reviewStatus = statusInputs[i].value;
          factMap[statusId].verified = statusInputs[i].value === "accepted";
        }
      }

      var unparsedMap = {};
      currentImport.unparsedSections.forEach(function (section) {
        unparsedMap[section.sectionId] = section;
      });
      var unparsedInputs = container.querySelectorAll(
        "[data-rap-unparsed-status-for]"
      );
      for (i = 0; i < unparsedInputs.length; i += 1) {
        var sectionId = unparsedInputs[i].getAttribute(
          "data-rap-unparsed-status-for"
        );
        if (unparsedMap[sectionId]) {
          unparsedMap[sectionId].reviewStatus = unparsedInputs[i].value;
        }
      }

      var sentenceLinkMap = {};
      sentenceLinks.forEach(function (sentence) {
        sentenceLinkMap[sentence.sentenceId] = sentence;
      });
      var sentenceLinkInputs = container.querySelectorAll(
        "[data-rap-sentence-link-for]"
      );
      for (i = 0; i < sentenceLinkInputs.length; i += 1) {
        var sentenceId = sentenceLinkInputs[i].getAttribute(
          "data-rap-sentence-link-for"
        );
        if (sentenceLinkMap[sentenceId]) {
          sentenceLinkMap[sentenceId].linkReviewStatus =
            sentenceLinkInputs[i].value;
          sentenceLinkMap[sentenceId].linkVerified =
            sentenceLinkInputs[i].value === "accepted";
        }
      }

      currentImport.cycles.forEach(function (cycle) {
        (cycle.sentences || []).forEach(function (sentence) {
          if (
            sentence.detail &&
            sentence.detail.reviewStatus === "rejected"
          ) {
            sentence.linkReviewStatus = "not_applicable";
            sentence.linkVerified = false;
          }
        });
      });

      currentImport.cycles.forEach(function (cycle) {
        cycle.dispositions.forEach(function (disposition) {
          if (
            changedFacts[disposition.rawDisposition.factId] &&
            effectiveFactValue(disposition.rawDisposition) &&
            disposition.outcome &&
            disposition.outcome.correctedValue == null
          ) {
            var recalculated = classifyDisposition(
              effectiveFactValue(disposition.rawDisposition)
            );
            disposition.outcome.value = recalculated.label;
            disposition.outcome.rawValue = recalculated.label;
            disposition.outcome.basis = recalculated.basis;
            disposition.outcome.confidence =
              recalculated.status === "uncertain" ? 0.65 : 0.97;
            disposition.outcome.reviewStatus = "pending";
            disposition.outcome.verified = false;
            disposition.convictionStatus = recalculated.status;
          }
        });
      });

      var pendingFacts = facts.filter(function (fact) {
        return fact.reviewStatus === "pending";
      }).length;
      var pendingUnparsed = currentImport.unparsedSections.filter(function (section) {
        return section.reviewStatus === "pending";
      }).length;
      var pendingSentenceLinks = sentenceLinks.filter(function (sentence) {
        return sentence.linkReviewStatus === "pending";
      }).length;
      var pending = pendingFacts + pendingUnparsed + pendingSentenceLinks;
      var factChanges = facts.filter(function (fact) {
        var before = factStateBefore[fact.factId];
        var afterValue = normalizedValue(
          fact.correctedValue == null ? fact.value : fact.correctedValue
        );
        var afterNormalized =
          fact.normalizedValue == null ? null : fact.normalizedValue;
        return !!(
          before &&
          (before.reviewStatus !== fact.reviewStatus ||
            before.verified !== fact.verified ||
            before.value !== afterValue ||
            before.normalizedValue !== afterNormalized)
        );
      }).map(function (fact) {
        var before = factStateBefore[fact.factId];
        return {
          factId: fact.factId,
          field: fact.field,
          fromReviewStatus: before.reviewStatus,
          toReviewStatus: fact.reviewStatus,
          fromVerified: before.verified,
          toVerified: fact.verified,
          fromValue: before.value,
          toValue: normalizedValue(
            fact.correctedValue == null ? fact.value : fact.correctedValue
          ),
          fromNormalizedValue: before.normalizedValue,
          toNormalizedValue:
            fact.normalizedValue == null ? null : fact.normalizedValue
        };
      });
      var unparsedSectionChanges = currentImport.unparsedSections.filter(function (section) {
        return unparsedStateBefore[section.sectionId] !== section.reviewStatus;
      }).map(function (section) {
        return {
          sectionId: section.sectionId,
          fromReviewStatus: unparsedStateBefore[section.sectionId],
          toReviewStatus: section.reviewStatus
        };
      });
      var sentenceLinkChanges = sentenceLinks.filter(function (sentence) {
        var before = sentenceLinkStateBefore[sentence.sentenceId];
        return !!(
          before &&
          (before.reviewStatus !== sentence.linkReviewStatus ||
            before.verified !== sentence.linkVerified)
        );
      }).map(function (sentence) {
        var before = sentenceLinkStateBefore[sentence.sentenceId];
        return {
          sentenceId: sentence.sentenceId,
          dispositionId: sentence.dispositionId,
          linkBasis: sentence.linkBasis,
          fromReviewStatus: before.reviewStatus,
          toReviewStatus: sentence.linkReviewStatus,
          fromVerified: before.verified,
          toVerified: sentence.linkVerified
        };
      });
      currentImport.reviewStatus = pending ? "in_review" : "reviewed";
      currentImport.summary = generateRapSheetSummary(currentImport);
      currentImport.auditTrail.push({
        eventId: nextId({ idFactory: options.idFactory || createDefaultId }, "audit"),
        action: "review_saved",
        at: resolveImportedAt({ now: options.now }),
        reviewer: {
          id: options.reviewerId || null,
          displayName: options.reviewerName || null,
          attributionAvailable: !!(options.reviewerId || options.reviewerName)
        },
        factChanges: factChanges,
        unparsedSectionChanges: unparsedSectionChanges,
        sentenceLinkChanges: sentenceLinkChanges,
        acceptedFactCount: facts.filter(function (fact) {
          return fact.reviewStatus === "accepted";
        }).length,
        rejectedFactCount: facts.filter(function (fact) {
          return fact.reviewStatus === "rejected";
        }).length,
        pendingFactCount: pendingFacts,
        acceptedUnparsedSectionCount: currentImport.unparsedSections.filter(function (section) {
          return section.reviewStatus === "accepted";
        }).length,
        rejectedUnparsedSectionCount: currentImport.unparsedSections.filter(function (section) {
          return section.reviewStatus === "rejected";
        }).length,
        pendingUnparsedSectionCount: pendingUnparsed,
        acceptedSentenceLinkCount: sentenceLinks.filter(function (sentence) {
          return sentence.linkReviewStatus === "accepted";
        }).length,
        rejectedSentenceLinkCount: sentenceLinks.filter(function (sentence) {
          return sentence.linkReviewStatus === "rejected";
        }).length,
        pendingSentenceLinkCount: pendingSentenceLinks
      });

      renderRapSheetReview(
        reviewElement,
        currentImport,
        saveReview,
        applyCurrentImport
      );
      setStatus(
        pending
          ? "Review saved locally in memory; " + pending + " item(s) still need review."
          : "Review complete. Accepted facts are ready to apply to the existing lead fields.",
        pending ? "warning" : "success"
      );
      dispatchImportEvent(textarea, "copdoc:rapsheet-reviewed", {
        importId: currentImport.id,
        reviewStatus: currentImport.reviewStatus,
        pendingFactCount: pendingFacts,
        pendingUnparsedSectionCount: pendingUnparsed,
        pendingSentenceLinkCount: pendingSentenceLinks
      });
    }

    function applyCurrentImport() {
      if (!currentImport) {
        setStatus("Parse and review a RAP sheet before applying it.", "error");
        return null;
      }
      if (parsedSourceText !== String(textarea.value || "")) {
        currentImport.reviewStatus = "stale";
        currentImport.summary = generateRapSheetSummary(currentImport);
        if (reviewElement) {
          renderRapSheetReview(
            reviewElement,
            currentImport,
            saveReview,
            applyCurrentImport
          );
        }
        setStatus(
          "The source text changed after parsing. Reparse it before applying facts.",
          "warning"
        );
        return null;
      }
      if (
        reviewElement &&
        reviewControlsHaveUnsavedChanges(reviewElement, currentImport)
      ) {
        setStatus(
          "The review contains unsaved changes. Save the review decisions before applying facts.",
          "warning"
        );
        return null;
      }
      if (currentImport.reviewStatus !== "reviewed") {
        setStatus(
          "Resolve every parsed fact and unparsed section before applying the import.",
          "warning"
        );
        return null;
      }

      var merge = mergeRapSheetImportIntoForm(currentImport, {
        document: doc,
        cardsApi: options.cardsApi,
        createCard: options.createCard,
        parseName: options.parseName
      });
      lastMergeReport = merge.report;
      var appliedCount = lastMergeReport.applied.length;
      var conflictCount = lastMergeReport.conflicts.length;
      var unmappedCount = lastMergeReport.unmapped.length;
      var skippedCount = lastMergeReport.skipped.length;

      currentImport.auditTrail.push({
        eventId: nextId({ idFactory: options.idFactory || createDefaultId }, "audit"),
        action: "accepted_facts_applied_to_lead",
        at: resolveImportedAt({ now: options.now }),
        reviewer: {
          id: options.reviewerId || null,
          displayName: options.reviewerName || null,
          attributionAvailable: !!(options.reviewerId || options.reviewerName)
        },
        appliedTargetCount: appliedCount,
        skippedFactCount: skippedCount,
        conflictingFactCount: conflictCount,
        unmappedFactCount: unmappedCount,
        lossyMappingCount: lastMergeReport.lossyMappings.length,
        cardsApplied: lastMergeReport.cardsApplied,
        criminalFlagSet: lastMergeReport.criminalFlagSet,
        conflicts: lastMergeReport.conflicts,
        unmapped: lastMergeReport.unmapped
      });

      var message =
        "Applied " +
        appliedCount +
        " existing-field value(s); skipped " +
        skippedCount +
        " duplicate(s).";
      if (conflictCount || unmappedCount) {
        message +=
          " Preserved " +
          conflictCount +
          " conflicting value(s); " +
          unmappedCount +
          " accepted fact(s) have no compatible field yet.";
      }
      setStatus(message, conflictCount || unmappedCount ? "warning" : "success");
      dispatchImportEvent(textarea, "copdoc:rapsheet-applied", {
        importId: currentImport.id,
        appliedTargetCount: appliedCount,
        skippedFactCount: skippedCount,
        conflictingFactCount: conflictCount,
        unmappedFactCount: unmappedCount,
        cardsApplied: lastMergeReport.cardsApplied,
        criminalFlagSet: lastMergeReport.criminalFlagSet
      });
      return lastMergeReport;
    }

    function parseCurrentText() {
      try {
        parsedSourceText = String(textarea.value || "");
        statusBeforeSourceEdit = null;
        currentImport = parseRapSheetText(textarea.value, {
          system: options.system,
          jurisdiction: options.jurisdiction,
          idFactory: options.idFactory,
          now: options.now,
          limits: options.limits,
          sourceKind: "pasted-text"
        });
        lastMergeReport = null;
        if (importIdElement) {
          importIdElement.value = currentImport.id;
        }
        if (reviewElement) {
          reviewElement.hidden = false;
          renderRapSheetReview(
            reviewElement,
            currentImport,
            saveReview,
            applyCurrentImport
          );
        }
        if (discardButton) {
          discardButton.hidden = false;
        }
        var factTotal = allFacts(currentImport).length;
        var errorCount = currentImport.warnings.filter(function (warning) {
          return warning.severity === "error";
        }).length;
        setStatus(
          errorCount
            ? "The import was not fully parsed. Review the errors below."
            : "Parsed " +
                factTotal +
                " fact(s) into " +
                currentImport.cycles.length +
                " arrest cycle(s). Review required; no lead fields changed.",
          errorCount ? "error" : "success"
        );
        dispatchImportEvent(textarea, "copdoc:rapsheet-parsed", {
          importId: currentImport.id,
          factCount: factTotal,
          cycleCount: currentImport.cycles.length,
          warningCount: currentImport.warnings.length
        });
      } catch (error) {
        currentImport = null;
        setStatus("The RAP sheet could not be parsed. The original text was left unchanged.", "error");
      }
    }

    function discardCurrentImport() {
      var discardedId = currentImport ? currentImport.id : null;
      currentImport = null;
      parsedSourceText = null;
      statusBeforeSourceEdit = null;
      lastMergeReport = null;
      if (reviewElement) {
        clearElement(reviewElement);
        reviewElement.hidden = true;
      }
      if (discardButton) {
        discardButton.hidden = true;
      }
      if (importIdElement) {
        importIdElement.value = "";
      }
      setStatus("Parsed import discarded; the original RAP-sheet text was retained.", "success");
      dispatchImportEvent(textarea, "copdoc:rapsheet-discarded", {
        importId: discardedId
      });
    }

    if (parseButton) {
      parseButton.addEventListener("click", parseCurrentText);
    }
    if (discardButton) {
      discardButton.addEventListener("click", discardCurrentImport);
    }
    textarea.addEventListener("input", function () {
      if (!currentImport) {
        return;
      }
      if (String(textarea.value || "") !== parsedSourceText) {
        if (currentImport.reviewStatus !== "stale") {
          statusBeforeSourceEdit = currentImport.reviewStatus;
        }
        currentImport.reviewStatus = "stale";
        currentImport.summary = generateRapSheetSummary(currentImport);
        if (reviewElement) {
          renderRapSheetReview(
            reviewElement,
            currentImport,
            saveReview,
            applyCurrentImport
          );
        }
        setStatus(
          "The source text changed after parsing. Reparse before relying on this review.",
          "warning"
        );
      } else if (currentImport.reviewStatus === "stale") {
        currentImport.reviewStatus = statusBeforeSourceEdit || "pending";
        statusBeforeSourceEdit = null;
        currentImport.summary = generateRapSheetSummary(currentImport);
        if (reviewElement) {
          renderRapSheetReview(
            reviewElement,
            currentImport,
            saveReview,
            applyCurrentImport
          );
        }
        setStatus(
          "The source text matches the parsed import again. Review may continue.",
          "success"
        );
      }
    });

    return {
      parse: parseCurrentText,
      apply: applyCurrentImport,
      discard: discardCurrentImport,
      getImport: function () {
        return currentImport;
      },
      getLastMergeReport: function () {
        return lastMergeReport;
      }
    };
  }

  var api = {
    version: PARSER_VERSION,
    limits: DEFAULT_LIMITS,
    detectRapSheetFormat: detectRapSheetFormat,
    parseRapSheetText: parseRapSheetText,
    parseRapSheetPages: parseRapSheetPages,
    classifyDisposition: classifyDisposition,
    generateRapSheetSummary: generateRapSheetSummary,
    snapshotRapSheetMergeTargets: snapshotRapSheetMergeTargets,
    buildRapSheetMergePlan: buildRapSheetMergePlan,
    applyRapSheetMergePlan: applyRapSheetMergePlan,
    mergeRapSheetImportIntoForm: mergeRapSheetImportIntoForm,
    attachRapSheetImport: attachRapSheetImport,
    renderRapSheetReview: renderRapSheetReview
  };

  root.COPDoc = root.COPDoc || {};
  root.COPDoc.rapSheet = api;
  root.detectRapSheetFormat = detectRapSheetFormat;
  root.parseRapSheetText = parseRapSheetText;
  root.parseRapSheetPages = parseRapSheetPages;
  root.generateRapSheetSummary = generateRapSheetSummary;
  root.mergeRapSheetImportIntoForm = mergeRapSheetImportIntoForm;
  root.attachRapSheetImport = attachRapSheetImport;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  if (root.document && typeof root.document.getElementById === "function") {
    var rapSheetTextarea = root.document.getElementById("rapSheet");
    if (rapSheetTextarea) {
      root.rapSheetImportController = attachRapSheetImport(rapSheetTextarea);
    }
  }
})(typeof window !== "undefined" ? window : globalThis);
