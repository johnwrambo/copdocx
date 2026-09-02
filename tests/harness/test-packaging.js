"use strict";

var assert = require("node:assert/strict");
var fs = require("fs");
var os = require("os");
var path = require("path");
var packaging = require("../../scripts/package-release");
var zip = require("../../scripts/lib/zip-deterministic");
var hashing = require("../../scripts/hash-manifest");

function main() {
  var tmp = fs.mkdtempSync(path.join(os.tmpdir(), "copdocx-pkg-"));
  var first = packaging.packageRelease({ outDir: path.join(tmp, "a") });
  var second = packaging.packageRelease({ outDir: path.join(tmp, "b") });
  assert.equal(first.memberCount, second.memberCount);
  assert.equal(first.zipSha256, second.zipSha256, "release zip must be byte-identical across runs");

  var zipBuffer = fs.readFileSync(first.zipPath);
  assert.equal(hashing.sha256Buffer(zipBuffer), first.zipSha256);

  var entries = zip.listZipEntries(zipBuffer);
  assert.equal(entries.length, first.memberCount);
  entries.forEach(function (name) {
    assert.equal(name.indexOf(".."), -1);
    assert.ok(name.indexOf(first.prefix + "/") === 0, name);
    assert.equal(name.indexOf("\\"), -1);
  });

  var sums = hashing.parseSums(fs.readFileSync(first.sumsPath, "utf8"));
  var names = sums.map(function (row) { return row.name; });
  assert.deepEqual(names, names.slice().sort());
  console.log("ok packaging harness (" + first.memberCount + " files, sha256 " + first.zipSha256 + ")");
}

main();
