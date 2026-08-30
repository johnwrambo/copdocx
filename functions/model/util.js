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

  function stampMeta(previous, mode) {
    var now = nowIso();
    var prev = (previous && previous.meta) || {};
    var commit = mode === "commit";
    return {
      createdAt: prev.createdAt || now,
      updatedAt: now,
      markedComplete: false,
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

  model.nowIso = nowIso;
  model.newId = newId;
  model.assign = assign;
  model.metaStatus = metaStatus;
  model.isDraft = isDraft;
  model.isCommitted = isCommitted;
  model.stampMeta = stampMeta;
  model.ensureRecordMeta = ensureRecordMeta;
})(typeof window !== "undefined" ? window : globalThis);
