# Law Enforcement & Detention Data Library (Federal + Texas Focus)

Practical, COPDoc-compatible data libraries for federal and Texas law enforcement agencies, jails, detention facilities, public inmate/booking lookup resources, **and map locations**.

## Scope & Limitations

**What is included (high-value, usable core):**
- Core Federal LE agencies (DHS components including ICE ERO/HSI & CBP, DOJ components including FBI/DEA/ATF/USMS/BOP, plus key others)
- Texas State LE agencies (DPS/Rangers/Highway Patrol, TDCJ, TPWD Game Wardens, TABC, OAG, TCOLE, etc.)
- Major Texas city Police Departments (Houston, Dallas, San Antonio, Austin, Fort Worth, El Paso, and others)
- Texas county jails with public booking/inmate search links for high-volume counties
- ICE detention facilities in Texas (~18 key dedicated / contract facilities) linked to ERO AORs **with addresses and map links**
- ICE ERO Field Offices in Texas **with full street addresses, approximate coordinates, and Google Maps URLs**
- Statewide and system-level booking lookup tools (TDCJ, VINELink, ICE ODLS, BOP)

**Map / Location Data:**
- Priority facilities and offices include `address`, `city`, `state`, `zip`, and `map_url` (Google Maps search link).
- Approximate `lat` / `lng` provided for the five Texas ERO Field Offices.
- For other entries, use the provided `map_url` or geocode the address on demand.
- Full station-level geodata for every CBP Border Patrol station, every municipal PD precinct, and every small jail is not feasible in a single offline library. Expand using official directories + geocoding.

**What is intentionally limited:**
- Full list of ~1,200+ municipal police departments in Texas is not enumerated.
- All 254 county sheriffs are represented via the official directory pattern; detailed booking_url and address fields are populated for major counties. Expand as needed using https://txsheriffs.org/directory/
- Facility populations, contracts, and exact operational status change frequently — always verify with current ICE ODLS, field office, or sheriff for operational decisions.

## Files

| File | Contents |
|------|----------|
| `federal-le-agencies.js` | Core federal agencies (DHS, DOJ, others) with codes, parents, websites |
| `texas-state-le.js` | Texas state agencies including DPS components and TDCJ |
| `texas-jails.js` | Major county jails + statewide booking lookup tools + major city PDs |
| `detention-facilities.js` | ICE detention facilities in Texas with addresses + map_url + ODLS / BOP locator links |
| `ice-ero-offices-geo.js` | ICE ERO Field Offices in Texas with full addresses, approximate lat/lng, and Google Maps links |

## Key Public Lookup Links

- **ICE Detainee Locator (ODLS)**: https://locator.ice.gov/odls  
  (A-number **or** Name + DOB + Country of Birth)
- **TDCJ Inmate Search** (state prisons): https://inmate.tdcj.texas.gov/InmateSearch/
- **VINELink Texas** (many county jails + notifications): https://www.vinelink.com/
- **BOP Federal Inmate Locator**: https://www.bop.gov/inmateloc/
- **Texas Sheriff Directory (all 254 counties)**: https://txsheriffs.org/directory/
- **Dallas County Jail Lookup**: https://www.dallascounty.org/jaillookup/search.jsp
- **Harris County Inmate Info**: https://www.harriscountytx.gov/Residents/Law-Justice-Records/Inmate-Information
- **Tarrant County Inmate Search**: https://inmatesearch.tarrantcounty.com
- **Bexar County Justice Portal**: https://portal-txbexar.tylertech.cloud/Portal/

## ICE ERO Texas Field Offices (Map-ready)

| Code | Office | Address |
|------|--------|---------|
| DAL | Dallas | 8101 N. Stemmons Freeway, Dallas, TX 75247 |
| HOU | Houston | 126 Northpoint Drive, Houston, TX 77060 |
| SNA | San Antonio | 1777 NE Loop 410, Floor 15, San Antonio, TX 78217 |
| ELP | El Paso | 11541 Montana Avenue, Suite E, El Paso, TX 79936 |
| HLG | Harlingen | 1717 Zoy Street, Harlingen, TX 78552 |

See `ice-ero-offices-geo.js` for coordinates and map_url fields.

## Usage Notes for COPDoc / Field Operations

- Link detention facilities to ERO FIELD_OFFICES via the `aor` field.
- Use `map_url` for quick navigation or embedding in reports / I-213 support tools.
- Use `booking_url` + `search_notes` when documenting subject location or preparing detainers.
- For subjects in pure county custody (no ICE hold), use the county jail portal or VINELink.
- For ICE custody, prefer ODLS first, then contact the relevant ERO field office.

## Sources

- ICE public detention data and Online Detainee Locator System
- Texas Department of Criminal Justice
- Sheriffs' Association of Texas
- Texas DPS / TCOLE
- Official county sheriff websites and ICE field office pages
- Public directories (VisaVerge ICE facility lists, Houston Chronicle tracker, etc.) as of 2025–2026

**Disclaimer**: Public reference data only. Not an official government product. Verify all operational details and coordinates against current official sources before use in the field.
