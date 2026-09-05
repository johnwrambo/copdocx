/** Officer roster UI: formatted reads, assignment picker and compatibility exports. */
(function (global) {
  "use strict";
  var root = (global.COPDoc = global.COPDoc || {});
  function app() { return root.application.admin; }
  function readAdminStrict() { return app().readAdmin(); }
  function isActive(row) { return app().isActive(row); }
  function isCommitted(row) {
    if (root.model && typeof root.model.isCommitted === "function") { return root.model.isCommitted(row); }
    return !row || !row.meta || row.meta.status !== "draft";
  }
  function readAdmin() {
    var loaded = readAdminStrict();
    return loaded.ok ? loaded.data : { officers: [], vehicles: [], shifts: [] };
  }

  function listCommitted() {
    var officers = readAdmin().officers || [];
    return officers.filter(function (row) {
      return isActive(row) && isCommitted(row);
    });
  }

  function listShifts() {
    var shifts = readAdmin().shifts || [];
    return Array.isArray(shifts) ? shifts.slice() : [];
  }

  function listFleet() {
    var vehicles = readAdmin().vehicles || [];
    return vehicles.filter(function (row) {
      return isActive(row) && isCommitted(row) && row.governmentVehicle;
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
    var list = readAdmin().officers || [];
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
    recordFieldArrest: function () { return app().recordFieldArrest.apply(null, arguments); },
    voidFieldArrest: function () { return app().voidFieldArrest.apply(null, arguments); },
    retractFieldArrest: function () { return app().voidFieldArrest.apply(null, arguments); },
    listFieldArrests: function () { return app().listFieldArrests.apply(null, arguments); },
    isActive: isActive,
    isVoided: function () { return app().isVoided.apply(null, arguments); },
    readAdmin: readAdminStrict,
    saveOfficer: function (patch, options) { return app().saveOfficer(patch, options); },
    saveFleetVehicle: function (patch, options) { return app().saveFleetVehicle(patch, options); },
    archiveRecord: function () { return app().archiveRecord.apply(null, arguments); },
    restoreRecord: function () { return app().restoreRecord.apply(null, arguments); },
    inspectDependencies: function () { return app().inspectDependencies.apply(null, arguments); },
    deleteDraft: function () { return app().deleteDraft.apply(null, arguments); }
  };
})(typeof window !== "undefined" ? window : globalThis);
