/**
 * Exact AcroForm /T names from assets/pdf/I205_BLANK.pdf.
 * Execution / fingerprint / image widgets stay untouched.
 * Do not flatten. Signature widgets are omitted from the fill map.
 */
(function (global) {
  "use strict";

  var root = (global.COPDoc = global.COPDoc || {});
  var pdf = (root.pdf = root.pdf || {});

  var I205_FIELDS = {
    fileNo: "File No",
    date: "Date",
    fullName: "Full name of alien",
    entryPlace: "Place of entry",
    entryDate: "Date of entry",
    orderIJ:
      "an immigration judge in exclusion deportation or removal proceedings",
    orderOfficial: "a designated official",
    orderBIA: "the Board of Immigration Appeals",
    orderCourt: "a United States District or Magistrate Court Judge",
    title: "Title of immigration officer",
    dateAndOffice: "Date and office location",
    inaLaw: "INA LAW"
  };

  var I205_ORDER = {
    ij: I205_FIELDS.orderIJ,
    official: I205_FIELDS.orderOfficial,
    bia: I205_FIELDS.orderBIA,
    court: I205_FIELDS.orderCourt
  };

  var I205_SIGNATURES = [
    "Signature of immigration officer",
    "Signature of alien being fingerprinted",
    "Signature and title of immigration officer taking print",
    "Signature and title of immigration officer",
    "Signature and title of immigration officer_2"
  ];

  var I205_LEAVE_BLANK = [
    "To be completed by immigration officer executing the warrant Name of alien being removed",
    "Port date and manner of removal",
    "If actual departure is not witnessed fully identify source or means of verification of departure 1",
    "If actual departure is not witnessed fully identify source or means of verification of departure 2",
    "If actual departure is not witnessed fully identify source or means of verification of departure 3",
    "If actual departure is not witnessed fully identify source or means of verification of departure 4",
    "If selfremoval selfdeportation pursuant to 8 CFR 2417 check here",
    "Image1_af_image",
    "Image2_af_image"
  ];

  var I205_TEMPLATE = "assets/pdf/I205_BLANK.pdf";

  function dateAndOffice(date, office) {
    var day = String(date || "").trim();
    var loc = String(office || "").trim();
    if (day && loc) {
      return day + ", " + loc;
    }
    return day || loc;
  }

  function mapI205(values) {
    values = values || {};
    var order = values.order || {};
    var checkboxes = {};
    Object.keys(I205_ORDER).forEach(function (key) {
      checkboxes[I205_ORDER[key]] = !!order[key];
    });
    var text = {};
    text[I205_FIELDS.fileNo] = values.fileNo || "";
    text[I205_FIELDS.date] = values.date || "";
    text[I205_FIELDS.fullName] = values.fullName || "";
    text[I205_FIELDS.entryPlace] = values.entryPlace || "";
    text[I205_FIELDS.entryDate] = values.entryDate || "";
    text[I205_FIELDS.title] = values.officerTitle || "";
    text[I205_FIELDS.dateAndOffice] =
      values.dateAndOffice || dateAndOffice(values.date, values.location);
    text[I205_FIELDS.inaLaw] = values.inaLaw || "";
    return { text: text, checkboxes: checkboxes };
  }

  function checkedOrderFieldIds(order) {
    order = order || {};
    return Object.keys(I205_ORDER)
      .filter(function (key) {
        return !!order[key];
      })
      .map(function (key) {
        return I205_ORDER[key];
      });
  }

  pdf.I205_FIELDS = I205_FIELDS;
  pdf.I205_ORDER = I205_ORDER;
  pdf.I205_SIGNATURES = I205_SIGNATURES;
  pdf.I205_LEAVE_BLANK = I205_LEAVE_BLANK;
  pdf.I205_TEMPLATE = I205_TEMPLATE;
  pdf.mapI205 = mapI205;
  pdf.dateAndOffice = dateAndOffice;
  pdf.checkedI205OrderFieldIds = checkedOrderFieldIds;
})(typeof window !== "undefined" ? window : globalThis);
