"use strict";

var path = require("path");

var ROOT = path.resolve(__dirname, "..", "..");

function toPosix(rel) {
  return String(rel || "").replace(/\\/g, "/");
}

function fromRoot(rel) {
  return path.join(ROOT, toPosix(rel).split("/").join(path.sep));
}

module.exports = {
  ROOT: ROOT,
  toPosix: toPosix,
  fromRoot: fromRoot
};
