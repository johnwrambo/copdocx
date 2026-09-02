/**
 * Investigation — a web of objects (plate-check and other sources).
 * Not a Case (leads{}), not an Encounter.
 */
(function (global) {
  "use strict";

  var root = (global.COPDoc = global.COPDoc || {});
  var model = (root.model = root.model || {});

  model.INVESTIGATION_SCHEMA = "copdocx.investigation.v1";
  model.INVESTIGATION_KINDS = ["tag", "otherLe", "elite", "other", "discovered"];
  model.INVESTIGATION_KIND_LABELS = {
    tag: "Plate Check",
    otherLe: "Other Law Enforcement Agency",
    elite: "Elite",
    other: "Other",
    discovered: "Discovered in case"
  };
  model.INVESTIGATION_MODES = ["", "bulk", "solitary"];

  function padDay(value) {
    return String(value).length < 2 ? "0" + value : String(value);
  }

  function kindLabel(kind) {
    var key = String(kind || "");
    return model.INVESTIGATION_KIND_LABELS[key] || key || "—";
  }

  function isInvestigationKind(kind) {
    return model.INVESTIGATION_KINDS.indexOf(String(kind || "")) !== -1;
  }

  function nextInvestigationId(opts) {
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
    var prefix = "INV" + String(teamNum) + "-" + stamp + "-";
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

  function createInvestigationPlate(extra) {
    extra = extra || {};
    var built = model.assign(
      {
        plateId: model.newId ? model.newId("plt") : "plt",
        plate: "",
        state: "",
        status: "new",
        notes: "",
        vehicleId: ""
      },
      extra
    );
    built.plate = String(built.plate || "")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");
    built.state = String(built.state || "").toUpperCase();
    if (
      built.status !== "hit" &&
      built.status !== "discarded" &&
      built.status !== "promoted" &&
      built.status !== "checked"
    ) {
      built.status = "new";
    }
    return built;
  }

  function createInvestigationNode(extra) {
    extra = extra || {};
    return model.assign(
      {
        nodeId: extra.nodeId || (model.newId ? model.newId("node") : "node"),
        objectType: extra.objectType || extra.type || "",
        objectId: extra.objectId || extra.id || "",
        x: typeof extra.x === "number" ? extra.x : 0,
        y: typeof extra.y === "number" ? extra.y : 0
      },
      extra
    );
  }

  function createInvestigation(extra) {
    extra = extra || {};
    var now = model.nowIso ? model.nowIso() : new Date().toISOString();
    var kind = String(extra.kind || "tag");
    var built = model.assign(
      {
        investigationId:
          extra.investigationId ||
          nextInvestigationId({
            team: extra.team || 3,
            date: extra.date,
            existingIds: extra.existingIds || []
          }),
        entityType: "INVESTIGATION",
        schema: model.INVESTIGATION_SCHEMA,
        kind: kind,
        mode: extra.mode || (kind === "tag" ? "bulk" : ""),
        title: "",
        team: extra.team != null && extra.team !== "" ? String(extra.team) : "3",
        parentInvestigationId: "",
        sourceLeadId: "",
        assignedOfficerId: "",
        plates: [],
        nodes: [],
        links: [],
        focusNodeId: "",
        history: [],
        meta: {
          createdAt: now,
          updatedAt: now,
          markedComplete: false,
          status: "draft",
          committedAt: ""
        }
      },
      extra
    );
    delete built.existingIds;
    delete built.date;
    if (!Array.isArray(built.plates)) {
      built.plates = [];
    }
    if (!Array.isArray(built.nodes)) {
      built.nodes = [];
    }
    if (!Array.isArray(built.links)) {
      built.links = [];
    }
    if (!Array.isArray(built.history)) {
      built.history = [];
    }
    if (!isInvestigationKind(built.kind)) {
      built.kind = "tag";
    }
    if (built.kind !== "tag") {
      built.mode = built.mode || "";
    } else if (built.mode !== "solitary") {
      built.mode = "bulk";
    }
    return built;
  }

  function investigationAddTypes(fromType, kind) {
    var from = String(fromType || "").toUpperCase();
    var isTag = String(kind || "") === "tag";
    if (from === "VEHICLE") {
      return ["PERSON", "LOCATION", "BUSINESS", "ENTITY"];
    }
    if (from === "LOCATION") {
      return isTag
        ? ["VEHICLE", "PERSON", "BUSINESS", "ENTITY"]
        : ["PERSON", "VEHICLE", "BUSINESS", "ENTITY"];
    }
    if (from === "PERSON") {
      return isTag
        ? ["VEHICLE", "PERSON", "LOCATION", "BUSINESS", "ENTITY"]
        : ["PERSON", "VEHICLE", "LOCATION", "BUSINESS", "ENTITY"];
    }
    if (from === "BUSINESS") {
      return ["PERSON", "LOCATION", "VEHICLE", "ENTITY"];
    }
    if (from === "ENTITY") {
      return ["PERSON", "LOCATION", "VEHICLE", "BUSINESS"];
    }
    return isTag
      ? ["VEHICLE", "PERSON", "LOCATION", "BUSINESS", "ENTITY"]
      : ["PERSON", "VEHICLE", "LOCATION", "BUSINESS", "ENTITY"];
  }

  function defaultInvestigationAddType(kind, fromType) {
    var allowed = investigationAddTypes(fromType, kind);
    if (String(kind || "") === "tag" && allowed.indexOf("VEHICLE") !== -1) {
      return "VEHICLE";
    }
    return allowed[0] || "PERSON";
  }

  function investigationPlex(record) {
    var nodeIds = {};
    var linkIds = {};
    var focusId = record && record.focusNodeId;
    if (!focusId) {
      return { active: false, nodeIds: nodeIds, linkIds: linkIds };
    }
    var focus = null;
    ((record.nodes || [])).forEach(function (row) {
      if (row && row.nodeId === focusId) {
        focus = row;
      }
    });
    if (!focus) {
      return { active: false, nodeIds: nodeIds, linkIds: linkIds };
    }
    nodeIds[focus.nodeId] = true;
    ((record.links || [])).forEach(function (link) {
      if (!link || !link.from || !link.to) {
        return;
      }
      var hitFrom =
        link.from.type === focus.objectType && link.from.id === focus.objectId;
      var hitTo = link.to.type === focus.objectType && link.to.id === focus.objectId;
      if (!hitFrom && !hitTo) {
        return;
      }
      if (link.linkId) {
        linkIds[link.linkId] = true;
      }
      var other = hitFrom ? link.to : link.from;
      ((record.nodes || [])).forEach(function (row) {
        if (row && row.objectType === other.type && row.objectId === other.id) {
          nodeIds[row.nodeId] = true;
        }
      });
    });
    return { active: true, nodeIds: nodeIds, linkIds: linkIds };
  }

  function objectKey(type, id) {
    return String(type || "") + "|" + String(id || "");
  }

  function investigationObjectKeys(record) {
    var keys = {};
    ((record && record.nodes) || []).forEach(function (row) {
      if (row && row.objectType && row.objectId) {
        keys[objectKey(row.objectType, row.objectId)] = true;
      }
    });
    return keys;
  }

  function investigationHulls(record, others) {
    var hulls = [];
    if (!record || !record.investigationId) {
      return hulls;
    }
    var here = record.investigationId;
    (others || []).forEach(function (other) {
      if (!other || other.investigationId === here) {
        return;
      }
      var isChild = other.parentInvestigationId === here;
      var isParent = record.parentInvestigationId === other.investigationId;
      if (!isChild && !isParent) {
        return;
      }
      var otherKeys = investigationObjectKeys(other);
      var nodeIds = [];
      (record.nodes || []).forEach(function (row) {
        if (
          row &&
          otherKeys[objectKey(row.objectType, row.objectId)]
        ) {
          nodeIds.push(row.nodeId);
        }
      });
      if (!nodeIds.length) {
        return;
      }
      hulls.push({
        investigationId: other.investigationId,
        title: other.title || other.investigationId,
        relation: isChild ? "child" : "parent",
        nodeIds: nodeIds
      });
    });
    return hulls;
  }

  function investigationOverlapCounts(record, others) {
    var counts = {};
    investigationHulls(record, others).forEach(function (hull) {
      (hull.nodeIds || []).forEach(function (id) {
        counts[id] = (counts[id] || 0) + 1;
      });
    });
    return counts;
  }

  function investigationObjectKindLabel(objectType) {
    var key = String(objectType || "").toUpperCase();
    if (key === "VEHICLE") {
      return "Vehicle";
    }
    if (key === "PERSON") {
      return "Person";
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
    return key || "Object";
  }

  function investigationOutlineMatch(query, node, bits) {
    var q = String(query || "").trim().toLowerCase();
    if (!q) {
      return true;
    }
    if (!node) {
      return false;
    }
    var hay = [
      node.objectType,
      bits && bits.kind,
      bits && bits.title,
      bits && bits.extra
    ]
      .join(" ")
      .replace(/\s+/g, " ")
      .toLowerCase();
    return q.split(/\s+/).every(function (part) {
      return part && hay.indexOf(part) !== -1;
    });
  }

  function investigationChipDim(opts) {
    opts = opts || {};
    if (opts.filterOn) {
      return !opts.matches;
    }
    return !!(opts.plexActive && !opts.inPlex);
  }

  function investigationWindowsDefault(kind) {
    return {
      plates: String(kind || "") === "tag",
      objects: false,
      card: false
    };
  }

  function investigationOutlineIsHit(node, record) {
    if (!node || String(node.objectType || "").toUpperCase() !== "VEHICLE") {
      return false;
    }
    var plates = (record && record.plates) || [];
    var i;
    for (i = 0; i < plates.length; i++) {
      if (!plates[i] || plates[i].vehicleId !== node.objectId) {
        continue;
      }
      var status = String(plates[i].status || "");
      if (status === "hit" || status === "promoted") {
        return true;
      }
    }
    return false;
  }

  model.nextInvestigationId = nextInvestigationId;
  model.createInvestigationPlate = createInvestigationPlate;
  model.createInvestigationNode = createInvestigationNode;
  model.createInvestigation = createInvestigation;
  model.investigationKindLabel = kindLabel;
  model.isInvestigationKind = isInvestigationKind;
  model.investigationAddTypes = investigationAddTypes;
  model.defaultInvestigationAddType = defaultInvestigationAddType;
  model.investigationPlex = investigationPlex;
  model.investigationHulls = investigationHulls;
  model.investigationOverlapCounts = investigationOverlapCounts;
  model.investigationObjectKeys = investigationObjectKeys;
  model.investigationObjectKindLabel = investigationObjectKindLabel;
  model.investigationOutlineMatch = investigationOutlineMatch;
  model.investigationOutlineIsHit = investigationOutlineIsHit;
  model.investigationChipDim = investigationChipDim;
  model.investigationWindowsDefault = investigationWindowsDefault;
})(typeof window !== "undefined" ? window : globalThis);
