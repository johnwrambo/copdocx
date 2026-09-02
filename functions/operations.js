/**
 * Operation list, planning form, and issued-order view.
 */
(function () {
  "use strict";

  var recordFilter = "all";
  var draftRecord = null;

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
          placeKey:
            (target.targetId || target.leadId || "t") + ":" + index
        });
      });
    });
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
      empty.hidden = legend.length > 0;
    }
    if (window.COPDoc && COPDoc.locationMap && COPDoc.locationMap.displayMany) {
      COPDoc.locationMap.displayMany(host, points);
    } else if (!points.length) {
      host.hidden = true;
    }
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
        var name = document.createElement("span");
        name.textContent = officerLabel(member.officerId);
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
          if (!avail.available) {
            tr.className = "is-unavailable";
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
          "[data-assign-target], [data-member-role], [data-cell-vehicle]"
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
          draftRecord = model().store.getOperation(saved.operationId);
          paintCells(draftRecord);
        });
      }
      return;
    }
    if (page === "operation") {
      paintView();
    }
  }

  window.commitOperation = commitOperation;
  window.generateOperationBrief = generateBrief;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bind);
  } else {
    bind();
  }
})();
