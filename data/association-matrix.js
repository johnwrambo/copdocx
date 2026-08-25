/**
 * A6 — Association type matrix (Slice 3).
 *
 * Each row is a RelationshipTypeDefinition (conceptual) adapted for COPDoc:
 * - fromEntityTypeCode / toEntityTypeCode = allowed pair (canonical storage direction)
 * - inverseTypeCode = label when viewing from the opposite endpoint
 * - symmetric = same code both ways; one row only (no reverse duplicate)
 * - permitsMultiple = more than one ACTIVE link of this type from the same fromEntity
 *
 * Codes are stable; do not rename. Retire with active: false.
 */
(function (global) {
  "use strict";

  var root = (global.COPDoc = global.COPDoc || {});
  root.models = root.models || {};

  function row(def) {
    return {
      code: def.code,
      label: def.label,
      description: def.description != null ? def.description : null,
      fromEntityTypeCode: def.from,
      toEntityTypeCode: def.to,
      inverseTypeCode: def.inverse || def.code,
      inverseLabel: def.inverseLabel || null,
      symmetric: !!def.symmetric,
      permitsMultiple: def.permitsMultiple !== false,
      active: def.active !== false,
      sortOrder: typeof def.sortOrder === "number" ? def.sortOrder : 100,
      aliases: Array.isArray(def.aliases) ? def.aliases.slice() : [],
    };
  }

  /**
   * Canonical matrix — v1 freeze for product linking.
   * Encounter_* location types: PERSON → LOCATION (subject linked to place of event).
   */
  var MATRIX = [
    // —— Person → Location ——
    row({
      code: "CURRENT_RESIDENCE",
      label: "Current residence",
      from: "PERSON",
      to: "LOCATION",
      inverse: "RESIDENCE_OF",
      inverseLabel: "Residence of",
      permitsMultiple: true,
      sortOrder: 10,
    }),
    row({
      code: "KNOWN_RESIDENCE",
      label: "Known residence",
      from: "PERSON",
      to: "LOCATION",
      inverse: "KNOWN_RESIDENCE_OF",
      inverseLabel: "Known residence of",
      sortOrder: 20,
    }),
    row({
      code: "LAST_KNOWN_ADDRESS",
      label: "Last known address",
      from: "PERSON",
      to: "LOCATION",
      inverse: "LAST_KNOWN_ADDRESS_OF",
      inverseLabel: "Last known address of",
      sortOrder: 30,
    }),
    row({
      code: "EMPLOYMENT_ADDRESS",
      label: "Employment address",
      from: "PERSON",
      to: "LOCATION",
      inverse: "EMPLOYMENT_ADDRESS_OF",
      inverseLabel: "Employment address of",
      sortOrder: 40,
    }),
    row({
      code: "BUSINESS_ADDRESS",
      label: "Business address",
      from: "PERSON",
      to: "LOCATION",
      inverse: "BUSINESS_ADDRESS_OF",
      inverseLabel: "Business address of",
      sortOrder: 50,
    }),
    row({
      code: "FREQUENTED_LOCATION",
      label: "Frequented location",
      from: "PERSON",
      to: "LOCATION",
      inverse: "FREQUENTED_BY",
      inverseLabel: "Frequented by",
      sortOrder: 60,
    }),
    row({
      code: "ENCOUNTER_LOCATION",
      label: "Encounter location",
      from: "PERSON",
      to: "LOCATION",
      inverse: "ENCOUNTER_LOCATION_FOR",
      inverseLabel: "Encounter location for",
      sortOrder: 70,
      description: "Subject linked to place of encounter contact (not a timeline event).",
    }),
    row({
      code: "ARREST_LOCATION",
      label: "Arrest location",
      from: "PERSON",
      to: "LOCATION",
      inverse: "ARREST_LOCATION_FOR",
      inverseLabel: "Arrest location for",
      sortOrder: 80,
    }),
    row({
      code: "STAGING_LOCATION",
      label: "Staging location",
      from: "PERSON",
      to: "LOCATION",
      inverse: "STAGING_LOCATION_FOR",
      inverseLabel: "Staging location for",
      sortOrder: 90,
    }),
    row({
      code: "PROCESSING_LOCATION",
      label: "Processing location",
      from: "PERSON",
      to: "LOCATION",
      inverse: "PROCESSING_LOCATION_FOR",
      inverseLabel: "Processing location for",
      sortOrder: 100,
    }),

    // —— Person → Vehicle ——
    row({
      code: "REGISTERED_OWNER_OF",
      label: "Registered owner of",
      from: "PERSON",
      to: "VEHICLE",
      inverse: "REGISTERED_TO",
      inverseLabel: "Registered to",
      sortOrder: 110,
    }),
    row({
      code: "KNOWN_OPERATOR_OF",
      label: "Known operator of",
      from: "PERSON",
      to: "VEHICLE",
      inverse: "OPERATED_BY",
      inverseLabel: "Operated by",
      sortOrder: 120,
    }),

    // —— Vehicle → Location ——
    row({
      code: "REGISTERED_ADDRESS",
      label: "Registered address",
      from: "VEHICLE",
      to: "LOCATION",
      inverse: "REGISTERED_ADDRESS_OF",
      inverseLabel: "Registered address of vehicle",
      sortOrder: 130,
    }),
    row({
      code: "VEHICLE_PARKING",
      label: "Vehicle parking",
      from: "VEHICLE",
      to: "LOCATION",
      inverse: "PARKING_FOR",
      inverseLabel: "Parking for",
      sortOrder: 140,
    }),
    row({
      code: "STORED_AT",
      label: "Stored at",
      from: "VEHICLE",
      to: "LOCATION",
      inverse: "STORES",
      inverseLabel: "Stores",
      sortOrder: 150,
    }),

    // —— Person → Person ——
    row({
      code: "PARENT_OF",
      label: "Parent of",
      from: "PERSON",
      to: "PERSON",
      inverse: "CHILD_OF",
      inverseLabel: "Child of",
      sortOrder: 200,
    }),
    row({
      code: "SPOUSE_OF",
      label: "Spouse of",
      from: "PERSON",
      to: "PERSON",
      inverse: "SPOUSE_OF",
      inverseLabel: "Spouse of",
      symmetric: true,
      sortOrder: 210,
    }),
    row({
      code: "SIBLING_OF",
      label: "Sibling of",
      from: "PERSON",
      to: "PERSON",
      inverse: "SIBLING_OF",
      inverseLabel: "Sibling of",
      symmetric: true,
      sortOrder: 220,
    }),
    row({
      code: "ASSOCIATE_OF",
      label: "Associate of",
      from: "PERSON",
      to: "PERSON",
      inverse: "ASSOCIATE_OF",
      inverseLabel: "Associate of",
      symmetric: true,
      sortOrder: 230,
    }),
    row({
      code: "COHABITANT_OF",
      label: "Cohabitant of",
      from: "PERSON",
      to: "PERSON",
      inverse: "COHABITANT_OF",
      inverseLabel: "Cohabitant of",
      symmetric: true,
      sortOrder: 240,
    }),
  ];

  root.models.ASSOCIATION_MATRIX = MATRIX;

  /** Flat list of primary type codes (canonical storage codes). */
  root.models.ASSOCIATION_TYPE_CODES = MATRIX.filter(function (m) {
    return m.active;
  }).map(function (m) {
    return m.code;
  });

  /** All codes that may appear as associationTypeCode (primary + inverse labels). */
  root.models.ASSOCIATION_ALL_CODES = (function () {
    var seen = {};
    var out = [];
    MATRIX.forEach(function (m) {
      if (!m.active) return;
      if (!seen[m.code]) {
        seen[m.code] = true;
        out.push(m.code);
      }
      if (m.inverseTypeCode && !seen[m.inverseTypeCode]) {
        seen[m.inverseTypeCode] = true;
        out.push(m.inverseTypeCode);
      }
    });
    return out;
  })();

  var byCode = Object.create(null);
  var byInverse = Object.create(null);
  MATRIX.forEach(function (m) {
    byCode[m.code] = m;
    if (m.inverseTypeCode) {
      if (!byInverse[m.inverseTypeCode]) byInverse[m.inverseTypeCode] = m;
    }
  });

  /**
   * Look up matrix row by primary code or inverse code.
   * @returns {{ def: object, orientation: "canonical"|"inverse" }|null}
   */
  root.models.getAssociationTypeDefinition = function getAssociationTypeDefinition(code) {
    if (!code) return null;
    var c = String(code);
    if (byCode[c]) return { def: byCode[c], orientation: "canonical" };
    if (byInverse[c] && byInverse[c].inverseTypeCode === c) {
      // inverse-only code (e.g. RESIDENCE_OF) or symmetric where inverse === primary
      if (byCode[c]) return { def: byCode[c], orientation: "canonical" };
      return { def: byInverse[c], orientation: "inverse" };
    }
    return null;
  };

  /**
   * Validate whether fromType + toType + code is allowed.
   * Accepts either canonical orientation or inverted endpoints with inverse code.
   * @returns {{ ok: boolean, errors: string[], def: object|null, orientation: string|null }}
   */
  root.models.validateAssociationPair = function validateAssociationPair(
    fromType,
    toType,
    typeCode
  ) {
    var errors = [];
    if (!fromType) errors.push("fromEntityType is required");
    if (!toType) errors.push("toEntityType is required");
    if (!typeCode) errors.push("associationTypeCode is required");
    if (errors.length) return { ok: false, errors: errors, def: null, orientation: null };

    var looked = root.models.getAssociationTypeDefinition(typeCode);
    if (!looked || !looked.def || !looked.def.active) {
      return {
        ok: false,
        errors: ["associationTypeCode is not in the A6 matrix: " + typeCode],
        def: null,
        orientation: null,
      };
    }
    var def = looked.def;

    // Canonical orientation
    if (
      looked.orientation === "canonical" &&
      fromType === def.fromEntityTypeCode &&
      toType === def.toEntityTypeCode
    ) {
      return { ok: true, errors: [], def: def, orientation: "canonical" };
    }

    // Stored using inverse code with reversed endpoints
    if (
      looked.orientation === "inverse" &&
      fromType === def.toEntityTypeCode &&
      toType === def.fromEntityTypeCode
    ) {
      return { ok: true, errors: [], def: def, orientation: "inverse" };
    }

    // Symmetric: either order with the primary code
    if (
      def.symmetric &&
      typeCode === def.code &&
      ((fromType === def.fromEntityTypeCode && toType === def.toEntityTypeCode) ||
        (fromType === def.toEntityTypeCode && toType === def.fromEntityTypeCode))
    ) {
      return { ok: true, errors: [], def: def, orientation: "canonical" };
    }

    // Primary code but endpoints reversed (common mistake) — allow and mark inverse orientation
    if (
      typeCode === def.code &&
      fromType === def.toEntityTypeCode &&
      toType === def.fromEntityTypeCode &&
      !def.symmetric
    ) {
      return { ok: true, errors: [], def: def, orientation: "inverse" };
    }

    return {
      ok: false,
      errors: [
        "associationTypeCode " +
          typeCode +
          " does not allow " +
          fromType +
          " → " +
          toType +
          " (expected " +
          def.fromEntityTypeCode +
          " → " +
          def.toEntityTypeCode +
          (def.symmetric ? " or reverse" : "") +
          ")",
      ],
      def: def,
      orientation: null,
    };
  };

  /**
   * Label for a type when viewed from a given endpoint.
   * @param {string} typeCode stored associationTypeCode
   * @param {boolean} viewerIsFromEntity true if viewer is the fromEntity of the stored row
   */
  root.models.associationLabelForViewer = function associationLabelForViewer(
    typeCode,
    viewerIsFromEntity
  ) {
    var looked = root.models.getAssociationTypeDefinition(typeCode);
    if (!looked || !looked.def) return typeCode || "";
    var def = looked.def;
    if (viewerIsFromEntity) {
      // Viewer is from side of stored row
      if (looked.orientation === "inverse" || typeCode === def.inverseTypeCode) {
        // stored as inverse code: from side sees inverse label
        return def.inverseLabel || def.inverseTypeCode || def.label;
      }
      return def.label;
    }
    // Viewer is to side of stored row → show inverse of canonical
    if (typeCode === def.code || looked.orientation === "canonical") {
      return def.inverseLabel || def.inverseTypeCode || def.label;
    }
    return def.label;
  };

  /**
   * Normalize partial association to canonical storage orientation when possible.
   * Inverse codes become primary codes with flipped endpoints.
   */
  root.models.normalizeAssociationPartial = function normalizeAssociationPartial(partial) {
    var p = Object.assign({}, partial || {});
    var fromType = p.fromEntity && p.fromEntity.entityType;
    var toType = p.toEntity && p.toEntity.entityType;
    var code = p.associationTypeCode;
    var check = root.models.validateAssociationPair(fromType, toType, code);
    if (!check.ok || !check.def) return p;

    var def = check.def;
    // Flip inverse storage to canonical
    if (check.orientation === "inverse" && !def.symmetric) {
      var tmp = p.fromEntity;
      p.fromEntity = p.toEntity;
      p.toEntity = tmp;
      p.associationTypeCode = def.code;
    }
    // Symmetric: order endpoints by id for stable duplicate detection
    if (def.symmetric && p.fromEntity && p.toEntity) {
      var a = p.fromEntity.entityId || "";
      var b = p.toEntity.entityId || "";
      if (a && b && a > b) {
        var t = p.fromEntity;
        p.fromEntity = p.toEntity;
        p.toEntity = t;
      }
      p.associationTypeCode = def.code;
    }
    return p;
  };
})(typeof window !== "undefined" ? window : globalThis);
