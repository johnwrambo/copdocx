"use strict";

var fs = require("fs");
var path = require("path");
var childProcess = require("child_process");
var paths = require("./paths");

var ROOT = paths.ROOT;
var toPosix = paths.toPosix;

var ARCHIVE_PREFIX = "COPDocX-0.66.1";
var EXPECTED_PACKAGE_VERSION = "0.66.1";
var NODE_RANGE = { min: "20.19.0", maxExclusive: "25.0.0" };
var PYTHON_RANGE = { min: "3.11.0", maxExclusive: "3.14.0" };

var LEFTOVER_NAMES = {
  "Alien_Book_In_Docs_v1_0_4.html": true,
  "Narrative_Builder.html": true,
  "functions/address_old.js": true,
  "style/style-old.css": true
};

var CDN_HOSTS = [
  "unpkg.com",
  "cdn.jsdelivr.net",
  "cdnjs.cloudflare.com",
  "ajax.googleapis.com",
  "fonts.googleapis.com",
  "fonts.gstatic.com",
  "code.jquery.com",
  "stackpath.bootstrapcdn.com"
];

var CDN_URL_RE = /(?:https?:)?\/\/(?:www\.)?(?:unpkg\.com|cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com|ajax\.googleapis\.com|fonts\.googleapis\.com|fonts\.gstatic\.com|code\.jquery\.com|stackpath\.bootstrapcdn\.com)[^\s"'`)]*/gi;

var EXPECTED_VENDOR = [
  "vendor/leaflet/leaflet.js",
  "vendor/leaflet/leaflet.css",
  "vendor/pdf-lib/pdf-lib.min.js"
];

var NETWORK_NODE_TESTS = ["scripts/test-warrant-fill-pdflib.js"];

function isRuntimePath(rel) {
  var n = toPosix(rel);
  if (!n || n.charAt(0) === "/" || n.indexOf("..") !== -1) {
    return false;
  }
  if (LEFTOVER_NAMES[n]) {
    return false;
  }
  if (n.slice(-7) === "_old.js" || n.slice(-8) === "-old.css") {
    return false;
  }
  if (n === "style/style.css") {
    return true;
  }
  if (n === "COPDoc_demo.json" || n === "demo-import.json") {
    return true;
  }
  if (n.indexOf("functions/") === 0 && n.slice(-3) === ".js") {
    return true;
  }
  if (n.indexOf("data/") === 0 && (n.slice(-3) === ".js" || n.slice(-3) === ".md")) {
    return true;
  }
  if (n.indexOf("assets/") === 0) {
    return true;
  }
  if (n.indexOf("vendor/") === 0) {
    return true;
  }
  if (n.indexOf("/") === -1 && n.slice(-5) === ".html") {
    return true;
  }
  return false;
}

function assertSafeRelPath(rel) {
  var n = toPosix(rel);
  if (!n) {
    throw new Error("empty path");
  }
  if (path.isAbsolute(n) || n.charAt(0) === "/" || /^[a-zA-Z]:/.test(n)) {
    throw new Error("absolute path rejected: " + n);
  }
  var parts = n.split("/");
  for (var i = 0; i < parts.length; i += 1) {
    if (!parts[i] || parts[i] === "." || parts[i] === ".." ) {
      throw new Error("path traversal rejected: " + n);
    }
  }
  if (n.indexOf("\\") !== -1) {
    throw new Error("backslash path rejected: " + n);
  }
  return n;
}

function listTrackedFiles() {
  var result = childProcess.spawnSync("git", ["ls-files", "-z"], {
    cwd: ROOT,
    encoding: "buffer"
  });
  if (result.status !== 0) {
    return null;
  }
  return result.stdout
    .toString("utf8")
    .split("\0")
    .filter(Boolean)
    .map(toPosix);
}

function walkRuntimeFiles() {
  var out = [];
  function walk(relDir) {
    var abs = relDir ? path.join(ROOT, relDir) : ROOT;
    var entries = fs.readdirSync(abs, { withFileTypes: true });
    for (var i = 0; i < entries.length; i += 1) {
      var ent = entries[i];
      var rel = toPosix(relDir ? relDir + "/" + ent.name : ent.name);
      if (ent.isDirectory()) {
        if (
          ent.name === ".git" ||
          ent.name === "node_modules" ||
          ent.name === "dist" ||
          ent.name === "playwright-report" ||
          ent.name === "test-results"
        ) {
          continue;
        }
        walk(rel);
      } else if (isRuntimePath(rel)) {
        out.push(rel);
      }
    }
  }
  walk("");
  return out;
}

function compareUtf8(a, b) {
  return Buffer.from(a, "utf8").compare(Buffer.from(b, "utf8"));
}

function listAllowlistedFiles() {
  var tracked = listTrackedFiles();
  var files = tracked ? tracked.filter(isRuntimePath) : walkRuntimeFiles();
  var unique = Array.from(new Set(files.map(assertSafeRelPath)));
  unique.sort(compareUtf8);
  return unique;
}

function readPackageVersion() {
  var pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  return pkg.version;
}

module.exports = {
  ROOT: ROOT,
  ARCHIVE_PREFIX: ARCHIVE_PREFIX,
  EXPECTED_PACKAGE_VERSION: EXPECTED_PACKAGE_VERSION,
  NODE_RANGE: NODE_RANGE,
  PYTHON_RANGE: PYTHON_RANGE,
  CDN_HOSTS: CDN_HOSTS,
  CDN_URL_RE: CDN_URL_RE,
  EXPECTED_VENDOR: EXPECTED_VENDOR,
  NETWORK_NODE_TESTS: NETWORK_NODE_TESTS,
  LEFTOVER_NAMES: LEFTOVER_NAMES,
  isRuntimePath: isRuntimePath,
  assertSafeRelPath: assertSafeRelPath,
  listAllowlistedFiles: listAllowlistedFiles,
  listTrackedFiles: listTrackedFiles,
  readPackageVersion: readPackageVersion,
  compareUtf8: compareUtf8
};
