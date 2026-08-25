// js/data/earm-disposition-map.js
// Mapping of EARM Processing Disposition Types to specific INA / 8 U.S.C. sections
// and related legal authorities.
//
// Notes:
// - Some codes are pure operational/system statuses and do not map to a single charging section.
// - Form numbers (I-860, I-871, I-851, etc.) are the operational forms used to execute the authority.
// - Always verify against current statute, regulations, and agency guidance.

var EARM_DISPOSITION_MAP = [
  {
    "code": "ADMDPT",
    "label": "Administrative Deportation I-851/I-851A",
    "ina": "238(b)",
    "usc": "8 U.S.C. § 1228(b)",
    "description": "Administrative removal of non-LPRs convicted of aggravated felonies. Form I-851 / I-851A.",
    "category": "REMOVAL",
    "notes": "Limited hearing rights. Also see definition of aggravated felony at INA § 101(a)(43).",
    "source_url": "https://uscode.house.gov/view.xhtml?req=(title:8%20section:1228%20edition:prelim)"
  },
  {
    "code": "B",
    "label": "Bag and Baggage",
    "ina": null,
    "usc": null,
    "description": "Operational status indicating the alien is ready for physical removal (travel documents obtained, final arrangements made).",
    "category": "OPERATIONAL",
    "notes": "Not a legal disposition under a specific INA section. Indicates logistical readiness for removal under an existing order.",
    "source_url": null
  },
  {
    "code": "CRW99R",
    "label": "Crew Member (I-99) Removal",
    "ina": "252 / 253 / 254",
    "usc": "8 U.S.C. §§ 1282–1284",
    "description": "Removal of alien crewmen under special crew provisions (often using Form I-99 related processes historically).",
    "category": "REMOVAL",
    "notes": "Crewmen have distinct statutory treatment regarding conditional permits and deportation.",
    "source_url": "https://uscode.house.gov/view.xhtml?path=/prelim@title8/chapter12/subchapter2/part6&edition=prelim"
  },
  {
    "code": "DTNR",
    "label": "Detainer",
    "ina": "287",
    "usc": "8 U.S.C. § 1357",
    "description": "Immigration detainer issued to another law enforcement agency requesting notification or transfer of custody.",
    "category": "ENFORCEMENT",
    "notes": "Authority derived from general enforcement powers in INA § 287 and implementing regulations (8 C.F.R. § 287.7). Not itself a removal order.",
    "source_url": "https://uscode.house.gov/view.xhtml?req=(title:8%20section:1357%20edition:prelim)"
  },
  {
    "code": "ER",
    "label": "Expedited Removal (I-860)",
    "ina": "235(b)(1)",
    "usc": "8 U.S.C. § 1225(b)(1)",
    "description": "Expedited removal of certain inadmissible arriving aliens or those who have not been admitted/paroled. Form I-860.",
    "category": "REMOVAL",
    "notes": "Core expedited removal authority. Credible fear screening required if asylum/fear claimed.",
    "source_url": "https://uscode.house.gov/view.xhtml?req=(title:8%20section:1225%20edition:prelim)"
  },
  {
    "code": "ER/CF",
    "label": "Expedited Removal with Credible Fear",
    "ina": "235(b)(1)(B)",
    "usc": "8 U.S.C. § 1225(b)(1)(B)",
    "description": "Expedited removal process in which the alien claimed fear and was referred for a credible fear interview.",
    "category": "REMOVAL",
    "notes": "If credible fear is found, the case is generally referred to full INA § 240 proceedings.",
    "source_url": "https://uscode.house.gov/view.xhtml?req=(title:8%20section:1225%20edition:prelim)"
  },
  {
    "code": "ER/CFF",
    "label": "Expedited Removal with Credible Fear - Full Scope",
    "ina": "235(b)(1)(B)",
    "usc": "8 U.S.C. § 1225(b)(1)(B)",
    "description": "Variant of expedited removal involving credible fear determination under full-scope procedures.",
    "category": "REMOVAL",
    "notes": "Operational variant of the credible fear process under the same statutory authority.",
    "source_url": "https://uscode.house.gov/view.xhtml?req=(title:8%20section:1225%20edition:prelim)"
  },
  {
    "code": "ERF",
    "label": "Expedited Removal (I-860) - Full Scope",
    "ina": "235(b)(1)",
    "usc": "8 U.S.C. § 1225(b)(1)",
    "description": "Expedited removal under full-scope application of the authority (expanded geographic/temporal application).",
    "category": "REMOVAL",
    "notes": "Same statutory authority as ER; 'Full Scope' refers to the expanded use authorized by DHS.",
    "source_url": "https://uscode.house.gov/view.xhtml?req=(title:8%20section:1225%20edition:prelim)"
  },
  {
    "code": "FBUSC",
    "label": "Foreign Born USC",
    "ina": null,
    "usc": null,
    "description": "Subject determined to be a U.S. citizen (foreign-born). Not amenable to removal.",
    "category": "STATUS",
    "notes": "Citizenship is defined in the INA and related nationality statutes. Not a removal disposition.",
    "source_url": null
  },
  {
    "code": "HCA",
    "label": "HSI Criminal Arrest",
    "ina": "287 / Title 18",
    "usc": "8 U.S.C. § 1357 + criminal statutes",
    "description": "Arrest by Homeland Security Investigations on criminal (non-purely administrative) charges.",
    "category": "ENFORCEMENT",
    "notes": "Primarily criminal authority; immigration consequences may follow separately.",
    "source_url": "https://uscode.house.gov/view.xhtml?req=(title:8%20section:1357%20edition:prelim)"
  },
  {
    "code": "NAR",
    "label": "Not Amenable to Removal",
    "ina": null,
    "usc": null,
    "description": "Subject is not amenable to removal under the INA (e.g., USC, certain diplomatic status, or other legal bar).",
    "category": "STATUS",
    "notes": "Operational conclusion rather than a charging disposition.",
    "source_url": null
  },
  {
    "code": "NIC",
    "label": "Not in Custody",
    "ina": null,
    "usc": null,
    "description": "Subject is not in ICE/ERO custody at the time of the disposition update.",
    "category": "OPERATIONAL",
    "notes": "Custody status, not a legal removal disposition.",
    "source_url": null
  },
  {
    "code": "P",
    "label": "Paroled",
    "ina": "212(d)(5)",
    "usc": "8 U.S.C. § 1182(d)(5)",
    "description": "Alien paroled into the United States under the Attorney General / Secretary’s discretionary parole authority.",
    "category": "STATUS",
    "notes": "Parole is not an admission. See also humanitarian and public benefit parole policies.",
    "source_url": "https://uscode.house.gov/view.xhtml?req=(title:8%20section:1182%20edition:prelim)"
  },
  {
    "code": "PD",
    "label": "Prosecutorial Discretion",
    "ina": null,
    "usc": null,
    "description": "Exercise of prosecutorial discretion not to pursue or to terminate removal proceedings / enforcement action.",
    "category": "OPERATIONAL",
    "notes": "Authority flows from the Executive’s general enforcement discretion; not a specific INA charging section. Often documented via memoranda.",
    "source_url": null
  },
  {
    "code": "REINRF",
    "label": "Reinstatement of Deportation Reasonable Fear",
    "ina": "241(a)(5)",
    "usc": "8 U.S.C. § 1231(a)(5)",
    "description": "Reinstatement of a prior removal order where the alien has expressed fear and is referred for a reasonable fear interview.",
    "category": "REMOVAL",
    "notes": "Reinstatement itself is under 241(a)(5). Reasonable fear process is regulatory (8 C.F.R. § 208.31) and can lead to withholding/CAT withholding.",
    "source_url": "https://uscode.house.gov/view.xhtml?req=(title:8%20section:1231%20edition:prelim)"
  },
  {
    "code": "REINST",
    "label": "Reinstatement of Deport Order I-871",
    "ina": "241(a)(5)",
    "usc": "8 U.S.C. § 1231(a)(5)",
    "description": "Reinstatement of a prior order of removal after illegal reentry. Form I-871.",
    "category": "REMOVAL",
    "notes": "Prior order is reinstated from its original date. Limited judicial review. Withholding/CAT still available after reasonable fear process if claimed.",
    "source_url": "https://uscode.house.gov/view.xhtml?req=(title:8%20section:1231%20edition:prelim)"
  },
  {
    "code": "STOW",
    "label": "Stowaway",
    "ina": "235 / 212(a)(6)(D)",
    "usc": "8 U.S.C. §§ 1225, 1182(a)(6)(D)",
    "description": "Removal of a stowaway. Stowaways are inadmissible under 212(a)(6)(D) and subject to special procedures under 235.",
    "category": "REMOVAL",
    "notes": "Stowaways generally do not receive a full 240 hearing; limited procedures apply.",
    "source_url": "https://uscode.house.gov/view.xhtml?req=(title:8%20section:1225%20edition:prelim)"
  },
  {
    "code": "T",
    "label": "Other",
    "ina": null,
    "usc": null,
    "description": "Catch-all / other disposition not covered by a more specific code.",
    "category": "OPERATIONAL",
    "notes": "Requires narrative explanation in the record.",
    "source_url": null
  },
  {
    "code": "TOT",
    "label": "Turned Over To",
    "ina": null,
    "usc": null,
    "description": "Subject turned over to another agency (federal, state, or local).",
    "category": "OPERATIONAL",
    "notes": "Custody transfer status, not a removal order under the INA.",
    "source_url": null
  },
  {
    "code": "USC/PR",
    "label": "USC Prosecutions",
    "ina": null,
    "usc": "Title 18 / other criminal statutes",
    "description": "Case involving prosecution of a U.S. citizen (or related criminal prosecution activity).",
    "category": "ENFORCEMENT",
    "notes": "Not an immigration removal disposition.",
    "source_url": null
  },
  {
    "code": "V",
    "label": "Voluntary Return",
    "ina": "Related to 235 / withdrawal of application",
    "usc": "8 U.S.C. § 1225 (related)",
    "description": "Voluntary return (often at the border or near-border). Distinct from formal Voluntary Departure under 240B.",
    "category": "REMOVAL",
    "notes": "Frequently used by CBP. May involve withdrawal of an application for admission. Not the same as IJ-granted Voluntary Departure (VD).",
    "source_url": "https://uscode.house.gov/view.xhtml?req=(title:8%20section:1225%20edition:prelim)"
  },
  {
    "code": "VD",
    "label": "Voluntary Departure",
    "ina": "240B",
    "usc": "8 U.S.C. § 1229c",
    "description": "Formal Voluntary Departure granted in lieu of an order of removal (pre-conclusion or post-conclusion).",
    "category": "REMOVAL",
    "notes": "Statutory voluntary departure under INA § 240B. Different legal consequences from a simple Voluntary Return (V).",
    "source_url": "https://uscode.house.gov/view.xhtml?req=(title:8%20section:1229c%20edition:prelim)"
  },
  {
    "code": "VWP/GM",
    "label": "VWP Removal (GUAM-CNMI)",
    "ina": "217",
    "usc": "8 U.S.C. § 1187",
    "description": "Removal of a Visa Waiver Program entrant in the Guam-CNMI context.",
    "category": "REMOVAL",
    "notes": "VWP entrants waive rights to contest removal except for asylum/withholding/CAT. Special rules apply in Guam/CNMI.",
    "source_url": "https://uscode.house.gov/view.xhtml?req=(title:8%20section:1187%20edition:prelim)"
  },
  {
    "code": "VWPRM",
    "label": "VWP Removal",
    "ina": "217",
    "usc": "8 U.S.C. § 1187",
    "description": "Removal of an alien admitted under the Visa Waiver Program.",
    "category": "REMOVAL",
    "notes": "VWP applicants waive the right to contest removal other than through asylum/withholding/CAT claims.",
    "source_url": "https://uscode.house.gov/view.xhtml?req=(title:8%20section:1187%20edition:prelim)"
  },
  {
    "code": "WA/NTA",
    "label": "Warrant of Arrest/Notice to Appear",
    "ina": "239 + 287",
    "usc": "8 U.S.C. §§ 1229, 1357",
    "description": "Issuance of Warrant of Arrest and/or Notice to Appear commencing full removal proceedings under INA § 240.",
    "category": "REMOVAL",
    "notes": "NTA is the charging document under INA § 239. Arrest authority under INA § 287.",
    "source_url": "https://uscode.house.gov/view.xhtml?req=(title:8%20section:1229%20edition:prelim)"
  },
  {
    "code": "WD/T42",
    "label": "Withdrawal (WD-Title 42)",
    "ina": null,
    "usc": "42 U.S.C. (public health authority)",
    "description": "Withdrawal / expulsion under Title 42 public health authority (used extensively during COVID-19).",
    "category": "OTHER_AUTHORITY",
    "notes": "Title 42 is not part of the INA. This was a public-health-based expulsion authority, not a classic INA removal.",
    "source_url": null
  }
];

function earmDispositionLabels() {
  return EARM_DISPOSITION_MAP.map((d) => d.code + " – " + d.label);
}

function earmByCategory(category) {
  return EARM_DISPOSITION_MAP.filter((d) => d.category === category);
}

function earmWithINA() {
  return EARM_DISPOSITION_MAP.filter((d) => d.ina !== null);
}
