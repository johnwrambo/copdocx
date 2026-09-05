"use strict";

var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");
var nodeCrypto = require("crypto");
var TextEncoderCtor = require("util").TextEncoder;
var TextDecoderCtor = require("util").TextDecoder;

var SOURCE = fs.readFileSync(
  path.join(__dirname, "..", "functions", "safety-backup.js"),
  "utf8"
);

var REGISTRY = [
  {
    id: "workspace",
    key: "copdocx.store.v1",
    medium: "localStorage",
    owner: "model/store",
    portable: true
  },
  {
    id: "emptyLocal",
    key: "test.empty.local",
    medium: "localStorage",
    owner: "test/empty",
    portable: false
  },
  {
    id: "malformedLocal",
    key: "test.malformed.local",
    medium: "localStorage",
    owner: "test/malformed",
    portable: true
  },
  {
    id: "missingLocal",
    key: "test.missing.local",
    medium: "localStorage",
    owner: "test/missing",
    portable: false
  },
  {
    id: "literalNull",
    key: "test.literal-null.local",
    medium: "localStorage",
    owner: "test/literal-null",
    portable: true
  },
  {
    id: "investigationWindows",
    key: "copdocx.investigation-windows.v1",
    medium: "sessionStorage",
    owner: "investigation-wall",
    portable: false
  },
  {
    id: "emptySession",
    key: "test.empty.session",
    medium: "sessionStorage",
    owner: "test/empty-session",
    portable: false
  },
  {
    id: "missingSession",
    key: "test.missing.session",
    medium: "sessionStorage",
    owner: "test/missing-session",
    portable: false
  },
  {
    id: "media",
    key: "copdocx.media.v1",
    medium: "indexedDB",
    owner: "model/media",
    portable: true
  },
  {
    id: "warrants",
    key: "copdocx.warrants",
    medium: "indexedDB",
    owner: "warrant-issue",
    portable: false
  },
  {
    id: "retiredCaseLayout",
    key: "copdocx.case-view.layout.v1",
    medium: "retired",
    owner: "leads",
    portable: false
  }
];

var WORKSPACE_RAW =
  '{"schema":"copdocx.store.v1","leads":[{"id":"lead_draft","draft":true}],"note":"keep é exactly"}\n';

var LOCAL_VALUES = {
  "copdocx.store.v1": WORKSPACE_RAW,
  "test.empty.local": "",
  "test.malformed.local": "{ definitely-not-json",
  "test.literal-null.local": "null"
};

var SESSION_VALUES = {
  "copdocx.investigation-windows.v1":
    '{"windows":[{"id":"draft-window","draft":true}]}',
  "test.empty.session": ""
};

function own(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function makeStorage(initial, options) {
  var values = Object.assign({}, initial || {});
  var reads = Object.create(null);
  var calls = { setItem: 0, removeItem: 0, clear: 0 };
  var settings = options || {};

  return {
    getItem: function (key) {
      reads[key] = (reads[key] || 0) + 1;
      var value = own(values, key) ? values[key] : null;
      if (
        settings.changeAfterFirstRead &&
        own(settings.changeAfterFirstRead, key) &&
        reads[key] === 1
      ) {
        // Simulate another tab committing after the first snapshot read.
        values[key] = settings.changeAfterFirstRead[key];
      }
      return value;
    },
    setItem: function (key, value) {
      calls.setItem += 1;
      values[key] = String(value);
    },
    removeItem: function (key) {
      calls.removeItem += 1;
      delete values[key];
    },
    clear: function () {
      calls.clear += 1;
      values = {};
    },
    _reads: reads,
    _calls: calls
  };
}

function makeReadOnlyIndexedDB(metadata, blobRows) {
  var metrics = {
    opens: 0,
    closes: 0,
    transactionModes: []
  };

  function transaction() {
    var pending = 0;
    var completionScheduled = false;
    var tx = {
      error: null,
      onabort: null,
      oncomplete: null,
      onerror: null,
      objectStore: function (name) {
        var isMeta = name === "meta";
        return {
          autoIncrement: false,
          indexNames: [],
          keyPath: isMeta ? "mediaId" : ["mediaId", "role"],
          getAll: function () {
            var request = { error: null, result: null };
            var result = isMeta ? metadata : blobRows;
            pending += 1;
            setTimeout(function () {
              request.result = result.slice();
              if (typeof request.onsuccess === "function") {
                request.onsuccess();
              }
              pending -= 1;
              completeWhenReady();
            }, 0);
            return request;
          },
          index: function () {
            throw new Error("fixture has no indexes");
          }
        };
      }
    };

    function completeWhenReady() {
      if (pending || completionScheduled) {
        return;
      }
      completionScheduled = true;
      setTimeout(function () {
        if (typeof tx.oncomplete === "function") {
          tx.oncomplete();
        }
      }, 0);
    }

    return tx;
  }

  var db = {
    objectStoreNames: ["meta", "blobs"],
    version: 1,
    close: function () {
      metrics.closes += 1;
    },
    transaction: function (names, mode) {
      metrics.transactionModes.push(mode);
      assert.deepStrictEqual(Array.prototype.slice.call(names), ["meta", "blobs"]);
      return transaction();
    }
  };

  return {
    api: {
      databases: function () {
        return Promise.resolve([{ name: "copdocx.media.v1", version: 1 }]);
      },
      open: function (name) {
        var request = { error: null, result: null, transaction: null };
        metrics.opens += 1;
        assert.strictEqual(name, "copdocx.media.v1");
        setTimeout(function () {
          request.result = db;
          if (typeof request.onsuccess === "function") {
            request.onsuccess();
          }
        }, 0);
        return request;
      }
    },
    metrics: metrics
  };
}

function harness(options) {
  var settings = options || {};
  var localStorage = makeStorage(
    LOCAL_VALUES,
    settings.localStorageOptions
  );
  var sessionStorage = makeStorage(
    SESSION_VALUES,
    settings.sessionStorageOptions
  );
  var context = {
    ArrayBuffer: ArrayBuffer,
    Blob: typeof Blob === "undefined" ? undefined : Blob,
    COPDoc: {
      config: {
        productName: "COPDoc Test",
        productVersion: "9.9.9-test",
        storageEntries: REGISTRY
      }
    },
    TextDecoder: TextDecoderCtor,
    TextEncoder: TextEncoderCtor,
    Uint8Array: Uint8Array,
    console: console,
    crypto: nodeCrypto.webcrypto,
    clearTimeout: clearTimeout,
    document: undefined,
    indexedDB: settings.indexedDB,
    localStorage: localStorage,
    sessionStorage: sessionStorage,
    setTimeout: setTimeout,
    URL: undefined
  };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  require("./support/module-dependencies.js").loadDependencies(context, "functions/safety-backup.js");
  vm.runInContext(SOURCE, context, { filename: "functions/safety-backup.js" });
  return {
    backup: context.COPDoc.safetyBackup,
    localStorage: localStorage,
    sessionStorage: sessionStorage
  };
}

function digest(text) {
  return nodeCrypto.createHash("sha256").update(text, "utf8").digest("hex");
}

function rows(archive) {
  return Array.prototype.slice
    .call(archive.stores.localStorage)
    .concat(Array.prototype.slice.call(archive.stores.sessionStorage));
}

function rowById(archive, id) {
  return rows(archive).filter(function (row) {
    return row.id === id;
  })[0];
}

function verifyAsync(backup, archive) {
  return Promise.resolve().then(function () {
    return backup.verify(archive);
  });
}

function assertNoMutations(instance, label) {
  [instance.localStorage, instance.sessionStorage].forEach(function (storage) {
    assert.strictEqual(storage._calls.setItem, 0, label + " must not call setItem");
    assert.strictEqual(storage._calls.removeItem, 0, label + " must not call removeItem");
    assert.strictEqual(storage._calls.clear, 0, label + " must not call clear");
  });
}

function assertReads(instance, expected, label) {
  REGISTRY.filter(function (entry) {
    return entry.medium === "localStorage" || entry.medium === "sessionStorage";
  }).forEach(function (entry) {
    var storage = entry.medium === "localStorage"
      ? instance.localStorage
      : instance.sessionStorage;
    assert.strictEqual(
      storage._reads[entry.key],
      expected,
      label + " should read " + entry.id + " exactly " + expected + " times"
    );
  });
}

async function testStableArchive() {
  var instance = harness();
  var backup = instance.backup;
  var report = {
    schema: "copdocx.integrity-report.v1",
    readOnly: true,
    summary: { total: 2 }
  };
  var archive = await backup.collect(report);

  assert.strictEqual(backup.FORMAT, "copdocx.safety-backup.v1");
  assert.strictEqual(archive.format, backup.FORMAT);
  assert.strictEqual(archive.schemaVersion, 1);
  assert.strictEqual(archive.metadata.productName, "COPDoc Test");
  assert.strictEqual(archive.metadata.appVersion, "9.9.9-test");
  assert.strictEqual(archive.metadata.captureComplete, true);
  assert.strictEqual(archive.metadata.unencrypted, true);
  assert.match(archive.metadata.backupId, /^backup_\d+$/);
  assert.match(archive.metadata.manifestSha256, /^[0-9a-f]{64}$/);
  assert.deepStrictEqual(clone(archive.integrityReport), report);

  assert.deepStrictEqual(clone(archive.metadata.counts), {
    registeredLocalStores: 5,
    presentLocalStores: 4,
    registeredSessionStores: 3,
    presentSessionStores: 2,
    mediaRecords: 0,
    mediaBlobs: 0
  });
  assert(archive.metadata.exclusions.length >= 4);
  assert(
    archive.metadata.exclusions.some(function (line) {
      return /Unsaved form/.test(line);
    }),
    "archive must disclose exclusion of unsaved UI state"
  );
  assert(
    archive.metadata.exclusions.some(function (line) {
      return /warrant directory handle/.test(line);
    }),
    "archive must disclose the nonportable warrant handle"
  );
  assert(
    archive.metadata.exclusions.some(function (line) {
      return /Restore automation/.test(line);
    }),
    "archive must disclose that Stage 0 does not restore"
  );
  assert(
    archive.metadata.exclusions.some(function (line) {
      return /session and signal values/.test(line);
    }),
    "archive must disclose that session evidence is not auto-restorable"
  );

  assert.strictEqual(archive.stores.localStorage.length, 5);
  assert.strictEqual(archive.stores.sessionStorage.length, 3);
  assert.strictEqual(rows(archive).length, 8);
  assert.deepStrictEqual(
    Array.prototype.map.call(archive.stores.localStorage, function (row) {
      return row.id;
    }),
    REGISTRY.filter(function (entry) {
      return entry.medium === "localStorage";
    }).map(function (entry) {
      return entry.id;
    }),
    "every registered localStorage entry must appear exactly once"
  );
  assert.deepStrictEqual(
    Array.prototype.map.call(archive.stores.sessionStorage, function (row) {
      return row.id;
    }),
    REGISTRY.filter(function (entry) {
      return entry.medium === "sessionStorage";
    }).map(function (entry) {
      return entry.id;
    }),
    "every registered sessionStorage entry must appear exactly once"
  );
  assert.strictEqual(
    rows(archive).some(function (row) {
      return row.id === "media" || row.id === "warrants" || row.id === "retiredCaseLayout";
    }),
    false,
    "non-Web-Storage registry entries must not masquerade as raw Web Storage"
  );
  assert.strictEqual(archive.stores.media.status, "unavailable");
  assert.strictEqual(archive.stores.media.records.length, 0);
  assert.strictEqual(archive.stores.warrants.status, "unavailable");
  assert(
    archive.metadata.warnings.some(function (line) {
      return /IndexedDB is unavailable/.test(line);
    }),
    "the archive must disclose unavailable IndexedDB"
  );
  assert.strictEqual(archive.verification.algorithm, "SHA-256");
  assert.strictEqual(
    archive.verification.registeredStorageUnchangedDuringCapture,
    true
  );
  assert.strictEqual(archive.verification.archiveVerified, true);
  assert(archive.verification.serializedByteLength > 0);

  var sourceByKey = Object.assign({}, LOCAL_VALUES, SESSION_VALUES);
  rows(archive).forEach(function (row) {
    var registered = REGISTRY.filter(function (entry) {
      return entry.id === row.id;
    })[0];
    assert(registered, row.id + " must be registered");
    assert.strictEqual(row.key, registered.key, row.id + " key mismatch");
    assert.strictEqual(row.owner, registered.owner, row.id + " owner mismatch");
    assert.strictEqual(row.portable, registered.portable, row.id + " portability mismatch");
    var expectedPresent = own(sourceByKey, row.key);
    assert.strictEqual(row.exists, expectedPresent, row.id + " presence mismatch");
    if (expectedPresent) {
      assert.strictEqual(row.raw, sourceByKey[row.key], row.id + " raw bytes changed");
      assert.strictEqual(
        row.byteLength,
        Buffer.byteLength(sourceByKey[row.key], "utf8"),
        row.id + " byte count mismatch"
      );
      assert.strictEqual(row.sha256, digest(sourceByKey[row.key]), row.id + " digest mismatch");
    } else {
      assert.strictEqual(row.raw, null, row.id + " missing value must remain null");
      assert.strictEqual(row.byteLength, 0, row.id + " missing value must have zero bytes");
      assert.strictEqual(row.sha256, null, row.id + " missing value must not have a digest");
    }
  });

  assert.strictEqual(rowById(archive, "workspace").raw, WORKSPACE_RAW);
  assert.strictEqual(rowById(archive, "workspace").owner, "model/store");
  assert.strictEqual(rowById(archive, "workspace").portable, true);
  assert(rowById(archive, "workspace").raw.indexOf('"draft":true') !== -1);
  assert.strictEqual(rowById(archive, "malformedLocal").raw, "{ definitely-not-json");
  assert.strictEqual(rowById(archive, "emptyLocal").exists, true);
  assert.strictEqual(rowById(archive, "emptyLocal").raw, "");
  assert.strictEqual(rowById(archive, "emptyLocal").sha256, digest(""));
  assert.strictEqual(rowById(archive, "missingLocal").exists, false);
  assert.strictEqual(rowById(archive, "missingLocal").raw, null);
  assert.strictEqual(rowById(archive, "literalNull").exists, true);
  assert.strictEqual(rowById(archive, "literalNull").raw, "null");
  assert.strictEqual(rowById(archive, "emptySession").exists, true);
  assert.strictEqual(rowById(archive, "missingSession").exists, false);

  var reordered = {
    localStorage: clone(archive.stores.localStorage).reverse(),
    sessionStorage: clone(archive.stores.sessionStorage).reverse()
  };
  assert.strictEqual(
    backup.rawStorageEqual(archive.stores, reordered),
    true,
    "raw equality must be deterministic and independent of row order"
  );
  var changed = clone(reordered);
  changed.localStorage.filter(function (row) {
    return row.id === "workspace";
  })[0].raw += "changed";
  assert.strictEqual(backup.rawStorageEqual(archive.stores, changed), false);
  var missingBecameEmpty = clone(reordered);
  var formerlyMissing = missingBecameEmpty.localStorage.filter(function (row) {
    return row.id === "missingLocal";
  })[0];
  formerlyMissing.exists = true;
  formerlyMissing.raw = "";
  assert.strictEqual(
    backup.rawStorageEqual(archive.stores, missingBecameEmpty),
    false,
    "raw equality must distinguish missing from present-but-empty"
  );

  assertReads(instance, 2, "collect");
  assertNoMutations(instance, "collect");

  var verified = await backup.verify(archive);
  assert.strictEqual(verified.ok, true);
  assert.strictEqual(verified.manifestSha256, archive.metadata.manifestSha256);

  var downloaded = await backup.download(report);
  assert.strictEqual(downloaded.ok, true);
  assert.strictEqual(downloaded.archive.format, backup.FORMAT);
  assert.deepStrictEqual(clone(downloaded.archive.integrityReport), report);
  assert.match(downloaded.filename, /^COPDoc_full_backup_\d{8}_\d{6}\.json$/);
  assert.strictEqual(
    backup.rawStorageEqual(archive.stores, downloaded.archive.stores),
    true,
    "DOM-free download must return the same raw snapshot"
  );
  assert.strictEqual(
    downloaded.archive.metadata.manifestSha256,
    archive.metadata.manifestSha256,
    "unchanged inputs must yield the same manifest"
  );
  assertReads(instance, 4, "collect plus DOM-free download");
  assertNoMutations(instance, "DOM-free download");
}

async function testConcurrentStorageChangeAborts() {
  var instance = harness({
    localStorageOptions: {
      changeAfterFirstRead: {
        "copdocx.store.v1":
          '{"schema":"copdocx.store.v1","leads":[{"id":"lead_other_tab"}]}'
      }
    }
  });

  await assert.rejects(
    instance.backup.collect(),
    /storage changed while the backup was being collected/,
    "a changing registered value must invalidate the entire archive"
  );
  assertReads(instance, 2, "aborted concurrent capture");
  assertNoMutations(instance, "aborted concurrent capture");
}

async function testSerializeMediaBlobs() {
  assert.strictEqual(typeof Blob, "function", "this test requires Node's real Blob");
  var backup = harness().backup;
  var healthyBytes = Buffer.from("healthy original payload \u0000 \u00e9", "utf8");
  var healthyHash = nodeCrypto.createHash("sha256").update(healthyBytes).digest("hex");
  var healthyMeta = {
    mediaId: "media_healthy",
    ownerKey: "PERSON:person_1",
    roles: ["original"],
    sha256: healthyHash
  };
  var schemas = [
    { name: "meta", keyPath: "mediaId", autoIncrement: false, indexes: [] },
    { name: "blobs", keyPath: ["mediaId", "role"], autoIncrement: false, indexes: [] }
  ];
  var healthy = await backup._serializeMedia(
    "copdocx.media.v1",
    1,
    ["meta", "blobs"],
    [healthyMeta],
    [
      {
        mediaId: "media_healthy",
        role: "original",
        mime: "image/jpeg",
        bytes: healthyBytes.length,
        blob: new Blob([healthyBytes], { type: "image/jpeg" })
      }
    ],
    schemas
  );

  assert.strictEqual(healthy.status, "ok");
  assert.strictEqual(healthy.integrityValid, true);
  assert.strictEqual(healthy.warnings.length, 0);
  assert.strictEqual(healthy.records.length, 1);
  assert.strictEqual(healthy.records[0].meta, healthyMeta);
  assert.strictEqual(healthy.records[0].blobs.length, 1);
  assert.strictEqual(healthy.orphanBlobs.length, 0);
  var healthyPart = healthy.records[0].blobs[0];
  assert.strictEqual(healthyPart.mediaId, "media_healthy");
  assert.strictEqual(healthyPart.role, "original");
  assert.strictEqual(healthyPart.mime, "image/jpeg");
  assert.strictEqual(healthyPart.declaredBytes, healthyBytes.length);
  assert.strictEqual(healthyPart.byteLength, healthyBytes.length);
  assert.strictEqual(healthyPart.sha256, healthyHash);
  assert.strictEqual(healthyPart.base64, healthyBytes.toString("base64"));

  var missingBytes = Buffer.from("original without declared thumbnail", "utf8");
  var orphanBytes = Buffer.from("orphan payload retained", "utf8");
  var warned = await backup._serializeMedia(
    "copdocx.media.v1",
    1,
    ["meta", "blobs"],
    [
      {
        mediaId: "media_missing_role",
        roles: ["original", "thumbnail"],
        sha256: nodeCrypto.createHash("sha256").update(missingBytes).digest("hex")
      }
    ],
    [
      {
        mediaId: "media_missing_role",
        role: "original",
        mime: "image/png",
        bytes: missingBytes.length,
        blob: new Blob([missingBytes], { type: "image/png" })
      },
      {
        mediaId: "media_orphan",
        role: "original",
        mime: "application/pdf",
        bytes: orphanBytes.length,
        blob: new Blob([orphanBytes], { type: "application/pdf" })
      }
    ],
    schemas
  );

  assert.strictEqual(warned.integrityValid, false);
  assert.strictEqual(warned.records.length, 1, "declared metadata must not be omitted");
  assert.strictEqual(
    warned.records[0].blobs.length,
    1,
    "available roles must remain archived when another declared role is missing"
  );
  assert.strictEqual(
    warned.records[0].blobs[0].base64,
    missingBytes.toString("base64")
  );
  assert.strictEqual(warned.orphanBlobs.length, 1, "orphan payload must not be omitted");
  assert.strictEqual(warned.orphanBlobs[0].mediaId, "media_orphan");
  assert.strictEqual(warned.orphanBlobs[0].base64, orphanBytes.toString("base64"));
  assert(
    warned.warnings.some(function (line) {
      return /media_missing_role is missing declared role thumbnail/.test(line);
    }),
    "missing declared role must be reported"
  );
  assert(
    warned.warnings.some(function (line) {
      return /Media blob media_orphan has no metadata record/.test(line);
    }),
    "orphan payload must be reported"
  );

  var mismatchBytes = Buffer.from("payload whose metadata digest is stale", "utf8");
  var mismatch = await backup._serializeMedia(
    "copdocx.media.v1",
    1,
    ["meta", "blobs"],
    [{ mediaId: "media_mismatch", roles: ["original"], sha256: "0".repeat(64) }],
    [
      {
        mediaId: "media_mismatch",
        role: "original",
        mime: "image/jpeg",
        bytes: mismatchBytes.length,
        blob: new Blob([mismatchBytes], { type: "image/jpeg" })
      }
    ],
    schemas
  );
  assert.strictEqual(mismatch.records.length, 1, "digest mismatch must not omit media");
  assert.strictEqual(mismatch.records[0].blobs.length, 1);
  assert.strictEqual(mismatch.integrityValid, false);
  assert(
    mismatch.warnings.some(function (line) {
      return /media_mismatch original payload does not match its metadata SHA-256/.test(line);
    }),
    "metadata SHA mismatch must be reported"
  );
}

async function testVerifyRejectsTampering() {
  var payload = Buffer.from("archive verification media payload", "utf8");
  var payloadHash = nodeCrypto.createHash("sha256").update(payload).digest("hex");
  var idb = makeReadOnlyIndexedDB(
    [
      {
        mediaId: "media_verify",
        ownerKey: "PERSON:person_verify",
        roles: ["original"],
        sha256: payloadHash,
        caption: "untampered caption"
      }
    ],
    [
      {
        mediaId: "media_verify",
        role: "original",
        mime: "image/jpeg",
        bytes: payload.length,
        blob: new Blob([payload], { type: "image/jpeg" })
      }
    ]
  );
  var instance = harness({ indexedDB: idb.api });
  var backup = instance.backup;
  var archive = await backup.collect();

  assert.strictEqual(archive.stores.media.records.length, 1);
  assert.strictEqual(archive.stores.media.records[0].blobs.length, 1);
  assert.strictEqual((await backup.verify(archive)).ok, true);
  assert.deepStrictEqual(idb.metrics.transactionModes, ["readonly"]);
  assert.strictEqual(idb.metrics.opens, 1);
  assert.strictEqual(idb.metrics.closes, 1);
  assertNoMutations(instance, "media-bearing collect");

  var rawTamper = clone(archive);
  rowById(rawTamper, "workspace").raw += "tampered";
  await assert.rejects(
    verifyAsync(backup, rawTamper),
    /byte-count verification|SHA-256 verification/,
    "tampered raw storage must be rejected"
  );

  var base64Tamper = clone(archive);
  var base64Part = base64Tamper.stores.media.records[0].blobs[0];
  base64Part.base64 =
    (base64Part.base64.charAt(0) === "A" ? "B" : "A") +
    base64Part.base64.slice(1);
  await assert.rejects(
    verifyAsync(backup, base64Tamper),
    /Media media_verify role original failed SHA-256 verification/,
    "tampered Media Base64 must be rejected"
  );

  var mediaHashTamper = clone(archive);
  mediaHashTamper.stores.media.records[0].blobs[0].sha256 = "0".repeat(64);
  await assert.rejects(
    verifyAsync(backup, mediaHashTamper),
    /Media media_verify role original failed SHA-256 verification/,
    "tampered Media digest must be rejected"
  );

  var mediaMetadataTamper = clone(archive);
  mediaMetadataTamper.stores.media.records[0].meta.caption = "tampered caption";
  await assert.rejects(
    verifyAsync(backup, mediaMetadataTamper),
    /manifest verification failed/,
    "tampered Media metadata must be rejected by the manifest"
  );

  var manifestTamper = clone(archive);
  manifestTamper.metadata.manifestSha256 = "f".repeat(64);
  await assert.rejects(
    verifyAsync(backup, manifestTamper),
    /manifest verification failed/,
    "tampered manifest must be rejected"
  );
}

Promise.resolve()
  .then(testStableArchive)
  .then(testConcurrentStorageChangeAborts)
  .then(testSerializeMediaBlobs)
  .then(testVerifyRejectsTampering)
  .then(function () {
    console.log("ok safety backup preserves, hashes, and verifies registered storage");
    console.log("ok safety backup is read-only and aborts a concurrent capture");
    console.log("ok safety backup preserves and diagnoses Media payloads");
    console.log("ok safety backup rejects raw, Media, metadata, and manifest tampering");
  })
  .catch(function (error) {
    console.error(error && error.stack ? error.stack : error);
    process.exitCode = 1;
  });
