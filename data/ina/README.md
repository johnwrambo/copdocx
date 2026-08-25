# INA Immigration Law Data Library

Structured JavaScript data library derived from the **Immigration and Nationality Act (INA)** for operational use (e.g., I-213 narratives, charging documents, field reference, training).

## Files

| File | Contents |
|------|----------|
| `ina-sources.js` | Official source links + key INA section index |
| `ina-definitions.js` | Core statutory definitions (alien, admission, aggravated felony, CIMT, refugee, conviction, unlawful presence, etc.) |
| `ina-inadmissibility.js` | Grounds of inadmissibility under INA § 212(a) / 8 U.S.C. § 1182(a) – health, criminal, security, public charge, immigration violations, documentation, prior removal bars |
| `ina-deportability.js` | Grounds of deportability under INA § 237(a) / 8 U.S.C. § 1227(a) – status, criminal, registration, security, public charge |
| `ina-relief-and-procedures.js` | Forms of relief (asylum, withholding, CAT, cancellation, voluntary departure, adjustment, TPS, waivers) + key removal procedures (expedited removal, reinstatement, NTA, detention) + enforcement authorities (287(a), 287(g)) |

## Design Notes

- Each entry includes the INA citation, 8 U.S.C. citation where applicable, short code, human-readable label, category, waiver notes (where relevant), and a direct source URL.
- Focus is on **enforcement-relevant** provisions most useful for ERO / ICE field operations and documentation.
- This is a **reference aid**, not a substitute for the official U.S. Code or legal advice. Always verify against the current official text.

## Primary Official Sources

- **Official U.S. Code (House)**: https://uscode.house.gov/view.xhtml?path=/prelim@title8/chapter12&edition=prelim
- **Cornell LII**: https://www.law.cornell.edu/uscode/text/8
- **USCIS INA table**: https://www.uscis.gov/laws-and-policy/legislation/immigration-and-nationality-act
- **eCFR Title 8**: https://www.ecfr.gov/current/title-8
- **USCIS Policy Manual**: https://www.uscis.gov/policy-manual
- **Unlawful Presence guidance**: https://www.uscis.gov/laws-and-policy/other-resources/unlawful-presence-and-inadmissibility

## Usage

```js
// Example
eval(fs.readFileSync("ina-inadmissibility.js", "utf8"));
console.log(INADMISSIBILITY_GROUNDS.filter(g => g.category === "CRIMINAL"));
```

Helpers are provided in each file (`*Labels()`, `*ByCategory()`, etc.).

## Disclaimer

This library is for informational and operational reference purposes only. Immigration law is complex and fact-specific. Consult the current official U.S. Code, regulations, and qualified counsel for legal determinations.
