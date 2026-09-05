/**
 * Stage 0 recovery archive.
 *
 * This module deliberately bypasses COPDoc's model, admin, Book-In, and
 * transfer readers. Those readers normalize data or filter records. A safety
 * backup must preserve the exact bytes that are present, including malformed
 * JSON, drafts, legacy keys, and empty values.
 *
 * Collection is read-only. Restore is intentionally not implemented here.
 */
(function (global) {
  "use strict";

  var root = (global.COPDoc = global.COPDoc || {});
  var FORMAT = "copdocx.safety-backup.v1";
  var MEDIA_META_STORE = "meta";
  var MEDIA_BLOB_STORE = "blobs";

  function config() {
    return root.config || {};
  }

  function registeredEntries() {
    var rows = config().storageEntries;
    return Array.isArray(rows) ? rows.slice() : [];
  }

  function bytesOfText(value) {
    var text = String(value == null ? "" : value);
    if (typeof TextEncoder !== "undefined") {
      return new TextEncoder().encode(text).byteLength;
    }
    return unescape(encodeURIComponent(text)).length;
  }

  function arrayBufferOf(value) {
    if (value == null) {
      return Promise.resolve(new ArrayBuffer(0));
    }
    if (value instanceof ArrayBuffer) {
      return Promise.resolve(value);
    }
    if (typeof ArrayBuffer !== "undefined" && ArrayBuffer.isView(value)) {
      return Promise.resolve(
        value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength)
      );
    }
    if (typeof value.arrayBuffer === "function") {
      return value.arrayBuffer();
    }
    var text = String(value);
    if (typeof TextEncoder !== "undefined") {
      return Promise.resolve(new TextEncoder().encode(text).buffer);
    }
    var escaped = unescape(encodeURIComponent(text));
    var bytes = new Uint8Array(escaped.length);
    var i;
    for (i = 0; i < escaped.length; i += 1) {
      bytes[i] = escaped.charCodeAt(i);
    }
    return Promise.resolve(bytes.buffer);
  }

  function hex(buffer) {
    return Array.prototype.map
      .call(new Uint8Array(buffer), function (byte) {
        return byte.toString(16).padStart(2, "0");
      })
      .join("");
  }

  function sha256(value) {
    return arrayBufferOf(value).then(function (buffer) {
      if (
        !global.crypto ||
        !global.crypto.subtle ||
        typeof global.crypto.subtle.digest !== "function"
      ) {
        throw new Error("SHA-256 is unavailable; the archive cannot be verified.");
      }
      return global.crypto.subtle.digest("SHA-256", buffer).then(hex);
    });
  }

  function stableStringify(value) {
    function encode(item) {
      if (item === null || typeof item !== "object") {
        return JSON.stringify(item);
      }
      if (Array.isArray(item)) {
        return "[" + item.map(encode).join(",") + "]";
      }
      return (
        "{" +
        Object.keys(item)
          .sort()
          .map(function (key) {
            return JSON.stringify(key) + ":" + encode(item[key]);
          })
          .join(",") +
        "}"
      );
    }
    return encode(value);
  }

  function base64FromBuffer(buffer) {
    var bytes = new Uint8Array(buffer);
    var alphabet =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    var out = "";
    var i;
    for (i = 0; i < bytes.length; i += 3) {
      var a = bytes[i];
      var b = i + 1 < bytes.length ? bytes[i + 1] : 0;
      var c = i + 2 < bytes.length ? bytes[i + 2] : 0;
      out += alphabet[a >> 2];
      out += alphabet[((a & 3) << 4) | (b >> 4)];
      out += i + 1 < bytes.length
        ? alphabet[((b & 15) << 2) | (c >> 6)]
        : "=";
      out += i + 2 < bytes.length ? alphabet[c & 63] : "=";
    }
    return out;
  }

  function bufferFromBase64(value) {
    var alphabet =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    var clean = String(value || "").replace(/\s/g, "").replace(/=+$/, "");
    var out = [];
    var i;
    for (i = 0; i < clean.length; i += 4) {
      var a = alphabet.indexOf(clean.charAt(i));
      var b = alphabet.indexOf(clean.charAt(i + 1));
      var c = i + 2 < clean.length ? alphabet.indexOf(clean.charAt(i + 2)) : -1;
      var d = i + 3 < clean.length ? alphabet.indexOf(clean.charAt(i + 3)) : -1;
      if (a < 0 || b < 0 || (i + 2 < clean.length && c < 0) || (i + 3 < clean.length && d < 0)) {
        throw new Error("Backup contains invalid Base64 Media data.");
      }
      out.push((a << 2) | (b >> 4));
      if (c >= 0) {
        out.push(((b & 15) << 4) | (c >> 2));
      }
      if (d >= 0) {
        out.push(((c & 3) << 6) | d);
      }
    }
    return new Uint8Array(out).buffer;
  }

  function storageFor(medium) {
    if (medium === "localStorage") {
      return global.localStorage;
    }
    if (medium === "sessionStorage") {
      return global.sessionStorage;
    }
    return null;
  }

  function captureRawStorage() {
    var groups = { localStorage: [], sessionStorage: [] };
    registeredEntries().forEach(function (entry) {
      if (entry.medium !== "localStorage" && entry.medium !== "sessionStorage") {
        return;
      }
      var storage = storageFor(entry.medium);
      if (!storage || typeof storage.getItem !== "function") {
        throw new Error(entry.medium + " is unavailable; backup stopped.");
      }
      var raw;
      try {
        raw = storage.getItem(entry.key);
      } catch (error) {
        throw new Error(
          "Could not read registered store " + entry.id + "; backup stopped."
        );
      }
      groups[entry.medium].push({
        id: entry.id,
        key: entry.key,
        owner: entry.owner || "",
        portable: !!entry.portable,
        exists: raw !== null,
        raw: raw,
        byteLength: raw === null ? 0 : bytesOfText(raw),
        sha256: ""
      });
    });
    return groups;
  }

  function hashRawStorage(groups) {
    var rows = (groups.localStorage || []).concat(groups.sessionStorage || []);
    return Promise.all(
      rows.map(function (row) {
        if (!row.exists) {
          row.sha256 = null;
          return null;
        }
        return sha256(row.raw).then(function (digest) {
          row.sha256 = digest;
          return digest;
        });
      })
    ).then(function () {
      return groups;
    });
  }

  function rawStorageEqual(left, right) {
    function rowsById(groups) {
      var out = Object.create(null);
      (groups.localStorage || [])
        .concat(groups.sessionStorage || [])
        .forEach(function (row) {
          out[row.id] = row;
        });
      return out;
    }
    var a = rowsById(left);
    var b = rowsById(right);
    var ids = Object.keys(a).concat(
      Object.keys(b).filter(function (id) {
        return !Object.prototype.hasOwnProperty.call(a, id);
      })
    );
    return ids.every(function (id) {
      return (
        a[id] &&
        b[id] &&
        a[id].exists === b[id].exists &&
        a[id].raw === b[id].raw
      );
    });
  }

  function databaseNames() {
    if (!global.indexedDB) {
      return Promise.resolve({ supported: false, names: [] });
    }
    if (typeof global.indexedDB.databases !== "function") {
      return Promise.reject(
        new Error(
          "This browser cannot safely prove which IndexedDB databases exist; backup stopped."
        )
      );
    }
    return global.indexedDB.databases().then(function (rows) {
      return {
        supported: true,
        names: (rows || []).map(function (row) {
          return row && row.name;
        }).filter(Boolean)
      };
    });
  }

  function openExistingDatabase(name) {
    return new Promise(function (resolve, reject) {
      var settled = false;
      var request;
      var timeout = typeof global.setTimeout === "function"
        ? global.setTimeout(function () {
            if (!settled) {
              settled = true;
              reject(new Error("Timed out opening IndexedDB " + name + "."));
            }
          }, 8000)
        : null;
      function finish() {
        if (timeout !== null && typeof global.clearTimeout === "function") {
          global.clearTimeout(timeout);
        }
      }
      try {
        request = global.indexedDB.open(name);
      } catch (error) {
        finish();
        reject(error);
        return;
      }
      request.onupgradeneeded = function () {
        try {
          request.transaction.abort();
        } catch (error) {}
        if (!settled) {
          settled = true;
          finish();
          reject(new Error("Refused to create or upgrade IndexedDB " + name + "."));
        }
      };
      request.onerror = function () {
        if (!settled) {
          settled = true;
          finish();
          reject(request.error || new Error("Could not open IndexedDB " + name + "."));
        }
      };
      request.onblocked = function () {
        if (!settled) {
          settled = true;
          finish();
          reject(new Error("IndexedDB " + name + " is blocked by another tab."));
        }
      };
      request.onsuccess = function () {
        if (!settled) {
          settled = true;
          finish();
          resolve(request.result);
        } else if (request.result) {
          request.result.close();
        }
      };
    });
  }

  function requestResult(request) {
    return new Promise(function (resolve, reject) {
      request.onsuccess = function () {
        resolve(request.result);
      };
      request.onerror = function () {
        reject(request.error || new Error("IndexedDB read failed."));
      };
    });
  }

  function transactionDone(transaction) {
    return new Promise(function (resolve, reject) {
      transaction.oncomplete = function () {
        resolve();
      };
      transaction.onabort = function () {
        reject(transaction.error || new Error("IndexedDB read was aborted."));
      };
      transaction.onerror = function () {
        reject(transaction.error || new Error("IndexedDB read failed."));
      };
    });
  }

  function captureMedia(databaseName, knownNames) {
    if (knownNames.indexOf(databaseName) === -1) {
      return Promise.resolve({
        database: databaseName,
        status: "missing",
        version: null,
        objectStores: [],
        records: [],
        orphanBlobs: [],
        integrityValid: true,
        warnings: []
      });
    }
    return openExistingDatabase(databaseName).then(function (db) {
      var names = Array.prototype.slice.call(db.objectStoreNames || []);
      var readable = [MEDIA_META_STORE, MEDIA_BLOB_STORE].filter(function (name) {
        return names.indexOf(name) !== -1;
      });
      var version = db.version;
      if (!readable.length) {
        db.close();
        return {
          database: databaseName,
          status: "invalid",
          version: version,
          objectStores: names,
          records: [],
          orphanBlobs: [],
          integrityValid: false,
          warnings: ["Media database has neither required object store."]
        };
      }
      var tx = db.transaction(readable, "readonly");
      var storeSchemas = readable.map(function (name) {
        var store = tx.objectStore(name);
        return {
          name: name,
          keyPath: store.keyPath,
          autoIncrement: !!store.autoIncrement,
          indexes: Array.prototype.slice.call(store.indexNames || []).map(function (indexName) {
            var index = store.index(indexName);
            return {
              name: index.name,
              keyPath: index.keyPath,
              unique: !!index.unique,
              multiEntry: !!index.multiEntry
            };
          })
        };
      });
      var metaPromise = names.indexOf(MEDIA_META_STORE) !== -1
        ? requestResult(tx.objectStore(MEDIA_META_STORE).getAll())
        : Promise.resolve([]);
      var blobPromise = names.indexOf(MEDIA_BLOB_STORE) !== -1
        ? requestResult(tx.objectStore(MEDIA_BLOB_STORE).getAll())
        : Promise.resolve([]);
      return Promise.all([metaPromise, blobPromise, transactionDone(tx)])
        .then(function (values) {
          db.close();
          return serializeMedia(
            databaseName,
            version,
            names,
            values[0] || [],
            values[1] || [],
            storeSchemas
          );
        }, function (error) {
          db.close();
          throw error;
        });
    });
  }

  function serializeMedia(databaseName, version, names, metadata, blobRows, storeSchemas) {
    var blobsByMedia = Object.create(null);
    var metaIds = Object.create(null);
    var warnings = [];
    metadata.forEach(function (row) {
      if (row && row.mediaId) {
        metaIds[row.mediaId] = true;
      }
    });
    return Promise.all(
      blobRows.map(function (part) {
        if (!part || !part.mediaId || !part.role || !("blob" in part)) {
          throw new Error("A Media blob record is malformed; backup stopped.");
        }
        return arrayBufferOf(part.blob).then(function (buffer) {
          return sha256(buffer).then(function (digest) {
            var actualBytes = buffer.byteLength;
            var captured = {
              mediaId: part.mediaId,
              role: part.role,
              mime: part.mime || "application/octet-stream",
              declaredBytes: Number(part.bytes) || 0,
              byteLength: actualBytes,
              sha256: digest,
              base64: base64FromBuffer(buffer)
            };
            if (!blobsByMedia[part.mediaId]) {
              blobsByMedia[part.mediaId] = [];
            }
            blobsByMedia[part.mediaId].push(captured);
            if (captured.declaredBytes && captured.declaredBytes !== actualBytes) {
              warnings.push(
                "Media " + part.mediaId + " role " + part.role +
                  " declares " + captured.declaredBytes +
                  " bytes but contains " + actualBytes + "."
              );
            }
            return captured;
          });
        });
      })
    ).then(function () {
      var records = metadata.map(function (row) {
        var id = row && row.mediaId;
        var parts = (blobsByMedia[id] || []).slice().sort(function (a, b) {
          return String(a.role).localeCompare(String(b.role));
        });
        var present = Object.create(null);
        parts.forEach(function (part) {
          present[part.role] = true;
        });
        var expected = Array.isArray(row && row.roles) && row.roles.length
          ? row.roles.slice()
          : ["original"];
        if (expected.indexOf("original") === -1) {
          expected.push("original");
        }
        expected.forEach(function (role) {
          if (!present[role]) {
            warnings.push("Media " + id + " is missing declared role " + role + ".");
          }
        });
        var original = parts.filter(function (part) {
          return part.role === "original";
        })[0];
        if (original && row && row.sha256 && original.sha256 !== row.sha256) {
          warnings.push("Media " + id + " original payload does not match its metadata SHA-256.");
        }
        return { meta: row, blobs: parts };
      });
      var orphanBlobs = [];
      Object.keys(blobsByMedia).forEach(function (id) {
        if (!metaIds[id]) {
          blobsByMedia[id].forEach(function (part) {
            orphanBlobs.push(part);
          });
          warnings.push("Media blob " + id + " has no metadata record.");
        }
      });
      return {
        database: databaseName,
        status: "ok",
        version: version,
        objectStores: names,
        storeSchemas: storeSchemas || [],
        transaction: "readonly",
        records: records,
        orphanBlobs: orphanBlobs,
        integrityValid:
          names.indexOf(MEDIA_META_STORE) !== -1 &&
          names.indexOf(MEDIA_BLOB_STORE) !== -1 &&
          warnings.length === 0,
        warnings: warnings
      };
    });
  }

  function inspectWarrantDatabase(databaseName, knownNames) {
    if (knownNames.indexOf(databaseName) === -1) {
      return Promise.resolve({ database: databaseName, status: "missing", version: null });
    }
    return openExistingDatabase(databaseName).then(function (db) {
      var result = {
        database: databaseName,
        status: "excluded-nonportable",
        version: db.version,
        objectStores: Array.prototype.slice.call(db.objectStoreNames || [])
      };
      db.close();
      return result;
    });
  }

  function storageManifest(groups, media) {
    var lines = [];
    (groups.localStorage || [])
      .concat(groups.sessionStorage || [])
      .forEach(function (row) {
        lines.push(
          [
            row.id,
            row.key,
            row.owner || "",
            row.portable ? "1" : "0",
            row.exists ? "1" : "0",
            row.byteLength,
            row.sha256 || ""
          ].join("|")
        );
      });
    (media.records || []).forEach(function (record) {
      lines.push(["media-meta", stableStringify(record.meta || null)].join("|"));
      (record.blobs || []).forEach(function (part) {
        lines.push(
          [
            "media",
            part.mediaId,
            part.role,
            part.mime || "",
            part.declaredBytes || 0,
            part.byteLength,
            part.sha256
          ].join("|")
        );
      });
    });
    (media.orphanBlobs || []).forEach(function (part) {
      lines.push(
        [
          "media-orphan",
          part.mediaId,
          part.role,
          part.mime || "",
          part.declaredBytes || 0,
          part.byteLength,
          part.sha256
        ].join("|")
      );
    });
    lines.push(
      [
        "media-schema",
        media.database || "",
        media.status || "",
        media.version == null ? "" : media.version,
        stableStringify(media.objectStores || [])
      ].join("|")
    );
    lines.push(["media-store-schemas", stableStringify(media.storeSchemas || [])].join("|"));
    return sha256(lines.sort().join("\n"));
  }

  function verifyArchive(archive) {
    if (!archive || archive.format !== FORMAT || archive.schemaVersion !== 1) {
      return Promise.reject(new Error("Safety-backup format is invalid."));
    }
    var stores = archive.stores || {};
    var groups = {
      localStorage: Array.isArray(stores.localStorage) ? stores.localStorage : [],
      sessionStorage: Array.isArray(stores.sessionStorage) ? stores.sessionStorage : []
    };
    var rawRows = groups.localStorage.concat(groups.sessionStorage);
    var media = stores.media || {};
    var parts = [];
    (media.records || []).forEach(function (record) {
      (record.blobs || []).forEach(function (part) {
        parts.push(part);
      });
    });
    (media.orphanBlobs || []).forEach(function (part) {
      parts.push(part);
    });
    return Promise.all(
      rawRows.map(function (row) {
        if (!row.exists) {
          if (row.raw !== null || row.byteLength !== 0 || row.sha256 !== null) {
            throw new Error("Missing registered store " + row.id + " has inconsistent inventory data.");
          }
          return null;
        }
        if (typeof row.raw !== "string" || bytesOfText(row.raw) !== row.byteLength) {
          throw new Error("Registered store " + row.id + " failed byte-count verification.");
        }
        return sha256(row.raw).then(function (digest) {
          if (digest !== row.sha256) {
            throw new Error("Registered store " + row.id + " failed SHA-256 verification.");
          }
        });
      }).concat(
        parts.map(function (part) {
          var buffer = bufferFromBase64(part.base64);
          if (buffer.byteLength !== part.byteLength) {
            throw new Error(
              "Media " + part.mediaId + " role " + part.role + " failed byte-count verification."
            );
          }
          return sha256(buffer).then(function (digest) {
            if (digest !== part.sha256) {
              throw new Error(
                "Media " + part.mediaId + " role " + part.role + " failed SHA-256 verification."
              );
            }
          });
        })
      )
    )
      .then(function () {
        return storageManifest(groups, media);
      })
      .then(function (digest) {
        if (!archive.metadata || digest !== archive.metadata.manifestSha256) {
          throw new Error("Safety-backup manifest verification failed.");
        }
        return { ok: true, manifestSha256: digest };
      });
  }

  function countPresent(rows) {
    return (rows || []).filter(function (row) {
      return row.exists;
    }).length;
  }

  function collect(integrityReport) {
    var startedAt = new Date().toISOString();
    var before = captureRawStorage();
    var mediaEntry = registeredEntries().filter(function (entry) {
      return entry.id === "media";
    })[0] || { key: "copdocx.media.v1" };
    var warrantsEntry = registeredEntries().filter(function (entry) {
      return entry.id === "warrants";
    })[0] || { key: "copdocx.warrants" };
    return hashRawStorage(before)
      .then(function () {
        return databaseNames();
      })
      .then(function (dbs) {
        if (!dbs.supported) {
          return {
            media: {
              database: mediaEntry.key,
              status: "unavailable",
              version: null,
              objectStores: [],
              records: [],
              orphanBlobs: [],
              integrityValid: true,
              warnings: ["IndexedDB is unavailable in this browser."]
            },
            warrants: {
              database: warrantsEntry.key,
              status: "unavailable",
              version: null
            }
          };
        }
        return Promise.all([
          captureMedia(mediaEntry.key, dbs.names),
          inspectWarrantDatabase(warrantsEntry.key, dbs.names)
        ]).then(function (rows) {
          return { media: rows[0], warrants: rows[1] };
        });
      })
      .then(function (idb) {
        var after = captureRawStorage();
        if (!rawStorageEqual(before, after)) {
          throw new Error(
            "COPDoc storage changed while the backup was being collected. Run the backup again."
          );
        }
        return storageManifest(before, idb.media).then(function (manifestSha256) {
          var warnings = idb.media.warnings.slice();
          var mediaBlobCount = idb.media.records.reduce(function (sum, record) {
            return sum + (record.blobs || []).length;
          }, idb.media.orphanBlobs.length);
          return {
            format: FORMAT,
            schemaVersion: 1,
            metadata: {
              backupId: "backup_" + startedAt.replace(/[^0-9]/g, ""),
              createdAt: startedAt,
              productName: config().productName || "COPDoc",
              appVersion: config().productVersion || "",
              captureComplete: true,
              integrityValid: idb.media.integrityValid,
              unencrypted: true,
              manifestSha256: manifestSha256,
              counts: {
                registeredLocalStores: before.localStorage.length,
                presentLocalStores: countPresent(before.localStorage),
                registeredSessionStores: before.sessionStorage.length,
                presentSessionStores: countPresent(before.sessionStorage),
                mediaRecords: idb.media.records.length,
                mediaBlobs: mediaBlobCount
              },
              warnings: warnings,
              exclusions: [
                "Unsaved form and editor state that has not reached registered browser storage.",
                "The warrant directory handle and its browser permission; it is not portable.",
                "Browser caches, service-worker caches, and unrelated origin storage.",
                "Registered session and signal values are captured for evidence but are not approved for automatic restoration.",
                "Restore automation; Stage 0 creates and verifies the archive only."
              ]
            },
            stores: {
              localStorage: before.localStorage,
              sessionStorage: before.sessionStorage,
              media: idb.media,
              warrants: idb.warrants
            },
            verification: {
              algorithm: "SHA-256",
              registeredStorageUnchangedDuringCapture: true,
              mediaPayloadsHashed: true
            },
            integrityReport:
              integrityReport &&
              (integrityReport.schema === "copdocx.integrity-report.v1" ||
                integrityReport.format === "copdocx.integrity-report.v1")
                ? integrityReport
                : null
          };
        });
      })
      .then(function (archive) {
        var serialized;
        var reparsed;
        try {
          serialized = JSON.stringify(archive);
          reparsed = JSON.parse(serialized);
        } catch (error) {
          throw new Error("Safety backup could not be serialized and verified.");
        }
        return verifyArchive(reparsed).then(function () {
          reparsed.verification.archiveVerified = true;
          reparsed.verification.serializedByteLength = bytesOfText(serialized);
          return reparsed;
        });
      });
  }

  function filename(at) {
    var d = at instanceof Date ? at : new Date(at || Date.now());
    function pad(value) {
      return String(value).padStart(2, "0");
    }
    return (
      "COPDoc_full_backup_" +
      d.getFullYear() +
      pad(d.getMonth() + 1) +
      pad(d.getDate()) +
      "_" +
      pad(d.getHours()) +
      pad(d.getMinutes()) +
      pad(d.getSeconds()) +
      ".json"
    );
  }

  function download(integrityReport) {
    return collect(integrityReport).then(function (archive) {
      if (typeof Blob === "undefined" || !global.URL || !global.document) {
        return {
          ok: true,
          verified: true,
          integrityValid: archive.metadata.integrityValid,
          warnings: archive.metadata.warnings.slice(),
          archive: archive,
          filename: filename(archive.metadata.createdAt)
        };
      }
      var blob = new Blob([JSON.stringify(archive, null, 2)], {
        type: "application/json"
      });
      var url = global.URL.createObjectURL(blob);
      var anchor = global.document.createElement("a");
      anchor.href = url;
      anchor.download = filename(archive.metadata.createdAt);
      global.document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      global.setTimeout(function () {
        global.URL.revokeObjectURL(url);
      }, 0);
      return {
        ok: true,
        verified: true,
        integrityValid: archive.metadata.integrityValid,
        warnings: archive.metadata.warnings.slice(),
        archive: archive,
        filename: anchor.download
      };
    });
  }

  root.safetyBackup = Object.freeze({
    FORMAT: FORMAT,
    collect: collect,
    download: download,
    filename: filename,
    captureRawStorage: captureRawStorage,
    rawStorageEqual: rawStorageEqual,
    sha256: sha256,
    verify: verifyArchive,
    _captureMedia: captureMedia,
    _serializeMedia: serializeMedia
  });
})(typeof window !== "undefined" ? window : globalThis);
