/**
 * Workspace File Import / Export. Reads localStorage keys directly so
 * Home (no store.js / admin.js) still works. Does not merge stores.
 */
(function (global) {
  "use strict";

  var FORMAT = "copdocx.transfer.v1";
  var LEAD_KEY = "copdocx.store.v1";
  var ADMIN_KEY = "copdoc.admin.v1";
  var BOOKIN_KEY = "alien-book-in.saved-records.v1";
  var MAX_BYTES = 10 * 1024 * 1024;

  var TYPE_META = [
    { key: "leads", label: "Leads" },
    { key: "officers", label: "Officers" },
    { key: "vehicles", label: "Vehicles" },
    { key: "shifts", label: "Schedule" },
    { key: "bookin", label: "Book-in" },
    { key: "encounters", label: "Encounters" }
  ];

  function pageKey() {
    if (typeof document === "undefined" || !document.body) {
      return "";
    }
    return document.body.getAttribute("data-page") || "";
  }

  function setStatus(message, ok) {
    if (global.COPDoc && COPDoc.setAppBarStatus) {
      COPDoc.setAppBarStatus(message, ok ? { ok: true } : undefined);
    }
  }

  function appVersion() {
    if (typeof document === "undefined") {
      return "0.16.1";
    }
    var el = document.getElementById("appVersion");
    return (el && el.getAttribute("data-version")) || "0.16.1";
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

  function readJson(key, fallback) {
    if (typeof localStorage === "undefined") {
      return fallback;
    }
    try {
      var raw = localStorage.getItem(key);
      if (!raw) {
        return fallback;
      }
      return JSON.parse(raw);
    } catch (error) {
      return fallback;
    }
  }

  function writeJson(key, value) {
    if (typeof localStorage === "undefined") {
      return false;
    }
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      return false;
    }
  }

  function isCommitted(row) {
    if (!row) {
      return false;
    }
    if (global.COPDoc && COPDoc.model && typeof COPDoc.model.isCommitted === "function") {
      return COPDoc.model.isCommitted(row);
    }
    return !row.meta || row.meta.status !== "draft";
  }

  function recordId(type, row) {
    if (!row) {
      return "";
    }
    if (type === "leads") {
      return row.leadId || "";
    }
    if (type === "encounters") {
      return row.encounterId || "";
    }
    if (type === "officers") {
      return row.officerId || row.id || "";
    }
    if (type === "vehicles") {
      return row.vehicleId || row.id || "";
    }
    return row.id || "";
  }

  function recordDay(type, row) {
    if (!row) {
      return "";
    }
    if (type === "encounters") {
      return String(
        row.startedAt ||
          (row.meta && (row.meta.updatedAt || row.meta.committedAt)) ||
          ""
      ).slice(0, 10);
    }
    if (type === "shifts") {
      return String(row.date || "").slice(0, 10);
    }
    if (type === "bookin") {
      return String(row.updatedAt || row.createdAt || "").slice(0, 10);
    }
    return String(
      (row.meta && (row.meta.updatedAt || row.meta.committedAt || row.meta.createdAt)) ||
        row.updatedAt ||
        row.createdAt ||
        ""
    ).slice(0, 10);
  }

  function inRange(day, from, to) {
    if (!from && !to) {
      return true;
    }
    if (!day) {
      return false;
    }
    if (from && day < from) {
      return false;
    }
    if (to && day > to) {
      return false;
    }
    return true;
  }

  function jsonEqual(a, b) {
    try {
      return JSON.stringify(a) === JSON.stringify(b);
    } catch (error) {
      return false;
    }
  }

  function emptyLeadStore() {
    return {
      schema: LEAD_KEY,
      currentLeadId: "",
      people: {},
      leads: {},
      encounters: {}
    };
  }

  function emptyAdmin() {
    return { officers: [], vehicles: [], shifts: [] };
  }

  function readLeadStore() {
    var store = readJson(LEAD_KEY, emptyLeadStore());
    store.leads = store.leads || {};
    store.people = store.people || {};
    store.encounters = store.encounters || {};
    return store;
  }

  function readAdmin() {
    var admin = readJson(ADMIN_KEY, emptyAdmin());
    admin.officers = admin.officers || [];
    admin.vehicles = admin.vehicles || [];
    admin.shifts = admin.shifts || [];
    return admin;
  }

  function readBookin() {
    var raw = readJson(BOOKIN_KEY, []);
    return Array.isArray(raw) ? raw : [];
  }

  function listType(type) {
    if (type === "leads") {
      var store = readLeadStore();
      return Object.keys(store.leads)
        .map(function (id) {
          return store.leads[id];
        })
        .filter(isCommitted);
    }
    if (type === "encounters") {
      var encStore = readLeadStore();
      return Object.keys(encStore.encounters || {})
        .map(function (id) {
          return encStore.encounters[id];
        })
        .filter(isCommitted);
    }
    var admin = readAdmin();
    if (type === "officers") {
      return admin.officers.filter(isCommitted);
    }
    if (type === "vehicles") {
      return admin.vehicles.filter(isCommitted);
    }
    if (type === "shifts") {
      return admin.shifts.slice();
    }
    if (type === "bookin") {
      return readBookin();
    }
    return [];
  }

  function filterRecords(records, type, from, to) {
    return (records || []).filter(function (row) {
      return row && recordId(type, row) && inRange(recordDay(type, row), from, to);
    });
  }

  function collectExport(types, from, to) {
    var out = {
      format: FORMAT,
      appVersion: appVersion(),
      exportedAt: new Date().toISOString(),
      filters: { types: types.slice(), from: from || "", to: to || "" },
      leads: [],
      officers: [],
      vehicles: [],
      shifts: [],
      bookin: [],
      encounters: []
    };
    types.forEach(function (type) {
      out[type] = filterRecords(listType(type), type, from, to);
    });
    return out;
  }

  function exportCount(bundle) {
    return TYPE_META.reduce(function (sum, meta) {
      return sum + ((bundle[meta.key] && bundle[meta.key].length) || 0);
    }, 0);
  }

  function csvEscape(value) {
    var text = String(value == null ? "" : value);
    if (/[",\n\r]/.test(text)) {
      return '"' + text.replace(/"/g, '""') + '"';
    }
    return text;
  }

  function csvTable(headers, rows) {
    return (
      headers.join(",") +
      "\r\n" +
      rows
        .map(function (row) {
          return row.map(csvEscape).join(",");
        })
        .join("\r\n") +
      "\r\n"
    );
  }

  function personName(person) {
    var name = (person && person.name) || person || {};
    return {
      last: name.lastName || person.lastName || "",
      first: name.firstName || person.firstName || ""
    };
  }

  function officerCity(row) {
    var loc = row && row.locations && row.locations[0];
    if (loc && loc.city) {
      return loc.city;
    }
    return (row && row.address && row.address.city) || "";
  }

  function typeCsv(type, records) {
    if (type === "leads") {
      return csvTable(
        [
          "leadId",
          "lastName",
          "firstName",
          "middleName",
          "sex",
          "dateOfBirth",
          "age",
          "citizenship",
          "alienNumber",
          "caseNumber",
          "leadSource",
          "licensePlate",
          "plateState",
          "updatedAt"
        ],
        records.map(function (snap) {
          var person = snap.person || {};
          var name = person.name || {};
          var immigration = person.immigration || {};
          var source = snap.source || {};
          var vehicle = (snap.vehicles && snap.vehicles[0]) || {};
          return [
            snap.leadId,
            name.lastName,
            name.firstName,
            name.middleName,
            person.sex,
            person.dateOfBirth,
            person.age,
            person.citizenship,
            immigration.alienNumber,
            source.caseNumber,
            source.leadSource,
            vehicle.licensePlate || vehicle.plate,
            vehicle.plateState || vehicle.state,
            recordDay("leads", snap)
          ];
        })
      );
    }
    if (type === "officers") {
      return csvTable(
        ["officerId", "lastName", "firstName", "badge", "callSign", "duty", "role", "city", "updatedAt"],
        records.map(function (row) {
          var n = personName(row);
          return [
            recordId("officers", row),
            n.last,
            n.first,
            row.badge || "",
            row.callSign || "",
            row.duty || "",
            row.role || "",
            officerCity(row),
            recordDay("officers", row)
          ];
        })
      );
    }
    if (type === "vehicles") {
      return csvTable(
        ["vehicleId", "unit", "licensePlate", "plateState", "make", "model", "status", "updatedAt"],
        records.map(function (row) {
          return [
            recordId("vehicles", row),
            row.unit || "",
            row.licensePlate || row.plate || "",
            row.plateState || "",
            row.vehicleMake || row.make || "",
            row.vehicleModel || row.model || "",
            row.status || "",
            recordDay("vehicles", row)
          ];
        })
      );
    }
    if (type === "encounters") {
      return csvTable(
        ["encounterId", "startedAt", "plates", "address", "subjects", "status"],
        records.map(function (row) {
          var first = (row.vehicles && row.vehicles[0]) || {};
          var loc = (row.locations && row.locations[0]) || {};
          var names = (row.subjects || [])
            .map(function (s) {
              return [s.lastName, s.firstName].filter(Boolean).join(", ");
            })
            .filter(Boolean)
            .join("; ");
          return [
            row.encounterId,
            row.startedAt || "",
            first.licensePlate || first.plate || "",
            [loc.street, loc.city, loc.state].filter(Boolean).join(", "),
            names,
            row.meta && row.meta.status ? row.meta.status : ""
          ];
        })
      );
    }
    if (type === "shifts") {
      return csvTable(
        ["id", "date", "officerId", "vehicleId", "start", "end", "assignment"],
        records.map(function (row) {
          return [
            row.id,
            row.date || "",
            row.officerId || "",
            row.vehicleId || "",
            row.start || "",
            row.end || "",
            row.assignment || ""
          ];
        })
      );
    }
    return csvTable(
      ["id", "lastName", "firstName", "aNumber", "iceEvent", "updatedAt"],
      records.map(function (row) {
        return [
          row.id,
          row.lastName || "",
          row.firstName || "",
          row.aNumber || "",
          row.iceEvent || "",
          recordDay("bookin", row)
        ];
      })
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

  function parseTransfer(text) {
    var data;
    try {
      data = JSON.parse(text);
    } catch (error) {
      throw new Error("That file is not valid JSON.");
    }
    var empty = {
      format: FORMAT,
      appVersion: "",
      exportedAt: "",
      leads: [],
      officers: [],
      vehicles: [],
      shifts: [],
      bookin: [],
      encounters: []
    };
    if (Array.isArray(data)) {
      empty.leads = data;
      empty.format = "leads-array";
      return empty;
    }
    if (!data || typeof data !== "object") {
      throw new Error("That file has no records.");
    }
    if (data.format === "alien-book-in-records") {
      empty.bookin = Array.isArray(data.records) ? data.records : [];
      empty.format = data.format;
      empty.appVersion = data.appVersion || "";
      empty.exportedAt = data.exportedAt || "";
      return empty;
    }
    if (data.format && data.format !== FORMAT && data.format !== "leads-array") {
      throw new Error("Unknown export format: " + data.format);
    }
    TYPE_META.forEach(function (meta) {
      empty[meta.key] = Array.isArray(data[meta.key]) ? data[meta.key] : [];
    });
    empty.format = data.format || FORMAT;
    empty.appVersion = data.appVersion || "";
    empty.exportedAt = data.exportedAt || "";
    return empty;
  }

  function cleanList(type, rows) {
    var seen = {};
    var out = [];
    var skipped = 0;
    (rows || []).forEach(function (row) {
      var id = recordId(type, row);
      if (!id || seen[id]) {
        skipped += 1;
        return;
      }
      if (
        (type === "leads" ||
          type === "officers" ||
          type === "vehicles" ||
          type === "encounters") &&
        !isCommitted(row)
      ) {
        skipped += 1;
        return;
      }
      seen[id] = true;
      out.push(row);
    });
    return { rows: out, skipped: skipped };
  }

  function rememberPeople(store, snap) {
    var subject = snap.person;
    if (subject && subject.personId) {
      store.people[subject.personId] = subject;
    }
    (snap.people || []).forEach(function (person) {
      if (person && person.personId) {
        store.people[person.personId] = person;
      }
    });
  }

  function mergeById(existingList, incoming, type) {
    var byId = {};
    existingList.forEach(function (row) {
      var id = recordId(type, row);
      if (id) {
        byId[id] = row;
      }
    });
    var added = 0;
    var updated = 0;
    var skipped = 0;
    incoming.forEach(function (row) {
      var id = recordId(type, row);
      var current = byId[id];
      if (!current) {
        byId[id] = row;
        added += 1;
        return;
      }
      if (jsonEqual(current, row)) {
        skipped += 1;
        return;
      }
      byId[id] = row;
      updated += 1;
    });
    return {
      rows: Object.keys(byId).map(function (id) {
        return byId[id];
      }),
      added: added,
      updated: updated,
      skipped: skipped
    };
  }

  function summarizeAgainstDisk(parsed) {
    return TYPE_META.map(function (meta) {
      var cleaned = cleanList(meta.key, parsed[meta.key]);
      var existing = {};
      listType(meta.key).forEach(function (row) {
        existing[recordId(meta.key, row)] = true;
      });
      var neu = 0;
      var already = 0;
      cleaned.rows.forEach(function (row) {
        if (existing[recordId(meta.key, row)]) {
          already += 1;
        } else {
          neu += 1;
        }
      });
      return {
        key: meta.key,
        label: meta.label,
        count: cleaned.rows.length,
        newCount: neu,
        already: already,
        skipped: cleaned.skipped
      };
    });
  }

  function applyImport(parsed, types) {
    var result = { added: 0, updated: 0, skipped: 0 };
    types.forEach(function (type) {
      var cleaned = cleanList(type, parsed[type]);
      result.skipped += cleaned.skipped;
      if (type === "encounters") {
        var encStore = readLeadStore();
        encStore.encounters = encStore.encounters || {};
        cleaned.rows.forEach(function (row) {
          var id = row.encounterId;
          var current = encStore.encounters[id];
          if (!current) {
            encStore.encounters[id] = row;
            result.added += 1;
            return;
          }
          if (jsonEqual(current, row)) {
            result.skipped += 1;
            return;
          }
          encStore.encounters[id] = row;
          result.updated += 1;
        });
        writeJson(LEAD_KEY, encStore);
        return;
      }
      if (type === "leads") {
        var store = readLeadStore();
        cleaned.rows.forEach(function (snap) {
          var id = snap.leadId;
          var current = store.leads[id];
          if (!current) {
            store.leads[id] = snap;
            rememberPeople(store, snap);
            result.added += 1;
            return;
          }
          if (jsonEqual(current, snap)) {
            result.skipped += 1;
            return;
          }
          store.leads[id] = snap;
          rememberPeople(store, snap);
          result.updated += 1;
        });
        writeJson(LEAD_KEY, store);
        return;
      }
      if (type === "bookin") {
        var mergedBook = mergeById(readBookin(), cleaned.rows, "bookin");
        writeJson(BOOKIN_KEY, mergedBook.rows);
        result.added += mergedBook.added;
        result.updated += mergedBook.updated;
        result.skipped += mergedBook.skipped;
        return;
      }
      var admin = readAdmin();
      var merged = mergeById(admin[type] || [], cleaned.rows, type);
      admin[type] = merged.rows;
      writeJson(ADMIN_KEY, admin);
      result.added += merged.added;
      result.updated += merged.updated;
      result.skipped += merged.skipped;
    });
    return result;
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

  function checkedTypes(name) {
    var boxes = document.querySelectorAll('input[name="' + name + '"]:checked');
    return Array.prototype.map.call(boxes, function (el) {
      return el.value;
    });
  }

  function ensureUi() {
    if (byId("fileExportDialog")) {
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
      '<label><input type="radio" name="fileImportMode" value="all" checked> Everything in the file</label>' +
      '<label><input type="radio" name="fileImportMode" value="selected"> Selected types</label>' +
      '<div id="fileImportTypes" class="check-grid"></div>' +
      '<p class="section-note">Merges by id. Exact duplicates skip. Same id with different data is replaced by the file.</p>' +
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

    byId("fileExportCancel").addEventListener("click", hideDialogs);
    byId("fileImportCancel").addEventListener("click", hideDialogs);
    exportBox.addEventListener("click", function (event) {
      if (event.target === exportBox) {
        hideDialogs();
      }
    });
    importBox.addEventListener("click", function (event) {
      if (event.target === importBox) {
        hideDialogs();
      }
    });
    byId("fileExportGo").addEventListener("click", runExport);
    byId("fileImportGo").addEventListener("click", runImport);
    fileInput.addEventListener("change", onPickFile);
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        hideDialogs();
      }
    });
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

  function runExport() {
    var types = checkedTypes("fileExportType");
    if (!types.length) {
      setStatus("Pick at least one record type.");
      return;
    }
    var formatEl = document.querySelector('input[name="fileExportFormat"]:checked');
    var format = formatEl ? formatEl.value : "json";
    var from = (byId("fileExportFrom") && byId("fileExportFrom").value) || "";
    var to = (byId("fileExportTo") && byId("fileExportTo").value) || "";
    var bundle = collectExport(types, from, to);
    if (!exportCount(bundle)) {
      setStatus("No matching records for that type and date range.");
      return;
    }
    var day = todayStamp();
    if (format === "json" || format === "both") {
      downloadBlob(
        "COPDoc_export_" + day + ".json",
        "application/json",
        JSON.stringify(bundle, null, 2)
      );
    }
    if (format === "csv" || format === "both") {
      types.forEach(function (type) {
        var rows = bundle[type] || [];
        if (!rows.length) {
          return;
        }
        downloadBlob(
          "COPDoc_" + type + "_" + day + ".csv",
          "text/csv;charset=utf-8",
          typeCsv(type, rows)
        );
      });
    }
    hideDialogs();
    setStatus("Export downloaded.", true);
  }

  function openFileImport() {
    ensureUi();
    var picker = byId("fileImportPicker");
    picker.value = "";
    picker.click();
  }

  function onPickFile(event) {
    var file = event.target.files && event.target.files[0];
    if (!file) {
      return;
    }
    if (file.size > MAX_BYTES) {
      setStatus("That file is larger than 10 MB.");
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
    if (!list.childNodes.length) {
      setStatus("That file has no importable records.");
      pendingParsed = null;
      return;
    }
    var all = document.querySelector('input[name="fileImportMode"][value="all"]');
    if (all) {
      all.checked = true;
    }
    hideDialogs();
    byId("fileImportDialog").hidden = false;
  }

  function runImport() {
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
    var result = applyImport(pendingParsed, types);
    hideDialogs();
    pendingParsed = null;
    setStatus(
      "Imported " +
        result.added +
        " new, updated " +
        result.updated +
        ", skipped " +
        result.skipped +
        ".",
      true
    );
    window.setTimeout(function () {
      window.location.reload();
    }, 400);
  }

  var api = {
    FORMAT: FORMAT,
    listType: listType,
    filterRecords: filterRecords,
    collectExport: collectExport,
    parseTransfer: parseTransfer,
    cleanList: cleanList,
    applyImport: applyImport,
    summarizeAgainstDisk: summarizeAgainstDisk,
    recordId: recordId,
    recordDay: recordDay,
    inRange: inRange,
    jsonEqual: jsonEqual,
    openFileExport: openFileExport,
    openFileImport: openFileImport
  };

  var root = (global.COPDoc = global.COPDoc || {});
  root.transfer = api;
  global.openFileExport = openFileExport;
  global.openFileImport = openFileImport;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
