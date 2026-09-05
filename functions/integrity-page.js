/**
 * Data Integrity page controller.
 *
 * The scanner and safety-backup modules own all data access. This controller
 * only paints their results and dispatches explicit user actions.
 */
(function (global) {
  "use strict";

  var root = (global.COPDoc = global.COPDoc || {});
  var lastReport = null;
  var running = false;
  var stale = false;

  function byId(id) {
    return document.getElementById(id);
  }

  function numberOrZero(value) {
    var number = Number(value);
    return isFinite(number) && number >= 0 ? number : 0;
  }

  function statusToneClass(tone) {
    if (tone === "ok") {
      return " is-ok";
    }
    if (tone === "warning") {
      return " is-warning";
    }
    if (tone === "error") {
      return " is-error";
    }
    return "";
  }

  function setStatus(message, tone) {
    var status = byId("integrityStatus");
    if (status) {
      status.className = "section-note integrity-status" + statusToneClass(tone);
      status.textContent = message || "";
    }
    if (root.setAppBarStatus) {
      root.setAppBarStatus(message || "", { ok: tone === "ok" });
    }
  }

  function scanButton() {
    return document.querySelector(
      '#appBarPrimaryAction[data-chrome-action="scan"]'
    );
  }

  function setScanBusy(busy) {
    var button = scanButton();
    if (!button) {
      return;
    }
    button.disabled = Boolean(busy);
    button.textContent = busy ? "Scanning…" : "Run scan";
  }

  function setDownloadAvailability(hasReport) {
    var reportButton = byId("downloadIntegrityReportButton");
    var backupButton = byId("downloadIntegrityBackupButton");
    if (reportButton) {
      reportButton.hidden = !hasReport;
      reportButton.disabled = !hasReport;
    }
    if (backupButton) {
      backupButton.hidden = !hasReport;
      backupButton.disabled = !hasReport || stale;
      backupButton.title = stale
        ? "Run a new scan before downloading a backup."
        : "";
    }
  }

  function clearChildren(node) {
    if (node) {
      node.replaceChildren();
    }
  }

  function appendTextCell(row, value, className) {
    var cell = document.createElement("td");
    if (className) {
      cell.className = className;
    }
    cell.textContent = value == null || value === "" ? "—" : String(value);
    row.appendChild(cell);
    return cell;
  }

  function normalizedCode(value, fallback) {
    var code = String(value || fallback || "unknown")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-");
    return code || fallback || "unknown";
  }

  function statusChip(label, kind, prefix) {
    var chip = document.createElement("span");
    var code = normalizedCode(kind || label, "unknown");
    chip.className =
      "status-chip " +
      (prefix || "integrity-severity") +
      " " +
      (prefix || "integrity-severity") +
      "-" +
      code;
    chip.textContent = label || code;
    return chip;
  }

  function compactValue(value) {
    var text;
    if (value == null || value === "") {
      return "—";
    }
    if (typeof value === "string") {
      text = value;
    } else {
      try {
        text = JSON.stringify(value);
      } catch (error) {
        text = String(value);
      }
    }
    return text.length > 240 ? text.slice(0, 237) + "…" : text;
  }

  function countsText(counts) {
    if (!counts || typeof counts !== "object") {
      return "—";
    }
    var parts = Object.keys(counts).map(function (key) {
      return key + ": " + compactValue(counts[key]);
    });
    return parts.length ? parts.join(" · ") : "—";
  }

  function renderInputs(inputs) {
    var body = byId("integrityInputsBody");
    var wrap = byId("integrityInputsTableWrap");
    var empty = byId("integrityInputsEmpty");
    clearChildren(body);

    var names = Object.keys(inputs || {});
    if (!names.length) {
      if (wrap) {
        wrap.hidden = true;
      }
      if (empty) {
        empty.hidden = false;
        empty.textContent = "The scan did not return a storage summary.";
      }
      return;
    }

    names.forEach(function (name) {
      var input = inputs[name] || {};
      var row = document.createElement("tr");
      appendTextCell(row, name);
      appendTextCell(row, input.key);
      var statusCell = document.createElement("td");
      statusCell.appendChild(
        statusChip(input.status || "unknown", input.status, "integrity-store-status")
      );
      row.appendChild(statusCell);
      appendTextCell(row, countsText(input.counts));
      appendTextCell(row, input.error || "");
      body.appendChild(row);
    });

    if (wrap) {
      wrap.hidden = false;
    }
    if (empty) {
      empty.hidden = true;
    }
  }

  function affectedText(affected) {
    var rows = Array.isArray(affected) ? affected : [];
    var values = rows.map(function (item) {
      item = item || {};
      var record = [item.type, item.id].filter(Boolean).join(":");
      return [item.store, record, item.path].filter(Boolean).join(" · ");
    });
    return values.length ? values.join("; ") : "—";
  }

  function evidenceCell(evidence) {
    var cell = document.createElement("td");
    var rows = Array.isArray(evidence) ? evidence : [];
    if (!rows.length) {
      cell.textContent = "—";
      return cell;
    }

    var details = document.createElement("details");
    var summary = document.createElement("summary");
    summary.textContent = rows.length + (rows.length === 1 ? " item" : " items");
    details.appendChild(summary);
    var list = document.createElement("ul");
    list.className = "integrity-evidence-list";
    rows.forEach(function (item) {
      item = item || {};
      var line = document.createElement("li");
      var bits = [item.store, item.path].filter(Boolean);
      if (Object.prototype.hasOwnProperty.call(item, "expected")) {
        bits.push("expected " + compactValue(item.expected));
      }
      if (Object.prototype.hasOwnProperty.call(item, "actual")) {
        bits.push("actual " + compactValue(item.actual));
      }
      line.textContent = bits.join(" · ") || "Evidence recorded";
      list.appendChild(line);
    });
    details.appendChild(list);
    cell.appendChild(details);
    return cell;
  }

  function renderFindings(findings) {
    var rows = Array.isArray(findings) ? findings : [];
    var body = byId("integrityFindingsBody");
    var wrap = byId("integrityFindingsTableWrap");
    var empty = byId("integrityFindingsEmpty");
    clearChildren(body);

    if (!rows.length) {
      if (wrap) {
        wrap.hidden = true;
      }
      if (empty) {
        empty.hidden = false;
        empty.textContent = "No integrity problems were found.";
        empty.className = "records-empty integrity-empty is-ok";
      }
      return;
    }

    rows.forEach(function (finding) {
      finding = finding || {};
      var row = document.createElement("tr");
      row.className = "integrity-finding-row integrity-finding-" +
        normalizedCode(finding.severity, "unknown");

      var severityCell = document.createElement("td");
      severityCell.appendChild(
        statusChip(finding.severity || "unknown", finding.severity)
      );
      row.appendChild(severityCell);
      appendTextCell(row, finding.ruleId, "integrity-rule-id");
      appendTextCell(row, affectedText(finding.affected), "integrity-affected");

      var findingCell = document.createElement("td");
      var title = document.createElement("strong");
      title.textContent = finding.title || "Integrity finding";
      findingCell.appendChild(title);
      if (finding.message) {
        var message = document.createElement("p");
        message.textContent = finding.message;
        findingCell.appendChild(message);
      }
      if (finding.suggestedAction) {
        var action = document.createElement("p");
        action.className = "integrity-suggested-action";
        action.textContent = "Review: " + finding.suggestedAction;
        findingCell.appendChild(action);
      }
      row.appendChild(findingCell);
      row.appendChild(evidenceCell(finding.evidence));
      body.appendChild(row);
    });

    if (wrap) {
      wrap.hidden = false;
    }
    if (empty) {
      empty.hidden = true;
      empty.className = "records-empty integrity-empty";
    }
  }

  function setStat(id, cardId, value, hasFindings) {
    var node = byId(id);
    var card = byId(cardId);
    if (node) {
      node.textContent = String(value);
    }
    if (card) {
      card.classList.toggle("has-findings", Boolean(hasFindings));
    }
  }

  function renderSummary(report) {
    var summary = report.summary || {};
    var counts = summary.counts || {};
    var critical = numberOrZero(counts.critical);
    var high = numberOrZero(counts.high);
    var medium = numberOrZero(counts.medium);
    var total = numberOrZero(
      summary.totalFindings == null
        ? (report.findings || []).length
        : summary.totalFindings
    );
    var suppressed = numberOrZero(summary.suppressedFindings);

    setStat("integrityStatCritical", "integrityCriticalCard", critical, critical > 0);
    setStat("integrityStatHigh", "integrityHighCard", high, high > 0);
    setStat("integrityStatMedium", "integrityMediumCard", medium, medium > 0);
    setStat("integrityStatTotal", "integrityTotalCard", total, total > 0);

    var generated = byId("integrityGeneratedAt");
    if (generated) {
      var date = new Date(report.generatedAt || "");
      generated.textContent = isNaN(date.getTime())
        ? String(report.generatedAt || "Scan complete")
        : "Scanned " + date.toLocaleString();
      generated.title = report.generatedAt || "";
    }

    var state = String(summary.status || "").toLowerCase();
    var tone = state === "unsafe" ? "error" : state === "attention" ? "warning" : "ok";
    var message =
      "Scan complete: " +
      total +
      (total === 1 ? " finding" : " findings") +
      " (" +
      critical +
      " critical, " +
      high +
      " high)." +
      (suppressed
        ? " " + suppressed + " additional " +
          (suppressed === 1 ? "finding was" : "findings were") +
          " omitted from the table; the downloaded report preserves the count."
        : "");
    setStatus(message, tone);
  }

  function renderReport(report) {
    renderSummary(report);
    renderInputs(report.inputs || {});
    renderFindings(report.findings || []);
  }

  function failScan(error) {
    lastReport = null;
    stale = false;
    setDownloadAvailability(false);
    setStatus(
      (error && error.message) || "The integrity scan could not be completed.",
      "error"
    );
    var empty = byId("integrityFindingsEmpty");
    var wrap = byId("integrityFindingsTableWrap");
    if (wrap) {
      wrap.hidden = true;
    }
    if (empty) {
      empty.hidden = false;
      empty.className = "records-empty integrity-empty is-error";
      empty.textContent = "No report was produced. Resolve the read failure and scan again.";
    }
    return null;
  }

  function runIntegrityScan() {
    if (running) {
      return Promise.resolve(null);
    }
    if (!root.integrity || typeof root.integrity.scanCurrent !== "function") {
      return Promise.resolve(
        failScan(new Error("The integrity scanner is unavailable."))
      );
    }

    running = true;
    stale = false;
    lastReport = null;
    setDownloadAvailability(false);
    setScanBusy(true);
    setStatus("Scanning the current browser data…");

    var request;
    try {
      request = root.integrity.scanCurrent();
    } catch (error) {
      request = Promise.reject(error);
    }

    return Promise.resolve(request)
      .then(function (report) {
        if (!report || report.schema !== "copdocx.integrity-report.v1") {
          throw new Error("The integrity scanner returned an invalid report.");
        }
        if (report.readOnly !== true) {
          throw new Error("The scanner did not verify read-only operation.");
        }
        lastReport = report;
        renderReport(report);
        setDownloadAvailability(true);
        return report;
      })
      .catch(failScan)
      .then(function (result) {
        running = false;
        setScanBusy(false);
        return result;
      });
  }

  function requireCurrentReport() {
    if (!lastReport) {
      setStatus("Run a scan before downloading a report or backup.", "warning");
      return false;
    }
    return true;
  }

  function downloadIntegrityReport() {
    if (!requireCurrentReport()) {
      return Promise.resolve(null);
    }
    if (!root.integrity || typeof root.integrity.downloadReport !== "function") {
      setStatus("Integrity report download is unavailable.", "error");
      return Promise.resolve(null);
    }
    try {
      return Promise.resolve(root.integrity.downloadReport(lastReport)).then(
        function () {
          setStatus("Integrity report downloaded.", "ok");
          return lastReport;
        },
        function (error) {
          setStatus(
            (error && error.message) || "The integrity report could not be downloaded.",
            "error"
          );
          return null;
        }
      );
    } catch (error) {
      setStatus(error.message || "The integrity report could not be downloaded.", "error");
      return Promise.resolve(null);
    }
  }

  function downloadIntegrityBackup() {
    if (!requireCurrentReport()) {
      return Promise.resolve(null);
    }
    if (stale) {
      setStatus("Workspace data changed after this scan. Run a new scan first.", "warning");
      return Promise.resolve(null);
    }
    if (!root.safetyBackup || typeof root.safetyBackup.download !== "function") {
      setStatus("Full safety backup is unavailable.", "error");
      return Promise.resolve(null);
    }

    var button = byId("downloadIntegrityBackupButton");
    if (button) {
      button.disabled = true;
      button.textContent = "Collecting and verifying…";
    }
    setStatus("Collecting and verifying the full safety backup…");

    var request;
    try {
      request = root.safetyBackup.download(lastReport);
    } catch (error) {
      request = Promise.reject(error);
    }

    return Promise.resolve(request)
      .then(function (result) {
        if (result && result.ok === false) {
          throw new Error(result.error || "The full safety backup was not verified.");
        }
        if (result && result.verified === false) {
          throw new Error("The full safety backup was not verified.");
        }
        var message = "Full safety backup downloaded and verified.";
        if (result && result.filename) {
          message += " " + result.filename;
        }
        if (result && Array.isArray(result.warnings) && result.warnings.length) {
          message += " Review " + result.warnings.length + " backup warning" +
            (result.warnings.length === 1 ? "." : "s.");
        }
        setStatus(message, result && result.warnings && result.warnings.length ? "warning" : "ok");
        return result || null;
      })
      .catch(function (error) {
        setStatus(
          (error && error.message) || "The full safety backup could not be completed.",
          "error"
        );
        return null;
      })
      .then(function (result) {
        if (button) {
          button.disabled = stale;
          button.textContent = "Download full backup";
        }
        return result;
      });
  }

  function trackedStorageKeys() {
    if (!root.config || !Array.isArray(root.config.storageEntries)) {
      return [
        "copdocx.store.v1",
        "copdoc.admin.v1",
        "alien-book-in.saved-records.v1"
      ];
    }
    return root.config.storageEntries.filter(function (entry) {
      return entry &&
        (entry.medium === "localStorage" || entry.medium === "sessionStorage");
    }).map(function (entry) {
      return entry.key;
    }).filter(Boolean);
  }

  function markReportStale(event) {
    if (!lastReport || !event) {
      return;
    }
    var keys = trackedStorageKeys();
    if (event.key !== null && keys.indexOf(event.key) === -1) {
      return;
    }
    stale = true;
    setDownloadAvailability(true);
    setStatus("Workspace data changed after this scan. Run scan again.", "warning");
  }

  function boot() {
    if (!document.body || document.body.getAttribute("data-page") !== "integrity") {
      return;
    }
    setScanBusy(false);
    setDownloadAvailability(false);
    if (!root.integrity || typeof root.integrity.scanCurrent !== "function") {
      setStatus("The integrity scanner is unavailable.", "error");
      var button = scanButton();
      if (button) {
        button.disabled = true;
      }
    }
  }

  global.runIntegrityScan = runIntegrityScan;
  global.downloadIntegrityReport = downloadIntegrityReport;
  global.downloadIntegrityBackup = downloadIntegrityBackup;

  if (typeof global.addEventListener === "function") {
    global.addEventListener("storage", markReportStale);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})(typeof window !== "undefined" ? window : globalThis);
