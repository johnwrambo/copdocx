/**
 * Leaflet map for Maps and Planning (map.html).
 *
 * The live map object is COPDoc.map.leaflet.
 * Basemap: COPDoc.map.setBasemap("map" | "satellite" | "hybrid").
 *
 * Map = OpenStreetMap. Satellite / hybrid = Esri World Imagery
 * (hybrid adds place names and roads). No API key.
 */
(function (global) {
  "use strict";

  var root = (global.COPDoc = global.COPDoc || {});
  var api = (root.map = root.map || {});

  // Approximate geographic center of Texas.
  api.DEFAULT_CENTER = [31.0, -99.9];
  api.DEFAULT_ZOOM = 6;
  api.basemap = "map";

  function makeLayers(L) {
    var streets = L.tileLayer(
      "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      {
        maxZoom: 19,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      }
    );
    var imagery = L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      {
        maxZoom: 19,
        attribution: "Tiles &copy; Esri"
      }
    );
    var labels = L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
      {
        maxZoom: 19,
        attribution: "Tiles &copy; Esri",
        pane: "overlayPane"
      }
    );
    var roads = L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}",
      {
        maxZoom: 19,
        attribution: "Tiles &copy; Esri",
        pane: "overlayPane"
      }
    );
    return {
      streets: streets,
      imagery: imagery,
      labels: labels,
      roads: roads
    };
  }

  function allBasemapLayers(layers) {
    return [layers.streets, layers.imagery, layers.labels, layers.roads];
  }

  function applyBasemap(map, layers, name) {
    allBasemapLayers(layers).forEach(function (layer) {
      if (map.hasLayer(layer)) {
        map.removeLayer(layer);
      }
    });
    if (name === "satellite") {
      layers.imagery.addTo(map);
    } else if (name === "hybrid") {
      layers.imagery.addTo(map);
      layers.roads.addTo(map);
      layers.labels.addTo(map);
    } else {
      name = "map";
      layers.streets.addTo(map);
    }
    api.basemap = name;
    syncBasemapButtons(name);
    return name;
  }

  function syncBasemapButtons(name) {
    var buttons = document.querySelectorAll("[data-basemap]");
    Array.prototype.forEach.call(buttons, function (button) {
      var on = button.getAttribute("data-basemap") === name;
      button.classList.toggle("is-active", on);
      button.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  function bindToolbar() {
    var toolbar = document.querySelector(".map-basemap");
    if (!toolbar || toolbar.dataset.bound === "true") {
      return;
    }
    toolbar.dataset.bound = "true";
    toolbar.addEventListener("click", function (event) {
      var button = event.target.closest("[data-basemap]");
      if (!button) {
        return;
      }
      api.setBasemap(button.getAttribute("data-basemap"));
    });
  }

  function init(element) {
    if (api.leaflet) {
      return api.leaflet;
    }
    if (!global.L) {
      return null;
    }
    var el = element || document.getElementById("map");
    if (!el) {
      return null;
    }

    var start =
      typeof api.getHomeView === "function" ? api.getHomeView() : null;
    var map = global.L.map(el, {
      zoomControl: true,
      attributionControl: true
    }).setView(
      start ? [start.lat, start.lng] : api.DEFAULT_CENTER,
      start ? start.zoom : api.DEFAULT_ZOOM
    );

    // Kill the browser "div / save image / inspect" menu on the map.
    // Right-click is reserved for a planning menu later.
    el.addEventListener("contextmenu", function (event) {
      event.preventDefault();
    });
    map.on("contextmenu", function (event) {
      if (event.originalEvent) {
        event.originalEvent.preventDefault();
      }
    });

    var layers = makeLayers(global.L);
    api.layers = layers;
    applyBasemap(map, layers, "map");
    bindToolbar();

    function resize() {
      map.invalidateSize();
    }
    global.setTimeout(resize, 0);
    global.addEventListener("resize", resize);

    api.leaflet = map;
    api.resize = resize;
    if (typeof api.onMapReady === "function") {
      api.onMapReady(map);
    }
    return map;
  }

  api.setBasemap = function setBasemap(name) {
    if (!api.leaflet || !api.layers) {
      api.basemap = name;
      return name;
    }
    return applyBasemap(api.leaflet, api.layers, name);
  };

  api.init = init;

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", function () {
        init();
      });
    } else {
      init();
    }
  }
})(typeof window !== "undefined" ? window : globalThis);
