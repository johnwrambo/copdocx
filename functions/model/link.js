/**
 * Link — an explicit connection between two objects.
 *
 * Fed by: a link card. You SEARCH a saved subject, then check WHY they
 *         are linked. One or more reasons. Optional notes.
 * Never inferred. Similar names do not create a link (a future flag may HINT).
 * Never rewrites registeredOwnerName or a person's name.
 *
 * This pass: vehicle → person (subject operates / is tied to this car).
 * Same object will hold PERSON → PERSON later.
 */

(function (global) {
  "use strict";

  var root = (global.COPDoc = global.COPDoc || {});
  var model = (root.model = root.model || {});

  function createLink(extra) {
    return model.assign(
      {
        linkId: model.newId("link"),
        from: { type: "", id: "" },
        to: { type: "", id: "" },
        reasons: [],
        notes: ""
      },
      extra
    );
  }

  model.createLink = createLink;
  model.createAssociation = function createAssociation(extra) {
    extra = extra || {};
    return createLink({
      linkId: extra.associationId || extra.linkId,
      from: {
        type: extra.fromEntityType || (extra.from && extra.from.type) || "",
        id: extra.fromEntityId || (extra.from && extra.from.id) || ""
      },
      to: {
        type: extra.toEntityType || (extra.to && extra.to.type) || "",
        id: extra.toEntityId || (extra.to && extra.to.id) || ""
      },
      reasons: extra.reasons || (extra.associationTypeCode ? [extra.associationTypeCode] : []),
      notes: extra.notes || extra.reasonCode || ""
    });
  };
})(typeof window !== "undefined" ? window : globalThis);
