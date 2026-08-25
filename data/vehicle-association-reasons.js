/**
 * Reasons a person is linked to a vehicle as known operator / known user
 * (not registered owner). Stored on ENTITY_ASSOCIATION.notes (and optional code).
 */
(function (global) {
  "use strict";

  var REASONS = [
    {
      code: "PREVIOUS_LE_ENCOUNTER",
      label: "Previous LE encounter",
    },
    {
      code: "SUBJECT_STATEMENT",
      label: "Subject statement",
    },
    {
      code: "OBSERVED_OPERATING",
      label: "Observed operating",
    },
    {
      code: "REGISTRATION_RESEARCH",
      label: "Registration / database research",
    },
    {
      code: "TIP_OR_INFORMANT",
      label: "Tip / informant",
    },
    {
      code: "OTHER",
      label: "Other (notes required)",
      notesRequired: true,
    },
  ];

  global.VEHICLE_ASSOCIATION_REASONS = REASONS;

  global.vehicleAssociationReasonLabels = function vehicleAssociationReasonLabels() {
    return REASONS.map(function (r) {
      return r.label;
    });
  };

  global.vehicleAssociationReasonByCode = function vehicleAssociationReasonByCode(code) {
    if (!code) return null;
    for (var i = 0; i < REASONS.length; i++) {
      if (REASONS[i].code === code) return REASONS[i];
    }
    return null;
  };

  if (global.COPDoc) {
    global.COPDoc.data = global.COPDoc.data || {};
    global.COPDoc.data.vehicleAssociationReasons = REASONS;
  }
})(typeof window !== "undefined" ? window : this);
