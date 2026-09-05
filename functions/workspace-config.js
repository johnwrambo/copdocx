/**
 * Product release and persistence registry.
 *
 * Keep the stores separate. This catalog only names them and records which
 * workspace data belongs in portable exports.
 */
(function (global) {
  "use strict";

  var root = (global.COPDoc = global.COPDoc || {});
  var entries = [
    { id: "workspace", key: "copdocx.store.v1", medium: "localStorage", owner: "model/store", portable: true },
    { id: "admin", key: "copdoc.admin.v1", medium: "localStorage", owner: "admin", portable: true },
    { id: "bookin", key: "alien-book-in.saved-records.v1", medium: "localStorage", owner: "book-in", portable: true },
    { id: "bookinColumns", key: "alien-book-in.saved-record-columns.v1", medium: "localStorage", owner: "book-in", portable: false },
    { id: "settings", key: "copdocx.settings.v1", medium: "localStorage", owner: "settings", portable: true },
    { id: "importDoneSignal", key: "copdocx.import.done.v1", medium: "localStorage", owner: "transfer", portable: false },
    { id: "mapViews", key: "copdocx.map.views.v1", medium: "localStorage", owner: "map", portable: true },
    { id: "mapLayers", key: "copdocx.map.layers.v1", medium: "localStorage", owner: "map", portable: true },
    { id: "mapIcons", key: "copdocx.map.icons.v1", medium: "localStorage", owner: "map", portable: true },
    { id: "mapMarkup", key: "copdocx.map.markup.v1", medium: "localStorage", owner: "map", portable: true },
    { id: "mapBasemap", key: "copdocx.location-map.basemap", medium: "localStorage", owner: "map", portable: true },
    { id: "narrativeTemplates", key: "opdoc.narrative.templates.v2", medium: "localStorage", owner: "narrative", portable: true },
    { id: "narrativeTemplatesLegacy", key: "opdoc.narrative.templates.v1", medium: "localStorage", owner: "narrative", portable: false },
    { id: "photoPickerLab", key: "copdocx.photo-picker.v1", medium: "localStorage", owner: "photo-picker-lab", portable: false },
    { id: "fileUploadLab", key: "copdocx.file-upload.v1", medium: "localStorage", owner: "file-upload-lab", portable: false },
    { id: "investigationWindows", key: "copdocx.investigation-windows.v1", medium: "sessionStorage", owner: "investigation-wall", portable: false },
    { id: "baseballHandoff", key: "copdocx.baseball.handoff.v1", medium: "sessionStorage", owner: "baseball", portable: false },
    { id: "baseballCardStyle", key: "copdocx.baseball.card-style.v1", medium: "localStorage", owner: "baseball", portable: false },
    { id: "geocodeCache", key: "addrGeoCache_v1", medium: "sessionStorage", owner: "address", portable: false },
    { id: "media", key: "copdocx.media.v1", medium: "indexedDB", owner: "model/media", portable: true },
    { id: "warrants", key: "copdocx.warrants", medium: "indexedDB", owner: "warrant-issue", portable: false },
    { id: "retiredCaseLayout", key: "copdocx.case-view.layout.v1", medium: "retired", owner: "leads", portable: false }
  ].map(function (entry) {
    return Object.freeze(entry);
  });
  var byId = Object.create(null);
  entries.forEach(function (entry) {
    byId[entry.id] = entry;
  });

  root.config = Object.freeze({
    productName: "COPDoc",
    productVersion: "0.69.2",
    storageEntries: Object.freeze(entries),
    storageKey: function (id) {
      return byId[id] ? byId[id].key : "";
    },
    storageEntry: function (id) {
      return byId[id] || null;
    }
  });
})(typeof window !== "undefined" ? window : globalThis);
