/**
 * Identity document type catalog (civil / physical documents).
 * Distinct from PersonIdentifier types (A#, FBI, STATE_CRIMINAL_ID / SID).
 */
(function (global) {
  "use strict";

  var TYPES = [
    {
      code: "DRIVERS_LICENSE",
      label: "Driver's license",
      active: true,
    },
    {
      code: "STATE_ID",
      label: "State identification card",
      active: true,
    },
    {
      code: "PASSPORT",
      label: "Passport",
      active: true,
    },
    {
      code: "CONSULAR_ID",
      label: "Consular ID",
      active: true,
    },
    {
      code: "OTHER",
      label: "Other identity document",
      active: true,
    },
  ];

  global.IDENTITY_DOCUMENT_TYPES = TYPES;

  global.identityDocumentTypeLabels = function identityDocumentTypeLabels() {
    return TYPES.filter(function (t) {
      return t && t.active !== false;
    }).map(function (t) {
      return t.label;
    });
  };

  global.identityDocumentTypeByCode = function identityDocumentTypeByCode(code) {
    if (!code) return null;
    for (var i = 0; i < TYPES.length; i++) {
      if (TYPES[i].code === code) return TYPES[i];
    }
    return null;
  };

  if (global.COPDoc) {
    global.COPDoc.data = global.COPDoc.data || {};
    global.COPDoc.data.identityDocumentTypes = TYPES;
  }
})(typeof window !== "undefined" ? window : this);
