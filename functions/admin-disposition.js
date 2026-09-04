/** Safe archive/delete rules for the separate admin roster store. */
(function (global) {
  "use strict";

  var root = (global.COPDoc = global.COPDoc || {});

  function rowId(row, kind) {
    if (!row) {
      return "";
    }
    return kind === "officers"
      ? row.officerId || row.id || ""
      : row.vehicleId || row.id || "";
  }

  function isJunked(row) {
    return Boolean(row && row.junked);
  }

  function isActive(row) {
    return Boolean(row && !row.junked);
  }

  function archive(row, now) {
    row.junked = true;
    row.junkedAt = now || new Date().toISOString();
    return row;
  }

  function restore(row) {
    row.junked = false;
    row.junkedAt = "";
    return row;
  }

  function hasMappedLocation(row) {
    var locations = (row && row.locations) || [];
    if (row && row.address) {
      locations = locations.concat([row.address]);
    }
    return locations.some(function (loc) {
      if (!loc) {
        return false;
      }
      var lat = Number(loc.latitude);
      var lng = Number(loc.longitude);
      return isFinite(lat) && isFinite(lng) && !(lat === 0 && lng === 0);
    });
  }

  function values(object) {
    return Object.keys(object || {}).map(function (key) {
      return object[key];
    });
  }

  function references(kind, id, admin, workspace) {
    admin = admin || {};
    workspace = workspace || {};
    var found = [];
    var record = (admin[kind] || []).filter(function (row) {
      return rowId(row, kind) === id;
    })[0];

    (admin.shifts || []).forEach(function (shift) {
      if (
        (kind === "officers" && shift.officerId === id) ||
        (kind === "vehicles" && shift.vehicleId === id)
      ) {
        found.push({
          type: "shift",
          label:
            "Shift " +
            [shift.date, [shift.start, shift.end].filter(Boolean).join("–")]
              .filter(Boolean)
              .join(" ")
        });
      }
    });

    if (kind === "officers") {
      (admin.vehicles || []).forEach(function (vehicle) {
        if ((vehicle.assignedOfficerIds || []).indexOf(id) !== -1) {
          found.push({
            type: "fleet-assignment",
            label: "Fleet assignment " + (vehicle.unit || vehicle.licensePlate || vehicle.id || "vehicle")
          });
        }
      });
      values(workspace.leads).forEach(function (lead) {
        if (lead && lead.assignedOfficerId === id) {
          found.push({ type: "case", label: "Case " + (lead.leadId || lead.id || "record") });
        }
      });
      values(workspace.investigations).forEach(function (investigation) {
        if (investigation && investigation.assignedOfficerId === id) {
          found.push({
            type: "investigation",
            label: "Investigation " + (investigation.investigationId || investigation.id || "record")
          });
        }
      });
    }

    values(workspace.operations).forEach(function (operation) {
      (operation && operation.teams ? operation.teams : []).forEach(function (team) {
        if (kind === "vehicles" && team && team.vehicleId === id) {
          found.push({
            type: "operation",
            label: "Operation " + (operation.operationId || operation.id || "record") + " vehicle"
          });
        }
        if (kind === "officers") {
          (team && team.members ? team.members : []).forEach(function (member) {
            if (member && member.officerId === id) {
              found.push({
                type: "operation",
                label: "Operation " + (operation.operationId || operation.id || "record") + " team"
              });
            }
          });
        }
      });
    });

    if (kind === "vehicles") {
      ["leads", "encounters"].forEach(function (bucket) {
        values(workspace[bucket]).forEach(function (recordRow) {
          (recordRow && recordRow.vehicles ? recordRow.vehicles : []).forEach(function (vehicle) {
            if (rowId(vehicle, "vehicles") === id) {
              found.push({
                type: bucket === "leads" ? "case" : "encounter",
                label:
                  (bucket === "leads" ? "Case " : "Encounter ") +
                  (recordRow.leadId || recordRow.encounterId || recordRow.id || "record")
              });
            }
          });
        });
      });
    }

    if (hasMappedLocation(record)) {
      found.push({ type: "map", label: "Mapped location on this record" });
    }

    var seen = Object.create(null);
    return found.filter(function (item) {
      var key = item.type + "|" + item.label;
      if (seen[key]) {
        return false;
      }
      seen[key] = true;
      return true;
    });
  }

  root.adminDisposition = Object.freeze({
    rowId: rowId,
    isJunked: isJunked,
    isActive: isActive,
    archive: archive,
    restore: restore,
    references: references
  });
})(typeof window !== "undefined" ? window : globalThis);
