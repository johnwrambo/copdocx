/**
 * Encounter list and form.
 */
(function () {
  "use strict";

  var transientEncounter = null;
  var recordFilter = "all";
  var encounterOfficerIds = [];
  var encounterSubjects = [];
  var reviewMapInstance = null;

  function byId(id) {
    return document.getElementById(id);
  }

  function pageKey() {
    return document.body.getAttribute("data-page") || "";
  }

  function queryId() {
    try {
      return new URLSearchParams(window.location.search).get("id") || "";
    } catch (error) {
      return "";
    }
  }

  function queryParam(name) {
    try {
      return new URLSearchParams(window.location.search).get(name) || "";
    } catch (error) {
      return "";
    }
  }

  function model() {
    return window.COPDoc && COPDoc.model;
  }

  function setStatus(message, ok) {
    if (window.COPDoc && COPDoc.setAppBarStatus) {
      COPDoc.setAppBarStatus(message, ok ? { ok: true } : undefined);
    }
  }

  function isCommitted(row) {
    var m = model();
    if (m && typeof m.isCommitted === "function") {
      return m.isCommitted(row);
    }
    return !row || !row.meta || row.meta.status !== "draft";
  }

  function isComplete(row) {
    return !!(row && row.meta && row.meta.markedComplete);
  }

  function displayOrDash(value) {
    var text = String(value == null ? "" : value).trim();
    return text || "—";
  }

  function formatAddress(loc) {
    if (!loc) {
      return "";
    }
    var cityState = [loc.city, loc.state].filter(Boolean).join(", ");
    return [loc.street, loc.street2, cityState, loc.zip].filter(Boolean).join(", ");
  }

  function vehicleLine(record) {
    var vehicles = (record && record.vehicles) || [];
    var first = vehicles[0];
    if (!first) {
      return "";
    }
    var plate = [first.licensePlate || first.plate, first.plateState]
      .filter(Boolean)
      .join(" · ");
    if (!plate) {
      return "";
    }
    if (vehicles.length > 1) {
      return plate + " +" + (vehicles.length - 1);
    }
    return plate;
  }

  function subjectsLine(record) {
    return ((record && record.subjects) || [])
      .map(function (row) {
        var last = String((row && row.lastName) || "").trim();
        var first = String((row && row.firstName) || "").trim();
        if (last && first) {
          return last + ", " + first;
        }
        return [first, last].filter(Boolean).join(" ");
      })
      .filter(Boolean)
      .join("; ");
  }

  function radioValue(rootEl, field) {
    var checked = rootEl && rootEl.querySelector('[data-field="' + field + '"]:checked');
    return checked ? String(checked.value || "").trim() : "";
  }

  function setRadioValue(rootEl, field, value) {
    if (!rootEl) {
      return;
    }
    var wanted = String(value || "");
    Array.prototype.forEach.call(
      rootEl.querySelectorAll('[data-field="' + field + '"]'),
      function (el) {
        el.checked = el.value === wanted;
      }
    );
  }

  function cloneSubject(row) {
    var m = model();
    if (m && typeof m.createEncounterSubject === "function") {
      return m.createEncounterSubject(row || {});
    }
    return row ? Object.assign({}, row) : {};
  }

  function rosterFromPackets(encounterId) {
    return subjectsForEncounter(encounterId).map(function (row) {
      return cloneSubject(row);
    });
  }

  function loadRoster(record) {
    var rows = (record && Array.isArray(record.subjects) && record.subjects.length)
      ? record.subjects
      : rosterFromPackets(record && record.encounterId);
    encounterSubjects = rows.map(cloneSubject);
  }

  function officerApi() {
    return window.COPDoc && COPDoc.officers;
  }

  function officerRecord(id) {
    var api = officerApi();
    return api && typeof api.get === "function" ? api.get(id) : null;
  }

  function officerDisplayName(id) {
    var api = officerApi();
    var row = officerRecord(id);
    if (api && row && typeof api.display === "function") {
      return api.display(row);
    }
    if (row) {
      return [row.lastName, row.firstName].filter(Boolean).join(", ") || id;
    }
    return id || "—";
  }

  function operationCellForOfficer(operation, officerId) {
    var found = { assignment: "", cell: "" };
    if (!operation || !officerId) {
      return found;
    }
    (operation.teams || []).forEach(function (team) {
      (team.members || []).forEach(function (member) {
        if (!member || (member.officerId !== officerId && member.id !== officerId)) {
          return;
        }
        found.assignment = member.assignmentRole || member.role || "";
        found.cell = team.name || team.rosterKey || team.teamId || "";
      });
    });
    return found;
  }

  function syncCenterRadioNames() {
    document.querySelectorAll('#encounterLocationList [data-field="encounterCenter"]').forEach(
      function (el) {
        el.name = "encounterCenter";
      }
    );
  }

  function showEncounterTab(id) {
    var narrative = id === "tab-narrative";
    document.body.classList.toggle("enc-narrative-open", narrative);
    if (narrative) {
      setStatus("");
    }
    document.querySelectorAll(".enc-tabs button").forEach(function (btn) {
      var on = btn.getAttribute("aria-controls") === id;
      btn.setAttribute("aria-selected", on ? "true" : "false");
    });
    document.querySelectorAll(".enc-panel").forEach(function (panel) {
      panel.hidden = panel.id !== id;
    });
    if (id === "tab-review") {
      paintReview();
    }
    if (id === "tab-evidence") {
      paintEvidence();
    }
    if (narrative) {
      paintNarrativeTab();
    }
  }

  function fillEventTypeSelect(selected) {
    var sel = byId("eventType");
    if (!sel) {
      return;
    }
    var current = selected || sel.value || "";
    var items =
      (window.COPDoc && COPDoc.catalogs && COPDoc.catalogs.ENCOUNTER_TYPES) || [];
    sel.replaceChildren();
    var blank = document.createElement("option");
    blank.value = "";
    blank.textContent = "Select an option";
    sel.appendChild(blank);
    items.forEach(function (item) {
      var opt = document.createElement("option");
      opt.value = item.code || item.value || "";
      opt.textContent = item.label || opt.value;
      sel.appendChild(opt);
    });
    sel.value = current;
  }

  function fillOperationSelect(selected) {
    var sel = byId("operationId");
    var m = model();
    if (!sel || !m || !m.store || typeof m.store.listOperations !== "function") {
      return;
    }
    var current = selected || sel.value || "";
    sel.replaceChildren();
    var blank = document.createElement("option");
    blank.value = "";
    blank.textContent = "None";
    sel.appendChild(blank);
    (m.store.listOperations() || []).forEach(function (row) {
      var opt = document.createElement("option");
      opt.value = row.operationId || "";
      var label = row.operationNumber || row.operationId || "";
      if (row.name) {
        label += " · " + row.name;
      }
      opt.textContent = label;
      sel.appendChild(opt);
    });
    sel.value = current;
  }

  function fillOfficerPick() {
    var sel = byId("officerPick");
    var api = officerApi();
    if (!sel || !api || typeof api.listCommitted !== "function") {
      return;
    }
    var taken = Object.create(null);
    encounterOfficerIds.forEach(function (id) {
      taken[id] = true;
    });
    sel.replaceChildren();
    var blank = document.createElement("option");
    blank.value = "";
    blank.textContent = "Select an officer";
    sel.appendChild(blank);
    api.listCommitted().forEach(function (row) {
      var id = row.officerId || row.id;
      if (!id || taken[id]) {
        return;
      }
      var opt = document.createElement("option");
      opt.value = id;
      opt.textContent =
        typeof api.display === "function" ? api.display(row) : officerDisplayName(id);
      sel.appendChild(opt);
    });
  }

  function paintOfficers() {
    var body = byId("officerBody");
    if (!body) {
      return;
    }
    body.replaceChildren();
    if (!encounterOfficerIds.length) {
      var empty = document.createElement("tr");
      var td = document.createElement("td");
      td.colSpan = 5;
      td.textContent = "No officers yet. Pick an operation or add from the roster.";
      empty.appendChild(td);
      body.appendChild(empty);
      fillOfficerPick();
      return;
    }
    var m = model();
    var opId = (byId("operationId") && byId("operationId").value) || "";
    var op =
      opId && m && m.store && typeof m.store.getOperation === "function"
        ? m.store.getOperation(opId)
        : null;
    encounterOfficerIds.forEach(function (id) {
      var row = officerRecord(id);
      var cell = operationCellForOfficer(op, id);
      var tr = document.createElement("tr");
      [
        officerDisplayName(id),
        (row && row.badge) || "—",
        cell.assignment || "—",
        cell.cell || "—"
      ].forEach(function (text) {
        var cellTd = document.createElement("td");
        cellTd.textContent = text;
        tr.appendChild(cellTd);
      });
      var actions = document.createElement("td");
      var remove = document.createElement("button");
      remove.type = "button";
      remove.className = "action-button-danger compact";
      remove.setAttribute("aria-label", "Remove officer");
      remove.textContent = "×";
      remove.addEventListener("click", function () {
        encounterOfficerIds = encounterOfficerIds.filter(function (other) {
          return other !== id;
        });
        paintOfficers();
        paintBanner();
      });
      actions.appendChild(remove);
      tr.appendChild(actions);
      body.appendChild(tr);
    });
    fillOfficerPick();
  }

  function loadOfficersFromOperation(operationId, options) {
    options = options || {};
    var m = model();
    if (!operationId || !m || !m.store || typeof m.store.getOperation !== "function") {
      return;
    }
    var op = m.store.getOperation(operationId);
    if (!op) {
      setStatus("That operation was not found.");
      return;
    }
    var ids =
      typeof m.officerIdsFromOperation === "function"
        ? m.officerIdsFromOperation(op)
        : [];
    encounterOfficerIds = ids.slice();
    paintOfficers();
    if (!options.quiet) {
      setStatus(
        ids.length
          ? "Loaded " +
              ids.length +
              " officer" +
              (ids.length === 1 ? "" : "s") +
              " from the operation. Last-minute changes stay on this encounter."
          : "That operation has no cell officers.",
        true
      );
    }
  }

  function locationLabel(loc) {
    if (!loc) {
      return "";
    }
    return formatAddress(loc) || [loc.association, loc.city].filter(Boolean).join(" · ");
  }

  function bannerVehicleText(record) {
    var vehicles = (record && record.vehicles) || [];
    var first = vehicles[0];
    if (!first) {
      return "";
    }
    var ymm = [first.vehicleColor, first.vehicleMake, first.vehicleModel]
      .filter(Boolean)
      .join(" ");
    return ymm || vehicleLine(record);
  }

  function outcomeWords(code) {
    var value = String(code || "").toUpperCase();
    if (value === "ARRESTED") {
      return "ARRESTED";
    }
    if (value === "RELEASED") {
      return "RELEASED";
    }
    if (value === "FLED_VEHICLE") {
      return "FLED IN VEHICLE";
    }
    if (value === "FLED_FOOT" || value === "FLED") {
      return value === "FLED_FOOT" ? "FLED ON FOOT" : "FLED";
    }
    return value;
  }

  function paintBanner(record) {
    record = record || (pageKey() === "encounter-form" ? collectEncounter() : null);
    var idEl = byId("encBannerId");
    var cityEl = byId("encBannerCity");
    var factsEl = byId("encBannerFacts");
    if (!idEl) {
      return;
    }
    idEl.textContent = (record && record.encounterId) || "New encounter";
    var centerId = record && record.centerLocationId;
    var city = "";
    ((record && record.locations) || []).forEach(function (loc) {
      if (centerId && loc.locationId === centerId && loc.city) {
        city = loc.city;
      }
    });
    if (!city) {
      var firstLoc = ((record && record.locations) || [])[0];
      city = (firstLoc && firstLoc.city) || "";
    }
    if (cityEl) {
      cityEl.textContent = city;
    }
    var bits = [];
    var veh = bannerVehicleText(record);
    if (veh) {
      bits.push(veh);
    }
    var groups = Object.create(null);
    var order = [];
    (encounterSubjects || []).forEach(function (row) {
      var adj = citizenAdjective(row && row.citizenship);
      var out = String((row && row.outcome) || "").toUpperCase() || "PRESENT";
      var key = adj + "|" + out;
      if (!groups[key]) {
        groups[key] = { adj: adj, out: out, n: 0 };
        order.push(key);
      }
      groups[key].n += 1;
    });
    order.forEach(function (key) {
      var g = groups[key];
      var noun = g.n === 1 ? "national" : "nationals";
      bits.push(
        g.out === "PRESENT"
          ? g.n + " " + g.adj + " " + noun
          : g.n + " " + g.adj + " " + noun + " " + outcomeWords(g.out)
      );
    });
    if (factsEl) {
      factsEl.textContent = bits.join(" · ");
    }
  }

  function paintReviewMap(record) {
    var host = byId("reviewMap");
    if (!host) {
      return;
    }
    var points = [];
    (record.locations || []).forEach(function (loc) {
      var lat = parseFloat(loc.latitude);
      var lng = parseFloat(loc.longitude);
      if (!isFinite(lat) || !isFinite(lng)) {
        return;
      }
      points.push({
        loc: loc,
        lat: lat,
        lng: lng,
        center: !!(record.centerLocationId && loc.locationId === record.centerLocationId)
      });
    });
    if (reviewMapInstance && typeof reviewMapInstance.remove === "function") {
      reviewMapInstance.remove();
      reviewMapInstance = null;
    }
    if (!points.length || typeof window.L === "undefined") {
      host.hidden = true;
      return;
    }
    host.hidden = false;
    reviewMapInstance = window.L.map(host, {
      zoomControl: true,
      attributionControl: false
    });
    window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19
    }).addTo(reviewMapInstance);
    var center = null;
    points.forEach(function (point) {
      if (point.center) {
        center = point;
      }
    });
    if (!center) {
      center = points[0];
    }
    points.forEach(function (point) {
      window.L.circleMarker([point.lat, point.lng], {
        radius: point.center ? 10 : 6,
        color: point.center ? "#e96868" : "#b58bea",
        fillColor: point.center ? "#e96868" : "#b58bea",
        fillOpacity: 0.9,
        weight: 2
      })
        .bindTooltip(
          (point.loc.association || "Location") + (point.center ? " (center)" : "")
        )
        .addTo(reviewMapInstance);
      if (!point.center && center) {
        window.L.polyline(
          [
            [point.lat, point.lng],
            [center.lat, center.lng]
          ],
          { color: "#b58bea", weight: 2, opacity: 0.65 }
        ).addTo(reviewMapInstance);
      }
    });
    reviewMapInstance.fitBounds(
      points.map(function (point) {
        return [point.lat, point.lng];
      }),
      { padding: [28, 28], maxZoom: 16 }
    );
    setTimeout(function () {
      if (reviewMapInstance && reviewMapInstance.invalidateSize) {
        reviewMapInstance.invalidateSize();
      }
    }, 60);
  }

  function paintReviewHistory(record) {
    var host = byId("reviewHistory");
    if (!host) {
      return;
    }
    var rows = (record && record.completedHistory) || [];
    host.replaceChildren();
    if (!rows.length && !(record && record.completed)) {
      host.hidden = true;
      return;
    }
    host.hidden = false;
    rows.forEach(function (row) {
      var li = document.createElement("li");
      var when = (row && row.generatedAt) || "";
      var reason = (row && row.reason) || "";
      li.textContent =
        "Snapshot " +
        (when ? when.slice(0, 16).replace("T", " ") : "") +
        (reason ? " · unlocked: " + reason : "");
      host.appendChild(li);
    });
    if (record && record.completed) {
      var current = document.createElement("li");
      current.textContent =
        "Current snapshot copdocx.encounter-snapshot.v1" +
        (record.completed.generatedAt
          ? " · " + String(record.completed.generatedAt).slice(0, 16).replace("T", " ")
          : "");
      host.appendChild(current);
    }
  }

  function paintReview() {
    var record = collectEncounter();
    var stored =
      model() && model().store && record.encounterId
        ? model().store.getEncounter(record.encounterId)
        : null;
    if (stored) {
      record.completed = stored.completed || record.completed;
      record.completedHistory = stored.completedHistory || record.completedHistory;
      record.unlock = stored.unlock || record.unlock;
      if (stored.meta) {
        record.meta = stored.meta;
      }
    }
    var stop = byId("reviewStop");
    if (stop) {
      var bits = [
        record.encounterId,
        record.startedAt,
        record.eventType,
        record.operationId
      ].filter(Boolean);
      stop.textContent = bits.length ? bits.join(" · ") : "No stop yet.";
    }
    var stale = byId("reviewStale");
    if (stale) {
      stale.hidden = !(record.completed && !isComplete(record));
    }
    var locHost = byId("reviewLocations");
    if (locHost) {
      locHost.replaceChildren();
      (record.locations || []).forEach(function (loc) {
        var li = document.createElement("li");
        var label = (loc.association || "Location") + " · " + (locationLabel(loc) || "—");
        if (loc.locationId && loc.locationId === record.centerLocationId) {
          var strong = document.createElement("strong");
          strong.textContent = label + " (center)";
          li.appendChild(strong);
        } else {
          li.textContent = label;
        }
        locHost.appendChild(li);
      });
      if (!locHost.childNodes.length) {
        var empty = document.createElement("li");
        empty.textContent = "No locations.";
        locHost.appendChild(empty);
      }
    }
    paintReviewMap(record);
    var vehEl = byId("reviewVehicles");
    if (vehEl) {
      var vehBits = (record.vehicles || []).map(function (veh) {
        return (
          [veh.vehicleColor, veh.vehicleMake, veh.vehicleModel].filter(Boolean).join(" ") ||
          [veh.plateState, veh.licensePlate || veh.plate].filter(Boolean).join(" ") ||
          "Vehicle"
        );
      });
      vehEl.textContent = vehBits.length ? vehBits.join("; ") : "No vehicles.";
    }
    var ofcEl = byId("reviewOfficers");
    if (ofcEl) {
      ofcEl.textContent = encounterOfficerIds.length
        ? encounterOfficerIds.map(officerDisplayName).join("; ")
        : "No officers loaded.";
    }
    var subEl = byId("reviewSubjects");
    if (subEl) {
      subEl.textContent = encounterSubjects.length
        ? encounterSubjects
            .map(function (row) {
              var name = [row.lastName, row.firstName].filter(Boolean).join(", ") || "Unidentified";
              return name + (row.outcome ? " · " + outcomeWords(row.outcome) : "");
            })
            .join("; ")
        : "No subjects.";
    }
    var evEl = byId("reviewEvidence");
    if (evEl) {
      evEl.textContent = "Scene files list on the Evidence tab.";
    }
    var confirmBtn = byId("confirmEncounter");
    var unlockBlock = byId("reviewUnlock");
    var locked = isComplete(record);
    if (confirmBtn) {
      confirmBtn.hidden = locked;
      confirmBtn.textContent = record.completed
        ? "Re-confirm snapshot"
        : "Confirm and close encounter";
    }
    if (unlockBlock) {
      unlockBlock.hidden = !locked;
    }
    paintReviewHistory(record);
  }

  function evidenceAssocOptions() {
    var opts = [{ value: "scene", label: "Encounter (scene)" }];
    encounterSubjects.forEach(function (row) {
      if (!row || !row.bookinRecordId) {
        return;
      }
      opts.push({
        value: "subject:" + (row.subjectId || row.personId),
        label:
          ([row.lastName, row.firstName].filter(Boolean).join(", ") || "Subject") +
          " (booked)"
      });
    });
    var record = collectEncounter();
    (record.vehicles || []).forEach(function (veh) {
      var label =
        [veh.plateState, veh.licensePlate || veh.plate].filter(Boolean).join(" ") ||
        [veh.vehicleColor, veh.vehicleMake, veh.vehicleModel].filter(Boolean).join(" ") ||
        "Vehicle";
      opts.push({
        value: "vehicle:" + (veh.vehicleId || ""),
        label: label
      });
    });
    return opts;
  }

  function fillEvidenceOwnerSelect(selected) {
    var sel = byId("evOwner");
    if (!sel) {
      return;
    }
    var current = selected || sel.value || "scene";
    sel.replaceChildren();
    evidenceAssocOptions().forEach(function (item) {
      var opt = document.createElement("option");
      opt.value = item.value;
      opt.textContent = item.label;
      sel.appendChild(opt);
    });
    sel.value = current;
    if (!sel.value) {
      sel.value = "scene";
    }
  }

  function evidenceTag(value) {
    var text = String(value || "scene");
    return text.indexOf("assoc:") === 0 ? text : "assoc:" + text;
  }

  function currentEvidenceTag(row) {
    var tags = (row && row.tags) || [];
    var i;
    for (i = 0; i < tags.length; i++) {
      if (String(tags[i]).indexOf("assoc:") === 0) {
        return String(tags[i]).slice(6);
      }
    }
    return "scene";
  }

  function setEvidenceLinks() {
    var id = (byId("encounterId") && byId("encounterId").value) || queryId();
    var photo = byId("addEncounterPhoto");
    var file = byId("addEncounterFile");
    if (!id) {
      return;
    }
    saveDraftQuiet({ force: true });
    var q =
      "ownerType=ENCOUNTER&id=" +
      encodeURIComponent(id) +
      "&encounterId=" +
      encodeURIComponent(id) +
      "&return=" +
      encodeURIComponent("encounter-form.html?id=" + id);
    if (photo) {
      photo.href = "photo-picker.html?" + q;
    }
    if (file) {
      file.href = "file-upload.html?" + q;
    }
  }

  function paintEvidence() {
    fillEvidenceOwnerSelect();
    setEvidenceLinks();
    var grid = byId("evidenceGrid");
    var media = window.COPDoc && COPDoc.media;
    var id = (byId("encounterId") && byId("encounterId").value) || queryId();
    if (!grid) {
      return;
    }
    if (!media || typeof media.list !== "function" || !id) {
      grid.replaceChildren();
      return;
    }
    media.list({ type: "ENCOUNTER", id: id }).then(function (rows) {
      grid.replaceChildren();
      var options = evidenceAssocOptions();
      if (!rows.length) {
        var empty = document.createElement("div");
        empty.className = "evidence-thumb";
        empty.textContent = "No files yet";
        grid.appendChild(empty);
        var reviewEv = byId("reviewEvidence");
        if (reviewEv) {
          reviewEv.textContent = "No scene files.";
        }
        return;
      }
      var reviewEv = byId("reviewEvidence");
      if (reviewEv) {
        reviewEv.textContent = rows.length + " scene file" + (rows.length === 1 ? "" : "s");
      }
      rows.forEach(function (row) {
        var thumb = document.createElement("div");
        thumb.className = "evidence-thumb";
        var name = document.createElement("span");
        name.textContent = row.originalName || row.caption || row.kind || "File";
        thumb.appendChild(name);
        var sel = document.createElement("select");
        options.forEach(function (item) {
          var opt = document.createElement("option");
          opt.value = item.value;
          opt.textContent = item.label;
          sel.appendChild(opt);
        });
        sel.value = currentEvidenceTag(row);
        if (!sel.value) {
          sel.value = "scene";
        }
        sel.addEventListener("change", function () {
          if (typeof media.update !== "function") {
            return;
          }
          var nextTags = (row.tags || []).filter(function (tag) {
            return String(tag).indexOf("assoc:") !== 0;
          });
          nextTags.push(evidenceTag(sel.value));
          media.update(row.mediaId, { tags: nextTags }).then(function () {
            setStatus("Evidence association saved.", true);
          });
        });
        thumb.appendChild(sel);
        grid.appendChild(thumb);
      });
    }).catch(function () {
      grid.replaceChildren();
    });
  }

  function stubNext(message) {
    setStatus(message);
  }

  var subjectFloatState = {
    mode: "",
    fromBrowse: false
  };

  function selectedRadio(name) {
    var el = document.querySelector('input[name="' + name + '"]:checked');
    return el ? String(el.value || "") : "";
  }

  function setNamedRadio(name, value) {
    var wanted = String(value || "");
    var matched = false;
    document.querySelectorAll('input[name="' + name + '"]').forEach(function (el) {
      el.checked = el.value === wanted;
      if (el.checked) {
        matched = true;
      }
    });
    return matched;
  }

  function citizenAdjective(value) {
    var key = String(value || "").trim();
    if (!key) {
      return "unknown";
    }
    var list = window.COUNTRIES || [];
    var i;
    for (i = 0; i < list.length; i++) {
      var row = list[i];
      if (!row) {
        continue;
      }
      if (
        row.code === key ||
        String(row.label || "").toLowerCase() === key.toLowerCase()
      ) {
        return row.demonym || row.label || key;
      }
    }
    return key;
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

  function stageLabel(role) {
    var key = String(role || "").toUpperCase();
    if (key === "TARGET") {
      return "Target";
    }
    if (key === "DETAINEE") {
      return "Detainee";
    }
    if (key === "LEAD") {
      return "Lead";
    }
    return "Person";
  }

  function normalizeAlien(value) {
    return String(value || "").replace(/\s/g, "").toUpperCase();
  }

  function encounterHasVehicles() {
    if (document.querySelectorAll("#encounterVehicleList > fieldset").length) {
      return true;
    }
    var record = collectEncounter();
    return !!(record && record.vehicles && record.vehicles.length);
  }

  function findPersonByAlienNumber(aNumber) {
    var needle = normalizeAlien(aNumber);
    if (!needle) {
      return null;
    }
    var m = model();
    if (!m || !m.store || typeof m.store.allPeople !== "function") {
      return null;
    }
    var people = m.store.allPeople() || [];
    var i;
    for (i = 0; i < people.length; i++) {
      var have = normalizeAlien(
        people[i] && people[i].immigration && people[i].immigration.alienNumber
      );
      if (have && have === needle) {
        return people[i];
      }
    }
    return null;
  }

  function subjectAlreadyOnEncounter(personId, exceptKey) {
    if (!personId) {
      return false;
    }
    return encounterSubjects.some(function (row) {
      if (!row || row.personId !== personId) {
        return false;
      }
      if (exceptKey && subjectKey(row) === exceptKey) {
        return false;
      }
      return true;
    });
  }

  function listExistingCandidates() {
    var m = model();
    if (!m || !m.store) {
      return [];
    }
    m.store.loadFromDisk();
    var seen = Object.create(null);
    var rows = [];
    (m.store.listLeads() || []).forEach(function (row) {
      if (!row || row.metaStatus === "draft") {
        return;
      }
      var lead = m.store.getLead(row.leadId);
      if (!lead) {
        return;
      }
      var person = m.subjectOf ? m.subjectOf(lead) : lead.person;
      if (!person || !person.personId || seen[person.personId]) {
        return;
      }
      seen[person.personId] = true;
      var name = person.name || {};
      rows.push({
        personId: person.personId,
        leadId: row.leadId,
        lastName: name.lastName || "",
        firstName: name.firstName || "",
        alienNumber: (person.immigration && person.immigration.alienNumber) || "",
        citizenship: person.citizenship || "",
        dateOfBirth: person.dateOfBirth || "",
        caseRole: person.caseRole || lead.caseRole || "",
        city: personCity(person)
      });
    });
    (m.store.allPeople() || []).forEach(function (person) {
      if (!person || !person.personId || person.junked || seen[person.personId]) {
        return;
      }
      seen[person.personId] = true;
      var name = person.name || {};
      rows.push({
        personId: person.personId,
        leadId: "",
        lastName: name.lastName || "",
        firstName: name.firstName || "",
        alienNumber: (person.immigration && person.immigration.alienNumber) || "",
        citizenship: person.citizenship || "",
        dateOfBirth: person.dateOfBirth || "",
        caseRole: person.caseRole || "",
        city: personCity(person)
      });
    });
    return rows;
  }

  function paintExistingCandidates(query) {
    var body = byId("existingBody");
    if (!body) {
      return;
    }
    var q = String(query || "")
      .trim()
      .toLowerCase();
    var rows = listExistingCandidates().filter(function (row) {
      if (subjectAlreadyOnEncounter(row.personId)) {
        return false;
      }
      if (!q) {
        return true;
      }
      var hay = [
        row.lastName,
        row.firstName,
        row.alienNumber,
        row.city,
        stageLabel(row.caseRole)
      ]
        .join(" ")
        .toLowerCase();
      return hay.indexOf(q) !== -1;
    });
    body.replaceChildren();
    if (!rows.length) {
      var empty = document.createElement("tr");
      var td = document.createElement("td");
      td.colSpan = 5;
      td.textContent = q
        ? "No matching cases or people."
        : "No committed cases or saved people yet.";
      empty.appendChild(td);
      body.appendChild(empty);
      return;
    }
    rows.forEach(function (row) {
      var tr = document.createElement("tr");
      var name = [row.lastName, row.firstName].filter(Boolean).join(", ") || "—";
      [name, stageLabel(row.caseRole), row.alienNumber || "—", row.city || "—"].forEach(
        function (text) {
          var cell = document.createElement("td");
          cell.textContent = text;
          tr.appendChild(cell);
        }
      );
      var actions = document.createElement("td");
      var select = document.createElement("button");
      select.type = "button";
      select.className = "action-button compact";
      select.textContent = "Select";
      select.addEventListener("click", function () {
        openSubjectFields({
          mode: "existing",
          fromBrowse: true,
          personId: row.personId,
          leadId: row.leadId,
          lastName: row.lastName,
          firstName: row.firstName,
          citizenship: row.citizenship,
          alienNumber: row.alienNumber,
          dateOfBirth: row.dateOfBirth,
          caseRole: row.caseRole
        });
      });
      actions.appendChild(select);
      tr.appendChild(actions);
      body.appendChild(tr);
    });
  }

  function fillArrestingOfficerSelect(selected) {
    var sel = byId("arrestingOfficer");
    if (!sel) {
      return;
    }
    sel.replaceChildren();
    var blank = document.createElement("option");
    blank.value = "";
    blank.textContent = encounterOfficerIds.length
      ? "Select an officer on this encounter"
      : "No officers on this encounter — add them on Stop first";
    sel.appendChild(blank);
    encounterOfficerIds.forEach(function (id) {
      var opt = document.createElement("option");
      opt.value = id;
      var row = officerRecord(id);
      opt.textContent =
        officerDisplayName(id) + (row && row.badge ? " · " + row.badge : "");
      sel.appendChild(opt);
    });
    if (selected) {
      sel.value = selected;
    }
  }

  function fillCitizenshipSelect(selected) {
    var sel = byId("subCitizen");
    if (!sel) {
      return;
    }
    if (typeof populateCitizenshipSelect === "function") {
      populateCitizenshipSelect(sel, false);
    } else if (!sel.options.length) {
      var blank = document.createElement("option");
      blank.value = "";
      blank.textContent = "Select a Country";
      sel.appendChild(blank);
    }
    if (selected) {
      sel.value = selected;
      if (sel.value !== selected) {
        var i;
        for (i = 0; i < sel.options.length; i++) {
          if (
            String(sel.options[i].text || "").toLowerCase() ===
            String(selected).toLowerCase()
          ) {
            sel.selectedIndex = i;
            break;
          }
        }
      }
    }
  }

  function setSubjectPhotoHref(personId) {
    var slot = byId("subjectPhoto");
    if (!slot) {
      return;
    }
    var encId = (byId("encounterId") && byId("encounterId").value) || queryId();
    var parts = ["ownerType=PERSON"];
    if (personId) {
      parts.push("id=" + encodeURIComponent(personId));
    }
    if (encId) {
      parts.push(
        "return=" + encodeURIComponent("encounter-form.html?id=" + encId)
      );
    }
    slot.href = "photo-picker.html?" + parts.join("&");
    slot.textContent = personId ? "Add photo" : "Save subject to add photo";
  }

  function resetSubjectFields() {
    ["subPersonId", "subLeadId", "subSubjectId", "subEditKey", "subLast", "subFirst", "subAlien", "subDob", "encounterRoleOther"].forEach(
      function (id) {
        if (byId(id)) {
          byId(id).value = "";
        }
      }
    );
    setNamedRadio("subRole", "TARGET");
    setNamedRadio("subOutcome", "ARRESTED");
    setNamedRadio("subVehicleRole", "");
    setNamedRadio("subCompliance", "COMPLIANT");
    setNamedRadio("subUof", "no");
    setNamedRadio("subForceLevel", "");
    fillCitizenshipSelect("");
    fillArrestingOfficerSelect("");
    var vehField = byId("vehicleRoleField");
    if (vehField) {
      vehField.hidden = !encounterHasVehicles();
    }
    var save = byId("saveSubject");
    if (save) {
      save.textContent = "Add to encounter";
    }
  }

  function showFloatPanel(which) {
    var browse = byId("encFloatBrowse");
    var fields = byId("encFloatFields");
    if (browse) {
      browse.hidden = which !== "browse";
    }
    if (fields) {
      fields.hidden = which !== "fields";
    }
  }

  function placeSubjectFloat() {
    var floatEl = byId("encSubjectFloat");
    if (!floatEl) {
      return;
    }
    floatEl.style.left = "50%";
    floatEl.style.top = "4.75rem";
    floatEl.style.transform = "translateX(-50%)";
    floatEl.hidden = false;
  }

  function closeSubjectFloat() {
    var floatEl = byId("encSubjectFloat");
    if (floatEl) {
      floatEl.hidden = true;
    }
    subjectFloatState.mode = "";
    subjectFloatState.fromBrowse = false;
  }

  function openSubjectBrowse() {
    if (isComplete(collectEncounter())) {
      setStatus("This encounter is completed and locked.");
      return;
    }
    saveDraftQuiet({ force: true });
    subjectFloatState.mode = "existing";
    subjectFloatState.fromBrowse = true;
    if (byId("encFloatTitle")) {
      byId("encFloatTitle").textContent = "Add existing";
    }
    if (byId("caseSearch")) {
      byId("caseSearch").value = "";
    }
    paintExistingCandidates("");
    showFloatPanel("browse");
    placeSubjectFloat();
  }

  function openSubjectFields(opts) {
    opts = opts || {};
    if (isComplete(collectEncounter())) {
      setStatus("This encounter is completed and locked.");
      return;
    }
    saveDraftQuiet({ force: true });
    resetSubjectFields();
    subjectFloatState.mode = opts.mode || "new";
    subjectFloatState.fromBrowse = !!opts.fromBrowse;
    var title = byId("encFloatTitle");
    var note = byId("encFloatFieldsNote");
    var save = byId("saveSubject");
    if (opts.mode === "edit") {
      if (title) {
        title.textContent = "Edit subject";
      }
      if (note) {
        note.textContent = "Encounter-specific fields. Edit does not open Book-in.";
      }
      if (save) {
        save.textContent = "Save subject";
      }
    } else if (opts.mode === "existing") {
      if (title) {
        title.textContent = "Add existing";
      }
      if (note) {
        note.textContent =
          "Role and outcome are for this encounter. This does not open Book-in and does not mint a second person.";
      }
    } else {
      if (title) {
        title.textContent = "Add new";
      }
      if (note) {
        note.textContent =
          "Mints a Person only. Detainee and Book-in wait until Book if this person is arrested.";
      }
    }
    var m = model();
    var personId = opts.personId || "";
    if (!personId && opts.mode === "new" && m && m.newId) {
      personId = m.newId("p");
    }
    if (byId("subPersonId")) {
      byId("subPersonId").value = personId;
    }
    if (byId("subLeadId")) {
      byId("subLeadId").value = opts.leadId || "";
    }
    if (byId("subSubjectId")) {
      byId("subSubjectId").value = opts.subjectId || "";
    }
    if (byId("subEditKey")) {
      byId("subEditKey").value = opts.editKey || "";
    }
    if (byId("subLast")) {
      byId("subLast").value = opts.lastName || "";
    }
    if (byId("subFirst")) {
      byId("subFirst").value = opts.firstName || "";
    }
    if (byId("subAlien")) {
      byId("subAlien").value = opts.alienNumber || "";
    }
    if (byId("subDob")) {
      byId("subDob").value = opts.dateOfBirth || "";
    }
    fillCitizenshipSelect(opts.citizenship || "");
    var defaultRole = "TARGET";
    if (opts.encounterRole) {
      defaultRole = opts.encounterRole;
    } else if (opts.mode === "existing") {
      var stage = String(opts.caseRole || "").toUpperCase();
      defaultRole = stage === "LEAD" || stage === "TARGET" ? "TARGET" : "COLLATERAL";
    }
    setNamedRadio("subRole", defaultRole);
    if (byId("encounterRoleOther")) {
      byId("encounterRoleOther").value = opts.roleOther || "";
    }
    setNamedRadio("subOutcome", opts.outcome || "ARRESTED");
    setNamedRadio("subVehicleRole", opts.vehicleRole || "");
    setNamedRadio("subCompliance", opts.compliance || "COMPLIANT");
    setNamedRadio("subUof", opts.useOfForce || "no");
    setNamedRadio("subForceLevel", opts.forceLevel || "");
    fillArrestingOfficerSelect(opts.arrestingOfficerId || "");
    setSubjectPhotoHref(personId);
    var vehField = byId("vehicleRoleField");
    if (vehField) {
      vehField.hidden = !encounterHasVehicles();
    }
    showFloatPanel("fields");
    placeSubjectFloat();
  }

  function openNewSubject() {
    openSubjectFields({ mode: "new" });
  }

  function openEditSubject(row) {
    if (!row) {
      return;
    }
    var person =
      row.personId && model() && model().store && model().store.getPerson
        ? model().store.getPerson(row.personId)
        : null;
    var name = (person && person.name) || {};
    openSubjectFields({
      mode: "edit",
      fromBrowse: false,
      editKey: subjectKey(row),
      subjectId: row.subjectId || "",
      personId: row.personId || "",
      leadId: row.leadId || "",
      lastName: row.lastName || name.lastName || "",
      firstName: row.firstName || name.firstName || "",
      citizenship: row.citizenship || (person && person.citizenship) || "",
      alienNumber:
        row.alienNumber ||
        (person && person.immigration && person.immigration.alienNumber) ||
        "",
      dateOfBirth: (person && person.dateOfBirth) || "",
      encounterRole: row.encounterRole || "",
      roleOther: row.roleOther || "",
      outcome: row.outcome || "",
      vehicleRole: row.vehicleRole || "",
      compliance: row.compliance || "",
      useOfForce: row.useOfForce || "",
      forceLevel: row.forceLevel || "",
      arrestingOfficerId: row.arrestingOfficerId || ""
    });
  }

  function upsertSubjectPerson(fields) {
    var m = model();
    if (!m || !m.store || typeof m.createPerson !== "function") {
      return { ok: false, error: "Could not save the person." };
    }
    m.store.loadFromDisk();
    var previous = fields.personId ? m.store.getPerson(fields.personId) : null;
    if (fields.alienNumber) {
      var hit = findPersonByAlienNumber(fields.alienNumber);
      if (hit && hit.personId && hit.personId !== fields.personId) {
        if (subjectAlreadyOnEncounter(hit.personId, fields.editKey)) {
          return {
            ok: false,
            error: "That A-Number is already a subject on this encounter."
          };
        }
        previous = hit;
        fields.personId = hit.personId;
        setStatus("Reused the existing person with that A-Number.", true);
      }
    }
    var person = m.createPerson(
      previous
        ? Object.assign({}, previous, {
            personId: previous.personId,
            name: Object.assign({}, previous.name, {
              lastName: fields.lastName,
              firstName: fields.firstName
            }),
            citizenship: fields.citizenship || previous.citizenship || "",
            dateOfBirth: fields.dateOfBirth || previous.dateOfBirth || "",
            immigration: Object.assign({}, previous.immigration, {
              alienNumber: fields.alienNumber || (previous.immigration && previous.immigration.alienNumber) || ""
            })
          })
        : {
            personId: fields.personId,
            caseRole: "",
            name: { lastName: fields.lastName, firstName: fields.firstName },
            citizenship: fields.citizenship,
            dateOfBirth: fields.dateOfBirth,
            immigration: { alienNumber: fields.alienNumber }
          }
    );
    if (!previous) {
      person.caseRole = "";
    } else if (previous.caseRole) {
      person.caseRole = previous.caseRole;
    }
    var saved = m.store.upsertPerson(person);
    if (!saved || !saved.ok) {
      return { ok: false, error: (saved && saved.error) || "Could not save the person." };
    }
    return { ok: true, person: m.store.getPerson(person.personId) || person };
  }

  function saveSubjectToEncounter() {
    var lastName = String((byId("subLast") && byId("subLast").value) || "").trim();
    var firstName = String((byId("subFirst") && byId("subFirst").value) || "").trim();
    var role = selectedRadio("subRole") || "TARGET";
    var outcome = selectedRadio("subOutcome") || "";
    var roleOther = String((byId("encounterRoleOther") && byId("encounterRoleOther").value) || "").trim();
    if (!lastName && !firstName) {
      setStatus("Enter a last name or first name.");
      return;
    }
    if (role === "OTHER" && !roleOther) {
      setStatus("Describe the other role.");
      return;
    }
    if (!outcome) {
      setStatus("Pick an outcome.");
      return;
    }
    var editKey = (byId("subEditKey") && byId("subEditKey").value) || "";
    var personId = (byId("subPersonId") && byId("subPersonId").value) || "";
    if (personId && subjectAlreadyOnEncounter(personId, editKey)) {
      setStatus("That person is already on this encounter.");
      return;
    }
    var fields = {
      personId: personId,
      leadId: (byId("subLeadId") && byId("subLeadId").value) || "",
      subjectId: (byId("subSubjectId") && byId("subSubjectId").value) || "",
      editKey: editKey,
      lastName: lastName,
      firstName: firstName,
      citizenship: (byId("subCitizen") && byId("subCitizen").value) || "",
      alienNumber: String((byId("subAlien") && byId("subAlien").value) || "").trim(),
      dateOfBirth: (byId("subDob") && byId("subDob").value) || ""
    };
    var personResult = upsertSubjectPerson(fields);
    if (!personResult.ok) {
      setStatus(personResult.error);
      return;
    }
    var person = personResult.person;
    if (subjectAlreadyOnEncounter(person.personId, editKey)) {
      setStatus("That person is already on this encounter.");
      return;
    }
    var useOfForce = selectedRadio("subUof") || "no";
    var forceLevel = useOfForce === "yes" ? selectedRadio("subForceLevel") : "";
    var techniques = forceLevel ? [forceLevel] : [];
    var extra = {
      subjectId: fields.subjectId,
      personId: person.personId,
      leadId: fields.leadId,
      lastName: (person.name && person.name.lastName) || lastName,
      firstName: (person.name && person.name.firstName) || firstName,
      alienNumber: (person.immigration && person.immigration.alienNumber) || fields.alienNumber,
      citizenship: person.citizenship || fields.citizenship,
      encounterRole: role,
      roleOther: role === "OTHER" ? roleOther : "",
      vehicleRole: encounterHasVehicles() ? selectedRadio("subVehicleRole") : "",
      outcome: outcome,
      custody: outcome === "ARRESTED" ? "IN_CUSTODY" : "NOT_IN_CUSTODY",
      arrestingOfficerId: outcome === "ARRESTED" ? ((byId("arrestingOfficer") && byId("arrestingOfficer").value) || "") : "",
      compliance: selectedRadio("subCompliance") || "",
      useOfForce: useOfForce,
      forceLevel: forceLevel,
      techniques: techniques
    };
    var subject =
      model() && typeof model().encounterSubjectFromPerson === "function"
        ? model().encounterSubjectFromPerson(person, extra)
        : cloneSubject(extra);
    if (editKey) {
      var replaced = false;
      encounterSubjects = encounterSubjects.map(function (row) {
        if (subjectKey(row) === editKey) {
          replaced = true;
          subject.bookinRecordId = row.bookinRecordId || "";
          subject.packetFiledAt = row.packetFiledAt || "";
          subject.docsGeneratedAt = "";
          subject.subjectId = row.subjectId || subject.subjectId;
          return subject;
        }
        return row;
      });
      if (!replaced) {
        encounterSubjects.push(subject);
      }
    } else {
      encounterSubjects.push(subject);
    }
    saveDraftQuiet({ force: true });
    paintSubjectsTable(
      (byId("encounterId") && byId("encounterId").value) || queryId()
    );
    paintBanner();
    closeSubjectFloat();
    showEncounterTab("tab-subjects");
    setStatus(
      editKey ? "Subject updated." : "Subject added to this encounter.",
      true
    );
  }

  function bindSubjectFloat() {
    var floatEl = byId("encSubjectFloat");
    var bar = byId("encFloatBar");
    if (floatEl && bar && bar.dataset.dragBound !== "true") {
      bar.dataset.dragBound = "true";
      var drag = { on: false, x: 0, y: 0, left: 0, top: 0 };
      bar.addEventListener("mousedown", function (event) {
        if (event.button !== 0 || event.target.closest("button")) {
          return;
        }
        var rect = floatEl.getBoundingClientRect();
        drag.on = true;
        drag.x = event.clientX;
        drag.y = event.clientY;
        drag.left = rect.left;
        drag.top = rect.top;
        floatEl.style.left = rect.left + "px";
        floatEl.style.top = rect.top + "px";
        floatEl.style.transform = "none";
        event.preventDefault();
      });
      document.addEventListener("mousemove", function (event) {
        if (!drag.on) {
          return;
        }
        floatEl.style.left = drag.left + event.clientX - drag.x + "px";
        floatEl.style.top = drag.top + event.clientY - drag.y + "px";
      });
      document.addEventListener("mouseup", function () {
        drag.on = false;
      });
    }
    var closeBtn = byId("encFloatClose");
    if (closeBtn && closeBtn.dataset.bound !== "true") {
      closeBtn.dataset.bound = "true";
      closeBtn.addEventListener("click", closeSubjectFloat);
    }
    var cancelExisting = byId("cancelExisting");
    if (cancelExisting && cancelExisting.dataset.bound !== "true") {
      cancelExisting.dataset.bound = "true";
      cancelExisting.addEventListener("click", closeSubjectFloat);
    }
    var cancelSubject = byId("cancelSubject");
    if (cancelSubject && cancelSubject.dataset.bound !== "true") {
      cancelSubject.dataset.bound = "true";
      cancelSubject.addEventListener("click", function () {
        if (subjectFloatState.fromBrowse && subjectFloatState.mode !== "edit") {
          if (byId("encFloatTitle")) {
            byId("encFloatTitle").textContent = "Add existing";
          }
          paintExistingCandidates((byId("caseSearch") && byId("caseSearch").value) || "");
          showFloatPanel("browse");
          return;
        }
        closeSubjectFloat();
      });
    }
    var save = byId("saveSubject");
    if (save && save.dataset.bound !== "true") {
      save.dataset.bound = "true";
      save.addEventListener("click", saveSubjectToEncounter);
    }
    var search = byId("caseSearch");
    if (search && search.dataset.bound !== "true") {
      search.dataset.bound = "true";
      search.addEventListener("input", function () {
        paintExistingCandidates(search.value);
      });
    }
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        var open = byId("encSubjectFloat");
        if (open && !open.hidden) {
          event.preventDefault();
          closeSubjectFloat();
        }
      }
    });
  }

  var BOOKIN_KEY =
    (window.COPDoc &&
      window.COPDoc.config &&
      window.COPDoc.config.storageKey("bookin")) ||
    "alien-book-in.saved-records.v1";

  function bookinRecords() {
    try {
      var raw = localStorage.getItem(BOOKIN_KEY);
      var list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch (error) {
      return [];
    }
  }

  function writeBookinRecords(list) {
    localStorage.setItem(BOOKIN_KEY, JSON.stringify(list || []));
  }

  function subjectsForEncounter(encounterId) {
    if (!encounterId) {
      return [];
    }
    return bookinRecords()
      .filter(function (row) {
        if (!row || row.encounterId !== encounterId) {
          return false;
        }
        var role = String(row.encounterRole || "").toUpperCase();
        return role === "TARGET" || role === "COLLATERAL";
      })
      .map(function (row) {
        return {
          bookinRecordId: row.id,
          leadId: row.leadId || "",
          lastName: row.lastName || "",
          firstName: row.firstName || "",
          alienNumber: row.aNumber || "",
          encounterRole: row.encounterRole || "",
          updatedAt: row.updatedAt || ""
        };
      });
  }

  function paintList() {
    var body = byId("encountersBody");
    var empty = byId("encountersEmpty");
    var wrap = byId("encountersTableWrap");
    if (!body) {
      return;
    }
    var m = model();
    if (!m || !m.store) {
      return;
    }
    m.store.loadFromDisk();
    if (typeof m.store.diskError === "function" && m.store.diskError()) {
      body.replaceChildren();
      empty.hidden = false;
      wrap.hidden = true;
      empty.textContent = m.store.diskError();
      setStatus(m.store.diskError());
      return;
    }
    var rows = (m.store.listEncounters() || []).filter(function (row) {
      var full = m.store.getEncounter(row.encounterId) || row;
      if (recordFilter === "complete") {
        return isComplete(full);
      }
      if (recordFilter === "draft") {
        return !isComplete(full) && !isCommitted(full);
      }
      if (recordFilter === "committed") {
        return !isComplete(full) && isCommitted(full);
      }
      return true;
    });
    body.replaceChildren();
    empty.hidden = rows.length > 0;
    wrap.hidden = rows.length === 0;
    if (!rows.length) {
      empty.textContent =
        recordFilter === "complete"
          ? "No completed encounters yet."
          : recordFilter === "draft"
            ? "No working encounters."
            : recordFilter === "committed"
              ? "No filed encounters."
              : "No encounters yet.";
    }
    rows.forEach(function (row) {
      var full = m.store.getEncounter(row.encounterId) || row;
      var tr = document.createElement("tr");
      var committed = isCommitted(full);
      var complete = isComplete(full);
      [
        full.encounterId,
        full.startedAt || "—",
        vehicleLine(full) || "—",
        formatAddress((full.locations || [])[0]) || "—",
        subjectsLine({ subjects: subjectsForEncounter(full.encounterId) }) ||
          "—",
        complete ? "Completed" : committed ? "Filed" : "Working"
      ].forEach(function (text, index) {
        var td = document.createElement("td");
        td.textContent = text;
        if (index === 0 && complete) {
          var done = document.createElement("span");
          done.className = "record-status";
          done.textContent = "Completed";
          td.appendChild(document.createTextNode(" "));
          td.appendChild(done);
        } else if (index === 0 && !committed) {
          var badge = document.createElement("span");
          badge.className = "record-status record-status-draft";
          badge.textContent = "Working";
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
      link.href = "encounter-form.html?id=" + encodeURIComponent(full.encounterId);
      link.textContent = "Open";
      cluster.appendChild(link);
      actions.appendChild(cluster);
      tr.appendChild(actions);
      body.appendChild(tr);
    });
  }

  function ownsField(card, el) {
    var host = el.closest ? el.closest("[data-card]") : null;
    return host === card;
  }

  function readFields(rootEl) {
    var out = {};
    if (!rootEl) {
      return out;
    }
    Array.prototype.forEach.call(
      rootEl.querySelectorAll("input, select, textarea"),
      function (el) {
        if (!ownsField(rootEl, el)) {
          return;
        }
        var key = el.getAttribute("data-field") || "";
        if (!key) {
          return;
        }
        var type = (el.type || "").toLowerCase();
        if (type === "button" || type === "checkbox" || type === "radio") {
          return;
        }
        out[key] = String(el.value || "").trim();
      }
    );
    return out;
  }

  function setCardValue(card, key, value) {
    var el = card.querySelector('[data-field="' + key + '"]');
    if (el && value != null) {
      el.value = value;
    }
  }

  function nestedCards(card, kind) {
    var list = card.querySelector('[data-nested-list="' + kind + '"]');
    if (!list) {
      return [];
    }
    return Array.prototype.slice.call(list.querySelectorAll(":scope > fieldset"));
  }

  function collectLocation(card) {
    var f = readFields(card);
    var loc = model().createLocation({
      locationId: card.dataset.entityId || "",
      street: f.street || "",
      street2: f.street2 || "",
      city: f.city || "",
      state: f.state || "",
      zip: f.zip || "",
      latitude: f.latitude || "",
      longitude: f.longitude || "",
      latLong: f.latLong || "",
      association: f.locationAssociation || f.association || "",
      parksHere: f.parksHere || "",
      targetPriority: f.targetPriority || "",
      pinColor: f.pinColor || ""
    });
    if (!loc.locationId && model().newId) {
      loc.locationId = model().newId("loc");
    }
    if ((!loc.latitude || !loc.longitude) && loc.latLong) {
      var pair = String(loc.latLong).match(
        /(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/
      );
      if (pair) {
        loc.latitude = loc.latitude || pair[1];
        loc.longitude = loc.longitude || pair[2];
      }
    }
    return loc;
  }

  function collectLink(card, vehicleId) {
    var f = readFields(card);
    var reasons = [];
    card.querySelectorAll('[data-field="linkReason"]').forEach(function (el) {
      if (el.checked && el.value) {
        reasons.push(el.value);
      }
    });
    var toId = f.linkedPersonId || "";
    if (!toId && !reasons.length && !f.linkNotes) {
      return null;
    }
    var m = model();
    if (!m || typeof m.createLink !== "function") {
      return null;
    }
    return m.createLink({
      linkId: card.dataset.entityId || (m.newId ? m.newId("link") : ""),
      from: { type: "VEHICLE", id: vehicleId },
      to: { type: "PERSON", id: toId },
      reasons: reasons,
      notes: f.linkNotes || ""
    });
  }

  function collectVehicle(card, links) {
    links = links || [];
    var f = readFields(card);
    var m = model();
    var vehicle = m.createVehicle({
      vehicleId: card.dataset.entityId || "",
      licensePlate: f.licensePlate || "",
      plateState: f.plateState || "",
      vehicleYear: f.vehicleYear || "",
      vehicleMake: f.vehicleMake || "",
      vehicleModel: f.vehicleModel || "",
      vehicleColor: f.vehicleColor || "",
      vehicleBodyStyle: f.vehicleBodyStyle || "",
      vin: f.vin || "",
      registeredOwnerName: f.registeredOwner || "",
      governmentVehicle: false
    });
    if (!vehicle.vehicleId && m.newId) {
      vehicle.vehicleId = m.newId("veh");
    }
    vehicle.encounterDisposition = radioValue(card, "encounterDisposition");
    vehicle.parkedLocationText = f.parkedLocationText || "";
    if (card) {
      card.dataset.entityId = vehicle.vehicleId || "";
    }
    nestedCards(card, "location").forEach(function (locCard) {
      vehicle.locations.push(collectLocation(locCard));
    });
    nestedCards(card, "link").forEach(function (linkCard) {
      var link = collectLink(linkCard, vehicle.vehicleId);
      if (link && link.to && link.to.id) {
        links.push(link);
      }
    });
    return vehicle;
  }

  function collectEncounter() {
    var m = model();
    var id = (byId("encounterId") && byId("encounterId").value) || queryId();
    var previous = (id && m.store.getEncounter(id)) || transientEncounter;
    var record = m.createEncounterRecord({
      encounterId: id || (previous && previous.encounterId)
    });
    if (previous) {
      record = Object.assign({}, previous, record);
      record.meta = previous.meta;
      record.completed = previous.completed || null;
      record.completedHistory = Array.isArray(previous.completedHistory)
        ? previous.completedHistory.slice()
        : [];
    }
    record.startedAt = (byId("encounterStartedAt") && byId("encounterStartedAt").value) || "";
    record.team = (byId("encounterTeam") && byId("encounterTeam").value) || record.team || "3";
    record.officeCode = record.officeCode || "DAL";
    record.eventType = (byId("eventType") && byId("eventType").value) || "";
    record.operationId = (byId("operationId") && byId("operationId").value) || "";
    record.officerIds = encounterOfficerIds.slice();
    record.vehicles = [];
    record.links = [];
    Array.prototype.forEach.call(
      document.querySelectorAll("#encounterVehicleList > fieldset"),
      function (card) {
        record.vehicles.push(collectVehicle(card, record.links));
      }
    );
    record.locations = [];
    Array.prototype.forEach.call(
      document.querySelectorAll("#encounterLocationList > fieldset"),
      function (card) {
        record.locations.push(collectLocation(card));
      }
    );
    var center = document.querySelector(
      '#encounterLocationList [data-field="encounterCenter"]:checked'
    );
    record.centerLocationId = "";
    if (center) {
      var centerCard = center.closest("fieldset");
      record.centerLocationId = (centerCard && centerCard.dataset.entityId) || "";
    }
    record.subjects = encounterSubjects.map(cloneSubject);
    if (previous) {
      record.narratives = Array.isArray(previous.narratives)
        ? previous.narratives.slice()
        : [];
      record.supervisorSummary = previous.supervisorSummary || {
        text: "",
        derivedAt: "",
        coverage: null
      };
    }
    return record;
  }

  function addCard(type) {
    if (window.COPDoc && COPDoc.cards && typeof COPDoc.cards.add === "function") {
      return COPDoc.cards.add(type);
    }
    return null;
  }

  function addNested(card, kind) {
    if (card && card._addNested && typeof card._addNested[kind] === "function") {
      return card._addNested[kind]();
    }
    return null;
  }

  function fillEncounterLocation(card, location) {
    if (!card || !location) {
      return;
    }
    card.dataset.entityId = location.locationId || "";
    setCardValue(card, "locationAssociation", location.association || "");
    setCardValue(card, "street", location.street || "");
    setCardValue(card, "street2", location.street2 || "");
    setCardValue(card, "city", location.city || "");
    setCardValue(card, "state", location.state || "");
    setCardValue(card, "zip", location.zip || "");
    setCardValue(card, "latitude", location.latitude || "");
    setCardValue(card, "longitude", location.longitude || "");
    setCardValue(card, "targetPriority", location.targetPriority || "");
    setCardValue(card, "parksHere", location.parksHere || "");
    if (location.latitude && location.longitude) {
      setCardValue(
        card,
        "latLong",
        location.latitude + ", " + location.longitude
      );
    }
    if (window.COPDoc && COPDoc.cards && COPDoc.cards.paintMedia) {
      COPDoc.cards.paintMedia(card, "LOCATION");
    }
    if (window.COPDoc && COPDoc.locationMap && COPDoc.locationMap.sync) {
      COPDoc.locationMap.sync(card);
    }
    if (typeof fillLocationAssociationSelect === "function") {
      fillLocationAssociationSelect(
        card.querySelector('[data-field="locationAssociation"]')
      );
      setCardValue(card, "locationAssociation", location.association || "");
    }
    syncCenterRadioNames();
  }

  function hydrateEncounter(record) {
    if (!record) {
      return;
    }
    if (byId("encounterId")) {
      byId("encounterId").value = record.encounterId || "";
    }
    if (byId("encounterStartedAt")) {
      byId("encounterStartedAt").value = record.startedAt || "";
    }
    if (byId("encounterTeam")) {
      byId("encounterTeam").value = record.team || "3";
    }
    fillEventTypeSelect(record.eventType || "");
    fillOperationSelect(record.operationId || "");
    encounterOfficerIds = Array.isArray(record.officerIds)
      ? record.officerIds.slice()
      : [];
    loadRoster(record);
    var vehList = byId("encounterVehicleList");
    if (vehList) {
      vehList.replaceChildren();
      (record.vehicles || []).forEach(function (vehicle) {
        var card = addCard("encounterVehicle");
        if (!card) {
          return;
        }
        card.dataset.entityId = vehicle.vehicleId || "";
        [
          "licensePlate",
          "plateState",
          "vehicleYear",
          "vehicleMake",
          "vehicleColor",
          "vin"
        ].forEach(function (key) {
          setCardValue(card, key, vehicle[key] || "");
        });
        var make = card.querySelector('[data-field="vehicleMake"]');
        if (make) {
          make.dispatchEvent(new Event("change"));
        }
        setCardValue(card, "vehicleModel", vehicle.vehicleModel || "");
        var model = card.querySelector('[data-field="vehicleModel"]');
        if (model) {
          model.dispatchEvent(new Event("change"));
        }
        if (vehicle.vehicleBodyStyle) {
          setCardValue(card, "vehicleBodyStyle", vehicle.vehicleBodyStyle);
        }
        setCardValue(card, "registeredOwner", vehicle.registeredOwnerName || "");
        setRadioValue(card, "encounterDisposition", vehicle.encounterDisposition || "");
        setCardValue(card, "parkedLocationText", vehicle.parkedLocationText || "");
        if (window.COPDoc && COPDoc.cards && COPDoc.cards.paintMedia) {
          COPDoc.cards.paintMedia(card, "VEHICLE");
        }
        (vehicle.locations || []).forEach(function (location) {
          var locCard = addNested(card, "location");
          if (locCard) {
            fillEncounterLocation(locCard, location);
          }
        });
        (record.links || []).forEach(function (link) {
          if (!link.from || link.from.id !== vehicle.vehicleId) {
            return;
          }
          var linkCard = addNested(card, "link");
          if (linkCard && typeof window.fillLinkCard === "function") {
            window.fillLinkCard(linkCard, link);
          }
        });
      });
    }
    var locList = byId("encounterLocationList");
    if (locList) {
      locList.replaceChildren();
      (record.locations || []).forEach(function (location) {
        var card = addCard("encounterLocation");
        if (!card) {
          return;
        }
        fillEncounterLocation(card, location);
      });
      syncCenterRadioNames();
      (record.locations || []).forEach(function (location) {
        if (!record.centerLocationId || !location || location.locationId !== record.centerLocationId) {
          return;
        }
        document.querySelectorAll("#encounterLocationList > fieldset").forEach(function (card) {
          if (card.dataset.entityId === location.locationId) {
            setRadioValue(card, "encounterCenter", "1");
          }
        });
      });
    }
    paintOfficers();
    paintSubjectsTable(record.encounterId);
    paintSupervisorSummary(record);
    paintBanner(record);
    paintEvidence();
    lockEncounterForm(isComplete(record));
  }

  function lockEncounterForm(locked) {
    var form = byId("encounterForm");
    if (!form) {
      return;
    }
    form.classList.toggle("is-encounter-locked", !!locked);
    Array.prototype.forEach.call(
      form.querySelectorAll("input, select, textarea, button"),
      function (el) {
        if (el.id === "encounterId") {
          el.readOnly = true;
          el.disabled = false;
          return;
        }
        if (el.getAttribute("role") === "tab") {
          return;
        }
        if (el.id === "unlockEncounter" || el.id === "unlockReason") {
          el.disabled = !locked;
          return;
        }
        if (el.id === "confirmEncounter") {
          el.disabled = !!locked;
          return;
        }
        el.disabled = !!locked;
      }
    );
    if (window.COPDoc && COPDoc.chrome && typeof COPDoc.chrome.mount === "function") {
      COPDoc.chrome.mount();
    }
  }

  function paintSupervisorSummary(record) {
    var el = byId("encounterSupervisorSummary");
    if (!el) {
      return;
    }
    var text =
      record &&
      record.supervisorSummary &&
      String(record.supervisorSummary.text || "").trim();
    el.textContent = text ||
      "No supervisor summary yet. Generate I-213 and update a draft.";
  }

  function subjectLabel(row) {
    var last = String((row && row.lastName) || "").trim();
    var first = String((row && row.firstName) || "").trim();
    if (last && first) {
      return last + ", " + first;
    }
    return [first, last].filter(Boolean).join(" ") || "this subject";
  }

  function bookinHref(encounterId, recordId) {
    var parts = [];
    if (encounterId) {
      parts.push("encounterId=" + encodeURIComponent(encounterId));
    }
    if (recordId) {
      parts.push("recordId=" + encodeURIComponent(recordId));
    }
    return parts.length ? "bookin.html?" + parts.join("&") : "bookin.html";
  }

  function subjectKey(row) {
    return (row && (row.subjectId || row.bookinRecordId || row.personId)) || "";
  }

  function unlinkEncounterSubject(encounterId, key) {
    var row = null;
    encounterSubjects.forEach(function (item) {
      if (item && subjectKey(item) === key) {
        row = item;
      }
    });
    if (
      !window.confirm(
        "Remove " +
          subjectLabel(row) +
          " from this encounter? Their Book-in record is kept."
      )
    ) {
      return;
    }
    encounterSubjects = encounterSubjects.filter(function (item) {
      return subjectKey(item) !== key;
    });
    if (row && row.bookinRecordId) {
      var list = bookinRecords().map(function (item) {
        if (item && item.id === row.bookinRecordId) {
          item.encounterId = "";
        }
        return item;
      });
      writeBookinRecords(list);
    }
    saveDraftQuiet({ force: true });
    paintSubjectsTable(encounterId);
    paintBanner();
    setStatus("Subject removed from this encounter.", true);
  }

  function packetCell(row) {
    var outcome = String((row && row.outcome) || "").toUpperCase();
    if (outcome && outcome !== "ARRESTED") {
      return "—";
    }
    if (row && row.docsGeneratedAt) {
      return "generated";
    }
    if (row && row.bookinRecordId) {
      return "booked";
    }
    return "";
  }

  function bookFormStateField(value, type) {
    return {
      type: type || "text",
      value: String(value == null ? "" : value),
      checked: false
    };
  }

  function closeBookFloat() {
    var floatEl = byId("encBookFloat");
    if (floatEl) {
      floatEl.hidden = true;
    }
  }

  function openBookFloat(row) {
    if (!row) {
      return;
    }
    if (String(row.outcome || "").toUpperCase() !== "ARRESTED") {
      setStatus("Book-in is only for arrested subjects.");
      return;
    }
    if (row.bookinRecordId) {
      setStatus("This subject is already booked-in.");
      return;
    }
    if (isComplete(collectEncounter())) {
      setStatus("This encounter is completed and locked.");
      return;
    }
    saveDraftQuiet({ force: true });
    if (byId("bookSubjectKey")) {
      byId("bookSubjectKey").value = subjectKey(row);
    }
    if (byId("encBookTitle")) {
      byId("encBookTitle").textContent = "Book-in";
    }
    if (byId("bookinWho")) {
      byId("bookinWho").textContent =
        "Book-in " +
        subjectLabel(row) +
        " · ARRESTED. Medical, children, cash, ID.";
    }
    if (byId("bookMedical")) {
      byId("bookMedical").value = "good";
    }
    if (byId("bookChildren")) {
      byId("bookChildren").value = "none";
    }
    if (byId("bookCash")) {
      byId("bookCash").value = "None";
    }
    if (byId("bookId")) {
      byId("bookId").value = "";
    }
    var floatEl = byId("encBookFloat");
    if (floatEl) {
      floatEl.style.left = "50%";
      floatEl.style.top = "4.75rem";
      floatEl.style.transform = "translateX(-50%)";
      floatEl.hidden = false;
    }
  }

  function generateSubjectDocs(row) {
    if (!row || !row.bookinRecordId) {
      setStatus("Book the subject before generating docs.");
      return;
    }
    row.docsGeneratedAt = new Date().toISOString();
    encounterSubjects = encounterSubjects.map(function (item) {
      if (subjectKey(item) === subjectKey(row)) {
        item.docsGeneratedAt = row.docsGeneratedAt;
      }
      return item;
    });
    saveDraftQuiet({ force: true });
    paintSubjectsTable(
      (byId("encounterId") && byId("encounterId").value) || queryId()
    );
    var encId = (byId("encounterId") && byId("encounterId").value) || queryId();
    window.location.href =
      "bookin.html?encounterId=" +
      encodeURIComponent(encId) +
      "&recordId=" +
      encodeURIComponent(row.bookinRecordId);
  }

  function saveBookToEncounter() {
    var key = (byId("bookSubjectKey") && byId("bookSubjectKey").value) || "";
    var row = null;
    encounterSubjects.forEach(function (item) {
      if (item && subjectKey(item) === key) {
        row = item;
      }
    });
    if (!row) {
      setStatus("Subject was not found.");
      return;
    }
    if (String(row.outcome || "").toUpperCase() !== "ARRESTED") {
      setStatus("Book-in is only for arrested subjects.");
      return;
    }
    if (saveDraftQuiet({ force: true }) === false) {
      return;
    }
    var m = model();
    var encounter = collectEncounter();
    var shared =
      m && typeof m.sharedStopFromEncounter === "function"
        ? m.sharedStopFromEncounter(encounter)
        : {};
    row = m && typeof m.stampSharedStop === "function"
      ? m.stampSharedStop(row, shared)
      : row;
    var medical = (byId("bookMedical") && byId("bookMedical").value) || "good";
    var children = (byId("bookChildren") && byId("bookChildren").value) || "none";
    var cash = String((byId("bookCash") && byId("bookCash").value) || "").trim();
    var travelDocs = String((byId("bookId") && byId("bookId").value) || "").trim();
    var now = new Date().toISOString();
    var packetId =
      window.crypto && typeof window.crypto.randomUUID === "function"
        ? window.crypto.randomUUID()
        : "record-" + Date.now().toString(16);
    var officerName = officerDisplayName(row.arrestingOfficerId);
    var booking = {
      cash: cash,
      travelDocuments: travelDocs,
      children: children === "none" ? "" : children,
      medical: {
        noMedicalIssues: medical === "good",
        medicalIssues: medical === "issues" ? "Issues" : ""
      }
    };
    var input =
      m && typeof m.arrestInputFromSubject === "function"
        ? m.arrestInputFromSubject(row, shared, {
            bookinRecordId: packetId,
            bookInDateTime: now,
            arrestingOfficer: officerName,
            booking: booking
          })
        : {};
    var promoted =
      m && m.store && typeof m.store.promoteBookInToLead === "function"
        ? m.store.promoteBookInToLead(input)
        : { ok: false, error: "Could not file the case." };
    if (!promoted || !promoted.ok) {
      setStatus((promoted && promoted.error) || "Could not book this subject.");
      return;
    }
    var packet = {
      id: packetId,
      createdAt: now,
      updatedAt: now,
      firstName: row.firstName || "",
      lastName: row.lastName || "",
      aNumber: row.alienNumber || "",
      dateOfBirth: "",
      countryOfCitizenship: row.citizenship || "",
      dateTime: now,
      arrestTime: input.arrestTime || "",
      encounterId: encounter.encounterId,
      encounterRole: row.encounterRole || "",
      subjectRole: row.encounterRole || "",
      vehiclePosition: input.vehiclePosition || "",
      team: shared.team || encounter.team || "",
      officersName: officerName,
      personId: promoted.personId || row.personId || "",
      leadId: promoted.leadId || "",
      arrestId: promoted.arrestId || "",
      formState: {
        lastName: bookFormStateField(row.lastName),
        firstName: bookFormStateField(row.firstName),
        alienNumber: bookFormStateField(row.alienNumber),
        citizenship: bookFormStateField(row.citizenship),
        cash: bookFormStateField(cash),
        children: bookFormStateField(children === "none" ? "" : children),
        travelDocs: bookFormStateField(travelDocs),
        officersName: bookFormStateField(officerName),
        team: bookFormStateField(shared.team || encounter.team || ""),
        encounterNumber: bookFormStateField(encounter.encounterId),
        noMedicalIssues: {
          type: "checkbox",
          value: "",
          checked: medical === "good"
        },
        medicalIssues: bookFormStateField(
          medical === "issues" ? "Issues" : ""
        )
      }
    };
    var packets = bookinRecords();
    packets.push(packet);
    writeBookinRecords(packets);
    row.bookinRecordId = packetId;
    row.packetFiledAt = now;
    row.leadId = promoted.leadId || row.leadId || "";
    row.personId = promoted.personId || row.personId || "";
    row.docsGeneratedAt = "";
    encounterSubjects = encounterSubjects.map(function (item) {
      return subjectKey(item) === key ? row : item;
    });
    if (encounter.encounterId && row.personId && m.store.linkEncounterVehiclesToPerson) {
      m.store.linkEncounterVehiclesToPerson({
        encounterId: encounter.encounterId,
        bookinRecordId: packetId,
        leadId: row.leadId,
        personId: row.personId
      });
    }
    if (
      row.arrestingOfficerId &&
      window.COPDoc &&
      COPDoc.officers &&
      typeof COPDoc.officers.recordFieldArrest === "function"
    ) {
      COPDoc.officers.recordFieldArrest(row.arrestingOfficerId, {
        arrestId: promoted.arrestId || "",
        encounterId: encounter.encounterId,
        personId: row.personId,
        bookedAt: now
      });
    }
    saveDraftQuiet({ force: true });
    closeBookFloat();
    paintSubjectsTable(encounter.encounterId);
    paintBanner();
    setStatus("Booked-in " + subjectLabel(row) + ".", true);
  }

  function bindBookFloat() {
    var floatEl = byId("encBookFloat");
    var bar = byId("encBookBar");
    if (floatEl && bar && bar.dataset.dragBound !== "true") {
      bar.dataset.dragBound = "true";
      var drag = { on: false, x: 0, y: 0, left: 0, top: 0 };
      bar.addEventListener("mousedown", function (event) {
        if (event.button !== 0 || event.target.closest("button")) {
          return;
        }
        var rect = floatEl.getBoundingClientRect();
        drag.on = true;
        drag.x = event.clientX;
        drag.y = event.clientY;
        drag.left = rect.left;
        drag.top = rect.top;
        floatEl.style.left = rect.left + "px";
        floatEl.style.top = rect.top + "px";
        floatEl.style.transform = "none";
        event.preventDefault();
      });
      document.addEventListener("mousemove", function (event) {
        if (!drag.on) {
          return;
        }
        floatEl.style.left = drag.left + event.clientX - drag.x + "px";
        floatEl.style.top = drag.top + event.clientY - drag.y + "px";
      });
      document.addEventListener("mouseup", function () {
        drag.on = false;
      });
    }
    ["encBookClose", "cancelBookin"].forEach(function (id) {
      var btn = byId(id);
      if (!btn || btn.dataset.bound === "true") {
        return;
      }
      btn.dataset.bound = "true";
      btn.addEventListener("click", closeBookFloat);
    });
    var confirmBtn = byId("confirmBookin");
    if (confirmBtn && confirmBtn.dataset.bound !== "true") {
      confirmBtn.dataset.bound = "true";
      confirmBtn.addEventListener("click", saveBookToEncounter);
    }
  }

  function paintSubjectsTable(encounterId) {
    var body = byId("subjectBody");
    if (!body) {
      return;
    }
    body.replaceChildren();
    var rows = encounterSubjects;
    if (!rows.length) {
      var empty = document.createElement("tr");
      var td = document.createElement("td");
      td.colSpan = 6;
      td.textContent = "No subjects. Add existing or mint new.";
      empty.appendChild(td);
      body.appendChild(empty);
      paintBanner();
      return;
    }
    var m = model();
    var stored =
      m && m.store && encounterId ? m.store.getEncounter(encounterId) : null;
    var locked = isComplete(stored);
    rows.forEach(function (row) {
      var tr = document.createElement("tr");
      var name =
        [row.lastName, row.firstName].filter(Boolean).join(", ") ||
        (row.unidentified ? "Unidentified" : "—");
      var role = String(row.encounterRole || "").toUpperCase();
      var roleLabel =
        role === "OTHER"
          ? "Other"
          : role === "COLLATERAL"
            ? "Collateral"
            : role === "TARGET"
              ? "Target"
              : "—";
      var outcome = String(row.outcome || "").toUpperCase();
      var photo = document.createElement("td");
      photo.textContent = row.personId ? "▣" : "";
      tr.appendChild(photo);
      [name, roleLabel].forEach(function (text) {
        var cell = document.createElement("td");
        cell.textContent = text;
        tr.appendChild(cell);
      });
      var outcomeTd = document.createElement("td");
      if (outcome === "ARRESTED") {
        outcomeTd.className = "outcome-A";
        outcomeTd.textContent = "ARRESTED";
      } else if (outcome === "RELEASED") {
        outcomeTd.className = "outcome-R";
        outcomeTd.textContent = "RELEASED";
      } else if (outcome === "FLED_VEHICLE") {
        outcomeTd.className = "outcome-F";
        outcomeTd.textContent = "FLED IN VEHICLE";
      } else if (outcome === "FLED_FOOT" || outcome === "FLED") {
        outcomeTd.className = "outcome-F";
        outcomeTd.textContent = outcome === "FLED_FOOT" ? "FLED ON FOOT" : "FLED";
      } else {
        outcomeTd.textContent = "—";
      }
      tr.appendChild(outcomeTd);
      var packetTd = document.createElement("td");
      var packet = packetCell(row);
      if (packet === "generated") {
        var genChip = document.createElement("span");
        genChip.className = "status-chip is-generated";
        genChip.textContent = "Generated";
        packetTd.appendChild(genChip);
      } else if (packet === "booked") {
        var chip = document.createElement("span");
        chip.className = "status-chip is-booked";
        chip.textContent = "Booked-in";
        packetTd.appendChild(chip);
      } else {
        packetTd.textContent = "—";
      }
      tr.appendChild(packetTd);
      var actions = document.createElement("td");
      var cluster = document.createElement("div");
      cluster.className = "row-actions";
      var edit = document.createElement("button");
      edit.type = "button";
      edit.className = "action-button-secondary compact";
      edit.textContent = "Edit";
      edit.addEventListener("click", function () {
        openEditSubject(row);
      });
      cluster.appendChild(edit);
      if (outcome === "ARRESTED" && packet !== "booked" && packet !== "generated") {
        var book = document.createElement("button");
        book.type = "button";
        book.className = "action-button compact";
        book.textContent = "Book";
        book.addEventListener("click", function () {
          openBookFloat(row);
        });
        cluster.appendChild(book);
      }
      if (outcome === "ARRESTED" && packet === "booked") {
        var docs = document.createElement("button");
        docs.type = "button";
        docs.className = "action-button compact";
        docs.textContent = "Generate docs";
        docs.addEventListener("click", function () {
          generateSubjectDocs(row);
        });
        cluster.appendChild(docs);
      }
      if (!locked) {
        var remove = document.createElement("button");
        remove.type = "button";
        remove.className = "action-button-danger compact";
        remove.setAttribute("aria-label", "Remove " + subjectLabel(row));
        remove.textContent = "×";
        remove.addEventListener("click", function () {
          unlinkEncounterSubject(encounterId, subjectKey(row));
        });
        cluster.appendChild(remove);
      }
      actions.appendChild(cluster);
      tr.appendChild(actions);
      body.appendChild(tr);
    });
    paintBanner();
  }

  function encounterHasMeaningfulData(record) {
    if (!record) {
      return false;
    }
    if (
      record.startedAt ||
      record.eventType ||
      record.operationId ||
      (record.officerIds || []).length ||
      (record.vehicles || []).length ||
      (record.locations || []).length ||
      (record.subjects || []).length ||
      (record.links || []).length ||
      (record.narratives || []).length
    ) {
      return true;
    }
    if (!transientEncounter) {
      return true;
    }
    return String(record.team || "") !== String(transientEncounter.team || "");
  }

  function rememberPersistedEncounter(record) {
    transientEncounter = null;
    if (record.encounterId && window.history && window.history.replaceState) {
      window.history.replaceState(
        {},
        "",
        "encounter-form.html?id=" + encodeURIComponent(record.encounterId)
      );
    }
    if (window.COPDoc && COPDoc.chrome && typeof COPDoc.chrome.mount === "function") {
      COPDoc.chrome.mount();
    }
  }

  function saveDraftQuiet(options) {
    options = options || {};
    var m = model();
    var record = collectEncounter();
    if (!record.encounterId) {
      return;
    }
    if (!options.force && !encounterHasMeaningfulData(record)) {
      return true;
    }
    if (isComplete(record) || isComplete(m.store.getEncounter(record.encounterId))) {
      return true;
    }
    var saved = m.store.saveEncounter(record, { mode: "draft" });
    if (saved && !saved.ok) {
      setStatus(saved.error || "Could not save the encounter.");
      return false;
    }
    rememberPersistedEncounter(record);
    return true;
  }

  function commitEncounter() {
    var m = model();
    var record = collectEncounter();
    if (isComplete(record) || isComplete(m.store.getEncounter(record.encounterId))) {
      setStatus("This encounter is completed and locked.");
      return;
    }
    if (!record.startedAt) {
      setStatus("Enter the date and time of the encounter.");
      return;
    }
    var saved = m.store.saveEncounter(record, { mode: "commit" });
    if (!saved.ok) {
      setStatus(saved.error || "Could not save the encounter.");
      return;
    }
    transientEncounter = null;
    if (record.encounterId && window.history && window.history.replaceState) {
      window.history.replaceState(
        {},
        "",
        "encounter-form.html?id=" + encodeURIComponent(record.encounterId)
      );
    }
    setStatus("Encounter filed.", true);
  }

  function openEncounterBookIn() {
    var id =
      (byId("encounterId") && byId("encounterId").value) || queryId();
    if (!id) {
      setStatus("Create the encounter first.");
      return;
    }
    var stored = model() && model().store && model().store.getEncounter(id);
    if (isComplete(stored)) {
      setStatus("This encounter is completed and locked.");
      return;
    }
    if (saveDraftQuiet({ force: true }) === false) {
      return;
    }
    window.location.href = bookinHref(id);
  }

  function paintNarrativeTab() {
    var need = byId("narrativeNeedSubjects");
    var frame = byId("narrativeFrame");
    var id = (byId("encounterId") && byId("encounterId").value) || queryId();
    var subjects =
      encounterSubjects.length
        ? encounterSubjects
        : ((model() &&
            model().store &&
            id &&
            model().store.getEncounter(id) &&
            model().store.getEncounter(id).subjects) ||
          []);
    if (!id || !subjects.length) {
      if (frame) {
        frame.hidden = true;
      }
      if (need) {
        need.hidden = false;
        need.textContent = !id
          ? "Create the encounter first."
          : "Add subjects before writing an I-213.";
      }
      return;
    }
    if (saveDraftQuiet({ force: true }) === false) {
      return;
    }
    if (need) {
      need.hidden = true;
    }
    if (!frame) {
      return;
    }
    var url =
      "narrative.html?encounterId=" +
      encodeURIComponent(id) +
      "&embed=1";
    if (frame.getAttribute("src") !== url) {
      frame.src = url;
    }
    frame.hidden = false;
  }

  function generateEncounterNarrative() {
    showEncounterTab("tab-narrative");
  }

  function unlinkBookinPacketsFromEncounter(encounterId) {
    if (!encounterId) {
      return;
    }
    var changed = false;
    var list = bookinRecords().map(function (item) {
      if (item && item.encounterId === encounterId) {
        changed = true;
        item.encounterId = "";
      }
      return item;
    });
    if (changed) {
      writeBookinRecords(list);
    }
  }

  function deleteEncounterRecord(encounterId, options) {
    options = options || {};
    var id = String(encounterId || "").trim();
    if (!id) {
      setStatus("Create the encounter first.");
      return false;
    }
    var m = model();
    if (!m || !m.store || typeof m.store.deleteEncounter !== "function") {
      setStatus("Could not delete the encounter.");
      return false;
    }
    if (
      typeof window.confirm === "function" &&
      !window.confirm(
        "Delete encounter " +
          id +
          "? Cases and Book-in packets stay. Packets on this encounter are unlinked."
      )
    ) {
      return false;
    }
    m.store.loadFromDisk();
    var existing = m.store.getEncounter(id);
    if (!existing && !transientEncounter) {
      setStatus("That encounter was not found.");
      return false;
    }
    unlinkBookinPacketsFromEncounter(id);
    if (existing) {
      var result = m.store.deleteEncounter(id);
      if (!result || !result.ok) {
        setStatus((result && result.error) || "Could not delete the encounter.");
        return false;
      }
    }
    transientEncounter = null;
    setStatus("Deleted encounter " + id + ".", true);
    if (options.redirect !== false) {
      if (pageKey() === "encounter") {
        paintList();
      } else {
        window.location.href = "encounter.html";
      }
    } else {
      paintList();
    }
    return true;
  }

  function deleteCurrentEncounter() {
    var id =
      (byId("encounterId") && byId("encounterId").value) || queryId();
    if (!id) {
      setStatus("Create the encounter first.");
      return;
    }
    deleteEncounterRecord(id);
  }

  function completeCurrentEncounter() {
    var m = model();
    if (!m || !m.store) {
      setStatus("Could not complete the encounter.");
      return;
    }
    var record = collectEncounter();
    if (isComplete(record) || isComplete(m.store.getEncounter(record.encounterId))) {
      setStatus("This encounter is already completed.");
      lockEncounterForm(true);
      return;
    }
    if (!record.startedAt) {
      setStatus("Set the date and time of the stop before completing.");
      return;
    }
    if (
      typeof window.confirm === "function" &&
      !window.confirm(
        "Review all facts before confirming.\n\n" +
          "Officers, locations, vehicles, subjects, evidence, and narrative should be complete and correct.\n\n" +
          "Confirm locks this encounter and saves the snapshot used for the map, stats, and the daily report.\n\n" +
          "Later changes require Unlock and are logged.\n\n" +
          "Confirm and close this encounter?"
      )
    ) {
      return;
    }
    var saved = m.store.saveEncounter(record, { mode: "complete" });
    if (!saved || !saved.ok) {
      setStatus((saved && saved.error) || "Could not complete the encounter.");
      return;
    }
    transientEncounter = null;
    if (record.encounterId && window.history && window.history.replaceState) {
      window.history.replaceState(
        {},
        "",
        "encounter-form.html?id=" + encodeURIComponent(record.encounterId)
      );
    }
    var fresh = m.store.getEncounter(record.encounterId);
    hydrateEncounter(fresh);
    var pin = fresh && fresh.completed && fresh.completed.pin;
    setStatus(
      pin
        ? "Encounter confirmed and locked. Snapshot filed for Map and analytics."
        : "Encounter confirmed and locked. Snapshot has no map pin yet.",
      true
    );
  }

  function unlockCurrentEncounter() {
    var m = model();
    var id = (byId("encounterId") && byId("encounterId").value) || queryId();
    var reason = String((byId("unlockReason") && byId("unlockReason").value) || "").trim();
    if (!id) {
      setStatus("Create the encounter first.");
      return;
    }
    if (!reason) {
      setStatus("Enter a reason to unlock.");
      return;
    }
    if (!m || !m.store || typeof m.store.unlockEncounter !== "function") {
      setStatus("Could not unlock the encounter.");
      return;
    }
    var result = m.store.unlockEncounter(id, { reason: reason });
    if (!result || !result.ok) {
      setStatus((result && result.error) || "Could not unlock the encounter.");
      return;
    }
    var fresh = m.store.getEncounter(id);
    hydrateEncounter(fresh);
    showEncounterTab("tab-review");
    setStatus("Encounter unlocked. Snapshot stays until you re-confirm.", true);
  }

  window.commitEncounter = commitEncounter;
  window.completeCurrentEncounter = completeCurrentEncounter;
  window.unlockCurrentEncounter = unlockCurrentEncounter;
  window.generateEncounterNarrative = generateEncounterNarrative;
  window.openEncounterBookIn = openEncounterBookIn;
  window.deleteCurrentEncounter = deleteCurrentEncounter;

  function applyEntrySeeds(record) {
    var m = model();
    if (!record || !m || !m.store) {
      return { seeded: false, message: "" };
    }
    var operationId = queryParam("operationId");
    var leadId = queryParam("leadId");
    var personId = queryParam("personId");
    if (!operationId && !leadId && !personId) {
      return { seeded: false, message: "" };
    }
    var bits = [];
    if (operationId && typeof m.seedEncounterFromOperation === "function") {
      var op = m.store.getOperation(operationId);
      if (op) {
        m.seedEncounterFromOperation(record, op, {
          getLead: function (id) {
            return m.store.getLead(id);
          }
        });
        bits.push(op.operationNumber || operationId);
      }
    }
    if (leadId && typeof m.seedEncounterFromLead === "function") {
      var lead = m.store.getLead(leadId);
      if (lead) {
        m.seedEncounterFromLead(record, lead, {
          seedPlaces: !(record.locations || []).length,
          seedVehicles: !(record.vehicles || []).length
        });
        if (!operationId) {
          bits.push(leadId);
        }
      }
    }
    if (personId && typeof m.seedEncounterFromPerson === "function") {
      var person = m.store.getPerson(personId);
      if (person) {
        m.seedEncounterFromPerson(record, person, {
          leadId: leadId,
          seedPlaces: !(record.locations || []).length,
          seedVehicles: !(record.vehicles || []).length
        });
        if (!operationId && !leadId) {
          bits.push("saved person");
        }
      }
    }
    return {
      seeded: bits.length > 0,
      message: bits.length
        ? "Loaded from " +
          bits.join(" · ") +
          ". Last-minute changes stay on this encounter."
        : ""
    };
  }

  function ensureNewEncounter() {
    var m = model();
    m.store.loadFromDisk();
    var id = queryId();
    if (id) {
      var existing = m.store.getEncounter(id);
      if (existing) {
        hydrateEncounter(existing);
        return existing;
      }
    }
    var existingIds = (m.store.listEncounters() || []).map(function (row) {
      return row.encounterId;
    });
    var created = m.createEncounterRecord({
      team: (byId("encounterTeam") && byId("encounterTeam").value) || "3",
      existingIds: existingIds
    });
    transientEncounter = created;
    var seed = applyEntrySeeds(created);
    hydrateEncounter(created);
    if (seed.seeded) {
      saveDraftQuiet({ force: true });
      setStatus(seed.message, true);
    }
    return created;
  }

  function existingEncounterIds(exceptId) {
    var m = model();
    return (m.store.listEncounters() || [])
      .map(function (row) {
        return row.encounterId;
      })
      .filter(function (id) {
        return id && id !== exceptId;
      });
  }

  function bindTeamRemint() {
    var teamEl = byId("encounterTeam");
    if (!teamEl || teamEl.dataset.remintBound === "true") {
      return;
    }
    teamEl.dataset.remintBound = "true";
    teamEl.addEventListener("change", function () {
      var m = model();
      var id = (byId("encounterId") && byId("encounterId").value) || queryId();
      if (!id || !m || !m.store) {
        return;
      }
      m.store.loadFromDisk();
      var stored = m.store.getEncounter(id);
      var current = stored || transientEncounter;
      if (!current) {
        return;
      }
      if (isComplete(current) || isCommitted(current)) {
        setStatus("Team is locked after the encounter is saved.");
        teamEl.value = current.team || "3";
        return;
      }
      if (subjectsForEncounter(id).length) {
        setStatus("Team cannot change after subjects are booked to this encounter.");
        teamEl.value = current.team || "3";
        return;
      }
      var team = teamEl.value || "3";
      var nextId = m.nextEncounterId({
        office: current.officeCode || "DAL",
        team: team,
        existingIds: existingEncounterIds(id)
      });
      if (nextId === id) {
        current.team = String(team);
        if (stored) {
          m.store.saveEncounter(current, { mode: "draft" });
          rememberPersistedEncounter(current);
        } else {
          transientEncounter = current;
          hydrateEncounter(current);
          saveDraftQuiet({ force: true });
        }
        return;
      }
      current.team = String(team);
      current.encounterId = nextId;
      if (stored) {
        m.store.saveEncounter(current, { mode: "draft" });
        if (m.store.deleteEncounter) {
          m.store.deleteEncounter(id);
        }
        rememberPersistedEncounter(current);
      } else {
        transientEncounter = current;
        hydrateEncounter(current);
        saveDraftQuiet({ force: true });
      }
      hydrateEncounter(current);
      setStatus("Encounter ID updated for team " + team + ".", true);
    });
  }

  function bindEncounterWorkspace() {
    var tabs = document.querySelector(".enc-tabs");
    if (tabs && tabs.dataset.bound !== "true") {
      tabs.dataset.bound = "true";
      tabs.addEventListener("click", function (event) {
        var btn = event.target.closest("[role='tab']");
        if (!btn) {
          return;
        }
        showEncounterTab(btn.getAttribute("aria-controls"));
      });
    }
    var op = byId("operationId");
    if (op && op.dataset.bound !== "true") {
      op.dataset.bound = "true";
      op.addEventListener("change", function () {
        if (op.value) {
          loadOfficersFromOperation(op.value);
          var rec = collectEncounter();
          var m = model();
          var operation = m && m.store && m.store.getOperation(op.value);
          if (rec && operation && typeof m.seedEncounterFromOperation === "function") {
            m.seedEncounterFromOperation(rec, operation, {
              getLead: function (id) {
                return m.store.getLead(id);
              }
            });
            hydrateEncounter(rec);
          }
        }
        paintBanner();
      });
    }
    var addOfficer = byId("addOfficer");
    if (addOfficer && addOfficer.dataset.bound !== "true") {
      addOfficer.dataset.bound = "true";
      addOfficer.addEventListener("click", function () {
        var pick = byId("officerPick");
        var id = pick && pick.value;
        if (!id) {
          setStatus("Pick an officer from the roster.");
          return;
        }
        if (encounterOfficerIds.indexOf(id) === -1) {
          encounterOfficerIds.push(id);
        }
        paintOfficers();
        paintBanner();
      });
    }
    bindSubjectFloat();
    bindBookFloat();
    var addExisting = byId("openAddExisting");
    if (addExisting && addExisting.dataset.bound !== "true") {
      addExisting.dataset.bound = "true";
      addExisting.addEventListener("click", openSubjectBrowse);
    }
    var addNew = byId("openAddSubject");
    if (addNew && addNew.dataset.bound !== "true") {
      addNew.dataset.bound = "true";
      addNew.addEventListener("click", openNewSubject);
    }
    var confirmBtn = byId("confirmEncounter");
    if (confirmBtn && confirmBtn.dataset.bound !== "true") {
      confirmBtn.dataset.bound = "true";
      confirmBtn.addEventListener("click", function () {
        completeCurrentEncounter();
      });
    }
    var unlockBtn = byId("unlockEncounter");
    if (unlockBtn && unlockBtn.dataset.bound !== "true") {
      unlockBtn.dataset.bound = "true";
      unlockBtn.addEventListener("click", unlockCurrentEncounter);
    }
    if (document.documentElement.dataset.evidenceBound !== "true") {
      document.documentElement.dataset.evidenceBound = "true";
      document.addEventListener("copdoc:media-changed", function () {
        paintEvidence();
      });
    }
    var narrativeBtn = byId("openEncounterNarrativesButton");
    if (narrativeBtn && narrativeBtn.dataset.bound !== "true") {
      narrativeBtn.dataset.bound = "true";
      narrativeBtn.addEventListener("click", function () {
        showEncounterTab("tab-narrative");
      });
    }
    var locList = byId("encounterLocationList");
    if (locList && locList.dataset.centerBound !== "true") {
      locList.dataset.centerBound = "true";
      locList.addEventListener("click", syncCenterRadioNames);
      locList.addEventListener("change", function () {
        syncCenterRadioNames();
        paintBanner();
      });
      if (typeof MutationObserver === "function") {
        new MutationObserver(function () {
          syncCenterRadioNames();
        }).observe(locList, { childList: true });
      }
    }
    var form = byId("encounterForm");
    if (form && form.dataset.bannerBound !== "true") {
      form.dataset.bannerBound = "true";
      form.addEventListener("change", function () {
        paintBanner();
      });
      form.addEventListener("input", function () {
        paintBanner();
      });
    }
  }

  function bootForm() {
    var m = model();
    if (!m || !m.store) {
      return;
    }
    m.store.loadFromDisk();
    fillEventTypeSelect();
    fillOperationSelect();
    bindEncounterWorkspace();
    ensureNewEncounter();
    bindTeamRemint();
    if (m.autosave && typeof m.autosave.bind === "function") {
      m.autosave.bind({
        key: "encounter-form",
        signature: function () {
          return JSON.stringify(collectEncounter());
        },
        saveDraft: saveDraftQuiet,
        isField: function (el) {
          return el && el.closest && el.closest("#encounterForm");
        }
      }).remember();
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

  function boot() {
    if (pageKey() === "encounter") {
      bindFilters();
      paintList();
      return;
    }
    if (pageKey() === "encounter-form") {
      bootForm();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
