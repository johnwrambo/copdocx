// js/data/ina-sources.js
// Primary official sources for the Immigration and Nationality Act (INA)
// All citations should be verified against the current U.S. Code.

var INA_OFFICIAL_SOURCES = [
  {
    "code": "USCODE_HOUSE",
    "label": "Official U.S. Code (House of Representatives)",
    "url": "https://uscode.house.gov/view.xhtml?path=/prelim@title8/chapter12&edition=prelim",
    "description": "Authoritative official text of Title 8, Chapter 12 (Immigration and Nationality). Preferred primary source.",
    "active": true
  },
  {
    "code": "CORNELL_LII",
    "label": "Cornell Legal Information Institute (LII)",
    "url": "https://www.law.cornell.edu/uscode/text/8",
    "description": "Highly usable, searchable version of Title 8 with cross-references. Excellent for quick lookup.",
    "active": true
  },
  {
    "code": "USCIS_INA",
    "label": "USCIS – Immigration and Nationality Act",
    "url": "https://www.uscis.gov/laws-and-policy/legislation/immigration-and-nationality-act",
    "description": "USCIS table of INA sections with corresponding 8 U.S.C. citations.",
    "active": true
  },
  {
    "code": "GOVINFO",
    "label": "GovInfo – Compilation of Immigration Statutes",
    "url": "https://www.govinfo.gov/content/pkg/COMPS-1376/pdf/COMPS-1376.pdf",
    "description": "PDF compilation of immigration-related statutes.",
    "active": true
  },
  {
    "code": "ECFR_8",
    "label": "eCFR Title 8 – Aliens and Nationality",
    "url": "https://www.ecfr.gov/current/title-8",
    "description": "Implementing regulations (8 CFR).",
    "active": true
  },
  {
    "code": "USCIS_POLICY",
    "label": "USCIS Policy Manual",
    "url": "https://www.uscis.gov/policy-manual",
    "description": "Agency interpretation and guidance on INA provisions.",
    "active": true
  }
];

var KEY_INA_SECTIONS = [
  {
    "ina": "101",
    "usc": "8 U.S.C. § 1101",
    "title": "Definitions",
    "summary": "Core definitions including alien, immigrant, nonimmigrant, admission, entry, aggravated felony, crime involving moral turpitude references, refugee, etc.",
    "source_url": "https://uscode.house.gov/view.xhtml?req=(title:8%20section:1101%20edition:prelim)",
    "category": "DEFINITIONS"
  },
  {
    "ina": "212",
    "usc": "8 U.S.C. § 1182",
    "title": "Inadmissible aliens",
    "summary": "General classes of aliens ineligible to receive visas and excluded from admission; lists all grounds of inadmissibility and available waivers.",
    "source_url": "https://uscode.house.gov/view.xhtml?req=(title:8%20section:1182%20edition:prelim)",
    "category": "INADMISSIBILITY"
  },
  {
    "ina": "235",
    "usc": "8 U.S.C. § 1225",
    "title": "Inspection by immigration officers; expedited removal",
    "summary": "Inspection authority, expedited removal of inadmissible arriving aliens, credible fear screening.",
    "source_url": "https://uscode.house.gov/view.xhtml?req=(title:8%20section:1225%20edition:prelim)",
    "category": "REMOVAL_PROCEDURE"
  },
  {
    "ina": "236",
    "usc": "8 U.S.C. § 1226",
    "title": "Apprehension and detention of aliens",
    "summary": "Arrest and detention authority, discretionary and mandatory detention, bond and parole.",
    "source_url": "https://uscode.house.gov/view.xhtml?req=(title:8%20section:1226%20edition:prelim)",
    "category": "DETENTION"
  },
  {
    "ina": "237",
    "usc": "8 U.S.C. § 1227",
    "title": "Deportable aliens",
    "summary": "General classes of deportable aliens (grounds of deportability for those who have been admitted).",
    "source_url": "https://uscode.house.gov/view.xhtml?req=(title:8%20section:1227%20edition:prelim)",
    "category": "DEPORTABILITY"
  },
  {
    "ina": "238",
    "usc": "8 U.S.C. § 1228",
    "title": "Expedited removal of aggravated felons",
    "summary": "Administrative removal for non-LPRs convicted of aggravated felonies.",
    "source_url": "https://uscode.house.gov/view.xhtml?req=(title:8%20section:1228%20edition:prelim)",
    "category": "REMOVAL_PROCEDURE"
  },
  {
    "ina": "239",
    "usc": "8 U.S.C. § 1229",
    "title": "Initiation of removal proceedings",
    "summary": "Notice to Appear (NTA) requirements and service.",
    "source_url": "https://uscode.house.gov/view.xhtml?req=(title:8%20section:1229%20edition:prelim)",
    "category": "REMOVAL_PROCEDURE"
  },
  {
    "ina": "240",
    "usc": "8 U.S.C. § 1229a",
    "title": "Removal proceedings",
    "summary": "Conduct of removal hearings before an immigration judge, burden of proof, in absentia orders.",
    "source_url": "https://uscode.house.gov/view.xhtml?req=(title:8%20section:1229a%20edition:prelim)",
    "category": "REMOVAL_PROCEDURE"
  },
  {
    "ina": "240A",
    "usc": "8 U.S.C. § 1229b",
    "title": "Cancellation of removal; adjustment of status",
    "summary": "Cancellation of removal for certain permanent residents and non-permanent residents; special rule cancellation.",
    "source_url": "https://uscode.house.gov/view.xhtml?req=(title:8%20section:1229b%20edition:prelim)",
    "category": "RELIEF"
  },
  {
    "ina": "240B",
    "usc": "8 U.S.C. § 1229c",
    "title": "Voluntary departure",
    "summary": "Authority to grant voluntary departure in lieu of removal.",
    "source_url": "https://uscode.house.gov/view.xhtml?req=(title:8%20section:1229c%20edition:prelim)",
    "category": "RELIEF"
  },
  {
    "ina": "241",
    "usc": "8 U.S.C. § 1231",
    "title": "Detention and removal of aliens ordered removed",
    "summary": "Post-order detention, removal period, reinstatement of removal orders, withholding of removal.",
    "source_url": "https://uscode.house.gov/view.xhtml?req=(title:8%20section:1231%20edition:prelim)",
    "category": "REMOVAL_PROCEDURE"
  },
  {
    "ina": "242",
    "usc": "8 U.S.C. § 1252",
    "title": "Judicial review of orders of removal",
    "summary": "Limits on judicial review of removal orders and discretionary decisions.",
    "source_url": "https://uscode.house.gov/view.xhtml?req=(title:8%20section:1252%20edition:prelim)",
    "category": "JUDICIAL_REVIEW"
  },
  {
    "ina": "287",
    "usc": "8 U.S.C. § 1357",
    "title": "Powers of immigration officers and employees",
    "summary": "Authority to interrogate, arrest without warrant, board and search conveyances, access to private lands within 25 miles of border, etc.",
    "source_url": "https://uscode.house.gov/view.xhtml?req=(title:8%20section:1357%20edition:prelim)",
    "category": "ENFORCEMENT_AUTHORITY"
  }
];

function sourceLabels() {
  return INA_OFFICIAL_SOURCES.map((s) => s.label);
}
function keySectionLabels() {
  return KEY_INA_SECTIONS.map((s) => s.ina + " – " + s.title);
}
