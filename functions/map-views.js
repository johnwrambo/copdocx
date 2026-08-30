/**
 * Home view + named presets for Maps and Planning.
 *
 * Set home: pan/zoom to the view you want, then click Set home.
 *   Saves the current center + zoom immediately.
 * Save preset: click Save preset, pan/zoom, right-click to name it.
 *
 * Home and presets live in localStorage (copdocx.map.views.v1)
 * so they survive a close/reopen. Not part of a lead snapshot.
 */
(function (global) {
  "use strict";

  var root = (global.COPDoc = global.COPDoc || {});
  var api = (root.map = root.map || {});
  var STORAGE_KEY = "copdocx.map.views.v1";
  var MAX_PRESETS = 12;

  api.setMode = null;

  function factoryView() {
    var center = api.DEFAULT_CENTER || [31.0, -99.9];
    return {
      lat: center[0],
      lng: center[1],
      zoom: api.DEFAULT_ZOOM || 6
    };
  }

  function emptyState() {
    return { home: null, presets: [] };
  }

  function loadState() {
    if (typeof localStorage === "undefined") {
      return emptyState();
    }
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return emptyState();
      }
      var parsed = JSON.parse(raw);
      return {
        home: isView(parsed.home) ? parsed.home : null,
        presets: Array.isArray(parsed.presets)
          ? parsed.presets.filter(isPreset)
          : []
      };
    } catch (err) {
      return emptyState();
    }
  }

  function saveState(state) {
    if (typeof localStorage === "undefined") {
      return;
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (err) {
      showHint("Could not save the view (storage blocked).", false);
    }
  }

  function isView(value) {
    return (
      value &&
      isFinite(Number(value.lat)) &&
      isFinite(Number(value.lng)) &&
      isFinite(Number(value.zoom))
    );
  }

  function isPreset(value) {
    return isView(value) && String(value.id || "") && String(value.name || "");
  }

  function clampZoom(zoom) {
    var n = Number(zoom);
    if (!isFinite(n)) {
      return api.DEFAULT_ZOOM;
    }
    if (n < 2) {
      return 2;
    }
    if (n > 19) {
      return 19;
    }
    return n;
  }

  function viewFromLatLng(latlng, zoom) {
    return {
      lat: Number(latlng.lat),
      lng: Number(latlng.lng),
      zoom: clampZoom(zoom)
    };
  }

  function newPresetId() {
    return (
      "pv_" +
      Date.now().toString(36) +
      "_" +
      Math.random().toString(36).slice(2, 6)
    );
  }

  function getHomeView() {
    var home = loadState().home;
    return home || factoryView();
  }

  function flyToView(view) {
    if (!api.leaflet || !isView(view)) {
      return;
    }
    api.leaflet.flyTo([view.lat, view.lng], clampZoom(view.zoom), {
      duration: 0.7
    });
  }

  function byId(id) {
    return document.getElementById(id);
  }

  function showHint(message, isMode) {
    var el = byId("mapViewHint");
    if (!el) {
      return;
    }
    if (!message) {
      el.hidden = true;
      el.textContent = "";
      el.classList.remove("is-mode");
      return;
    }
    el.hidden = false;
    el.textContent = message;
    el.classList.toggle("is-mode", !!isMode);
  }

  function syncSetButtons() {
    var homeBtn = byId("mapSetHomeButton");
    var presetBtn = byId("mapSavePresetButton");
    if (homeBtn) {
      homeBtn.classList.toggle("is-active", api.setMode === "home");
    }
    if (presetBtn) {
      presetBtn.classList.toggle("is-active", api.setMode === "preset");
    }
    var mapEl = document.getElementById("map");
    if (mapEl) {
      mapEl.classList.toggle("is-setting-view", !!api.setMode);
    }
  }

  function fillPresetSelect() {
    var select = byId("mapPresetSelect");
    if (!select) {
      return;
    }
    var current = select.value;
    var presets = loadState().presets;
    select.replaceChildren();
    var placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = presets.length ? "Presets" : "No presets yet";
    select.appendChild(placeholder);
    presets.forEach(function (preset) {
      var option = document.createElement("option");
      option.value = preset.id;
      option.textContent = preset.name;
      select.appendChild(option);
    });
    var still = Array.prototype.some.call(select.options, function (option) {
      return option.value === current;
    });
    if (still) {
      select.value = current;
    }
  }

  function cancelSetMode() {
    api.setMode = null;
    syncSetButtons();
    showHint("");
  }

  function armSetMode(mode) {
    if (api.setMode === mode) {
      cancelSetMode();
      return;
    }
    api.setMode = mode;
    syncSetButtons();
    if (mode === "home") {
      showHint(
        "Pan and zoom, then right-click the point that should be Home. Esc to cancel.",
        true
      );
    } else {
      showHint(
        "Pan and zoom, then right-click to save a preset. Esc to cancel.",
        true
      );
    }
  }

  function commitSetView(latlng) {
    if (!api.setMode || !api.leaflet) {
      return;
    }
    var view = viewFromLatLng(latlng, api.leaflet.getZoom());
    var state = loadState();
    if (api.setMode === "home") {
      state.home = view;
      saveState(state);
      cancelSetMode();
      showHint("Home view saved.");
      global.setTimeout(function () {
        if (api.setMode) {
          return;
        }
        showHint("");
      }, 2200);
      return;
    }

    if (state.presets.length >= MAX_PRESETS) {
      cancelSetMode();
      showHint("Preset limit reached (" + MAX_PRESETS + "). Delete one first.");
      return;
    }
    var name = global.prompt(
      "Name this preset view:",
      "Preset " + (state.presets.length + 1)
    );
    if (name == null) {
      cancelSetMode();
      return;
    }
    name = String(name).trim();
    if (!name) {
      cancelSetMode();
      showHint("Preset not saved (no name).");
      return;
    }
    var preset = {
      id: newPresetId(),
      name: name,
      lat: view.lat,
      lng: view.lng,
      zoom: view.zoom
    };
    state.presets.push(preset);
    saveState(state);
    fillPresetSelect();
    var select = byId("mapPresetSelect");
    if (select) {
      select.value = preset.id;
    }
    cancelSetMode();
    showHint("Saved preset “" + name + "”.");
    global.setTimeout(function () {
      if (api.setMode) {
        return;
      }
      showHint("");
    }, 2200);
  }

  function currentView() {
    if (!api.leaflet) {
      return null;
    }
    return viewFromLatLng(api.leaflet.getCenter(), api.leaflet.getZoom());
  }

  function flashHint(message) {
    showHint(message);
    global.setTimeout(function () {
      if (api.setMode) {
        return;
      }
      showHint("");
    }, 2200);
  }

  function setHomeFromCurrent() {
    cancelSetMode();
    var view = currentView();
    if (!view) {
      showHint("Map is not ready.");
      return;
    }
    var state = loadState();
    state.home = view;
    saveState(state);
    flashHint("Home view saved.");
  }

  function goHome() {
    cancelSetMode();
    flyToView(getHomeView());
  }

  function goPreset(id) {
    if (!id) {
      return;
    }
    var match = loadState().presets.filter(function (preset) {
      return preset.id === id;
    })[0];
    if (match) {
      cancelSetMode();
      flyToView(match);
    }
  }

  function deleteSelectedPreset() {
    var select = byId("mapPresetSelect");
    var id = select ? select.value : "";
    if (!id) {
      showHint("Pick a preset to delete.");
      return;
    }
    var state = loadState();
    var doomed = state.presets.filter(function (preset) {
      return preset.id === id;
    })[0];
    if (!doomed) {
      return;
    }
    var ok = global.confirm('Delete preset “' + doomed.name + '”?');
    if (!ok) {
      return;
    }
    state.presets = state.presets.filter(function (preset) {
      return preset.id !== id;
    });
    saveState(state);
    fillPresetSelect();
    showHint("Preset deleted.");
  }

  function bind() {
    var homeBtn = byId("mapHomeButton");
    var setHomeBtn = byId("mapSetHomeButton");
    var savePresetBtn = byId("mapSavePresetButton");
    var deletePresetBtn = byId("mapDeletePresetButton");
    var select = byId("mapPresetSelect");

    if (homeBtn) {
      homeBtn.addEventListener("click", goHome);
    }
    if (setHomeBtn) {
      setHomeBtn.addEventListener("click", setHomeFromCurrent);
    }
    if (savePresetBtn) {
      savePresetBtn.addEventListener("click", function () {
        armSetMode("preset");
      });
    }
    if (deletePresetBtn) {
      deletePresetBtn.addEventListener("click", deleteSelectedPreset);
    }
    if (select) {
      select.addEventListener("change", function () {
        goPreset(select.value);
      });
    }

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && api.setMode) {
        cancelSetMode();
      }
    });

    fillPresetSelect();
  }

  api.getHomeView = getHomeView;
  api.goHome = goHome;
  api.STORAGE_KEY_VIEWS = STORAGE_KEY;
  api.onMapReady = function onMapReady(map) {
    map.on("contextmenu", function (event) {
      if (!api.setMode) {
        return;
      }
      if (event.originalEvent) {
        event.originalEvent.preventDefault();
      }
      commitSetView(event.latlng);
    });
  };

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", bind);
    } else {
      bind();
    }
  }
})(typeof window !== "undefined" ? window : globalThis);
