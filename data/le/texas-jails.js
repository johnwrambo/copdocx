// js/data/texas-jails.js
// Texas County Jails + Public Inmate / Booking Lookup Resources
// Sources: County sheriff sites, VINELink, TDCJ, Sheriff's Association of Texas (2025-2026)
// Note: Not every small facility has a public online roster. Use VINELink or call the sheriff for verification.
// Full 254-county sheriff directory: https://txsheriffs.org/directory/

var STATEWIDE_BOOKING_LOOKUPS = [
  {
    "code": "TDCJ",
    "label": "Texas Department of Criminal Justice – Inmate Search",
    "url": "https://inmate.tdcj.texas.gov/InmateSearch/",
    "scope": "State prisons (TDCJ units only)",
    "search_by": ["Last name + first initial", "TDCJ number", "SID number"],
    "notes": "Only current TDCJ inmates. Updated on working days; info at least 24 hours old."
  },
  {
    "code": "VINELINK_TX",
    "label": "VINELink – Texas",
    "url": "https://www.vinelink.com/",
    "scope": "Many Texas county jails + victim notification",
    "search_by": ["Name", "Offender ID"],
    "notes": "Select Texas. Coverage varies by county participation. Good starting point when county is unknown."
  },
  {
    "code": "ICE_ODLS",
    "label": "ICE Online Detainee Locator System (ODLS)",
    "url": "https://locator.ice.gov/odls",
    "scope": "Persons currently in ICE or CBP detention",
    "search_by": ["A-number", "or Name + DOB + Country of birth"],
    "notes": "Public system for locating ICE detainees. Does not cover pure county jail holds without ICE custody."
  },
  {
    "code": "BOP",
    "label": "Federal Bureau of Prisons – Inmate Locator",
    "url": "https://www.bop.gov/inmateloc/",
    "scope": "Federal sentenced inmates",
    "search_by": ["Name", "Register Number"],
    "notes": "For BOP facilities only."
  }
];

var TEXAS_JAILS = [
  {
    "code": "DALLAS_COUNTY",
    "label": "Dallas County Jail (Lew Sterrett Justice Center)",
    "county": "Dallas",
    "type": "county_jail",
    "agency": "Dallas County Sheriff's Office",
    "booking_url": "https://www.dallascounty.org/jaillookup/search.jsp",
    "search_notes": "Name, race, gender, SPN, case/booking number. Official Dallas County Jail Lookup System.",
    "active": true
  },
  {
    "code": "HARRIS_COUNTY",
    "label": "Harris County Jail",
    "county": "Harris",
    "type": "county_jail",
    "agency": "Harris County Sheriff's Office",
    "booking_url": "https://www.harriscountytx.gov/Residents/Law-Justice-Records/Inmate-Information",
    "search_notes": "SPN, SSN, last name (min 3 chars), name + DOB. Multiple facilities in Houston.",
    "active": true
  },
  {
    "code": "TARRANT_COUNTY",
    "label": "Tarrant County Jail",
    "county": "Tarrant",
    "type": "county_jail",
    "agency": "Tarrant County Sheriff's Office",
    "booking_url": "https://inmatesearch.tarrantcounty.com",
    "search_notes": "Official Tarrant County inmate search portal.",
    "active": true
  },
  {
    "code": "BEXAR_COUNTY",
    "label": "Bexar County Jail",
    "county": "Bexar",
    "type": "county_jail",
    "agency": "Bexar County Sheriff's Office",
    "booking_url": "https://portal-txbexar.tylertech.cloud/Portal/",
    "search_notes": "Justice Information Portal. Also check centralmagistrate.bexar.org for recent arrests.",
    "active": true
  },
  {
    "code": "TRAVIS_COUNTY",
    "label": "Travis County Jail",
    "county": "Travis",
    "type": "county_jail",
    "agency": "Travis County Sheriff's Office",
    "booking_url": "https://www.tcsheriff.org/",
    "search_notes": "Check Inmate/Jail Info section or public records portal on official site. Also VINELink.",
    "active": true
  },
  {
    "code": "EL_PASO_COUNTY",
    "label": "El Paso County Detention Facility",
    "county": "El Paso",
    "type": "county_jail",
    "agency": "El Paso County Sheriff's Office",
    "booking_url": "https://apps.epcountytx.gov/odysseyCrsPublic/JailRecords",
    "search_notes": "Official Odyssey public jail records search.",
    "active": true
  },
  {
    "code": "COLLIN_COUNTY",
    "label": "Collin County Jail",
    "county": "Collin",
    "type": "county_jail",
    "agency": "Collin County Sheriff's Office",
    "booking_url": null,
    "search_notes": "Use VINELink or official Collin County Sheriff site / P2C portal. High-volume DFW county.",
    "active": true
  },
  {
    "code": "DENTON_COUNTY",
    "label": "Denton County Jail",
    "county": "Denton",
    "type": "county_jail",
    "agency": "Denton County Sheriff's Office",
    "booking_url": null,
    "search_notes": "Use VINELink or Denton County Sheriff official inmate search.",
    "active": true
  },
  {
    "code": "HIDALGO_COUNTY",
    "label": "Hidalgo County Jail",
    "county": "Hidalgo",
    "type": "county_jail",
    "agency": "Hidalgo County Sheriff's Office",
    "booking_url": null,
    "search_notes": "South Texas high-volume; check official sheriff site or VINELink.",
    "active": true
  },
  {
    "code": "CAMERON_COUNTY",
    "label": "Cameron County Jail",
    "county": "Cameron",
    "type": "county_jail",
    "agency": "Cameron County Sheriff's Office",
    "booking_url": null,
    "search_notes": "Harlingen / Brownsville area; use VINELink or official site.",
    "active": true
  }
  // Expandable: All 254 counties follow the same pattern via https://txsheriffs.org/directory/
];

var MAJOR_CITY_PDS = [
  { "code": "HPD", "label": "Houston Police Department", "city": "Houston", "county": "Harris", "website": "https://www.houstonpolice.org/", "active": true },
  { "code": "DPD", "label": "Dallas Police Department", "city": "Dallas", "county": "Dallas", "website": "https://www.dallaspolice.net/", "active": true },
  { "code": "SAPD", "label": "San Antonio Police Department", "city": "San Antonio", "county": "Bexar", "website": "https://www.sanantonio.gov/SAPD", "active": true },
  { "code": "APD", "label": "Austin Police Department", "city": "Austin", "county": "Travis", "website": "https://www.austintexas.gov/department/police", "active": true },
  { "code": "FWPD", "label": "Fort Worth Police Department", "city": "Fort Worth", "county": "Tarrant", "website": "https://www.fortworthtexas.gov/departments/police", "active": true },
  { "code": "EPPD", "label": "El Paso Police Department", "city": "El Paso", "county": "El Paso", "website": "https://www.elpasotexas.gov/police/", "active": true },
  { "code": "ARLINGTON_PD", "label": "Arlington Police Department", "city": "Arlington", "county": "Tarrant", "active": true },
  { "code": "CORPUS_PD", "label": "Corpus Christi Police Department", "city": "Corpus Christi", "county": "Nueces", "active": true },
  { "code": "PLANO_PD", "label": "Plano Police Department", "city": "Plano", "county": "Collin", "active": true },
  { "code": "LUBBOCK_PD", "label": "Lubbock Police Department", "city": "Lubbock", "county": "Lubbock", "active": true }
];

function jailLabels() {
  return TEXAS_JAILS.map((j) => j.label);
}

function bookingLookups() {
  return STATEWIDE_BOOKING_LOOKUPS;
}
