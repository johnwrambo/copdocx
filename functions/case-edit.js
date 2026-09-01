/**
 * Case view slide-over: edit one object without the full lead form.
 */
(function (global) {
  "use strict";

  var root = (global.COPDoc = global.COPDoc || {});
  var state = { kind: "", id: "" };

  function byId(id) {
    return document.getElementById(id);
  }

  function queryId() {
    try {
      return new URLSearchParams(window.location.search).get("id") || "";
    } catch (error) {
      return "";
    }
  }

  function model() {
    return root.model;
  }

  function setStatus(message, ok) {
    if (root.setAppBarStatus) {
      root.setAppBarStatus(message, ok ? { ok: true } : undefined);
    }
  }

  function subjectOf(snap) {
    var m = model();
    if (m && m.subjectOf) {
      return m.subjectOf(snap);
    }
    return snap && snap.person;
  }

  function fillFields(rootEl, data) {
    if (!rootEl || !data) {
      return;
    }
    Object.keys(data).forEach(function (key) {
      var value = data[key];
      if (value && typeof value === "object") {
        return;
      }
      var nodes = rootEl.querySelectorAll('[data-field="' + key + '"]');
      Array.prototype.forEach.call(nodes, function (el) {
        var type = (el.type || "").toLowerCase();
        if (type === "checkbox") {
          el.checked = !!value;
          return;
        }
        if (type === "radio") {
          el.checked = el.value === String(value || "");
          return;
        }
        el.value = value == null ? "" : String(value);
      });
    });
  }

  function panel() {
    return byId("caseEditPanel");
  }

  function host() {
    return byId("caseEditHost");
  }

  function cloneTemplate(id) {
    var tpl = byId(id);
    if (!tpl || !tpl.content || !tpl.content.firstElementChild) {
      return null;
    }
    var card = tpl.content.firstElementChild.cloneNode(true);
    if (typeof uniqueCardIds === "function") {
      uniqueCardIds(card, "case-edit", Date.now() % 100000);
    }
    return card;
  }

  function closePanel() {
    var wrap = panel();
    var backdrop = byId("caseEditBackdrop");
    if (wrap) {
      wrap.hidden = true;
    }
    if (backdrop) {
      backdrop.hidden = true;
    }
    var h = host();
    if (h) {
      h.replaceChildren();
    }
    state.kind = "";
    state.id = "";
  }

  function showPanel(title) {
    var wrap = panel();
    var backdrop = byId("caseEditBackdrop");
    var heading = byId("caseEditTitle");
    if (heading) {
      heading.textContent = title;
    }
    if (backdrop) {
      backdrop.hidden = false;
    }
    if (wrap) {
      wrap.hidden = false;
    }
  }

  function loadSnap() {
    var m = model();
    if (!m || !m.store) {
      return null;
    }
    m.store.loadFromDisk();
    return m.store.getLead(queryId());
  }

  function commit(mutator, okMsg) {
    var m = model();
    var snap = loadSnap();
    if (!snap || !m.isCommitted(snap)) {
      setStatus("Open a filed case to edit.");
      return;
    }
    mutator(snap, m);
    var saved = m.store.saveLead(snap, { mode: "commit" });
    if (!saved || !saved.ok) {
      setStatus((saved && saved.error) || "Could not save.");
      return;
    }
    closePanel();
    setStatus(okMsg || "Saved.", true);
    if (typeof window.paintCaseView === "function") {
      window.paintCaseView();
    }
  }

  function collectLocationCard(card) {
    var m = model();
    if (m && typeof m.collectLocation === "function") {
      return m.collectLocation(card);
    }
    var f = m.readFields(card);
    return m.createLocation({
      locationId: card.dataset.entityId || f.locationId,
      street: f.street || "",
      street2: f.street2 || "",
      city: f.city || "",
      state: f.state || "",
      zip: f.zip || "",
      latitude: f.latitude || "",
      longitude: f.longitude || "",
      association: f.locationAssociation || "",
      parksHere: f.parksHere || "",
      targetPriority: f.targetPriority || "",
      pinColor: f.pinColor || ""
    });
  }

  function collectVehicleCard(card) {
    var m = model();
    var f = m.readFields(card);
    var vehicleId = card.dataset.entityId || m.newId("veh");
    card.dataset.entityId = vehicleId;
    var vehicle = m.createVehicle({
      vehicleId: vehicleId,
      licensePlate: String(f.licensePlate || "").toUpperCase(),
      plateState: f.plateState || "",
      vehicleYear: f.vehicleYear || "",
      vehicleMake: f.vehicleMake || "",
      vehicleModel: f.vehicleModel || "",
      vehicleColor: f.vehicleColor || "",
      vehicleBodyStyle: f.vehicleBodyStyle || "",
      vin: f.vin || "",
      registeredOwnerName: f.registeredOwner || "",
      governmentVehicle: false
    });
    var nested = card.querySelectorAll(
      '[data-nested-list="location"] > [data-card="location"]'
    );
    Array.prototype.forEach.call(nested, function (locCard) {
      vehicle.locations.push(collectLocationCard(locCard));
    });
    return vehicle;
  }

  function findLocation(snap, locationId) {
    var subject = subjectOf(snap);
    var found = null;
    function walk(list) {
      (list || []).forEach(function (loc) {
        if (loc && loc.locationId === locationId) {
          found = loc;
        }
      });
    }
    walk(subject && subject.locations);
    (snap.vehicles || []).forEach(function (vehicle) {
      walk(vehicle && vehicle.locations);
    });
    return found;
  }

  function replaceLocation(snap, next) {
    var subject = subjectOf(snap);
    function walk(list) {
      if (!list) {
        return false;
      }
      var i;
      for (i = 0; i < list.length; i++) {
        if (list[i] && list[i].locationId === next.locationId) {
          list[i] = next;
          return true;
        }
      }
      return false;
    }
    if (walk(subject && subject.locations)) {
      snap.person = subject;
      return;
    }
    (snap.vehicles || []).forEach(function (vehicle) {
      walk(vehicle && vehicle.locations);
    });
  }

  function hydrateVehicle(card, vehicle, snap) {
    if (typeof bindVehicleCardFull === "function") {
      bindVehicleCardFull(card);
    } else if (typeof bindVehicleCard === "function") {
      bindVehicleCard(card);
    }
    if (vehicle) {
      card.dataset.entityId = vehicle.vehicleId || "";
      fillFields(card, vehicle);
      fillFields(card, {
        registeredOwner: vehicle.registeredOwnerName || ""
      });
      var make = card.querySelector('[data-field="vehicleMake"]');
      if (make) {
        make.dispatchEvent(new Event("change"));
      }
      fillFields(card, { vehicleModel: vehicle.vehicleModel || "" });
      var modelEl = card.querySelector('[data-field="vehicleModel"]');
      if (modelEl) {
        modelEl.dispatchEvent(new Event("change"));
      }
      if (vehicle.vehicleBodyStyle) {
        fillFields(card, { vehicleBodyStyle: vehicle.vehicleBodyStyle });
      }
      (vehicle.locations || []).forEach(function (location) {
        var locCard =
          card._addNested && card._addNested.location
            ? card._addNested.location()
            : null;
        if (locCard) {
          locCard.dataset.entityId = location.locationId || "";
          fillFields(locCard, location);
          fillFields(locCard, {
            locationAssociation: location.association || ""
          });
          if (root.locationMap && root.locationMap.sync) {
            root.locationMap.sync(locCard);
          }
        }
      });
    }
    if (root.cards && root.cards.paintMedia) {
      root.cards.paintMedia(card, "VEHICLE");
    }
  }

  function hydrateLocation(card, location) {
    if (typeof bindAddressCardFull === "function") {
      bindAddressCardFull(card);
    }
    if (location) {
      card.dataset.entityId = location.locationId || "";
      fillFields(card, location);
      fillFields(card, {
        locationAssociation: location.association || ""
      });
      if (location.latitude && location.longitude && root.locationMap) {
        root.locationMap.sync(card);
      }
    }
    if (root.cards && root.cards.paintMedia) {
      root.cards.paintMedia(card, "LOCATION");
    }
  }

  function openIdentity(snap) {
    var card = cloneTemplate("caseIdentityTemplate");
    var h = host();
    if (!card || !h) {
      return;
    }
    h.appendChild(card);
    var subject = subjectOf(snap) || {};
    var name = subject.name || {};
    fillFields(card, {
      lastName: name.lastName,
      firstName: name.firstName,
      middleName: name.middleName,
      sex: subject.sex,
      dateOfBirth: subject.dateOfBirth,
      ssn: subject.ssn,
      lexId: subject.lexId,
      citizenship: subject.citizenship
    });
    var cit = card.querySelector('[data-field="citizenship"]');
    if (typeof populateCitizenshipSelect === "function") {
      populateCitizenshipSelect(cit, false);
      if (subject.citizenship) {
        cit.value = subject.citizenship;
      }
    }
    if (typeof bindNameCard === "function") {
      bindNameCard(card);
    }
    if (typeof bindAgeCard === "function") {
      bindAgeCard(card);
    }
    showPanel("Edit identity");
  }

  function saveIdentity() {
    var card = host() && host().querySelector("[data-card]");
    var m = model();
    var f = m.readFields(card);
    commit(function (snap) {
      var person = subjectOf(snap);
      person.name = person.name || {};
      person.name.lastName = f.lastName || "";
      person.name.firstName = f.firstName || "";
      person.name.middleName = f.middleName || "";
      person.sex = f.sex || "";
      person.dateOfBirth = f.dateOfBirth || "";
      person.ssn = f.ssn || "";
      person.lexId = f.lexId || "";
      person.citizenship = f.citizenship || "";
      if (typeof updateAgeDisplay === "function") {
        person.age = f.age || person.age;
      }
      snap.person = person;
    }, "Identity saved.");
  }

  function openSource(snap) {
    var card = cloneTemplate("caseSourceTemplate");
    var h = host();
    if (!card || !h) {
      return;
    }
    h.appendChild(card);
    var source = (snap && snap.source) || {};
    fillFields(card, {
      leadSource: source.leadSource,
      caseNumber: source.caseNumber,
      refAgency: source.refAgency,
      refAgencyCode: source.refAgencyCode,
      leadInfo: source.leadInfo,
      probationCheck: source.probationCheck
    });
    var sourceEl = card.querySelector('[data-field="leadSource"]');
    function syncSourceRows() {
      var value = sourceEl ? sourceEl.value : "";
      card.querySelectorAll("[data-source]").forEach(function (row) {
        var keys = (row.getAttribute("data-source") || "").split(/\s+/);
        row.hidden = keys.indexOf(value) === -1;
      });
    }
    if (sourceEl) {
      sourceEl.addEventListener("change", syncSourceRows);
    }
    syncSourceRows();
    showPanel("Edit source");
  }

  function saveSource() {
    var card = host() && host().querySelector("[data-card]");
    var f = model().readFields(card);
    commit(function (snap, m) {
      snap.source = m.createSource({
        leadSource: f.leadSource || "",
        caseNumber: f.caseNumber || "",
        refAgency: f.refAgency || "",
        refAgencyCode: f.refAgencyCode || "",
        probationCheck: !!f.probationCheck,
        leadInfo: f.leadInfo || ""
      });
    }, "Source saved.");
  }

  function openImmigration(snap) {
    var card = cloneTemplate("caseImmigrationTemplate");
    var h = host();
    if (!card || !h) {
      return;
    }
    h.appendChild(card);
    var immigration = (subjectOf(snap) && subjectOf(snap).immigration) || {};
    var disp = card.querySelector('[data-field="immigrationDisposition"]');
    var status = card.querySelector('[data-field="immigrationStatus"]');
    if (typeof buildSelectOptions === "function") {
      if (typeof IMMIGRATION_DISPOSITIONS !== "undefined") {
        buildSelectOptions(disp, IMMIGRATION_DISPOSITIONS, "Select a Disposition");
      }
      if (typeof IMMIGRATION_STATUS !== "undefined") {
        buildSelectOptions(status, IMMIGRATION_STATUS, "Select a Status");
      }
    }
    fillFields(card, {
      alienNumber: immigration.alienNumber,
      finNumber: immigration.finNumber,
      immigrationDisposition: immigration.disposition,
      immigrationStatus: immigration.status,
      firstDeportationDate: immigration.firstDeportationDate,
      lastDeportationDate: immigration.lastDeportationDate,
      finalOrderDate: immigration.finalOrderDate
    });
    if (typeof bindAlienNumberInput === "function" && card.querySelector('[data-field="alienNumber"]')) {
      bindAlienNumberInput(card.querySelector('[data-field="alienNumber"]'));
    }
    showPanel("Edit immigration");
  }

  function saveImmigration() {
    var card = host() && host().querySelector("[data-card]");
    var f = model().readFields(card);
    commit(function (snap) {
      var person = subjectOf(snap);
      person.immigration = person.immigration || {};
      person.immigration.alienNumber = f.alienNumber || "";
      person.immigration.finNumber = f.finNumber || "";
      person.immigration.disposition = f.immigrationDisposition || "";
      person.immigration.status = f.immigrationStatus || "";
      person.immigration.firstDeportationDate = f.firstDeportationDate || "";
      person.immigration.lastDeportationDate = f.lastDeportationDate || "";
      person.immigration.finalOrderDate = f.finalOrderDate || "";
      person.immigration.finalOrder = !!f.finalOrderDate;
      snap.person = person;
    }, "Immigration saved.");
  }

  function openCriminal(snap) {
    var card = cloneTemplate("caseCriminalIdsTemplate");
    var h = host();
    if (!card || !h) {
      return;
    }
    h.appendChild(card);
    var crim = (subjectOf(snap) && subjectOf(snap).criminal) || {};
    fillFields(card, {
      fbiNumber: crim.fbiNumber,
      ncicNumber: crim.ncicNumber,
      stateId: crim.stateId
    });
    showPanel("Edit criminal identifiers");
  }

  function saveCriminal() {
    var card = host() && host().querySelector("[data-card]");
    var f = model().readFields(card);
    commit(function (snap) {
      var person = subjectOf(snap);
      person.criminal = person.criminal || {};
      person.criminal.fbiNumber = f.fbiNumber || "";
      person.criminal.ncicNumber = f.ncicNumber || "";
      person.criminal.stateId = f.stateId || "";
      snap.person = person;
    }, "Criminal identifiers saved.");
  }

  function openVehicle(snap, vehicleId) {
    var card = cloneTemplate("vehicleCardTemplate");
    var h = host();
    if (!card || !h) {
      return;
    }
    h.appendChild(card);
    var vehicle = (snap.vehicles || []).filter(function (row) {
      return row && row.vehicleId === vehicleId;
    })[0];
    hydrateVehicle(card, vehicle, snap);
    showPanel(vehicle ? "Edit vehicle" : "Add vehicle");
  }

  function saveVehicle() {
    var card = host() && host().querySelector('[data-card="vehicle"]');
    if (!card) {
      return;
    }
    var next = collectVehicleCard(card);
    commit(function (snap) {
      snap.vehicles = snap.vehicles || [];
      var i;
      var found = false;
      for (i = 0; i < snap.vehicles.length; i++) {
        var prev = snap.vehicles[i];
        if (prev && prev.vehicleId === next.vehicleId) {
          prev.licensePlate = next.licensePlate;
          prev.plate = next.licensePlate || prev.plate;
          prev.plateState = next.plateState;
          prev.vehicleYear = next.vehicleYear;
          prev.vehicleMake = next.vehicleMake;
          prev.vehicleModel = next.vehicleModel;
          prev.vehicleColor = next.vehicleColor;
          prev.vehicleBodyStyle = next.vehicleBodyStyle;
          prev.vin = next.vin;
          prev.registeredOwnerName = next.registeredOwnerName;
          prev.governmentVehicle = false;
          if (next.locations.length) {
            prev.locations = next.locations;
          }
          found = true;
          break;
        }
      }
      if (!found) {
        snap.vehicles.push(next);
      }
    }, "Vehicle saved.");
  }

  function openLocation(snap, locationId) {
    var card = cloneTemplate("locationCardTemplate");
    var h = host();
    if (!card || !h) {
      return;
    }
    h.appendChild(card);
    var location = locationId ? findLocation(snap, locationId) : null;
    hydrateLocation(card, location);
    showPanel(location ? "Edit location" : "Add location");
  }

  function saveLocation() {
    var card = host() && host().querySelector('[data-card="location"]');
    if (!card) {
      return;
    }
    var next = collectLocationCard(card);
    commit(function (snap, m) {
      var person = subjectOf(snap);
      person.locations = person.locations || [];
      if (state.id && findLocation(snap, state.id)) {
        var prev = findLocation(snap, state.id);
        if (prev) {
          if (!next.pinColor && prev.pinColor) {
            next.pinColor = prev.pinColor;
          }
          if (!next.targetPriority && prev.targetPriority) {
            next.targetPriority = prev.targetPriority;
          }
          if (!next.parksHere && prev.parksHere) {
            next.parksHere = prev.parksHere;
          }
        }
        replaceLocation(snap, next);
      } else {
        if (!next.locationId) {
          next.locationId = m.newId("loc");
        }
        person.locations.push(next);
        snap.person = person;
      }
    }, "Location saved.");
  }

  function openDocument(snap, documentId) {
    var card = cloneTemplate("documentCardTemplate");
    var h = host();
    if (!card || !h) {
      return;
    }
    h.appendChild(card);
    if (typeof bindDocumentCard === "function") {
      bindDocumentCard(card);
    }
    var doc = ((subjectOf(snap) && subjectOf(snap).documents) || []).filter(
      function (row) {
        return row && row.documentId === documentId;
      }
    )[0];
    if (doc) {
      card.dataset.entityId = doc.documentId;
      fillFields(card, doc);
    }
    showPanel(doc ? "Edit document" : "Add document");
  }

  function saveDocument() {
    var card = host() && host().querySelector('[data-card="document"]');
    var m = model();
    var f = m.readFields(card);
    commit(function (snap) {
      var person = subjectOf(snap);
      person.documents = person.documents || [];
      var row = m.createDocument({
        documentId: card.dataset.entityId || m.newId("doc"),
        documentType: f.documentType || "",
        documentNumber: f.documentNumber || "",
        issuingState: f.issuingState || "",
        issuingCountry: f.issuingCountry || "",
        documentIssueDate: f.documentIssueDate || "",
        documentExpiration: f.documentExpiration || ""
      });
      var i;
      var found = false;
      for (i = 0; i < person.documents.length; i++) {
        if (person.documents[i] && person.documents[i].documentId === row.documentId) {
          person.documents[i] = row;
          found = true;
          break;
        }
      }
      if (!found) {
        person.documents.push(row);
      }
      snap.person = person;
    }, "Document saved.");
  }

  function openAssociation(snap, linkId) {
    var card = cloneTemplate("relationshipCardTemplate");
    var h = host();
    if (!card || !h) {
      return;
    }
    h.appendChild(card);
    if (typeof bindRelationshipCard === "function") {
      bindRelationshipCard(card);
    }
    var select = card.querySelector('[data-field="relatedPersonId"]');
    var subject = subjectOf(snap);
    var sid = subject && subject.personId;
    if (select && select.options.length < 2 && model().store && model().store.allPeople) {
      model().store.allPeople().forEach(function (person) {
        if (!person || person.personId === sid) {
          return;
        }
        var opt = document.createElement("option");
        opt.value = person.personId;
        opt.textContent =
          (model().formatPersonLabel && model().formatPersonLabel(person)) ||
          person.personId;
        select.appendChild(opt);
      });
    }
    var link = ((snap && snap.links) || []).filter(function (row) {
      return row && row.linkId === linkId;
    })[0];
    if (link) {
      card.dataset.entityId = link.linkId;
      fillFields(card, {
        relatedPersonId: link.to && link.to.id,
        relationshipType: (link.reasons && link.reasons[0]) || ""
      });
    }
    showPanel(link ? "Edit association" : "Add association");
  }

  function saveAssociation() {
    var card = host() && host().querySelector('[data-card="relationship"]');
    var m = model();
    var f = m.readFields(card);
    if (!f.relatedPersonId || !f.relationshipType) {
      setStatus("Select a person and a relationship.");
      return;
    }
    commit(function (snap) {
      var person = subjectOf(snap);
      snap.links = snap.links || [];
      var linkId = card.dataset.entityId || "";
      var existing = null;
      var i;
      for (i = 0; i < snap.links.length; i++) {
        if (snap.links[i] && snap.links[i].linkId === linkId) {
          existing = snap.links[i];
          break;
        }
      }
      if (
        existing &&
        existing.from &&
        existing.from.type === "VEHICLE"
      ) {
        existing = null;
        linkId = "";
      }
      var row = m.createLink({
        linkId: (existing && existing.linkId) || linkId || m.newId("link"),
        from: { type: "PERSON", id: person.personId },
        to: { type: "PERSON", id: f.relatedPersonId },
        reasons: [f.relationshipType],
        notes: (existing && existing.notes) || ""
      });
      var found = false;
      for (i = 0; i < snap.links.length; i++) {
        if (snap.links[i] && snap.links[i].linkId === row.linkId) {
          snap.links[i] = row;
          found = true;
          break;
        }
      }
      if (!found) {
        snap.links.push(row);
      }
    }, "Association saved.");
  }

  var OPENERS = {
    identity: openIdentity,
    folder: openIdentity,
    source: openSource,
    immigration: openImmigration,
    criminal: openCriminal,
    vehicle: openVehicle,
    location: openLocation,
    document: openDocument,
    documents: openDocument,
    association: openAssociation,
    associations: openAssociation
  };

  var SAVERS = {
    identity: saveIdentity,
    folder: saveIdentity,
    source: saveSource,
    immigration: saveImmigration,
    criminal: saveCriminal,
    vehicle: saveVehicle,
    location: saveLocation,
    document: saveDocument,
    documents: saveDocument,
    association: saveAssociation,
    associations: saveAssociation
  };

  function open(kind, id) {
    var snap = loadSnap();
    if (!snap) {
      setStatus("Case not found.");
      return;
    }
    var h = host();
    if (h) {
      h.replaceChildren();
    }
    state.kind = kind;
    state.id = id || "";
    var fn = OPENERS[kind];
    if (!fn) {
      setStatus("Use Edit on the app bar for that section.");
      return;
    }
    fn(snap, id);
  }

  function save() {
    var fn = SAVERS[state.kind];
    if (fn) {
      fn();
    }
  }

  function addTileButton(tile, label, kind, add) {
    if (!tile) {
      return;
    }
    var legend =
      tile.querySelector(":scope > legend") ||
      tile.querySelector(".case-folder-tab");
    if (!legend) {
      return;
    }
    var existing = legend.querySelector('[data-case-edit="' + kind + label + '"]');
    if (existing) {
      return;
    }
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "action-button-secondary compact case-tile-legend-action";
    btn.setAttribute("data-case-edit", kind + label);
    btn.textContent = label;
    btn.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();
      open(kind, "");
    });
    legend.appendChild(btn);
  }

  function refresh() {
    if (document.body.getAttribute("data-page") !== "case") {
      return;
    }
    addTileButton(byId("caseFolderTile"), "Edit", "identity", false);
    addTileButton(byId("caseSourceTile"), "Edit", "source", false);
    addTileButton(byId("caseImmigrationTile"), "Edit", "immigration", false);
    addTileButton(byId("caseCriminalTile"), "Edit", "criminal", false);
    addTileButton(byId("leadVehiclesCard"), "Add", "vehicle", true);
    addTileButton(byId("leadLocationsCard"), "Add", "location", true);
    addTileButton(byId("caseDocumentsTile"), "Add", "document", true);
    addTileButton(byId("caseAssociationsTile"), "Add", "association", true);
  }

  function bind() {
    if (document.body.getAttribute("data-page") !== "case") {
      return;
    }
    var saveBtn = byId("caseEditSave");
    var cancelBtn = byId("caseEditCancel");
    var backdrop = byId("caseEditBackdrop");
    if (saveBtn && saveBtn.dataset.bound !== "true") {
      saveBtn.dataset.bound = "true";
      saveBtn.addEventListener("click", save);
    }
    if (cancelBtn && cancelBtn.dataset.bound !== "true") {
      cancelBtn.dataset.bound = "true";
      cancelBtn.addEventListener("click", closePanel);
    }
    if (backdrop && backdrop.dataset.bound !== "true") {
      backdrop.dataset.bound = "true";
      backdrop.addEventListener("click", closePanel);
    }
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && panel() && !panel().hidden) {
        closePanel();
      }
    });
    refresh();
  }

  root.caseEdit = {
    open: open,
    close: closePanel,
    refresh: refresh
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bind);
  } else {
    bind();
  }
})(typeof window !== "undefined" ? window : globalThis);
