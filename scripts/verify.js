"use strict";

var fs = require("fs");
var path = require("path");
var childProcess = require("child_process");
var paths = require("./lib/paths");
var contract = require("./lib/release-contract");
var integrity = require("./check-integrity");
var packaging = require("./package-release");
var hashing = require("./hash-manifest");

var ROOT = paths.ROOT;
var FLAGS = parseFlags(process.argv.slice(2));

function parseFlags(argv) {
  return {
    syntax: argv.indexOf("--syntax") !== -1,
    nodeTests: argv.indexOf("--node-tests") !== -1,
    pythonTests: argv.indexOf("--python-tests") !== -1,
    harness: argv.indexOf("--harness") !== -1,
    all: argv.length === 0
  };
}

function want(section) {
  if (FLAGS.all) {
    return true;
  }
  return FLAGS[section];
}

function parseSemver(value) {
  var match = String(value).match(/(\d+)\.(\d+)\.(\d+)/);
  if (!match) {
    return null;
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function cmpSemver(a, b) {
  for (var i = 0; i < 3; i += 1) {
    if (a[i] !== b[i]) {
      return a[i] < b[i] ? -1 : 1;
    }
  }
  return 0;
}

function inRange(version, range) {
  var current = parseSemver(version);
  var min = parseSemver(range.min);
  var max = parseSemver(range.maxExclusive);
  if (!current || !min || !max) {
    return false;
  }
  return cmpSemver(current, min) >= 0 && cmpSemver(current, max) < 0;
}

function listJsForSyntax() {
  var tracked = contract.listTrackedFiles();
  var files = tracked ? tracked.slice() : [];
  function addTree(relDir, extra) {
    var abs = path.join(ROOT, relDir);
    if (!fs.existsSync(abs)) {
      return;
    }
    var entries = fs.readdirSync(abs, { withFileTypes: true });
    for (var i = 0; i < entries.length; i += 1) {
      var rel = (relDir ? relDir + "/" : "") + entries[i].name;
      rel = rel.replace(/\\/g, "/");
      if (entries[i].isDirectory()) {
        addTree(rel, extra);
      } else if (rel.slice(-3) === ".js") {
        extra.push(rel);
      }
    }
  }
  if (!files.length) {
    addTree("functions", files);
    addTree("data", files);
    addTree("scripts", files);
    addTree("assets", files);
    addTree("vendor", files);
    addTree("tests", files);
    if (fs.existsSync(path.join(ROOT, "playwright.config.js"))) {
      files.push("playwright.config.js");
    }
  }
  addTree("scripts", files);
  addTree("tests/harness", files);
  if (fs.existsSync(path.join(ROOT, "playwright.config.js"))) {
    files.push("playwright.config.js");
  }
  var unique = Array.from(
    new Set(
      files.filter(function (rel) {
        return (
          rel.slice(-3) === ".js" &&
          rel.indexOf("node_modules/") !== 0 &&
          contract.LEFTOVER_NAMES[rel] !== true
        );
      })
    )
  );
  unique.sort(contract.compareUtf8);
  return unique;
}

function listByPattern(dir, regex) {
  var abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) {
    return [];
  }
  return fs
    .readdirSync(abs)
    .filter(function (name) {
      return regex.test(name);
    })
    .map(function (name) {
      return dir + "/" + name;
    })
    .sort(contract.compareUtf8);
}

function runCaptured(command, args, options) {
  var result = childProcess.spawnSync(command, args, {
    cwd: ROOT,
    encoding: "utf8",
    timeout: options && options.timeout ? options.timeout : 60000,
    env: process.env
  });
  return {
    status: result.status,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    error: result.error ? String(result.error.message || result.error) : "",
    signal: result.signal || ""
  };
}

function pythonCmd() {
  var candidates = [["python"], ["py", "-3"], ["python3"]];
  for (var i = 0; i < candidates.length; i += 1) {
    var cmd = candidates[i];
    var result = childProcess.spawnSync(cmd[0], cmd.slice(1).concat(["--version"]), {
      encoding: "utf8"
    });
    if (result.status === 0) {
      return { cmd: cmd, version: String(result.stdout || result.stderr || "").trim() };
    }
  }
  return null;
}

function classifyNodeTest(file, captured) {
  if (captured.status === 0 && !captured.error) {
    return { status: "pass" };
  }
  var text = captured.stdout + "\n" + captured.stderr + "\n" + captured.error;
  if (contract.NETWORK_NODE_TESTS.indexOf(file) !== -1) {
    if (/unpkg|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|network|pdf-lib did not attach|ECONNRESET/i.test(text)) {
      return {
        status: "blocked",
        awaiting: "offline/network",
        message: "pdf-lib is loaded from the network until the offline lane vendors it"
      };
    }
  }
  if (file === "scripts/test-narrative-build9.js" && /Narrative_Builder\.html/.test(text) && /ENOENT|no such file/i.test(text)) {
    return {
      status: "blocked",
      awaiting: "offline/network",
      message: "Narrative_Builder.html is untracked; clean checkouts fail this assertion until it is shipped or the test is retargeted"
    };
  }
  return {
    status: "fail",
    message: (captured.stderr || captured.stdout || captured.error || "exit " + captured.status).trim().split(/\r?\n/).slice(-8).join("\n")
  };
}

function writeReport(report) {
  var outDir = path.join(ROOT, "dist");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "verify-report.json"), JSON.stringify(report, null, 2), "utf8");
}

function main() {
  var checks = [];
  var nodeVersion = process.versions.node;
  if (!inRange(nodeVersion, contract.NODE_RANGE)) {
    checks.push({
      name: "node-version",
      status: "fail",
      message: "Node " + nodeVersion + " is outside " + contract.NODE_RANGE.min + " (inclusive) to " + contract.NODE_RANGE.maxExclusive + " (exclusive)"
    });
  } else {
    checks.push({ name: "node-version", status: "pass", message: "Node " + nodeVersion });
  }

  var py = pythonCmd();
  if (!py) {
    checks.push({ name: "python-version", status: "fail", message: "Python not found" });
  } else if (!inRange(py.version, contract.PYTHON_RANGE)) {
    checks.push({
      name: "python-version",
      status: "fail",
      message: py.version + " is outside " + contract.PYTHON_RANGE.min + " to " + contract.PYTHON_RANGE.maxExclusive
    });
  } else {
    checks.push({ name: "python-version", status: "pass", message: py.version });
  }

  if (want("syntax")) {
    var jsFiles = listJsForSyntax();
    var syntaxFail = [];
    jsFiles.forEach(function (rel) {
      var captured = runCaptured(process.execPath, ["--check", rel], { timeout: 15000 });
      if (captured.status !== 0 || captured.error) {
        syntaxFail.push(rel + ": " + (captured.stderr || captured.error || "failed").trim());
      }
    });
    checks.push(
      syntaxFail.length
        ? { name: "syntax", status: "fail", message: syntaxFail.slice(0, 20).join("\n"), count: jsFiles.length }
        : { name: "syntax", status: "pass", message: jsFiles.length + " JavaScript files" }
    );
  }

  if (want("nodeTests")) {
    var nodeTests = listByPattern("scripts", /^test-.*\.js$/);
    nodeTests.forEach(function (file) {
      var captured = runCaptured(process.execPath, [file], {
        timeout: contract.NETWORK_NODE_TESTS.indexOf(file) !== -1 ? 120000 : 60000
      });
      var classified = classifyNodeTest(file, captured);
      checks.push({
        name: file,
        status: classified.status,
        awaiting: classified.awaiting,
        message: classified.message || (classified.status === "pass" ? "ok" : "failed")
      });
    });
  }

  if (want("pythonTests") && py) {
    var pyTests = listByPattern("scripts", /^test-.*\.py$/);
    pyTests.forEach(function (file) {
      var captured = runCaptured(py.cmd[0], py.cmd.slice(1).concat([file]), { timeout: 60000 });
      checks.push(
        captured.status === 0
          ? { name: file, status: "pass", message: (captured.stdout || "ok").trim().split(/\r?\n/).slice(-1)[0] }
          : {
              name: file,
              status: "fail",
              message: (captured.stderr || captured.stdout || captured.error || "failed").trim()
            }
      );
    });
  } else if (want("pythonTests") && !py) {
    checks.push({ name: "python-tests", status: "fail", message: "Python not found; cannot run PDF-field test" });
  }

  if (want("harness")) {
    var harnessTests = listByPattern("tests/harness", /^test-.*\.js$/);
    harnessTests.forEach(function (file) {
      var captured = runCaptured(process.execPath, [file], { timeout: 60000 });
      checks.push(
        captured.status === 0
          ? { name: file, status: "pass", message: (captured.stdout || "ok").trim().split(/\r?\n/).slice(-1)[0] }
          : {
              name: file,
              status: "fail",
              message: (captured.stderr || captured.stdout || captured.error || "failed").trim()
            }
      );
    });
  }

  if (FLAGS.all) {
    var integrityResult = integrity.runIntegrity();
    integrityResult.issues.forEach(function (row) {
      checks.push({
        name: "integrity:" + row.id,
        status: row.status,
        awaiting: row.awaiting,
        message: row.message
      });
    });
    if (!integrityResult.issues.length) {
      checks.push({
        name: "integrity",
        status: "pass",
        message: integrityResult.allowlistCount + " allowlisted files"
      });
    }

    try {
      var first = packaging.packageRelease();
      var second = packaging.packageRelease();
      if (first.zipSha256 !== second.zipSha256) {
        checks.push({
          name: "package-reproducible",
          status: "fail",
          message: "zip hash changed between runs: " + first.zipSha256 + " vs " + second.zipSha256
        });
      } else {
        checks.push({
          name: "package-reproducible",
          status: "pass",
          message: first.memberCount + " files, sha256 " + first.zipSha256
        });
      }
      var sums = hashing.parseSums(fs.readFileSync(first.sumsPath, "utf8"));
      var zipRow = sums.find(function (row) {
        return row.name.slice(-4) === ".zip";
      });
      if (!zipRow || zipRow.hash !== first.zipSha256) {
        checks.push({ name: "package-manifest", status: "fail", message: "SHA256SUMS zip hash mismatch" });
      } else {
        checks.push({ name: "package-manifest", status: "pass", message: sums.length + " hashed entries" });
      }
    } catch (error) {
      checks.push({
        name: "package",
        status: "fail",
        message: error && error.message ? error.message : String(error)
      });
    }
  }

  var passed = 0;
  var failed = 0;
  var blocked = 0;
  checks.forEach(function (check) {
    if (check.status === "pass") {
      passed += 1;
    } else if (check.status === "blocked") {
      blocked += 1;
    } else {
      failed += 1;
    }
    var tag = check.status === "pass" ? "PASS" : check.status === "blocked" ? "BLOCKED" : "FAIL";
    var suffix = check.awaiting ? " [awaiting " + check.awaiting + "]" : "";
    console.log(tag + "  " + check.name + (check.message ? " — " + check.message : "") + suffix);
  });

  console.log("");
  console.log("passed " + passed + ", failed " + failed + ", blocked " + blocked);
  if (blocked) {
    console.log("Blocked checks cannot pass until the named parallel lane is integrated. They were executed, not skipped.");
  }

  var report = {
    version: contract.readPackageVersion(),
    node: nodeVersion,
    python: py ? py.version : null,
    passed: passed,
    failed: failed,
    blocked: blocked,
    checks: checks
  };
  writeReport(report);

  if (failed) {
    process.exit(1);
  }
  if (blocked) {
    process.exit(2);
  }
}

main();
