/**
 * Link — an explicit connection between two objects.
 *
 * Fed by: a link card. You SEARCH a saved subject, then check WHY they
 *         are linked. One or more reasons. Optional notes.
 * Never inferred. Similar names do not create a link (a future flag may HINT).
 * Never rewrites registeredOwnerName or a person's name.
 *
 * Person associations may start as a typed string (label + otherType)
 * with an empty to.id, then later resolve to an object.
 * Vehicle → person links still require to.id.
 */

(function (global) {
  "use strict";

  var root = (global.COPDoc = global.COPDoc || {});
  var model = (root.model = root.model || {});

  model.ASSOCIATION_OTHER_TYPES = [
    { value: "PERSON", label: "Person" },
    { value: "VEHICLE", label: "Vehicle" },
    { value: "BUSINESS", label: "Business" },
    { value: "OTHER", label: "Other" }
  ];

  function createLink(extra) {
    extra = extra || {};
    var otherType = extra.otherType || (extra.to && extra.to.type) || "";
    return model.assign(
      {
        linkId: model.newId("link"),
        from: { type: "", id: "" },
        to: { type: "", id: "" },
        reasons: [],
        notes: "",
        label: "",
        otherType: otherType
      },
      extra
    );
  }

  model.createLink = createLink;
  model.createAssociation = function createAssociation(extra) {
    extra = extra || {};
    var otherType =
      extra.otherType ||
      extra.toEntityType ||
      (extra.to && extra.to.type) ||
      "PERSON";
    return createLink({
      linkId: extra.associationId || extra.linkId,
      label: extra.label || extra.name || "",
      otherType: otherType,
      from: {
        type: extra.fromEntityType || (extra.from && extra.from.type) || "",
        id: extra.fromEntityId || (extra.from && extra.from.id) || ""
      },
      to: {
        type: extra.toEntityType || (extra.to && extra.to.type) || otherType,
        id: extra.toEntityId || (extra.to && extra.to.id) || ""
      },
      reasons: extra.reasons || (extra.associationTypeCode ? [extra.associationTypeCode] : []),
      notes: extra.notes || extra.reasonCode || ""
    });
  };
})(typeof window !== "undefined" ? window : globalThis);
