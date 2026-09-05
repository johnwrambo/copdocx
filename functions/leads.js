/**
 * Lead list and view painters.
 */
(function () {
  var recordFilter = "all";
  var targetDocumentSources = null;

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

  function formatDateMdY(value) {
    var text = String(value == null ? "" : value).trim();
    if (!text) {
      return "";
    }
    var day = text.slice(0, 10);
    var iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
    if (iso) {
      return iso[2] + "/" + iso[3] + "/" + iso[1];
    }
    return text;
  }

  function formatWhen(iso) {
    if (!iso) {
      return "—";
    }
    return formatDateMdY(iso) || displayOrDash(iso);
  }

  function formatSexLabel(value) {
    var key = String(value || "").trim().toLowerCase();
    if (key === "male" || key === "m") {
      return "Male";
    }
    if (key === "female" || key === "f") {
      return "Female";
    }
    return "";
  }

  function formatCaseAlienNumber(value) {
    if (typeof formatAlienNumberGroups === "function") {
      return formatAlienNumberGroups(value);
    }
    var digits = String(value || "").replace(/\D/g, "").slice(0, 9);
    if (!digits) {
      return "";
    }
    return [digits.slice(0, 3), digits.slice(3, 6), digits.slice(6, 9)]
      .filter(Boolean)
      .join(" ");
  }

  function formatCaseSsn(value) {
    if (typeof formatSSN === "function") {
      return formatSSN(value);
    }
    return String(value || "").trim();
  }

  function occupancyLine(row) {
    if (!row) {
      return "";
    }
    var historical =
      model().isHistoricalOccupancy && model().isHistoricalOccupancy(row);
    if (!historical && !row.occupiedFrom && !row.occupiedTo && !row.notes && !row.otherResidents) {
      return "";
    }
    var range = [formatDateMdY(row.occupiedFrom), formatDateMdY(row.occupiedTo)]
      .filter(Boolean)
      .join("–");
    return [
      historical ? "Historical" : "",
      range,
      row.notes,
      row.otherResidents ? "Residents " + row.otherResidents : ""
    ]
      .filter(Boolean)
      .join(" · ");
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

  function vehicleSummary(vehicle) {
    if (!vehicle) {
      return "";
    }
    var plate = [vehicle.licensePlate || vehicle.plate, vehicle.plateState]
      .filter(Boolean)
      .join(" · ");
    var ymm = [vehicle.vehicleYear, vehicle.vehicleColor, vehicle.vehicleMake, vehicle.vehicleModel]
      .filter(Boolean)
      .join(" ");
    return [plate, ymm].filter(Boolean).join(" · ");
  }

  function parseLocationPair(lat, lng, loc) {
    var y = parseFloat(lat);
    var x = parseFloat(lng);
    if (isFinite(y) && isFinite(x)) {
      return [y, x];
    }
    if (!loc) {
      return null;
    }
    y = parseFloat(loc.lat);
    x = parseFloat(loc.lng != null ? loc.lng : loc.long);
    if (isFinite(y) && isFinite(x)) {
      return [y, x];
    }
    if (loc.latLong && typeof parseLatLong === "function") {
      var parsed = parseLatLong(loc.latLong);
      if (parsed && parsed.latitude && parsed.longitude && !parsed.error) {
        return parseLocationPair(parsed.latitude, parsed.longitude);
      }
    }
    return null;
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
        hideWhenEmpty: false,
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
      var locBits = (vehicle.locations || [])
        .map(function (loc) {
          if (!loc) {
            return "";
          }
          return [associationLabel(loc.association), formatAddress(loc)]
            .filter(Boolean)
            .join(" ");
        })
        .filter(Boolean);
      var linkBits = ((snapshot && snapshot.links) || [])
        .filter(function (link) {
          return (
            link &&
            ((link.from &&
              link.from.type === "VEHICLE" &&
              link.from.id === vehicle.vehicleId) ||
              (link.to &&
                link.to.type === "VEHICLE" &&
                link.to.id === vehicle.vehicleId))
          );
        })
        .map(function (link) {
          var other =
            link.from && link.from.type === "PERSON"
              ? personLabelById(link.from.id)
              : link.to && link.to.type === "PERSON"
                ? personLabelById(link.to.id)
                : "";
          return [other, (link.reasons || []).join(", ")].filter(Boolean).join(" · ");
        })
        .filter(Boolean);
      var bits = [
        [vehicle.vehicleYear, vehicle.vehicleColor, vehicle.vehicleMake, vehicle.vehicleModel]
          .filter(Boolean)
          .join(" "),
        vehicle.vehicleBodyStyle,
        vehicle.vin ? "VIN " + vehicle.vin : "",
        vehicle.registeredOwnerName
          ? "Owner " + vehicle.registeredOwnerName
          : "",
        occupancyLine(vehicle),
        locBits.join(" · "),
        linkBits.join(" · ")
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
        meta: [
          assoc,
          loc.targetPriority ? "Priority " + loc.targetPriority : "",
          occupancyLine(loc),
          loc.latitude && loc.longitude
            ? loc.latitude + ", " + loc.longitude
            : ""
        ]
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
    if (fromVehicle) {
      if (assoc === "known-parking") {
        return "parking";
      }
      return "vehicle";
    }
    if (assoc === "work" || assoc === "office") {
      return "work";
    }
    return "home";
  }

  function subjectPlaceAddressKey(loc) {
    var line = formatAddress(loc);
    if (!line || line === "—") {
      return "";
    }
    return line.toLowerCase().replace(/[.,]/g, " ").replace(/\s+/g, " ").trim();
  }

  function subjectPlaceStreetKey(loc) {
    var street = String((loc && loc.street) || "")
      .toLowerCase()
      .replace(/[.,#]/g, " ")
      .replace(
        /\b(drive|dr|street|st|boulevard|blvd|road|rd|avenue|ave|lane|ln|court|ct|way|circle|cir)\b/g,
        ""
      )
      .replace(/\s+/g, " ")
      .trim();
    var zip = String((loc && loc.zip) || "").replace(/\s+/g, "");
    if (!street) {
      return "";
    }
    return zip ? street + " " + zip : street;
  }

  function separateOverlappingPins(places) {
    var groups = {};
    (places || []).forEach(function (place) {
      if (!place || !place.mapped) {
        return;
      }
      var key =
        Number(place.lat).toFixed(5) + "," + Number(place.lng).toFixed(5);
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(place);
    });
    Object.keys(groups).forEach(function (key) {
      var group = groups[key];
      if (group.length < 2) {
        return;
      }
      var move = group.filter(function (place) {
        return place.kind === "vehicle" || place.kind === "parking";
      });
      if (!move.length) {
        move = group.slice(1);
      }
      move.forEach(function (place, i) {
        var angle = ((i + 1) * 2 * Math.PI) / (move.length + 1);
        var delta = 0.00022;
        place.lat = Number(place.lat) + Math.cos(angle) * delta;
        place.lng = Number(place.lng) + Math.sin(angle) * delta;
      });
    });
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
    var personAddrIndex = {};
    function pushPersonOwner(list, id) {
      var key = String(id || "").trim();
      if (!key || list.some(function (row) { return row.id === key; })) {
        return;
      }
      list.push({ type: "PERSON", id: key });
    }
    function peopleForObject(type, id) {
      var out = [];
      pushPersonOwner(out, subject && (subject.personId || subject.id));
      if (!id) {
        return out;
      }
      var links = [];
      var m = model();
      if (m.store && typeof m.store.associationsFor === "function") {
        links = links.concat(m.store.associationsFor(type, id) || []);
      }
      links = links.concat((snapshot && snapshot.links) || []);
      links.forEach(function (link) {
        if (!link || link.junked || !link.from || !link.to) {
          return;
        }
        var fromType = String(link.from.type || "").toUpperCase();
        var toType = String(link.to.type || "").toUpperCase();
        var objectType = String(type || "").toUpperCase();
        if (
          fromType === "PERSON" &&
          toType === objectType &&
          String(link.to.id || "") === String(id)
        ) {
          pushPersonOwner(out, link.from.id);
        }
        if (
          toType === "PERSON" &&
          fromType === objectType &&
          String(link.from.id || "") === String(id)
        ) {
          pushPersonOwner(out, link.to.id);
        }
      });
      return out;
    }
    function rememberPersonPair(loc, pair) {
      if (!pair) {
        return;
      }
      var full = subjectPlaceAddressKey(loc);
      var street = subjectPlaceStreetKey(loc);
      if (full) {
        personAddrIndex[full] = pair;
      }
      if (street) {
        personAddrIndex[street] = pair;
      }
    }
    function pairForVehicle(loc) {
      var pair = parseLocationPair(loc.latitude, loc.longitude, loc);
      if (pair) {
        return pair;
      }
      return (
        personAddrIndex[subjectPlaceAddressKey(loc)] ||
        personAddrIndex[subjectPlaceStreetKey(loc)] ||
        null
      );
    }
    function pushLoc(loc, fromVehicle, extra, vehicle) {
      if (!loc) {
        return;
      }
      if (model().isHistoricalOccupancy && model().isHistoricalOccupancy(loc)) {
        return;
      }
      if (
        vehicle &&
        model().isHistoricalOccupancy &&
        model().isHistoricalOccupancy(vehicle)
      ) {
        return;
      }
      var kind = subjectPlaceKind(loc, fromVehicle);
      var addr = formatAddress(loc);
      if (addr === "—") {
        addr = "";
      }
      var pair = fromVehicle
        ? pairForVehicle(loc)
        : parseLocationPair(loc.latitude, loc.longitude, loc);
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
      var vehicleId =
        (vehicle && (vehicle.vehicleId || vehicle.id)) || "";
      var locationId = loc.locationId || "";
      var photoOwners = [];
      if (locationId) {
        photoOwners.push({ type: "LOCATION", id: locationId });
      }
      if (vehicleId) {
        photoOwners.push({ type: "VEHICLE", id: vehicleId });
      }
      var personPhotoOwners = [];
      [
        { type: "LOCATION", id: locationId },
        { type: "VEHICLE", id: vehicleId }
      ].forEach(function (ref) {
        peopleForObject(ref.type, ref.id).forEach(function (owner) {
          pushPersonOwner(personPhotoOwners, owner.id);
        });
      });
      var occupancy = occupancyLine(loc) || occupancyLine(vehicle) || "";
      var title =
        associationLabel(loc.association) || subjectPlaceKindLabel(kind);
      var placeKey =
        (fromVehicle ? "vehicle:" : "place:") +
        (locationId || vehicleId || "row") +
        ":" +
        places.length;
      places.push({
        id: locationId,
        placeKey: placeKey,
        vehicleId: vehicleId,
        kind: kind,
        title: title,
        address: addr,
        extra: extra || "",
        occupancy: occupancy,
        meta: [extra, addr, occupancy].filter(Boolean).join(" · "),
        lat: pair ? pair[0] : "",
        lng: pair ? pair[1] : "",
        mapped: !!pair,
        targetPriority: priority,
        isPrimary: priority === "1",
        pinColor: pinColor,
        vehicleColor: vehicleColor || "",
        color: color,
        photoOwners: photoOwners,
        objectPhotoOwners: photoOwners,
        personPhotoOwners: personPhotoOwners,
        navigateUrl: mapsNavigateUrl(loc, pair)
      });
      if (!fromVehicle) {
        rememberPersonPair(loc, pair);
      }
    }
    ((subject && subject.locations) || []).forEach(function (loc) {
      pushLoc(loc, false, "", null);
    });
    ((snapshot && snapshot.vehicles) || []).forEach(function (vehicle) {
      (vehicle.locations || []).forEach(function (loc) {
        pushLoc(loc, true, vehicleSummary(vehicle), vehicle);
      });
    });
    separateOverlappingPins(places);
    var navByVehicle = {};
    places.forEach(function (place) {
      if (!place.navigateUrl && place.mapped) {
        place.navigateUrl = mapsNavigateUrl(null, [place.lat, place.lng]);
      }
      if (place.vehicleId && place.navigateUrl && !navByVehicle[place.vehicleId]) {
        navByVehicle[place.vehicleId] = place.navigateUrl;
      }
    });
    places.forEach(function (place) {
      if (!place.navigateUrl && place.vehicleId && navByVehicle[place.vehicleId]) {
        place.navigateUrl = navByVehicle[place.vehicleId];
      }
    });
    return places;
  }

  function caseMapKindIcon(kind, isPrimary, color) {
    var api = window.COPDoc && COPDoc.locationMap;
    var key = api && api.safeKind ? api.safeKind(kind) : kind || "home";
    var el = document.createElement("span");
    el.className = "case-map-key-marker is-" + key;
    if (api && typeof api.kindMarkerHtml === "function") {
      el.innerHTML = api.kindMarkerHtml(key, {
        color: color,
        primary: !!isPrimary,
        size: "compact"
      });
    } else if (api && typeof api.kindIconHtml === "function") {
      el.className =
        "case-map-key-icon is-" + key + (isPrimary ? " is-primary" : "");
      if (color) {
        el.style.color = color;
      }
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
        if (loc.locationId === locationId || String(loc.targetPriority) === "1") {
          var canonical = m.store.getObjectRecord && m.store.getObjectRecord("LOCATION", loc.locationId);
          if (canonical) Object.assign(loc, canonical);
          loc._objectEdit = true;
          loc.targetPriority = loc.locationId === locationId ? "1" : "";
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
          var canonical = m.store.getObjectRecord && m.store.getObjectRecord("LOCATION", loc.locationId);
          if (canonical) Object.assign(loc, canonical);
          loc._objectEdit = true;
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
        body.appendChild(label);
        if (place.extra) {
          var extra = document.createElement("span");
          extra.className = "case-map-item-extra";
          extra.textContent = place.extra;
          body.appendChild(extra);
        }
        var addr = document.createElement("span");
        addr.className = "case-map-item-address";
        addr.textContent = place.address || (place.extra ? "" : "No address");
        if (addr.textContent) {
          body.appendChild(addr);
        }
        item.setAttribute("data-place-key", place.placeKey || place.id || "");
        if (place.vehicleId) {
          item.setAttribute("data-vehicle-id", place.vehicleId);
        }
        item.setAttribute("data-place-kind", place.kind || "");
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
        if (place.navigateUrl) {
          var nav = document.createElement("a");
          nav.className = "fow-nav-link case-map-nav-link";
          nav.textContent = "Navigate";
          bindNavigateLink(nav, place.navigateUrl);
          actions.appendChild(nav);
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
        var canFocus =
          place.mapped ||
          place.kind === "vehicle" ||
          place.kind === "parking" ||
          !!place.vehicleId;
        if (canFocus) {
          item.classList.add("is-mapped");
          item.tabIndex = 0;
          item.addEventListener("click", function (event) {
            if (
              event.target &&
              event.target.closest &&
              event.target.closest("a, button, input, .case-map-item-actions")
            ) {
              return;
            }
            if (window.COPDoc && COPDoc.locationMap && COPDoc.locationMap.focus) {
              COPDoc.locationMap.focus(host, place.placeKey || place.id, {
                vehicleId: place.vehicleId || "",
                kind: place.kind || ""
              });
            }
          });
          item.addEventListener("keydown", function (event) {
            if (event.target !== item) {
              return;
            }
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
    var painted = false;
    if (window.COPDoc && COPDoc.locationMap && COPDoc.locationMap.displayMany) {
      try {
        painted = !!COPDoc.locationMap.displayMany(host, mapped);
      } catch (err) {
        painted = false;
      }
    }
    if (!painted) {
      host.classList.add("is-map-unavailable");
      host.replaceChildren();
      var note = document.createElement("p");
      note.className = "records-empty";
      note.textContent = "Interactive map unavailable. Pins stay in the list.";
      host.appendChild(note);
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
      allowColor: false,
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
      [formatDateMdY(subject && subject.dateOfBirth), subject && subject.age]
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
      ? "Crim"
      : "Non-crim";
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

  function caseStage(snap) {
    if (!snap) {
      return "LEAD";
    }
    var m = model();
    var subject = m && m.subjectOf ? m.subjectOf(snap) : snap.person;
    var key = String(
      (subject && subject.caseRole) || snap.caseRole || "LEAD"
    ).toUpperCase();
    if (key === "DETAINEE") {
      return "DETAINEE";
    }
    if (key === "TARGET" || issuedWarrantRows(subject).length) {
      return "TARGET";
    }
    return "LEAD";
  }

  function stageRank(stage) {
    if (stage === "TARGET") {
      return 1;
    }
    if (stage === "DETAINEE") {
      return 2;
    }
    return 0;
  }

  function filtered() {
    var rows = snapshots();
    if (recordFilter === "lead") {
      rows = rows.filter(function (row) {
        return caseStage(row) === "LEAD";
      });
    } else if (recordFilter === "target") {
      rows = rows.filter(function (row) {
        return caseStage(row) === "TARGET";
      });
    } else if (recordFilter === "detainee") {
      rows = rows.filter(function (row) {
        return caseStage(row) === "DETAINEE";
      });
    }
    return rows.sort(function (a, b) {
      var sa = stageRank(caseStage(a));
      var sb = stageRank(caseStage(b));
      if (sa !== sb) {
        return sa - sb;
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
      empty.textContent = "No cases yet.";
    } else if (!rows.length) {
      empty.textContent =
        recordFilter === "lead"
          ? "No leads."
          : recordFilter === "target"
            ? "No targets."
            : recordFilter === "detainee"
              ? "No detainees."
              : "No matching records.";
    }
    rows.forEach(function (snap) {
      var subject = m.subjectOf ? m.subjectOf(snap) : snap.person;
      var tr = document.createElement("tr");
      var name = (m.formatPersonLabel && m.formatPersonLabel(subject)) || "Untitled case";
      var committed = isCommitted(snap);
      var criminal = (subject && subject.criminal) || {};
      var immigration = (subject && subject.immigration) || {};
      [
        name,
        caseRoleLabel(caseStage(snap)),
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
      link.textContent = "Open";
      if (committed) {
        link.href = "case.html?id=" + encodeURIComponent(snap.leadId);
      } else {
        link.href = "lead-form.html?id=" + encodeURIComponent(snap.leadId);
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
          formatDateMdY(row.warrantDate || row.issuedAt) || "—",
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
    host.hidden = n < 1;
    var group = host.closest ? host.closest(".case-bio-group") : null;
    if (group && !group.querySelector(".case-plain-list")) {
      group.hidden = n < 1;
    }
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
      roleEl.textContent = caseRoleLabel(caseStage(snapshot));
    }
    if (byId("caseFolderFacts")) {
      fillFactHost(byId("caseFolderFacts"), [
        ["Sex", formatSexLabel(subject && subject.sex)],
        [
          "DOB / age",
          [
            formatDateMdY(subject && subject.dateOfBirth),
            subject && subject.age
          ]
            .filter(Boolean)
            .join(" · ")
        ],
        ["Citizenship", countryName(subject && subject.citizenship)],
        [
          "A-Number",
          formatCaseAlienNumber(
            subject && subject.immigration && subject.immigration.alienNumber
          )
        ],
        ["FIN", subject && subject.immigration && subject.immigration.finNumber],
        ["Aliases", aliasLine(subject)],
        ["SSN", formatCaseSsn(subject && subject.ssn)],
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
        hideWhenEmpty: false,
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

  function historyOfficerStamp(snap) {
    var id = (snap && snap.assignedOfficerId) || "";
    var api = window.COPDoc && COPDoc.officers;
    return {
      officerId: id,
      officerAlias:
        id && api && typeof api.aliasForId === "function" ? api.aliasForId(id) : ""
    };
  }

  function saveAssignedOfficer(id) {
    var m = model();
    if (!m || !m.store) {
      return;
    }
    m.store.loadFromDisk();
    var snap = m.store.getLead(queryId());
    if (!snap) {
      return;
    }
    var prev = String(snap.assignedOfficerId || "");
    var next = String(id || "");
    if (prev === next) {
      return;
    }
    var api = window.COPDoc && COPDoc.officers;
    var note;
    if (!next) {
      var prevAlias =
        api && typeof api.aliasForId === "function" ? api.aliasForId(prev) : "";
      note =
        "Cleared targeting officer" +
        (prevAlias ? " " + prevAlias : "") +
        ".";
    } else {
      snap.assignedOfficerId = next;
      var shown =
        api && typeof api.display === "function"
          ? api.display(api.get(next))
          : "";
      note =
        "Assigned targeting officer" + (shown ? " " + shown : "") + ".";
    }
    if (!next) {
      snap.history = Array.isArray(snap.history) ? snap.history : [];
      var clearStamp = {
        officerId: prev,
        officerAlias:
          api && typeof api.aliasForId === "function" ? api.aliasForId(prev) : ""
      };
      snap.history.push(
        m.createHistoryEvent
          ? m.createHistoryEvent({
              text: note,
              type: "note",
              source: "system",
              officerId: clearStamp.officerId,
              officerAlias: clearStamp.officerAlias
            })
          : {
              eventId: "evt_" + Date.now().toString(36),
              at: new Date().toISOString(),
              type: "note",
              text: note,
              source: "system",
              officerId: clearStamp.officerId,
              officerAlias: clearStamp.officerAlias
            }
      );
      snap.assignedOfficerId = "";
    } else {
      snap.history = Array.isArray(snap.history) ? snap.history : [];
      var stamp = historyOfficerStamp(snap);
      snap.history.push(
        m.createHistoryEvent
          ? m.createHistoryEvent({
              text: note,
              type: "note",
              source: "system",
              officerId: stamp.officerId,
              officerAlias: stamp.officerAlias
            })
          : {
              eventId: "evt_" + Date.now().toString(36),
              at: new Date().toISOString(),
              type: "note",
              text: note,
              source: "system",
              officerId: stamp.officerId,
              officerAlias: stamp.officerAlias
            }
      );
    }
    var mode = isCommitted(snap) ? "commit" : "draft";
    var saved = m.store.saveLead(snap, { mode: mode });
    if (!saved || !saved.ok) {
      if (window.COPDoc && COPDoc.setAppBarStatus) {
        COPDoc.setAppBarStatus((saved && saved.error) || "Could not assign the officer.");
      }
      return;
    }
    if (window.COPDoc && COPDoc.setAppBarStatus) {
      COPDoc.setAppBarStatus(note, { ok: true });
    }
    var fresh = m.store.getLead(snap.leadId);
    paintCaseAssignedOfficer(fresh);
    paintCaseHistory(fresh, m.subjectOf ? m.subjectOf(fresh) : fresh.person);
  }

  function assignedOfficerLabel(snapshot) {
    var api = window.COPDoc && COPDoc.officers;
    if (!api || !snapshot || !snapshot.assignedOfficerId) {
      return "";
    }
    var officer = api.get(snapshot.assignedOfficerId);
    return (api.display && api.display(officer)) || "";
  }

  function paintCaseAssignedOfficer(snapshot) {
    var btn = byId("caseAssignedOfficerButton");
    if (!btn) {
      return;
    }
    var label = assignedOfficerLabel(snapshot);
    btn.textContent = label || "Assign officer";
    btn.title = label
      ? "Change targeting officer"
      : "Assign targeting officer";
  }

  function closeAssignOfficerDialog() {
    var dialog = byId("caseAssignOfficerDialog");
    if (dialog) {
      dialog.hidden = true;
    }
  }

  function openAssignOfficerDialog() {
    var dialog = byId("caseAssignOfficerDialog");
    var m = model();
    if (!dialog || !m || !m.store) {
      return;
    }
    m.store.loadFromDisk();
    var snap = m.store.getLead(queryId());
    var api = window.COPDoc && COPDoc.officers;
    if (api && typeof api.bindAssign === "function") {
      api.bindAssign({
        search: byId("caseAssignOfficerSearch"),
        hidden: byId("caseAssignOfficerId"),
        results: byId("caseAssignOfficerResults"),
        value: (snap && snap.assignedOfficerId) || "",
        onChange: function (id) {
          saveAssignedOfficer(id);
          closeAssignOfficerDialog();
        }
      });
    }
    dialog.hidden = false;
    var search = byId("caseAssignOfficerSearch");
    if (search) {
      search.focus();
    }
  }

  function bindCaseAssignedOfficer() {
    var btn = byId("caseAssignedOfficerButton");
    var dialog = byId("caseAssignOfficerDialog");
    var cancel = byId("caseAssignOfficerCancel");
    var clear = byId("caseAssignOfficerClear");
    if (btn && btn.dataset.officerBound !== "true") {
      btn.dataset.officerBound = "true";
      btn.addEventListener("click", openAssignOfficerDialog);
    }
    if (cancel && cancel.dataset.officerBound !== "true") {
      cancel.dataset.officerBound = "true";
      cancel.addEventListener("click", closeAssignOfficerDialog);
    }
    if (clear && clear.dataset.officerBound !== "true") {
      clear.dataset.officerBound = "true";
      clear.addEventListener("click", function () {
        saveAssignedOfficer("");
        closeAssignOfficerDialog();
      });
    }
    if (dialog && dialog.dataset.officerBound !== "true") {
      dialog.dataset.officerBound = "true";
      dialog.addEventListener("click", function (event) {
        if (event.target === dialog) {
          closeAssignOfficerDialog();
        }
      });
    }
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
        formatDateMdY(immigration.finalOrderDate) ||
          (immigration.finalOrder ? "Final order" : "")
      ],
      ["First deportation", formatDateMdY(immigration.firstDeportationDate)],
      ["Last deportation", formatDateMdY(immigration.lastDeportationDate)]
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
      var line = [
        formatDateMdY(row.arrestDate),
        row.arrestCharge,
        row.arrestAgency
      ]
        .filter(Boolean)
        .join(" · ");
      if (line) {
        lines.push("Arrest · " + line);
      }
    });
    ((subject && subject.convictions) || []).forEach(function (row) {
      var line = [
        formatDateMdY(row.convictionDate),
        row.crime || row.charge,
        row.court
      ]
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
      var line = [
        formatDateMdY(row.warrantDate),
        row.charge,
        row.warrantStatus
      ]
        .filter(Boolean)
        .join(" · ");
      if (line) {
        lines.push("Warrant · " + line);
      }
    });
    var listHas = paintPlainList(byId("caseCriminalList"), null, lines);
    var group =
      byId("caseCriminalFacts") &&
      byId("caseCriminalFacts").closest &&
      byId("caseCriminalFacts").closest(".case-bio-group");
    if (group) {
      group.hidden = n < 1 && !listHas;
    }
    setTileEmpty(
      byId("caseCriminalTile"),
      n < 1 && !listHas
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
          row.documentExpiration
            ? "exp " + formatDateMdY(row.documentExpiration)
            : ""
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
    var when = formatDateMdY(row.updatedAt);
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

  function relatedCases(personId, excludeLeadId) {
    var m = model();
    if (!m || !m.store || typeof m.store.relatedCommittedCases !== "function") {
      return { asSubject: [], asAssociate: [] };
    }
    return m.store.relatedCommittedCases(personId, excludeLeadId);
  }

  function objectLabelByRef(type, id, snapshot) {
    var m = model();
    var key = String(type || "").toUpperCase();
    if (key === "PERSON") {
      return personLabelById(id);
    }
    if (key === "VEHICLE") {
      var vehicle =
        (m.store.getVehicleRecord && m.store.getVehicleRecord(id)) ||
        ((snapshot && snapshot.vehicles) || []).filter(function (row) {
          return row && (row.vehicleId === id || row.id === id);
        })[0];
      return vehicleHeading(vehicle) || id;
    }
    if (key === "LOCATION") {
      var loc =
        (m.store.getLocationRecord && m.store.getLocationRecord(id)) ||
        (((snapshot && snapshot.person && snapshot.person.locations) || []).filter(
          function (row) {
            return row && row.locationId === id;
          }
        )[0]);
      return formatAddress(loc) || id;
    }
    if (key === "BUSINESS") {
      var biz = m.store.getBusinessRecord && m.store.getBusinessRecord(id);
      return (biz && biz.name) || id;
    }
    if (key === "ENTITY") {
      var ent = m.store.getEntityRecord && m.store.getEntityRecord(id);
      return (ent && (m.formatEntityLabel && m.formatEntityLabel(ent))) || (ent && ent.name) || id;
    }
    return id || "";
  }

  function associationTypeLabel(type) {
    var key = String(type || "").toUpperCase();
    if (key === "VEHICLE") {
      return "Vehicle";
    }
    if (key === "LOCATION") {
      return "Location";
    }
    if (key === "BUSINESS") {
      return "Business";
    }
    if (key === "ENTITY") {
      return "Entity";
    }
    if (key === "OTHER") {
      return "Other";
    }
    return "Person";
  }

  var caseAssocDraft = {
    query: "",
    reason: "",
    highlight: 0,
    objectType: "PERSON"
  };
  var caseAssocFocusComposer = false;
  var caseAssocLeadId = "";
  var caseAssocSubjectId = "";

  function caseAssocStatus(message, ok) {
    if (window.COPDoc && COPDoc.setAppBarStatus) {
      COPDoc.setAppBarStatus(message, ok ? { ok: true } : undefined);
    }
  }

  function caseComposerPlaceholder(type) {
    var key = String(type || "PERSON").toUpperCase();
    if (key === "VEHICLE") {
      return "Type a plate, Enter";
    }
    if (key === "LOCATION") {
      return "Type a street, Enter";
    }
    if (key === "BUSINESS" || key === "ENTITY") {
      return "Type a name, Enter";
    }
    return "Type a name, Enter";
  }

  function caseComposerTypes() {
    var m = model();
    var all = ["PERSON", "VEHICLE", "LOCATION", "BUSINESS", "ENTITY"];
    if (!m || typeof m.associationReasonsForPair !== "function") {
      return all;
    }
    return all.filter(function (type) {
      return (m.associationReasonsForPair("PERSON", type) || []).length > 0;
    });
  }

  function defaultCaseAssocReason(otherType) {
    var m = model();
    if (m && m.defaultPersonAssociationReason) {
      return m.defaultPersonAssociationReason(otherType);
    }
    var key = String(otherType || "PERSON").toUpperCase();
    if (key === "VEHICLE") {
      return "REGISTERED_OWNER_OF";
    }
    if (key === "LOCATION") {
      return "CURRENT_RESIDENCE";
    }
    if (key === "BUSINESS") {
      return "CUSTOMER_OF";
    }
    if (key === "ENTITY") {
      return "MEMBER_OF";
    }
    return "ASSOCIATE_OF";
  }

  function caseReasonOptions(otherType) {
    var skip = {
      ENCOUNTER_LOCATION: true,
      ARREST_LOCATION: true,
      STAGING_LOCATION: true,
      PROCESSING_LOCATION: true
    };
    var m = model();
    var rows =
      m && m.associationReasonsForPair
        ? m.associationReasonsForPair("PERSON", otherType) || []
        : [];
    return rows
      .filter(function (row) {
        return row && row.value && !skip[row.value];
      })
      .map(function (row) {
        return {
          value: row.value,
          label:
            (m.associationCardLabel && m.associationCardLabel(row.value)) ||
            row.label
        };
      });
  }

  function fillCaseAssocReasonSelect(select, otherType, selected) {
    if (!select) {
      return;
    }
    var options = caseReasonOptions(otherType);
    var want = selected || defaultCaseAssocReason(otherType);
    select.replaceChildren();
    options.forEach(function (row) {
      var opt = document.createElement("option");
      opt.value = row.value;
      opt.textContent = row.label;
      select.appendChild(opt);
    });
    if (want && options.some(function (row) { return row.value === want; })) {
      select.value = want;
    } else if (options.length) {
      select.value = options[0].value;
    }
  }

  function suggestCaseObjects(query, objectType, exceptId) {
    var m = model();
    var q = String(query || "").trim().toLowerCase();
    var type = String(objectType || "PERSON").toUpperCase();
    if (!q || !m || !m.store || typeof m.store.listObjects !== "function") {
      return [];
    }
    var hits = [];
    (m.store.listObjects(type) || []).forEach(function (row) {
      if (!row) {
        return;
      }
      var id =
        row.personId ||
        row.vehicleId ||
        row.locationId ||
        row.businessId ||
        row.entityId ||
        row.id;
      if (!id || id === exceptId) {
        return;
      }
      var label = objectLabelByRef(type, id, null) || associationTypeLabel(type);
      var extra = "";
      if (type === "VEHICLE") {
        extra = [row.plateState, row.licensePlate || row.plate, row.vin]
          .filter(Boolean)
          .join(" ");
      } else if (type === "LOCATION") {
        extra = [row.street, row.city, row.state, row.zip]
          .filter(Boolean)
          .join(" ");
      } else if (type === "BUSINESS" || type === "ENTITY") {
        extra = [row.name, row.kind, row.phone].filter(Boolean).join(" ");
      } else {
        extra = [
          row.name && row.name.lastName,
          row.name && row.name.firstName
        ]
          .filter(Boolean)
          .join(" ");
      }
      if ((label + " " + extra).toLowerCase().indexOf(q) === -1) {
        return;
      }
      hits.push({ objectId: id, objectType: type, label: label });
    });
    return hits.slice(0, 8);
  }

  function paintCaseAssocSuggest(host) {
    var list = host && host.querySelector("[data-associate-suggest]");
    if (!list) {
      return;
    }
    var hits = suggestCaseObjects(
      caseAssocDraft.query,
      caseAssocDraft.objectType || "PERSON",
      caseAssocSubjectId
    );
    list.replaceChildren();
    if (!hits.length || !String(caseAssocDraft.query || "").trim()) {
      list.hidden = true;
      caseAssocDraft.highlight = 0;
      return;
    }
    list.hidden = false;
    if (caseAssocDraft.highlight >= hits.length) {
      caseAssocDraft.highlight = hits.length - 1;
    }
    if (caseAssocDraft.highlight < 0) {
      caseAssocDraft.highlight = 0;
    }
    hits.forEach(function (hit, index) {
      var li = document.createElement("li");
      var btn = document.createElement("button");
      btn.type = "button";
      btn.setAttribute("data-associate-pick", hit.objectId);
      btn.setAttribute("data-associate-pick-type", hit.objectType);
      btn.textContent = hit.label;
      if (index === caseAssocDraft.highlight) {
        btn.className = "is-current";
      }
      li.appendChild(btn);
      list.appendChild(li);
    });
  }

  function submitCaseAssocComposer(objectId, objectType) {
    var m = model();
    if (!m || !m.store || !m.store.associateCaseObject || !caseAssocLeadId) {
      return;
    }
    var kind = objectType || caseAssocDraft.objectType || "PERSON";
    var reason = caseAssocDraft.reason || defaultCaseAssocReason(kind);
    var query = String(caseAssocDraft.query || "").trim();
    if (!objectId && !query) {
      caseAssocStatus(caseComposerPlaceholder(kind).replace(", Enter", "."));
      return;
    }
    if (!objectId) {
      var hits = suggestCaseObjects(query, kind, caseAssocSubjectId);
      if (
        hits.length &&
        caseAssocDraft.highlight >= 0 &&
        hits[caseAssocDraft.highlight]
      ) {
        objectId = hits[caseAssocDraft.highlight].objectId;
        kind = hits[caseAssocDraft.highlight].objectType || kind;
      }
    }
    var result = m.store.associateCaseObject(caseAssocLeadId, {
      objectType: kind,
      objectId: objectId || "",
      personId: kind === "PERSON" ? objectId || "" : "",
      label: query,
      name: query,
      reason: reason
    });
    if (!result || !result.ok) {
      caseAssocStatus((result && result.error) || "Could not add that object.");
      return;
    }
    caseAssocDraft.query = "";
    caseAssocDraft.highlight = 0;
    caseAssocFocusComposer = true;
    if (typeof window.paintCaseView === "function") {
      window.paintCaseView();
    }
    caseAssocStatus(
      (result.reused ? "Reused " : "Added ") +
        (objectLabelByRef(
          result.objectType || kind,
          result.objectId,
          null
        ) || associationTypeLabel(kind).toLowerCase()) +
        ".",
      true
    );
  }

  function paintCaseAssocRow(list, opts) {
    opts = opts || {};
    var li = document.createElement("li");
    li.className = "investigation-associate-row case-assoc-row";
    var kind = document.createElement("span");
    kind.className = "investigation-outline-kind";
    kind.textContent = opts.typeLabel || associationTypeLabel(opts.objectType);
    li.appendChild(kind);
    var jumped = null;
    if (opts.personId && opts.jumpedLeadIds) {
      jumped = relatedCases(opts.personId, opts.leadId).asSubject[0];
      if (jumped) {
        opts.jumpedLeadIds[jumped.leadId] = true;
      }
    }
    if (jumped) {
      var jump = document.createElement("a");
      jump.className = "investigation-associate-name case-jump";
      jump.href = caseJumpHref(jumped.leadId);
      jump.textContent = opts.displayName || jumped.label || "Case";
      jump.title = "Open case";
      li.appendChild(jump);
    } else {
      var nameBtn = document.createElement("button");
      nameBtn.type = "button";
      nameBtn.className = "investigation-associate-name";
      if (opts.editId) {
        nameBtn.setAttribute("data-case-association", opts.editId);
      }
      nameBtn.textContent = opts.displayName || associationTypeLabel(opts.objectType);
      li.appendChild(nameBtn);
    }
    if (opts.associationId && caseReasonOptions(opts.objectType).length) {
      var sel = document.createElement("select");
      sel.setAttribute("data-case-assoc-reason", opts.associationId);
      fillCaseAssocReasonSelect(sel, opts.objectType, opts.reason);
      li.appendChild(sel);
    } else if (opts.reasonLabel) {
      var reasonBit = document.createElement("span");
      reasonBit.className = "case-assoc-reason-label";
      reasonBit.textContent = opts.reasonLabel;
      li.appendChild(reasonBit);
    }
    var drop = document.createElement("button");
    drop.type = "button";
    drop.className = "action-button-secondary compact";
    if (opts.associationId) {
      drop.setAttribute("data-case-assoc-remove", opts.associationId);
      drop.title = "Remove this association";
    } else if (opts.linkId) {
      drop.setAttribute("data-case-assoc-uncite", opts.linkId);
      drop.title = "Remove this association";
    }
    drop.textContent = "×";
    li.appendChild(drop);
    list.appendChild(li);
    return true;
  }

  function paintCaseAssocComposer(host) {
    if (!host) {
      return;
    }
    var types = caseComposerTypes();
    if (types.indexOf(caseAssocDraft.objectType) === -1) {
      caseAssocDraft.objectType = types[0] || "PERSON";
      caseAssocDraft.reason = "";
    }
    if (!caseAssocDraft.reason) {
      caseAssocDraft.reason = defaultCaseAssocReason(caseAssocDraft.objectType);
    }
    host.replaceChildren();
    host.className = "investigation-associate-composer";
    host.hidden = false;
    var typeSel = document.createElement("select");
    typeSel.setAttribute("data-associate-type", "");
    types.forEach(function (type) {
      var opt = document.createElement("option");
      opt.value = type;
      opt.textContent = associationTypeLabel(type);
      typeSel.appendChild(opt);
    });
    typeSel.value = caseAssocDraft.objectType;
    host.appendChild(typeSel);
    var input = document.createElement("input");
    input.type = "text";
    input.setAttribute("data-associate-input", "");
    input.autocomplete = "off";
    input.spellcheck = false;
    input.placeholder = caseComposerPlaceholder(caseAssocDraft.objectType);
    input.value = caseAssocDraft.query || "";
    host.appendChild(input);
    var reasonSel = document.createElement("select");
    reasonSel.setAttribute("data-associate-new-reason", "");
    fillCaseAssocReasonSelect(
      reasonSel,
      caseAssocDraft.objectType,
      caseAssocDraft.reason
    );
    host.appendChild(reasonSel);
    var suggest = document.createElement("ul");
    suggest.className = "investigation-associate-suggest";
    suggest.setAttribute("data-associate-suggest", "");
    suggest.hidden = true;
    host.appendChild(suggest);
    paintCaseAssocSuggest(host);
  }

  function bindCaseAssocComposer(host) {
    if (!host || host.dataset.assocComposerBound === "true") {
      return;
    }
    host.dataset.assocComposerBound = "true";
    host.addEventListener("input", function (event) {
      var input = event.target.closest && event.target.closest("[data-associate-input]");
      if (!input) {
        return;
      }
      caseAssocDraft.query = input.value;
      paintCaseAssocSuggest(host);
    });
    host.addEventListener("change", function (event) {
      var typeSel =
        event.target.closest && event.target.closest("[data-associate-type]");
      if (typeSel) {
        caseAssocDraft.objectType = typeSel.value;
        caseAssocDraft.reason = "";
        caseAssocDraft.highlight = 0;
        paintCaseAssocComposer(host);
        var next = host.querySelector("[data-associate-input]");
        if (next) {
          next.focus();
        }
        return;
      }
      var newReason =
        event.target.closest && event.target.closest("[data-associate-new-reason]");
      if (newReason) {
        caseAssocDraft.reason = newReason.value;
      }
    });
    host.addEventListener("keydown", function (event) {
      var input = event.target.closest && event.target.closest("[data-associate-input]");
      if (!input) {
        return;
      }
      var hits = suggestCaseObjects(
        caseAssocDraft.query,
        caseAssocDraft.objectType || "PERSON",
        caseAssocSubjectId
      );
      if (event.key === "ArrowDown" && hits.length) {
        event.preventDefault();
        caseAssocDraft.highlight = Math.min(
          hits.length - 1,
          (caseAssocDraft.highlight || 0) + 1
        );
        paintCaseAssocSuggest(host);
        return;
      }
      if (event.key === "ArrowUp" && hits.length) {
        event.preventDefault();
        caseAssocDraft.highlight = Math.max(0, (caseAssocDraft.highlight || 0) - 1);
        paintCaseAssocSuggest(host);
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        submitCaseAssocComposer();
      }
      if (event.key === "Escape") {
        event.preventDefault();
        caseAssocDraft.query = "";
        caseAssocDraft.highlight = 0;
        input.value = "";
        paintCaseAssocSuggest(host);
      }
    });
    host.addEventListener("click", function (event) {
      var pick = event.target.closest && event.target.closest("[data-associate-pick]");
      if (!pick) {
        return;
      }
      event.preventDefault();
      submitCaseAssocComposer(
        pick.getAttribute("data-associate-pick"),
        pick.getAttribute("data-associate-pick-type")
      );
    });
  }

  function bindCaseAssocList(list) {
    if (!list || list.dataset.assocListBound === "true") {
      return;
    }
    list.dataset.assocListBound = "true";
    list.addEventListener("change", function (event) {
      var reasonSel =
        event.target.closest && event.target.closest("[data-case-assoc-reason]");
      if (!reasonSel) {
        return;
      }
      var m = model();
      if (!m || !m.store || !m.store.setAssociationReason) {
        return;
      }
      var result = m.store.setAssociationReason(
        reasonSel.getAttribute("data-case-assoc-reason"),
        reasonSel.value
      );
      if (!result || !result.ok) {
        caseAssocStatus((result && result.error) || "Could not change that relationship.");
        if (typeof window.paintCaseView === "function") {
          window.paintCaseView();
        }
        return;
      }
      if (typeof window.paintCaseView === "function") {
        window.paintCaseView();
      }
      caseAssocStatus("Updated relationship.", true);
    });
    list.addEventListener("click", function (event) {
      var removeBtn =
        event.target.closest && event.target.closest("[data-case-assoc-remove]");
      if (removeBtn) {
        event.preventDefault();
        event.stopPropagation();
        var m = model();
        if (!m || !m.store || !m.store.dropAssociation) {
          return;
        }
        var dropped = (m.store.retractAssociation || m.store.dropAssociation)(
          removeBtn.getAttribute("data-case-assoc-remove"), { reason: "Association removed from Case" }
        );
        if (!dropped || !dropped.ok) {
          caseAssocStatus((dropped && dropped.error) || "Could not remove that association.");
          return;
        }
        if (typeof window.paintCaseView === "function") {
          window.paintCaseView();
        }
        caseAssocStatus("Removed association.", true);
        return;
      }
      var unciteBtn =
        event.target.closest && event.target.closest("[data-case-assoc-uncite]");
      if (!unciteBtn) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      var store = model() && model().store;
      if (!store || !store.removeCaseLink || !caseAssocLeadId) {
        return;
      }
      var removed = store.removeCaseLink(
        caseAssocLeadId,
        unciteBtn.getAttribute("data-case-assoc-uncite")
      );
      if (!removed || !removed.ok) {
        caseAssocStatus((removed && removed.error) || "Could not remove that association.");
        return;
      }
      if (typeof window.paintCaseView === "function") {
        window.paintCaseView();
      }
      caseAssocStatus("Removed association.", true);
    });
  }

  function paintAssociationsTile(snapshot, subject) {
    var list = byId("caseAssociationsList");
    var empty = byId("caseAssociationsEmpty");
    var composer = byId("caseAssociationsComposer");
    var tile = byId("caseAssociationsTile");
    if (!list) {
      return;
    }
    list.replaceChildren();
    var sid = subject && subject.personId;
    var leadId = snapshot && snapshot.leadId;
    caseAssocLeadId = leadId || "";
    caseAssocSubjectId = sid || "";
    var jumpedLeadIds = {};
    var associatedPersonIds = {};
    var shown = {};
    var has = false;
    var m = model();
    var rows = document.createElement("ul");
    rows.className = "investigation-associate-list";

    if (sid && m.store && typeof m.store.associationsFor === "function") {
      (m.store.associationsFor("PERSON", sid) || []).forEach(function (row) {
        if (!row || !row.from || !row.to) {
          return;
        }
        var other =
          row.from.type === "PERSON" && row.from.id === sid ? row.to : row.from;
        if (!other || (other.type === "PERSON" && other.id === sid)) {
          return;
        }
        shown[row.associationId] = true;
        if (other.type === "PERSON" && other.id) {
          associatedPersonIds[other.id] = true;
        }
        var reason = row.reason || (row.reasons && row.reasons[0]) || "";
        if (
          paintCaseAssocRow(rows, {
            editId: row.associationId,
            associationId: row.associationId,
            leadId: leadId,
            personId: other.type === "PERSON" ? other.id : "",
            objectType: other.type,
            jumpedLeadIds: jumpedLeadIds,
            displayName:
              objectLabelByRef(other.type, other.id, snapshot) || row.label,
            typeLabel: associationTypeLabel(other.type),
            reason: reason,
            reasonLabel:
              (m.associationCardLabel && m.associationCardLabel(reason)) || reason
          })
        ) {
          has = true;
        }
      });
    }

    ((snapshot && snapshot.links) || []).forEach(function (link) {
      if (!link) {
        return;
      }
      if (link.associationId && shown[link.associationId]) {
        return;
      }
      var to = link.to || {};
      var personId = otherPersonId(link, sid);
      var typeCode = link.otherType || to.type || "";
      var displayName =
        link.label ||
        (to.id ? objectLabelByRef(typeCode, to.id, snapshot) : "") ||
        personLabelById(personId);
      if (personId) {
        associatedPersonIds[personId] = true;
      }
      var reason = (link.reasons && link.reasons[0]) || "";
      if (
        paintCaseAssocRow(rows, {
          editId: link.linkId,
          linkId: link.linkId,
          associationId: "",
          leadId: leadId,
          personId: personId,
          objectType: typeCode,
          jumpedLeadIds: jumpedLeadIds,
          displayName: displayName,
          typeLabel: associationTypeLabel(typeCode),
          reason: reason,
          reasonLabel:
            (m.associationCardLabel && m.associationCardLabel(reason)) || reason
        })
      ) {
        has = true;
      }
    });

    if (rows.childNodes.length) {
      list.appendChild(rows);
    }

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
    bindCaseAssocList(list);
    if (composer) {
      paintCaseAssocComposer(composer);
      bindCaseAssocComposer(composer);
    }
    setTileEmpty(tile, false);
    if (caseAssocFocusComposer && composer) {
      var composerInput = composer.querySelector("[data-associate-input]");
      if (composerInput) {
        composerInput.focus();
      }
      caseAssocFocusComposer = false;
    }
  }

  var historyNewestFirst = true;
  var historyEventRows = [];

  function historyWhen(row) {
    var when = formatWhen(row && row.at);
    var alias = row && row.officerAlias;
    if (alias) {
      return when + " · " + alias;
    }
    return when;
  }

  function renderHistoryEvents(events) {
    var list = byId("caseHistoryList");
    var empty = byId("caseHistoryEmpty");
    if (!list) {
      return;
    }
    if (events) {
      historyEventRows = events;
    }
    list.replaceChildren();
    var rows = historyEventRows.slice().sort(function (a, b) {
      var cmp = String(a.at || "").localeCompare(String(b.at || ""));
      return historyNewestFirst ? -cmp : cmp;
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
    (list._mediaUrls || []).forEach(function (url) {
      if (url && String(url).indexOf("blob:") === 0) {
        URL.revokeObjectURL(url);
      }
    });
    list._mediaUrls = [];
    rows.forEach(function (row) {
      if (row.type === "media") {
        var item = document.createElement("article");
        item.className = "case-history-media";
        if (row.mediaClass === "photo" && row.mediaId) {
          var img = document.createElement("img");
          img.className = "case-history-thumb";
          img.alt = row.caption || "Photo";
          item.appendChild(img);
          var api = window.COPDoc && COPDoc.media;
          if (api && typeof api.blob === "function") {
            api
              .blob(row.mediaId, "thumb")
              .catch(function () {
                return api.blob(row.mediaId, "display");
              })
              .then(function (rec) {
                var url = mediaBlobUrl(rec, list._mediaUrls);
                if (url) {
                  img.src = url;
                }
              })
              .catch(function () {});
          }
        }
        var body = document.createElement("div");
        body.className = "case-history-media-body";
        if (row.at) {
          var mediaTime = document.createElement("time");
          mediaTime.textContent = historyWhen(row);
          body.appendChild(mediaTime);
        }
        var title = document.createElement("strong");
        title.textContent = row.text || "File added";
        body.appendChild(title);
        [row.caption, row.notes, row.place, row.originalName]
          .filter(function (bit, i, arr) {
            return bit && arr.indexOf(bit) === i && bit !== row.text;
          })
          .forEach(function (bit) {
            var meta = document.createElement("span");
            meta.textContent = bit;
            body.appendChild(meta);
          });
        item.appendChild(body);
        list.appendChild(item);
        return;
      }
      var p = document.createElement("p");
      p.className = row.type === "note" ? "is-note" : "";
      if (row.at) {
        var time = document.createElement("time");
        time.textContent = historyWhen(row);
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
    var source = (snapshot && snapshot.source) || {};
    var sourceBits = [
      sourceLine(snapshot),
      source.refAgency,
      source.probationCheck ? "Probation" : "",
      source.leadInfo
    ].filter(Boolean);
    if (sourceBits.length) {
      push(meta.createdAt || meta.committedAt, sourceBits.join(" · "), "source");
    } else {
      push(meta.createdAt, "Case opened");
    }
    push(meta.committedAt, "Case filed");
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
      var records = window.COPDoc.repositories.bookin.readHistoryRecords();
      if (records.length) {
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
    paintCaseAssignedOfficer(snapshot);
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
          var caption =
            row.mediaClass === "photo" &&
            window.COPDoc &&
            COPDoc.model &&
            typeof COPDoc.model.formatPhotoCaption === "function"
              ? COPDoc.model.formatPhotoCaption(row)
              : row.caption || "";
          extra.push({
            at: (row.meta && (row.meta.createdAt || row.meta.committedAt)) || "",
            text: row.mediaClass === "photo" ? "Photo added" : "File added",
            type: "media",
            mediaClass: row.mediaClass || "",
            mediaId: row.mediaId || "",
            caption: caption,
            notes: row.notes || "",
            place: row.captionCustom ? row.place || "" : "",
            originalName: row.mediaClass === "file" ? row.originalName || "" : ""
          });
        });
      });
      renderHistoryEvents(events.concat(extra));
    });
  }

  function bindCaseHistory() {
    var openBtn = byId("caseHistoryOpenNote");
    var sortBtn = byId("caseHistorySort");
    var btn = byId("caseHistoryAddNote");
    var cancel = byId("caseHistoryCancelNote");
    var dialog = byId("caseHistoryDialog");
    var input = byId("caseHistoryNote");
    if (sortBtn && sortBtn.dataset.historyBound !== "true") {
      sortBtn.dataset.historyBound = "true";
      sortBtn.textContent = "Sort";
      sortBtn.title = "Showing newest first";
      sortBtn.addEventListener("click", function () {
        historyNewestFirst = !historyNewestFirst;
        sortBtn.textContent = "Sort";
        sortBtn.title = historyNewestFirst
          ? "Showing newest first"
          : "Showing oldest first";
        sortBtn.setAttribute("aria-pressed", historyNewestFirst ? "true" : "false");
        renderHistoryEvents();
      });
    }
    function closeDialog() {
      if (dialog) {
        dialog.hidden = true;
      }
    }
    if (openBtn && openBtn.dataset.historyOpenBound !== "true") {
      openBtn.dataset.historyOpenBound = "true";
      openBtn.addEventListener("click", function () {
        if (dialog) {
          dialog.hidden = false;
        }
        if (input) {
          input.focus();
        }
      });
    }
    if (cancel && cancel.dataset.historyBound !== "true") {
      cancel.dataset.historyBound = "true";
      cancel.addEventListener("click", closeDialog);
    }
    if (dialog && dialog.dataset.historyBound !== "true") {
      dialog.dataset.historyBound = "true";
      dialog.addEventListener("click", function (event) {
        if (event.target === dialog) {
          closeDialog();
        }
      });
    }
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
      var stamp = historyOfficerStamp(snap);
      var event =
        m.createHistoryEvent
          ? m.createHistoryEvent({
              text: text,
              type: "note",
              source: "operator",
              officerId: stamp.officerId,
              officerAlias: stamp.officerAlias
            })
          : {
              eventId: "evt_" + Date.now().toString(36),
              at: new Date().toISOString(),
              type: "note",
              text: text,
              source: "operator",
              officerId: stamp.officerId,
              officerAlias: stamp.officerAlias
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
      closeDialog();
      if (window.COPDoc && COPDoc.setAppBarStatus) {
        COPDoc.setAppBarStatus("Note added.", { ok: true });
      }
      var fresh = m.store.getLead(snap.leadId);
      paintCaseHistory(fresh, m.subjectOf ? m.subjectOf(fresh) : fresh.person);
    });
  }

  function paintCaseWarrants(subject) {
    var banner = byId("caseWarrantBanner");
    var list = byId("caseWarrantsList");
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
      if (banner) {
        banner.hidden = true;
      }
      list.hidden = true;
      return;
    }
    if (banner) {
      banner.hidden = false;
    }
    list.hidden = false;
    rows.forEach(function (row) {
      var item = document.createElement(row.mediaId ? "a" : "span");
      item.textContent = [
        row.formType || "Warrant",
        formatDateMdY(row.warrantDate || row.issuedAt),
        row.fileNo || row.warrantNumber
      ]
        .filter(Boolean)
        .join(" · ");
      if (row.mediaId) {
        item.href = "#";
        item.addEventListener("click", function (event) {
          event.preventDefault();
          openWarrantPdf(row);
        });
      }
      list.appendChild(item);
    });
  }

  function dropRetiredCaseLayout() {
    try {
      window.COPDoc.repositories.workspace.retireCaseLayout();
    } catch (err) {}
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
        COPDoc.setAppBarStatus("No filed cases to export.");
      }
      return;
    }
    downloadBlob(
      "leads.json",
      "application/json",
      JSON.stringify(rows, null, 2)
    );
    if (window.COPDoc && COPDoc.setAppBarStatus) {
      COPDoc.setAppBarStatus("Downloaded filed cases JSON.", { ok: true });
    }
  }

  function csvEscape(value) {
    var text = String(value == null ? "" : value);
    if (/^[=+\-@\t]/.test(text)) {
      text = "'" + text;
    }
    if (/[",\n\r]/.test(text)) {
      return '"' + text.replace(/"/g, '""') + '"';
    }
    return text;
  }

  function canonicalLeadSubject(snapshot) {
    var m = model();
    var embedded = (m.subjectOf && m.subjectOf(snapshot)) || {};
    var id = snapshot.subjectPersonId || embedded.personId;
    return (id && m.store && m.store.getPerson && m.store.getPerson(id)) || embedded;
  }

  // UI adapters capture current canonical data once; this renderer has no store/DOM reads.
  function leadCsvRow(row) {
    var person = row.person || {};
    var name = person.name || {};
    var immigration = person.immigration || {};
    var source = row.source || {};
    var vehicle = row.vehicle || {};
    return [
      name.lastName, name.firstName, name.middleName, person.sex,
      person.dateOfBirth, person.age, person.citizenship, immigration.alienNumber,
      source.caseNumber, source.leadSource,
      vehicle.licensePlate || vehicle.plate, vehicle.plateState || vehicle.state
    ].map(csvEscape).join(",");
  }

  function captureLeadCsvRows(snapshots) {
    return snapshots.map(function (snapshot) {
      var vehicle = (snapshot.vehicles && snapshot.vehicles[0]) || {};
      var id = vehicle.vehicleId || vehicle.id;
      var m = model();
      var embedded = (m.subjectOf && m.subjectOf(snapshot)) || {};
      var personId = snapshot.subjectPersonId || embedded.personId;
      var canonicalPerson = personId && m.store.getPerson && m.store.getPerson(personId);
      var canonicalVehicle = id && m.store.getVehicleRecord && m.store.getVehicleRecord(id);
      return {
        leadId: snapshot.leadId,
        person: canonicalPerson || embedded,
        personAuthority: canonicalPerson ? "canonical" : "snapshot",
        source: snapshot.source || {},
        vehicle: canonicalVehicle || vehicle,
        vehicleAuthority: canonicalVehicle ? "canonical" : "snapshot",
        revision: snapshot.meta && snapshot.meta.updatedAt || ""
      };
    });
  }

  function renderLeadCsv(context) {
    return CSV_HEADERS + "\r\n" + context.input.rows.map(leadCsvRow).join("\r\n") + "\r\n";
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

  function documentApi() {
    var api = window.COPDoc && COPDoc.documents;
    if (!api || typeof api.captureContext !== "function" || typeof api.generate !== "function") {
      throw new Error("Document generation is unavailable. Reload this page and try again.");
    }
    return api;
  }

  function documentFailure(error) {
    if (window.COPDoc && COPDoc.setAppBarStatus) {
      COPDoc.setAppBarStatus((error && error.message) || "Could not generate the document.");
    }
    return null;
  }

  async function recordDocumentSubmission(api, generationId, label) {
    try {
      await api.recordDelivery(generationId, { method: "download", status: "SUBMITTED" });
      if (window.COPDoc && COPDoc.setAppBarStatus) { COPDoc.setAppBarStatus(label + " download requested.", { ok: true }); }
    } catch (error) {
      if (window.COPDoc && COPDoc.setAppBarStatus) {
        COPDoc.setAppBarStatus(label + " was submitted for download, but delivery history could not be saved. " + (error && error.message || ""));
      }
    }
  }

  function sourceRevision(row) {
    return String(row && (row.revision || row.updatedAt || row.meta && row.meta.updatedAt) || "");
  }

  function sourceReference(type, row, id, authority) {
    return { type: type, id: String(id || ""), revision: sourceRevision(row), authority: authority || "canonical" };
  }

  async function generateLeadCsv(snapshots, filename) {
    var api = documentApi();
    var rows = captureLeadCsvRows(snapshots);
    var sources = [];
    rows.forEach(function (row) {
      sources.push(sourceReference("lead", row, row.leadId));
      if (row.person.personId) { sources.push(sourceReference("person", row.person, row.person.personId, row.personAuthority)); }
      if (row.vehicle.vehicleId || row.vehicle.id) { sources.push(sourceReference("vehicle", row.vehicle, row.vehicle.vehicleId || row.vehicle.id, row.vehicleAuthority)); }
    });
    var context = api.captureContext({ documentType: "lead.csv", input: { rows: rows }, sources: sources });
    var result = await api.generate({
      documentType: "lead.csv", context: context, templateContent: CSV_HEADERS + renderLeadCsv.toString() + leadCsvRow.toString() + csvEscape.toString(),
      render: function (ctx) { return { data: renderLeadCsv(ctx), mimeType: "text/csv;charset=utf-8", filename: filename }; }
    });
    try {
      downloadBlob(result.artifact.filename, result.artifact.mimeType, result.artifact.data);
    } catch (error) {
      await api.recordDelivery(result.record.generationId, { method: "download", status: "FAILED" }).catch(function () {});
      throw error;
    }
    await recordDocumentSubmission(api, result.record.generationId, "CSV");
    return result;
  }

  function exportListCsv() {
    var rows = snapshots().filter(isCommitted);
    if (!rows.length) {
      return Promise.resolve(documentFailure(new Error("No filed cases to export.")));
    }
    return generateLeadCsv(rows, "leads.csv").catch(documentFailure);
  }

  function bindCaseListMode() {
    var roster = byId("arrestRosterHost");
    var files = byId("caseFilesPanel");
    if (!roster || !files) {
      return;
    }
    function show(mode) {
      var arrests = mode !== "files";
      roster.hidden = !arrests;
      files.hidden = arrests;
      document.querySelectorAll("[data-case-list-mode]").forEach(function (btn) {
        btn.setAttribute(
          "aria-pressed",
          btn.getAttribute("data-case-list-mode") === (arrests ? "arrests" : "files")
            ? "true"
            : "false"
        );
      });
    }
    document.querySelectorAll("[data-case-list-mode]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        show(btn.getAttribute("data-case-list-mode") || "arrests");
      });
    });
    show("arrests");
  }

  function mountArrestRoster() {
    var host = byId("arrestRosterHost");
    if (!host || !window.COPDoc || !COPDoc.arrestRoster) {
      return;
    }
    COPDoc.arrestRoster.mount(host, {
      showGenerate: false,
      showSelection: false,
      showColumns: false
    });
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
    if (m && m.store && m.store.loadFromDisk) { m.store.loadFromDisk(); }
    var snap = m && m.store && m.store.getLead(queryId());
    if (!snap || !isCommitted(snap)) {
      return Promise.resolve(documentFailure(new Error("Commit the lead before exporting.")));
    }
    var subject = canonicalLeadSubject(snap);
    var name = (m.formatPersonLabel && m.formatPersonLabel(subject)) || "untitled-lead";
    var slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    return generateLeadCsv([snap], slug + ".csv").catch(documentFailure);
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
      if (oneCsv.dataset.csvExportBound !== "true") {
        oneCsv.dataset.csvExportBound = "true";
        oneCsv.addEventListener("click", exportOneCsv);
      }
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

  function mapsNavigateUrl(loc, pairOverride) {
    var pair = null;
    if (pairOverride && pairOverride.length >= 2) {
      var y = parseFloat(pairOverride[0]);
      var x = parseFloat(pairOverride[1]);
      if (isFinite(y) && isFinite(x) && !(y === 0 && x === 0)) {
        pair = [y, x];
      }
    }
    if (!pair && loc) {
      pair = parseLocationPair(loc.latitude, loc.longitude, loc);
    }
    var addr = loc ? formatAddress(loc) : "";
    if (addr === "—") {
      addr = "";
    }
    var dest = pair ? pair[0] + "," + pair[1] : addr;
    if (!dest) {
      return "";
    }
    if (pair) {
      return (
        "https://www.google.com/maps/dir/?api=1&destination=" +
        dest +
        "&travelmode=driving"
      );
    }
    return (
      "https://www.google.com/maps/dir/?api=1&destination=" +
      encodeURIComponent(dest) +
      "&travelmode=driving"
    );
  }

  function mapsSearchUrl(loc) {
    return mapsNavigateUrl(loc);
  }

  function openMapsNavigate(url, event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    var href = String(url || "");
    if (!href || href === "#") {
      return;
    }
    var win = null;
    try {
      win = window.open(href, "_blank");
    } catch (err) {}
    if (win) {
      try {
        win.opener = null;
      } catch (err2) {}
      return;
    }
    window.location.href = href;
  }

  function bindNavigateLink(el, url) {
    if (!el || !url) {
      return;
    }
    el.href = url;
    el.target = "_blank";
    el.rel = "noopener noreferrer";
    el.hidden = false;
    if (el.getAttribute("data-nav-bound") === "true") {
      return;
    }
    el.setAttribute("data-nav-bound", "true");
    el.addEventListener("click", function (event) {
      openMapsNavigate(el.getAttribute("href") || url, event);
    });
  }

  function paintTargetLocationList(host, locs) {
    if (!host) {
      return;
    }
    host.replaceChildren();
    var rows = (locs || []).filter(function (loc) {
      return loc && (formatAddress(loc) !== "—" || mapsNavigateUrl(loc));
    });
    if (!rows.length) {
      host.className = "fow-inline-empty";
      host.textContent = "No additional locations loaded.";
      return;
    }
    host.className = "fow-location-list";
    rows.forEach(function (loc) {
      var row = document.createElement("div");
      row.className = "fow-list-row fow-location-row";
      var body = document.createElement("div");
      body.className = "fow-location-row-body";
      var title = document.createElement("strong");
      title.textContent =
        associationLabel(loc.association) || "Location";
      var addr = formatAddress(loc);
      var meta = document.createElement("span");
      meta.textContent = [
        addr !== "—" ? addr : "",
        loc.targetPriority ? "Priority " + loc.targetPriority : ""
      ]
        .filter(Boolean)
        .join(" · ");
      body.appendChild(title);
      if (meta.textContent) {
        body.appendChild(meta);
      }
      row.appendChild(body);
      var url = mapsNavigateUrl(loc);
      if (url) {
        var nav = document.createElement("a");
        nav.className = "fow-nav-link";
        nav.textContent = "Navigate";
        bindNavigateLink(nav, url);
        row.appendChild(nav);
      }
      host.appendChild(row);
    });
  }

  function paintTargetVehicleList(host, vehicles) {
    if (!host) {
      return;
    }
    host.replaceChildren();
    var rows = vehicles || [];
    if (!rows.length) {
      host.className = "fow-inline-empty";
      host.textContent = "No additional vehicles loaded.";
      return;
    }
    host.className = "fow-location-list";
    rows.forEach(function (vehicle) {
      var row = document.createElement("div");
      row.className = "fow-list-row fow-location-row";
      var body = document.createElement("div");
      body.className = "fow-location-row-body";
      var title = document.createElement("strong");
      title.textContent = plateOf(vehicle) || vehicleYmm(vehicle) || "Vehicle";
      var meta = document.createElement("span");
      var firstLoc = ((vehicle && vehicle.locations) || []).filter(Boolean)[0];
      meta.textContent = [
        vehicleYmm(vehicle) && plateOf(vehicle) ? vehicleYmm(vehicle) : "",
        firstLoc ? formatAddress(firstLoc) : ""
      ]
        .filter(function (bit) {
          return bit && bit !== "—";
        })
        .join(" · ");
      body.appendChild(title);
      if (meta.textContent) {
        body.appendChild(meta);
      }
      row.appendChild(body);
      var url = "";
      ((vehicle && vehicle.locations) || []).some(function (loc) {
        url = mapsNavigateUrl(loc);
        return !!url;
      });
      if (url) {
        var nav = document.createElement("a");
        nav.className = "fow-nav-link";
        nav.textContent = "Navigate";
        bindNavigateLink(nav, url);
        row.appendChild(nav);
      }
      host.appendChild(row);
    });
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
        mapLink.textContent = "Navigate";
        mapLink.removeAttribute("data-not-built");
        bindNavigateLink(mapLink, url);
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
      targetDocumentSources = null;
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
    var subject = canonicalLeadSubject(snap);
    snap = JSON.parse(JSON.stringify(snap));
    snap.person = subject;
    targetDocumentSources = { lead: snap, person: subject, places: collectSubjectPlaces(snap, subject), officer: window.COPDoc && COPDoc.officers && COPDoc.officers.get ? COPDoc.officers.get(snap.assignedOfficerId) : null };
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
    setSheetText("targetSex", formatSexLabel(subject.sex));
    setSheetText("targetCitizenship", countryName(subject.citizenship));
    var targeting =
      window.COPDoc && COPDoc.officers
        ? COPDoc.officers.display(COPDoc.officers.get(snap.assignedOfficerId))
        : "";
    setSheetText("targetTargetingOfficer", targeting);
    setSheetText(
      "targetDisposition",
      dispositionLine(subject) || immigration.disposition || immigration.status
    );
    setSheetText(
      "targetPhysicalDescription",
      [
        formatSexLabel(subject.sex),
        subject.age ? subject.age + " yrs" : "",
        countryName(subject.citizenship)
      ]
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

    paintTargetLocationList(byId("targetLocationsList"), locs);
    paintTargetVehicleList(byId("targetVehiclesList"), vehicles);

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

  function fetchText(url) {
    return fetch(url)
      .then(function (res) {
        return res.ok ? res.text() : "";
      })
      .catch(function () {
        return "";
      });
  }

  function collectPageCss() {
    return fetchText("style/style.css").then(function (css) {
      if (css) {
        return css;
      }
      var out = "";
      Array.prototype.forEach.call(document.styleSheets || [], function (sheet) {
        try {
          Array.prototype.forEach.call(sheet.cssRules || [], function (rule) {
            out += rule.cssText + "\n";
          });
        } catch (err) {}
      });
      return out;
    });
  }

  function loadPlacePhotoPack(places) {
    var api = window.COPDoc && COPDoc.media;
    var rows = places || [];
    if (!api || !rows.length) {
      return Promise.resolve(rows);
    }
    function firstPhotoUrl(owners, index) {
      if (index >= owners.length) {
        return Promise.resolve("");
      }
      var owner = owners[index];
      if (!owner || !owner.id) {
        return firstPhotoUrl(owners, index + 1);
      }
      return api
        .list(owner)
        .catch(function () {
          return [];
        })
        .then(function (list) {
          var photos = (list || []).filter(function (row) {
            return (
              row &&
              row.mediaClass === "photo" &&
              (!row.meta || row.meta.status !== "draft")
            );
          });
          var primary =
            photos.filter(function (row) {
              return row.primary;
            })[0] || photos[0];
          if (!primary) {
            return firstPhotoUrl(owners, index + 1);
          }
          return api
            .blob(primary.mediaId, "thumb")
            .catch(function () {
              return api.blob(primary.mediaId, "display");
            })
            .then(recToDataUrl)
            .then(function (url) {
              return url || firstPhotoUrl(owners, index + 1);
            })
            .catch(function () {
              return firstPhotoUrl(owners, index + 1);
            });
        });
    }
    return Promise.all(
      rows.map(function (place) {
        return firstPhotoUrl(place.photoOwners || [], 0).then(function (url) {
          if (url) {
            place.photoDataUrl = url;
          }
          return place;
        });
      })
    );
  }

  function serializeTargetPlaces(places) {
    return (places || []).map(function (place) {
      return {
        id: place.id || "",
        placeKey: place.placeKey || "",
        vehicleId: place.vehicleId || "",
        kind: place.kind || "home",
        title: place.title || "",
        extra: place.extra || "",
        address: place.address || "",
        occupancy: place.occupancy || "",
        meta: place.meta || "",
        lat: place.lat,
        lng: place.lng,
        mapped: !!place.mapped,
        isPrimary: !!place.isPrimary,
        color: place.color || "",
        pinColor: place.pinColor || "",
        vehicleColor: place.vehicleColor || "",
        photoDataUrl: place.photoDataUrl || "",
        navigateUrl: place.navigateUrl || ""
      };
    });
  }

  function escapeInlineScript(source) {
    return String(source || "").replace(/<\/script/gi, "<\\/script");
  }

  function resetClonedTargetMap(root) {
    var host =
      root && root.querySelector ? root.querySelector("#targetCaseMap") : null;
    if (!host) {
      return;
    }
    while (host.firstChild) {
      host.removeChild(host.firstChild);
    }
    Array.prototype.slice.call(host.classList || []).forEach(function (name) {
      if (name.indexOf("leaflet-") === 0) {
        host.classList.remove(name);
      }
    });
    host.classList.remove("is-map-unavailable");
    host.removeAttribute("style");
    host.removeAttribute("tabindex");
  }

  function targetSheetMapBoot() {
    return (
      "(function(){" +
      "var p=window.TARGET_SHEET_PHOTOS||[];var i=0;" +
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
      "function bindLegend(host){" +
      "var list=document.getElementById('targetCaseMapList');" +
      "if(!list||!host)return;" +
      "list.querySelectorAll('[data-place-key]').forEach(function(item){" +
      "item.addEventListener('click',function(ev){" +
      "if(ev.target&&ev.target.closest&&ev.target.closest('.case-map-item-actions'))return;" +
      "if(window.COPDoc&&COPDoc.locationMap&&COPDoc.locationMap.focus){" +
      "COPDoc.locationMap.focus(host,item.getAttribute('data-place-key'),{" +
      "vehicleId:item.getAttribute('data-vehicle-id')||''," +
      "kind:item.getAttribute('data-place-kind')||''});}});});}" +
      "function fallback(host,places){" +
      "if(!host)return;" +
      "host.hidden=false;" +
      "if(!window.L){host.classList.add('is-map-unavailable');" +
      "host.textContent='Interactive map unavailable. Use the list.';return;}" +
      "try{var map=L.map(host,{zoomControl:true,tap:true,tapTolerance:22});" +
      "try{L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19}).addTo(map);}catch(e1){}" +
      "var pts=[];(places||[]).forEach(function(place){" +
      "if(!place||place.lat==null||place.lng==null)return;" +
      "var ll=[Number(place.lat),Number(place.lng)];" +
      "if(!isFinite(ll[0])||!isFinite(ll[1]))return;pts.push(ll);" +
      "var mo={};if(window.COPDoc&&COPDoc.mapIcons&&COPDoc.mapIcons.badgeHtml){" +
      "var me=COPDoc.mapIcons.forKind(place.kind);" +
      "mo.icon=L.divIcon({className:'case-map-pin',html:COPDoc.mapIcons.badgeHtml(me.id," +
      "{color:place.color||me.color,primary:!!place.isPrimary,size:place.isPrimary?'primary':'standard'})," +
      "iconSize:[44,44],iconAnchor:[22,22]});}" +
      "var m=L.marker(ll,mo).addTo(map);" +
      "var pop=document.createElement('div');" +
      "[place.title,place.extra,place.address].filter(Boolean).forEach(function(value,index){" +
      "if(index)pop.appendChild(document.createTextNode(' · '));" +
      "pop.appendChild(document.createTextNode(String(value)));});m.bindPopup(pop);});" +
      "if(pts.length===1)map.setView(pts[0],17);" +
      "else if(pts.length)map.fitBounds(pts,{padding:[28,28],maxZoom:17});" +
      "setTimeout(function(){try{map.invalidateSize();}catch(e2){}},0);}" +
      "catch(e3){host.classList.add('is-map-unavailable');" +
      "host.textContent='Interactive map unavailable. Use the list.';}}" +
      "function startMap(){" +
      "if(window.COPDoc&&COPDoc.mapIcons&&COPDoc.mapIcons.setLibrary){" +
      "COPDoc.mapIcons.setLibrary(window.TARGET_SHEET_ICON_LIBRARY||'standard'," +
      "{persist:false,notify:false});}" +
      "var host=document.getElementById('targetCaseMap');" +
      "var places=window.TARGET_SHEET_PLACES||[];" +
      "if(!host||!places.length)return;host.hidden=false;" +
      "try{if(window.COPDoc&&COPDoc.locationMap&&COPDoc.locationMap.displayMany){" +
      "COPDoc.locationMap.displayMany(host,places.filter(function(x){return x&&x.mapped;}));" +
      "bindLegend(host);return;}}catch(e4){}" +
      "fallback(host,places.filter(function(x){return x&&x.mapped;}));}" +
      "if(document.readyState==='complete')startMap();" +
      "else window.addEventListener('load',startMap);" +
      "window.addEventListener('resize',function(){" +
      "var host=document.getElementById('targetCaseMap');" +
      "var st=host&&host._locationMap;" +
      "if(st&&st.map){try{st.map.invalidateSize();}catch(e5){}}});" +
      "window.addEventListener('orientationchange',function(){" +
      "var host=document.getElementById('targetCaseMap');" +
      "var st=host&&host._locationMap;" +
      "if(st&&st.map){setTimeout(function(){try{st.map.invalidateSize();}catch(e6){}},250);}});" +
      "})();"
    );
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

  function loadSubjectPhotoPack(capturedPhotos) {
    var photos = capturedPhotos || targetPhotoState.photos || [];
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

  function sheetFileName(capturedName) {
    var name = capturedName || "target";
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

  function renderTargetSheetHtml(context, parts) {
    var title = context.input.title;
    var mapIconLibraryId = context.input.mapIconLibraryId;
    var pack = parts.photos || [];
    var packedPlaces = parts.places || [];
    var css = parts.css || "";
    var leafletCss = parts.leafletCss || "";
    var leafletJs = parts.leafletJs || "";
    var iconJs = parts.iconJs || "";
    var popupJs = parts.popupJs || "";
    var mapJs = parts.mapJs || "";
    var boot =
      "window.TARGET_SHEET_PHOTOS = " +
      JSON.stringify(pack) +
      ";window.TARGET_SHEET_PLACES = " +
      JSON.stringify(packedPlaces) +
      ";window.TARGET_SHEET_ICON_LIBRARY = " +
      JSON.stringify(mapIconLibraryId) +
      ";" +
      targetSheetMapBoot();
    var headExtra = leafletCss
      ? "<style>\n" +
        leafletCss.replace(/<\/style/gi, "<\\/style") +
        "\n</style>"
      : "<link rel=\"stylesheet\" href=\"https://unpkg.com/leaflet@1.9.4/dist/leaflet.css\"/>";
    var scripts = "";
    if (leafletJs) {
      scripts +=
        "<script>" + escapeInlineScript(leafletJs) + "<\/script>";
    } else {
      scripts +=
        "<script src=\"https://unpkg.com/leaflet@1.9.4/dist/leaflet.js\"><\/script>";
    }
    if (iconJs) {
      scripts += "<script>" + escapeInlineScript(iconJs) + "<\/script>";
    }
    if (popupJs) {
      scripts += "<script>" + escapeInlineScript(popupJs) + "<\/script>";
    }
    if (mapJs) {
      scripts += "<script>" + escapeInlineScript(mapJs) + "<\/script>";
    }
    scripts += "<script>" + escapeInlineScript(boot) + "<\/script>";
    var html =
      "<!DOCTYPE html>\n<html lang=\"en\"><head><meta charset=\"UTF-8\"/>" +
      "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1, viewport-fit=cover\"/>" +
      "<title>" +
      String(title).replace(/</g, "") +
      " — Target sheet</title>" +
      headExtra +
      "<style>\n" +
      css.replace(/<\/style/gi, "<\\/style") +
      "\n</style></head><body data-page=\"mobile-target-sheet\">" +
      "<main class=\"mobile-fow-page\">" +
      "<nav class=\"mobile-fow-pagebar\"><div class=\"mobile-fow-pagebar-title\">" +
      "<span>Mobile Target sheet</span><small>Saved copy</small></div></nav>" +
      parts.presentationHtml +
      "</main>" +
      scripts +
      "</body></html>";
    return html;
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
    var api;
    try { api = documentApi(); } catch (error) { return Promise.resolve(documentFailure(error)); }
    if (!targetDocumentSources) { return Promise.resolve(documentFailure(new Error("Reload the Target sheet before saving."))); }
    var captured = JSON.parse(JSON.stringify(targetDocumentSources));
    var snap = captured.lead;
    var subject = captured.person;
    var places = captured.places;
    var clone = sheet.cloneNode(true);
    var title = (byId("targetName") && byId("targetName").textContent) || "Target sheet";
    var filename = sheetFileName(title);
    var photos = JSON.parse(JSON.stringify(targetPhotoState.photos || []));
    var mapIconLibraryId = window.COPDoc && COPDoc.mapIcons && COPDoc.mapIcons.getLibraryId ? COPDoc.mapIcons.getLibraryId() : "standard";
    var sources = [sourceReference("lead", snap, snap.leadId, "snapshot")];
    if (subject.personId) { sources.push(sourceReference("person", subject, subject.personId, "snapshot")); }
    if (captured.officer && (captured.officer.officerId || captured.officer.id)) { sources.push(sourceReference("officer", captured.officer, captured.officer.officerId || captured.officer.id, "snapshot")); }
    (snap.vehicles || []).forEach(function (row) { if (row.vehicleId || row.id) { sources.push(sourceReference("vehicle", row, row.vehicleId || row.id, "snapshot")); } });
    locationRows(snap, subject).forEach(function (row) { if (row.locationId || row.id) { sources.push(sourceReference("location", row, row.locationId || row.id, "snapshot")); } });
    photos.concat(issuedWarrantRows(subject)).forEach(function (row) { if (row.mediaId) { sources.push(sourceReference("media", row, row.mediaId, "snapshot")); } });
    var context = api.captureContext({ documentType: "target-sheet.html", person: subject, officers: captured.officer ? [captured.officer] : [], locations: snap.locations || [], vehicles: snap.vehicles || [], sources: sources,
      input: { lead: snap, places: places, photos: photos, title: title, presentationHtml: clone.outerHTML, mapIconLibraryId: mapIconLibraryId } });
    resetClonedTargetMap(clone);
    return api.generate({ documentType: "target-sheet.html", context: context, templateContent: renderTargetSheetHtml.toString() + targetSheetMapBoot.toString(),
      render: function () { return Promise.all([
      collectPageCss(),
      loadSubjectPhotoPack(photos),
      loadWarrantPack(subject),
      loadPlacePhotoPack(places),
      fetchText("vendor/leaflet/leaflet.css"),
      fetchText("vendor/leaflet/leaflet.js"),
      fetchText("assets/icons/copdoc-icons.js"),
      fetchText("functions/map-popup.js"),
      fetchText("functions/location-map.js")
    ])
      .then(function (parts) {
        var css = parts[0] || "";
        var pack = parts[1] || [];
        var warrants = parts[2] || [];
        var packedPlaces = serializeTargetPlaces(parts[3] || places);
        var leafletCss = parts[4] || "";
        var leafletJs = parts[5] || "";
        var iconJs = parts[6] || "";
        var popupJs = parts[7] || "";
        var mapJs = parts[8] || "";
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
          var html = renderTargetSheetHtml(context, { presentationHtml: clone.outerHTML, photos: pack, places: packedPlaces,
            css: css, leafletCss: leafletCss, leafletJs: leafletJs, iconJs: iconJs, popupJs: popupJs, mapJs: mapJs });
          return { data: html, mimeType: "text/html;charset=utf-8", filename: filename };
        });
      }); }
    }).then(async function (result) {
      try {
        downloadBlob(result.artifact.filename, result.artifact.mimeType, result.artifact.data);
      } catch (error) {
        await api.recordDelivery(result.record.generationId, { method: "download", status: "FAILED" }).catch(function () {});
        throw error;
      }
      await recordDocumentSubmission(api, result.record.generationId, "Target sheet");
      return result;
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
    if (pageKey() === "leads" || pageKey() === "cases") {
      bindFilters();
      bindExports();
      bindCaseListMode();
      paintList();
      mountArrestRoster();
      return;
    }
    if (pageKey() === "lead" || pageKey() === "case") {
      bindExports();
      bindCaseMapPopout();
      dropRetiredCaseLayout();
      bindCaseHistory();
      bindCaseAssignedOfficer();
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

  window.COPDoc = window.COPDoc || {};
  COPDoc.leadDocuments = { renderCsv: renderLeadCsv, renderTargetHtml: renderTargetSheetHtml, captureCsvRows: captureLeadCsvRows, exportOneCsv: exportOneCsv, exportListCsv: exportListCsv };
  window.paintCaseView = paintView;
  window.saveTargetSheet = saveTargetSheetHtml;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
