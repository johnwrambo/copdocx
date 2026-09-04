/**
 * Investigation wall: pan/zoom, place, drag, connect.
 * Nodes are the same Person / Vehicle / Location objects and identity
 * cards as the rest of the app (createPerson / createVehicle / createLocation,
 * same data-field names as vehicle-form and location/person cards).
 * Compact title is a collapsed view of that card, not a second schema.
 * Identity fields (including photo + location address) live in the Card window.
 * An attached photo becomes the chip face, with the label.
 */
(function (global) {
  "use strict";

  var root = (global.COPDoc = global.COPDoc || {});
  var panX = 64;
  var panY = 64;
  var scale = 1;
  var placeType = "VEHICLE";
  var drag = null;
  var persistTimer = 0;
  var outlineQuery = "";
  var outlineHitsOnly = false;
  var outlineVisible = [];
  var WINDOWS_KEY = "copdocx.investigation-windows.v1";
  var windowsOpen = { plates: true, objects: false, card: false };
  var windowsPos = { plates: null, objects: null, card: null };
  var windowsLoaded = false;
  var windowZ = 6;
  var windowDrag = null;

  function parseWindowPos(value) {
    if (!value || typeof value !== "object") {
      return null;
    }
    var x = Number(value.x);
    var y = Number(value.y);
    if (!isFinite(x) || !isFinite(y)) {
      return null;
    }
    return { x: x, y: y };
  }

  function clampWindowPos(x, y, width, height, boundW, boundH) {
    var minVisible = 48;
    var w = Number(width) || 0;
    var h = Number(height) || 0;
    var maxX = Math.max(0, Number(boundW) || 0) - minVisible;
    var maxY = Math.max(0, (Number(boundH) || 0) - minVisible);
    return {
      x: Math.max(minVisible - w, Math.min(maxX, Number(x) || 0)),
      y: Math.max(0, Math.min(maxY, Number(y) || 0))
    };
  }

  function compactWindows() {
    return (
      typeof window.matchMedia === "function" &&
      window.matchMedia("(max-width: 639px)").matches
    );
  }

  function windowPanelEl(name) {
    if (name === "plates") {
      return byId("investigationPlateDock");
    }
    if (name === "objects") {
      return byId("investigationOutline");
    }
    if (name === "card") {
      return byId("investigationInspector");
    }
    return null;
  }

  function windowPanelName(el) {
    if (!el) {
      return "";
    }
    if (el.id === "investigationPlateDock") {
      return "plates";
    }
    if (el.id === "investigationOutline") {
      return "objects";
    }
    if (el.id === "investigationInspector") {
      return "card";
    }
    return "";
  }

  function applyWindowPositions() {
    ["plates", "objects", "card"].forEach(function (name) {
      var el = windowPanelEl(name);
      if (!el) {
        return;
      }
      var pos = windowsPos[name];
      if (compactWindows() || !pos) {
        el.style.left = "";
        el.style.top = "";
        el.style.right = "";
        el.classList.remove("is-moved");
        return;
      }
      el.style.left = pos.x + "px";
      el.style.top = pos.y + "px";
      el.style.right = "auto";
      el.classList.add("is-moved");
    });
  }

  function currentKind() {
    var rec = loadRecord();
    if (rec && rec.kind) {
      return rec.kind;
    }
    return (byId("investigationKind") && byId("investigationKind").value) || "";
  }

  function readStoredWindows() {
    if (typeof sessionStorage === "undefined") {
      return;
    }
    try {
      var raw = sessionStorage.getItem(WINDOWS_KEY);
      if (!raw) {
        return;
      }
      var parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        windowsOpen.plates = parsed.plates !== false;
        windowsOpen.objects = !!parsed.objects;
        windowsOpen.card = !!parsed.card;
        if (parsed.pos && typeof parsed.pos === "object") {
          windowsPos.plates = parseWindowPos(parsed.pos.plates);
          windowsPos.objects = parseWindowPos(parsed.pos.objects);
          windowsPos.card = parseWindowPos(parsed.pos.card);
        }
      }
    } catch (err) {}
  }

  function persistWindows() {
    if (typeof sessionStorage === "undefined") {
      return;
    }
    try {
      sessionStorage.setItem(
        WINDOWS_KEY,
        JSON.stringify({
          plates: windowsOpen.plates,
          objects: windowsOpen.objects,
          card: windowsOpen.card,
          pos: {
            plates: windowsPos.plates,
            objects: windowsPos.objects,
            card: windowsPos.card
          }
        })
      );
    } catch (err) {}
  }

  function applyWindows(kind) {
    if (!windowsLoaded) {
      windowsLoaded = true;
      readStoredWindows();
    }
    kind = kind || currentKind();
    var tag = kind === "tag";
    var platesBtn = byId("investigationWindowPlates");
    var objectsBtn = byId("investigationWindowObjects");
    var cardBtn = byId("investigationWindowCard");
    var plates = byId("investigationPlateDock");
    var objects = byId("investigationOutline");
    var card = byId("investigationInspector");
    var wall = wallEl();
    if (platesBtn) {
      platesBtn.hidden = !tag;
      platesBtn.setAttribute("aria-pressed", tag && windowsOpen.plates ? "true" : "false");
    }
    if (objectsBtn) {
      objectsBtn.setAttribute("aria-pressed", windowsOpen.objects ? "true" : "false");
    }
    if (cardBtn) {
      cardBtn.setAttribute("aria-pressed", windowsOpen.card ? "true" : "false");
    }
    if (plates) {
      plates.hidden = !tag || !windowsOpen.plates;
    }
    if (objects) {
      objects.hidden = !windowsOpen.objects;
    }
    if (card) {
      card.hidden = !windowsOpen.card;
    }
    if (wall) {
      wall.classList.toggle(
        "is-objects-open",
        !!(windowsOpen.objects && objects && !objects.hidden)
      );
    }
    applyWindowPositions();
  }

  function setWindow(name, open) {
    if (name === "plates" || name === "objects" || name === "card") {
      windowsOpen[name] = !!open;
      persistWindows();
      applyWindows();
    }
  }

  function toggleWindow(name) {
    if (name === "card" && !windowsOpen.card) {
      var rec = loadRecord();
      if (!rec || !rec.focusNodeId) {
        setStatus("Focus an object to open its card.");
        return;
      }
    }
    if (name === "plates" && currentKind() !== "tag") {
      setStatus("Switch kind to Plate Check to open Plates.");
      return;
    }
    setWindow(name, !windowsOpen[name]);
  }

  function openCard(nodeId) {
    var record = loadRecord();
    if (nodeId && record && record.focusNodeId !== nodeId) {
      record.focusNodeId = nodeId;
      saveRecord(record);
      record = loadRecord();
    }
    if (!record || !record.focusNodeId) {
      setStatus("Focus an object to open its card.");
      return;
    }
    windowsOpen.card = true;
    persistWindows();
    paint(record);
  }

  function model() {
    return root.model;
  }

  function byId(id) {
    return document.getElementById(id);
  }

  function setStatus(message, ok) {
    if (typeof root.setAppBarStatus === "function") {
      root.setAppBarStatus(message, ok ? { ok: true } : undefined);
    }
  }

  function currentId() {
    return (byId("investigationId") && byId("investigationId").value) || "";
  }

  function loadRecord() {
    var m = model();
    var id = currentId();
    if (!m || !m.store || !id) {
      return null;
    }
    m.store.loadFromDisk();
    return m.store.getInvestigation(id);
  }

  function saveRecord(record) {
    var m = model();
    if (!m || !m.store || !record) {
      return;
    }
    var committed = m.isCommitted && m.isCommitted(record);
    m.store.saveInvestigation(record, { mode: committed ? "commit" : "draft" });
  }

  function wallEl() {
    return byId("investigationWall");
  }

  function surfaceEl() {
    return byId("investigationSurface");
  }

  function applyTransform() {
    var surface = surfaceEl();
    var wall = wallEl();
    if (surface) {
      surface.style.transform =
        "translate(" + panX + "px, " + panY + "px) scale(" + scale + ")";
    }
    if (wall) {
      var size = 22 * scale;
      wall.style.backgroundSize = size + "px " + size + "px";
      wall.style.backgroundPosition = panX + "px " + panY + "px";
    }
  }

  function screenToWorld(clientX, clientY) {
    var wall = wallEl();
    var rect = wall.getBoundingClientRect();
    return {
      x: (clientX - rect.left - panX) / scale,
      y: (clientY - rect.top - panY) / scale
    };
  }

  function viewCenter() {
    var wall = wallEl();
    if (!wall) {
      return { x: 48, y: 48 };
    }
    var rect = wall.getBoundingClientRect();
    return screenToWorld(rect.left + rect.width / 2, rect.top + rect.height / 2);
  }

  function lotStripPosition(record) {
    var maxX = null;
    var y = 48;
    ((record && record.nodes) || []).forEach(function (n) {
      if (n && n.objectType === "VEHICLE" && typeof n.x === "number") {
        if (maxX == null || n.x > maxX) {
          maxX = n.x;
          y = typeof n.y === "number" ? n.y : 48;
        }
      }
    });
    if (maxX == null) {
      return viewCenter();
    }
    return { x: maxX + 300, y: y };
  }

  function placeTypeLabel(type) {
    var key = String(type || "").toUpperCase();
    if (key === "PERSON") {
      return "person";
    }
    if (key === "LOCATION") {
      return "location";
    }
    if (key === "BUSINESS") {
      return "business";
    }
    if (key === "ENTITY") {
      return "entity";
    }
    if (key === "VEHICLE") {
      return "vehicle";
    }
    return "";
  }

  function setPlaceType(type, opts) {
    var next = String(type || "").toUpperCase();
    if (opts && opts.toggle && next && next === placeType) {
      placeType = "";
    } else {
      placeType = next;
    }
    document.querySelectorAll("[data-wall-type]").forEach(function (btn) {
      btn.setAttribute(
        "aria-pressed",
        btn.getAttribute("data-wall-type") === placeType ? "true" : "false"
      );
    });
    var wall = wallEl();
    if (wall) {
      wall.classList.toggle("is-placing", Boolean(placeType));
    }
    var hint = byId("investigationWallHint");
    if (hint) {
      var label = placeTypeLabel(placeType);
      hint.textContent = label
        ? "Click the wall to place a " +
          label +
          ". Click a chip to focus. Edit opens its card."
        : "Select a type to place. Click a chip to focus. Edit or double-click opens its card.";
    }
  }

  function defaultPlaceType(kind) {
    return String(kind || "") === "tag" ? "VEHICLE" : "PERSON";
  }

  function reasonPhrase(code) {
    var map = {
      REGISTERED_OWNER_OF: "Registered owner",
      KNOWN_OPERATOR_OF: "Known operator",
      CURRENT_RESIDENCE: "Current residence",
      KNOWN_RESIDENCE: "Known residence",
      EMPLOYMENT_ADDRESS: "Employment",
      VEHICLE_PARKING: "Parking",
      REGISTERED_ADDRESS: "Registered address",
      STORED_AT: "Stored at",
      ASSOCIATE_OF: "Associate",
      COHABITANT_OF: "Cohabitant",
      SPOUSE_OF: "Spouse",
      PARENT_OF: "Parent",
      SIBLING_OF: "Sibling",
      EMPLOYED_BY: "Employed by",
      PRINCIPAL_OF: "Principal of",
      CUSTOMER_OF: "Customer",
      OPERATES_AT: "Operates at",
      FLEET_OF: "Fleet of",
      MEMBER_OF: "Member of",
      BASED_AT: "Based at",
      USES_VEHICLE: "Uses vehicle",
      AFFILIATED_WITH: "Affiliated with"
    };
    return map[code] || code || "Linked";
  }

  function reasonsForPair(fromType, toType) {
    var m = model();
    if (m && typeof m.investigationAddTypes === "function") {
      var allowed = m.investigationAddTypes(fromType, "tag");
      if (fromType && allowed.indexOf(toType) === -1 && fromType !== toType) {
        /* still allow PERSON-PERSON */
      }
    }
    var a = String(fromType || "").toUpperCase();
    var b = String(toType || "").toUpperCase();
    if (
      (a === "PERSON" && b === "VEHICLE") ||
      (a === "VEHICLE" && b === "PERSON")
    ) {
      return [
        { value: "REGISTERED_OWNER_OF", label: "Registered owner" },
        { value: "KNOWN_OPERATOR_OF", label: "Known operator" }
      ];
    }
    if (
      (a === "PERSON" && b === "LOCATION") ||
      (a === "LOCATION" && b === "PERSON")
    ) {
      return [
        { value: "CURRENT_RESIDENCE", label: "Current residence" },
        { value: "KNOWN_RESIDENCE", label: "Known residence" },
        { value: "EMPLOYMENT_ADDRESS", label: "Employment" }
      ];
    }
    if (
      (a === "VEHICLE" && b === "LOCATION") ||
      (a === "LOCATION" && b === "VEHICLE")
    ) {
      return [
        { value: "VEHICLE_PARKING", label: "Parking" },
        { value: "REGISTERED_ADDRESS", label: "Registered address" },
        { value: "STORED_AT", label: "Stored at" }
      ];
    }
    if (a === "PERSON" && b === "PERSON") {
      return [
        { value: "ASSOCIATE_OF", label: "Associate" },
        { value: "COHABITANT_OF", label: "Cohabitant" },
        { value: "SPOUSE_OF", label: "Spouse" }
      ];
    }
    if (
      (a === "PERSON" && b === "BUSINESS") ||
      (a === "BUSINESS" && b === "PERSON")
    ) {
      return [
        { value: "EMPLOYED_BY", label: "Employed by" },
        { value: "PRINCIPAL_OF", label: "Principal / owner of" },
        { value: "CUSTOMER_OF", label: "Customer" }
      ];
    }
    if (
      (a === "BUSINESS" && b === "LOCATION") ||
      (a === "LOCATION" && b === "BUSINESS")
    ) {
      return [{ value: "OPERATES_AT", label: "Operates at" }];
    }
    if (
      (a === "BUSINESS" && b === "VEHICLE") ||
      (a === "VEHICLE" && b === "BUSINESS")
    ) {
      return [{ value: "FLEET_OF", label: "Fleet of" }];
    }
    if (
      (a === "PERSON" && b === "ENTITY") ||
      (a === "ENTITY" && b === "PERSON")
    ) {
      return [{ value: "MEMBER_OF", label: "Member of" }];
    }
    if (
      (a === "ENTITY" && b === "LOCATION") ||
      (a === "LOCATION" && b === "ENTITY")
    ) {
      return [{ value: "BASED_AT", label: "Based at" }];
    }
    if (
      (a === "ENTITY" && b === "VEHICLE") ||
      (a === "VEHICLE" && b === "ENTITY")
    ) {
      return [{ value: "USES_VEHICLE", label: "Uses vehicle" }];
    }
    if (
      (a === "BUSINESS" && b === "ENTITY") ||
      (a === "ENTITY" && b === "BUSINESS")
    ) {
      return [{ value: "AFFILIATED_WITH", label: "Affiliated with" }];
    }
    return [];
  }

  function nodeById(record, nodeId) {
    var found = null;
    ((record && record.nodes) || []).forEach(function (row) {
      if (row && row.nodeId === nodeId) {
        found = row;
      }
    });
    return found;
  }

  function nodeForObject(record, type, id) {
    var found = null;
    ((record && record.nodes) || []).forEach(function (row) {
      if (row && row.objectType === type && row.objectId === id) {
        found = row;
      }
    });
    return found;
  }

  function fieldRow(label, name, type, extra) {
    var wrap = document.createElement("div");
    wrap.className = "field";
    var lab = document.createElement("label");
    lab.textContent = label;
    var input = document.createElement(type === "select" ? "select" : "input");
    if (type !== "select") {
      input.type = type || "text";
    }
    input.setAttribute("data-field", name);
    input.autocomplete = "off";
    if (extra) {
      Object.keys(extra).forEach(function (key) {
        input.setAttribute(key, extra[key]);
      });
    }
    wrap.appendChild(lab);
    wrap.appendChild(input);
    return wrap;
  }

  function mediaReturnHref() {
    var id = currentId();
    return id ? "investigate.html?id=" + encodeURIComponent(id) : "investigate.html";
  }

  function mediaQuery(ownerType, ownerId) {
    return (
      "ownerType=" +
      encodeURIComponent(ownerType) +
      "&id=" +
      encodeURIComponent(ownerId) +
      "&return=" +
      encodeURIComponent(mediaReturnHref())
    );
  }

  function appendMediaRow(card, ownerType, ownerId) {
    if (!card || !ownerType || !ownerId) {
      return;
    }
    var wrap = document.createElement("div");
    wrap.className = "section-note card-media-row";
    wrap.setAttribute("data-card-media", "");
    var thumb = document.createElement("div");
    thumb.className = "card-media-thumb";
    thumb.setAttribute("data-card-photo", "");
    wrap.appendChild(thumb);
    var actions = document.createElement("p");
    actions.className = "card-media-actions";
    var q = mediaQuery(ownerType, ownerId);
    var photo = document.createElement("a");
    photo.setAttribute("data-card-add-photo", "");
    photo.href = "photo-picker.html?" + q;
    photo.textContent = "Add photo";
    var file = document.createElement("a");
    file.setAttribute("data-card-add-file", "");
    file.href = "file-upload.html?" + q;
    file.textContent = "Add file";
    actions.appendChild(photo);
    actions.appendChild(document.createTextNode(" · "));
    actions.appendChild(file);
    wrap.appendChild(actions);
    var legend = card.querySelector(":scope > legend");
    if (legend) {
      legend.after(wrap);
    } else {
      card.insertBefore(wrap, card.firstChild);
    }
    var api = root.mediaCard;
    if (api && typeof api.mount === "function") {
      api.mount(thumb, {
        owner: { type: ownerType, id: ownerId },
        compact: true,
        pickerHref: photo.href,
        photoTitle: "",
        committedOnly: false,
        hideWhenEmpty: false
      });
    }
  }

  function buildVehicleCard(vehicle) {
    var card = document.createElement("fieldset");
    card.setAttribute("data-card", "vehicle");
    var legend = document.createElement("legend");
    legend.textContent = "Vehicle";
    card.appendChild(legend);
    appendMediaRow(card, "VEHICLE", vehicle && vehicle.vehicleId);
    var row1 = document.createElement("div");
    row1.className = "row";
    row1.appendChild(
      fieldRow("Plate", "licensePlate", "text", {
        autocapitalize: "characters",
        spellcheck: "false"
      })
    );
    row1.appendChild(fieldRow("State", "plateState", "select"));
    card.appendChild(row1);
    var row2 = document.createElement("div");
    row2.className = "row";
    row2.appendChild(fieldRow("Year", "vehicleYear", "select"));
    row2.appendChild(fieldRow("Color", "vehicleColor", "select"));
    card.appendChild(row2);
    var row3 = document.createElement("div");
    row3.className = "row";
    row3.appendChild(fieldRow("Make", "vehicleMake", "select"));
    row3.appendChild(fieldRow("Model", "vehicleModel", "select"));
    card.appendChild(row3);
    var row4 = document.createElement("div");
    row4.className = "row";
    row4.appendChild(fieldRow("Body", "vehicleBodyStyle", "select"));
    row4.appendChild(fieldRow("VIN", "vin", "text"));
    card.appendChild(row4);
    card.appendChild(fieldRow("Registered owner", "registeredOwner", "text"));
    if (typeof bindVehicleCard === "function") {
      bindVehicleCard(card);
    }
    fillIdentity(card, {
      licensePlate: vehicle && (vehicle.licensePlate || vehicle.plate),
      plateState: vehicle && vehicle.plateState,
      vehicleYear: vehicle && vehicle.vehicleYear,
      vehicleColor: vehicle && vehicle.vehicleColor,
      vehicleMake: vehicle && vehicle.vehicleMake,
      vehicleModel: vehicle && vehicle.vehicleModel,
      vehicleBodyStyle: vehicle && vehicle.vehicleBodyStyle,
      vin: vehicle && vehicle.vin,
      registeredOwner: vehicle && vehicle.registeredOwnerName
    });
    var make = card.querySelector('[data-field="vehicleMake"]');
    if (make) {
      make.dispatchEvent(new Event("change"));
    }
    fillIdentity(card, {
      vehicleModel: vehicle && vehicle.vehicleModel,
      vehicleBodyStyle: vehicle && vehicle.vehicleBodyStyle
    });
    return card;
  }

  function buildPersonCard(person) {
    var card = document.createElement("fieldset");
    card.setAttribute("data-card", "person");
    var legend = document.createElement("legend");
    legend.textContent = "Person";
    card.appendChild(legend);
    appendMediaRow(card, "PERSON", person && person.personId);
    var name = (person && person.name) || {};
    var row = document.createElement("div");
    row.className = "row";
    row.appendChild(fieldRow("Last", "lastName", "text"));
    row.appendChild(fieldRow("First", "firstName", "text"));
    card.appendChild(row);
    card.appendChild(fieldRow("Middle", "middleName", "text"));
    fillIdentity(card, {
      lastName: name.lastName,
      firstName: name.firstName,
      middleName: name.middleName
    });
    return card;
  }

  function buildLocationCard(loc) {
    var card = document.createElement("fieldset");
    card.setAttribute("data-card", "location");
    var legend = document.createElement("legend");
    legend.textContent = "Location";
    card.appendChild(legend);
    appendMediaRow(card, "LOCATION", loc && loc.locationId);
    card.appendChild(fieldRow("Street", "street", "text"));
    card.appendChild(fieldRow("Street 2", "street2", "text"));
    var row = document.createElement("div");
    row.className = "row row-3";
    row.appendChild(fieldRow("City", "city", "text"));
    row.appendChild(fieldRow("State", "state", "text", { maxlength: "2" }));
    row.appendChild(fieldRow("ZIP", "zip", "text"));
    card.appendChild(row);
    fillIdentity(card, loc || {});
    return card;
  }

  function buildBusinessCard(biz) {
    var card = document.createElement("fieldset");
    card.setAttribute("data-card", "business");
    var legend = document.createElement("legend");
    legend.textContent = "Business";
    card.appendChild(legend);
    appendMediaRow(card, "BUSINESS", biz && biz.businessId);
    card.appendChild(fieldRow("Name", "name", "text"));
    card.appendChild(fieldRow("Phone", "phone", "text"));
    fillIdentity(card, biz || {});
    return card;
  }

  function buildEntityCard(ent) {
    var card = document.createElement("fieldset");
    card.setAttribute("data-card", "entity");
    var legend = document.createElement("legend");
    legend.textContent = "Entity";
    card.appendChild(legend);
    appendMediaRow(card, "ENTITY", ent && ent.entityId);
    card.appendChild(fieldRow("Name", "name", "text"));
    card.appendChild(fieldRow("Kind", "kind", "text"));
    fillIdentity(card, ent || {});
    return card;
  }

  function fillIdentity(card, data) {
    if (!card || !data) {
      return;
    }
    Object.keys(data).forEach(function (key) {
      var el = card.querySelector('[data-field="' + key + '"]');
      if (!el || data[key] == null) {
        return;
      }
      el.value = String(data[key]);
    });
  }

  function readField(card, name) {
    var el = card.querySelector('[data-field="' + name + '"]');
    return el ? String(el.value || "").trim() : "";
  }

  var inspectorPainted = { nodeId: "", objectId: "", objectType: "" };
  var inspectorFocusField = false;
  var associatesDraft = { query: "", reason: "", highlight: 0, objectType: "PERSON" };
  var associatesFocusComposer = false;

  function persistInspector() {
    var m = model();
    var shell = byId("investigationInspector");
    var cardHost = byId("investigationInspectorCard");
    var card = cardHost && cardHost.querySelector("[data-card]");
    var type = shell && shell.getAttribute("data-object-type");
    var id = shell && shell.getAttribute("data-object-id");
    var nodeId = shell && shell.getAttribute("data-node-id");
    if (!m || !m.store || !card || !id || !type) {
      return;
    }
    if (type === "VEHICLE") {
      var prev = m.store.getVehicleRecord(id) || m.createVehicle({ vehicleId: id });
      prev.licensePlate = readField(card, "licensePlate").toUpperCase();
      prev.plate = prev.licensePlate;
      prev.plateState = readField(card, "plateState").toUpperCase();
      prev.vehicleYear = readField(card, "vehicleYear");
      prev.vehicleMake = readField(card, "vehicleMake");
      prev.vehicleModel = readField(card, "vehicleModel");
      prev.vehicleColor = readField(card, "vehicleColor");
      prev.vehicleBodyStyle = readField(card, "vehicleBodyStyle");
      prev.vin = readField(card, "vin");
      prev.registeredOwnerName = readField(card, "registeredOwner");
      prev.governmentVehicle = false;
      m.store.saveObjectRecord("VEHICLE", prev, { mode: "commit" });
    } else if (type === "PERSON") {
      var person = m.store.getPerson(id) || m.createPerson({ personId: id, caseRole: "" });
      person.name = person.name || {};
      person.name.lastName = readField(card, "lastName");
      person.name.firstName = readField(card, "firstName");
      person.name.middleName = readField(card, "middleName");
      m.store.saveObjectRecord("PERSON", person, { mode: "commit" });
    } else if (type === "LOCATION") {
      var loc = m.store.getLocationRecord(id) || m.createLocation({ locationId: id });
      loc.street = readField(card, "street");
      loc.street2 = readField(card, "street2");
      loc.city = readField(card, "city");
      loc.state = readField(card, "state").toUpperCase();
      loc.zip = readField(card, "zip");
      m.store.saveObjectRecord("LOCATION", loc, { mode: "commit" });
    } else if (type === "BUSINESS") {
      var biz =
        (m.store.getBusinessRecord && m.store.getBusinessRecord(id)) ||
        m.createBusiness({ businessId: id });
      biz.name = readField(card, "name");
      biz.phone = readField(card, "phone");
      m.store.saveObjectRecord("BUSINESS", biz, { mode: "commit" });
    } else if (type === "ENTITY") {
      var ent =
        (m.store.getEntityRecord && m.store.getEntityRecord(id)) ||
        m.createCustomEntity({ entityId: id });
      ent.name = readField(card, "name");
      ent.kind = readField(card, "kind");
      m.store.saveObjectRecord("ENTITY", ent, { mode: "commit" });
    }
    var invId = currentId();
    if (m.store.reuseInvestigationIdentity && invId && nodeId) {
      var reused = m.store.reuseInvestigationIdentity(invId, nodeId);
      if (reused && reused.ok && reused.reused) {
        inspectorPainted = { nodeId: "", objectId: "", objectType: "" };
        paint(loadRecord());
        setStatus("Reused existing " + type.toLowerCase() + ".", true);
        return;
      }
    }
    var rec = loadRecord();
    var node = rec && nodeById(rec, nodeId);
    var label = node ? nodeTitle(node) : "";
    var chip = document.querySelector(
      '.investigation-node[data-node-id="' + nodeId + '"] .investigation-node-title'
    );
    if (chip && label) {
      chip.textContent = label;
    }
    var heading = byId("investigationInspectorTitle");
    if (heading && label) {
      heading.textContent = label;
    }
    paintOutline(rec);
    paintWallDim(rec);
  }

  function schedulePersistInspector() {
    window.clearTimeout(persistTimer);
    persistTimer = window.setTimeout(persistInspector, 280);
  }

  function nodeTitle(node) {
    var m = model();
    if (!node) {
      return "Object";
    }
    if (node.objectType === "VEHICLE") {
      var vehicle = m.store.getVehicleRecord && m.store.getVehicleRecord(node.objectId);
      var plate = vehicle
        ? [vehicle.plateState, vehicle.licensePlate || vehicle.plate].filter(Boolean).join(" ")
        : "";
      return plate || "Vehicle";
    }
    if (node.objectType === "PERSON") {
      var person = m.store.getPerson && m.store.getPerson(node.objectId);
      var name =
        person && m.formatPersonLabel ? m.formatPersonLabel(person) : "";
      return name || "Person";
    }
    if (node.objectType === "BUSINESS") {
      var biz = m.store.getBusinessRecord && m.store.getBusinessRecord(node.objectId);
      return (biz && biz.name) || "Business";
    }
    if (node.objectType === "ENTITY") {
      var ent = m.store.getEntityRecord && m.store.getEntityRecord(node.objectId);
      if (ent && m.formatEntityLabel) {
        return m.formatEntityLabel(ent) || "Entity";
      }
      return (ent && ent.name) || "Entity";
    }
    var loc = m.store.getLocationRecord && m.store.getLocationRecord(node.objectId);
    var addr = loc
      ? [loc.street, loc.city, loc.state].filter(Boolean).join(", ")
      : "";
    return addr || "Location";
  }

  function buildIdentityCard(node) {
    var m = model();
    if (!node) {
      return null;
    }
    if (node.objectType === "VEHICLE") {
      return buildVehicleCard(m.store.getVehicleRecord && m.store.getVehicleRecord(node.objectId));
    }
    if (node.objectType === "PERSON") {
      return buildPersonCard(m.store.getPerson && m.store.getPerson(node.objectId));
    }
    if (node.objectType === "BUSINESS") {
      return buildBusinessCard(
        m.store.getBusinessRecord && m.store.getBusinessRecord(node.objectId)
      );
    }
    if (node.objectType === "ENTITY") {
      return buildEntityCard(
        m.store.getEntityRecord && m.store.getEntityRecord(node.objectId)
      );
    }
    return buildLocationCard(
      m.store.getLocationRecord && m.store.getLocationRecord(node.objectId)
    );
  }

  function buildNode(node, record) {
    var wrap = document.createElement("div");
    wrap.className = "investigation-node is-compact";
    wrap.setAttribute("data-node-id", node.nodeId);
    wrap.setAttribute("data-object-type", node.objectType);
    wrap.setAttribute("data-object-id", node.objectId);
    wrap.style.left = Number(node.x || 0) + "px";
    wrap.style.top = Number(node.y || 0) + "px";
    if (record && record.focusNodeId === node.nodeId) {
      wrap.classList.add("is-focused");
    }
    var port = document.createElement("button");
    port.type = "button";
    port.className = "investigation-node-port";
    port.setAttribute("data-port", "true");
    port.setAttribute("aria-label", "Connect");
    wrap.appendChild(port);
    var face = document.createElement("img");
    face.className = "investigation-node-face";
    face.alt = "";
    face.draggable = false;
    face.hidden = true;
    wrap.appendChild(face);
    var title = document.createElement("div");
    title.className = "investigation-node-title";
    title.textContent = nodeTitle(node);
    wrap.appendChild(title);
    var edit = document.createElement("button");
    edit.type = "button";
    edit.className = "investigation-node-edit";
    edit.textContent = "Edit";
    wrap.appendChild(edit);
    return wrap;
  }

  function revokeFace(el) {
    if (el && el._faceUrl) {
      URL.revokeObjectURL(el._faceUrl);
      el._faceUrl = "";
    }
  }

  function clearNodeFace(el) {
    if (!el) {
      return;
    }
    revokeFace(el);
    el.classList.remove("has-photo");
    el._faceKey = "";
    var img = el.querySelector(".investigation-node-face");
    if (img) {
      img.removeAttribute("src");
      img.hidden = true;
    }
  }

  function paintNodeFace(el, node) {
    var api = root.media;
    if (!el || !node || !api || typeof api.list !== "function") {
      return;
    }
    var key = String(node.objectType || "") + ":" + String(node.objectId || "");
    if (el._faceKey === key && el._faceLoaded) {
      return;
    }
    el._faceKey = key;
    el._faceLoaded = false;
    var owner = { type: node.objectType, id: node.objectId };
    Promise.resolve()
      .then(function () {
        return api.list(owner);
      })
      .then(function (rows) {
        if (el._faceKey !== key) {
          return;
        }
        var photos = (rows || []).filter(function (row) {
          return row && row.mediaClass === "photo";
        });
        var primary =
          photos.filter(function (row) {
            return row.primary;
          })[0] || photos[0];
        if (!primary) {
          clearNodeFace(el);
          el._faceKey = key;
          el._faceLoaded = true;
          return;
        }
        return api.blob(primary.mediaId, "thumb").catch(function () {
          return api.blob(primary.mediaId, "display");
        }).then(function (rec) {
          if (el._faceKey !== key) {
            return;
          }
          var img = el.querySelector(".investigation-node-face");
          if (!img || !rec || !rec.blob) {
            clearNodeFace(el);
            el._faceKey = key;
            el._faceLoaded = true;
            return;
          }
          revokeFace(el);
          var blob = rec.blob;
          if (typeof Blob !== "undefined" && !(blob instanceof Blob) && blob.buffer) {
            blob = new Blob([blob]);
          }
          el._faceUrl = URL.createObjectURL(blob);
          img.src = el._faceUrl;
          img.hidden = false;
          el.classList.add("has-photo");
          el._faceLoaded = true;
          img.onload = function () {
            paintEdges(loadRecord());
          };
        });
      })
      .catch(function () {
        if (el._faceKey === key) {
          clearNodeFace(el);
          el._faceKey = key;
          el._faceLoaded = true;
        }
      });
  }

  function convexHull(points) {
    var pts = (points || []).slice().sort(function (a, b) {
      return a.x === b.x ? a.y - b.y : a.x - b.x;
    });
    if (pts.length <= 1) {
      return pts;
    }
    function cross(o, a, b) {
      return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
    }
    var lower = [];
    pts.forEach(function (p) {
      while (
        lower.length >= 2 &&
        cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0
      ) {
        lower.pop();
      }
      lower.push(p);
    });
    var upper = [];
    var i;
    for (i = pts.length - 1; i >= 0; i--) {
      var p = pts[i];
      while (
        upper.length >= 2 &&
        cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0
      ) {
        upper.pop();
      }
      upper.push(p);
    }
    lower.pop();
    upper.pop();
    return lower.concat(upper);
  }

  function hullColor(id, alpha) {
    var h = 0;
    String(id || "").split("").forEach(function (ch) {
      h = (h * 33 + ch.charCodeAt(0)) % 360;
    });
    return "hsla(" + h + ", 50%, 42%, " + (alpha == null ? 0.16 : alpha) + ")";
  }

  function paintHulls(record) {
    var svg = byId("investigationEdges");
    var host = byId("investigationNodes");
    var labels = byId("investigationHullLabels");
    if (!svg || !host) {
      return { counts: {} };
    }
    var m = model();
    var others =
      m.store.listRelatedInvestigations && record && record.investigationId
        ? m.store.listRelatedInvestigations(record.investigationId)
        : [];
    var hulls =
      m.investigationHulls && record
        ? m.investigationHulls(record, others)
        : [];
    var counts =
      m.investigationOverlapCounts && record
        ? m.investigationOverlapCounts(record, others)
        : {};
    if (labels) {
      labels.replaceChildren();
    }
    hulls.forEach(function (hull) {
      var pts = [];
      (hull.nodeIds || []).forEach(function (nid) {
        var node = nodeById(record, nid);
        if (!node) {
          return;
        }
        var el = host.querySelector('[data-node-id="' + nid + '"]');
        var x = Number(node.x || 0);
        var y = Number(node.y || 0);
        var w = el && el.offsetWidth ? el.offsetWidth : 200;
        var h = el && el.offsetHeight ? el.offsetHeight : 44;
        var pad = 18;
        pts.push({ x: x - pad, y: y - pad });
        pts.push({ x: x + w + pad, y: y - pad });
        pts.push({ x: x + w + pad, y: y + h + pad });
        pts.push({ x: x - pad, y: y + h + pad });
      });
      var ring = convexHull(pts);
      if (!ring.length) {
        return;
      }
      var d = ring
        .map(function (p, i) {
          return (i ? "L " : "M ") + p.x + " " + p.y;
        })
        .join(" ") + " Z";
      var path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", d);
      path.setAttribute("class", "investigation-hull");
      path.setAttribute("fill", hullColor(hull.investigationId, 0.16));
      path.setAttribute("stroke", hullColor(hull.investigationId, 0.55));
      path.setAttribute("data-investigation-id", hull.investigationId);
      svg.appendChild(path);
      if (labels && ring[0]) {
        var tag = document.createElement("a");
        tag.className = "investigation-hull-tag";
        tag.href =
          "investigate.html?id=" + encodeURIComponent(hull.investigationId);
        tag.textContent =
          (hull.relation === "child" ? "Child " : "Parent ") +
          hull.investigationId;
        tag.style.left = ring[0].x + "px";
        tag.style.top = Math.max(0, ring[0].y - 18) + "px";
        labels.appendChild(tag);
      }
    });
    return { counts: counts };
  }

  function plexOf(record) {
    var m = model();
    if (m && typeof m.investigationPlex === "function") {
      return m.investigationPlex(record);
    }
    return { active: false, nodeIds: {}, linkIds: {} };
  }

  function outlineFilterActive() {
    return outlineHitsOnly || String(outlineQueryValue() || "").trim() !== "";
  }

  function chipIsDim(node, record, plex) {
    var m = model();
    var matches = nodeMatchesOutline(node, record);
    if (m && typeof m.investigationChipDim === "function") {
      return m.investigationChipDim({
        filterOn: outlineFilterActive(),
        matches: matches,
        plexActive: !!(plex && plex.active),
        inPlex: !!(plex && plex.nodeIds && node && plex.nodeIds[node.nodeId])
      });
    }
    if (outlineFilterActive()) {
      return !matches;
    }
    return !!(plex && plex.active && node && !plex.nodeIds[node.nodeId]);
  }

  function linkIsDim(link, record, plex, from, to) {
    if (outlineFilterActive()) {
      return chipIsDim(from, record, plex) && chipIsDim(to, record, plex);
    }
    return !!(
      plex &&
      plex.active &&
      link &&
      link.linkId &&
      !plex.linkIds[link.linkId]
    );
  }

  function paintWallDim(record) {
    var host = byId("investigationNodes");
    var plex = plexOf(record);
    if (host) {
      ((record && record.nodes) || []).forEach(function (node) {
        if (!node) {
          return;
        }
        var el = host.querySelector('[data-node-id="' + node.nodeId + '"]');
        if (el) {
          el.classList.toggle("is-plex-dim", chipIsDim(node, record, plex));
        }
      });
    }
    paintEdges(record);
  }

  function refreshOutlineFilter() {
    var record = loadRecord();
    paintOutline(record);
    paintWallDim(record);
  }

  function paintEdges(record) {
    var svg = byId("investigationEdges");
    var host = byId("investigationNodes");
    if (!svg || !host) {
      return;
    }
    var plex = plexOf(record);
    svg.replaceChildren();
    svg.setAttribute("width", "8000");
    svg.setAttribute("height", "8000");
    svg.setAttribute("viewBox", "0 0 8000 8000");
    paintHulls(record);
    ((record && record.links) || []).forEach(function (link) {
      if (!link || !link.from || !link.to) {
        return;
      }
      var from = nodeForObject(record, link.from.type, link.from.id);
      var to = nodeForObject(record, link.to.type, link.to.id);
      if (!from || !to) {
        return;
      }
      var fromEl = host.querySelector('[data-node-id="' + from.nodeId + '"]');
      var toEl = host.querySelector('[data-node-id="' + to.nodeId + '"]');
      var x1 = Number(from.x || 0) + (fromEl ? fromEl.offsetWidth / 2 : 140);
      var y1 = Number(from.y || 0) + (fromEl ? fromEl.offsetHeight / 2 : 40);
      var x2 = Number(to.x || 0) + (toEl ? toEl.offsetWidth / 2 : 140);
      var y2 = Number(to.y || 0) + (toEl ? toEl.offsetHeight / 2 : 40);
      var dx = Math.max(40, Math.abs(x2 - x1) / 2);
      var d =
        "M " +
        x1 +
        " " +
        y1 +
        " C " +
        (x1 + dx) +
        " " +
        y1 +
        ", " +
        (x2 - dx) +
        " " +
        y2 +
        ", " +
        x2 +
        " " +
        y2;
      var path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", d);
      var edgeClass = "investigation-edge";
      if (linkIsDim(link, record, plex, from, to)) {
        edgeClass += " is-plex-dim";
      }
      path.setAttribute("class", edgeClass);
      path.setAttribute("data-link-id", link.linkId || "");
      path.setAttribute("fill", "none");
      path.setAttribute("pointer-events", "stroke");
      svg.appendChild(path);
      var label = document.createElementNS("http://www.w3.org/2000/svg", "text");
      label.setAttribute("x", String((x1 + x2) / 2));
      label.setAttribute("y", String((y1 + y2) / 2 - 6));
      var labelClass = "investigation-edge-label";
      if (linkIsDim(link, record, plex, from, to)) {
        labelClass += " is-plex-dim";
      }
      label.setAttribute("class", labelClass);
      label.textContent = reasonPhrase((link.reasons && link.reasons[0]) || "");
      svg.appendChild(label);
    });
    var rubber = document.createElementNS("http://www.w3.org/2000/svg", "path");
    rubber.setAttribute("id", "investigationRubber");
    rubber.setAttribute("class", "investigation-edge is-rubber");
    rubber.setAttribute("fill", "none");
    rubber.setAttribute("hidden", "true");
    svg.appendChild(rubber);
  }

  function paint(record) {
    var host = byId("investigationNodes");
    var empty = byId("investigationWallEmpty");
    if (!host) {
      return;
    }
    var nodes = (record && record.nodes) || [];
    if (empty) {
      empty.hidden = nodes.length > 0;
    }
    var keep = {};
    nodes.forEach(function (node, index) {
      if (!node) {
        return;
      }
      if (typeof node.x !== "number") {
        node.x = 48 + index * 300;
      }
      if (typeof node.y !== "number") {
        node.y = 48;
      }
      keep[node.nodeId] = true;
      var el = host.querySelector('[data-node-id="' + node.nodeId + '"]');
      if (el && el.getAttribute("data-object-id") !== node.objectId) {
        el.remove();
        el = null;
      }
      if (!el) {
        el = buildNode(node, record);
        host.appendChild(el);
      }
      el.style.left = node.x + "px";
      el.style.top = node.y + "px";
      var focused = record && record.focusNodeId === node.nodeId;
      el.classList.add("is-compact");
      el.classList.toggle("is-focused", !!focused);
      var title = el.querySelector(".investigation-node-title");
      if (title) {
        title.textContent = nodeTitle(node);
      }
      paintNodeFace(el, node);
    });
    Array.prototype.slice.call(host.querySelectorAll("[data-node-id]")).forEach(function (el) {
      if (!keep[el.getAttribute("data-node-id")]) {
        revokeFace(el);
        el.remove();
      }
    });
    var others =
      model().store.listRelatedInvestigations && record && record.investigationId
        ? model().store.listRelatedInvestigations(record.investigationId)
        : [];
    var overlap =
      model().investigationOverlapCounts && record
        ? model().investigationOverlapCounts(record, others)
        : {};
    nodes.forEach(function (node) {
      if (!node) {
        return;
      }
      var el = host.querySelector('[data-node-id="' + node.nodeId + '"]');
      if (el) {
        el.classList.toggle("is-overlap", (overlap[node.nodeId] || 0) > 0);
      }
    });
    paintOutline(record);
    paintWallDim(record);
    paintInspector(record);
    applyWindows((record && record.kind) || "");
    applyTransform();
  }

  function placeAt(world) {
    var m = model();
    var record = loadRecord();
    if (!placeType) {
      return;
    }
    if (!record && typeof root.ensureInvestigationDraft === "function") {
      record = root.ensureInvestigationDraft();
    }
    if (!m || !m.store || !record || !m.store.addInvestigationObject) {
      return;
    }
    var result = m.store.addInvestigationObject(record.investigationId, {
      objectType: placeType,
      fromNodeId: "",
      x: world.x,
      y: world.y,
      focus: true
    });
    if (!result || !result.ok) {
      setStatus((result && result.error) || "Could not place that object.");
      return;
    }
    inspectorFocusField = true;
    windowsOpen.card = true;
    persistWindows();
    paint(loadRecord());
    setStatus("Placed " + placeType.toLowerCase() + ".", true);
  }

  function moveNode(nodeId, x, y) {
    var record = loadRecord();
    if (!record) {
      return;
    }
    var node = nodeById(record, nodeId);
    if (!node) {
      return;
    }
    node.x = x;
    node.y = y;
    saveRecord(record);
    paintEdges(record);
  }

  function focusNode(nodeId) {
    var record = loadRecord();
    if (!record || !nodeId) {
      return;
    }
    record.focusNodeId = nodeId;
    saveRecord(record);
    paint(loadRecord());
  }

  function outlineKindLabel(objectType) {
    var m = model();
    if (m && typeof m.investigationObjectKindLabel === "function") {
      return m.investigationObjectKindLabel(objectType);
    }
    return objectType || "Object";
  }

  function outlineBits(node, record) {
    var m = model();
    var extra = [];
    if (!node || !m || !m.store) {
      return { title: nodeTitle(node), kind: outlineKindLabel(node && node.objectType), extra: "" };
    }
    if (node.objectType === "VEHICLE") {
      var vehicle = m.store.getVehicleRecord && m.store.getVehicleRecord(node.objectId);
      if (vehicle) {
        extra.push(
          vehicle.vin,
          vehicle.vehicleMake,
          vehicle.vehicleModel,
          vehicle.vehicleColor,
          vehicle.vehicleYear,
          vehicle.registeredOwnerName
        );
      }
      ((record && record.plates) || []).forEach(function (plate) {
        if (plate && plate.vehicleId === node.objectId) {
          extra.push(plate.status, plate.plate, plate.state);
        }
      });
    } else if (node.objectType === "PERSON") {
      var person = m.store.getPerson && m.store.getPerson(node.objectId);
      var name = (person && person.name) || {};
      extra.push(name.lastName, name.firstName, name.middleName);
    } else if (node.objectType === "LOCATION") {
      var loc = m.store.getLocationRecord && m.store.getLocationRecord(node.objectId);
      if (loc) {
        extra.push(loc.street, loc.city, loc.state, loc.zip);
      }
    } else if (node.objectType === "BUSINESS") {
      var biz = m.store.getBusinessRecord && m.store.getBusinessRecord(node.objectId);
      if (biz) {
        extra.push(biz.name, biz.phone);
      }
    } else if (node.objectType === "ENTITY") {
      var ent = m.store.getEntityRecord && m.store.getEntityRecord(node.objectId);
      if (ent) {
        extra.push(ent.name, ent.kind);
      }
    }
    return {
      title: nodeTitle(node),
      kind: outlineKindLabel(node.objectType),
      extra: extra.filter(Boolean).join(" ")
    };
  }

  function outlineQueryValue() {
    var el = byId("investigationOutlineSearch");
    if (el) {
      outlineQuery = el.value;
    }
    return outlineQuery;
  }

  function nodeMatchesOutline(node, record) {
    var m = model();
    if (outlineHitsOnly && m && typeof m.investigationOutlineIsHit === "function") {
      if (!m.investigationOutlineIsHit(node, record)) {
        return false;
      }
    } else if (outlineHitsOnly && node.objectType !== "VEHICLE") {
      return false;
    }
    if (m && typeof m.investigationOutlineMatch === "function") {
      return m.investigationOutlineMatch(outlineQueryValue(), node, outlineBits(node, record));
    }
    var hay = (nodeTitle(node) + " " + (node.objectType || "")).toLowerCase();
    var q = String(outlineQueryValue() || "").trim().toLowerCase();
    return !q || hay.indexOf(q) !== -1;
  }

  function paintOutline(record) {
    var list = byId("investigationOutlineList");
    var empty = byId("investigationOutlineEmpty");
    var none = byId("investigationOutlineNone");
    var hitsBtn = byId("investigationOutlineHits");
    if (!list) {
      return;
    }
    list.replaceChildren();
    outlineVisible = [];
    var nodes = (record && record.nodes) || [];
    var kind = (record && record.kind) || "";
    if (hitsBtn) {
      hitsBtn.hidden = kind !== "tag";
      if (kind !== "tag") {
        outlineHitsOnly = false;
      }
      hitsBtn.setAttribute("aria-pressed", outlineHitsOnly ? "true" : "false");
    }
    var plex = plexOf(record);
    nodes.forEach(function (node) {
      if (!node || !nodeMatchesOutline(node, record)) {
        return;
      }
      outlineVisible.push(node);
      var li = document.createElement("li");
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "investigation-outline-item";
      if (record.focusNodeId === node.nodeId) {
        btn.className += " is-current";
      }
      if (plex.active && !plex.nodeIds[node.nodeId]) {
        btn.className += " is-plex-dim";
      }
      var kindEl = document.createElement("span");
      kindEl.className = "investigation-outline-kind";
      kindEl.textContent = outlineKindLabel(node.objectType);
      var name = document.createElement("span");
      name.textContent = nodeTitle(node);
      btn.appendChild(kindEl);
      btn.appendChild(name);
      btn.addEventListener("click", function () {
        panToNode(node);
        focusNode(node.nodeId);
      });
      var edit = document.createElement("button");
      edit.type = "button";
      edit.className = "investigation-outline-edit";
      edit.textContent = "Edit";
      edit.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();
        panToNode(node);
        openCard(node.nodeId);
      });
      li.appendChild(btn);
      li.appendChild(edit);
      list.appendChild(li);
    });
    if (empty) {
      empty.hidden = nodes.length > 0;
    }
    if (none) {
      none.hidden = nodes.length === 0 || outlineVisible.length > 0;
      none.textContent = outlineHitsOnly ? "No hits match." : "No objects match.";
    }
  }

  function jumpFirstOutlineMatch() {
    if (!outlineVisible.length) {
      return;
    }
    panToNode(outlineVisible[0]);
    focusNode(outlineVisible[0].nodeId);
  }

  function clearOutlineFilter() {
    outlineQuery = "";
    outlineHitsOnly = false;
    var search = byId("investigationOutlineSearch");
    if (search) {
      search.value = "";
    }
    refreshOutlineFilter();
  }

  function associatedOther(row, hostType, hostId) {
    if (!row || !row.from || !row.to) {
      return null;
    }
    if (model().store.isJunked && model().store.isJunked(row)) {
      return null;
    }
    var hostIsFrom = row.from.type === hostType && row.from.id === hostId;
    var hostIsTo = row.to.type === hostType && row.to.id === hostId;
    if (!hostIsFrom && !hostIsTo) {
      return null;
    }
    var other = hostIsFrom ? row.to : row.from;
    if (!other.type || !other.id) {
      return null;
    }
    if (other.type === hostType && other.id === hostId) {
      return null;
    }
    return { objectType: other.type, objectId: other.id };
  }

  function composerTypeLabel(objectType) {
    var key = String(objectType || "").toUpperCase();
    if (key === "VEHICLE") {
      return "Vehicle";
    }
    if (key === "LOCATION") {
      return "Location";
    }
    if (key === "BUSINESS") {
      return "Business";
    }
    if (key === "ENTITY") {
      return "Entity";
    }
    return "Person";
  }

  function composerPlaceholder(objectType) {
    var key = String(objectType || "").toUpperCase();
    if (key === "VEHICLE") {
      return "Plate, Enter";
    }
    if (key === "LOCATION") {
      return "Street, city, Enter";
    }
    if (key === "BUSINESS") {
      return "Business name, Enter";
    }
    if (key === "ENTITY") {
      return "Name, Enter";
    }
    return "Type a name, Enter";
  }

  function composerTypesForHost(hostType) {
    var all = ["PERSON", "VEHICLE", "LOCATION", "BUSINESS", "ENTITY"];
    return all.filter(function (type) {
      return reasonsForPair(hostType, type).length > 0;
    });
  }

  function reasonOptions(hostType, otherType) {
    var skip = {
      ENCOUNTER_LOCATION: true,
      ARREST_LOCATION: true,
      STAGING_LOCATION: true,
      PROCESSING_LOCATION: true
    };
    var m = model();
    var rows = [];
    if (m && typeof m.associationReasonsForPair === "function") {
      rows = m.associationReasonsForPair(hostType, otherType) || [];
    }
    if (!rows.length) {
      rows = reasonsForPair(hostType, otherType);
    }
    return rows
      .filter(function (row) {
        return row && row.value && !skip[row.value];
      })
      .map(function (row) {
        return {
          value: row.value,
          label:
            (m && m.associationCardLabel && m.associationCardLabel(row.value)) ||
            row.label
        };
      });
  }

  function defaultAssociateReason(hostType, otherType) {
    otherType = otherType || "PERSON";
    if (otherType === "PERSON" && model().defaultPersonAssociationReason) {
      return model().defaultPersonAssociationReason(hostType);
    }
    var map = {
      "PERSON|VEHICLE": "REGISTERED_OWNER_OF",
      "VEHICLE|PERSON": "REGISTERED_OWNER_OF",
      "PERSON|LOCATION": "CURRENT_RESIDENCE",
      "LOCATION|PERSON": "CURRENT_RESIDENCE",
      "VEHICLE|LOCATION": "VEHICLE_PARKING",
      "LOCATION|VEHICLE": "VEHICLE_PARKING",
      "PERSON|BUSINESS": "CUSTOMER_OF",
      "BUSINESS|PERSON": "CUSTOMER_OF",
      "BUSINESS|LOCATION": "OPERATES_AT",
      "LOCATION|BUSINESS": "OPERATES_AT",
      "BUSINESS|VEHICLE": "FLEET_OF",
      "VEHICLE|BUSINESS": "FLEET_OF",
      "PERSON|ENTITY": "MEMBER_OF",
      "ENTITY|PERSON": "MEMBER_OF",
      "PERSON|PERSON": "ASSOCIATE_OF"
    };
    return (
      map[String(hostType || "").toUpperCase() + "|" + String(otherType || "").toUpperCase()] ||
      (reasonOptions(hostType, otherType)[0] && reasonOptions(hostType, otherType)[0].value) ||
      ""
    );
  }

  function fillReasonSelect(select, hostType, otherType, selected) {
    var options = reasonOptions(hostType, otherType);
    var want = selected || defaultAssociateReason(hostType, otherType);
    select.replaceChildren();
    options.forEach(function (row) {
      var opt = document.createElement("option");
      opt.value = row.value;
      opt.textContent = row.label;
      select.appendChild(opt);
    });
    if (want && options.some(function (row) { return row.value === want; })) {
      select.value = want;
    } else if (options.length) {
      select.value = options[0].value;
    }
  }

  function suggestObjects(query, objectType, exceptId) {
    var m = model();
    var q = String(query || "").trim().toLowerCase();
    var type = String(objectType || "PERSON").toUpperCase();
    if (!q || !m || !m.store) {
      return [];
    }
    var rows = m.store.listObjects
      ? m.store.listObjects(type)
      : type === "PERSON" && m.store.allPeople
        ? m.store.allPeople()
        : [];
    var hits = [];
    rows.forEach(function (row) {
      if (!row) {
        return;
      }
      var id =
        row.personId ||
        row.vehicleId ||
        row.locationId ||
        row.businessId ||
        row.entityId ||
        row.id;
      if (!id || id === exceptId) {
        return;
      }
      var label = nodeTitle({ objectType: type, objectId: id });
      var extra = "";
      if (type === "VEHICLE") {
        extra = [row.plateState, row.licensePlate || row.plate, row.vin].filter(Boolean).join(" ");
      } else if (type === "LOCATION") {
        extra = [row.street, row.city, row.state, row.zip].filter(Boolean).join(" ");
      } else if (type === "BUSINESS" || type === "ENTITY") {
        extra = [row.name, row.kind, row.phone].filter(Boolean).join(" ");
      } else {
        extra = [row.name && row.name.lastName, row.name && row.name.firstName].filter(Boolean).join(" ");
      }
      var hay = (label + " " + extra).toLowerCase();
      if (hay.indexOf(q) === -1) {
        return;
      }
      hits.push({ objectId: id, objectType: type, label: label || composerTypeLabel(type) });
    });
    return hits.slice(0, 8);
  }

  function paintAssociateSuggest(host) {
    var list = host && host.querySelector("[data-associate-suggest]");
    if (!list) {
      return;
    }
    var except =
      associatesDraft.objectType === (host.getAttribute("data-host-type") || "")
        ? host.getAttribute("data-host-id") || ""
        : "";
    var hits = suggestObjects(
      associatesDraft.query,
      associatesDraft.objectType || "PERSON",
      except
    );
    list.replaceChildren();
    if (!hits.length || !String(associatesDraft.query || "").trim()) {
      list.hidden = true;
      associatesDraft.highlight = 0;
      return;
    }
    list.hidden = false;
    if (associatesDraft.highlight >= hits.length) {
      associatesDraft.highlight = hits.length - 1;
    }
    if (associatesDraft.highlight < 0) {
      associatesDraft.highlight = 0;
    }
    hits.forEach(function (hit, index) {
      var li = document.createElement("li");
      var btn = document.createElement("button");
      btn.type = "button";
      btn.setAttribute("data-associate-pick", hit.objectId);
      btn.setAttribute("data-associate-pick-type", hit.objectType);
      btn.textContent = hit.label;
      if (index === associatesDraft.highlight) {
        btn.className = "is-current";
      }
      li.appendChild(btn);
      list.appendChild(li);
    });
  }

  function submitAssociateComposer(objectId, objectType) {
    var m = model();
    var rec = loadRecord();
    var node = rec && nodeById(rec, rec.focusNodeId);
    if (!m || !m.store || !node) {
      return;
    }
    var kind = objectType || associatesDraft.objectType || "PERSON";
    var reason =
      associatesDraft.reason || defaultAssociateReason(node.objectType, kind);
    var query = String(associatesDraft.query || "").trim();
    if (!objectId && !query) {
      setStatus(composerPlaceholder(kind).replace(", Enter", "."));
      return;
    }
    if (!objectId) {
      var except = kind === node.objectType ? node.objectId : "";
      var hits = suggestObjects(query, kind, except);
      if (
        hits.length &&
        associatesDraft.highlight >= 0 &&
        hits[associatesDraft.highlight]
      ) {
        objectId = hits[associatesDraft.highlight].objectId;
        kind = hits[associatesDraft.highlight].objectType || kind;
      }
    }
    var fn =
      m.store.associateInvestigationObject || m.store.associateInvestigationPerson;
    if (!fn) {
      return;
    }
    var result = fn.call(m.store, rec.investigationId, node.nodeId, {
      objectType: kind,
      objectId: objectId || "",
      personId: kind === "PERSON" ? objectId || "" : "",
      label: query,
      name: query,
      reason: reason
    });
    if (!result || !result.ok) {
      setStatus((result && result.error) || "Could not add that object.");
      return;
    }
    associatesDraft.query = "";
    associatesDraft.highlight = 0;
    associatesFocusComposer = true;
    windowsOpen.card = true;
    persistWindows();
    paint(loadRecord());
    setStatus(
      (result.reused ? "Reused " : "Added ") +
        (nodeTitle({
          objectType: result.objectType || kind,
          objectId: result.objectId || result.personId
        }) || composerTypeLabel(kind).toLowerCase()) +
        ".",
      true
    );
  }

  function paintAssociates(record, node) {
    var host = byId("investigationAssociates");
    if (!host) {
      return;
    }
    if (!node) {
      host.hidden = true;
      host.replaceChildren();
      return;
    }
    host.hidden = false;
    host.setAttribute("data-host-type", node.objectType);
    host.setAttribute("data-host-id", node.objectId);
    var types = composerTypesForHost(node.objectType);
    if (types.indexOf(associatesDraft.objectType) === -1) {
      associatesDraft.objectType = types[0] || "PERSON";
      associatesDraft.reason = "";
    }
    if (!associatesDraft.reason) {
      associatesDraft.reason = defaultAssociateReason(
        node.objectType,
        associatesDraft.objectType
      );
    }
    var m = model();
    var rows = [];
    if (m.store.associationsFor) {
      (m.store.associationsFor(node.objectType, node.objectId) || []).forEach(function (row) {
        var other = associatedOther(row, node.objectType, node.objectId);
        if (!other) {
          return;
        }
        var onWall = nodeForObject(record, other.objectType, other.objectId);
        rows.push({
          associationId: row.associationId,
          objectType: other.objectType,
          objectId: other.objectId,
          reason: row.reason || (row.reasons && row.reasons[0]) || "",
          label: nodeTitle({ objectType: other.objectType, objectId: other.objectId }),
          onWall: !!onWall,
          nodeId: onWall ? onWall.nodeId : ""
        });
      });
    }
    host.replaceChildren();
    var heading = document.createElement("p");
    heading.className = "investigation-associates-label";
    heading.textContent = "Associated";
    host.appendChild(heading);
    var list = document.createElement("ul");
    list.className = "investigation-associate-list";
    rows.forEach(function (row) {
      var li = document.createElement("li");
      li.className = "investigation-associate-row";
      var kind = document.createElement("span");
      kind.className = "investigation-outline-kind";
      kind.textContent = composerTypeLabel(row.objectType);
      li.appendChild(kind);
      var nameBtn = document.createElement("button");
      nameBtn.type = "button";
      nameBtn.className = "investigation-associate-name";
      nameBtn.setAttribute("data-associate-focus", row.nodeId || "");
      nameBtn.setAttribute("data-associate-object", row.objectId);
      nameBtn.setAttribute("data-associate-object-type", row.objectType);
      nameBtn.textContent = row.label || composerTypeLabel(row.objectType);
      li.appendChild(nameBtn);
      var sel = document.createElement("select");
      sel.setAttribute("data-associate-reason", row.associationId);
      fillReasonSelect(sel, node.objectType, row.objectType, row.reason);
      li.appendChild(sel);
      if (row.onWall) {
        var drop = document.createElement("button");
        drop.type = "button";
        drop.className = "action-button-secondary compact";
        drop.setAttribute("data-associate-remove", row.associationId);
        drop.textContent = "×";
        drop.title = "Remove this link from the wall";
        li.appendChild(drop);
      } else {
        var place = document.createElement("button");
        place.type = "button";
        place.className = "action-button-secondary compact";
        place.setAttribute("data-associate-place", row.objectId);
        place.setAttribute("data-associate-place-type", row.objectType);
        place.setAttribute("data-associate-place-reason", row.reason);
        place.textContent = "Place on wall";
        li.appendChild(place);
      }
      list.appendChild(li);
    });
    host.appendChild(list);
    var composer = document.createElement("div");
    composer.className = "investigation-associate-composer";
    var typeSel = document.createElement("select");
    typeSel.setAttribute("data-associate-type", "");
    types.forEach(function (type) {
      var opt = document.createElement("option");
      opt.value = type;
      opt.textContent = composerTypeLabel(type);
      typeSel.appendChild(opt);
    });
    typeSel.value = associatesDraft.objectType;
    composer.appendChild(typeSel);
    var input = document.createElement("input");
    input.type = "text";
    input.setAttribute("data-associate-input", "");
    input.autocomplete = "off";
    input.spellcheck = false;
    input.placeholder = composerPlaceholder(associatesDraft.objectType);
    input.value = associatesDraft.query || "";
    composer.appendChild(input);
    var reasonSel = document.createElement("select");
    reasonSel.setAttribute("data-associate-new-reason", "");
    fillReasonSelect(
      reasonSel,
      node.objectType,
      associatesDraft.objectType,
      associatesDraft.reason
    );
    composer.appendChild(reasonSel);
    var suggest = document.createElement("ul");
    suggest.className = "investigation-associate-suggest";
    suggest.setAttribute("data-associate-suggest", "");
    suggest.hidden = true;
    composer.appendChild(suggest);
    host.appendChild(composer);
    paintAssociateSuggest(host);
  }

  function paintInspector(record) {
    var shell = byId("investigationInspector");
    var cardHost = byId("investigationInspectorCard");
    var empty = byId("investigationInspectorEmpty");
    var heading = byId("investigationInspectorTitle");
    if (!shell || !cardHost) {
      return;
    }
    var node = record && nodeById(record, record.focusNodeId);
    var removeBtn = byId("investigationRemoveNode");
    var actions = byId("investigationInspectorActions");
    var junkBtn = byId("investigationJunkNode");
    var deleteBtn = byId("investigationDeleteNode");
    if (removeBtn) {
      removeBtn.hidden = !node;
    }
    if (actions) {
      actions.hidden = !node;
    }
    if (node && model().store.objectDisposition) {
      var disp = model().store.objectDisposition(
        node.objectType,
        node.objectId,
        { investigationId: record.investigationId, nodeId: node.nodeId }
      );
      if (junkBtn) {
        junkBtn.disabled = !disp.canJunk;
        junkBtn.title = disp.caseSubject
          ? "Cannot junk a case subject."
          : disp.junked
            ? "Already junked."
            : "Keep the record, hide from reuse, take off every wall.";
      }
      if (deleteBtn) {
        deleteBtn.disabled = !disp.canDelete;
        deleteBtn.title = disp.caseSubject
          ? "Cannot delete a case subject."
          : disp.referenced
            ? "Still on another wall or a case. Remove those first, or Junk."
            : "Permanently delete this record.";
      }
    }
    if (!node) {
      inspectorPainted = { nodeId: "", objectId: "", objectType: "" };
      shell.removeAttribute("data-node-id");
      shell.removeAttribute("data-object-id");
      shell.removeAttribute("data-object-type");
      cardHost.replaceChildren();
      paintAssociates(record, null);
      if (empty) {
        empty.hidden = false;
      }
      if (heading) {
        heading.textContent = "Card";
      }
      inspectorFocusField = false;
      associatesFocusComposer = false;
      associatesDraft = { query: "", reason: "", highlight: 0, objectType: "PERSON" };
      return;
    }
    var label = nodeTitle(node);
    if (heading) {
      heading.textContent = label;
    }
    var sameCard =
      inspectorPainted.nodeId === node.nodeId &&
      inspectorPainted.objectId === node.objectId &&
      inspectorPainted.objectType === node.objectType &&
      cardHost.querySelector("[data-card]");
    if (inspectorPainted.nodeId && inspectorPainted.nodeId !== node.nodeId) {
      associatesDraft = { query: "", reason: "", highlight: 0, objectType: "PERSON" };
    }
    if (!sameCard) {
      inspectorPainted = {
        nodeId: node.nodeId,
        objectId: node.objectId,
        objectType: node.objectType
      };
      shell.setAttribute("data-node-id", node.nodeId);
      shell.setAttribute("data-object-id", node.objectId);
      shell.setAttribute("data-object-type", node.objectType);
      var oldHost = cardHost.querySelector("[data-card-photo]");
      if (oldHost && root.mediaCard && typeof root.mediaCard.unmount === "function") {
        root.mediaCard.unmount(oldHost);
      }
      var card = buildIdentityCard(node);
      cardHost.replaceChildren();
      if (card) {
        cardHost.appendChild(card);
      }
    }
    if (empty) {
      empty.hidden = true;
    }
    paintAssociates(record, node);
    var first = cardHost.querySelector("[data-card] input, [data-card] select");
    if (first && inspectorFocusField) {
      first.focus();
    }
    inspectorFocusField = false;
    if (associatesFocusComposer) {
      var composerInput = byId("investigationAssociates") &&
        byId("investigationAssociates").querySelector("[data-associate-input]");
      if (composerInput) {
        composerInput.focus();
      }
      associatesFocusComposer = false;
    }
  }

  function panToNode(node) {
    if (!node) {
      return;
    }
    panX = 64 - Number(node.x || 0) * scale + 80;
    panY = 64 - Number(node.y || 0) * scale + 80;
    applyTransform();
  }

  function clearPlex() {
    var record = loadRecord();
    if (!record) {
      return;
    }
    record.focusNodeId = "";
    saveRecord(record);
    paint(loadRecord());
  }

  function focusVehicle(vehicleId) {
    var record = loadRecord();
    if (!record) {
      return;
    }
    var node = nodeForObject(record, "VEHICLE", vehicleId);
    if (!node) {
      return;
    }
    panToNode(node);
    focusNode(node.nodeId);
  }

  function hideReasonPop() {
    var pop = byId("investigationReasonPop");
    if (pop) {
      pop.hidden = true;
      pop.replaceChildren();
    }
  }

  function tabAssociateTarget(focus, shift) {
    var type = "PERSON";
    var reason = "REGISTERED_OWNER_OF";
    if (!focus) {
      return { objectType: type, reason: reason };
    }
    if (shift) {
      if (focus.objectType === "BUSINESS") {
        type = "LOCATION";
        reason = "OPERATES_AT";
      } else if (focus.objectType === "ENTITY") {
        type = "LOCATION";
        reason = "BASED_AT";
      } else if (focus.objectType === "VEHICLE" || focus.objectType === "PERSON") {
        type = "LOCATION";
        reason =
          focus.objectType === "VEHICLE" ? "VEHICLE_PARKING" : "CURRENT_RESIDENCE";
      } else {
        type = "VEHICLE";
        reason = "VEHICLE_PARKING";
      }
    } else if (focus.objectType === "VEHICLE") {
      type = "PERSON";
      reason = "REGISTERED_OWNER_OF";
    } else if (focus.objectType === "PERSON") {
      type = "VEHICLE";
      reason = "REGISTERED_OWNER_OF";
    } else if (focus.objectType === "BUSINESS") {
      type = "PERSON";
      reason = "EMPLOYED_BY";
    } else if (focus.objectType === "ENTITY") {
      type = "PERSON";
      reason = "MEMBER_OF";
    } else {
      type = "PERSON";
      reason = "CURRENT_RESIDENCE";
    }
    return { objectType: type, reason: reason };
  }

  function openTabComposer(shift) {
    var record = loadRecord();
    var focus = record && nodeById(record, record.focusNodeId);
    if (!focus) {
      setStatus("Focus an object first.");
      return;
    }
    var pick = tabAssociateTarget(focus, shift);
    var types = composerTypesForHost(focus.objectType);
    if (types.indexOf(pick.objectType) === -1) {
      pick.objectType = types[0] || "PERSON";
      pick.reason = defaultAssociateReason(focus.objectType, pick.objectType);
    }
    associatesDraft.objectType = pick.objectType;
    associatesDraft.reason =
      pick.reason || defaultAssociateReason(focus.objectType, pick.objectType);
    associatesDraft.query = "";
    associatesDraft.highlight = 0;
    associatesFocusComposer = true;
    inspectorFocusField = false;
    windowsOpen.card = true;
    persistWindows();
    paint(loadRecord());
    setStatus(composerPlaceholder(pick.objectType));
  }

  function openEdgeMenu(linkId, clientX, clientY) {
    var record = loadRecord();
    var m = model();
    var pop = byId("investigationReasonPop");
    if (!record || !pop || !linkId) {
      return;
    }
    var link = null;
    ((record.links || [])).forEach(function (row) {
      if (row && row.linkId === linkId) {
        link = row;
      }
    });
    if (!link) {
      return;
    }
    var fromNode = nodeForObject(record, link.from.type, link.from.id);
    var toNode = nodeForObject(record, link.to.type, link.to.id);
    var reasons = fromNode && toNode
      ? reasonsForPair(fromNode.objectType, toNode.objectType)
      : [];
    pop.replaceChildren();
    reasons.forEach(function (row) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className =
        (link.reasons && link.reasons[0]) === row.value
          ? "action-button compact"
          : "action-button-secondary compact";
      btn.textContent = row.label;
      btn.addEventListener("click", function () {
        hideReasonPop();
        if (!fromNode || !toNode || !m.store.disconnectInvestigationLink) {
          return;
        }
        m.store.disconnectInvestigationLink(record.investigationId, linkId);
        m.store.connectInvestigationNodes(
          record.investigationId,
          fromNode.nodeId,
          toNode.nodeId,
          row.value
        );
        paint(loadRecord());
        setStatus(reasonPhrase(row.value) + ".", true);
      });
      pop.appendChild(btn);
    });
    var drop = document.createElement("button");
    drop.type = "button";
    drop.className = "action-button-secondary compact";
    drop.textContent = "Disconnect";
    drop.addEventListener("click", function () {
      hideReasonPop();
      var result =
        m.store.disconnectInvestigationLink &&
        m.store.disconnectInvestigationLink(record.investigationId, linkId);
      if (!result || !result.ok) {
        setStatus((result && result.error) || "Could not remove the link.");
        return;
      }
      paint(loadRecord());
      setStatus("Link removed.", true);
    });
    pop.appendChild(drop);
    pop.hidden = false;
    pop.style.left = clientX + "px";
    pop.style.top = clientY + "px";
  }

  function connect(fromNodeId, toNodeId, clientX, clientY) {
    var record = loadRecord();
    var m = model();
    if (!record || !m.store.connectInvestigationNodes) {
      return;
    }
    var fromNode = nodeById(record, fromNodeId);
    var toNode = nodeById(record, toNodeId);
    if (!fromNode || !toNode) {
      return;
    }
    var reasons = reasonsForPair(fromNode.objectType, toNode.objectType);
    if (!reasons.length) {
      setStatus("Those objects cannot be linked.");
      return;
    }
    function apply(reason) {
      hideReasonPop();
      var result = m.store.connectInvestigationNodes(
        record.investigationId,
        fromNodeId,
        toNodeId,
        reason
      );
      if (!result || !result.ok) {
        setStatus((result && result.error) || "Could not link those objects.");
        return;
      }
      paint(loadRecord());
      setStatus(reasonPhrase(reason) + ".", true);
    }
    if (reasons.length === 1) {
      apply(reasons[0].value);
      return;
    }
    var pop = byId("investigationReasonPop");
    if (!pop) {
      apply(reasons[0].value);
      return;
    }
    pop.replaceChildren();
    reasons.forEach(function (row, index) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = index === 0 ? "action-button compact" : "action-button-secondary compact";
      btn.textContent = row.label;
      btn.addEventListener("click", function () {
        apply(row.value);
      });
      pop.appendChild(btn);
    });
    pop.hidden = false;
    pop.style.left = clientX + "px";
    pop.style.top = clientY + "px";
  }

  function isInteractive(el) {
    if (!el || !el.closest) {
      return false;
    }
    return !!el.closest("input, select, textarea, button, a, label");
  }

  function bindWindowDrag() {
    document.querySelectorAll(".investigation-window").forEach(function (el) {
      var head = el.querySelector(".investigation-dock-head");
      if (!head || head.dataset.dragBound === "true") {
        return;
      }
      head.dataset.dragBound = "true";
      head.addEventListener("pointerdown", function (event) {
        if (event.button !== 0) {
          return;
        }
        if (event.target.closest && event.target.closest("button, input, select, textarea, a, label")) {
          return;
        }
        if (compactWindows()) {
          return;
        }
        var name = windowPanelName(el);
        var wall = wallEl();
        if (!name || !wall) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        var box = el.getBoundingClientRect();
        windowZ += 1;
        el.style.zIndex = String(windowZ);
        windowDrag = {
          name: name,
          el: el,
          dx: event.clientX - box.left,
          dy: event.clientY - box.top,
          startX: event.clientX,
          startY: event.clientY,
          moved: false,
          pointerId: event.pointerId
        };
        el.classList.add("is-dragging");
        try {
          head.setPointerCapture(event.pointerId);
        } catch (err) {}
      });
      head.addEventListener("pointermove", function (event) {
        if (!windowDrag || windowDrag.el !== el) {
          return;
        }
        var wall = wallEl();
        if (!wall) {
          return;
        }
        if (
          !windowDrag.moved &&
          Math.abs(event.clientX - windowDrag.startX) < 4 &&
          Math.abs(event.clientY - windowDrag.startY) < 4
        ) {
          return;
        }
        windowDrag.moved = true;
        var wallRect = wall.getBoundingClientRect();
        var box = el.getBoundingClientRect();
        var next = clampWindowPos(
          event.clientX - wallRect.left - windowDrag.dx,
          event.clientY - wallRect.top - windowDrag.dy,
          box.width,
          box.height,
          wallRect.width,
          wallRect.height
        );
        el.style.left = next.x + "px";
        el.style.top = next.y + "px";
        el.style.right = "auto";
        el.classList.add("is-moved");
      });
      function endDrag() {
        if (!windowDrag || windowDrag.el !== el) {
          return;
        }
        el.classList.remove("is-dragging");
        var wall = wallEl();
        if (windowDrag.moved && wall) {
          var wallRect = wall.getBoundingClientRect();
          var box = el.getBoundingClientRect();
          windowsPos[windowDrag.name] = clampWindowPos(
            box.left - wallRect.left,
            box.top - wallRect.top,
            box.width,
            box.height,
            wallRect.width,
            wallRect.height
          );
          persistWindows();
        }
        windowDrag = null;
      }
      head.addEventListener("pointerup", endDrag);
      head.addEventListener("pointercancel", endDrag);
    });
  }

  function bind() {
    var wall = wallEl();
    if (!wall || wall.dataset.wallBound === "true") {
      return;
    }
    wall.dataset.wallBound = "true";
    windowsLoaded = true;
    readStoredWindows();
    applyWindows();
    applyTransform();

    document.querySelectorAll("[data-wall-type]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        setPlaceType(btn.getAttribute("data-wall-type"), { toggle: true });
      });
    });

    var zoomIn = byId("investigationZoomIn");
    var zoomOut = byId("investigationZoomOut");
    if (zoomIn) {
      zoomIn.addEventListener("click", function () {
        scale = Math.min(2, scale + 0.15);
        applyTransform();
      });
    }
    if (zoomOut) {
      zoomOut.addEventListener("click", function () {
        scale = Math.max(0.4, scale - 0.15);
        applyTransform();
      });
    }

    wall.addEventListener(
      "wheel",
      function (event) {
        if (event.target.closest && event.target.closest(".investigation-window")) {
          return;
        }
        event.preventDefault();
        var next = scale + (event.deltaY < 0 ? 0.1 : -0.1);
        scale = Math.max(0.4, Math.min(2, next));
        applyTransform();
      },
      { passive: false }
    );

    wall.addEventListener("click", function (event) {
      var edit = event.target.closest && event.target.closest(".investigation-node-edit");
      if (!edit) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      var nodeEl = edit.closest(".investigation-node");
      if (nodeEl) {
        openCard(nodeEl.getAttribute("data-node-id"));
      }
    });
    wall.addEventListener("dblclick", function (event) {
      if (event.target.closest && event.target.closest(".investigation-window")) {
        return;
      }
      var nodeEl = event.target.closest && event.target.closest(".investigation-node");
      if (nodeEl) {
        openCard(nodeEl.getAttribute("data-node-id"));
      }
    });

    wall.addEventListener("pointerdown", function (event) {
      if (event.button !== 0) {
        return;
      }
      if (event.target.closest && event.target.closest(".investigation-window")) {
        return;
      }
      var port = event.target.closest && event.target.closest("[data-port]");
      var onChipTitle =
        event.target.closest && event.target.closest(".investigation-node-title");
      if (isInteractive(event.target) && !port && !onChipTitle) {
        return;
      }
      var linkId =
        event.target.getAttribute && event.target.getAttribute("data-link-id");
      if (linkId) {
        event.preventDefault();
        drag = {
          kind: "edge",
          linkId: linkId,
          pointerId: event.pointerId,
          moved: false
        };
        wall.setPointerCapture(event.pointerId);
        return;
      }
      var nodeEl = event.target.closest && event.target.closest(".investigation-node");
      if (port && nodeEl) {
        event.preventDefault();
        event.stopPropagation();
        var origin = screenToWorld(event.clientX, event.clientY);
        drag = {
          kind: "connect",
          nodeId: nodeEl.getAttribute("data-node-id"),
          pointerId: event.pointerId,
          moved: false
        };
        wall.setPointerCapture(event.pointerId);
        var rubber = byId("investigationRubber");
        if (rubber) {
          rubber.removeAttribute("hidden");
          rubber.setAttribute(
            "d",
            "M " + origin.x + " " + origin.y + " L " + origin.x + " " + origin.y
          );
        }
        return;
      }
      if (nodeEl && !isInteractive(event.target)) {
        event.preventDefault();
        var start = screenToWorld(event.clientX, event.clientY);
        drag = {
          kind: "node",
          nodeId: nodeEl.getAttribute("data-node-id"),
          pointerId: event.pointerId,
          ox: start.x - parseFloat(nodeEl.style.left || "0"),
          oy: start.y - parseFloat(nodeEl.style.top || "0"),
          sx: event.clientX,
          sy: event.clientY,
          moved: false
        };
        wall.setPointerCapture(event.pointerId);
        return;
      }
      if (nodeEl) {
        return;
      }
      drag = {
        kind: "pan",
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        panX: panX,
        panY: panY,
        moved: false
      };
      wall.setPointerCapture(event.pointerId);
    });

    wall.addEventListener("pointermove", function (event) {
      if (!drag || drag.pointerId !== event.pointerId) {
        return;
      }
      if (drag.kind === "pan") {
        var dx = event.clientX - drag.x;
        var dy = event.clientY - drag.y;
        if (Math.abs(dx) + Math.abs(dy) > 4) {
          drag.moved = true;
        }
        panX = drag.panX + dx;
        panY = drag.panY + dy;
        applyTransform();
        return;
      }
      if (drag.kind === "node") {
        if (
          !drag.moved &&
          Math.abs(event.clientX - drag.sx) + Math.abs(event.clientY - drag.sy) <= 4
        ) {
          return;
        }
        var world = screenToWorld(event.clientX, event.clientY);
        var x = world.x - drag.ox;
        var y = world.y - drag.oy;
        var el = document.querySelector('[data-node-id="' + drag.nodeId + '"]');
        if (el) {
          el.style.left = x + "px";
          el.style.top = y + "px";
        }
        drag.x = x;
        drag.y = y;
        drag.moved = true;
        paintEdges(loadRecord());
        return;
      }
      if (drag.kind === "connect") {
        var fromEl = document.querySelector('[data-node-id="' + drag.nodeId + '"]');
        var record = loadRecord();
        var fromNode = record && nodeById(record, drag.nodeId);
        var a = fromNode
          ? {
              x: Number(fromNode.x || 0) + (fromEl ? fromEl.offsetWidth / 2 : 0),
              y: Number(fromNode.y || 0) + (fromEl ? fromEl.offsetHeight / 2 : 0)
            }
          : screenToWorld(event.clientX, event.clientY);
        var b = screenToWorld(event.clientX, event.clientY);
        var rubber = byId("investigationRubber");
        if (rubber) {
          rubber.removeAttribute("hidden");
          rubber.setAttribute("d", "M " + a.x + " " + a.y + " L " + b.x + " " + b.y);
        }
        drag.moved = true;
      }
    });

    wall.addEventListener("pointerup", function (event) {
      if (!drag || drag.pointerId !== event.pointerId) {
        return;
      }
      var kind = drag.kind;
      var moved = drag.moved;
      var nodeId = drag.nodeId;
      var x = drag.x;
      var y = drag.y;
      var linkId = drag.linkId;
      drag = null;
      var rubber = byId("investigationRubber");
      if (rubber) {
        rubber.setAttribute("hidden", "true");
      }
      if (kind === "node") {
        if (moved && typeof x === "number") {
          moveNode(nodeId, x, y);
        } else {
          focusNode(nodeId);
        }
        return;
      }
      if (kind === "connect") {
        var target = document.elementFromPoint(event.clientX, event.clientY);
        var toEl = target && target.closest && target.closest(".investigation-node");
        var toId = toEl && toEl.getAttribute("data-node-id");
        if (toId && toId !== nodeId) {
          connect(nodeId, toId, event.clientX, event.clientY);
        }
        return;
      }
      if (kind === "edge") {
        if (!moved) {
          openEdgeMenu(linkId, event.clientX, event.clientY);
        }
        return;
      }
      if (kind === "pan" && !moved) {
        placeAt(screenToWorld(event.clientX, event.clientY));
      }
    });

    var plexAll = byId("investigationPlexAll");
    if (plexAll && plexAll.dataset.plexBound !== "true") {
      plexAll.dataset.plexBound = "true";
      plexAll.addEventListener("click", function (event) {
        event.preventDefault();
        clearPlex();
      });
    }
    var inspectorCard = byId("investigationInspectorCard");
    if (inspectorCard && inspectorCard.dataset.inspectorBound !== "true") {
      inspectorCard.dataset.inspectorBound = "true";
      inspectorCard.addEventListener("input", schedulePersistInspector);
      inspectorCard.addEventListener("change", schedulePersistInspector);
    }
    var associates = byId("investigationAssociates");
    if (associates && associates.dataset.associateBound !== "true") {
      associates.dataset.associateBound = "true";
      associates.addEventListener("input", function (event) {
        var input = event.target.closest && event.target.closest("[data-associate-input]");
        if (!input) {
          return;
        }
        associatesDraft.query = input.value;
        paintAssociateSuggest(associates);
      });
      associates.addEventListener("change", function (event) {
        var typeSel =
          event.target.closest && event.target.closest("[data-associate-type]");
        if (typeSel) {
          associatesDraft.objectType = typeSel.value;
          associatesDraft.reason = "";
          associatesDraft.highlight = 0;
          var rec = loadRecord();
          paintAssociates(rec, rec && nodeById(rec, rec.focusNodeId));
          var input = associates.querySelector("[data-associate-input]");
          if (input) {
            input.focus();
          }
          return;
        }
        var newReason =
          event.target.closest && event.target.closest("[data-associate-new-reason]");
        if (newReason) {
          associatesDraft.reason = newReason.value;
          return;
        }
        var reasonSel =
          event.target.closest && event.target.closest("[data-associate-reason]");
        if (!reasonSel) {
          return;
        }
        var rec = loadRecord();
        var m = model();
        if (!rec || !m.store.setInvestigationAssociationReason) {
          return;
        }
        var result = m.store.setInvestigationAssociationReason(
          rec.investigationId,
          reasonSel.getAttribute("data-associate-reason"),
          reasonSel.value
        );
        if (!result || !result.ok) {
          setStatus((result && result.error) || "Could not change that relationship.");
          paintAssociates(rec, nodeById(rec, rec.focusNodeId));
          return;
        }
        paint(loadRecord());
        setStatus("Updated relationship.", true);
      });
      associates.addEventListener("keydown", function (event) {
        var input = event.target.closest && event.target.closest("[data-associate-input]");
        if (!input) {
          return;
        }
        var hostType = associates.getAttribute("data-host-type") || "";
        var except =
          associatesDraft.objectType === hostType
            ? associates.getAttribute("data-host-id") || ""
            : "";
        var hits = suggestObjects(
          associatesDraft.query,
          associatesDraft.objectType || "PERSON",
          except
        );
        if (event.key === "ArrowDown" && hits.length) {
          event.preventDefault();
          associatesDraft.highlight = Math.min(
            hits.length - 1,
            (associatesDraft.highlight || 0) + 1
          );
          paintAssociateSuggest(associates);
          return;
        }
        if (event.key === "ArrowUp" && hits.length) {
          event.preventDefault();
          associatesDraft.highlight = Math.max(0, (associatesDraft.highlight || 0) - 1);
          paintAssociateSuggest(associates);
          return;
        }
        if (event.key === "Enter") {
          event.preventDefault();
          submitAssociateComposer();
        }
        if (event.key === "Escape") {
          event.preventDefault();
          associatesDraft.query = "";
          associatesDraft.highlight = 0;
          input.value = "";
          paintAssociateSuggest(associates);
        }
      });
      associates.addEventListener("click", function (event) {
        var pick = event.target.closest && event.target.closest("[data-associate-pick]");
        if (pick) {
          event.preventDefault();
          submitAssociateComposer(
            pick.getAttribute("data-associate-pick"),
            pick.getAttribute("data-associate-pick-type")
          );
          return;
        }
        var focusBtn =
          event.target.closest && event.target.closest("[data-associate-focus]");
        if (focusBtn) {
          event.preventDefault();
          var rec = loadRecord();
          var nodeId = focusBtn.getAttribute("data-associate-focus");
          var objectId = focusBtn.getAttribute("data-associate-object");
          var objectType = focusBtn.getAttribute("data-associate-object-type");
          var node = nodeId && rec ? nodeById(rec, nodeId) : null;
          if (!node && rec && objectId && objectType) {
            node = nodeForObject(rec, objectType, objectId);
          }
          if (node) {
            panToNode(node);
            focusNode(node.nodeId);
          }
          return;
        }
        var placeBtn =
          event.target.closest && event.target.closest("[data-associate-place]");
        if (placeBtn) {
          event.preventDefault();
          associatesDraft.objectType =
            placeBtn.getAttribute("data-associate-place-type") ||
            associatesDraft.objectType;
          associatesDraft.reason =
            placeBtn.getAttribute("data-associate-place-reason") ||
            associatesDraft.reason;
          submitAssociateComposer(
            placeBtn.getAttribute("data-associate-place"),
            placeBtn.getAttribute("data-associate-place-type")
          );
          return;
        }
        var removeBtn =
          event.target.closest && event.target.closest("[data-associate-remove]");
        if (!removeBtn) {
          return;
        }
        event.preventDefault();
        var current = loadRecord();
        var store = model().store;
        if (!current || !store.disconnectInvestigationAssociation) {
          return;
        }
        var dropped = store.disconnectInvestigationAssociation(
          current.investigationId,
          removeBtn.getAttribute("data-associate-remove")
        );
        if (!dropped || !dropped.ok) {
          setStatus((dropped && dropped.error) || "Could not remove that link.");
          return;
        }
        paint(loadRecord());
        setStatus("Removed the link from this wall.", true);
      });
    }
    var removeBtn = byId("investigationRemoveNode");
    if (removeBtn && removeBtn.dataset.removeBound !== "true") {
      removeBtn.dataset.removeBound = "true";
      removeBtn.addEventListener("click", function () {
        if (typeof window.removeFocusedInvestigationObject === "function") {
          window.removeFocusedInvestigationObject();
        }
      });
    }
    var junkBtn = byId("investigationJunkNode");
    if (junkBtn && junkBtn.dataset.junkBound !== "true") {
      junkBtn.dataset.junkBound = "true";
      junkBtn.addEventListener("click", function () {
        if (typeof window.junkFocusedInvestigationObject === "function") {
          window.junkFocusedInvestigationObject();
        }
      });
    }
    var deleteBtn = byId("investigationDeleteNode");
    if (deleteBtn && deleteBtn.dataset.deleteBound !== "true") {
      deleteBtn.dataset.deleteBound = "true";
      deleteBtn.addEventListener("click", function () {
        if (typeof window.deleteFocusedInvestigationObject === "function") {
          window.deleteFocusedInvestigationObject();
        }
      });
    }
    var outlineSearch = byId("investigationOutlineSearch");
    if (outlineSearch && outlineSearch.dataset.outlineBound !== "true") {
      outlineSearch.dataset.outlineBound = "true";
      outlineSearch.addEventListener("input", function () {
        outlineQuery = outlineSearch.value;
        refreshOutlineFilter();
      });
      outlineSearch.addEventListener("keydown", function (event) {
        if (event.key === "Enter") {
          event.preventDefault();
          jumpFirstOutlineMatch();
        }
        if (event.key === "Escape") {
          event.preventDefault();
          clearOutlineFilter();
        }
      });
    }
    var hitsBtn = byId("investigationOutlineHits");
    if (hitsBtn && hitsBtn.dataset.hitsBound !== "true") {
      hitsBtn.dataset.hitsBound = "true";
      hitsBtn.addEventListener("click", function () {
        outlineHitsOnly = !outlineHitsOnly;
        refreshOutlineFilter();
      });
    }
    document.querySelectorAll("[data-window]").forEach(function (btn) {
      btn.addEventListener("click", function (event) {
        event.preventDefault();
        toggleWindow(btn.getAttribute("data-window"));
      });
    });
    bindWindowDrag();
    if (document.body && document.body.dataset.windowResize !== "true") {
      document.body.dataset.windowResize = "true";
      window.addEventListener("resize", function () {
        applyWindowPositions();
      });
    }
    document.querySelectorAll("[data-window-close]").forEach(function (btn) {
      btn.addEventListener("click", function (event) {
        event.preventDefault();
        setWindow(btn.getAttribute("data-window-close"), false);
      });
    });

    document.addEventListener("click", function (event) {
      var pop = byId("investigationReasonPop");
      if (!pop || pop.hidden) {
        return;
      }
      if (pop.contains(event.target)) {
        return;
      }
      hideReasonPop();
    });

    if (document.body && document.body.dataset.wallKeys !== "true") {
      document.body.dataset.wallKeys = "true";
      document.addEventListener("keydown", function (event) {
        if (document.body.getAttribute("data-page") !== "investigate") {
          return;
        }
        if (isInteractive(event.target)) {
          return;
        }
        if (event.key === "Escape" && windowsOpen.card) {
          event.preventDefault();
          setWindow("card", false);
          return;
        }
        if (event.key === "Enter") {
          event.preventDefault();
          openCard();
          return;
        }
        if (event.key === "Delete" || event.key === "Backspace") {
          event.preventDefault();
          if (typeof window.removeFocusedInvestigationObject === "function") {
            window.removeFocusedInvestigationObject();
          }
          return;
        }
        if (event.key !== "Tab") {
          return;
        }
        event.preventDefault();
        openTabComposer(event.shiftKey);
      });
    }
  }

  root.investigationWall = {
    paint: paint,
    bind: bind,
    viewCenter: viewCenter,
    lotStripPosition: lotStripPosition,
    focusVehicle: focusVehicle,
    focusNode: focusNode,
    setPlaceType: setPlaceType,
    defaultPlaceType: defaultPlaceType,
    applyWindows: applyWindows,
    setWindow: setWindow,
    openCard: openCard,
    tabAssociateTarget: tabAssociateTarget,
    parseWindowPos: parseWindowPos,
    clampWindowPos: clampWindowPos
  };
})(typeof window !== "undefined" ? window : globalThis);
