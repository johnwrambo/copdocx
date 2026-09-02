"use strict";

var fs = require("fs");
var path = require("path");
var paths = require("./lib/paths");
var contract = require("./lib/release-contract");
var zip = require("./lib/zip-deterministic");
var hashing = require("./hash-manifest");

function collectMembers(root, relPaths, prefix) {
  return relPaths.map(function (rel) {
    var safe = contract.assertSafeRelPath(rel);
    var abs = path.join(root, safe.split("/").join(path.sep));
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
      throw new Error("missing allowlist file: " + safe);
    }
    return {
      name: prefix + "/" + safe,
      data: fs.readFileSync(abs),
      source: safe
    };
  });
}

function packageRelease(options) {
  options = options || {};
  var root = options.root || paths.ROOT;
  var version = options.version || contract.readPackageVersion();
  var prefix = options.prefix || "COPDocX-" + version;
  contract.assertSafeRelPath(prefix);
  if (version !== contract.EXPECTED_PACKAGE_VERSION) {
    throw new Error(
      "package.json version " + version + " does not match expected " + contract.EXPECTED_PACKAGE_VERSION
    );
  }

  var relPaths = contract.listAllowlistedFiles();
  if (!relPaths.length) {
    throw new Error("release allowlist is empty");
  }

  var members = collectMembers(root, relPaths, prefix);
  members.sort(function (a, b) {
    return contract.compareUtf8(a.name, b.name);
  });

  var zipBuffer = zip.buildZip(
    members.map(function (member) {
      return { name: member.name, data: member.data };
    })
  );
  zip.listZipEntries(zipBuffer);

  var outDir = options.outDir || path.join(root, "dist");
  fs.mkdirSync(outDir, { recursive: true });
  var zipName = prefix + ".zip";
  var zipPath = path.join(outDir, zipName);
  fs.writeFileSync(zipPath, zipBuffer);

  var memberRows = members.map(function (member) {
    return { name: member.name, hash: hashing.sha256Buffer(member.data) };
  });
  memberRows.push({ name: zipName, hash: hashing.sha256Buffer(zipBuffer) });
  var sumsBody = hashing.formatSums(memberRows);
  var sumsPath = path.join(outDir, prefix + ".SHA256SUMS");
  fs.writeFileSync(sumsPath, sumsBody, "utf8");
  fs.writeFileSync(path.join(outDir, zipName + ".sha256"), hashing.sha256Buffer(zipBuffer) + "  " + zipName + "\n", "utf8");

  return {
    zipPath: zipPath,
    sumsPath: sumsPath,
    zipSha256: hashing.sha256Buffer(zipBuffer),
    memberCount: members.length,
    prefix: prefix,
    files: relPaths.slice()
  };
}

function main() {
  var result = packageRelease();
  console.log(
    "packed " + result.memberCount + " files -> " + path.relative(paths.ROOT, result.zipPath)
  );
  console.log("sha256 " + result.zipSha256);
}

module.exports = {
  packageRelease: packageRelease
};

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error && error.message ? error.message : error);
    process.exit(1);
  }
}
