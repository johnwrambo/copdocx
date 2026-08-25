// js/data/ice-ero-offices-geo.js
// ICE ERO Field Offices in Texas with addresses and map data
// Sources: ice.gov field office pages (public), VisaVerge directories (2025-2026)
// map_url uses Google Maps search pattern for easy linking / embedding.
// Note: Sub-offices and check-in locations change; verify operational status with the field office.

var ICE_ERO_OFFICES_TX = [
  {
    "code": "DAL",
    "label": "Dallas Field Office",
    "aor": "North Texas, Oklahoma",
    "type": "field_office",
    "address": "8101 N. Stemmons Freeway",
    "city": "Dallas",
    "state": "TX",
    "zip": "75247",
    "phone": "(972) 367-2200",
    "lat": 32.8445,
    "lng": -96.8750,
    "map_url": "https://www.google.com/maps/search/?api=1&query=8101+N+Stemmons+Freeway+Dallas+TX+75247",
    "notes": "Primary ERO Field Office for North Texas / Oklahoma. Also hosts related community relations functions.",
    "active": true
  },
  {
    "code": "HOU",
    "label": "Houston Field Office",
    "aor": "Southeast Texas",
    "type": "field_office",
    "address": "126 Northpoint Drive",
    "city": "Houston",
    "state": "TX",
    "zip": "77060",
    "phone": "(281) 774-4816",
    "lat": 29.9370,
    "lng": -95.3980,
    "map_url": "https://www.google.com/maps/search/?api=1&query=126+Northpoint+Drive+Houston+TX+77060",
    "notes": "Primary ERO Field Office for Southeast Texas. Related OPLA and community relations offices nearby.",
    "active": true
  },
  {
    "code": "SNA",
    "label": "San Antonio Field Office",
    "aor": "Central and South Texas",
    "type": "field_office",
    "address": "1777 NE Loop 410, Floor 15",
    "city": "San Antonio",
    "state": "TX",
    "zip": "78217",
    "phone": "(210) 283-4750",
    "lat": 29.5190,
    "lng": -98.4500,
    "map_url": "https://www.google.com/maps/search/?api=1&query=1777+NE+Loop+410+San+Antonio+TX+78217",
    "notes": "Primary ERO Field Office for Central Texas. HSI and other components have nearby locations.",
    "active": true
  },
  {
    "code": "ELP",
    "label": "El Paso Field Office",
    "aor": "West Texas, New Mexico",
    "type": "field_office",
    "address": "11541 Montana Avenue, Suite E",
    "city": "El Paso",
    "state": "TX",
    "zip": "79936",
    "phone": "(915) 225-1901",
    "lat": 31.8030,
    "lng": -106.3000,
    "map_url": "https://www.google.com/maps/search/?api=1&query=11541+Montana+Avenue+El+Paso+TX+79936",
    "notes": "Primary ERO Field Office for West Texas and New Mexico. HSI co-located in same complex.",
    "active": true
  },
  {
    "code": "HLG",
    "label": "Harlingen Field Office",
    "aor": "South Texas",
    "type": "field_office",
    "address": "1717 Zoy Street",
    "city": "Harlingen",
    "state": "TX",
    "zip": "78552",
    "phone": "(956) 389-7884",
    "lat": 26.1900,
    "lng": -97.6900,
    "map_url": "https://www.google.com/maps/search/?api=1&query=1717+Zoy+Street+Harlingen+TX+78552",
    "notes": "Primary ERO Field Office for South Texas / Rio Grande Valley. OPLA annex nearby.",
    "active": true
  }
];

function eroOfficeByCode(code) {
  return ICE_ERO_OFFICES_TX.find((o) => o.code === code) || null;
}

function eroOfficeLabels() {
  return ICE_ERO_OFFICES_TX.map((o) => o.label);
}
