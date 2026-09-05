/** Workspace import/export dialogs, file delivery and window navigation. */
(function (global) {
  "use strict";
  var root = global.COPDoc = global.COPDoc || {};
  var config = root.config;
  var service = root.application.createTransfer({
    config: config,
    getModel: function () { return root.model; },
    getBaseball: function () { return root.baseball; },
    getDecoder: function () { return root.importSchema; },
    getImportWorkflow: function () { return root.importWorkflow; },
    getAppVersion: appVersion,
    repository: root.repositories.transfer
  });
  var FORMAT = service.FORMAT;
  var MAX_BYTES = service.MAX_BYTES;
  var TYPE_META = service.TYPE_META;
  var listType = service.listType;
  var filterRecords = service.filterRecords;
  var collectExport = service.collectExport;
  var collectBookInContext = service.collectBookInContext;
  var parseTransfer = service.parseTransfer;
  var cleanList = service.cleanList;
  var applyImport = service.applyImport;
  var buildImportPlan = service.buildImportPlan;
  var summarizeAgainstDisk = service.summarizeAgainstDisk;
  var recordId = service.recordId;
  var recordDay = service.recordDay;
  var inRange = service.inRange;
  var jsonEqual = service.jsonEqual;
  var canonicalBookInStore = service.canonicalBookInStore;
  var typeCsv = service.typeCsv;

  function pageKey() {
    if (typeof document === "undefined" || !document.body) {
      return "";
    }
    return document.body.getAttribute("data-page") || "";
  }

  function isImportPage() {
    return pageKey() === "import";
  }

  function setStatus(message, ok) {
    var local = typeof document !== "undefined" ? byId("importStatus") : null;
    if (local) {
      local.hidden = !message;
      local.textContent = message || "";
    }
    if (global.COPDoc && COPDoc.setAppBarStatus) {
      COPDoc.setAppBarStatus(message, ok ? { ok: true } : undefined);
    }
  }

  function appVersion() {
    if (typeof document === "undefined") {
      return (config && config.productVersion) || "0.69.2";
    }
    var el = document.getElementById("appVersion");
    return (
      (config && config.productVersion) ||
      (el && el.getAttribute("data-version")) ||
      "0.69.2"
    );
  }

  function todayStamp() {
    var d = new Date();
    var m = d.getMonth() + 1;
    var day = d.getDate();
    return (
      String(d.getFullYear()) +
      (m < 10 ? "0" + m : String(m)) +
      (day < 10 ? "0" + day : String(day))
    );
  }

  function downloadBlob(filename, mime, text) {
    var blob = new Blob([text], { type: mime });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function scriptAlreadyExecuted(scriptEl) {
    if (!scriptEl) {
      return false;
    }
    if (scriptEl.dataset && scriptEl.dataset.loaded === "true") {
      return true;
    }
    if (scriptEl.dataset && scriptEl.dataset.loaded === "pending") {
      return false;
    }
    return typeof document !== "undefined" && document.readyState !== "loading";
  }

  function loadModelScript(src) {
    return new Promise(function (resolve, reject) {
      if (typeof document === "undefined") {
        resolve();
        return;
      }
      var existing = document.querySelector('script[src="' + src + '"]');
      if (existing) {
        if (scriptAlreadyExecuted(existing)) {
          resolve();
          return;
        }
        existing.addEventListener(
          "load",
          function () {
            existing.dataset.loaded = "true";
            resolve();
          },
          { once: true }
        );
        existing.addEventListener("error", reject, { once: true });
        return;
      }
      var script = document.createElement("script");
      script.src = src;
      script.async = false;
      script.dataset.loaded = "pending";
      script.addEventListener(
        "load",
        function () {
          script.dataset.loaded = "true";
          resolve();
        },
        { once: true }
      );
      script.addEventListener("error", reject, { once: true });
      document.head.appendChild(script);
    });
  }

  async function ensureCanonicalBookInStore() {
    if (typeof document === "undefined") {
      return canonicalBookInStore();
    }
    var catalogs = [];
    if (!Array.isArray(global.COUNTRIES)) {
      catalogs.push("data/countries.js");
    }
    if (!Array.isArray(global.IMMIGRATION_DISPOSITIONS)) {
      catalogs.push("data/immigration.js");
    }
    if (!global.COPDoc || !COPDoc.models || !Array.isArray(COPDoc.models.ASSOCIATION_MATRIX)) catalogs.push("data/association-matrix.js");
    var catalogIndex;
    for (catalogIndex = 0; catalogIndex < catalogs.length; catalogIndex += 1) {
      await loadModelScript(catalogs[catalogIndex]);
    }
    var boundaries = [
      ["domain", "createCanonicalRecords", "functions/domain/canonical-records.js"],
      ["domain", "createEncounterSubjectPolicy", "functions/domain/encounter-subject-policy.js"],
      ["domain", "createBookingProjection", "functions/domain/booking-projection.js"],
      ["projections", "createEncounterCompletion", "functions/projections/encounter-completion.js"]
    ];
    for (var boundaryIndex = 0; boundaryIndex < boundaries.length; boundaryIndex += 1) {
      var boundary = boundaries[boundaryIndex];
      if (!root[boundary[0]] || !root[boundary[0]][boundary[1]]) await loadModelScript(boundary[2]);
    }
    var sources = [
      ["util", "newId"], ["person", "createPerson"], ["lead", "createLead"],
      ["vehicle", "createVehicle"], ["location", "createLocation"], ["link", "createAssociation"],
      ["encounter", "createEncounterRecord"], ["business", "createBusiness"], ["entity", "createCustomEntity"],
      ["investigation", "createInvestigation"], ["operation", "createOperation"], ["store", "store"]
    ];
    for (var index = 0; index < sources.length; index += 1) {
      var model = global.COPDoc && COPDoc.model;
      if (!model || !model[sources[index][1]]) await loadModelScript("functions/model/" + sources[index][0] + ".js");
    }
    return canonicalBookInStore();
  }

  function defaultTypes() {
    var page = pageKey();
    if (page === "leads" || page === "lead" || page === "lead-form") {
      return ["leads"];
    }
    if (page === "encounter" || page === "encounter-form") {
      return ["encounters"];
    }
    if (page === "officers" || page === "officer" || page === "officer-form") {
      return ["officers"];
    }
    if (page === "vehicles" || page === "vehicle" || page === "vehicle-form") {
      return ["vehicles"];
    }
    if (page === "schedule" || page === "dashboard") {
      return ["shifts"];
    }
    if (page === "bookin") {
      return ["bookin"];
    }
    if (page === "investigations" || page === "investigate") {
      return ["investigations"];
    }
    if (
      page === "operations" ||
      page === "operation" ||
      page === "operation-form" ||
      page === "operation-brief"
    ) {
      return ["operations"];
    }
    return TYPE_META.map(function (meta) {
      return meta.key;
    });
  }

  var pendingParsed = null;
  var pendingFileName = "";

  function byId(id) {
    return document.getElementById(id);
  }

  function hideDialogs() {
    ["fileExportDialog", "fileImportDialog"].forEach(function (id) {
      var el = byId(id);
      if (el) {
        el.hidden = true;
      }
    });
  }

  function screenAvail() {
    var screenObj = global.screen;
    return {
      width: Number((screenObj && (screenObj.availWidth || screenObj.width)) || 1440),
      height: Number((screenObj && (screenObj.availHeight || screenObj.height)) || 900),
      left: Number((screenObj && screenObj.availLeft) || 0),
      top: Number((screenObj && screenObj.availTop) || 0)
    };
  }

  function popupFeatures() {
    var avail = screenAvail();
    var width = 480;
    var height = 280;
    var left = Math.max(16, Math.round((avail.width - width) / 2) + avail.left);
    var top = Math.max(16, Math.round((avail.height - height) / 2) + avail.top);
    return {
      width: width,
      height: height,
      left: left,
      top: top,
      text: [
        "popup=yes",
        "popup=true",
        "width=" + width,
        "height=" + height,
        "left=" + left,
        "top=" + top,
        "scrollbars=yes",
        "resizable=yes"
      ].join(",")
    };
  }

  function importWindowChrome() {
    var chromeW = (Number(global.outerWidth) || 0) - (Number(global.innerWidth) || 0);
    var chromeH = (Number(global.outerHeight) || 0) - (Number(global.innerHeight) || 0);
    if (!isFinite(chromeW) || chromeW < 0 || chromeW > 80) {
      chromeW = 16;
    }
    if (!isFinite(chromeH) || chromeH < 8 || chromeH > 240) {
      chromeH = 72;
    }
    return { width: chromeW, height: chromeH };
  }

  function importConfirming() {
    var confirmBox = byId("fileImportConfirm");
    return !!(confirmBox && !confirmBox.hidden);
  }

  function measureImportContent() {
    var root = document.documentElement;
    if (root) {
      root.classList.add("is-import-measuring");
    }
    var width = 0;
    var height = 0;
    try {
      var panel = document.querySelector(".import-panel");
      var panelBox = panel && panel.getBoundingClientRect ? panel.getBoundingClientRect() : null;
      width = Math.ceil(
        Math.max(
          panelBox ? panelBox.width : 0,
          document.body ? document.body.scrollWidth : 0,
          root ? root.scrollWidth : 0
        )
      );
      height = Math.ceil(
        Math.max(
          document.body ? document.body.scrollHeight : 0,
          root ? root.scrollHeight : 0,
          document.body ? document.body.offsetHeight : 0
        )
      );
    } catch (err) {}
    if (root) {
      root.classList.remove("is-import-measuring");
    }
    return { width: width, height: height };
  }

  function fitImportWindow() {
    if (!isImportPage() || typeof global.resizeTo !== "function") {
      return;
    }
    var confirming = importConfirming();
    var avail = screenAvail();
    var chrome = importWindowChrome();
    var content = measureImportContent();
    var minW = confirming ? 560 : 460;
    var minH = confirming ? 600 : 260;
    var innerW = Math.max(minW - chrome.width, content.width || 0, confirming ? 540 : 420);
    var innerH = Math.max(minH - chrome.height, content.height || 0, confirming ? 560 : 220);
    if (innerH < 80) {
      innerH = confirming ? 640 : 240;
    }
    var width = Math.min(avail.width - 24, Math.max(minW, innerW + chrome.width + 8));
    var height = Math.min(avail.height - 24, Math.max(minH, innerH + chrome.height + 12));
    var clamped = height >= avail.height - 24;
    if (document.body) {
      document.body.classList.toggle("import-window-clamped", clamped);
    }
    try {
      global.resizeTo(width, height);
    } catch (err) {}
    if (typeof global.moveTo !== "function") {
      return;
    }
    var left = Number(global.screenX);
    var top = Number(global.screenY);
    if (!isFinite(left)) {
      left = avail.left + 16;
    }
    if (!isFinite(top)) {
      top = avail.top + 16;
    }
    if (left + width > avail.left + avail.width - 8) {
      left = Math.max(avail.left + 8, avail.left + avail.width - width - 8);
    }
    if (top + height > avail.top + avail.height - 8) {
      top = Math.max(avail.top + 8, avail.top + avail.height - height - 8);
    }
    if (left < avail.left + 8) {
      left = avail.left + 8;
    }
    if (top < avail.top + 8) {
      top = avail.top + 8;
    }
    try {
      global.moveTo(left, top);
    } catch (err2) {}
  }

  function scheduleFitImportWindow() {
    if (!isImportPage()) {
      return;
    }
    function run() {
      try {
        fitImportWindow();
      } catch (err) {}
    }
    if (typeof global.requestAnimationFrame === "function") {
      global.requestAnimationFrame(function () {
        global.requestAnimationFrame(run);
      });
    } else if (typeof global.setTimeout === "function") {
      global.setTimeout(run, 0);
    } else {
      run();
    }
    if (typeof global.setTimeout === "function") {
      global.setTimeout(run, 80);
    }
  }

  function openImportPopup() {
    if (typeof global.open !== "function") {
      return null;
    }
    var href = "import.html";
    try {
      if (global.location && global.location.href && typeof URL === "function") {
        href = new URL("import.html", global.location.href).href;
      }
    } catch (err) {}
    var size = popupFeatures();
    var win = null;
    try {
      win = global.open(href, "copdoc-import", size.text);
    } catch (err2) {}
    if (!win) {
      return null;
    }
    try {
      if (typeof win.resizeTo === "function") {
        win.resizeTo(size.width, size.height);
      }
      if (typeof win.moveTo === "function") {
        win.moveTo(size.left, size.top);
      }
    } catch (err3) {}
    try {
      if (typeof win.focus === "function") {
        win.focus();
      }
    } catch (err4) {}
    return win;
  }

  function notifyOpenerImported() {
    try {
      root.repositories.transfer.notifyImported();
    } catch (err) {}
    try {
      if (global.opener && !global.opener.closed) {
        if (typeof global.opener.postMessage === "function") {
          global.opener.postMessage({ type: "copdocx-import-done" }, "*");
        }
        try {
          if (global.opener.location && typeof global.opener.location.reload === "function") {
            global.opener.location.reload();
          }
        } catch (errReload) {}
        if (typeof global.opener.focus === "function") {
          global.opener.focus();
        }
      }
    } catch (err2) {}
  }

  function clickImportPicker() {
    var picker = byId("fileImportPicker");
    if (!picker) {
      return;
    }
    picker.value = "";
    picker.click();
  }

  function checkedTypes(name) {
    var boxes = document.querySelectorAll('input[name="' + name + '"]:checked');
    return Array.prototype.map.call(boxes, function (el) {
      return el.value;
    });
  }

  function bindTransferUi() {
    if (typeof document === "undefined" || !document.body) {
      return;
    }
    if (document.body.dataset.transferBound === "true") {
      return;
    }
    document.body.dataset.transferBound = "true";
    var exportCancel = byId("fileExportCancel");
    if (exportCancel) {
      exportCancel.addEventListener("click", hideDialogs);
    }
    var importCancel = byId("fileImportCancel");
    if (importCancel) {
      importCancel.addEventListener("click", function () {
        if (isImportPage()) {
          pendingParsed = null;
          try {
            global.close();
          } catch (err) {}
          return;
        }
        hideDialogs();
      });
    }
    var exportBox = byId("fileExportDialog");
    if (exportBox) {
      exportBox.addEventListener("click", function (event) {
        if (event.target === exportBox) {
          hideDialogs();
        }
      });
    }
    var importBox = byId("fileImportDialog");
    if (importBox) {
      importBox.addEventListener("click", function (event) {
        if (event.target === importBox) {
          hideDialogs();
        }
      });
    }
    var exportGo = byId("fileExportGo");
    if (exportGo) {
      exportGo.addEventListener("click", runExport);
    }
    var importGo = byId("fileImportGo");
    if (importGo) {
      importGo.addEventListener("click", runImport);
    }
    var fileInput = byId("fileImportPicker");
    if (fileInput) {
      fileInput.addEventListener("change", onPickFile);
    }
    var choose = byId("fileImportChoose");
    if (choose) {
      choose.addEventListener("click", clickImportPicker);
    }
    var chooseOther = byId("fileImportChooseOther");
    if (chooseOther) {
      chooseOther.addEventListener("click", clickImportPicker);
    }
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        if (isImportPage()) {
          try {
            global.close();
          } catch (err) {}
          return;
        }
        hideDialogs();
      }
    });
  }

  function ensureUi() {
    if (isImportPage()) {
      bindTransferUi();
      return;
    }
    if (byId("fileExportDialog")) {
      bindTransferUi();
      return;
    }
    var exportBox = document.createElement("div");
    exportBox.id = "fileExportDialog";
    exportBox.className = "dialog-backdrop";
    exportBox.hidden = true;
    exportBox.innerHTML =
      '<div class="dialog-box dialog-box-transfer" role="dialog" aria-labelledby="fileExportTitle">' +
      "<h2 id=\"fileExportTitle\">Export</h2>" +
      '<p class="section-note">JSON is the backup format. CSV is a flat table per type.</p>' +
      '<div class="dialog-scroll">' +
      "<p>Record types</p>" +
      '<div id="fileExportTypes" class="check-grid"></div>' +
      '<div class="row">' +
      '<div class="field"><label for="fileExportFrom">From</label><input type="date" id="fileExportFrom"></div>' +
      '<div class="field"><label for="fileExportTo">To</label><input type="date" id="fileExportTo"></div>' +
      "</div>" +
      "<p>Format</p>" +
      '<div class="check-grid">' +
      '<label><input type="radio" name="fileExportFormat" value="json" checked> JSON</label>' +
      '<label><input type="radio" name="fileExportFormat" value="csv"> CSV</label>' +
      '<label><input type="radio" name="fileExportFormat" value="both"> Both</label>' +
      "</div></div>" +
      '<div class="dialog-actions">' +
      '<button type="button" class="action-button-secondary" id="fileExportCancel">Cancel</button>' +
      '<button type="button" class="action-button" id="fileExportGo">Export</button>' +
      "</div></div>";

    var importBox = document.createElement("div");
    importBox.id = "fileImportDialog";
    importBox.className = "dialog-backdrop";
    importBox.hidden = true;
    importBox.innerHTML =
      '<div class="dialog-box dialog-box-transfer" role="dialog" aria-labelledby="fileImportTitle">' +
      "<h2 id=\"fileImportTitle\">Import</h2>" +
      '<p id="fileImportMeta" class="section-note"></p>' +
      '<div class="dialog-scroll">' +
      '<ul id="fileImportSummary"></ul>' +
      "<p>Import</p>" +
      '<div class="import-mode-list">' +
      '<label class="radio-option"><input type="radio" name="fileImportMode" value="all" checked> Everything in the file</label>' +
      '<label class="radio-option"><input type="radio" name="fileImportMode" value="selected"> Selected types</label>' +
      "</div>" +
      '<div id="fileImportTypes" class="check-grid"></div>' +
      '<p class="section-note">Merges by id. Exact duplicates skip. A newer local record is kept. JSON backups also restore settings, map, templates, and photos.</p>' +
      "</div>" +
      '<div class="dialog-actions">' +
      '<button type="button" class="action-button-secondary" id="fileImportCancel">Cancel</button>' +
      '<button type="button" class="action-button" id="fileImportGo">Import</button>' +
      "</div></div>";

    var fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.id = "fileImportPicker";
    fileInput.accept = "application/json,.json";
    fileInput.hidden = true;

    document.body.appendChild(exportBox);
    document.body.appendChild(importBox);
    document.body.appendChild(fileInput);
    bindTransferUi();
  }

  function paintExportTypes() {
    var host = byId("fileExportTypes");
    var selected = defaultTypes();
    host.replaceChildren();
    TYPE_META.forEach(function (meta) {
      var count = listType(meta.key).length;
      var label = document.createElement("label");
      var box = document.createElement("input");
      box.type = "checkbox";
      box.name = "fileExportType";
      box.value = meta.key;
      box.checked = selected.indexOf(meta.key) !== -1;
      label.appendChild(box);
      label.appendChild(
        document.createTextNode(" " + meta.label + " (" + count + ")")
      );
      host.appendChild(label);
    });
  }

  function openFileExport() {
    ensureUi();
    paintExportTypes();
    byId("fileExportFrom").value = "";
    byId("fileExportTo").value = "";
    var json = document.querySelector('input[name="fileExportFormat"][value="json"]');
    if (json) {
      json.checked = true;
    }
    hideDialogs();
    byId("fileExportDialog").hidden = false;
  }

  async function runExport() {
    var types = checkedTypes("fileExportType");
    if (!types.length) { setStatus("Pick at least one record type."); return; }
    var formatEl = document.querySelector('input[name="fileExportFormat"]:checked');
    var format = formatEl ? formatEl.value : "json";
    var from = (byId("fileExportFrom") && byId("fileExportFrom").value) || "";
    var to = (byId("fileExportTo") && byId("fileExportTo").value) || "";
    var go = byId("fileExportGo");
    if (go) go.disabled = true;
    try {
      await ensureCanonicalBookInStore();
      if (!root.baseball || typeof root.baseball.fromCanonical !== "function") await loadModelScript("functions/baseball-card-contract.js");
      var captured = await service.buildExport(types, from, to, {
        includeMedia: format === "json" || format === "both",
        exportMedia: async function () {
          if (!root.media || typeof root.media.exportBundle !== "function") await loadModelScript("functions/model/media.js");
          if (!root.media || typeof root.media.exportBundle !== "function") throw new Error("Photo and file storage could not be loaded. Export was not completed.");
          setStatus("Collecting photos and files…");
          return root.media.exportBundle();
        }
      });
      if (!captured.count) { setStatus("No matching records for that type and date range."); return; }
      var bundle = captured.bundle;
      var day = todayStamp();
      if (format === "json" || format === "both") downloadBlob("COPDoc_export_" + day + ".json", "application/json", JSON.stringify(bundle, null, 2));
      if (format === "csv" || format === "both") types.forEach(function (type) {
        var rows = bundle[type] || [];
        if (rows.length) downloadBlob("COPDoc_" + type + "_" + day + ".csv", "text/csv;charset=utf-8", typeCsv(type, rows));
      });
      hideDialogs();
      setStatus("Export downloaded." + (captured.mediaCount ? " " + captured.mediaCount + " media file(s)." : ""), true);
    } catch (error) {
      setStatus(error && error.message || "Export could not be completed.");
    } finally { if (go) go.disabled = false; }
  }

  function openFileImport() {
    if (!isImportPage() && openImportPopup()) {
      return;
    }
    ensureUi();
    clickImportPicker();
  }

  function onPickFile(event) {
    var file = event.target.files && event.target.files[0];
    if (!file) {
      return;
    }
    if (file.size > MAX_BYTES) {
      setStatus("That file is larger than 32 MB.");
      return;
    }
    var reader = new FileReader();
    reader.onload = function () {
      try {
        pendingParsed = parseTransfer(String(reader.result || ""));
        pendingFileName = file.name || "import.json";
        showImportConfirm();
      } catch (error) {
        pendingParsed = null;
        setStatus(error.message || "Could not read that file.");
      }
    };
    reader.onerror = function () {
      setStatus("Could not read that file.");
    };
    reader.readAsText(file);
  }

  function showImportConfirm() {
    var summary = summarizeAgainstDisk(pendingParsed);
    byId("fileImportMeta").textContent =
      pendingFileName +
      " — " +
      (pendingParsed.format || FORMAT) +
      (pendingParsed.exportedAt
        ? " — exported " + String(pendingParsed.exportedAt).slice(0, 10)
        : "");
    var list = byId("fileImportSummary");
    list.replaceChildren();
    var typesHost = byId("fileImportTypes");
    typesHost.replaceChildren();
    summary.forEach(function (row) {
      if (!row.count) {
        return;
      }
      var li = document.createElement("li");
      li.textContent =
        row.label +
        "  " +
        row.count +
        "  (" +
        row.already +
        " already here, " +
        row.newCount +
        " new" +
        (row.skipped ? ", " + row.skipped + " skipped" : "") +
        ")";
      list.appendChild(li);
      var label = document.createElement("label");
      var box = document.createElement("input");
      box.type = "checkbox";
      box.name = "fileImportType";
      box.value = row.key;
      box.checked = true;
      label.appendChild(box);
      label.appendChild(document.createTextNode(" " + row.label));
      typesHost.appendChild(label);
    });
    (pendingParsed.findings || []).filter(function (finding) { return finding.code === "CUSTODY_REVIEW"; }).forEach(function (finding) {
      var li = document.createElement("li");
      var label = document.createElement("label");
      label.appendChild(document.createTextNode(finding.recordId + ": " + finding.message + " "));
      var select = document.createElement("select");
      select.setAttribute("data-import-record-decision", finding.recordId);
      [["", "Choose outcome"], ["DRAFT", "Keep as unfiled draft"], ["ARRESTED", "Confirm arrested booking"]].forEach(function (pair) {
        var option = document.createElement("option");
        option.value = pair[0]; option.textContent = pair[1]; select.appendChild(option);
      });
      label.appendChild(select); li.appendChild(label); list.appendChild(li);
    });
    if (!list.childNodes.length) {
      setStatus("That file has no importable records.");
      pendingParsed = null;
      scheduleFitImportWindow();
      return;
    }
    var all = document.querySelector('input[name="fileImportMode"][value="all"]');
    if (all) {
      all.checked = true;
    }
    var empty = byId("fileImportEmpty");
    var confirmBox = byId("fileImportConfirm");
    if (empty) {
      empty.hidden = true;
    }
    if (confirmBox) {
      confirmBox.hidden = false;
    }
    if (!isImportPage()) {
      hideDialogs();
      var dialog = byId("fileImportDialog");
      if (dialog) {
        dialog.hidden = false;
      }
      return;
    }
    scheduleFitImportWindow();
  }

  function withTimeout(promise, ms, message) {
    return new Promise(function (resolve, reject) {
      var timer = global.setTimeout(function () {
        reject(new Error(message || "Timed out."));
      }, ms);
      promise.then(
        function (value) {
          global.clearTimeout(timer);
          resolve(value);
        },
        function (error) {
          global.clearTimeout(timer);
          reject(error);
        }
      );
    });
  }

  async function runImport() {
    if (!pendingParsed) {
      setStatus("Choose a file to import.");
      return;
    }
    var modeEl = document.querySelector('input[name="fileImportMode"]:checked');
    var mode = modeEl ? modeEl.value : "all";
    var types;
    if (mode === "selected") {
      types = checkedTypes("fileImportType");
    } else {
      types = TYPE_META.map(function (meta) {
        return meta.key;
      }).filter(function (key) {
        return pendingParsed[key] && pendingParsed[key].length;
      });
    }
    if (!types.length) {
      setStatus("Pick at least one record type to import.");
      return;
    }
    var go = byId("fileImportGo");
    if (go) {
      go.disabled = true;
    }
    setStatus("Preparing import preview…");
    try {
      await ensureCanonicalBookInStore();
      var decisions = {};
      Array.from(document.querySelectorAll("[data-import-record-decision]")).forEach(function (select) {
        if (select.value === "DRAFT") decisions[select.getAttribute("data-import-record-decision")] = { keepDraft: true };
        if (select.value === "ARRESTED") decisions[select.getAttribute("data-import-record-decision")] = { outcome: "ARRESTED" };
      });
      var workflow = global.COPDoc && COPDoc.importWorkflow;
      if (!workflow || typeof workflow.apply !== "function" || typeof workflow.preview !== "function") throw new Error("The recoverable import workflow is unavailable.");
      var plan = buildImportPlan(pendingParsed, types, { recordDecisions: decisions });
      if (!plan.ok && plan.findings.some(function (finding) { return finding.code === "CUSTODY_REVIEW"; }) && typeof workflow.reviewCustody === "function") {
        decisions = await workflow.reviewCustody(plan.findings, decisions);
        if (!decisions) { setStatus("Import review closed. No records were changed."); return; }
        plan = buildImportPlan(pendingParsed, types, { recordDecisions: decisions });
      }
      if (!plan.ok) throw new Error(plan.error);
      if (!await workflow.preview(plan)) {
        setStatus("Import preview closed. No records were changed.");
        return;
      }
      var result = await workflow.apply(plan);
      if (!result || !result.ok) throw new Error(result && result.error || "Import could not be completed. Use import recovery before retrying.");
      hideDialogs();
      pendingParsed = null;
      setStatus("Imported " + (plan.stats.added || 0) + " new, updated " + (plan.stats.updated || 0) +
        ", skipped " + (plan.stats.skipped || 0) + ".", true);
      if (isImportPage()) notifyOpenerImported();
      else if (global.COPDoc && COPDoc.model && COPDoc.model.store) COPDoc.model.store.loadFromDisk();
    } catch (error) {
      setStatus(error && error.message || "Import failed.");
    } finally {
      if (go) go.disabled = false;
    }
  }

  var api = {
    FORMAT: FORMAT,
    listType: listType,
    filterRecords: filterRecords,
    collectExport: collectExport,
    collectBookInContext: collectBookInContext,
    parseTransfer: parseTransfer,
    cleanList: cleanList,
    applyImport: applyImport,
    buildImportPlan: buildImportPlan,
    ensureCanonicalBookInStore: ensureCanonicalBookInStore,
    summarizeAgainstDisk: summarizeAgainstDisk,
    recordId: recordId,
    recordDay: recordDay,
    inRange: inRange,
    jsonEqual: jsonEqual,
    openFileExport: openFileExport,
    openFileImport: openFileImport,
    loadModelScript: loadModelScript
  };

  root.transfer = api;
  global.openFileExport = openFileExport;
  global.openFileImport = openFileImport;

  function listenImportDone() {
    if (typeof window === "undefined" || isImportPage()) {
      return;
    }
    if (typeof window.addEventListener !== "function") {
      return;
    }
    var reloading = false;
    function reloadHome() {
      if (reloading) {
        return;
      }
      reloading = true;
      window.location.reload();
    }
    window.addEventListener("message", function (event) {
      if (!event.data || event.data.type !== "copdocx-import-done") {
        return;
      }
      reloadHome();
    });
    window.addEventListener("storage", function (event) {
      if (event.key !== "copdocx.import.done.v1") {
        return;
      }
      reloadHome();
    });
  }

  if (typeof document !== "undefined") {
    function bootTransferPage() {
      if (isImportPage()) {
        ensureUi();
        scheduleFitImportWindow();
        if (typeof global.addEventListener === "function") {
          global.addEventListener("load", scheduleFitImportWindow, { once: true });
        }
      }
      listenImportDone();
    }
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", bootTransferPage);
    } else {
      bootTransferPage();
    }
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
