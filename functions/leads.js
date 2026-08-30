/**
 * Lead list and view painters.
 */
(function () {
  var recordFilter = "all";

  function model() {
    return window.COPDoc && COPDoc.model;
  }

  function byId(id) {
    return document.getElementById(id);
  }

  function queryId() {
    if (window.COPDoc && COPDoc.chrome && COPDoc.chrome.queryId) {
      return COPDoc.chrome.queryId();
    }
    try {
      return new URLSearchParams(window.location.search).get("id") || "";
    } catch (error) {
      return "";
    }
  }

  function pageKey() {
    return document.body.getAttribute("data-page") || "";
  }

  function displayOrDash(value) {
    var text = String(value == null ? "" : value).trim();
    return text || "—";
  }

  function formatWhen(iso) {
    if (!iso) {
      return "—";
    }
    var day = String(iso).slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(day)) {
      return day;
    }
    return displayOrDash(iso);
  }

  function sourceLine(snapshot) {
    var source = (snapshot && snapshot.source) || {};
    var label =
      typeof sourceLabel === "function"
        ? sourceLabel(source.leadSource)
        : source.leadSource || "";
    return [label, source.caseNumber].filter(Boolean).join(" · ");
  }

  function personCity(person) {
    var locs = (person && person.locations) || [];
    var i;
    for (i = 0; i < locs.length; i++) {
      if (locs[i] && locs[i].city) {
        return locs[i].city;
      }
    }
    return "";
  }

  function formatAddress(loc) {
    if (!loc) {
      return "—";
    }
    var cityState = [loc.city, loc.state].filter(Boolean).join(", ");
    var line = [loc.street, loc.street2, cityState, loc.zip]
      .filter(Boolean)
      .join(", ");
    return line || "—";
  }

  function firstPlate(snapshot) {
    var vehicle = snapshot && snapshot.vehicles && snapshot.vehicles[0];
    if (!vehicle) {
      return "";
    }
    return [vehicle.licensePlate || vehicle.plate, vehicle.plateState]
      .filter(Boolean)
      .join(" · ");
  }

  function vehicleLine(snapshot) {
    var vehicles = (snapshot && snapshot.vehicles) || [];
    var first = firstPlate(snapshot);
    if (!first) {
      return "";
    }
    if (vehicles.length > 1) {
      return first + " +" + (vehicles.length - 1);
    }
    return first;
  }

  function crimStatus(person) {
    var criminal = (person && person.criminal) || {};
    return criminal.isCriminal ? "Criminal" : "Non-criminal";
  }

  function catalogLabel(items, code) {
    var key = String(code || "").trim();
    if (!key) {
      return "";
    }
    var list = items || [];
    var i;
    for (i = 0; i < list.length; i++) {
      if (list[i] && list[i].code === key) {
        return list[i].label || key;
      }
    }
    return key;
  }

  function dispositionLine(person) {
    var immigration = (person && person.immigration) || {};
    var items =
      typeof IMMIGRATION_DISPOSITIONS !== "undefined"
        ? IMMIGRATION_DISPOSITIONS
        : [];
    return catalogLabel(items, immigration.disposition);
  }

  function isCommitted(row) {
    var m = model();
    if (m && typeof m.isCommitted === "function") {
      return m.isCommitted(row);
    }
    return !row || !row.meta || row.meta.status !== "draft";
  }

  function snapshots() {
    var m = model();
    if (!m || !m.store) {
      return [];
    }
    m.store.loadFromDisk();
    return (m.store.listLeads() || []).map(function (row) {
      return m.store.getLead(row.leadId);
    }).filter(Boolean);
  }

  function filtered() {
    var rows = snapshots();
    if (recordFilter === "draft") {
      rows = rows.filter(function (row) {
        return !isCommitted(row);
      });
    } else if (recordFilter === "committed") {
      rows = rows.filter(isCommitted);
    }
    return rows.sort(function (a, b) {
      var da = isCommitted(a) ? 1 : 0;
      var db = isCommitted(b) ? 1 : 0;
      if (da !== db) {
        return da - db;
      }
      var ua = (a.meta && a.meta.updatedAt) || "";
      var ub = (b.meta && b.meta.updatedAt) || "";
      return String(ub).localeCompare(String(ua));
    });
  }

  function paintList() {
    var body = byId("leadsBody");
    var empty = byId("leadsEmpty");
    var wrap = byId("leadsTableWrap");
    if (!body) {
      return;
    }
    var m = model();
    var all = snapshots();
    var rows = filtered();
    body.replaceChildren();
    empty.hidden = rows.length > 0;
    wrap.hidden = rows.length === 0;
    if (!all.length) {
      empty.textContent = "No leads yet.";
    } else if (!rows.length) {
      empty.textContent = "No matching records.";
    }
    rows.forEach(function (snap) {
      var subject = m.subjectOf ? m.subjectOf(snap) : snap.person;
      var tr = document.createElement("tr");
      var name = (m.formatPersonLabel && m.formatPersonLabel(subject)) || "Untitled lead";
      var committed = isCommitted(snap);
      var criminal = (subject && subject.criminal) || {};
      var immigration = (subject && subject.immigration) || {};
      [
        name,
        crimStatus(subject),
        dispositionLine(subject) || "—",
        personCity(subject) || "—",
        vehicleLine(snap) || "—",
        criminal.fbiNumber || "—",
        immigration.alienNumber || "—",
        immigration.finNumber || "—"
      ].forEach(function (text, index) {
        var td = document.createElement("td");
        td.textContent = text;
        if (index === 0 && !committed) {
          var badge = document.createElement("span");
          badge.className = "record-status record-status-draft";
          badge.textContent = "Draft";
          td.appendChild(document.createTextNode(" "));
          td.appendChild(badge);
        }
        tr.appendChild(td);
      });
      var actions = document.createElement("td");
      var cluster = document.createElement("div");
      cluster.className = "record-actions";
      var link = document.createElement("a");
      link.className = "action-button-secondary compact";
      if (committed) {
        link.href = "lead.html?id=" + encodeURIComponent(snap.leadId);
        link.textContent = "View";
      } else {
        link.href = "lead-form.html?id=" + encodeURIComponent(snap.leadId);
        link.textContent = "Edit";
      }
      cluster.appendChild(link);
      actions.appendChild(cluster);
      tr.appendChild(actions);
      body.appendChild(tr);
    });
  }

  function setViewText(id, value) {
    var el = byId(id);
    if (el) {
      el.textContent = displayOrDash(value);
    }
  }

  function hidePrimary(hide) {
    var el = byId("appBarPrimaryAction");
    if (el) {
      el.hidden = hide;
    }
    var bookin = byId("bookInLeadButton");
    if (bookin) {
      bookin.hidden = hide;
    }
  }

  function paintView() {
    var missing = byId("leadMissing");
    var snapEl = byId("leadSnapshot");
    if (!missing || !snapEl) {
      return;
    }
    var m = model();
    if (!m || !m.store) {
      return;
    }
    m.store.loadFromDisk();
    var id = queryId();
    if (!id) {
      missing.hidden = false;
      missing.textContent = "Lead not found.";
      snapEl.hidden = true;
      hidePrimary(true);
      return;
    }
    var snap = m.store.getLead(id);
    if (!snap) {
      missing.hidden = false;
      missing.textContent = "Lead not found.";
      snapEl.hidden = true;
      hidePrimary(true);
      if (window.COPDoc && COPDoc.setAppBarStatus) {
        COPDoc.setAppBarStatus("Lead not found.");
      }
      return;
    }
    if (!isCommitted(snap)) {
      window.location.replace(
        "lead-form.html?id=" + encodeURIComponent(snap.leadId)
      );
      return;
    }
    missing.hidden = true;
    snapEl.hidden = false;
    hidePrimary(false);
    var subject = m.subjectOf ? m.subjectOf(snap) : snap.person || {};
    var name = (m.formatPersonLabel && m.formatPersonLabel(subject)) || "Lead";
    if (byId("leadViewTitle")) {
      byId("leadViewTitle").textContent = name;
    }
    document.title = name + " — COPDoc";
    var immigration = subject.immigration || {};
    var loc = (subject.locations && subject.locations[0]) || null;
    var dobAge = [subject.dateOfBirth, subject.age].filter(Boolean).join(" · ");
    setViewText("viewName", name);
    setViewText("viewSource", sourceLine(snap));
    setViewText("viewSex", subject.sex);
    setViewText("viewDobAge", dobAge);
    setViewText("viewCitizenship", subject.citizenship);
    setViewText("viewAlienNumber", immigration.alienNumber);
    if (byId("viewAddress")) {
      byId("viewAddress").textContent = formatAddress(loc);
    }
    setViewText("viewPlate", firstPlate(snap));
    setViewText("viewUpdated", formatWhen(snap.meta && snap.meta.updatedAt));
  }

  function downloadBlob(filename, mime, text) {
    var blob = new Blob([text], { type: mime });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function exportListJson() {
    var rows = snapshots().filter(isCommitted);
    if (!rows.length) {
      if (window.COPDoc && COPDoc.setAppBarStatus) {
        COPDoc.setAppBarStatus("No committed leads to export.");
      }
      return;
    }
    downloadBlob(
      "leads.json",
      "application/json",
      JSON.stringify(rows, null, 2)
    );
    if (window.COPDoc && COPDoc.setAppBarStatus) {
      COPDoc.setAppBarStatus("Downloaded committed leads JSON.", { ok: true });
    }
  }

  function csvEscape(value) {
    var text = String(value == null ? "" : value);
    if (/[",\n\r]/.test(text)) {
      return '"' + text.replace(/"/g, '""') + '"';
    }
    return text;
  }

  function leadCsvRow(snapshot) {
    var m = model();
    var person = (m.subjectOf && m.subjectOf(snapshot)) || {};
    var name = person.name || {};
    var immigration = person.immigration || {};
    var source = snapshot.source || {};
    var vehicle = (snapshot.vehicles && snapshot.vehicles[0]) || {};
    return [
      name.lastName,
      name.firstName,
      name.middleName,
      person.sex,
      person.dateOfBirth,
      person.age,
      person.citizenship,
      immigration.alienNumber,
      source.caseNumber,
      source.leadSource,
      vehicle.licensePlate || vehicle.plate,
      vehicle.plateState || vehicle.state
    ].map(csvEscape).join(",");
  }

  var CSV_HEADERS = [
    "lastName",
    "firstName",
    "middleName",
    "sex",
    "dateOfBirth",
    "age",
    "citizenship",
    "alienNumber",
    "caseNumber",
    "leadSource",
    "licensePlate",
    "plateState"
  ].join(",");

  function exportListCsv() {
    var rows = snapshots().filter(isCommitted);
    if (!rows.length) {
      if (window.COPDoc && COPDoc.setAppBarStatus) {
        COPDoc.setAppBarStatus("No committed leads to export.");
      }
      return;
    }
    var csv =
      CSV_HEADERS +
      "\r\n" +
      rows.map(leadCsvRow).join("\r\n") +
      "\r\n";
    downloadBlob("leads.csv", "text/csv;charset=utf-8", csv);
    if (window.COPDoc && COPDoc.setAppBarStatus) {
      COPDoc.setAppBarStatus("Downloaded committed leads CSV.", { ok: true });
    }
  }

  function bindFilters() {
    document.querySelectorAll("[data-record-filter]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        recordFilter = btn.getAttribute("data-record-filter") || "all";
        document.querySelectorAll("[data-record-filter]").forEach(function (other) {
          other.setAttribute("aria-pressed", other === btn ? "true" : "false");
        });
        paintList();
      });
    });
  }

  function exportOneJson() {
    var m = model();
    var snap = m && m.store && m.store.getLead(queryId());
    if (!snap || !isCommitted(snap)) {
      if (window.COPDoc && COPDoc.setAppBarStatus) {
        COPDoc.setAppBarStatus("Commit the lead before exporting.");
      }
      return;
    }
    var subject = m.subjectOf ? m.subjectOf(snap) : snap.person;
    var name = (m.formatPersonLabel && m.formatPersonLabel(subject)) || "untitled-lead";
    var slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    downloadBlob(slug + ".json", "application/json", JSON.stringify(snap, null, 2));
    if (window.COPDoc && COPDoc.setAppBarStatus) {
      COPDoc.setAppBarStatus("Downloaded JSON snapshot.", { ok: true });
    }
  }

  function exportOneCsv() {
    var m = model();
    var snap = m && m.store && m.store.getLead(queryId());
    if (!snap || !isCommitted(snap)) {
      if (window.COPDoc && COPDoc.setAppBarStatus) {
        COPDoc.setAppBarStatus("Commit the lead before exporting.");
      }
      return;
    }
    var csv = CSV_HEADERS + "\r\n" + leadCsvRow(snap) + "\r\n";
    var subject = m.subjectOf ? m.subjectOf(snap) : snap.person;
    var name = (m.formatPersonLabel && m.formatPersonLabel(subject)) || "untitled-lead";
    var slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    downloadBlob(slug + ".csv", "text/csv;charset=utf-8", csv);
    if (window.COPDoc && COPDoc.setAppBarStatus) {
      COPDoc.setAppBarStatus("Downloaded CSV snapshot.", { ok: true });
    }
  }

  function bindExports() {
    var listJson = byId("downloadLeadsJsonButton");
    if (listJson) {
      listJson.addEventListener("click", exportListJson);
    }
    var listCsv = byId("downloadLeadsCsvButton");
    if (listCsv) {
      listCsv.addEventListener("click", exportListCsv);
    }
    var oneJson = byId("downloadLeadButton");
    if (oneJson && pageKey() === "lead") {
      oneJson.addEventListener("click", exportOneJson);
    }
    var oneCsv = byId("downloadLeadCsvButton");
    if (oneCsv && pageKey() === "lead") {
      oneCsv.addEventListener("click", exportOneCsv);
    }
  }

  function boot() {
    if (pageKey() === "leads") {
      bindFilters();
      bindExports();
      paintList();
      return;
    }
    if (pageKey() === "lead") {
      bindExports();
      paintView();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
