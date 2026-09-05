/**
 * Cross-store officer roster reads (copdoc.admin.v1).
 * Alias is initials + badge. Search-select for assigning one officer to a case.
 */
(function (global) {
  "use strict";

  var root = (global.COPDoc = global.COPDoc || {});
  var ADMIN_KEY =
    (root.config && root.config.storageKey("admin")) || "copdoc.admin.v1";

  function isCommitted(row) {
    if (root.model && typeof root.model.isCommitted === "function") {
      return root.model.isCommitted(row);
    }
    return !row || !row.meta || row.meta.status !== "draft";
  }

  function readAdmin() {
    try {
      return JSON.parse(global.localStorage.getItem(ADMIN_KEY) || "{}") || {};
    } catch (error) {
      return {};
    }
  }

  function listCommitted() {
    var officers = readAdmin().officers || [];
    return officers.filter(function (row) {
      return row && !row.junked && isCommitted(row);
    });
  }

  function listShifts() {
    var shifts = readAdmin().shifts || [];
    return Array.isArray(shifts) ? shifts.slice() : [];
  }

  function listFleet() {
    var vehicles = readAdmin().vehicles || [];
    return vehicles.filter(function (row) {
      return row && !row.junked && isCommitted(row) && row.governmentVehicle;
    });
  }

  function groupsByTeam() {
    var groups = {};
    listCommitted().forEach(function (officer) {
      var key = String(officer.team || "").trim() || "(no team)";
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(officer);
    });
    return Object.keys(groups)
      .sort()
      .map(function (key) {
        return { teamKey: key, officers: groups[key] };
      });
  }

  function get(id) {
    if (!id) {
      return null;
    }
    var list = (readAdmin().officers || []).filter(isCommitted);
    var i;
    for (i = 0; i < list.length; i++) {
      if (list[i].id === id || list[i].officerId === id) {
        return list[i];
      }
    }
    return null;
  }

  function initials(officer) {
    if (!officer) {
      return "";
    }
    return [officer.firstName, officer.middleName, officer.lastName]
      .map(function (part) {
        return String(part || "")
          .trim()
          .charAt(0);
      })
      .filter(Boolean)
      .join("")
      .toUpperCase();
  }

  function alias(officer) {
    if (!officer) {
      return "";
    }
    var badge = String(officer.badge || "").replace(/\s/g, "").toUpperCase();
    return (initials(officer) + badge).toUpperCase();
  }

  function aliasForId(id) {
    return alias(get(id));
  }

  function label(officer) {
    if (!officer) {
      return "";
    }
    var first = [officer.firstName, officer.middleName].filter(Boolean).join(" ");
    return [officer.lastName, first].filter(Boolean).join(", ");
  }

  function display(officer) {
    if (!officer) {
      return "";
    }
    var code = alias(officer);
    var name = label(officer);
    if (name && code) {
      return name + " · " + code;
    }
    return name || code;
  }

  function hay(officer) {
    return [
      officer.lastName,
      officer.firstName,
      officer.middleName,
      officer.badge,
      officer.callSign,
      alias(officer)
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
  }

  function search(query) {
    var q = String(query || "")
      .trim()
      .toLowerCase();
    var rows = listCommitted().slice().sort(function (a, b) {
      return label(a).localeCompare(label(b));
    });
    if (!q) {
      return rows;
    }
    return rows.filter(function (officer) {
      return hay(officer).indexOf(q) !== -1;
    });
  }

  function bindAssign(opts) {
    opts = opts || {};
    var searchEl = opts.search;
    var hidden = opts.hidden;
    var results = opts.results;
    if (!searchEl || !hidden || !results) {
      return;
    }

    function showChosen(id) {
      hidden.value = id || "";
      var officer = get(id);
      searchEl.value = officer ? display(officer) : "";
    }

    function hideResults() {
      results.hidden = true;
      results.replaceChildren();
      searchEl.setAttribute("aria-expanded", "false");
    }

    function pick(id) {
      var prev = hidden.value || "";
      showChosen(id);
      hideResults();
      if (prev === (id || "")) {
        return;
      }
      if (typeof searchEl._officerOnChange === "function") {
        searchEl._officerOnChange(id || "");
      }
    }

    function paintResults(query) {
      var rows = search(query);
      results.replaceChildren();
      if (!rows.length) {
        var empty = document.createElement("li");
        empty.className = "search-empty";
        empty.textContent = "No matching officers.";
        results.appendChild(empty);
      } else {
        rows.slice(0, 20).forEach(function (officer) {
          var li = document.createElement("li");
          li.setAttribute("role", "option");
          li.dataset.officerId = officer.officerId || officer.id;
          li.textContent = label(officer);
          var meta = document.createElement("span");
          meta.className = "search-meta";
          meta.textContent = [alias(officer), officer.badge, officer.callSign]
            .filter(Boolean)
            .filter(function (bit, i, arr) {
              return arr.indexOf(bit) === i;
            })
            .join(" · ");
          if (meta.textContent) {
            li.appendChild(meta);
          }
          li.addEventListener("mousedown", function (event) {
            event.preventDefault();
            pick(li.dataset.officerId);
          });
          results.appendChild(li);
        });
      }
      results.hidden = false;
      searchEl.setAttribute("aria-expanded", "true");
    }

    searchEl._officerOnChange = opts.onChange;
    if (searchEl.dataset.officerAssignBound === "true") {
      if (document.activeElement !== searchEl) {
        showChosen(opts.value || hidden.value || "");
      }
      return;
    }
    searchEl.dataset.officerAssignBound = "true";
    searchEl.setAttribute("role", "combobox");
    searchEl.setAttribute("aria-autocomplete", "list");
    searchEl.setAttribute("aria-expanded", "false");
    if (results.id) {
      searchEl.setAttribute("aria-controls", results.id);
    }
    showChosen(opts.value || "");

    searchEl.addEventListener("focus", function () {
      paintResults("");
      if (typeof searchEl.select === "function") {
        searchEl.select();
      }
    });
    searchEl.addEventListener("input", function () {
      if (!String(searchEl.value || "").trim()) {
        if (hidden.value) {
          pick("");
        }
        paintResults("");
        return;
      }
      paintResults(searchEl.value);
    });
    searchEl.addEventListener("blur", function () {
      global.setTimeout(function () {
        hideResults();
        if (!String(searchEl.value || "").trim()) {
          if (hidden.value) {
            pick("");
          } else {
            showChosen("");
          }
          return;
        }
        showChosen(hidden.value);
      }, 150);
    });
    searchEl.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        hideResults();
        showChosen(hidden.value);
        searchEl.blur();
      }
    });
  }

  function recordFieldArrest(officerId, entry) {
    entry = entry || {};
    var id = String(officerId || "").trim();
    if (!id) {
      return { ok: false, error: "Officer is missing." };
    }
    function text(value) { return String(value == null ? "" : value).trim(); }
    function bookingClaims(row) {
      return [text(row && row.bookingId), text(row && row.bookinRecordId)]
        .filter(function (value, index, values) { return value && values.indexOf(value) === index; });
    }
    var arrestId = text(entry.arrestId);
    var bookingIds = bookingClaims(entry);
    if (!arrestId || bookingIds.length > 1) {
      return { ok: false, error: "A stable Arrest identifier and consistent booking identifiers are required." };
    }
    var admin;
    try {
      var raw = global.localStorage.getItem(ADMIN_KEY);
      admin = raw === null ? { officers: [] } : JSON.parse(raw);
      if (!admin || typeof admin !== "object" || Array.isArray(admin) || !Array.isArray(admin.officers)) {
        return { ok: false, error: "Officer storage is malformed. Run Integrity before retrying." };
      }
    } catch (error) {
      return { ok: false, error: "Could not read officer storage. Run Integrity before retrying." };
    }
    var matches = admin.officers.filter(function (row) {
      return row && (text(row.id) === id || text(row.officerId) === id);
    });
    if (matches.length !== 1) {
      return { ok: false, error: matches.length ? "Officer identity is duplicated." : "Officer not found." };
    }
    var officer = matches[0];
    var incoming = {
      arrestId: arrestId, bookingId: bookingIds[0] || "", subjectId: text(entry.subjectId),
      encounterId: text(entry.encounterId), personId: text(entry.personId)
    };
    var conflict = "";
    var existing = null;
    admin.officers.forEach(function (owner) {
      if (!owner || typeof owner !== "object" || Array.isArray(owner) ||
          (owner.fieldArrests !== undefined && !Array.isArray(owner.fieldArrests))) {
        conflict = "Officer Arrest storage is malformed. Run Integrity before retrying.";
        return;
      }
      var arrestMatches = 0;
      (owner.fieldArrests || []).forEach(function (row) {
        var aliases = bookingClaims(row);
        var sameArrest = text(row && row.arrestId) === arrestId;
        var sameBooking = incoming.bookingId && aliases.indexOf(incoming.bookingId) !== -1;
        if (!sameArrest && !sameBooking) { return; }
        arrestMatches += 1;
        if (!row || aliases.length > 1 || !sameArrest ||
            ["subjectId", "personId", "encounterId"].some(function (field) {
              return incoming[field] && text(row[field]) && incoming[field] !== text(row[field]);
            }) || (incoming.bookingId && aliases.length && aliases[0] !== incoming.bookingId)) {
          conflict = "Officer Arrest identity conflicts with this booking.";
        }
        if (owner === officer) { existing = row; }
      });
      if (arrestMatches > 1) { conflict = "Officer Arrest identity is duplicated."; }
    });
    if (conflict) { return { ok: false, error: conflict }; }
    officer.fieldArrests = officer.fieldArrests || [];
    var before = JSON.stringify(existing);
    if (existing) {
      Object.keys(incoming).forEach(function (field) {
        if (incoming[field]) { existing[field] = incoming[field]; }
      });
      if (incoming.bookingId && Object.prototype.hasOwnProperty.call(existing, "bookinRecordId")) {
        existing.bookinRecordId = incoming.bookingId;
      }
      if (JSON.stringify(existing) === before) { return { ok: true, error: "" }; }
    } else {
      incoming.bookedAt = text(entry.bookedAt) || new Date().toISOString();
      officer.fieldArrests.push(incoming);
    }
    try {
      global.localStorage.setItem(ADMIN_KEY, JSON.stringify(admin));
    } catch (error) {
      return { ok: false, error: "Could not write the officer profile." };
    }
    return { ok: true, error: "" };
  }

  root.officers = {
    listCommitted: listCommitted,
    listShifts: listShifts,
    listFleet: listFleet,
    groupsByTeam: groupsByTeam,
    get: get,
    initials: initials,
    alias: alias,
    aliasForId: aliasForId,
    label: label,
    display: display,
    search: search,
    bindAssign: bindAssign,
    recordFieldArrest: recordFieldArrest
  };
})(typeof window !== "undefined" ? window : globalThis);
