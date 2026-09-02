"use strict";

var fs = require("fs");
var path = require("path");
var paths = require("./lib/paths");
var contract = require("./lib/release-contract");

var ROOT = paths.ROOT;
var toPosix = paths.toPosix;

function issue(status, id, message, extra) {
  var row = { status: status, id: id, message: message };
  if (extra) {
    Object.keys(extra).forEach(function (key) {
      row[key] = extra[key];
    });
  }
  return row;
}

function hostOf(rawUrl) {
  try {
    var href = rawUrl.indexOf("//") === 0 ? "https:" + rawUrl : rawUrl;
    return new URL(href).hostname.toLowerCase();
  } catch (error) {
    return "";
  }
}

function isCdnHost(hostname) {
  return contract.CDN_HOSTS.some(function (host) {
    return hostname === host || hostname.slice(-(host.length + 1)) === "." + host;
  });
}

function scanTextForCdn(rel, text) {
  var found = [];
  var match;
  var re = new RegExp(contract.CDN_URL_RE.source, "gi");
  while ((match = re.exec(text))) {
    var hostname = hostOf(match[0]);
    if (hostname && isCdnHost(hostname)) {
      found.push({ file: rel, url: match[0] });
    }
  }
  return found;
}

function runtimeScanFiles(allowlist) {
  var extra = contract.listTrackedFiles() || [];
  var set = {};
  allowlist.concat(extra).forEach(function (rel) {
    var n = toPosix(rel);
    if (
      n.slice(-3) === ".js" &&
      (n.indexOf("functions/") === 0 || n.indexOf("data/") === 0 || n.indexOf("assets/") === 0)
    ) {
      set[n] = true;
    }
    if (n.slice(-5) === ".html" && n.indexOf("/") === -1) {
      set[n] = true;
    }
    if (n === "style/style.css") {
      set[n] = true;
    }
  });
  return Object.keys(set).sort(contract.compareUtf8);
}

function checkMissingAllowlist(allowlist) {
  var issues = [];
  allowlist.forEach(function (rel) {
    try {
      contract.assertSafeRelPath(rel);
    } catch (error) {
      issues.push(
        issue("fail", "path-traversal", error.message, { file: rel })
      );
      return;
    }
    var abs = path.join(ROOT, rel.split("/").join(path.sep));
    if (!fs.existsSync(abs)) {
      issues.push(issue("fail", "missing-runtime-file", "allowlist file is missing: " + rel, { file: rel }));
    }
  });
  return issues;
}

function checkExpectedVendor(allowlist) {
  var issues = [];
  var allow = {};
  allowlist.forEach(function (rel) {
    allow[rel] = true;
  });
  contract.EXPECTED_VENDOR.forEach(function (rel) {
    var abs = path.join(ROOT, rel.split("/").join(path.sep));
    var exists = fs.existsSync(abs);
    if (!exists) {
      issues.push(
        issue("blocked", "missing-vendor", "required vendored runtime file is missing: " + rel, {
          file: rel,
          awaiting: "offline/network"
        })
      );
      return;
    }
    if (!allow[rel]) {
      issues.push(
        issue(
          "blocked",
          "missing-vendor",
          "vendored runtime file exists but is not in the tracked release allowlist: " + rel,
          { file: rel, awaiting: "offline/network" }
        )
      );
    }
  });
  return issues;
}

function checkHtmlReferences(allowlist) {
  var issues = [];
  var allow = {};
  allowlist.forEach(function (rel) {
    allow[rel] = true;
  });
  var htmlFiles = allowlist.filter(function (rel) {
    return rel.slice(-5) === ".html" && rel.indexOf("/") === -1;
  });
  var refRe = /(?:src|href)\s*=\s*["']([^"']+)["']/gi;
  htmlFiles.forEach(function (rel) {
    var text = fs.readFileSync(path.join(ROOT, rel), "utf8");
    var match;
    while ((match = refRe.exec(text))) {
      var ref = match[1].trim();
      if (!ref || ref.charAt(0) === "#" || /^(data|blob|mailto):/i.test(ref)) {
        continue;
      }
      if (/^https?:\/\//i.test(ref)) {
        continue;
      }
      var resolved = toPosix(ref.split("?")[0].split("#")[0]);
      resolved = resolved.replace(/^\.\/+/, "");
      if (resolved.charAt(0) === "/" || /^[a-zA-Z]:/.test(resolved)) {
        resolved = resolved.replace(/^[a-zA-Z]:/, "").replace(/^\/+/, "");
      }
      try {
        contract.assertSafeRelPath(resolved);
      } catch (error) {
        issues.push(
          issue("fail", "path-traversal", rel + " references traversed path " + ref, {
            file: rel,
            url: ref
          })
        );
        continue;
      }
      var abs = path.join(ROOT, resolved.split("/").join(path.sep));
      if (!fs.existsSync(abs)) {
        issues.push(
          issue("fail", "missing-runtime-file", rel + " references missing file " + resolved, {
            file: rel,
            url: resolved
          })
        );
      }
    }
  });
  return issues;
}

function checkCdn(allowlist) {
  var issues = [];
  var hits = [];
  runtimeScanFiles(allowlist).forEach(function (rel) {
    var abs = path.join(ROOT, rel.split("/").join(path.sep));
    if (!fs.existsSync(abs)) {
      return;
    }
    hits = hits.concat(scanTextForCdn(rel, fs.readFileSync(abs, "utf8")));
  });
  if (hits.length) {
    issues.push(
      issue(
        "blocked",
        "cdn-reference",
        "unintended CDN references remain in runtime files (" + hits.length + ")",
        { awaiting: "offline/network", matches: hits.slice(0, 40), count: hits.length }
      )
    );
  }
  return issues;
}

function checkVersions() {
  var issues = [];
  var pkgVersion = contract.readPackageVersion();
  if (pkgVersion !== contract.EXPECTED_PACKAGE_VERSION) {
    issues.push(
      issue(
        "fail",
        "version-mismatch",
        "package.json version " + pkgVersion + " != " + contract.EXPECTED_PACKAGE_VERSION
      )
    );
  }

  var tracked = contract.listTrackedFiles() || [];
  var htmlFiles = tracked.filter(function (rel) {
    return rel.slice(-5) === ".html" && rel.indexOf("/") === -1;
  });
  var versions = [];
  htmlFiles.forEach(function (rel) {
    var text = fs.readFileSync(path.join(ROOT, rel), "utf8");
    var attr = text.match(/data-version="([^"]+)"/);
    var visible = text.match(/>\s*Version\s+([0-9]+\.[0-9]+\.[0-9]+)\s*</);
    if (!attr) {
      return;
    }
    versions.push({ file: rel, version: attr[1] });
    if (visible && visible[1] !== attr[1]) {
      issues.push(
        issue(
          "fail",
          "version-mismatch",
          rel + " visible Version " + visible[1] + " != data-version " + attr[1],
          { file: rel }
        )
      );
    }
  });

  var unique = Array.from(new Set(versions.map(function (row) { return row.version; })));
  if (unique.length > 1) {
    issues.push(
      issue("fail", "version-mismatch", "chrome data-version values disagree: " + unique.join(", "), {
        versions: versions
      })
    );
  } else if (unique.length === 1 && unique[0] !== pkgVersion) {
    issues.push(
      issue(
        "blocked",
        "version-mismatch",
        "chrome data-version " + unique[0] + " != package.json " + pkgVersion,
        { awaiting: "product-version-stamp", chromeVersion: unique[0], packageVersion: pkgVersion }
      )
    );
  }
  return issues;
}

function runIntegrity() {
  var allowlist = contract.listAllowlistedFiles();
  var issues = []
    .concat(checkMissingAllowlist(allowlist))
    .concat(checkExpectedVendor(allowlist))
    .concat(checkHtmlReferences(allowlist))
    .concat(checkCdn(allowlist))
    .concat(checkVersions());
  return {
    allowlistCount: allowlist.length,
    issues: issues
  };
}

function main() {
  var result = runIntegrity();
  var failed = 0;
  result.issues.forEach(function (row) {
    var tag = row.status === "blocked" ? "BLOCKED" : row.status.toUpperCase();
    console.log(tag + " " + row.id + " " + row.message + (row.awaiting ? " [awaiting " + row.awaiting + "]" : ""));
    if (row.status !== "pass") {
      failed += 1;
    }
  });
  if (!result.issues.length) {
    console.log("ok integrity (" + result.allowlistCount + " allowlisted files)");
  }
  if (failed) {
    process.exit(1);
  }
}

module.exports = {
  runIntegrity: runIntegrity
};

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error && error.message ? error.message : error);
    process.exit(1);
  }
}
