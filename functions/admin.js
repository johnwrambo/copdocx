/**
 * Admin hub: officers, vehicles, week schedule, and duty/arrests summary.
 * Stored in localStorage copdoc.admin.v1. Arrest counts read book-in records.
 */
(function () {
  var STORAGE_KEY = "copdoc.admin.v1";
  var BOOKIN_KEY = "alien-book-in.saved-records.v1";
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

  function migrateOfficerRow(row) {
    var dirty = false;
    if (window.COPDoc && COPDoc.model && COPDoc.model.syncOfficerPlaces) {
      var before = JSON.stringify({
        id: row.id,
        officerId: row.officerId,
        address: row.address,
        locations: row.locations
      });
      COPDoc.model.syncOfficerPlaces(row);
      if (
        JSON.stringify({
          id: row.id,
          officerId: row.officerId,
          address: row.address,
          locations: row.locations
        }) !== before
      ) {
        dirty = true;
      }
    } else {
      if (row.id && !row.officerId) {
        row.officerId = row.id;
        dirty = true;
      }
      if (row.officerId && !row.id) {
        row.id = row.officerId;
        dirty = true;
      }
    }
    return dirty;
  }

  function migrateVehicleRow(row) {
    var dirty = false;
    if (row.governmentVehicle !== true) {
      row.governmentVehicle = true;
      dirty = true;
    }
    if (row.id && !row.vehicleId) {
      row.vehicleId = row.id;
      dirty = true;
    }
    if (row.vehicleId && !row.id) {
      row.id = row.vehicleId;
      dirty = true;
    }
    if (row.plate && !row.licensePlate) {
      row.licensePlate = row.plate;
      dirty = true;
    }
    if (row.licensePlate && !row.plate) {
      row.plate = row.licensePlate;
      dirty = true;
    }
    return dirty;
  }

  function migrateAdminList(list, kind) {
    var dirty = false;
    (list || []).forEach(function (row) {
      if (!row.meta || !row.meta.status) {
        dirty = true;
        if (window.COPDoc && COPDoc.model && COPDoc.model.ensureRecordMeta) {
          COPDoc.model.ensureRecordMeta(row);
        } else {
          row.meta = row.meta || {};
          row.meta.status = "committed";
          row.meta.committedAt = row.meta.updatedAt || new Date().toISOString();
        }
      }
      if (kind === "officers" && migrateOfficerRow(row)) {
        dirty = true;
      }
      if (kind === "vehicles" && migrateVehicleRow(row)) {
        dirty = true;
      }
    });
    return dirty;
  }

  function loadState() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return;
      }
      var parsed = JSON.parse(raw);
      state.officers = parsed.officers || [];
      state.vehicles = parsed.vehicles || [];
      state.shifts = parsed.shifts || [];
      var dirty =
        migrateAdminList(state.officers, "officers") ||
        migrateAdminList(state.vehicles, "vehicles");
      if (dirty) {
        saveState();
      }
    } catch (error) {
      state = { officers: [], vehicles: [], shifts: [] };
    }
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
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
    return {
      locationAssociation: cardField("locationAssociation"),
      targetPriority: cardField("targetPriority"),
      parksHere: cardField("parksHere"),
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
    try {
      var raw = localStorage.getItem(BOOKIN_KEY);
      var records = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(records)) {
        return { week: 0, fy: 0 };
      }
      var now = new Date();
      var weekStart = startOfWeek(now);
      var weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 7);
      var fy0 = fyStart(now);
      records.forEach(function (record) {
        var stamp = Date.parse(record.updatedAt || record.createdAt || "");
        if (!isFinite(stamp)) {
          return;
        }
        var when = new Date(stamp);
        if (when >= weekStart && when < weekEnd) {
          week += 1;
        }
        if (when >= fy0 && when <= now) {
          fy += 1;
        }
      });
    } catch (error) {
      return { week: 0, fy: 0 };
    }
    return { week: week, fy: fy };
  }

  function paintStats() {
    if (!byId("statOfficers")) {
      return;
    }
    var officers = state.officers.filter(function (row) {
      return rowCommitted(row) && row.duty === "available";
    }).length;
    var vehicles = state.vehicles.filter(function (row) {
      return rowCommitted(row) && row.status === "available";
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
      state.officers.filter(rowCommitted),
      "Select an officer",
      officerName
    );
    fillSelect(
      byId("shiftVehicle"),
      state.vehicles.filter(rowCommitted),
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

  function removeButton(kind, id) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "action-button-danger compact";
    btn.textContent = "Remove";
    btn.addEventListener("click", function () {
      state[kind] = state[kind].filter(function (row) {
        if (kind === "officers") {
          return row.id !== id && row.officerId !== id;
        }
        if (kind === "vehicles") {
          return row.id !== id && row.vehicleId !== id;
        }
        return row.id !== id;
      });
      if (kind === "officers") {
        state.shifts = state.shifts.filter(function (shift) {
          return shift.officerId !== id;
        });
      }
      if (kind === "vehicles") {
        state.shifts.forEach(function (shift) {
          if (shift.vehicleId === id) {
            shift.vehicleId = "";
          }
        });
      }
      saveState();
      paint();
    });
    return btn;
  }

  function sortRecords(rows) {
    return rows.slice().sort(function (a, b) {
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
    if (recordFilter === "draft") {
      rows = rows.filter(function (row) {
        return !rowCommitted(row);
      });
    } else if (recordFilter === "committed") {
      rows = rows.filter(rowCommitted);
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
        if (index === 0 && !rowCommitted(row)) {
          var badge = document.createElement("span");
          badge.className = "record-status record-status-draft";
          badge.textContent = "Draft";
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
      rowActions.appendChild(removeButton(kind, row.id));
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
    var officers = state.officers.filter(rowCommitted);
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
    var vehicles = state.vehicles.filter(rowCommitted);
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
      actions.appendChild(removeButton("shifts", shift.id));
      tr.appendChild(actions);
      body.appendChild(tr);
    });
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

  function paintOfficerView(id) {
    var row = findOfficer(id);
    var missing = byId("officerMissing");
    var snap = byId("officerSnapshot");
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
    if (byId("officerViewTitle")) {
      byId("officerViewTitle").textContent = officerName(row) || "Officer";
    }
    document.title = (officerName(row) || "Officer") + " — COPDoc";
    setViewText("viewName", officerName(row));
    setViewText("viewBadge", row.badge);
    setViewText("viewCallSign", row.callSign);
    setViewText("viewTeam", row.team);
    setViewText("viewDuty", DUTY_LABELS[row.duty] || row.duty);
    setViewText("viewRole", ROLE_LABELS[row.role] || row.role);
    setViewText("viewEod", formatEod(row.eod) === "—" ? "" : formatEod(row.eod));
    if (byId("viewEod")) {
      byId("viewEod").textContent = formatEod(row.eod);
    }
    setViewText("viewPhoneGov", row.phoneGov);
    setViewText("viewPhonePrivate", row.phonePrivate);
    var address =
      window.COPDoc && COPDoc.model && COPDoc.model.officerAddress
        ? COPDoc.model.officerAddress(row)
        : row.address || {};
    setViewText(
      "viewAddrKind",
      ADDR_KIND_LABELS[address.locationAssociation] ||
        ADDR_KIND_LABELS[address.kind] ||
        address.locationAssociation ||
        address.kind
    );
    setViewText(
      "viewTarget",
      TARGET_LABELS[address.targetPriority] || address.targetPriority
    );
    if (byId("viewAddress")) {
      byId("viewAddress").textContent = formatAddressLine(address);
    }
    if (byId("viewLatLong")) {
      byId("viewLatLong").textContent = displayOrDash(
        address.latLong ||
          (address.latitude && address.longitude
            ? address.latitude + ", " + address.longitude
            : "")
      );
    }
    var quals = labeledList(row.qualifications, QUAL_LABELS);
    if (row.qualOther) {
      quals = quals === "—" ? row.qualOther : quals + "; " + row.qualOther;
    }
    setViewText("viewQuals", quals === "—" ? "" : quals);
    if (byId("viewQuals")) {
      byId("viewQuals").textContent = quals;
    }
    setViewText("viewEquip", labeledList(row.equipment, EQUIP_LABELS));
    if (byId("viewEquipNotes")) {
      byId("viewEquipNotes").textContent = row.equipNotes || "";
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
  }

  function fillOfficerForm(id) {
    var row = state.officers.filter(function (item) {
      return item.id === id;
    })[0];
    if (!row) {
      return;
    }
    editingOfficerId = id;
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
    byId("officerLastName").focus();
  }

  function fillVehicleForm(id) {
    var row = findVehicle(id);
    if (!row || !vehicleCardEl()) {
      return;
    }
    editingVehicleId = id;
    vSet("licensePlate", row.licensePlate || row.plate);
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
    var focusEl = byId("licensePlate") || byId("vehicleUnit");
    if (focusEl) {
      focusEl.focus();
    }
  }

  function clearOfficerForm() {
    editingOfficerId = "";
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
    var record =
      window.COPDoc && COPDoc.model && COPDoc.model.createOfficer
        ? COPDoc.model.createOfficer(Object.assign({}, existing, payload))
        : Object.assign({}, existing, payload);
    if (window.COPDoc && COPDoc.model && COPDoc.model.syncOfficerPlaces) {
      COPDoc.model.syncOfficerPlaces(record);
    }
    if (updating) {
      state.officers = state.officers.map(function (row) {
        return row.id === editingOfficerId || row.officerId === editingOfficerId
          ? record
          : row;
      });
    } else {
      state.officers.push(record);
    }
    editingOfficerId = record.id;
    saveState();
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
      setStatus("Draft saved.", true);
      return;
    }
    window.location.href = "officer.html?id=" + encodeURIComponent(record.id);
  }

  function addVehicle(options) {
    var quiet = Boolean(options && options.quiet);
    var unit = val("vehicleUnit");
    var plate = vVal("licensePlate");
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
    var record =
      window.COPDoc && COPDoc.model && COPDoc.model.createVehicle
        ? COPDoc.model.createVehicle(Object.assign({}, existing, payload))
        : Object.assign({}, existing, payload);
    delete record.registeredOwner;
    delete record.registeredOwnerName;
    delete record.locations;
    record.governmentVehicle = true;
    record.plate = plate;
    record.licensePlate = plate;
    if (editingVehicleId) {
      state.vehicles = state.vehicles.map(function (row) {
        return row.id === editingVehicleId || row.vehicleId === editingVehicleId
          ? record
          : row;
      });
    } else {
      state.vehicles.push(record);
    }
    editingVehicleId = record.id;
    saveState();
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
      setStatus("Draft saved.", true);
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
      .filter(rowCommitted)
      .filter(function (officer) {
        return !query || officerSearchHay(officer).indexOf(query) !== -1;
      })
      .slice()
      .sort(function (a, b) {
        return officerName(a).localeCompare(officerName(b));
      });
    list.replaceChildren();
    if (!state.officers.length) {
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
    state.shifts.push({
      id: newId("sft"),
      date: date,
      officerId: officerId,
      vehicleId: val("shiftVehicle"),
      start: val("shiftStart") || "06:00",
      end: val("shiftEnd") || "14:00",
      assignment: val("shiftAssignment") || "field"
    });
    saveState();
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

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bind);
  } else {
    bind();
  }
})();
