/** Persisted map views, temporary editors, and geocode cache. No UI effects. */
(function (global) {
  "use strict";
  var root = (global.COPDoc = global.COPDoc || {});
  var repositories = (root.repositories = root.repositories || {});
  var stores = {
    mapLayers: ["localStorage", "copdocx.map.layers.v1"],
    mapIcons: ["localStorage", "copdocx.map.icons.v1"],
    mapViews: ["localStorage", "copdocx.map.views.v1"],
    mapMarkup: ["localStorage", "copdocx.map.markup.v1"],
    mapBasemap: ["localStorage", "copdocx.location-map.basemap"],
    investigationWindows: ["sessionStorage", "copdocx.investigation-windows.v1"],
    geocodeCache: ["sessionStorage", "addrGeoCache_v1"],
    fileUploadLab: ["localStorage", "copdocx.file-upload.v1"],
    photoPickerLab: ["localStorage", "copdocx.photo-picker.v1"]
  };

  function entry(id) {
    var configured = root.config && root.config.storageEntry && root.config.storageEntry(id);
    return configured || { medium: stores[id][0], key: stores[id][1] };
  }
  function read(id) {
    var store = entry(id);
    return repositories.storage.read(store.medium, store.key);
  }
  function write(id, raw) {
    var store = entry(id);
    return repositories.storage.write(store.medium, store.key, raw);
  }
  function loadJson(id) {
    var raw = read(id);
    return raw ? JSON.parse(raw) : undefined;
  }
  function saveJson(id, value) {
    return write(id, JSON.stringify(value));
  }
  function getGeocode(query) {
    var raw = read("geocodeCache");
    if (!raw) return null;
    return JSON.parse(raw)[query] || null;
  }
  function putGeocode(query, geo) {
    var cache = JSON.parse(read("geocodeCache") || "{}");
    cache[query] = geo;
    var keys = Object.keys(cache);
    if (keys.length > 25) delete cache[keys[0]];
    return saveJson("geocodeCache", cache);
  }
  function saveDemoFiles(files, selectedId, maxBytes) {
    var persistable = files.map(function (row) {
      if (row.bytes && row.bytes > maxBytes) {
        var slim = Object.assign({}, row);
        slim.dataUrl = "";
        slim.sessionOnly = true;
        return slim;
      }
      return row;
    });
    return saveJson("fileUploadLab", {
      schema: entry("fileUploadLab").key, files: persistable, selectedId: selectedId
    });
  }

  repositories.viewState = Object.freeze({
    loadMapLayers: function () { return loadJson("mapLayers"); },
    saveMapLayers: function (value) { return saveJson("mapLayers", value); },
    loadMapIcons: function () { return loadJson("mapIcons"); },
    saveMapIcons: function (value) { return saveJson("mapIcons", value); },
    saveMapIconLibrary: function (id) {
      var stored = loadJson("mapIcons") || {};
      if (typeof stored !== "object" || Array.isArray(stored)) stored = {};
      stored.libraryId = id;
      return saveJson("mapIcons", stored);
    },
    loadMapViews: function () { return loadJson("mapViews"); },
    saveMapViews: function (value) {
      if (!repositories.storage.has(entry("mapViews").medium)) return;
      return saveJson("mapViews", value);
    },
    loadMapMarkup: function () { return loadJson("mapMarkup"); },
    saveMapMarkup: function (value) { return saveJson("mapMarkup", value); },
    loadBasemap: function () { return read("mapBasemap"); },
    saveBasemap: function (value) { return write("mapBasemap", value); },
    loadInvestigationWindows: function () { return loadJson("investigationWindows"); },
    saveInvestigationWindows: function (value) { return saveJson("investigationWindows", value); },
    getGeocode: getGeocode,
    putGeocode: putGeocode,
    loadDemoFiles: function () { return loadJson("fileUploadLab"); },
    saveDemoFiles: saveDemoFiles,
    loadDemoPhotos: function () { return loadJson("photoPickerLab"); },
    saveDemoPhotos: function (photos, selectedId) {
      return saveJson("photoPickerLab", { schema: entry("photoPickerLab").key, photos: photos, selectedId: selectedId });
    },
    schemas: Object.freeze({
      mapViews: stores.mapViews[1], mapMarkup: stores.mapMarkup[1],
      demoFiles: stores.fileUploadLab[1], demoPhotos: stores.photoPickerLab[1]
    })
  });
})(typeof window !== "undefined" ? window : globalThis);
