/**
 * Photos and files. IndexedDB copdocx.media.v1 (meta + blobs).
 * Node tests use in-memory maps. Never writes lead/admin/book-in JSON.
 */
(function (global) {
  "use strict";

  var root = (global.COPDoc = global.COPDoc || {});
  var model = (root.model = root.model || {});

  var DB_NAME = "copdocx.media.v1";
  var DB_VERSION = 1;
  var PHOTO_MAX_BYTES = 15 * 1024 * 1024;
  var FILE_MAX_BYTES = 25 * 1024 * 1024;
  var OWNER_TYPES = {
    PERSON: true,
    VEHICLE: true,
    LOCATION: true,
    BUSINESS: true,
    ENTITY: true,
    OFFICER: true,
    ENCOUNTER: true,
    LEAD: true,
    BOOKIN: true
  };

  function MediaError(code, message) {
    var err = new Error(message || code);
    err.name = "COPDocMediaError";
    err.code = code;
    return err;
  }

  function nowIso() {
    return model.nowIso ? model.nowIso() : new Date().toISOString();
  }

  function newId(prefix) {
    return model.newId
      ? model.newId(prefix)
      : String(prefix || "id") +
          "_" +
          Date.now().toString(36) +
          "_" +
          Math.random().toString(36).slice(2, 8);
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function normalizeOwner(owner) {
    owner = owner || {};
    var type = String(owner.type || "").trim().toUpperCase();
    var id = String(owner.id || "").trim();
    if (!type || !id || !OWNER_TYPES[type]) {
      throw MediaError(
        "OWNER_REQUIRED",
        "Media needs owner.type and owner.id."
      );
    }
    return { type: type, id: id };
  }

  function ownerKeyOf(owner) {
    var row = normalizeOwner(owner);
    return row.type + ":" + row.id;
  }

  function ownerShaOf(ownerKey, sha256) {
    return ownerKey + ":" + String(sha256 || "");
  }

  function stampMeta(previous, mode) {
    if (typeof model.stampMeta === "function") {
      return model.stampMeta(previous, mode || "commit");
    }
    var now = nowIso();
    var prev = (previous && previous.meta) || {};
    return {
      createdAt: prev.createdAt || now,
      updatedAt: now,
      markedComplete: false,
      status: "committed",
      committedAt: prev.committedAt || now
    };
  }

  function pad2(value) {
    var n = String(value == null ? "" : value);
    return n.length < 2 ? "0" + n : n.slice(-2);
  }

  function normalizeTakenAt(value) {
    var text = String(value || "").trim();
    if (!text) {
      return { takenAt: "", precision: "" };
    }
    var iso = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/);
    if (iso) {
      return { takenAt: iso[1] + "-" + iso[2] + "-" + iso[3], precision: "day" };
    }
    var us = text.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (us) {
      return {
        takenAt: us[3] + "-" + pad2(us[1]) + "-" + pad2(us[2]),
        precision: "day"
      };
    }
    var ym = text.match(/^(\d{4})-(\d{2})$/);
    if (ym) {
      return { takenAt: ym[1] + "-" + ym[2], precision: "month" };
    }
    var my = text.match(/^(\d{1,2})[\/\-](\d{4})$/);
    if (my) {
      return { takenAt: my[2] + "-" + pad2(my[1]), precision: "month" };
    }
    if (/^\d{4}$/.test(text)) {
      return { takenAt: text, precision: "year" };
    }
    return { takenAt: text, precision: "day" };
  }

  function formatTakenAt(row) {
    var parsed = normalizeTakenAt(row && row.takenAt);
    var precision = (row && row.takenAtPrecision) || parsed.precision;
    var stored = parsed.takenAt;
    if (!stored) {
      return "unknown date";
    }
    var parts = stored.split("-");
    if (precision === "year" || parts.length === 1) {
      return parts[0];
    }
    if (precision === "month" || parts.length === 2) {
      return pad2(parts[1]) + "-" + parts[0];
    }
    if (parts.length >= 3) {
      return pad2(parts[1]) + "-" + pad2(parts[2]) + "-" + parts[0];
    }
    return stored;
  }

  function formatTakenAtInput(row) {
    var line = formatTakenAt(row);
    return line === "unknown date" ? "" : line;
  }

  function formatPhotoCaption(row) {
    row = row || {};
    if (row.captionCustom && String(row.caption || "").trim()) {
      return String(row.caption).trim();
    }
    var date = formatTakenAt(row);
    var place = String(row.place || "").trim() || "unknown location";
    var line = date + ", " + place;
    if (row.takenAtApproximate) {
      line += " (approx.)";
    }
    return line;
  }

  function createMedia(fields) {
    fields = fields || {};
    var owner = normalizeOwner(fields.owner);
    var mediaClass = fields.mediaClass === "file" ? "file" : "photo";
    if (mediaClass === "photo" && owner.type === "LEAD") {
      throw MediaError(
        "PHOTOS_NOT_ON_LEAD",
        "Photos attach to the person, vehicle, location, or officer, not the lead."
      );
    }
    var key = owner.type + ":" + owner.id;
    var sha = String(fields.sha256 || "").trim();
    var tags = Array.isArray(fields.tags)
      ? fields.tags.map(function (tag) {
          return String(tag || "").trim();
        }).filter(Boolean)
      : [];
    var roles = Array.isArray(fields.roles) && fields.roles.length
      ? fields.roles.slice()
      : mediaClass === "photo"
        ? ["original", "display", "thumb"]
        : ["original"];
    var taken = normalizeTakenAt(fields.takenAt);
    var precision = String(fields.takenAtPrecision || taken.precision || "").trim();
    if (precision !== "year" && precision !== "month" && precision !== "day") {
      precision = taken.precision;
    }
    var source = String(fields.takenAtSource || "").trim();
    if (source !== "file" && source !== "operator") {
      source = taken.takenAt ? "file" : "";
    }
    return {
      mediaId: fields.mediaId || newId("med"),
      entityType: "MEDIA",
      schema: "copdocx.media.v1",
      mediaClass: mediaClass,
      owner: { type: owner.type, id: owner.id },
      ownerKey: key,
      ownerSha: sha ? ownerShaOf(key, sha) : "",
      kind: String(fields.kind || (mediaClass === "photo" ? "subject" : "document")).trim(),
      documentType: String(fields.documentType || "").trim(),
      caption: String(fields.caption || "").trim(),
      captionCustom: !!fields.captionCustom,
      takenAt: taken.takenAt,
      takenAtPrecision: precision,
      takenAtApproximate: !!fields.takenAtApproximate,
      takenAtSource: source,
      place: String(fields.place || "").trim(),
      tags: tags,
      notes: String(fields.notes || "").trim(),
      mime: String(fields.mime || "").trim(),
      bytes: Number(fields.bytes) || 0,
      width: Number(fields.width) || 0,
      height: Number(fields.height) || 0,
      originalName: String(fields.originalName || "").trim(),
      sha256: sha,
      roles: roles,
      crop: fields.crop && typeof fields.crop === "object" ? fields.crop : null,
      primary: mediaClass === "photo" ? !!fields.primary : false,
      documentId: String(fields.documentId || "").trim(),
      meta: stampMeta(fields, "commit")
    };
  }

  var memory = { meta: {}, blobs: {} };
  var useMemory = typeof indexedDB === "undefined";
  var dbPromise = null;
  var persistCalled = false;

  function resetForTests() {
    memory = { meta: {}, blobs: {} };
    useMemory = typeof indexedDB === "undefined";
    dbPromise = null;
    persistCalled = false;
  }

  function openDb() {
    if (useMemory) {
      return Promise.resolve(null);
    }
    if (dbPromise) {
      return dbPromise;
    }
    dbPromise = new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onerror = function () {
        reject(req.error || MediaError("IDB_OPEN", "Could not open media storage."));
      };
      req.onupgradeneeded = function () {
        var db = req.result;
        var meta;
        if (!db.objectStoreNames.contains("meta")) {
          meta = db.createObjectStore("meta", { keyPath: "mediaId" });
          meta.createIndex("ownerKey", "ownerKey", { unique: false });
          meta.createIndex("mediaClass", "mediaClass", { unique: false });
          meta.createIndex("sha256", "sha256", { unique: false });
          meta.createIndex("ownerSha", "ownerSha", { unique: false });
        }
        if (!db.objectStoreNames.contains("blobs")) {
          db.createObjectStore("blobs", { keyPath: ["mediaId", "role"] });
        }
      };
      req.onsuccess = function () {
        resolve(req.result);
      };
    });
    return dbPromise;
  }

  function idbRequest(req) {
    return new Promise(function (resolve, reject) {
      req.onsuccess = function () {
        resolve(req.result);
      };
      req.onerror = function () {
        reject(req.error);
      };
    });
  }

  function txDone(tx) {
    return new Promise(function (resolve, reject) {
      tx.oncomplete = function () {
        resolve();
      };
      tx.onerror = function () {
        reject(tx.error);
      };
      tx.onabort = function () {
        reject(tx.error || MediaError("IDB_ABORT", "Media write aborted."));
      };
    });
  }

  function hexFromBuffer(buffer) {
    var bytes = new Uint8Array(buffer);
    var out = "";
    var i;
    for (i = 0; i < bytes.length; i++) {
      out += (bytes[i] + 256).toString(16).slice(-2);
    }
    return out;
  }

  function asArrayBuffer(source) {
    if (!source) {
      return Promise.resolve(new ArrayBuffer(0));
    }
    if (source instanceof ArrayBuffer) {
      return Promise.resolve(source);
    }
    if (typeof source.arrayBuffer === "function") {
      return source.arrayBuffer();
    }
    if (source.buffer && source.byteLength != null) {
      return Promise.resolve(
        source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength)
      );
    }
    return Promise.reject(MediaError("BYTES_REQUIRED", "Nothing to hash or store."));
  }

  function sourceSize(source) {
    if (!source) {
      return 0;
    }
    if (typeof source.size === "number") {
      return source.size;
    }
    if (typeof source.byteLength === "number") {
      return source.byteLength;
    }
    return 0;
  }

  function sha256Hex(source) {
    return asArrayBuffer(source).then(function (buf) {
      if (global.crypto && crypto.subtle && typeof crypto.subtle.digest === "function") {
        return crypto.subtle.digest("SHA-256", buf).then(hexFromBuffer);
      }
      try {
        var nodeCrypto = typeof require === "function" ? require("crypto") : null;
        if (nodeCrypto && nodeCrypto.createHash) {
          return nodeCrypto.createHash("sha256").update(Buffer.from(buf)).digest("hex");
        }
      } catch (err) {
        return Promise.reject(err);
      }
      return Promise.reject(MediaError("HASH", "SHA-256 is not available."));
    });
  }

  function checkQuota(bytes) {
    if (!global.navigator || !navigator.storage || typeof navigator.storage.estimate !== "function") {
      return Promise.resolve();
    }
    return navigator.storage.estimate().then(function (info) {
      var remaining =
        info && info.quota != null && info.usage != null
          ? info.quota - info.usage
          : Infinity;
      if (remaining < bytes * 1.2) {
        throw MediaError("QUOTA", "Not enough storage for this file.");
      }
    });
  }

  function maybePersist() {
    if (persistCalled) {
      return Promise.resolve();
    }
    persistCalled = true;
    if (!global.navigator || !navigator.storage || typeof navigator.storage.persist !== "function") {
      return Promise.resolve();
    }
    return navigator.storage.persist().then(function () {}, function () {});
  }

  function memoryList(ownerKey) {
    return Object.keys(memory.meta)
      .map(function (id) {
        return memory.meta[id];
      })
      .filter(function (row) {
        return row.ownerKey === ownerKey;
      });
  }

  function sortList(rows) {
    return rows.slice().sort(function (a, b) {
      if (a.mediaClass !== b.mediaClass) {
        return a.mediaClass === "photo" ? -1 : 1;
      }
      if (a.mediaClass === "photo" && !!a.primary !== !!b.primary) {
        return a.primary ? -1 : 1;
      }
      var ta = String(a.takenAt || (a.meta && a.meta.createdAt) || "");
      var tb = String(b.takenAt || (b.meta && b.meta.createdAt) || "");
      if (ta !== tb) {
        return ta < tb ? -1 : 1;
      }
      return String(a.mediaId).localeCompare(String(b.mediaId));
    });
  }

  function list(owner) {
    var key = ownerKeyOf(owner);
    if (useMemory) {
      return Promise.resolve(sortList(memoryList(key)).map(clone));
    }
    return openDb().then(function (db) {
      var tx = db.transaction("meta", "readonly");
      var index = tx.objectStore("meta").index("ownerKey");
      return idbRequest(index.getAll(key)).then(function (rows) {
        return sortList(rows || []).map(clone);
      });
    });
  }

  function getMeta(mediaId) {
    var id = String(mediaId || "").trim();
    if (!id) {
      return Promise.reject(MediaError("NOT_FOUND", "Media id is required."));
    }
    if (useMemory) {
      return memory.meta[id]
        ? Promise.resolve(clone(memory.meta[id]))
        : Promise.reject(MediaError("NOT_FOUND", "Media not found."));
    }
    return openDb().then(function (db) {
      var tx = db.transaction("meta", "readonly");
      return idbRequest(tx.objectStore("meta").get(id)).then(function (row) {
        if (!row) {
          throw MediaError("NOT_FOUND", "Media not found.");
        }
        return clone(row);
      });
    });
  }

  function findByOwnerSha(token) {
    if (!token) {
      return Promise.resolve(null);
    }
    if (useMemory) {
      var id;
      for (id in memory.meta) {
        if (memory.meta[id].ownerSha === token) {
          return Promise.resolve(clone(memory.meta[id]));
        }
      }
      return Promise.resolve(null);
    }
    return openDb().then(function (db) {
      var tx = db.transaction("meta", "readonly");
      return idbRequest(tx.objectStore("meta").index("ownerSha").get(token)).then(
        function (row) {
          return row ? clone(row) : null;
        }
      );
    });
  }

  function blobRecord(mediaId, role, mime, bytes, payload) {
    return {
      mediaId: mediaId,
      role: role,
      mime: mime || "application/octet-stream",
      bytes: bytes || sourceSize(payload),
      blob: payload
    };
  }

  function writeAll(row, parts) {
    if (useMemory) {
      memory.meta[row.mediaId] = clone(row);
      delete memory.meta[row.mediaId].blob;
      parts.forEach(function (part) {
        memory.blobs[row.mediaId + ":" + part.role] = part;
      });
      return Promise.resolve(clone(row));
    }
    return openDb().then(function (db) {
      var tx = db.transaction(["meta", "blobs"], "readwrite");
      tx.objectStore("meta").put(row);
      parts.forEach(function (part) {
        tx.objectStore("blobs").put(part);
      });
      return txDone(tx).then(function () {
        return clone(row);
      });
    });
  }

  function demoteOtherPrimaries(rows, exceptId) {
    (rows || []).forEach(function (row) {
      if (row.mediaClass === "photo" && row.primary && row.mediaId !== exceptId) {
        row.primary = false;
        row.meta = stampMeta(row, "commit");
      }
    });
  }

  function setPrimary(mediaId) {
    return getMeta(mediaId).then(function (row) {
      if (row.mediaClass !== "photo") {
        throw MediaError("NOT_A_PHOTO", "Only photos can be primary.");
      }
      row.primary = true;
      row.meta = stampMeta(row, "commit");
      if (useMemory) {
        demoteOtherPrimaries(memoryList(row.ownerKey), row.mediaId);
        memory.meta[row.mediaId].primary = true;
        memory.meta[row.mediaId].meta = row.meta;
        return clone(memory.meta[row.mediaId]);
      }
      return openDb().then(function (db) {
        var tx = db.transaction("meta", "readwrite");
        var store = tx.objectStore("meta");
        return idbRequest(store.index("ownerKey").getAll(row.ownerKey)).then(
          function (rows) {
            demoteOtherPrimaries(rows, row.mediaId);
            (rows || []).forEach(function (item) {
              if (item.mediaId === row.mediaId) {
                item.primary = true;
                item.meta = row.meta;
              }
              store.put(item);
            });
            if (!(rows || []).some(function (item) {
              return item.mediaId === row.mediaId;
            })) {
              store.put(row);
            }
            return txDone(tx).then(function () {
              return clone(row);
            });
          }
        );
      });
    });
  }

  function update(mediaId, input) {
    input = input || {};
    return getMeta(mediaId).then(function (row) {
      var fields = input.fields || input;
      ["caption", "place", "notes", "kind", "originalName"].forEach(
        function (key) {
          if (fields[key] != null) {
            row[key] = String(fields[key]);
          }
        }
      );
      if (fields.takenAt != null) {
        var taken = normalizeTakenAt(fields.takenAt);
        row.takenAt = taken.takenAt;
        row.takenAtPrecision =
          fields.takenAtPrecision || taken.precision || row.takenAtPrecision || "";
      }
      if (fields.takenAtPrecision != null && fields.takenAt == null) {
        row.takenAtPrecision = String(fields.takenAtPrecision || "");
      }
      if (fields.takenAtApproximate != null) {
        row.takenAtApproximate = !!fields.takenAtApproximate;
      }
      if (fields.takenAtSource != null) {
        row.takenAtSource = String(fields.takenAtSource || "");
      }
      if (fields.captionCustom != null) {
        row.captionCustom = !!fields.captionCustom;
      }
      if (fields.tags) {
        row.tags = Array.isArray(fields.tags) ? fields.tags.slice() : [];
      }
      if (fields.crop !== undefined) {
        row.crop = fields.crop;
      }
      if (fields.width) {
        row.width = Number(fields.width) || row.width;
      }
      if (fields.height) {
        row.height = Number(fields.height) || row.height;
      }
      row.meta = stampMeta(row, "commit");
      var parts = [];
      if (input.display) {
        parts.push(
          blobRecord(
            row.mediaId,
            "display",
            "image/jpeg",
            sourceSize(input.display),
            input.display
          )
        );
      }
      if (input.thumb) {
        parts.push(
          blobRecord(
            row.mediaId,
            "thumb",
            "image/jpeg",
            sourceSize(input.thumb),
            input.thumb
          )
        );
      }
      if (parts.length) {
        var roles = row.roles || ["original"];
        parts.forEach(function (part) {
          if (roles.indexOf(part.role) === -1) {
            roles.push(part.role);
          }
        });
        row.roles = roles;
      }
      if (useMemory) {
        memory.meta[row.mediaId] = clone(row);
        parts.forEach(function (part) {
          memory.blobs[row.mediaId + ":" + part.role] = part;
        });
        return clone(row);
      }
      return openDb().then(function (db) {
        var tx = db.transaction(["meta", "blobs"], "readwrite");
        tx.objectStore("meta").put(row);
        parts.forEach(function (part) {
          tx.objectStore("blobs").put(part);
        });
        return txDone(tx).then(function () {
          return clone(row);
        });
      });
    });
  }

  function save(input) {
    input = input || {};
    var owner = normalizeOwner(input.owner);
    var mediaClass = input.mediaClass === "file" ? "file" : "photo";
    var original = input.original || input.file || input.bytes;
    if (!original) {
      return Promise.reject(MediaError("BYTES_REQUIRED", "Nothing to save."));
    }
    var bytes = sourceSize(original) || Number(input.bytes) || 0;
    var cap = mediaClass === "photo" ? PHOTO_MAX_BYTES : FILE_MAX_BYTES;
    if (bytes && bytes > cap) {
      return Promise.reject(
        MediaError(
          "FILE_TOO_LARGE",
          mediaClass === "photo"
            ? "Photo is over 15 MB."
            : "File is over 25 MB."
        )
      );
    }
    return checkQuota(bytes || 1).then(function () {
      return sha256Hex(original);
    }).then(function (sha) {
      var token = ownerShaOf(owner.type + ":" + owner.id, sha);
      var ownerKey = owner.type + ":" + owner.id;
      function buildRow(rows) {
        var photoCount = (rows || []).filter(function (item) {
          return item.mediaClass === "photo";
        }).length;
        var fields = Object.assign({}, input.fields || {}, input, {
          owner: owner,
          mediaClass: mediaClass,
          sha256: sha,
          bytes: bytes,
          mime: input.mime || (original && original.type) || "",
          originalName: input.originalName || (original && original.name) || ""
        });
        if (mediaClass === "photo") {
          fields.primary = photoCount === 0 ? true : !!fields.primary;
        } else {
          fields.primary = false;
        }
        var row = createMedia(fields);
        var mime = row.mime || "application/octet-stream";
        var parts = [
          blobRecord(row.mediaId, "original", mime, bytes, original)
        ];
        if (mediaClass === "photo") {
          if (input.display) {
            parts.push(
              blobRecord(
                row.mediaId,
                "display",
                "image/jpeg",
                sourceSize(input.display),
                input.display
              )
            );
          }
          if (input.thumb) {
            parts.push(
              blobRecord(
                row.mediaId,
                "thumb",
                "image/jpeg",
                sourceSize(input.thumb),
                input.thumb
              )
            );
          }
          row.roles = parts.map(function (part) {
            return part.role;
          });
        }
        return { row: row, parts: parts };
      }
      function already(existing) {
        var err = MediaError("ALREADY_SAVED", "Already saved.");
        err.existing = existing;
        throw err;
      }
      if (useMemory) {
        var existingMem = null;
        Object.keys(memory.meta).forEach(function (id) {
          if (memory.meta[id].ownerSha === token) {
            existingMem = memory.meta[id];
          }
        });
        if (existingMem) {
          already(clone(existingMem));
        }
        var built = buildRow(memoryList(ownerKey));
        if (built.row.primary) {
          demoteOtherPrimaries(memoryList(ownerKey), built.row.mediaId);
        }
        return writeAll(built.row, built.parts).then(function (saved) {
          return maybePersist().then(function () {
            return saved;
          });
        });
      }
      return openDb().then(function (db) {
        var tx = db.transaction(["meta", "blobs"], "readwrite");
        var metaStore = tx.objectStore("meta");
        return idbRequest(metaStore.index("ownerSha").get(token)).then(
          function (existing) {
            if (existing) {
              already(clone(existing));
            }
            return idbRequest(metaStore.index("ownerKey").getAll(ownerKey)).then(
              function (rows) {
                var built = buildRow(rows || []);
                if (built.row.primary) {
                  demoteOtherPrimaries(rows, built.row.mediaId);
                  (rows || []).forEach(function (item) {
                    metaStore.put(item);
                  });
                }
                metaStore.put(built.row);
                built.parts.forEach(function (part) {
                  tx.objectStore("blobs").put(part);
                });
                return txDone(tx).then(function () {
                  return maybePersist().then(function () {
                    return clone(built.row);
                  });
                });
              }
            );
          }
        );
      });
    });
  }

  function getBlob(mediaId, role) {
    var id = String(mediaId || "").trim();
    var want = String(role || "original").trim() || "original";
    if (useMemory) {
      var rec = memory.blobs[id + ":" + want];
      return rec
        ? Promise.resolve({
            mediaId: rec.mediaId,
            role: rec.role,
            mime: rec.mime,
            bytes: rec.bytes,
            blob: rec.blob
          })
        : Promise.reject(MediaError("NOT_FOUND", "Blob not found."));
    }
    return openDb().then(function (db) {
      var tx = db.transaction("blobs", "readonly");
      return idbRequest(tx.objectStore("blobs").get([id, want])).then(function (rec) {
        if (!rec) {
          throw MediaError("NOT_FOUND", "Blob not found.");
        }
        return rec;
      });
    });
  }

  function deleteBlobsFor(row, blobStore) {
    var roles = row.roles && row.roles.length ? row.roles : ["original", "display", "thumb"];
    roles.forEach(function (role) {
      if (blobStore) {
        blobStore.delete([row.mediaId, role]);
      } else {
        delete memory.blobs[row.mediaId + ":" + role];
      }
    });
  }

  function promoteFirstPhoto(rows, store) {
    var photos = (rows || []).filter(function (item) {
      return item.mediaClass === "photo";
    });
    if (!photos.length) {
      return null;
    }
    if (photos.some(function (item) {
      return item.primary;
    })) {
      return photos.filter(function (item) {
        return item.primary;
      })[0];
    }
    photos[0].primary = true;
    photos[0].meta = stampMeta(photos[0], "commit");
    if (store) {
      store.put(photos[0]);
    }
    return photos[0];
  }

  function remove(mediaId) {
    return getMeta(mediaId).then(function (row) {
      if (useMemory) {
        delete memory.meta[row.mediaId];
        deleteBlobsFor(row, null);
        if (row.mediaClass === "photo" && row.primary) {
          promoteFirstPhoto(memoryList(row.ownerKey), null);
        }
        return { removed: row.mediaId };
      }
      return openDb().then(function (db) {
        var tx = db.transaction(["meta", "blobs"], "readwrite");
        var metaStore = tx.objectStore("meta");
        var blobStore = tx.objectStore("blobs");
        metaStore.delete(row.mediaId);
        deleteBlobsFor(row, blobStore);
        if (row.mediaClass === "photo" && row.primary) {
          return idbRequest(metaStore.index("ownerKey").getAll(row.ownerKey)).then(
            function (rows) {
              var remaining = (rows || []).filter(function (item) {
                return item.mediaId !== row.mediaId;
              });
              promoteFirstPhoto(remaining, metaStore);
              return txDone(tx).then(function () {
                return { removed: row.mediaId };
              });
            }
          );
        }
        return txDone(tx).then(function () {
          return { removed: row.mediaId };
        });
      });
    });
  }

  function listAll() {
    if (useMemory) {
      return Promise.resolve(
        Object.keys(memory.meta).map(function (id) {
          return clone(memory.meta[id]);
        })
      );
    }
    return openDb().then(function (db) {
      var tx = db.transaction("meta", "readonly");
      return idbRequest(tx.objectStore("meta").getAll()).then(function (rows) {
        return (rows || []).map(clone);
      });
    });
  }

  function removeByOwner(owner) {
    return list(owner).then(function (rows) {
      var i = 0;
      function next() {
        if (i >= rows.length) {
          return Promise.resolve({ removed: rows.length });
        }
        var id = rows[i].mediaId;
        i += 1;
        return remove(id).then(next, next);
      }
      return next();
    });
  }

  var BASE64 =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

  function bytesToBase64(source) {
    return asArrayBuffer(source).then(function (buf) {
      var bytes = new Uint8Array(buf);
      var out = "";
      var i;
      for (i = 0; i < bytes.length; i += 3) {
        var a = bytes[i];
        var b = i + 1 < bytes.length ? bytes[i + 1] : 0;
        var c = i + 2 < bytes.length ? bytes[i + 2] : 0;
        out += BASE64[a >> 2];
        out += BASE64[((a & 3) << 4) | (b >> 4)];
        out += i + 1 < bytes.length ? BASE64[((b & 15) << 2) | (c >> 6)] : "=";
        out += i + 2 < bytes.length ? BASE64[c & 63] : "=";
      }
      return out;
    });
  }

  function base64ToBytes(text) {
    var clean = String(text || "").replace(/=+$/, "");
    var len = clean.length;
    var out = [];
    var i;
    for (i = 0; i < len; i += 4) {
      var a = BASE64.indexOf(clean.charAt(i));
      var b = BASE64.indexOf(clean.charAt(i + 1));
      var c = i + 2 < len ? BASE64.indexOf(clean.charAt(i + 2)) : -1;
      var d = i + 3 < len ? BASE64.indexOf(clean.charAt(i + 3)) : -1;
      out.push((a << 2) | (b >> 4));
      if (c >= 0) {
        out.push(((b & 15) << 4) | (c >> 2));
      }
      if (d >= 0) {
        out.push(((c & 3) << 6) | d);
      }
    }
    return new Uint8Array(out);
  }

  function exportBundle() {
    return listAll().then(function (rows) {
      var out = [];
      var i = 0;
      function next() {
        if (i >= rows.length) {
          return Promise.resolve(out);
        }
        var row = rows[i];
        i += 1;
        var roles = row.roles && row.roles.length ? row.roles : ["original"];
        var blobs = [];
        var r = 0;
        function nextBlob() {
          if (r >= roles.length) {
            out.push({ meta: row, blobs: blobs });
            return next();
          }
          var role = roles[r];
          r += 1;
          return getBlob(row.mediaId, role).then(
            function (part) {
              return bytesToBase64(part.blob).then(function (b64) {
                blobs.push({
                  role: part.role,
                  mime: part.mime,
                  bytes: part.bytes,
                  base64: b64
                });
                return nextBlob();
              });
            },
            function () {
              return nextBlob();
            }
          );
        }
        return nextBlob();
      }
      return next();
    });
  }

  function importBundle(items) {
    var rows = Array.isArray(items) ? items : [];
    var i = 0;
    var added = 0;
    var skipped = 0;
    function next() {
      if (i >= rows.length) {
        return Promise.resolve({ added: added, skipped: skipped });
      }
      var item = rows[i] || {};
      i += 1;
      var meta = item.meta;
      if (!meta || !meta.mediaId || !meta.owner) {
        skipped += 1;
        return next();
      }
      var token = meta.ownerSha || ownerShaOf(meta.ownerKey, meta.sha256);
      return findByOwnerSha(token).then(function (existing) {
        if (existing || memory.meta[meta.mediaId]) {
          skipped += 1;
          return next();
        }
        var parts = (item.blobs || []).map(function (part) {
          return blobRecord(
            meta.mediaId,
            part.role || "original",
            part.mime || meta.mime,
            part.bytes,
            base64ToBytes(part.base64)
          );
        });
        if (!parts.length) {
          skipped += 1;
          return next();
        }
        return writeAll(createMedia(meta), parts).then(function () {
          added += 1;
          return next();
        }, function () {
          skipped += 1;
          return next();
        });
      });
    }
    return next();
  }

  model.createMedia = createMedia;
  model.normalizeTakenAt = normalizeTakenAt;
  model.formatTakenAt = formatTakenAt;
  model.formatTakenAtInput = formatTakenAtInput;
  model.formatPhotoCaption = formatPhotoCaption;
  model.MEDIA_OWNER_TYPES = Object.keys(OWNER_TYPES);
  model.MEDIA_DB = DB_NAME;
  model.PHOTO_MAX_BYTES = PHOTO_MAX_BYTES;
  model.FILE_MAX_BYTES = FILE_MAX_BYTES;

  function queryParam(name) {
    try {
      return new URLSearchParams(window.location.search).get(name) || "";
    } catch (error) {
      return "";
    }
  }

  function ownerFromPage() {
    var type = String(queryParam("ownerType") || "").trim().toUpperCase();
    var id = String(queryParam("id") || queryParam("recordId") || "").trim();
    var leadId = String(queryParam("leadId") || "").trim();
    var encounterId = String(queryParam("encounterId") || "").trim();
    if (!type && leadId) {
      type = "PERSON";
    }
    if (type === "PERSON" && !id && leadId && model.store && typeof model.store.getLead === "function") {
      if (typeof model.store.loadFromDisk === "function") {
        model.store.loadFromDisk();
      }
      var lead = model.store.getLead(leadId);
      id = (lead && lead.subjectPersonId) || "";
    }
    if (!type || !id) {
      return null;
    }
    return {
      type: type,
      id: id,
      leadId: leadId,
      encounterId: encounterId
    };
  }

  function safeReturnPath(raw) {
    var value = String(raw || "").trim();
    if (!/^[a-z0-9._-]+\.html(?:\?.*)?$/i.test(value)) {
      return "";
    }
    return value;
  }

  function returnHref(owner) {
    var fromQuery = safeReturnPath(queryParam("return"));
    if (fromQuery) {
      return fromQuery;
    }
    if (!owner) {
      return "";
    }
    if (owner.leadId) {
      return "case.html?id=" + encodeURIComponent(owner.leadId);
    }
    if (owner.encounterId || owner.type === "ENCOUNTER") {
      return "encounter-form.html?id=" + encodeURIComponent(owner.encounterId || owner.id);
    }
    if (owner.type === "OFFICER") {
      return "officer.html?id=" + encodeURIComponent(owner.id);
    }
    if (owner.type === "VEHICLE") {
      return "vehicle.html?id=" + encodeURIComponent(owner.id);
    }
    if (owner.type === "BOOKIN") {
      return "bookin.html?recordId=" + encodeURIComponent(owner.id);
    }
    if (owner.type === "PERSON") {
      return "leads.html";
    }
    return "";
  }

  root.media = {
    save: save,
    update: update,
    list: list,
    listAll: listAll,
    get: getMeta,
    blob: getBlob,
    remove: remove,
    removeByOwner: removeByOwner,
    setPrimary: setPrimary,
    exportBundle: exportBundle,
    importBundle: importBundle,
    ownerKey: ownerKeyOf,
    ownerFromPage: ownerFromPage,
    returnHref: returnHref,
    DISPLAY_MAX_EDGE: 1920,
    THUMB_MAX_EDGE: 320,
    _resetForTests: resetForTests
  };
})(typeof window !== "undefined" ? window : globalThis);
