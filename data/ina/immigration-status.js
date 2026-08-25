// js/data/immigration-status.js
// Immigration Status codes (raw list)
// Source: Internal system status codes

var IMMIGRATION_STATUS = [
  { "code": "AW", "label": "Application Withdrawn", "active": true },
  { "code": "DN", "label": "DeNaturalized", "active": true },
  { "code": "D", "label": "Deportable", "active": true },
  { "code": "EX", "label": "Excludable", "active": true },
  { "code": "IA", "label": "Inadmissible Alien", "active": true },
  { "code": "LPR", "label": "Legal Permanent Resident", "active": true },
  { "code": "N", "label": "Non-Deportable Alien", "active": true },
  { "code": "NEX", "label": "Not Excludable", "active": true },
  { "code": "SIC", "label": "Special Interest Case", "active": true },
  { "code": "USC", "label": "U.S. Citizen", "active": true },
  { "code": "VWR", "label": "VWPP Refusal", "active": true }
];

function immigrationStatusLabels() {
  return IMMIGRATION_STATUS.map((s) => s.label);
}

function immigrationStatusCodes() {
  return IMMIGRATION_STATUS.map((s) => s.code);
}
