"use strict";

var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");

var rootDir = path.join(__dirname, "..");
var html = fs.readFileSync(path.join(rootDir, "integrity.html"), "utf8");
var controllerSource = fs.readFileSync(
  path.join(rootDir, "functions", "integrity-page.js"),
  "utf8"
);

var scriptSources = Array.from(
  html.matchAll(/<script\s+[^>]*src=["']([^"']+)["'][^>]*>/gi),
  function (match) {
    return match[1];
  }
);

[
  "functions/workspace-config.js",
  "functions/app-bar.js",
  "functions/integrity.js",
  "functions/safety-backup.js",
  "functions/integrity-page.js"
].forEach(function (source) {
  assert.ok(scriptSources.includes(source), "integrity.html must load " + source);
});

[
  "functions/admin.js",
  "functions/model/store.js",
  "functions/model/media.js",
  "functions/transfer.js"
].forEach(function (source) {
  assert.ok(!scriptSources.includes(source), "integrity.html must not load " + source);
});

var requiredOrder = [
  "functions/workspace-config.js",
  "functions/app-bar.js",
  "functions/integrity.js",
  "functions/safety-backup.js",
  "functions/integrity-page.js"
];
var orderIndexes = requiredOrder.map(function (source) {
  return scriptSources.indexOf(source);
});
assert.deepStrictEqual(
  orderIndexes.slice().sort(function (a, b) {
    return a - b;
  }),
  orderIndexes,
  "integrity scripts must load in dependency order"
);

function fakeElement(id) {
  var classes = Object.create(null);
  return {
    id: id || "",
    children: [],
    textContent: "",
    className: "",
    hidden: false,
    disabled: false,
    title: "",
    appendChild: function (child) {
      this.children.push(child);
      return child;
    },
    replaceChildren: function () {
      this.children = [];
    },
    classList: {
      toggle: function (name, enabled) {
        classes[name] = Boolean(enabled);
      },
      contains: function (name) {
        return Boolean(classes[name]);
      }
    }
  };
}

function makePage() {
  var ids = [
    "integrityStatus",
    "integrityGeneratedAt",
    "integrityInputsBody",
    "integrityInputsTableWrap",
    "integrityInputsEmpty",
    "integrityFindingsBody",
    "integrityFindingsTableWrap",
    "integrityFindingsEmpty",
    "integrityStatCritical",
    "integrityStatHigh",
    "integrityStatMedium",
    "integrityStatTotal",
    "integrityCriticalCard",
    "integrityHighCard",
    "integrityMediumCard",
    "integrityTotalCard",
    "downloadIntegrityReportButton",
    "downloadIntegrityBackupButton"
  ];
  var elements = Object.create(null);
  ids.forEach(function (id) {
    elements[id] = fakeElement(id);
  });
  var scanButton = fakeElement("appBarPrimaryAction");
  var listeners = Object.create(null);
  var scanCalls = 0;
  var reportCalls = [];
  var backupCalls = [];
  var appBarMessages = [];
  var report = {
    schema: "copdocx.integrity-report.v1",
    scanner: {
      version: "0.1.0",
      ruleset: "copdocx.integrity-rules.v1"
    },
    generatedAt: "2026-09-05T12:00:00.000Z",
    readOnly: true,
    inputs: {
      workspace: {
        key: "copdocx.store.v1",
        status: "ok",
        counts: { people: 1 }
      },
      admin: {
        key: "copdoc.admin.v1",
        status: "missing",
        counts: {}
      },
      bookin: {
        key: "alien-book-in.saved-records.v1",
        status: "ok",
        counts: { records: 1 }
      },
      media: {
        key: "copdocx.media.v1",
        status: "skipped",
        counts: {}
      }
    },
    summary: {
      status: "attention",
      totalFindings: 1,
      counts: { critical: 0, high: 1, medium: 0, low: 0, info: 0 }
    },
    findings: [
      {
        findingId: "finding-1",
        ruleId: "PERSON_PROJECTION_DRIFT",
        severity: "high",
        category: "relationship",
        title: "Person copies conflict",
        message: "The canonical and embedded Person copies differ.",
        affected: [
          {
            store: "workspace",
            type: "PERSON",
            id: "per-1",
            path: "people.per-1"
          }
        ],
        evidence: [],
        repairable: false
      }
    ]
  };

  var document = {
    body: {
      getAttribute: function (name) {
        return name === "data-page" ? "integrity" : "";
      }
    },
    readyState: "complete",
    getElementById: function (id) {
      return elements[id] || null;
    },
    querySelector: function (selector) {
      return selector.indexOf("appBarPrimaryAction") !== -1 ? scanButton : null;
    },
    createElement: function (tagName) {
      var element = fakeElement("");
      element.tagName = String(tagName || "").toUpperCase();
      return element;
    }
  };

  var context = {
    console: console,
    document: document,
    Promise: Promise,
    Date: Date,
    JSON: JSON,
    Object: Object,
    Array: Array,
    Number: Number,
    String: String,
    Error: Error,
    isFinite: isFinite,
    isNaN: isNaN,
    setTimeout: setTimeout,
    COPDoc: {
      config: {
        storageKey: function (id) {
          return {
            workspace: "copdocx.store.v1",
            admin: "copdoc.admin.v1",
            bookin: "alien-book-in.saved-records.v1"
          }[id] || "";
        }
      },
      setAppBarStatus: function (message, options) {
        appBarMessages.push({ message: message, options: options });
      },
      integrity: {
        scanCurrent: function () {
          scanCalls += 1;
          return Promise.resolve(report);
        },
        downloadReport: function (value) {
          reportCalls.push(value);
        }
      },
      safetyBackup: {
        download: function (value) {
          backupCalls.push(value);
          return Promise.resolve({
            ok: true,
            verified: true,
            filename: "COPDoc_full_backup_20260905_120000.json",
            warnings: []
          });
        }
      }
    },
    addEventListener: function (type, listener) {
      listeners[type] = listener;
    }
  };
  context.window = context;
  context.globalThis = context;

  vm.createContext(context);
  vm.runInContext(controllerSource, context, {
    filename: "functions/integrity-page.js"
  });

  return {
    context: context,
    elements: elements,
    scanButton: scanButton,
    listeners: listeners,
    report: report,
    scanCalls: function () {
      return scanCalls;
    },
    reportCalls: reportCalls,
    backupCalls: backupCalls,
    appBarMessages: appBarMessages
  };
}

async function run() {
  var page = makePage();

  assert.strictEqual(page.scanCalls(), 0, "loading the page must not run a scan");
  assert.strictEqual(typeof page.context.runIntegrityScan, "function");
  assert.strictEqual(typeof page.context.downloadIntegrityReport, "function");
  assert.strictEqual(typeof page.context.downloadIntegrityBackup, "function");
  assert.strictEqual(
    page.elements.downloadIntegrityReportButton.hidden,
    true,
    "report download must stay hidden before a scan"
  );
  assert.strictEqual(
    page.elements.downloadIntegrityBackupButton.hidden,
    true,
    "backup download must stay hidden before a scan"
  );

  var scanned = await page.context.runIntegrityScan();
  assert.strictEqual(scanned, page.report, "Run scan must return the scanner report");
  assert.strictEqual(page.scanCalls(), 1, "Run scan must dispatch exactly once");
  assert.strictEqual(page.elements.integrityStatHigh.textContent, "1");
  assert.strictEqual(page.elements.integrityStatTotal.textContent, "1");
  assert.strictEqual(page.elements.integrityFindingsBody.children.length, 1);
  assert.strictEqual(page.elements.downloadIntegrityReportButton.hidden, false);
  assert.strictEqual(page.elements.downloadIntegrityBackupButton.hidden, false);

  await page.context.downloadIntegrityReport();
  assert.strictEqual(page.reportCalls.length, 1);
  assert.strictEqual(
    page.reportCalls[0],
    page.report,
    "report download must receive the current report"
  );

  await page.context.downloadIntegrityBackup();
  assert.strictEqual(page.backupCalls.length, 1);
  assert.strictEqual(
    page.backupCalls[0],
    page.report,
    "backup download must receive the current report"
  );

  assert.strictEqual(typeof page.listeners.storage, "function");
  page.listeners.storage({ key: "unrelated.storage.key" });
  assert.strictEqual(
    page.elements.downloadIntegrityBackupButton.disabled,
    false,
    "unrelated storage changes must not stale the report"
  );

  page.listeners.storage({ key: "copdocx.store.v1" });
  assert.strictEqual(
    page.elements.downloadIntegrityBackupButton.disabled,
    true,
    "workspace changes must block backup until another scan"
  );
  assert.match(
    page.elements.integrityStatus.textContent,
    /changed after this scan/i,
    "workspace changes must visibly mark the report stale"
  );

  await page.context.downloadIntegrityBackup();
  assert.strictEqual(
    page.backupCalls.length,
    1,
    "a stale report must not dispatch another backup"
  );

  assert.ok(page.appBarMessages.length > 0, "page actions must publish status");
  console.log("ok integrity page manual scan and safety actions");
}

run().catch(function (error) {
  console.error(error.stack || error);
  process.exitCode = 1;
});
