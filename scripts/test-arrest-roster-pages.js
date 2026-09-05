"use strict";

var fs = require("fs");
var path = require("path");
var root = path.join(__dirname, "..");
var fail = 0;

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function check(label, ok, extra) {
  if (!ok) {
    fail += 1;
    console.log("FAIL", label, extra || "");
  } else {
    console.log("ok", label);
  }
}

var cases = read("cases.html");
var admin = read("admin.html");
var encounter = read("encounter-form.html");
var bookin = read("bookin.html");
var leads = read("leads.html");
var config = read("functions/workspace-config.js");
var appBar = read("functions/app-bar.js");
var roster = read("functions/arrest-roster.js");
var listJs = read("functions/leads.js");

check("product version is 0.69.2", config.indexOf('productVersion: "0.69.2"') !== -1);
check("app-bar fallback is 0.69.2", appBar.indexOf('|| "0.69.2"') !== -1);
check("cases.html stamps 0.69.2", cases.indexOf('data-version="0.69.2"') !== -1);
check("admin.html stamps 0.69.2", admin.indexOf('data-version="0.69.2"') !== -1);
check("cases has Arrests/Case files chips", cases.indexOf('data-case-list-mode="arrests"') !== -1 && cases.indexOf('data-case-list-mode="files"') !== -1);
check("cases mounts arrest roster", cases.indexOf('id="arrestRosterHost"') !== -1);
check(
  "arrest roster row action is Open only",
  roster.indexOf('open.textContent = "Open"') !== -1 &&
    roster.indexOf('packet.textContent = "Book-in"') === -1 &&
    roster.indexOf('card.textContent = "Card"') === -1 &&
    roster.indexOf('open.textContent = "Case"') === -1
);
check(
  "arrest roster headers use encounter-style sort buttons",
  roster.indexOf('btn.className = "record-sort-button"') !== -1 &&
    roster.indexOf('btn.className = "records-sort-button"') === -1
);
check(
  "case files row action is Open only",
  listJs.indexOf('link.textContent = "Open"') !== -1 &&
    listJs.indexOf('link.textContent = "View"') === -1 &&
    listJs.indexOf('link.textContent = "Edit"') === -1
);
check(
  "cases loads report collector for roster rows",
  cases.indexOf("functions/arrest-roster.js") !== -1 &&
    cases.indexOf("functions/arrest-report.js") !== -1 &&
    cases.indexOf("functions/baseballcard.js") === -1
);
check(
  "cases arrest roster has no select, columns, or report",
  listJs.indexOf("showGenerate: false") !== -1 &&
    listJs.indexOf("showSelection: false") !== -1 &&
    listJs.indexOf("showColumns: false") !== -1
);
check(
  "arrest roster can hide select and report",
  roster.indexOf("showSelection !== false") !== -1 &&
    roster.indexOf("data-arrest-select") !== -1 &&
    roster.indexOf("data-arrest-report") !== -1
);
check("leads.html redirects to cases.html", leads.indexOf('window.location.replace("cases.html"') !== -1);
check("admin has Today's arrests host", admin.indexOf("Today's arrests") !== -1 && admin.indexOf('id="arrestRosterHost"') !== -1);
check("admin loads roster scripts", admin.indexOf("functions/arrest-report.js") !== -1 && admin.indexOf("functions/arrest-roster.js") !== -1);
check("admin week hint is filed arrests", admin.indexOf("Filed arrests, Sun–Sat") !== -1);
check("encounter form is a tabbed workspace", encounter.indexOf('class="enc-tabs"') !== -1 && encounter.indexOf("tab-subjects") !== -1);
check("encounter form does not mount arrest roster", encounter.indexOf("arrestRosterHost") === -1);
check("encounter Add existing does not open Book-in", encounter.indexOf('id="openAddExisting"') !== -1 && encounter.indexOf('href="bookin.html"') === -1);
check("book-in Open in Cases", bookin.indexOf('href="cases.html"') !== -1 && bookin.indexOf("Open in Cases") !== -1);
check("book-in has no report dialog", bookin.indexOf("emailReportDialog") === -1 && bookin.indexOf("generateUnifiedArrestReport") === -1);
check("book-in keeps packet backup", bookin.indexOf("exportSavedRecords") !== -1 && bookin.indexOf("chooseRecordsBackupFile") !== -1);
check("book-in does not load arrest-report.js", bookin.indexOf("functions/arrest-report.js") === -1);
check(
  "book-in does not keep the duty-roster table",
  bookin.indexOf("recordsSearch") === -1 &&
    bookin.indexOf("recordsColumnsMenu") === -1 &&
    bookin.indexOf("data-record-column-toggle") === -1 &&
    bookin.indexOf("recordsDateFrom") === -1
);
check("book-in packet list is subject and last saved", bookin.indexOf("Saved packets") !== -1 && bookin.indexOf(">Last saved<") !== -1);

if (fail) {
  process.exit(1);
}
console.log("all passed");
