// js/data/texas-state-le.js
// Texas State Law Enforcement and Corrections Agencies
// Sources: Texas DPS, TDCJ, TPWD, TABC, official state sites (2025-2026)

var TEXAS_STATE_LE = [
  {
    "code": "TX_DPS",
    "label": "Texas Department of Public Safety",
    "type": "state_primary",
    "aliases": ["DPS", "Texas DPS"],
    "components": ["Texas Highway Patrol", "Texas Rangers", "Criminal Investigations Division", "Intelligence & Counterterrorism", "Driver License", "Regulatory Services"],
    "description": "Primary statewide law enforcement agency. Includes Highway Patrol and the Texas Rangers.",
    "website": "https://www.dps.texas.gov/",
    "active": true
  },
  {
    "code": "TX_RANGERS",
    "label": "Texas Ranger Division",
    "parent": "TX_DPS",
    "type": "state_elite",
    "description": "Elite investigative division of DPS with statewide jurisdiction for major crimes.",
    "website": "https://www.dps.texas.gov/section/texas-rangers",
    "active": true
  },
  {
    "code": "TX_HP",
    "label": "Texas Highway Patrol",
    "parent": "TX_DPS",
    "type": "state",
    "description": "Uniformed traffic enforcement and statewide patrol.",
    "website": "https://www.dps.texas.gov/section/texas-highway-patrol",
    "active": true
  },
  {
    "code": "TX_TPWD",
    "label": "Texas Parks and Wildlife Department – Law Enforcement Division (Game Wardens)",
    "type": "state",
    "description": "Statewide jurisdiction for wildlife, natural resources, and water safety enforcement.",
    "website": "https://tpwd.texas.gov/warden/",
    "active": true
  },
  {
    "code": "TX_TABC",
    "label": "Texas Alcoholic Beverage Commission",
    "type": "state",
    "description": "Enforces the Texas Alcoholic Beverage Code.",
    "website": "https://www.tabc.texas.gov/",
    "active": true
  },
  {
    "code": "TX_OAG",
    "label": "Office of the Attorney General – Law Enforcement Division",
    "type": "state",
    "description": "Investigative and enforcement arm of the Texas Attorney General.",
    "website": "https://www.texasattorneygeneral.gov/",
    "active": true
  },
  {
    "code": "TX_TDCJ",
    "label": "Texas Department of Criminal Justice",
    "type": "state_corrections",
    "description": "Operates state prisons, parole, and related functions. Primary source for state inmate location.",
    "website": "https://www.tdcj.texas.gov/",
    "inmate_search_url": "https://inmate.tdcj.texas.gov/InmateSearch/",
    "active": true
  },
  {
    "code": "TX_TDCJ_OIG",
    "label": "TDCJ Office of the Inspector General",
    "parent": "TX_TDCJ",
    "type": "state",
    "description": "Investigates criminal activity and administrative violations within TDCJ.",
    "active": true
  },
  {
    "code": "TX_TCOLE",
    "label": "Texas Commission on Law Enforcement",
    "type": "regulatory",
    "description": "Licenses and regulates Texas peace officers and law enforcement agencies.",
    "website": "https://www.tcole.texas.gov/",
    "active": true
  },
  {
    "code": "TX_TJJD",
    "label": "Texas Juvenile Justice Department – Office of Inspector General",
    "type": "state",
    "description": "Oversight and investigation within the juvenile justice system.",
    "active": true
  },
  {
    "code": "TX_SFMO",
    "label": "State Fire Marshal's Office",
    "type": "state",
    "description": "Investigates fires and enforces fire safety regulations.",
    "active": true
  }
];

function texasStateLabels() {
  return TEXAS_STATE_LE.map((a) => a.label);
}
