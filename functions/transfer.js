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

  // Import planning supplies an isolated facade. Export keeps reading real storage.
  var importStorage = null;
  function storageApi() { return importStorage || (typeof localStorage !== "undefined" ? localStorage : null); }

  function readStored(key) {
    if (!storageApi()) {
      return { ok: true, missing: true, value: null, error: "" };
    }
    var raw = "";
    try {
      raw = storageApi().getItem(key) || "";
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
    if (!storageApi()) {
      return false;
    }
    try {
      storageApi().setItem(key, JSON.stringify(value));
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
      return String(row.encounterId || "").trim();
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
    if (type === "bookin") {
      return String(row.id || "").trim();
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
          storageApi().setItem(MAP_BASEMAP_KEY, String(parsed.map.basemap));
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
    [LEAD_KEY, ADMIN_KEY, BOOKIN_KEY].forEach(function (key) {
      var checked = readStored(key);
      if (!checked.ok) throw new Error("Export stopped: " + checked.error);
    });
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
    out.bookin = refreshBookInCardsForExport(out.bookin);
    if (out.bookin.length) out.canonicalContext = collectBookInContext(out.bookin);
    var support = collectSupportState();
    out.settings = support.settings;
    out.map = support.map;
    out.templates = support.templates;
    return out;
  }

  function refreshBookInCardsForExport(packets) {
    var workspace = readLeadStore();
    var baseball = global.COPDoc && COPDoc.baseball;
    return (packets || []).map(function (packet) {
      var copy = JSON.parse(JSON.stringify(packet));
      if (!packet.personId || packet.voidedAt) return copy;
      var person = workspace.people && workspace.people[packet.personId];
      var cards = person && person.immigration && person.immigration.baseballCards || [];
      var matches = cards.filter(function (card) {
        return card && card.bookinRecordId === packet.id && (!packet.baseballCardId || (card.cardId || card.id) === packet.baseballCardId);
      });
      if (matches.length !== 1) return copy;
      if (!baseball || typeof baseball.fromCanonical !== "function") throw new Error("Load the baseball card module before exporting current saved cards.");
      copy.baseballCard = baseball.fromCanonical(matches[0]);
      copy.baseballCardId = matches[0].cardId || matches[0].id;
      if (matches[0].finalizedSnapshot) copy.baseballCardFinalizedSnapshot = JSON.parse(JSON.stringify(matches[0].finalizedSnapshot));
      if (owns(matches[0], "arrestOfDay")) copy.baseballCardArrestOfDay = matches[0].arrestOfDay;
      return copy;
    });
  }

  function collectBookInContext(packets) {
    var workspace = readLeadStore(), admin = readAdmin();
    var context = { schema: "copdocx.bookin-context.v1", leads: {}, encounters: {}, investigations: {}, operations: {},
      officers: {}, bookin: {}, people: {}, vehicles: {}, locations: {}, businesses: {}, entities: {}, associations: {} };
    var allPackets = Object.create(null);
    readBookin().forEach(function (packet) { allPackets[packet.id] = packet; });
    var references = { personId: "people", subjectPersonId: "people", leadId: "leads", encounterId: "encounters", operationId: "operations",
      investigationId: "investigations", parentInvestigationId: "investigations", officerId: "officers", arrestingOfficerId: "officers",
      vehicleId: "vehicles", locationId: "locations", businessId: "businesses", entityId: "entities", associationId: "associations", bookingId: "bookin", bookinRecordId: "bookin" };
    var typeMaps = { PERSON: "people", LEAD: "leads", ENCOUNTER: "encounters", OPERATION: "operations", INVESTIGATION: "investigations",
      OFFICER: "officers", VEHICLE: "vehicles", LOCATION: "locations", BUSINESS: "businesses", ENTITY: "entities", ASSOCIATION: "associations" };
    function take(map, id) {
      id = canonicalText(id);
      if (!id || context[map][id]) return;
      var row = map === "bookin" ? allPackets[id] : map === "officers" ? (admin.officers || []).filter(function (officer) { return recordId("officers", officer) === id; })[0] : workspace[map] && workspace[map][id];
      if (!row) return;
      context[map][id] = JSON.parse(JSON.stringify(row));
      walk(row);
    }
    function walk(value) {
      if (!value || typeof value !== "object") return;
      if (!Array.isArray(value)) {
        var map = typeMaps[String(value.type || value.entityType || "").toUpperCase()];
        if (map && value.id) take(map, value.id);
      }
      Object.keys(value).forEach(function (key) {
        if (references[key] && typeof value[key] === "string") take(references[key], value[key]);
        else if (key !== "importSource" && key !== "formState" && key !== "baseballCard") walk(value[key]);
      });
    }
    (packets || []).forEach(walk);
    // Selected packets carry current presentation; context packets supply only
    // dependencies reached through another subject's canonical history.
    (packets || []).forEach(function (packet) { delete context.bookin[packet.id]; });
    return context;
  }

  function mediaOwnersInExport(bundle) {
    var owners = Object.create(null);
    var idTypes = { personId: "PERSON", leadId: "LEAD", encounterId: "ENCOUNTER", investigationId: "INVESTIGATION",
      operationId: "OPERATION", officerId: "OFFICER", vehicleId: "VEHICLE", locationId: "LOCATION", businessId: "BUSINESS", entityId: "ENTITY" };
    function walk(value) {
      if (!value || typeof value !== "object") return;
      Object.keys(value).forEach(function (key) {
        if (idTypes[key] && typeof value[key] === "string" && value[key]) owners[idTypes[key] + ":" + value[key]] = true;
        else if (key !== "importSource" && key !== "media" && key !== "formState") walk(value[key]);
      });
    }
    walk(bundle);
    return owners;
  }

  function attachCanonicalContext(parsed, raw) {
    if (!raw) return parsed;
    if (!plainRecord(raw) || raw.schema !== "copdocx.bookin-context.v1") throw new Error("Unsupported Book-In canonical context schema.");
    parsed.requiredTypes = [];
    ["leads", "encounters", "investigations", "operations", "officers", "bookin"].forEach(function (type) {
      if (raw[type] !== undefined && !plainRecord(raw[type]) && !Array.isArray(raw[type])) throw new Error("Invalid canonical context " + type + ".");
      var dependencies = asRecordList(raw[type]);
      if (!dependencies.length) return;
      var byId = Object.create(null);
      (parsed[type] || []).forEach(function (row) { byId[recordId(type, row)] = row; });
      dependencies.forEach(function (row) {
        var id = recordId(type, row);
        if (!id) throw new Error("Canonical context " + type + " has a missing identifier.");
        if (byId[id] && !jsonEqual(byId[id], row)) {
          if (type === "bookin") return; // selected packet includes latest card presentation
          throw new Error("Canonical context conflicts with selected " + type + " " + id + ".");
        }
        byId[id] = row;
      });
      parsed[type] = Object.keys(byId).map(function (id) { return byId[id]; });
      if (type !== "bookin") parsed.requiredTypes.push(type);
    });
    parsed.investigationObjects = parsed.investigationObjects || {};
    ["people", "vehicles", "locations", "businesses", "entities", "associations"].forEach(function (type) {
      if (raw[type] !== undefined && !plainRecord(raw[type])) throw new Error("Invalid canonical context " + type + ".");
      var map = raw[type] || {};
      if (!Object.keys(map).length) return;
      var existing = parsed.investigationObjects[type] || {};
      Object.keys(map).forEach(function (id) {
        if (existing[id] && !jsonEqual(existing[id], map[id])) throw new Error("Canonical context has contradictory " + type + " " + id + ".");
        existing[id] = map[id];
      });
      parsed.investigationObjects[type] = existing;
      if (parsed.requiredTypes.indexOf("investigations") === -1) parsed.requiredTypes.push("investigations");
    });
    return parsed;
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

  function parseTransfer(text, options) {
    var data;
    try {
      if (typeof text === "string" && text.length > MAX_BYTES) throw new Error("Import exceeds the 32 MiB limit.");
      data = typeof text === "string" ? JSON.parse(text) : JSON.parse(JSON.stringify(text));
    } catch (error) {
      throw new Error("That file is not valid JSON.");
    }
    var sharedDecoder = global.COPDoc && COPDoc.importSchema;
    if (!sharedDecoder || typeof sharedDecoder.validateStructure !== "function") throw new Error("The shared import schema validator is unavailable.");
    sharedDecoder.validateStructure(data);
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
      var decoder = global.COPDoc && global.COPDoc.importSchema;
      if (!decoder || typeof decoder.decode !== "function") throw new Error("The shared Book-In import decoder is unavailable.");
      var decoded = decoder.decode(data, options);
      if (!decoded.ok) throw new Error(decoded.error);
      empty.bookin = decoded.records;
      empty.format = data.format;
      empty.schemaVersion = decoded.schemaVersion;
      empty.appVersion = data.appVersion || "";
      empty.exportedAt = data.exportedAt || "";
      empty.source = decoded.source;
      empty.findings = decoded.findings;
      empty.media = decoded.media;
      return attachCanonicalContext(empty, decoded.canonicalContext);
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
      if (owns(data, meta.key) && data[meta.key] !== null && !Array.isArray(data[meta.key]) && !plainRecord(data[meta.key])) throw new Error("The " + meta.label + " import must contain a records list or ID dictionary.");
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
    return attachCanonicalContext(empty, data.canonicalContext);
  }

  function owns(value, key) {
    return Boolean(
      value && Object.prototype.hasOwnProperty.call(value, key)
    );
  }

  function plainRecord(value) {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
  }

  function canonicalText(value) {
    return String(value == null ? "" : value).trim();
  }

  function canonicalEncounterRow(row) {
    var copy = Object.assign({}, row || {});
    copy.encounterId = canonicalText(copy.encounterId);
    return copy;
  }

  function synthesizedBookInFormState(row) {
    var fields = {
      firstName: "firstName",
      lastName: "lastName",
      aNumber: "alienNumber",
      alienNumber: "alienNumber",
      fbiNumber: "fbiNumber",
      iceEvent: "iceEvent",
      iceEventNumber: "iceEvent",
      encounterNumber: "encounterNumber",
      officersName: "officersName",
      arrestingOfficer: "officersName",
      dateTime: "dateTime",
      bookInDateTime: "dateTime",
      arrestTime: "arrestTime",
      vehiclePosition: "vehiclePosition",
      team: "team",
      dateOfBirth: "dateOfBirth",
      citizenship: "citizenship",
      immigrationDisposition: "immigrationDisposition",
      cash: "cash",
      travelDocs: "travelDocs",
      propertyTag: "propertyTag",
      cellNum: "cellNum",
      children: "children"
    };
    var state = {};
    Object.keys(fields).forEach(function (key) {
      if (!owns(row, key)) {
        return;
      }
      var id = fields[key];
      state[id] = {
        type: "text",
        value: String(row[key] == null ? "" : row[key]),
        checked: false
      };
    });
    var role = canonicalText(row && (row.encounterRole || row.subjectRole)).toUpperCase();
    if (role === "TARGET" || role === "COLLATERAL") {
      state.encounterRoleTarget = {
        type: "radio",
        value: "TARGET",
        checked: role === "TARGET"
      };
      state.encounterRoleCollateral = {
        type: "radio",
        value: "COLLATERAL",
        checked: role === "COLLATERAL"
      };
    }
    return state;
  }

  function canonicalBookInRow(row, synthesizeMissingFormState) {
    var copy = Object.assign({}, row || {});
    [
      "id",
      "bookingId",
      "bookinRecordId",
      "subjectId",
      "personId",
      "leadId",
      "arrestId",
      "encounterId"
    ].forEach(function (key) {
      if (owns(copy, key)) {
        copy[key] = canonicalText(copy[key]);
      }
    });
    copy.id = canonicalText(copy.id);
    if (owns(copy, "formState") && !plainRecord(copy.formState)) {
      return {
        ok: false,
        row: null,
        error: "A Book-In import contains invalid formState data."
      };
    }
    if (!owns(copy, "formState") && synthesizeMissingFormState) {
      copy.formState = synthesizedBookInFormState(copy);
    }
    if (bookInIdentityClaims(copy).length > 1) {
      return {
        ok: false,
        row: null,
        error: "A Book-In import contains contradictory booking identifiers."
      };
    }
    return { ok: true, row: copy, error: "" };
  }

  function cleanList(type, rows) {
    var seen = Object.create(null);
    var out = [];
    var skipped = 0;
    (rows || []).forEach(function (row) {
      if (type === "encounters") {
        row = canonicalEncounterRow(row);
      } else if (type === "bookin") {
        var normalizedBookIn = canonicalBookInRow(row, true);
        if (!normalizedBookIn.ok) {
          skipped += 1;
          return;
        }
        row = normalizedBookIn.row;
      }
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
      store.people[subject.personId] = store.people[subject.personId] || subject;
      snap.person = store.people[subject.personId];
    }
    if (!Array.isArray(snap.people)) return;
    snap.people = snap.people.map(function (person) {
      if (person && person.personId) {
        store.people[person.personId] = store.people[person.personId] || person;
        return store.people[person.personId];
      }
      return person;
    });
  }

  function rememberEmbeddedObjects(store, snap) {
    rememberPeople(store, snap);
    [["vehicles", "vehicleId"], ["locations", "locationId"]].forEach(function (pair) {
      if (!Array.isArray(snap[pair[0]])) return;
      snap[pair[0]] = snap[pair[0]].map(function (row) {
        var id = canonicalText(row && (row[pair[1]] || row.id));
        if (!id) return row;
        store[pair[0]][id] = store[pair[0]][id] || row;
        // Encounter-specific disposition/role remains on the association snapshot.
        return Object.assign({}, row, store[pair[0]][id]);
      });
    });
  }

  function bookInIdentityClaims(row) {
    var seen = Object.create(null);
    return [row && row.id, row && row.bookingId, row && row.bookinRecordId]
      .map(function (value) {
        return String(value == null ? "" : value).trim();
      })
      .filter(function (value) {
        if (!value || seen[value]) {
          return false;
        }
        seen[value] = true;
        return true;
      });
  }

  function safeBookInIncoming(current, row) {
    var normalized = canonicalBookInRow(row, true);
    if (!normalized.ok) {
      return null;
    }
    var incoming = normalized.row;
    if (!current) {
      return incoming;
    }
    var conflict = [
      "subjectId",
      "personId",
      "leadId",
      "arrestId",
      "encounterId"
    ].some(function (key) {
      var localValue = String(current[key] || "").trim();
      var incomingValue = String(incoming[key] || "").trim();
      return localValue && incomingValue && localValue !== incomingValue;
    });
    if (conflict) {
      return null;
    }
    ["subjectId", "personId", "leadId", "arrestId", "encounterId"].forEach(
      function (key) {
        var incomingValue = canonicalText(incoming[key]);
        var currentValue = canonicalText(current[key]);
        if (!incomingValue && currentValue) {
          incoming[key] = currentValue;
        } else if (owns(incoming, key)) {
          incoming[key] = incomingValue;
        }
      }
    );
    ["bookingId", "bookinRecordId"].forEach(function (key) {
      if (owns(incoming, key)) {
        incoming[key] = canonicalText(incoming[key]);
      }
    });
    var currentRole = canonicalText(
      current.encounterRole || current.subjectRole
    ).toUpperCase();
    if (currentRole === "TARGET" || currentRole === "COLLATERAL") {
      incoming.subjectRole = currentRole;
      incoming.encounterRole = currentRole;
    }
    var currentOccupantRole = canonicalText(current.vehiclePosition).toUpperCase();
    if (
      currentOccupantRole === "DRIVER" ||
      currentOccupantRole === "PASSENGER" ||
      currentOccupantRole === "OTHER"
    ) {
      incoming.vehiclePosition = currentOccupantRole;
    }
    if (current.encounterProjectionDraft === true) {
      incoming.encounterProjectionDraft = true;
      delete incoming.encounterProjectionFiledAt;
    } else if (current.encounterProjectionFiledAt) {
      incoming.encounterProjectionFiledAt = current.encounterProjectionFiledAt;
      delete incoming.encounterProjectionDraft;
    }
    return incoming;
  }

  function bookInArrestFieldPresence(row) {
    row = row || {};
    var formState = plainRecord(row.formState) ? row.formState : {};
    function topHas(keys) {
      return keys.some(function (key) {
        return owns(row, key);
      });
    }
    function formHas(keys) {
      return keys.some(function (key) {
        return owns(formState, key);
      });
    }
    var hasDateTime =
      topHas(["dateTime", "bookInDateTime"]) ||
      formHas(["dateTime", "date_time"]);
    var hasArrestTime =
      topHas(["arrestTime"]) || formHas(["arrestTime", "arrest_time"]);
    var bookingFields = [
      "cash",
      "travelDocs",
      "travelDocuments",
      "propertyTag",
      "cellNum",
      "holdingCellNumber",
      "children",
      "medical"
    ];
    return {
      arrestDate: topHas(["arrestDate"]) || hasDateTime,
      arrestTime: hasArrestTime,
      arrestDateTime:
        topHas(["arrestDateTime"]) || hasDateTime || hasArrestTime,
      arrestingOfficer:
        topHas(["arrestingOfficer", "officersName"]) ||
        formHas(["officersName", "officers_name"]),
      team: topHas(["team"]) || formHas(["team"]),
      iceEventNumber:
        topHas(["iceEventNumber", "iceEvent"]) ||
        formHas(["iceEvent", "ice_event"]),
      encounterNumber:
        topHas(["encounterNumber"]) ||
        formHas(["encounterNumber", "encounter_number"]),
      encounterId: topHas(["encounterId"]),
      subjectRole:
        topHas(["subjectRole", "encounterRole"]) ||
        formHas([
          "encounterRoleTarget",
          "encounterRoleCollateral",
          "subject_role_target",
          "subject_role_collateral"
        ]),
      vehiclePosition:
        topHas(["vehiclePosition"]) ||
        formHas(["vehiclePosition", "vehicle_position"]),
      bookInDateTime: hasDateTime,
      booking:
        topHas(["booking"].concat(bookingFields)) ||
        formHas([
          "cash",
          "travelDocs",
          "travel_docs",
          "propertyTag",
          "property_tag",
          "cellNum",
          "cell_num",
          "children",
          "medicalIssues",
          "medical_issues",
          "noMedicalIssues",
          "no_medical_issues"
        ])
    };
  }

  function mergeById(existingList, incoming, type) {
    var byId = Object.create(null);
    var priorById = Object.create(null);
    existingList.forEach(function (row) {
      var id = recordId(type, row);
      if (id) {
        byId[id] = row;
        priorById[id] = row;
      }
    });
    var added = 0;
    var updated = 0;
    var skipped = 0;
    var acceptedIds = [];
    var addedIds = [];
    var presenceById = Object.create(null);
    incoming.forEach(function (row) {
      var id = recordId(type, row);
      var current = byId[id];
      if ((type === "officers" || type === "vehicles") && current) {
        row = Object.assign({}, current, row, {
          meta: Object.assign({}, current.meta || {}, row.meta || {})
        });
      }
      var incomingPresence =
        type === "bookin" ? bookInArrestFieldPresence(row) : null;
      if (type === "bookin") {
        row = safeBookInIncoming(current, row);
        if (!row) {
          skipped += 1;
          return;
        }
      }
      if (!current) {
        byId[id] = row;
        added += 1;
        acceptedIds.push(id);
        addedIds.push(id);
        if (incomingPresence) {
          presenceById[id] = incomingPresence;
        }
        return;
      }
      var incomingRow = row;
      if (type === "bookin") {
        var localComparable = Object.assign({}, current);
        var incomingComparable = Object.assign({}, incomingRow);
        [
          "subjectId",
          "leadId",
          "personId",
          "arrestId",
          "encounterId",
          "encounterProjectionFiledAt",
          "encounterProjectionDraft",
          "canonicalizedAt"
        ].forEach(
          function (key) {
            delete localComparable[key];
            delete incomingComparable[key];
          }
        );
        // Promotion supplies blank canonical role fields to legacy packets.
        // Their absence in the unchanged source is not a new booking edit.
        ["subjectRole", "encounterRole", "vehiclePosition"].forEach(function (key) {
          if (!owns(incomingRow, key) && !canonicalText(localComparable[key])) delete localComparable[key];
        });
        // Export time belongs to the import receipt; a fresh envelope containing
        // identical record facts must not rewrite the canonical Arrest/Case.
        delete localComparable.importSource;
        delete incomingComparable.importSource;
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
      acceptedIds.push(id);
      if (incomingPresence) {
        presenceById[id] = incomingPresence;
      }
    });
    return {
      rows: Object.keys(byId).map(function (id) {
        return byId[id];
      }),
      added: added,
      updated: updated,
      skipped: skipped,
      acceptedIds: acceptedIds,
      addedIds: addedIds,
      priorById: priorById,
      presenceById: presenceById
    };
  }

  function canonicalEncounterMap(encounters) {
    var next = Object.create(null);
    var seen = Object.create(null);
    var error = "";
    Object.keys(encounters || {}).some(function (rawKey) {
      var row = encounters[rawKey];
      var key = canonicalText(rawKey);
      var id = canonicalText(row && row.encounterId);
      if (!key || !id) {
        error = "Stored Encounter identity is missing. Repair storage before importing.";
        return true;
      }
      if (key !== id) {
        error =
          "Stored Encounter map key conflicts with its encounterId. Repair storage before importing.";
        return true;
      }
      if (seen[id]) {
        error =
          "Stored Encounters contain duplicate canonical encounterId " +
          id +
          ". Repair storage before importing.";
        return true;
      }
      seen[id] = true;
      next[id] = canonicalEncounterRow(row);
      return false;
    });
    return { ok: !error, rows: next, error: error };
  }

  function transferSubjectId(row) {
    return canonicalText(row && (row.subjectId || row.encounterSubjectId));
  }

  function transferSubjectBookingClaims(row) {
    var seen = Object.create(null);
    return [row && row.bookingId, row && row.bookinRecordId]
      .map(canonicalText)
      .filter(function (value) {
        if (!value || seen[value]) {
          return false;
        }
        seen[value] = true;
        return true;
      });
  }

  function transferSubjectBookingId(row) {
    var claims = transferSubjectBookingClaims(row);
    return claims.length === 1 ? claims[0] : "";
  }

  function canonicalTransferSubject(row, encounterId) {
    var next = Object.assign({}, row || {});
    next.subjectId = transferSubjectId(next);
    next.encounterId = encounterId;
    ["personId", "leadId"].forEach(function (key) {
      if (owns(next, key)) {
        next[key] = canonicalText(next[key]);
      }
    });
    var bookingClaims = transferSubjectBookingClaims(next);
    if (bookingClaims.length > 1) {
      return {
        ok: false,
        row: null,
        error: "An Encounter subject contains contradictory booking identifiers."
      };
    }
    var bookingId = bookingClaims[0] || "";
    if (owns(next, "bookingId") || owns(next, "bookinRecordId") || bookingId) {
      next.bookingId = bookingId;
      next.bookinRecordId = bookingId;
    }
    if (!next.subjectId) {
      return {
        ok: false,
        row: null,
        error: "Every imported Encounter subject requires a stable subjectId."
      };
    }
    return { ok: true, row: next, error: "" };
  }

  function canonicalTransferSubjectList(rows, encounterId) {
    if (!Array.isArray(rows)) {
      return {
        ok: false,
        rows: [],
        error: "Imported Encounter subjects must be an array."
      };
    }
    var subjectIds = Object.create(null);
    var bookingIds = Object.create(null);
    var next = [];
    var error = "";
    rows.some(function (row) {
      var normalized = canonicalTransferSubject(row, encounterId);
      if (!normalized.ok) {
        error = normalized.error;
        return true;
      }
      var subjectId = normalized.row.subjectId;
      var bookingId = transferSubjectBookingId(normalized.row);
      if (subjectIds[subjectId]) {
        error = "Encounter " + encounterId + " contains duplicate subjectId " + subjectId + ".";
        return true;
      }
      if (bookingId && bookingIds[bookingId]) {
        error = "Encounter " + encounterId + " contains duplicate bookingId " + bookingId + ".";
        return true;
      }
      subjectIds[subjectId] = true;
      if (bookingId) {
        bookingIds[bookingId] = true;
      }
      next.push(normalized.row);
      return false;
    });
    return { ok: !error, rows: next, error: error };
  }

  function encounterTransferOwnershipRows(encounter) {
    var rows = [];
    function appendSubjects(value) {
      if (value && Array.isArray(value.subjects)) {
        rows = rows.concat(value.subjects);
      }
    }
    appendSubjects(encounter);
    if (encounter && Array.isArray(encounter.subjectIdentityHistory)) {
      rows = rows.concat(encounter.subjectIdentityHistory);
    }
    if (encounter && Array.isArray(encounter.bookingIdentityHistory)) {
      rows = rows.concat(encounter.bookingIdentityHistory);
    }
    appendSubjects(encounter && encounter.completed);
    (Array.isArray(encounter && encounter.completedHistory)
      ? encounter.completedHistory
      : []
    ).forEach(function (entry) {
      appendSubjects(entry && entry.snapshot);
    });
    return rows;
  }

  function transferRevision(record) {
    var value = record && record.meta && record.meta.encounterRevision;
    return Number.isFinite(Number(value)) ? Number(value) : null;
  }

  function prepareEncounterUpdate(previous, incoming) {
    var encounterId = incoming.encounterId;
    if (previous && jsonEqual(previous, incoming)) {
      return { ok: true, row: incoming, changed: false, error: "" };
    }
    if (previous && !incomingIsNewer(previous, incoming)) {
      return { ok: true, row: incoming, changed: false, error: "" };
    }
    if (previous && previous.meta && previous.meta.markedComplete) {
      return {
        ok: false,
        row: null,
        changed: false,
        error: "Encounter " + encounterId + " is completed and locked."
      };
    }
    var hasIncomingRoster = owns(incoming, "subjects");
    var previousRevision = transferRevision(previous);
    var incomingRevision = transferRevision(incoming);
    if (
      previous &&
      hasIncomingRoster &&
      previousRevision !== null &&
      incomingRevision !== previousRevision
    ) {
      return {
        ok: false,
        row: null,
        changed: false,
        error: "Encounter " + encounterId + " changed after this export; reload before importing."
      };
    }
    var candidate = Object.assign({}, previous || {}, incoming);
    candidate.encounterId = encounterId;
    if (!owns(candidate, "subjects")) {
      candidate.subjects = [];
    }
    var normalizedSubjects = canonicalTransferSubjectList(
      candidate.subjects,
      encounterId
    );
    if (!normalizedSubjects.ok) {
      return {
        ok: false,
        row: null,
        changed: false,
        error: normalizedSubjects.error
      };
    }
    candidate.subjects = normalizedSubjects.rows;

    var priorBySubject = Object.create(null);
    (Array.isArray(previous && previous.subjects) ? previous.subjects : []).forEach(
      function (row) {
        var id = transferSubjectId(row);
        if (id) {
          priorBySubject[id] = row;
        }
      }
    );
    var conflict = "";
    candidate.subjects.some(function (row) {
      var subjectId = row.subjectId;
      var prior = priorBySubject[subjectId];
      if (!prior) {
        return false;
      }
      var immutable = [
        ["bookingId", transferSubjectBookingId(prior), transferSubjectBookingId(row)],
        ["personId", canonicalText(prior.personId), canonicalText(row.personId)],
        ["leadId", canonicalText(prior.leadId), canonicalText(row.leadId)]
      ];
      return immutable.some(function (claim) {
        if (claim[1] && claim[1] !== claim[2]) {
          conflict =
            "Encounter " +
            encounterId +
            " subject " +
            subjectId +
            " cannot change its canonical " +
            claim[0] +
            ".";
          return true;
        }
        return false;
      });
    });
    if (conflict) {
      return { ok: false, row: null, changed: false, error: conflict };
    }

    var removedHistory = Array.isArray(previous && previous.subjectIdentityHistory)
      ? previous.subjectIdentityHistory.slice()
      : [];
    var activeIds = Object.create(null);
    candidate.subjects.forEach(function (row) {
      activeIds[row.subjectId] = true;
    });
    Object.keys(priorBySubject).forEach(function (subjectId) {
      if (activeIds[subjectId]) {
        return;
      }
      var prior = priorBySubject[subjectId];
      var bookingId = transferSubjectBookingId(prior);
      var alreadyRemembered = removedHistory.some(function (row) {
        return (
          transferSubjectId(row) === subjectId &&
          transferSubjectBookingId(row) === bookingId
        );
      });
      if (!alreadyRemembered) {
        var removed = Object.assign({}, prior, {
          subjectId: subjectId,
          encounterId: encounterId,
          removedAt:
            canonicalText(incoming.meta && incoming.meta.updatedAt) ||
            new Date().toISOString()
        });
        removedHistory.push(removed);
      }
    });

    var historicalRows = [];
    if (previous) {
      historicalRows = encounterTransferOwnershipRows({
        subjectIdentityHistory: previous.subjectIdentityHistory,
        bookingIdentityHistory: previous.bookingIdentityHistory,
        completed: previous.completed,
        completedHistory: previous.completedHistory
      });
    }
    candidate.subjects.some(function (row) {
      var wasActive = Boolean(priorBySubject[row.subjectId]);
      if (wasActive) {
        return false;
      }
      var bookingId = transferSubjectBookingId(row);
      var historical = historicalRows.some(function (prior) {
        return (
          (row.subjectId && transferSubjectId(prior) === row.subjectId) ||
          (bookingId && transferSubjectBookingId(prior) === bookingId)
        );
      });
      if (historical) {
        conflict =
          "Encounter " + encounterId + " cannot reactivate a removed subject or booking identity.";
        return true;
      }
      return false;
    });
    if (conflict) {
      return { ok: false, row: null, changed: false, error: conflict };
    }

    if (previous) {
      candidate.subjectIdentityHistory = removedHistory;
      candidate.bookingIdentityHistory = Array.isArray(previous.bookingIdentityHistory)
        ? previous.bookingIdentityHistory
        : [];
      if (owns(previous, "completed")) {
        candidate.completed = previous.completed;
      }
      if (owns(previous, "completedHistory")) {
        candidate.completedHistory = previous.completedHistory;
      }
      candidate.meta = Object.assign({}, previous.meta || {}, incoming.meta || {});
      if (previousRevision !== null) {
        candidate.meta.encounterRevision = previousRevision + 1;
      }
    }
    return { ok: true, row: candidate, changed: true, error: "" };
  }

  function validateProspectiveEncounterOwnership(encounters) {
    var subjectOwners = Object.create(null);
    var bookingOwners = Object.create(null);
    var error = "";
    Object.keys(encounters || {}).some(function (encounterId) {
      return encounterTransferOwnershipRows(encounters[encounterId]).some(function (row) {
        var subjectId = transferSubjectId(row);
        var bookingClaims = transferSubjectBookingClaims(row);
        if (bookingClaims.length > 1) {
          error =
            "Encounter " + encounterId + " contains contradictory historical booking identifiers.";
          return true;
        }
        var bookingId = bookingClaims[0] || "";
        if (subjectId && subjectOwners[subjectId] && subjectOwners[subjectId] !== encounterId) {
          error =
            "Encounter subjectId " + subjectId + " is already owned by Encounter " + subjectOwners[subjectId] + ".";
          return true;
        }
        if (bookingId && bookingOwners[bookingId] && bookingOwners[bookingId] !== encounterId) {
          error =
            "Book-In ID " + bookingId + " is already owned by Encounter " + bookingOwners[bookingId] + ".";
          return true;
        }
        if (subjectId) {
          subjectOwners[subjectId] = encounterId;
        }
        if (bookingId) {
          bookingOwners[bookingId] = encounterId;
        }
        return false;
      });
    });
    return { ok: !error, error: error };
  }

  function prepareEncounterImportRows(existing, incomingRows) {
    var prospective = Object.create(null);
    Object.keys(existing || {}).forEach(function (id) {
      prospective[id] = existing[id];
    });
    var prepared = [];
    var error = "";
    (incomingRows || []).some(function (incoming) {
      var previous = prospective[incoming.encounterId] || null;
      var update = prepareEncounterUpdate(previous, incoming);
      if (!update.ok) {
        error = update.error;
        return true;
      }
      prepared.push(update.row);
      if (update.changed) {
        prospective[incoming.encounterId] = update.row;
      }
      return false;
    });
    if (error) {
      return { ok: false, rows: [], error: error };
    }
    var ownership = validateProspectiveEncounterOwnership(prospective);
    if (!ownership.ok) {
      return { ok: false, rows: [], error: ownership.error };
    }
    return { ok: true, rows: prepared, error: "" };
  }

  function validateStoredBookInRows(rows) {
    var seen = Object.create(null);
    var error = "";
    (rows || []).some(function (row) {
      var id = recordId("bookin", row);
      if (!id) {
        error =
          "Stored Book-In data contains a record without an ID. Repair storage before importing.";
        return true;
      }
      if (bookInIdentityClaims(row).length > 1) {
        error =
          "Stored Book-In data contains contradictory booking identifiers. Repair storage before importing.";
        return true;
      }
      if (seen[id]) {
        error =
          "Stored Book-In data contains duplicate canonical record ID " +
          id +
          ". Repair storage before importing.";
        return true;
      }
      seen[id] = true;
      return false;
    });
    return { ok: !error, error: error };
  }

  function prepareImportRows(parsed, types) {
    var rowsByType = Object.create(null);
    var selected = Object.create(null);
    var error = "";
    (types || []).forEach(function (type) {
      selected[type] = true;
    });
    (types || []).some(function (type) {
      var seen = Object.create(null);
      var rows = [];
      (parsed[type] || []).some(function (row) {
        if (type === "encounters") {
          row = canonicalEncounterRow(row);
        } else if (type === "bookin") {
          var normalized = canonicalBookInRow(row, true);
          if (!normalized.ok) {
            error = normalized.error;
            return true;
          }
          row = normalized.row;
        }
        var id = recordId(type, row);
        if (id && seen[id]) {
          error =
            (type === "encounters"
              ? "The import contains duplicate canonical encounterId "
              : type === "bookin"
                ? "The import contains duplicate canonical Book-In record ID "
                : "The import contains duplicate record ID ") +
            id +
            ".";
          return true;
        }
        if (id) {
          seen[id] = true;
        }
        rows.push(row);
        return false;
      });
      rowsByType[type] = rows;
      return Boolean(error);
    });
    if (error) {
      return { ok: false, rowsByType: rowsByType, error: error };
    }

    if (selected.encounters || selected.bookin) {
      var leadStored = readStored(LEAD_KEY);
      if (!leadStored.ok) {
        return { ok: false, rowsByType: rowsByType, error: leadStored.error };
      }
      var normalizedEncounters = canonicalEncounterMap(
        (leadStored.value && leadStored.value.encounters) || {}
      );
      if (!normalizedEncounters.ok) {
        return {
          ok: false,
          rowsByType: rowsByType,
          error: normalizedEncounters.error
        };
      }
      if (selected.encounters) {
        var preparedEncounters = prepareEncounterImportRows(
          normalizedEncounters.rows,
          rowsByType.encounters || []
        );
        if (!preparedEncounters.ok) {
          return {
            ok: false,
            rowsByType: rowsByType,
            error: preparedEncounters.error
          };
        }
        rowsByType.encounters = preparedEncounters.rows;
      }
    }

    if (selected.bookin) {
      var bookStored = readStored(BOOKIN_KEY);
      if (!bookStored.ok) {
        return { ok: false, rowsByType: rowsByType, error: bookStored.error };
      }
      if (!bookStored.missing && !Array.isArray(bookStored.value)) {
        return {
          ok: false,
          rowsByType: rowsByType,
          error: "Stored Book-In data is not a record list. Repair storage before importing."
        };
      }
      var validBookIn = validateStoredBookInRows(
        Array.isArray(bookStored.value) ? bookStored.value : []
      );
      if (!validBookIn.ok) {
        return { ok: false, rowsByType: rowsByType, error: validBookIn.error };
      }
    }
    return { ok: true, rowsByType: rowsByType, error: "" };
  }

  // Import is not an unarchive, reassertion, or booking-void recovery command.
  // Reject lifecycle loss before any store (including support settings) is written.
  function lifecycleImportError(current, incoming, label) {
    if (!current || !incoming) return "";
    var markers = ["voidedAt", "retractedAt", "endedAt"];
    var error = "";
    markers.some(function (key) {
      if (!current[key]) return false;
      if (!jsonEqual(current, incoming)) {
        error = label + " contains a voided or ended/retracted record; import cannot replace its lifecycle history.";
        return true;
      }
      return false;
    });
    if (error) return error;
    if (current.meta && current.meta.archivedAt &&
        (!incoming.meta || incoming.meta.archivedAt !== current.meta.archivedAt ||
         incoming.meta.archiveReason !== current.meta.archiveReason)) {
      return label + " is archived; import cannot reactivate it.";
    }
    if (current.archivedAt && (incoming.archivedAt !== current.archivedAt || incoming.inactive !== current.inactive || incoming.junked !== current.junked)) {
      return label + " is archived/inactive; import cannot restore it implicitly.";
    }
    if (current.junked && owns(incoming, "junked") && !incoming.junked) {
      return label + " is inactive; use the explicit restore action.";
    }
    if (current.bookingVoid && !jsonEqual(current.bookingVoid, incoming.bookingVoid)) {
      return label + " has a voided booking; import cannot remove its void history.";
    }
    if (current.bookingVoid && transferSubjectBookingClaims(incoming).indexOf(canonicalText(current.bookingVoid.bookingId)) !== -1) {
      return label + " cannot relink a voided booking.";
    }
    if (current.person && incoming.person) {
      error = lifecycleImportError(current.person, incoming.person, label + " Person");
      if (error) return error;
    }
    [["arrests", "arrestId"], ["subjects", "subjectId"], ["people", "personId"]].some(function (pair) {
      var priorRows = Array.isArray(current[pair[0]]) ? current[pair[0]] : [];
      var nextRows = Array.isArray(incoming[pair[0]]) ? incoming[pair[0]] : [];
      return priorRows.some(function (row) {
        var next = nextRows.filter(function (candidate) {
          return canonicalText(candidate && candidate[pair[1]]) === canonicalText(row && row[pair[1]]);
        })[0];
        var protectedRow = row && (row.voidedAt || row.bookingVoid || row.retractedAt || row.endedAt ||
          (row.meta && row.meta.archivedAt));
        if (protectedRow && !next) error = label + " cannot discard voided, archived, or retracted history.";
        else if (next) error = lifecycleImportError(row, next, label + " " + pair[0]);
        return Boolean(error);
      });
    });
    return error;
  }

  function prepareObjectContractImport(parsed, types, prepared) {
    var workspaceRead = readStored(LEAD_KEY);
    if (!workspaceRead.ok) return { ok: false, error: workspaceRead.error };
    var current = workspaceRead.value || emptyLeadStore();
    var candidate = JSON.parse(JSON.stringify(current));
    var importedObjects = { people: {}, vehicles: {}, locations: {}, businesses: {}, entities: {} };
    var maps = ["people", "leads", "vehicles", "locations", "businesses", "entities", "associations", "encounters", "investigations", "operations"];
    maps.forEach(function (key) { candidate[key] = candidate[key] || {}; });
    var error = "";
    var hasObjects = false;
    var importedVoids = [];
    (types || []).some(function (type) {
      var incomingRows = cleanList(type, prepared.rowsByType[type] || []).rows;
      if (["leads", "encounters", "investigations", "operations"].indexOf(type) !== -1) {
        return incomingRows.some(function (row) {
          var id = recordId(type, row);
          error = lifecycleImportError((current[type] || {})[id], row, type + " " + id);
          if (error) return true;
          var snapshot = JSON.parse(JSON.stringify(row));
          if (type === "leads" || type === "encounters") {
            if (snapshot.person || (snapshot.people || []).length || (snapshot.vehicles || []).length || (snapshot.locations || []).length) hasObjects = true;
            if (snapshot.subjectPersonId && snapshot.person && snapshot.person.personId &&
                canonicalText(snapshot.subjectPersonId) !== canonicalText(snapshot.person.personId)) {
              error = "Case " + id + " contains contradictory Person identifiers.";
              return true;
            }
            (snapshot.person ? [snapshot.person] : []).concat(snapshot.people || []).forEach(function (person) {
              if (person && person.personId) importedObjects.people[person.personId] = person;
            });
            [["vehicles", "vehicleId"], ["locations", "locationId"]].forEach(function (pair) {
              (snapshot[pair[0]] || []).forEach(function (object) {
                var objectId = object && (object[pair[1]] || object.id);
                if (objectId) importedObjects[pair[0]][objectId] = object;
              });
            });
            rememberEmbeddedObjects(candidate, snapshot);
          }
          if (!candidate[type][id] || incomingIsNewer(candidate[type][id], snapshot)) candidate[type][id] = snapshot;
          return false;
        });
      }
      var stored = readStored(type === "bookin" ? BOOKIN_KEY : ADMIN_KEY);
      if (!stored.ok) { error = stored.error; return true; }
      var localRows = type === "bookin" ? stored.value || [] : (stored.value && stored.value[type]) || [];
      return incomingRows.some(function (row) {
        var prior = localRows.filter(function (item) { return recordId(type, item) === recordId(type, row); })[0];
        if (type === "bookin" && row.voidedAt && (!prior || !prior.voidedAt)) {
          var bookingId = recordId(type, row);
          var activeOwner = Object.keys(current.people || {}).some(function (personId) {
            return ((current.people[personId] || {}).arrests || []).some(function (arrest) {
              return arrest && !arrest.voidedAt && (arrest.arrestId === row.arrestId || arrest.bookingId === bookingId || arrest.bookinRecordId === bookingId);
            });
          });
          if (prior || activeOwner) {
            error = "Book-In " + bookingId + " cannot apply imported void history to an existing active booking. Use its coordinated void workflow.";
            return true;
          }
          importedVoids.push(row);
        }
        if (type === "officers" && prior && Array.isArray(prior.fieldArrests) && owns(row, "fieldArrests") && !jsonEqual(prior.fieldArrests, row.fieldArrests)) {
          error = "Officer " + recordId(type, row) + " has canonical Arrest history; import cannot replace its booked or voided facts.";
          return true;
        }
        error = lifecycleImportError(prior, row, type + " " + recordId(type, row));
        return Boolean(error);
      });
    });
    if (error) return { ok: false, error: error };
    if ((types || []).indexOf("investigations") !== -1 && parsed.investigationObjects) {
      ["people", "vehicles", "locations", "businesses", "entities", "associations"].some(function (key) {
        return Object.keys(parsed.investigationObjects[key] || {}).some(function (id) {
          hasObjects = true;
          var row = parsed.investigationObjects[key][id];
          if (importedObjects[key]) importedObjects[key][id] = row;
          var prior = (current[key] || {})[id];
          error = lifecycleImportError(prior, row, key + " " + id);
          if (error) return true;
          if (!candidate[key][id] || incomingIsNewer(candidate[key][id], row)) candidate[key][id] = row;
          return false;
        });
      });
    }
    if (error) return { ok: false, error: error };
    var store = global.COPDoc && COPDoc.model && COPDoc.model.store;
    if (importedVoids.length) {
      if (!store || typeof store.validateImportedVoidedBooking !== "function") return { ok: false, error: "Imported void history requires its existing coordinated void or a complete validated canonical context." };
      var voidError = "";
      importedVoids.some(function (packet) {
        var checked = store.validateImportedVoidedBooking(packet, candidate, current);
        if (!checked || !checked.ok) voidError = "Book-In " + packet.id + " has imported void history without an existing coordinated void or a complete canonical restore: " + (checked && checked.error || "validation failed");
        return Boolean(voidError);
      });
      if (voidError) return { ok: false, error: voidError };
    }
    if (hasObjects) {
      if (!store || typeof store.validateObjectWorkspace !== "function") {
        return { ok: false, error: "The shared object identity validator is unavailable. Open Import and retry after the model loads." };
      }
      var incomingValidation = store.validateObjectWorkspace(importedObjects, {});
      if (!incomingValidation || !incomingValidation.ok) return incomingValidation || { ok: false, error: "Imported object identity validation failed." };
      var validation = store.validateObjectWorkspace(candidate, current);
      if (!validation || !validation.ok) return validation || { ok: false, error: "Object identity validation failed." };
    }
    return { ok: true, error: "" };
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

  function encounterSubjectId(row) {
    return canonicalText(row && (row.subjectId || row.encounterSubjectId));
  }

  function encounterSubjectBookingId(row) {
    var claims = bookInIdentityClaims({
      id: row && row.bookingId,
      bookingId: row && row.bookinRecordId
    });
    return claims.length === 1 ? claims[0] : "";
  }

  function exactEncounterSubjectForBookIn(row, encounters) {
    var encounterId = canonicalText(row && row.encounterId);
    if (!encounterId) {
      return { ok: true, subject: null, error: "" };
    }
    var encounter = encounters && encounters[encounterId];
    if (!encounter) {
      return {
        ok: false,
        subject: null,
        error: "The linked Encounter does not exist."
      };
    }
    var subjects = Array.isArray(encounter.subjects) ? encounter.subjects : [];
    var subjectId = canonicalText(row.subjectId);
    var bookingId = recordId("bookin", row);
    var personId = canonicalText(row.personId);
    var leadId = canonicalText(row.leadId);
    var matches = subjects.filter(function (subject) {
      var candidateSubjectId = encounterSubjectId(subject);
      var candidateBookingId = encounterSubjectBookingId(subject);
      var candidatePersonId = canonicalText(subject && subject.personId);
      var candidateLeadId = canonicalText(subject && subject.leadId);
      if (subjectId) {
        return candidateSubjectId === subjectId;
      }
      var exactClaim = Boolean(
        (bookingId && candidateBookingId === bookingId) ||
          (personId && candidatePersonId === personId) ||
          (leadId && candidateLeadId === leadId)
      );
      if (!exactClaim) {
        return false;
      }
      return !(
        (bookingId && candidateBookingId && candidateBookingId !== bookingId) ||
        (personId && candidatePersonId && candidatePersonId !== personId) ||
        (leadId && candidateLeadId && candidateLeadId !== leadId)
      );
    });
    if (matches.length !== 1) {
      return {
        ok: false,
        subject: null,
        error:
          matches.length > 1
            ? "The linked Encounter subject is ambiguous."
            : "The linked Encounter subject does not exist."
      };
    }
    var subject = matches[0];
    var subjectBookingId = encounterSubjectBookingId(subject);
    var subjectPersonId = canonicalText(subject.personId);
    var subjectLeadId = canonicalText(subject.leadId);
    if (
      (subjectBookingId && subjectBookingId !== bookingId) ||
      (personId && subjectPersonId && personId !== subjectPersonId) ||
      (leadId && subjectLeadId && leadId !== subjectLeadId)
    ) {
      return {
        ok: false,
        subject: null,
        error: "Book-In identity conflicts with the linked Encounter subject."
      };
    }
    return { ok: true, subject: subject, error: "" };
  }

  function canonicalSubjectRole(subject) {
    var role = canonicalText(
      subject && (subject.role || subject.encounterRole)
    ).toUpperCase();
    return role === "TARGET" || role === "COLLATERAL" ? role : "";
  }

  function canonicalSubjectOccupantRole(subject) {
    var role = canonicalText(
      subject && (subject.occupantRole || subject.vehicleRole)
    ).toUpperCase();
    return role === "DRIVER" || role === "PASSENGER" || role === "OTHER"
      ? role
      : "";
  }

  function bookInVehiclePosition(role) {
    var values = { DRIVER: "Driver", PASSENGER: "Passenger", OTHER: "Other" };
    return values[canonicalText(role).toUpperCase()] || "";
  }

  function projectCanonicalSubjectOntoBookIn(row, subject) {
    if (!subject) {
      return Object.assign({}, row);
    }
    var next = Object.assign({}, row);
    var role = canonicalSubjectRole(subject);
    var occupantRole = bookInVehiclePosition(canonicalSubjectOccupantRole(subject));
    next.subjectId = encounterSubjectId(subject);
    next.encounterId = canonicalText(next.encounterId);
    next.bookingId = recordId("bookin", next);
    next.bookinRecordId = next.bookingId;
    next.personId = canonicalText(subject.personId) || canonicalText(next.personId);
    next.leadId = canonicalText(subject.leadId) || canonicalText(next.leadId);
    next.subjectRole = role;
    next.encounterRole = role;
    next.vehiclePosition = occupantRole;
    next.formState = Object.assign({}, next.formState || {});
    next.formState.encounterRoleTarget = Object.assign(
      {},
      next.formState.encounterRoleTarget || {},
      { type: "radio", value: "TARGET", checked: role === "TARGET" }
    );
    next.formState.encounterRoleCollateral = Object.assign(
      {},
      next.formState.encounterRoleCollateral || {},
      { type: "radio", value: "COLLATERAL", checked: role === "COLLATERAL" }
    );
    ["subject_role_target", "subject_role_collateral"].forEach(function (id) {
      if (!owns(next.formState, id)) {
        return;
      }
      next.formState[id] = Object.assign({}, next.formState[id], {
        checked: id === "subject_role_target" ? role === "TARGET" : role === "COLLATERAL"
      });
    });
    next.formState.vehiclePosition = Object.assign(
      {},
      next.formState.vehiclePosition || {},
      { type: "select-one", value: occupantRole, checked: false }
    );
    if (owns(next.formState, "vehicle_position")) {
      next.formState.vehicle_position = Object.assign(
        {},
        next.formState.vehicle_position,
        { value: occupantRole }
      );
    }
    return next;
  }

  function stripImportPresence(row) {
    var copy = Object.assign({}, row || {});
    delete copy.__copdocImportArrestFieldPresence;
    return copy;
  }

  function detachFailedImportedBookIn(row) {
    var copy = stripImportPresence(row);
    delete copy.bookingId;
    delete copy.bookinRecordId;
    copy.subjectId = "";
    copy.personId = "";
    copy.leadId = "";
    copy.arrestId = "";
    copy.encounterId = "";
    copy.subjectRole = "";
    copy.encounterRole = "";
    copy.vehiclePosition = "";
    copy.formState = Object.assign({}, copy.formState || {});
    [
      "encounterRoleTarget",
      "encounterRoleCollateral",
      "subject_role_target",
      "subject_role_collateral"
    ].forEach(function (id) {
      if (owns(copy.formState, id)) {
        copy.formState[id] = Object.assign({}, copy.formState[id], {
          checked: false
        });
      }
    });
    ["vehiclePosition", "vehicle_position"].forEach(function (id) {
      if (owns(copy.formState, id)) {
        copy.formState[id] = Object.assign({}, copy.formState[id], {
          value: ""
        });
      }
    });
    delete copy.encounterProjectionFiledAt;
    copy.encounterProjectionDraft = true;
    return copy;
  }

  function isQuietImportedBookIn(row) {
    return Boolean(
      row &&
        row.encounterProjectionDraft === true &&
        !canonicalText(row.encounterProjectionFiledAt) &&
        !canonicalText(row.arrestId)
    );
  }

  function promoteStoredBookInCases(scope) {
    scope = scope || {};
    var store = canonicalBookInStore();
    var storedFallback = !Array.isArray(scope.rows)
      ? readStored(BOOKIN_KEY)
      : null;
    if (storedFallback && !storedFallback.ok) {
      return {
        ok: false,
        attempted: false,
        rows: [],
        promoted: 0,
        created: 0,
        reused: 0,
        failed: 0,
        errors: [],
        error: storedFallback.error
      };
    }
    var rows = Array.isArray(scope.rows)
      ? scope.rows
      : storedFallback && storedFallback.ok && Array.isArray(storedFallback.value)
        ? storedFallback.value
        : [];
    var requested = Object.create(null);
    (scope.acceptedIds || []).forEach(function (id) {
      requested[canonicalText(id)] = true;
    });
    var candidates = rows.filter(function (row) {
      return requested[recordId("bookin", row)];
    });
    var quietIds = Object.create(null);
    candidates.forEach(function (row) {
      if (isQuietImportedBookIn(row)) {
        quietIds[recordId("bookin", row)] = true;
      }
    });
    if (Object.keys(quietIds).length) {
      rows = rows.map(function (row) {
        var id = recordId("bookin", row);
        return quietIds[id] ? detachFailedImportedBookIn(row) : row;
      });
      candidates = rows.filter(function (row) {
        return requested[recordId("bookin", row)];
      });
    }
    var eligible = candidates.filter(function (row) {
      return row && !row.voidedAt && !quietIds[recordId("bookin", row)];
    });
    if (!eligible.length) {
      var quietRows = rows.map(stripImportPresence);
      if (!writeJson(BOOKIN_KEY, quietRows)) {
        return {
          ok: false,
          attempted: false,
          rows: quietRows,
          promoted: 0,
          created: 0,
          reused: 0,
          failed: 0,
          errors: [],
          error: "Could not write localStorage (quota or private mode)."
        };
      }
      return {
        ok: true,
        attempted: false,
        rows: quietRows,
        promoted: 0,
        created: 0,
        reused: 0,
        failed: 0,
        errors: []
      };
    }
    if (!store) {
      return null;
    }

    var leadStored = readStored(LEAD_KEY);
    var normalizedEncounters = leadStored.ok
      ? canonicalEncounterMap(
          (leadStored.value && leadStored.value.encounters) || {}
        )
      : { ok: false, rows: {}, error: leadStored.error };
    var preparedById = Object.create(null);
    var failedById = Object.create(null);
    var errors = [];
    eligible.forEach(function (row) {
      var id = recordId("bookin", row);
      var resolved = normalizedEncounters.ok
        ? exactEncounterSubjectForBookIn(row, normalizedEncounters.rows)
        : { ok: false, subject: null, error: normalizedEncounters.error };
      if (!resolved.ok) {
        failedById[id] = true;
        errors.push({ recordId: id, error: resolved.error });
        return;
      }
      var prepared = projectCanonicalSubjectOntoBookIn(row, resolved.subject);
      var presence = Object.assign({}, scope.presenceById && scope.presenceById[id]);
      if (resolved.subject) {
        presence.encounterId = true;
        presence.subjectRole = true;
        presence.vehiclePosition = true;
      }
      prepared.__copdocImportArrestFieldPresence = presence;
      preparedById[id] = prepared;
    });

    var promotable = eligible.filter(function (row) {
      return !failedById[recordId("bookin", row)];
    }).map(function (row) {
      return preparedById[recordId("bookin", row)];
    });
    var summary = {
      ok: true,
      rows: [],
      promoted: 0,
      created: 0,
      reused: 0,
      failed: 0,
      errors: []
    };
    if (promotable.length) {
      store.loadFromDisk();
      summary = store.promoteBookInRecords(promotable, {
        preserveMissingArrestFields: true
      }) || summary;
    }
    var storeFailedIds = Object.create(null);
    (summary.errors || []).forEach(function (item) {
      var id = canonicalText(item && item.recordId);
      if (id) {
        storeFailedIds[id] = true;
      }
      errors.push(item);
    });
    if (summary.failed && !Object.keys(storeFailedIds).length) {
      promotable.forEach(function (row) {
        storeFailedIds[recordId("bookin", row)] = true;
      });
    }
    Object.keys(storeFailedIds).forEach(function (id) {
      failedById[id] = true;
    });
    var promotedById = Object.create(null);
    (summary.rows || []).forEach(function (row) {
      var id = recordId("bookin", row);
      if (id && !failedById[id]) {
        promotedById[id] = stripImportPresence(row);
      }
    });
    var finalRows = rows.map(function (row) {
      var id = recordId("bookin", row);
      if (!requested[id]) {
        return row;
      }
      if (failedById[id]) {
        if (scope.priorById && scope.priorById[id]) {
          return scope.priorById[id];
        }
        return detachFailedImportedBookIn(preparedById[id] || row);
      }
      return promotedById[id] || stripImportPresence(row);
    });
    var failedCount = Object.keys(failedById).length;
    summary.rows = finalRows;
    summary.failed = failedCount;
    summary.errors = errors;
    summary.ok = !failedCount && summary.ok !== false;
    if (failedCount) {
      summary.error =
        failedCount +
        " imported Book-In record" +
        (failedCount === 1 ? "" : "s") +
        " could not be linked; new records were retained as drafts and existing records were restored.";
    }
    if (!writeJson(BOOKIN_KEY, finalRows)) {
      summary.ok = false;
      summary.error = "Cases were created, but Book-In links could not be saved.";
    }
    return summary;
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

  function addPromotionStats(result, promotion) {
    if (!promotion) {
      return;
    }
    if (promotion.attempted !== false) {
      result.bookinPromotionAttempted = true;
    }
    result.casesCreated = promotion.created || 0;
    result.casesReused = promotion.reused || 0;
    result.casePromotionFailed = promotion.failed || 0;
    if (promotion.error) {
      result.error = result.error || promotion.error;
    }
  }

  function applyStagedImport(parsed, types) {
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
    var prepared = prepareImportRows(parsed, types);
    if (!prepared.ok) {
      result.error = prepared.error;
      return result;
    }
    var objectContract = prepareObjectContractImport(parsed, types, prepared);
    if (!objectContract.ok) {
      result.error = objectContract.error;
      return result;
    }
    var pendingBookIn = null;
    types.forEach(function (type) {
      var cleaned = cleanList(type, prepared.rowsByType[type]);
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
        store.associations = store.associations || {};
        store.operations = store.operations || {};
        var added = 0;
        var updated = 0;
        var skipped = 0;
        if (type === "encounters") {
          var canonicalEncounters = canonicalEncounterMap(store.encounters);
          if (!canonicalEncounters.ok) {
            result.error = result.error || canonicalEncounters.error;
            return;
          }
          store.encounters = canonicalEncounters.rows;
          cleaned.rows.forEach(function (row) {
            var id = recordId("encounters", row);
            var current = store.encounters[id];
            if (!current) {
              rememberEmbeddedObjects(store, row);
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
            rememberEmbeddedObjects(store, row);
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
          function mergeMap(dest, incoming, objectType) {
            Object.keys(incoming || {}).forEach(function (id) {
              if (!incoming[id]) {
                return;
              }
              if (!dest[id]) {
                if (objectType && canonicalBookInStore() && canonicalBookInStore().stageImportedObjectRecord) {
                  var created = canonicalBookInStore().stageImportedObjectRecord(objectType, incoming[id], null);
                  if (!created.ok) throw new Error(created.error);
                  dest[id] = created.record;
                } else dest[id] = incoming[id];
                return;
              }
              if (incomingIsNewer(dest[id], incoming[id])) {
                if (objectType && canonicalBookInStore() && canonicalBookInStore().stageImportedObjectRecord) {
                  var updated = canonicalBookInStore().stageImportedObjectRecord(objectType, incoming[id], dest[id]);
                  if (!updated.ok) throw new Error(updated.error);
                  dest[id] = updated.record;
                } else dest[id] = incoming[id];
              }
            });
          }
          mergeMap(store.people, maps.people, "PERSON");
          mergeMap(store.vehicles, maps.vehicles, "VEHICLE");
          mergeMap(store.locations, maps.locations, "LOCATION");
          mergeMap(store.businesses, maps.businesses, "BUSINESS");
          mergeMap(store.entities, maps.entities, "ENTITY");
          mergeMap(store.associations, maps.associations);
        } else {
          cleaned.rows.forEach(function (snap) {
            var id = snap.leadId;
            var current = store.leads[id];
            if (!current) {
              store.leads[id] = snap;
              rememberEmbeddedObjects(store, snap);
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
            rememberEmbeddedObjects(store, snap);
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
        result.added += mergedBook.added;
        result.updated += mergedBook.updated;
        result.skipped += mergedBook.skipped;
        pendingBookIn = mergedBook;
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
    if (result.error) return result;
    if (pendingBookIn) {
      var promotion = promoteStoredBookInCases(pendingBookIn);
      result.acceptedBookInIds = pendingBookIn.acceptedIds || [];
      if (promotion) {
        addPromotionStats(result, promotion);
      } else {
        result.pendingBookInImport = pendingBookIn;
      }
    }
    if (result.error || result.casePromotionFailed || result.pendingBookInImport) {
      result.error = result.error || "All Book-In records must pass canonical validation before import can be applied.";
      return result;
    }
    applySupportState(parsed);
    return result;
  }

  function captureImportStorage() {
    var snapshot = { localStorage: {}, sessionStorage: {} };
    var defaults = [LEAD_KEY, ADMIN_KEY, BOOKIN_KEY, SETTINGS_KEY, MAP_MARKUP_KEY, MAP_VIEWS_KEY,
      MAP_LAYERS_KEY, MAP_ICONS_KEY, MAP_BASEMAP_KEY, TEMPLATE_KEY, TEMPLATE_LEGACY_KEY,
      "copdocx.booking-transactions.v1", "copdocx.import-transactions.v1"];
    ["localStorage", "sessionStorage"].forEach(function (medium) {
      var api = global[medium];
      var keys = medium === "localStorage" ? defaults.slice() : [];
      (config && config.storageEntries || []).forEach(function (entry) {
        if (entry.medium === medium && keys.indexOf(entry.key) === -1) keys.push(entry.key);
      });
      if (api && typeof api.key === "function") {
        for (var i = 0; i < api.length; i += 1) {
          var key = api.key(i);
          if (keys.indexOf(key) === -1) keys.push(key);
        }
      }
      keys.forEach(function (key) { snapshot[medium][key] = api ? api.getItem(key) : null; });
    });
    return snapshot;
  }

  function facadeFor(raw) {
    return {
      getItem: function (key) { return owns(raw, key) ? raw[key] : null; },
      setItem: function (key, value) { raw[key] = String(value); },
      removeItem: function (key) { raw[key] = null; }
    };
  }

  // An identifier, not an integrity hash. The workflow verifies existing bytes
  // before reusing it, and refuses any collision.
  function importedPhotoId(packet, dataUrl) {
    var input = packet.id + "\n" + dataUrl;
    var a = 2166136261, b = 5381;
    for (var i = 0; i < input.length; i += 1) {
      a = Math.imul(a ^ input.charCodeAt(i), 16777619);
      b = Math.imul(b, 33) ^ input.charCodeAt(i);
    }
    return "media_import_" + (a >>> 0).toString(16) + "_" + (b >>> 0).toString(16) + "_" + dataUrl.length;
  }

  function previewRows(parsed, types, before, after) {
    var rows = [];
    function rowsAt(raw, type) {
      var key = type === "bookin" ? BOOKIN_KEY : ["officers", "vehicles", "shifts"].indexOf(type) !== -1 ? ADMIN_KEY : LEAD_KEY;
      var data = raw[key] ? JSON.parse(raw[key]) : null;
      var value = type === "bookin" ? data || [] : data && data[type] || [];
      return asRecordList(value);
    }
    types.forEach(function (type) {
      var prior = Object.create(null), next = Object.create(null);
      rowsAt(before, type).forEach(function (row) { prior[recordId(type, row)] = row; });
      rowsAt(after, type).forEach(function (row) { next[recordId(type, row)] = row; });
      (parsed[type] || []).forEach(function (row) {
        var id = recordId(type, row);
        rows.push({ type: type, recordId: id, action: !next[id] || jsonEqual(prior[id], next[id]) ? "skip" : prior[id] ? "update" : "create" });
      });
    });
    return rows;
  }

  function buildImportPlan(parsed, types, options) {
    options = options || {};
    var plan = { ok: false, format: "copdocx.import-plan.v1", changes: [], guards: [], reads: [], mediaPlans: [], rows: [], findings: [], stats: {}, error: "" };
    try {
      parsed = JSON.parse(JSON.stringify(parsed));
      types = (types || TYPE_META.map(function (meta) { return meta.key; }).filter(function (key) { return (parsed[key] || []).length; })).slice();
      if (types.indexOf("bookin") !== -1) (parsed.requiredTypes || []).forEach(function (type) { if (types.indexOf(type) === -1) types.push(type); });
      if (!types.length || types.some(function (type) { return !TYPE_META.some(function (meta) { return meta.key === type; }); })) throw new Error("Choose supported record types to import.");
      types.forEach(function (type) {
        if (!Array.isArray(parsed[type])) throw new Error("The " + type + " import must contain a records list.");
        parsed[type].forEach(function (row) {
          if (!plainRecord(row) || !recordId(type, row)) throw new Error("Every imported " + type + " record must have its own valid ID.");
        });
      });
      plan.rows = types.reduce(function (rows, type) {
        return rows.concat(parsed[type].map(function (row) { return { type: type, recordId: recordId(type, row), action: "review" }; }));
      }, []);
      plan.source = parsed.source || { format: parsed.format, appVersion: parsed.appVersion || "", exportedAt: parsed.exportedAt || "" };
      plan.requiredTypes = (parsed.requiredTypes || []).slice();
      plan.findings = (parsed.findings || []).slice();
      if (types.indexOf("bookin") !== -1) {
        var decoder = global.COPDoc && COPDoc.importSchema;
        if (!decoder || typeof decoder.decode !== "function") throw new Error("The shared Book-In import decoder is unavailable.");
        var decoded = decoder.decode({ format: "alien-book-in-records", schemaVersion: parsed.schemaVersion || 5,
          appVersion: parsed.appVersion || "", exportedAt: parsed.exportedAt || "", records: parsed.bookin });
        if (!decoded.ok) throw new Error(decoded.error);
        // COPDoc round trips retain the actual original import source.
        parsed.bookin = decoded.records.map(function (row, index) {
          if (parsed.bookin[index].importSource) row.importSource = parsed.bookin[index].importSource;
          return row;
        });
        plan.findings = decoded.findings;
        parsed.bookin.forEach(function (row) {
          var decision = options.recordDecisions && options.recordDecisions[row.id];
          var needsReview = plan.findings.some(function (finding) { return finding.code === "CUSTODY_REVIEW" && finding.recordId === row.id; });
          if (decision && decision.keepDraft) {
            if (row.personId || row.leadId || row.arrestId || row.subjectId || row.encounterId) throw new Error("A linked Book-In cannot be converted into an unlinked draft during import.");
            row.encounterProjectionDraft = true;
          } else if (needsReview && !(decision && decision.outcome === "ARRESTED") && !row.encounterProjectionDraft) {
            throw new Error("Book-In " + row.id + " requires a custody decision. Keep as draft or explicitly confirm ARRESTED before applying.");
          }
          if (needsReview && decision) row.importDecision = { outcome: decision.keepDraft ? "DRAFT" : "ARRESTED" };
        });
        if (plan.findings.some(function (finding) { return finding.code === "CARD_RENDERER_REQUIRED"; })) throw new Error("Load the baseball card compatibility module before importing saved cards.");
      }
      var store = canonicalBookInStore();
      if (!store || typeof store.withImportWorkspace !== "function") throw new Error("The shared import staging model is unavailable.");
      var beforeSnapshot = captureImportStorage();
      var rawWorkspace = beforeSnapshot.localStorage[LEAD_KEY];
      var workspace = rawWorkspace ? JSON.parse(rawWorkspace) : emptyLeadStore();
      var previousFacade = importStorage;
      var staged;
      try {
        staged = store.withImportWorkspace(workspace, beforeSnapshot, function (stagedStore, snapshot) {
          importStorage = facadeFor(snapshot.localStorage);
          var result = applyStagedImport(parsed, types);
          if (result.error) return result;
          var packets = readJson(BOOKIN_KEY, []);
          if (types.indexOf("bookin") !== -1) {
            var incomingIds = (parsed.bookin || []).map(function (row) { return row.id; });
            packets = packets.map(function (packet) {
              if (incomingIds.indexOf(packet.id) === -1 || (result.acceptedBookInIds || []).indexOf(packet.id) === -1 || packet.voidedAt || isQuietImportedBookIn(packet)) return packet;
              if (typeof stagedStore.stageImportedBookingProjections !== "function") throw new Error("The shared booking projection adapter is unavailable.");
              var projected = stagedStore.stageImportedBookingProjections(packet);
              if (!projected || !projected.ok) throw new Error(projected && projected.error || "Imported booking projections could not be prepared.");
              return projected.record || packet;
            });
            if (options.mode === "replace") {
              packets = packets.filter(function (packet) {
                if (incomingIds.indexOf(packet.id) !== -1) return true;
                if (packet.arrestId || packet.subjectId || packet.encounterId || packet.personId || packet.leadId || packet.voidedAt || packet.encounterProjectionFiledAt) throw new Error("Replace cannot omit linked or historical Book-In " + packet.id + ". Use merge or retain that record in the file.");
                if (typeof stagedStore.dependenciesFor !== "function") throw new Error("Draft replacement requires the dependency scanner.");
                var scan = stagedStore.dependenciesFor("BOOKING", packet.id);
                if (!scan.ok || (scan.dependencies || []).some(function (dep) { return !(dep.store === "bookin" && dep.recordId === packet.id); })) throw new Error("Replace cannot remove a referenced Book-In draft " + packet.id + ".");
                return false;
              });
            }
            packets.forEach(function (packet) {
              if (incomingIds.indexOf(packet.id) === -1 || !packet.baseballCard || !packet.personId || packet.voidedAt) return;
              if ((result.acceptedBookInIds || []).indexOf(packet.id) === -1 && packet.baseballCardId) return;
              if (typeof stagedStore.projectImportedBaseballCard !== "function") throw new Error("The saved-card import adapter is unavailable.");
              var photoMediaId = canonicalText(packet.baseballCard.photoMediaId);
              if (packet.baseballCard.photoDataUrl) {
                photoMediaId = photoMediaId || importedPhotoId(packet, packet.baseballCard.photoDataUrl);
                var supplied = (parsed.media || []).filter(function (bundle) { return bundle && bundle.meta && bundle.meta.mediaId === photoMediaId; });
                if (supplied.length) {
                  var original = supplied[0].blobs && supplied[0].blobs.filter(function (blob) { return (blob.role || "original") === "original"; })[0];
                  if (supplied.length !== 1 || !supplied[0].meta.owner || supplied[0].meta.owner.type !== "PERSON" || supplied[0].meta.owner.id !== packet.personId || !original ||
                    "data:" + (original.mime || supplied[0].meta.mime) + ";base64," + String(original.base64 || "").replace(/[\r\n]/g, "") !== packet.baseballCard.photoDataUrl) throw new Error("The saved card photo disagrees with its Media bundle.");
                } else {
                  plan.mediaPlans.push({ mediaId: photoMediaId, ownerType: "PERSON", ownerId: packet.personId, kind: "photo", dataUrl: packet.baseballCard.photoDataUrl, mimeType: packet.baseballCard.photoDataUrl.slice(5).split(";")[0], filename: "imported-baseball-card" });
                }
              } else if (photoMediaId && !(parsed.media || []).some(function (bundle) {
                return bundle && bundle.meta && bundle.meta.mediaId === photoMediaId && bundle.meta.owner && bundle.meta.owner.type === "PERSON" && bundle.meta.owner.id === packet.personId;
              })) {
                throw new Error("Saved card " + packet.id + " references a photo absent from this export. Include its Media bundle before importing.");
              }
              var projected = stagedStore.projectImportedBaseballCard({ personId: packet.personId, bookingId: packet.id,
                cardId: packet.baseballCardId, photoMediaId: photoMediaId, baseballCard: packet.baseballCard, source: packet.importSource || plan.source,
                finalizedSnapshot: packet.baseballCardFinalizedSnapshot, arrestOfDay: packet.baseballCardArrestOfDay });
              if (!projected || !projected.ok) throw new Error(projected && projected.error || "Saved baseball card could not be imported.");
              packet.baseballCardId = projected.cardId;
            });
            if (!writeJson(BOOKIN_KEY, packets)) throw new Error("Could not stage Book-In card references.");
          }
          return result;
        });
      } finally { importStorage = previousFacade; }
      if (!staged || !staged.ok) throw new Error(staged && staged.error || "Import staging failed.");
      var result = staged.result || {};
      if (result.error || result.casePromotionFailed) throw new Error(result.error || "The import contains unresolved records.");
      var afterSnapshot = staged.storageSnapshot;
      if (!afterSnapshot || !afterSnapshot.localStorage) throw new Error("Import staging did not return its storage snapshot.");
      var before = beforeSnapshot.localStorage, after = afterSnapshot.localStorage;
      Object.keys(Object.assign({}, before, after)).forEach(function (key) {
        var prior = owns(before, key) ? before[key] : null, next = owns(after, key) ? after[key] : null;
        plan.reads.push({ key: key, before: prior });
        if (prior !== next) plan.changes.push({ key: key, before: prior, after: next });
      });
      ["localStorage", "sessionStorage"].forEach(function (medium) {
        Object.keys(beforeSnapshot[medium]).forEach(function (key) {
          if (/^copdocx\.import(?:-transactions|\.done)/.test(key)) return;
          if (config && config.storageEntries && !config.storageEntries.some(function (entry) { return entry.key === key && entry.medium === medium; })) return;
          plan.guards.push({ medium: medium, key: key, before: beforeSnapshot[medium][key] });
        });
      });
      if (typeof store.validateImportWorkspace === "function") {
        var validation = store.validateImportWorkspace(staged.workspace, workspace, afterSnapshot);
        if (!validation || !validation.ok) throw new Error(validation && validation.error || "Import relationship validation failed.");
      }
      (parsed.media || []).forEach(function (row) { plan.mediaPlans.push(JSON.parse(JSON.stringify(row))); });
      var stagedAdmin = after[ADMIN_KEY] ? JSON.parse(after[ADMIN_KEY]) : {};
      plan.mediaPlans.forEach(function (media) {
        var owner = media.meta && media.meta.owner || { type: media.ownerType, id: media.ownerId };
        var map = { PERSON: "people", LEAD: "leads", ENCOUNTER: "encounters", INVESTIGATION: "investigations", OPERATION: "operations", VEHICLE: "vehicles", LOCATION: "locations", BUSINESS: "businesses", ENTITY: "entities" }[owner.type];
        var exists = map && staged.workspace[map] && staged.workspace[map][owner.id];
        if (owner.type === "OFFICER") exists = (stagedAdmin.officers || []).some(function (row) { return recordId("officers", row) === owner.id; });
        if (owner.type === "VEHICLE" && !exists) exists = (stagedAdmin.vehicles || []).some(function (row) { return recordId("vehicles", row) === owner.id; });
        if (!exists) throw new Error("Imported Media references a missing " + String(owner.type || "object") + " owner " + String(owner.id || "") + ".");
      });
      plan.rows = previewRows(parsed, types, before, after);
      var oldWorkspace = before[LEAD_KEY] ? JSON.parse(before[LEAD_KEY]) : {}, newWorkspace = after[LEAD_KEY] ? JSON.parse(after[LEAD_KEY]) : {};
      ["people", "vehicles", "locations", "businesses", "entities", "associations"].forEach(function (type) {
        var oldMap = oldWorkspace[type] || {}, newMap = newWorkspace[type] || {};
        Object.keys(newMap).forEach(function (id) {
          if (!jsonEqual(oldMap[id], newMap[id])) plan.rows.push({ type: type, recordId: id, action: oldMap[id] ? "update" : "create", dependency: true });
        });
      });
      plan.stats = result;
      plan.ok = true;
      return plan;
    } catch (error) {
      plan.error = error.message || String(error);
      plan.findings.push({ code: "IMPORT_CONFLICT", severity: "error", message: plan.error });
      plan.changes = [];
      plan.mediaPlans = [];
      plan.stats = { added: 0, updated: 0, skipped: 0, error: plan.error };
      return plan;
    }
  }

  function applyImport(parsed, types, options) {
    var plan = buildImportPlan(parsed, types, options);
    if (!plan.ok) return Object.assign({ ok: false }, plan.stats, { error: plan.error, plan: plan });
    var workflow = global.COPDoc && COPDoc.importWorkflow;
    if (!workflow || typeof workflow.commitSync !== "function") return { ok: false, added: 0, updated: 0, skipped: 0, error: "The recoverable import workflow is unavailable." };
    var result = workflow.commitSync(plan);
    return Object.assign({}, result && result.ok ? plan.stats : { added: 0, updated: 0, skipped: 0 }, result || { ok: false, error: "Import could not be committed." });
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
      if (typeof localStorage !== "undefined") {
        localStorage.setItem("copdocx.import.done.v1", String(Date.now()));
      }
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
    if (!types.length) {
      setStatus("Pick at least one record type.");
      return;
    }
    var formatEl = document.querySelector('input[name="fileExportFormat"]:checked');
    var format = formatEl ? formatEl.value : "json";
    var from = (byId("fileExportFrom") && byId("fileExportFrom").value) || "";
    var to = (byId("fileExportTo") && byId("fileExportTo").value) || "";
    var go = byId("fileExportGo");
    if (go) go.disabled = true;
    try {
      await ensureCanonicalBookInStore();
      if (!global.COPDoc.baseball || typeof COPDoc.baseball.fromCanonical !== "function") await loadModelScript("functions/baseball-card-contract.js");
      var exportBefore = captureImportStorage();
      function assertExportUnchanged() {
        [LEAD_KEY, ADMIN_KEY, BOOKIN_KEY].forEach(function (key) {
          if (localStorage.getItem(key) !== exportBefore.localStorage[key]) throw new Error("Workspace changed while collecting export data. Export again to capture one consistent version.");
        });
      }
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
    if (format === "json" || format === "both") {
      if (!global.COPDoc.media || typeof COPDoc.media.exportBundle !== "function") await loadModelScript("functions/model/media.js");
      if (!global.COPDoc.media || typeof COPDoc.media.exportBundle !== "function") throw new Error("Photo and file storage could not be loaded. Export was not completed.");
      setStatus("Collecting photos and files…");
      bundle.media = await COPDoc.media.exportBundle();
      if (!Array.isArray(bundle.media)) throw new Error("Photo and file export could not be verified.");
      var exportedOwners = mediaOwnersInExport(bundle);
      bundle.media = bundle.media.filter(function (row) { return row && row.meta && row.meta.owner && exportedOwners[row.meta.owner.type + ":" + row.meta.owner.id]; });
      var ids = Object.create(null);
      bundle.media.forEach(function (row) {
        if (row && row.meta && Array.isArray(row.blobs) && row.blobs.some(function (blob) { return blob && (blob.role || "original") === "original" && typeof blob.base64 === "string" && blob.base64.length; })) ids[row.meta.mediaId] = true;
      });
      function verifyReferences(value) {
        if (!value || typeof value !== "object") return;
        Object.keys(value).forEach(function (key) {
          if ((key === "photoMediaId" || key === "renderedPhotoMediaId") && value[key] && !ids[value[key]]) throw new Error("A saved card references missing Media " + value[key] + ". Export was not completed.");
          if (key !== "media" && key !== "importSource") verifyReferences(value[key]);
        });
      }
      verifyReferences(bundle);
      assertExportUnchanged();
      finish(bundle.media.length ? " " + bundle.media.length + " media file(s)." : "");
    } else { assertExportUnchanged(); finish(""); }
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

  var root = (global.COPDoc = global.COPDoc || {});
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
