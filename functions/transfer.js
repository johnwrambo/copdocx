/**
 * Workspace File Import / Export. Reads localStorage keys directly so
 * Home (no store.js / admin.js) still works. Does not merge stores.
 */
(function (global) {
  "use strict";

  var config = global.COPDoc && global.COPDoc.config;
  function registeredKey(id, fallback) {
    var value = config && config.storageKey ? config.storageKey(id) : "";
    return value || fallback;
  }

  var FORMAT = "copdocx.transfer.v1";
  var LEAD_KEY = registeredKey("workspace", "copdocx.store.v1");
  var ADMIN_KEY = registeredKey("admin", "copdoc.admin.v1");
  var BOOKIN_KEY = registeredKey("bookin", "alien-book-in.saved-records.v1");
  var MAX_BYTES = 32 * 1024 * 1024;
  var SETTINGS_KEY = registeredKey("settings", "copdocx.settings.v1");
  var MAP_MARKUP_KEY = registeredKey("mapMarkup", "copdocx.map.markup.v1");
  var MAP_VIEWS_KEY = registeredKey("mapViews", "copdocx.map.views.v1");
  var MAP_LAYERS_KEY = registeredKey("mapLayers", "copdocx.map.layers.v1");
  var MAP_ICONS_KEY = registeredKey("mapIcons", "copdocx.map.icons.v1");
  var MAP_BASEMAP_KEY = registeredKey("mapBasemap", "copdocx.location-map.basemap");
  var TEMPLATE_KEY = registeredKey("narrativeTemplates", "opdoc.narrative.templates.v2");
  var TEMPLATE_LEGACY_KEY = registeredKey("narrativeTemplatesLegacy", "opdoc.narrative.templates.v1");

  var TYPE_META = [
    { key: "leads", label: "Cases" },
    { key: "officers", label: "Officers" },
    { key: "vehicles", label: "Vehicles" },
    { key: "shifts", label: "Schedule" },
    { key: "bookin", label: "Book-in" },
    { key: "encounters", label: "Encounters" },
    { key: "investigations", label: "Investigations" },
    { key: "operations", label: "Operations" }
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
      return (config && config.productVersion) || "0.67.0";
    }
    var el = document.getElementById("appVersion");
    return (
      (config && config.productVersion) ||
      (el && el.getAttribute("data-version")) ||
      "0.67.0"
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

  function readStored(key) {
    if (typeof localStorage === "undefined") {
      return { ok: true, missing: true, value: null, error: "" };
    }
    var raw = "";
    try {
      raw = localStorage.getItem(key) || "";
    } catch (error) {
      return {
        ok: false,
        missing: false,
        value: null,
        error: "Cannot read localStorage."
      };
    }
    if (!raw) {
      return { ok: true, missing: true, value: null, error: "" };
    }
    try {
      return { ok: true, missing: false, value: JSON.parse(raw), error: "" };
    } catch (error) {
      return {
        ok: false,
        missing: false,
        value: null,
        error:
          "Storage is damaged. Import stopped. Do not Save over it."
      };
    }
  }

  function readJson(key, fallback) {
    var stored = readStored(key);
    if (!stored.ok || stored.missing || stored.value == null) {
      return fallback;
    }
    return stored.value;
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
    if (type === "investigations") {
      return row.investigationId || "";
    }
    if (type === "operations") {
      return row.operationId || "";
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

  function asRecordList(value) {
    if (Array.isArray(value)) {
      return value;
    }
    if (value && typeof value === "object") {
      return Object.keys(value).map(function (id) {
        return value[id];
      });
    }
    return [];
  }

  function rowUpdatedAt(row) {
    if (!row) {
      return "";
    }
    return String(
      (row.meta && (row.meta.updatedAt || row.meta.committedAt || row.meta.createdAt)) ||
        row.updatedAt ||
        row.createdAt ||
        ""
    );
  }

  function incomingIsNewer(current, incoming) {
    var localAt = rowUpdatedAt(current);
    var nextAt = rowUpdatedAt(incoming);
    if (localAt && nextAt && localAt > nextAt) {
      return false;
    }
    return true;
  }

  function emptyLeadStore() {
    return {
      schema: LEAD_KEY,
      currentLeadId: "",
      people: {},
      leads: {},
      encounters: {},
      investigations: {},
      vehicles: {},
      locations: {},
      businesses: {},
      entities: {},
      associations: {},
      operations: {}
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
    store.investigations = store.investigations || {};
    store.vehicles = store.vehicles || {};
    store.locations = store.locations || {};
    store.businesses = store.businesses || {};
    store.entities = store.entities || {};
    store.associations = store.associations || {};
    store.operations = store.operations || {};
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
    if (type === "investigations") {
      var invStore = readLeadStore();
      return Object.keys(invStore.investigations || {}).map(function (id) {
        return invStore.investigations[id];
      });
    }
    if (type === "operations") {
      var opStore = readLeadStore();
      return Object.keys(opStore.operations || {})
        .map(function (id) {
          return opStore.operations[id];
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

  function collectSupportState() {
    var templates =
      readJson(TEMPLATE_KEY, null) || readJson(TEMPLATE_LEGACY_KEY, []);
    var basemap = "";
    if (typeof localStorage !== "undefined") {
      try {
        basemap = localStorage.getItem(MAP_BASEMAP_KEY) || "";
      } catch (error) {
        basemap = "";
      }
    }
    return {
      settings: readJson(SETTINGS_KEY, {}),
      map: {
        markup: readJson(MAP_MARKUP_KEY, null),
        views: readJson(MAP_VIEWS_KEY, null),
        layers: readJson(MAP_LAYERS_KEY, null),
        icons: readJson(MAP_ICONS_KEY, null),
        basemap: basemap
      },
      templates: Array.isArray(templates) ? templates : []
    };
  }

  function applySupportState(parsed) {
    if (
      parsed.settings &&
      typeof parsed.settings === "object" &&
      Object.keys(parsed.settings).length
    ) {
      writeJson(SETTINGS_KEY, parsed.settings);
    }
    if (parsed.map && typeof parsed.map === "object") {
      if (parsed.map.markup) {
        writeJson(MAP_MARKUP_KEY, parsed.map.markup);
      }
      if (parsed.map.views) {
        writeJson(MAP_VIEWS_KEY, parsed.map.views);
      }
      if (parsed.map.layers) {
        writeJson(MAP_LAYERS_KEY, parsed.map.layers);
      }
      if (parsed.map.icons) {
        writeJson(MAP_ICONS_KEY, parsed.map.icons);
      }
      if (parsed.map.basemap && typeof localStorage !== "undefined") {
        try {
          localStorage.setItem(MAP_BASEMAP_KEY, String(parsed.map.basemap));
        } catch (error) {}
      }
    }
    if (Array.isArray(parsed.templates) && parsed.templates.length) {
      writeJson(TEMPLATE_KEY, parsed.templates);
    }
  }

  function collectInvestigationObjects(rows) {
    var store = readLeadStore();
    var out = {
      people: {},
      vehicles: {},
      locations: {},
      businesses: {},
      entities: {},
      associations: {}
    };
    function take(type, id) {
      if (!id) {
        return;
      }
      if (type === "PERSON" && store.people[id]) {
        out.people[id] = store.people[id];
      }
      if (type === "VEHICLE" && store.vehicles[id]) {
        out.vehicles[id] = store.vehicles[id];
      }
      if (type === "LOCATION" && store.locations[id]) {
        out.locations[id] = store.locations[id];
      }
      if (type === "BUSINESS" && store.businesses[id]) {
        out.businesses[id] = store.businesses[id];
      }
      if (type === "ENTITY" && store.entities[id]) {
        out.entities[id] = store.entities[id];
      }
    }
    (rows || []).forEach(function (inv) {
      ((inv && inv.nodes) || []).forEach(function (node) {
        if (node) {
          take(node.objectType, node.objectId);
        }
      });
    });
    Object.keys(store.associations || {}).forEach(function (id) {
      var row = store.associations[id];
      if (!row || !row.from || !row.to) {
        return;
      }
      var fromTaken =
        (row.from.type === "PERSON" && out.people[row.from.id]) ||
        (row.from.type === "VEHICLE" && out.vehicles[row.from.id]) ||
        (row.from.type === "LOCATION" && out.locations[row.from.id]) ||
        (row.from.type === "BUSINESS" && out.businesses[row.from.id]) ||
        (row.from.type === "ENTITY" && out.entities[row.from.id]);
      var toTaken =
        (row.to.type === "PERSON" && out.people[row.to.id]) ||
        (row.to.type === "VEHICLE" && out.vehicles[row.to.id]) ||
        (row.to.type === "LOCATION" && out.locations[row.to.id]) ||
        (row.to.type === "BUSINESS" && out.businesses[row.to.id]) ||
        (row.to.type === "ENTITY" && out.entities[row.to.id]);
      if (fromTaken || toTaken) {
        take(row.from.type, row.from.id);
        take(row.to.type, row.to.id);
        out.associations[id] = row;
      }
    });
    return out;
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
      encounters: [],
      investigations: [],
      operations: [],
      investigationObjects: {
        people: {},
        vehicles: {},
        locations: {},
        businesses: {},
        entities: {},
        associations: {}
      }
    };
    types.forEach(function (type) {
      out[type] = filterRecords(listType(type), type, from, to);
    });
    if (types.indexOf("investigations") !== -1) {
      out.investigationObjects = collectInvestigationObjects(out.investigations);
    }
    if (types.indexOf("encounters") !== -1) {
      var encIds = {};
      out.encounters.forEach(function (row) {
        if (row && row.encounterId) {
          encIds[row.encounterId] = true;
        }
      });
      var extraBook = readBookin().filter(function (row) {
        return row && row.encounterId && encIds[row.encounterId];
      });
      var haveBook = {};
      out.bookin.forEach(function (row) {
        if (row && row.id) {
          haveBook[row.id] = true;
        }
      });
      extraBook.forEach(function (row) {
        if (row && row.id && !haveBook[row.id]) {
          out.bookin.push(row);
          haveBook[row.id] = true;
        }
      });
    }
    var support = collectSupportState();
    out.settings = support.settings;
    out.map = support.map;
    out.templates = support.templates;
    return out;
  }

  function exportCount(bundle) {
    return TYPE_META.reduce(function (sum, meta) {
      return sum + ((bundle[meta.key] && bundle[meta.key].length) || 0);
    }, 0);
  }

  function csvEscape(value) {
    if (global.COPDoc && COPDoc.model && typeof COPDoc.model.csvCell === "function") {
      return COPDoc.model.csvCell(value);
    }
    var text = String(value == null ? "" : value);
    if (/^[=+\-@\t]/.test(text)) {
      text = "'" + text;
    }
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
    if (type === "operations") {
      return csvTable(
        ["operationId", "name", "plannedStart", "plannedEnd", "targets", "updatedAt"],
        records.map(function (row) {
          return [
            row.operationId || "",
            row.name || "",
            row.plannedStart || "",
            row.plannedEnd || "",
            (row.targets || []).length,
            recordDay("operations", row)
          ];
        })
      );
    }
    if (type === "investigations") {
      return csvTable(
        ["investigationId", "kind", "title", "parentInvestigationId", "nodes", "updatedAt"],
        records.map(function (row) {
          return [
            row.investigationId || "",
            row.kind || "",
            row.title || "",
            row.parentInvestigationId || "",
            (row.nodes || []).length,
            recordDay("investigations", row)
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
      encounters: [],
      investigations: [],
      operations: []
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
    if (
      data.format === "copdocx-demo-import" ||
      data.schema === "copdocx.import.v1"
    ) {
      empty.officers = asRecordList((data.admin && data.admin.officers) || data.officers);
      empty.vehicles = asRecordList((data.admin && data.admin.vehicles) || data.vehicles);
      empty.shifts = asRecordList((data.admin && data.admin.shifts) || data.shifts);
      empty.leads = asRecordList(data.leads);
      empty.encounters = asRecordList(data.encounters);
      empty.bookin = asRecordList(data.bookin || data.records);
      empty.format = FORMAT;
      empty.appVersion = data.appVersion || data.appStamp || "";
      empty.exportedAt = data.exportedAt || "";
      return empty;
    }
    if (data.leadId && data.schema === "copdocx.lead.v1") {
      empty.leads = [data];
      empty.format = FORMAT;
      empty.appVersion = data.appVersion || "";
      empty.exportedAt = data.exportedAt || "";
      return empty;
    }
    if (data.format && data.format !== FORMAT && data.format !== "leads-array") {
      throw new Error("Unknown export format: " + data.format);
    }
    TYPE_META.forEach(function (meta) {
      empty[meta.key] = asRecordList(data[meta.key]);
    });
    empty.format = data.format || FORMAT;
    empty.appVersion = data.appVersion || "";
    empty.exportedAt = data.exportedAt || "";
    empty.settings = data.settings && typeof data.settings === "object" ? data.settings : null;
    empty.map = data.map && typeof data.map === "object" ? data.map : null;
    empty.templates = Array.isArray(data.templates) ? data.templates : null;
    empty.media = Array.isArray(data.media) ? data.media : null;
    empty.investigationObjects =
      data.investigationObjects && typeof data.investigationObjects === "object"
        ? data.investigationObjects
        : null;
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
      var incomingRow = row;
      if (type === "bookin") {
        incomingRow = Object.assign({}, row);
        ["leadId", "personId", "arrestId"].forEach(function (key) {
          if (!incomingRow[key] && current[key]) {
            incomingRow[key] = current[key];
          }
        });
        var localComparable = Object.assign({}, current);
        var incomingComparable = Object.assign({}, incomingRow);
        ["leadId", "personId", "arrestId", "canonicalizedAt"].forEach(
          function (key) {
            delete localComparable[key];
            delete incomingComparable[key];
          }
        );
        if (jsonEqual(localComparable, incomingComparable)) {
          skipped += 1;
          return;
        }
      }
      if (jsonEqual(current, incomingRow)) {
        skipped += 1;
        return;
      }
      if (!incomingIsNewer(current, incomingRow)) {
        skipped += 1;
        return;
      }
      byId[id] = incomingRow;
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

  function canonicalBookInStore() {
    var model = global.COPDoc && global.COPDoc.model;
    var store = model && model.store;
    return store && typeof store.promoteBookInRecords === "function"
      ? store
      : null;
  }

  function promoteStoredBookInCases() {
    var store = canonicalBookInStore();
    if (!store) {
      return null;
    }
    var stored = readStored(BOOKIN_KEY);
    if (!stored.ok) {
      return {
        ok: false,
        promoted: 0,
        created: 0,
        reused: 0,
        failed: 0,
        error: stored.error
      };
    }
    var rows = Array.isArray(stored.value) ? stored.value : [];
    store.loadFromDisk();
    var summary = store.promoteBookInRecords(rows);
    if (!writeJson(BOOKIN_KEY, summary.rows || rows)) {
      summary.ok = false;
      summary.error = "Cases were created, but Book-In links could not be saved.";
    }
    return summary;
  }

  function loadModelScript(src) {
    return new Promise(function (resolve, reject) {
      var existing = document.querySelector('script[src="' + src + '"]');
      if (existing) {
        if (existing.dataset.loaded === "true" || canonicalBookInStore()) {
          resolve();
          return;
        }
        existing.addEventListener("load", resolve, { once: true });
        existing.addEventListener("error", reject, { once: true });
        return;
      }
      var script = document.createElement("script");
      script.src = src;
      script.async = false;
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
    var catalogIndex;
    for (catalogIndex = 0; catalogIndex < catalogs.length; catalogIndex += 1) {
      await loadModelScript(catalogs[catalogIndex]);
    }
    if (canonicalBookInStore()) {
      return canonicalBookInStore();
    }
    var sources = [
      "functions/model/util.js",
      "functions/model/person.js",
      "functions/model/lead.js",
      "functions/model/store.js"
    ];
    var index;
    for (index = 0; index < sources.length; index += 1) {
      if (canonicalBookInStore()) {
        break;
      }
      await loadModelScript(sources[index]);
    }
    return canonicalBookInStore();
  }

  function addPromotionStats(result, promotion) {
    if (!promotion) {
      return;
    }
    result.bookinPromotionAttempted = true;
    result.casesCreated = promotion.created || 0;
    result.casesReused = promotion.reused || 0;
    result.casePromotionFailed = promotion.failed || 0;
    if (promotion.error) {
      result.error = result.error || promotion.error;
    }
  }

  function applyImport(parsed, types) {
    var result = {
      added: 0,
      updated: 0,
      skipped: 0,
      error: "",
      bookinPromotionAttempted: false,
      casesCreated: 0,
      casesReused: 0,
      casePromotionFailed: 0
    };
    types.forEach(function (type) {
      var cleaned = cleanList(type, parsed[type]);
      result.skipped += cleaned.skipped;
      if (
        type === "encounters" ||
        type === "leads" ||
        type === "investigations" ||
        type === "operations"
      ) {
        var stored = readStored(LEAD_KEY);
        if (!stored.ok) {
          result.error = result.error || stored.error;
          return;
        }
        var store = stored.value || emptyLeadStore();
        store.leads = store.leads || {};
        store.people = store.people || {};
        store.encounters = store.encounters || {};
        store.investigations = store.investigations || {};
        store.vehicles = store.vehicles || {};
        store.locations = store.locations || {};
        store.businesses = store.businesses || {};
        store.entities = store.entities || {};
        store.operations = store.operations || {};
        var added = 0;
        var updated = 0;
        var skipped = 0;
        if (type === "encounters") {
          cleaned.rows.forEach(function (row) {
            var id = row.encounterId;
            var current = store.encounters[id];
            if (!current) {
              store.encounters[id] = row;
              added += 1;
              return;
            }
            if (jsonEqual(current, row)) {
              skipped += 1;
              return;
            }
            if (!incomingIsNewer(current, row)) {
              skipped += 1;
              return;
            }
            store.encounters[id] = row;
            updated += 1;
          });
        } else if (type === "operations") {
          cleaned.rows.forEach(function (row) {
            var id = row.operationId;
            var current = store.operations[id];
            if (!current) {
              store.operations[id] = row;
              added += 1;
              return;
            }
            if (jsonEqual(current, row)) {
              skipped += 1;
              return;
            }
            if (!incomingIsNewer(current, row)) {
              skipped += 1;
              return;
            }
            store.operations[id] = row;
            updated += 1;
          });
        } else if (type === "investigations") {
          cleaned.rows.forEach(function (row) {
            var id = row.investigationId;
            var current = store.investigations[id];
            if (!current) {
              store.investigations[id] = row;
              added += 1;
              return;
            }
            if (jsonEqual(current, row)) {
              skipped += 1;
              return;
            }
            if (!incomingIsNewer(current, row)) {
              skipped += 1;
              return;
            }
            store.investigations[id] = row;
            updated += 1;
          });
          var maps = parsed.investigationObjects || {};
          function mergeMap(dest, incoming) {
            Object.keys(incoming || {}).forEach(function (id) {
              if (!incoming[id]) {
                return;
              }
              if (!dest[id]) {
                dest[id] = incoming[id];
                return;
              }
              if (incomingIsNewer(dest[id], incoming[id])) {
                dest[id] = incoming[id];
              }
            });
          }
          mergeMap(store.people, maps.people);
          mergeMap(store.vehicles, maps.vehicles);
          mergeMap(store.locations, maps.locations);
          mergeMap(store.businesses, maps.businesses);
          mergeMap(store.entities, maps.entities);
          mergeMap(store.associations, maps.associations);
        } else {
          cleaned.rows.forEach(function (snap) {
            var id = snap.leadId;
            var current = store.leads[id];
            if (!current) {
              store.leads[id] = snap;
              rememberPeople(store, snap);
              added += 1;
              return;
            }
            if (jsonEqual(current, snap)) {
              skipped += 1;
              return;
            }
            if (!incomingIsNewer(current, snap)) {
              skipped += 1;
              return;
            }
            store.leads[id] = snap;
            rememberPeople(store, snap);
            updated += 1;
          });
        }
        if (!writeJson(LEAD_KEY, store)) {
          result.error =
            result.error ||
            "Could not write localStorage (quota or private mode).";
          return;
        }
        result.added += added;
        result.updated += updated;
        result.skipped += skipped;
        return;
      }
      if (type === "bookin") {
        var bookStored = readStored(BOOKIN_KEY);
        if (!bookStored.ok) {
          result.error = result.error || bookStored.error;
          return;
        }
        var existingBook = Array.isArray(bookStored.value)
          ? bookStored.value
          : [];
        var mergedBook = mergeById(existingBook, cleaned.rows, "bookin");
        if (!writeJson(BOOKIN_KEY, mergedBook.rows)) {
          result.error =
            result.error ||
            "Could not write localStorage (quota or private mode).";
          return;
        }
        result.added += mergedBook.added;
        result.updated += mergedBook.updated;
        result.skipped += mergedBook.skipped;
        addPromotionStats(result, promoteStoredBookInCases());
        return;
      }
      var adminStored = readStored(ADMIN_KEY);
      if (!adminStored.ok) {
        result.error = result.error || adminStored.error;
        return;
      }
      var admin = adminStored.value || emptyAdmin();
      admin.officers = admin.officers || [];
      admin.vehicles = admin.vehicles || [];
      admin.shifts = admin.shifts || [];
      var merged = mergeById(admin[type] || [], cleaned.rows, type);
      admin[type] = merged.rows;
      if (!writeJson(ADMIN_KEY, admin)) {
        result.error =
          result.error ||
          "Could not write localStorage (quota or private mode).";
        return;
      }
      result.added += merged.added;
      result.updated += merged.updated;
      result.skipped += merged.skipped;
    });
    applySupportState(parsed);
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
    function finish(mediaNote) {
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
      setStatus("Export downloaded." + (mediaNote || ""), true);
    }
    if (
      (format === "json" || format === "both") &&
      global.COPDoc &&
      COPDoc.media &&
      typeof COPDoc.media.exportBundle === "function"
    ) {
      setStatus("Collecting photos and files…");
      COPDoc.media.exportBundle().then(
        function (rows) {
          bundle.media = rows || [];
          finish(
            bundle.media.length
              ? " " + bundle.media.length + " media file(s)."
              : ""
          );
        },
        function () {
          bundle.media = [];
          finish("");
        }
      );
      return;
    }
    finish("");
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
    var parsed = pendingParsed;
    if (types.indexOf("bookin") !== -1) {
      try {
        await ensureCanonicalBookInStore();
      } catch (error) {
        console.error(error);
      }
    }
    var result = applyImport(parsed, types);
    if (
      types.indexOf("bookin") !== -1 &&
      !result.bookinPromotionAttempted
    ) {
      try {
        await ensureCanonicalBookInStore();
        addPromotionStats(result, promoteStoredBookInCases());
        if (!result.bookinPromotionAttempted) {
          result.error =
            result.error ||
            "Book-In records were imported, but the canonical case model could not be loaded.";
        }
      } catch (error) {
        result.error =
          result.error ||
          "Book-In records were imported, but cases could not be created: " +
            (error && error.message ? error.message : String(error));
      }
    }
    hideDialogs();
    pendingParsed = null;
    function finish(mediaNote) {
      var wrote = result.added > 0 || result.updated > 0 || Boolean(mediaNote);
      var caseNote = result.bookinPromotionAttempted
        ? " Cases: " +
          result.casesCreated +
          " created, " +
          result.casesReused +
          " updated" +
          (result.casePromotionFailed
            ? ", " + result.casePromotionFailed + " need identity data"
            : "") +
          "."
        : "";
      if (result.error) {
        setStatus(
          result.error +
            (wrote
              ? " Some records were written (" +
                result.added +
                " new, " +
                result.updated +
                " updated)." +
                caseNote
              : "")
        );
      } else {
        setStatus(
          "Imported " +
            result.added +
            " new, updated " +
            result.updated +
            ", skipped " +
            result.skipped +
            "." +
            caseNote +
            (mediaNote || ""),
          true
        );
      }
      if (wrote || parsed.settings || parsed.map || parsed.templates) {
        window.setTimeout(function () {
          window.location.reload();
        }, 400);
      }
    }
    if (
      parsed.media &&
      parsed.media.length &&
      global.COPDoc &&
      COPDoc.media &&
      typeof COPDoc.media.importBundle === "function"
    ) {
      COPDoc.media.importBundle(parsed.media).then(
        function (mediaResult) {
          finish(
            mediaResult && mediaResult.added
              ? " Media: " + mediaResult.added + " file(s)."
              : ""
          );
        },
        function () {
          finish("");
        }
      );
      return;
    }
    finish("");
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
