// Public inmate / detainee lookup tools — not law-enforcement agencies.

var STATEWIDE_BOOKING_LOOKUPS = [
  {
    code: "LOOKUP_TDCJ",
    label: "Texas Department of Criminal Justice – Inmate Search",
    url: "https://inmate.tdcj.texas.gov/InmateSearch/",
    scope: "State prisons (TDCJ units only)",
    search_by: ["Last name + first initial", "TDCJ number", "SID number"],
    notes:
      "Only current TDCJ inmates. Updated on working days; info at least 24 hours old."
  },
  {
    code: "LOOKUP_VINELINK_TX",
    label: "VINELink – Texas",
    url: "https://www.vinelink.com/",
    scope: "Many Texas county jails + victim notification",
    search_by: ["Name", "Offender ID"],
    notes:
      "Select Texas. Coverage varies by county participation. Good starting point when county is unknown."
  },
  {
    code: "LOOKUP_ICE_ODLS",
    label: "ICE Online Detainee Locator System (ODLS)",
    url: "https://locator.ice.gov/odls",
    scope: "Persons currently in ICE or CBP detention",
    search_by: ["A-number", "or Name + DOB + Country of birth"],
    notes:
      "Public system for locating ICE detainees. Does not cover pure county jail holds without ICE custody."
  },
  {
    code: "LOOKUP_BOP",
    label: "Federal Bureau of Prisons – Inmate Locator",
    url: "https://www.bop.gov/inmateloc/",
    scope: "Federal sentenced inmates",
    search_by: ["Name", "Register Number"],
    notes: "For BOP facilities only."
  }
];

function bookingLookups() {
  return STATEWIDE_BOOKING_LOOKUPS;
}
