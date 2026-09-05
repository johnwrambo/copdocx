/**
 * Shared arrest roster: Cases, Admin, Encounter subjects.
 * Reads store.listArrests. Report uses COPDoc.arrestReport.
 */
(function (global) {
  "use strict";

  var root = (global.COPDoc = global.COPDoc || {});
  var COLUMNS = (root.arrestReport && root.arrestReport.columns) || [
    { id: "name", label: "Subject", reportLabel: "Name" },
    { id: "age", label: "Age" }, { id: "country", label: "Country" },
    { id: "aNumber", label: "A-Number" }, { id: "fbiNumber", label: "FBI Number" },
    { id: "iceEvent", label: "ICE Event" },
    { id: "encounterNumber", label: "Encounter", reportLabel: "Encounter Number" },
    { id: "disposition", label: "Disposition" },
    { id: "arrestDateTime", label: "Arrest Date/Time" }, { id: "updatedAt", label: "Last Saved" }
  ];
  var generatedReport = null;

  function settingsKey() {
    return root.config && root.config.storageKey ? root.config.storageKey("settings") : "copdocx.settings.v1";
  }

  function readPreferences() {
    var settings = JSON.parse(global.localStorage.getItem(settingsKey()) || "{}");
    if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
      throw new Error("Report preferences could not be read.");
    }
    return { settings: settings, preferences: settings.arrestReportRoster || {} };
  }

  function loadPreferences() {
    try { return readPreferences().preferences; }
    catch (error) { setStatus(error.message); return {}; }
  }

  function savePreferences(visible, sortKey, sortDir) {
    try {
      var settings = readPreferences().settings;
      settings.arrestReportRoster = {
        version: 1, visibleColumns: COLUMNS.filter(function (col) { return visible[col.id]; }).map(function (col) { return col.id; }),
        sortKey: sortKey, sortDirection: sortDir
      };
      global.localStorage.setItem(settingsKey(), JSON.stringify(settings));
      return true;
    } catch (error) {
      setStatus("Report preferences could not be saved: " + error.message);
      return false;
    }
  }

  function byId(id) {
    return document.getElementById(id);
  }

  function text(value) {
    return String(value == null ? "" : value).trim();
  }

  function dash(value) {
    return text(value) || "—";
  }

  function todayKey() {
    var now = new Date();
    var m = String(now.getMonth() + 1);
    var d = String(now.getDate());
    if (m.length < 2) {
      m = "0" + m;
    }
    if (d.length < 2) {
      d = "0" + d;
    }
    return now.getFullYear() + "-" + m + "-" + d;
  }

  function store() {
    var model = root.model;
    return model && model.store;
  }

  function ensureDialog() {
    if (byId("arrestReportDialog")) {
      return;
    }
    var wrap = document.createElement("div");
    wrap.id = "arrestReportDialog";
    wrap.className = "dialog-backdrop";
    wrap.hidden = true;
    wrap.innerHTML =
      '<div class="dialog-box report-dialog-box" role="dialog" aria-modal="true" aria-labelledby="arrestReportDialogTitle">' +
      '<h2 id="arrestReportDialogTitle">Arrest report</h2>' +
      '<p class="section-note">Shown columns and selected arrests, followed by the designated finalized card for each date. Copy and paste into an email.</p>' +
      '<div class="email-report-scroll" tabindex="0" role="region" aria-label="Generated arrest report">' +
      '<div id="arrestReportContent" class="email-report-content"></div></div>' +
      '<p id="arrestReportCopyStatus" role="status" aria-live="polite"></p>' +
      '<div class="dialog-actions">' +
      '<button type="button" class="action-button" id="arrestReportCopy">Copy report for email</button>' +
      '<button type="button" class="action-button-secondary" id="arrestReportClose">Close</button>' +
      "</div></div>";
    document.body.appendChild(wrap);
    byId("arrestReportClose").addEventListener("click", function () {
      wrap.hidden = true;
    });
    byId("arrestReportCopy").addEventListener("click", copyReport);
  }

  function copyReport() {
    var content = byId("arrestReportContent");
    if (!content || !generatedReport) { return Promise.resolve(false); }
    var html = generatedReport.html;
    var plain = generatedReport.plainText;
    function result(message, ok) {
      var status = byId("arrestReportCopyStatus");
      if (status) { status.textContent = message; }
      setStatus(message, ok);
      return ok;
    }
    function selectionCopy() {
      try {
        var range = document.createRange(); range.selectNodeContents(content);
        var sel = global.getSelection(); sel.removeAllRanges(); sel.addRange(range);
        var ok = document.execCommand("copy");
        if (ok) { sel.removeAllRanges(); }
        return ok;
      } catch (error) { return false; }
    }
    function textFallback() {
      var clipboard = global.navigator && global.navigator.clipboard;
      if (clipboard && typeof clipboard.writeText === "function") {
        return Promise.resolve().then(function () { return clipboard.writeText(plain); }).then(function () {
          return result("Report copied as plain text. Formatting and images are not included.", true);
        }).catch(textareaFallback);
      }
      return Promise.resolve(textareaFallback());
    }
    function textareaFallback() {
      var input;
      try {
        input = document.createElement("textarea"); input.value = plain;
        input.setAttribute("aria-label", "Report text to copy");
        document.body.appendChild(input); input.select();
        if (document.execCommand("copy")) {
          input.remove(); return result("Report copied as plain text. Formatting and images are not included.", true);
        }
      } catch (error) { /* Retain the report preview for manual copying. */ }
      if (input && input.remove) { input.remove(); }
      return result("Copy failed. Select the report preview and copy it manually.", false);
    }
    function fallback() {
      if (selectionCopy()) { return result("Report copied for email.", true); }
      return textFallback();
    }
    var clipboard = global.navigator && global.navigator.clipboard;
    if (global.isSecureContext && clipboard && clipboard.write && global.ClipboardItem) {
      return Promise.resolve().then(function () {
        return clipboard.write([new global.ClipboardItem({
          "text/html": new global.Blob([html], { type: "text/html" }),
          "text/plain": new global.Blob([plain], { type: "text/plain" })
        })]);
      }).then(function () { return result("Report copied for email.", true); }).catch(fallback);
    }
    return Promise.resolve(fallback());
  }

  function setStatus(message, ok) {
    if (root.setAppBarStatus) {
      root.setAppBarStatus(message, ok ? { ok: true } : undefined);
    }
  }

  function mount(host, options) {
    options = options || {};
    if (!host) {
      return;
    }
    var todayOnly = options.todayOnly === true;
    var defaultToday = options.defaultToday === true || todayOnly;
    var encounterId = text(options.encounterId);
    var showDates = !todayOnly && !encounterId;
    var showGenerate = options.showGenerate !== false;
    var showSelection = options.showSelection !== false;
    var showColumns = options.showColumns !== false;
    if (showGenerate) {
      ensureDialog();
    }
    var selected = {};
    var preferences = loadPreferences();
    var sortKey = COLUMNS.some(function (col) { return col.id === preferences.sortKey; }) ? preferences.sortKey : "arrestDateTime";
    var sortDir = preferences.sortDirection === "asc" ? "asc" : "desc";
    var visible = {};
    COLUMNS.forEach(function (col) {
      visible[col.id] = !showColumns || !Array.isArray(preferences.visibleColumns) || preferences.visibleColumns.indexOf(col.id) !== -1;
    });

    host.innerHTML =
      (defaultToday
        ? '<p class="section-note" data-arrest-headline></p>'
        : "") +
      (todayOnly
        ? ""
        : '<div class="records-filters" aria-label="Arrest filters">' +
          '<div class="field"><label for="arrestRosterSearch">Search</label>' +
          '<input id="arrestRosterSearch" type="search" placeholder="Name, A-number, FBI, ICE, encounter, country" autocomplete="off"></div>' +
          (showDates
            ? '<div class="field"><label for="arrestRosterFrom">Arrest date from</label>' +
              '<input id="arrestRosterFrom" type="date"></div>' +
              '<div class="field"><label for="arrestRosterTo">Arrest date through</label>' +
              '<input id="arrestRosterTo" type="date"></div>'
            : "") +
          '<button type="button" class="action-button-secondary compact" data-arrest-clear>Clear</button>' +
          "</div>") +
      '<div class="records-view-toolbar">' +
      (showColumns
        ? '<details class="records-column-picker"><summary data-arrest-col-summary>Columns</summary>' +
          '<div class="records-columns-panel"><div class="records-column-options" data-arrest-cols></div></div></details>'
        : "") +
      (!todayOnly && !encounterId ? '<button type="button" class="action-button-secondary compact" data-arrest-today>Today</button>' : "") +
      (showSelection && !todayOnly
        ? '<button type="button" class="action-button-secondary compact" data-arrest-select>Select filtered</button>' +
          '<button type="button" class="action-button-secondary compact" data-arrest-unselect>Clear selection</button>'
        : "") +
      (showGenerate
        ? '<button type="button" class="action-button compact" data-arrest-report>' +
          (todayOnly ? "Generate today's report" : "Generate report") +
          "</button>"
        : "") +
      '<span class="active-record-label" data-arrest-count>0 shown</span>' +
      (showSelection
        ? '<span class="active-record-label" data-arrest-selected>0 selected</span>'
        : "") +
      "</div>" +
      '<p class="records-empty" data-arrest-empty>No arrests.</p>' +
      '<div class="records-table-wrap" data-arrest-wrap hidden>' +
      '<table class="records-table"><thead data-arrest-head></thead>' +
      '<tbody data-arrest-body></tbody></table></div>';

    var colBox = host.querySelector("[data-arrest-cols]");
    if (colBox) {
      COLUMNS.forEach(function (col) {
        var label = document.createElement("label");
        var box = document.createElement("input");
        box.type = "checkbox";
        box.checked = !!visible[col.id];
        box.setAttribute("data-col", col.id);
        label.appendChild(box);
        label.appendChild(document.createTextNode(" " + col.label));
        colBox.appendChild(label);
        box.addEventListener("change", function () {
          if (!box.checked && visibleColumns().length === 1 && visible[col.id]) {
            box.checked = true;
            setStatus("At least one report column must remain visible.");
            return;
          }
          visible[col.id] = box.checked;
          paint();
          savePreferences(visible, sortKey, sortDir);
        });
      });
    }

    if (defaultToday && !todayOnly) {
      var initialFrom = host.querySelector("#arrestRosterFrom");
      var initialTo = host.querySelector("#arrestRosterTo");
      if (initialFrom) { initialFrom.value = todayKey(); }
      if (initialTo) { initialTo.value = todayKey(); }
    }

    function queryOpts() {
      var opts = {};
      if (todayOnly) {
        opts.from = todayKey();
        opts.to = todayKey();
      } else {
        var fromEl = host.querySelector("#arrestRosterFrom");
        var toEl = host.querySelector("#arrestRosterTo");
        var qEl = host.querySelector("#arrestRosterSearch");
        if (fromEl && fromEl.value) {
          opts.from = fromEl.value;
        }
        if (toEl && toEl.value) {
          opts.to = toEl.value;
        }
        if (qEl && qEl.value) {
          opts.q = qEl.value;
        }
      }
      if (opts.from && opts.to && opts.from > opts.to) {
        var swap = opts.from; opts.from = opts.to; opts.to = swap;
      }
      if (encounterId) { opts.encounterId = encounterId; }
      return opts;
    }

    function rows(unfiltered) {
      var api = store();
      if (!api || typeof api.listArrests !== "function") { return []; }
      if (typeof api.loadFromDisk === "function") { api.loadFromDisk(); }
      var opts = unfiltered ? (encounterId ? { encounterId: encounterId } : {}) : queryOpts();
      var list = api.listArrests(opts) || [];
      return root.arrestReport.sortRows(list, sortKey, sortDir);
    }

    function selectionKey(row) {
      return text(row.personId) + "|" + text(row.arrestId || row.bookinRecordId || row.subjectId || row.leadId);
    }

    function isTodayQuery() {
      var opts = queryOpts();
      return !opts.q && !encounterId && opts.from === todayKey() && opts.to === todayKey();
    }

    function paintHead() {
      var head = host.querySelector("[data-arrest-head]");
      var tr = document.createElement("tr");
      if (showSelection) {
        var sel = document.createElement("th");
        sel.className = "record-select-column";
        tr.appendChild(sel);
      }
      COLUMNS.forEach(function (col) {
        if (!visible[col.id]) {
          return;
        }
        var th = document.createElement("th");
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "record-sort-button";
        btn.textContent = col.label;
        if (sortKey === col.id) {
          th.setAttribute(
            "aria-sort",
            sortDir === "asc" ? "ascending" : "descending"
          );
        }
        btn.addEventListener("click", function () {
          if (sortKey === col.id) {
            sortDir = sortDir === "asc" ? "desc" : "asc";
          } else {
            sortKey = col.id;
            sortDir = "asc";
          }
          paint();
          savePreferences(visible, sortKey, sortDir);
        });
        th.appendChild(btn);
        tr.appendChild(th);
      });
      var actions = document.createElement("th");
      tr.appendChild(actions);
      head.replaceChildren(tr);
    }

    function paint() {
      var list = rows();
      var empty = host.querySelector("[data-arrest-empty]");
      var wrap = host.querySelector("[data-arrest-wrap]");
      var body = host.querySelector("[data-arrest-body]");
      var count = host.querySelector("[data-arrest-count]");
      var selectedEl = host.querySelector("[data-arrest-selected]");
      var summary = host.querySelector("[data-arrest-col-summary]");
      var shownCols = COLUMNS.filter(function (col) {
        return visible[col.id];
      }).length;
      if (summary) {
        summary.textContent = "Columns: " + shownCols + " shown";
      }
      host.querySelectorAll("input[data-col]").forEach(function (box) {
        box.checked = !!visible[box.getAttribute("data-col")];
        box.disabled = box.checked && shownCols === 1;
      });
      paintHead();
      body.replaceChildren();
      empty.hidden = list.length > 0;
      wrap.hidden = list.length === 0;
      var selectedCount = 0;
      list.forEach(function (row) {
        var key = selectionKey(row);
        var tr = document.createElement("tr");
        if (showSelection) {
          var tdSel = document.createElement("td");
          tdSel.className = "record-select-column";
          var box = document.createElement("input");
          box.type = "checkbox";
          box.checked = !!selected[key];
          if (box.checked) {
            selectedCount += 1;
          }
          box.addEventListener("change", function () {
            if (box.checked) {
              selected[key] = true;
            } else {
              delete selected[key];
            }
            paint();
          });
          tdSel.appendChild(box);
          tr.appendChild(tdSel);
        }
        COLUMNS.forEach(function (col) {
          if (!visible[col.id]) {
            return;
          }
          var td = document.createElement("td");
          td.textContent = root.arrestReport.columnValue(row, col.id);
          tr.appendChild(td);
        });
        var actions = document.createElement("td");
        var cluster = document.createElement("div");
        cluster.className = "record-actions";
        var href = row.leadId
          ? "case.html?id=" + encodeURIComponent(row.leadId)
          : row.bookinRecordId
            ? "bookin.html?recordId=" + encodeURIComponent(row.bookinRecordId)
            : "";
        if (href) {
          var open = document.createElement("a");
          open.className = "action-button-secondary compact";
          open.href = href;
          open.textContent = "Open";
          cluster.appendChild(open);
        }
        actions.appendChild(cluster);
        tr.appendChild(actions);
        body.appendChild(tr);
      });
      if (count) {
        count.textContent = list.length + " shown";
      }
      var allKeys = Object.create(null);
      rows(true).forEach(function (row) { allKeys[selectionKey(row)] = true; });
      Object.keys(selected).forEach(function (key) { if (!allKeys[key]) { delete selected[key]; } });
      var totalSelected = Object.keys(selected).length;
      if (selectedEl) {
        selectedEl.textContent = totalSelected + " selected" +
          (totalSelected > selectedCount ? " (" + (totalSelected - selectedCount) + " hidden by filters)" : "");
      }
      var headline = host.querySelector("[data-arrest-headline]");
      if (headline) {
        var nEnc = root.arrestReport.uniqueEncounterCount(list);
        var missing = list.filter(function (row) { return !row.encounterLinkValid; }).length;
        headline.textContent = list.length + " arrest" + (list.length === 1 ? "" : "s") +
          (isTodayQuery() ? " today" : " shown") + " in " + nEnc + " encounter" + (nEnc === 1 ? "" : "s") + "." +
          (missing ? " " + missing + " missing a valid Encounter link." : "");
      }
      var reportBtn = host.querySelector("[data-arrest-report]");
      if (reportBtn) {
        if (totalSelected > 0) {
          reportBtn.textContent = "Generate selected report";
        } else if (isTodayQuery()) {
          reportBtn.textContent = "Generate today's report";
        } else {
          reportBtn.textContent = "Generate report";
        }
      }
    }

    function visibleColumns() {
      return COLUMNS.filter(function (col) {
        return visible[col.id];
      });
    }

    function generate() {
      var api = root.arrestReport;
      var list = rows();
      var keys = Object.keys(selected);
      var reportRows = list;
      if (keys.length) {
        reportRows = rows(true).filter(function (row) {
          var key = selectionKey(row);
          return selected[key];
        });
      }
      if (!api || typeof api.build !== "function") {
        setStatus("The arrest report is not available.");
        return;
      }
      if (!reportRows.length) {
        setStatus("No arrests match this report.");
        return;
      }
      var mode = keys.length
        ? "selected"
        : isTodayQuery()
          ? "today"
          : encounterId
            ? "encounter"
            : "selected";
      if (!visibleColumns().length) {
        setStatus("Choose at least one report column before generating.");
        return;
      }
      function open(hydrated) {
        var report = api.build(hydrated, {
          mode: mode,
          columns: visibleColumns()
        });
        var content = byId("arrestReportContent");
        var dialog = byId("arrestReportDialog");
        if (!content || !dialog) {
          setStatus("The report preview could not be opened.");
          return;
        }
        generatedReport = report;
        content.innerHTML = report.html;
        dialog.hidden = false;
        var copyStatus = byId("arrestReportCopyStatus");
        if (copyStatus) { copyStatus.textContent = ""; }
        var note = report.cardCount ? " " + report.cardCount + " finalized Baseball Card" + (report.cardCount === 1 ? "" : "s") + " included." : "";
        var warnings = (report.warnings || []).join(" ");
        setStatus("Report generated." + note + (warnings ? " " + warnings : ""), !warnings);
        return report;
      }
      if (typeof api.hydratePhotos === "function") {
        return api.hydratePhotos(reportRows, root.media).then(open).catch(function (error) {
          setStatus("Report could not be generated: " + error.message);
          return null;
        });
      }
      try { return open(reportRows); }
      catch (error) { setStatus("Report could not be generated: " + error.message); return null; }
    }

    host.querySelectorAll("[data-arrest-today]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var q = host.querySelector("#arrestRosterSearch");
        var from = host.querySelector("#arrestRosterFrom");
        var to = host.querySelector("#arrestRosterTo");
        if (q) { q.value = ""; }
        if (from) { from.value = todayKey(); }
        if (to) { to.value = todayKey(); }
        selected = {}; paint();
      });
    });
    host.querySelectorAll("[data-arrest-clear]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var q = host.querySelector("#arrestRosterSearch");
        var fromEl = host.querySelector("#arrestRosterFrom");
        var toEl = host.querySelector("#arrestRosterTo");
        if (q) {
          q.value = "";
        }
        if (fromEl) {
          fromEl.value = "";
        }
        if (toEl) {
          toEl.value = "";
        }
        paint();
      });
    });
    host.querySelectorAll("[data-arrest-select]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        rows().forEach(function (row) {
          selected[selectionKey(row)] = true;
        });
        paint();
      });
    });
    host.querySelectorAll("[data-arrest-unselect]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        selected = {};
        paint();
      });
    });
    host.querySelectorAll("[data-arrest-report]").forEach(function (btn) {
      btn.addEventListener("click", generate);
    });
    ["#arrestRosterSearch", "#arrestRosterFrom", "#arrestRosterTo"].forEach(
      function (sel) {
        var el = host.querySelector(sel);
        if (el) {
          el.addEventListener("input", paint);
          el.addEventListener("change", paint);
        }
      }
    );
    function onRosterStorage(event) {
      var key = event && event.key;
      var workspaceKey = root.config && root.config.storageKey ? root.config.storageKey("workspace") : "copdocx.store.v1";
      var bookinKey = root.config && root.config.storageKey ? root.config.storageKey("bookin") : "alien-book-in.saved-records.v1";
      if (key !== null && key !== workspaceKey && key !== bookinKey) { return; }
      // Repaint from canonical data without remounting: selection, filters,
      // sorting and the user's hidden columns remain intact.
      paint();
    }
    function onImportRecovered() { paint(); }
    if (typeof global.addEventListener === "function") {
      global.addEventListener("storage", onRosterStorage);
      global.addEventListener("copdocx-import-recovered", onImportRecovered);
    }
    function destroy() {
      if (typeof global.removeEventListener === "function") {
        global.removeEventListener("storage", onRosterStorage);
        global.removeEventListener("copdocx-import-recovered", onImportRecovered);
      }
    }
    paint();
    return { refresh: paint, generate: generate, rows: rows, destroy: destroy };
  }

  root.arrestRoster = { mount: mount, columns: COLUMNS, copyReport: copyReport };
})(typeof window !== "undefined" ? window : globalThis);
