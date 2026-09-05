/**
 * Shared arrest roster: Cases, Admin, Encounter subjects.
 * Reads store.listArrests. Report uses COPDoc.arrestReport.
 */
(function (global) {
  "use strict";

  var root = (global.COPDoc = global.COPDoc || {});
  var COLUMNS = [
    { id: "name", label: "Subject" },
    { id: "age", label: "Age" },
    { id: "country", label: "Country" },
    { id: "aNumber", label: "A-Number" },
    { id: "fbiNumber", label: "FBI Number" },
    { id: "iceEvent", label: "ICE Event" },
    { id: "encounterNumber", label: "Encounter" },
    { id: "disposition", label: "Disposition" },
    { id: "arrestDateTime", label: "Arrest Date/Time" }
  ];

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
      '<p class="section-note">Summary table of the shown columns, then each saved Baseball Card. Copy and paste into an email.</p>' +
      '<div class="email-report-scroll" tabindex="0" role="region" aria-label="Generated arrest report">' +
      '<div id="arrestReportContent" class="email-report-content"></div></div>' +
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
    if (!content || !content.innerHTML) {
      return;
    }
    var html = content.innerHTML;
    var plain = content.innerText || "";
    function selectionCopy() {
      var range = document.createRange();
      range.selectNodeContents(content);
      var sel = global.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      var ok = document.execCommand("copy");
      sel.removeAllRanges();
      return ok;
    }
    if (global.isSecureContext && navigator.clipboard && navigator.clipboard.write && global.ClipboardItem) {
      navigator.clipboard
        .write([
          new global.ClipboardItem({
            "text/html": new Blob([html], { type: "text/html" }),
            "text/plain": new Blob([plain], { type: "text/plain" })
          })
        ])
        .catch(function () {
          selectionCopy();
        });
      return;
    }
    selectionCopy();
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
    var encounterId = text(options.encounterId);
    var showDates = !todayOnly && !encounterId;
    var showGenerate = options.showGenerate !== false;
    var showSelection = options.showSelection !== false;
    var showColumns = options.showColumns !== false;
    if (showGenerate) {
      ensureDialog();
    }
    var selected = {};
    var sortKey = "arrestDateTime";
    var sortDir = "desc";
    var visible = {};
    COLUMNS.forEach(function (col) {
      visible[col.id] = true;
    });

    host.innerHTML =
      (todayOnly
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
        box.checked = true;
        box.setAttribute("data-col", col.id);
        label.appendChild(box);
        label.appendChild(document.createTextNode(" " + col.label));
        colBox.appendChild(label);
        box.addEventListener("change", function () {
          visible[col.id] = box.checked;
          paint();
        });
      });
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
      if (encounterId) {
        opts.encounterId = encounterId;
      }
      return opts;
    }

    function rows() {
      var api = store();
      if (!api || typeof api.listArrests !== "function") {
        return [];
      }
      if (typeof api.loadFromDisk === "function") {
        api.loadFromDisk();
      }
      var list = api.listArrests(queryOpts()) || [];
      list = list.slice().sort(function (a, b) {
        var av = text(a[sortKey]);
        var bv = text(b[sortKey]);
        var cmp = av.localeCompare(bv);
        return sortDir === "desc" ? -cmp : cmp;
      });
      return list;
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
      paintHead();
      body.replaceChildren();
      empty.hidden = list.length > 0;
      wrap.hidden = list.length === 0;
      var selectedCount = 0;
      list.forEach(function (row) {
        var key = text(row.arrestId || row.bookinRecordId || row.leadId);
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
          td.textContent = dash(row[col.id]);
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
      if (selectedEl) {
        selectedEl.textContent = selectedCount + " selected";
      }
      var headline = host.querySelector("[data-arrest-headline]");
      if (headline) {
        var encounters = {};
        list.forEach(function (row) {
          var id = text(row.encounterNumber || row.encounterId);
          if (id) {
            encounters[id] = true;
          }
        });
        var nEnc = Object.keys(encounters).length;
        headline.textContent =
          list.length +
          " arrest" +
          (list.length === 1 ? "" : "s") +
          " today in " +
          nEnc +
          " encounter" +
          (nEnc === 1 ? "" : "s") +
          ".";
      }
      var reportBtn = host.querySelector("[data-arrest-report]");
      if (reportBtn) {
        if (selectedCount > 0) {
          reportBtn.textContent = "Generate selected report";
        } else if (todayOnly) {
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
        reportRows = list.filter(function (row) {
          var key = text(row.arrestId || row.bookinRecordId || row.leadId);
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
        : todayOnly
          ? "today"
          : encounterId
            ? "encounter"
            : "selected";
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
        content.innerHTML = report.html;
        dialog.hidden = false;
        var miss = report.missingCardCount
          ? report.missingCardCount + " missing a Baseball Card."
          : "All arrests have a Baseball Card.";
        setStatus("Report generated. " + miss, !report.missingCardCount);
      }
      if (typeof api.hydratePhotos === "function") {
        return api.hydratePhotos(reportRows, root.media).then(open, function () {
          open(reportRows);
        });
      }
      open(reportRows);
    }

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
          selected[text(row.arrestId || row.bookinRecordId || row.leadId)] = true;
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
    paint();
    return { refresh: paint, generate: generate };
  }

  root.arrestRoster = { mount: mount, columns: COLUMNS };
})(typeof window !== "undefined" ? window : globalThis);
