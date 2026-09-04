/**
 * Investigation list and workspace shell.
 */
(function () {
  var recordFilter = "all";
  var transientInvestigation = null;

  function model() {
    return window.COPDoc && COPDoc.model;
  }

  function byId(id) {
    return document.getElementById(id);
  }

  function pageKey() {
    return document.body.getAttribute("data-page") || "";
  }

  function queryId() {
    if (window.COPDoc && COPDoc.chrome && COPDoc.chrome.queryId) {
      return COPDoc.chrome.queryId();
    }
    try {
      return new URLSearchParams(window.location.search).get("id") || "";
    } catch (error) {
      return "";
    }
  }

  function queryParam(name) {
    try {
      return new URLSearchParams(window.location.search).get(name) || "";
    } catch (error) {
      return "";
    }
  }

  function setStatus(message, ok) {
    if (window.COPDoc && typeof COPDoc.setAppBarStatus === "function") {
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

  function kindLabel(kind) {
    var m = model();
    if (m && typeof m.investigationKindLabel === "function") {
      return m.investigationKindLabel(kind);
    }
    return kind || "—";
  }

  function formatWhen(iso) {
    if (!iso) {
      return "—";
    }
    if (typeof formatDateMdY === "function") {
      return formatDateMdY(iso) || iso.slice(0, 10);
    }
    return String(iso).slice(0, 10);
  }

  function filteredRows() {
    var m = model();
    var rows = (m.store.listInvestigations() || []).map(function (row) {
      return m.store.getInvestigation(row.investigationId) || row;
    });
    if (recordFilter === "draft") {
      rows = rows.filter(function (row) {
        return !isCommitted(row);
      });
    } else if (recordFilter === "committed") {
      rows = rows.filter(isCommitted);
    }
    return rows;
  }

  function paintList() {
    var body = byId("investigationsBody");
    var empty = byId("investigationsEmpty");
    var wrap = byId("investigationsTableWrap");
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
    var all = m.store.listInvestigations() || [];
    var rows = filteredRows();
    body.replaceChildren();
    empty.hidden = rows.length > 0;
    wrap.hidden = rows.length === 0;
    if (!all.length) {
      empty.textContent = "No investigations yet.";
    } else if (!rows.length) {
      empty.textContent = "No matching records.";
    }
    rows.forEach(function (row) {
      var tr = document.createElement("tr");
      var committed = isCommitted(row);
      [
        row.investigationId,
        kindLabel(row.kind),
        row.title || "Untitled investigation",
        row.parentInvestigationId || "—",
        formatWhen(row.meta && row.meta.updatedAt)
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
      link.href =
        "investigate.html?id=" + encodeURIComponent(row.investigationId);
      link.textContent = committed ? "Open" : "Edit";
      cluster.appendChild(link);
      actions.appendChild(cluster);
      tr.appendChild(actions);
      body.appendChild(tr);
    });
  }

  function bindFilters() {
    document.querySelectorAll("[data-record-filter]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        recordFilter = btn.getAttribute("data-record-filter") || "all";
        document.querySelectorAll("[data-record-filter]").forEach(function (other) {
          other.setAttribute("aria-pressed", other === btn ? "true" : "false");
        });
        paintList();
      });
    });
  }

  function collectInvestigation() {
    var m = model();
    var formId =
      (byId("investigationId") && byId("investigationId").value) || queryId();
    var previous =
      (formId && m.store.getInvestigation(formId)) || transientInvestigation;
    var kind = (byId("investigationKind") && byId("investigationKind").value) || "tag";
    var mode = "";
    if (kind === "tag") {
      mode =
        (byId("investigationMode") && byId("investigationMode").value) || "bulk";
    }
    return m.createInvestigation({
      investigationId:
        (byId("investigationId") && byId("investigationId").value) ||
        (previous && previous.investigationId) ||
        "",
      kind: kind,
      mode: mode,
      title: (byId("investigationTitle") && byId("investigationTitle").value) || "",
      team: (byId("investigationTeam") && byId("investigationTeam").value) || "3",
      parentInvestigationId: (previous && previous.parentInvestigationId) || "",
      sourceLeadId: (previous && previous.sourceLeadId) || "",
      assignedOfficerId: (previous && previous.assignedOfficerId) || "",
      plates: (previous && previous.plates) || [],
      nodes: (previous && previous.nodes) || [],
      links: (previous && previous.links) || [],
      focusNodeId: (previous && previous.focusNodeId) || "",
      history: (previous && previous.history) || []
    });
  }

  function hydrateInvestigation(record) {
    if (!record) {
      return;
    }
    var m = model();
    if (byId("investigationId")) {
      byId("investigationId").value = record.investigationId || "";
    }
    if (byId("investigationTeam")) {
      byId("investigationTeam").value = record.team || "3";
    }
    if (byId("investigationKind")) {
      byId("investigationKind").value = record.kind || "tag";
    }
    if (byId("investigationMode")) {
      byId("investigationMode").value = record.mode || "bulk";
    }
    if (byId("investigationTitle")) {
      byId("investigationTitle").value = record.title || "";
    }
    var parentLine = byId("investigationParentLine");
    if (parentLine) {
      parentLine.replaceChildren();
      if (record.parentInvestigationId) {
        parentLine.hidden = false;
        parentLine.appendChild(document.createTextNode("Spawned from "));
        var parentLink = document.createElement("a");
        parentLink.href =
          "investigate.html?id=" + encodeURIComponent(record.parentInvestigationId);
        parentLink.textContent = record.parentInvestigationId;
        parentLine.appendChild(parentLink);
        parentLine.appendChild(document.createTextNode("."));
      } else {
        parentLine.hidden = true;
      }
    }
    var childrenLine = byId("investigationChildrenLine");
    if (childrenLine && m.store.listInvestigations) {
      var children = (m.store.listInvestigations() || []).filter(function (row) {
        return row.parentInvestigationId === record.investigationId;
      });
      childrenLine.replaceChildren();
      if (!children.length) {
        childrenLine.hidden = true;
      } else {
        childrenLine.hidden = false;
        childrenLine.appendChild(document.createTextNode("Children: "));
        children.forEach(function (row, index) {
          if (index) {
            childrenLine.appendChild(document.createTextNode(" · "));
          }
          var childLink = document.createElement("a");
          childLink.href =
            "investigate.html?id=" + encodeURIComponent(row.investigationId);
          childLink.textContent = row.investigationId;
          childrenLine.appendChild(childLink);
        });
        childrenLine.appendChild(document.createTextNode("."));
      }
    }
    syncModeField();
    paintPlateQueue(record);
    if (window.COPDoc && COPDoc.investigationWall) {
      if (typeof COPDoc.investigationWall.setPlaceType === "function") {
        COPDoc.investigationWall.setPlaceType(
          COPDoc.investigationWall.defaultPlaceType(record.kind)
        );
      }
      if (typeof COPDoc.investigationWall.paint === "function") {
        COPDoc.investigationWall.paint(record);
      }
    }
    document.title = (record.investigationId || "Investigation") + " — COPDoc";
  }

  function investigationHasMeaningfulData(record) {
    if (!record) {
      return false;
    }
    if (
      String(record.title || "").trim() ||
      record.parentInvestigationId ||
      record.sourceLeadId ||
      record.assignedOfficerId ||
      (record.plates || []).length ||
      (record.nodes || []).length ||
      (record.links || []).length
    ) {
      return true;
    }
    if (!transientInvestigation) {
      return true;
    }
    return (
      record.kind !== transientInvestigation.kind ||
      record.mode !== transientInvestigation.mode ||
      String(record.team || "") !== String(transientInvestigation.team || "")
    );
  }

  function rememberPersistedInvestigation(record) {
    transientInvestigation = null;
    if (window.history && window.history.replaceState && record.investigationId) {
      window.history.replaceState(
        {},
        "",
        "investigate.html?id=" + encodeURIComponent(record.investigationId)
      );
    }
    if (window.COPDoc && COPDoc.chrome && typeof COPDoc.chrome.mount === "function") {
      COPDoc.chrome.mount();
    }
  }

  function syncModeField() {
    var kind = byId("investigationKind") && byId("investigationKind").value;
    var wrap = byId("investigationModeField");
    if (wrap) {
      wrap.hidden = kind !== "tag";
    }
    if (
      window.COPDoc &&
      COPDoc.investigationWall &&
      typeof COPDoc.investigationWall.applyWindows === "function"
    ) {
      COPDoc.investigationWall.applyWindows(kind);
    }
  }

  function plateStatusLabel(status) {
    if (status === "hit") {
      return "Hit";
    }
    if (status === "discarded") {
      return "Discarded";
    }
    if (status === "promoted") {
      return "Promoted";
    }
    if (status === "checked") {
      return "Checked";
    }
    return "New";
  }

  function currentStoredInvestigation() {
    var m = model();
    var id = (byId("investigationId") && byId("investigationId").value) || queryId();
    if (!m || !m.store || !id) {
      return null;
    }
    m.store.loadFromDisk();
    return m.store.getInvestigation(id);
  }

  function persistPlates(plates, message) {
    var m = model();
    var record = collectInvestigation();
    record.plates = plates || [];
    var committed = isCommitted(currentStoredInvestigation());
    var saved = m.store.saveInvestigation(record, {
      mode: committed ? "commit" : "draft"
    });
    if (!saved || !saved.ok) {
      setStatus((saved && saved.error) || "Could not save plates.");
      return null;
    }
    rememberPersistedInvestigation(record);
    var fresh = m.store.getInvestigation(record.investigationId);
    paintPlateQueue(fresh);
    if (window.COPDoc && COPDoc.investigationWall && typeof COPDoc.investigationWall.paint === "function") {
      COPDoc.investigationWall.paint(fresh);
    }
    if (message) {
      setStatus(message, true);
    }
    return fresh;
  }

  function paintPlateQueue(record) {
    var body = byId("plateQueueBody");
    var empty = byId("plateQueueEmpty");
    var wrap = byId("plateQueueWrap");
    if (!body) {
      return;
    }
    var rows = ((record && record.plates) || []).slice();
    body.replaceChildren();
    empty.hidden = rows.length > 0;
    wrap.hidden = rows.length === 0;
    if (!rows.length) {
      empty.textContent = "No plates in this queue yet.";
      return;
    }
    rows.forEach(function (row) {
      var tr = document.createElement("tr");
      [row.plate || "—", row.state || "—", plateStatusLabel(row.status)].forEach(
        function (text) {
          var td = document.createElement("td");
          td.textContent = text;
          tr.appendChild(td);
        }
      );
      var actions = document.createElement("td");
      var cluster = document.createElement("div");
      cluster.className = "record-actions";
      if (row.status !== "promoted") {
        if (row.status !== "hit") {
          var hit = document.createElement("button");
          hit.type = "button";
          hit.className = "action-button-secondary compact";
          hit.textContent = "Hit";
          hit.addEventListener("click", function () {
            setPlateStatus(row.plateId, "hit");
          });
          cluster.appendChild(hit);
        }
        if (row.status !== "discarded") {
          var drop = document.createElement("button");
          drop.type = "button";
          drop.className = "action-button-secondary compact";
          drop.textContent = "Discard";
          drop.addEventListener("click", function () {
            setPlateStatus(row.plateId, "discarded");
          });
          cluster.appendChild(drop);
        }
        var promote = document.createElement("button");
        promote.type = "button";
        promote.className = "action-button compact";
        promote.textContent = "Promote";
        promote.addEventListener("click", function () {
          promotePlate(row.plateId);
        });
        cluster.appendChild(promote);
      } else if (row.vehicleId) {
        var open = document.createElement("button");
        open.type = "button";
        open.className = "action-button-secondary compact";
        open.textContent = "Focus";
        open.addEventListener("click", function () {
          focusVehicle(row.vehicleId);
        });
        cluster.appendChild(open);
      }
      actions.appendChild(cluster);
      tr.appendChild(actions);
      body.appendChild(tr);
    });
  }

  function setPlateStatus(plateId, status) {
    var current = currentStoredInvestigation();
    if (!current) {
      return;
    }
    var plates = (current.plates || []).map(function (row) {
      if (row.plateId !== plateId) {
        return row;
      }
      var next = Object.assign({}, row, { status: status });
      return model().createInvestigationPlate
        ? model().createInvestigationPlate(next)
        : next;
    });
    persistPlates(plates, plateStatusLabel(status) + ".");
  }

  function objectTypeLabel(type) {
    if (type === "PERSON") {
      return "Person";
    }
    if (type === "VEHICLE") {
      return "Vehicle";
    }
    if (type === "LOCATION") {
      return "Location";
    }
    return type || "Object";
  }

  function reasonLabel(code) {
    var map = {
      REGISTERED_OWNER_OF: "Registered owner",
      KNOWN_OPERATOR_OF: "Known operator",
      CURRENT_RESIDENCE: "Current residence",
      KNOWN_RESIDENCE: "Known residence",
      LAST_KNOWN_ADDRESS: "Last known address",
      EMPLOYMENT_ADDRESS: "Employment",
      BUSINESS_ADDRESS: "Business address",
      FREQUENTED_LOCATION: "Frequented location",
      REGISTERED_ADDRESS: "Registered address",
      VEHICLE_PARKING: "Parking",
      STORED_AT: "Stored at",
      ASSOCIATE_OF: "Associate",
      COHABITANT_OF: "Cohabitant",
      SPOUSE_OF: "Spouse",
      PARENT_OF: "Parent",
      SIBLING_OF: "Sibling"
    };
    return map[code] || code || "Linked";
  }

  function reasonsForPair(fromType, toType) {
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
        { value: "SPOUSE_OF", label: "Spouse" },
        { value: "PARENT_OF", label: "Parent" },
        { value: "SIBLING_OF", label: "Sibling" }
      ];
    }
    return [];
  }

  function addTypesFor(fromType, kind) {
    var m = model();
    if (m && typeof m.investigationAddTypes === "function") {
      return m.investigationAddTypes(fromType, kind);
    }
    if (fromType === "VEHICLE") {
      return ["PERSON", "LOCATION"];
    }
    if (fromType === "LOCATION") {
      return ["PERSON", "VEHICLE"];
    }
    if (fromType === "PERSON") {
      return ["PERSON", "VEHICLE", "LOCATION"];
    }
    return kind === "tag"
      ? ["VEHICLE", "PERSON", "LOCATION"]
      : ["PERSON", "VEHICLE", "LOCATION"];
  }

  function defaultAddType(kind, fromType) {
    var m = model();
    if (m && typeof m.defaultInvestigationAddType === "function") {
      return m.defaultInvestigationAddType(kind, fromType);
    }
    var allowed = addTypesFor(fromType, kind);
    if (kind === "tag" && allowed.indexOf("VEHICLE") !== -1) {
      return "VEHICLE";
    }
    return allowed[0] || "PERSON";
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

  function nodeForObject(record, objectType, objectId) {
    var found = null;
    ((record && record.nodes) || []).forEach(function (row) {
      if (row && row.objectType === objectType && row.objectId === objectId) {
        found = row;
      }
    });
    return found;
  }

  function objectLabel(objectType, objectId) {
    var m = model();
    if (objectType === "PERSON") {
      var person = m.store.getPerson && m.store.getPerson(objectId);
      return (
        (person && m.formatPersonLabel && m.formatPersonLabel(person)) ||
        objectId
      );
    }
    if (objectType === "VEHICLE") {
      var vehicle =
        m.store.getVehicleRecord && m.store.getVehicleRecord(objectId);
      if (!vehicle) {
        return objectId;
      }
      return (
        [vehicle.plateState, vehicle.licensePlate || vehicle.plate]
          .filter(Boolean)
          .join(" ") || objectId
      );
    }
    if (objectType === "LOCATION") {
      var loc = m.store.getLocationRecord && m.store.getLocationRecord(objectId);
      if (!loc) {
        return objectId;
      }
      return (
        [loc.street, loc.city, loc.state].filter(Boolean).join(", ") || objectId
      );
    }
    return objectId;
  }

  function focusFacts(objectType, objectId) {
    var m = model();
    if (objectType === "PERSON") {
      var person = m.store.getPerson && m.store.getPerson(objectId);
      return [
        ["Name", person && m.formatPersonLabel && m.formatPersonLabel(person)],
        ["DOB", person && person.dateOfBirth]
      ];
    }
    if (objectType === "VEHICLE") {
      var vehicle =
        m.store.getVehicleRecord && m.store.getVehicleRecord(objectId);
      return [
        ["Plate", vehicle && (vehicle.licensePlate || vehicle.plate)],
        ["State", vehicle && vehicle.plateState],
        [
          "Vehicle",
          vehicle &&
            [vehicle.vehicleYear, vehicle.vehicleMake, vehicle.vehicleModel]
              .filter(Boolean)
              .join(" ")
        ]
      ];
    }
    if (objectType === "LOCATION") {
      var loc = m.store.getLocationRecord && m.store.getLocationRecord(objectId);
      return [
        ["Street", loc && loc.street],
        ["City", loc && loc.city],
        ["State", loc && loc.state],
        ["ZIP", loc && loc.zip]
      ];
    }
    return [];
  }

  function paintFactList(host, pairs) {
    if (!host) {
      return;
    }
    host.replaceChildren();
    (pairs || []).forEach(function (pair) {
      if (!pair[1]) {
        return;
      }
      var dt = document.createElement("dt");
      dt.className = "snapshot-label";
      dt.textContent = pair[0];
      var dd = document.createElement("dd");
      dd.className = "snapshot-value";
      dd.textContent = pair[1];
      host.appendChild(dt);
      host.appendChild(dd);
    });
  }

  function paintLinked(record, node) {
    var empty = byId("investigationLinkedEmpty");
    var wrap = byId("investigationLinkedWrap");
    var body = byId("investigationLinkedBody");
    if (!empty || !wrap || !body) {
      return;
    }
    body.replaceChildren();
    if (!node) {
      empty.hidden = false;
      wrap.hidden = true;
      return;
    }
    var rows = [];
    ((record && record.links) || []).forEach(function (link) {
      if (!link || !link.from || !link.to) {
        return;
      }
      var other = null;
      if (link.from.id === node.objectId && link.from.type === node.objectType) {
        other = link.to;
      } else if (
        link.to.id === node.objectId &&
        link.to.type === node.objectType
      ) {
        other = link.from;
      }
      if (!other || !other.id) {
        return;
      }
      rows.push({
        type: other.type,
        id: other.id,
        reason: (link.reasons && link.reasons[0]) || "",
        node: nodeForObject(record, other.type, other.id)
      });
    });
    empty.hidden = rows.length > 0;
    wrap.hidden = rows.length === 0;
    if (!rows.length) {
      empty.textContent = "No linked objects yet.";
      return;
    }
    rows.forEach(function (row) {
      var tr = document.createElement("tr");
      [objectTypeLabel(row.type), objectLabel(row.type, row.id), reasonLabel(row.reason)].forEach(
        function (text) {
          var td = document.createElement("td");
          td.textContent = text;
          tr.appendChild(td);
        }
      );
      var actions = document.createElement("td");
      if (row.node) {
        var cluster = document.createElement("div");
        cluster.className = "record-actions";
        var open = document.createElement("button");
        open.type = "button";
        open.className = "action-button-secondary compact";
        open.textContent = "Focus";
        open.addEventListener("click", function () {
          focusNode(row.node.nodeId);
        });
        cluster.appendChild(open);
        actions.appendChild(cluster);
      }
      tr.appendChild(actions);
      body.appendChild(tr);
    });
  }

  function syncAddFields(record) {
    var node = nodeById(record, record && record.focusNodeId);
    var fromType = node && node.objectType;
    var kind =
      (record && record.kind) ||
      (byId("investigationKind") && byId("investigationKind").value) ||
      "tag";
    var typeEl = byId("investigationAddType");
    var reasonField = byId("investigationAddReasonField");
    var reasonEl = byId("investigationAddReason");
    var note = byId("investigationAddNote");
    var allowed = addTypesFor(fromType, kind);
    var userType = typeEl && typeEl.dataset.userType;
    var current =
      userType && allowed.indexOf(userType) !== -1
        ? userType
        : defaultAddType(kind, fromType);
    if (typeEl) {
      typeEl.replaceChildren();
      allowed.forEach(function (type) {
        var opt = document.createElement("option");
        opt.value = type;
        opt.textContent = objectTypeLabel(type);
        typeEl.appendChild(opt);
      });
      typeEl.value = current;
    }
    var personFields = byId("investigationAddPersonFields");
    var vehicleFields = byId("investigationAddVehicleFields");
    var locationFields = byId("investigationAddLocationFields");
    if (personFields) {
      personFields.hidden = current !== "PERSON";
    }
    if (vehicleFields) {
      vehicleFields.hidden = current !== "VEHICLE";
    }
    if (locationFields) {
      locationFields.hidden = current !== "LOCATION";
    }
    var reasons = fromType ? reasonsForPair(fromType, current) : [];
    if (reasonField) {
      reasonField.hidden = !fromType || reasons.length === 0;
    }
    if (reasonEl) {
      var prev = reasonEl.value;
      reasonEl.replaceChildren();
      reasons.forEach(function (row) {
        var opt = document.createElement("option");
        opt.value = row.value;
        opt.textContent = row.label;
        reasonEl.appendChild(opt);
      });
      if (prev && reasons.some(function (row) { return row.value === prev; })) {
        reasonEl.value = prev;
      }
    }
    if (note) {
      if (current === "VEHICLE") {
        note.textContent = fromType
          ? "Add opens the same vehicle card as a case. Leave plate blank for a new card, or pick an existing plate to reuse."
          : "Add opens a vehicle card (same layout as a case). Leave plate blank for a new card, or pick an existing plate to reuse.";
      } else if (fromType) {
        note.textContent =
          "Link a person, vehicle, or location to this object. Existing records are reused by name, plate, or address.";
      } else {
        note.textContent =
          "Add a person, vehicle, or location. Existing records are reused by name, plate, or address.";
      }
    }
  }

  function uniqueClone(templateId, prefix) {
    var template = byId(templateId);
    if (!template || !template.content || !template.content.firstElementChild) {
      return null;
    }
    var card = template.content.firstElementChild.cloneNode(true);
    var uid =
      prefix +
      "-" +
      Date.now().toString(36) +
      "-" +
      Math.random().toString(36).slice(2, 6);
    card.querySelectorAll("[id]").forEach(function (el) {
      el.id = uid + "-" + el.id;
    });
    card.querySelectorAll("[for]").forEach(function (el) {
      el.htmlFor = uid + "-" + el.getAttribute("for");
    });
    return card;
  }

  function nestedCards(parentCard, kind) {
    var list = parentCard.querySelector('[data-nested-list="' + kind + '"]');
    if (!list) {
      return [];
    }
    return Array.prototype.slice.call(
      list.querySelectorAll(":scope > fieldset")
    );
  }

  function collectVehicleFromCard(card) {
    var m = model();
    if (!card || !m.readFields || !m.createVehicle) {
      return null;
    }
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
      registeredOwnerName: f.registeredOwner || f.registeredOwnerName || "",
      governmentVehicle: false,
      occupancy: f.occupancy || "current",
      occupiedFrom: f.occupiedFrom || "",
      occupiedTo: f.occupiedTo || "",
      notes: f.notes || "",
      otherResidents: f.otherResidents || ""
    });
    nestedCards(card, "location").forEach(function (locCard) {
      if (m.collectLocation) {
        vehicle.locations.push(m.collectLocation(locCard));
      }
    });
    return vehicle;
  }

  function hydrateVehicleCard(card, vehicle, record) {
    var m = model();
    if (!card || !vehicle) {
      return;
    }
    card.dataset.entityId = vehicle.vehicleId || vehicle.id || "";
    if (m.fillCard) {
      m.fillCard(card, vehicle);
      m.fillCard(card, {
        registeredOwner: vehicle.registeredOwnerName || ""
      });
    }
    var plate = card.querySelector('[data-field="licensePlate"]');
    if (typeof formatLicensePlate === "function") {
      formatLicensePlate(plate);
    }
    var make = card.querySelector('[data-field="vehicleMake"]');
    if (make) {
      make.dispatchEvent(new Event("change"));
    }
    if (m.fillCard) {
      m.fillCard(card, { vehicleModel: vehicle.vehicleModel || "" });
    }
    var modelEl = card.querySelector('[data-field="vehicleModel"]');
    if (modelEl) {
      modelEl.dispatchEvent(new Event("change"));
    }
    if (vehicle.vehicleBodyStyle && m.fillCard) {
      m.fillCard(card, { vehicleBodyStyle: vehicle.vehicleBodyStyle });
    }
    if (window.COPDoc && COPDoc.cards && COPDoc.cards.paintMedia) {
      COPDoc.cards.paintMedia(card, "VEHICLE");
    }
    (vehicle.locations || []).forEach(function (location) {
      var locCard =
        card._addNested && card._addNested.location
          ? card._addNested.location()
          : null;
      if (!locCard) {
        return;
      }
      if (m.fillLocationCard) {
        m.fillLocationCard(locCard, location);
      }
    });
    ((record && record.links) || []).forEach(function (link) {
      if (
        !link ||
        !link.from ||
        link.from.type !== "VEHICLE" ||
        link.from.id !== (vehicle.vehicleId || vehicle.id)
      ) {
        return;
      }
      if (!link.to || link.to.type !== "PERSON") {
        return;
      }
      var linkCard =
        card._addNested && card._addNested.link ? card._addNested.link() : null;
      if (linkCard && typeof fillLinkCard === "function") {
        if (link.linkId) {
          linkCard.dataset.entityId = link.linkId;
        }
        fillLinkCard(linkCard, link);
      }
    });
  }

  function persistFocusedVehicle() {
    var host = byId("investigationFocusCardHost");
    var card = host && host.querySelector('[data-card="vehicle"]');
    var m = model();
    if (!card || !m.store || !m.store.saveObjectRecord) {
      return;
    }
    var vehicle = collectVehicleFromCard(card);
    if (!vehicle || !vehicle.vehicleId) {
      return;
    }
    var savedVehicle = m.store.saveObjectRecord("VEHICLE", vehicle, {
      mode: "commit"
    });
    if (!savedVehicle || !savedVehicle.ok) {
      setStatus(
        (savedVehicle && savedVehicle.error) || "Could not save the vehicle."
      );
      return;
    }
    var current = currentStoredInvestigation();
    if (!current || !m.readFields) {
      return;
    }
    var changed = false;
    nestedCards(card, "link").forEach(function (linkCard) {
      var link =
        m.collectLink && m.collectLink(linkCard, vehicle.vehicleId);
      if (!link || !link.to || !link.to.id) {
        return;
      }
      current.nodes = current.nodes || [];
      var hasNode = current.nodes.some(function (row) {
        return (
          row &&
          row.objectType === "PERSON" &&
          row.objectId === link.to.id
        );
      });
      if (!hasNode && m.createInvestigationNode) {
        current.nodes.push(
          m.createInvestigationNode({
            objectType: "PERSON",
            objectId: link.to.id
          })
        );
        changed = true;
      }
      current.links = current.links || [];
      var found = false;
      var i;
      for (i = 0; i < current.links.length; i++) {
        if (current.links[i] && current.links[i].linkId === link.linkId) {
          current.links[i] = link;
          found = true;
          changed = true;
          break;
        }
      }
      if (!found) {
        current.links.push(link);
        changed = true;
      }
    });
    if (changed) {
      m.store.saveInvestigation(current, {
        mode: isCommitted(current) ? "commit" : "draft"
      });
      paintLinked(
        m.store.getInvestigation(current.investigationId),
        nodeForObject(current, "VEHICLE", vehicle.vehicleId)
      );
    }
  }

  var vehiclePersistTimer = 0;
  function scheduleVehiclePersist() {
    window.clearTimeout(vehiclePersistTimer);
    vehiclePersistTimer = window.setTimeout(persistFocusedVehicle, 250);
  }

  function bindVehiclePersist(card) {
    if (!card || card.dataset.vehiclePersistBound === "true") {
      return;
    }
    card.dataset.vehiclePersistBound = "true";
    card.addEventListener("input", scheduleVehiclePersist);
    card.addEventListener("change", scheduleVehiclePersist);
  }

  function mountVehicleCard(vehicleId, record) {
    var host = byId("investigationFocusCardHost");
    if (!host) {
      return;
    }
    var existing = host.querySelector('[data-card="vehicle"]');
    if (existing && existing.dataset.entityId === vehicleId) {
      return;
    }
    host.replaceChildren();
    var card = uniqueClone("vehicleCardTemplate", "invveh");
    if (!card) {
      return;
    }
    host.appendChild(card);
    host.hidden = false;
    if (typeof enhanceFieldset === "function") {
      enhanceFieldset(card);
    }
    if (typeof bindVehicleCardFull === "function") {
      bindVehicleCardFull(card);
    } else if (typeof bindVehicleCard === "function") {
      bindVehicleCard(card);
    }
    var vehicle =
      model().store.getVehicleRecord &&
      model().store.getVehicleRecord(vehicleId);
    hydrateVehicleCard(card, vehicle, record);
    bindVehiclePersist(card);
  }

  function paintFocus(record) {
    var empty = byId("investigationFocusEmpty");
    var body = byId("investigationFocusBody");
    var typeEl = byId("investigationFocusType");
    var labelEl = byId("investigationFocusLabel");
    var facts = byId("investigationFocusFacts");
    var host = byId("investigationFocusCardHost");
    var snapshot = byId("investigationFocusSnapshot");
    if (!empty || !body) {
      return;
    }
    var node = nodeById(record, record && record.focusNodeId);
    if (!node) {
      empty.hidden = false;
      body.hidden = true;
      if (host) {
        host.replaceChildren();
        host.hidden = true;
      }
      syncAddFields(record);
      return;
    }
    empty.hidden = true;
    body.hidden = false;
    if (node.objectType === "VEHICLE") {
      if (snapshot) {
        snapshot.hidden = true;
      }
      mountVehicleCard(node.objectId, record);
      paintLinked(record, node);
      syncAddFields(record);
      return;
    }
    if (host) {
      host.replaceChildren();
      host.hidden = true;
    }
    if (snapshot) {
      snapshot.hidden = false;
    }
    if (typeEl) {
      typeEl.textContent = objectTypeLabel(node.objectType);
    }
    if (labelEl) {
      labelEl.textContent = objectLabel(node.objectType, node.objectId);
    }
    paintFactList(facts, focusFacts(node.objectType, node.objectId));
    paintLinked(record, node);
    syncAddFields(record);
  }

  function promotePlate(plateId) {
    var m = model();
    var current = currentStoredInvestigation();
    if (!current || !m.store.promoteInvestigationPlate) {
      return;
    }
    var pos = { x: 48, y: 48 };
    if (window.COPDoc && COPDoc.investigationWall) {
      if (typeof COPDoc.investigationWall.lotStripPosition === "function") {
        pos = COPDoc.investigationWall.lotStripPosition(current);
      } else if (typeof COPDoc.investigationWall.viewCenter === "function") {
        pos = COPDoc.investigationWall.viewCenter();
      }
    }
    var result = m.store.promoteInvestigationPlate(
      current.investigationId,
      plateId,
      { x: pos.x, y: pos.y }
    );
    if (!result || !result.ok) {
      setStatus((result && result.error) || "Could not promote that plate.");
      return;
    }
    var fresh = m.store.getInvestigation(current.investigationId);
    hydrateInvestigation(fresh);
    setStatus("Promoted to a vehicle on the wall.", true);
  }

  function focusVehicle(vehicleId) {
    if (
      window.COPDoc &&
      COPDoc.investigationWall &&
      typeof COPDoc.investigationWall.focusVehicle === "function"
    ) {
      COPDoc.investigationWall.focusVehicle(vehicleId);
      return;
    }
    var current = currentStoredInvestigation();
    if (!current) {
      return;
    }
    var node = (current.nodes || []).filter(function (row) {
      return row && row.objectType === "VEHICLE" && row.objectId === vehicleId;
    })[0];
    if (!node) {
      return;
    }
    current.focusNodeId = node.nodeId;
    model().store.saveInvestigation(current, {
      mode: isCommitted(current) ? "commit" : "draft"
    });
  }

  function focusNode(nodeId) {
    var current = currentStoredInvestigation();
    if (!current || !nodeId) {
      return;
    }
    current.focusNodeId = nodeId;
    var committed = isCommitted(current);
    model().store.saveInvestigation(current, {
      mode: committed ? "commit" : "draft"
    });
    hydrateInvestigation(model().store.getInvestigation(current.investigationId));
  }

  function hideSearch(listId) {
    var list = byId(listId);
    if (!list) {
      return;
    }
    list.hidden = true;
    list.replaceChildren();
  }

  function bindObjectSearch(opts) {
    var searchEl = byId(opts.searchId);
    var hidden = byId(opts.hiddenId);
    var results = byId(opts.resultsId);
    if (!searchEl || !hidden || !results || searchEl.dataset.searchBound === "true") {
      return;
    }
    searchEl.dataset.searchBound = "true";

    function pick(id, label) {
      hidden.value = id || "";
      if (label) {
        searchEl.value = label;
      }
      hideSearch(opts.resultsId);
      if (typeof opts.onPick === "function") {
        opts.onPick(id, label);
      }
    }

    searchEl.addEventListener("input", function () {
      hidden.value = "";
      var rows = opts.matches(searchEl.value) || [];
      results.replaceChildren();
      if (!String(searchEl.value || "").trim()) {
        results.hidden = true;
        return;
      }
      if (!rows.length) {
        var empty = document.createElement("li");
        empty.className = "search-empty";
        empty.textContent = opts.emptyText || "No matches. A new record will be created.";
        results.appendChild(empty);
      } else {
        rows.slice(0, 12).forEach(function (row) {
          var li = document.createElement("li");
          li.setAttribute("role", "option");
          li.dataset.objectId = row.id;
          li.textContent = row.label;
          if (row.meta) {
            var meta = document.createElement("span");
            meta.className = "search-meta";
            meta.textContent = row.meta;
            li.appendChild(meta);
          }
          li.addEventListener("mousedown", function (event) {
            event.preventDefault();
            pick(row.id, row.label);
          });
          results.appendChild(li);
        });
      }
      results.hidden = false;
    });
    searchEl.addEventListener("blur", function () {
      window.setTimeout(function () {
        hideSearch(opts.resultsId);
      }, 150);
    });
  }

  function personSearchRows(query) {
    var m = model();
    var q = String(query || "").trim().toUpperCase();
    if (!q || !m.store.allPeople) {
      return [];
    }
    return (m.store.allPeople() || [])
      .map(function (person) {
        var label =
          (m.formatPersonLabel && m.formatPersonLabel(person)) || person.personId;
        return {
          id: person.personId,
          label: label,
          hay: label.toUpperCase()
        };
      })
      .filter(function (row) {
        return row.hay.indexOf(q) !== -1;
      });
  }

  function vehicleSearchRows(query) {
    var m = model();
    var q = String(query || "")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");
    if (!q || !m.store.getState) {
      return [];
    }
    var vehicles = (m.store.getState().vehicles || {});
    return Object.keys(vehicles)
      .map(function (id) {
        var row = vehicles[id];
        var plate = String((row && (row.licensePlate || row.plate)) || "").toUpperCase();
        var stateCode = String((row && row.plateState) || "").toUpperCase();
        return {
          id: id,
          label: [stateCode, plate].filter(Boolean).join(" ") || id,
          plate: plate,
          state: stateCode
        };
      })
      .filter(function (row) {
        return row.plate.indexOf(q) !== -1;
      });
  }

  function locationSearchRows(query) {
    var m = model();
    var q = String(query || "").trim().toUpperCase();
    if (!q || !m.store.getState) {
      return [];
    }
    var locations = (m.store.getState().locations || {});
    return Object.keys(locations)
      .map(function (id) {
        var row = locations[id];
        var label = [row.street, row.city, row.state].filter(Boolean).join(", ");
        return {
          id: id,
          label: label || id,
          hay: label.toUpperCase(),
          city: row.city || "",
          state: row.state || "",
          zip: row.zip || ""
        };
      })
      .filter(function (row) {
        return row.hay.indexOf(q) !== -1;
      });
  }

  function clearAddForm() {
    [
      "investigationAddPerson",
      "investigationAddPersonId",
      "investigationAddPlate",
      "investigationAddPlateState",
      "investigationAddVehicleId",
      "investigationAddStreet",
      "investigationAddCity",
      "investigationAddLocState",
      "investigationAddZip",
      "investigationAddLocationId"
    ].forEach(function (id) {
      if (byId(id)) {
        byId(id).value = "";
      }
    });
    hideSearch("investigationAddPersonResults");
    hideSearch("investigationAddVehicleResults");
    hideSearch("investigationAddLocationResults");
  }

  function submitAddObject() {
    var m = model();
    if (!m || !m.store || !m.store.addInvestigationObject) {
      setStatus("Could not add that object.");
      return;
    }
    if (saveDraftQuiet({ force: true }) === false) {
      return;
    }
    var current = currentStoredInvestigation();
    if (!current) {
      setStatus("Save the investigation before adding objects.");
      return;
    }
    var type = (byId("investigationAddType") && byId("investigationAddType").value) || "PERSON";
    var payload = {
      objectType: type,
      reason: (byId("investigationAddReason") && byId("investigationAddReason").value) || ""
    };
    if (type === "PERSON") {
      payload.objectId =
        (byId("investigationAddPersonId") && byId("investigationAddPersonId").value) || "";
      payload.name =
        (byId("investigationAddPerson") && byId("investigationAddPerson").value) || "";
    } else if (type === "VEHICLE") {
      payload.objectId =
        (byId("investigationAddVehicleId") && byId("investigationAddVehicleId").value) || "";
      payload.licensePlate =
        (byId("investigationAddPlate") && byId("investigationAddPlate").value) || "";
      payload.plateState =
        (byId("investigationAddPlateState") && byId("investigationAddPlateState").value) || "";
    } else if (type === "BUSINESS") {
      payload.name =
        (byId("investigationAddName") && byId("investigationAddName").value) || "";
      payload.phone =
        (byId("investigationAddPhone") && byId("investigationAddPhone").value) || "";
    } else if (type === "ENTITY") {
      payload.name =
        (byId("investigationAddName") && byId("investigationAddName").value) || "";
      payload.kind =
        (byId("investigationAddKind") && byId("investigationAddKind").value) || "";
    } else {
      payload.objectId =
        (byId("investigationAddLocationId") && byId("investigationAddLocationId").value) || "";
      payload.street =
        (byId("investigationAddStreet") && byId("investigationAddStreet").value) || "";
      payload.city =
        (byId("investigationAddCity") && byId("investigationAddCity").value) || "";
      payload.state =
        (byId("investigationAddLocState") && byId("investigationAddLocState").value) || "";
      payload.zip =
        (byId("investigationAddZip") && byId("investigationAddZip").value) || "";
    }
    var result = m.store.addInvestigationObject(current.investigationId, payload);
    if (!result || !result.ok) {
      setStatus((result && result.error) || "Could not add that object.");
      return;
    }
    clearAddForm();
    var fresh = m.store.getInvestigation(current.investigationId);
    hydrateInvestigation(fresh);
    var label = objectLabel(result.objectType, result.objectId);
    setStatus(
      (result.reused ? "Linked existing " : "Added ") +
        objectTypeLabel(result.objectType).toLowerCase() +
        " " +
        label +
        ".",
      true
    );
  }

  function bindAddForm() {
    var typeEl = byId("investigationAddType");
    if (typeEl && typeEl.dataset.addBound !== "true") {
      typeEl.dataset.addBound = "true";
      typeEl.addEventListener("change", function () {
        typeEl.dataset.userType = typeEl.value;
        syncAddFields(currentStoredInvestigation());
      });
    }
    var addBtn = byId("investigationAddButton");
    if (addBtn && addBtn.dataset.addBound !== "true") {
      addBtn.dataset.addBound = "true";
      addBtn.addEventListener("click", submitAddObject);
    }
    bindObjectSearch({
      searchId: "investigationAddPerson",
      hiddenId: "investigationAddPersonId",
      resultsId: "investigationAddPersonResults",
      matches: personSearchRows,
      emptyText: "No matching person. A new person will be created."
    });
    bindObjectSearch({
      searchId: "investigationAddPlate",
      hiddenId: "investigationAddVehicleId",
      resultsId: "investigationAddVehicleResults",
      matches: vehicleSearchRows,
      emptyText: "No matching plate. A new vehicle will be created.",
      onPick: function (id) {
        var m = model();
        var vehicle = m.store.getVehicleRecord && m.store.getVehicleRecord(id);
        if (vehicle && byId("investigationAddPlate")) {
          byId("investigationAddPlate").value =
            vehicle.licensePlate || vehicle.plate || "";
        }
        if (vehicle && byId("investigationAddPlateState")) {
          byId("investigationAddPlateState").value = vehicle.plateState || "";
        }
      }
    });
    bindObjectSearch({
      searchId: "investigationAddStreet",
      hiddenId: "investigationAddLocationId",
      resultsId: "investigationAddLocationResults",
      matches: locationSearchRows,
      emptyText: "No matching address. A new location will be created.",
      onPick: function (id) {
        var m = model();
        var loc = m.store.getLocationRecord && m.store.getLocationRecord(id);
        if (!loc) {
          return;
        }
        if (byId("investigationAddStreet")) {
          byId("investigationAddStreet").value = loc.street || "";
        }
        if (byId("investigationAddCity")) {
          byId("investigationAddCity").value = loc.city || "";
        }
        if (byId("investigationAddLocState")) {
          byId("investigationAddLocState").value = loc.state || "";
        }
        if (byId("investigationAddZip")) {
          byId("investigationAddZip").value = loc.zip || "";
        }
      }
    });
  }

  function importPlateText(text) {
    var api = window.COPDoc && COPDoc.plates;
    var m = model();
    if (!api || typeof api.parse !== "function") {
      setStatus("Plate parser is not loaded.");
      return;
    }
    var current = currentStoredInvestigation() || collectInvestigation();
    var existingKeys = (current.plates || []).map(function (row) {
      return api.plateKey(row.state, row.plate);
    });
    var parsed = api.parse(text, existingKeys);
    var added = (parsed.rows || []).map(function (row) {
      return m.createInvestigationPlate({
        plate: row.plate,
        state: row.state,
        status: "new"
      });
    });
    var plates = (current.plates || []).concat(added);
    var bits = [];
    bits.push("Kept " + parsed.kept);
    if (parsed.dupes) {
      bits.push(parsed.dupes + " duplicate");
    }
    if (parsed.bad) {
      bits.push(parsed.bad + " skipped");
    }
    persistPlates(plates, bits.join(". ") + ".");
    if (byId("plateImportText")) {
      byId("plateImportText").value = "";
    }
  }

  function focusPlateImport() {
    syncModeField();
    var card = byId("investigationPlateDock") || byId("plateQueueCard");
    var kind = byId("investigationKind") && byId("investigationKind").value;
    if (kind !== "tag") {
      setStatus("Switch kind to Plate Check to import plates.");
      return;
    }
    if (
      window.COPDoc &&
      COPDoc.investigationWall &&
      typeof COPDoc.investigationWall.setWindow === "function"
    ) {
      COPDoc.investigationWall.setWindow("plates", true);
    }
    if (card && card.scrollIntoView) {
      card.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
    var area = byId("plateImportText");
    if (area) {
      area.focus();
    }
  }

  function saveDraftQuiet(options) {
    options = options || {};
    var m = model();
    var record = collectInvestigation();
    if (!record.investigationId) {
      return;
    }
    if (!options.force && !investigationHasMeaningfulData(record)) {
      return true;
    }
    var saved = m.store.saveInvestigation(record, { mode: "draft" });
    if (saved && !saved.ok) {
      setStatus(saved.error || "Could not save the investigation.");
      return false;
    }
    rememberPersistedInvestigation(record);
    return true;
  }

  function commitInvestigation() {
    var m = model();
    var record = collectInvestigation();
    if (!record.kind) {
      setStatus("Pick a kind for this investigation.");
      return;
    }
    var saved = m.store.saveInvestigation(record, { mode: "commit" });
    if (!saved.ok) {
      setStatus(saved.error || "Could not save the investigation.");
      return;
    }
    transientInvestigation = null;
    setStatus("Investigation filed.", true);
    if (window.history && window.history.replaceState && record.investigationId) {
      window.history.replaceState(
        {},
        "",
        "investigate.html?id=" + encodeURIComponent(record.investigationId)
      );
    }
  }

  function existingInvestigationIds(exceptId) {
    var m = model();
    return (m.store.listInvestigations() || [])
      .map(function (row) {
        return row.investigationId;
      })
      .filter(function (id) {
        return id && id !== exceptId;
      });
  }

  function ensureNewInvestigation() {
    var m = model();
    m.store.loadFromDisk();
    var id = queryId();
    if (id) {
      var existing = m.store.getInvestigation(id);
      if (existing) {
        hydrateInvestigation(existing);
        return existing;
      }
    }
    var kind = queryParam("kind") || "tag";
    var mode = queryParam("mode") || "";
    var created = m.createInvestigation({
      kind: kind,
      mode: mode,
      team: (byId("investigationTeam") && byId("investigationTeam").value) || "3",
      existingIds: existingInvestigationIds("")
    });
    transientInvestigation = created;
    hydrateInvestigation(created);
    return created;
  }

  function bindWorkspace() {
    var kindEl = byId("investigationKind");
    if (kindEl && kindEl.dataset.kindBound !== "true") {
      kindEl.dataset.kindBound = "true";
      kindEl.addEventListener("change", function () {
        syncModeField();
        var rec = currentStoredInvestigation() || collectInvestigation();
        if (window.COPDoc && COPDoc.investigationWall) {
          if (typeof COPDoc.investigationWall.setPlaceType === "function") {
            COPDoc.investigationWall.setPlaceType(
              COPDoc.investigationWall.defaultPlaceType(rec && rec.kind)
            );
          }
          if (typeof COPDoc.investigationWall.paint === "function") {
            COPDoc.investigationWall.paint(rec);
          }
        }
      });
    }
    var importBtn = byId("plateImportButton");
    if (importBtn && importBtn.dataset.plateBound !== "true") {
      importBtn.dataset.plateBound = "true";
      importBtn.addEventListener("click", function () {
        importPlateText((byId("plateImportText") && byId("plateImportText").value) || "");
      });
    }
    var fileBtn = byId("plateImportFileButton");
    var fileInput = byId("plateImportFile");
    if (fileBtn && fileInput && fileBtn.dataset.plateBound !== "true") {
      fileBtn.dataset.plateBound = "true";
      fileBtn.addEventListener("click", function () {
        fileInput.click();
      });
      fileInput.addEventListener("change", function () {
        var file = fileInput.files && fileInput.files[0];
        if (!file) {
          return;
        }
        var reader = new FileReader();
        reader.onload = function () {
          importPlateText(String(reader.result || ""));
          fileInput.value = "";
        };
        reader.onerror = function () {
          setStatus("Could not read that file.");
          fileInput.value = "";
        };
        reader.readAsText(file);
      });
    }
    var teamEl = byId("investigationTeam");
    if (teamEl && teamEl.dataset.remintBound !== "true") {
      teamEl.dataset.remintBound = "true";
      teamEl.addEventListener("change", function () {
        var m = model();
        var id = (byId("investigationId") && byId("investigationId").value) || queryId();
        if (!id || !m || !m.store) {
          return;
        }
        m.store.loadFromDisk();
        var stored = m.store.getInvestigation(id);
        var current = stored || transientInvestigation;
        if (!current || isCommitted(current)) {
          if (current && isCommitted(current)) {
            setStatus("Team is locked after the investigation is saved.");
            teamEl.value = current.team || "3";
          }
          return;
        }
        if ((current.plates || []).length || (current.nodes || []).length) {
          setStatus("Team cannot change after plates or objects are on this investigation.");
          teamEl.value = current.team || "3";
          return;
        }
        var team = teamEl.value || "3";
        var nextId = m.nextInvestigationId({
          team: team,
          existingIds: existingInvestigationIds(id)
        });
        current.team = String(team);
        current.investigationId = nextId;
        if (stored) {
          m.store.saveInvestigation(current, { mode: "draft" });
          if (nextId !== id && m.store.deleteInvestigation) {
            m.store.deleteInvestigation(id);
          }
          rememberPersistedInvestigation(current);
        } else {
          transientInvestigation = current;
          hydrateInvestigation(current);
          saveDraftQuiet({ force: true });
        }
        hydrateInvestigation(current);
        setStatus("Investigation ID updated for team " + team + ".", true);
      });
    }
    var m = model();
    if (window.COPDoc && COPDoc.investigationWall && typeof COPDoc.investigationWall.bind === "function") {
      COPDoc.investigationWall.bind();
    }
    if (m.autosave && typeof m.autosave.bind === "function") {
      m.autosave.bind({
        key: "investigation",
        signature: function () {
          return JSON.stringify(collectInvestigation());
        },
        saveDraft: saveDraftQuiet,
        isField: function (el) {
          return (
            el &&
            el.closest &&
            el.closest("#investigationForm") &&
            !el.closest("#investigationAddBlock")
          );
        }
      }).remember();
    }
  }

  function spawnChildInvestigation() {
    var m = model();
    if (!m || !m.store || !m.store.spawnInvestigation) {
      setStatus("Could not spawn a child investigation.");
      return;
    }
    if (saveDraftQuiet() === false) {
      return;
    }
    var current = currentStoredInvestigation();
    if (!current) {
      setStatus("Save the investigation before spawning a child.");
      return;
    }
    var result = m.store.spawnInvestigation(current.investigationId);
    if (!result || !result.ok) {
      setStatus((result && result.error) || "Could not spawn a child investigation.");
      return;
    }
    window.location.href =
      "investigate.html?id=" + encodeURIComponent(result.investigationId);
  }

  function openInvestigationPersonAsCase() {
    var m = model();
    if (!m || !m.store || !m.store.promoteInvestigationPersonToCase) {
      setStatus("Could not open a case.");
      return;
    }
    if (saveDraftQuiet() === false) {
      return;
    }
    var current = currentStoredInvestigation();
    if (!current) {
      setStatus("Save the investigation before opening a case.");
      return;
    }
    var result = m.store.promoteInvestigationPersonToCase(current.investigationId);
    if (!result || (!result.ok && !result.leadId)) {
      setStatus((result && result.error) || "Could not open a case.");
      return;
    }
    if (result.leadId) {
      var opened = m.store.getLead(result.leadId);
      var page =
        opened && m.isCommitted && m.isCommitted(opened)
          ? "case.html"
          : "lead-form.html";
      window.location.href = page + "?id=" + encodeURIComponent(result.leadId);
    }
  }

  function removeFocusedInvestigationObject() {
    var m = model();
    if (!m || !m.store || !m.store.removeInvestigationObject) {
      setStatus("Could not remove that object.");
      return;
    }
    if (saveDraftQuiet() === false) {
      return;
    }
    var current = currentStoredInvestigation();
    if (!current || !current.focusNodeId) {
      setStatus("Focus an object to remove it from the wall.");
      return;
    }
    var focus = null;
    ((current.nodes || [])).forEach(function (row) {
      if (row && row.nodeId === current.focusNodeId) {
        focus = row;
      }
    });
    if (!focus) {
      setStatus("Focus an object to remove it from the wall.");
      return;
    }
    var label = "this object";
    if (focus.objectType === "PERSON" && m.formatPersonLabel && m.store.getPerson) {
      label = m.formatPersonLabel(m.store.getPerson(focus.objectId)) || "Person";
    } else if (
      focus.objectType === "VEHICLE" &&
      m.store.getVehicleRecord
    ) {
      var vehicle = m.store.getVehicleRecord(focus.objectId);
      label =
        (vehicle &&
          [vehicle.plateState, vehicle.licensePlate || vehicle.plate]
            .filter(Boolean)
            .join(" ")) ||
        "Vehicle";
    } else if (focus.objectType === "LOCATION" && m.store.getLocationRecord) {
      var loc = m.store.getLocationRecord(focus.objectId);
      label =
        (loc && [loc.street, loc.city, loc.state].filter(Boolean).join(", ")) ||
        "Location";
    } else if (focus.objectType === "BUSINESS" && m.store.getBusinessRecord) {
      var biz = m.store.getBusinessRecord(focus.objectId);
      label = (biz && biz.name) || "Business";
    } else if (focus.objectType === "ENTITY" && m.store.getEntityRecord) {
      var ent = m.store.getEntityRecord(focus.objectId);
      label =
        (ent && m.formatEntityLabel && m.formatEntityLabel(ent)) ||
        (ent && ent.name) ||
        "Entity";
    }
    if (
      typeof window.confirm === "function" &&
      !window.confirm("Remove " + label + " from this wall? The record stays.")
    ) {
      return;
    }
    var result = m.store.removeInvestigationObject(
      current.investigationId,
      current.focusNodeId
    );
    if (!result || !result.ok) {
      setStatus((result && result.error) || "Could not remove that object.");
      return;
    }
    var fresh = currentStoredInvestigation();
    paintPlateQueue(fresh);
    if (
      window.COPDoc &&
      COPDoc.investigationWall &&
      typeof COPDoc.investigationWall.paint === "function"
    ) {
      COPDoc.investigationWall.paint(fresh);
    }
    setStatus("Removed " + label + " from the wall.", true);
  }

  function focusedWallObject() {
    var current = currentStoredInvestigation();
    if (!current || !current.focusNodeId) {
      return null;
    }
    var focus = null;
    ((current.nodes || [])).forEach(function (row) {
      if (row && row.nodeId === current.focusNodeId) {
        focus = row;
      }
    });
    if (!focus) {
      return null;
    }
    return { investigation: current, node: focus };
  }

  function focusedWallLabel(node) {
    var m = model();
    if (!node) {
      return "this object";
    }
    if (node.objectType === "PERSON" && m.formatPersonLabel && m.store.getPerson) {
      return m.formatPersonLabel(m.store.getPerson(node.objectId)) || "Person";
    }
    if (node.objectType === "VEHICLE" && m.store.getVehicleRecord) {
      var vehicle = m.store.getVehicleRecord(node.objectId);
      return (
        (vehicle &&
          [vehicle.plateState, vehicle.licensePlate || vehicle.plate]
            .filter(Boolean)
            .join(" ")) ||
        "Vehicle"
      );
    }
    if (node.objectType === "LOCATION" && m.store.getLocationRecord) {
      var loc = m.store.getLocationRecord(node.objectId);
      return (
        (loc && [loc.street, loc.city, loc.state].filter(Boolean).join(", ")) ||
        "Location"
      );
    }
    if (node.objectType === "BUSINESS" && m.store.getBusinessRecord) {
      var biz = m.store.getBusinessRecord(node.objectId);
      return (biz && biz.name) || "Business";
    }
    if (node.objectType === "ENTITY" && m.store.getEntityRecord) {
      var ent = m.store.getEntityRecord(node.objectId);
      return (
        (ent && m.formatEntityLabel && m.formatEntityLabel(ent)) ||
        (ent && ent.name) ||
        "Entity"
      );
    }
    return "this object";
  }

  function refreshWallAfterObjectChange() {
    var fresh = currentStoredInvestigation();
    paintPlateQueue(fresh);
    if (
      window.COPDoc &&
      COPDoc.investigationWall &&
      typeof COPDoc.investigationWall.paint === "function"
    ) {
      COPDoc.investigationWall.paint(fresh);
    }
  }

  function junkFocusedInvestigationObject() {
    var m = model();
    if (!m || !m.store || !m.store.junkInvestigationObject) {
      setStatus("Could not junk that record.");
      return;
    }
    if (saveDraftQuiet() === false) {
      return;
    }
    var focused = focusedWallObject();
    if (!focused) {
      setStatus("Focus an object to junk it.");
      return;
    }
    var label = focusedWallLabel(focused.node);
    if (
      typeof window.confirm === "function" &&
      !window.confirm(
        "Junk " +
          label +
          "? It stays in the registry but will not be reused, and it comes off every wall."
      )
    ) {
      return;
    }
    var result = m.store.junkInvestigationObject(
      focused.investigation.investigationId,
      focused.node.nodeId
    );
    if (!result || !result.ok) {
      setStatus((result && result.error) || "Could not junk that record.");
      return;
    }
    refreshWallAfterObjectChange();
    setStatus("Junked " + label + ".", true);
  }

  function deleteFocusedInvestigationObject() {
    var m = model();
    if (!m || !m.store || !m.store.deleteInvestigationObject) {
      setStatus("Could not delete that record.");
      return;
    }
    if (saveDraftQuiet() === false) {
      return;
    }
    var focused = focusedWallObject();
    if (!focused) {
      setStatus("Focus an object to delete it.");
      return;
    }
    var label = focusedWallLabel(focused.node);
    if (
      typeof window.confirm === "function" &&
      !window.confirm(
        "Delete " + label + " permanently? This cannot be undone."
      )
    ) {
      return;
    }
    var result = m.store.deleteInvestigationObject(
      focused.investigation.investigationId,
      focused.node.nodeId
    );
    if (!result || !result.ok) {
      setStatus((result && result.error) || "Could not delete that record.");
      return;
    }
    refreshWallAfterObjectChange();
    setStatus("Deleted " + label + ".", true);
  }

  window.commitInvestigation = commitInvestigation;
  window.focusPlateImport = focusPlateImport;
  window.spawnChildInvestigation = spawnChildInvestigation;
  window.COPDoc = window.COPDoc || {};
  window.COPDoc.ensureInvestigationDraft = function () {
    if (saveDraftQuiet({ force: true }) === false) {
      return null;
    }
    return currentStoredInvestigation();
  };
  function clearInvestigationWorkspace() {
    var m = model();
    if (!m || !m.store || !m.store.clearInvestigationWorkspace) {
      setStatus("Could not clear the workspace.");
      return;
    }
    if (saveDraftQuiet() === false) {
      return;
    }
    var current = currentStoredInvestigation();
    if (!current) {
      setStatus("Save the investigation before clearing.");
      return;
    }
    var nodeCount = (current.nodes || []).length;
    var plateCount = (current.plates || []).length;
    if (!nodeCount && !plateCount && !(current.links || []).length) {
      setStatus("Workspace is already empty.", true);
      return;
    }
    if (
      typeof window.confirm === "function" &&
      !window.confirm(
        "Clear this workspace? The wall and plate queue will be empty. People, vehicles, and locations stay. Child investigations are not changed."
      )
    ) {
      return;
    }
    var result = m.store.clearInvestigationWorkspace(current.investigationId);
    if (!result || !result.ok) {
      setStatus((result && result.error) || "Could not clear the workspace.");
      return;
    }
    var fresh = currentStoredInvestigation();
    paintPlateQueue(fresh);
    if (
      window.COPDoc &&
      COPDoc.investigationWall &&
      typeof COPDoc.investigationWall.paint === "function"
    ) {
      COPDoc.investigationWall.paint(fresh);
    }
    setStatus("Workspace cleared.", true);
  }

  window.openInvestigationPersonAsCase = openInvestigationPersonAsCase;
  window.removeFocusedInvestigationObject = removeFocusedInvestigationObject;
  window.junkFocusedInvestigationObject = junkFocusedInvestigationObject;
  window.deleteFocusedInvestigationObject = deleteFocusedInvestigationObject;
  window.clearInvestigationWorkspace = clearInvestigationWorkspace;

  function boot() {
    var m = model();
    if (!m || !m.store) {
      return;
    }
    if (pageKey() === "investigations") {
      bindFilters();
      paintList();
      return;
    }
    if (pageKey() === "investigate") {
      ensureNewInvestigation();
      bindWorkspace();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
