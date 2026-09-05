/**
 * Admin hub: officers, vehicles, week schedule, and duty/arrests summary.
 * Stored in localStorage copdoc.admin.v1. Arrest counts read committed case arrests.
 */
(function () {
  var config = window.COPDoc && window.COPDoc.config;
  var STORAGE_KEY =
    (config && config.storageKey("admin")) || "copdoc.admin.v1";
  var DUTY_LABELS = {
    available: "Available",
    "in-field": "In field",
    admin: "Admin",
    leave: "Leave",
    off: "Off duty"
  };
  var VEHICLE_STATUS = {
    available: "Available",
    assigned: "Assigned",
    down: "Down",
    out: "Out of service"
  };
  var TYPE_LABELS = {
    sedan: "Sedan",
    suv: "SUV",
    van: "Van",
    other: "Other"
  };
  var ASSIGN_LABELS = {
    field: "Field",
    transport: "Transport",
    office: "Office",
    other: "Other"
  };
  var QUAL_LABELS = {
    firearms: "Firearms",
    if: "Intermediate force",
    "ero-basic": "ERO basic",
    "1801": "1801",
    spanish: "Spanish",
    cdl: "CDL"
  };
  var EQUIP_LABELS = {
    creds: "Credentials",
    firearm: "Firearm",
    radio: "Radio",
    armor: "Body armor",
    "gov-phone": "Gov phone (device)",
    laptop: "Laptop",
    oc: "OC spray",
    baton: "Baton"
  };
  var ADDR_KIND_LABELS = {
    home: "Home",
    mailing: "Mailing",
    office: "Office",
    residence: "Residence",
    work: "Work"
  };
  var TARGET_LABELS = {
    "1": "Primary target",
    "2": "Secondary",
    "3": "Tertiary"
  };
  var ROLE_LABELS = {
    "tac-med": "Tac-Med",
    tl: "TL (Team Leader)",
    atl: "ATL (Assistant Team Leader)",
    language: "Language (interpreter)"
  };
  var VEHICLE_EQUIP_LABELS = {
    caged: "Caged",
    "gun-box": "Gun box",
    radio: "Radio",
    "emergency-lights": "Emergency lights"
  };
  var LOCATION_FIELDS = [
    "locationAssociation",
    "targetPriority",
    "parksHere",
    "street",
    "street2",
    "city",
    "state",
    "zip",
    "latLong",
    "latitude",
    "longitude"
  ];

  var state = { officers: [], vehicles: [], shifts: [] };
  var editingOfficerId = "";
  var editingVehicleId = "";
  var editingOfficerBaseline = null;
  var editingVehicleBaseline = null;
  var suppressOfficerAutoSave = false;
  var officerAutoSaveBound = false;
  var officerAuto = null;
  var suppressVehicleAutoSave = false;
  var vehicleAuto = null;
  var recordFilter = "all";

  function adminPage() {
    return document.body.getAttribute("data-admin-page") || "dashboard";
  }

  function queryParam(name) {
    try {
      return new URLSearchParams(window.location.search).get(name) || "";
    } catch (error) {
      return "";
    }
  }

  function findOfficer(id) {
    return state.officers.filter(function (row) {
      return row.id === id || row.officerId === id;
    })[0];
  }

  function displayOrDash(value) {
    var text = String(value == null ? "" : value).trim();
    return text || "—";
  }

  function labeledList(values, labels) {
    var bits = (values || [])
      .map(function (code) {
        return labels[code] || code;
      })
      .filter(Boolean);
    return bits.length ? bits.join(", ") : "—";
  }

  function formatEod(iso) {
    var match = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) {
      return displayOrDash(iso);
    }
    return new Date(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3])
    ).toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric"
    });
  }

  function formatAddressLine(address) {
    if (!address) {
      return "—";
    }
    var cityState = [address.city, address.state].filter(Boolean).join(", ");
    var line = [address.street, address.street2, cityState, address.zip]
      .filter(Boolean)
      .join(", ");
    return line || "—";
  }

  function byId(id) {
    return document.getElementById(id);
  }

  function setStatus(message, ok) {
    if (window.COPDoc && typeof COPDoc.setAppBarStatus === "function") {
      COPDoc.setAppBarStatus(message || "", { ok: Boolean(ok) });
    }
  }

  function chromePrimary() {
    return byId("appBarPrimaryAction");
  }

  function newId(prefix) {
    return (
      prefix +
      "-" +
      Date.now().toString(36) +
      "-" +
      Math.random().toString(36).slice(2, 7)
    );
  }

  function rowCommitted(row) {
    if (window.COPDoc && COPDoc.model && typeof COPDoc.model.isCommitted === "function") {
      return COPDoc.model.isCommitted(row);
    }
    return !row || !row.meta || row.meta.status !== "draft";
  }

  function dispositionApi() {
    return window.COPDoc && COPDoc.adminDisposition;
  }

  function rowJunked(row) {
    if (row && (row.inactive || row.archivedAt)) { return true; }
    var api = dispositionApi();
    return api && api.isJunked ? api.isJunked(row) : Boolean(row && row.junked);
  }

  function rowActive(row) {
    return Boolean(row && !rowJunked(row));
  }

  function rowMeta(existing, mode) {
    if (window.COPDoc && COPDoc.model && typeof COPDoc.model.stampMeta === "function") {
      return COPDoc.model.stampMeta(existing, mode);
    }
    var now = new Date().toISOString();
    var prev = (existing && existing.meta) || {};
    return {
      createdAt: prev.createdAt || now,
      updatedAt: now,
      markedComplete: false,
      status: mode === "commit" ? "committed" : "draft",
      committedAt: mode === "commit" ? now : prev.committedAt || ""
    };
  }

  var diskError = "";

  function adminCommands() { return COPDoc.application && COPDoc.application.admin; }

  function readDisk() {
    var api = adminCommands();
    if (!api) { return { ok: false, missing: false, data: null, error: "The Admin application service is unavailable." }; }
    var loaded = api.readAdmin();
    return { ok: loaded.ok, missing: loaded.raw === null, data: loaded.data || null, error: loaded.error || "" };
  }

  function adoptDisk() {
    var disk = readDisk();
    if (!disk.ok) { diskError = disk.error; return { ok: false, error: disk.error }; }
    diskError = "";
    state = disk.data || { officers: [], vehicles: [], shifts: [] };
    return { ok: true, error: "" };
  }

  function loadState() {
    var fresh = adoptDisk();
    if (!fresh.ok) { setStatus(fresh.error); return; }
    var api = adminCommands();
    var result = api ? api.migrateLegacy() : { ok: false, error: "The Admin application service is unavailable." };
    if (!result.ok) { diskError = result.error; setStatus(result.error); return; }
    fresh = adoptDisk();
    if (!fresh.ok) { setStatus(fresh.error); }
  }

  function acceptCommand(result) {
    if (!result || !result.ok) { setStatus(result && result.error || "The Admin change could not be saved."); return false; }
    var fresh = adoptDisk();
    if (!fresh.ok) { setStatus(fresh.error); return false; }
    return true;
  }

  function val(id) {
    var el = byId(id);
    return el ? String(el.value || "").trim() : "";
  }

  function setVal(id, value) {
    var el = byId(id);
    if (el) {
      el.value = value == null ? "" : String(value);
    }
  }

  function checkedValues(name) {
    return Array.prototype.map.call(
      document.querySelectorAll('input[name="' + name + '"]:checked'),
      function (el) {
        return el.value;
      }
    );
  }

  function setCheckedValues(name, values) {
    var list = values || [];
    document.querySelectorAll('input[name="' + name + '"]').forEach(function (el) {
      el.checked = list.indexOf(el.value) !== -1;
    });
  }

  function officerAddressCard() {
    return byId("officerAddressCard");
  }

  function cardField(name) {
    var card = officerAddressCard();
    var el = card ? card.querySelector('[data-field="' + name + '"]') : null;
    return el ? String(el.value || "").trim() : "";
  }

  function setCardField(name, value) {
    var card = officerAddressCard();
    var el = card ? card.querySelector('[data-field="' + name + '"]') : null;
    if (el) {
      el.value = value == null ? "" : String(value);
    }
  }

  function readOfficerAddress() {
    var card = officerAddressCard();
    return {
      locationId: (card && card.dataset.entityId) || "",
      locationAssociation: cardField("locationAssociation"),
      targetPriority: cardField("targetPriority"),
      parksHere: cardField("parksHere"),
      pinColor: cardField("pinColor"),
      street: cardField("street"),
      street2: cardField("street2"),
      city: cardField("city"),
      state: cardField("state"),
      zip: cardField("zip"),
      latLong: cardField("latLong"),
      latitude: cardField("latitude"),
      longitude: cardField("longitude")
    };
  }

  function fillOfficerAddress(address) {
    address = address || {};
    var assoc = address.locationAssociation || "";
    if (!assoc && address.kind === "office") {
      assoc = "work";
    } else if (!assoc && address.kind) {
      assoc = "residence";
    }
    setCardField("locationAssociation", assoc);
    setCardField("targetPriority", address.targetPriority);
    setCardField("parksHere", address.parksHere);
    setCardField("pinColor", address.pinColor);
    setCardField("street", address.street);
    setCardField("street2", address.street2);
    setCardField("city", address.city);
    setCardField("state", address.state);
    setCardField("zip", address.zip);
    setCardField("latitude", address.latitude);
    setCardField("longitude", address.longitude);
    if (address.latitude && address.longitude) {
      setCardField(
        "latLong",
        address.latLong || address.latitude + ", " + address.longitude
      );
    } else {
      setCardField("latLong", address.latLong);
    }
    if (typeof syncParksHere === "function" && officerAddressCard()) {
      syncParksHere(officerAddressCard());
    }
    var locCard = officerAddressCard();
    if (locCard && address.locationId) {
      locCard.dataset.entityId = address.locationId;
    }
    if (window.COPDoc && COPDoc.cards && typeof COPDoc.cards.paintMedia === "function") {
      COPDoc.cards.paintMedia(locCard, "LOCATION");
    }
    if (window.COPDoc && COPDoc.locationMap && typeof COPDoc.locationMap.sync === "function") {
      COPDoc.locationMap.sync(locCard);
    }
  }

  function officerName(officer) {
    if (!officer) {
      return "";
    }
    var first = [officer.firstName, officer.middleName].filter(Boolean).join(" ");
    return [officer.lastName, first].filter(Boolean).join(", ");
  }

  function findVehicle(id) {
    return state.vehicles.filter(function (row) {
      return row.id === id || row.vehicleId === id;
    })[0];
  }

  function vehiclePlate(vehicle) {
    return (vehicle && (vehicle.licensePlate || vehicle.plate)) || "";
  }

  function vehicleLabel(vehicle) {
    if (!vehicle) {
      return "";
    }
    return [vehicle.unit, vehiclePlate(vehicle)].filter(Boolean).join(" · ");
  }

  function assignedOfficerNames(ids) {
    return (ids || [])
      .map(function (id) {
        return officerName(findOfficer(id));
      })
      .filter(Boolean)
      .join("; ");
  }

  function vehicleCardEl() {
    return byId("vehicleCard") || document.querySelector('[data-card="vehicle"]');
  }

  function vField(name) {
    var card = vehicleCardEl();
    return card ? card.querySelector('[data-field="' + name + '"]') : null;
  }

  function vVal(name) {
    var el = vField(name);
    return el ? String(el.value || "").trim() : "";
  }

  function vSet(name, value) {
    var el = vField(name);
    if (el) {
      el.value = value == null ? "" : String(value);
    }
  }

  function assignedIdsFromInput() {
    var raw = val("assignedOfficerIds");
    if (!raw) {
      return [];
    }
    return raw.split(",").map(function (id) {
      return id.trim();
    }).filter(Boolean);
  }

  function setAssignedOfficers(ids) {
    ids = ids || [];
    setVal("assignedOfficerIds", ids.join(","));
    var label = byId("assignedOfficerLabel");
    if (label) {
      label.textContent = assignedOfficerNames(ids) || "None";
    }
  }

  function readVehicleLocations() {
    var card = vehicleCardEl();
    var list = card && card.querySelector('[data-nested-list="location"]');
    if (!list) {
      return [];
    }
    return Array.prototype.map.call(
      list.querySelectorAll(":scope > fieldset"),
      function (locCard) {
        var loc = {};
        LOCATION_FIELDS.forEach(function (name) {
          var el = locCard.querySelector('[data-field="' + name + '"]');
          loc[name] = el ? String(el.value || "").trim() : "";
        });
        return loc;
      }
    );
  }

  function fillVehicleLocations(locations) {
    var card = vehicleCardEl();
    if (!card || !card._addNested || !card._addNested.location) {
      return;
    }
    var list = card.querySelector('[data-nested-list="location"]');
    if (list) {
      list.replaceChildren();
    }
    (locations || []).forEach(function (loc) {
      var locCard = card._addNested.location();
      if (!locCard) {
        return;
      }
      LOCATION_FIELDS.forEach(function (name) {
        var el = locCard.querySelector('[data-field="' + name + '"]');
        if (el) {
          el.value = loc[name] || "";
        }
      });
      if (typeof syncParksHere === "function") {
        syncParksHere(locCard);
      }
    });
  }

  function locationHasData(loc) {
    if (!loc) {
      return false;
    }
    return LOCATION_FIELDS.some(function (name) {
      return String(loc[name] || "").trim() !== "";
    });
  }

  function dispatchChange(el) {
    if (el) {
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }

  function setVehicleSelect(name, value) {
    var el = vField(name);
    if (!el) {
      return;
    }
    var next = value == null ? "" : String(value);
    if (
      next &&
      !Array.prototype.some.call(el.options, function (option) {
        return option.value === next;
      })
    ) {
      var option = document.createElement("option");
      option.value = next;
      option.textContent = next;
      el.appendChild(option);
    }
    el.value = next;
  }

  function locationKindLabel(loc) {
    var code =
      (loc && (loc.locationAssociation || loc.association)) || "";
    var labels = {
      registration: "Registration address",
      "known-parking": "Known parking location",
      "plate-check": "Plate check location",
      residence: "Residence",
      work: "Work"
    };
    return labels[code] || ADDR_KIND_LABELS[code] || code || "Location";
  }

  function startOfWeek(date) {
    var d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    d.setDate(d.getDate() - d.getDay());
    return d;
  }

  function isoDate(date) {
    var y = date.getFullYear();
    var m = String(date.getMonth() + 1).padStart(2, "0");
    var day = String(date.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + day;
  }

  function fyStart(date) {
    var year = date.getMonth() >= 9 ? date.getFullYear() : date.getFullYear() - 1;
    return new Date(year, 9, 1);
  }

  function countBookInArrests() {
    var week = 0;
    var fy = 0;
    var store = window.COPDoc && COPDoc.model && COPDoc.model.store;
    if (!store || typeof store.listArrests !== "function") {
      return { week: 0, fy: 0 };
    }
    if (typeof store.loadFromDisk === "function") {
      store.loadFromDisk();
    }
    var now = new Date();
    var weekStart = startOfWeek(now);
    var weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);
    var fy0 = fyStart(now);
    var weekFrom = isoDate(weekStart);
    var weekTo = isoDate(new Date(weekEnd.getTime() - 86400000));
    var fyFrom = isoDate(fy0);
    var fyTo = isoDate(now);
    function activeArrest(row) {
      var arrest = row && (row.arrest || row);
      return arrest && !arrest.voided && !arrest.voidedAt && String(arrest.status || "").toUpperCase() !== "VOIDED";
    }
    week = (store.listArrests({ from: weekFrom, to: weekTo }) || []).filter(activeArrest).length;
    fy = (store.listArrests({ from: fyFrom, to: fyTo }) || []).filter(activeArrest).length;
    return { week: week, fy: fy };
  }

  function paintStats() {
    if (!byId("statOfficers")) {
      return;
    }
    var officers = state.officers.filter(function (row) {
      return rowActive(row) && rowCommitted(row) && row.duty === "available";
    }).length;
    var vehicles = state.vehicles.filter(function (row) {
      return rowActive(row) && rowCommitted(row) && row.status === "available";
    }).length;
    var arrests = countBookInArrests();
    byId("statOfficers").textContent = String(officers);
    byId("statVehicles").textContent = String(vehicles);
    byId("statArrestsWeek").textContent = String(arrests.week);
    byId("statArrestsFy").textContent = String(arrests.fy);
  }

  function fillSelect(select, items, placeholder, labelFn) {
    if (!select) {
      return;
    }
    var current = select.value;
    select.replaceChildren();
    var blank = document.createElement("option");
    blank.value = "";
    blank.textContent = placeholder;
    select.appendChild(blank);
    items.forEach(function (item) {
      var option = document.createElement("option");
      option.value = item.id;
      option.textContent = labelFn(item);
      select.appendChild(option);
    });
    var still = Array.prototype.some.call(select.options, function (option) {
      return option.value === current;
    });
    select.value = still ? current : "";
  }

  function paintPickers() {
    if (!byId("shiftOfficer")) {
      return;
    }
    fillSelect(
      byId("shiftOfficer"),
      state.officers.filter(function (row) {
        return rowActive(row) && rowCommitted(row);
      }),
      "Select an officer",
      officerName
    );
    fillSelect(
      byId("shiftVehicle"),
      state.vehicles.filter(function (row) {
        return rowActive(row) && rowCommitted(row);
      }),
      "None",
      vehicleLabel
    );
  }

  function editButton(kind, id) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "action-button-secondary compact";
    btn.textContent = "Edit";
    btn.addEventListener("click", function () {
      if (kind === "officers") {
        fillOfficerForm(id);
      }
      if (kind === "vehicles") {
        fillVehicleForm(id);
      }
    });
    return btn;
  }

  function recordFor(kind, id) {
    return (state[kind] || []).filter(function (row) {
      if (kind === "officers") {
        return row.id === id || row.officerId === id;
      }
      return row.id === id || row.vehicleId === id;
    })[0];
  }

  function recordLabel(kind, row) {
    var label = kind === "officers" ? officerName(row) : vehicleLabel(row);
    return label || (row && (row.id || row.officerId || row.vehicleId)) || "record";
  }

  function matchingShifts(kind, id) {
    return state.shifts.filter(function (shift) {
      return kind === "officers"
        ? shift.officerId === id
        : shift.vehicleId === id;
    });
  }

  function shiftLine(shift) {
    return [shift.date, [shift.start, shift.end].filter(Boolean).join("–")]
      .filter(Boolean)
      .join(" ");
  }

  function confirmLines(title, rows) {
    var lines = rows.slice(0, 10).map(function (row) {
      return "• " + shiftLine(row);
    });
    if (rows.length > 10) {
      lines.push("• …and " + (rows.length - 10) + " more");
    }
    return window.confirm(title + "\n\n" + lines.join("\n"));
  }

  function shiftRemoveButton(shift) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "action-button-danger compact";
    btn.textContent = "Remove";
    btn.addEventListener("click", function () {
      var fresh = adoptDisk();
      if (!fresh.ok) {
        setStatus(fresh.error);
        return;
      }
      var current = state.shifts.filter(function (row) {
        return row.id === shift.id;
      })[0];
      if (!current) {
        setStatus("That shift no longer exists.");
        paint();
        return;
      }
      if (!window.confirm("Remove shift " + shiftLine(current) + "?")) {
        return;
      }
      if (acceptCommand(adminCommands().removeShift(current.id, current))) {
        setStatus("Shift removed.", true);
        paint();
      }
    });
    return btn;
  }

  function removeFromScheduleButton(kind, id) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "action-button-secondary compact";
    btn.textContent = "Remove from schedule";
    btn.addEventListener("click", function () {
      var fresh = adoptDisk();
      if (!fresh.ok) {
        setStatus(fresh.error);
        return;
      }
      var shifts = matchingShifts(kind, id);
      if (!shifts.length) {
        setStatus("No schedule assignments found.");
        paint();
        return;
      }
      var verb = kind === "officers" ? "Remove these shifts?" : "Unassign this vehicle from these shifts?";
      if (!confirmLines(verb, shifts)) {
        return;
      }
      if (acceptCommand(adminCommands().removeScheduleAssignments(kind, id, shifts))) {
        setStatus(
          kind === "officers"
            ? shifts.length + " shift(s) removed."
            : "Vehicle unassigned from " + shifts.length + " shift(s).",
          true
        );
        paint();
      }
    });
    return btn;
  }

  function archiveButton(kind, id) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "action-button-danger compact";
    btn.textContent = "Archive";
    btn.addEventListener("click", function () {
      var fresh = adoptDisk();
      if (!fresh.ok) {
        setStatus(fresh.error);
        return;
      }
      var row = recordFor(kind, id);
      if (!row || rowJunked(row)) {
        paint();
        return;
      }
      var label = recordLabel(kind, row);
      if (!window.confirm("Archive " + label + "?\n\nIt becomes inactive for new assignments. Historical references and media are kept; it can be restored.")) {
        return;
      }
      var api = window.COPDoc && COPDoc.officers;
      var saved = api && api.archiveRecord ? api.archiveRecord(kind, id) : { ok: false, error: "Admin lifecycle is unavailable." };
      if (!saved.ok) { setStatus(saved.error); return; }
      adoptDisk();
      setStatus(label + " archived; historical links retained.", true);
      paint();
    });
    return btn;
  }

  function restoreButton(kind, id) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "action-button-secondary compact";
    btn.textContent = "Restore";
    btn.addEventListener("click", function () {
      var fresh = adoptDisk();
      if (!fresh.ok) {
        setStatus(fresh.error);
        return;
      }
      var row = recordFor(kind, id);
      if (!row) {
        paint();
        return;
      }
      var api = window.COPDoc && COPDoc.officers;
      var restored = api && api.restoreRecord ? api.restoreRecord(kind, id) : { ok: false, error: "Admin lifecycle is unavailable." };
      if (!restored.ok) { setStatus(restored.error); return; }
      adoptDisk();
      setStatus(recordLabel(kind, row) + " restored.", true);
      paint();
    });
    return btn;
  }

  function deleteRecordButton(kind, id) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "action-button-danger compact";
    btn.textContent = "Delete record";
    btn.addEventListener("click", async function () {
      var fresh = adoptDisk();
      if (!fresh.ok) {
        setStatus(fresh.error);
        return;
      }
      var row = recordFor(kind, id);
      if (!row || !rowJunked(row)) {
        setStatus("Archive the unused draft before permanent deletion.");
        paint();
        return;
      }
      var api = window.COPDoc && COPDoc.officers;
      if (!api || !api.inspectDependencies || !api.deleteDraft) { setStatus("Admin lifecycle is unavailable."); return; }
      var inspection = await api.inspectDependencies(kind, id);
      if (!inspection.ok) { setStatus(inspection.error); return; }
      var refs = inspection.references;
      if (refs.length) {
        setStatus(
          "Delete blocked: " + refs.map(function (item) { return item.label; }).join("; ")
        );
        window.alert(
          "Delete record is blocked until these references are removed:\n\n" +
            refs.map(function (item) { return "• " + item.label; }).join("\n")
        );
        return;
      }
      var label = recordLabel(kind, row);
      var typed = window.prompt(
        "Permanent deletion cannot be undone. Type this record name exactly to continue:\n\n" + label
      );
      if (typed !== label) {
        setStatus("Permanent delete cancelled; the name did not match.");
        return;
      }
      var deleted = await api.deleteDraft(kind, id);
      if (!deleted.ok) { setStatus(deleted.error); return; }
      adoptDisk();
      setStatus(label + " permanently deleted.", true);
      paint();
    });
    return btn;
  }

  function sortRecords(rows) {
    return rows.slice().sort(function (a, b) {
      var ja = rowJunked(a) ? 1 : 0;
      var jb = rowJunked(b) ? 1 : 0;
      if (ja !== jb) {
        return ja - jb;
      }
      var da = rowCommitted(a) ? 1 : 0;
      var db = rowCommitted(b) ? 1 : 0;
      if (da !== db) {
        return da - db;
      }
      var ua = (a.meta && a.meta.updatedAt) || "";
      var ub = (b.meta && b.meta.updatedAt) || "";
      return String(ub).localeCompare(String(ua));
    });
  }

  function filteredRecords(kind) {
    var rows = state[kind] || [];
    if (recordFilter === "junk") {
      rows = rows.filter(rowJunked);
    } else if (recordFilter === "draft") {
      rows = rows.filter(function (row) {
        return rowActive(row) && !rowCommitted(row);
      });
    } else if (recordFilter === "committed") {
      rows = rows.filter(function (row) {
        return rowActive(row) && rowCommitted(row);
      });
    } else {
      rows = rows.filter(rowActive);
    }
    return sortRecords(rows);
  }

  function paintTable(kind, bodyId, emptyId, wrapId, columns) {
    var body = byId(bodyId);
    var empty = byId(emptyId);
    var wrap = byId(wrapId);
    if (!body) {
      return;
    }
    var all = state[kind] || [];
    var rows = filteredRecords(kind);
    body.replaceChildren();
    empty.hidden = rows.length > 0;
    wrap.hidden = rows.length === 0;
    if (empty) {
      if (!all.length) {
        empty.textContent =
          kind === "officers" ? "No officers yet." : "No vehicles yet.";
      } else if (!rows.length) {
        empty.textContent = "No matching records.";
      }
    }
    rows.forEach(function (row) {
      var tr = document.createElement("tr");
      columns.forEach(function (col, index) {
        var td = document.createElement("td");
        td.textContent = col(row);
        if (index === 0 && (!rowCommitted(row) || rowJunked(row))) {
          var badge = document.createElement("span");
          badge.className = rowJunked(row)
            ? "record-status record-status-junk"
            : "record-status record-status-draft";
          badge.textContent = rowJunked(row) ? "Junk" : "Working";
          td.appendChild(document.createTextNode(" "));
          td.appendChild(badge);
        }
        tr.appendChild(td);
      });
      var actions = document.createElement("td");
      var rowActions = document.createElement("div");
      rowActions.className = "record-actions";
      var link = document.createElement("a");
      link.className = "action-button-secondary compact";
      if (kind === "officers") {
        if (rowCommitted(row)) {
          link.href = "officer.html?id=" + encodeURIComponent(row.id);
          link.textContent = "View";
        } else {
          link.href = "officer-form.html?id=" + encodeURIComponent(row.id);
          link.textContent = "Edit";
        }
        rowActions.appendChild(link);
      } else if (kind === "vehicles") {
        if (rowCommitted(row)) {
          link.href = "vehicle.html?id=" + encodeURIComponent(row.id);
          link.textContent = "View";
        } else {
          link.href = "vehicle-form.html?id=" + encodeURIComponent(row.id);
          link.textContent = "Edit";
        }
        rowActions.appendChild(link);
      }
      if (matchingShifts(kind, row.id).length) {
        rowActions.appendChild(removeFromScheduleButton(kind, row.id));
      }
      if (rowJunked(row)) {
        rowActions.appendChild(restoreButton(kind, row.id));
        rowActions.appendChild(deleteRecordButton(kind, row.id));
      } else {
        rowActions.appendChild(archiveButton(kind, row.id));
      }
      actions.appendChild(rowActions);
      tr.appendChild(actions);
      body.appendChild(tr);
    });
  }

  function paintPreview(listId, noteId, rows, lineFn, metaFn, emptyText, noteText) {
    var list = byId(listId);
    var note = byId(noteId);
    if (!list) {
      return;
    }
    list.replaceChildren();
    if (note) {
      note.textContent = rows.length ? noteText : emptyText;
    }
    rows.slice(0, 6).forEach(function (row) {
      var li = document.createElement("li");
      var name = document.createElement("span");
      name.textContent = lineFn(row);
      var meta = document.createElement("span");
      meta.className = "dash-meta";
      meta.textContent = metaFn(row);
      li.appendChild(name);
      li.appendChild(meta);
      list.appendChild(li);
    });
  }

  function paintDashboard() {
    var officers = state.officers.filter(function (row) {
      return rowActive(row) && rowCommitted(row);
    });
    var available = officers.filter(function (row) {
      return row.duty === "available";
    });
    paintPreview(
      "officerPreview",
      "officerDashNote",
      officers,
      officerName,
      function (row) {
        return DUTY_LABELS[row.duty] || row.duty;
      },
      "No officers on the roster.",
      officers.length +
        " on roster · " +
        available.length +
        " available"
    );
    var vehicles = state.vehicles.filter(function (row) {
      return rowActive(row) && rowCommitted(row);
    });
    var openVehicles = vehicles.filter(function (row) {
      return row.status === "available";
    });
    paintPreview(
      "vehiclePreview",
      "vehicleDashNote",
      vehicles,
      vehicleLabel,
      function (row) {
        return VEHICLE_STATUS[row.status] || row.status;
      },
      "No vehicles on the lot.",
      vehicles.length +
        " on the lot · " +
        openVehicles.length +
        " available"
    );
  }

  function paintWeek() {
    var grid = byId("weekGrid");
    if (!grid) {
      return;
    }
    var label = byId("scheduleWeekLabel");
    var start = startOfWeek(new Date());
    var names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    var end = new Date(start);
    end.setDate(end.getDate() + 6);
    if (label) {
      label.textContent =
        "Week of " +
        start.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric"
        }) +
        " – " +
        end.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric"
        });
    }
    grid.replaceChildren();
    var i;
    for (i = 0; i < 7; i++) {
      var day = new Date(start);
      day.setDate(start.getDate() + i);
      var key = isoDate(day);
      var cell = document.createElement("div");
      cell.className = "week-day";
      var name = document.createElement("span");
      name.className = "week-day-name";
      name.textContent = names[i];
      var dateEl = document.createElement("span");
      dateEl.className = "week-day-date";
      dateEl.textContent = day.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric"
      });
      cell.appendChild(name);
      cell.appendChild(dateEl);
      var dayShifts = state.shifts.filter(function (shift) {
        return shift.date === key;
      });
      if (!dayShifts.length) {
        var empty = document.createElement("p");
        empty.className = "week-empty";
        empty.textContent = "—";
        cell.appendChild(empty);
      } else {
        dayShifts.forEach(function (shift) {
          var officer = findOfficer(shift.officerId);
          var block = document.createElement("div");
          block.className = "week-shift";
          block.textContent =
            (officer ? officer.callSign || officerName(officer) : "Open") +
            " " +
            shift.start +
            "–" +
            shift.end;
          cell.appendChild(block);
        });
      }
      grid.appendChild(cell);
    }
  }

  function paintShiftsTable() {
    if (!byId("shiftsBody")) {
      return;
    }
    var start = startOfWeek(new Date());
    var end = new Date(start);
    end.setDate(end.getDate() + 7);
    var weekShifts = state.shifts
      .filter(function (shift) {
        var t = Date.parse(shift.date + "T00:00:00");
        return t >= start.getTime() && t < end.getTime();
      })
      .sort(function (a, b) {
        return String(a.date + a.start).localeCompare(b.date + b.start);
      });
    var body = byId("shiftsBody");
    var empty = byId("shiftsEmpty");
    var wrap = byId("shiftsTableWrap");
    body.replaceChildren();
    empty.hidden = weekShifts.length > 0;
    wrap.hidden = weekShifts.length === 0;
    weekShifts.forEach(function (shift) {
      var officer = findOfficer(shift.officerId);
      var vehicle = findVehicle(shift.vehicleId);
      var tr = document.createElement("tr");
      [
        shift.date,
        officerName(officer) || "—",
        vehicleLabel(vehicle) || "—",
        shift.start + "–" + shift.end,
        ASSIGN_LABELS[shift.assignment] || shift.assignment
      ].forEach(function (text) {
        var td = document.createElement("td");
        td.textContent = text;
        tr.appendChild(td);
      });
      var actions = document.createElement("td");
      actions.appendChild(shiftRemoveButton(shift));
      tr.appendChild(actions);
      body.appendChild(tr);
    });
  }

  var todayRoster = null;

  function mountTodayArrests() {
    var host = byId("arrestRosterHost");
    if (!host || !window.COPDoc || !COPDoc.arrestRoster) {
      return;
    }
    if (!todayRoster) {
      todayRoster = COPDoc.arrestRoster.mount(host, {
        defaultToday: true,
        showGenerate: true
      });
    } else if (todayRoster.refresh) {
      todayRoster.refresh();
    }
  }

  function paint() {
    paintStats();
    paintDashboard();
    paintPickers();
    if (byId("officersBody")) {
      paintTable("officers", "officersBody", "officersEmpty", "officersTableWrap", [
        function (row) {
          return row.lastName || "—";
        },
        function (row) {
          if (window.COPDoc && COPDoc.model && COPDoc.model.officerCity) {
            return COPDoc.model.officerCity(row) || "—";
          }
          return (row.address && row.address.city) || "—";
        },
        function (row) {
          return DUTY_LABELS[row.duty] || row.duty || "—";
        },
        function (row) {
          return formatEod(row.eod);
        },
        function (row) {
          return ROLE_LABELS[row.role] || row.role || "—";
        }
      ]);
    }
    if (byId("vehiclesBody")) {
      paintTable("vehicles", "vehiclesBody", "vehiclesEmpty", "vehiclesTableWrap", [
        function (row) {
          return row.unit || "—";
        },
        function (row) {
          return vehiclePlate(row) || "—";
        },
        function (row) {
          return assignedOfficerNames(row.assignedOfficerIds);
        },
        function (row) {
          return VEHICLE_STATUS[row.status] || row.status || "—";
        }
      ]);
    }
    paintWeek();
    paintShiftsTable();
    mountTodayArrests();
    if (adminPage() === "officer-view") {
      paintOfficerView(queryParam("id"));
    }
    if (adminPage() === "vehicle-view") {
      paintVehicleView(queryParam("id"));
    }
  }

  function setViewText(id, value) {
    var el = byId(id);
    if (el) {
      el.textContent = displayOrDash(value);
    }
  }

  function officerPickerHref(ownerType, objectId, officerId) {
    if (!objectId) {
      return "";
    }
    var ret = officerId
      ? "officer.html?id=" + encodeURIComponent(officerId)
      : "officer.html";
    return (
      "photo-picker.html?ownerType=" +
      encodeURIComponent(ownerType) +
      "&id=" +
      encodeURIComponent(objectId) +
      "&return=" +
      encodeURIComponent(ret)
    );
  }

  function parseCoordPair(lat, lng) {
    var y = Number(lat);
    var x = Number(lng);
    if (!isFinite(y) || !isFinite(x)) {
      return null;
    }
    if (y === 0 && x === 0) {
      return null;
    }
    if (y < -90 || y > 90 || x < -180 || x > 180) {
      return null;
    }
    return [y, x];
  }

  function officerPlaceKind(loc) {
    var assoc = String(
      (loc && (loc.association || loc.locationAssociation || loc.kind)) || ""
    ).toLowerCase();
    if (assoc === "work" || assoc === "office") {
      return "work";
    }
    return "home";
  }

  function officerPlaceTitle(loc) {
    var assoc = String(
      (loc && (loc.association || loc.locationAssociation || loc.kind)) || ""
    ).trim();
    if (ADDR_KIND_LABELS[assoc]) {
      return ADDR_KIND_LABELS[assoc];
    }
    return officerPlaceKind(loc) === "work" ? "Work" : "Home";
  }

  function collectOfficerPlaces(row) {
    var places = [];
    var seen = {};
    function pushLoc(loc) {
      if (!loc) {
        return;
      }
      var addr = formatAddressLine(loc);
      if (addr === "—") {
        addr = "";
      }
      var pair = parseCoordPair(loc.latitude, loc.longitude);
      if (!addr && !pair) {
        return;
      }
      var key = (loc.locationId || "") + "|" + addr;
      if (seen[key]) {
        return;
      }
      seen[key] = true;
      var kind = officerPlaceKind(loc);
      var photoOwners = [];
      if (loc.locationId) {
        photoOwners.push({ type: "LOCATION", id: loc.locationId });
      }
      if (row.officerId || row.id) {
        photoOwners.push({ type: "OFFICER", id: row.officerId || row.id });
      }
      places.push({
        id: loc.locationId || "ofc-place-" + places.length,
        kind: kind,
        title: officerPlaceTitle(loc),
        address: addr,
        extra: TARGET_LABELS[loc.targetPriority] || "",
        meta: [TARGET_LABELS[loc.targetPriority] || "", addr]
          .filter(Boolean)
          .join(" · "),
        lat: pair ? pair[0] : "",
        lng: pair ? pair[1] : "",
        mapped: !!pair,
        loc: loc,
        pinColor: loc.pinColor || "",
        photoOwners: photoOwners,
        objectPhotoOwners: loc.locationId
          ? [{ type: "LOCATION", id: loc.locationId }]
          : [],
        personPhotoOwners: row.officerId || row.id
          ? [{ type: "OFFICER", id: row.officerId || row.id }]
          : []
      });
    }
    (row.locations || []).forEach(pushLoc);
    if (!places.length) {
      var address =
        window.COPDoc && COPDoc.model && COPDoc.model.officerAddress
          ? COPDoc.model.officerAddress(row)
          : row.address || {};
      pushLoc(address);
    }
    return places;
  }

  function appendOfficerFact(host, label, value) {
    var text = String(value == null ? "" : value).trim();
    if (!text || text === "—") {
      return;
    }
    var row = document.createElement("div");
    row.className = "snapshot-fact";
    var dt = document.createElement("span");
    dt.className = "snapshot-label";
    dt.textContent = label;
    var dd = document.createElement("span");
    dd.className = "snapshot-value";
    dd.textContent = text;
    row.appendChild(dt);
    row.appendChild(dd);
    host.appendChild(row);
  }

  function paintOfficerFacts(row) {
    var host = byId("officerSnapshotFacts");
    if (!host) {
      return;
    }
    host.replaceChildren();
    appendOfficerFact(host, "Name", officerName(row));
    appendOfficerFact(host, "Badge", row.badge);
    appendOfficerFact(host, "Call sign", row.callSign);
    appendOfficerFact(host, "Team", row.team);
    appendOfficerFact(host, "Duty", DUTY_LABELS[row.duty] || row.duty);
    appendOfficerFact(host, "Role", ROLE_LABELS[row.role] || row.role);
    var eod = formatEod(row.eod);
    appendOfficerFact(host, "EOD", eod === "—" ? "" : eod);
    appendOfficerFact(host, "Gov phone", row.phoneGov);
    appendOfficerFact(host, "Private phone", row.phonePrivate);
  }

  function paintOfficerObjectCard(list, options) {
    options = options || {};
    var card = document.createElement("article");
    card.className = "case-object-card";
    var photo = document.createElement("div");
    photo.className = "case-object-photo media-block";
    var body = document.createElement("div");
    body.className = "case-object-body";
    var title = document.createElement("strong");
    title.textContent = options.title || "—";
    var meta = document.createElement("p");
    meta.className = "section-note";
    meta.textContent = options.meta || "";
    body.appendChild(title);
    body.appendChild(meta);
    card.appendChild(photo);
    card.appendChild(body);
    list.appendChild(card);
    if (window.COPDoc && COPDoc.mediaCard && options.owner && options.owner.id) {
      COPDoc.mediaCard.mount(photo, {
        owner: options.owner,
        compact: true,
        hideWhenEmpty: false,
        photoTitle: "",
        pickerHref: options.pickerHref || ""
      });
    } else {
      var empty = document.createElement("div");
      empty.className = "media-photo-placeholder";
      empty.innerHTML =
        '<span class="fow-photo-placeholder-mark" aria-hidden="true"></span><strong>No photo</strong>';
      photo.appendChild(empty);
    }
  }

  function paintOfficerLocations(row) {
    var list = byId("officerLocations");
    var empty = byId("officerLocationsEmpty");
    var card = byId("officerLocationsCard");
    if (!list) {
      return;
    }
    var places = collectOfficerPlaces(row);
    list.replaceChildren();
    if (!places.length) {
      if (empty) {
        empty.hidden = false;
      }
      list.hidden = true;
      if (card) {
        card.hidden = false;
      }
      return;
    }
    if (empty) {
      empty.hidden = true;
    }
    list.hidden = false;
    if (card) {
      card.hidden = false;
    }
    places.forEach(function (place) {
      var locId = (place.loc && place.loc.locationId) || "";
      var title = place.address || place.title;
      var metaBits = [place.title, place.extra].filter(function (bit) {
        return bit && bit !== title;
      });
      paintOfficerObjectCard(list, {
        title: title,
        meta: metaBits.join(" · "),
        owner: locId ? { type: "LOCATION", id: locId } : null,
        pickerHref: officerPickerHref("LOCATION", locId, row.id)
      });
    });
  }

  function paintOfficerCaseMap(row) {
    var card = byId("officerCaseMapCard");
    var host = byId("officerCaseMap");
    var empty = byId("officerCaseMapEmpty");
    var legend = byId("officerCaseMapLegend");
    var list = byId("officerCaseMapList");
    if (!card || !host) {
      return;
    }
    var places = collectOfficerPlaces(row);
    var mapped = places.filter(function (place) {
      return place.mapped;
    });
    card.hidden = false;
    if (!places.length) {
      host.hidden = true;
      if (legend) {
        legend.hidden = true;
      }
      if (empty) {
        empty.hidden = false;
      }
      return;
    }
    if (empty) {
      empty.hidden = true;
    }
    if (legend && list) {
      legend.hidden = false;
      list.replaceChildren();
      places.forEach(function (place) {
        var item = document.createElement("li");
        item.className = "case-map-list-item is-" + place.kind;
        if (place.mapped) {
          item.classList.add("is-mapped");
        }
        var kind = document.createElement("span");
        var mapApi = window.COPDoc && COPDoc.locationMap;
        var key =
          mapApi && mapApi.safeKind ? mapApi.safeKind(place.kind) : place.kind;
        var markerColor =
          mapApi && typeof mapApi.pinColorFor === "function"
            ? mapApi.pinColorFor(key, place)
            : "";
        kind.className = "case-map-key-marker is-" + key;
        if (mapApi && typeof mapApi.kindMarkerHtml === "function") {
          kind.innerHTML = mapApi.kindMarkerHtml(key, {
            color: markerColor,
            size: "compact"
          });
        } else if (mapApi && typeof mapApi.kindIconHtml === "function") {
          kind.className = "case-map-key-icon is-" + key;
          if (markerColor) {
            kind.style.color = markerColor;
          }
          kind.innerHTML = mapApi.kindIconHtml(key);
        }
        var body = document.createElement("div");
        var label = document.createElement("strong");
        label.textContent = place.title;
        var addr = document.createElement("span");
        addr.textContent = place.address || "No address";
        body.appendChild(label);
        body.appendChild(addr);
        item.appendChild(kind);
        item.appendChild(body);
        if (place.mapped) {
          item.tabIndex = 0;
          item.setAttribute("role", "button");
          item.addEventListener("click", function () {
            if (window.COPDoc && COPDoc.locationMap && COPDoc.locationMap.focus) {
              COPDoc.locationMap.focus(host, place.id);
            }
          });
          item.addEventListener("keydown", function (event) {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              item.click();
            }
          });
        }
        list.appendChild(item);
      });
    }
    if (!mapped.length) {
      host.hidden = true;
      return;
    }
    host.hidden = false;
    if (window.COPDoc && COPDoc.locationMap && COPDoc.locationMap.displayMany) {
      COPDoc.locationMap.displayMany(host, mapped);
    }
  }

  function paintOfficerView(id) {
    var row = findOfficer(id);
    var missing = byId("officerMissing");
    var snap = byId("officerSnapshot");
    var edit = chromePrimary();
    var mapCard = byId("officerCaseMapCard");
    var locCard = byId("officerLocationsCard");
    var qualsCard = byId("officerQualsCard");
    var equipCard = byId("officerEquipCard");
    function hideExtras(hide) {
      if (mapCard) {
        mapCard.hidden = hide;
      }
      if (locCard) {
        locCard.hidden = hide;
      }
      if (qualsCard) {
        qualsCard.hidden = hide;
      }
      if (equipCard) {
        equipCard.hidden = hide;
      }
    }
    if (!row) {
      if (missing) {
        missing.hidden = false;
      }
      if (snap) {
        snap.hidden = true;
      }
      if (edit) {
        edit.hidden = true;
      }
      hideExtras(true);
      setStatus("Officer not found.");
      return;
    }
    if (missing) {
      missing.hidden = true;
    }
    if (snap) {
      snap.hidden = false;
    }
    if (edit) {
      edit.hidden = false;
      edit.href = "officer-form.html?id=" + encodeURIComponent(row.id);
    }
    hideExtras(false);
    if (byId("officerViewTitle")) {
      byId("officerViewTitle").textContent = officerName(row) || "Officer";
    }
    document.title = (officerName(row) || "Officer") + " — COPDoc";
    paintOfficerFacts(row);
    if (window.COPDoc && COPDoc.mediaCard && row.id) {
      COPDoc.mediaCard.mount(byId("officerMedia"), {
        owner: { type: "OFFICER", id: row.id },
        photoTitle: "Photo",
        fileTitle: "Files",
        pickerHref: officerPickerHref("OFFICER", row.id, row.id),
        filesHost: byId("officerSnapshotFiles"),
        showEmptyFiles: false,
        thumbs: false
      });
    }
    paintOfficerCaseMap(row);
    paintOfficerLocations(row);
    var quals = labeledList(row.qualifications, QUAL_LABELS);
    if (row.qualOther) {
      quals = quals === "—" ? row.qualOther : quals + "; " + row.qualOther;
    }
    if (byId("viewQuals")) {
      byId("viewQuals").textContent = quals;
    }
    if (qualsCard) {
      qualsCard.hidden = quals === "—";
    }
    var equip = labeledList(row.equipment, EQUIP_LABELS);
    if (byId("viewEquip")) {
      byId("viewEquip").textContent = equip;
    }
    if (byId("viewEquipNotes")) {
      byId("viewEquipNotes").textContent = row.equipNotes || "";
    }
    if (equipCard) {
      equipCard.hidden = equip === "—" && !row.equipNotes;
    }
  }

  function paintVehicleView(id) {
    var row = findVehicle(id);
    var missing = byId("vehicleMissing");
    var snap = byId("vehicleSnapshot");
    var edit = chromePrimary();
    if (!row) {
      if (missing) {
        missing.hidden = false;
      }
      if (snap) {
        snap.hidden = true;
      }
      if (edit) {
        edit.hidden = true;
      }
      setStatus("Vehicle not found.");
      return;
    }
    if (missing) {
      missing.hidden = true;
    }
    if (snap) {
      snap.hidden = false;
    }
    if (edit) {
      edit.hidden = false;
      edit.href = "vehicle-form.html?id=" + encodeURIComponent(row.id);
    }
    var plate = vehiclePlate(row);
    var plateLine = [plate, row.plateState].filter(Boolean).join(" · ");
    if (byId("vehicleViewTitle")) {
      byId("vehicleViewTitle").textContent =
        row.unit || plateLine || "Vehicle";
    }
    setViewText("viewPlate", plateLine);
    setViewText(
      "viewYearColor",
      [row.vehicleYear, row.vehicleColor].filter(Boolean).join(" · ")
    );
    setViewText(
      "viewMakeModel",
      [row.vehicleMake, row.vehicleModel, row.vehicleBodyStyle]
        .filter(Boolean)
        .join(" · ")
    );
    setViewText("viewVin", row.vin);
    setViewText("viewUnit", row.unit);
    setViewText("viewStatus", VEHICLE_STATUS[row.status] || row.status);
    setViewText("viewBarcode", row.barcode);
    setViewText("viewDriverNumber", row.driverNumber);
    setViewText(
      "viewAssigned",
      assignedOfficerNames(row.assignedOfficerIds)
    );
    setViewText(
      "viewVehicleEquip",
      labeledList(row.equipment, VEHICLE_EQUIP_LABELS)
    );
    if (window.COPDoc && COPDoc.mediaCard && row.id) {
      COPDoc.mediaCard.mount(byId("vehicleMedia"), {
        owner: { type: "VEHICLE", id: row.id }
      });
    }
  }

  function paintAdminFormMediaLinks(kind, id) {
    var isOfficer = kind === "officer";
    var wrap = byId(isOfficer ? "officerFormMediaLinks" : "vehicleFormMediaLinks");
    var photo = byId(isOfficer ? "officerFormAddPhoto" : "vehicleFormAddPhoto");
    var file = byId(isOfficer ? "officerFormAddFile" : "vehicleFormAddFile");
    var host = byId(isOfficer ? "officerFormPhoto" : "vehicleFormPhoto");
    if (!photo || !file) {
      return;
    }
    if (!id) {
      if (wrap) {
        wrap.hidden = true;
      }
      if (host && window.COPDoc && COPDoc.mediaCard) {
        COPDoc.mediaCard.unmount(host);
      }
      return;
    }
    if (wrap) {
      wrap.hidden = false;
    }
    var page = isOfficer ? "officer-form.html" : "vehicle-form.html";
    var ret = page + "?id=" + encodeURIComponent(id);
    var ownerType = isOfficer ? "OFFICER" : "VEHICLE";
    var q =
      "ownerType=" +
      ownerType +
      "&id=" +
      encodeURIComponent(id) +
      "&return=" +
      encodeURIComponent(ret);
    photo.href = "photo-picker.html?" + q;
    file.href = "file-upload.html?" + q;
    if (!host && wrap) {
      host = document.createElement("div");
      host.id = isOfficer ? "officerFormPhoto" : "vehicleFormPhoto";
      host.className = "card-media-thumb";
      host.setAttribute("data-card-photo", "");
      wrap.insertBefore(host, wrap.firstChild);
      wrap.classList.add("card-media-row");
      var formCard = wrap.closest("fieldset");
      var legend = formCard && formCard.querySelector(":scope > legend");
      if (legend && wrap.previousElementSibling !== legend) {
        legend.after(wrap);
      }
    }
    if (host && window.COPDoc && COPDoc.mediaCard) {
      COPDoc.mediaCard.mount(host, {
        owner: { type: ownerType, id: id },
        compact: true,
        pickerHref: photo.href,
        photoTitle: "",
        committedOnly: false
      });
    }
  }

  function fillOfficerForm(id) {
    var row = state.officers.filter(function (item) {
      return item.id === id;
    })[0];
    if (!row) {
      return;
    }
    editingOfficerId = id;
    editingOfficerBaseline = JSON.parse(JSON.stringify(row));
    setVal("officerLastName", row.lastName);
    setVal("officerFirstName", row.firstName);
    setVal("officerMiddleName", row.middleName);
    setVal("officerBadge", row.badge);
    setVal("officerCallSign", row.callSign);
    setVal("officerDuty", row.duty || "available");
    setVal("officerRole", row.role || "");
    setVal("officerTeam", row.team);
    setVal("officerEod", row.eod);
    setVal("officerPhoneGov", row.phoneGov);
    setVal("officerPhonePrivate", row.phonePrivate);
    fillOfficerAddress(
      window.COPDoc && COPDoc.model && COPDoc.model.officerAddress
        ? COPDoc.model.officerAddress(row)
        : row.address || {}
    );
    setCheckedValues("officerQual", row.qualifications);
    setVal("officerQualOther", row.qualOther);
    setCheckedValues("officerEquip", row.equipment);
    setVal("officerEquipNotes", row.equipNotes);
    if (typeof formatNameFieldValue === "function") {
      formatNameFieldValue(byId("officerLastName"));
      formatNameFieldValue(byId("officerFirstName"));
    }
    if (typeof formatPhone === "function") {
      setVal("officerPhoneGov", formatPhone(row.phoneGov));
      setVal("officerPhonePrivate", formatPhone(row.phonePrivate));
    }
    rememberOfficerSignature();
    paintAdminFormMediaLinks("officer", id);
    byId("officerLastName").focus();
  }

  function fillVehicleForm(id) {
    var row = findVehicle(id);
    if (!row || !vehicleCardEl()) {
      return;
    }
    editingVehicleId = id;
    editingVehicleBaseline = JSON.parse(JSON.stringify(row));
    vSet("licensePlate", row.licensePlate || row.plate);
    if (typeof formatLicensePlate === "function") {
      formatLicensePlate(vField("licensePlate"));
    }
    setVehicleSelect("plateState", row.plateState);
    setVehicleSelect("vehicleYear", row.vehicleYear);
    setVehicleSelect("vehicleColor", row.vehicleColor);
    setVehicleSelect("vehicleMake", row.vehicleMake);
    dispatchChange(vField("vehicleMake"));
    setVehicleSelect("vehicleModel", row.vehicleModel);
    dispatchChange(vField("vehicleModel"));
    setVehicleSelect("vehicleBodyStyle", row.vehicleBodyStyle);
    vSet("vin", row.vin);
    setVal("vehicleUnit", row.unit);
    setVal("vehicleStatus", row.status || "available");
    setVal("vehicleBarcode", row.barcode);
    setVal("vehicleDriverNumber", row.driverNumber);
    setAssignedOfficers(row.assignedOfficerIds || []);
    setCheckedValues("vehicleEquip", row.equipment || []);
    if (byId("addVehicleButton")) {
      byId("addVehicleButton").textContent = "Save vehicle";
    }
    if (byId("vehicleFormLegend")) {
      byId("vehicleFormLegend").textContent = "Edit vehicle";
    }
    paintAdminFormMediaLinks("vehicle", id);
    var focusEl = byId("licensePlate") || byId("vehicleUnit");
    if (focusEl) {
      focusEl.focus();
    }
  }

  function clearOfficerForm() {
    editingOfficerId = "";
    editingOfficerBaseline = null;
    paintAdminFormMediaLinks("officer", "");
    [
      "officerLastName",
      "officerFirstName",
      "officerMiddleName",
      "officerBadge",
      "officerCallSign",
      "officerEod",
      "officerPhoneGov",
      "officerPhonePrivate",
      "officerQualOther",
      "officerEquipNotes"
    ].forEach(function (id) {
      setVal(id, "");
    });
    setVal("officerDuty", "available");
    setVal("officerRole", "");
    fillOfficerAddress({});
    setCheckedValues("officerQual", []);
    setCheckedValues("officerEquip", []);
    if (byId("addOfficerButton")) {
      byId("addOfficerButton").textContent = "Add officer";
    }
  }

  function clearVehicleForm() {
    editingVehicleId = "";
    editingVehicleBaseline = null;
    paintAdminFormMediaLinks("vehicle", "");
    [
      "licensePlate",
      "plateState",
      "vehicleYear",
      "vehicleColor",
      "vehicleMake",
      "vin"
    ].forEach(function (name) {
      vSet(name, "");
    });
    dispatchChange(vField("vehicleMake"));
    vSet("vehicleModel", "");
    dispatchChange(vField("vehicleModel"));
    vSet("vehicleBodyStyle", "");
    setVal("vehicleUnit", "");
    setVal("vehicleBarcode", "");
    setVal("vehicleDriverNumber", "");
    setVal("vehicleStatus", "available");
    setAssignedOfficers([]);
    setCheckedValues("vehicleEquip", []);
    if (byId("addVehicleButton")) {
      byId("addVehicleButton").textContent = "Add vehicle";
    }
    if (byId("vehicleFormLegend")) {
      byId("vehicleFormLegend").textContent = "Vehicle";
    }
  }

  function officerFormSignature() {
    var parts = [];
    var root = document.querySelector(".page-wide") || document;
    root.querySelectorAll("input, select, textarea").forEach(function (el) {
      if (el.dataset.recordIgnore === "true") {
        return;
      }
      if (
        el.matches(
          'input[type="button"], input[type="submit"], input[type="file"], input[type="hidden"], button'
        )
      ) {
        return;
      }
      var type = (el.type || "").toLowerCase();
      if (type === "checkbox" || type === "radio") {
        parts.push(el.name + ":" + el.value + "=" + (el.checked ? "1" : "0"));
      } else {
        parts.push((el.id || el.name || "") + "=" + String(el.value || ""));
      }
    });
    return parts.join("\n");
  }

  function rememberOfficerSignature() {
    if (officerAuto) {
      officerAuto.remember();
    }
  }

  function vehicleFormSignature() {
    return officerFormSignature();
  }

  function rememberVehicleSignature() {
    if (vehicleAuto) {
      vehicleAuto.remember();
    }
  }

  function isOfficerAutoSaveField(el) {
    if (!el || !el.matches) {
      return false;
    }
    if (
      el.matches(
        'input[type="button"], input[type="submit"], input[type="file"], button, summary'
      )
    ) {
      return false;
    }
    return el.matches("input, select, textarea");
  }

  function isVehicleAutoSaveField(el) {
    return isOfficerAutoSaveField(el);
  }

  function bindOfficerAutoSave() {
    if (officerAutoSaveBound || adminPage() !== "officer-form") {
      return;
    }
    if (!window.COPDoc || !COPDoc.model || !COPDoc.model.autosave) {
      return;
    }
    officerAutoSaveBound = true;
    officerAuto = COPDoc.model.autosave.bind({
      key: "officer",
      suppressed: function () {
        return suppressOfficerAutoSave;
      },
      isField: isOfficerAutoSaveField,
      signature: officerFormSignature,
      saveDraft: function () {
        addOfficer({ quiet: true });
      }
    });
  }

  function bindVehicleAutoSave() {
    if (adminPage() !== "vehicle-form") {
      return;
    }
    if (!window.COPDoc || !COPDoc.model || !COPDoc.model.autosave) {
      return;
    }
    if (vehicleAuto) {
      return;
    }
    vehicleAuto = COPDoc.model.autosave.bind({
      key: "vehicle",
      suppressed: function () {
        return suppressVehicleAutoSave;
      },
      isField: isVehicleAutoSaveField,
      signature: vehicleFormSignature,
      saveDraft: function () {
        addVehicle({ quiet: true });
      }
    });
  }

  function addOfficer(options) {
    var quiet = Boolean(options && options.quiet);
    var lastName = val("officerLastName");
    var firstName = val("officerFirstName");
    if (!lastName && !firstName && !quiet) {
      setStatus("Enter an officer name.");
      return;
    }
    if (!lastName && !firstName && !editingOfficerId && quiet) {
      return;
    }
    if (typeof validatePhone === "function") {
      var govPhone = validatePhone(val("officerPhoneGov"));
      var privatePhone = validatePhone(val("officerPhonePrivate"));
      if (!govPhone.valid || !privatePhone.valid) {
        if (!quiet) {
          setStatus("Phone needs 10 digits.");
        }
        return;
      }
    }
    if (typeof validateAddress === "function") {
      var rawAddr = readOfficerAddress();
      var anyAddr =
        rawAddr.street ||
        rawAddr.street2 ||
        rawAddr.city ||
        rawAddr.state ||
        rawAddr.zip;
      if (anyAddr) {
        var addrResult = validateAddress({
          street: rawAddr.street,
          street2: rawAddr.street2,
          city: rawAddr.city,
          state: rawAddr.state,
          zip: rawAddr.zip
        });
        if (addrResult.errors && addrResult.errors.length) {
          if (!quiet) {
            setStatus(
              addrResult.errors
                .map(function (error) {
                  return error.message;
                })
                .join(". ")
            );
          }
          return;
        }
        if (addrResult.normalized) {
          fillOfficerAddress(
            Object.assign({}, rawAddr, addrResult.normalized)
          );
        }
      }
    }
    var fresh = adoptDisk();
    if (!fresh.ok) {
      setStatus(fresh.error);
      return;
    }
    var updating = Boolean(editingOfficerId);
    var existing = findOfficer(editingOfficerId) || {};
    var nextId =
      existing.id ||
      existing.officerId ||
      editingOfficerId ||
      (window.COPDoc && COPDoc.model && COPDoc.model.newId
        ? COPDoc.model.newId("ofc")
        : newId("ofc"));
    var payload = {
      officerId: existing.officerId || nextId,
      id: nextId,
      lastName: lastName,
      firstName: firstName,
      middleName: val("officerMiddleName"),
      badge: val("officerBadge"),
      callSign: val("officerCallSign"),
      duty: val("officerDuty") || "available",
      role: val("officerRole"),
      team: val("officerTeam"),
      eod: val("officerEod"),
      phoneGov: val("officerPhoneGov"),
      phonePrivate: val("officerPhonePrivate"),
      address: readOfficerAddress(),
      qualifications: checkedValues("officerQual"),
      qualOther: val("officerQualOther"),
      equipment: checkedValues("officerEquip"),
      equipNotes: val("officerEquipNotes"),
      meta: rowMeta(existing, quiet ? "draft" : "commit")
    };
    var api = window.COPDoc && COPDoc.officers;
    var saved = api && api.saveOfficer ? api.saveOfficer(payload, {
      updateOnly: updating, createOnly: !updating, expectedRecord: editingOfficerBaseline
    }) : { ok: false, error: "The shared officer save workflow is unavailable." };
    if (!saved.ok) { setStatus(saved.error); return; }
    var record = saved.record;
    adoptDisk();
    editingOfficerId = record.id;
    editingOfficerBaseline = JSON.parse(JSON.stringify(record));
    paintAdminFormMediaLinks("officer", record.id);
    rememberOfficerSignature();
    if (byId("addOfficerButton")) {
      byId("addOfficerButton").textContent = "Save officer";
    }
    if (byId("officerFormLegend")) {
      byId("officerFormLegend").textContent = "Edit officer";
    }
    if (quiet) {
      if (window.history && window.history.replaceState) {
        window.history.replaceState(
          {},
          "",
          "officer-form.html?id=" + encodeURIComponent(record.id)
        );
      }
      setStatus("Working copy saved.", true);
      return;
    }
    window.location.href = "officer.html?id=" + encodeURIComponent(record.id);
  }

  function addVehicle(options) {
    var quiet = Boolean(options && options.quiet);
    var unit = val("vehicleUnit");
    var plate = vVal("licensePlate").toUpperCase();
    if (typeof formatLicensePlate === "function") {
      formatLicensePlate(vField("licensePlate"));
      plate = vVal("licensePlate");
    }
    var vin = vVal("vin");
    var make = vVal("vehicleMake");
    if (!unit && !plate && !vin && !make && !quiet) {
      setStatus("Enter a unit, plate, VIN, or make.");
      return;
    }
    if (
      !unit &&
      !plate &&
      !vin &&
      !make &&
      !editingVehicleId &&
      quiet
    ) {
      return;
    }
    var fresh = adoptDisk();
    if (!fresh.ok) {
      setStatus(fresh.error);
      return;
    }
    var existing = findVehicle(editingVehicleId) || {};
    var nextId =
      existing.id ||
      existing.vehicleId ||
      editingVehicleId ||
      (window.COPDoc && COPDoc.model && COPDoc.model.newId
        ? COPDoc.model.newId("veh")
        : newId("veh"));
    var payload = {
      governmentVehicle: true,
      vehicleId: existing.vehicleId || nextId,
      id: nextId,
      unit: unit,
      plate: plate,
      licensePlate: plate,
      plateState: vVal("plateState"),
      vehicleYear: vVal("vehicleYear"),
      vehicleMake: make,
      vehicleModel: vVal("vehicleModel"),
      vehicleColor: vVal("vehicleColor"),
      vehicleBodyStyle: vVal("vehicleBodyStyle"),
      vin: vin,
      status: val("vehicleStatus") || "available",
      barcode: val("vehicleBarcode"),
      driverNumber: val("vehicleDriverNumber"),
      assignedOfficerIds: assignedIdsFromInput(),
      equipment: checkedValues("vehicleEquip"),
      meta: rowMeta(existing, quiet ? "draft" : "commit")
    };
    var api = window.COPDoc && COPDoc.officers;
    var saved = api && api.saveFleetVehicle ? api.saveFleetVehicle(payload, {
      updateOnly: Boolean(editingVehicleId), createOnly: !editingVehicleId, expectedRecord: editingVehicleBaseline
    }) : { ok: false, error: "The shared fleet save workflow is unavailable." };
    if (!saved.ok) { setStatus(saved.error); return; }
    var record = saved.record;
    adoptDisk();
    editingVehicleId = record.id;
    editingVehicleBaseline = JSON.parse(JSON.stringify(record));
    paintAdminFormMediaLinks("vehicle", record.id);
    if (byId("addVehicleButton")) {
      byId("addVehicleButton").textContent = "Save vehicle";
    }
    if (byId("vehicleFormLegend")) {
      byId("vehicleFormLegend").textContent = "Edit vehicle";
    }
    if (quiet) {
      if (window.history && window.history.replaceState) {
        window.history.replaceState(
          {},
          "",
          "vehicle-form.html?id=" + encodeURIComponent(record.id)
        );
      }
      rememberVehicleSignature();
      setStatus("Working copy saved.", true);
      return;
    }
    window.location.href = "vehicle.html?id=" + encodeURIComponent(record.id);
  }

  function officerSearchHay(officer) {
    return [
      officer.lastName,
      officer.firstName,
      officer.middleName,
      officer.badge,
      officer.callSign
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
  }

  function paintAssignOfficerList() {
    var list = byId("assignOfficerList");
    if (!list) {
      return;
    }
    var query = val("assignOfficerSearch").toLowerCase();
    var selected = assignedIdsFromInput();
    var officers = state.officers
      .filter(function (row) {
        return rowActive(row) && rowCommitted(row);
      })
      .filter(function (officer) {
        return !query || officerSearchHay(officer).indexOf(query) !== -1;
      })
      .slice()
      .sort(function (a, b) {
        return officerName(a).localeCompare(officerName(b));
      });
    list.replaceChildren();
    if (!state.officers.some(rowActive)) {
      var empty = document.createElement("p");
      empty.className = "assign-officer-empty";
      empty.textContent = "No officers on the roster.";
      list.appendChild(empty);
      return;
    }
    if (!officers.length) {
      var none = document.createElement("p");
      none.className = "assign-officer-empty";
      none.textContent = "No matching officers.";
      list.appendChild(none);
      return;
    }
    officers.forEach(function (officer) {
      var label = document.createElement("label");
      var box = document.createElement("input");
      box.type = "checkbox";
      box.value = officer.id;
      box.checked = selected.indexOf(officer.id) !== -1;
      var text = document.createElement("span");
      var extra = [officer.badge, officer.callSign].filter(Boolean).join(" · ");
      text.textContent =
        officerName(officer) + (extra ? " (" + extra + ")" : "");
      label.appendChild(box);
      label.appendChild(text);
      list.appendChild(label);
    });
  }

  function bindAssignOfficerDialog() {
    var dialog = byId("assignOfficerDialog");
    var openBtn = byId("assignOfficerButton");
    if (!dialog || !openBtn || openBtn.dataset.assignBound === "true") {
      return;
    }
    openBtn.dataset.assignBound = "true";

    function show() {
      setVal("assignOfficerSearch", "");
      paintAssignOfficerList();
      dialog.hidden = false;
      var search = byId("assignOfficerSearch");
      if (search) {
        search.focus();
      }
    }

    function hide() {
      dialog.hidden = true;
    }

    openBtn.addEventListener("click", show);
    if (byId("assignOfficerCancel")) {
      byId("assignOfficerCancel").addEventListener("click", hide);
    }
    if (byId("assignOfficerOk")) {
      byId("assignOfficerOk").addEventListener("click", function () {
        var visible = [];
        var checked = [];
        dialog.querySelectorAll('input[type="checkbox"]').forEach(function (el) {
          visible.push(el.value);
          if (el.checked) {
            checked.push(el.value);
          }
        });
        assignedIdsFromInput().forEach(function (id) {
          if (visible.indexOf(id) === -1) {
            checked.push(id);
          }
        });
        setAssignedOfficers(checked);
        hide();
      });
    }
    var search = byId("assignOfficerSearch");
    if (search) {
      search.addEventListener("input", paintAssignOfficerList);
    }
    dialog.addEventListener("click", function (event) {
      if (event.target === dialog) {
        hide();
      }
    });
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && !dialog.hidden) {
        hide();
      }
    });
  }

  function addShift() {
    var date = val("shiftDate");
    var officerId = val("shiftOfficer");
    if (!date || !officerId) {
      setStatus("Pick a date and an officer.");
      return;
    }
    var fresh = adoptDisk();
    if (!fresh.ok) {
      setStatus(fresh.error);
      return;
    }
    var officer = findOfficer(officerId);
    var vehicleId = val("shiftVehicle");
    var vehicle = vehicleId ? findVehicle(vehicleId) : null;
    if (!officer || !rowActive(officer) || !rowCommitted(officer) || (vehicleId && (!vehicle || !rowActive(vehicle) || !rowCommitted(vehicle)))) {
      setStatus("New shifts require an active saved officer and fleet vehicle.");
      return;
    }
    var result = adminCommands().addShift({
      date: date,
      officerId: officerId,
      vehicleId: vehicleId,
      start: val("shiftStart") || "06:00",
      end: val("shiftEnd") || "14:00",
      assignment: val("shiftAssignment") || "field"
    });
    if (!acceptCommand(result)) {
      return;
    }
    paint();
    setStatus("Shift added.", true);
  }

  function bind() {
    loadState();
    var today = isoDate(new Date());
    if (byId("shiftDate") && !byId("shiftDate").value) {
      byId("shiftDate").value = today;
    }
    var chromeSave = document.querySelector(
      '#appBarPrimaryAction[data-chrome-action="save"]'
    );
    if (chromeSave && adminPage() === "officer-form") {
      chromeSave.addEventListener("click", addOfficer);
    }
    if (chromeSave && adminPage() === "vehicle-form") {
      chromeSave.addEventListener("click", addVehicle);
    }
    if (byId("officerAddressCard") && typeof bindAddressCardFull === "function") {
      bindAddressCardFull(byId("officerAddressCard"));
    } else if (byId("officerAddressCard") && typeof bindAddressCard === "function") {
      bindAddressCard(byId("officerAddressCard"));
    }
    var callSign = byId("officerCallSign");
    if (callSign && callSign.dataset.callSignBound !== "true") {
      callSign.dataset.callSignBound = "true";
      callSign.addEventListener("input", function () {
        var next = String(callSign.value || "").toUpperCase();
        if (next !== callSign.value) {
          var pos = callSign.selectionStart;
          callSign.value = next;
          if (typeof callSign.setSelectionRange === "function" && pos != null) {
            callSign.setSelectionRange(pos, pos);
          }
        }
      });
    }
    if (vehicleCardEl() && typeof bindVehicleCardFull === "function") {
      bindVehicleCardFull(vehicleCardEl());
    } else if (vehicleCardEl() && typeof bindVehicleCard === "function") {
      bindVehicleCard(vehicleCardEl());
    }
    bindAssignOfficerDialog();
    if (adminPage() === "vehicle-form") {
      setAssignedOfficers(assignedIdsFromInput());
    }
    if (byId("addShiftButton")) {
      byId("addShiftButton").addEventListener("click", addShift);
    }
    bindOfficerAutoSave();
    bindVehicleAutoSave();
    document.querySelectorAll("[data-record-filter]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        recordFilter = btn.getAttribute("data-record-filter") || "all";
        document.querySelectorAll("[data-record-filter]").forEach(function (other) {
          other.setAttribute(
            "aria-pressed",
            other === btn ? "true" : "false"
          );
        });
        paint();
      });
    });
    if (adminPage() === "officer-form" && queryParam("id")) {
      suppressOfficerAutoSave = true;
      editingOfficerId = queryParam("id");
      if (findOfficer(queryParam("id"))) {
        fillOfficerForm(queryParam("id"));
        if (byId("officerFormLegend")) {
          byId("officerFormLegend").textContent = "Edit officer";
        }
      } else {
        setStatus("Officer not found.");
      }
      rememberOfficerSignature();
      suppressOfficerAutoSave = false;
    } else if (adminPage() === "officer-form") {
      rememberOfficerSignature();
    }
    if (adminPage() === "vehicle-form" && queryParam("id")) {
      suppressVehicleAutoSave = true;
      editingVehicleId = queryParam("id");
      if (findVehicle(queryParam("id"))) {
        fillVehicleForm(queryParam("id"));
      } else {
        setStatus("Vehicle not found.");
      }
      rememberVehicleSignature();
      suppressVehicleAutoSave = false;
    } else if (adminPage() === "vehicle-form") {
      rememberVehicleSignature();
    }
    paint();
  }

  if (typeof window !== "undefined" && window.addEventListener) {
    window.addEventListener("storage", function (event) {
      if (event.key !== STORAGE_KEY) {
        return;
      }
      adoptDisk();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bind);
  } else {
    bind();
  }
})();
