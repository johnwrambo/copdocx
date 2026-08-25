// js/data/ina-inadmissibility.js
// Grounds of Inadmissibility under INA § 212(a) / 8 U.S.C. § 1182(a)
// Structured for operational use (I-213 narratives, charging documents, FOW).
// Source: Official U.S. Code + USCIS Policy Manual.
// Primary link: https://uscode.house.gov/view.xhtml?req=(title:8%20section:1182%20edition:prelim)

var INADMISSIBILITY_GROUNDS = [
  // (1) Health-related
  {
    "code": "212(a)(1)(A)(i)",
    "short": "Communicable disease",
    "label": "Communicable disease of public health significance",
    "category": "HEALTH",
    "waivable": true,
    "waiver_notes": "INA § 212(g) possible in certain cases",
    "source_url": "https://uscode.house.gov/view.xhtml?req=(title:8%20section:1182%20edition:prelim)"
  },
  {
    "code": "212(a)(1)(A)(ii)",
    "short": "Vaccination",
    "label": "Failure to present documentation of required vaccinations (immigrants / adjustment)",
    "category": "HEALTH",
    "waivable": true,
    "waiver_notes": "INA § 212(g)(2) – medical, religious, or moral conviction",
    "source_url": "https://uscode.house.gov/view.xhtml?req=(title:8%20section:1182%20edition:prelim)"
  },
  {
    "code": "212(a)(1)(A)(iii)",
    "short": "Physical/mental disorder",
    "label": "Physical or mental disorder with associated harmful behavior",
    "category": "HEALTH",
    "waivable": true,
    "waiver_notes": "INA § 212(g)",
    "source_url": "https://uscode.house.gov/view.xhtml?req=(title:8%20section:1182%20edition:prelim)"
  },
  {
    "code": "212(a)(1)(A)(iv)",
    "short": "Drug abuser/addict",
    "label": "Drug abuser or addict",
    "category": "HEALTH",
    "waivable": false,
    "waiver_notes": "Generally not waivable for immigrants",
    "source_url": "https://uscode.house.gov/view.xhtml?req=(title:8%20section:1182%20edition:prelim)"
  },

  // (2) Criminal
  {
    "code": "212(a)(2)(A)(i)(I)",
    "short": "CIMT",
    "label": "Crime involving moral turpitude (CIMT) – conviction, admission, or acts constituting essential elements",
    "category": "CRIMINAL",
    "waivable": true,
    "waiver_notes": "INA § 212(h) in limited cases; petty offense and youth exceptions exist",
    "source_url": "https://uscode.house.gov/view.xhtml?req=(title:8%20section:1182%20edition:prelim)"
  },
  {
    "code": "212(a)(2)(A)(i)(II)",
    "short": "Controlled substance",
    "label": "Controlled substance violation (conviction, admission, or acts)",
    "category": "CRIMINAL",
    "waivable": "limited",
    "waiver_notes": "Very limited; simple possession of <30g marijuana may have options",
    "source_url": "https://uscode.house.gov/view.xhtml?req=(title:8%20section:1182%20edition:prelim)"
  },
  {
    "code": "212(a)(2)(B)",
    "short": "Multiple convictions",
    "label": "Multiple criminal convictions with aggregate sentence of 5+ years",
    "category": "CRIMINAL",
    "waivable": true,
    "waiver_notes": "INA § 212(h) possible in some cases",
    "source_url": "https://uscode.house.gov/view.xhtml?req=(title:8%20section:1182%20edition:prelim)"
  },
  {
    "code": "212(a)(2)(C)",
    "short": "Drug trafficking",
    "label": "Controlled substance trafficker (reason to believe) – includes certain family members who benefited",
    "category": "CRIMINAL",
    "waivable": false,
    "waiver_notes": "Generally non-waivable",
    "source_url": "https://uscode.house.gov/view.xhtml?req=(title:8%20section:1182%20edition:prelim)"
  },
  {
    "code": "212(a)(2)(D)",
    "short": "Prostitution / commercialized vice",
    "label": "Prostitution or commercialized vice (engaging, procuring, or receiving proceeds within 10 years)",
    "category": "CRIMINAL",
    "waivable": true,
    "waiver_notes": "INA § 212(h)",
    "source_url": "https://uscode.house.gov/view.xhtml?req=(title:8%20section:1182%20edition:prelim)"
  },
  {
    "code": "212(a)(2)(E)",
    "short": "Serious criminal activity + immunity",
    "label": "Serious criminal activity in the U.S. for which immunity from prosecution was asserted",
    "category": "CRIMINAL",
    "waivable": false,
    "waiver_notes": "",
    "source_url": "https://uscode.house.gov/view.xhtml?req=(title:8%20section:1182%20edition:prelim)"
  },
  {
    "code": "212(a)(2)(G)",
    "short": "Foreign government officials – religious freedom",
    "label": "Foreign government officials who have committed particularly severe violations of religious freedom",
    "category": "CRIMINAL",
    "waivable": false,
    "waiver_notes": "",
    "source_url": "https://uscode.house.gov/view.xhtml?req=(title:8%20section:1182%20edition:prelim)"
  },
  {
    "code": "212(a)(2)(H)",
    "short": "Human trafficking",
    "label": "Significant traffickers in persons (and certain family members who benefited)",
    "category": "CRIMINAL",
    "waivable": false,
    "waiver_notes": "",
    "source_url": "https://uscode.house.gov/view.xhtml?req=(title:8%20section:1182%20edition:prelim)"
  },
  {
    "code": "212(a)(2)(I)",
    "short": "Money laundering",
    "label": "Money laundering (reason to believe)",
    "category": "CRIMINAL",
    "waivable": false,
    "waiver_notes": "",
    "source_url": "https://uscode.house.gov/view.xhtml?req=(title:8%20section:1182%20edition:prelim)"
  },

  // (3) Security
  {
    "code": "212(a)(3)(A)",
    "short": "Espionage / sabotage / export control",
    "label": "Espionage, sabotage, or prohibited export of goods/technology/sensitive information",
    "category": "SECURITY",
    "waivable": false,
    "waiver_notes": "",
    "source_url": "https://uscode.house.gov/view.xhtml?req=(title:8%20section:1182%20edition:prelim)"
  },
  {
    "code": "212(a)(3)(B)",
    "short": "Terrorist activities",
    "label": "Terrorist activities, including membership in terrorist organizations and material support",
    "category": "SECURITY",
    "waivable": "limited",
    "waiver_notes": "Very limited exemptions/waivers; see INA § 212(d)(3)(B)",
    "source_url": "https://uscode.house.gov/view.xhtml?req=(title:8%20section:1182%20edition:prelim)"
  },
  {
    "code": "212(a)(3)(C)",
    "short": "Foreign policy",
    "label": "Foreign policy grounds (Secretary of State determination)",
    "category": "SECURITY",
    "waivable": false,
    "waiver_notes": "",
    "source_url": "https://uscode.house.gov/view.xhtml?req=(title:8%20section:1182%20edition:prelim)"
  },
  {
    "code": "212(a)(3)(D)",
    "short": "Communist / totalitarian party",
    "label": "Membership in or affiliation with the Communist or any other totalitarian party",
    "category": "SECURITY",
    "waivable": true,
    "waiver_notes": "Exceptions and waiver available under INA § 212(a)(3)(D)",
    "source_url": "https://uscode.house.gov/view.xhtml?req=(title:8%20section:1182%20edition:prelim)"
  },
  {
    "code": "212(a)(3)(E)",
    "short": "Nazi / genocide / torture / extrajudicial killing",
    "label": "Participants in Nazi persecution, genocide, acts of torture, or extrajudicial killings",
    "category": "SECURITY",
    "waivable": false,
    "waiver_notes": "",
    "source_url": "https://uscode.house.gov/view.xhtml?req=(title:8%20section:1182%20edition:prelim)"
  },
  {
    "code": "212(a)(3)(F)",
    "short": "Association with terrorist organizations",
    "label": "Association with a terrorist organization",
    "category": "SECURITY",
    "waivable": "limited",
    "waiver_notes": "",
    "source_url": "https://uscode.house.gov/view.xhtml?req=(title:8%20section:1182%20edition:prelim)"
  },
  {
    "code": "212(a)(3)(G)",
    "short": "Recruitment or use of child soldiers",
    "label": "Recruitment or use of child soldiers",
    "category": "SECURITY",
    "waivable": false,
    "waiver_notes": "",
    "source_url": "https://uscode.house.gov/view.xhtml?req=(title:8%20section:1182%20edition:prelim)"
  },

  // (4) Public charge
  {
    "code": "212(a)(4)",
    "short": "Public charge",
    "label": "Likely at any time to become a public charge",
    "category": "PUBLIC_CHARGE",
    "waivable": true,
    "waiver_notes": "Affidavit of support (I-864) or other evidence; certain classes exempt",
    "source_url": "https://uscode.house.gov/view.xhtml?req=(title:8%20section:1182%20edition:prelim)"
  },

  // (5) Labor
  {
    "code": "212(a)(5)",
    "short": "Labor certification / qualifications",
    "label": "Labor certification and qualifications for certain immigrants",
    "category": "LABOR",
    "waivable": false,
    "waiver_notes": "Primarily for employment-based immigrants",
    "source_url": "https://uscode.house.gov/view.xhtml?req=(title:8%20section:1182%20edition:prelim)"
  },

  // (6) Illegal entrants and immigration violators
  {
    "code": "212(a)(6)(A)",
    "short": "Present without admission or parole",
    "label": "Alien present in the United States without being admitted or paroled, or who arrives at undesignated time/place",
    "category": "IMMIGRATION_VIOLATION",
    "waivable": "limited",
    "waiver_notes": "Certain exceptions; not generally waivable for adjustment in most cases",
    "source_url": "https://uscode.house.gov/view.xhtml?req=(title:8%20section:1182%20edition:prelim)"
  },
  {
    "code": "212(a)(6)(B)",
    "short": "Failure to attend removal proceeding",
    "label": "Failure to attend or remain in attendance at removal proceeding without reasonable cause",
    "category": "IMMIGRATION_VIOLATION",
    "waivable": false,
    "waiver_notes": "5-year bar",
    "source_url": "https://uscode.house.gov/view.xhtml?req=(title:8%20section:1182%20edition:prelim)"
  },
  {
    "code": "212(a)(6)(C)(i)",
    "short": "Fraud / willful misrepresentation",
    "label": "Fraud or willful misrepresentation of a material fact to procure a visa, other documentation, admission, or other benefit",
    "category": "IMMIGRATION_VIOLATION",
    "waivable": true,
    "waiver_notes": "INA § 212(i) – extreme hardship to USC/LPR spouse or parent",
    "source_url": "https://uscode.house.gov/view.xhtml?req=(title:8%20section:1182%20edition:prelim)"
  },
  {
    "code": "212(a)(6)(C)(ii)",
    "short": "False claim to U.S. citizenship",
    "label": "False claim to U.S. citizenship (on or after Sept 30, 1996)",
    "category": "IMMIGRATION_VIOLATION",
    "waivable": false,
    "waiver_notes": "Generally permanent bar; very limited exceptions",
    "source_url": "https://uscode.house.gov/view.xhtml?req=(title:8%20section:1182%20edition:prelim)"
  },
  {
    "code": "212(a)(6)(D)",
    "short": "Stowaways",
    "label": "Stowaways",
    "category": "IMMIGRATION_VIOLATION",
    "waivable": false,
    "waiver_notes": "",
    "source_url": "https://uscode.house.gov/view.xhtml?req=(title:8%20section:1182%20edition:prelim)"
  },
  {
    "code": "212(a)(6)(E)",
    "short": "Smugglers",
    "label": "Smugglers (knowingly encouraged, induced, assisted, abetted, or aided any other alien to enter or try to enter unlawfully)",
    "category": "IMMIGRATION_VIOLATION",
    "waivable": true,
    "waiver_notes": "INA § 212(d)(11) limited family waiver",
    "source_url": "https://uscode.house.gov/view.xhtml?req=(title:8%20section:1182%20edition:prelim)"
  },
  {
    "code": "212(a)(6)(F)",
    "short": "Subject of civil penalty",
    "label": "Subject of a final order for civil document fraud penalty under INA § 274C",
    "category": "IMMIGRATION_VIOLATION",
    "waivable": true,
    "waiver_notes": "Limited",
    "source_url": "https://uscode.house.gov/view.xhtml?req=(title:8%20section:1182%20edition:prelim)"
  },
  {
    "code": "212(a)(6)(G)",
    "short": "Student visa abusers",
    "label": "Student visa abusers",
    "category": "IMMIGRATION_VIOLATION",
    "waivable": false,
    "waiver_notes": "5-year bar",
    "source_url": "https://uscode.house.gov/view.xhtml?req=(title:8%20section:1182%20edition:prelim)"
  },

  // (7) Documentation
  {
    "code": "212(a)(7)(A)",
    "short": "Immigrant documentation",
    "label": "Immigrant not in possession of valid unexpired immigrant visa, reentry permit, border crossing card, or other valid entry document + passport",
    "category": "DOCUMENTATION",
    "waivable": true,
    "waiver_notes": "Limited waivers under INA § 212(k) etc.",
    "source_url": "https://uscode.house.gov/view.xhtml?req=(title:8%20section:1182%20edition:prelim)"
  },
  {
    "code": "212(a)(7)(B)",
    "short": "Nonimmigrant documentation",
    "label": "Nonimmigrant not in possession of valid nonimmigrant visa or border crossing identification card + passport",
    "category": "DOCUMENTATION",
    "waivable": true,
    "waiver_notes": "INA § 212(d)(4)",
    "source_url": "https://uscode.house.gov/view.xhtml?req=(title:8%20section:1182%20edition:prelim)"
  },

  // (8) Ineligible for citizenship
  {
    "code": "212(a)(8)",
    "short": "Ineligible for citizenship",
    "label": "Immigrant permanently ineligible to citizenship or who departed to avoid military service",
    "category": "CITIZENSHIP",
    "waivable": false,
    "waiver_notes": "",
    "source_url": "https://uscode.house.gov/view.xhtml?req=(title:8%20section:1182%20edition:prelim)"
  },

  // (9) Aliens previously removed
  {
    "code": "212(a)(9)(A)",
    "short": "Previously removed",
    "label": "Aliens previously removed (arriving aliens or other aliens) – 5/10/20-year or permanent bars depending on circumstances",
    "category": "PRIOR_REMOVAL",
    "waivable": true,
    "waiver_notes": "Consent to reapply (Form I-212) available",
    "source_url": "https://uscode.house.gov/view.xhtml?req=(title:8%20section:1182%20edition:prelim)"
  },
  {
    "code": "212(a)(9)(B)",
    "short": "Unlawful presence (3/10-year bar)",
    "label": "Unlawful presence – more than 180 days (3-year bar) or 1 year+ (10-year bar) after departure",
    "category": "PRIOR_REMOVAL",
    "waivable": true,
    "waiver_notes": "INA § 212(a)(9)(B)(v) – extreme hardship to USC/LPR spouse or parent",
    "source_url": "https://www.uscis.gov/laws-and-policy/other-resources/unlawful-presence-and-inadmissibility"
  },
  {
    "code": "212(a)(9)(C)",
    "short": "Permanent bar (unlawful presence + reentry)",
    "label": "Unlawfully present >1 year aggregate or ordered removed, then enters or attempts to reenter without being admitted – permanent bar",
    "category": "PRIOR_REMOVAL",
    "waivable": true,
    "waiver_notes": "Consent to reapply after 10 years outside U.S. (I-212); limited exceptions",
    "source_url": "https://www.uscis.gov/laws-and-policy/other-resources/unlawful-presence-and-inadmissibility"
  },

  // (10) Miscellaneous
  {
    "code": "212(a)(10)(A)",
    "short": "Polygamists",
    "label": "Practicing polygamists",
    "category": "MISCELLANEOUS",
    "waivable": false,
    "waiver_notes": "",
    "source_url": "https://uscode.house.gov/view.xhtml?req=(title:8%20section:1182%20edition:prelim)"
  },
  {
    "code": "212(a)(10)(C)",
    "short": "International child abduction",
    "label": "International child abductors and certain relatives",
    "category": "MISCELLANEOUS",
    "waivable": false,
    "waiver_notes": "",
    "source_url": "https://uscode.house.gov/view.xhtml?req=(title:8%20section:1182%20edition:prelim)"
  },
  {
    "code": "212(a)(10)(D)",
    "short": "Unlawful voters",
    "label": "Unlawful voters",
    "category": "MISCELLANEOUS",
    "waivable": false,
    "waiver_notes": "Limited exceptions",
    "source_url": "https://uscode.house.gov/view.xhtml?req=(title:8%20section:1182%20edition:prelim)"
  },
  {
    "code": "212(a)(10)(E)",
    "short": "Former citizens who renounced for tax avoidance",
    "label": "Former citizens who renounced citizenship to avoid taxation",
    "category": "MISCELLANEOUS",
    "waivable": false,
    "waiver_notes": "",
    "source_url": "https://uscode.house.gov/view.xhtml?req=(title:8%20section:1182%20edition:prelim)"
  }
];

function inadmissibilityLabels() {
  return INADMISSIBILITY_GROUNDS.map((g) => g.code + " – " + g.short);
}
function inadmissibilityByCategory(category) {
  return INADMISSIBILITY_GROUNDS.filter((g) => g.category === category);
}
