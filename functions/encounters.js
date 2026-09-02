/**
 * Encounter list and form.
 */
(function () {
  "use strict";

  function byId(id) {
    return document.getElementById(id);
  }

  function pageKey() {
    return document.body.getAttribute("data-page") || "";
  }

  function queryId() {
    try {
      return new URLSearchParams(window.location.search).get("id") || "";
    } catch (error) {
      return "";
    }
  }

  function model() {
    return window.COPDoc && COPDoc.model;
  }

  function setStatus(message, ok) {
    if (window.COPDoc && COPDoc.setAppBarStatus) {
      COPDoc.setAppBarStatus(message, ok ? { ok: true } : undefined);
    }
  }

  function isCommitted(row) {
    var m = model();
    if (m && typeof m.isCommitted === "function") {
      return m.isCommitted(row);
    }
    return !row || !row.meta || row.meta.status !== "draft";
  }

  function displayOrDash(value) {
    var text = String(value == null ? "" : value).trim();
    return text || "—";
  }

  function formatAddress(loc) {
    if (!loc) {
      return "";
    }
    var cityState = [loc.city, loc.state].filter(Boolean).join(", ");
    return [loc.street, loc.street2, cityState, loc.zip].filter(Boolean).join(", ");
  }

  function vehicleLine(record) {
    var vehicles = (record && record.vehicles) || [];
    var first = vehicles[0];
    if (!first) {
      return "";
    }
    var plate = [first.licensePlate || first.plate, first.plateState]
      .filter(Boolean)
      .join(" · ");
    if (!plate) {
      return "";
    }
    if (vehicles.length > 1) {
      return plate + " +" + (vehicles.length - 1);
    }
    return plate;
  }

  function subjectsLine(record) {
    return ((record && record.subjects) || [])
      .map(function (row) {
        var last = String((row && row.lastName) || "").trim();
        var first = String((row && row.firstName) || "").trim();
        if (last && first) {
          return last + ", " + first;
        }
        return [first, last].filter(Boolean).join(" ");
      })
      .filter(Boolean)
      .join("; ");
  }

  var BOOKIN_KEY = "alien-book-in.saved-records.v1";

  function bookinRecords() {
    try {
      var raw = localStorage.getItem(BOOKIN_KEY);
      var list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch (error) {
      return [];
    }
  }

  function writeBookinRecords(list) {
    localStorage.setItem(BOOKIN_KEY, JSON.stringify(list || []));
  }

  function subjectsForEncounter(encounterId) {
    if (!encounterId) {
      return [];
    }
    return bookinRecords()
      .filter(function (row) {
        if (!row || row.encounterId !== encounterId) {
          return false;
        }
        var role = String(row.encounterRole || "").toUpperCase();
        return role === "TARGET" || role === "COLLATERAL";
      })
      .map(function (row) {
        return {
          bookinRecordId: row.id,
          leadId: row.leadId || "",
          lastName: row.lastName || "",
          firstName: row.firstName || "",
          alienNumber: row.aNumber || "",
          encounterRole: row.encounterRole || "",
          updatedAt: row.updatedAt || ""
        };
      });
  }

  function paintList() {
    var body = byId("encountersBody");
    var empty = byId("encountersEmpty");
    var wrap = byId("encountersTableWrap");
    if (!body) {
      return;
    }
    var m = model();
    if (!m || !m.store) {
      return;
    }
    m.store.loadFromDisk();
    if (typeof m.store.diskError === "function" && m.store.diskError()) {
      body.replaceChildren();
      empty.hidden = false;
      wrap.hidden = true;
      empty.textContent = m.store.diskError();
      setStatus(m.store.diskError());
      return;
    }
    var rows = m.store.listEncounters() || [];
    body.replaceChildren();
    empty.hidden = rows.length > 0;
    wrap.hidden = rows.length === 0;
    if (!rows.length) {
      empty.textContent = "No encounters yet.";
    }
    rows.forEach(function (row) {
      var full = m.store.getEncounter(row.encounterId) || row;
      var tr = document.createElement("tr");
      var committed = isCommitted(full);
      [
        full.encounterId,
        full.startedAt || "—",
        vehicleLine(full) || "—",
        formatAddress((full.locations || [])[0]) || "—",
        subjectsLine({ subjects: subjectsForEncounter(full.encounterId) }) ||
          "—",
        committed ? "Filed" : "Working"
      ].forEach(function (text, index) {
        var td = document.createElement("td");
        td.textContent = text;
        if (index === 0 && !committed) {
          var badge = document.createElement("span");
          badge.className = "record-status record-status-draft";
          badge.textContent = "Working";
          td.appendChild(document.createTextNode(" "));
          td.appendChild(badge);
        }
        tr.appendChild(td);
      });
      var actions = document.createElement("td");
      var cluster = document.createElement("div");
      cluster.className = "record-actions";
      var link = document.createElement("a");
      link.className = "action-button-secondary compact";
      link.href = "encounter-form.html?id=" + encodeURIComponent(full.encounterId);
      link.textContent = "Edit";
      cluster.appendChild(link);
      actions.appendChild(cluster);
      tr.appendChild(actions);
      body.appendChild(tr);
    });
  }

  function ownsField(card, el) {
    var host = el.closest ? el.closest("[data-card]") : null;
    return host === card;
  }

  function readFields(rootEl) {
    var out = {};
    if (!rootEl) {
      return out;
    }
    Array.prototype.forEach.call(
      rootEl.querySelectorAll("input, select, textarea"),
      function (el) {
        if (!ownsField(rootEl, el)) {
          return;
        }
        var key = el.getAttribute("data-field") || "";
        if (!key) {
          return;
        }
        var type = (el.type || "").toLowerCase();
        if (type === "button" || type === "checkbox" || type === "radio") {
          return;
        }
        out[key] = String(el.value || "").trim();
      }
    );
    return out;
  }

  function setCardValue(card, key, value) {
    var el = card.querySelector('[data-field="' + key + '"]');
    if (el && value != null) {
      el.value = value;
    }
  }

  function nestedCards(card, kind) {
    var list = card.querySelector('[data-nested-list="' + kind + '"]');
    if (!list) {
      return [];
    }
    return Array.prototype.slice.call(list.querySelectorAll(":scope > fieldset"));
  }

  function collectLocation(card) {
    var f = readFields(card);
    var loc = model().createLocation({
      locationId: card.dataset.entityId || "",
      street: f.street || "",
      street2: f.street2 || "",
      city: f.city || "",
      state: f.state || "",
      zip: f.zip || "",
      latitude: f.latitude || "",
      longitude: f.longitude || "",
      association: f.locationAssociation || f.association || "",
      parksHere: f.parksHere || "",
      targetPriority: f.targetPriority || "",
      pinColor: f.pinColor || ""
    });
    if (!loc.locationId && model().newId) {
      loc.locationId = model().newId("loc");
    }
    return loc;
  }

  function collectLink(card, vehicleId) {
    var f = readFields(card);
    var reasons = [];
    card.querySelectorAll('[data-field="linkReason"]').forEach(function (el) {
      if (el.checked && el.value) {
        reasons.push(el.value);
      }
    });
    var toId = f.linkedPersonId || "";
    if (!toId && !reasons.length && !f.linkNotes) {
      return null;
    }
    var m = model();
    if (!m || typeof m.createLink !== "function") {
      return null;
    }
    return m.createLink({
      linkId: card.dataset.entityId || (m.newId ? m.newId("link") : ""),
      from: { type: "VEHICLE", id: vehicleId },
      to: { type: "PERSON", id: toId },
      reasons: reasons,
      notes: f.linkNotes || ""
    });
  }

  function collectVehicle(card, links) {
    links = links || [];
    var f = readFields(card);
    var m = model();
    var vehicle = m.createVehicle({
      vehicleId: card.dataset.entityId || "",
      licensePlate: f.licensePlate || "",
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
    if (!vehicle.vehicleId && m.newId) {
      vehicle.vehicleId = m.newId("veh");
    }
    if (card) {
      card.dataset.entityId = vehicle.vehicleId || "";
    }
    nestedCards(card, "location").forEach(function (locCard) {
      vehicle.locations.push(collectLocation(locCard));
    });
    nestedCards(card, "link").forEach(function (linkCard) {
      var link = collectLink(linkCard, vehicle.vehicleId);
      if (link && link.to && link.to.id) {
        links.push(link);
      }
    });
    return vehicle;
  }

  function collectEncounter() {
    var m = model();
    var id = (byId("encounterId") && byId("encounterId").value) || queryId();
    var previous = id && m.store.getEncounter(id);
    var record = m.createEncounterRecord({
      encounterId: id || (previous && previous.encounterId)
    });
    if (previous) {
      record = Object.assign({}, previous, record);
      record.meta = previous.meta;
    }
    record.startedAt = (byId("encounterStartedAt") && byId("encounterStartedAt").value) || "";
    record.team = (byId("encounterTeam") && byId("encounterTeam").value) || record.team || "3";
    record.officeCode = record.officeCode || "DAL";
    record.vehicles = [];
    record.links = [];
    Array.prototype.forEach.call(
      document.querySelectorAll("#encounterVehicleList > fieldset"),
      function (card) {
        record.vehicles.push(collectVehicle(card, record.links));
      }
    );
    record.locations = [];
    Array.prototype.forEach.call(
      document.querySelectorAll("#encounterLocationList > fieldset"),
      function (card) {
        record.locations.push(collectLocation(card));
      }
    );
    record.subjects = subjectsForEncounter(record.encounterId);
    if (previous) {
      record.narratives = Array.isArray(previous.narratives)
        ? previous.narratives.slice()
        : [];
      record.supervisorSummary = previous.supervisorSummary || {
        text: "",
        derivedAt: "",
        coverage: null
      };
    }
    return record;
  }

  function addCard(type) {
    if (window.COPDoc && COPDoc.cards && typeof COPDoc.cards.add === "function") {
      return COPDoc.cards.add(type);
    }
    return null;
  }

  function addNested(card, kind) {
    if (card && card._addNested && typeof card._addNested[kind] === "function") {
      return card._addNested[kind]();
    }
    return null;
  }

  function fillEncounterLocation(card, location) {
    if (!card || !location) {
      return;
    }
    card.dataset.entityId = location.locationId || "";
    setCardValue(card, "locationAssociation", location.association || "");
    setCardValue(card, "street", location.street || "");
    setCardValue(card, "street2", location.street2 || "");
    setCardValue(card, "city", location.city || "");
    setCardValue(card, "state", location.state || "");
    setCardValue(card, "zip", location.zip || "");
    setCardValue(card, "latitude", location.latitude || "");
    setCardValue(card, "longitude", location.longitude || "");
    setCardValue(card, "targetPriority", location.targetPriority || "");
    setCardValue(card, "parksHere", location.parksHere || "");
    if (location.latitude && location.longitude) {
      setCardValue(
        card,
        "latLong",
        location.latitude + ", " + location.longitude
      );
    }
    if (window.COPDoc && COPDoc.cards && COPDoc.cards.paintMedia) {
      COPDoc.cards.paintMedia(card, "LOCATION");
    }
    if (window.COPDoc && COPDoc.locationMap && COPDoc.locationMap.sync) {
      COPDoc.locationMap.sync(card);
    }
    if (typeof fillLocationAssociationSelect === "function") {
      fillLocationAssociationSelect(
        card.querySelector('[data-field="locationAssociation"]')
      );
      setCardValue(card, "locationAssociation", location.association || "");
    }
  }

  function hydrateEncounter(record) {
    if (!record) {
      return;
    }
    if (byId("encounterId")) {
      byId("encounterId").value = record.encounterId || "";
    }
    if (byId("encounterStartedAt")) {
      byId("encounterStartedAt").value = record.startedAt || "";
    }
    if (byId("encounterTeam")) {
      byId("encounterTeam").value = record.team || "3";
    }
    var vehList = byId("encounterVehicleList");
    if (vehList) {
      vehList.replaceChildren();
      (record.vehicles || []).forEach(function (vehicle) {
        var card = addCard("encounterVehicle");
        if (!card) {
          return;
        }
        card.dataset.entityId = vehicle.vehicleId || "";
        [
          "licensePlate",
          "plateState",
          "vehicleYear",
          "vehicleMake",
          "vehicleColor",
          "vin"
        ].forEach(function (key) {
          setCardValue(card, key, vehicle[key] || "");
        });
        var make = card.querySelector('[data-field="vehicleMake"]');
        if (make) {
          make.dispatchEvent(new Event("change"));
        }
        setCardValue(card, "vehicleModel", vehicle.vehicleModel || "");
        var model = card.querySelector('[data-field="vehicleModel"]');
        if (model) {
          model.dispatchEvent(new Event("change"));
        }
        if (vehicle.vehicleBodyStyle) {
          setCardValue(card, "vehicleBodyStyle", vehicle.vehicleBodyStyle);
        }
        setCardValue(card, "registeredOwner", vehicle.registeredOwnerName || "");
        if (window.COPDoc && COPDoc.cards && COPDoc.cards.paintMedia) {
          COPDoc.cards.paintMedia(card, "VEHICLE");
        }
        (vehicle.locations || []).forEach(function (location) {
          var locCard = addNested(card, "location");
          if (locCard) {
            fillEncounterLocation(locCard, location);
          }
        });
        (record.links || []).forEach(function (link) {
          if (!link.from || link.from.id !== vehicle.vehicleId) {
            return;
          }
          var linkCard = addNested(card, "link");
          if (linkCard && typeof window.fillLinkCard === "function") {
            window.fillLinkCard(linkCard, link);
          }
        });
      });
    }
    var locList = byId("encounterLocationList");
    if (locList) {
      locList.replaceChildren();
      (record.locations || []).forEach(function (location) {
        var card = addCard("encounterLocation");
        if (!card) {
          return;
        }
        fillEncounterLocation(card, location);
      });
    }
    paintSubjectsTable(record.encounterId);
    paintSupervisorSummary(record);
  }

  function paintSupervisorSummary(record) {
    var el = byId("encounterSupervisorSummary");
    var link = byId("openEncounterNarrativesButton");
    if (link && record && record.encounterId) {
      link.href =
        "narrative.html?encounterId=" + encodeURIComponent(record.encounterId);
    }
    if (!el) {
      return;
    }
    var text =
      record &&
      record.supervisorSummary &&
      String(record.supervisorSummary.text || "").trim();
    el.textContent = text ||
      "No supervisor summary yet. Generate I-213 and update a draft.";
  }

  function subjectLabel(row) {
    var last = String((row && row.lastName) || "").trim();
    var first = String((row && row.firstName) || "").trim();
    if (last && first) {
      return last + ", " + first;
    }
    return [first, last].filter(Boolean).join(" ") || "this subject";
  }

  function bookinHref(encounterId, recordId) {
    var parts = [];
    if (encounterId) {
      parts.push("encounterId=" + encodeURIComponent(encounterId));
    }
    if (recordId) {
      parts.push("recordId=" + encodeURIComponent(recordId));
    }
    return parts.length ? "bookin.html?" + parts.join("&") : "bookin.html";
  }

  function rebuildEncounterSubjects(encounterId) {
    var m = model();
    if (!encounterId || !m || !m.store) {
      return;
    }
    m.store.loadFromDisk();
    var encounter = m.store.getEncounter(encounterId);
    if (!encounter) {
      return;
    }
    encounter.subjects = subjectsForEncounter(encounterId).map(function (row) {
      return {
        personId: row.personId || "",
        leadId: row.leadId || "",
        bookinRecordId: row.bookinRecordId || "",
        lastName: row.lastName || "",
        firstName: row.firstName || "",
        alienNumber: row.alienNumber || "",
        encounterRole: row.encounterRole || ""
      };
    });
    m.store.saveEncounter(encounter, {
      mode: isCommitted(encounter) ? "commit" : "draft"
    });
  }

  function unlinkEncounterSubject(encounterId, bookinRecordId) {
    var rows = subjectsForEncounter(encounterId);
    var row = null;
    rows.forEach(function (item) {
      if (item && item.bookinRecordId === bookinRecordId) {
        row = item;
      }
    });
    if (
      !window.confirm(
        "Remove " +
          subjectLabel(row) +
          " from this encounter? Their Book-in record is kept."
      )
    ) {
      return;
    }
    if (bookinRecordId) {
      var list = bookinRecords().map(function (item) {
        if (item && item.id === bookinRecordId) {
          item.encounterId = "";
        }
        return item;
      });
      writeBookinRecords(list);
    } else {
      var m = model();
      var encounter = m && m.store && m.store.getEncounter(encounterId);
      if (encounter && Array.isArray(encounter.subjects)) {
        encounter.subjects = encounter.subjects.filter(function (item) {
          return item && item.bookinRecordId;
        });
        m.store.saveEncounter(encounter, {
          mode: isCommitted(encounter) ? "commit" : "draft"
        });
      }
    }
    rebuildEncounterSubjects(encounterId);
    paintSubjectsTable(encounterId);
    setStatus("Subject removed from this encounter.", true);
  }

  function paintSubjectsTable(encounterId) {
    var body = byId("encounterSubjectsBody");
    var empty = byId("encounterSubjectsEmpty");
    var wrap = byId("encounterSubjectsTableWrap");
    if (!body || !empty || !wrap) {
      return;
    }
    var rows = subjectsForEncounter(encounterId);
    body.replaceChildren();
    empty.hidden = rows.length > 0;
    wrap.hidden = rows.length === 0;
    rows.forEach(function (row) {
      var tr = document.createElement("tr");
      var name = [row.lastName, row.firstName].filter(Boolean).join(", ");
      var role = String(row.encounterRole || "").toUpperCase();
      var roleLabel =
        role === "COLLATERAL" ? "Collateral" : role === "TARGET" ? "Target" : "—";
      [
        name || "—",
        roleLabel,
        row.alienNumber || "—",
        (row.updatedAt || "").slice(0, 16) || "—"
      ].forEach(function (text) {
        var td = document.createElement("td");
        td.textContent = text;
        tr.appendChild(td);
      });
      var actions = document.createElement("td");
      var cluster = document.createElement("div");
      cluster.className = "record-actions";
      if (row.bookinRecordId) {
        var edit = document.createElement("a");
        edit.className = "action-button-secondary compact";
        edit.href = bookinHref(encounterId, row.bookinRecordId);
        edit.textContent = "Edit";
        cluster.appendChild(edit);
      }
      var remove = document.createElement("button");
      remove.type = "button";
      remove.className = "action-button-danger compact";
      remove.setAttribute("aria-label", "Remove " + subjectLabel(row));
      remove.textContent = "×";
      remove.addEventListener("click", function () {
        unlinkEncounterSubject(encounterId, row.bookinRecordId || "");
      });
      cluster.appendChild(remove);
      actions.appendChild(cluster);
      tr.appendChild(actions);
      body.appendChild(tr);
    });
    var href = bookinHref(encounterId);
    var tableAdd = byId("addEncounterSubjectTableButton");
    if (tableAdd && encounterId) {
      tableAdd.href = href;
    }
  }

  function saveDraftQuiet() {
    var m = model();
    var record = collectEncounter();
    if (!record.encounterId) {
      return;
    }
    var saved = m.store.saveEncounter(record, { mode: "draft" });
    if (saved && !saved.ok) {
      setStatus(saved.error || "Could not save the encounter.");
      return false;
    }
    return true;
  }

  function commitEncounter() {
    var m = model();
    var record = collectEncounter();
    if (!record.startedAt) {
      setStatus("Enter the date and time of the encounter.");
      return;
    }
    var saved = m.store.saveEncounter(record, { mode: "commit" });
    if (!saved.ok) {
      setStatus(saved.error || "Could not save the encounter.");
      return;
    }
    if (record.encounterId && window.history && window.history.replaceState) {
      window.history.replaceState(
        {},
        "",
        "encounter-form.html?id=" + encodeURIComponent(record.encounterId)
      );
    }
    setStatus("Encounter filed.", true);
  }

  function openEncounterBookIn() {
    var id =
      (byId("encounterId") && byId("encounterId").value) || queryId();
    if (!id) {
      setStatus("Create the encounter first.");
      return;
    }
    saveDraftQuiet();
    window.location.href = bookinHref(id);
  }

  function generateEncounterNarrative() {
    var id = (byId("encounterId") && byId("encounterId").value) || queryId();
    if (!id) {
      setStatus("Create the encounter first.");
      return;
    }
    saveDraftQuiet();
    var subjects = subjectsForEncounter(id);
    if (!subjects.length) {
      setStatus("Add subjects on Book-in before generating an I-213.");
      return;
    }
    window.location.href =
      "narrative.html?encounterId=" + encodeURIComponent(id);
  }

  window.commitEncounter = commitEncounter;
  window.generateEncounterNarrative = generateEncounterNarrative;
  window.openEncounterBookIn = openEncounterBookIn;

  function ensureNewEncounter() {
    var m = model();
    m.store.loadFromDisk();
    var id = queryId();
    if (id) {
      var existing = m.store.getEncounter(id);
      if (existing) {
        hydrateEncounter(existing);
        return existing;
      }
    }
    var existingIds = (m.store.listEncounters() || []).map(function (row) {
      return row.encounterId;
    });
    var created = m.createEncounterRecord({
      team: (byId("encounterTeam") && byId("encounterTeam").value) || "3",
      existingIds: existingIds
    });
    var createdSave = m.store.saveEncounter(created, { mode: "draft" });
    if (createdSave && !createdSave.ok) {
      setStatus(createdSave.error || "Could not save the encounter.");
      hydrateEncounter(created);
      return created;
    }
    if (window.history && window.history.replaceState) {
      window.history.replaceState(
        {},
        "",
        "encounter-form.html?id=" + encodeURIComponent(created.encounterId)
      );
    }
    if (window.COPDoc && COPDoc.chrome && typeof COPDoc.chrome.mount === "function") {
      COPDoc.chrome.mount();
    }
    hydrateEncounter(created);
    return created;
  }

  function existingEncounterIds(exceptId) {
    var m = model();
    return (m.store.listEncounters() || [])
      .map(function (row) {
        return row.encounterId;
      })
      .filter(function (id) {
        return id && id !== exceptId;
      });
  }

  function bindTeamRemint() {
    var teamEl = byId("encounterTeam");
    if (!teamEl || teamEl.dataset.remintBound === "true") {
      return;
    }
    teamEl.dataset.remintBound = "true";
    teamEl.addEventListener("change", function () {
      var m = model();
      var id = (byId("encounterId") && byId("encounterId").value) || queryId();
      if (!id || !m || !m.store) {
        return;
      }
      m.store.loadFromDisk();
      var current = m.store.getEncounter(id);
      if (!current) {
        return;
      }
      if (isCommitted(current)) {
        setStatus("Team is locked after the encounter is saved.");
        teamEl.value = current.team || "3";
        return;
      }
      if (subjectsForEncounter(id).length) {
        setStatus("Team cannot change after subjects are booked to this encounter.");
        teamEl.value = current.team || "3";
        return;
      }
      var team = teamEl.value || "3";
      var nextId = m.nextEncounterId({
        office: current.officeCode || "DAL",
        team: team,
        existingIds: existingEncounterIds(id)
      });
      if (nextId === id) {
        current.team = String(team);
        m.store.saveEncounter(current, { mode: "draft" });
        return;
      }
      current.team = String(team);
      current.encounterId = nextId;
      m.store.saveEncounter(current, { mode: "draft" });
      if (m.store.deleteEncounter) {
        m.store.deleteEncounter(id);
      }
      if (window.history && window.history.replaceState) {
        window.history.replaceState(
          {},
          "",
          "encounter-form.html?id=" + encodeURIComponent(nextId)
        );
      }
      if (window.COPDoc && COPDoc.chrome && typeof COPDoc.chrome.mount === "function") {
        COPDoc.chrome.mount();
      }
      hydrateEncounter(current);
      setStatus("Encounter ID updated for team " + team + ".", true);
    });
  }

  function bootForm() {
    var m = model();
    if (!m || !m.store) {
      return;
    }
    ensureNewEncounter();
    bindTeamRemint();
    var tableAdd = byId("addEncounterSubjectTableButton");
    if (tableAdd && tableAdd.dataset.openBound !== "true") {
      tableAdd.dataset.openBound = "true";
      tableAdd.addEventListener("click", function (event) {
        event.preventDefault();
        openEncounterBookIn();
      });
    }
    if (m.autosave && typeof m.autosave.bind === "function") {
      m.autosave.bind({
        key: "encounter-form",
        signature: function () {
          return JSON.stringify(collectEncounter());
        },
        saveDraft: saveDraftQuiet,
        isField: function (el) {
          return el && el.closest && el.closest("#encounterForm");
        }
      }).remember();
    }
  }

  function boot() {
    if (pageKey() === "encounter") {
      paintList();
      return;
    }
    if (pageKey() === "encounter-form") {
      bootForm();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
