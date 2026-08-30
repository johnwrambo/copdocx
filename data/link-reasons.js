/**
 * Why a person is linked to a vehicle.
 * One link can have several reasons. Checkboxes on the link card.
 * A reason is evidence — it is not a silent name match.
 */
(function (global) {
  "use strict";

  var REASONS = [
    {
      code: "REGISTERED_OWNER",
      label: "Is the registered owner (title name may still differ)"
    },
    {
      code: "SAME_ADDRESS_AS_RO",
      label: "Lives at the same address as the registered owner"
    },
    {
      code: "RELATED_TO_RO",
      label: "Married to / related to the registered owner"
    },
    {
      code: "LE_ENCOUNTER_IN_VEHICLE",
      label: "Documented LE encounter in the vehicle"
    },
    {
      code: "SURVEILLANCE_PHYSICALS",
      label: "Observed / surveillance: physicals match the subject"
    },
    {
      code: "OBSERVED_OPERATING",
      label: "Observed operating"
    },
    {
      code: "SUBJECT_STATEMENT",
      label: "Subject statement"
    },
    {
      code: "TIP_OR_INFORMANT",
      label: "Tip / informant"
    },
    {
      code: "OTHER",
      label: "Other (notes)",
      notesRequired: true
    }
  ];

  global.LINK_REASONS = REASONS;
  global.COPDoc = global.COPDoc || {};
  global.COPDoc.data = global.COPDoc.data || {};
  global.COPDoc.data.linkReasons = REASONS;
})(typeof window !== "undefined" ? window : globalThis);
