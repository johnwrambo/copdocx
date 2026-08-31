/**
 * Exact AcroForm /T names from assets/pdf/I200_BLANK.pdf.
 * Do not flatten. Signature widgets are omitted from the fill map.
 */
(function (global) {
  "use strict";

  var root = (global.COPDoc = global.COPDoc || {});
  var pdf = (root.pdf = root.pdf || {});

  var I200_FIELDS = {
    fileNo: "File No",
    date: "Date",
    determination:
      "is removable from the United States  This determination is based upon",
    basisCharging:
      "the execution of a charging document to initiate removal proceedings against the subject",
    basisPending: "the pendency of ongoing removal proceedings against the subject",
    basisDeferred:
      "the failure to establish admissibility subsequent to deferred inspection",
    basisBiometric:
      "biometric confirmation of the subjects identity and a records check of federal",
    basisVoluntary:
      "statements made voluntarily by the subject to an immigration officer andor other",
    printedNameTitle:
      "Printed Name and Title of Authorized Immigration Officer",
    location: "Location",
    nameOfAlien: "Name of Alien",
    dateOfService: "Date of Service",
    language: "Language",
    interpreter: "Name or Number of Interpreter if applicable"
  };

  var I200_BASIS = {
    charging: I200_FIELDS.basisCharging,
    pending: I200_FIELDS.basisPending,
    deferred: I200_FIELDS.basisDeferred,
    biometric: I200_FIELDS.basisBiometric,
    voluntary: I200_FIELDS.basisVoluntary
  };

  var I200_SIGNATURES = [
    "Signature of Authorized Immigration Officer",
    "Name and Signature of Officer"
  ];

  var I200_TEMPLATE = "assets/pdf/I200_BLANK.pdf";

  function printedNameAndTitle(officerName, title) {
    var name = String(officerName || "").trim();
    var role = String(title || "").trim();
    if (name && role) {
      return name + ", " + role;
    }
    return name || role;
  }

  function mapI200(values) {
    values = values || {};
    var basis = values.basis || {};
    var checkboxes = {};
    Object.keys(I200_BASIS).forEach(function (key) {
      checkboxes[I200_BASIS[key]] = !!basis[key];
    });
    var text = {};
    text[I200_FIELDS.fileNo] = values.fileNo || "";
    text[I200_FIELDS.date] = values.date || "";
    text[I200_FIELDS.determination] = values.determination || "";
    text[I200_FIELDS.printedNameTitle] = printedNameAndTitle(
      values.officerName,
      values.officerTitle
    );
    text[I200_FIELDS.location] = values.location || "";
    text[I200_FIELDS.nameOfAlien] = values.nameOfAlien || "";
    text[I200_FIELDS.dateOfService] = values.dateOfService || "";
    text[I200_FIELDS.language] = values.language || "";
    text[I200_FIELDS.interpreter] = values.interpreter || "";
    return { text: text, checkboxes: checkboxes };
  }

  function checkedBasisFieldIds(basis) {
    basis = basis || {};
    return Object.keys(I200_BASIS)
      .filter(function (key) {
        return !!basis[key];
      })
      .map(function (key) {
        return I200_BASIS[key];
      });
  }

  pdf.I200_FIELDS = I200_FIELDS;
  pdf.I200_BASIS = I200_BASIS;
  pdf.I200_SIGNATURES = I200_SIGNATURES;
  pdf.I200_TEMPLATE = I200_TEMPLATE;
  pdf.mapI200 = mapI200;
  pdf.printedNameAndTitle = printedNameAndTitle;
  pdf.checkedI200BasisFieldIds = checkedBasisFieldIds;
})(typeof window !== "undefined" ? window : globalThis);
