# Law Enforcement Data Library (Federal + Texas)

Agencies, offices, jails, detention, and public lookup tools used by Referring Agency search and related forms.

## What belongs where

| File | Kind | Contents |
| --- | --- | --- |
| `federal-le-agencies.js` | agency | Parent federal agencies (DHS, ICE, CBP, FBI, …) |
| `texas-state-le.js` | agency | Statewide Texas agencies (DPS, TDCJ, TPWD, TABC, …) |
| `texas-sheriffs.js` | agency | All **254** Texas county sheriffs |
| `texas-municipal-pd.js` | agency | Large-city and border municipal PDs (~110, not all 1,200+) |
| `texas-other-local-le.js` | agency | Major ISD, campus, airport, and transit police |
| `texas-federal-offices.js` | office | Texas USBP sectors, FBI FOs, HSI SACs |
| `ice-ero-offices-geo.js` | office | Five Texas ERO field offices (address + map) |
| `texas-jails.js` | facility | County jails with booking URLs, linked via `sheriffCode` |
| `detention-facilities.js` | facility | ICE/contract detention in Texas |
| `le-lookups.js` | tool | TDCJ / VINELink / ODLS / BOP locators |
| `le-catalog.js` | index | Builds `LAW_ENFORCEMENT_AGENCIES` for search |

Referring Agency search loads **agencies + offices** only. Jails and detention are facilities; inmate locators are tools.

## Agency record shape

```js
{
  code: "TX_SO_HARRIS",
  label: "Harris County Sheriff's Office",
  level: "federal | state | county | municipal | isd | campus | airport | transit",
  type: "sheriff | police | agency | component | sector | field_office | …",
  parent: "ICE",
  state: "TX",
  county: "Harris",
  city: "Houston",
  aliases: ["HCSO", "Harris SO"],
  active: true
}
```

## Coverage (honest)

**Included**
- Core federal parent agencies
- Texas state LE
- Every Texas sheriff (254)
- Municipal PDs for large metros + border cities
- Selected ISD / campus / airport / transit agencies
- USBP sectors and FBI/HSI offices in Texas
- ERO field offices with maps
- High-volume county jails (booking URLs where known)

**Still not a full TCOLE roster**
- Remaining ~1,000+ small municipal PDs
- Constable precincts
- Most ISD and campus departments
- ERO sub-offices / CAP teams

Sheriff directory for verification: https://txsheriffs.org/directory/

## Load order

Federal → state → sheriffs → municipal PDs → other local → federal offices → jails → lookups → ERO geo → `le-catalog.js` → `functions/le-search.js`

## Sources

Public directories only (ICE, TDCJ, TCOLE, Sheriffs’ Association of Texas, city sites). Not an official government product. Verify operational details before field use.
