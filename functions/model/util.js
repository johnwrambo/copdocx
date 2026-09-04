/**
 * Shared model helpers. Load before lead.js / admin pages.
 * assign, nowIso, newId — extracted so admin does not need createLead.
 */
(function (global) {
  "use strict";

  var root = (global.COPDoc = global.COPDoc || {});
  var model = (root.model = root.model || {});

  function nowIso() {
    return new Date().toISOString();
  }

  function newId(prefix) {
    return (
      String(prefix || "id") +
      "_" +
      Date.now().toString(36) +
      "_" +
      Math.random().toString(36).slice(2, 8)
    );
  }

  /**
   * Copy extra onto base. Nested plain objects merge; arrays replace.
   */
  function assign(base, extra) {
    extra = extra || {};
    Object.keys(extra).forEach(function (key) {
      var value = extra[key];
      var current = base[key];
      if (
        value &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        current &&
        typeof current === "object" &&
        !Array.isArray(current)
      ) {
        assign(current, value);
      } else if (value !== undefined) {
        base[key] = value;
      }
    });
    return base;
  }

  function metaStatus(row) {
    return (row && row.meta && row.meta.status) || "committed";
  }

  function isDraft(row) {
    return metaStatus(row) === "draft";
  }

  function isCommitted(row) {
    return metaStatus(row) === "committed";
  }

  function lifecycleLabel(row) {
    return isCommitted(row) ? "Filed" : "Working";
  }

  function stampMeta(previous, mode) {
    var now = nowIso();
    var prev = (previous && previous.meta) || {};
    var complete = mode === "complete";
    var commit = mode === "commit" || complete;
    return {
      createdAt: prev.createdAt || now,
      updatedAt: now,
      markedComplete: complete ? true : prev.markedComplete === true,
      completedAt: complete ? now : prev.completedAt || "",
      status: commit ? "committed" : "draft",
      committedAt: commit ? now : prev.committedAt || ""
    };
  }

  function ensureRecordMeta(row) {
    if (!row) {
      return row;
    }
    row.meta = row.meta || {};
    if (!row.meta.status) {
      row.meta.status = "committed";
      row.meta.committedAt =
        row.meta.updatedAt || row.meta.createdAt || nowIso();
    }
    if (!row.meta.createdAt) {
      row.meta.createdAt = row.meta.committedAt || nowIso();
    }
    if (!row.meta.updatedAt) {
      row.meta.updatedAt = row.meta.committedAt || row.meta.createdAt;
    }
    return row;
  }

  function csvCell(value) {
    var text = String(value == null ? "" : value);
    if (/^[=+\-@\t]/.test(text)) {
      text = "'" + text;
    }
    if (/[",\n\r]/.test(text)) {
      return '"' + text.replace(/"/g, '""') + '"';
    }
    return text;
  }

  function recordsForEncounter(rows, encounterId) {
    if (!encounterId) {
      return [];
    }
    var id = String(encounterId);
    return (rows || []).filter(function (row) {
      return row && String(row.encounterId || "") === id;
    });
  }

  function isActiveMarkupFile(name, mime) {
    var fileName = String(name || "").toLowerCase();
    var type = String(mime || "").toLowerCase();
    if (/\.(html?|xhtml|svg)$/.test(fileName)) {
      return true;
    }
    if (type.indexOf("text/html") === 0) {
      return true;
    }
    if (type.indexOf("image/svg") === 0) {
      return true;
    }
    if (type.indexOf("application/xhtml") === 0) {
      return true;
    }
    return false;
  }

  model.nowIso = nowIso;
  model.newId = newId;
  model.assign = assign;
  model.metaStatus = metaStatus;
  model.isDraft = isDraft;
  model.isCommitted = isCommitted;
  model.lifecycleLabel = lifecycleLabel;
  model.stampMeta = stampMeta;
  model.ensureRecordMeta = ensureRecordMeta;
  model.csvCell = csvCell;
  model.recordsForEncounter = recordsForEncounter;
  model.isActiveMarkupFile = isActiveMarkupFile;
})(typeof window !== "undefined" ? window : globalThis);
