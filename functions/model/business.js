/**
 * Business — a company or shop in an investigation (not a Person).
 * Identity card: name, phone. Same object on every wall that uses this id.
 */
(function (global) {
  "use strict";

  var root = (global.COPDoc = global.COPDoc || {});
  var model = (root.model = root.model || {});

  function createBusiness(extra) {
    extra = extra || {};
    var now = model.nowIso ? model.nowIso() : new Date().toISOString();
    var built = model.assign(
      {
        businessId: extra.businessId || (model.newId ? model.newId("biz") : "biz"),
        entityType: "BUSINESS",
        name: "",
        phone: "",
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
    built.entityType = "BUSINESS";
    if (!built.businessId) {
      built.businessId = built.id || model.newId("biz");
    }
    built.id = built.businessId;
    built.name = String(built.name || "").trim();
    built.meta = model.assign(
      {
        createdAt: now,
        updatedAt: now,
        markedComplete: false,
        status: "draft",
        committedAt: ""
      },
      built.meta && typeof built.meta === "object" && !Array.isArray(built.meta)
        ? built.meta
        : {}
    );
    return built;
  }

  function formatBusinessLabel(row) {
    return row && String(row.name || "").trim();
  }

  model.createBusiness = createBusiness;
  model.formatBusinessLabel = formatBusinessLabel;
})(typeof window !== "undefined" ? window : globalThis);
