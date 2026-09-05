/** Exact browser bytes for transfer planning, export consistency and notifications. */
(function (global) {
  "use strict";
  var app = global.COPDoc = global.COPDoc || {};
  var repositories = app.repositories = app.repositories || {};
  var transport = repositories.storage;

  function hasStorage() { return transport.has("localStorage"); }
  function channel() {
    if (!hasStorage()) return null;
    return {
      getItem: function (key) { return transport.read("localStorage", key); },
      setItem: function (key, raw) { transport.write("localStorage", key, String(raw)); },
      removeItem: function (key) { transport.remove("localStorage", key); }
    };
  }
  function capture(defaultKeys, entries) {
    var snapshot = { localStorage: {}, sessionStorage: {} };
    ["localStorage", "sessionStorage"].forEach(function (medium) {
      var present = transport.has(medium);
      var keys = medium === "localStorage" ? defaultKeys.slice() : [];
      (entries || []).forEach(function (entry) {
        if (entry.medium === medium && keys.indexOf(entry.key) === -1) keys.push(entry.key);
      });
      if (present) transport.keys(medium).forEach(function (key) {
        if (keys.indexOf(key) === -1) keys.push(key);
      });
      keys.forEach(function (key) { snapshot[medium][key] = present ? transport.read(medium, key) : null; });
    });
    return snapshot;
  }
  function sourcesMatch(snapshot, keys) {
    return keys.every(function (key) { return transport.read("localStorage", key) === snapshot.localStorage[key]; });
  }
  function notifyImported() {
    if (hasStorage()) transport.write("localStorage", "copdocx.import.done.v1", String(Date.now()));
  }
  repositories.transfer = Object.freeze({
    hasStorage: hasStorage, channel: channel, capture: capture,
    sourcesMatch: sourcesMatch, notifyImported: notifyImported
  });
})(typeof window !== "undefined" ? window : globalThis);
