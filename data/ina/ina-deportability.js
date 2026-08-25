// js/data/ina-deportability.js
// Grounds of Deportability under INA § 237(a) / 8 U.S.C. § 1227(a)
// Applies to aliens who have been admitted to the United States.
// Primary source: https://uscode.house.gov/view.xhtml?req=(title:8%20section:1227%20edition:prelim)

var DEPORTABILITY_GROUNDS = [
  // (1) Inadmissible at time of entry / status violations
  {
    "code": "237(a)(1)(A)",
    "short": "Inadmissible at entry/adjustment",
    "label": "Inadmissible at the time of entry or adjustment of status under the law then existing",
    "category": "STATUS",
    "notes": "Incorporates many 212 grounds as of the time of entry/adjustment",
    "source_url": "https://uscode.house.gov/view.xhtml?req=(title:8%20section:1227%20edition:prelim)"
  },
  {
    "code": "237(a)(1)(B)",
    "short": "Present in violation of law",
    "label": "Present in the United States in violation of this chapter or any other law, or whose nonimmigrant visa has been revoked",
    "category": "STATUS",
    "notes": "Classic overstay / unlawful presence after admission",
    "source_url": "https://uscode.house.gov/view.xhtml?req=(title:8%20section:1227%20edition:prelim)"
  },
  {
    "code": "237(a)(1)(C)",
    "short": "Violated nonimmigrant status / condition of entry",
    "label": "Violated nonimmigrant status or condition of entry",
    "category": "STATUS",
    "notes": "",
    "source_url": "https://uscode.house.gov/view.xhtml?req=(title:8%20section:1227%20edition:prelim)"
  },
  {
    "code": "237(a)(1)(D)",
    "short": "Termination of conditional permanent residence",
    "label": "Termination of conditional permanent residence",
    "category": "STATUS",
    "notes": "INA § 216 / 216A",
    "source_url": "https://uscode.house.gov/view.xhtml?req=(title:8%20section:1227%20edition:prelim)"
  },
  {
    "code": "237(a)(1)(E)",
    "short": "Smuggling (after admission)",
    "label": "Smuggling (knowingly encouraged, induced, assisted, abetted, or aided any other alien to enter unlawfully) – after admission",
    "category": "STATUS",
    "notes": "Waiver possible under 237(a)(1)(E)(iii) for certain family members",
    "source_url": "https://uscode.house.gov/view.xhtml?req=(title:8%20section:1227%20edition:prelim)"
  },
  {
    "code": "237(a)(1)(G)",
    "short": "Marriage fraud",
    "label": "Marriage fraud",
    "category": "STATUS",
    "notes": "",
    "source_url": "https://uscode.house.gov/view.xhtml?req=(title:8%20section:1227%20edition:prelim)"
  },
  {
    "code": "237(a)(1)(H)",
    "short": "Waiver for certain misrepresentations",
    "label": "Availability of waiver for certain fraud/misrepresentation at entry (cross-ref to 212(i))",
    "category": "STATUS",
    "notes": "Procedural provision",
    "source_url": "https://uscode.house.gov/view.xhtml?req=(title:8%20section:1227%20edition:prelim)"
  },

  // (2) Criminal offenses
  {
    "code": "237(a)(2)(A)(i)",
    "short": "CIMT (within 5/10 years)",
    "label": "Crime involving moral turpitude committed within 5 years after admission (10 years for certain LPRs) for which a sentence of 1 year or longer may be imposed",
    "category": "CRIMINAL",
    "notes": "Requires conviction",
    "source_url": "https://uscode.house.gov/view.xhtml?req=(title:8%20section:1227%20edition:prelim)"
  },
  {
    "code": "237(a)(2)(A)(ii)",
    "short": "Multiple CIMTs",
    "label": "Two or more crimes involving moral turpitude not arising out of a single scheme of criminal misconduct",
    "category": "CRIMINAL",
    "notes": "No time limit; requires convictions",
    "source_url": "https://uscode.house.gov/view.xhtml?req=(title:8%20section:1227%20edition:prelim)"
  },
  {
    "code": "237(a)(2)(A)(iii)",
    "short": "Aggravated felony",
    "label": "Aggravated felony at any time after admission",
    "category": "CRIMINAL",
    "notes": "Definition at INA § 101(a)(43). Extremely broad and consequential.",
    "source_url": "https://uscode.house.gov/view.xhtml?req=(title:8%20section:1227%20edition:prelim)"
  },
  {
    "code": "237(a)(2)(A)(iv)",
    "short": "High-speed flight",
    "label": "High-speed flight from an immigration checkpoint",
    "category": "CRIMINAL",
    "notes": "",
    "source_url": "https://uscode.house.gov/view.xhtml?req=(title:8%20section:1227%20edition:prelim)"
  },
  {
    "code": "237(a)(2)(A)(v)",
    "short": "Failure to register as sex offender",
    "label": "Failure to register as a sex offender (as defined in 18 U.S.C. § 2250)",
    "category": "CRIMINAL",
    "notes": "",
    "source_url": "https://uscode.house.gov/view.xhtml?req=(title:8%20section:1227%20edition:prelim)"
  },
  {
    "code": "237(a)(2)(A)(vi)",
    "short": "Waiver for certain CIMTs",
    "label": "Waiver availability for certain single CIMTs under 212(h)",
    "category": "CRIMINAL",
    "notes": "Procedural",
    "source_url": "https://uscode.house.gov/view.xhtml?req=(title:8%20section:1227%20edition:prelim)"
  },
  {
    "code": "237(a)(2)(B)",
    "short": "Controlled substances",
    "label": "Controlled substance conviction (any time after admission) or drug abuser/addict",
    "category": "CRIMINAL",
    "notes": "Exception for single offense of simple possession of 30g or less of marijuana",
    "source_url": "https://uscode.house.gov/view.xhtml?req=(title:8%20section:1227%20edition:prelim)"
  },
  {
    "code": "237(a)(2)(C)",
    "short": "Firearms offenses",
    "label": "Certain firearms offenses",
    "category": "CRIMINAL",
    "notes": "",
    "source_url": "https://uscode.house.gov/view.xhtml?req=(title:8%20section:1227%20edition:prelim)"
  },
  {
    "code": "237(a)(2)(D)",
    "short": "Miscellaneous crimes",
    "label": "Miscellaneous crimes (espionage, sabotage, treason, sedition, Selective Service violations, certain travel document crimes)",
    "category": "CRIMINAL",
    "notes": "",
    "source_url": "https://uscode.house.gov/view.xhtml?req=(title:8%20section:1227%20edition:prelim)"
  },
  {
    "code": "237(a)(2)(E)",
    "short": "Crimes of domestic violence, stalking, child abuse",
    "label": "Crimes of domestic violence, stalking, or child abuse, child neglect, or child abandonment; also violation of protection orders",
    "category": "CRIMINAL",
    "notes": "",
    "source_url": "https://uscode.house.gov/view.xhtml?req=(title:8%20section:1227%20edition:prelim)"
  },

  // (3) Failure to register / falsification
  {
    "code": "237(a)(3)(A)",
    "short": "Change of address / registration",
    "label": "Failure to notify of change of address or comply with registration requirements",
    "category": "REGISTRATION",
    "notes": "",
    "source_url": "https://uscode.house.gov/view.xhtml?req=(title:8%20section:1227%20edition:prelim)"
  },
  {
    "code": "237(a)(3)(B)",
    "short": "Document fraud conviction",
    "label": "Conviction for document fraud under INA § 274C",
    "category": "REGISTRATION",
    "notes": "",
    "source_url": "https://uscode.house.gov/view.xhtml?req=(title:8%20section:1227%20edition:prelim)"
  },
  {
    "code": "237(a)(3)(C)",
    "short": "False claim to citizenship",
    "label": "False claim of U.S. citizenship",
    "category": "REGISTRATION",
    "notes": "",
    "source_url": "https://uscode.house.gov/view.xhtml?req=(title:8%20section:1227%20edition:prelim)"
  },
  {
    "code": "237(a)(3)(D)",
    "short": "Falsely claiming citizenship for voting / benefits",
    "label": "Falsely claiming citizenship to vote or obtain benefits",
    "category": "REGISTRATION",
    "notes": "",
    "source_url": "https://uscode.house.gov/view.xhtml?req=(title:8%20section:1227%20edition:prelim)"
  },

  // (4) Security and related
  {
    "code": "237(a)(4)(A)",
    "short": "Security grounds (espionage, etc.)",
    "label": "Security and related grounds (espionage, sabotage, export control, sedition, etc.)",
    "category": "SECURITY",
    "notes": "",
    "source_url": "https://uscode.house.gov/view.xhtml?req=(title:8%20section:1227%20edition:prelim)"
  },
  {
    "code": "237(a)(4)(B)",
    "short": "Terrorist activities",
    "label": "Terrorist activities",
    "category": "SECURITY",
    "notes": "Incorporates 212(a)(3)(B) definitions",
    "source_url": "https://uscode.house.gov/view.xhtml?req=(title:8%20section:1227%20edition:prelim)"
  },
  {
    "code": "237(a)(4)(C)",
    "short": "Foreign policy",
    "label": "Foreign policy grounds",
    "category": "SECURITY",
    "notes": "",
    "source_url": "https://uscode.house.gov/view.xhtml?req=(title:8%20section:1227%20edition:prelim)"
  },
  {
    "code": "237(a)(4)(D)",
    "short": "Nazi / genocide / torture / extrajudicial killing",
    "label": "Assisted in Nazi persecution, genocide, torture, or extrajudicial killing",
    "category": "SECURITY",
    "notes": "",
    "source_url": "https://uscode.house.gov/view.xhtml?req=(title:8%20section:1227%20edition:prelim)"
  },
  {
    "code": "237(a)(4)(E)",
    "short": "Participant in genocide / recruitment of child soldiers",
    "label": "Participated in genocide or recruited/used child soldiers",
    "category": "SECURITY",
    "notes": "",
    "source_url": "https://uscode.house.gov/view.xhtml?req=(title:8%20section:1227%20edition:prelim)"
  },

  // (5) Public charge
  {
    "code": "237(a)(5)",
    "short": "Public charge (within 5 years)",
    "label": "Has become a public charge within 5 years after the date of entry from causes not affirmatively shown to have arisen since entry",
    "category": "PUBLIC_CHARGE",
    "notes": "Rarely charged in modern practice",
    "source_url": "https://uscode.house.gov/view.xhtml?req=(title:8%20section:1227%20edition:prelim)"
  },

  // (6) Unlawful voters
  {
    "code": "237(a)(6)",
    "short": "Unlawful voters",
    "label": "Unlawful voters",
    "category": "MISCELLANEOUS",
    "notes": "",
    "source_url": "https://uscode.house.gov/view.xhtml?req=(title:8%20section:1227%20edition:prelim)"
  }
];

function deportabilityLabels() {
  return DEPORTABILITY_GROUNDS.map((g) => g.code + " – " + g.short);
}
function deportabilityByCategory(category) {
  return DEPORTABILITY_GROUNDS.filter((g) => g.category === category);
}
