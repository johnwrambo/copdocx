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

  function bookinRecords() {
    try {
      var raw = localStorage.getItem("alien-book-in.saved-records.v1");
      var list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch (error) {
      return [];
    }
  }

  function subjectsForEncounter(encounterId) {
    if (!encounterId) {
      return [];
    }
    var fromBookin = bookinRecords().filter(function (row) {
      return row && row.encounterId === encounterId;
    });
    if (fromBookin.length) {
      return fromBookin.map(function (row) {
        return {
          bookinRecordId: row.id,
          leadId: row.leadId || "",
          lastName: row.lastName || "",
          firstName: row.firstName || "",
          alienNumber: row.aNumber || "",
          updatedAt: row.updatedAt || ""
        };
      });
    }
    var m = model();
    var rec = m && m.store && m.store.getEncounter(encounterId);
    return (rec && rec.subjects) || [];
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
        committed ? "Committed" : "Draft"
      ].forEach(function (text, index) {
        var td = document.createElement("td");
        td.textContent = text;
        if (index === 0 && !committed) {
          var badge = document.createElement("span");
          badge.className = "record-status record-status-draft";
          badge.textContent = "Draft";
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
      targetPriority: f.targetPriority || ""
    });
    if (!loc.locationId && model().newId) {
      loc.locationId = model().newId("loc");
    }
    return loc;
  }

  function collectVehicle(card) {
    var f = readFields(card);
    var vehicle = model().createVehicle({
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
    nestedCards(card, "location").forEach(function (locCard) {
      vehicle.locations.push(collectLocation(locCard));
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
    record.vehicles = [];
    Array.prototype.forEach.call(
      document.querySelectorAll("#encounterVehicleList > fieldset"),
      function (card) {
        record.vehicles.push(collectVehicle(card));
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
    return record;
  }

  function addCard(type) {
    if (window.COPDoc && COPDoc.cards && typeof COPDoc.cards.add === "function") {
      return COPDoc.cards.add(type);
    }
    return null;
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
          "vehicleModel",
          "vehicleColor",
          "vehicleBodyStyle",
          "vin"
        ].forEach(function (key) {
          setCardValue(card, key, vehicle[key] || "");
        });
        setCardValue(card, "registeredOwner", vehicle.registeredOwnerName || "");
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
        if (location.latitude && location.longitude) {
          setCardValue(
            card,
            "latLong",
            location.latitude + ", " + location.longitude
          );
        }
        if (typeof fillLocationAssociationSelect === "function") {
          fillLocationAssociationSelect(
            card.querySelector('[data-field="locationAssociation"]')
          );
          setCardValue(card, "locationAssociation", location.association || "");
        }
      });
    }
    paintSubjectsTable(record.encounterId);
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
      [name || "—", row.alienNumber || "—", (row.updatedAt || "").slice(0, 16) || "—"].forEach(
        function (text) {
          var td = document.createElement("td");
          td.textContent = text;
          tr.appendChild(td);
        }
      );
      body.appendChild(tr);
    });
    var addBtn = byId("addEncounterSubjectsButton");
    if (addBtn && encounterId) {
      addBtn.href = "bookin.html?encounterId=" + encodeURIComponent(encounterId);
    }
  }

  function saveDraftQuiet() {
    var m = model();
    var record = collectEncounter();
    if (!record.encounterId) {
      return;
    }
    m.store.saveEncounter(record, { mode: "draft" });
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
    window.location.href = "encounter.html";
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
    var created = m.createEncounterRecord();
    m.store.saveEncounter(created, { mode: "draft" });
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

  function bootForm() {
    var m = model();
    if (!m || !m.store) {
      return;
    }
    ensureNewEncounter();
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
