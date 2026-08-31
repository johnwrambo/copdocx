/**
 * Narrative Master — shared option fragments
 *
 * Edit this file to change common dropdown choices used across sections.
 * Load order: this file, then sections/01-*.js … 10-*.js, then narrative-master.js
 */
(function (global) {
  "use strict";
  var root = (global.COPDoc = global.COPDoc || {});
  var N = (root.narratives = root.narratives || {});

  /** First option on most dropdowns — omit field from prose */
  N.NOT_INCLUDED = {
      id: "",
      label: "Not included",
      text: ""
    };

  /**
   * Observation / corroboration checklist options.
   * Prefer stable `id` values; prose is in `text` / `label`.
   */
  N.CORROBORATION_OPTIONS = [
      N.NOT_INCLUDED,
      {
        id: "associated_vehicle_at_address",
        label: "Associated vehicle observed at address",
        text: "Officers observed [VEHICLE], a vehicle previously associated with [SUBJECT], at [ADDRESS]."
      },
      {
        id: "subject_exited_residence",
        label: "Subject exited known residence",
        text: "Officers observed an individual matching the known photograph and physical description of [SUBJECT] exit [ADDRESS]."
      },
      {
        id: "subject_entered_vehicle",
        label: "Subject entered associated vehicle",
        text: "Officers observed the individual enter [VEHICLE]."
      },
      {
        id: "subject_operated_vehicle",
        label: "Subject operated associated vehicle",
        text: "Officers observed the individual operate [VEHICLE] and maintained visual contact until reaching [CONTACT LOCATION]."
      },
      {
        id: "photo_description_match",
        label: "Photograph or physical-description match",
        text: "The individual’s appearance was consistent with the known photograph and physical description of [SUBJECT]."
      },
      {
        id: "identified_by_officer",
        label: "Identified by another officer or agency",
        text: "[IDENTIFYING OFFICER OR AGENCY] identified the individual as [SUBJECT]."
      },
      {
        id: "other_corroboration",
        label: "Other corroborating observation",
        text: "Officers further corroborated the individual’s identity through [CORROBORATING FACTS]."
      }
    ];

  /**
   * System-generated narrative sections.
   *
   * These records deliberately live beside the authored dropdown language,
   * not in the engine.  The engine supplies structured facts and resolves the
   * placeholders; this library remains the sole source of canned prose.
   */
  N.SYSTEM_SECTION_DEFINITIONS = {
    otherArrested: {
      id: "other_arrested",
      title: "Other Persons Arrested",
      sequenceAfter: "custody",
      text: "The following other individuals were arrested during this encounter: [OTHER ARRESTED LIST]."
    }
  };

  /** Engine-generated connective language also belongs to the prose library. */
  N.GENERATED_LANGUAGE = {
    eventTimePrefix: "At approximately [TIME] hours, {sentence}"
  };

  // Convenience aliases for section authors (same references)
  N.shared = {
    NOT_INCLUDED: N.NOT_INCLUDED,
    CORROBORATION_OPTIONS: N.CORROBORATION_OPTIONS,
    SYSTEM_SECTION_DEFINITIONS: N.SYSTEM_SECTION_DEFINITIONS,
    GENERATED_LANGUAGE: N.GENERATED_LANGUAGE
  };
})(typeof window !== "undefined" ? window : globalThis);
