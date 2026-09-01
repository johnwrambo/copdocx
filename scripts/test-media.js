"use strict";

var fs = require("fs");
var path = require("path");
var vm = require("vm");
var nodeCrypto = require("crypto");

var context = {
  crypto: nodeCrypto.webcrypto,
  indexedDB: undefined,
  navigator: {},
  window: {}
};
context.globalThis = context;
context.window = context;
vm.createContext(context);

function load(rel) {
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, "..", rel), "utf8"),
    context
  );
}

load("functions/model/util.js");
load("functions/model/media.js");

var model = context.COPDoc.model;
var media = context.COPDoc.media;
var fail = 0;

function check(label, ok, extra) {
  if (!ok) {
    fail += 1;
    console.log("FAIL", label, extra || "");
  } else {
    console.log("ok", label);
  }
}

function bytesOf(text) {
  return Uint8Array.from(Buffer.from(String(text)));
}

function run() {
  return Promise.resolve()
    .then(function () {
      media._resetForTests();
      var row = model.createMedia({
        owner: { type: "PERSON", id: "p_1" },
        mediaClass: "photo",
        sha256: "abc",
        kind: "subject"
      });
      check("schema", row.schema === "copdocx.media.v1");
      check("ownerKey", row.ownerKey === "PERSON:p_1");
      check("photo not primary until save", row.primary === false);
      check("entity", row.entityType === "MEDIA");
    })
    .then(function () {
      var threw = false;
      try {
        model.createMedia({ mediaClass: "photo" });
      } catch (err) {
        threw = err.code === "OWNER_REQUIRED";
      }
      check("owner required", threw);
    })
    .then(function () {
      var threw = false;
      try {
        model.createMedia({
          owner: { type: "LEAD", id: "lead_1" },
          mediaClass: "photo"
        });
      } catch (err) {
        threw = err.code === "PHOTOS_NOT_ON_LEAD";
      }
      check("photos not on lead", threw);
    })
    .then(function () {
      return media.save({
        owner: { type: "PERSON", id: "p_1" },
        mediaClass: "photo",
        original: bytesOf("mugshot-a"),
        mime: "image/jpeg",
        originalName: "a.jpg",
        fields: { kind: "subject", caption: "first" }
      });
    })
    .then(function (saved) {
      check("first photo is primary", saved.primary === true);
      check("sha256 set", /^[0-9a-f]{64}$/.test(saved.sha256));
      return media.save({
        owner: { type: "PERSON", id: "p_1" },
        mediaClass: "photo",
        original: bytesOf("mugshot-b"),
        mime: "image/jpeg",
        originalName: "b.jpg"
      });
    })
    .then(function (second) {
      check("second photo not primary", second.primary === false);
      return media.list({ type: "PERSON", id: "p_1" });
    })
    .then(function (rows) {
      check("two photos", rows.length === 2);
      check("list primary first", rows[0].primary === true && rows[0].originalName === "a.jpg");
      check("list is meta only", rows[0].blob === undefined && rows[0].dataUrl === undefined);
      return media.save({
        owner: { type: "PERSON", id: "p_1" },
        mediaClass: "photo",
        original: bytesOf("mugshot-a"),
        mime: "image/jpeg"
      }).then(
        function () {
          check("duplicate rejected", false);
        },
        function (err) {
          check("duplicate rejected", err.code === "ALREADY_SAVED");
        }
      );
    })
    .then(function () {
      return media.list({ type: "PERSON", id: "p_1" }).then(function (rows) {
        var other = rows.filter(function (row) {
          return !row.primary;
        })[0];
        return media.setPrimary(other.mediaId).then(function (updated) {
          check("setPrimary flips", updated.primary === true);
          return media.list({ type: "PERSON", id: "p_1" });
        });
      });
    })
    .then(function (rows) {
      var primaries = rows.filter(function (row) {
        return row.primary;
      });
      check("one primary", primaries.length === 1 && primaries[0].originalName === "b.jpg");
      return media.blob(primaries[0].mediaId, "original");
    })
    .then(function (part) {
      check("blob original", part && part.role === "original" && part.bytes > 0);
      return media.save({
        owner: { type: "PERSON", id: "p_1" },
        mediaClass: "file",
        original: bytesOf("%PDF-fake"),
        mime: "application/pdf",
        originalName: "dl.pdf",
        fields: { documentType: "DL", caption: "license" }
      });
    })
    .then(function (fileRow) {
      check("file not primary", fileRow.primary === false);
      check("file class", fileRow.mediaClass === "file");
      return media.list({ type: "PERSON", id: "p_1" });
    })
    .then(function (rows) {
      check("photos before files", rows[0].mediaClass === "photo");
      check("three rows", rows.length === 3);
      var primary = rows.filter(function (row) {
        return row.primary;
      })[0];
      return media.remove(primary.mediaId).then(function () {
        return media.list({ type: "PERSON", id: "p_1" });
      });
    })
    .then(function (rows) {
      var photos = rows.filter(function (row) {
        return row.mediaClass === "photo";
      });
      check("removed primary promotes other", photos.length === 1 && photos[0].primary === true);
      check("file remains", rows.some(function (row) {
        return row.mediaClass === "file";
      }));
    })
    .then(function () {
      return media.save({
        owner: { type: "VEHICLE", id: "veh_1" },
        mediaClass: "photo",
        original: bytesOf("plate-shot"),
        mime: "image/jpeg"
      }).then(function (saved) {
        check("vehicle own primary", saved.primary === true);
        return media.update(saved.mediaId, { fields: { caption: "plate" } }).then(function (updated) {
          check("update caption", updated.caption === "plate");
          return media.list({ type: "PERSON", id: "p_1" });
        });
      }).then(function (personRows) {
        check(
          "list scoped to owner",
          personRows.every(function (row) {
            return row.owner.id === "p_1";
          })
        );
      });
    })
    .then(function () {
      var tooBig = { size: model.PHOTO_MAX_BYTES + 1, arrayBuffer: function () {
        return Promise.resolve(new ArrayBuffer(8));
      } };
      return media.save({
        owner: { type: "PERSON", id: "p_2" },
        mediaClass: "photo",
        original: tooBig
      }).then(
        function () {
          check("cap", false);
        },
        function (err) {
          check("cap", err.code === "FILE_TOO_LARGE");
        }
      );
    })
    .then(function () {
      return media.removeByOwner({ type: "VEHICLE", id: "veh_1" }).then(function () {
        return media.list({ type: "VEHICLE", id: "veh_1" });
      }).then(function (rows) {
        check("removeByOwner clears vehicle media", rows.length === 0);
      });
    })
    .then(function () {
      return media.exportBundle().then(function (bundle) {
        check("exportBundle has person media", bundle.length >= 1);
        media._resetForTests();
        return media.importBundle(bundle).then(function (stats) {
          check("importBundle adds rows", stats.added >= 1, stats);
          return media.list({ type: "PERSON", id: "p_1" });
        });
      }).then(function (rows) {
        check("imported person media", rows.length >= 1);
      });
    })
    .then(function () {
      if (fail) {
        console.log(fail + " failed");
        process.exit(1);
      }
      console.log("all media tests passed");
    })
    .catch(function (err) {
      console.log("FAIL uncaught", err && err.stack ? err.stack : err);
      process.exit(1);
    });
}

run();
