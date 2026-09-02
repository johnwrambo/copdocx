/**
 * Custom entity — crew, stash, clique, anything that is not a person,
 * vehicle, location, or business. Identity card: name + kind.
 */
(function (global) {
  "use strict";

  var root = (global.COPDoc = global.COPDoc || {});
  var model = (root.model = root.model || {});

  function createCustomEntity(extra) {
    extra = extra || {};
    var now = model.nowIso ? model.nowIso() : new Date().toISOString();
    var built = model.assign(
      {
        entityId: extra.entityId || (model.newId ? model.newId("ent") : "ent"),
        entityType: "ENTITY",
        name: "",
        kind: "",
        notes: "",
        junked: false,
        junkedAt: "",
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
    built.entityType = "ENTITY";
    if (!built.entityId) {
      built.entityId = built.id || model.newId("ent");
    }
    if (!built.id) {
      built.id = built.entityId;
    }
    built.name = String(built.name || "").trim();
    built.kind = String(built.kind || "").trim();
    return built;
  }

  function formatEntityLabel(row) {
    if (!row) {
      return "";
    }
    var name = String(row.name || "").trim();
    var kind = String(row.kind || "").trim();
    if (name && kind) {
      return name + " (" + kind + ")";
    }
    return name || kind;
  }

  model.createCustomEntity = createCustomEntity;
  model.formatEntityLabel = formatEntityLabel;
})(typeof window !== "undefined" ? window : globalThis);
