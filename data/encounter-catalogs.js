/**
 * E1 / E2 / E3 encounter catalogs — product direction 2026-08-07.
 * Codes stable; labels may refine later.
 */
window.COPDoc = window.COPDoc || {};
window.COPDoc.catalogs = window.COPDoc.catalogs || {};

(function () {
  function entries(rows) {
    return rows.map(function (r, i) {
      return {
        code: r[0],
        label: r[1],
        active: true,
        sortOrder: i + 1,
        aliases: [],
      };
    });
  }

  /** E1 — EncounterParticipant.finalOutcome */
  window.COPDoc.catalogs.FINAL_OUTCOMES = entries([
    ["ARRESTED", "Arrested"],
    ["DETAINED", "Detained"],
    ["RELEASED", "Released"],
    ["TRANSFERRED", "Transferred"],
    ["INTERVIEWED", "Interviewed"],
    ["NOT_CONTACTED", "Not contacted"],
    ["NOT_IN_CUSTODY", "Not in custody"],
    ["OTHER", "Other"],
  ]);

  /** E2 — release reason when RELEASED / NOT_IN_CUSTODY */
  window.COPDoc.catalogs.RELEASE_REASONS = entries([
    ["US_CITIZEN", "U.S. citizen / claimed USC"],
    ["LAWFUL_STATUS", "Lawful status / not removable on this contact"],
    ["PROSECUTORIAL_DISCRETION", "Prosecutorial discretion"],
    ["INSUFFICIENT_EVIDENCE", "Insufficient evidence / cannot establish alienage or violation"],
    ["NTA_ISSUED_RELEASED", "NTA issued — released pending proceedings"],
    ["ORDER_OF_RECOGNIZANCE", "Order of recognizance / conditional release"],
    ["MEDICAL", "Medical release"],
    ["JUVENILE_WELFARE", "Juvenile / welfare handoff"],
    ["OTHER_AGENCY", "Released to / handled by other agency"],
    ["SUPERVISOR_DIRECTION", "Supervisor direction"],
    ["TIME_RESOURCE", "Time / resource constraints"],
    ["OTHER", "Other"],
  ]);

  /** E3.a — Encounter.eventType */
  window.COPDoc.catalogs.ENCOUNTER_TYPES = entries([
    ["KNOCK_AND_TALK", "Knock and talk"],
    ["VEHICLE_STOP", "Vehicle stop"],
    ["CONSENSUAL_ENCOUNTER", "Consensual encounter"],
    ["TARGETED_ARREST", "Targeted arrest / planned enforcement"],
    ["AT_LARGE", "At-large / fugitive effort"],
    ["WORKSITE", "Worksite"],
    ["STAGING_PROCESSING", "Staging / processing"],
    ["COLLATERAL_CONTACT", "Collateral contact"],
    ["OTHER", "Other"],
  ]);

  /** E3.b — EncounterEvent.eventType */
  window.COPDoc.catalogs.TIMELINE_EVENT_TYPES = entries([
    ["ARRIVAL", "Arrival on scene"],
    ["SURVEILLANCE", "Surveillance"],
    ["OBSERVATION", "Observation"],
    ["KNOCK_AND_TALK", "Knock and talk contact"],
    ["CONSENSUAL_CONTACT", "Consensual contact"],
    ["VEHICLE_STOP", "Vehicle stop"],
    ["VEHICLE_CONTAINMENT", "Vehicle containment"],
    ["VEHICLE_ENTRY", "Vehicle entry"],
    ["IDENTITY_CHECK", "Identity / alienage check"],
    ["INTERVIEW", "Interview"],
    ["ARREST", "Arrest"],
    ["DETENTION", "Detention"],
    ["SEARCH", "Search"],
    ["USE_OF_FORCE", "Use of force"],
    ["RESTRAINT", "Restraint"],
    ["TRANSPORT", "Transport"],
    ["TRANSFER", "Transfer to other agency"],
    ["RELEASE", "Release"],
    ["PROPERTY_DISPOSITION", "Property disposition"],
    ["VEHICLE_DISPOSITION", "Vehicle disposition"],
    ["BWC_NOTE", "BWC / recording note"],
    ["OTHER", "Other"],
  ]);

  /** Thin v1 closing answers (4.12-style); blank = not collected */
  window.COPDoc.catalogs.CLOSING_HEALTH = entries([
    ["GOOD", "Good"],
    ["ISSUES", "Issues"],
    ["DECLINED", "Declined"],
  ]);
  window.COPDoc.catalogs.CLOSING_MINORS = entries([
    ["NONE", "None"],
    ["YES", "Yes"],
    ["DECLINED", "Declined"],
  ]);
  window.COPDoc.catalogs.CLOSING_MEDICATION = entries([
    ["NONE", "None"],
    ["YES", "Yes"],
    ["DECLINED", "Declined"],
  ]);
  window.COPDoc.catalogs.CLOSING_CURRENCY = entries([
    ["NONE", "None"],
    ["YES", "Yes"],
    ["DECLINED", "Declined"],
  ]);
  window.COPDoc.catalogs.CLOSING_IDENTITY_DOCS = entries([
    ["PROPERTY", "Property"],
    ["NONE", "None"],
    ["OTHER", "Other"],
    ["DECLINED", "Declined"],
  ]);

  window.COPDoc.catalogs.ENCOUNTER_ROLES = entries([
    ["TARGET", "Target"],
    ["COLLATERAL", "Collateral"],
  ]);

  window.COPDoc.catalogs.ENCOUNTER_STATUSES = entries([
    ["DRAFT", "Draft"],
    ["ACTIVE", "Active"],
    ["COMPLETED", "Completed"],
    ["FINALIZED", "Finalized"],
    ["VOIDED", "Voided"],
  ]);

  /**
   * Slice 5 — per-subject enforcement basis (codes only; not legal conclusions).
   * Maps conceptual EnforcementAuthority.type / factual basis summary.
   */
  window.COPDoc.catalogs.ENFORCEMENT_BASIS = entries([
    ["I_200", "I-200 / administrative warrant"],
    ["FINAL_ORDER", "Final order of removal"],
    ["CRIMINAL_WARRANT", "Criminal warrant"],
    ["WARRANTLESS_ADMINISTRATIVE", "Warrantless administrative basis"],
    ["PROBABLE_CAUSE", "Probable cause (documented facts)"],
    ["CONSENT", "Consent / consensual contact"],
    ["OTHER", "Other"],
  ]);

  /** Slice 5 — EncounterVehicle.vehicleRole */
  window.COPDoc.catalogs.ENCOUNTER_VEHICLE_ROLES = entries([
    ["SUBJECT_VEHICLE", "Subject vehicle"],
    ["TRANSPORT", "Transport"],
    ["FLEET", "Agency / fleet vehicle"],
    ["CONTAINED", "Contained / blocked"],
    ["OTHER", "Other"],
  ]);

  /** Slice 6 — time precision on EncounterEvent.occurredAt */
  window.COPDoc.catalogs.EVENT_TIME_PRECISION = entries([
    ["EXACT", "Exact"],
    ["APPROXIMATE", "Approximate"],
    ["UNKNOWN", "Unknown / not recorded"],
    ["DAY_ONLY", "Date known, time approximate"],
  ]);

  /** Slice 6 — EventParticipant.role on event.participantLinks */
  window.COPDoc.catalogs.EVENT_PARTICIPANT_ROLES = entries([
    ["ACTOR", "Actor"],
    ["RECIPIENT", "Recipient"],
    ["PRESENT", "Present"],
    ["OBSERVED", "Observed"],
    ["AFFECTED", "Affected"],
    ["OTHER", "Other"],
  ]);

  /** Slice 6 — EventOfficer.role on event.officerLinks */
  window.COPDoc.catalogs.EVENT_OFFICER_ROLES = entries([
    ["ACTOR", "Actor"],
    ["OBSERVER", "Observer"],
    ["ASSISTING", "Assisting"],
    ["REPORTING", "Reporting"],
    ["OTHER", "Other"],
  ]);

  /**
   * Slice 6 — detail families (typed payload under event.details).
   * Event type → default family via models.eventDetailFamilyForType.
   */
  window.COPDoc.catalogs.EVENT_DETAIL_FAMILIES = entries([
    ["CONTACT", "Contact / presence"],
    ["DETENTION", "Detention / arrest / custody"],
    ["FORCE", "Use of force"],
    ["VEHICLE", "Vehicle action"],
    ["IDENTITY", "Identity / alienage"],
    ["GENERIC", "Generic / other"],
  ]);

  /** Code sets for validators */
  window.COPDoc.catalogs.codesOf = function codesOf(list) {
    return (list || []).map(function (e) {
      return e.code;
    });
  };
})();
