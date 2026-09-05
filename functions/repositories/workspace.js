/** Read-only workspace snapshots for projections and overview pages. */
(function (global) {
  "use strict";
  var app = global.COPDoc = global.COPDoc || {}, repositories = app.repositories = app.repositories || {};
  function key(id, fallback) { return app.config && app.config.storageKey(id) || fallback; }
  repositories.workspace = Object.freeze({
    readSnapshot: function () {
      var raw = repositories.storage.read("localStorage", key("workspace", "copdocx.store.v1"));
      return raw === null || raw === "" ? null : JSON.parse(raw);
    },
    retireCaseLayout: function () { repositories.storage.remove("localStorage", key("retiredCaseLayout", "copdocx.case-view.layout.v1")); }
  });
})(typeof window !== "undefined" ? window : globalThis);
