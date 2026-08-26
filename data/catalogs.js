/**
 * COPDoc catalogs hub.
 * Loads structured data libraries (countries, vehicles, places, biographics, ops, LE, INA)
 * and exposes label arrays for SearchableSelect via COPDoc.catalogs.
 *
 * Full objects remain on window (COUNTRIES, VEHICLE_MAKES, etc.) for code/value lookups.
 */
(function (global) {
  "use strict";
  var COPDoc = (global.COPDoc = global.COPDoc || {});
  var catalogs = (COPDoc.catalogs = COPDoc.catalogs || {});

  function labelsFrom(list, key) {
    key = key || "label";
    if (!Array.isArray(list)) return [];
    return list
      .filter(function (x) {
        return x && (x.active !== false);
      })
      .map(function (x) {
        return typeof x === "string" ? x : x[key];
      })
      .filter(Boolean);
  }

  function register() {
    // --- Countries / nationalities ---
    if (global.COUNTRIES) {
      catalogs.countries = labelsFrom(global.COUNTRIES);
      catalogs.countriesFull = global.COUNTRIES;
    }
    if (global.NATIONALITIES) {
      catalogs.nationalities = labelsFrom(global.NATIONALITIES);
      catalogs.nationalitiesFull = global.NATIONALITIES;
    }
    if (typeof global.countryLabels === "function") {
      catalogs.countries = global.countryLabels();
    }
    if (typeof global.nationalityLabels === "function") {
      catalogs.nationalities = global.nationalityLabels();
    }

    // --- US places (states / counties / national cities library) ---
    if (global.US_STATES) {
      catalogs.usStatesFull = global.US_STATES.filter(function (s) {
        return s && s.active !== false;
      });
      // Prefer full objects for location UI (value = code, show label)
      catalogs.usStates = catalogs.usStatesFull.slice();
      catalogs.usStateLabels = labelsFrom(global.US_STATES);
      catalogs.usStateCodes = labelsFrom(global.US_STATES, "code");
    }
    if (global.US_COUNTIES) {
      catalogs.usCountiesFull = global.US_COUNTIES;
    }

    catalogs.normalizeStateCode = function normalizeStateCode(value) {
      if (!value || !String(value).trim()) return null;
      var v = String(value).trim();
      var list = catalogs.usStatesFull || global.US_STATES || [];
      var upper = v.toUpperCase();
      for (var i = 0; i < list.length; i++) {
        var s = list[i];
        if (!s) continue;
        if (s.code === upper || s.code === v) return s.code;
        if (s.label && s.label.toLowerCase() === v.toLowerCase()) return s.code;
      }
      if (/^[A-Za-z]{2}$/.test(v)) return upper;
      return upper;
    };

    catalogs.countiesForState = function countiesForState(stateCode) {
      var code = catalogs.normalizeStateCode(stateCode);
      if (!code) return [];
      if (typeof global.countiesForState === "function") {
        var labels = global.countiesForState(code) || [];
        return labels.map(function (label) {
          return { code: label, label: label, state_code: code };
        });
      }
      var all = catalogs.usCountiesFull || global.US_COUNTIES || [];
      return all
        .filter(function (c) {
          return c && c.state_code === code && c.active !== false;
        })
        .map(function (c) {
          return { code: c.label, label: c.label, state_code: code };
        });
    };

    // Full national city library (us-cities.js) when present
    if (global.US_CITIES_BY_STATE) {
      catalogs.usCitiesByState = global.US_CITIES_BY_STATE;
    }
    if (typeof global.capitalForState === "function") {
      catalogs.capitalForState = global.capitalForState;
    }
    if (global.US_CAPITALS) {
      catalogs.usCapitals = global.US_CAPITALS;
    }

    /**
     * Cities for a state — prefers full US cities library (~25k).
     * Falls back to geo libraries (ICE ERO / detention / field offices).
     */
    catalogs.citiesForState = function citiesForState(stateCode) {
      var code = catalogs.normalizeStateCode(stateCode);
      if (!code) return [];

      // Primary: national city census keyed by state code
      if (typeof global.citiesForState === "function") {
        var national = global.citiesForState(code);
        if (Array.isArray(national) && national.length) {
          return national.slice();
        }
      }
      if (global.US_CITIES_BY_STATE && Array.isArray(global.US_CITIES_BY_STATE[code])) {
        return global.US_CITIES_BY_STATE[code].slice();
      }

      // Fallback: cities mentioned in geo / LE libraries
      var seen = {};
      var out = [];
      function addCity(city, st) {
        if (!city) return;
        var stNorm = catalogs.normalizeStateCode(st || code);
        if (stNorm !== code) return;
        var key = String(city).trim().toLowerCase();
        if (!key || seen[key]) return;
        seen[key] = true;
        out.push(String(city).trim());
      }
      [
        "ICE_ERO_OFFICES_TX",
        "ICE_DETENTION_TX",
        "DETENTION_FACILITIES",
        "TEXAS_JAILS",
        "FIELD_OFFICES",
      ].forEach(function (name) {
        var arr = global[name];
        if (!Array.isArray(arr)) return;
        arr.forEach(function (row) {
          if (!row) return;
          addCity(row.city, row.state || row.state_code || row.stateCode);
        });
      });
      out.sort(function (a, b) {
        return a.localeCompare(b);
      });
      return out;
    };

    if (global.FIELD_OFFICES) {
      catalogs.fieldOffices = labelsFrom(global.FIELD_OFFICES);
      catalogs.fieldOfficesFull = global.FIELD_OFFICES;
    }
    if (global.ICE_ERO_OFFICES_TX) {
      catalogs.iceEroOfficesTx = global.ICE_ERO_OFFICES_TX;
    }
    if (global.ICE_DETENTION_TX) {
      catalogs.iceDetentionTx = global.ICE_DETENTION_TX;
    }

    // Common location physical types (starter)
    catalogs.physicalTypes = catalogs.physicalTypes || [
      { code: "RESIDENCE", label: "Residence" },
      { code: "APARTMENT_COMPLEX", label: "Apartment complex" },
      { code: "COMMERCIAL", label: "Commercial" },
      { code: "INDUSTRIAL", label: "Industrial" },
      { code: "HOTEL_MOTEL", label: "Hotel / motel" },
      { code: "GOVERNMENT", label: "Government" },
      { code: "DETENTION", label: "Detention facility" },
      { code: "JAIL", label: "Jail" },
      { code: "COURT", label: "Court" },
      { code: "FIELD_OFFICE", label: "Field office" },
      { code: "STAGING", label: "Staging area" },
      { code: "ROADSIDE", label: "Roadside / highway" },
      { code: "OTHER", label: "Other" },
    ];

    // --- Vehicles (code+label for forms; models keyed by make label in library) ---
    if (global.VEHICLE_MAKES) {
      catalogs.vehicleMakesFull = global.VEHICLE_MAKES;
      // Prefer {code,label} for vehicle UI datalists (value=code)
      catalogs.vehicleMakes = global.VEHICLE_MAKES.filter(function (m) {
        return m && m.active !== false;
      });
      catalogs.vehicleMakeLabels =
        typeof global.makeLabels === "function"
          ? global.makeLabels()
          : labelsFrom(global.VEHICLE_MAKES);
    }
    if (global.MODELS_BY_MAKE) {
      catalogs.modelsByMake = global.MODELS_BY_MAKE;
      catalogs.vehiclesByMake = global.MODELS_BY_MAKE;
    }
    if (typeof global.modelsForMake === "function") {
      catalogs.modelsForMake = global.modelsForMake;
    }
    if (typeof global.resolveVehicleMake === "function") {
      catalogs.resolveVehicleMake = global.resolveVehicleMake;
    }
    if (typeof global.makeCodeFromInput === "function") {
      catalogs.makeCodeFromInput = global.makeCodeFromInput;
    }
    if (typeof global.inferBodyStyleCodes === "function") {
      catalogs.inferBodyStyleCodes = global.inferBodyStyleCodes;
    }
    if (typeof global.suggestBodyStyle === "function") {
      catalogs.suggestBodyStyle = global.suggestBodyStyle;
    }
    if (typeof global.bodyStylesForMakeModel === "function") {
      catalogs.bodyStylesForMakeModel = global.bodyStylesForMakeModel;
    }
    if (global.VEHICLE_COLORS) {
      catalogs.vehicleColorsFull = global.VEHICLE_COLORS;
      catalogs.vehicleColors = global.VEHICLE_COLORS.filter(function (c) {
        return c && c.active !== false;
      });
      catalogs.vehicleColorLabels =
        typeof global.colorLabels === "function"
          ? global.colorLabels()
          : labelsFrom(global.VEHICLE_COLORS);
    }
    if (global.VEHICLE_BODY_STYLES) {
      catalogs.vehicleBodyStylesFull = global.VEHICLE_BODY_STYLES;
      catalogs.vehicleBodyStyles = global.VEHICLE_BODY_STYLES.slice();
    }
    if (global.VEHICLE_YEARS) {
      catalogs.vehicleYears = global.VEHICLE_YEARS.slice();
    }

    // --- Biographics ---
    if (global.SEX_OPTIONS) {
      // Active-only for pickers (Unknown retired for Book-in/Person policy)
      var sexActive = global.SEX_OPTIONS.filter(function (x) {
        return !x || x.active !== false;
      });
      catalogs.sexCodes = labelsFrom(sexActive, "code");
      catalogs.sexLabels = labelsFrom(sexActive);
      catalogs.sexOptionsFull = sexActive;
      catalogs.sexOptionsAll = global.SEX_OPTIONS;
    }
    if (global.EYE_COLORS) {
      catalogs.eyeColors = labelsFrom(global.EYE_COLORS);
      catalogs.eyeColorsFull = global.EYE_COLORS;
    }
    if (global.HAIR_COLORS) {
      catalogs.hairColors = labelsFrom(global.HAIR_COLORS);
      catalogs.hairColorsFull = global.HAIR_COLORS;
    }
    if (global.RACE_CODES) {
      catalogs.raceCodes = labelsFrom(global.RACE_CODES);
      catalogs.raceCodesFull = global.RACE_CODES;
    }
    if (global.LANGUAGES) {
      catalogs.languages = labelsFrom(global.LANGUAGES);
      catalogs.languagesFull = global.LANGUAGES;
    }

    // --- Field offices / ops ---
    if (global.FIELD_OFFICES) {
      catalogs.fieldOffices = labelsFrom(global.FIELD_OFFICES);
      catalogs.fieldOfficesFull = global.FIELD_OFFICES;
    }
    if (global.ENCOUNTER_TYPES_UI) {
      catalogs.encounterTypes = labelsFrom(global.ENCOUNTER_TYPES_UI);
      catalogs.encounterTypesFull = global.ENCOUNTER_TYPES_UI;
    }
    if (global.IMMIGRATION_DISPOSITIONS) {
      catalogs.immigrationDispositions = labelsFrom(global.IMMIGRATION_DISPOSITIONS);
      catalogs.immigrationDispositionsFull = global.IMMIGRATION_DISPOSITIONS;
    }
    if (global.LEAD_SOURCES) {
      catalogs.leadSources = labelsFrom(global.LEAD_SOURCES);
      catalogs.leadSourcesFull = global.LEAD_SOURCES;
    }

    // --- LE agencies ---
    if (global.FEDERAL_LE_AGENCIES) {
      catalogs.federalLeAgencies = typeof global.federalAgencyLabels === "function"
        ? global.federalAgencyLabels()
        : labelsFrom(global.FEDERAL_LE_AGENCIES);
      catalogs.federalLeAgenciesFull = global.FEDERAL_LE_AGENCIES;
    }
    if (global.LAW_ENFORCEMENT_AGENCIES) {
      catalogs.lawEnforcementAgenciesFull = global.LAW_ENFORCEMENT_AGENCIES;
      catalogs.lawEnforcementAgencies = labelsFrom(global.LAW_ENFORCEMENT_AGENCIES);
    } else if (catalogs.federalLeAgencies) {
      catalogs.lawEnforcementAgencies = catalogs.federalLeAgencies;
    }
    if (global.TEXAS_SHERIFFS) {
      catalogs.texasSheriffs = global.TEXAS_SHERIFFS;
    }
    if (global.TEXAS_MUNICIPAL_PDS) {
      catalogs.texasMunicipalPds = global.TEXAS_MUNICIPAL_PDS;
    }

    // --- Identity document types (civil DL / state ID card) ---
    if (global.IDENTITY_DOCUMENT_TYPES) {
      catalogs.identityDocumentTypes = global.IDENTITY_DOCUMENT_TYPES;
      catalogs.identityDocumentTypeLabels =
        typeof global.identityDocumentTypeLabels === "function"
          ? global.identityDocumentTypeLabels()
          : labelsFrom(global.IDENTITY_DOCUMENT_TYPES);
    }

    // --- Vehicle person-link reasons (known operator) ---
    if (global.VEHICLE_ASSOCIATION_REASONS) {
      catalogs.vehicleAssociationReasons = global.VEHICLE_ASSOCIATION_REASONS;
      catalogs.vehicleAssociationReasonLabels =
        typeof global.vehicleAssociationReasonLabels === "function"
          ? global.vehicleAssociationReasonLabels()
          : labelsFrom(global.VEHICLE_ASSOCIATION_REASONS);
    }

    // --- INA / status ---
    if (global.IMMIGRATION_STATUS) {
      catalogs.immigrationStatus = typeof global.immigrationStatusLabels === "function"
        ? global.immigrationStatusLabels()
        : labelsFrom(global.IMMIGRATION_STATUS);
      catalogs.immigrationStatusFull = global.IMMIGRATION_STATUS;
    }
    if (global.EARM_DISPOSITIONS) {
      catalogs.earmDispositions = typeof global.earmDispositionLabels === "function"
        ? global.earmDispositionLabels()
        : labelsFrom(global.EARM_DISPOSITIONS);
      catalogs.earmDispositionsFull = global.EARM_DISPOSITIONS;
    }

    catalogs.yesNo = catalogs.yesNo || ["Yes", "No"];
    catalogs.fugopsTeams = catalogs.fugopsTeams || ["DAL-1", "DAL-2", "DAL-3", "DAL-4"];
    catalogs.encounterOutcomes = catalogs.encounterOutcomes || [];
    catalogs.locationRoles = catalogs.locationRoles || [];
  }

  register();
  COPDoc.registerCatalogs = register;

  if (catalogs.vehicleMakes) global.VEHICLE_MAKES_LABELS = catalogs.vehicleMakes;
  if (catalogs.countries) global.COUNTRIES_LABELS = catalogs.countries;
  if (catalogs.modelsByMake) global.VEHICLES = catalogs.modelsByMake;
  if (catalogs.lawEnforcementAgencies) {
    global.LAW_ENFORCEMENT_AGENCIES = catalogs.lawEnforcementAgencies;
  }
  if (catalogs.immigrationDispositions) {
    global.IMMIGRATION_DISPOSITION_OPTIONS = catalogs.immigrationDispositions;
  }
})(typeof window !== "undefined" ? window : globalThis);
