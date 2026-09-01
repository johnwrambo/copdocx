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

  function leadPickerHref(ownerType, objectId, leadId) {
    if (!objectId || !leadId) {
      return "";
    }
    var ret = "lead.html?id=" + encodeURIComponent(leadId);
    return (
      "photo-picker.html?ownerType=" +
      encodeURIComponent(ownerType) +
      "&id=" +
      encodeURIComponent(objectId) +
      "&leadId=" +
      encodeURIComponent(leadId) +
      "&return=" +
      encodeURIComponent(ret)
    );
  }

  function associationLabel(code) {
    var key = String(code || "").trim();
    if (!key) {
      return "";
    }
    var m = model() || {};
    var lists = []
      .concat(m.PERSON_LOCATION_ASSOCIATIONS || [])
      .concat(m.VEHICLE_LOCATION_ASSOCIATIONS || [])
      .concat(m.ENCOUNTER_LOCATION_ASSOCIATIONS || []);
    var i;
    for (i = 0; i < lists.length; i++) {
      if (lists[i] && lists[i].value === key) {
        return lists[i].label || key;
      }
    }
    return key.replace(/-/g, " ");
  }

  function vehicleHeading(vehicle) {
    if (!vehicle) {
      return "Vehicle";
    }
    var plate = [vehicle.licensePlate || vehicle.plate, vehicle.plateState]
      .filter(Boolean)
      .join(" · ");
    var ymm = [vehicle.vehicleYear, vehicle.vehicleColor, vehicle.vehicleMake, vehicle.vehicleModel]
      .filter(Boolean)
      .join(" ");
    return plate || ymm || "Vehicle";
  }

  function parseLocationPair(lat, lng) {
    var y = parseFloat(lat);
    var x = parseFloat(lng);
    if (!isFinite(y) || !isFinite(x)) {
      return null;
    }
    return [y, x];
  }

  function paintCaseObjectCard(list, options) {
    options = options || {};
    var card = document.createElement("article");
    card.className = "case-object-card";
    var photo = document.createElement("div");
    photo.className = "case-object-photo media-block";
    var body = document.createElement("div");
    body.className = "case-object-body";
    var title = document.createElement("strong");
    title.textContent = options.title || "—";
    var meta = document.createElement("p");
    meta.className = "section-note";
    meta.textContent = options.meta || "";
    body.appendChild(title);
    body.appendChild(meta);
    card.appendChild(photo);
    card.appendChild(body);
    list.appendChild(card);
    if (window.COPDoc && COPDoc.mediaCard && options.owner && options.owner.id) {
      COPDoc.mediaCard.mount(photo, {
        owner: options.owner,
        compact: true,
        photoTitle: "",
        pickerHref: options.pickerHref || ""
      });
    } else {
      var empty = document.createElement("div");
      empty.className = "media-photo-placeholder";
      empty.innerHTML =
        '<span class="fow-photo-placeholder-mark" aria-hidden="true"></span><strong>No photo</strong>';
      photo.appendChild(empty);
    }
  }

  function paintLeadVehicles(snapshot) {
    var list = byId("leadVehicles");
    var empty = byId("leadVehiclesEmpty");
    if (!list) {
      return;
    }
    var rows = (snapshot && snapshot.vehicles) || [];
    list.replaceChildren();
    if (!rows.length) {
      if (empty) {
        empty.hidden = false;
      }
      list.hidden = true;
      return;
    }
    if (empty) {
      empty.hidden = true;
    }
    list.hidden = false;
    rows.forEach(function (vehicle) {
      var loc = (vehicle.locations && vehicle.locations[0]) || null;
      var bits = [
        [vehicle.vehicleYear, vehicle.vehicleColor, vehicle.vehicleMake, vehicle.vehicleModel]
          .filter(Boolean)
          .join(" "),
        loc ? associationLabel(loc.association) : "",
        loc ? formatAddress(loc) : ""
      ].filter(Boolean);
      var id = vehicle.vehicleId || vehicle.id || "";
      paintCaseObjectCard(list, {
        title: vehicleHeading(vehicle),
        meta: bits.join(" · "),
        owner: id ? { type: "VEHICLE", id: id } : null,
        pickerHref: leadPickerHref("VEHICLE", id, snapshot.leadId)
      });
    });
  }

  function paintLeadLocations(snapshot, subject) {
    var list = byId("leadLocations");
    var empty = byId("leadLocationsEmpty");
    if (!list) {
      return;
    }
    var personLocs = (subject && subject.locations) || [];
    var vehicleLocs = [];
    ((snapshot && snapshot.vehicles) || []).forEach(function (vehicle) {
      (vehicle.locations || []).forEach(function (loc) {
        if (loc) {
          vehicleLocs.push(loc);
        }
      });
    });
    var rows = personLocs.concat(vehicleLocs);
    list.replaceChildren();
    if (!rows.length) {
      if (empty) {
        empty.hidden = false;
      }
      list.hidden = true;
      return;
    }
    if (empty) {
      empty.hidden = true;
    }
    list.hidden = false;
    rows.forEach(function (loc) {
      var id = loc.locationId || "";
      var assoc = associationLabel(loc.association);
      paintCaseObjectCard(list, {
        title: formatAddress(loc),
        meta: [assoc, loc.targetPriority ? "Priority " + loc.targetPriority : ""]
          .filter(Boolean)
          .join(" · "),
        owner: id ? { type: "LOCATION", id: id } : null,
        pickerHref: leadPickerHref("LOCATION", id, snapshot.leadId)
      });
    });
  }

  function subjectPlaceKind(loc, fromVehicle) {
    if (fromVehicle) {
      return "vehicle";
    }
    if (String((loc && loc.association) || "") === "work") {
      return "work";
    }
    return "home";
  }

  function subjectPlaceKindLabel(kind) {
    if (kind === "work") {
      return "Work";
    }
    if (kind === "vehicle") {
      return "Vehicle";
    }
    return "Home";
  }

  function collectSubjectPlaces(snapshot, subject) {
    var places = [];
    function pushLoc(loc, fromVehicle, extra) {
      if (!loc) {
        return;
      }
      var kind = subjectPlaceKind(loc, fromVehicle);
      var addr = formatAddress(loc);
      var pair = parseLocationPair(loc.latitude, loc.longitude);
      places.push({
        id: loc.locationId || "",
        kind: kind,
        title: subjectPlaceKindLabel(kind),
        address: addr !== "—" ? addr : "",
        extra: extra || "",
        meta: [extra, addr !== "—" ? addr : ""].filter(Boolean).join(" · "),
        lat: pair ? pair[0] : "",
        lng: pair ? pair[1] : "",
        mapped: !!pair
      });
    }
    ((subject && subject.locations) || []).forEach(function (loc) {
      pushLoc(loc, false, "");
    });
    ((snapshot && snapshot.vehicles) || []).forEach(function (vehicle) {
      (vehicle.locations || []).forEach(function (loc) {
        pushLoc(loc, true, vehicleHeading(vehicle));
      });
    });
    return places;
  }

  function paintLeadCaseMap(snapshot, subject) {
    var card = byId("leadCaseMapCard");
    var host = byId("leadCaseMap");
    var empty = byId("leadCaseMapEmpty");
    var legend = byId("leadCaseMapLegend");
    var list = byId("leadCaseMapList");
    if (!card || !host) {
      return;
    }
    var places = collectSubjectPlaces(snapshot, subject);
    var mapped = places.filter(function (place) {
      return place.mapped;
    });
    if (!places.length) {
      host.hidden = true;
      if (legend) {
        legend.hidden = true;
      }
      if (empty) {
        empty.hidden = false;
      }
      return;
    }
    if (empty) {
      empty.hidden = true;
    }
    if (legend && list) {
      legend.hidden = false;
      list.replaceChildren();
      places.forEach(function (place) {
        var item = document.createElement("li");
        item.className = "case-map-list-item is-" + place.kind;
        if (place.mapped) {
          item.classList.add("is-mapped");
        }
        var kind = document.createElement("span");
        kind.className = "case-map-key-dot is-" + place.kind;
        var body = document.createElement("div");
        var label = document.createElement("strong");
        label.textContent = place.title;
        var addr = document.createElement("span");
        addr.textContent = [place.extra, place.address]
          .filter(Boolean)
          .join(" · ") || "No address";
        body.appendChild(label);
        body.appendChild(addr);
        item.appendChild(kind);
        item.appendChild(body);
        if (place.mapped) {
          item.tabIndex = 0;
          item.setAttribute("role", "button");
          item.addEventListener("click", function () {
            if (window.COPDoc && COPDoc.locationMap && COPDoc.locationMap.focus) {
              COPDoc.locationMap.focus(host, place.id);
            }
          });
          item.addEventListener("keydown", function (event) {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              item.click();
            }
          });
        }
        list.appendChild(item);
      });
    }
    if (!mapped.length) {
      host.hidden = true;
      return;
    }
    host.hidden = false;
    if (window.COPDoc && COPDoc.locationMap && COPDoc.locationMap.displayMany) {
      COPDoc.locationMap.displayMany(host, mapped);
    }
  }

  function factText(value) {
    var text = String(value == null ? "" : value).trim();
    if (!text || text === "—") {
      return "";
    }
    return text;
  }

  function appendSnapshotFact(host, label, value) {
    var text = factText(value);
    if (!text) {
      return;
    }
    var row = document.createElement("div");
    row.className = "snapshot-fact";
    var dt = document.createElement("span");
    dt.className = "snapshot-label";
    dt.textContent = label;
    var dd = document.createElement("span");
    dd.className = "snapshot-value";
    dd.textContent = text;
    row.appendChild(dt);
    row.appendChild(dd);
    host.appendChild(row);
  }

  function paintSnapshotFacts(snapshot, subject) {
    var host = byId("leadSnapshotFacts");
    if (!host) {
      return;
    }
    host.replaceChildren();
    var m = model();
    var immigration = (subject && subject.immigration) || {};
    var crim = criminalProfile(subject);
    var crimBits = [];
    if (crim.hasCriminalRecord || crim.isCriminal) {
      crimBits.push("Criminal record");
    }
    if (crim.hasCriminalWarrants) {
      crimBits.push("Criminal warrants");
    }
    if (crim.sexOffender) {
      crimBits.push("Sex offender");
    }
    if (crim.foreignFugitive) {
      crimBits.push("Foreign fugitive");
    }
    if (crim.armed) {
      crimBits.push("Armed");
    }
    var threat = m.threatLevelLabel
      ? m.threatLevelLabel(crim.threatLevel)
      : crim.threatLevel || "";
    var threatKey = String(crim.threatLevel || "").toLowerCase();
    var immigrationLine = [
      dispositionLine(subject),
      immigration.status,
      immigration.finalOrderDate
        ? "Final order " + formatWhen(immigration.finalOrderDate)
        : immigration.finalOrder
          ? "Final order"
          : ""
    ]
      .filter(Boolean)
      .join(" · ");
    appendSnapshotFact(host, "Source / case", sourceLine(snapshot));
    appendSnapshotFact(host, "Sex", subject && subject.sex);
    appendSnapshotFact(
      host,
      "DOB / age",
      [subject && subject.dateOfBirth, subject && subject.age]
        .filter(Boolean)
        .join(" · ")
    );
    appendSnapshotFact(host, "Citizenship", subject && subject.citizenship);
    appendSnapshotFact(host, "A-Number", immigration.alienNumber);
    appendSnapshotFact(host, "FIN", immigration.finNumber);
    appendSnapshotFact(host, "Immigration", immigrationLine);
    appendSnapshotFact(host, "Aliases", aliasLine(subject));
    appendSnapshotFact(host, "SSN", subject && subject.ssn);
    appendSnapshotFact(host, "LexID", subject && subject.lexId);
    appendSnapshotFact(host, "Criminal", crimBits.join(" · "));
    if (threatKey && threatKey !== "none") {
      appendSnapshotFact(host, "Threat", threat);
    }
    appendSnapshotFact(
      host,
      "FBI",
      crim.fbiNumber || (subject && subject.criminal && subject.criminal.fbiNumber)
    );
    appendSnapshotFact(
      host,
      "NCIC",
      (subject && subject.criminal && subject.criminal.ncicNumber) || crim.ncicNumber
    );
    appendSnapshotFact(
      host,
      "State ID",
      (subject && subject.criminal && subject.criminal.stateId) || crim.stateId
    );
    appendSnapshotFact(
      host,
      "Updated",
      formatWhen(snapshot.meta && snapshot.meta.updatedAt)
    );
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

  function criminalProfile(person) {
    var m = model();
    if (m && typeof m.deriveCriminalProfile === "function") {
      return m.deriveCriminalProfile(person || {});
    }
    return (person && person.criminal) || {};
  }

  function crimStatus(person) {
    var criminal = criminalProfile(person);
    return criminal.isCriminal || criminal.hasCriminalRecord
      ? "Criminal"
      : "Non-criminal";
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
    if (m && m.store && typeof m.store.loadFromDisk === "function") {
      m.store.loadFromDisk();
    }
    if (m && m.store && typeof m.store.diskError === "function" && m.store.diskError()) {
      body.replaceChildren();
      empty.hidden = false;
      wrap.hidden = true;
      empty.textContent = m.store.diskError();
      if (window.COPDoc && COPDoc.setAppBarStatus) {
        COPDoc.setAppBarStatus(m.store.diskError());
      }
      return;
    }
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
    [
      "appBarPrimaryAction",
      "generateTargetSheetButton",
      "bookInLeadButton",
      "issueI200Button",
      "issueI205Button"
    ].forEach(function (id) {
      var el = byId(id);
      if (el) {
        el.hidden = hide;
      }
    });
  }

  function paintIssuedWarrants(subject) {
    var empty = byId("warrantsIssuedEmpty");
    var wrap = byId("warrantsIssuedTableWrap");
    var body = byId("warrantsIssuedBody");
    var card = byId("warrantsIssuedCard");
    if (!body || !empty || !wrap) {
      return;
    }
    var m = model();
    var rows =
      m && typeof m.issuedWarrants === "function"
        ? m.issuedWarrants(subject)
        : ((subject && subject.warrants) || []).filter(function (row) {
            return row && (row.formType === "I-200" || row.formType === "I-205");
          });
    body.replaceChildren();
    if (card) {
      card.hidden = false;
    }
    empty.hidden = rows.length > 0;
    wrap.hidden = rows.length === 0;
    rows
      .slice()
      .sort(function (a, b) {
        return String(b.issuedAt || b.warrantDate || "").localeCompare(
          String(a.issuedAt || a.warrantDate || "")
        );
      })
      .forEach(function (row) {
        var tr = document.createElement("tr");
        [
          row.formType || "—",
          row.warrantDate || (row.issuedAt || "").slice(0, 10) || "—",
          row.fileNo || row.warrantNumber || "—",
          row.officerName || row.warrantIssuer || "—",
          row.pdfFileName || "—"
        ].forEach(function (text) {
          var td = document.createElement("td");
          td.textContent = text;
          tr.appendChild(td);
        });
        body.appendChild(tr);
      });
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
    if (typeof m.store.diskError === "function" && m.store.diskError()) {
      if (window.COPDoc && COPDoc.setAppBarStatus) {
        COPDoc.setAppBarStatus(m.store.diskError());
      }
    }
    var id = queryId();
    var issuedCard = byId("warrantsIssuedCard");
    var vehiclesCard = byId("leadVehiclesCard");
    var locationsCard = byId("leadLocationsCard");
    var caseMapCard = byId("leadCaseMapCard");
    function hideCaseBody() {
      snapEl.hidden = true;
      if (issuedCard) {
        issuedCard.hidden = true;
      }
      if (vehiclesCard) {
        vehiclesCard.hidden = true;
      }
      if (locationsCard) {
        locationsCard.hidden = true;
      }
      if (caseMapCard) {
        caseMapCard.hidden = true;
      }
    }
    if (!id) {
      missing.hidden = false;
      missing.textContent = "Lead not found.";
      hideCaseBody();
      hidePrimary(true);
      return;
    }
    var snap = m.store.getLead(id);
    if (!snap) {
      missing.hidden = false;
      missing.textContent = "Lead not found.";
      hideCaseBody();
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
    if (issuedCard) {
      issuedCard.hidden = false;
    }
    if (vehiclesCard) {
      vehiclesCard.hidden = false;
    }
    if (locationsCard) {
      locationsCard.hidden = false;
    }
    if (caseMapCard) {
      caseMapCard.hidden = false;
    }
    hidePrimary(false);
    var subject = m.subjectOf ? m.subjectOf(snap) : snap.person || {};
    var name = (m.formatPersonLabel && m.formatPersonLabel(subject)) || "Lead";
    if (byId("leadViewTitle")) {
      byId("leadViewTitle").textContent = name;
    }
    document.title = name + " — COPDoc";
    if (
      window.COPDoc &&
      COPDoc.mediaCard &&
      subject.personId
    ) {
      COPDoc.mediaCard.mount(byId("leadSubjectMedia"), {
        owner: { type: "PERSON", id: subject.personId },
        photoTitle: "Photo",
        fileTitle: "Files",
        pickerHref: leadPickerHref("PERSON", subject.personId, snap.leadId),
        filesHost: byId("leadSnapshotFiles"),
        showEmptyFiles: false,
        thumbs: false
      });
    }
    paintSnapshotFacts(snap, subject);
    paintLeadCaseMap(snap, subject);
    paintLeadVehicles(snap);
    paintLeadLocations(snap, subject);
    paintIssuedWarrants(subject);
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
    var m = model();
    if (m && typeof m.csvCell === "function") {
      return m.csvCell(value);
    }
    var text = String(value == null ? "" : value);
    if (/^[=+\-@\t]/.test(text)) {
      text = "'" + text;
    }
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

  function paintFowCriminal(subject) {
    var statusEl = byId("targetCriminalStatus");
    var historyEl = byId("targetCriminalHistoryList");
    var convictionsEl = byId("targetConvictions");
    if (!statusEl && !historyEl && !convictionsEl) {
      return;
    }
    var crim = criminalProfile(subject);
    var m = model();
    var bits = [];
    if (crim.hasCriminalRecord || crim.isCriminal) {
      bits.push("Criminal record");
    }
    if (crim.hasCriminalWarrants) {
      bits.push("Criminal warrants");
    }
    if (crim.sexOffender) {
      bits.push("Sex offender");
    }
    if (crim.foreignFugitive) {
      bits.push("Foreign fugitive");
    }
    if (crim.armed) {
      bits.push("Armed");
    }
    var threat = m.threatLevelLabel
      ? m.threatLevelLabel(crim.threatLevel)
      : crim.threatLevel || "None";
    if (statusEl) {
      statusEl.textContent = bits.length
        ? bits.join(" · ") + " · Threat " + threat
        : "Non-criminal · Threat " + threat;
    }
    var lines = ((subject && subject.convictions) || [])
      .map(function (row) {
        var offense = String((row && (row.crime || row.charge)) || "").trim();
        if (!offense) {
          return "";
        }
        return [offense, row.convictionDate, row.court].filter(Boolean).join(" · ");
      })
      .filter(Boolean);
    if (historyEl) {
      historyEl.textContent = lines.length
        ? lines.join("; ")
        : "No criminal history loaded.";
      historyEl.classList.toggle("fow-inline-empty", !lines.length);
    }
    if (convictionsEl) {
      convictionsEl.textContent = lines.length ? lines.join("; ") : "None loaded.";
    }
    if (byId("targetFbiNumber")) {
      byId("targetFbiNumber").textContent =
        (crim.fbiNumber || (subject.criminal && subject.criminal.fbiNumber) || "—");
    }
    if (byId("targetNcicNumber")) {
      byId("targetNcicNumber").textContent =
        ((subject.criminal && subject.criminal.ncicNumber) || "—");
    }
    if (byId("targetStateId")) {
      byId("targetStateId").textContent =
        ((subject.criminal && subject.criminal.stateId) || "—");
    }
  }

  function setSheetText(id, value, empty) {
    var el = byId(id);
    if (!el) {
      return;
    }
    var text = String(value == null ? "" : value).trim();
    el.textContent = text || (empty != null ? empty : "—");
  }

  function locationRows(snapshot, subject) {
    var personLocs = (subject && subject.locations) || [];
    var vehicleLocs = [];
    ((snapshot && snapshot.vehicles) || []).forEach(function (vehicle) {
      (vehicle.locations || []).forEach(function (loc) {
        if (loc) {
          vehicleLocs.push(loc);
        }
      });
    });
    return personLocs.concat(vehicleLocs);
  }

  function primaryLocationOf(locs) {
    var ranked = (locs || []).filter(function (loc) {
      return loc && String(loc.targetPriority || "").trim();
    });
    if (ranked.length) {
      ranked.sort(function (a, b) {
        return Number(a.targetPriority) - Number(b.targetPriority);
      });
      return ranked[0];
    }
    return (locs && locs[0]) || null;
  }

  function locationByAssociation(locs, code) {
    var i;
    for (i = 0; i < (locs || []).length; i++) {
      if (locs[i] && locs[i].association === code) {
        return locs[i];
      }
    }
    return null;
  }

  function vehicleYmm(vehicle) {
    if (!vehicle) {
      return "";
    }
    return [vehicle.vehicleYear, vehicle.vehicleColor, vehicle.vehicleMake, vehicle.vehicleModel]
      .filter(Boolean)
      .join(" ");
  }

  function plateOf(vehicle) {
    if (!vehicle) {
      return "";
    }
    return [vehicle.licensePlate || vehicle.plate, vehicle.plateState]
      .filter(Boolean)
      .join(" · ");
  }

  function aliasLine(subject) {
    var m = model();
    return ((subject && subject.aliases) || [])
      .map(function (row) {
        if (!row) {
          return "";
        }
        if (m && m.formatPersonLabel) {
          return m.formatPersonLabel(row);
        }
        return [row.lastName, row.firstName, row.middleName].filter(Boolean).join(" ");
      })
      .filter(Boolean)
      .join("; ");
  }

  function notesLine(snapshot) {
    var notes = snapshot && snapshot.notes;
    if (Array.isArray(notes)) {
      return notes
        .map(function (row) {
          if (!row) {
            return "";
          }
          if (typeof row === "string") {
            return row.trim();
          }
          return String(row.text || "").trim();
        })
        .filter(Boolean)
        .join("\n");
    }
    return String(notes || "").trim();
  }

  function mediaBlobUrl(rec, bag) {
    if (!rec || !rec.blob) {
      return "";
    }
    var blob = rec.blob;
    if (typeof Blob !== "undefined" && !(blob instanceof Blob) && blob.buffer) {
      blob = new Blob([blob]);
    }
    var url = URL.createObjectURL(blob);
    bag.push(url);
    return url;
  }

  function committedPhotos(rows) {
    return (rows || []).filter(function (row) {
      return (
        row &&
        row.mediaClass === "photo" &&
        (!row.meta || row.meta.status !== "draft")
      );
    });
  }

  function paintPhotoStrip(host, owner, emptyText) {
    if (!host) {
      return Promise.resolve();
    }
    (host._mediaUrls || []).forEach(function (url) {
      if (url && String(url).indexOf("blob:") === 0) {
        URL.revokeObjectURL(url);
      }
    });
    host._mediaUrls = [];
    host.className = "fow-inline-empty";
    host.textContent = emptyText;
    if (!owner || !owner.id || !window.COPDoc || !COPDoc.media) {
      return Promise.resolve();
    }
    return COPDoc.media.list(owner).catch(function () {
      return [];
    }).then(function (rows) {
      var photos = committedPhotos(rows);
      if (!photos.length) {
        return;
      }
      host.className = "fow-photo-strip";
      host.textContent = "";
      photos.forEach(function (row) {
        var img = document.createElement("img");
        img.alt = row.caption || "Photo";
        host.appendChild(img);
        COPDoc.media
          .blob(row.mediaId, "thumb")
          .catch(function () {
            return COPDoc.media.blob(row.mediaId, "display");
          })
          .then(function (rec) {
            var url = mediaBlobUrl(rec, host._mediaUrls);
            if (url) {
              img.src = url;
            }
          })
          .catch(function () {});
      });
    });
  }

  var targetPhotoState = { photos: [], index: 0, url: "", bound: false };

  function showTargetPhoto(index) {
    var img = byId("targetPhoto");
    var placeholder = byId("targetPhotoPlaceholder");
    var meta = byId("targetPhotoMeta");
    var prev = byId("targetPhotoPrev");
    var next = byId("targetPhotoNext");
    var photos = targetPhotoState.photos;
    var api = window.COPDoc && COPDoc.media;
    function hideNav() {
      if (prev) {
        prev.hidden = true;
      }
      if (next) {
        next.hidden = true;
      }
    }
    if (targetPhotoState.url) {
      URL.revokeObjectURL(targetPhotoState.url);
      targetPhotoState.url = "";
    }
    if (!photos.length || !api || !img) {
      if (img) {
        img.hidden = true;
        img.removeAttribute("src");
      }
      if (placeholder) {
        placeholder.hidden = false;
      }
      if (meta) {
        meta.textContent = "No subject photo";
      }
      hideNav();
      return;
    }
    targetPhotoState.index = (index + photos.length) % photos.length;
    var row = photos[targetPhotoState.index];
    var many = photos.length > 1;
    if (prev) {
      prev.hidden = !many;
    }
    if (next) {
      next.hidden = !many;
    }
    api
      .blob(row.mediaId, "display")
      .catch(function () {
        return api.blob(row.mediaId, "original");
      })
      .then(function (rec) {
        if (row !== photos[targetPhotoState.index]) {
          return;
        }
        var url = mediaBlobUrl(rec, []);
        if (!url) {
          throw new Error("empty");
        }
        targetPhotoState.url = url;
        img.src = url;
        img.hidden = false;
        if (placeholder) {
          placeholder.hidden = true;
        }
        if (meta) {
          var bits = [
            row.caption,
            row.takenAt && String(row.takenAt).slice(0, 10),
            many ? targetPhotoState.index + 1 + " / " + photos.length : ""
          ].filter(Boolean);
          meta.textContent = bits.join(" · ") || "Subject photo";
        }
      })
      .catch(function () {
        img.hidden = true;
        img.removeAttribute("src");
        if (placeholder) {
          placeholder.hidden = false;
        }
        if (meta) {
          meta.textContent = "Photo could not be loaded";
        }
      });
  }

  function bindTargetPhotoNav() {
    if (targetPhotoState.bound) {
      return;
    }
    targetPhotoState.bound = true;
    var card = byId("targetPhotoCard");
    var prev = byId("targetPhotoPrev");
    var next = byId("targetPhotoNext");
    var img = byId("targetPhoto");
    var startX = null;
    function step(delta) {
      if (targetPhotoState.photos.length < 2) {
        return;
      }
      showTargetPhoto(targetPhotoState.index + delta);
    }
    if (prev) {
      prev.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();
        step(-1);
      });
    }
    if (next) {
      next.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();
        step(1);
      });
    }
    if (img) {
      img.addEventListener("click", function (event) {
        if (targetPhotoState.photos.length < 2) {
          return;
        }
        var rect = img.getBoundingClientRect();
        var mid = rect.left + rect.width / 2;
        step(event.clientX < mid ? -1 : 1);
      });
    }
    if (card) {
      card.addEventListener(
        "touchstart",
        function (event) {
          var touch = event.changedTouches && event.changedTouches[0];
          startX = touch ? touch.clientX : null;
        },
        { passive: true }
      );
      card.addEventListener(
        "touchend",
        function (event) {
          if (startX == null) {
            return;
          }
          var touch = event.changedTouches && event.changedTouches[0];
          var dx = touch ? touch.clientX - startX : 0;
          startX = null;
          if (Math.abs(dx) < 40) {
            return;
          }
          step(dx < 0 ? 1 : -1);
        },
        { passive: true }
      );
    }
  }

  function paintTargetPhoto(subject) {
    bindTargetPhotoNav();
    targetPhotoState.photos = [];
    targetPhotoState.index = 0;
    var personId = subject && subject.personId;
    if (!personId || !window.COPDoc || !COPDoc.media) {
      showTargetPhoto(0);
      return Promise.resolve();
    }
    return COPDoc.media
      .list({ type: "PERSON", id: personId })
      .catch(function () {
        return [];
      })
      .then(function (rows) {
        targetPhotoState.photos = committedPhotos(rows);
        showTargetPhoto(0);
      });
  }

  function paintTargetWarnings(subject) {
    var strip = byId("targetWarnings");
    if (!strip) {
      return;
    }
    strip.replaceChildren();
    var crim = criminalProfile(subject);
    var chips = [];
    if (crim.hasCriminalWarrants) {
      chips.push("Warrant");
    }
    if (crim.sexOffender) {
      chips.push("Sex offender");
    }
    if (crim.armed) {
      chips.push("Armed");
    }
    if (crim.hasCriminalRecord || crim.isCriminal) {
      chips.push("Criminal record");
    }
    var threat = String(crim.threatLevel || "").toLowerCase();
    if (threat === "high" || threat === "severe") {
      chips.push("High threat");
    }
    var warrants =
      model() && typeof model().issuedWarrants === "function"
        ? model().issuedWarrants(subject)
        : ((subject && subject.warrants) || []).filter(function (row) {
            return row && (row.formType === "I-200" || row.formType === "I-205");
          });
    if (
      warrants.some(function (row) {
        return row.formType === "I-200";
      })
    ) {
      chips.push("I-200 issued");
    }
    if (
      warrants.some(function (row) {
        return row.formType === "I-205";
      })
    ) {
      chips.push("I-205 issued");
    }
    strip.hidden = !chips.length;
    chips.forEach(function (label) {
      var el = document.createElement("span");
      el.className = "fow-warning";
      el.textContent = label;
      strip.appendChild(el);
    });
  }

  function paintSheetList(host, lines, emptyText) {
    if (!host) {
      return;
    }
    host.replaceChildren();
    if (!lines.length) {
      host.className = "fow-inline-empty";
      host.textContent = emptyText;
      return;
    }
    host.className = "";
    lines.forEach(function (line) {
      var row = document.createElement("p");
      row.className = "fow-list-row";
      row.textContent = line;
      host.appendChild(row);
    });
  }

  function paintTargetSheet() {
    var missing = byId("mobileFowMissing");
    var sheet = byId("mobileFowSheet");
    var m = model();
    if (!m || !m.store) {
      return;
    }
    m.store.loadFromDisk();
    var id = queryId();
    var snap = id ? m.store.getLead(id) : null;
    if (!snap) {
      if (missing) {
        missing.hidden = false;
        var strong = missing.querySelector("strong");
        var span = missing.querySelector("span");
        if (strong && span) {
          span.textContent = id
            ? "The requested lead could not be loaded."
            : "Open this sheet from a lead.";
        } else {
          missing.textContent = id
            ? "Lead not found."
            : "Open this sheet from a lead.";
        }
      }
      if (sheet) {
        sheet.hidden = true;
      }
      document.title = "Mobile Target sheet";
      return;
    }
    if (missing) {
      missing.hidden = true;
    }
    if (sheet) {
      sheet.hidden = false;
    }
    var subject = m.subjectOf ? m.subjectOf(snap) : snap.person || {};
    var immigration = subject.immigration || {};
    var source = snap.source || {};
    var name =
      (m.formatPersonLabel && m.formatPersonLabel(subject)) || "Target";
    document.title = name + " — Target sheet";
    setSheetText("targetName", name, "Target");
    setSheetText(
      "targetDobAge",
      [subject.dateOfBirth, subject.age].filter(Boolean).join(" · ")
    );
    setSheetText("targetAlienNumber", immigration.alienNumber);
    setSheetText("targetSex", subject.sex);
    setSheetText("targetCitizenship", subject.citizenship);
    setSheetText(
      "targetDisposition",
      dispositionLine(subject) || immigration.disposition || immigration.status
    );
    setSheetText("targetPhysicalDescription", "", "—");
    setSheetText("targetAliases", aliasLine(subject), "None listed");
    setSheetText("targetCaseNumber", source.caseNumber);
    setSheetText("targetSource", sourceLine(snap));
    setSheetText("targetImmigrationStatus", immigration.status);
    setSheetText(
      "targetImmigrationDisposition",
      dispositionLine(subject) || immigration.disposition
    );
    setSheetText(
      "targetFinalOrderDate",
      immigration.finalOrderDate || (immigration.finalOrder ? "Final order" : "")
    );
    setSheetText("targetFinNumber", immigration.finNumber);
    setSheetText("targetUpdated", formatWhen(snap.meta && snap.meta.updatedAt));
    setSheetText("targetNotes", notesLine(snap), "No notes loaded.");

    var locs = locationRows(snap, subject);
    var primaryLoc = primaryLocationOf(locs);
    var locAddress = formatAddress(primaryLoc);
    var locLabel = primaryLoc
      ? associationLabel(primaryLoc.association) || "Location"
      : "";
    setSheetText(
      "targetLocationCue",
      locAddress !== "—" ? locAddress : locLabel,
      "No primary location loaded"
    );
    setSheetText(
      "targetLocationName",
      locLabel,
      "No primary location loaded"
    );
    setSheetText(
      "targetLastKnownAddress",
      locAddress !== "—" ? locAddress : "",
      "Address will display here."
    );
    setSheetText(
      "targetLocationMeta",
      primaryLoc
        ? [
            associationLabel(primaryLoc.association),
            primaryLoc.targetPriority
              ? "Priority " + primaryLoc.targetPriority
              : ""
          ]
            .filter(Boolean)
            .join(" · ")
        : "",
      "Source and verification date not loaded"
    );

    var vehicles = snap.vehicles || [];
    var vehicle = vehicles[0] || null;
    var vehicleLocs = (vehicle && vehicle.locations) || [];
    var plate = plateOf(vehicle);
    var ymm = vehicleYmm(vehicle);
    setSheetText(
      "targetVehicleCue",
      [plate, ymm].filter(Boolean).join(" · "),
      "No primary vehicle loaded"
    );
    setSheetText("targetPrimaryVehicleSummary", ymm);
    setSheetText("targetPrimaryPlate", plate);
    setSheetText("targetVehicleOwner", vehicle && vehicle.registeredOwnerName);
    setSheetText(
      "targetVehicleAssociation",
      vehicleLocs[0] ? associationLabel(vehicleLocs[0].association) : ""
    );
    setSheetText(
      "targetVehicleAddress",
      formatAddress(locationByAssociation(vehicleLocs, "registration"))
    );
    var overnight =
      locationByAssociation(vehicleLocs, "known-parking") ||
      locationByAssociation(vehicleLocs, "residence");
    setSheetText(
      "targetVehicleOvernight",
      overnight ? formatAddress(overnight) : ""
    );

    paintSheetList(
      byId("targetLocationsList"),
      locs.map(function (loc) {
        return [
          formatAddress(loc),
          associationLabel(loc.association),
          loc.targetPriority ? "Priority " + loc.targetPriority : ""
        ]
          .filter(function (bit) {
            return bit && bit !== "—";
          })
          .join(" · ");
      }).filter(Boolean),
      "No additional locations loaded."
    );
    paintSheetList(
      byId("targetVehiclesList"),
      vehicles.map(function (row) {
        return [plateOf(row), vehicleYmm(row)].filter(Boolean).join(" · ");
      }).filter(Boolean),
      "No additional vehicles loaded."
    );

    paintTargetWarnings(subject);
    paintFowCriminal(subject);
    paintTargetPhoto(subject);
    paintPhotoStrip(
      byId("targetLocationPhotos"),
      primaryLoc && primaryLoc.locationId
        ? { type: "LOCATION", id: primaryLoc.locationId }
        : null,
      "No location photos loaded."
    );
    paintPhotoStrip(
      byId("targetVehiclePhotos"),
      vehicle && (vehicle.vehicleId || vehicle.id)
        ? { type: "VEHICLE", id: vehicle.vehicleId || vehicle.id }
        : null,
      "No vehicle photos loaded."
    );
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
      return;
    }
    if (pageKey() === "mobile-target-sheet") {
      paintTargetSheet();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
