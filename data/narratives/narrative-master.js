/**
 * Narrative Master — assembly
 *
 * Runs section builders in order and exposes:
 *   COPDoc.narratives.MASTER_NARRATIVE_SECTIONS
 *   COPDoc.narratives.NOT_INCLUDED
 *   COPDoc.narratives.CORROBORATION_OPTIONS
 *   COPDoc.narratives.SYSTEM_SECTION_DEFINITIONS
 *
 * Engine reads these at boot (do not edit engine for wording changes).
 */
(function (global) {
  "use strict";
  var root = (global.COPDoc = global.COPDoc || {});
  var N = (root.narratives = root.narratives || {});

  if (!N.NOT_INCLUDED) {
    throw new Error("narrative-shared-options.js must load before narrative-master.js");
  }
  if (!N._sectionBuilders || !N._sectionBuilders.length) {
    throw new Error("Section libraries must load before narrative-master.js");
  }

  var sections = [];
  for (var i = 0; i < N._sectionBuilders.length; i++) {
    sections.push(N._sectionBuilders[i](N));
  }

  var requiredSectionIds = [
    "origin", "authority", "context", "observation", "contact",
    "conduct", "confirmation", "custody", "items", "final_disposition"
  ];
  var actualSectionIds = sections.map(function (section) { return section && section.id; });
  var missingSectionIds = requiredSectionIds.filter(function (id) {
    return actualSectionIds.indexOf(id) < 0;
  });
  if (
    missingSectionIds.length ||
    sections.length !== requiredSectionIds.length ||
    actualSectionIds.join("|") !== requiredSectionIds.join("|")
  ) {
    throw new Error(
      "Narrative Master is incomplete. Missing: " +
      (missingSectionIds.length ? missingSectionIds.join(", ") : "none") +
      "; loaded " + sections.length + " of " + requiredSectionIds.length + " sections."
    );
  }

  var fieldIds = {};
  sections.forEach(function (section) {
    (section.fields || []).forEach(function (field) {
      if (!field || !field.id) throw new Error("Narrative field without id in section " + section.id);
      if (fieldIds[field.id]) throw new Error("Duplicate Narrative Master field id: " + field.id);
      fieldIds[field.id] = true;
      var optionIds = {};
      (field.options || []).forEach(function (option) {
        var optionId = option && option.id;
        if (optionId == null) throw new Error("Narrative option without id in field " + field.id);
        if (optionIds[optionId]) throw new Error("Duplicate option id " + optionId + " in field " + field.id);
        optionIds[optionId] = true;
      });
    });
  });

  N.MASTER_NARRATIVE_SECTIONS = sections;
  N.MASTER_SECTION_ORDER = sections.map(function (s) { return s.id; });
  N.REQUIRED_MASTER_SECTION_IDS = requiredSectionIds.slice();
  N.masterSource = "copdoc.narrative-master.libraries.v2";

  // Dev aid: list section ids in console when debugging
  N.listMasterSections = function listMasterSections() {
    return (N.MASTER_NARRATIVE_SECTIONS || []).map(function (s) {
      return { id: s.id, title: s.title, fields: (s.fields || []).length };
    });
  };
})(typeof window !== "undefined" ? window : globalThis);
