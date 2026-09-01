/**
 * Planning markup: labels, arrows, brief/print view.
 * Persist copdocx.map.markup.v1 only. Does not write leads/admin/book-in.
 */
(function (global) {
  "use strict";

  var root = (global.COPDoc = global.COPDoc || {});
  var api = (root.map = root.map || {});
  var STORAGE_KEY = "copdocx.map.markup.v1";

  var state = { labels: [], arrows: [] };
  var mode = "";
  var arrowStart = null;
  var layers = {};
  var selectedId = "";

  function byId(id) {
    return document.getElementById(id);
  }

  function newId(prefix) {
    var model = root.model;
    if (model && model.newId) {
      return model.newId(prefix);
    }
    return prefix + "_" + Date.now().toString(36);
  }

  function setStatus(message, ok) {
    if (root.setAppBarStatus) {
      root.setAppBarStatus(message, ok ? { ok: true } : undefined);
    }
  }

  function loadState() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return;
      }
      var parsed = JSON.parse(raw);
      state.labels = Array.isArray(parsed.labels) ? parsed.labels : [];
      state.arrows = Array.isArray(parsed.arrows) ? parsed.arrows : [];
    } catch (err) {
      state.labels = [];
      state.arrows = [];
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (err) {
      setStatus("Could not save markup.");
    }
  }

  function showHint(text, isMode) {
    var el = byId("mapViewHint");
    if (!el) {
      return;
    }
    if (!text) {
      el.hidden = true;
      el.textContent = "";
      el.classList.remove("is-mode");
      return;
    }
    el.hidden = false;
    el.textContent = text;
    el.classList.toggle("is-mode", !!isMode);
  }

  function syncModeButtons() {
    ["mapMarkupLabel", "mapMarkupArrow", "mapMarkupDelete"].forEach(function (id) {
      var el = byId(id);
      if (!el) {
        return;
      }
      var on =
        (id === "mapMarkupLabel" && mode === "label") ||
        (id === "mapMarkupArrow" && mode === "arrow") ||
        (id === "mapMarkupDelete" && mode === "delete");
      el.classList.toggle("is-active", on);
    });
    var mapEl = byId("map");
    if (mapEl) {
      mapEl.classList.toggle("is-setting-view", !!mode);
    }
  }

  function setMode(next) {
    mode = mode === next ? "" : next;
    arrowStart = null;
    syncModeButtons();
    if (mode === "label") {
      showHint("Click the map to place a label. Esc to cancel.", true);
    } else if (mode === "arrow") {
      showHint("Click start, then end, to draw an arrow. Esc to cancel.", true);
    } else if (mode === "delete") {
      showHint("Click a label or arrow to delete it. Esc to cancel.", true);
    } else {
      showHint("");
    }
  }

  function bearing(from, to) {
    var dy = to[0] - from[0];
    var dx = to[1] - from[1];
    return (Math.atan2(dx, dy) * 180) / Math.PI;
  }

  function labelIcon(text) {
    var safe = String(text || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/"/g, "&quot;");
    return global.L.divIcon({
      className: "map-label",
      html: "<span>" + safe + "</span>",
      iconSize: null,
      iconAnchor: [0, 0]
    });
  }

  function arrowHeadIcon(deg) {
    return global.L.divIcon({
      className: "map-arrow-wrap",
      html:
        '<span class="map-arrow-head" style="transform:rotate(' +
        Math.round(deg) +
        'deg)"></span>',
      iconSize: [16, 16],
      iconAnchor: [8, 8]
    });
  }

  function clearDrawn() {
    Object.keys(layers).forEach(function (id) {
      var group = layers[id];
      if (group && api.leaflet) {
        api.leaflet.removeLayer(group);
      }
    });
    layers = {};
  }

  function drawAll() {
    if (!api.leaflet || !global.L) {
      return;
    }
    clearDrawn();
    var visible = !api.layerVisible || api.layerVisible("markup");
    state.labels.forEach(function (row) {
      var marker = global.L.marker([row.lat, row.lng], {
        icon: labelIcon(row.text),
        draggable: true,
        title: row.text
      });
      marker.on("click", function (event) {
        global.L.DomEvent.stopPropagation(event);
        if (mode === "delete") {
          removeMarkup(row.id);
          return;
        }
        selectedId = row.id;
      });
      marker.on("dragend", function () {
        var ll = marker.getLatLng();
        row.lat = ll.lat;
        row.lng = ll.lng;
        saveState();
      });
      layers[row.id] = marker;
      if (visible) {
        marker.addTo(api.leaflet);
      }
    });
    state.arrows.forEach(function (row) {
      var group = global.L.layerGroup();
      var line = global.L.polyline([row.from, row.to], {
        color: "#71d7ce",
        weight: 3
      });
      var head = global.L.marker(row.to, {
        icon: arrowHeadIcon(bearing(row.from, row.to)),
        interactive: false
      });
      line.on("click", function (event) {
        global.L.DomEvent.stopPropagation(event);
        if (mode === "delete") {
          removeMarkup(row.id);
        }
      });
      line.addTo(group);
      head.addTo(group);
      layers[row.id] = group;
      if (visible) {
        group.addTo(api.leaflet);
      }
    });
    if (typeof api.refreshLocationLists === "function" && selectedId) {
      /* list refresh happens from caller */
    }
  }

  function listMarkup() {
    var rows = [];
    state.labels.forEach(function (row) {
      rows.push({
        category: "markup",
        id: row.id,
        cols: ["Label", row.text]
      });
    });
    state.arrows.forEach(function (row) {
      rows.push({
        category: "markup",
        id: row.id,
        cols: ["Arrow", "Route"]
      });
    });
    return rows;
  }

  function removeMarkup(id) {
    state.labels = state.labels.filter(function (row) {
      return row.id !== id;
    });
    state.arrows = state.arrows.filter(function (row) {
      return row.id !== id;
    });
    saveState();
    drawAll();
    if (typeof api.refreshLocationLists === "function") {
      api.refreshLocationLists();
    }
    setStatus("Markup deleted.", true);
  }

  function onMapClick(event) {
    if (api.setMode) {
      return;
    }
    var ll = event.latlng;
    if (mode === "label") {
      var text = global.prompt("Label text:", "");
      if (text == null) {
        return;
      }
      text = String(text).trim();
      if (!text) {
        return;
      }
      state.labels.push({
        id: newId("lbl"),
        lat: ll.lat,
        lng: ll.lng,
        text: text
      });
      saveState();
      setMode("");
      drawAll();
      setStatus("Label added.", true);
      return;
    }
    if (mode === "arrow") {
      if (!arrowStart) {
        arrowStart = [ll.lat, ll.lng];
        showHint("Click the arrow tip.", true);
        return;
      }
      state.arrows.push({
        id: newId("arw"),
        from: arrowStart,
        to: [ll.lat, ll.lng]
      });
      arrowStart = null;
      saveState();
      setMode("");
      drawAll();
      setStatus("Arrow added.", true);
    }
  }

  function setBrief(on) {
    document.body.classList.toggle("map-brief-mode", !!on);
    var legend = byId("mapBriefLegend");
    var exit = byId("mapBriefExit");
    if (legend) {
      legend.hidden = !on;
    }
    if (exit) {
      exit.hidden = !on;
    }
    if (api.resize) {
      global.setTimeout(api.resize, 80);
    }
  }

  function printBrief() {
    setBrief(true);
    global.setTimeout(function () {
      global.print();
    }, 200);
  }

  function bindMap(map) {
    map.on("click", onMapClick);
    drawAll();
  }

  function bindUi() {
    var labelBtn = byId("mapMarkupLabel");
    var arrowBtn = byId("mapMarkupArrow");
    var deleteBtn = byId("mapMarkupDelete");
    var printBtn = byId("mapPrintBriefButton") || byId("appBarPrimaryAction");
    var exitBtn = byId("mapBriefExit");
    if (labelBtn) {
      labelBtn.addEventListener("click", function () {
        setMode("label");
      });
    }
    if (arrowBtn) {
      arrowBtn.addEventListener("click", function () {
        setMode("arrow");
      });
    }
    if (deleteBtn) {
      deleteBtn.addEventListener("click", function () {
        setMode("delete");
      });
    }
    document.addEventListener("click", function (event) {
      var target = event.target && event.target.closest
        ? event.target.closest("#mapBriefButton")
        : null;
      if (target) {
        setBrief(!document.body.classList.contains("map-brief-mode"));
      }
    });
    if (printBtn && !printBtn.dataset.chromeCall) {
      printBtn.addEventListener("click", printBrief);
    }
    if (exitBtn) {
      exitBtn.addEventListener("click", function () {
        setBrief(false);
      });
    }
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && mode) {
        setMode("");
      }
    });
  }

  api.listMarkup = listMarkup;
  api.selectMarkup = function (id) {
    selectedId = id;
  };
  api.syncMarkupVisibility = function (on) {
    if (!api.leaflet) {
      return;
    }
    Object.keys(layers).forEach(function (id) {
      var layer = layers[id];
      if (!layer) {
        return;
      }
      if (on && !api.leaflet.hasLayer(layer)) {
        layer.addTo(api.leaflet);
      }
      if (!on && api.leaflet.hasLayer(layer)) {
        api.leaflet.removeLayer(layer);
      }
    });
  };
  global.printMapBrief = printBrief;

  var prevReady = api.onMapReady;
  api.onMapReady = function (map) {
    if (typeof prevReady === "function") {
      prevReady(map);
    }
    bindMap(map);
  };

  loadState();
  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", bindUi);
    } else {
      bindUi();
    }
  }
  if (api.leaflet) {
    bindMap(api.leaflet);
  }
})(typeof window !== "undefined" ? window : globalThis);
