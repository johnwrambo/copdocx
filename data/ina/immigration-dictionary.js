// js/data/immigration-dictionary.js
// Immigration Terms Dictionary
// Starting with EARM Processing Dispositions and Immigration Status codes.
// Includes category definitions, inter-category relationships, and cross-term mappings.

/**
 * CATEGORY DEFINITIONS
 * --------------------
 * EARM_PROCESSING_DISPOSITION:
 *   Operational outcome or action recorded in the Enforcement Alien Removal Module (EARM)
 *   (or successor systems) that describes what happened to a subject during or after an
 *   encounter, arrest, or case processing. These codes track the *processing result*
 *   (e.g., removed, returned, detained, turned over, not amenable).
 *
 * IMMIGRATION_STATUS:
 *   Classification of a person’s legal immigration posture under the Immigration and
 *   Nationality Act (INA) or related authorities. These codes describe *who the person is*
 *   in the eyes of the law (citizen, LPR, deportable, inadmissible, etc.) rather than
 *   what action was taken.
 *
 * RELATIONSHIP BETWEEN CATEGORIES
 * -------------------------------
 * - Immigration Status is generally a *predicate* or *input* to Processing Disposition.
 *   A person’s status (or lack of status) determines which dispositions are legally available.
 * - Processing Disposition is the *outcome* of enforcement action applied to a person of
 *   a given status.
 * - Some dispositions effectively *confirm or change* status (e.g., FBUSC or USC/PR may
 *   confirm citizenship; DN reflects loss of citizenship).
 * - Many dispositions are only possible for certain statuses:
 *     • Removal-related dispositions (ER, REINST, ADMDPT, VD, V, etc.) generally require
 *       the person to be an alien who is removable (inadmissible or deportable).
 *     • NAR / FBUSC / USC often appear when the subject is determined to be a citizen or
 *       otherwise not removable.
 * - Operational codes (NIC, TOT, B, DTNR, PD) can apply across statuses but are most
 *   meaningful in the context of aliens in proceedings or custody.
 */

var DICTIONARY_CATEGORIES = {
  "EARM_PROCESSING_DISPOSITION": {
    "name": "EARM Processing Disposition",
    "definition": "Operational outcome or action recorded in EARM (or successor systems) describing what happened to a subject during or after an encounter, arrest, or case processing. Tracks the processing *result*.",
    "focus": "What action/result occurred",
    "primary_use": "Case tracking, statistics, I-213 narrative, detention/removal workflow"
  },
  "IMMIGRATION_STATUS": {
    "name": "Immigration Status",
    "definition": "Classification of a person’s legal immigration posture under the INA or related authorities. Describes *who the person is* legally rather than what action was taken.",
    "focus": "Legal classification of the person",
    "primary_use": "Charging decisions, eligibility for relief, amenability to removal, custody determinations"
  }
};

var EARM_DISPOSITION_DICTIONARY = [
  {
    "code": "ADMDPT",
    "term": "Administrative Deportation",
    "full_label": "Administrative Deportation I-851/I-851A",
    "category": "EARM_PROCESSING_DISPOSITION",
    "definition": "Administrative removal of a non-lawful permanent resident convicted of an aggravated felony under INA § 238(b). Executed via Form I-851 / I-851A.",
    "related_status_codes": ["D", "IA"],
    "relation_notes": "Typically applied to aliens who are deportable (D) or inadmissible (IA) and who meet the aggravated-felony criteria for administrative removal. Not available for LPRs in the same streamlined fashion."
  },
  {
    "code": "B",
    "term": "Bag and Baggage",
    "full_label": "Bag and Baggage",
    "category": "EARM_PROCESSING_DISPOSITION",
    "definition": "Operational status indicating the alien is ready for physical removal (travel documents obtained, final arrangements completed).",
    "related_status_codes": ["D", "IA"],
    "relation_notes": "Logistical readiness marker that usually follows a final order or other removal disposition for a removable alien (D or IA)."
  },
  {
    "code": "CRW99R",
    "term": "Crew Member Removal",
    "full_label": "Crew Member (I-99) Removal",
    "category": "EARM_PROCESSING_DISPOSITION",
    "definition": "Removal of an alien crewman under the special crew provisions of the INA (historically associated with Form I-99 processes).",
    "related_status_codes": ["IA", "D"],
    "relation_notes": "Applies to nonimmigrant crewmen who are inadmissible or have violated status and are being removed under crew-specific authorities."
  },
  {
    "code": "DTNR",
    "term": "Detainer",
    "full_label": "Detainer",
    "category": "EARM_PROCESSING_DISPOSITION",
    "definition": "Immigration detainer issued to another law-enforcement agency requesting notification of release or transfer of custody (authority rooted in INA § 287 and 8 C.F.R. § 287.7).",
    "related_status_codes": ["D", "IA", "LPR"],
    "relation_notes": "Can be lodged against removable aliens (D/IA) and, in limited circumstances, against LPRs who are deportable. Not itself a removal order."
  },
  {
    "code": "ER",
    "term": "Expedited Removal",
    "full_label": "Expedited Removal (I-860)",
    "category": "EARM_PROCESSING_DISPOSITION",
    "definition": "Summary removal of certain inadmissible arriving aliens (or those who have not been admitted/paroled) under INA § 235(b)(1). Form I-860.",
    "related_status_codes": ["IA", "EX"],
    "relation_notes": "Primary tool for aliens who are inadmissible (IA) or historically treated as excludable (EX). Not used for admitted LPRs."
  },
  {
    "code": "ER/CF",
    "term": "Expedited Removal with Credible Fear",
    "full_label": "Expedited Removal with Credible Fear",
    "category": "EARM_PROCESSING_DISPOSITION",
    "definition": "Expedited removal process in which the alien claimed fear of return and was referred for a credible-fear interview under INA § 235(b)(1)(B).",
    "related_status_codes": ["IA"],
    "relation_notes": "Same underlying inadmissible (IA) population as ER; the CF suffix records that a fear claim was raised and screened."
  },
  {
    "code": "ER/CFF",
    "term": "Expedited Removal with Credible Fear – Full Scope",
    "full_label": "Expedited Removal with Credible Fear - Full Scope",
    "category": "EARM_PROCESSING_DISPOSITION",
    "definition": "Variant of expedited removal involving credible-fear determination under full-scope procedures.",
    "related_status_codes": ["IA"],
    "relation_notes": "Operational variant of ER/CF for inadmissible aliens."
  },
  {
    "code": "ERF",
    "term": "Expedited Removal – Full Scope",
    "full_label": "Expedited Removal (I-860) - Full Scope",
    "category": "EARM_PROCESSING_DISPOSITION",
    "definition": "Expedited removal under the expanded (full-scope) application of INA § 235(b)(1) authority.",
    "related_status_codes": ["IA", "EX"],
    "relation_notes": "Same legal target population as ER (primarily IA)."
  },
  {
    "code": "FBUSC",
    "term": "Foreign-Born U.S. Citizen",
    "full_label": "Foreign Born USC",
    "category": "EARM_PROCESSING_DISPOSITION",
    "definition": "Subject determined to be a U.S. citizen (foreign-born). Not amenable to removal.",
    "related_status_codes": ["USC"],
    "relation_notes": "Directly corresponds to Immigration Status USC. Disposition records the operational finding that the person is a citizen."
  },
  {
    "code": "HCA",
    "term": "HSI Criminal Arrest",
    "full_label": "HSI Criminal Arrest",
    "category": "EARM_PROCESSING_DISPOSITION",
    "definition": "Arrest by Homeland Security Investigations on criminal (non-purely administrative) charges.",
    "related_status_codes": ["D", "IA", "LPR", "USC"],
    "relation_notes": "Can involve any status; immigration consequences (if any) are determined separately. May later lead to a removal disposition for removable aliens."
  },
  {
    "code": "NAR",
    "term": "Not Amenable to Removal",
    "full_label": "Not Amenable to Removal",
    "category": "EARM_PROCESSING_DISPOSITION",
    "definition": "Subject is not amenable to removal under the INA (e.g., U.S. citizen, certain diplomatic status, or other legal bar).",
    "related_status_codes": ["USC", "N", "NEX"],
    "relation_notes": "Often pairs with USC, Non-Deportable (N), or Not Excludable (NEX) findings."
  },
  {
    "code": "NIC",
    "term": "Not in Custody",
    "full_label": "Not in Custody",
    "category": "EARM_PROCESSING_DISPOSITION",
    "definition": "Subject is not in ICE/ERO custody at the time of the disposition update.",
    "related_status_codes": ["D", "IA", "LPR", "N"],
    "relation_notes": "Custody status that can apply to any person; most relevant when tracking removable aliens who are at-large."
  },
  {
    "code": "P",
    "term": "Paroled",
    "full_label": "Paroled",
    "category": "EARM_PROCESSING_DISPOSITION",
    "definition": "Alien paroled into the United States under INA § 212(d)(5). Parole is not an admission.",
    "related_status_codes": ["IA"],
    "relation_notes": "Parole is frequently granted to individuals who would otherwise be inadmissible (IA). The person remains an applicant for admission."
  },
  {
    "code": "PD",
    "term": "Prosecutorial Discretion",
    "full_label": "Prosecutorial Discretion",
    "category": "EARM_PROCESSING_DISPOSITION",
    "definition": "Exercise of prosecutorial discretion not to pursue or to terminate enforcement action / removal proceedings.",
    "related_status_codes": ["D", "IA", "LPR"],
    "relation_notes": "Most often exercised toward removable aliens (D or IA) or LPRs in proceedings. Does not change underlying status."
  },
  {
    "code": "REINRF",
    "term": "Reinstatement with Reasonable Fear",
    "full_label": "Reinstatement of Deportation Reasonable Fear",
    "category": "EARM_PROCESSING_DISPOSITION",
    "definition": "Reinstatement of a prior removal order (INA § 241(a)(5)) where the alien expressed fear and was referred for a reasonable-fear interview.",
    "related_status_codes": ["D", "IA"],
    "relation_notes": "Applies to previously removed aliens who re-entered illegally and are again removable (D/IA). Reasonable-fear process can lead to withholding/CAT."
  },
  {
    "code": "REINST",
    "term": "Reinstatement of Removal",
    "full_label": "Reinstatement of Deport Order I-871",
    "category": "EARM_PROCESSING_DISPOSITION",
    "definition": "Reinstatement of a prior order of removal after illegal reentry under INA § 241(a)(5). Form I-871.",
    "related_status_codes": ["D", "IA"],
    "relation_notes": "Classic disposition for previously removed aliens who are again present without admission (IA) or otherwise removable."
  },
  {
    "code": "STOW",
    "term": "Stowaway",
    "full_label": "Stowaway",
    "category": "EARM_PROCESSING_DISPOSITION",
    "definition": "Removal of a stowaway. Stowaways are inadmissible under INA § 212(a)(6)(D) and subject to special procedures under § 235.",
    "related_status_codes": ["IA", "EX"],
    "relation_notes": "Stowaways are a subset of inadmissible (IA) / historically excludable (EX) aliens."
  },
  {
    "code": "T",
    "term": "Other",
    "full_label": "Other",
    "category": "EARM_PROCESSING_DISPOSITION",
    "definition": "Catch-all disposition not covered by a more specific code.",
    "related_status_codes": [],
    "relation_notes": "Requires narrative explanation; can apply to any status."
  },
  {
    "code": "TOT",
    "term": "Turned Over To",
    "full_label": "Turned Over To",
    "category": "EARM_PROCESSING_DISPOSITION",
    "definition": "Subject turned over to another agency (federal, state, or local).",
    "related_status_codes": ["D", "IA", "LPR", "USC"],
    "relation_notes": "Custody-transfer status that can involve any person; common when a removable alien (D/IA) is also wanted by another agency."
  },
  {
    "code": "USC/PR",
    "term": "USC Prosecutions",
    "full_label": "USC Prosecutions",
    "category": "EARM_PROCESSING_DISPOSITION",
    "definition": "Case involving prosecution of a U.S. citizen (or related criminal prosecution activity).",
    "related_status_codes": ["USC"],
    "relation_notes": "Directly tied to U.S. Citizen (USC) status. Not an immigration removal disposition."
  },
  {
    "code": "V",
    "term": "Voluntary Return",
    "full_label": "Voluntary Return",
    "category": "EARM_PROCESSING_DISPOSITION",
    "definition": "Voluntary return (often at or near the border). Distinct from formal Voluntary Departure under INA § 240B.",
    "related_status_codes": ["IA", "EX"],
    "relation_notes": "Frequently used for inadmissible (IA) or arriving aliens who withdraw an application for admission or accept return without a formal order."
  },
  {
    "code": "VD",
    "term": "Voluntary Departure",
    "full_label": "Voluntary Departure",
    "category": "EARM_PROCESSING_DISPOSITION",
    "definition": "Formal Voluntary Departure granted in lieu of an order of removal under INA § 240B (pre- or post-conclusion).",
    "related_status_codes": ["D", "IA"],
    "relation_notes": "Available to certain removable aliens (D or IA) who meet statutory criteria; not available after an aggravated-felony conviction in many cases."
  },
  {
    "code": "VWP/GM",
    "term": "VWP Removal (Guam-CNMI)",
    "full_label": "VWP Removal (GUAM-CNMI)",
    "category": "EARM_PROCESSING_DISPOSITION",
    "definition": "Removal of a Visa Waiver Program entrant in the Guam-CNMI context under INA § 217.",
    "related_status_codes": ["IA", "VWR"],
    "relation_notes": "VWP entrants are nonimmigrants who waive most rights to contest removal; closely related to VWPP Refusal (VWR) status."
  },
  {
    "code": "VWPRM",
    "term": "VWP Removal",
    "full_label": "VWP Removal",
    "category": "EARM_PROCESSING_DISPOSITION",
    "definition": "Removal of an alien admitted under the Visa Waiver Program (INA § 217).",
    "related_status_codes": ["IA", "VWR"],
    "relation_notes": "Same relationship as VWP/GM – VWP aliens are treated as inadmissible for removal purposes once the waiver is invoked."
  },
  {
    "code": "WA/NTA",
    "term": "Warrant of Arrest / Notice to Appear",
    "full_label": "Warrant of Arrest/Notice to Appear",
    "category": "EARM_PROCESSING_DISPOSITION",
    "definition": "Issuance of a Warrant of Arrest and/or Notice to Appear commencing full removal proceedings under INA § 240 (NTA under § 239; arrest authority under § 287).",
    "related_status_codes": ["D", "IA", "LPR"],
    "relation_notes": "Standard charging vehicle for removable aliens (D or IA) and for LPRs placed into removal proceedings."
  },
  {
    "code": "WD/T42",
    "term": "Title 42 Withdrawal",
    "full_label": "Withdrawal (WD-Title 42)",
    "category": "EARM_PROCESSING_DISPOSITION",
    "definition": "Withdrawal / expulsion under Title 42 public-health authority (used extensively during COVID-19). Not an INA removal.",
    "related_status_codes": ["IA"],
    "relation_notes": "Applied primarily to arriving or recently arrived aliens who would otherwise be processed as inadmissible (IA). Authority is public-health based, not INA-based."
  }
];

var IMMIGRATION_STATUS_DICTIONARY = [
  {
    "code": "AW",
    "term": "Application Withdrawn",
    "full_label": "Application Withdrawn",
    "category": "IMMIGRATION_STATUS",
    "definition": "An application for an immigration benefit or for admission has been withdrawn by the applicant.",
    "related_disposition_codes": ["V", "WD/T42", "P"],
    "relation_notes": "Withdrawal of an application for admission often pairs with Voluntary Return (V) or, historically, Title 42 withdrawal. May also precede or follow parole (P)."
  },
  {
    "code": "DN",
    "term": "DeNaturalized",
    "full_label": "DeNaturalized",
    "category": "IMMIGRATION_STATUS",
    "definition": "A person whose naturalized U.S. citizenship has been revoked through denaturalization proceedings.",
    "related_disposition_codes": ["WA/NTA", "REINST", "ADMDPT"],
    "relation_notes": "After denaturalization the person reverts to alien status and may become subject to removal dispositions (WA/NTA, reinstatement, administrative removal, etc.)."
  },
  {
    "code": "D",
    "term": "Deportable",
    "full_label": "Deportable",
    "category": "IMMIGRATION_STATUS",
    "definition": "An alien who has been admitted to the United States and is subject to removal under the grounds of deportability in INA § 237.",
    "related_disposition_codes": ["WA/NTA", "VD", "REINST", "ADMDPT", "DTNR", "B"],
    "relation_notes": "Core status that enables most post-admission removal dispositions: NTA, voluntary departure, reinstatement (if previously removed), administrative removal (if aggravated felon), detainers, and bag-and-baggage."
  },
  {
    "code": "EX",
    "term": "Excludable",
    "full_label": "Excludable",
    "category": "IMMIGRATION_STATUS",
    "definition": "Historical term (pre-IIRIRA) for an alien seeking admission who was ineligible; largely superseded by “inadmissible.” Still appears in some legacy records and codes.",
    "related_disposition_codes": ["ER", "ERF", "V", "STOW"],
    "relation_notes": "Maps closely to modern IA. Classic dispositions were exclusion or withdrawal; today these cases are usually handled as expedited removal or voluntary return."
  },
  {
    "code": "IA",
    "term": "Inadmissible Alien",
    "full_label": "Inadmissible Alien",
    "category": "IMMIGRATION_STATUS",
    "definition": "An alien who is ineligible to be admitted to the United States under one or more grounds in INA § 212(a).",
    "related_disposition_codes": ["ER", "ER/CF", "ERF", "V", "REINST", "STOW", "VWPRM", "P", "WA/NTA"],
    "relation_notes": "Primary status for arriving or present-without-admission aliens. Enables expedited removal, voluntary return, reinstatement, stowaway processing, VWP removal, parole, and (when placed in full proceedings) NTA."
  },
  {
    "code": "LPR",
    "term": "Legal Permanent Resident",
    "full_label": "Legal Permanent Resident",
    "category": "IMMIGRATION_STATUS",
    "definition": "An alien lawfully accorded the privilege of residing permanently in the United States (green-card holder).",
    "related_disposition_codes": ["WA/NTA", "VD", "DTNR", "PD", "NAR"],
    "relation_notes": "LPRs can be placed in removal proceedings (WA/NTA) if deportable, may receive voluntary departure in some cases, can be the subject of detainers, or may benefit from prosecutorial discretion. NAR may be used if they are determined not removable."
  },
  {
    "code": "N",
    "term": "Non-Deportable Alien",
    "full_label": "Non-Deportable Alien",
    "category": "IMMIGRATION_STATUS",
    "definition": "An alien who is not subject to the grounds of deportability (or for whom deportability cannot be established).",
    "related_disposition_codes": ["NAR", "PD", "NIC"],
    "relation_notes": "Often results in a Not Amenable to Removal (NAR) disposition or an exercise of prosecutorial discretion (PD)."
  },
  {
    "code": "NEX",
    "term": "Not Excludable",
    "full_label": "Not Excludable",
    "category": "IMMIGRATION_STATUS",
    "definition": "Historical counterpart to “Non-Deportable”; indicates the person was not subject to exclusion grounds.",
    "related_disposition_codes": ["NAR"],
    "relation_notes": "Legacy status that typically pairs with a finding that the person is not amenable to removal (NAR)."
  },
  {
    "code": "SIC",
    "term": "Special Interest Case",
    "full_label": "Special Interest Case",
    "category": "IMMIGRATION_STATUS",
    "definition": "Case designated as having special national-security, intelligence, or law-enforcement interest.",
    "related_disposition_codes": ["WA/NTA", "HCA", "DTNR", "TOT"],
    "relation_notes": "Status flag rather than a classic immigration classification. Can drive heightened handling, criminal arrest (HCA), detainers, or turnover to other agencies (TOT)."
  },
  {
    "code": "USC",
    "term": "U.S. Citizen",
    "full_label": "U.S. Citizen",
    "category": "IMMIGRATION_STATUS",
    "definition": "A person who is a citizen of the United States (by birth or naturalization).",
    "related_disposition_codes": ["FBUSC", "NAR", "USC/PR"],
    "relation_notes": "Directly corresponds to dispositions FBUSC (foreign-born USC finding), NAR (not amenable), and USC/PR (citizen prosecutions). Citizens are not removable under the INA."
  },
  {
    "code": "VWR",
    "term": "VWPP Refusal",
    "full_label": "VWPP Refusal",
    "category": "IMMIGRATION_STATUS",
    "definition": "Refusal of admission or removal under the Visa Waiver Pilot Program / Visa Waiver Program.",
    "related_disposition_codes": ["VWPRM", "VWP/GM", "V"],
    "relation_notes": "Status that aligns with VWP Removal dispositions (VWPRM, VWP/GM) and sometimes Voluntary Return (V)."
  }
];

// Helper functions
function getDispositionByCode(code) {
  return EARM_DISPOSITION_DICTIONARY.find((d) => d.code === code) || null;
}

function getStatusByCode(code) {
  return IMMIGRATION_STATUS_DICTIONARY.find((s) => s.code === code) || null;
}

function getRelatedStatusesForDisposition(dispositionCode) {
  const d = getDispositionByCode(dispositionCode);
  if (!d) return [];
  return d.related_status_codes.map(getStatusByCode).filter(Boolean);
}

function getRelatedDispositionsForStatus(statusCode) {
  const s = getStatusByCode(statusCode);
  if (!s) return [];
  return s.related_disposition_codes.map(getDispositionByCode).filter(Boolean);
}

function dictionarySummary() {
  return {
    categories: DICTIONARY_CATEGORIES,
    dispositionCount: EARM_DISPOSITION_DICTIONARY.length,
    statusCount: IMMIGRATION_STATUS_DICTIONARY.length
  };
}
