// js/data/ina-relief-and-procedures.js
// Key forms of relief, removal procedures, and related authorities.
// Cross-referenced to INA / 8 U.S.C.

var RELIEF_FORMS = [
  {
    "code": "ASYLUM",
    "ina": "208",
    "usc": "8 U.S.C. § 1158",
    "label": "Asylum",
    "description": "Discretionary relief for those who meet the refugee definition and are not barred.",
    "source_url": "https://uscode.house.gov/view.xhtml?req=(title:8%20section:1158%20edition:prelim)"
  },
  {
    "code": "WITHHOLDING",
    "ina": "241(b)(3)",
    "usc": "8 U.S.C. § 1231(b)(3)",
    "label": "Withholding of Removal",
    "description": "Mandatory protection if more likely than not the alien's life or freedom would be threatened on a protected ground. Higher standard than asylum; no path to LPR.",
    "source_url": "https://uscode.house.gov/view.xhtml?req=(title:8%20section:1231%20edition:prelim)"
  },
  {
    "code": "CAT",
    "ina": "Convention Against Torture (regulations)",
    "usc": "8 C.F.R. §§ 1208.16–18",
    "label": "Convention Against Torture (CAT) Protection",
    "description": "Protection from removal to a country where it is more likely than not the alien would be tortured. Withholding or deferral of removal.",
    "source_url": "https://www.ecfr.gov/current/title-8/chapter-V/subchapter-B/part-1208"
  },
  {
    "code": "CANCELLATION_LPR",
    "ina": "240A(a)",
    "usc": "8 U.S.C. § 1229b(a)",
    "label": "Cancellation of Removal for Certain Permanent Residents",
    "description": "LPR for 5+ years, continuous residence 7+ years after lawful admission, no aggravated felony.",
    "source_url": "https://uscode.house.gov/view.xhtml?req=(title:8%20section:1229b%20edition:prelim)"
  },
  {
    "code": "CANCELLATION_NONLPR",
    "ina": "240A(b)",
    "usc": "8 U.S.C. § 1229b(b)",
    "label": "Cancellation of Removal for Certain Nonpermanent Residents",
    "description": "10 years continuous physical presence, good moral character, exceptional and extremely unusual hardship to USC/LPR spouse, parent, or child; no disqualifying crimes.",
    "source_url": "https://uscode.house.gov/view.xhtml?req=(title:8%20section:1229b%20edition:prelim)"
  },
  {
    "code": "VOLUNTARY_DEPARTURE",
    "ina": "240B",
    "usc": "8 U.S.C. § 1229c",
    "label": "Voluntary Departure",
    "description": "Permission to depart at own expense in lieu of an order of removal. Pre- or post-conclusion forms available under different standards.",
    "source_url": "https://uscode.house.gov/view.xhtml?req=(title:8%20section:1229c%20edition:prelim)"
  },
  {
    "code": "ADJUSTMENT",
    "ina": "245",
    "usc": "8 U.S.C. § 1255",
    "label": "Adjustment of Status",
    "description": "Adjustment to LPR status while in the United States (if eligible and visa available).",
    "source_url": "https://uscode.house.gov/view.xhtml?req=(title:8%20section:1255%20edition:prelim)"
  },
  {
    "code": "TPS",
    "ina": "244",
    "usc": "8 U.S.C. § 1254a",
    "label": "Temporary Protected Status",
    "description": "Temporary protection from removal and work authorization for nationals of designated countries.",
    "source_url": "https://uscode.house.gov/view.xhtml?req=(title:8%20section:1254a%20edition:prelim)"
  },
  {
    "code": "REGISTRY",
    "ina": "249",
    "usc": "8 U.S.C. § 1259",
    "label": "Registry",
    "description": "Creation of a record of lawful admission for permanent residence for certain long-term residents who entered prior to January 1, 1972.",
    "source_url": "https://uscode.house.gov/view.xhtml?req=(title:8%20section:1259%20edition:prelim)"
  },
  {
    "code": "WAIVER_212h",
    "ina": "212(h)",
    "usc": "8 U.S.C. § 1182(h)",
    "label": "Waiver of Certain Criminal Grounds (212(h))",
    "description": "Waiver of certain 212(a)(2) criminal grounds for immigrants in limited circumstances.",
    "source_url": "https://uscode.house.gov/view.xhtml?req=(title:8%20section:1182%20edition:prelim)"
  },
  {
    "code": "WAIVER_212i",
    "ina": "212(i)",
    "usc": "8 U.S.C. § 1182(i)",
    "label": "Waiver of Fraud/Misrepresentation (212(i))",
    "description": "Waiver of 212(a)(6)(C)(i) for extreme hardship to USC or LPR spouse or parent.",
    "source_url": "https://uscode.house.gov/view.xhtml?req=(title:8%20section:1182%20edition:prelim)"
  },
  {
    "code": "CONSENT_TO_REAPPLY",
    "ina": "212(a)(9)(A)(iii) / 212(a)(9)(C)(ii)",
    "usc": "8 U.S.C. § 1182(a)(9)",
    "label": "Consent to Reapply for Admission (I-212)",
    "description": "Permission to reapply after a removal order or permanent bar.",
    "source_url": "https://uscode.house.gov/view.xhtml?req=(title:8%20section:1182%20edition:prelim)"
  }
];

var REMOVAL_PROCEDURES = [
  {
    "code": "EXPEDITED_REMOVAL",
    "ina": "235(b)(1)",
    "usc": "8 U.S.C. § 1225(b)(1)",
    "label": "Expedited Removal",
    "description": "Summary removal of certain arriving aliens or those who have not been admitted/paroled and cannot show continuous physical presence for 2 years (expanded authority). Credible fear screening required for asylum claims.",
    "source_url": "https://uscode.house.gov/view.xhtml?req=(title:8%20section:1225%20edition:prelim)"
  },
  {
    "code": "ADMINISTRATIVE_REMOVAL",
    "ina": "238(b)",
    "usc": "8 U.S.C. § 1228(b)",
    "label": "Administrative Removal (Aggravated Felons)",
    "description": "Expedited administrative removal for non-LPRs convicted of aggravated felonies.",
    "source_url": "https://uscode.house.gov/view.xhtml?req=(title:8%20section:1228%20edition:prelim)"
  },
  {
    "code": "REINSTATEMENT",
    "ina": "241(a)(5)",
    "usc": "8 U.S.C. § 1231(a)(5)",
    "label": "Reinstatement of Removal",
    "description": "Prior removal order is reinstated if the alien reentered illegally. Limited review; withholding/CAT still available.",
    "source_url": "https://uscode.house.gov/view.xhtml?req=(title:8%20section:1231%20edition:prelim)"
  },
  {
    "code": "NTA",
    "ina": "239",
    "usc": "8 U.S.C. § 1229",
    "label": "Notice to Appear (NTA)",
    "description": "Document that initiates removal proceedings under INA § 240. Must contain specific required information.",
    "source_url": "https://uscode.house.gov/view.xhtml?req=(title:8%20section:1229%20edition:prelim)"
  },
  {
    "code": "IJ_HEARING",
    "ina": "240",
    "usc": "8 U.S.C. § 1229a",
    "label": "Removal Hearing before Immigration Judge",
    "description": "Full removal proceedings. Government bears burden on charges of deportability; alien bears burden on relief applications in most cases.",
    "source_url": "https://uscode.house.gov/view.xhtml?req=(title:8%20section:1229a%20edition:prelim)"
  },
  {
    "code": "DETENTION",
    "ina": "236",
    "usc": "8 U.S.C. § 1226",
    "label": "Detention Pending Removal Proceedings",
    "description": "Discretionary detention under 236(a); mandatory detention under 236(c) for certain criminal aliens.",
    "source_url": "https://uscode.house.gov/view.xhtml?req=(title:8%20section:1226%20edition:prelim)"
  },
  {
    "code": "POST_ORDER_DETENTION",
    "ina": "241(a)",
    "usc": "8 U.S.C. § 1231(a)",
    "label": "Detention After Final Order of Removal",
    "description": "90-day removal period; continued detention if removal is not reasonably foreseeable (Zadvydas limits apply).",
    "source_url": "https://uscode.house.gov/view.xhtml?req=(title:8%20section:1231%20edition:prelim)"
  }
];

var ENFORCEMENT_AUTHORITIES = [
  {
    "code": "287(a)",
    "ina": "287(a)",
    "usc": "8 U.S.C. § 1357(a)",
    "label": "Powers of immigration officers",
    "description": "Authority to interrogate any alien as to right to be/remain; arrest without warrant for immigration violations in officer's presence or for felonies; board and search conveyances; access private lands within 25 miles of external boundary for patrol; etc.",
    "source_url": "https://uscode.house.gov/view.xhtml?req=(title:8%20section:1357%20edition:prelim)"
  },
  {
    "code": "287(g)",
    "ina": "287(g)",
    "usc": "8 U.S.C. § 1357(g)",
    "label": "287(g) Agreements",
    "description": "Delegation of certain immigration enforcement functions to state/local officers under MOA with DHS.",
    "source_url": "https://uscode.house.gov/view.xhtml?req=(title:8%20section:1357%20edition:prelim)"
  }
];

function reliefLabels() {
  return RELIEF_FORMS.map((r) => r.label);
}
function procedureLabels() {
  return REMOVAL_PROCEDURES.map((p) => p.label);
}
