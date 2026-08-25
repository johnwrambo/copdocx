// js/data/ina-definitions.js
// Key statutory definitions from INA § 101 / 8 U.S.C. § 1101
// Primary source: https://uscode.house.gov/view.xhtml?req=(title:8%20section:1101%20edition:prelim)

var INA_DEFINITIONS = [
  {
    "term": "Alien",
    "code": "101(a)(3)",
    "usc": "8 U.S.C. § 1101(a)(3)",
    "definition": "Any person not a citizen or national of the United States.",
    "source_url": "https://uscode.house.gov/view.xhtml?req=(title:8%20section:1101%20edition:prelim)"
  },
  {
    "term": "Immigrant",
    "code": "101(a)(15)",
    "usc": "8 U.S.C. § 1101(a)(15)",
    "definition": "Every alien except an alien who is within one of the classes of nonimmigrant aliens listed in the statute.",
    "source_url": "https://uscode.house.gov/view.xhtml?req=(title:8%20section:1101%20edition:prelim)"
  },
  {
    "term": "Admission / Admitted",
    "code": "101(a)(13)",
    "usc": "8 U.S.C. § 1101(a)(13)",
    "definition": "The lawful entry of the alien into the United States after inspection and authorization by an immigration officer. Important distinctions for LPRs returning from brief trips.",
    "source_url": "https://uscode.house.gov/view.xhtml?req=(title:8%20section:1101%20edition:prelim)"
  },
  {
    "term": "Aggravated Felony",
    "code": "101(a)(43)",
    "usc": "8 U.S.C. § 1101(a)(43)",
    "definition": "Extensive list of offenses (murder, rape, sexual abuse of a minor, drug trafficking, certain firearms offenses, theft/burglary with 1+ year sentence, fraud with loss >$10k, crimes of violence with 1+ year sentence, obstruction of justice, etc.). Definition applies regardless of date of conviction for most immigration purposes after 1996.",
    "source_url": "https://uscode.house.gov/view.xhtml?req=(title:8%20section:1101%20edition:prelim)"
  },
  {
    "term": "Crime Involving Moral Turpitude (CIMT)",
    "code": "Referenced throughout 212 & 237",
    "usc": "Case law + INA",
    "definition": "Not exhaustively defined in the statute. Generally involves conduct that is inherently base, vile, or depraved, and contrary to the accepted rules of morality. Determined by categorical approach looking at the elements of the statute of conviction.",
    "source_url": "https://uscode.house.gov/view.xhtml?req=(title:8%20section:1182%20edition:prelim)"
  },
  {
    "term": "Refugee",
    "code": "101(a)(42)",
    "usc": "8 U.S.C. § 1101(a)(42)",
    "definition": "Any person who is outside any country of such person's nationality (or last habitual residence if no nationality) and is unable or unwilling to return because of persecution or a well-founded fear of persecution on account of race, religion, nationality, membership in a particular social group, or political opinion. Includes certain persons within their country in special circumstances.",
    "source_url": "https://uscode.house.gov/view.xhtml?req=(title:8%20section:1101%20edition:prelim)"
  },
  {
    "term": "Conviction",
    "code": "101(a)(48)",
    "usc": "8 U.S.C. § 1101(a)(48)",
    "definition": "Formal judgment of guilt entered by a court, or if adjudication withheld, where a judge or jury has found the alien guilty or the alien has entered a plea of guilty/nolo or admitted sufficient facts, and the judge has ordered some form of punishment, penalty, or restraint on liberty. Includes certain state expungements for immigration purposes.",
    "source_url": "https://uscode.house.gov/view.xhtml?req=(title:8%20section:1101%20edition:prelim)"
  },
  {
    "term": "National of the United States",
    "code": "101(a)(22)",
    "usc": "8 U.S.C. § 1101(a)(22)",
    "definition": "A citizen of the United States, or a person who, though not a citizen, owes permanent allegiance to the United States (primarily certain residents of American Samoa and Swains Island).",
    "source_url": "https://uscode.house.gov/view.xhtml?req=(title:8%20section:1101%20edition:prelim)"
  },
  {
    "term": "Unlawful Presence",
    "code": "212(a)(9)(B)(ii)",
    "usc": "8 U.S.C. § 1182(a)(9)(B)(ii)",
    "definition": "Presence in the United States after the expiration of the period of stay authorized by the Secretary of Homeland Security, or presence without being admitted or paroled. Accrual rules and exceptions are complex (minors, asylees, etc.).",
    "source_url": "https://www.uscis.gov/laws-and-policy/other-resources/unlawful-presence-and-inadmissibility"
  }
];

function definitionTerms() {
  return INA_DEFINITIONS.map((d) => d.term);
}
