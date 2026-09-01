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
  var PALETTE = [
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
    targets: "Crosshair",
    arrests: "Shield",
    officers: "MapPinned",
    origin: "MapPin"
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
    arrests: "No arrest locations on committed leads.",
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
    category: Object.assign({}, DEFAULT_ICONS),
    pins: {}
  };
  var listId = "targets";
  var pendingIcon = "";
  var selectedId = "";
  var groups = {};
  var markersById = {};
  var fitted = false;

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
  }

  function saveLayers() {
    saveJson(LAYER_KEY, { visible: visible });
  }

  function saveIcons() {
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
        rows.push({ location: location, plate: vehicle.licensePlate || "" });
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
      walkLeadLocations(snap).forEach(function (row) {
        var loc = row.location;
        if (!loc) {
          return;
        }
        var assoc = loc.association || loc.locationAssociation || "";
        var base = {
          leadId: leadId,
          locationId: loc.locationId || "",
          subject: name,
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
              cols: [name, base.address, base.association]
            })
          );
        }
      });
      (subject && subject.arrests ? subject.arrests : []).forEach(function (arr) {
        var parsed = parseCoords(arr.arrestLocation);
        var lat = arr.latitude || (parsed && parsed.latitude) || "";
        var lng = arr.longitude || (parsed && parsed.longitude) || "";
        catalog.arrests.push({
          category: "arrests",
          id: "arrests:" + (arr.arrestId || leadId),
          leadId: leadId,
          subject: name,
          address: arr.arrestLocation || "(no location)",
          latitude: lat,
          longitude: lng,
          hasCoords: hasCoords(lat, lng),
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
      catalog.officers.push({
        category: "officers",
        id: "officers:" + (officer.officerId || officer.id),
        subject: name || "Officer",
        address: formatAddress(home) || "(no street)",
        latitude: home.latitude,
        longitude: home.longitude,
        hasCoords: hasCoords(home.latitude, home.longitude),
        cols: [name || "Officer", formatAddress(home) || "(no street)", officer.duty || ""]
      });
    });
  }

  function iconNameFor(row) {
    if (row && icons.pins[row.id]) {
      return icons.pins[row.id];
    }
    return icons.category[row.category] || DEFAULT_ICONS[row.category] || "MapPin";
  }

  function pinHtml(row) {
    var name = iconNameFor(row);
    var glyph =
      global.COPDoc && COPDoc.icon ? COPDoc.icon(name, 14) : "";
    var badge = "";
    if (row.category === "targets" && row.priority) {
      badge = "<i>" + String(row.priority) + "</i>";
    }
    return (
      '<span class="map-pin-glyph map-pin-' +
      row.category +
      '">' +
      glyph +
      badge +
      "</span>"
    );
  }

  function markerIcon(row) {
    return global.L.divIcon({
      className: "map-pin",
      html: pinHtml(row),
      iconSize: [28, 28],
      iconAnchor: [14, 14]
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
      var marker = global.L.marker(latlng, {
        icon: markerIcon(row),
        title: row.subject + " — " + row.address
      });
      var popup = document.createElement("div");
      var name = document.createElement("strong");
      name.textContent = row.subject || "";
      popup.appendChild(name);
      if (row.address) {
        popup.appendChild(document.createElement("br"));
        popup.appendChild(document.createTextNode(row.address));
      }
      if (row.association) {
        popup.appendChild(document.createElement("br"));
        popup.appendChild(document.createTextNode(row.association));
      }
      marker.bindPopup(popup);
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
    PALETTE.forEach(function (name) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "map-icon-swatch";
      if (name === pendingIcon) {
        btn.classList.add("is-active");
      }
      btn.setAttribute("title", name);
      btn.setAttribute("aria-label", name);
      btn.innerHTML = global.COPDoc && COPDoc.icon ? COPDoc.icon(name, 16) : name;
      btn.addEventListener("click", function () {
        pendingIcon = pendingIcon === name ? "" : name;
        paintPalette();
        setHint(
          pendingIcon
            ? pendingIcon + " selected — click a layer or a row."
            : "Select an icon, then a layer or a row."
        );
      });
      host.appendChild(btn);
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
      if (pair[0] !== "markup" && global.COPDoc && COPDoc.icon) {
        icon = COPDoc.icon(icons.category[pair[0]] || "MapPin", 14);
      }
      parts.push(
        '<span class="map-legend-item">' + icon + " " + pair[1] + "</span>"
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
        iconBtn.innerHTML =
          global.COPDoc && COPDoc.icon
            ? COPDoc.icon(icons.category[key] || DEFAULT_ICONS[key], 14)
            : icons.category[key] || DEFAULT_ICONS[key];
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
