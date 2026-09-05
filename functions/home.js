/**
 * Home briefing hub. Read-only cross-store snapshot.
 * Do not write leads, admin, or book-in storage from this page.
 */
(function () {
  "use strict";

  if (!document.body || document.body.getAttribute("data-page") !== "home") {
    return;
  }

  var config = window.COPDoc && COPDoc.config;
  var WORKSPACE_KEY =
    (config && config.storageKey("workspace")) || "copdocx.store.v1";
  var ADMIN_KEY =
    (config && config.storageKey("admin")) || "copdoc.admin.v1";
  var BOOKIN_KEY =
    (config && config.storageKey("bookin")) ||
    "alien-book-in.saved-records.v1";

  function byId(id) {
    return document.getElementById(id);
  }

  function readJson(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (error) {
      if (window.COPDoc && COPDoc.setAppBarStatus) {
        COPDoc.setAppBarStatus("Some local workspace data could not be read.");
      }
      return fallback;
    }
  }

  function committed(row) {
    return !!row && (!row.meta || row.meta.status !== "draft");
  }

  function rowTime(row) {
    return String(
      (row && row.meta &&
        (row.meta.updatedAt || row.meta.committedAt || row.meta.createdAt)) ||
        (row && (row.updatedAt || row.createdAt)) ||
        ""
    );
  }

  function localDay(date) {
    var year = date.getFullYear();
    var month = String(date.getMonth() + 1).padStart(2, "0");
    var day = String(date.getDate()).padStart(2, "0");
    return year + "-" + month + "-" + day;
  }

  function personName(lead) {
    var person = lead && lead.person;
    if (!person && lead && Array.isArray(lead.people)) {
      person = lead.people.filter(function (row) {
        return row && row.personId === lead.subjectPersonId;
      })[0] || lead.people[0];
    }
    var fields = (person && person.name) || person || {};
    var given = [fields.firstName, fields.middleName].filter(Boolean).join(" ");
    var name = [fields.lastName, given].filter(Boolean).join(", ");
    return name || (lead && lead.leadId) || "Untitled case";
  }

  function officerName(row) {
    return (
      [row && row.lastName, row && row.firstName].filter(Boolean).join(", ") ||
      (row && (row.callSign || row.badge || row.officerId || row.id)) ||
      "Officer"
    );
  }

  function addressLine(loc) {
    if (!loc) {
      return "";
    }
    var cityState = [loc.city, loc.state].filter(Boolean).join(", ");
    return [loc.street, cityState].filter(Boolean).join(" · ");
  }

  function addLocations(out, rows, lead, subject) {
    (rows || []).forEach(function (loc) {
      if (!loc || !String(loc.targetPriority || "").trim()) {
        return;
      }
      var lat = Number(loc.latitude);
      var lng = Number(loc.longitude);
      if (!isFinite(lat) || !isFinite(lng) || (lat === 0 && lng === 0)) {
        return;
      }
      out.push({
        label: "Priority " + loc.targetPriority + " · " + subject,
        meta: addressLine(loc) || "Mapped location",
        rank: Number(loc.targetPriority) || 99,
        href: "map.html"
      });
    });
  }

  function paintList(listId, noteId, rows, emptyText) {
    var list = byId(listId);
    var note = byId(noteId);
    if (!list || !note) {
      return;
    }
    list.replaceChildren();
    rows.slice(0, 6).forEach(function (row) {
      var li = document.createElement("li");
      var link = document.createElement("a");
      link.href = row.href || "#";
      link.textContent = row.label || "Untitled";
      li.appendChild(link);
      if (row.meta) {
        var meta = document.createElement("span");
        meta.className = "dash-meta";
        meta.textContent = row.meta;
        li.appendChild(meta);
      }
      list.appendChild(li);
    });
    list.hidden = !rows.length;
    note.hidden = !!rows.length;
    note.textContent = rows.length ? "" : emptyText;
  }

  function paintSnapshot() {
    var workspace = readJson(WORKSPACE_KEY, {});
    var admin = readJson(ADMIN_KEY, {});
    var bookins = readJson(BOOKIN_KEY, []);
    var leads = Object.keys(workspace.leads || {}).map(function (id) {
      return workspace.leads[id];
    }).filter(committed);
    var officers = (admin.officers || []).filter(function (row) {
      return committed(row) && !row.junked;
    });
    var vehicles = (admin.vehicles || []).filter(function (row) {
      return committed(row) && !row.junked;
    });
    var now = new Date();
    var today = localDay(now);
    var weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
    var weekEnd = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 6);
    var weekFrom = localDay(weekStart);
    var weekTo = localDay(weekEnd);
    var weekBookins = (Array.isArray(bookins) ? bookins : []).filter(function (row) {
      var day = rowTime(row).slice(0, 10);
      return day >= weekFrom && day <= weekTo;
    });

    byId("homeStatLeads").textContent = String(leads.length);
    byId("homeStatOfficers").textContent = String(
      officers.filter(function (row) { return (row.duty || "available") === "available"; }).length
    );
    byId("homeStatVehicles").textContent = String(
      vehicles.filter(function (row) { return (row.status || "available") === "available"; }).length
    );
    byId("homeStatBookins").textContent = String(weekBookins.length);

    var recent = leads.slice().sort(function (a, b) {
      return rowTime(b).localeCompare(rowTime(a));
    }).map(function (lead) {
      return {
        label: personName(lead),
        meta: (lead.source && lead.source.caseNumber) || rowTime(lead).slice(0, 10),
        href: "case.html?id=" + encodeURIComponent(lead.leadId || "")
      };
    });
    paintList("homeLeadsPreview", "homeLeadsNote", recent, "No filed cases.");

    var officerById = {};
    officers.forEach(function (row) {
      officerById[row.officerId || row.id] = row;
    });
    var duty = (admin.shifts || []).filter(function (row) {
      return row && row.date === today && officerById[row.officerId];
    }).sort(function (a, b) {
      return String(a.start || "").localeCompare(String(b.start || ""));
    }).map(function (shift) {
      return {
        label: officerName(officerById[shift.officerId]),
        meta: [shift.start && shift.end ? shift.start + "–" + shift.end : "", shift.assignment]
          .filter(Boolean).join(" · "),
        href: "schedule.html"
      };
    });
    paintList("homeDutyPreview", "homeDutyNote", duty, "No shifts today.");

    var targets = [];
    leads.forEach(function (lead) {
      var subject = personName(lead);
      addLocations(targets, lead.person && lead.person.locations, lead, subject);
      (lead.vehicles || []).forEach(function (vehicle) {
        addLocations(targets, vehicle && vehicle.locations, lead, subject);
      });
      addLocations(targets, lead.locations, lead, subject);
    });
    targets.sort(function (a, b) {
      return a.rank - b.rank || a.label.localeCompare(b.label);
    });
    paintList(
      "homeTargetsPreview",
      "homeTargetsNote",
      targets,
      "No ranked locations with coordinates."
    );

    var followUps = [];
    leads.forEach(function (lead) {
      (lead.followUps || []).forEach(function (row) {
        if (!row || row.status === "done") {
          return;
        }
        followUps.push({
          label: row.label || row.type || "Follow-up",
          meta: personName(lead),
          href: "lead-form.html?id=" + encodeURIComponent(lead.leadId || "")
        });
      });
    });
    paintList(
      "homeFollowUpsPreview",
      "homeFollowUpsNote",
      followUps,
      "No open follow-ups."
    );
  }

  function bindTools() {
    var importButton = byId("homeImportButton");
    var exportButton = byId("homeExportButton");
    if (importButton) {
      importButton.addEventListener("click", function () {
        if (typeof window.openFileImport === "function") {
          window.openFileImport();
        }
      });
    }
    if (exportButton) {
      exportButton.addEventListener("click", function () {
        if (typeof window.openFileExport === "function") {
          window.openFileExport();
        }
      });
    }
  }

  function paintIcons() {
    if (window.COPDoc && COPDoc.icons && typeof COPDoc.icons.inject === "function") {
      COPDoc.icons.inject();
    }
    document.querySelectorAll("[data-icon]").forEach(function (el) {
      var name = el.getAttribute("data-icon") || "";
      var size = Number(el.getAttribute("data-icon-size")) || 18;
      if (window.COPDoc && typeof COPDoc.icon === "function") {
        el.innerHTML = COPDoc.icon(name, size);
      }
    });
  }

  function boot() {
    paintIcons();
    paintSnapshot();
    bindTools();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
