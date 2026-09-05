/** Shared preferences repository. Patches retain unrelated settings and extensions. */
(function (global) {
  "use strict";
  var root = (global.COPDoc = global.COPDoc || {});
  root.repositories = root.repositories || {};
  function port() { return root.repositories.storage; }
  function key(name, fallback) { return root.config && root.config.storageKey(name) || fallback; }
  function plain(value) { return Boolean(value && typeof value === "object" && !Array.isArray(value)); }
  function settingsKey() { return key("settings", "copdocx.settings.v1"); }
  function readSettings() {
    var value = JSON.parse(port().read("localStorage", settingsKey()) || "{}");
    if (!plain(value)) { throw new Error("Report preferences could not be read."); }
    return value;
  }
  function patchSettings(partial) {
    if (!plain(partial)) { throw new Error("A settings patch is required."); }
    var current = readSettings();
    Object.keys(partial).forEach(function (field) {
      if (["__proto__", "prototype", "constructor"].indexOf(field) !== -1) { return; }
      current[field] = partial[field];
    });
    port().write("localStorage", settingsKey(), JSON.stringify(current));
    return current;
  }
  function readArrestRoster() { return readSettings().arrestReportRoster || {}; }
  function saveArrestRoster(value) {
    if (!plain(value)) { throw new Error("Report preferences must be an object."); }
    // Preserve extensions to the roster preference shape as well as other sections.
    var current = readSettings(), old = plain(current.arrestReportRoster) ? current.arrestReportRoster : {};
    Object.keys(value).forEach(function (field) {
      if (["__proto__", "prototype", "constructor"].indexOf(field) < 0) { old[field] = value[field]; }
    });
    current.arrestReportRoster = old;
    port().write("localStorage", settingsKey(), JSON.stringify(current));
    return old;
  }
  function readBaseballStyle() {
    var raw = port().read("localStorage", key("baseballCardStyle", "copdocx.baseball.card-style.v1"));
    return raw === null ? null : JSON.parse(raw);
  }
  function saveBaseballStyle(value) {
    port().write("localStorage", key("baseballCardStyle", "copdocx.baseball.card-style.v1"), JSON.stringify(value));
    return value;
  }
  root.repositories.preferences = Object.freeze({
    readSettings: readSettings, patchSettings: patchSettings,
    readArrestRoster: readArrestRoster, saveArrestRoster: saveArrestRoster,
    readBaseballStyle: readBaseballStyle, saveBaseballStyle: saveBaseballStyle
  });
})(typeof window !== "undefined" ? window : globalThis);
