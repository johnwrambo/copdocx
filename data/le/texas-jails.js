// Texas county jails with public booking lookup resources.
// Facilities, not referring agencies. Linked to TEXAS_SHERIFFS via sheriffCode.
// Inmate search coverage is incomplete; use VINELink when booking_url is null.

var TEXAS_JAILS = [
  {
    code: "JAIL_DALLAS",
    label: "Dallas County Jail (Lew Sterrett Justice Center)",
    county: "Dallas",
    type: "county_jail",
    sheriffCode: "TX_SO_DALLAS",
    booking_url: "https://www.dallascounty.org/jaillookup/search.jsp",
    search_notes:
      "Name, race, gender, SPN, case/booking number. Official Dallas County Jail Lookup System.",
    active: true
  },
  {
    code: "JAIL_HARRIS",
    label: "Harris County Jail",
    county: "Harris",
    type: "county_jail",
    sheriffCode: "TX_SO_HARRIS",
    booking_url:
      "https://www.harriscountytx.gov/Residents/Law-Justice-Records/Inmate-Information",
    search_notes:
      "SPN, SSN, last name (min 3 chars), name + DOB. Multiple facilities in Houston.",
    active: true
  },
  {
    code: "JAIL_TARRANT",
    label: "Tarrant County Jail",
    county: "Tarrant",
    type: "county_jail",
    sheriffCode: "TX_SO_TARRANT",
    booking_url: "https://inmatesearch.tarrantcounty.com",
    search_notes: "Official Tarrant County inmate search portal.",
    active: true
  },
  {
    code: "JAIL_BEXAR",
    label: "Bexar County Jail",
    county: "Bexar",
    type: "county_jail",
    sheriffCode: "TX_SO_BEXAR",
    booking_url: "https://portal-txbexar.tylertech.cloud/Portal/",
    search_notes:
      "Justice Information Portal. Also check centralmagistrate.bexar.org for recent arrests.",
    active: true
  },
  {
    code: "JAIL_TRAVIS",
    label: "Travis County Jail",
    county: "Travis",
    type: "county_jail",
    sheriffCode: "TX_SO_TRAVIS",
    booking_url: "https://www.tcsheriff.org/",
    search_notes:
      "Check Inmate/Jail Info section or public records portal on official site. Also VINELink.",
    active: true
  },
  {
    code: "JAIL_EL_PASO",
    label: "El Paso County Detention Facility",
    county: "El Paso",
    type: "county_jail",
    sheriffCode: "TX_SO_EL_PASO",
    booking_url: "https://apps.epcountytx.gov/odysseyCrsPublic/JailRecords",
    search_notes: "Official Odyssey public jail records search.",
    active: true
  },
  {
    code: "JAIL_COLLIN",
    label: "Collin County Jail",
    county: "Collin",
    type: "county_jail",
    sheriffCode: "TX_SO_COLLIN",
    booking_url: null,
    search_notes:
      "Use VINELink or official Collin County Sheriff site / P2C portal. High-volume DFW county.",
    active: true
  },
  {
    code: "JAIL_DENTON",
    label: "Denton County Jail",
    county: "Denton",
    type: "county_jail",
    sheriffCode: "TX_SO_DENTON",
    booking_url: null,
    search_notes: "Use VINELink or Denton County Sheriff official inmate search.",
    active: true
  },
  {
    code: "JAIL_HIDALGO",
    label: "Hidalgo County Jail",
    county: "Hidalgo",
    type: "county_jail",
    sheriffCode: "TX_SO_HIDALGO",
    booking_url: null,
    search_notes: "South Texas high-volume; check official sheriff site or VINELink.",
    active: true
  },
  {
    code: "JAIL_CAMERON",
    label: "Cameron County Jail",
    county: "Cameron",
    type: "county_jail",
    sheriffCode: "TX_SO_CAMERON",
    booking_url: null,
    search_notes: "Harlingen / Brownsville area; use VINELink or official site.",
    active: true
  },
  {
    code: "JAIL_WEBB",
    label: "Webb County Jail",
    county: "Webb",
    type: "county_jail",
    sheriffCode: "TX_SO_WEBB",
    booking_url: null,
    search_notes: "Laredo; use VINELink or Webb County Sheriff site.",
    active: true
  },
  {
    code: "JAIL_NUECES",
    label: "Nueces County Jail",
    county: "Nueces",
    type: "county_jail",
    sheriffCode: "TX_SO_NUECES",
    booking_url: null,
    search_notes: "Corpus Christi; use VINELink or Nueces County Sheriff site.",
    active: true
  },
  {
    code: "JAIL_FORT_BEND",
    label: "Fort Bend County Jail",
    county: "Fort Bend",
    type: "county_jail",
    sheriffCode: "TX_SO_FORT_BEND",
    booking_url: null,
    search_notes: "Use VINELink or Fort Bend County Sheriff site.",
    active: true
  },
  {
    code: "JAIL_MONTGOMERY",
    label: "Montgomery County Jail",
    county: "Montgomery",
    type: "county_jail",
    sheriffCode: "TX_SO_MONTGOMERY",
    booking_url: null,
    search_notes: "Conroe area; use VINELink or Montgomery County Sheriff site.",
    active: true
  },
  {
    code: "JAIL_WILLIAMSON",
    label: "Williamson County Jail",
    county: "Williamson",
    type: "county_jail",
    sheriffCode: "TX_SO_WILLIAMSON",
    booking_url: null,
    search_notes: "Georgetown / Round Rock; use VINELink or Williamson County Sheriff site.",
    active: true
  }
];

function jailLabels() {
  return TEXAS_JAILS.map(function (j) {
    return j.label;
  });
}
