/**
 * Operation list, planning form, issued-order view, and pocket brief.
 */
(function () {
  "use strict";

  var recordFilter = "all";
  var draftRecord = null;
  var placeMode = { kind: "", teamId: "", officerId: "" };
  var pendingStart = null;
  var briefDocumentSources = null;

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

  function formatWhen(iso) {
    if (!iso) {
      return "—";
    }
    if (typeof formatDateMdY === "function") {
      return formatDateMdY(iso) || String(iso).slice(0, 10);
    }
    return String(iso).slice(0, 16).replace("T", " ");
  }

  function toDateTimeLocal(value) {
    var text = String(value || "").trim();
    if (!text) {
      return "";
    }
    if (text.length >= 16 && text.charAt(10) === "T") {
      return text.slice(0, 16);
    }
    return text.slice(0, 16);
  }

  function existingOperationIds() {
    var m = model();
    return (m.store.listOperations() || []).map(function (row) {
      return row.operationId;
    });
  }

  function filteredRows() {
    var m = model();
    var rows = m.store.listOperations() || [];
    if (recordFilter === "draft") {
      return rows.filter(function (row) {
        return row.metaStatus === "draft";
      });
    }
    if (recordFilter === "committed") {
      return rows.filter(function (row) {
        return row.metaStatus !== "draft";
      });
    }
    return rows;
  }

  function paintList() {
    var body = byId("operationsBody");
    var empty = byId("operationsEmpty");
    var wrap = byId("operationsTableWrap");
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
      if (empty) {
        empty.hidden = false;
        empty.textContent = m.store.diskError();
      }
      if (wrap) {
        wrap.hidden = true;
      }
      setStatus(m.store.diskError());
      return;
    }
    var all = m.store.listOperations() || [];
    var rows = filteredRows();
    body.replaceChildren();
    if (empty) {
      empty.hidden = rows.length > 0;
      if (!all.length) {
        empty.textContent = "No operations yet.";
      } else if (!rows.length) {
        empty.textContent = "No matching records.";
      }
    }
    if (wrap) {
      wrap.hidden = rows.length === 0;
    }
    rows.forEach(function (row) {
      var tr = document.createElement("tr");
      var committed = row.metaStatus !== "draft";
      [
        row.operationNumber || row.operationId,
        row.name || "Untitled operation",
        formatWhen(row.plannedStart),
        String(row.targetCount || 0),
        formatWhen(row.updatedAt)
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
      if (committed) {
        link.href = "operation.html?id=" + encodeURIComponent(row.operationId);
        link.textContent = "Open";
      } else {
        link.href = "operation-form.html?id=" + encodeURIComponent(row.operationId);
        link.textContent = "Edit";
      }
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

  function fillForm(record) {
    if (!record) {
      return;
    }
    var idEl = byId("operationId");
    var teamEl = byId("operationTeam");
    var nameEl = byId("operationName");
    var startEl = byId("operationPlannedStart");
    var endEl = byId("operationPlannedEnd");
    if (idEl) {
      idEl.value = record.operationNumber || record.operationId || "";
    }
    if (teamEl) {
      teamEl.value = record.team || 3;
    }
    if (nameEl) {
      nameEl.value = record.name || "";
    }
    if (startEl) {
      startEl.value = toDateTimeLocal(record.plannedStart);
    }
    if (endEl) {
      endEl.value = toDateTimeLocal(record.plannedEnd);
    }
  }

  function collectForm() {
    var m = model();
    var previous = draftRecord;
    var id =
      (previous && previous.operationId) ||
      queryId() ||
      "";
    var teamEl = byId("operationTeam");
    var team = teamEl ? parseInt(teamEl.value, 10) : 3;
    if (!isFinite(team) || team < 1) {
      team = 3;
    }
    return m.createOperation({
      operationId: id,
      operationNumber: (byId("operationId") && byId("operationId").value) || id,
      team: team,
      name: (byId("operationName") && byId("operationName").value) || "",
      plannedStart: (byId("operationPlannedStart") && byId("operationPlannedStart").value) || "",
      plannedEnd: (byId("operationPlannedEnd") && byId("operationPlannedEnd").value) || "",
      existingIds: existingOperationIds(),
      targets: (previous && previous.targets) || [],
      teams: (previous && previous.teams) || [],
      targetAssignments: (previous && previous.targetAssignments) || [],
      opLocations: (previous && previous.opLocations) || [],
      medevacRoute: (previous && previous.medevacRoute) || [],
      importedTeamKeys: (previous && previous.importedTeamKeys) || [],
      markup: (previous && previous.markup) || { labels: [], arrows: [] },
      mapLayers: (previous && previous.mapLayers) || { visible: {} },
      order: (previous && previous.order) || null,
      history: (previous && previous.history) || []
    });
  }

  function persistDraftQuiet(force) {
    var m = model();
    var record = collectForm();
    if (!record.operationId) {
      return { ok: false, error: "Operation is missing an operationId." };
    }
    if (
      !force &&
      !String(record.name || "").trim() &&
      !record.plannedStart &&
      !record.plannedEnd &&
      !(record.targets || []).length
    ) {
      return { ok: false, error: "" };
    }
    var saved = m.store.saveOperation(record, { mode: "draft" });
    if (!saved || !saved.ok) {
      return saved || { ok: false, error: "Could not save." };
    }
    draftRecord = m.store.getOperation(saved.operationId);
    if (window.history && window.history.replaceState && !queryId()) {
      window.history.replaceState(
        {},
        "",
        "operation-form.html?id=" + encodeURIComponent(saved.operationId)
      );
    }
    return saved;
  }

  function targetLabel(row) {
    var m = model();
    if (row && row.freeze && row.freeze.subjectLabel) {
      return row.freeze.subjectLabel;
    }
    if (row && row.leadId && m.store.getLead) {
      var lead = m.store.getLead(row.leadId);
      var person = lead && (m.subjectOf ? m.subjectOf(lead) : lead.person);
      if (person && m.formatPersonLabel) {
        return m.formatPersonLabel(person);
      }
    }
    return (row && row.leadId) || "Target";
  }

  function placesForTarget(row) {
    var m = model();
    if (row && row.freeze && Array.isArray(row.freeze.places) && row.freeze.places.length) {
      return row.freeze.places;
    }
    if (row && row.leadId && m.store.getLead && m.operationPlacesFromLead) {
      var lead = m.store.getLead(row.leadId);
      return m.operationPlacesFromLead(lead) || [];
    }
    return [];
  }

  function paintOperationMap(record) {
    var host = byId("operationMap");
    var empty = byId("operationMapEmpty");
    var list = byId("operationMapList");
    if (!host) {
      return;
    }
    var points = [];
    var legend = [];
    ((record && record.targets) || []).forEach(function (target) {
      var label = targetLabel(target);
      placesForTarget(target).forEach(function (place, index) {
        var title = label;
        var extra = place.plate
          ? [place.plateState, place.plate].filter(Boolean).join(" ")
          : place.association || "";
        var addr = [place.street, place.city, place.state, place.zip]
          .filter(Boolean)
          .join(", ");
        var mapped = !!(place.latitude && place.longitude);
        legend.push({
          title: title,
          extra: extra,
          address: addr,
          mapped: mapped
        });
        if (!mapped) {
          return;
        }
        points.push({
          lat: place.latitude,
          lng: place.longitude,
          title: title,
          extra: extra,
          address: addr,
          meta: [extra, addr].filter(Boolean).join(" · "),
          kind: place.vehicleId ? "vehicle" : "home",
          vehicleId: place.vehicleId || "",
          photoOwners: place.locationId
            ? [{ type: "LOCATION", id: place.locationId }]
            : place.vehicleId
              ? [{ type: "VEHICLE", id: place.vehicleId }]
              : [],
          objectPhotoOwners: place.locationId
            ? [{ type: "LOCATION", id: place.locationId }]
            : place.vehicleId
              ? [{ type: "VEHICLE", id: place.vehicleId }]
              : [],
          personPhotoOwners: target.personId
            ? [{ type: "PERSON", id: target.personId }]
            : [],
          placeKey:
            (target.targetId || target.leadId || "t") + ":" + index
        });
      });
    });
    ((record && record.teams) || []).forEach(function (team) {
      (team.members || []).forEach(function (member) {
        var start = member && member.start;
        if (!start || !start.latitude || !start.longitude) {
          return;
        }
        points.push({
          lat: start.latitude,
          lng: start.longitude,
          title: officerLabel(member.officerId),
          extra: member.heading !== "" && member.heading != null
            ? "HDG " + member.heading
            : "Start",
          address: "",
          meta: "Officer start",
          kind: "officer",
          placeKey: "start:" + team.teamId + ":" + member.officerId
        });
      });
    });
    if (
      pendingStart &&
      pendingStart.latitude &&
      pendingStart.longitude
    ) {
      points.push({
        lat: pendingStart.latitude,
        lng: pendingStart.longitude,
        title: "Pending start",
        extra: "Commit to save",
        kind: "officer",
        placeKey: "pending-start"
      });
    }
    ((record && record.opLocations) || []).forEach(function (loc, index) {
      if (!loc || !loc.latitude || !loc.longitude) {
        return;
      }
      var kind = String(loc.opAssociation || loc.association || "landmark");
      points.push({
        lat: loc.latitude,
        lng: loc.longitude,
        title: kind.charAt(0).toUpperCase() + kind.slice(1),
        extra: loc.notes || "",
        kind: kind,
        placeKey: "op:" + (loc.locationId || index)
      });
      legend.push({
        title: kind,
        extra: loc.notes || "",
        address: "",
        mapped: true
      });
    });
    var lines = [];
    ((record && record.teams) || []).forEach(function (team) {
      (team.members || []).forEach(function (member) {
        if (!member || !member.start || member.heading === "" || member.heading == null) {
          return;
        }
        var lat = Number(member.start.latitude);
        var lng = Number(member.start.longitude);
        var hdg = Number(member.heading);
        if (!isFinite(lat) || !isFinite(lng) || !isFinite(hdg)) {
          return;
        }
        var rad = (hdg * Math.PI) / 180;
        var dLat = 0.001 * Math.cos(rad);
        var dLng =
          (0.001 * Math.sin(rad)) /
          Math.max(0.2, Math.cos((lat * Math.PI) / 180));
        lines.push({
          points: [
            [lat, lng],
            [lat + dLat, lng + dLng]
          ],
          color: "#e8b86d"
        });
      });
    });
    var route = ((record && record.medevacRoute) || [])
      .map(function (pt) {
        if (!pt || !pt.latitude || !pt.longitude) {
          return null;
        }
        return [Number(pt.latitude), Number(pt.longitude)];
      })
      .filter(function (pt) {
        return pt && isFinite(pt[0]) && isFinite(pt[1]);
      });
    if (route.length > 1) {
      lines.push({ points: route, color: "#f87171" });
    }
    if (list) {
      list.replaceChildren();
      legend.forEach(function (row) {
        var li = document.createElement("li");
        li.textContent = [row.title, row.extra, row.address]
          .filter(Boolean)
          .join(" · ");
        if (!row.mapped) {
          li.appendChild(document.createTextNode(" (not mapped)"));
        }
        list.appendChild(li);
      });
      list.hidden = !legend.length;
    }
    if (empty) {
      empty.hidden = points.length > 0 || legend.length > 0;
    }
    if (window.COPDoc && COPDoc.locationMap && COPDoc.locationMap.displayMany) {
      COPDoc.locationMap.displayMany(host, points, {
        keepMap: pageKey() === "operation-form",
        lines: lines,
        onClick: pageKey() === "operation-form" ? onOperationMapClick : null
      });
    } else if (!points.length) {
      host.hidden = true;
    }
  }

  function setPlaceMode(kind, teamId, officerId) {
    placeMode = {
      kind: kind || "",
      teamId: teamId || "",
      officerId: officerId || ""
    };
    pendingStart = null;
    document.querySelectorAll("[data-place-mode]").forEach(function (btn) {
      btn.setAttribute(
        "aria-pressed",
        btn.getAttribute("data-place-mode") === placeMode.kind ? "true" : "false"
      );
    });
    var commit = byId("operationCommitStart");
    if (commit) {
      commit.hidden = true;
    }
    if (kind === "officer") {
      setStatus("Click the map to set that officer’s start, then Commit start.");
    } else if (kind === "route") {
      setStatus("Click the map to add medevac route points.");
    } else if (kind) {
      setStatus("Click the map to drop a " + kind + " pin.");
    }
  }

  function onOperationMapClick(lat, lng) {
    if (pageKey() !== "operation-form") {
      return;
    }
    var kind = placeMode.kind;
    if (!kind) {
      setStatus("Pick Place start, rally, or another pin first.");
      return;
    }
    if (kind === "officer") {
      if (!placeMode.officerId || !placeMode.teamId) {
        setStatus("Select an officer in a cell first.");
        return;
      }
      pendingStart = {
        teamId: placeMode.teamId,
        officerId: placeMode.officerId,
        latitude: lat,
        longitude: lng
      };
      var commit = byId("operationCommitStart");
      if (commit) {
        commit.hidden = false;
      }
      paintOperationMap(draftRecord);
      setStatus("Pending start. Commit start to save it.");
      return;
    }
    var saved = persistDraftQuiet(true);
    if (!saved || !saved.ok) {
      setStatus((saved && saved.error) || "Save the operation first.");
      return;
    }
    var m = model();
    if (kind === "route") {
      var routed = m.store.addMedevacRoutePoint(saved.operationId, lat, lng);
      if (!routed || !routed.ok) {
        setStatus((routed && routed.error) || "Could not add that route point.");
        return;
      }
      draftRecord = m.store.getOperation(saved.operationId);
      paintOperationMap(draftRecord);
      setStatus("Added medevac route point.", true);
      return;
    }
    var placed = m.store.addOperationLocation(saved.operationId, {
      opAssociation: kind,
      latitude: lat,
      longitude: lng
    });
    if (!placed || !placed.ok) {
      setStatus((placed && placed.error) || "Could not drop that pin.");
      return;
    }
    draftRecord = m.store.getOperation(saved.operationId);
    paintOperationMap(draftRecord);
    setStatus("Dropped " + kind + " pin.", true);
  }

  function commitPendingStart() {
    if (!pendingStart) {
      setStatus("Click the map to set a start first.");
      return;
    }
    var saved = persistDraftQuiet(true);
    if (!saved || !saved.ok) {
      setStatus((saved && saved.error) || "Save the operation first.");
      return;
    }
    var result = model().store.setOperationMemberStart(
      saved.operationId,
      pendingStart.teamId,
      pendingStart.officerId,
      pendingStart
    );
    if (!result || !result.ok) {
      setStatus((result && result.error) || "Could not save that start.");
      return;
    }
    pendingStart = null;
    var commit = byId("operationCommitStart");
    if (commit) {
      commit.hidden = true;
    }
    draftRecord = model().store.getOperation(saved.operationId);
    paintCells(draftRecord);
    paintOperationMap(draftRecord);
    setStatus("Start saved.", true);
  }

  function paintTargets(record) {
    var body = byId("operationTargetsBody");
    var empty = byId("operationTargetsEmpty");
    var wrap = byId("operationTargetsWrap");
    if (!body) {
      return;
    }
    var rows = (record && record.targets) || [];
    body.replaceChildren();
    if (empty) {
      empty.hidden = rows.length > 0;
    }
    if (wrap) {
      wrap.hidden = rows.length === 0;
    }
    rows.forEach(function (row) {
      var places = placesForTarget(row);
      var tr = document.createElement("tr");
      function td(text) {
        var cell = document.createElement("td");
        cell.textContent = text;
        tr.appendChild(cell);
      }
      td(targetLabel(row));
      td(
        places
          .map(function (place) {
            return (
              [place.street, place.city].filter(Boolean).join(", ") ||
              [place.plateState, place.plate].filter(Boolean).join(" ")
            );
          })
          .filter(Boolean)
          .join("; ") || "—"
      );
      td(
        String(
          places.filter(function (place) {
            return place && place.vehicleId;
          }).length
        )
      );
      var assigned =
        ((record && record.targetAssignments) || []).filter(function (link) {
          return link && link.targetId === row.targetId;
        })[0];
      var cellTd = document.createElement("td");
      if (pageKey() === "operation-form") {
        var sel = document.createElement("select");
        sel.setAttribute("data-assign-target", row.targetId);
        var blank = document.createElement("option");
        blank.value = "";
        blank.textContent = "Unassigned";
        sel.appendChild(blank);
        ((record && record.teams) || []).forEach(function (team) {
          var opt = document.createElement("option");
          opt.value = team.teamId;
          opt.textContent = team.name || "Cell";
          sel.appendChild(opt);
        });
        sel.value = (assigned && assigned.teamId) || "";
        cellTd.appendChild(sel);
      } else {
        var teamName = "—";
        ((record && record.teams) || []).forEach(function (team) {
          if (assigned && team.teamId === assigned.teamId) {
            teamName = team.name || "Cell";
          }
        });
        cellTd.textContent = teamName;
      }
      tr.appendChild(cellTd);
      if (pageKey() === "operation-form") {
        var actions = document.createElement("td");
        var drop = document.createElement("button");
        drop.type = "button";
        drop.className = "action-button-secondary compact";
        drop.setAttribute("data-remove-target", row.targetId);
        drop.textContent = "×";
        drop.title = "Remove this target";
        actions.appendChild(drop);
        tr.appendChild(actions);
      }
      body.appendChild(tr);
    });
    paintOperationMap(record);
  }

  function openTargetPicker() {
    var picker = byId("operationTargetPicker");
    var list = byId("operationTargetPickerList");
    var m = model();
    if (!picker || !list || !m.store.listImportableOperationTargets) {
      return;
    }
    var have = {};
    ((draftRecord && draftRecord.targets) || []).forEach(function (row) {
      if (row && row.leadId) {
        have[row.leadId] = true;
      }
    });
    var rows = m.store.listImportableOperationTargets() || [];
    list.replaceChildren();
    var available = rows.filter(function (row) {
      return row && !have[row.leadId];
    });
    if (!available.length) {
      var none = document.createElement("p");
      none.className = "records-empty";
      none.textContent = have && Object.keys(have).length
        ? "No other filed cases with a place or vehicle."
        : "No filed cases with a place or vehicle.";
      list.appendChild(none);
    }
    available.forEach(function (row) {
      var label = document.createElement("label");
      label.className = "operation-picker-row";
      var box = document.createElement("input");
      box.type = "checkbox";
      box.value = row.leadId;
      label.appendChild(box);
      label.appendChild(
        document.createTextNode(
          " " +
            row.label +
            (row.caseNumber ? " · " + row.caseNumber : "") +
            " · " +
            row.placeCount +
            " place(s)"
        )
      );
      list.appendChild(label);
    });
    picker.hidden = false;
  }

  function importSelectedTargets() {
    var picker = byId("operationTargetPicker");
    var list = byId("operationTargetPickerList");
    var m = model();
    if (!list || !m.store.addOperationTargets) {
      return;
    }
    var ids = [];
    list.querySelectorAll("input[type='checkbox']:checked").forEach(function (box) {
      if (box.value) {
        ids.push(box.value);
      }
    });
    if (!ids.length) {
      setStatus("Pick at least one case.");
      return;
    }
    var saved = persistDraftQuiet(true);
    if (!saved || !saved.ok) {
      setStatus((saved && saved.error) || "Save the operation first.");
      return;
    }
    var result = m.store.addOperationTargets(saved.operationId, ids);
    if (!result || !result.ok) {
      setStatus((result && result.error) || "Could not import those cases.");
      return;
    }
    draftRecord = m.store.getOperation(saved.operationId);
    paintTargets(draftRecord);
    paintCells(draftRecord);
    if (picker) {
      picker.hidden = true;
    }
    setStatus(
      result.added
        ? "Imported " + result.added + " target" + (result.added === 1 ? "" : "s") + "."
        : "Those cases are already on this operation.",
      true
    );
  }

  function removeTarget(targetId) {
    var m = model();
    var saved = persistDraftQuiet(true);
    if (!saved || !saved.ok || !m.store.removeOperationTarget) {
      setStatus((saved && saved.error) || "Could not remove that target.");
      return;
    }
    var result = m.store.removeOperationTarget(saved.operationId, targetId);
    if (!result || !result.ok) {
      setStatus((result && result.error) || "Could not remove that target.");
      return;
    }
    draftRecord = m.store.getOperation(saved.operationId);
    paintTargets(draftRecord);
    paintCells(draftRecord);
    setStatus("Removed target.", true);
  }

  function rosterApi() {
    return window.COPDoc && COPDoc.officers;
  }

  function officerLabel(officerId) {
    var api = rosterApi();
    var row = api && api.get ? api.get(officerId) : null;
    if (api && api.display && row) {
      return api.display(row);
    }
    return officerId || "Officer";
  }

  function availabilityFor(officer, record) {
    var m = model();
    if (!m.officerAvailability || !officer) {
      return { available: true, reason: "" };
    }
    var ops = (m.store.listOperations() || []).map(function (row) {
      return m.store.getOperation(row.operationId);
    });
    var shifts = rosterApi() && rosterApi().listShifts ? rosterApi().listShifts() : [];
    return m.officerAvailability(officer, {
      plannedStart: record && record.plannedStart,
      plannedEnd: record && record.plannedEnd,
      shifts: shifts,
      operations: ops,
      exceptOperationId: record && record.operationId
    });
  }

  function assignedTeamId(record, targetId) {
    var hit = ((record && record.targetAssignments) || []).filter(function (row) {
      return row && row.targetId === targetId;
    })[0];
    return (hit && hit.teamId) || "";
  }

  function paintCells(record) {
    var host = byId("operationCellsList");
    var empty = byId("operationCellsEmpty");
    var sa = byId("operationSaBody");
    if (!host) {
      return;
    }
    host.replaceChildren();
    var teams = (record && record.teams) || [];
    if (empty) {
      empty.hidden = teams.length > 0;
    }
    var fleet = rosterApi() && rosterApi().listFleet ? rosterApi().listFleet() : [];
    var roles = (model().OPERATION_ASSIGNMENT_ROLES || []).slice();
    teams.forEach(function (team) {
      var box = document.createElement("div");
      box.className = "operation-cell";
      var head = document.createElement("div");
      head.className = "operation-cell-head";
      var title = document.createElement("strong");
      title.textContent = team.name || "Cell";
      head.appendChild(title);
      if (pageKey() === "operation-form") {
        var veh = document.createElement("select");
        veh.setAttribute("data-cell-vehicle", team.teamId);
        var none = document.createElement("option");
        none.value = "";
        none.textContent = "No vehicle";
        veh.appendChild(none);
        fleet.forEach(function (row) {
          var opt = document.createElement("option");
          opt.value = row.vehicleId || row.id;
          opt.textContent =
            [row.plateState, row.licensePlate || row.plate, row.vehicleMake]
              .filter(Boolean)
              .join(" ") || opt.value;
          veh.appendChild(opt);
        });
        if (team.vehicleId && !fleet.some(function (row) { return (row.vehicleId || row.id) === team.vehicleId; })) {
          var roster = rosterApi();
          var admin = roster && roster.readAdmin ? roster.readAdmin() : null;
          var historicalVehicle = admin && admin.ok && (admin.data.vehicles || []).filter(function (row) {
            return row && (row.vehicleId || row.id) === team.vehicleId;
          })[0];
          var historical = document.createElement("option");
          historical.value = team.vehicleId;
          historical.disabled = true;
          historical.textContent = (historicalVehicle
            ? [historicalVehicle.plateState, historicalVehicle.licensePlate || historicalVehicle.plate, historicalVehicle.vehicleMake].filter(Boolean).join(" ") || team.vehicleId
            : team.vehicleId) + " (unavailable; existing assignment)";
          veh.appendChild(historical);
        }
        veh.value = team.vehicleId || "";
        head.appendChild(veh);
        var drop = document.createElement("button");
        drop.type = "button";
        drop.className = "action-button-secondary compact";
        drop.setAttribute("data-remove-cell", team.teamId);
        drop.textContent = "×";
        head.appendChild(drop);
      }
      box.appendChild(head);
      (team.members || []).forEach(function (member) {
        var row = document.createElement("div");
        row.className = "operation-cell-member";
        var name = document.createElement("button");
        name.type = "button";
        name.className = "investigation-associate-name";
        name.setAttribute("data-place-start", member.officerId);
        name.setAttribute("data-place-cell", team.teamId);
        name.textContent = officerLabel(member.officerId);
        if (!member.start || !member.start.latitude) {
          name.className += " is-missing-start";
        }
        row.appendChild(name);
        if (pageKey() === "operation-form") {
          var role = document.createElement("select");
          role.setAttribute("data-member-role", member.officerId);
          role.setAttribute("data-member-cell", team.teamId);
          roles.forEach(function (code) {
            var opt = document.createElement("option");
            opt.value = code;
            opt.textContent =
              (model().OPERATION_ASSIGNMENT_LABELS &&
                model().OPERATION_ASSIGNMENT_LABELS[code]) ||
              code;
            role.appendChild(opt);
          });
          role.value = member.assignmentRole || "";
          row.appendChild(role);
          var hdg = document.createElement("input");
          hdg.type = "number";
          hdg.min = "0";
          hdg.max = "359";
          hdg.placeholder = "HDG";
          hdg.title = "Heading 0–359";
          hdg.setAttribute("data-member-heading", member.officerId);
          hdg.setAttribute("data-member-cell", team.teamId);
          hdg.value = member.heading === 0 || member.heading ? member.heading : "";
          row.appendChild(hdg);
          var sector = document.createElement("input");
          sector.type = "text";
          sector.placeholder = "Sector";
          sector.setAttribute("data-member-sector", member.officerId);
          sector.setAttribute("data-member-cell", team.teamId);
          sector.value = member.sector || "";
          row.appendChild(sector);
          var scans = document.createElement("input");
          scans.type = "text";
          scans.placeholder = "Scans";
          scans.setAttribute("data-member-scans", member.officerId);
          scans.setAttribute("data-member-cell", team.teamId);
          scans.value = member.scans || "";
          row.appendChild(scans);
        } else {
          var roleBit = document.createElement("span");
          roleBit.textContent =
            (model().OPERATION_ASSIGNMENT_LABELS &&
              model().OPERATION_ASSIGNMENT_LABELS[member.assignmentRole]) ||
            member.assignmentRole ||
            "";
          row.appendChild(roleBit);
        }
        box.appendChild(row);
      });
      host.appendChild(box);
    });
    if (sa) {
      sa.replaceChildren();
      teams.forEach(function (team) {
        (team.members || []).forEach(function (member) {
          var officer = rosterApi() && rosterApi().get && rosterApi().get(member.officerId);
          var avail = availabilityFor(officer || { officerId: member.officerId, duty: "available" }, record);
          var tr = document.createElement("tr");
          function td(text) {
            var cell = document.createElement("td");
            cell.textContent = text;
            tr.appendChild(cell);
          }
          td(officerLabel(member.officerId));
          td(
            (model().OPERATION_ASSIGNMENT_LABELS &&
              model().OPERATION_ASSIGNMENT_LABELS[member.assignmentRole]) ||
              member.assignmentRole ||
              "—"
          );
          td((officer && officer.role) || "—");
          td(((officer && officer.qualifications) || []).join(", ") || "—");
          td((officer && officer.duty) || "—");
          td(avail.available ? "Yes" : avail.reason || "No");
          td(
            member.start && member.start.latitude
              ? member.heading !== "" && member.heading != null
                ? "Set · " + member.heading + "°"
                : "Set"
              : "Missing"
          );
          if (!avail.available) {
            tr.className = "is-unavailable";
          }
          if (!member.start || !member.start.latitude) {
            tr.classList.add("is-missing-start");
          }
          sa.appendChild(tr);
        });
      });
      var saWrap = byId("operationSaWrap");
      if (saWrap) {
        saWrap.hidden = !sa.childNodes.length;
      }
    }
  }

  function openCellPicker() {
    var picker = byId("operationCellPicker");
    var list = byId("operationCellPickerList");
    var api = rosterApi();
    if (!picker || !list || !api || !api.groupsByTeam) {
      setStatus("Officer roster is not available.");
      return;
    }
    list.replaceChildren();
    var groups = api.groupsByTeam() || [];
    if (!groups.length) {
      var none = document.createElement("p");
      none.className = "records-empty";
      none.textContent = "No filed officers on the roster.";
      list.appendChild(none);
      picker.hidden = false;
      return;
    }
    groups.forEach(function (group) {
      var field = document.createElement("fieldset");
      field.className = "operation-cell-group";
      var legend = document.createElement("legend");
      legend.textContent = group.teamKey;
      field.appendChild(legend);
      (group.officers || []).forEach(function (officer) {
        var avail = availabilityFor(officer, draftRecord);
        var label = document.createElement("label");
        label.className = "operation-picker-row";
        if (!avail.available) {
          label.className += " is-unavailable";
        }
        var box = document.createElement("input");
        box.type = "checkbox";
        box.value = officer.officerId || officer.id;
        box.setAttribute("data-roster-key", group.teamKey);
        label.appendChild(box);
        label.appendChild(
          document.createTextNode(
            " " +
              (rosterApi().display(officer) || officer.lastName) +
              (avail.available ? "" : " · " + avail.reason)
          )
        );
        field.appendChild(label);
      });
      list.appendChild(field);
    });
    picker.hidden = false;
  }

  function importSelectedCell() {
    var picker = byId("operationCellPicker");
    var list = byId("operationCellPickerList");
    var m = model();
    if (!list || !m.store.importOperationTeam) {
      return;
    }
    var ids = [];
    var rosterKey = "";
    list.querySelectorAll("input[type='checkbox']:checked").forEach(function (box) {
      ids.push(box.value);
      rosterKey = box.getAttribute("data-roster-key") || rosterKey;
    });
    var saved = persistDraftQuiet(true);
    if (!saved || !saved.ok) {
      setStatus((saved && saved.error) || "Save the operation first.");
      return;
    }
    var result = m.store.importOperationTeam(saved.operationId, {
      officerIds: ids,
      rosterKey: rosterKey,
      name: rosterKey || "Cell"
    });
    if (!result || !result.ok) {
      setStatus((result && result.error) || "Could not import that cell.");
      return;
    }
    draftRecord = m.store.getOperation(saved.operationId);
    paintCells(draftRecord);
    paintTargets(draftRecord);
    if (picker) {
      picker.hidden = true;
    }
    setStatus("Imported cell.", true);
  }

  function bootForm() {
    var m = model();
    if (!m || !m.store) {
      return;
    }
    m.store.loadFromDisk();
    var id = queryId();
    if (id) {
      draftRecord = m.store.getOperation(id);
      if (!draftRecord) {
        setStatus("Operation not found.");
        return;
      }
      if (isCommitted(draftRecord)) {
        window.location.replace("operation.html?id=" + encodeURIComponent(id));
        return;
      }
      fillForm(draftRecord);
      paintTargets(draftRecord);
      paintCells(draftRecord);
      return;
    }
    draftRecord = m.createOperation({
      team: 3,
      existingIds: existingOperationIds()
    });
    fillForm(draftRecord);
    paintTargets(draftRecord);
    paintCells(draftRecord);
  }

  function bindFormDraft() {
    var form = byId("operationForm");
    if (!form || form.dataset.opDraftBound === "true") {
      return;
    }
    form.dataset.opDraftBound = "true";
    form.addEventListener("change", function (event) {
      if (
        event.target.closest &&
        event.target.closest(
          "[data-assign-target], [data-member-role], [data-cell-vehicle], [data-member-heading], [data-member-sector], [data-member-scans]"
        )
      ) {
        return;
      }
      persistDraftQuiet();
    });
  }

  function commitOperation() {
    var m = model();
    if (!m || !m.store) {
      return;
    }
    var record = collectForm();
    var saved = m.store.saveOperation(record, { mode: "commit" });
    if (!saved || !saved.ok) {
      setStatus((saved && saved.error) || "Could not save.");
      return;
    }
    setStatus("Operation issued.", true);
    window.location.href = "operation.html?id=" + encodeURIComponent(saved.operationId);
  }

  function paintView() {
    var missing = byId("operationMissing");
    var body = byId("operationView");
    var m = model();
    if (!m || !m.store) {
      return;
    }
    m.store.loadFromDisk();
    var id = queryId();
    var record = id ? m.store.getOperation(id) : null;
    if (!record) {
      if (missing) {
        missing.hidden = false;
      }
      if (body) {
        body.hidden = true;
      }
      setStatus("Operation not found.");
      return;
    }
    if (!isCommitted(record)) {
      window.location.replace("operation-form.html?id=" + encodeURIComponent(record.operationId));
      return;
    }
    if (missing) {
      missing.hidden = true;
    }
    if (body) {
      body.hidden = false;
    }
    function setText(elId, text) {
      var el = byId(elId);
      if (el) {
        el.textContent = text;
      }
    }
    setText("operationViewNumber", record.operationNumber || record.operationId);
    setText("operationViewName", record.name || "Untitled operation");
    setText(
      "operationViewWindow",
      [formatWhen(record.plannedStart), formatWhen(record.plannedEnd)]
        .filter(function (part) {
          return part && part !== "—";
        })
        .join(" – ") || "—"
    );
    setText("operationViewTargets", String((record.targets || []).length));
    setText("operationViewCells", String((record.teams || []).length));
    var narrative = byId("operationViewNarrative");
    if (narrative) {
      narrative.textContent =
        (record.order && record.order.narrative) ||
        "Issue this operation to generate the order text.";
    }
    paintTargets(record);
    paintCells(record);
  }

  function generateBrief() {
    var id = queryId();
    if (!id) {
      setStatus("Open an issued operation first.");
      return;
    }
    var record = model().store.getOperation(id);
    if (!record || !isCommitted(record)) {
      setStatus("Issue the operation before generating a brief.");
      return;
    }
    if (!(record.targets || []).length) {
      setStatus("Import targets before generating a brief.");
      return;
    }
    window.open("operation-brief.html?id=" + encodeURIComponent(id), "_blank");
  }

  function fillTargetPhoto(img, personId) {
    if (!img || !personId || !window.COPDoc || !COPDoc.media) {
      return;
    }
    var list = COPDoc.media.list;
    var blob = COPDoc.media.blob || COPDoc.media.getBlob;
    if (typeof list !== "function" || typeof blob !== "function") {
      return;
    }
    list({ type: "PERSON", id: personId })
      .then(function (rows) {
        var photos = (rows || []).filter(function (row) {
          return row && row.mediaClass === "photo";
        });
        var primary =
          photos.filter(function (row) {
            return row.primary;
          })[0] || photos[0];
        if (!primary) {
          return null;
        }
        return blob(primary.mediaId, "display").catch(function () {
          return blob(primary.mediaId, "original");
        });
      })
      .then(function (rec) {
        if (!rec || !rec.blob) {
          return;
        }
        img.src = URL.createObjectURL(rec.blob);
        img.hidden = false;
      })
      .catch(function () {});
  }

  function paintBrief() {
    var missing = byId("operationBriefMissing");
    var sheet = byId("operationBriefSheet");
    var m = model();
    if (!m || !m.store) {
      return;
    }
    m.store.loadFromDisk();
    var id = queryId();
    var record = id ? m.store.getOperation(id) : null;
    if (!record || !isCommitted(record)) {
      briefDocumentSources = null;
      if (missing) {
        missing.hidden = false;
      }
      if (sheet) {
        sheet.hidden = true;
      }
      document.title = "Operation sheet";
      return;
    }
    var officers = {};
    (record.teams || []).forEach(function (team) {
      (team.members || []).forEach(function (member) {
        var api = rosterApi();
        if (member.officerId && api && api.get) { officers[member.officerId] = api.get(member.officerId); }
      });
    });
    ((record.order && record.order.officerBriefs) || []).forEach(function (row) {
      var api = rosterApi();
      if (row.officerId && api && api.get) { officers[row.officerId] = api.get(row.officerId); }
    });
    briefDocumentSources = JSON.parse(JSON.stringify({ operation: record, officers: officers,
      targets: (record.targets || []).map(function (target) { return { targetId: target.targetId, leadId: target.leadId, personId: target.personId, label: targetLabel(target), places: placesForTarget(target) }; }) }));
    if (missing) {
      missing.hidden = true;
    }
    if (sheet) {
      sheet.hidden = false;
    }
    document.title =
      (record.name || record.operationNumber || "Operation") + " — Operation sheet";
    function setText(elId, text) {
      var el = byId(elId);
      if (el) {
        el.textContent = text || "—";
      }
    }
    setText("briefNumber", record.operationNumber || record.operationId);
    setText("briefName", record.name || "Untitled operation");
    setText(
      "briefWindow",
      [formatWhen(record.plannedStart), formatWhen(record.plannedEnd)]
        .filter(function (part) {
          return part && part !== "—";
        })
        .join(" – ")
    );
    setText(
      "briefNarrative",
      (record.order && record.order.narrative) || ""
    );
    paintOperationMap(record);
    var nest = byId("briefTargetSheets");
    if (nest) {
      nest.replaceChildren();
      (record.targets || []).forEach(function (target) {
        var article = document.createElement("article");
        article.className = "operation-nested-sheet";
        var team = (record.teams || []).filter(function (row) {
          var link = (record.targetAssignments || []).filter(function (item) {
            return item && item.targetId === target.targetId && item.teamId === row.teamId;
          })[0];
          return !!link;
        })[0];
        var img = document.createElement("img");
        img.alt = "";
        img.hidden = true;
        img.className = "operation-nested-photo";
        article.appendChild(img);
        fillTargetPhoto(img, target.personId);
        var h = document.createElement("h2");
        h.textContent =
          (target.freeze && target.freeze.subjectLabel) ||
          targetLabel(target);
        article.appendChild(h);
        var places = placesForTarget(target);
        var ul = document.createElement("ul");
        ul.className = "operation-nested-places";
        places.forEach(function (place) {
          var li = document.createElement("li");
          li.textContent = [
            place.association,
            [place.street, place.city, place.state].filter(Boolean).join(", "),
            [place.plateState, place.plate].filter(Boolean).join(" "),
            place.ymm
          ]
            .filter(Boolean)
            .join(" · ");
          ul.appendChild(li);
        });
        if (!places.length) {
          var empty = document.createElement("li");
          empty.textContent = "No places frozen.";
          ul.appendChild(empty);
        }
        article.appendChild(ul);
        var cell = document.createElement("p");
        cell.className = "operation-nested-cell";
        if (team) {
          cell.textContent =
            (team.name || "Cell") +
            ": " +
            (team.members || [])
              .map(function (member) {
                var role =
                  (m.OPERATION_ASSIGNMENT_LABELS &&
                    m.OPERATION_ASSIGNMENT_LABELS[member.assignmentRole]) ||
                  member.assignmentRole;
                return officerLabel(member.officerId) + " (" + role + ")";
              })
              .join("; ");
        } else {
          cell.textContent = "No cell assigned.";
        }
        article.appendChild(cell);
        nest.appendChild(article);
      });
    }
    var briefs = byId("briefOfficerCards");
    if (briefs) {
      briefs.replaceChildren();
      (((record.order && record.order.officerBriefs) || [])).forEach(function (row) {
        var card = document.createElement("article");
        card.className = "operation-officer-brief";
        var title = document.createElement("h3");
        title.textContent =
          officerLabel(row.officerId) +
          " · " +
          ((m.OPERATION_ASSIGNMENT_LABELS &&
            m.OPERATION_ASSIGNMENT_LABELS[row.role]) ||
            row.role);
        card.appendChild(title);
        [
          row.primary,
          row.secondary,
          row.address ? "Place: " + row.address : "",
          row.heading ? "Heading " + row.heading : "",
          row.sector ? "Sector: " + row.sector : "",
          row.scans ? "Scans: " + row.scans : "",
          row.rally ? "Rally: " + row.rally : "",
          row.medevac ? "Medevac: " + row.medevac : "",
          row.teammates && row.teammates.length
            ? "Team: " + row.teammates.join(", ")
            : ""
        ]
          .filter(Boolean)
          .forEach(function (line) {
            var p = document.createElement("p");
            p.textContent = line;
            card.appendChild(p);
          });
        briefs.appendChild(card);
      });
    }
  }

  function briefFailure(error) {
    setStatus(error && error.message || "Could not generate the operation sheet.");
    return null;
  }

  function briefDocumentApi() {
    var api = window.COPDoc && COPDoc.documents;
    if (!api || !api.captureContext || !api.generate) {
      throw new Error("Document generation is unavailable. Reload this page and try again.");
    }
    return api;
  }

  function escapeBriefHtml(text) {
    return String(text || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function renderBriefHtml(context, presentationHtml) {
    return "<!DOCTYPE html><html lang=\"en\"><head><meta charset=\"UTF-8\">" +
      "<title>" + escapeBriefHtml(context.input.title) +
      "</title><link rel=\"stylesheet\" href=\"style/style.css\"></head><body data-page=\"operation-brief\">" +
      (presentationHtml == null ? context.input.presentationHtml : presentationHtml) + "</body></html>";
  }

  function captureBrief(documentType) {
    var sheet = byId("operationBriefSheet");
    if (!sheet || sheet.hidden || !briefDocumentSources) { throw new Error("Open an issued operation brief first."); }
    var api = briefDocumentApi();
    var state = JSON.parse(JSON.stringify(briefDocumentSources));
    var record = state.operation;
    var officers = Object.keys(state.officers).map(function (id) { return state.officers[id]; }).filter(Boolean);
    var sources = [{ type: "operation", id: record.operationId, revision: record.meta && record.meta.updatedAt || "", authority: "snapshot" }];
    officers.forEach(function (row) { sources.push({ type: "officer", id: row.officerId || row.id, revision: row.meta && row.meta.updatedAt || "", authority: "snapshot" }); });
    state.targets.forEach(function (row) {
      if (row.leadId) { sources.push({ type: "lead", id: row.leadId, revision: "", authority: "snapshot" }); }
      if (row.personId) { sources.push({ type: "person", id: row.personId, revision: "", authority: "snapshot" }); }
    });
    var clone = sheet.cloneNode(true);
    var title = record.name || record.operationNumber || "operation";
    var context = api.captureContext({ documentType: documentType, officers: officers, sources: sources,
      input: { operation: record, targets: state.targets, title: title, presentationHtml: clone.outerHTML, baseUrl: new URL(".", window.location.href).href } });
    return { api: api, context: context, clone: clone };
  }

  async function inlineBriefImages(clone) {
    var images = Array.prototype.slice.call(clone.querySelectorAll("img"));
    await Promise.all(images.map(async function (img) {
      var src = img.getAttribute("src") || "";
      if (!src || /^data:/i.test(src)) { return; }
      var response = await fetch(src);
      if (!response.ok) { throw new Error("An operation sheet image could not be captured. Reload the brief and try again."); }
      var blob = await response.blob();
      var data = await new Promise(function (resolve, reject) {
        var reader = new FileReader();
        reader.onload = function () { resolve(String(reader.result || "")); };
        reader.onerror = function () { reject(new Error("An operation sheet image could not be read.")); };
        reader.readAsDataURL(blob);
      });
      img.setAttribute("src", data);
    }));
    return clone.outerHTML;
  }

  async function recordBriefSubmission(api, generationId, method) {
    try {
      await api.recordDelivery(generationId, { method: method, status: "SUBMITTED" });
      setStatus(method === "print" ? "Operation sheet sent to the print dialog." : "Operation sheet download requested.", true);
    } catch (error) {
      setStatus("Operation sheet was submitted for " + method + ", but delivery history could not be saved. " + (error && error.message || ""));
    }
  }

  function printBrief() {
    var capture;
    try { capture = captureBrief("operation-brief.print"); } catch (error) { return Promise.resolve(briefFailure(error)); }
    // Reserve the window in the click gesture, then print only the recorded frozen artifact.
    var printWindow = window.open("", "_blank");
    if (!printWindow) { return Promise.resolve(briefFailure(new Error("Allow the operation print window, then try again."))); }
    try { printWindow.opener = null; } catch (error) {}
    var generatedId = null;
    return capture.api.generate({ documentType: "operation-brief.print", context: capture.context,
      templateContent: renderBriefHtml.toString(),
      render: async function (context) {
        var html = renderBriefHtml(context, await inlineBriefImages(capture.clone));
        var base = "<base href=\"" + escapeBriefHtml(context.input.baseUrl) + "\">";
        return { data: html.replace("<head>", "<head>" + base), mimeType: "text/html", filename: "Operation_print.html" };
      }
    }).then(async function (result) {
      generatedId = result.record.generationId;
      printWindow.document.open();
      printWindow.document.write(result.artifact.data);
      printWindow.document.close();
      if (printWindow.document.readyState !== "complete") {
        await new Promise(function (resolve, reject) {
          var timeout = setTimeout(function () { reject(new Error("The print sheet did not finish loading. Try printing again.")); }, 10000);
          printWindow.addEventListener("load", function () { clearTimeout(timeout); resolve(); }, { once: true });
        });
      }
      printWindow.focus();
      printWindow.print();
      await recordBriefSubmission(capture.api, result.record.generationId, "print");
      return result;
    }).catch(async function (error) {
      if (generatedId) { await capture.api.recordDelivery(generatedId, { method: "print", status: "FAILED" }).catch(function () {}); }
      try { printWindow.close(); } catch (ignored) {}
      return briefFailure(error);
    });
  }

  function saveOperationBrief() {
    var capture;
    try { capture = captureBrief("operation-brief.html"); } catch (error) { return Promise.resolve(briefFailure(error)); }
    var slug = String(capture.context.input.title).replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "");
    return capture.api.generate({ documentType: "operation-brief.html", context: capture.context,
      templateContent: renderBriefHtml.toString(),
      render: async function (context) {
        return { data: renderBriefHtml(context, await inlineBriefImages(capture.clone)), mimeType: "text/html", filename: "Operation_" + slug + ".html" };
      }
    }).then(async function (result) {
      try {
        var url = URL.createObjectURL(new Blob([result.artifact.data], { type: result.artifact.mimeType }));
        var a = document.createElement("a");
        a.href = url;
        a.download = result.artifact.filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      } catch (error) {
        await capture.api.recordDelivery(result.record.generationId, { method: "download", status: "FAILED" }).catch(function () {});
        throw error;
      }
      await recordBriefSubmission(capture.api, result.record.generationId, "download");
      return result;
    }).catch(briefFailure);
  }

  function bind() {
    var page = pageKey();
    if (page === "operations") {
      bindFilters();
      paintList();
      return;
    }
    if (page === "operation-form") {
      bootForm();
      bindFormDraft();
      var importBtn = byId("operationImportTargets");
      if (importBtn && importBtn.dataset.bound !== "true") {
        importBtn.dataset.bound = "true";
        importBtn.addEventListener("click", function (event) {
          event.preventDefault();
          openTargetPicker();
        });
      }
      var pickerImport = byId("operationTargetPickerImport");
      if (pickerImport && pickerImport.dataset.bound !== "true") {
        pickerImport.dataset.bound = "true";
        pickerImport.addEventListener("click", function (event) {
          event.preventDefault();
          importSelectedTargets();
        });
      }
      var pickerCancel = byId("operationTargetPickerCancel");
      if (pickerCancel && pickerCancel.dataset.bound !== "true") {
        pickerCancel.dataset.bound = "true";
        pickerCancel.addEventListener("click", function (event) {
          event.preventDefault();
          var picker = byId("operationTargetPicker");
          if (picker) {
            picker.hidden = true;
          }
        });
      }
      var targetWrap = byId("operationTargetsWrap");
      if (targetWrap && targetWrap.dataset.bound !== "true") {
        targetWrap.dataset.bound = "true";
        targetWrap.addEventListener("click", function (event) {
          var btn =
            event.target.closest && event.target.closest("[data-remove-target]");
          if (!btn) {
            return;
          }
          event.preventDefault();
          removeTarget(btn.getAttribute("data-remove-target"));
        });
        targetWrap.addEventListener("change", function (event) {
          var sel =
            event.target.closest && event.target.closest("[data-assign-target]");
          if (!sel) {
            return;
          }
          var saved = persistDraftQuiet(true);
          if (!saved || !saved.ok) {
            setStatus((saved && saved.error) || "Save the operation first.");
            return;
          }
          var assigned = model().store.assignOperationTargetTeam(
            saved.operationId,
            sel.getAttribute("data-assign-target"),
            sel.value
          );
          if (!assigned || !assigned.ok) {
            setStatus((assigned && assigned.error) || "Could not assign that cell.");
            return;
          }
          draftRecord = model().store.getOperation(saved.operationId);
          paintTargets(draftRecord);
          paintCells(draftRecord);
          setStatus("Assigned cell.", true);
        });
      }
      var importCells = byId("operationImportCells");
      if (importCells && importCells.dataset.bound !== "true") {
        importCells.dataset.bound = "true";
        importCells.addEventListener("click", function (event) {
          event.preventDefault();
          openCellPicker();
        });
      }
      var cellImport = byId("operationCellPickerImport");
      if (cellImport && cellImport.dataset.bound !== "true") {
        cellImport.dataset.bound = "true";
        cellImport.addEventListener("click", function (event) {
          event.preventDefault();
          importSelectedCell();
        });
      }
      var cellCancel = byId("operationCellPickerCancel");
      if (cellCancel && cellCancel.dataset.bound !== "true") {
        cellCancel.dataset.bound = "true";
        cellCancel.addEventListener("click", function (event) {
          event.preventDefault();
          var picker = byId("operationCellPicker");
          if (picker) {
            picker.hidden = true;
          }
        });
      }
      var cellsHost = byId("operationCellsList");
      if (cellsHost && cellsHost.dataset.bound !== "true") {
        cellsHost.dataset.bound = "true";
        cellsHost.addEventListener("click", function (event) {
          var btn =
            event.target.closest && event.target.closest("[data-remove-cell]");
          if (!btn) {
            return;
          }
          event.preventDefault();
          var saved = persistDraftQuiet(true);
          if (!saved || !saved.ok) {
            return;
          }
          var dropped = model().store.removeOperationTeam(
            saved.operationId,
            btn.getAttribute("data-remove-cell")
          );
          if (!dropped || !dropped.ok) {
            setStatus((dropped && dropped.error) || "Could not remove that cell.");
            return;
          }
          draftRecord = model().store.getOperation(saved.operationId);
          paintCells(draftRecord);
          paintTargets(draftRecord);
          setStatus("Removed cell.", true);
        });
        cellsHost.addEventListener("change", function (event) {
          var roleSel =
            event.target.closest && event.target.closest("[data-member-role]");
          var vehSel =
            event.target.closest && event.target.closest("[data-cell-vehicle]");
          var hdgSel =
            event.target.closest && event.target.closest("[data-member-heading]");
          var sectorSel =
            event.target.closest && event.target.closest("[data-member-sector]");
          var scansSel =
            event.target.closest && event.target.closest("[data-member-scans]");
          var startBtn =
            event.target.closest && event.target.closest("[data-place-start]");
          if (startBtn) {
            return;
          }
          var saved = persistDraftQuiet(true);
          if (!saved || !saved.ok) {
            return;
          }
          if (roleSel) {
            var role = model().store.setOperationMemberRole(
              saved.operationId,
              roleSel.getAttribute("data-member-cell"),
              roleSel.getAttribute("data-member-role"),
              roleSel.value
            );
            if (!role || !role.ok) {
              setStatus((role && role.error) || "Could not change that role.");
              return;
            }
          }
          if (vehSel) {
            var veh = model().store.setOperationTeamVehicle(
              saved.operationId,
              vehSel.getAttribute("data-cell-vehicle"),
              vehSel.value
            );
            if (!veh || !veh.ok) {
              setStatus((veh && veh.error) || "Could not set that vehicle.");
              return;
            }
          }
          if (hdgSel) {
            var hdg = model().store.setOperationMemberHeading(
              saved.operationId,
              hdgSel.getAttribute("data-member-cell"),
              hdgSel.getAttribute("data-member-heading"),
              hdgSel.value
            );
            if (!hdg || !hdg.ok) {
              setStatus((hdg && hdg.error) || "Could not set that heading.");
              return;
            }
          }
          if (sectorSel) {
            model().store.setOperationMemberField(
              saved.operationId,
              sectorSel.getAttribute("data-member-cell"),
              sectorSel.getAttribute("data-member-sector"),
              "sector",
              sectorSel.value
            );
          }
          if (scansSel) {
            model().store.setOperationMemberField(
              saved.operationId,
              scansSel.getAttribute("data-member-cell"),
              scansSel.getAttribute("data-member-scans"),
              "scans",
              scansSel.value
            );
          }
          draftRecord = model().store.getOperation(saved.operationId);
          paintCells(draftRecord);
          paintOperationMap(draftRecord);
        });
        cellsHost.addEventListener("click", function (event) {
          var startBtn =
            event.target.closest && event.target.closest("[data-place-start]");
          if (!startBtn) {
            return;
          }
          event.preventDefault();
          setPlaceMode(
            "officer",
            startBtn.getAttribute("data-place-cell"),
            startBtn.getAttribute("data-place-start")
          );
        }, true);
      }
      document.querySelectorAll("[data-place-mode]").forEach(function (btn) {
        if (btn.dataset.bound === "true") {
          return;
        }
        btn.dataset.bound = "true";
        btn.addEventListener("click", function (event) {
          event.preventDefault();
          var kind = btn.getAttribute("data-place-mode") || "";
          setPlaceMode(kind === placeMode.kind ? "" : kind);
        });
      });
      var commitStart = byId("operationCommitStart");
      if (commitStart && commitStart.dataset.bound !== "true") {
        commitStart.dataset.bound = "true";
        commitStart.addEventListener("click", function (event) {
          event.preventDefault();
          commitPendingStart();
        });
      }
      return;
    }
    if (page === "operation") {
      paintView();
    }
    if (page === "operation-brief") {
      paintBrief();
    }
  }

  window.COPDoc = window.COPDoc || {};
  COPDoc.operationDocuments = { renderHtml: renderBriefHtml, capture: captureBrief };
  window.commitOperation = commitOperation;
  window.generateOperationBrief = generateBrief;
  window.printOperationBrief = printBrief;
  window.saveOperationBrief = saveOperationBrief;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bind);
  } else {
    bind();
  }
})();
