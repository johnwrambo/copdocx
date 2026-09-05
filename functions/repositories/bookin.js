/** Book-In packet and page-state persistence. Existing serialization is unchanged. */
(function (global) {
  "use strict";
  var app = global.COPDoc = global.COPDoc || {}, repositories = app.repositories = app.repositories || {};
  var defaults = { bookin: "alien-book-in.saved-records.v1", bookinColumns: "alien-book-in.saved-record-columns.v1", baseballHandoff: "copdocx.baseball.handoff.v1", workspace: "copdocx.store.v1", admin: "copdoc.admin.v1" };
  function key(id) { return app.config && app.config.storageKey(id) || defaults[id]; }
  function read(id, medium) {
    var raw = repositories.storage.read(medium || "localStorage", key(id));
    return raw === null || raw === "" ? null : JSON.parse(raw);
  }
  function writable() {
    if (app.importWorkflow && app.importWorkflow.assertWritable) {
      var result = app.importWorkflow.assertWritable();
      if (!result || !result.ok) throw new Error(result && result.error || "Resume or roll back the pending import before saving.");
    }
  }
  function write(id, value, medium) { repositories.storage.write(medium || "localStorage", key(id), JSON.stringify(value)); }
  repositories.bookin = Object.freeze({
    readAll: function () {
      var raw = repositories.storage.read("localStorage", key("bookin"));
      if (raw === null) return [];
      var rows = JSON.parse(raw);
      if (!Array.isArray(rows)) throw new Error("Saved Book-In records have an invalid root shape.");
      return rows;
    },
    readHistoryRecords: function () {
      var value = read("bookin");
      return Array.isArray(value) ? value : value && Array.isArray(value.records) ? value.records : [];
    },
    saveAll: function (records) {
      if (!Array.isArray(records)) throw new Error("Book-In records must be an array.");
      writable(); write("bookin", records);
    },
    readColumns: function () { return read("bookinColumns"); },
    saveColumns: function (columns) { write("bookinColumns", columns); },
    readHandoff: function () { return read("baseballHandoff", "sessionStorage"); },
    saveHandoff: function (handoff) { write("baseballHandoff", handoff, "sessionStorage"); },
    captureExportSources: function () { return repositories.storage.snapshot(["workspace", "admin", "bookin"].map(function (id) { return { medium: "localStorage", key: key(id) }; })); },
    exportSourcesMatch: function (snapshot) { return repositories.storage.matches(snapshot); }
  });
})(typeof window !== "undefined" ? window : globalThis);
