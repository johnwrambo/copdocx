/**
 * Planning markup: labels, arrows, brief/print view.
 * Markup persists in copdocx.map.markup.v1. Print receipts use the shared
 * document history; neither workflow writes leads/admin/book-in.
 */
(function (global) {
  "use strict";

  var root = (global.COPDoc = global.COPDoc || {});
  var api = (root.map = root.map || {});
  var STORAGE_KEY = root.repositories.viewState.schemas.mapMarkup;

  var state = { labels: [], arrows: [] };
  var mode = "";
  var arrowStart = null;
  var layers = {};
  var selectedId = "";
  var printingBrief = false;

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
      var parsed = root.repositories.viewState.loadMapMarkup();
      if (parsed === undefined) {
        return;
      }
      state.labels = Array.isArray(parsed.labels) ? parsed.labels : [];
      state.arrows = Array.isArray(parsed.arrows) ? parsed.arrows : [];
    } catch (err) {
      state.labels = [];
      state.arrows = [];
    }
  }

  function saveState() {
    try {
      root.repositories.viewState.saveMapMarkup(state);
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

  function escapeBriefAttribute(value) {
    return String(value == null ? "" : value).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function waitBriefImages(host) {
    return Promise.all(Array.prototype.map.call(host.querySelectorAll("img"), function (image) {
      if (!image.getAttribute("src")) return Promise.resolve();
      if (image.complete) {
        return image.naturalWidth > 0 ? Promise.resolve() : Promise.reject(new Error("A map image could not be loaded. Let the map finish loading and try again."));
      }
      return new Promise(function (resolve, reject) {
        var timer;
        function finish(error) {
          global.clearTimeout(timer);
          image.removeEventListener("load", loaded);
          image.removeEventListener("error", failed);
          if (error) reject(error); else resolve();
        }
        function loaded() { finish(image.naturalWidth > 0 ? null : new Error("A map image could not be loaded.")); }
        function failed() { finish(new Error("A map image could not be loaded. Let the map finish loading and try again.")); }
        image.addEventListener("load", loaded);
        image.addEventListener("error", failed);
        timer = global.setTimeout(function () { finish(new Error("Map images are still loading. Wait for the map and try printing again.")); }, 10000);
      });
    }));
  }

  function captureMapBriefContext() {
    var documents = root.documents;
    if (!documents || !documents.captureContext || !documents.generate || !documents.recordDelivery) {
      throw new Error("Document generation is not available. Reload the map and try again.");
    }
    var mapElement = byId("map"), legend = byId("mapBriefLegend");
    if (!mapElement || !api.leaflet) throw new Error("The map is not ready to print.");
    var bounds = mapElement.getBoundingClientRect();
    var width = Math.ceil(bounds.width), height = Math.ceil(bounds.height);
    if (!(width > 0 && height > 0)) throw new Error("The map has no printable viewport. Expand it before printing.");
    var mapClone = mapElement.cloneNode(true);
    var sourceCanvases = mapElement.querySelectorAll("canvas");
    var clonedCanvases = mapClone.querySelectorAll("canvas");
    Array.prototype.forEach.call(sourceCanvases, function (canvas, index) {
      var captured = clonedCanvases[index], image = document.createElement("img"), png;
      try {
        png = canvas.toDataURL("image/png");
        if (!/^data:image\/png;base64,/.test(png)) throw new Error("Canvas capture did not return a PNG.");
      } catch (error) {
        throw new Error("A canvas map layer could not be captured. Reload its imagery before printing.");
      }
      Array.prototype.forEach.call(captured.attributes, function (attribute) { image.setAttribute(attribute.name, attribute.value); });
      // Leaflet positions canvases with tag-specific rules which no longer
      // match the replacement image. Preserve the computed geometry as well
      // as inline transforms and the canvas's backing-pixel dimensions.
      if (typeof global.getComputedStyle === "function") {
        var computed = global.getComputedStyle(canvas);
        var geometry = ["position", "display", "left", "top", "right", "bottom", "width", "height", "transform", "transform-origin", "opacity", "z-index", "margin"].map(function (property) {
          var value = computed.getPropertyValue(property);
          return value ? property + ":" + value : "";
        }).filter(Boolean).join(";");
        image.setAttribute("style", (image.getAttribute("style") || "") + ";" + geometry);
      }
      image.width = canvas.width;
      image.height = canvas.height;
      image.src = png;
      captured.replaceWith(image);
    });
    mapClone.style.width = width + "px";
    mapClone.style.height = height + "px";
    var legendHtml = "";
    if (legend) {
      var legendClone = legend.cloneNode(true);
      legendClone.hidden = false;
      legendHtml = legendClone.outerHTML;
    }
    // Copy presentation only. The frame has no scripts or live Leaflet instance,
    // so later panning, filters, popup changes, and markup edits cannot alter it.
    var styles = Array.prototype.map.call(document.querySelectorAll('link[rel="stylesheet"], style'), function (element) {
      var copy = element.cloneNode(true);
      if (String(copy.tagName).toLowerCase() === "link") copy.setAttribute("href", element.href);
      return copy.outerHTML;
    }).join("\n");
    var scale = Math.min(1, 1046 / width, 710 / height);
    var printStyle = "@page{size:A4 landscape;margin:10mm;}html,body{margin:0!important;padding:0!important;height:auto!important;overflow:visible!important;}" +
      "#mapBriefPage{position:relative;width:" + Math.ceil(width * scale) + "px;height:" + Math.ceil(height * scale) + "px;overflow:hidden;}" +
      "#mapBriefSnapshot{position:relative;width:" + width + "px;height:" + height + "px;transform:scale(" + scale + ");transform-origin:top left;}" +
      "body #map{position:relative;margin:0!important;width:" + width + "px!important;height:" + height + "px!important;min-height:0!important;overflow:hidden!important;}" +
      "body #mapBriefLegend{position:absolute;left:16px;bottom:16px;margin:0;}" +
      ".leaflet-control-zoom{display:none!important;}*{-webkit-print-color-adjust:exact;print-color-adjust:exact;}";
    var html = '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><base href="' + escapeBriefAttribute(document.baseURI || global.location.href) + '">' +
      '<title>Map brief</title>' + styles + '<style>' + printStyle + '</style></head><body data-page="map" class="map-brief-mode">' +
      '<div id="mapBriefPage"><div id="mapBriefSnapshot">' + mapClone.outerHTML + legendHtml + '</div></div></body></html>';
    var keys = ["targets", "arrests", "arrestHeat", "encounters", "officers", "origin", "markup"];
    var visible = {};
    keys.forEach(function (key) { visible[key] = !api.layerVisible || api.layerVisible(key); });
    var rows = [];
    Object.keys(api.catalog || {}).forEach(function (key) {
      if (!visible[key] || !Array.isArray(api.catalog[key])) return;
      api.catalog[key].forEach(function (row) {
        if (row && (!api.rowVisible || api.rowVisible(row.id))) rows.push(row);
      });
    });
    var sources = [{ type: "MAP_VIEW", id: "current", revision: null, authority: "snapshot" },
      { type: "MAP_MARKUP", id: STORAGE_KEY, revision: null, authority: "snapshot" }];
    var seen = {};
    rows.forEach(function (row) {
      ["lead", "person", "encounter", "officer", "location", "vehicle", "arrest"].forEach(function (type) {
        var id = row[type + "Id"];
        var key = type + ":" + id;
        if (id && !seen[key]) {
          seen[key] = true;
          sources.push({ type: type.toUpperCase(), id: String(id), revision: null, authority: "snapshot" });
        }
      });
    });
    var center = api.leaflet.getCenter();
    return documents.captureContext({
      documentType: "map-brief.print", generatingOfficerId: null, sources: sources,
      input: {
        html: html, styles: styles + "\n" + printStyle,
        map: { center: { lat: center.lat, lng: center.lng }, zoom: api.leaflet.getZoom(), basemap: api.basemap || "map", width: width, height: height,
          layers: visible, visualFilters: api.getVisualFilters ? api.getVisualFilters() : [], iconSize: api.getIconSize ? api.getIconSize() : null },
        markup: state, rows: rows,
        tiles: Array.prototype.map.call(mapClone.querySelectorAll("img"), function (image) { return { url: image.currentSrc || image.src || image.getAttribute("src") || "" }; })
      }
    });
  }

  function renderMapBrief(context) {
    return { data: context.input.html, mimeType: "text/html", filename: "map-brief.html" };
  }

  async function printCapturedMapBrief(artifact, context) {
    var frame = document.createElement("iframe");
    frame.setAttribute("title", "Captured map brief");
    frame.setAttribute("aria-hidden", "true");
    frame.setAttribute("sandbox", "allow-same-origin allow-modals");
    frame.style.cssText = "position:fixed;left:-100000px;top:0;border:0;width:" + context.input.map.width + "px;height:" + context.input.map.height + "px;";
    var loaded = new Promise(function (resolve, reject) {
      var timer = global.setTimeout(function () { reject(new Error("The captured map brief did not finish loading.")); }, 10000);
      frame.onload = function () { global.clearTimeout(timer); resolve(); };
      frame.onerror = function () { global.clearTimeout(timer); reject(new Error("The captured map brief could not be loaded.")); };
    });
    frame.srcdoc = artifact.data;
    document.body.appendChild(frame);
    try {
      await loaded;
      var target = frame.contentDocument;
      if (!target || !frame.contentWindow || typeof frame.contentWindow.print !== "function") throw new Error("Printing is unavailable for this captured map brief.");
      Array.prototype.forEach.call(target.querySelectorAll('link[rel="stylesheet"]'), function (link) {
        if (!link.sheet) throw new Error("A map print stylesheet could not be loaded. Reload the page before printing.");
      });
      await waitBriefImages(target);
      var cleanupTimer, cleaned = false;
      function cleanup() { if (cleaned) return; cleaned = true; global.clearTimeout(cleanupTimer); frame.remove(); }
      frame.contentWindow.addEventListener("afterprint", cleanup, { once: true });
      frame.contentWindow.focus();
      frame.contentWindow.print();
      if (!cleaned) cleanupTimer = global.setTimeout(cleanup, 60000);
    } catch (error) {
      frame.remove();
      throw error;
    }
  }

  async function printBrief() {
    if (printingBrief) return;
    printingBrief = true;
    var generated = null, submitted = false;
    try {
      setBrief(true);
      setStatus("Preparing a map brief snapshot...");
      await new Promise(function (resolve) { global.setTimeout(resolve, 200); });
      if (api.leaflet && typeof api.leaflet.stop === "function") api.leaflet.stop();
      var mapElement = byId("map");
      if (!mapElement) throw new Error("The map is not ready to print.");
      await waitBriefImages(mapElement);
      var context = captureMapBriefContext();
      generated = await root.documents.generate({ documentType: "map-brief.print", context: context, templateContent: context.input.styles, render: renderMapBrief });
      await printCapturedMapBrief(generated.artifact, context);
      submitted = true;
      try {
        await root.documents.recordDelivery(generated.record.generationId, { method: "print", status: "SUBMITTED" });
      } catch (receiptError) {
        setStatus("The captured map brief was sent to print, but its delivery receipt could not be saved.");
        return;
      }
      setStatus("The captured map brief was sent to print.", true);
    } catch (error) {
      if (generated && !submitted) {
        try { await root.documents.recordDelivery(generated.record.generationId, { method: "print", status: "FAILED" }); } catch (receiptError) { /* Preserve the actual print error. */ }
      }
      setStatus("Map brief was not printed: " + (error && error.message ? error.message : "Print failed."));
    } finally {
      printingBrief = false;
    }
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
