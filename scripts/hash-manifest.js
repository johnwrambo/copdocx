"use strict";

var fs = require("fs");
var path = require("path");
var crypto = require("crypto");
var paths = require("./lib/paths");
var contract = require("./lib/release-contract");

function sha256Buffer(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function sha256File(absPath) {
  return sha256Buffer(fs.readFileSync(absPath));
}

function formatSums(entries) {
  var rows = entries.slice().sort(function (a, b) {
    return contract.compareUtf8(a.name, b.name);
  });
  return rows
    .map(function (row) {
      return row.hash + "  " + row.name;
    })
    .join("\n") + "\n";
}

function parseSums(text) {
  var out = [];
  String(text)
    .split(/\r?\n/)
    .forEach(function (line) {
      if (!line) {
        return;
      }
      var match = line.match(/^([0-9a-f]{64})  (.+)$/);
      if (!match) {
        throw new Error("invalid SHA256SUMS line: " + line);
      }
      out.push({ hash: match[1], name: match[2] });
    });
  return out;
}

function manifestForFiles(root, relPaths, namePrefix) {
  var prefix = namePrefix ? String(namePrefix).replace(/\/+$/, "") + "/" : "";
  return relPaths.map(function (rel) {
    var safe = contract.assertSafeRelPath(rel);
    var abs = path.join(root, safe.split("/").join(path.sep));
    return {
      name: prefix + safe,
      hash: sha256File(abs),
      size: fs.statSync(abs).size
    };
  });
}

function main(argv) {
  var args = argv.slice(2);
  var outIndex = args.indexOf("--out");
  var outPath = outIndex >= 0 ? args[outIndex + 1] : null;
  var files = contract.listAllowlistedFiles();
  var body = formatSums(manifestForFiles(paths.ROOT, files, ""));
  if (outPath) {
    fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
    fs.writeFileSync(outPath, body, "utf8");
  } else {
    process.stdout.write(body);
  }
}

module.exports = {
  sha256Buffer: sha256Buffer,
  sha256File: sha256File,
  formatSums: formatSums,
  parseSums: parseSums,
  manifestForFiles: manifestForFiles
};

if (require.main === module) {
  try {
    main(process.argv);
  } catch (error) {
    console.error(error && error.message ? error.message : error);
    process.exit(1);
  }
}
