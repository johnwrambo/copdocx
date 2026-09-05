/** Durable warrant destination handle. Browser permission prompts remain in the UI. */
(function (global) {
  "use strict";
  var root = (global.COPDoc = global.COPDoc || {});
  root.repositories = root.repositories || {};
  var STORE = "handles", HANDLE = "warrantsDirectory";
  function open() {
    return new Promise(function (resolve, reject) {
      if (!global.indexedDB) { reject(new Error("IndexedDB is not available.")); return; }
      var name = root.config && root.config.storageKey("warrants") || "copdocx.warrants";
      var request = global.indexedDB.open(name, 1);
      request.onupgradeneeded = function () {
        if (!request.result.objectStoreNames.contains(STORE)) { request.result.createObjectStore(STORE); }
      };
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error || new Error("Warrant destination could not be opened.")); };
    });
  }
  function handleTransaction(mode, handle) {
    return open().then(function (db) {
      return new Promise(function (resolve, reject) {
        var settled = false, result = null, tx;
        function close() { if (typeof db.close === "function") { db.close(); } }
        function fail(error) {
          if (settled) { return; }
          settled = true; close(); reject(error || new Error("Warrant destination could not be saved."));
        }
        try {
          tx = db.transaction(STORE, mode);
          var request = mode === "readwrite" ? tx.objectStore(STORE).put(handle, HANDLE) : tx.objectStore(STORE).get(HANDLE);
          request.onsuccess = function () { result = mode === "readwrite" ? handle : request.result || null; };
          request.onerror = function () { fail(request.error); };
          tx.oncomplete = function () {
            if (settled) { return; }
            settled = true; close(); resolve(result);
          };
          tx.onerror = function () { fail(tx.error); };
          tx.onabort = function () { fail(tx.error || new Error("Warrant destination save was aborted.")); };
        } catch (error) { fail(error); }
      });
    });
  }
  root.repositories.warrants = Object.freeze({
    loadDirectoryHandle: function () { return handleTransaction("readonly").catch(function () { return null; }); },
    saveDirectoryHandle: function (handle) { return handleTransaction("readwrite", handle); }
  });
})(typeof window !== "undefined" ? window : globalThis);
