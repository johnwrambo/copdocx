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

  function countryName(code) {
    if (typeof countryLabel === "function") {
      return countryLabel(code);
    }
    var key = String(code || "").trim();
    if (!key) {
      return "";
    }
    var list = window.COUNTRIES || [];
    var i;
    for (i = 0; i < list.length; i++) {
      if (
        list[i] &&
        (list[i].code === key ||
          String(list[i].label || "").toLowerCase() === key.toLowerCase())
      ) {
        return list[i].label || key;
      }
    }
    return key;
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
    var ret = "case.html?id=" + encodeURIComponent(leadId);
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
    if (typeof options.onEdit === "function") {
      var edit = document.createElement("button");
      edit.type = "button";
      edit.className = "action-button-secondary compact case-tile-legend-action";
      edit.textContent = "Edit";
      edit.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();
        options.onEdit();
      });
      body.appendChild(edit);
    }
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
        pickerHref: leadPickerHref("VEHICLE", id, snapshot.leadId),
        onEdit: function () {
          if (window.COPDoc && COPDoc.caseEdit) {
            COPDoc.caseEdit.open("vehicle", id);
          }
        }
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
        pickerHref: leadPickerHref("LOCATION", id, snapshot.leadId),
        onEdit: function () {
          if (window.COPDoc && COPDoc.caseEdit) {
            COPDoc.caseEdit.open("location", id);
          }
        }
      });
    });
  }

  function subjectPlaceKind(loc, fromVehicle) {
    var assoc = String((loc && loc.association) || "").toLowerCase();
    if (assoc === "work" || assoc === "office") {
      return "work";
    }
    if (assoc === "residence" || assoc === "registration") {
      return "home";
    }
    if (assoc === "known-parking") {
      return "parking";
    }
    if (fromVehicle || assoc === "plate-check") {
      return "vehicle";
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
    if (kind === "parking") {
      return "Parking";
    }
    return "Residence";
  }

  function collectSubjectPlaces(snapshot, subject) {
    var places = [];
    function pushLoc(loc, fromVehicle, extra, vehicle) {
      if (!loc) {
        return;
      }
      var kind = subjectPlaceKind(loc, fromVehicle);
      var addr = formatAddress(loc);
      var pair = parseLocationPair(loc.latitude, loc.longitude);
      var priority = String((loc && loc.targetPriority) || "").trim();
      var api = window.COPDoc && COPDoc.locationMap;
      var vehicleColor = vehicle && vehicle.vehicleColor;
      var pinColor = loc.pinColor || "";
      var color =
        api && typeof api.pinColorFor === "function"
          ? api.pinColorFor(kind, {
              pinColor: pinColor,
              vehicleColor: vehicleColor
            })
          : "";
      places.push({
        id: loc.locationId || "",
        kind: kind,
        title: subjectPlaceKindLabel(kind),
        address: addr !== "—" ? addr : "",
        extra: extra || "",
        meta: [extra, addr !== "—" ? addr : ""].filter(Boolean).join(" · "),
        lat: pair ? pair[0] : "",
        lng: pair ? pair[1] : "",
        mapped: !!pair,
        targetPriority: priority,
        isPrimary: priority === "1",
        pinColor: pinColor,
        vehicleColor: vehicleColor || "",
        color: color
      });
    }
    ((subject && subject.locations) || []).forEach(function (loc) {
      pushLoc(loc, false, "", null);
    });
    ((snapshot && snapshot.vehicles) || []).forEach(function (vehicle) {
      (vehicle.locations || []).forEach(function (loc) {
        pushLoc(loc, true, vehicleHeading(vehicle), vehicle);
      });
    });
    return places;
  }

  function caseMapKindIcon(kind, isPrimary, color) {
    var api = window.COPDoc && COPDoc.locationMap;
    var key = api && api.safeKind ? api.safeKind(kind) : kind || "home";
    var el = document.createElement("span");
    el.className =
      "case-map-key-icon is-" + key + (isPrimary ? " is-primary" : "");
    if (color) {
      el.style.color = color;
    }
    if (api && typeof api.kindIconHtml === "function") {
      el.innerHTML = api.kindIconHtml(key);
    }
    return el;
  }

  function setSnapshotPrimaryLocation(snapshot, locationId) {
    var m = model();
    if (!m || !m.store || !snapshot || !locationId) {
      return { ok: false, error: "Could not update the primary location." };
    }
    function apply(list) {
      (list || []).forEach(function (loc) {
        if (!loc) {
          return;
        }
        if (loc.locationId === locationId) {
          loc.targetPriority = "1";
        } else if (String(loc.targetPriority) === "1") {
          loc.targetPriority = "";
        }
      });
    }
    var subject = m.subjectOf ? m.subjectOf(snapshot) : snapshot.person;
    apply(subject && subject.locations);
    (snapshot.vehicles || []).forEach(function (vehicle) {
      apply(vehicle && vehicle.locations);
    });
    snapshot.person = subject;
    return m.store.saveLead(snapshot, { mode: "commit" });
  }

  function setSnapshotPlaceColor(snapshot, locationId, hex) {
    var m = model();
    if (!m || !m.store || !snapshot || !locationId) {
      return { ok: false, error: "Could not update the pin color." };
    }
    var api = window.COPDoc && COPDoc.locationMap;
    var color =
      hex === ""
        ? ""
        : api && api.safeHex
          ? api.safeHex(hex)
          : String(hex || "");
    function apply(list) {
      (list || []).forEach(function (loc) {
        if (loc && loc.locationId === locationId) {
          loc.pinColor = color;
        }
      });
    }
    var subject = m.subjectOf ? m.subjectOf(snapshot) : snapshot.person;
    apply(subject && subject.locations);
    (snapshot.vehicles || []).forEach(function (vehicle) {
      apply(vehicle && vehicle.locations);
    });
    snapshot.person = subject;
    return m.store.saveLead(snapshot, { mode: "commit" });
  }

  function paintCaseMapPanel(options) {
    options = options || {};
    var card = byId(options.cardId);
    var host = byId(options.mapId);
    var empty = byId(options.emptyId);
    var legend = byId(options.legendId);
    var list = byId(options.listId);
    var snapshot = options.snapshot;
    var subject = options.subject;
    if (!card || !host) {
      return;
    }
    var places = collectSubjectPlaces(snapshot, subject);
    var mapped = places.filter(function (place) {
      return place.mapped;
    });
    if (!places.length) {
      if (options.hideWhenEmpty) {
        card.hidden = true;
      } else {
        card.hidden = false;
      }
      host.hidden = true;
      if (legend) {
        legend.hidden = true;
      }
      if (empty) {
        empty.hidden = !options.hideWhenEmpty;
      }
      return;
    }
    card.hidden = false;
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
        if (place.isPrimary) {
          item.classList.add("is-primary");
        }
        var body = document.createElement("div");
        var label = document.createElement("strong");
        label.textContent =
          place.title + (place.isPrimary ? " · Primary" : "");
        var addr = document.createElement("span");
        addr.textContent =
          [place.extra, place.address].filter(Boolean).join(" · ") ||
          "No address";
        body.appendChild(label);
        body.appendChild(addr);
        item.appendChild(
          caseMapKindIcon(place.kind, place.isPrimary, place.color)
        );
        item.appendChild(body);
        var actions = document.createElement("div");
        actions.className = "case-map-item-actions";
        function refreshMap(nextSnap, message) {
          var nextSubject = model().subjectOf
            ? model().subjectOf(nextSnap)
            : nextSnap.person;
          paintCaseMapPanel({
            cardId: options.cardId,
            mapId: options.mapId,
            emptyId: options.emptyId,
            legendId: options.legendId,
            listId: options.listId,
            snapshot: nextSnap,
            subject: nextSubject,
            allowPrimary: options.allowPrimary,
            allowColor: options.allowColor,
            hideWhenEmpty: options.hideWhenEmpty
          });
          if (typeof paintLeadLocations === "function") {
            paintLeadLocations(nextSnap, nextSubject);
          }
          if (message && window.COPDoc && COPDoc.setAppBarStatus) {
            COPDoc.setAppBarStatus(message, { ok: true });
          }
        }
        if (options.allowColor && place.id) {
          var colorInput = document.createElement("input");
          colorInput.type = "color";
          colorInput.className = "case-map-color";
          colorInput.value = place.color || "#55c7bd";
          colorInput.title = place.pinColor
            ? "Custom pin color"
            : "Pin color (auto from type or vehicle)";
          colorInput.addEventListener("click", function (event) {
            event.stopPropagation();
          });
          colorInput.addEventListener("change", function (event) {
            event.stopPropagation();
            var saved = setSnapshotPlaceColor(
              snapshot,
              place.id,
              colorInput.value
            );
            if (!saved || !saved.ok) {
              if (window.COPDoc && COPDoc.setAppBarStatus) {
                COPDoc.setAppBarStatus(
                  (saved && saved.error) || "Could not update the pin color."
                );
              }
              return;
            }
            refreshMap(
              model().store.getLead(snapshot.leadId),
              "Pin color updated."
            );
          });
          actions.appendChild(colorInput);
          if (place.pinColor) {
            var reset = document.createElement("button");
            reset.type = "button";
            reset.className = "case-map-primary-btn";
            reset.textContent = "Auto";
            reset.title = "Use automatic pin color";
            reset.addEventListener("click", function (event) {
              event.preventDefault();
              event.stopPropagation();
              var saved = setSnapshotPlaceColor(snapshot, place.id, "");
              if (!saved || !saved.ok) {
                return;
              }
              refreshMap(
                model().store.getLead(snapshot.leadId),
                "Pin color set to automatic."
              );
            });
            actions.appendChild(reset);
          }
        }
        if (options.allowPrimary && place.id) {
          var btn = document.createElement("button");
          btn.type = "button";
          btn.className = "case-map-primary-btn";
          btn.textContent = place.isPrimary ? "Primary" : "Set primary";
          btn.disabled = !!place.isPrimary;
          btn.addEventListener("click", function (event) {
            event.preventDefault();
            event.stopPropagation();
            if (place.isPrimary) {
              return;
            }
            var saved = setSnapshotPrimaryLocation(snapshot, place.id);
            if (!saved || !saved.ok) {
              if (window.COPDoc && COPDoc.setAppBarStatus) {
                COPDoc.setAppBarStatus(
                  (saved && saved.error) || "Could not set the primary location."
                );
              }
              return;
            }
            refreshMap(
              model().store.getLead(snapshot.leadId),
              "Primary location updated."
            );
          });
          actions.appendChild(btn);
        }
        if (actions.childNodes.length) {
          item.appendChild(actions);
        }
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

  var caseMapContext = null;

  function paintLeadCaseMap(snapshot, subject) {
    caseMapContext = { snapshot: snapshot, subject: subject };
    paintCaseMapPanel({
      cardId: "leadCaseMapCard",
      mapId: "leadCaseMap",
      emptyId: "leadCaseMapEmpty",
      legendId: "leadCaseMapLegend",
      listId: "leadCaseMapList",
      snapshot: snapshot,
      subject: subject,
      allowPrimary: true,
      allowColor: true
    });
    var pop = byId("caseMapPopoutButton");
    if (pop) {
      var mapped = collectSubjectPlaces(snapshot, subject).some(function (place) {
        return place.mapped;
      });
      pop.hidden = !mapped;
    }
  }

  function paintTargetCaseMap(snapshot, subject) {
    var card = byId("targetCaseMapCard");
    if (!card) {
      return;
    }
    paintCaseMapPanel({
      cardId: "targetCaseMapCard",
      mapId: "targetCaseMap",
      emptyId: "targetCaseMapEmpty",
      legendId: "targetCaseMapLegend",
      listId: "targetCaseMapList",
      snapshot: snapshot,
      subject: subject,
      allowPrimary: false,
      hideWhenEmpty: true
    });
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
    appendSnapshotFact(
      host,
      "Citizenship",
      countryName(subject && subject.citizenship)
    );
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
        link.href = "case.html?id=" + encodeURIComponent(snap.leadId);
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

  function issuedWarrantRows(subject) {
    var m = model();
    if (m && typeof m.issuedWarrants === "function") {
      return m.issuedWarrants(subject) || [];
    }
    return ((subject && subject.warrants) || []).filter(function (row) {
      return row && (row.formType === "I-200" || row.formType === "I-205");
    });
  }

  function warrantTitle(row) {
    if (row && row.charge) {
      return row.charge;
    }
    if (row && row.formType === "I-205") {
      return "I-205 Warrant of Removal/Deportation";
    }
    return "I-200 Warrant for Arrest of Alien";
  }

  function openWarrantPdf(row) {
    var api = window.COPDoc && COPDoc.media;
    if (!row || !row.mediaId || !api) {
      if (window.COPDoc && COPDoc.setAppBarStatus) {
        COPDoc.setAppBarStatus("This warrant PDF is not stored. Reissue to attach it.");
      }
      return;
    }
    api
      .blob(row.mediaId, "original")
      .then(function (rec) {
        var blob = rec && rec.blob;
        if (!blob) {
          throw new Error("missing");
        }
        if (typeof Blob !== "undefined" && !(blob instanceof Blob) && blob.buffer) {
          blob = new Blob([blob.buffer], { type: "application/pdf" });
        }
        var url = URL.createObjectURL(blob);
        window.open(url, "_blank", "noopener");
        window.setTimeout(function () {
          URL.revokeObjectURL(url);
        }, 60000);
      })
      .catch(function () {
        if (window.COPDoc && COPDoc.setAppBarStatus) {
          COPDoc.setAppBarStatus("Could not open the warrant PDF.");
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
    var rows = issuedWarrantRows(subject);
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
        var action = document.createElement("td");
        if (row.mediaId) {
          var open = document.createElement("button");
          open.type = "button";
          open.className = "action-button-secondary compact";
          open.textContent = "Open";
          open.addEventListener("click", function () {
            openWarrantPdf(row);
          });
          action.appendChild(open);
        } else {
          action.textContent = "—";
        }
        tr.appendChild(action);
        body.appendChild(tr);
      });
  }

  function setTileEmpty(el, empty) {
    if (!el) {
      return;
    }
    el.classList.toggle("is-empty", !!empty);
  }

  function caseRoleLabel(role) {
    var key = String(role || "LEAD").toUpperCase();
    if (key === "TARGET") {
      return "Target";
    }
    if (key === "DETAINEE") {
      return "Detainee";
    }
    return "Lead";
  }

  function fillFactHost(host, rows) {
    if (!host) {
      return 0;
    }
    host.replaceChildren();
    var n = 0;
    (rows || []).forEach(function (row) {
      if (!row) {
        return;
      }
      var before = host.childNodes.length;
      appendSnapshotFact(host, row[0], row[1]);
      if (host.childNodes.length > before) {
        n += 1;
      }
    });
    return n;
  }

  function paintPlainList(list, empty, lines) {
    if (!list) {
      return false;
    }
    list.replaceChildren();
    var rows = (lines || []).filter(Boolean);
    if (!rows.length) {
      list.hidden = true;
      if (empty) {
        empty.hidden = false;
      }
      return false;
    }
    if (empty) {
      empty.hidden = true;
    }
    list.hidden = false;
    rows.forEach(function (line) {
      var p = document.createElement("p");
      p.textContent = line;
      list.appendChild(p);
    });
    return true;
  }

  function paintFolderCard(snapshot, subject) {
    var tile = byId("caseFolderTile");
    var nameEl = byId("caseFolderName");
    var roleEl = byId("caseFolderRole");
    var m = model();
    var name =
      (m.formatPersonLabel && m.formatPersonLabel(subject)) || "Untitled case";
    if (nameEl) {
      nameEl.textContent = name;
    }
    if (roleEl) {
      roleEl.textContent = caseRoleLabel(subject && subject.caseRole);
    }
    if (byId("caseFolderFacts")) {
      fillFactHost(byId("caseFolderFacts"), [
        ["Sex", subject && subject.sex],
        [
          "DOB / age",
          [subject && subject.dateOfBirth, subject && subject.age]
            .filter(Boolean)
            .join(" · ")
        ],
        ["Citizenship", countryName(subject && subject.citizenship)],
        [
          "A-Number",
          subject && subject.immigration && subject.immigration.alienNumber
        ],
        ["FIN", subject && subject.immigration && subject.immigration.finNumber],
        ["Aliases", aliasLine(subject)],
        ["SSN", subject && subject.ssn],
        ["LexID", subject && subject.lexId]
      ]);
    }
    if (
      window.COPDoc &&
      COPDoc.mediaCard &&
      subject &&
      subject.personId &&
      byId("caseFolderPhoto")
    ) {
      COPDoc.mediaCard.mount(byId("caseFolderPhoto"), {
        owner: { type: "PERSON", id: subject.personId },
        compact: true,
        photoTitle: "",
        pickerHref: leadPickerHref("PERSON", subject.personId, snapshot.leadId),
        filesHost: byId("caseFolderFiles"),
        showEmptyFiles: false,
        committedOnly: true
      });
    }
    setTileEmpty(tile, false);
  }

  function paintStatusTile(snapshot, subject) {
    var crim = criminalProfile(subject);
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
    if (crim.armed) {
      bits.push("Armed");
    }
    var threat = model().threatLevelLabel
      ? model().threatLevelLabel(crim.threatLevel)
      : crim.threatLevel || "";
    var n = fillFactHost(byId("caseStatusFacts"), [
      ["Case", snapshot.source && snapshot.source.caseNumber],
      ["Threat", threat],
      ["Flags", bits.join(" · ")],
      ["Updated", formatWhen(snapshot.meta && snapshot.meta.updatedAt)],
      ["Filed", formatWhen(snapshot.meta && snapshot.meta.committedAt)]
    ]);
    setTileEmpty(byId("caseStatusTile"), !n);
  }

  function paintSourceTile(snapshot) {
    var source = (snapshot && snapshot.source) || {};
    var n = fillFactHost(byId("caseSourceFacts"), [
      ["Source", sourceLine(snapshot)],
      ["Agency", source.refAgency],
      ["Probation", source.probationCheck ? "Yes" : ""]
    ]);
    var bg = byId("caseSourceBackground");
    var info = String(source.leadInfo || "").trim();
    if (bg) {
      bg.hidden = !info;
      bg.textContent = info;
    }
    setTileEmpty(byId("caseSourceTile"), !n && !info);
  }

  function paintImmigrationTile(subject) {
    var immigration = (subject && subject.immigration) || {};
    var n = fillFactHost(byId("caseImmigrationFacts"), [
      ["Status", immigration.status],
      ["Disposition", dispositionLine(subject) || immigration.disposition],
      [
        "Final order",
        immigration.finalOrderDate || (immigration.finalOrder ? "Final order" : "")
      ],
      ["First deportation", immigration.firstDeportationDate],
      ["Last deportation", immigration.lastDeportationDate],
      ["A-Number", immigration.alienNumber],
      ["FIN", immigration.finNumber]
    ]);
    setTileEmpty(byId("caseImmigrationTile"), !n);
  }

  function paintCriminalTile(subject) {
    var crim = criminalProfile(subject);
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
    var threat = model().threatLevelLabel
      ? model().threatLevelLabel(crim.threatLevel)
      : crim.threatLevel || "None";
    var n = fillFactHost(byId("caseCriminalFacts"), [
      ["Profile", bits.join(" · ")],
      ["Threat", String(threat).toLowerCase() === "none" ? "" : threat],
      ["FBI", crim.fbiNumber || (subject.criminal && subject.criminal.fbiNumber)],
      [
        "NCIC",
        (subject.criminal && subject.criminal.ncicNumber) || crim.ncicNumber
      ],
      [
        "State ID",
        (subject.criminal && subject.criminal.stateId) || crim.stateId
      ]
    ]);
    var lines = [];
    ((subject && subject.arrests) || []).forEach(function (row) {
      var line = [row.arrestDate, row.arrestCharge, row.arrestAgency]
        .filter(Boolean)
        .join(" · ");
      if (line) {
        lines.push("Arrest · " + line);
      }
    });
    ((subject && subject.convictions) || []).forEach(function (row) {
      var line = [row.convictionDate, row.crime || row.charge, row.court]
        .filter(Boolean)
        .join(" · ");
      if (line) {
        lines.push("Conviction · " + line);
      }
    });
    ((subject && subject.warrants) || []).forEach(function (row) {
      if (model().isIssuedWarrant && model().isIssuedWarrant(row)) {
        return;
      }
      var line = [row.warrantDate, row.charge, row.warrantStatus]
        .filter(Boolean)
        .join(" · ");
      if (line) {
        lines.push("Warrant · " + line);
      }
    });
    var listHas = paintPlainList(byId("caseCriminalList"), null, lines);
    var emptyProfile = !bits.length && String(threat).toLowerCase() === "none";
    setTileEmpty(
      byId("caseCriminalTile"),
      emptyProfile && !listHas && n < 1
    );
  }

  function paintDocumentsTile(subject) {
    var lines = ((subject && subject.documents) || [])
      .map(function (row) {
        if (!row) {
          return "";
        }
        return [
          row.documentType,
          row.documentNumber,
          row.issuingState || row.issuingCountry,
          row.documentExpiration ? "exp " + row.documentExpiration : ""
        ]
          .filter(Boolean)
          .join(" · ");
      })
      .filter(Boolean);
    var has = paintPlainList(
      byId("caseDocumentsList"),
      byId("caseDocumentsEmpty"),
      lines
    );
    setTileEmpty(byId("caseDocumentsTile"), !has);
  }

  function personLabelById(id) {
    var m = model();
    if (!id || !m || !m.store || typeof m.store.getPerson !== "function") {
      return id || "";
    }
    var person = m.store.getPerson(id);
    if (person && m.formatPersonLabel) {
      return m.formatPersonLabel(person) || id;
    }
    return id;
  }

  function otherPersonId(link, subjectId) {
    var from = (link && link.from) || {};
    var to = (link && link.to) || {};
    if (from.type === "PERSON" && from.id && from.id !== subjectId) {
      return from.id;
    }
    if (to.type === "PERSON" && to.id && to.id !== subjectId) {
      return to.id;
    }
    return "";
  }

  function caseJumpHref(leadId) {
    return leadId ? "case.html?id=" + encodeURIComponent(leadId) : "";
  }

  function caseJumpLabel(row) {
    if (!row) {
      return "Case";
    }
    var m = model();
    var snap =
      m && m.store && typeof m.store.getLead === "function"
        ? m.store.getLead(row.leadId)
        : null;
    var num = snap && snap.source && snap.source.caseNumber;
    var when = row.updatedAt ? String(row.updatedAt).slice(0, 10) : "";
    return [row.label, num, num ? "" : when].filter(Boolean).join(" · ") || "Case";
  }

  function appendCaseJump(host, row, text) {
    if (!host || !row || !row.leadId) {
      return;
    }
    var a = document.createElement("a");
    a.className = "case-jump";
    a.href = caseJumpHref(row.leadId);
    a.textContent = text || caseJumpLabel(row);
    a.title = "Open case";
    host.appendChild(a);
  }

  function appendListBit(host, text) {
    var bit = String(text || "").trim();
    if (!host || !bit) {
      return;
    }
    if (host.childNodes.length) {
      host.appendChild(document.createTextNode(" · "));
    }
    host.appendChild(document.createTextNode(bit));
  }

  function relatedCases(personId, excludeLeadId) {
    var m = model();
    if (!m || !m.store || typeof m.store.relatedCommittedCases !== "function") {
      return { asSubject: [], asAssociate: [] };
    }
    return m.store.relatedCommittedCases(personId, excludeLeadId);
  }

  function paintAssociationsTile(snapshot, subject) {
    var list = byId("caseAssociationsList");
    var empty = byId("caseAssociationsEmpty");
    if (!list) {
      return;
    }
    list.replaceChildren();
    var sid = subject && subject.personId;
    var leadId = snapshot && snapshot.leadId;
    var jumpedLeadIds = {};
    var associatedPersonIds = {};
    var has = false;

    ((snapshot && snapshot.links) || []).forEach(function (link) {
      if (!link) {
        return;
      }
      var from = link.from || {};
      var to = link.to || {};
      var personId = otherPersonId(link, sid);
      var other = personId ? personLabelById(personId) : "";
      var vehicleBit =
        from.type === "VEHICLE"
          ? vehicleHeading(
              ((snapshot.vehicles || []).filter(function (row) {
                return row && row.vehicleId === from.id;
              })[0])
            )
          : to.type === "VEHICLE"
            ? vehicleHeading(
                ((snapshot.vehicles || []).filter(function (row) {
                  return row && row.vehicleId === to.id;
                })[0])
              )
            : "";
      var p = document.createElement("p");
      if (personId) {
        associatedPersonIds[personId] = true;
        var jump = relatedCases(personId, leadId).asSubject[0];
        if (jump) {
          appendCaseJump(p, jump, other);
          jumpedLeadIds[jump.leadId] = true;
        } else {
          appendListBit(p, other);
        }
      } else {
        appendListBit(p, vehicleBit);
      }
      appendListBit(p, (link.reasons || []).join(", "));
      appendListBit(p, link.notes);
      if (!p.childNodes.length) {
        return;
      }
      list.appendChild(p);
      has = true;
    });

    var linked = [];
    var seenLinked = {};
    function pushLinked(row) {
      if (!row || !row.leadId || seenLinked[row.leadId] || jumpedLeadIds[row.leadId]) {
        return;
      }
      if (row.subjectPersonId && associatedPersonIds[row.subjectPersonId]) {
        return;
      }
      seenLinked[row.leadId] = true;
      linked.push(row);
    }
    if (sid) {
      var mine = relatedCases(sid, leadId);
      (mine.asSubject || []).forEach(pushLinked);
      (mine.asAssociate || []).forEach(pushLinked);
    }
    if (linked.length) {
      var heading = document.createElement("p");
      heading.className = "case-linked-heading";
      heading.textContent = "Linked cases";
      list.appendChild(heading);
      linked.forEach(function (row) {
        var p = document.createElement("p");
        appendCaseJump(p, row);
        list.appendChild(p);
      });
      has = true;
    }

    if (empty) {
      empty.hidden = has;
    }
    list.hidden = !has;
    setTileEmpty(byId("caseAssociationsTile"), !has);
  }

  function renderHistoryEvents(events) {
    var list = byId("caseHistoryList");
    var empty = byId("caseHistoryEmpty");
    if (!list) {
      return;
    }
    list.replaceChildren();
    var rows = (events || []).slice().sort(function (a, b) {
      return String(b.at || "").localeCompare(String(a.at || ""));
    });
    if (!rows.length) {
      list.hidden = true;
      if (empty) {
        empty.hidden = false;
      }
      return;
    }
    if (empty) {
      empty.hidden = true;
    }
    list.hidden = false;
    rows.forEach(function (row) {
      var p = document.createElement("p");
      p.className = row.type === "note" ? "is-note" : "";
      if (row.at) {
        var time = document.createElement("time");
        time.textContent = formatWhen(row.at);
        p.appendChild(time);
      }
      p.appendChild(document.createTextNode(row.text || ""));
      list.appendChild(p);
    });
  }

  function derivedHistoryEvents(snapshot, subject) {
    var events = [];
    function push(at, text, type) {
      if (!text) {
        return;
      }
      events.push({ at: at || "", text: text, type: type || "event" });
    }
    var meta = (snapshot && snapshot.meta) || {};
    push(meta.createdAt, "Case opened");
    push(meta.committedAt, "Case filed");
    if (snapshot && snapshot.source && snapshot.source.leadSource) {
      push(meta.createdAt || meta.committedAt, "Source · " + sourceLine(snapshot));
    }
    issuedWarrantRows(subject).forEach(function (row) {
      push(
        row.issuedAt || row.warrantDate,
        warrantTitle(row) +
          (row.fileNo || row.warrantNumber
            ? " · " + (row.fileNo || row.warrantNumber)
            : ""),
        "warrant"
      );
    });
    ((subject && subject.immigration && subject.immigration.baseballCards) ||
      []).forEach(function (row) {
        push(row.generatedAt || row.arrestDate, "Baseball card generated", "baseball");
      });
    ((snapshot && snapshot.history) || []).forEach(function (row) {
      if (!row || !String(row.text || "").trim()) {
        return;
      }
      events.push({
        at: row.at || "",
        text: String(row.text).trim(),
        type: row.type || "note"
      });
    });
    var m = model();
    if (m && m.store && typeof m.store.listEncounters === "function") {
      var personId = subject && subject.personId;
      var leadId = snapshot && snapshot.leadId;
      m.store.listEncounters().forEach(function (enc) {
        var hit = (enc.subjects || []).some(function (row) {
          return (
            row &&
            ((personId && row.personId === personId) ||
              (leadId && row.leadId === leadId))
          );
        });
        if (hit) {
          push(
            enc.startedAt || enc.updatedAt,
            "Encounter " + (enc.encounterId || ""),
            "encounter"
          );
        }
      });
    }
    try {
      var raw = localStorage.getItem("alien-book-in.saved-records.v1") || "";
      if (raw) {
        var parsed = JSON.parse(raw);
        var records = Array.isArray(parsed)
          ? parsed
          : parsed && Array.isArray(parsed.records)
            ? parsed.records
            : [];
        records.forEach(function (row) {
          if (row && snapshot && row.leadId === snapshot.leadId) {
            push(
              row.updatedAt || row.createdAt || row.savedAt,
              "Book-in packet",
              "bookin"
            );
          }
        });
      }
    } catch (err) {}
    return events;
  }

  function paintCaseHistory(snapshot, subject) {
    var tile = byId("caseHistoryTile");
    if (!tile) {
      return;
    }
    setTileEmpty(tile, false);
    var events = derivedHistoryEvents(snapshot, subject);
    renderHistoryEvents(events);
    var owners = [];
    if (subject && subject.personId) {
      owners.push({ type: "PERSON", id: subject.personId });
    }
    ((snapshot && snapshot.vehicles) || []).forEach(function (vehicle) {
      if (vehicle && vehicle.vehicleId) {
        owners.push({ type: "VEHICLE", id: vehicle.vehicleId });
      }
      (vehicle.locations || []).forEach(function (loc) {
        if (loc && loc.locationId) {
          owners.push({ type: "LOCATION", id: loc.locationId });
        }
      });
    });
    ((subject && subject.locations) || []).forEach(function (loc) {
      if (loc && loc.locationId) {
        owners.push({ type: "LOCATION", id: loc.locationId });
      }
    });
    var api = window.COPDoc && COPDoc.media;
    if (!api || typeof api.list !== "function" || !owners.length) {
      return;
    }
    Promise.all(
      owners.map(function (owner) {
        return api.list(owner).catch(function () {
          return [];
        });
      })
    ).then(function (groups) {
      var extra = [];
      (groups || []).forEach(function (rows) {
        (rows || []).forEach(function (row) {
          if (!row) {
            return;
          }
          extra.push({
            at: (row.meta && (row.meta.createdAt || row.meta.committedAt)) || "",
            text:
              row.mediaClass === "photo"
                ? "Photo added" + (row.caption ? " · " + row.caption : "")
                : "File added" +
                  (row.originalName ? " · " + row.originalName : ""),
            type: "media"
          });
        });
      });
      renderHistoryEvents(events.concat(extra));
    });
  }

  function bindCaseHistory() {
    var btn = byId("caseHistoryAddNote");
    var input = byId("caseHistoryNote");
    if (!btn || btn.dataset.historyBound === "true") {
      return;
    }
    btn.dataset.historyBound = "true";
    btn.addEventListener("click", function () {
      var text = input ? String(input.value || "").trim() : "";
      if (!text) {
        if (window.COPDoc && COPDoc.setAppBarStatus) {
          COPDoc.setAppBarStatus("Type a note first.");
        }
        return;
      }
      var m = model();
      if (!m || !m.store) {
        return;
      }
      m.store.loadFromDisk();
      var snap = m.store.getLead(queryId());
      if (!snap || !isCommitted(snap)) {
        if (window.COPDoc && COPDoc.setAppBarStatus) {
          COPDoc.setAppBarStatus("Open a filed case to add a note.");
        }
        return;
      }
      snap.history = Array.isArray(snap.history) ? snap.history : [];
      var event =
        m.createHistoryEvent
          ? m.createHistoryEvent({ text: text, type: "note", source: "operator" })
          : {
              eventId: "evt_" + Date.now().toString(36),
              at: new Date().toISOString(),
              type: "note",
              text: text,
              source: "operator"
            };
      snap.history.push(event);
      var saved = m.store.saveLead(snap, { mode: "commit" });
      if (!saved || !saved.ok) {
        if (window.COPDoc && COPDoc.setAppBarStatus) {
          COPDoc.setAppBarStatus((saved && saved.error) || "Could not save the note.");
        }
        return;
      }
      if (input) {
        input.value = "";
      }
      if (window.COPDoc && COPDoc.setAppBarStatus) {
        COPDoc.setAppBarStatus("Note added.", { ok: true });
      }
      var fresh = m.store.getLead(snap.leadId);
      paintCaseHistory(fresh, m.subjectOf ? m.subjectOf(fresh) : fresh.person);
    });
  }

  function paintCaseWarrants(subject) {
    var list = byId("caseWarrantsList");
    var empty = byId("warrantsIssuedEmpty");
    var card = byId("warrantsIssuedCard");
    if (!list) {
      return;
    }
    list.replaceChildren();
    var rows = issuedWarrantRows(subject)
      .slice()
      .sort(function (a, b) {
        return String(b.issuedAt || b.warrantDate || "").localeCompare(
          String(a.issuedAt || a.warrantDate || "")
        );
      });
    if (!rows.length) {
      list.hidden = true;
      if (empty) {
        empty.hidden = false;
      }
      setTileEmpty(card, true);
      return;
    }
    if (empty) {
      empty.hidden = true;
    }
    list.hidden = false;
    setTileEmpty(card, false);
    rows.forEach(function (row) {
      var item = document.createElement(row.mediaId ? "a" : "div");
      item.className = "fow-warrant-card";
      if (row.mediaId) {
        item.href = "#";
        item.addEventListener("click", function (event) {
          event.preventDefault();
          openWarrantPdf(row);
        });
      }
      var thumb = document.createElement("div");
      thumb.className = "fow-warrant-thumb";
      var form = document.createElement("strong");
      form.textContent = row.formType || "Warrant";
      var mark = document.createElement("span");
      mark.textContent = "Warrant";
      thumb.appendChild(form);
      thumb.appendChild(mark);
      var body = document.createElement("div");
      var title = document.createElement("strong");
      title.textContent = warrantTitle(row);
      var meta = document.createElement("span");
      meta.textContent = [
        row.fileNo || row.warrantNumber,
        row.warrantDate || (row.issuedAt || "").slice(0, 10)
      ]
        .filter(Boolean)
        .join(" · ");
      body.appendChild(title);
      body.appendChild(meta);
      item.appendChild(thumb);
      item.appendChild(body);
      list.appendChild(item);
    });
  }

  var CASE_LAYOUT_KEY = "copdocx.case-view.layout.v1";
  var CASE_TILE_SIZES = ["s", "m", "l", "xl", "tall"];
  var CASE_LAYOUT_DEFAULT = {
    version: 1,
    order: [
      "folder",
      "status",
      "map",
      "vehicles",
      "places",
      "warrants",
      "history",
      "associations",
      "criminal",
      "immigration",
      "documents",
      "source"
    ],
    sizes: {
      folder: "l",
      status: "s",
      map: "m",
      vehicles: "m",
      places: "m",
      warrants: "s",
      history: "l",
      associations: "m",
      criminal: "m",
      immigration: "m",
      documents: "s",
      source: "m"
    }
  };

  function caseLayoutBoard() {
    return byId("caseViewBoard");
  }

  function caseLayoutTiles(board) {
    return Array.prototype.slice.call(
      (board || caseLayoutBoard() || document).querySelectorAll("[data-tile]")
    );
  }

  function normalizeCaseLayout(raw) {
    var next = {
      version: 1,
      order: CASE_LAYOUT_DEFAULT.order.slice(),
      sizes: {}
    };
    Object.keys(CASE_LAYOUT_DEFAULT.sizes).forEach(function (key) {
      next.sizes[key] = CASE_LAYOUT_DEFAULT.sizes[key];
    });
    if (!raw || typeof raw !== "object") {
      return next;
    }
    if (Array.isArray(raw.order)) {
      var seen = {};
      var order = [];
      raw.order.forEach(function (id) {
        var key = String(id || "");
        if (!key || seen[key] || !CASE_LAYOUT_DEFAULT.sizes[key]) {
          return;
        }
        seen[key] = true;
        order.push(key);
      });
      CASE_LAYOUT_DEFAULT.order.forEach(function (id) {
        if (!seen[id]) {
          order.push(id);
        }
      });
      next.order = order;
    }
    if (raw.sizes && typeof raw.sizes === "object") {
      Object.keys(raw.sizes).forEach(function (key) {
        var size = String(raw.sizes[key] || "");
        if (CASE_LAYOUT_DEFAULT.sizes[key] && CASE_TILE_SIZES.indexOf(size) !== -1) {
          next.sizes[key] = size;
        }
      });
    }
    return next;
  }

  function readCaseLayout() {
    try {
      var raw = localStorage.getItem(CASE_LAYOUT_KEY);
      if (!raw) {
        return normalizeCaseLayout(null);
      }
      return normalizeCaseLayout(JSON.parse(raw));
    } catch (err) {
      return normalizeCaseLayout(null);
    }
  }

  function writeCaseLayout(layout) {
    try {
      localStorage.setItem(
        CASE_LAYOUT_KEY,
        JSON.stringify(normalizeCaseLayout(layout))
      );
    } catch (err) {}
  }

  function applyCaseLayout(layout) {
    var board = caseLayoutBoard();
    if (!board) {
      return;
    }
    var next = normalizeCaseLayout(layout);
    caseLayoutTiles(board).forEach(function (tile) {
      var id = tile.getAttribute("data-tile") || "";
      var size = next.sizes[id] || tile.getAttribute("data-size") || "m";
      tile.setAttribute("data-size", size);
      var index = next.order.indexOf(id);
      tile.style.order = index === -1 ? "99" : String(index);
      var current = tile.querySelector(".case-tile-size [aria-pressed='true']");
      if (current) {
        current.removeAttribute("aria-pressed");
      }
      var btn = tile.querySelector(
        '.case-tile-size [data-size="' + size + '"]'
      );
      if (btn) {
        btn.setAttribute("aria-pressed", "true");
      }
    });
  }

  function currentCaseLayoutFromDom() {
    var board = caseLayoutBoard();
    var tiles = caseLayoutTiles(board);
    tiles.sort(function (a, b) {
      return (Number(a.style.order) || 0) - (Number(b.style.order) || 0);
    });
    var layout = { version: 1, order: [], sizes: {} };
    tiles.forEach(function (tile) {
      var id = tile.getAttribute("data-tile") || "";
      if (!id) {
        return;
      }
      layout.order.push(id);
      layout.sizes[id] = tile.getAttribute("data-size") || "m";
    });
    return normalizeCaseLayout(layout);
  }

  function setCaseArrangeMode(on) {
    var board = caseLayoutBoard();
    var arrange = byId("caseArrangeButton");
    var done = byId("caseArrangeDoneButton");
    var reset = byId("caseLayoutResetButton");
    document.body.classList.toggle("case-arranging", !!on);
    if (board) {
      board.classList.toggle("is-arranging", !!on);
    }
    if (arrange) {
      arrange.hidden = !!on;
    }
    if (done) {
      done.hidden = !on;
    }
    if (reset) {
      reset.hidden = !on;
    }
    if (window.COPDoc && COPDoc.setAppBarStatus) {
      COPDoc.setAppBarStatus(
        on
          ? "Drag a card title to move it. S / M / L / XL / Tall sets the size."
          : "",
        on ? { ok: true } : undefined
      );
    }
  }

  function moveCaseTile(fromId, toId) {
    if (!fromId || fromId === toId) {
      return;
    }
    var layout = currentCaseLayoutFromDom();
    var from = layout.order.indexOf(fromId);
    var to = layout.order.indexOf(toId);
    if (from === -1 || to === -1) {
      return;
    }
    layout.order.splice(from, 1);
    layout.order.splice(to, 0, fromId);
    writeCaseLayout(layout);
    applyCaseLayout(layout);
  }

  function bindCaseLayout() {
    var board = caseLayoutBoard();
    if (!board || board.dataset.layoutBound === "true") {
      return;
    }
    board.dataset.layoutBound = "true";
    caseLayoutTiles(board).forEach(function (tile) {
      var handle =
        tile.querySelector(".case-folder-tab") ||
        tile.querySelector(":scope > legend") ||
        tile;
      handle.setAttribute("draggable", "true");
      handle.addEventListener("dragstart", function (event) {
        if (!board.classList.contains("is-arranging")) {
          event.preventDefault();
          return;
        }
        if (event.target.closest(".case-tile-size, .case-tile-legend-action")) {
          event.preventDefault();
          return;
        }
        event.dataTransfer.setData(
          "text/plain",
          tile.getAttribute("data-tile") || ""
        );
        event.dataTransfer.effectAllowed = "move";
        tile.classList.add("is-dragging");
      });
      handle.addEventListener("dragend", function () {
        caseLayoutTiles(board).forEach(function (row) {
          row.classList.remove("is-dragging", "is-drop-target");
        });
      });
      tile.addEventListener("dragover", function (event) {
        if (!board.classList.contains("is-arranging")) {
          return;
        }
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        tile.classList.add("is-drop-target");
      });
      tile.addEventListener("dragleave", function (event) {
        if (!tile.contains(event.relatedTarget)) {
          tile.classList.remove("is-drop-target");
        }
      });
      tile.addEventListener("drop", function (event) {
        event.preventDefault();
        tile.classList.remove("is-drop-target");
        moveCaseTile(
          event.dataTransfer.getData("text/plain"),
          tile.getAttribute("data-tile") || ""
        );
      });
      if (tile.querySelector(".case-tile-size")) {
        return;
      }
      var sizes = document.createElement("div");
      sizes.className = "case-tile-size";
      CASE_TILE_SIZES.forEach(function (size) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.setAttribute("data-size", size);
        btn.textContent = size === "tall" ? "T" : size.toUpperCase();
        btn.title =
          size === "s"
            ? "Small"
            : size === "m"
              ? "Medium"
              : size === "l"
                ? "Large"
                : size === "xl"
                  ? "Full row"
                  : "Tall";
        btn.addEventListener("click", function (event) {
          event.preventDefault();
          event.stopPropagation();
          tile.setAttribute("data-size", size);
          writeCaseLayout(currentCaseLayoutFromDom());
          applyCaseLayout(readCaseLayout());
        });
        sizes.appendChild(btn);
      });
      var anchor =
        tile.querySelector(":scope > legend") ||
        tile.querySelector(".case-folder-tab");
      if (anchor && anchor.parentNode === tile) {
        anchor.after(sizes);
      } else {
        tile.insertBefore(sizes, tile.firstChild);
      }
    });
    applyCaseLayout(readCaseLayout());
    setCaseArrangeMode(false);
    var arrange = byId("caseArrangeButton");
    var done = byId("caseArrangeDoneButton");
    var reset = byId("caseLayoutResetButton");
    if (arrange) {
      arrange.addEventListener("click", function () {
        setCaseArrangeMode(true);
      });
    }
    if (done) {
      done.addEventListener("click", function () {
        writeCaseLayout(currentCaseLayoutFromDom());
        setCaseArrangeMode(false);
      });
    }
    if (reset) {
      reset.addEventListener("click", function () {
        writeCaseLayout(CASE_LAYOUT_DEFAULT);
        applyCaseLayout(CASE_LAYOUT_DEFAULT);
        if (window.COPDoc && COPDoc.setAppBarStatus) {
          COPDoc.setAppBarStatus("Layout reset to default.", { ok: true });
        }
      });
    }
  }

  function bindCaseMapPopout() {
    var openBtn = byId("caseMapPopoutButton");
    var closeBtn = byId("caseMapPopoutClose");
    var overlay = byId("caseMapPopout");
    if (!overlay || overlay.dataset.popoutBound === "true") {
      return;
    }
    overlay.dataset.popoutBound = "true";
    function close() {
      overlay.hidden = true;
    }
    function open() {
      if (!caseMapContext) {
        return;
      }
      overlay.hidden = false;
      paintCaseMapPanel({
        cardId: "caseMapPopout",
        mapId: "caseMapPopoutMap",
        emptyId: "caseMapPopoutEmpty",
        legendId: "caseMapPopoutLegend",
        listId: "caseMapPopoutList",
        snapshot: caseMapContext.snapshot,
        subject: caseMapContext.subject,
        allowPrimary: true,
        allowColor: true
      });
      window.setTimeout(function () {
        if (window.COPDoc && COPDoc.locationMap && COPDoc.locationMap.resize) {
          COPDoc.locationMap.resize(byId("caseMapPopoutMap"));
        }
      }, 50);
    }
    if (openBtn) {
      openBtn.addEventListener("click", open);
    }
    if (closeBtn) {
      closeBtn.addEventListener("click", close);
    }
    overlay.addEventListener("click", function (event) {
      if (event.target === overlay) {
        close();
      }
    });
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && !overlay.hidden) {
        close();
      }
    });
  }

  function paintView() {
    var missing = byId("leadMissing");
    var snapEl = byId("leadSnapshot") || byId("caseViewBoard");
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
      missing.textContent = "Case not found.";
      hideCaseBody();
      hidePrimary(true);
      return;
    }
    var snap = m.store.getLead(id);
    if (!snap) {
      missing.hidden = false;
      missing.textContent = "Case not found.";
      hideCaseBody();
      hidePrimary(true);
      if (window.COPDoc && COPDoc.setAppBarStatus) {
        COPDoc.setAppBarStatus("Case not found.");
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
    var name = (m.formatPersonLabel && m.formatPersonLabel(subject)) || "Case";
    if (byId("leadViewTitle")) {
      byId("leadViewTitle").textContent = name;
    }
    document.title = name + " — Case";
    if (byId("leadSubjectMedia") && window.COPDoc && COPDoc.mediaCard && subject.personId) {
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
    paintFolderCard(snap, subject);
    paintStatusTile(snap, subject);
    paintSourceTile(snap);
    paintLeadCaseMap(snap, subject);
    paintLeadVehicles(snap);
    paintLeadLocations(snap, subject);
    setTileEmpty(
      vehiclesCard,
      !((snap.vehicles || []).length)
    );
    setTileEmpty(
      locationsCard,
      !(
        ((subject.locations || []).length) ||
        (snap.vehicles || []).some(function (row) {
          return row && row.locations && row.locations.length;
        })
      )
    );
    setTileEmpty(
      caseMapCard,
      !collectSubjectPlaces(snap, subject).length
    );
    paintIssuedWarrants(subject);
    paintCaseWarrants(subject);
    paintCaseHistory(snap, subject);
    paintAssociationsTile(snap, subject);
    paintCriminalTile(subject);
    paintImmigrationTile(subject);
    paintDocumentsTile(subject);
    if (window.COPDoc && COPDoc.caseEdit && typeof COPDoc.caseEdit.refresh === "function") {
      COPDoc.caseEdit.refresh();
    }
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
    if (oneJson && (pageKey() === "lead" || pageKey() === "case")) {
      oneJson.addEventListener("click", exportOneJson);
    }
    var oneCsv = byId("downloadLeadCsvButton");
    if (oneCsv && (pageKey() === "lead" || pageKey() === "case")) {
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
          var caption =
            window.COPDoc &&
            COPDoc.model &&
            typeof COPDoc.model.formatPhotoCaption === "function"
              ? COPDoc.model.formatPhotoCaption(row)
              : row.caption || "";
          var bits = [
            caption,
            many ? targetPhotoState.index + 1 + " / " + photos.length + " photos" : ""
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

  function mapsSearchUrl(loc) {
    if (!loc) {
      return "";
    }
    var pair = parseLocationPair(loc.latitude, loc.longitude);
    var addr = formatAddress(loc);
    var q = pair
      ? pair[0] + "," + pair[1]
      : addr && addr !== "—"
        ? addr
        : "";
    if (!q) {
      return "";
    }
    return "https://maps.google.com/?q=" + encodeURIComponent(q);
  }

  function pinCopyText(loc) {
    if (!loc) {
      return "";
    }
    var pair = parseLocationPair(loc.latitude, loc.longitude);
    if (pair) {
      return pair[0] + ", " + pair[1];
    }
    var addr = formatAddress(loc);
    return addr && addr !== "—" ? addr : "";
  }

  function copyText(text) {
    var value = String(text || "");
    if (!value) {
      return Promise.reject(new Error("Nothing to copy."));
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(value);
    }
    return new Promise(function (resolve, reject) {
      var area = document.createElement("textarea");
      area.value = value;
      document.body.appendChild(area);
      area.select();
      try {
        document.execCommand("copy");
        resolve();
      } catch (err) {
        reject(err);
      }
      area.remove();
    });
  }

  function bindTargetLocationActions(loc) {
    var mapLink = byId("targetMapLink");
    var copyBtn = byId("copyTargetPinButton");
    var url = mapsSearchUrl(loc);
    var pin = pinCopyText(loc);
    if (mapLink) {
      if (url) {
        mapLink.hidden = false;
        mapLink.href = url;
        mapLink.target = "_blank";
        mapLink.rel = "noopener";
        mapLink.removeAttribute("data-not-built");
      } else {
        mapLink.hidden = true;
        mapLink.href = "#";
      }
    }
    if (copyBtn) {
      if (pin) {
        copyBtn.hidden = false;
        copyBtn.setAttribute("data-pin", pin);
        copyBtn.removeAttribute("data-not-built");
      } else {
        copyBtn.hidden = true;
        copyBtn.removeAttribute("data-pin");
      }
    }
  }

  function paintTargetWarrants(subject) {
    var card = byId("targetWarrantsCard");
    var list = byId("targetWarrantsList");
    if (!card || !list) {
      return;
    }
    (list._mediaUrls || []).forEach(function (url) {
      if (url && String(url).indexOf("blob:") === 0) {
        URL.revokeObjectURL(url);
      }
    });
    list._mediaUrls = [];
    list.replaceChildren();
    var rows = issuedWarrantRows(subject)
      .slice()
      .sort(function (a, b) {
        return String(b.issuedAt || b.warrantDate || "").localeCompare(
          String(a.issuedAt || a.warrantDate || "")
        );
      });
    if (!rows.length) {
      card.hidden = true;
      return;
    }
    card.hidden = false;
    rows.forEach(function (row) {
      var item = document.createElement(row.mediaId ? "a" : "div");
      item.className = "fow-warrant-card";
      if (row.mediaId) {
        item.href = "#";
        item.addEventListener("click", function (event) {
          event.preventDefault();
          openWarrantPdf(row);
        });
      }
      var thumb = document.createElement("div");
      thumb.className = "fow-warrant-thumb";
      var form = document.createElement("strong");
      form.textContent = row.formType || "Warrant";
      var mark = document.createElement("span");
      mark.textContent = "Warrant";
      thumb.appendChild(form);
      thumb.appendChild(mark);
      var body = document.createElement("div");
      var title = document.createElement("strong");
      title.textContent = warrantTitle(row);
      var meta = document.createElement("span");
      meta.textContent = [
        row.fileNo || row.warrantNumber,
        row.warrantDate || (row.issuedAt || "").slice(0, 10),
        row.officerName || row.warrantIssuer
      ]
        .filter(Boolean)
        .join(" · ");
      body.appendChild(title);
      body.appendChild(meta);
      item.appendChild(thumb);
      item.appendChild(body);
      list.appendChild(item);
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
    setSheetText("targetCitizenship", countryName(subject.citizenship));
    setSheetText(
      "targetDisposition",
      dispositionLine(subject) || immigration.disposition || immigration.status
    );
    setSheetText(
      "targetPhysicalDescription",
      [subject.sex, subject.age ? subject.age + " yrs" : "", countryName(subject.citizenship)]
        .filter(Boolean)
        .join(" · ")
    );
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
    bindTargetLocationActions(primaryLoc);

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

    var opCard = byId("targetOperationCard");
    if (opCard) {
      opCard.hidden = true;
    }

    paintTargetWarnings(subject);
    paintTargetWarrants(subject);
    paintTargetCaseMap(snap, subject);
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

  function recToDataUrl(rec) {
    if (!rec || !rec.blob) {
      return Promise.resolve("");
    }
    var blob = rec.blob;
    if (typeof Blob !== "undefined" && !(blob instanceof Blob)) {
      blob = new Blob([blob.buffer || blob]);
    }
    return new Promise(function (resolve) {
      var reader = new FileReader();
      reader.onload = function () {
        resolve(String(reader.result || ""));
      };
      reader.onerror = function () {
        resolve("");
      };
      reader.readAsDataURL(blob);
    });
  }

  function collectPageCss() {
    return fetch("style/style.css")
      .then(function (res) {
        return res.ok ? res.text() : "";
      })
      .catch(function () {
        var css = "";
        Array.prototype.forEach.call(document.styleSheets || [], function (sheet) {
          try {
            Array.prototype.forEach.call(sheet.cssRules || [], function (rule) {
              css += rule.cssText + "\n";
            });
          } catch (err) {}
        });
        return css;
      });
  }

  function inlineImages(root) {
    var imgs = root.querySelectorAll("img");
    var jobs = [];
    Array.prototype.forEach.call(imgs, function (img) {
      var src = img.getAttribute("src") || "";
      if (!src || src.indexOf("data:") === 0) {
        return;
      }
      jobs.push(
        fetch(src)
          .then(function (res) {
            return res.blob();
          })
          .then(function (blob) {
            return recToDataUrl({ blob: blob });
          })
          .then(function (data) {
            if (data) {
              img.setAttribute("src", data);
            }
          })
          .catch(function () {})
      );
    });
    return Promise.all(jobs);
  }

  function photoCaptionLine(row, index, total) {
    var caption =
      window.COPDoc &&
      COPDoc.model &&
      typeof COPDoc.model.formatPhotoCaption === "function"
        ? COPDoc.model.formatPhotoCaption(row)
        : (row && row.caption) || "";
    var count = total > 1 ? index + 1 + " / " + total + " photos" : "";
    return [caption, count].filter(Boolean).join(" · ");
  }

  function loadWarrantPack(subject) {
    var rows = issuedWarrantRows(subject);
    var api = window.COPDoc && COPDoc.media;
    if (!rows.length || !api) {
      return Promise.resolve([]);
    }
    var out = [];
    var i = 0;
    function next() {
      if (i >= rows.length) {
        return Promise.resolve(out);
      }
      var row = rows[i];
      i += 1;
      if (!row.mediaId) {
        out.push({ href: "" });
        return next();
      }
      return api
        .blob(row.mediaId, "original")
        .then(recToDataUrl)
        .then(function (href) {
          out.push({ href: href });
          return next();
        })
        .catch(function () {
          out.push({ href: "" });
          return next();
        });
    }
    return next();
  }

  function loadSubjectPhotoPack() {
    var photos = targetPhotoState.photos || [];
    var api = window.COPDoc && COPDoc.media;
    if (!photos.length || !api) {
      return Promise.resolve([]);
    }
    var out = [];
    var i = 0;
    function next() {
      if (i >= photos.length) {
        return Promise.resolve(out);
      }
      var row = photos[i];
      var index = i;
      i += 1;
      return api
        .blob(row.mediaId, "display")
        .catch(function () {
          return api.blob(row.mediaId, "original");
        })
        .then(recToDataUrl)
        .then(function (src) {
          out.push({
            src: src,
            caption: photoCaptionLine(row, index, photos.length)
          });
          return next();
        })
        .catch(function () {
          out.push({ src: "", caption: photoCaptionLine(row, index, photos.length) });
          return next();
        });
    }
    return next();
  }

  function sheetFileName() {
    var name = (byId("targetName") && byId("targetName").textContent) || "target";
    var slug = String(name)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "target";
    var d = new Date();
    function pad(n) {
      return n < 10 ? "0" + n : String(n);
    }
    var stamp =
      d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate());
    return "Target_" + slug + "_" + stamp + ".html";
  }

  function saveTargetSheetHtml() {
    var sheet = byId("mobileFowSheet");
    if (!sheet || sheet.hidden) {
      if (window.COPDoc && COPDoc.setAppBarStatus) {
        COPDoc.setAppBarStatus("Open a target sheet before saving.");
      }
      return;
    }
    if (window.COPDoc && COPDoc.setAppBarStatus) {
      COPDoc.setAppBarStatus("Preparing offline Target sheet…");
    }
    var snap = model() && model().store ? model().store.getLead(queryId()) : null;
    var subject = snap
      ? model().subjectOf
        ? model().subjectOf(snap)
        : snap.person
      : null;
    Promise.all([
      collectPageCss(),
      loadSubjectPhotoPack(),
      loadWarrantPack(subject)
    ])
      .then(function (parts) {
        var css = parts[0] || "";
        var pack = parts[1] || [];
        var warrants = parts[2] || [];
        var clone = sheet.cloneNode(true);
        return inlineImages(clone).then(function () {
          clone.querySelectorAll("details").forEach(function (el) {
            el.setAttribute("open", "");
          });
          var warrantCards = clone.querySelectorAll(".fow-warrant-card");
          warrants.forEach(function (row, index) {
            if (warrantCards[index] && row.href) {
              warrantCards[index].setAttribute("href", row.href);
              warrantCards[index].setAttribute("target", "_blank");
              warrantCards[index].setAttribute("rel", "noopener");
            }
          });
          var hero = clone.querySelector("#targetPhoto");
          if (hero && pack[0] && pack[0].src) {
            hero.setAttribute("src", pack[0].src);
            hero.removeAttribute("hidden");
          }
          var meta = clone.querySelector("#targetPhotoMeta");
          if (meta && pack[0]) {
            meta.textContent = pack[0].caption || meta.textContent;
          }
          var title = (byId("targetName") && byId("targetName").textContent) || "Target sheet";
          var places = collectSubjectPlaces(snap, subject).filter(function (place) {
            return place.mapped;
          });
          var script =
            "window.TARGET_SHEET_PHOTOS = " +
            JSON.stringify(pack) +
            ";window.TARGET_SHEET_PLACES = " +
            JSON.stringify(places) +
            ";" +
            "(function(){var p=window.TARGET_SHEET_PHOTOS||[];var i=0;" +
            "var img=document.getElementById('targetPhoto');" +
            "var meta=document.getElementById('targetPhotoMeta');" +
            "var prev=document.getElementById('targetPhotoPrev');" +
            "var next=document.getElementById('targetPhotoNext');" +
            "function show(n){if(!p.length||!img)return;i=(n+p.length)%p.length;" +
            "if(p[i].src){img.src=p[i].src;img.hidden=false;}" +
            "if(meta)meta.textContent=p[i].caption||'';}" +
            "if(prev)prev.onclick=function(){show(i-1);};" +
            "if(next)next.onclick=function(){show(i+1);};" +
            "if(img&&p.length>1)img.onclick=function(e){var r=img.getBoundingClientRect();" +
            "show(e.clientX<r.left+r.width/2?i-1:i+1);};" +
            "var places=window.TARGET_SHEET_PLACES||[];" +
            "var host=document.getElementById('targetCaseMap');" +
            "if(host&&window.L&&places.length){host.hidden=false;" +
            "var map=L.map(host);L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19}).addTo(map);" +
            "var pts=[];places.forEach(function(p){if(!p||p.lat==null||p.lng==null)return;" +
            "pts.push([p.lat,p.lng]);L.marker([p.lat,p.lng]).addTo(map).bindPopup(p.title||'');});" +
            "if(pts.length===1)map.setView(pts[0],17);else if(pts.length)map.fitBounds(pts,{padding:[28,28]});}" +
            "})();";
          var html =
            "<!DOCTYPE html>\n<html lang=\"en\"><head><meta charset=\"UTF-8\"/>" +
            "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1, viewport-fit=cover\"/>" +
            "<title>" +
            String(title).replace(/</g, "") +
            " — Target sheet</title>" +
            "<link rel=\"stylesheet\" href=\"https://unpkg.com/leaflet@1.9.4/dist/leaflet.css\"/>" +
            "<style>\n" +
            css.replace(/<\/style/gi, "<\\/style") +
            "\n</style></head><body data-page=\"mobile-target-sheet\">" +
            "<main class=\"mobile-fow-page\">" +
            "<nav class=\"mobile-fow-pagebar\"><div class=\"mobile-fow-pagebar-title\">" +
            "<span>Mobile Target sheet</span><small>Offline copy</small></div></nav>" +
            clone.outerHTML +
            "</main><script src=\"https://unpkg.com/leaflet@1.9.4/dist/leaflet.js\"></script><script>" +
            script.replace(/<\/script/gi, "<\\/script") +
            "<\/script></body></html>";
          downloadBlob(sheetFileName(), "text/html;charset=utf-8", html);
          if (window.COPDoc && COPDoc.setAppBarStatus) {
            COPDoc.setAppBarStatus("Downloaded offline Target sheet.", { ok: true });
          }
        });
      })
      .catch(function (err) {
        if (window.COPDoc && COPDoc.setAppBarStatus) {
          COPDoc.setAppBarStatus(
            (err && err.message) || "Could not save the Target sheet."
          );
        }
      });
  }

  function boot() {
    if (pageKey() === "leads") {
      bindFilters();
      bindExports();
      paintList();
      return;
    }
    if (pageKey() === "lead" || pageKey() === "case") {
      bindExports();
      bindCaseMapPopout();
      bindCaseLayout();
      bindCaseHistory();
      paintView();
      return;
    }
    if (pageKey() === "mobile-target-sheet") {
      var pageSave = byId("saveTargetSheetPageButton");
      if (pageSave) {
        pageSave.addEventListener("click", saveTargetSheetHtml);
      }
      var copyBtn = byId("copyTargetPinButton");
      if (copyBtn && copyBtn.dataset.copyBound !== "true") {
        copyBtn.dataset.copyBound = "true";
        copyBtn.addEventListener("click", function () {
          copyText(copyBtn.getAttribute("data-pin") || "")
            .then(function () {
              if (window.COPDoc && COPDoc.setAppBarStatus) {
                COPDoc.setAppBarStatus("Copied location pin.", { ok: true });
              }
            })
            .catch(function () {
              if (window.COPDoc && COPDoc.setAppBarStatus) {
                COPDoc.setAppBarStatus("Could not copy the location pin.");
              }
            });
        });
      }
      paintTargetSheet();
    }
  }

  window.paintCaseView = paintView;
  window.saveTargetSheet = saveTargetSheetHtml;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
