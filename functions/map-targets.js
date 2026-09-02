/**
 * Map location layers: active targets, arrests, officer homes, origin finds.
 * Icon library assigns a glyph to a category or a single pin.
 * Writes only copdocx.map.layers.v1 and copdocx.map.icons.v1.
 */
(function (global) {
  "use strict";

  var root = (global.COPDoc = global.COPDoc || {});
  var api = (root.map = root.map || {});
  var LAYER_KEY = "copdocx.map.layers.v1";
  var ICON_KEY = "copdocx.map.icons.v1";
  var ADMIN_KEY = "copdoc.admin.v1";
  var LEGACY_PALETTE = [
    "Crosshair",
    "MapPin",
    "MapPinned",
    "Shield",
    "Users",
    "Car",
    "Star",
    "Navigation",
    "Radio",
    "Focus",
    "Archive"
  ];
  var DEFAULT_ICONS = {
    targets: "Target",
    arrests: "Arrest",
    officers: "OfficerHome",
    origin: "Origin"
  };
  var CATEGORY_COLORS = {
    targets: "#f0ad35",
    arrests: "#e96868",
    officers: "#68a8e8",
    origin: "#55c7bd"
  };
  var MARKER_LABELS = {
    targets: "Active target",
    arrests: "Arrest",
    officers: "Officer home",
    origin: "Origin or find"
  };
  var DEFAULT_VISIBLE = {
    targets: true,
    arrests: true,
    officers: true,
    origin: false,
    markup: true
  };
  var HEADERS = {
    targets: ["Rank", "Subject", "Address", "Association"],
    arrests: ["Date", "Subject", "Charge", "Location"],
    officers: ["Officer", "Address", "Duty"],
    origin: ["Subject", "Address", "Association"],
    markup: ["Type", "Text"]
  };
  var EMPTY = {
    targets: "No ranked target locations.",
    arrests: "No arrest locations on filed cases.",
    officers: "No officer home addresses with coordinates.",
    origin: "No plate-check / origin locations.",
    markup: "No labels or arrows yet."
  };
  var LAYER_ORDER = [
    ["targets", "Active targets"],
    ["arrests", "Arrests"],
    ["officers", "Officer homes"],
    ["origin", "Origin / finds"],
    ["markup", "Markup"]
  ];

  var catalog = {
    targets: [],
    arrests: [],
    officers: [],
    origin: []
  };
  var visible = Object.assign({}, DEFAULT_VISIBLE);
  var icons = {
    libraryId: "standard",
    category: Object.assign({}, DEFAULT_ICONS),
    pins: {}
  };
  var listId = "targets";
  var pendingIcon = "";
  var selectedId = "";
  var groups = {};
  var markersById = {};
  var fitted = false;
  var popupUrls = [];

  function byId(id) {
    return document.getElementById(id);
  }

  function loadJson(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (err) {
      return fallback;
    }
  }

  function saveJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (err) {}
  }

  function loadPrefs() {
    var layers = loadJson(LAYER_KEY, null);
    if (layers && layers.visible) {
      Object.keys(DEFAULT_VISIBLE).forEach(function (k) {
        if (typeof layers.visible[k] === "boolean") {
          visible[k] = layers.visible[k];
        }
      });
    }
    var stored = loadJson(ICON_KEY, null);
    if (stored && stored.category) {
      Object.keys(DEFAULT_ICONS).forEach(function (k) {
        if (stored.category[k]) {
          icons.category[k] = stored.category[k];
        }
      });
    }
    if (stored && stored.pins && typeof stored.pins === "object") {
      icons.pins = stored.pins;
    }
    var mapIcons = mapIconApi();
    if (mapIcons && typeof mapIcons.setLibrary === "function") {
      if (stored && stored.libraryId) {
        mapIcons.setLibrary(stored.libraryId, {
          persist: false,
          notify: false
        });
      }
      icons.libraryId =
        typeof mapIcons.getLibraryId === "function"
          ? mapIcons.getLibraryId()
          : "standard";
    }
  }

  function saveLayers() {
    saveJson(LAYER_KEY, { visible: visible });
  }

  function saveIcons() {
    var mapIcons = mapIconApi();
    if (mapIcons && typeof mapIcons.getLibraryId === "function") {
      icons.libraryId = mapIcons.getLibraryId();
    }
    saveJson(ICON_KEY, icons);
  }

  function committed(row) {
    return !row || !row.meta || row.meta.status !== "draft";
  }

  function formatAddress(location) {
    if (!location) {
      return "";
    }
    var line1 = [location.street, location.street2].filter(Boolean).join(" ");
    var line2 = [location.city, location.state, location.zip]
      .filter(Boolean)
      .join(" ");
    return [line1, line2].filter(Boolean).join(", ");
  }

  function hasCoords(lat, lng) {
    var a = Number(lat);
    var b = Number(lng);
    return isFinite(a) && isFinite(b) && !(a === 0 && b === 0);
  }

  function parseCoords(text) {
    var m = String(text || "").match(
      /(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/
    );
    if (!m) {
      return null;
    }
    if (!hasCoords(m[1], m[2])) {
      return null;
    }
    return { latitude: m[1], longitude: m[2] };
  }

  function associationLabel(code) {
    var labels = {
      residence: "Residence",
      home: "Home",
      work: "Work",
      "plate-check": "Plate check",
      registration: "Registration",
      "known-parking": "Known parking"
    };
    return labels[code] || code || "";
  }

  function priorityLabel(rank) {
    var n = Number(rank);
    if (n === 1) {
      return "Primary";
    }
    if (n === 2) {
      return "Secondary";
    }
    if (n === 3) {
      return "Tertiary";
    }
    return n ? String(n) : "";
  }

  function subjectFor(snapshot) {
    if (snapshot.person && snapshot.person.personId) {
      return snapshot.person;
    }
    return null;
  }

  function walkLeadLocations(snapshot) {
    var rows = [];
    var subject = subjectFor(snapshot);
    if (subject && subject.locations) {
      subject.locations.forEach(function (location) {
        rows.push({ location: location });
      });
    }
    (snapshot.vehicles || []).forEach(function (vehicle) {
      (vehicle.locations || []).forEach(function (location) {
        rows.push({
          location: location,
          plate: vehicle.licensePlate || "",
          vehicleId: vehicle.vehicleId || vehicle.id || "",
          extra: vehicleSummary(vehicle)
        });
      });
    });
    (snapshot.locations || []).forEach(function (location) {
      rows.push({ location: location });
    });
    return rows;
  }

  function personLabel(person) {
    if (root.model && root.model.formatPersonLabel) {
      return root.model.formatPersonLabel(person) || "Untitled";
    }
    return "Untitled";
  }

  function vehicleSummary(vehicle) {
    if (!vehicle) {
      return "";
    }
    return [vehicle.year, vehicle.make, vehicle.model, vehicle.licensePlate]
      .filter(Boolean)
      .join(" ");
  }

  function pushOwner(list, type, id) {
    var key = String(id || "").trim();
    if (!key) {
      return;
    }
    var i;
    for (i = 0; i < list.length; i++) {
      if (list[i].type === type && list[i].id === key) {
        return;
      }
    }
    list.push({ type: type, id: key });
  }

  function placePhotoOwners(locationId, vehicleId, origin) {
    var owners = [];
    if (origin) {
      pushOwner(owners, "VEHICLE", vehicleId);
      pushOwner(owners, "LOCATION", locationId);
    } else {
      pushOwner(owners, "LOCATION", locationId);
      pushOwner(owners, "VEHICLE", vehicleId);
    }
    return owners;
  }

  function popupPinFor(row) {
    var extraBits = [];
    if (row.extra) {
      extraBits.push(row.extra);
    }
    if (row.association && extraBits.indexOf(row.association) === -1) {
      extraBits.push(row.association);
    }
    return {
      title: row.subject || "",
      extra: extraBits.join(" · "),
      address: row.address && row.address !== "(no street)" ? row.address : "",
      occupancy: row.occupancy || "",
      isPrimary: row.category === "targets" && Number(row.priority) === 1,
      photoOwners: row.photoOwners || [],
      photoDataUrl: row.photoDataUrl || ""
    };
  }

  function revokePopupUrls() {
    if (root.mapPopup && root.mapPopup.revoke) {
      root.mapPopup.revoke(popupUrls);
    } else {
      popupUrls.forEach(function (url) {
        if (url && String(url).indexOf("blob:") === 0) {
          URL.revokeObjectURL(url);
        }
      });
    }
    popupUrls = [];
  }

  function collectLeads() {
    catalog.targets = [];
    catalog.arrests = [];
    catalog.origin = [];
    var model = root.model;
    if (!model || !model.store) {
      return;
    }
    model.store.loadFromDisk();
    var leads = (model.store.getState() || {}).leads || {};
    Object.keys(leads).forEach(function (leadId) {
      var snap = leads[leadId];
      if (!committed(snap)) {
        return;
      }
      var subject = subjectFor(snap);
      var name = personLabel(subject);
      var personId = (subject && (subject.personId || subject.id)) || "";
      walkLeadLocations(snap).forEach(function (row) {
        var loc = row.location;
        if (!loc) {
          return;
        }
        var assoc = loc.association || loc.locationAssociation || "";
        var vehicleId = row.vehicleId || "";
        var base = {
          leadId: leadId,
          personId: personId,
          locationId: loc.locationId || "",
          vehicleId: vehicleId,
          subject: name,
          extra: row.extra || row.plate || "",
          address: formatAddress(loc) || "(no street)",
          association: associationLabel(assoc),
          associationCode: assoc,
          latitude: loc.latitude,
          longitude: loc.longitude,
          hasCoords: hasCoords(loc.latitude, loc.longitude)
        };
        if (loc.targetPriority) {
          catalog.targets.push(
            Object.assign({}, base, {
              category: "targets",
              id: "targets:" + (loc.locationId || leadId),
              priority: Number(loc.targetPriority) || 99,
              priorityLabel: priorityLabel(loc.targetPriority),
              photoOwners: placePhotoOwners(loc.locationId, vehicleId, false),
              cols: [
                priorityLabel(loc.targetPriority),
                name,
                base.address,
                base.association
              ]
            })
          );
        }
        if (assoc === "plate-check") {
          catalog.origin.push(
            Object.assign({}, base, {
              category: "origin",
              id: "origin:" + (loc.locationId || leadId),
              photoOwners: placePhotoOwners(loc.locationId, vehicleId, true),
              cols: [name, base.address, base.association]
            })
          );
        }
      });
      (subject && subject.arrests ? subject.arrests : []).forEach(function (arr) {
        var parsed = parseCoords(arr.arrestLocation);
        var lat = arr.latitude || (parsed && parsed.latitude) || "";
        var lng = arr.longitude || (parsed && parsed.longitude) || "";
        var arrestOwners = [];
        pushOwner(arrestOwners, "PERSON", personId);
        catalog.arrests.push({
          category: "arrests",
          id: "arrests:" + (arr.arrestId || leadId),
          leadId: leadId,
          personId: personId,
          subject: name,
          extra: arr.arrestCharge || "",
          address: arr.arrestLocation || "(no location)",
          latitude: lat,
          longitude: lng,
          hasCoords: hasCoords(lat, lng),
          photoOwners: arrestOwners,
          cols: [
            arr.arrestDate || "—",
            name,
            arr.arrestCharge || "—",
            arr.arrestLocation || "(no location)"
          ]
        });
      });
    });
    catalog.targets.sort(function (a, b) {
      if (a.priority !== b.priority) {
        return a.priority - b.priority;
      }
      return String(a.subject).localeCompare(String(b.subject));
    });
  }

  function collectOfficers() {
    catalog.officers = [];
    var parsed = loadJson(ADMIN_KEY, { officers: [] });
    (parsed.officers || []).forEach(function (officer) {
      if (!committed(officer)) {
        return;
      }
      var locs = officer.locations || [];
      var home = null;
      locs.forEach(function (loc) {
        var assoc = loc.association || loc.locationAssociation || "";
        if (assoc === "residence" || assoc === "home") {
          home = loc;
        }
      });
      if (!home && officer.address) {
        var a =
          officer.address.association ||
          officer.address.locationAssociation ||
          "";
        if (a === "residence" || a === "home") {
          home = officer.address;
        }
      }
      if (!home) {
        return;
      }
      var name = [officer.lastName, officer.firstName].filter(Boolean).join(", ");
      if (officer.lastName && officer.firstName) {
        name = officer.lastName + ", " + officer.firstName;
      }
      var officerId = officer.officerId || officer.id || "";
      var officerOwners = [];
      pushOwner(officerOwners, "LOCATION", home.locationId);
      pushOwner(officerOwners, "OFFICER", officerId);
      catalog.officers.push({
        category: "officers",
        id: "officers:" + officerId,
        officerId: officerId,
        locationId: home.locationId || "",
        subject: name || "Officer",
        extra: officer.duty || "",
        address: formatAddress(home) || "(no street)",
        latitude: home.latitude,
        longitude: home.longitude,
        hasCoords: hasCoords(home.latitude, home.longitude),
        photoOwners: officerOwners,
        cols: [name || "Officer", formatAddress(home) || "(no street)", officer.duty || ""]
      });
    });
  }

  function iconNameFor(row) {
    var fallback = DEFAULT_ICONS[row && row.category] || "Location";
    var name =
      row && icons.pins[row.id]
        ? icons.pins[row.id]
        : icons.category[row && row.category] || fallback;
    var mapIcons = mapIconApi();
    if (mapIcons && typeof mapIcons.isKnown === "function") {
      return mapIcons.isKnown(name) ? name : fallback;
    }
    if (global.COPDoc && COPDoc.icons && COPDoc.icons.ICONS) {
      return COPDoc.icons.ICONS[name] ? name : fallback;
    }
    return name;
  }

  function mapIconApi() {
    return global.COPDoc && COPDoc.mapIcons ? COPDoc.mapIcons : null;
  }

  function iconHtml(name, size) {
    var mapIcons = mapIconApi();
    if (mapIcons && typeof mapIcons.html === "function") {
      return mapIcons.html(name, size);
    }
    return global.COPDoc && COPDoc.icon ? COPDoc.icon(name, size) : "";
  }

  function iconLabel(name) {
    var mapIcons = mapIconApi();
    if (mapIcons && typeof mapIcons.label === "function") {
      return mapIcons.label(name);
    }
    return String(name || "Location").replace(/([a-z])([A-Z])/g, "$1 $2");
  }

  function paletteEntries() {
    var mapIcons = mapIconApi();
    if (mapIcons && Array.isArray(mapIcons.entries) && mapIcons.entries.length) {
      return mapIcons.entries;
    }
    return LEGACY_PALETTE.map(function (name) {
      return {
        id: name,
        label: iconLabel(name),
        group: "Symbols",
        description: "Map symbol"
      };
    });
  }

  function pinHtml(row) {
    var name = iconNameFor(row);
    var badge = row.category === "targets" && row.priority ? row.priority : "";
    var mapIcons = mapIconApi();
    if (mapIcons && typeof mapIcons.badgeHtml === "function") {
      return mapIcons.badgeHtml(name, {
        color: CATEGORY_COLORS[row.category],
        primary: row.category === "targets" && String(row.priority) === "1",
        selected: row.id === selectedId,
        badge: badge
      });
    }
    return (
      '<span class="map-pin-glyph map-pin-' +
      row.category +
      '">' +
      iconHtml(name, 14) +
      (badge ? "<i>" + String(badge) + "</i>" : "") +
      "</span>"
    );
  }

  function markerIcon(row) {
    return global.L.divIcon({
      className: "map-pin",
      html: pinHtml(row),
      iconSize: [44, 44],
      iconAnchor: [22, 22]
    });
  }

  function ensureGroups() {
    if (!api.leaflet || !global.L) {
      return false;
    }
    ["targets", "arrests", "officers", "origin"].forEach(function (key) {
      if (!groups[key]) {
        groups[key] = global.L.layerGroup();
      }
    });
    return true;
  }

  function plotCategory(key) {
    if (!ensureGroups()) {
      return;
    }
    var group = groups[key];
    group.clearLayers();
    if (api.leaflet.hasLayer(group)) {
      api.leaflet.removeLayer(group);
    }
    if (!visible[key]) {
      return;
    }
    var bounds = [];
    catalog[key].forEach(function (row) {
      if (!row.hasCoords) {
        return;
      }
      var latlng = [Number(row.latitude), Number(row.longitude)];
      var markerTitle = MARKER_LABELS[row.category] || "Location";
      if (row.category === "targets" && row.priority) {
        markerTitle += ", priority " + row.priority;
      }
      var marker = global.L.marker(latlng, {
        icon: markerIcon(row),
        title:
          markerTitle +
          (row.subject ? " — " + row.subject : "") +
          (row.address ? " — " + row.address : "")
      });
      if (root.mapPopup && root.mapPopup.bind) {
        root.mapPopup.bind(marker, popupPinFor(row), popupUrls);
      } else {
        var popup = document.createElement("div");
        var nameEl = document.createElement("strong");
        nameEl.textContent = row.subject || "";
        popup.appendChild(nameEl);
        if (row.address) {
          popup.appendChild(document.createElement("br"));
          popup.appendChild(document.createTextNode(row.address));
        }
        if (row.association) {
          popup.appendChild(document.createElement("br"));
          popup.appendChild(document.createTextNode(row.association));
        }
        marker.bindPopup(popup);
      }
      marker.on("click", function () {
        listId = key;
        selectRow(row.id, false);
        renderList();
      });
      marker.addTo(group);
      markersById[row.id] = marker;
      bounds.push(latlng);
    });
    group.addTo(api.leaflet);
    return bounds;
  }

  function plotAll() {
    revokePopupUrls();
    markersById = {};
    var bounds = [];
    ["targets", "arrests", "officers", "origin"].forEach(function (key) {
      var part = plotCategory(key);
      if (part && part.length) {
        bounds = bounds.concat(part);
      }
    });
    if (!fitted && bounds.length && api.leaflet) {
      api.leaflet.fitBounds(bounds, { padding: [28, 28], maxZoom: 16 });
      fitted = true;
    }
    if (typeof api.syncMarkupVisibility === "function") {
      api.syncMarkupVisibility(visible.markup);
    }
    paintLegend();
  }

  function selectRow(id, fly) {
    selectedId = id || "";
    Object.keys(markersById).forEach(function (markerId) {
      var symbol =
        markersById[markerId] && markersById[markerId]._icon
          ? markersById[markerId]._icon.querySelector(".copdoc-map-symbol")
          : null;
      if (symbol) {
        symbol.classList.toggle("is-selected", markerId === selectedId);
      }
    });
    var body = byId("targetsTableBody");
    if (body) {
      Array.prototype.forEach.call(body.querySelectorAll("tr"), function (tr) {
        tr.classList.toggle("is-selected", tr.getAttribute("data-row-id") === selectedId);
      });
    }
    var marker = markersById[selectedId];
    if (marker && fly !== false && api.leaflet) {
      api.leaflet.flyTo(marker.getLatLng(), Math.max(api.leaflet.getZoom(), 14), {
        duration: 0.5
      });
      marker.openPopup();
    }
  }

  function renderHead() {
    var head = byId("mapListHead");
    if (!head) {
      return;
    }
    var tr = document.createElement("tr");
    (HEADERS[listId] || []).forEach(function (label) {
      var th = document.createElement("th");
      th.textContent = label;
      tr.appendChild(th);
    });
    head.replaceChildren(tr);
  }

  function currentRows() {
    if (listId === "markup" && typeof api.listMarkup === "function") {
      return api.listMarkup();
    }
    return catalog[listId] || [];
  }

  function renderList() {
    renderHead();
    var body = byId("targetsTableBody");
    var empty = byId("targetsEmpty");
    var rows = currentRows();
    paintLayerList();
    if (!body) {
      return;
    }
    body.replaceChildren();
    if (!rows.length) {
      if (empty) {
        empty.hidden = false;
        empty.textContent = EMPTY[listId] || "Nothing in this list.";
      }
      return;
    }
    if (empty) {
      empty.hidden = true;
    }
    rows.forEach(function (row) {
      var tr = document.createElement("tr");
      tr.setAttribute("data-row-id", row.id);
      if (row.hasCoords === false) {
        tr.classList.add("is-ungeocoded");
      }
      if (row.id === selectedId) {
        tr.classList.add("is-selected");
      }
      (row.cols || []).forEach(function (text) {
        var td = document.createElement("td");
        td.textContent = text;
        tr.appendChild(td);
      });
      tr.addEventListener("click", function () {
        if (pendingIcon && row.category && row.category !== "markup") {
          icons.pins[row.id] = pendingIcon;
          saveIcons();
          pendingIcon = "";
          paintPalette();
          plotAll();
          setHint("Icon assigned to this pin.");
        }
        selectedId = row.id;
        if (row.category === "markup" && typeof api.selectMarkup === "function") {
          api.selectMarkup(row.id);
        } else {
          selectRow(row.id, true);
        }
        renderList();
      });
      body.appendChild(tr);
    });
  }

  function paintPalette() {
    var host = byId("mapIconPalette");
    if (!host) {
      return;
    }
    if (global.COPDoc && COPDoc.icons && COPDoc.icons.inject) {
      COPDoc.icons.inject();
    }
    host.replaceChildren();
    var grouped = {};
    paletteEntries().forEach(function (entry) {
      var group = entry.group || "Symbols";
      grouped[group] = grouped[group] || [];
      grouped[group].push(entry);
    });
    Object.keys(grouped).forEach(function (groupName) {
      var group = document.createElement("section");
      group.className = "map-icon-group";
      group.setAttribute("aria-label", groupName);
      var title = document.createElement("p");
      title.className = "map-icon-group-title";
      title.textContent = groupName;
      group.appendChild(title);
      grouped[groupName].forEach(function (entry) {
        var name = entry.id;
        var label = entry.label || iconLabel(name);
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "map-icon-swatch";
        if (name === pendingIcon) {
          btn.classList.add("is-active");
        }
        btn.setAttribute(
          "title",
          label + (entry.description ? " — " + entry.description : "")
        );
        btn.setAttribute("aria-label", label);
        btn.innerHTML =
          iconHtml(name, 16) +
          '<span class="map-icon-swatch-label"></span>';
        btn.querySelector(".map-icon-swatch-label").textContent = label;
        btn.addEventListener("click", function () {
          pendingIcon = pendingIcon === name ? "" : name;
          paintPalette();
          setHint(
            pendingIcon
              ? label + " selected — click a layer or a row."
              : "Select an icon, then a layer or a row."
          );
        });
        group.appendChild(btn);
      });
      host.appendChild(group);
    });
  }

  function iconLibraries() {
    var mapIcons = mapIconApi();
    return mapIcons && Array.isArray(mapIcons.libraries)
      ? mapIcons.libraries
      : [];
  }

  function paintLibraryPicker() {
    var wrap = byId("mapIconLibraryPicker");
    var select = byId("mapIconLibrarySelect");
    var note = byId("mapIconLibraryDescription");
    var mapIcons = mapIconApi();
    var libraries = iconLibraries();
    if (!wrap || !select || !mapIcons || !libraries.length) {
      if (wrap) wrap.hidden = true;
      return;
    }
    wrap.hidden = false;
    select.replaceChildren();
    libraries.forEach(function (library) {
      var option = document.createElement("option");
      option.value = library.id;
      option.textContent = library.label;
      select.appendChild(option);
    });
    var active =
      typeof mapIcons.getLibraryId === "function"
        ? mapIcons.getLibraryId()
        : libraries[0].id;
    select.value = active;
    var selected = libraries.filter(function (library) {
      return library.id === active;
    })[0];
    if (note) {
      note.textContent = selected ? selected.description : "";
    }
  }

  function applyLibrary(libraryId) {
    var mapIcons = mapIconApi();
    if (!mapIcons || typeof mapIcons.setLibrary !== "function") return;
    icons.libraryId = mapIcons.setLibrary(libraryId, { notify: false });
    saveIcons();
    pendingIcon = "";
    paintLibraryPicker();
    paintPalette();
    plotAll();
    paintLayerList();
    renderList();
    paintLegend();
    var selected = iconLibraries().filter(function (library) {
      return library.id === icons.libraryId;
    })[0];
    setHint((selected ? selected.label : "Icon library") + " applied.");
  }

  function bindLibraryPicker() {
    var select = byId("mapIconLibrarySelect");
    if (!select || select.dataset.bound === "true") return;
    select.dataset.bound = "true";
    select.addEventListener("change", function () {
      applyLibrary(select.value);
    });
  }

  function setHint(text) {
    var el = byId("mapIconHint");
    if (el) {
      el.textContent = text;
    }
  }

  function paintLegend() {
    var el = byId("mapBriefLegend");
    if (!el) {
      return;
    }
    var parts = [];
    LAYER_ORDER.forEach(function (pair) {
      if (!visible[pair[0]]) {
        return;
      }
      var icon = "";
      var mapIcons = mapIconApi();
      if (
        pair[0] !== "markup" &&
        mapIcons &&
        typeof mapIcons.badgeHtml === "function"
      ) {
        icon = mapIcons.badgeHtml(
          icons.category[pair[0]] || DEFAULT_ICONS[pair[0]] || "Location",
          { size: "compact", color: CATEGORY_COLORS[pair[0]] }
        );
      } else if (pair[0] !== "markup") {
        icon = iconHtml(icons.category[pair[0]] || "MapPin", 14);
      }
      parts.push(
        '<span class="map-legend-item">' +
          icon +
          " " +
          pair[1] +
          " (" +
          layerCount(pair[0]) +
          ")</span>"
      );
    });
    var customSymbols = {};
    ["targets", "arrests", "officers", "origin"].forEach(function (key) {
      if (!visible[key]) {
        return;
      }
      (catalog[key] || []).forEach(function (row) {
        var custom = icons.pins[row.id];
        if (!custom || custom === icons.category[key]) {
          return;
        }
        var token = key + "\u0000" + custom;
        if (!customSymbols[token]) {
          customSymbols[token] = { key: key, name: custom, count: 0 };
        }
        customSymbols[token].count += 1;
      });
    });
    Object.keys(customSymbols).forEach(function (token) {
      var custom = customSymbols[token];
      var mapIcons = mapIconApi();
      var icon =
        mapIcons && typeof mapIcons.badgeHtml === "function"
          ? mapIcons.badgeHtml(custom.name, {
              size: "compact",
              color: CATEGORY_COLORS[custom.key]
            })
          : iconHtml(custom.name, 14);
      parts.push(
        '<span class="map-legend-item">' +
          icon +
          " " +
          iconLabel(custom.name) +
          " custom (" +
          custom.count +
          ")</span>"
      );
    });
    el.innerHTML = parts.join("");
  }

  function layerCount(key) {
    if (key === "markup" && typeof api.listMarkup === "function") {
      return (api.listMarkup() || []).length;
    }
    return (catalog[key] || []).length;
  }

  function assignCategoryIcon(key) {
    if (!pendingIcon || !DEFAULT_ICONS[key]) {
      return false;
    }
    icons.category[key] = pendingIcon;
    saveIcons();
    pendingIcon = "";
    paintPalette();
    setHint("Default icon set for " + key + ".");
    return true;
  }

  function showList(key) {
    var assigned = assignCategoryIcon(key);
    var turnedOn = !visible[key];
    listId = key;
    if (turnedOn) {
      visible[key] = true;
      saveLayers();
    }
    if (assigned || turnedOn) {
      plotAll();
    }
    renderList();
  }

  function toggleLayer(key) {
    visible[key] = !visible[key];
    saveLayers();
    plotAll();
    paintLayerList();
  }

  function paintLayerList() {
    var host = byId("mapLayerList");
    if (!host) {
      return;
    }
    if (global.COPDoc && COPDoc.icons && COPDoc.icons.inject) {
      COPDoc.icons.inject();
    }
    host.replaceChildren();
    LAYER_ORDER.forEach(function (pair) {
      var key = pair[0];
      var label = pair[1];
      var row = document.createElement("div");
      row.className = "map-layer-row";
      row.setAttribute("role", "listitem");
      row.setAttribute("data-layer", key);
      if (listId === key) {
        row.classList.add("is-active");
      }
      if (!visible[key]) {
        row.classList.add("is-off");
      }

      var eye = document.createElement("button");
      eye.type = "button";
      eye.className = "map-layer-eye";
      eye.setAttribute("aria-pressed", visible[key] ? "true" : "false");
      eye.setAttribute(
        "title",
        (visible[key] ? "Hide " : "Show ") + label
      );
      eye.setAttribute("aria-label", (visible[key] ? "Hide " : "Show ") + label);
      eye.innerHTML =
        global.COPDoc && COPDoc.icon
          ? COPDoc.icon(visible[key] ? "Eye" : "EyeOff", 14)
          : visible[key]
            ? "on"
            : "off";
      eye.addEventListener("click", function (event) {
        event.stopPropagation();
        toggleLayer(key);
      });

      var iconBtn = document.createElement("button");
      iconBtn.type = "button";
      iconBtn.className = "map-layer-icon";
      if (DEFAULT_ICONS[key]) {
        iconBtn.setAttribute("title", "Assign icon to " + label);
        iconBtn.setAttribute("aria-label", "Icon for " + label);
        iconBtn.innerHTML = iconHtml(
          icons.category[key] || DEFAULT_ICONS[key],
          14
        );
        iconBtn.addEventListener("click", function (event) {
          event.stopPropagation();
          if (assignCategoryIcon(key)) {
            plotAll();
            paintLayerList();
            return;
          }
          showList(key);
        });
      } else {
        iconBtn.disabled = true;
        iconBtn.setAttribute("aria-hidden", "true");
        iconBtn.tabIndex = -1;
      }

      var nameBtn = document.createElement("button");
      nameBtn.type = "button";
      nameBtn.className = "map-layer-name";
      nameBtn.textContent = label;
      nameBtn.addEventListener("click", function () {
        showList(key);
      });

      var count = document.createElement("span");
      count.className = "map-layer-count";
      count.textContent = String(layerCount(key));

      row.appendChild(eye);
      row.appendChild(iconBtn);
      row.appendChild(nameBtn);
      row.appendChild(count);
      host.appendChild(row);
    });
  }

  function refresh() {
    collectLeads();
    collectOfficers();
    api.catalog = catalog;
    plotAll();
    renderList();
  }

  function bindDock() {
    var shell = document.querySelector(".map-shell");
    var toggle = byId("mapDockToggle");
    if (!shell || !toggle || toggle.dataset.bound === "true") {
      return;
    }
    toggle.dataset.bound = "true";
    toggle.addEventListener("click", function () {
      var collapsed = shell.classList.toggle("is-dock-collapsed");
      toggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
      if (api.resize) {
        global.setTimeout(api.resize, 0);
      }
    });
  }

  function init() {
    if (!byId("mapDock") && !document.querySelector(".map-shell")) {
      return;
    }
    loadPrefs();
    bindDock();
    bindLibraryPicker();
    paintLibraryPicker();
    paintPalette();
    refresh();
  }

  api.listTargets = function () {
    return catalog.targets;
  };
  api.refreshTargets = refresh;
  api.selectTarget = function (id) {
    selectRow(id, true);
  };
  api.layerVisible = function (key) {
    return !!visible[key];
  };
  api.refreshLocationLists = refresh;

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", init);
    } else {
      init();
    }
  }
})(typeof window !== "undefined" ? window : globalThis);
