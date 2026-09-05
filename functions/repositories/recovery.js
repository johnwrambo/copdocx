/** Exact-value persistence channels reserved for recovery/application workflows. */
(function (global) {
  "use strict";
  var app = global.COPDoc = global.COPDoc || {}, repositories = app.repositories = app.repositories || {};
  repositories.recovery = Object.freeze({
    channel: function (medium) {
      if (!repositories.storage.has(medium)) throw new Error("Browser storage is unavailable.");
      return Object.freeze({
        getItem: function (key) { return repositories.storage.read(medium, key); },
        setItem: function (key, bytes) { repositories.storage.write(medium, key, bytes); },
        removeItem: function (key) { repositories.storage.remove(medium, key); }
      });
    }
  });
})(typeof window !== "undefined" ? window : globalThis);
