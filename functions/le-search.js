/**
 * Unified law-enforcement agency search.
 *
 * Search across federal agencies, Texas state LE, city PDs, county sheriffs,
 * and ICE ERO field offices. Reuse searchLawEnforcementAgencies() or
 * attachLawEnforcementSearch() on any text input.
 */

var LE_STOP_WORDS = {
  of: true,
  and: true,
  the: true,
  for: true,
  de: true,
  la: true
};

var LE_ABBREVIATIONS = {
  pd: ["police", "police department"],
  so: ["sheriff", "sheriff office", "sheriffs office"],
  sheriff: ["sheriff office", "sheriffs office"],
  hp: ["highway patrol"],
  dps: ["department of public safety"],
  ero: ["enforcement and removal operations"],
  hsi: ["homeland security investigations"],
  cbp: ["customs and border protection"],
  fo: ["field office"],
  le: ["law enforcement"],
  oig: ["inspector general"]
};

function leList(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeSearchText(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function acronymFromLabel(label) {
  var words = String(label || "")
    .replace(/['’]s\b/gi, "")
    .split(/[^A-Za-z0-9]+/)
    .filter(function (word) {
      return word.length > 1 && !LE_STOP_WORDS[word.toLowerCase()];
    });

  if (words.length < 2) {
    return "";
  }

  return words
    .map(function (word) {
      return word.charAt(0);
    })
    .join("")
    .toUpperCase();
}

function sourceLabel(source) {
  var labels = {
    federal: "Federal",
    federal_office: "Federal office",
    texas_state: "Texas state",
    city_pd: "City PD",
    sheriff: "Sheriff",
    other_local: "Local",
    ice_ero: "ICE ERO"
  };
  return labels[source] || source;
}

function buildAgencyRecord(raw, source) {
  var label = raw.agency || raw.label || raw.code;
  var acronym = acronymFromLabel(label);
  var extraAcronym = raw.label && raw.label !== label ? acronymFromLabel(raw.label) : "";
  var haystack = normalizeSearchText(
    [
      raw.code,
      label,
      raw.label,
      raw.agency,
      raw.city,
      raw.county,
      raw.state,
      raw.level,
      raw.type,
      raw.parent,
      acronym,
      extraAcronym,
      Array.isArray(raw.aliases) ? raw.aliases.join(" ") : "",
      Array.isArray(raw.components) ? raw.components.join(" ") : ""
    ]
      .filter(Boolean)
      .join(" ")
  );
  var wideHaystack = normalizeSearchText(
    haystack + " " + (raw.description || "") + " " + (raw.notes || "")
  );

  return {
    code: raw.code,
    label: label,
    type: raw.type || source,
    source: source,
    city: raw.city || "",
    county: raw.county || "",
    parent: raw.parent || "",
    acronym: acronym || extraAcronym,
    aliases: leList(raw.aliases),
    haystack: haystack,
    wideHaystack: wideHaystack
  };
}

function getLawEnforcementCatalog() {
  if (typeof LAW_ENFORCEMENT_AGENCIES !== "undefined") {
    return leList(LAW_ENFORCEMENT_AGENCIES).map(function (raw) {
      return buildAgencyRecord(raw, raw.source || raw.level || "agency");
    });
  }

  var catalog = [];
  var seen = {};

  function addList(list, source) {
    leList(list).forEach(function (raw) {
      if (!raw || raw.active === false || !raw.code) {
        return;
      }
      var key = source + ":" + raw.code;
      if (seen[key]) {
        return;
      }
      seen[key] = true;
      catalog.push(buildAgencyRecord(raw, source));
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
  addList(
    typeof ICE_ERO_OFFICES_TX !== "undefined" ? ICE_ERO_OFFICES_TX : [],
    "ice_ero"
  );

  return catalog;
}

var lawEnforcementCatalog = getLawEnforcementCatalog();

function tokenExpansions(token) {
  var extra = LE_ABBREVIATIONS[token];
  if (!extra) {
    return [token];
  }
  return [token].concat(extra);
}

function haystackHasToken(haystack, token) {
  if (!token) {
    return false;
  }
  var padded = " " + haystack + " ";
  if (token.indexOf(" ") !== -1) {
    return padded.indexOf(" " + token) !== -1;
  }
  return padded.indexOf(" " + token) !== -1;
}

function scoreAgency(record, query, tokens) {
  var haystack = record.haystack;
  var wide = record.wideHaystack;
  var code = normalizeSearchText(record.code);
  var label = normalizeSearchText(record.label);
  var acronym = normalizeSearchText(record.acronym);

  var aliasHit = leList(record.aliases).some(function (alias) {
    return normalizeSearchText(alias) === query;
  });
  if (code === query) {
    return 120;
  }
  if (aliasHit) {
    return 118;
  }
  if (label === query) {
    return 110;
  }
  if (acronym === query) {
    return 82;
  }
  if ((" " + code + " ").indexOf(" " + query + " ") !== -1) {
    if (normalizeSearchText(record.city) === query && record.type === "police") {
      return 108;
    }
    return 100;
  }
  if (label.indexOf(query) === 0 || acronym.indexOf(query) === 0) {
    if (normalizeSearchText(record.city) === query && record.source === "city_pd") {
      return 103;
    }
    return 95;
  }

  var matchedOnCore = true;
  var i;
  for (i = 0; i < tokens.length; i++) {
    var expansions = tokenExpansions(tokens[i]);
    var hit = false;
    var e;
    for (e = 0; e < expansions.length; e++) {
      if (haystackHasToken(haystack, expansions[e])) {
        hit = true;
        break;
      }
    }
    if (!hit) {
      matchedOnCore = false;
      break;
    }
  }

  if (matchedOnCore) {
    var score = 70 + Math.min(tokens.length * 4, 20);
    if (tokens.length === 1 && (code.indexOf(query) === 0 || acronym.indexOf(query) === 0)) {
      score = 90;
    }
    if (normalizeSearchText(record.city) === query && record.source === "city_pd") {
      score += 8;
    }
    return score;
  }

  for (i = 0; i < tokens.length; i++) {
    var wideHit = false;
    var wideExpansions = tokenExpansions(tokens[i]);
    var w;
    for (w = 0; w < wideExpansions.length; w++) {
      if (haystackHasToken(wide, wideExpansions[w])) {
        wideHit = true;
        break;
      }
    }
    if (!wideHit) {
      return 0;
    }
  }

  return 35;
}

function searchLawEnforcementAgencies(query, options) {
  var limit = options && options.limit ? options.limit : 12;
  var catalog = options && options.catalog ? options.catalog : lawEnforcementCatalog;
  var normalized = normalizeSearchText(query);

  if (!normalized) {
    return [];
  }

  var tokens = normalized.split(" ");
  var ranked = [];

  catalog.forEach(function (record) {
    var score = scoreAgency(record, normalized, tokens);
    if (score > 0) {
      ranked.push({
        score: score,
        record: record
      });
    }
  });

  ranked.sort(function (a, b) {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return a.record.label.localeCompare(b.record.label);
  });

  return ranked.slice(0, limit);
}

function agencyMetaLine(record) {
  var bits = [sourceLabel(record.source)];
  if (record.city) {
    bits.push(record.city);
  }
  if (record.county && record.county !== record.city) {
    bits.push(record.county + " County");
  }
  if (record.acronym) {
    bits.push(record.acronym);
  }
  return bits.join(" · ");
}

function attachLawEnforcementSearch(input, options) {
  if (!input) {
    return;
  }

  options = options || {};
  var resultsList = options.resultsList;
  if (!resultsList) {
    return;
  }
  var codeInput = options.codeInput || null;
  var limit = options.limit || 12;
  var activeIndex = -1;
  var visible = [];

  function setExpanded(isOpen) {
    input.setAttribute("aria-expanded", isOpen ? "true" : "false");
  }

  function hideResults() {
    resultsList.hidden = true;
    resultsList.innerHTML = "";
    activeIndex = -1;
    visible = [];
    setExpanded(false);
  }

  function highlight(index) {
    var items = resultsList.querySelectorAll('[role="option"]');
    activeIndex = index;
    items.forEach(function (item, i) {
      item.setAttribute("aria-selected", i === index ? "true" : "false");
    });
    if (items[index]) {
      items[index].scrollIntoView({ block: "nearest" });
    }
  }

  function choose(record) {
    input.value = record.label;
    input.dataset.agencyCode = record.code;
    if (codeInput) {
      codeInput.value = record.code;
    }
    hideResults();
    input.focus();
  }

  function render(results) {
    resultsList.innerHTML = "";
    visible = results;
    activeIndex = -1;

    if (!input.value.trim()) {
      hideResults();
      return;
    }

    if (!results.length) {
      var empty = document.createElement("li");
      empty.className = "search-empty";
      empty.textContent = "No agency match — text will be kept as entered";
      resultsList.appendChild(empty);
      resultsList.hidden = false;
      setExpanded(true);
      return;
    }

    results.forEach(function (hit, index) {
      var record = hit.record;
      var item = document.createElement("li");
      item.setAttribute("role", "option");
      item.setAttribute("aria-selected", "false");
      item.dataset.index = String(index);

      var name = document.createElement("span");
      name.textContent = record.label;
      item.appendChild(name);

      var meta = document.createElement("span");
      meta.className = "search-meta";
      meta.textContent = agencyMetaLine(record);
      item.appendChild(meta);

      item.addEventListener("mousedown", function (event) {
        event.preventDefault();
        choose(record);
      });

      resultsList.appendChild(item);
    });

    resultsList.hidden = false;
    setExpanded(true);
  }

  function runSearch() {
    if (codeInput && input.dataset.agencyCode && input.value) {
      var selected = lawEnforcementCatalog.filter(function (record) {
        return record.code === input.dataset.agencyCode;
      })[0];
      if (!selected || selected.label !== input.value) {
        delete input.dataset.agencyCode;
        codeInput.value = "";
      }
    } else if (codeInput && !input.value) {
      codeInput.value = "";
      delete input.dataset.agencyCode;
    }

    render(searchLawEnforcementAgencies(input.value, { limit: limit }));
  }

  input.addEventListener("input", runSearch);
  input.addEventListener("focus", runSearch);

  input.addEventListener("keydown", function (event) {
    if (resultsList.hidden) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      highlight(Math.min(activeIndex + 1, visible.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      highlight(Math.max(activeIndex - 1, 0));
    } else if (event.key === "Enter") {
      if (activeIndex >= 0 && visible[activeIndex]) {
        event.preventDefault();
        choose(visible[activeIndex].record);
      }
    } else if (event.key === "Escape") {
      hideResults();
    }
  });

  input.addEventListener("blur", function () {
    window.setTimeout(hideResults, 120);
  });
}

attachLawEnforcementSearch(document.getElementById("refAgency"), {
  resultsList: document.getElementById("refAgencyResults"),
  codeInput: document.getElementById("refAgencyCode")
});