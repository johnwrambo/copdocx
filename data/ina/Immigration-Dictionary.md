# Immigration Terms Dictionary

**Focus:** EARM Processing Dispositions & Immigration Status  
**Purpose:** Operational reference for ERO / ICE field documentation, I-213 narratives, and case tracking.

---

## 1. Category Definitions

### EARM Processing Disposition
**Definition:** Operational outcome or action recorded in the Enforcement Alien Removal Module (EARM) (or successor systems) that describes **what happened** to a subject during or after an encounter, arrest, or case processing.  

**Focus:** The *processing result* (removed, returned, detained, turned over, not amenable, etc.).  

**Primary Use:** Case tracking, statistics, I-213 narrative, detention/removal workflow.

### Immigration Status
**Definition:** Classification of a person’s **legal immigration posture** under the Immigration and Nationality Act (INA) or related authorities.  

**Focus:** *Who the person is* in the eyes of the law (citizen, LPR, deportable, inadmissible, etc.).  

**Primary Use:** Charging decisions, eligibility for relief, amenability to removal, custody determinations.

---

## 2. How the Categories Relate

| Aspect | Explanation |
|--------|-------------|
| **Direction of influence** | Immigration Status is generally a *predicate* or *input* to Processing Disposition. A person’s status determines which dispositions are legally available. |
| **Outcome vs. Classification** | Processing Disposition is the *outcome* of enforcement action applied to a person of a given status. |
| **Status confirmation / change** | Some dispositions effectively *confirm or change* status (e.g., `FBUSC` or `USC/PR` confirm citizenship; `DN` reflects loss of citizenship). |
| **Legal availability** | Many dispositions are only possible for certain statuses:<br>• Removal-related dispositions (`ER`, `REINST`, `ADMDPT`, `VD`, `V`, etc.) generally require the person to be an alien who is removable (inadmissible or deportable).<br>• `NAR` / `FBUSC` / `USC` often appear when the subject is determined to be a citizen or otherwise not removable. |
| **Cross-cutting codes** | Operational codes (`NIC`, `TOT`, `B`, `DTNR`, `PD`) can apply across statuses but are most meaningful in the context of aliens in proceedings or custody. |

**Simple rule of thumb:**  
> Status tells you **who** the person is.  
> Disposition tells you **what was done** with them.

---

## 3. EARM Processing Disposition Dictionary

| Code | Term | Definition | Typically Related Status Codes | Relationship Notes |
|------|------|------------|--------------------------------|--------------------|
| **ADMDPT** | Administrative Deportation | Administrative removal of a non-LPR convicted of an aggravated felony (INA § 238(b)). Form I-851/I-851A. | `D`, `IA` | Used for deportable or inadmissible aliens who meet aggravated-felony criteria. Not available for LPRs in the same streamlined way. |
| **B** | Bag and Baggage | Operational status: alien is ready for physical removal (travel documents obtained, arrangements complete). | `D`, `IA` | Logistical readiness marker that usually follows a final order for a removable alien. |
| **CRW99R** | Crew Member Removal | Removal of an alien crewman under special crew provisions of the INA. | `IA`, `D` | Applies to nonimmigrant crewmen who are inadmissible or have violated status. |
| **DTNR** | Detainer | Immigration detainer requesting notification of release or transfer of custody (INA § 287 / 8 C.F.R. § 287.7). | `D`, `IA`, `LPR` | Can be lodged against removable aliens and, in limited cases, deportable LPRs. Not itself a removal order. |
| **ER** | Expedited Removal | Summary removal under INA § 235(b)(1). Form I-860. | `IA`, `EX` | Primary tool for inadmissible (or historically excludable) arriving aliens. |
| **ER/CF** | Expedited Removal w/ Credible Fear | Expedited removal in which the alien claimed fear and was referred for a credible-fear interview. | `IA` | Same IA population as ER; records that a fear claim was raised and screened. |
| **ER/CFF** | Expedited Removal w/ Credible Fear – Full Scope | Variant of ER/CF under full-scope procedures. | `IA` | Operational variant of ER/CF. |
| **ERF** | Expedited Removal – Full Scope | Expedited removal under expanded (full-scope) application of § 235(b)(1). | `IA`, `EX` | Same legal target population as ER. |
| **FBUSC** | Foreign-Born U.S. Citizen | Subject determined to be a U.S. citizen (foreign-born). Not amenable to removal. | `USC` | Direct operational finding that the person is a citizen. |
| **HCA** | HSI Criminal Arrest | Arrest by Homeland Security Investigations on criminal charges. | `D`, `IA`, `LPR`, `USC` | Can involve any status; immigration consequences determined separately. |
| **NAR** | Not Amenable to Removal | Subject is not amenable to removal under the INA. | `USC`, `N`, `NEX` | Often pairs with citizenship or non-deportable / not-excludable findings. |
| **NIC** | Not in Custody | Subject is not in ICE/ERO custody at the time of the update. | `D`, `IA`, `LPR`, `N` | Custody status; most relevant when tracking at-large removable aliens. |
| **P** | Paroled | Alien paroled into the United States under INA § 212(d)(5). Parole is **not** an admission. | `IA` | Frequently granted to individuals who would otherwise be inadmissible. |
| **PD** | Prosecutorial Discretion | Decision not to pursue or to terminate enforcement / removal proceedings. | `D`, `IA`, `LPR` | Most often exercised toward removable aliens or LPRs in proceedings. Does not change underlying status. |
| **REINRF** | Reinstatement w/ Reasonable Fear | Reinstatement of a prior removal order (INA § 241(a)(5)) where fear was claimed and a reasonable-fear interview was conducted. | `D`, `IA` | For previously removed aliens who re-entered illegally and are again removable. |
| **REINST** | Reinstatement of Removal | Reinstatement of a prior order of removal after illegal reentry (Form I-871). | `D`, `IA` | Classic disposition for previously removed aliens again present without admission. |
| **STOW** | Stowaway | Removal of a stowaway (inadmissible under § 212(a)(6)(D); special procedures under § 235). | `IA`, `EX` | Stowaways are a subset of inadmissible / historically excludable aliens. |
| **T** | Other | Catch-all disposition not covered by a more specific code. | — | Requires narrative explanation; can apply to any status. |
| **TOT** | Turned Over To | Subject turned over to another agency (federal, state, or local). | `D`, `IA`, `LPR`, `USC` | Custody-transfer status; common when a removable alien is also wanted by another agency. |
| **USC/PR** | USC Prosecutions | Case involving prosecution of a U.S. citizen. | `USC` | Tied to U.S. Citizen status. Not an immigration removal disposition. |
| **V** | Voluntary Return | Voluntary return (often at or near the border). Distinct from formal Voluntary Departure. | `IA`, `EX` | Frequently used for inadmissible or arriving aliens who withdraw an application for admission. |
| **VD** | Voluntary Departure | Formal Voluntary Departure under INA § 240B in lieu of an order of removal. | `D`, `IA` | Available to certain removable aliens who meet statutory criteria. |
| **VWP/GM** | VWP Removal (Guam-CNMI) | Removal of a Visa Waiver Program entrant in the Guam-CNMI context (INA § 217). | `IA`, `VWR` | Closely related to VWPP Refusal status. |
| **VWPRM** | VWP Removal | Removal of an alien admitted under the Visa Waiver Program. | `IA`, `VWR` | Same relationship as VWP/GM. |
| **WA/NTA** | Warrant of Arrest / Notice to Appear | Issuance of WA and/or NTA commencing full removal proceedings (INA §§ 239 & 287). | `D`, `IA`, `LPR` | Standard charging vehicle for removable aliens and for LPRs placed into proceedings. |
| **WD/T42** | Title 42 Withdrawal | Withdrawal / expulsion under Title 42 public-health authority (COVID-era). **Not** an INA removal. | `IA` | Applied primarily to arriving aliens who would otherwise be processed as inadmissible. |

---

## 4. Immigration Status Dictionary

| Code | Term | Definition | Typically Related Disposition Codes | Relationship Notes |
|------|------|------------|-------------------------------------|--------------------|
| **AW** | Application Withdrawn | An application for an immigration benefit or for admission has been withdrawn. | `V`, `WD/T42`, `P` | Often pairs with Voluntary Return or Title 42 withdrawal; may also relate to parole. |
| **DN** | DeNaturalized | Naturalized U.S. citizenship has been revoked. | `WA/NTA`, `REINST`, `ADMDPT` | After denaturalization the person reverts to alien status and may become subject to removal dispositions. |
| **D** | Deportable | Alien who has been **admitted** and is subject to removal under INA § 237 grounds of deportability. | `WA/NTA`, `VD`, `REINST`, `ADMDPT`, `DTNR`, `B` | Enables most post-admission removal dispositions. |
| **EX** | Excludable | Historical term (pre-IIRIRA) for an alien seeking admission who was ineligible; largely superseded by “inadmissible.” | `ER`, `ERF`, `V`, `STOW` | Maps closely to modern `IA`. |
| **IA** | Inadmissible Alien | Alien ineligible to be admitted under one or more grounds in INA § 212(a). | `ER`, `ER/CF`, `ERF`, `V`, `REINST`, `STOW`, `VWPRM`, `P`, `WA/NTA` | Primary status for arriving or present-without-admission aliens. |
| **LPR** | Legal Permanent Resident | Alien lawfully accorded the privilege of residing permanently in the United States. | `WA/NTA`, `VD`, `DTNR`, `PD`, `NAR` | Can be placed in proceedings if deportable; may receive VD or PD; detainers possible. |
| **N** | Non-Deportable Alien | Alien who is not subject to the grounds of deportability (or for whom deportability cannot be established). | `NAR`, `PD`, `NIC` | Often results in NAR or prosecutorial discretion. |
| **NEX** | Not Excludable | Historical counterpart to Non-Deportable; person not subject to exclusion grounds. | `NAR` | Legacy status that typically pairs with NAR. |
| **SIC** | Special Interest Case | Case designated as having special national-security, intelligence, or law-enforcement interest. | `WA/NTA`, `HCA`, `DTNR`, `TOT` | Status *flag* rather than classic immigration classification; drives heightened handling. |
| **USC** | U.S. Citizen | Person who is a citizen of the United States (by birth or naturalization). | `FBUSC`, `NAR`, `USC/PR` | Citizens are not removable under the INA. |
| **VWR** | VWPP Refusal | Refusal of admission or removal under the Visa Waiver Program. | `VWPRM`, `VWP/GM`, `V` | Aligns with VWP Removal dispositions. |

---

## 5. Quick Cross-Reference Examples

| If the person is… | Common processing dispositions you may see |
|-------------------|--------------------------------------------|
| **IA** (Inadmissible) | `ER`, `ER/CF`, `V`, `REINST`, `STOW`, `P`, `VWPRM`, `WA/NTA` |
| **D** (Deportable) | `WA/NTA`, `VD`, `REINST`, `ADMDPT`, `DTNR`, `B` |
| **LPR** | `WA/NTA` (if deportable), `VD`, `DTNR`, `PD`, `NAR` |
| **USC** | `FBUSC`, `NAR`, `USC/PR` |
| **VWR** | `VWPRM`, `VWP/GM`, `V` |

| If the disposition is… | The person was most likely… |
|------------------------|-----------------------------|
| `ER` / `ERF` / `ER/CF` | `IA` or historically `EX` |
| `REINST` / `REINRF` | Previously removed alien now treated as `D` or `IA` |
| `ADMDPT` | Non-LPR aggravated felon (`D` or `IA`) |
| `VD` | Removable alien (`D` or `IA`) who qualified for voluntary departure |
| `FBUSC` or `NAR` | `USC` (or other non-removable status) |
| `V` | Often `IA` / arriving alien |

---

## 6. Source Notes

- EARM disposition codes are system codes used in ICE enforcement databases.
- Immigration Status codes reflect legal classifications under the INA (and some legacy/historical terms).
- Statutory anchors for major dispositions appear in the companion file `earm-disposition-map.js` (INA § 235, § 238(b), § 240B, § 241(a)(5), § 212(d)(5), § 217, § 287, etc.).
- This dictionary is an operational reference aid, **not** a substitute for the official U.S. Code, regulations, or legal advice.

---

*Generated for field-operations / documentation use. Verify against current statute, regulation, and agency guidance.*
