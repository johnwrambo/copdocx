/**
 * Per-card Leaflet pin for location cards. Not the planning map
 * (COPDoc.map.leaflet). Drag the pin or click the map to correct coords.
 */
(function (global) {
  "use strict";

  var root = (global.COPDoc = global.COPDoc || {});
  var PIN_ZOOM = 17;
  var BASEMAP_KEY = "copdocx.location-map.basemap";
  var BASEMAPS = [
    { id: "map", label: "Map" },
    { id: "satellite", label: "Sat" },
    { id: "hybrid", label: "Hyb" }
  ];
  var KIND_COLORS = {
    home: "#55c7bd",
    work: "#d4a017",
    vehicle: "#5b8def",
    parking: "#8b6bb8"
  };

  var VEHICLE_COLOR_HEX = {
    BLK: "#1c1c1c",
    WHI: "#f5f5f5",
    SIL: "#c5c8ce",
    GRY: "#6b7280",
    RED: "#c62828",
    BLU: "#1565c0",
    GRN: "#2e7d32",
    BRO: "#6d4c41",
    GLD: "#c9a227",
    YEL: "#f9a825",
    ONG: "#ef6c00",
    MAR: "#7b1e3a",
    TAN: "#c4a574",
    BGE: "#d4c4a8",
    PLE: "#6a1b9a",
    PNK: "#d81b60",
    TEA: "#00897b",
    TRQ: "#00acc1",
    CRM: "#f5e6c8",
    IVO: "#f8f4e8",
    BRZ: "#b87333",
    CPR: "#b87333",
    CAM: "#4a5d23",
    CHR: "#d8d8d8",
    DBL: "#0d47a1",
    DGR: "#1b5e20",
    LBL: "#90caf9",
    LGR: "#a5d6a7",
    LAV: "#ce93d8",
    MUL: "",
    UNK: "",
    OTH: ""
  };

  var VEHICLE_COLOR_LABELS = {
    black: "BLK",
    white: "WHI",
    silver: "SIL",
    gray: "GRY",
    grey: "GRY",
    red: "RED",
    blue: "BLU",
    green: "GRN",
    brown: "BRO",
    gold: "GLD",
    yellow: "YEL",
    orange: "ONG",
    maroon: "MAR",
    tan: "TAN",
    beige: "BGE",
    purple: "PLE",
    pink: "PNK",
    teal: "TEA",
    turquoise: "TRQ",
    cream: "CRM",
    ivory: "IVO",
    bronze: "BRZ",
    copper: "CPR",
    camouflage: "CAM",
    chrome: "CHR",
    "dark blue": "DBL",
    "dark green": "DGR",
    "light blue": "LBL",
    "light green": "LGR",
    lavender: "LAV"
  };

  var KIND_SVG = {
    home:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 3.1 2.8 10.8V21h6.4v-6.2h5.6V21h6.4V10.8z"/></svg>',
    work:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M4 21V4.8h10.2V9H20V21H4zm3.2-9.2h2.1V14H7.2v-2.2zm0 3.8h2.1v2.1H7.2V15.6zm4.2-3.8h2.1V14h-2.1v-2.2zm0 3.8h2.1v2.1h-2.1V15.6zm5.4-1.4h2.1v2.1h-2.1V14.2z"/></svg>',
    vehicle:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M5.1 16.2 4 11.8 6.3 6.8h11.4L20 11.8l-1.1 4.4h-1.2a2.4 2.4 0 0 1-4.7 0h-2a2.4 2.4 0 0 1-4.7 0H5.1zM7.4 8.6l-1 2.8h11.2l-1-2.8H7.4z"/></svg>',
    parking:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M6.2 3.5h8.1c2.9 0 5.2 2.1 5.2 5.3 0 3.3-2.3 5.4-5.4 5.4H9.6V20.5H6.2V3.5zm3.4 3.1v4.5h4.2c1.4 0 2.2-.9 2.2-2.2 0-1.4-.8-2.3-2.2-2.3H9.6z"/></svg>'
  };

  function safeKind(kind) {
    var key = String(kind || "").toLowerCase();
    if (KIND_COLORS[key]) {
      return key;
    }
    return "home";
  }

  function safeHex(value) {
    var text = String(value || "").trim();
    if (/^#[0-9a-fA-F]{6}$/.test(text)) {
      return text.toLowerCase();
    }
    if (/^#[0-9a-fA-F]{3}$/.test(text)) {
      return (
        "#" +
        text.charAt(1) +
        text.charAt(1) +
        text.charAt(2) +
        text.charAt(2) +
        text.charAt(3) +
        text.charAt(3)
      ).toLowerCase();
    }
    return "";
  }

  function hexLuminance(hex) {
    var color = safeHex(hex);
    if (!color) {
      return 0;
    }
    var n = parseInt(color.slice(1), 16);
    var r = (n >> 16) & 255;
    var g = (n >> 8) & 255;
    var b = n & 255;
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  }

  function vehicleColorHex(value) {
    var key = String(value || "").trim();
    if (!key) {
      return "";
    }
    var hex = safeHex(key);
    if (hex) {
      return hex;
    }
    var upper = key.toUpperCase();
    if (VEHICLE_COLOR_HEX[upper]) {
      return VEHICLE_COLOR_HEX[upper];
    }
    var fromLabel = VEHICLE_COLOR_LABELS[key.toLowerCase()];
    if (fromLabel && VEHICLE_COLOR_HEX[fromLabel]) {
      return VEHICLE_COLOR_HEX[fromLabel];
    }
    var label = key.toLowerCase();
    var list =
      typeof VEHICLE_COLORS !== "undefined" && Array.isArray(VEHICLE_COLORS)
        ? VEHICLE_COLORS
        : [];
    var i;
    for (i = 0; i < list.length; i++) {
      if (
        list[i] &&
        String(list[i].label || "").toLowerCase() === label &&
        VEHICLE_COLOR_HEX[list[i].code]
      ) {
        return VEHICLE_COLOR_HEX[list[i].code];
      }
    }
    return "";
  }

  function pinColorFor(kind, options) {
    options = options || {};
    var custom = safeHex(options.pinColor);
    if (custom) {
      return custom;
    }
    var key = safeKind(kind);
    if (key === "vehicle" || key === "parking") {
      var vehicle = vehicleColorHex(options.vehicleColor);
      if (vehicle) {
        return vehicle;
      }
    }
    return KIND_COLORS[key] || KIND_COLORS.home;
  }

  function pinIcon(kind, isPrimary, color) {
    var key = safeKind(kind);
    var hex = safeHex(color) || KIND_COLORS[key];
    var size = isPrimary ? 30 : 24;
    var light = hexLuminance(hex) > 0.72;
    return global.L.divIcon({
      className: "case-map-pin",
      html:
        '<span class="case-map-pin-icon is-' +
        key +
        (isPrimary ? " is-primary" : "") +
        (light ? " is-light" : "") +
        '" style="color:' +
        hex +
        '">' +
        (KIND_SVG[key] || KIND_SVG.home) +
        "</span>",
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2]
    });
  }

  function field(card, name) {
    return card.querySelector('[data-field="' + name + '"]');
  }

  function hostOf(card) {
    return card.querySelector("[data-location-map]");
  }

  function hintOf(card) {
    return card.querySelector("[data-location-map-hint]");
  }

  function coordsOf(card) {
    var latEl = field(card, "latitude");
    var lngEl = field(card, "longitude");
    var lat = parseFloat(latEl && latEl.value);
    var lng = parseFloat(lngEl && lngEl.value);
    if (!isFinite(lat) || !isFinite(lng)) {
      return null;
    }
    return [lat, lng];
  }

  function pairText(lat, lng) {
    if (typeof global.formatLatLongPair === "function") {
      return global.formatLatLongPair(lat, lng);
    }
    return Number(lat).toFixed(6) + ", " + Number(lng).toFixed(6);
  }

  function writeCoords(card, lat, lng) {
    var latEl = field(card, "latitude");
    var lngEl = field(card, "longitude");
    var pair = field(card, "latLong");
    if (latEl) {
      latEl.value = String(lat);
    }
    if (lngEl) {
      lngEl.value = String(lng);
    }
    if (pair) {
      pair.value = pairText(lat, lng);
      pair.classList.remove("is-invalid");
      pair.removeAttribute("aria-invalid");
    }
  }

  function showHint(card, on) {
    var hint = hintOf(card);
    if (hint) {
      hint.hidden = !on;
    }
  }

  function parsePair(lat, lng) {
    var y = parseFloat(lat);
    var x = parseFloat(lng);
    if (!isFinite(y) || !isFinite(x)) {
      return null;
    }
    return [y, x];
  }

  function rememberedBasemap() {
    try {
      var name = localStorage.getItem(BASEMAP_KEY) || "map";
      if (name === "satellite" || name === "hybrid" || name === "map") {
        return name;
      }
    } catch (error) {}
    return "map";
  }

  function rememberBasemap(name) {
    try {
      localStorage.setItem(BASEMAP_KEY, name);
    } catch (error) {}
  }

  function makeLayers(L) {
    return {
      streets: L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      }),
      imagery: L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        {
          maxZoom: 19,
          attribution: "Tiles &copy; Esri"
        }
      ),
      labels: L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
        {
          maxZoom: 19,
          attribution: "Tiles &copy; Esri",
          pane: "overlayPane"
        }
      ),
      roads: L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}",
        {
          maxZoom: 19,
          attribution: "Tiles &copy; Esri",
          pane: "overlayPane"
        }
      )
    };
  }

  function applyBasemap(state, name) {
    if (!state || !state.map || !state.layers) {
      return "map";
    }
    var layers = state.layers;
    [layers.streets, layers.imagery, layers.labels, layers.roads].forEach(
      function (layer) {
        if (state.map.hasLayer(layer)) {
          state.map.removeLayer(layer);
        }
      }
    );
    if (name === "satellite") {
      layers.imagery.addTo(state.map);
    } else if (name === "hybrid") {
      layers.imagery.addTo(state.map);
      layers.roads.addTo(state.map);
      layers.labels.addTo(state.map);
    } else {
      name = "map";
      layers.streets.addTo(state.map);
    }
    state.basemap = name;
    rememberBasemap(name);
    if (state.toolbar) {
      state.toolbar.querySelectorAll("[data-basemap]").forEach(function (button) {
        var on = button.getAttribute("data-basemap") === name;
        button.classList.toggle("is-active", on);
        button.setAttribute("aria-pressed", on ? "true" : "false");
      });
    }
    return name;
  }

  function bindToolbar(state) {
    if (!state || !state.host || state.toolbar) {
      return;
    }
    var parent = state.host.parentNode;
    if (!parent) {
      return;
    }
    if (!parent.classList.contains("location-map-frame")) {
      var frame = document.createElement("div");
      frame.className = "location-map-frame";
      parent.insertBefore(frame, state.host);
      frame.appendChild(state.host);
      parent = frame;
    }
    var bar = document.createElement("div");
    bar.className = "location-map-basemap";
    bar.setAttribute("role", "group");
    bar.setAttribute("aria-label", "Basemap");
    BASEMAPS.forEach(function (item) {
      var button = document.createElement("button");
      button.type = "button";
      button.setAttribute("data-basemap", item.id);
      button.textContent = item.label;
      button.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();
        document.querySelectorAll("[data-location-map]").forEach(function (node) {
          if (node._locationMap) {
            applyBasemap(node._locationMap, item.id);
          }
        });
      });
      bar.appendChild(button);
    });
    parent.insertBefore(bar, state.host);
    state.toolbar = bar;
  }

  function sizeFrame(host) {
    if (!host) {
      return;
    }
    var width = host.clientWidth;
    if (width) {
      host.style.height = Math.round((width * 3) / 4) + "px";
    }
  }

  function invalidate(state) {
    if (!state || !state.map) {
      return;
    }
    sizeFrame(state.host);
    global.setTimeout(function () {
      sizeFrame(state.host);
      state.map.invalidateSize();
    }, 0);
  }

  function ensureHostMap(host, options) {
    options = options || {};
    if (!global.L || !host) {
      return null;
    }
    if (host._locationMap && host._locationMap.map) {
      host.hidden = false;
      return host._locationMap;
    }
    host.hidden = false;
    var start = options.latlng || [31, -99.9];
    var zoom = options.latlng ? PIN_ZOOM : 6;
    var map = global.L.map(host, {
      zoomControl: true,
      attributionControl: true
    }).setView(start, zoom);
    host.addEventListener("contextmenu", function (event) {
      event.preventDefault();
    });
    var state = {
      map: map,
      layers: makeLayers(global.L),
      marker: null,
      markers: [],
      host: host,
      card: options.card || null,
      readonly: !!options.readonly,
      basemap: rememberedBasemap()
    };
    host._locationMap = state;
    if (state.card) {
      state.card._locationMap = state;
    }
    bindToolbar(state);
    applyBasemap(state, state.basemap);
    if (!state.readonly) {
      map.on("click", function (event) {
        if (state.card) {
          place(state.card, event.latlng.lat, event.latlng.lng, true);
        }
      });
    }
    invalidate(state);
    return state;
  }

  function setPin(state, lat, lng) {
    if (!state) {
      return;
    }
    var latlng = [Number(lat), Number(lng)];
    if (!state.marker) {
      state.marker = global.L.marker(latlng, {
        draggable: !state.readonly
      }).addTo(state.map);
      if (!state.readonly) {
        state.marker.on("dragend", function () {
          var point = state.marker.getLatLng();
          if (state.card) {
            writeCoords(state.card, point.lat, point.lng);
          }
        });
      }
    } else {
      state.marker.setLatLng(latlng);
    }
    var zoom = state.map.getZoom();
    state.map.setView(latlng, zoom < PIN_ZOOM ? PIN_ZOOM : zoom);
    invalidate(state);
  }

  function place(card, lat, lng, fromUser) {
    var pair = parsePair(lat, lng);
    var host = hostOf(card);
    var state = host
      ? ensureHostMap(host, { card: card, latlng: pair || undefined })
      : null;
    if (!state) {
      if (fromUser && pair) {
        writeCoords(card, pair[0], pair[1]);
      }
      return;
    }
    if (pair) {
      writeCoords(card, pair[0], pair[1]);
      showHint(card, true);
      setPin(state, pair[0], pair[1]);
    }
  }

  function display(host, lat, lng) {
    var pair = parsePair(lat, lng);
    if (!host || !pair) {
      return null;
    }
    var state = ensureHostMap(host, { readonly: true, latlng: pair });
    setPin(state, pair[0], pair[1]);
    return state;
  }

  function clearMarkers(state) {
    if (!state || !state.map) {
      return;
    }
    if (state.marker) {
      state.map.removeLayer(state.marker);
      state.marker = null;
    }
    (state.markers || []).forEach(function (marker) {
      state.map.removeLayer(marker);
    });
    state.markers = [];
  }

  function popupNode(title, meta) {
    var wrap = document.createElement("div");
    if (title) {
      var strong = document.createElement("strong");
      strong.textContent = title;
      wrap.appendChild(strong);
    }
    if (meta) {
      var line = document.createElement("div");
      line.textContent = meta;
      wrap.appendChild(line);
    }
    return wrap;
  }

  function displayMany(host, points) {
    var pins = [];
    (points || []).forEach(function (point) {
      if (!point) {
        return;
      }
      var pair = parsePair(point.lat, point.lng);
      if (!pair) {
        return;
      }
      pins.push({
        latlng: pair,
        title: point.title || "",
        meta: point.meta || "",
        kind: safeKind(point.kind),
        isPrimary: !!point.isPrimary,
        color: pinColorFor(point.kind, point),
        id: point.id || ""
      });
    });
    if (!host || !pins.length) {
      if (host) {
        host.hidden = true;
      }
      return null;
    }
    host.hidden = false;
    var state = ensureHostMap(host, {
      readonly: true,
      latlng: pins[0].latlng
    });
    if (!state) {
      return null;
    }
    clearMarkers(state);
    pins.forEach(function (pin) {
      var marker = global.L.marker(pin.latlng, {
        draggable: false,
        icon: pinIcon(pin.kind, pin.isPrimary, pin.color)
      }).addTo(state.map);
      if (pin.title || pin.meta) {
        marker.bindPopup(popupNode(pin.title, pin.meta));
      }
      marker._placeId = pin.id;
      state.markers.push(marker);
    });
    if (pins.length === 1) {
      state.map.setView(pins[0].latlng, PIN_ZOOM);
    } else {
      state.map.fitBounds(
        pins.map(function (pin) {
          return pin.latlng;
        }),
        { padding: [28, 28], maxZoom: PIN_ZOOM }
      );
    }
    invalidate(state);
    return state;
  }

  function focus(host, placeId) {
    var state = host && host._locationMap;
    if (!state || !state.markers) {
      return;
    }
    var marker = state.markers.filter(function (row) {
      return row._placeId === placeId;
    })[0];
    if (!marker) {
      return;
    }
    state.map.setView(marker.getLatLng(), Math.max(state.map.getZoom(), PIN_ZOOM));
    if (marker.openPopup) {
      marker.openPopup();
    }
  }

  function sync(card) {
    if (!card || card.closest("template")) {
      return;
    }
    var pair = coordsOf(card);
    if (!pair) {
      var host = hostOf(card);
      if (host && !card._locationMap) {
        host.hidden = true;
        showHint(card, false);
      }
      return;
    }
    place(card, pair[0], pair[1], false);
  }

  function bind(card) {
    if (!card || card.closest("template")) {
      return;
    }
    if (card.dataset.locationMapBound === "true") {
      sync(card);
      return;
    }
    card.dataset.locationMapBound = "true";
    var pair = field(card, "latLong");
    if (pair) {
      pair.addEventListener("blur", function () {
        sync(card);
      });
    }
    sync(card);
  }

  function resize(el) {
    if (!el) {
      return;
    }
    var state = el._locationMap;
    if (!state && el.querySelector) {
      var host = el.querySelector("[data-location-map]");
      state = host && host._locationMap;
    }
    if (state && state.map) {
      state.map.invalidateSize();
    }
  }

  root.locationMap = {
    bind: bind,
    sync: sync,
    show: place,
    display: display,
    displayMany: displayMany,
    focus: focus,
    resize: resize,
    kindIconHtml: function (kind) {
      var key = safeKind(kind);
      return KIND_SVG[key] || KIND_SVG.home;
    },
    safeKind: safeKind,
    pinColorFor: pinColorFor,
    vehicleColorHex: vehicleColorHex,
    safeHex: safeHex
  };

  document.addEventListener("click", function (event) {
    var toggle =
      event.target && event.target.closest
        ? event.target.closest(".card-toggle, .card-chevron")
        : null;
    if (!toggle) {
      return;
    }
    var card = toggle.closest("fieldset");
    global.setTimeout(function () {
      resize(card);
    }, 50);
  });
})(typeof window !== "undefined" ? window : globalThis);
