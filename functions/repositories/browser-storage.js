/** The sole Web Storage transport. Domain/UI code receives repository methods. */
(function (global) {
  "use strict";
  var app = global.COPDoc = global.COPDoc || {};
  var repositories = app.repositories = app.repositories || {};
  function mediumName(medium) {
    if (medium !== "localStorage" && medium !== "sessionStorage") throw new Error("Unsupported browser storage medium.");
    return medium;
  }
  function keyName(key) {
    if (typeof key !== "string" || !key) throw new Error("A storage key is required.");
    return key;
  }
  function has(medium) {
    mediumName(medium);
    if (!(medium in global)) return false;
    var descriptor = Object.getOwnPropertyDescriptor(global, medium);
    // A denied browser getter is present, not an in-memory environment. Its
    // error must surface on read/write instead of becoming a successful save.
    // A present null value is also unavailable storage, not permission to save
    // only in memory. Preserve the old typeof-undefined host distinction.
    return !descriptor || !Object.prototype.hasOwnProperty.call(descriptor, "value") || descriptor.value !== undefined;
  }
  function storage(medium) {
    var value = global[mediumName(medium)];
    if (!value) throw new Error("Browser storage is unavailable: " + medium);
    return value;
  }
  function read(medium, key) { return storage(medium).getItem(keyName(key)); }
  function write(medium, key, raw) {
    if (typeof raw !== "string") throw new Error("Repository writes require serialized storage bytes.");
    storage(medium).setItem(keyName(key), raw);
  }
  function remove(medium, key) { storage(medium).removeItem(keyName(key)); }
  function keys(medium) {
    var source = storage(medium), out = [];
    for (var i = 0; i < source.length; i += 1) { var key = source.key(i); if (key !== null) out.push(key); }
    return out;
  }
  function snapshot(entries) {
    if (!Array.isArray(entries)) throw new Error("A repository snapshot requires storage entries.");
    return Object.freeze({ entries: Object.freeze(entries.map(function (entry) {
      return Object.freeze({ medium: mediumName(entry.medium), key: keyName(entry.key), raw: read(entry.medium, entry.key) });
    })) });
  }
  function matches(before) {
    if (!before || !Array.isArray(before.entries)) throw new Error("A captured repository snapshot is required.");
    return before.entries.every(function (entry) { return read(entry.medium, entry.key) === entry.raw; });
  }
  repositories.storage = Object.freeze({ has: has, read: read, write: write, remove: remove, keys: keys, snapshot: snapshot, matches: matches });
})(typeof window !== "undefined" ? window : globalThis);
