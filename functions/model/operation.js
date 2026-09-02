/**
 * Operation — planning form + issued order. Not an Encounter, not a Case.
 */
(function (global) {
  "use strict";

  var root = (global.COPDoc = global.COPDoc || {});
  var model = (root.model = root.model || {});

  model.OPERATION_SCHEMA = "copdocx.operation.v1";
  model.OPERATION_ASSIGNMENT_ROLES = [
    "eye",
    "contact",
    "primary-backup",
    "backup"
  ];
  model.OPERATION_ASSIGNMENT_LABELS = {
    eye: "Eye",
    contact: "Contact",
    "primary-backup": "Primary backup",
    backup: "Backup"
  };
  model.OPERATION_LOCATION_KINDS = [
    "rally",
    "cleanup",
    "medevac",
    "hospital",
    "landmark"
  ];

  function padDay(value) {
    return String(value).length < 2 ? "0" + value : String(value);
  }

  function nextOperationId(opts) {
    opts = opts || {};
    var teamNum = parseInt(opts.team, 10);
    if (!isFinite(teamNum) || teamNum < 1) {
      teamNum = 3;
    }
    var when = opts.date;
    if (!when || typeof when.getFullYear !== "function") {
      when = new Date();
    }
    var stamp =
      String(when.getFullYear()) +
      padDay(when.getMonth() + 1) +
      padDay(when.getDate());
    var prefix = "DAL" + String(teamNum) + "-OP-" + stamp + "-";
    var max = 0;
    (opts.existingIds || []).forEach(function (id) {
      var text = String(id || "");
      if (text.indexOf(prefix) !== 0) {
        return;
      }
      var seq = parseInt(text.slice(prefix.length), 10);
      if (isFinite(seq) && seq > max) {
        max = seq;
      }
    });
    var next = String(max + 1);
    while (next.length < 3) {
      next = "0" + next;
    }
    return prefix + next;
  }

  function isOperationAssignmentRole(role) {
    return model.OPERATION_ASSIGNMENT_ROLES.indexOf(String(role || "")) !== -1;
  }

  function vehicleYmm(vehicle) {
    if (!vehicle) {
      return "";
    }
    return [vehicle.vehicleYear, vehicle.vehicleMake, vehicle.vehicleModel]
      .filter(Boolean)
      .join(" ");
  }

  function formatPlaceAddress(loc) {
    if (!loc) {
      return "";
    }
    var cityState = [loc.city, loc.state].filter(Boolean).join(", ");
    return [loc.street, loc.street2, cityState, loc.zip].filter(Boolean).join(", ");
  }

  function operationPlacesFromLead(lead) {
    var out = [];
    if (!lead) {
      return out;
    }
    var person = model.subjectOf ? model.subjectOf(lead) : lead.person;
    function skipHistorical(row) {
      return model.isHistoricalOccupancy && model.isHistoricalOccupancy(row);
    }
    function push(loc, vehicle) {
      if (!loc || skipHistorical(loc) || (vehicle && skipHistorical(vehicle))) {
        return;
      }
      var addr = formatPlaceAddress(loc);
      var lat = loc.latitude || "";
      var lng = loc.longitude || "";
      if (!addr && !lat && !lng) {
        return;
      }
      out.push({
        locationId: loc.locationId || "",
        association: loc.association || "",
        street: loc.street || "",
        city: loc.city || "",
        state: loc.state || "",
        zip: loc.zip || "",
        latitude: lat,
        longitude: lng,
        vehicleId: vehicle ? vehicle.vehicleId || vehicle.id || "" : "",
        plate: vehicle ? vehicle.licensePlate || vehicle.plate || "" : "",
        plateState: vehicle ? vehicle.plateState || "" : "",
        ymm: vehicleYmm(vehicle)
      });
    }
    ((person && person.locations) || []).forEach(function (loc) {
      push(loc, null);
    });
    (lead.vehicles || []).forEach(function (vehicle) {
      var spots = vehicle && vehicle.locations;
      if (spots && spots.length) {
        spots.forEach(function (loc) {
          push(loc, vehicle);
        });
        return;
      }
      if (vehicle && (vehicle.licensePlate || vehicle.plate)) {
        out.push({
          locationId: "",
          association: "",
          street: "",
          city: "",
          state: "",
          zip: "",
          latitude: "",
          longitude: "",
          vehicleId: vehicle.vehicleId || vehicle.id || "",
          plate: vehicle.licensePlate || vehicle.plate || "",
          plateState: vehicle.plateState || "",
          ymm: vehicleYmm(vehicle)
        });
      }
    });
    return out;
  }

  function leadIsImportableOperationTarget(lead) {
    if (!lead) {
      return false;
    }
    if (model.isCommitted && !model.isCommitted(lead)) {
      return false;
    }
    return operationPlacesFromLead(lead).length > 0;
  }

  function freezeOperationTarget(lead) {
    var person = lead && (model.subjectOf ? model.subjectOf(lead) : lead.person);
    var places = operationPlacesFromLead(lead);
    var vehicles = [];
    var seen = {};
    places.forEach(function (row) {
      if (!row || !row.vehicleId || seen[row.vehicleId]) {
        return;
      }
      seen[row.vehicleId] = true;
      vehicles.push({
        vehicleId: row.vehicleId,
        plate: row.plate,
        plateState: row.plateState,
        ymm: row.ymm,
        atLocationId: row.locationId || ""
      });
    });
    return {
      subjectLabel:
        (person && model.formatPersonLabel && model.formatPersonLabel(person)) ||
        "",
      photoMediaId: "",
      places: places,
      vehicles: vehicles
    };
  }

  function createOperationMember(extra) {
    extra = extra || {};
    var role = String(extra.assignmentRole || extra.role || "");
    if (!isOperationAssignmentRole(role)) {
      role = "";
    }
    return {
      officerId: extra.officerId || extra.id || "",
      assignmentRole: role,
      start: extra.start && typeof extra.start === "object" ? extra.start : null,
      heading: extra.heading === 0 || extra.heading ? extra.heading : "",
      sector: extra.sector || "",
      scans: extra.scans || "",
      notes: extra.notes || ""
    };
  }

  function createOperationTeam(extra) {
    extra = extra || {};
    var members = Array.isArray(extra.members)
      ? extra.members.map(createOperationMember)
      : [];
    return {
      teamId: extra.teamId || (model.newId ? model.newId("cell") : "cell"),
      name: extra.name || "",
      rosterKey: extra.rosterKey || extra.teamKey || "",
      vehicleId: extra.vehicleId || "",
      members: members
    };
  }

  function defaultAssignmentRoles(count) {
    var roles = model.OPERATION_ASSIGNMENT_ROLES;
    var n = Math.max(0, Number(count) || 0);
    return roles.slice(0, Math.min(n, roles.length));
  }

  function parseTimeWindow(start, end) {
    var a = Date.parse(start || "");
    var b = Date.parse(end || "");
    if (!isFinite(a) && !isFinite(b)) {
      return null;
    }
    if (!isFinite(a)) {
      a = b;
    }
    if (!isFinite(b)) {
      b = a + 8 * 60 * 60 * 1000;
    }
    if (b < a) {
      b = a + 8 * 60 * 60 * 1000;
    }
    return { start: a, end: b };
  }

  function shiftWindow(shift) {
    if (!shift || !shift.date) {
      return null;
    }
    var start = Date.parse(shift.date + "T" + (shift.start || "00:00"));
    var end = Date.parse(shift.date + "T" + (shift.end || "23:59"));
    if (!isFinite(start) || !isFinite(end)) {
      return null;
    }
    if (end <= start) {
      end += 24 * 60 * 60 * 1000;
    }
    return { start: start, end: end };
  }

  function windowsOverlap(a, b) {
    return !!(a && b && a.start < b.end && b.start < a.end);
  }

  function isoWeekKey(ms) {
    var d = new Date(ms);
    if (!isFinite(d.getTime())) {
      return "";
    }
    var day = d.getDay() || 7;
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 4 - day);
    var yearStart = new Date(d.getFullYear(), 0, 1);
    var week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
    return d.getFullYear() + "-W" + (week < 10 ? "0" : "") + week;
  }

  function officerOnOperation(op, officerId) {
    if (!op || !officerId) {
      return false;
    }
    return (op.teams || []).some(function (team) {
      return (team.members || []).some(function (member) {
        return member && member.officerId === officerId;
      });
    });
  }

  function overlappingCommittedOperation(officerId, win, operations, exceptId) {
    var hit = null;
    (operations || []).forEach(function (op) {
      if (!op || op.operationId === exceptId) {
        return;
      }
      if (model.isCommitted && !model.isCommitted(op)) {
        return;
      }
      if (!officerOnOperation(op, officerId)) {
        return;
      }
      var other = parseTimeWindow(op.plannedStart, op.plannedEnd);
      if (win && other && !windowsOverlap(win, other)) {
        return;
      }
      if (!hit) {
        hit = op;
      }
    });
    return hit;
  }

  function officerAvailability(officer, opts) {
    opts = opts || {};
    var duty = String((officer && officer.duty) || "").toLowerCase();
    if (duty && duty !== "available" && duty !== "in-field") {
      return {
        available: false,
        reason: duty === "off" || duty === "leave" ? "leave" : duty
      };
    }
    var officerId = officer && (officer.officerId || officer.id);
    var win = parseTimeWindow(opts.plannedStart, opts.plannedEnd);
    if (win) {
      var mine = (opts.shifts || []).filter(function (shift) {
        return shift && shift.officerId === officerId;
      });
      var week = isoWeekKey(win.start);
      var weekShifts = mine.filter(function (shift) {
        var sw = shiftWindow(shift);
        return sw && isoWeekKey(sw.start) === week;
      });
      if (weekShifts.length) {
        var onShift = weekShifts.some(function (shift) {
          return windowsOverlap(win, shiftWindow(shift));
        });
        if (!onShift) {
          return { available: false, reason: "shift" };
        }
      }
      var busy = overlappingCommittedOperation(
        officerId,
        win,
        opts.operations || [],
        opts.exceptOperationId || ""
      );
      if (busy) {
        return {
          available: false,
          reason: "OP " + (busy.operationNumber || busy.operationId)
        };
      }
    }
    return { available: true, reason: "" };
  }

  function createOperationTarget(extra) {
    extra = extra || {};
    return model.assign(
      {
        targetId: extra.targetId || (model.newId ? model.newId("tgt") : "tgt"),
        leadId: extra.leadId || "",
        personId: extra.personId || "",
        priority: extra.priority || "",
        freeze: extra.freeze || null
      },
      extra
    );
  }

  function createOperation(extra) {
    extra = extra || {};
    var now = model.nowIso ? model.nowIso() : new Date().toISOString();
    var team = extra.team || 3;
    var id =
      extra.operationId ||
      extra.operationNumber ||
      nextOperationId({
        team: team,
        date: extra.date,
        existingIds: extra.existingIds || []
      });
    var built = model.assign(
      {
        operationId: id,
        operationNumber: extra.operationNumber || id,
        entityType: "OPERATION",
        schema: model.OPERATION_SCHEMA,
        name: extra.name || "",
        team: team,
        plannedStart: extra.plannedStart || "",
        plannedEnd: extra.plannedEnd || "",
        importedTeamKeys: Array.isArray(extra.importedTeamKeys)
          ? extra.importedTeamKeys.slice()
          : [],
        targets: Array.isArray(extra.targets) ? extra.targets.slice() : [],
        teams: Array.isArray(extra.teams) ? extra.teams.slice() : [],
        targetAssignments: Array.isArray(extra.targetAssignments)
          ? extra.targetAssignments.slice()
          : [],
        opLocations: Array.isArray(extra.opLocations)
          ? extra.opLocations.slice()
          : [],
        medevacRoute: Array.isArray(extra.medevacRoute)
          ? extra.medevacRoute.slice()
          : [],
        markup: extra.markup && typeof extra.markup === "object"
          ? extra.markup
          : { labels: [], arrows: [] },
        mapLayers: extra.mapLayers && typeof extra.mapLayers === "object"
          ? extra.mapLayers
          : { visible: {} },
        order: extra.order || null,
        history: Array.isArray(extra.history) ? extra.history.slice() : [],
        meta: extra.meta || {
          status: "draft",
          createdAt: now,
          updatedAt: now,
          committedAt: "",
          markedComplete: false
        }
      },
      extra
    );
    built.operationId = id;
    built.operationNumber = built.operationNumber || id;
    built.entityType = "OPERATION";
    built.schema = model.OPERATION_SCHEMA;
    delete built.existingIds;
    delete built.date;
    if (typeof model.ensureRecordMeta === "function") {
      model.ensureRecordMeta(built);
    }
    return built;
  }

  model.nextOperationId = nextOperationId;
  model.createOperation = createOperation;
  model.createOperationTarget = createOperationTarget;
  model.createOperationTeam = createOperationTeam;
  model.createOperationMember = createOperationMember;
  model.defaultAssignmentRoles = defaultAssignmentRoles;
  model.isOperationAssignmentRole = isOperationAssignmentRole;
  model.officerAvailability = officerAvailability;
  model.operationPlacesFromLead = operationPlacesFromLead;
  model.leadIsImportableOperationTarget = leadIsImportableOperationTarget;
  model.freezeOperationTarget = freezeOperationTarget;
})(typeof window !== "undefined" ? window : globalThis);
