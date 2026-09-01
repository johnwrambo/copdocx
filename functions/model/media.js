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
      takenAt: String(fields.takenAt || "").trim(),
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

  function clearPrimaryOnOwner(ownerKey, exceptId) {
    function demote(rows) {
      rows.forEach(function (row) {
        if (row.mediaClass === "photo" && row.primary && row.mediaId !== exceptId) {
          row.primary = false;
        }
      });
    }
    if (useMemory) {
      demote(memoryList(ownerKey));
      return Promise.resolve();
    }
    return openDb().then(function (db) {
      var tx = db.transaction("meta", "readwrite");
      var index = tx.objectStore("meta").index("ownerKey");
      return idbRequest(index.getAll(ownerKey)).then(function (rows) {
        (rows || []).forEach(function (row) {
          if (row.mediaClass === "photo" && row.primary && row.mediaId !== exceptId) {
            row.primary = false;
            tx.objectStore("meta").put(row);
          }
        });
        return txDone(tx);
      });
    });
  }

  function promoteNextPrimary(owner) {
    return list(owner).then(function (rows) {
      var photos = rows.filter(function (row) {
        return row.mediaClass === "photo";
      });
      if (!photos.length) {
        return null;
      }
      var current = photos.filter(function (row) {
        return row.primary;
      })[0];
      if (current) {
        return current;
      }
      return setPrimary(photos[0].mediaId);
    });
  }

  function setPrimary(mediaId) {
    return getMeta(mediaId).then(function (row) {
      if (row.mediaClass !== "photo") {
        throw MediaError("NOT_A_PHOTO", "Only photos can be primary.");
      }
      return clearPrimaryOnOwner(row.ownerKey, row.mediaId).then(function () {
        row.primary = true;
        row.meta = stampMeta(row, "commit");
        if (useMemory) {
          memory.meta[row.mediaId].primary = true;
          memory.meta[row.mediaId].meta = row.meta;
          return clone(memory.meta[row.mediaId]);
        }
        return openDb().then(function (db) {
          var tx = db.transaction("meta", "readwrite");
          tx.objectStore("meta").put(row);
          return txDone(tx).then(function () {
            return clone(row);
          });
        });
      });
    });
  }

  function update(mediaId, input) {
    input = input || {};
    return getMeta(mediaId).then(function (row) {
      var fields = input.fields || input;
      ["caption", "takenAt", "place", "notes", "kind", "originalName"].forEach(
        function (key) {
          if (fields[key] != null) {
            row[key] = String(fields[key]);
          }
        }
      );
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
      return findByOwnerSha(token).then(function (existing) {
        if (existing) {
          var err = MediaError("ALREADY_SAVED", "Already saved.");
          err.existing = existing;
          throw err;
        }
        return list(owner).then(function (rows) {
          var photoCount = rows.filter(function (row) {
            return row.mediaClass === "photo";
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
          var write = function () {
            if (row.primary) {
              return clearPrimaryOnOwner(row.ownerKey, row.mediaId).then(function () {
                return writeAll(row, parts);
              });
            }
            return writeAll(row, parts);
          };
          return write().then(function (saved) {
            return maybePersist().then(function () {
              return saved;
            });
          });
        });
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

  function remove(mediaId) {
    return getMeta(mediaId).then(function (row) {
      var roles = row.roles && row.roles.length ? row.roles : ["original", "display", "thumb"];
      var after = function () {
        if (row.mediaClass === "photo" && row.primary) {
          return promoteNextPrimary(row.owner);
        }
        return null;
      };
      if (useMemory) {
        delete memory.meta[row.mediaId];
        roles.forEach(function (role) {
          delete memory.blobs[row.mediaId + ":" + role];
        });
        return Promise.resolve(after()).then(function () {
          return { removed: row.mediaId };
        });
      }
      return openDb().then(function (db) {
        var tx = db.transaction(["meta", "blobs"], "readwrite");
        tx.objectStore("meta").delete(row.mediaId);
        roles.forEach(function (role) {
          tx.objectStore("blobs").delete([row.mediaId, role]);
        });
        return txDone(tx).then(function () {
          return after();
        }).then(function () {
          return { removed: row.mediaId };
        });
      });
    });
  }

  model.createMedia = createMedia;
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
      return "lead.html?id=" + encodeURIComponent(owner.leadId);
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
    get: getMeta,
    blob: getBlob,
    remove: remove,
    setPrimary: setPrimary,
    ownerKey: ownerKeyOf,
    ownerFromPage: ownerFromPage,
    returnHref: returnHref,
    DISPLAY_MAX_EDGE: 1920,
    THUMB_MAX_EDGE: 320,
    _resetForTests: resetForTests
  };
})(typeof window !== "undefined" ? window : globalThis);
