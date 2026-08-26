const fs = require("fs");
const path = require("path");

// [code|null, city, county, website|null]
const rows = [
  ["HPD", "Houston", "Harris", "https://www.houstonpolice.org/"],
  ["SAPD", "San Antonio", "Bexar", "https://www.sanantonio.gov/SAPD"],
  ["DPD", "Dallas", "Dallas", "https://www.dallaspolice.net/"],
  ["APD", "Austin", "Travis", "https://www.austintexas.gov/department/police"],
  ["FWPD", "Fort Worth", "Tarrant", "https://www.fortworthtexas.gov/departments/police"],
  ["EPPD", "El Paso", "El Paso", "https://www.elpasotexas.gov/police/"],
  ["ARLINGTON_PD", "Arlington", "Tarrant", null],
  ["CORPUS_PD", "Corpus Christi", "Nueces", null],
  ["PLANO_PD", "Plano", "Collin", null],
  ["LAREDO_PD", "Laredo", "Webb", null],
  ["LUBBOCK_PD", "Lubbock", "Lubbock", null],
  ["IRVING_PD", "Irving", "Dallas", null],
  ["GARLAND_PD", "Garland", "Dallas", null],
  ["FRISCO_PD", "Frisco", "Collin", null],
  ["MCKINNEY_PD", "McKinney", "Collin", null],
  ["GRAND_PRAIRIE_PD", "Grand Prairie", "Dallas", null],
  ["BROWNSVILLE_PD", "Brownsville", "Cameron", null],
  ["AMARILLO_PD", "Amarillo", "Potter", null],
  ["PASADENA_PD", "Pasadena", "Harris", null],
  ["MESQUITE_PD", "Mesquite", "Dallas", null],
  ["MCALLEN_PD", "McAllen", "Hidalgo", null],
  ["KILLEEN_PD", "Killeen", "Bell", null],
  ["DENTON_PD", "Denton", "Denton", null],
  ["WACO_PD", "Waco", "McLennan", null],
  ["CARROLLTON_PD", "Carrollton", "Dallas", null],
  ["MIDLAND_PD", "Midland", "Midland", null],
  ["LEWISVILLE_PD", "Lewisville", "Denton", null],
  ["ABILENE_PD", "Abilene", "Taylor", null],
  ["PEARLAND_PD", "Pearland", "Brazoria", null],
  ["ROUND_ROCK_PD", "Round Rock", "Williamson", null],
  ["COLLEGE_STATION_PD", "College Station", "Brazos", null],
  ["RICHARDSON_PD", "Richardson", "Dallas", null],
  ["ODESSA_PD", "Odessa", "Ector", null],
  ["LEAGUE_CITY_PD", "League City", "Galveston", null],
  ["SUGAR_LAND_PD", "Sugar Land", "Fort Bend", null],
  ["BEAUMONT_PD", "Beaumont", "Jefferson", null],
  ["TYLER_PD", "Tyler", "Smith", null],
  ["ALLEN_PD", "Allen", "Collin", null],
  ["EDINBURG_PD", "Edinburg", "Hidalgo", null],
  ["SAN_ANGELO_PD", "San Angelo", "Tom Green", null],
  ["WICHITA_FALLS_PD", "Wichita Falls", "Wichita", null],
  ["GALVESTON_PD", "Galveston", "Galveston", null],
  ["NEW_BRAUNFELS_PD", "New Braunfels", "Comal", null],
  ["CONROE_PD", "Conroe", "Montgomery", null],
  ["MISSION_PD", "Mission", "Hidalgo", null],
  ["BRYAN_PD", "Bryan", "Brazos", null],
  ["PHARR_PD", "Pharr", "Hidalgo", null],
  ["BAYTOWN_PD", "Baytown", "Harris", null],
  ["TEMPLE_PD", "Temple", "Bell", null],
  ["HARLINGEN_PD", "Harlingen", "Cameron", null],
  ["DEL_RIO_PD", "Del Rio", "Val Verde", null],
  ["EAGLE_PASS_PD", "Eagle Pass", "Maverick", null],
  ["WESLACO_PD", "Weslaco", "Hidalgo", null],
  ["SAN_JUAN_PD", "San Juan", "Hidalgo", null],
  ["SOCORRO_PD", "Socorro", "El Paso", null],
  ["MISSOURI_CITY_PD", "Missouri City", "Fort Bend", null],
  ["FLOWER_MOUND_PD", "Flower Mound", "Denton", null],
  ["NRH_PD", "North Richland Hills", "Tarrant", null],
  ["VICTORIA_PD", "Victoria", "Victoria", null],
  ["LONGVIEW_PD", "Longview", "Gregg", null],
  ["CEDAR_PARK_PD", "Cedar Park", "Williamson", null],
  ["GEORGETOWN_PD", "Georgetown", "Williamson", null],
  ["PFLUGERVILLE_PD", "Pflugerville", "Travis", null],
  ["MANSFIELD_PD", "Mansfield", "Tarrant", null],
  ["ROWLETT_PD", "Rowlett", "Dallas", null],
  ["PORT_ARTHUR_PD", "Port Arthur", "Jefferson", null],
  ["TEXAS_CITY_PD", "Texas City", "Galveston", null],
  ["GRAPEVINE_PD", "Grapevine", "Tarrant", null],
  ["EULESS_PD", "Euless", "Tarrant", null],
  ["SAN_MARCOS_PD", "San Marcos", "Hays", null],
  ["WYLIE_PD", "Wylie", "Collin", null],
  ["COPPELL_PD", "Coppell", "Dallas", null],
  ["LITTLE_ELM_PD", "Little Elm", "Denton", null],
  ["HALTOM_CITY_PD", "Haltom City", "Tarrant", null],
  ["KELLER_PD", "Keller", "Tarrant", null],
  ["ROCKWALL_PD", "Rockwall", "Rockwall", null],
  ["SHERMAN_PD", "Sherman", "Grayson", null],
  ["WEATHERFORD_PD", "Weatherford", "Parker", null],
  ["CLEBURNE_PD", "Cleburne", "Johnson", null],
  ["BURLESON_PD", "Burleson", "Johnson", null],
  ["ROSENBERG_PD", "Rosenberg", "Fort Bend", null],
  ["SCHERTZ_PD", "Schertz", "Guadalupe", null],
  ["SEGUIN_PD", "Seguin", "Guadalupe", null],
  ["HUNTSVILLE_PD", "Huntsville", "Walker", null],
  ["TEXARKANA_PD", "Texarkana", "Bowie", null],
  ["LUFKIN_PD", "Lufkin", "Angelina", null],
  ["NACOGDOCHES_PD", "Nacogdoches", "Nacogdoches", null],
  ["COPPERAS_COVE_PD", "Copperas Cove", "Coryell", null],
  ["HARKER_HEIGHTS_PD", "Harker Heights", "Bell", null],
  ["KATY_PD", "Katy", "Harris", null],
  ["FRIENDSWOOD_PD", "Friendswood", "Galveston", null],
  ["LAKE_JACKSON_PD", "Lake Jackson", "Brazoria", null],
  ["ALVIN_PD", "Alvin", "Brazoria", null],
  ["ANGLETON_PD", "Angleton", "Brazoria", null],
  ["FREEPORT_PD", "Freeport", "Brazoria", null],
  ["LA_PORTE_PD", "La Porte", "Harris", null],
  ["DEER_PARK_PD", "Deer Park", "Harris", null],
  ["HUMBLE_PD", "Humble", "Harris", null],
  ["SPRING_VALLEY_PD", "Spring Valley Village", "Harris", null],
  ["WESLACO_PD", "Weslaco", "Hidalgo", null],
  ["DONNA_PD", "Donna", "Hidalgo", null],
  ["ALAMO_PD", "Alamo", "Hidalgo", null],
  ["RIO_GRANDE_CITY_PD", "Rio Grande City", "Starr", null],
  ["ROMA_PD", "Roma", "Starr", null],
  ["ZAPATA_PD", "Zapata", "Zapata", null],
  ["FALFURRIAS_PD", "Falfurrias", "Brooks", null],
  ["KINGSVILLE_PD", "Kingsville", "Kleberg", null],
  ["ALICE_PD", "Alice", "Jim Wells", null],
  ["ROBSTOWN_PD", "Robstown", "Nueces", null],
  ["PORT_ISABEL_PD", "Port Isabel", "Cameron", null],
  ["SAN_BENITO_PD", "San Benito", "Cameron", null],
  ["LOS_FRESNOS_PD", "Los Fresnos", "Cameron", null],
  ["UVALDE_PD", "Uvalde", "Uvalde", null],
  ["CARRIZO_SPRINGS_PD", "Carrizo Springs", "Dimmit", null],
  ["PEARSALL_PD", "Pearsall", "Frio", null],
  ["EAGLE_PASS_PD", "Eagle Pass", "Maverick", null]
];

function slugCity(city) {
  return city
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

const seen = {};
const agencies = [];
rows.forEach(function (row) {
  const code = row[0] || slugCity(row[1]) + "_PD";
  if (seen[code]) {
    return;
  }
  seen[code] = true;
  const rec = {
    code: code,
    label: row[1] + " Police Department",
    level: "municipal",
    type: "police",
    state: "TX",
    county: row[2],
    city: row[1],
    aliases: [row[1] + " PD", code],
    active: true
  };
  if (row[3]) {
    rec.website = row[3];
  }
  agencies.push(rec);
});

agencies.sort(function (a, b) {
  return a.city.localeCompare(b.city);
});

const body = agencies
  .map(function (a) {
    return "  " + JSON.stringify(a);
  })
  .join(",\n");

const file =
  "// Texas municipal police departments.\n" +
  "// Largest cities, DFW/Houston/Austin/SA rings, and border cities.\n" +
  "// Not a full TCOLE roster of 1,200+ PDs.\n\n" +
  "var TEXAS_MUNICIPAL_PDS = [\n" +
  body +
  "\n];\n\n" +
  "function texasMunicipalPdLabels() {\n" +
  "  return TEXAS_MUNICIPAL_PDS.map(function (a) {\n" +
  "    return a.label;\n" +
  "  });\n" +
  "}\n";

fs.writeFileSync(path.join(__dirname, "..", "data/le/texas-municipal-pd.js"), file);
console.log("wrote", agencies.length, "municipal PDs");
