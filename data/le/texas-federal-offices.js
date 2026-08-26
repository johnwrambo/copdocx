// Federal field offices and Border Patrol sectors that operate in Texas.
// These are offices/components, not the parent agency (FBI, CBP, HSI).

var TEXAS_FEDERAL_OFFICES = [
  {
    code: "USBP",
    label: "U.S. Border Patrol",
    level: "federal",
    type: "component",
    parent: "CBP",
    state: "US",
    aliases: ["Border Patrol", "USBP", "BP"],
    active: true
  },
  {
    code: "USBP_RGV",
    label: "U.S. Border Patrol – Rio Grande Valley Sector",
    level: "federal",
    type: "sector",
    parent: "USBP",
    state: "TX",
    county: "Hidalgo",
    city: "Edinburg",
    aliases: ["RGV Sector", "Rio Grande Valley Sector", "McAllen Border Patrol"],
    active: true
  },
  {
    code: "USBP_LAREDO",
    label: "U.S. Border Patrol – Laredo Sector",
    level: "federal",
    type: "sector",
    parent: "USBP",
    state: "TX",
    county: "Webb",
    city: "Laredo",
    aliases: ["Laredo Sector"],
    active: true
  },
  {
    code: "USBP_DEL_RIO",
    label: "U.S. Border Patrol – Del Rio Sector",
    level: "federal",
    type: "sector",
    parent: "USBP",
    state: "TX",
    county: "Val Verde",
    city: "Del Rio",
    aliases: ["Del Rio Sector"],
    active: true
  },
  {
    code: "USBP_EL_PASO",
    label: "U.S. Border Patrol – El Paso Sector",
    level: "federal",
    type: "sector",
    parent: "USBP",
    state: "TX",
    county: "El Paso",
    city: "El Paso",
    aliases: ["El Paso Sector"],
    active: true
  },
  {
    code: "USBP_BIG_BEND",
    label: "U.S. Border Patrol – Big Bend Sector",
    level: "federal",
    type: "sector",
    parent: "USBP",
    state: "TX",
    county: "Presidio",
    city: "Marfa",
    aliases: ["Big Bend Sector", "Marfa Sector"],
    active: true
  },
  {
    code: "FBI_DALLAS",
    label: "FBI Dallas Field Office",
    level: "federal",
    type: "field_office",
    parent: "FBI",
    state: "TX",
    county: "Dallas",
    city: "Dallas",
    aliases: ["FBI Dallas"],
    active: true
  },
  {
    code: "FBI_HOUSTON",
    label: "FBI Houston Field Office",
    level: "federal",
    type: "field_office",
    parent: "FBI",
    state: "TX",
    county: "Harris",
    city: "Houston",
    aliases: ["FBI Houston"],
    active: true
  },
  {
    code: "FBI_SAN_ANTONIO",
    label: "FBI San Antonio Field Office",
    level: "federal",
    type: "field_office",
    parent: "FBI",
    state: "TX",
    county: "Bexar",
    city: "San Antonio",
    aliases: ["FBI San Antonio"],
    active: true
  },
  {
    code: "FBI_EL_PASO",
    label: "FBI El Paso Field Office",
    level: "federal",
    type: "field_office",
    parent: "FBI",
    state: "TX",
    county: "El Paso",
    city: "El Paso",
    aliases: ["FBI El Paso"],
    active: true
  },
  {
    code: "HSI_SAC_DALLAS",
    label: "HSI Special Agent in Charge – Dallas",
    level: "federal",
    type: "field_office",
    parent: "ICE_HSI",
    state: "TX",
    county: "Dallas",
    city: "Dallas",
    aliases: ["HSI Dallas", "HSI SAC Dallas"],
    active: true
  },
  {
    code: "HSI_SAC_HOUSTON",
    label: "HSI Special Agent in Charge – Houston",
    level: "federal",
    type: "field_office",
    parent: "ICE_HSI",
    state: "TX",
    county: "Harris",
    city: "Houston",
    aliases: ["HSI Houston", "HSI SAC Houston"],
    active: true
  },
  {
    code: "HSI_SAC_SAN_ANTONIO",
    label: "HSI Special Agent in Charge – San Antonio",
    level: "federal",
    type: "field_office",
    parent: "ICE_HSI",
    state: "TX",
    county: "Bexar",
    city: "San Antonio",
    aliases: ["HSI San Antonio"],
    active: true
  },
  {
    code: "HSI_SAC_EL_PASO",
    label: "HSI Special Agent in Charge – El Paso",
    level: "federal",
    type: "field_office",
    parent: "ICE_HSI",
    state: "TX",
    county: "El Paso",
    city: "El Paso",
    aliases: ["HSI El Paso"],
    active: true
  }
];
