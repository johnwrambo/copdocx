// js/data/federal-le-agencies.js
// Core Federal Law Enforcement Agencies
// Focused on agencies relevant to immigration, criminal, and border enforcement.
// Sources: DHS, DOJ official sites, 8 USC definitions, public directories (2025-2026).

var FEDERAL_LE_AGENCIES = [
  // Department of Homeland Security
  {
    "code": "DHS",
    "label": "U.S. Department of Homeland Security",
    "parent": null,
    "type": "department",
    "description": "Cabinet department overseeing domestic security, immigration, borders, and critical infrastructure.",
    "website": "https://www.dhs.gov",
    "active": true
  },
  {
    "code": "ICE",
    "label": "U.S. Immigration and Customs Enforcement",
    "parent": "DHS",
    "type": "agency",
    "description": "Criminal and civil enforcement of federal laws governing border control, customs, trade, and immigration. Includes ERO and HSI.",
    "website": "https://www.ice.gov",
    "active": true
  },
  {
    "code": "ICE_ERO",
    "label": "ICE Enforcement and Removal Operations",
    "parent": "ICE",
    "type": "component",
    "description": "Responsible for the identification, arrest, detention, and removal of removable aliens.",
    "website": "https://www.ice.gov/ero",
    "active": true
  },
  {
    "code": "ICE_HSI",
    "label": "ICE Homeland Security Investigations",
    "parent": "ICE",
    "type": "component",
    "description": "Investigates cross-border crime including human smuggling/trafficking, drug trafficking, financial crimes, and cybercrime.",
    "website": "https://www.ice.gov/hsi",
    "active": true
  },
  {
    "code": "CBP",
    "label": "U.S. Customs and Border Protection",
    "parent": "DHS",
    "type": "agency",
    "description": "Primary border security agency. Protects U.S. borders and facilitates legitimate trade and travel.",
    "website": "https://www.cbp.gov",
    "active": true
  },
  {
    "code": "USSS",
    "label": "U.S. Secret Service",
    "parent": "DHS",
    "type": "agency",
    "description": "Protects national leaders and investigates financial crimes and cyber threats against the financial system.",
    "website": "https://www.secretservice.gov",
    "active": true
  },
  {
    "code": "TSA",
    "label": "Transportation Security Administration",
    "parent": "DHS",
    "type": "agency",
    "description": "Protects the nation's transportation systems.",
    "website": "https://www.tsa.gov",
    "active": true
  },
  {
    "code": "USCG",
    "label": "U.S. Coast Guard",
    "parent": "DHS",
    "type": "agency",
    "description": "Maritime security, search and rescue, and law enforcement on U.S. waters.",
    "website": "https://www.uscg.mil",
    "active": true
  },
  {
    "code": "FPS",
    "label": "Federal Protective Service",
    "parent": "DHS",
    "type": "agency",
    "description": "Protects federal facilities and their occupants.",
    "website": "https://www.dhs.gov/federal-protective-service",
    "active": true
  },
  {
    "code": "FLETC",
    "label": "Federal Law Enforcement Training Centers",
    "parent": "DHS",
    "type": "training",
    "description": "Provides training to federal, state, local, and tribal law enforcement.",
    "website": "https://www.fletc.gov",
    "active": true
  },
  {
    "code": "USCIS",
    "label": "U.S. Citizenship and Immigration Services",
    "parent": "DHS",
    "type": "agency",
    "description": "Administers immigration benefits and naturalization (primarily non-enforcement).",
    "website": "https://www.uscis.gov",
    "active": true
  },

  // Department of Justice
  {
    "code": "DOJ",
    "label": "U.S. Department of Justice",
    "parent": null,
    "type": "department",
    "description": "Federal executive department responsible for enforcement of federal law and administration of justice.",
    "website": "https://www.justice.gov",
    "active": true
  },
  {
    "code": "FBI",
    "label": "Federal Bureau of Investigation",
    "parent": "DOJ",
    "type": "agency",
    "description": "Primary federal investigative agency for domestic criminal and national security matters.",
    "website": "https://www.fbi.gov",
    "active": true
  },
  {
    "code": "DEA",
    "label": "Drug Enforcement Administration",
    "parent": "DOJ",
    "type": "agency",
    "description": "Enforces controlled substances laws and regulations.",
    "website": "https://www.dea.gov",
    "active": true
  },
  {
    "code": "ATF",
    "label": "Bureau of Alcohol, Tobacco, Firearms and Explosives",
    "parent": "DOJ",
    "type": "agency",
    "description": "Investigates and prevents federal offenses involving firearms, explosives, arson, and alcohol/tobacco trafficking.",
    "website": "https://www.atf.gov",
    "active": true
  },
  {
    "code": "USMS",
    "label": "U.S. Marshals Service",
    "parent": "DOJ",
    "type": "agency",
    "description": "Federal judicial security, fugitive apprehension, prisoner transport, and asset forfeiture.",
    "website": "https://www.usmarshals.gov",
    "active": true
  },
  {
    "code": "BOP",
    "label": "Federal Bureau of Prisons",
    "parent": "DOJ",
    "type": "agency",
    "description": "Responsible for the custody and care of federal inmates.",
    "website": "https://www.bop.gov",
    "active": true
  },

  // Other key federal
  {
    "code": "USPIS",
    "label": "U.S. Postal Inspection Service",
    "parent": "USPS",
    "type": "agency",
    "description": "Law enforcement arm of the U.S. Postal Service; investigates mail-related crimes.",
    "website": "https://www.uspis.gov",
    "active": true
  },
  {
    "code": "DSS",
    "label": "Diplomatic Security Service",
    "parent": "State",
    "type": "agency",
    "description": "Protects U.S. diplomatic personnel and investigates passport/visa fraud.",
    "website": "https://www.state.gov/diplomatic-security",
    "active": true
  }
];

function federalAgencyLabels() {
  return FEDERAL_LE_AGENCIES.map((a) => a.label);
}

function federalByParent(parentCode) {
  return FEDERAL_LE_AGENCIES.filter((a) => a.parent === parentCode);
}
