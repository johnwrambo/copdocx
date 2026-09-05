/**
 * Versioned overlay for Narrative Master wording and encounter profiles.
 * Master JS files stay the source of v1. User versions live in localStorage.
 */
(function (global) {
  "use strict";

  var root = (global.COPDoc = global.COPDoc || {});
  var narratives = (root.narratives = root.narratives || {});
  var SCHEMA = "copdocx.narrative-library.v1";
  var STORAGE_ID = "narrativeLibrary";

  function storageKey() {
    var config = root.config;
    if (config && typeof config.storageKey === "function") {
      return config.storageKey(STORAGE_ID) || SCHEMA;
    }
    return SCHEMA;
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function slug(value) {
    var text = String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
    return text || "option";
  }

  function lineageKey(fieldId, lineageId) {
    return String(fieldId || "") + "::" + String(lineageId || "");
  }

  function emptyState() {
    return {
      schema: SCHEMA,
      updatedAt: "",
      originals: {},
      versions: [],
      current: {},
      customFields: [],
      customSections: [],
      profiles: []
    };
  }

  function storagePort() {
    return root.repositories && root.repositories.storage;
  }

  function readBytes() {
    var port = storagePort();
    if (port && typeof port.read === "function") {
      return port.read("localStorage", storageKey());
    }
    return global.localStorage ? global.localStorage.getItem(storageKey()) : null;
  }

  function writeBytes(raw) {
    var port = storagePort();
    if (port && typeof port.write === "function") {
      port.write("localStorage", storageKey(), raw);
      return;
    }
    if (global.localStorage) {
      global.localStorage.setItem(storageKey(), raw);
    }
  }

  function readState() {
    var fallback = emptyState();
    try {
      var raw = readBytes();
      if (!raw) {
        return fallback;
      }
      var parsed = JSON.parse(raw);
      if (!parsed || parsed.schema !== SCHEMA) {
        return fallback;
      }
      parsed.originals = parsed.originals || {};
      parsed.versions = Array.isArray(parsed.versions) ? parsed.versions : [];
      parsed.current = parsed.current || {};
      parsed.customFields = Array.isArray(parsed.customFields) ? parsed.customFields : [];
      parsed.customSections = Array.isArray(parsed.customSections) ? parsed.customSections : [];
      parsed.profiles = Array.isArray(parsed.profiles) ? parsed.profiles : [];
      return parsed;
    } catch (error) {
      return fallback;
    }
  }

  function writeState(state) {
    state.updatedAt = nowIso();
    writeBytes(JSON.stringify(state));
    return state;
  }

  function masterSections() {
    return (narratives.MASTER_NARRATIVE_SECTIONS || []).map(function (section) {
      return clone(section);
    });
  }

  function findSection(sections, sectionId) {
    return (sections || []).find(function (section) {
      return section && section.id === sectionId;
    }) || null;
  }

  function findField(section, fieldId) {
    if (!section) {
      return null;
    }
    return (section.fields || []).find(function (field) {
      return field && field.id === fieldId;
    }) || null;
  }

  function findOption(field, optionId) {
    if (!field) {
      return null;
    }
    return (field.options || []).find(function (option) {
      return option && option.id === optionId;
    }) || null;
  }

  function composedSections(state) {
    var sections = masterSections();
    (state.customSections || []).forEach(function (section) {
      if (section && section.id && !findSection(sections, section.id)) {
        sections.push(clone(section));
      }
    });
    (state.customFields || []).forEach(function (row) {
      var section = findSection(sections, row.sectionId);
      if (!section || findField(section, row.field.id)) {
        return;
      }
      section.fields = (section.fields || []).concat([clone(row.field)]);
    });
    return sections;
  }

  function captureOriginal(state, fieldId, option) {
    if (!option || !option.id) {
      return;
    }
    var key = lineageKey(fieldId, option.id);
    if (!state.originals[key]) {
      state.originals[key] = {
        id: option.id,
        label: option.label || option.id,
        text: option.text || "",
        valueText: option.valueText || "",
        incidentReason: option.incidentReason || ""
      };
    }
  }

  function versionsFor(state, fieldId, lineageId) {
    return (state.versions || []).filter(function (row) {
      return row.fieldId === fieldId && row.lineageId === lineageId;
    }).sort(function (a, b) {
      return (a.version || 0) - (b.version || 0);
    });
  }

  function nextVersion(state, fieldId, lineageId) {
    var max = 1;
    versionsFor(state, fieldId, lineageId).forEach(function (row) {
      if (Number(row.version) > max) {
        max = Number(row.version);
      }
    });
    return max + 1;
  }

  function currentId(state, fieldId, lineageId) {
    return state.current[lineageKey(fieldId, lineageId)] || lineageId;
  }

  function normalizeLabel(label) {
    return String(label || "").replace(/\s+/g, " ").trim().toLowerCase();
  }

  function assertUniqueOptionLabel(sectionId, fieldId, label, exceptLineageId) {
    var needle = normalizeLabel(label);
    if (!needle) {
      throw new Error("Option label is required.");
    }
    var clash = listLineages(sectionId, fieldId).some(function (lineage) {
      if (exceptLineageId && lineage.lineageId === exceptLineageId) {
        return false;
      }
      var currentLabel = lineage.current && lineage.current.label;
      return normalizeLabel(currentLabel) === needle;
    });
    if (clash) {
      throw new Error("An option with that label already exists in this field.");
    }
  }

  function listLineages(sectionId, fieldId) {
    var state = readState();
    var section = findSection(composedSections(state), sectionId);
    var field = findField(section, fieldId);
    if (!field) {
      return [];
    }
    var seen = {};
    var lineages = [];
    (field.options || []).forEach(function (option) {
      if (!option || option.id === "" || seen[option.id]) {
        return;
      }
      if (String(option.id).indexOf("__v") !== -1) {
        return;
      }
      seen[option.id] = true;
      captureOriginal(state, fieldId, option);
      var original = state.originals[lineageKey(fieldId, option.id)] || option;
      var versions = [
        {
          optionId: option.id,
          version: 1,
          source: "master",
          label: original.label,
          text: original.text || "",
          valueText: original.valueText || "",
          createdAt: ""
        }
      ].concat(versionsFor(state, fieldId, option.id));
      var current = currentId(state, fieldId, option.id);
      var active = versions.filter(function (row) {
        return row.optionId === current;
      })[0] || versions[versions.length - 1];
      lineages.push({
        lineageId: option.id,
        fieldId: fieldId,
        sectionId: sectionId,
        currentId: current,
        current: active,
        versions: versions
      });
    });
    versionsFor(state, fieldId, "").concat(
      (state.versions || []).filter(function (row) {
        return row.fieldId === fieldId && !seen[row.lineageId];
      })
    );
    (state.versions || []).forEach(function (row) {
      if (row.fieldId !== fieldId || seen[row.lineageId]) {
        return;
      }
      seen[row.lineageId] = true;
      var versions = versionsFor(state, fieldId, row.lineageId);
      var current = currentId(state, fieldId, row.lineageId);
      lineages.push({
        lineageId: row.lineageId,
        fieldId: fieldId,
        sectionId: sectionId,
        currentId: current,
        current: versions.filter(function (item) {
          return item.optionId === current;
        })[0] || versions[versions.length - 1],
        versions: versions
      });
    });
    return lineages;
  }

  function addVersion(input) {
    var state = readState();
    var sectionId = input.sectionId;
    var fieldId = input.fieldId;
    var lineageId = input.lineageId || slug(input.label);
    var section = findSection(composedSections(state), sectionId);
    var field = findField(section, fieldId);
    if (!field) {
      throw new Error("Field not found.");
    }
    var label = String(input.label || "").trim();
    assertUniqueOptionLabel(sectionId, fieldId, label, lineageId);
    var masterOption = findOption(field, lineageId);
    if (masterOption) {
      captureOriginal(state, fieldId, masterOption);
    }
    var version = nextVersion(state, fieldId, lineageId);
    if (version === 1 && !masterOption) {
      version = 1;
    }
    var optionId = version === 1 && !masterOption ? lineageId : lineageId + "__v" + version;
    if (version === 1 && masterOption) {
      version = 2;
      optionId = lineageId + "__v2";
    }
    var row = {
      optionId: optionId,
      lineageId: lineageId,
      fieldId: fieldId,
      sectionId: sectionId,
      version: version,
      source: "user",
      label: label,
      text: String(input.text || ""),
      valueText: String(input.valueText || ""),
      incidentReason: String(input.incidentReason || ""),
      basedOn: input.basedOn || currentId(state, fieldId, lineageId),
      createdAt: nowIso()
    };
    state.versions.push(row);
    state.current[lineageKey(fieldId, lineageId)] = optionId;
    writeState(state);
    applyToMaster();
    return row;
  }

  function setCurrent(fieldId, lineageId, optionId) {
    var state = readState();
    var key = lineageKey(fieldId, lineageId);
    if (optionId === lineageId || !optionId) {
      delete state.current[key];
    } else {
      state.current[key] = optionId;
    }
    writeState(state);
    applyToMaster();
    return currentId(readState(), fieldId, lineageId);
  }

  function addOption(sectionId, fieldId, input) {
    var label = String(input.label || "").trim();
    assertUniqueOptionLabel(sectionId, fieldId, label, "");
    var lineageId = slug(input.lineageId || label);
    var base = lineageId;
    var serial = 2;
    while (
      listLineages(sectionId, fieldId).some(function (row) {
        return row.lineageId === lineageId;
      })
    ) {
      lineageId = base + "_" + serial;
      serial += 1;
    }
    return addVersion({
      sectionId: sectionId,
      fieldId: fieldId,
      lineageId: lineageId,
      label: label,
      text: input.text,
      valueText: input.valueText,
      incidentReason: input.incidentReason
    });
  }

  function addField(sectionId, input) {
    var state = readState();
    var fieldId = slug(input.id || input.label);
    var sections = composedSections(state);
    var section = findSection(sections, sectionId);
    if (!section) {
      throw new Error("Section not found.");
    }
    if (findField(section, fieldId)) {
      throw new Error("A field with that id already exists.");
    }
    var field = {
      id: fieldId,
      label: String(input.label || fieldId),
      options: [
        { id: "", label: "Not included", text: "" }
      ]
    };
    state.customFields.push({ sectionId: sectionId, field: field });
    writeState(state);
    applyToMaster();
    return field;
  }

  function addSection(input) {
    var state = readState();
    var sectionId = slug(input.id || input.title);
    if (findSection(composedSections(state), sectionId)) {
      throw new Error("A section with that id already exists.");
    }
    var section = {
      id: sectionId,
      title: String(input.title || sectionId),
      description: String(input.description || ""),
      fields: []
    };
    state.customSections.push(section);
    writeState(state);
    applyToMaster();
    return section;
  }

  function saveProfile(input) {
    var state = readState();
    var eventType = String(input.eventType || input.id || "").trim();
    if (!eventType) {
      throw new Error("Event type is required.");
    }
    var profile = {
      id: eventType,
      eventType: eventType,
      label: String(input.label || eventType),
      selections: input.selections && typeof input.selections === "object"
        ? input.selections
        : {},
      updatedAt: nowIso()
    };
    state.profiles = (state.profiles || []).filter(function (row) {
      return row.eventType !== eventType;
    });
    state.profiles.push(profile);
    writeState(state);
    return profile;
  }

  function profileForEventType(eventType) {
    var state = readState();
    return (state.profiles || []).find(function (row) {
      return row.eventType === eventType;
    }) || null;
  }

  function optionById(field, optionId) {
    var lineages = listLineages("", field.id);
    var match = null;
    lineages.forEach(function (lineage) {
      lineage.versions.forEach(function (row) {
        if (row.optionId === optionId) {
          match = row;
        }
      });
    });
    return match || findOption(field, optionId);
  }

  function preview(selections) {
    var state = readState();
    var sections = composedSections(state);
    var paragraphs = [];
    sections.forEach(function (section) {
      (section.fields || []).forEach(function (field) {
        var selected = selections && selections[field.id];
        if (!selected) {
          return;
        }
        var lineages = listLineages(section.id, field.id);
        var text = "";
        lineages.forEach(function (lineage) {
          if (lineage.lineageId === selected || lineage.currentId === selected) {
            var current = lineage.current || {};
            if (lineage.lineageId === selected) {
              text = current.text || "";
            }
          }
          lineage.versions.forEach(function (row) {
            if (row.optionId === selected) {
              text = row.text || "";
            }
          });
        });
        if (!text) {
          var option = findOption(field, selected);
          text = (option && option.text) || "";
        }
        if (text) {
          paragraphs.push(text);
        }
      });
    });
    return paragraphs.join(" ");
  }

  function placeholdersIn(text) {
    var found = [];
    String(text || "").replace(/\[([^\]\n]+)\]/g, function (_, inner) {
      var label = String(inner).split("::")[0].trim().toUpperCase();
      if (label && found.indexOf(label) === -1) {
        found.push(label);
      }
      return _;
    });
    return found;
  }

  var VARIABLE_HELP = [
    { token: "[SUBJECT]", meaning: "Primary subject name (the person this I-213 is about)." },
    { token: "[TARGET]", meaning: "Same as subject when they are the Target. Use for collateral origin language." },
    { token: "[TARGET::t1]", meaning: "A second Target slot if two names must stay independent." },
    { token: "[OTHER SUBJECT]", meaning: "Another encountered person, not the primary." },
    { token: "[VEHICLE]", meaning: "Encountered vehicle (year/make/model)." },
    { token: "[PLATE]", meaning: "Plate on the encountered vehicle." },
    { token: "[ADDRESS]", meaning: "Target address / residence." },
    { token: "[LOCATION]", meaning: "Contact or scene location." },
    { token: "[TIME]", meaning: "Event time. The engine prefixes “At approximately … hours”." },
    { token: "[DATE]", meaning: "Encounter date." },
    { token: "[AGENCY]", meaning: "Outside agency name." },
    { token: "[OFFICER]", meaning: "Named officer." },
    { token: "[FIELD OFFICE]", meaning: "ICE field office." },
    { token: "[COMMAND]", meaning: "The verbal command given (free text)." }
  ];

  function applyToMaster() {
    var sections = narratives.MASTER_NARRATIVE_SECTIONS;
    if (!sections || !sections.length) {
      return sections;
    }
    var state = readState();
    state.customSections.forEach(function (section) {
      if (section && section.id && !findSection(sections, section.id)) {
        sections.push(clone(section));
      }
    });
    state.customFields.forEach(function (row) {
      var section = findSection(sections, row.sectionId);
      if (!section || !row.field || findField(section, row.field.id)) {
        return;
      }
      section.fields = (section.fields || []).concat([clone(row.field)]);
    });
    sections.forEach(function (section) {
      (section.fields || []).forEach(function (field) {
        (field.options || []).forEach(function (option) {
          if (option && option.id) {
            captureOriginal(state, field.id, option);
          }
        });
        var lineages = {};
        (field.options || []).forEach(function (option) {
          if (option && option.id && String(option.id).indexOf("__v") === -1) {
            lineages[option.id] = true;
          }
        });
        Object.keys(lineages).forEach(function (lineageId) {
          var original = state.originals[lineageKey(field.id, lineageId)];
          var current = currentId(state, field.id, lineageId);
          var masterOption = findOption(field, lineageId);
          var currentRow = versionsFor(state, field.id, lineageId).filter(function (row) {
            return row.optionId === current;
          })[0];
          if (masterOption && current === lineageId && original) {
            masterOption.label = original.label;
            masterOption.text = original.text;
            masterOption.valueText = original.valueText;
            masterOption.incidentReason = original.incidentReason;
          } else if (masterOption && currentRow) {
            masterOption.label = currentRow.label;
            masterOption.text = currentRow.text;
            if (currentRow.valueText) {
              masterOption.valueText = currentRow.valueText;
            }
            if (currentRow.incidentReason) {
              masterOption.incidentReason = currentRow.incidentReason;
            }
          }
        });
        (state.versions || []).forEach(function (row) {
          if (row.fieldId !== field.id || findOption(field, row.lineageId)) {
            return;
          }
          if (row.optionId !== currentId(state, field.id, row.lineageId) && row.version !== 1) {
            return;
          }
          var currentRow = versionsFor(state, field.id, row.lineageId).filter(function (item) {
            return item.optionId === currentId(state, field.id, row.lineageId);
          })[0] || row;
          field.options.push({
            id: row.lineageId,
            label: currentRow.label,
            text: currentRow.text,
            valueText: currentRow.valueText,
            incidentReason: currentRow.incidentReason
          });
        });
      });
    });
    writeState(state);
    return sections;
  }

  var api = {
    SCHEMA: SCHEMA,
    load: readState,
    save: writeState,
    sections: function () {
      return composedSections(readState());
    },
    listLineages: listLineages,
    addVersion: addVersion,
    assertUniqueOptionLabel: assertUniqueOptionLabel,
    addOption: addOption,
    addField: addField,
    addSection: addSection,
    setCurrent: setCurrent,
    saveProfile: saveProfile,
    profileForEventType: profileForEventType,
    profiles: function () {
      return readState().profiles.slice();
    },
    preview: preview,
    placeholdersIn: placeholdersIn,
    variables: VARIABLE_HELP,
    applyToMaster: applyToMaster,
    exportJson: function () {
      return JSON.stringify(readState(), null, 2);
    }
  };

  narratives.library = api;
  narratives.profileSelectionsForEventType = function (eventType) {
    var profile = profileForEventType(eventType);
    return profile && profile.selections ? clone(profile.selections) : {};
  };
  if (narratives.MASTER_NARRATIVE_SECTIONS) {
    applyToMaster();
  }
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
