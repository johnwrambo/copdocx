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
 *
 * World facts live in store.associations{} via createAssociation.
 * Investigation wall edges are createLink and cite associationId.
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

  var FALLBACK_SPEC = {
    REGISTERED_OWNER_OF: { from: "PERSON", to: "VEHICLE" },
    KNOWN_OPERATOR_OF: { from: "PERSON", to: "VEHICLE" },
    CURRENT_RESIDENCE: { from: "PERSON", to: "LOCATION" },
    KNOWN_RESIDENCE: { from: "PERSON", to: "LOCATION" },
    LAST_KNOWN_ADDRESS: { from: "PERSON", to: "LOCATION" },
    EMPLOYMENT_ADDRESS: { from: "PERSON", to: "LOCATION" },
    BUSINESS_ADDRESS: { from: "PERSON", to: "LOCATION" },
    FREQUENTED_LOCATION: { from: "PERSON", to: "LOCATION" },
    ENCOUNTER_LOCATION: { from: "PERSON", to: "LOCATION" },
    ARREST_LOCATION: { from: "PERSON", to: "LOCATION" },
    STAGING_LOCATION: { from: "PERSON", to: "LOCATION" },
    PROCESSING_LOCATION: { from: "PERSON", to: "LOCATION" },
    REGISTERED_ADDRESS: { from: "VEHICLE", to: "LOCATION" },
    VEHICLE_PARKING: { from: "VEHICLE", to: "LOCATION" },
    STORED_AT: { from: "VEHICLE", to: "LOCATION" },
    ASSOCIATE_OF: { from: "PERSON", to: "PERSON", symmetric: true },
    COHABITANT_OF: { from: "PERSON", to: "PERSON", symmetric: true },
    SPOUSE_OF: { from: "PERSON", to: "PERSON", symmetric: true },
    PARENT_OF: { from: "PERSON", to: "PERSON" },
    SIBLING_OF: { from: "PERSON", to: "PERSON", symmetric: true },
    EMPLOYED_BY: { from: "PERSON", to: "BUSINESS" },
    PRINCIPAL_OF: { from: "PERSON", to: "BUSINESS" },
    CUSTOMER_OF: { from: "PERSON", to: "BUSINESS" },
    OPERATES_AT: { from: "BUSINESS", to: "LOCATION" },
    FLEET_OF: { from: "BUSINESS", to: "VEHICLE" },
    MEMBER_OF: { from: "PERSON", to: "ENTITY" },
    BASED_AT: { from: "ENTITY", to: "LOCATION" },
    USES_VEHICLE: { from: "ENTITY", to: "VEHICLE" },
    AFFILIATED_WITH: { from: "BUSINESS", to: "ENTITY" }
  };

  function matrixRows() {
    return (root.models && root.models.ASSOCIATION_MATRIX) || [];
  }

  function lookupAssociationType(code) {
    if (root.models && typeof root.models.getAssociationTypeDefinition === "function") {
      return root.models.getAssociationTypeDefinition(code);
    }
    return null;
  }

  function associationTypeSpec(reason) {
    var looked = lookupAssociationType(reason);
    if (looked && looked.def) {
      return {
        code: looked.def.code,
        from: looked.def.fromEntityTypeCode,
        to: looked.def.toEntityTypeCode,
        symmetric: !!looked.def.symmetric,
        label: looked.def.label,
        inverseLabel: looked.def.inverseLabel || looked.def.label
      };
    }
    var fallback = FALLBACK_SPEC[reason];
    if (!fallback) {
      return null;
    }
    return {
      code: reason,
      from: fallback.from,
      to: fallback.to,
      symmetric: !!fallback.symmetric,
      label: reason,
      inverseLabel: reason
    };
  }

  function isSymmetricAssociation(reason) {
    var spec = associationTypeSpec(reason);
    return !!(spec && spec.symmetric);
  }

  function canonicalAssociationEnds(fromType, fromId, toType, toId, reason) {
    fromType = String(fromType || "").toUpperCase();
    toType = String(toType || "").toUpperCase();
    var spec = associationTypeSpec(reason);
    if (!spec) {
      return {
        fromType: fromType,
        fromId: fromId,
        toType: toType,
        toId: toId,
        reason: reason || ""
      };
    }
    var reasonCode = spec.code || reason;
    if (fromType === spec.from && toType === spec.to) {
      return {
        fromType: fromType,
        fromId: fromId,
        toType: toType,
        toId: toId,
        reason: reasonCode
      };
    }
    if (fromType === spec.to && toType === spec.from) {
      return {
        fromType: toType,
        fromId: toId,
        toType: fromType,
        toId: fromId,
        reason: reasonCode
      };
    }
    return {
      fromType: fromType,
      fromId: fromId,
      toType: toType,
      toId: toId,
      reason: reasonCode
    };
  }

  function validateAssociationEnds(fromType, toType, reason) {
    if (root.models && typeof root.models.validateAssociationPair === "function") {
      return root.models.validateAssociationPair(fromType, toType, reason);
    }
    var spec = associationTypeSpec(reason);
    if (!spec) {
      return {
        ok: false,
        errors: ["associationTypeCode is not in the A6 matrix: " + reason],
        def: null,
        orientation: null
      };
    }
    var a = String(fromType || "").toUpperCase();
    var b = String(toType || "").toUpperCase();
    if (
      (a === spec.from && b === spec.to) ||
      (a === spec.to && b === spec.from) ||
      (spec.symmetric && a === spec.from && b === spec.to)
    ) {
      return { ok: true, errors: [], def: spec, orientation: "canonical" };
    }
    return {
      ok: false,
      errors: ["Those objects cannot be linked as " + reason + "."],
      def: spec,
      orientation: null
    };
  }

  function associationReasonsForPair(fromType, toType) {
    var a = String(fromType || "").toUpperCase();
    var b = String(toType || "").toUpperCase();
    var rows = matrixRows();
    var out = [];
    if (rows.length) {
      rows.forEach(function (row) {
        if (!row || row.active === false) {
          return;
        }
        if (
          (row.fromEntityTypeCode === a && row.toEntityTypeCode === b) ||
          (row.fromEntityTypeCode === b && row.toEntityTypeCode === a)
        ) {
          out.push({ value: row.code, label: row.label });
        }
      });
      return out;
    }
    Object.keys(FALLBACK_SPEC).forEach(function (code) {
      var spec = FALLBACK_SPEC[code];
      if (
        (spec.from === a && spec.to === b) ||
        (spec.from === b && spec.to === a)
      ) {
        out.push({ value: code, label: code });
      }
    });
    return out;
  }

  var CARD_LABELS = {
    REGISTERED_OWNER_OF: "Owner",
    KNOWN_OPERATOR_OF: "Operator",
    CURRENT_RESIDENCE: "Resident",
    KNOWN_RESIDENCE: "Known resident",
    LAST_KNOWN_ADDRESS: "Last known",
    EMPLOYMENT_ADDRESS: "Employment",
    BUSINESS_ADDRESS: "Business address",
    FREQUENTED_LOCATION: "Frequents",
    CUSTOMER_OF: "Customer",
    EMPLOYED_BY: "Employee",
    PRINCIPAL_OF: "Owner",
    ASSOCIATE_OF: "Associate",
    COHABITANT_OF: "Cohabitant",
    SPOUSE_OF: "Spouse",
    PARENT_OF: "Parent",
    SIBLING_OF: "Sibling",
    MEMBER_OF: "Member"
  };

  function defaultPersonAssociationReason(hostType) {
    var t = String(hostType || "").toUpperCase();
    if (t === "VEHICLE") {
      return "REGISTERED_OWNER_OF";
    }
    if (t === "LOCATION") {
      return "CURRENT_RESIDENCE";
    }
    if (t === "BUSINESS") {
      return "CUSTOMER_OF";
    }
    if (t === "ENTITY") {
      return "MEMBER_OF";
    }
    return "ASSOCIATE_OF";
  }

  function personAssociationReasons(hostType) {
    return associationReasonsForPair(hostType, "PERSON");
  }

  function associationCardLabel(reason) {
    if (CARD_LABELS[reason]) {
      return CARD_LABELS[reason];
    }
    var spec = associationTypeSpec(reason);
    return (spec && spec.label) || reason || "Linked";
  }

  function createLink(extra) {
    extra = extra || {};
    var otherType = extra.otherType || (extra.to && extra.to.type) || "";
    return model.assign(
      {
        linkId: model.newId("link"),
        associationId: extra.associationId || "",
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

  function createAssociation(extra) {
    extra = extra || {};
    var otherType =
      extra.otherType ||
      extra.toEntityType ||
      (extra.to && extra.to.type) ||
      "PERSON";
    var reason =
      extra.reason ||
      extra.associationTypeCode ||
      (extra.reasons && extra.reasons[0]) ||
      "";
    var reasons = Array.isArray(extra.reasons)
      ? extra.reasons.slice()
      : reason
        ? [reason]
        : extra.associationTypeCode
          ? [extra.associationTypeCode]
          : [];
    if (!reason && reasons.length) {
      reason = reasons[0];
    }
    if (reason && reasons.indexOf(reason) === -1) {
      reasons.unshift(reason);
    }
    var from = {
      type: extra.fromEntityType || (extra.from && extra.from.type) || "",
      id: extra.fromEntityId || (extra.from && extra.from.id) || ""
    };
    var to = {
      type: extra.toEntityType || (extra.to && extra.to.type) || otherType,
      id: extra.toEntityId || (extra.to && extra.to.id) || ""
    };
    var id = extra.associationId || extra.linkId || model.newId("asoc");
    var source = extra.source && typeof extra.source === "object" ? extra.source : {};
    return model.assign(
      {
        associationId: id,
        linkId: extra.linkId || id,
        entityType: "ASSOCIATION",
        schema: "copdocx.association.v1",
        from: from,
        to: to,
        reason: reason,
        reasons: reasons,
        label: extra.label || extra.name || "",
        otherType: otherType,
        occupancy: extra.occupancy || "current",
        validFrom: extra.validFrom || extra.occupiedFrom || "",
        validTo: extra.validTo || extra.occupiedTo || "",
        notes: extra.notes || extra.reasonCode || "",
        source: {
          investigationId: source.investigationId || extra.investigationId || "",
          leadId: source.leadId || extra.leadId || "",
          encounterId: source.encounterId || extra.encounterId || "",
          officerId: source.officerId || extra.officerId || ""
        },
        assertedAt: extra.assertedAt || "",
        junked: extra.junked === true,
        junkedAt: extra.junkedAt || ""
      },
      extra
    );
  }

  model.createLink = createLink;
  model.createAssociation = createAssociation;
  model.associationTypeSpec = associationTypeSpec;
  model.isSymmetricAssociation = isSymmetricAssociation;
  model.canonicalAssociationEnds = canonicalAssociationEnds;
  model.validateAssociationEnds = validateAssociationEnds;
  model.associationReasonsForPair = associationReasonsForPair;
  model.defaultPersonAssociationReason = defaultPersonAssociationReason;
  model.personAssociationReasons = personAssociationReasons;
  model.associationCardLabel = associationCardLabel;
})(typeof window !== "undefined" ? window : globalThis);
