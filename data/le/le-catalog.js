/**
 * Builds LAW_ENFORCEMENT_AGENCIES from the split LE libraries.
 * Agencies only — jails, detention, and lookup tools stay in their own files.
 */
function leAsArray(value) {
  return Array.isArray(value) ? value : [];
}

function leSourceLevel(source) {
  if (source === "federal" || source === "federal_office" || source === "ice_ero") {
    return "federal";
  }
  if (source === "texas_state") {
    return "state";
  }
  if (source === "sheriff") {
    return "county";
  }
  if (source === "city_pd") {
    return "municipal";
  }
  return source;
}

function normalizeAgency(raw, source) {
  var aliases = Array.isArray(raw.aliases) ? raw.aliases.slice() : [];
  if (source === "ice_ero" && raw.label && aliases.indexOf("ICE ERO " + raw.label) === -1) {
    aliases.push("ICE ERO " + raw.label);
  }

  return {
    code: raw.code,
    label: raw.label,
    level: raw.level || leSourceLevel(source),
    type: raw.type || source,
    parent: raw.parent || null,
    state: raw.state || (leSourceLevel(source) === "federal" ? "US" : "TX"),
    county: raw.county || "",
    city: raw.city || "",
    aliases: aliases,
    website: raw.website || "",
    description: raw.description || "",
    components: Array.isArray(raw.components) ? raw.components.slice() : [],
    active: raw.active !== false,
    source: source
  };
}

function buildLawEnforcementAgencies() {
  var catalog = [];
  var seen = {};

  function addList(list, source) {
    leAsArray(list).forEach(function (raw) {
      if (!raw || !raw.code || raw.active === false) {
        return;
      }
      if (seen[raw.code]) {
        return;
      }
      seen[raw.code] = true;
      catalog.push(normalizeAgency(raw, source));
    });
  }

  addList(typeof FEDERAL_LE_AGENCIES !== "undefined" ? FEDERAL_LE_AGENCIES : [], "federal");
  addList(typeof TEXAS_STATE_LE !== "undefined" ? TEXAS_STATE_LE : [], "texas_state");
  addList(typeof TEXAS_SHERIFFS !== "undefined" ? TEXAS_SHERIFFS : [], "sheriff");
  addList(typeof TEXAS_MUNICIPAL_PDS !== "undefined" ? TEXAS_MUNICIPAL_PDS : [], "city_pd");
  addList(
    typeof TEXAS_OTHER_LOCAL_LE !== "undefined" ? TEXAS_OTHER_LOCAL_LE : [],
    "other_local"
  );
  addList(
    typeof TEXAS_FEDERAL_OFFICES !== "undefined" ? TEXAS_FEDERAL_OFFICES : [],
    "federal_office"
  );
  addList(typeof ICE_ERO_OFFICES_TX !== "undefined" ? ICE_ERO_OFFICES_TX : [], "ice_ero");

  var famousSheriffAliases = {
    TX_SO_HARRIS: ["HCSO"],
    TX_SO_DALLAS: ["DCSO"],
    TX_SO_TARRANT: ["TCSO"],
    TX_SO_BEXAR: ["BCSO"],
    TX_SO_TRAVIS: ["TCSO"],
    TX_SO_HIDALGO: ["HCSO"],
    TX_SO_WEBB: ["WCSO"],
    TX_SO_EL_PASO: ["EPCSO"],
    TX_SO_CAMERON: ["CCSO"],
    TX_SO_NUECES: ["NCSO"],
    TX_SO_FORT_BEND: ["FBSO"],
    TX_SO_MONTGOMERY: ["MCSO"],
    TX_SO_WILLIAMSON: ["WCSO"]
  };
  catalog.forEach(function (agency) {
    var extra = famousSheriffAliases[agency.code];
    if (!extra) {
      return;
    }
    extra.forEach(function (alias) {
      if (agency.aliases.indexOf(alias) === -1) {
        agency.aliases.push(alias);
      }
    });
  });

  leAsArray(typeof TEXAS_JAILS !== "undefined" ? TEXAS_JAILS : []).forEach(function (jail) {
    var county = String(jail.county || "").toLowerCase();
    if (!county) {
      return;
    }
    catalog.forEach(function (agency) {
      if (agency.type !== "sheriff" || agency.county.toLowerCase() !== county) {
        return;
      }
      if (jail.label && agency.aliases.indexOf(jail.label) === -1) {
        agency.aliases.push(jail.label);
      }
    });
  });

  return catalog;
}

var LAW_ENFORCEMENT_AGENCIES = buildLawEnforcementAgencies();
