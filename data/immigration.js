const immigrationDispositionSelect = document.getElementById(
  "immigrationDisposition"
);
const immigrationStatusSelect = document.getElementById("immigrationStatus");

function buildSelectOptions(select, items, placeholderText) {
  if (!select) {
    return;
  }
  select.replaceChildren();

  const placeholderOption = document.createElement("option");
  placeholderOption.value = "";
  placeholderOption.textContent = placeholderText;
  select.appendChild(placeholderOption);

  items.forEach(function (item) {
    const option = document.createElement("option");
    option.value = item.code;
    option.textContent = item.label;
    select.appendChild(option);
  });
}

// Immigration Disposition — processing outcome / action (EARM codes)
var IMMIGRATION_DISPOSITIONS = [
  { code: "ADMDPT", label: "Administrative Deportation I-851/I-851A", active: true },
  { code: "B", label: "Bag and Baggage", active: true },
  { code: "CRW99R", label: "Crew Member (I-99) Removal", active: true },
  { code: "DTNR", label: "Detainer", active: true },
  { code: "ER", label: "Expedited Removal (I-860)", active: true },
  { code: "ER/CF", label: "Expedited Removal with Credible Fear", active: true },
  { code: "ER/CFF", label: "Expedited Removal with Credible Fear - Full Scope", active: true },
  { code: "ERF", label: "Expedited Removal (I-860) - Full Scope", active: true },
  { code: "FBUSC", label: "Foreign Born USC", active: true },
  { code: "HCA", label: "HSI Criminal Arrest", active: true },
  { code: "NAR", label: "Not Amenable to Removal", active: true },
  { code: "NIC", label: "Not in Custody", active: true },
  { code: "P", label: "Paroled", active: true },
  { code: "PD", label: "Prosecutorial Discretion", active: true },
  { code: "REINRF", label: "Reinstatement of Deportation Reasonable Fear", active: true },
  { code: "REINST", label: "Reinstatement of Deport Order I-871", active: true },
  { code: "STOW", label: "Stowaway", active: true },
  { code: "T", label: "Other", active: true },
  { code: "TOT", label: "Turned Over To", active: true },
  { code: "USC/PR", label: "USC Prosecutions", active: true },
  { code: "V", label: "Voluntary Return", active: true },
  { code: "VD", label: "Voluntary Departure", active: true },
  { code: "VWP/GM", label: "VWP Removal (GUAM-CNMI)", active: true },
  { code: "VWPRM", label: "VWP Removal", active: true },
  { code: "WA/NTA", label: "Warrant of Arrest/Notice to Appear", active: true },
  { code: "WD/T42", label: "Withdrawal (WD-Title 42)", active: true }
];

// Immigration Status — legal classification of the person
var IMMIGRATION_STATUS = [
  { code: "AW", label: "Application Withdrawn", active: true },
  { code: "DN", label: "DeNaturalized", active: true },
  { code: "D", label: "Deportable", active: true },
  { code: "EX", label: "Excludable", active: true },
  { code: "IA", label: "Inadmissible Alien", active: true },
  { code: "LPR", label: "Legal Permanent Resident", active: true },
  { code: "N", label: "Non-Deportable Alien", active: true },
  { code: "NEX", label: "Not Excludable", active: true },
  { code: "SIC", label: "Special Interest Case", active: true },
  { code: "USC", label: "U.S. Citizen", active: true },
  { code: "VWR", label: "VWPP Refusal", active: true }
];

function immigrationDispositionLabels() {
  return IMMIGRATION_DISPOSITIONS.map(function (item) {
    return item.label;
  });
}

function immigrationStatusLabels() {
  return IMMIGRATION_STATUS.map(function (item) {
    return item.label;
  });
}

buildSelectOptions(
  immigrationDispositionSelect,
  IMMIGRATION_DISPOSITIONS,
  "Select a Disposition"
);

buildSelectOptions(
  immigrationStatusSelect,
  IMMIGRATION_STATUS,
  "Select a Status"
);
