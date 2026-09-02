# Records

Every record type uses **list → view → form**. Admin dashboard is the hub: counts and snapshots; add/edit on subpages.

## Navigation (end state)

- **List** — table. Primary: Add {record} (Cases: **Add case**).
- **View** — snapshot. Primary: Edit. Case view (`case.html`): Book-in, Issue I-200, Issue I-205 if **committed**. `lead.html?id=` redirects to `case.html?id=`. Associations tile (**0.58.0**): same live composer as the Card — type a name / plate / street, Enter, reuse or mint (`store.associateCaseObject`). Relationship dropdown. × drops the world fact (`dropAssociation`). A PERSON name jumps to `case.html?id=` when that person is the subject of another **committed** lead. A **Linked cases** line lists this subject’s other committed cases and committed cases that link this person. Drafts do not jump. Add / name click still opens the slide-over for notes / OTHER / **Open as new case** (`store.promoteAssociateToCase`) which mints a **working** lead for a PERSON associate (or reuses their existing lead). The row stays on `leads.html` (All / Leads / Targets / Detainees, by **stage**). Save on the form files it to Case view.
- **Form** — add (no id) or edit (`?id=`). Primary: Save (commit). Secondary: **Back to {origin}** (`committedAt` → view, else list).
- **Add** skips view.
- After **Save**, go to the record home (view if it exists; encounter form until a view exists). Satellite Book-in Save returns to the encounter.
- **Autosave** stays on the form URL; first draft `replaceState`s `?id=`.

Working (`draft`) rows → **form**. Filed (`committed`) rows → **view**. Cases list chips filter **stage** (`caseRole`): All · Leads · Targets · Detainees. Officers, vehicles, encounters, and investigations keep **Working** / **Filed**. Encounter **Target / Collateral** is `encounterRole`, not stage. Investigation workspace (`investigate.html?id=`) is the form; list **Open** / **Edit** both go there. The form body is an infinite **wall** (pan/zoom). Ingest (plates) is a **Plates** overlay; **Promote** / click (with a type selected) / Tab materializes objects on the wall. Click the selected Vehicle / Person / Location / Business / Entity chip again to stop placing (empty click then does not mint). Typed A6 edges associate them (`store.associations{}` is the world fact; the wall `links[]` cite `associationId`); **Spawn** peels a child web (shared object ids, copied `x,y`, same association ids). Parent/child walls draw hulls around shared objects (Venn overlap). Every node is the same Person / Vehicle / Location / Business / Entity object and identity card as the rest of the app (including photo/file and location address fields). Nodes on the wall are title chips; if the object has a photo, that photo is the chip face with the label. Selecting a node brightens it and its one-hop neighbors (focus-plex). **Edit** / double-click / Enter opens the **Card** window for that object; placing a new object also opens Card. The Card has **Associated**: pick Person / Vehicle / Location / Business / Entity, type a name or plate or street, Enter, reuse or mint, spawn, draw the relationship. × drops this wall’s citation. Off-wall people get **Place on wall**. **Objects** is a directory (Find, Hits, jump) you show or hide. **All** clears plex. **Find** filters the Objects list (plate, name, street, kind, VIN); Enter jumps to the first match. Matching wall chips stay bright; the rest dim. Plate-check **Hits** shows vehicles that came from the plate queue. Nothing is removed from the wall. Card **Remove from wall** (`store.removeInvestigationObject`) or keyboard Delete drops the focused chip from this investigation (links too). The shared record stays. **Junk** archives it (`junked`): off every wall, skipped by reuse; placing the same identity restores it. **Delete record** permanently drops an unreferenced object. Case subjects cannot be junked or deleted. Chrome **Clear all** (`store.clearInvestigationWorkspace`) empties this wall and plate queue after confirm; shared objects and child investigations stay. Chrome **Open as case** (`store.promoteInvestigationPersonToCase`) mints a **working** lead for the focused PERSON (same `personId`, identity only, no RAP, no wall-graph dump) or reuses their existing lead. The wall stays an investigation. See [investigation-wall-plan.md](investigation-wall-plan.md).

Case **Officer assigned to** (`assignedOfficerId`) is a search-select on the lead form. On Case view the officer’s name sticks at the top of Case history (does not scroll with notes). Click the name to assign or reassign in a dialog. That change is itself a history note. Shown on the Target sheet as **Targeting Officer**. History events created while assigned store `officerAlias` (initials + badge).

## Interim leads (until `leads.html` / view `lead.html`)

Today `lead.html` **is** the form. `ui.js` does not hydrate `?id=` (only File Open via `#savedLeadSelect`). `subjectId()` will mint a new `leadId` on a blank load.

Until the split:

- Save **stays on** `lead.html` (do **not** `location.href = "lead.html?id="` as if it were a view).
- Cancel is omitted.
- **Hydrate on load only when `?id=` is present** (`store.getLead`). Do **not** auto-load `currentLeadId` — that would reopen the last save on every visit to `lead.html` and fight File New.
- No `?id=` → blank form (today’s mint-new-ids path). `subjectId()` may create ids; they are not in the URL until the first successful draft `replaceState`s `lead.html?id=`.
- **File Open** (`#openLeadButton` + `#savedLeadSelect`): hydrate that snapshot **and** `replaceState` `lead.html?id={leadId}` (and `setCurrentLeadId`). Refresh then matches what you Opened.
- **File New** (`#newLeadButton`): mint new ids, clear `currentLeadId`, reset the form, **`replaceState` to `lead.html` with no query**. If New does not strip `?id=`, a refresh hydrates the previous lead and New looks broken.
- After the split, drop File New/Open (and this paragraph). Commit navigates to view `lead.html?id=`; Cancel follows the end-state rule.

## Draft vs committed

```
meta.status        "draft" | "committed"     // never reuse fleet vehicle.status
meta.committedAt   ISO of last successful Save, or ""
meta.createdAt / meta.updatedAt
```

Helpers and filters take `metaStatus` (or read `meta.status`). Do **not** name a list-filter argument `status` on vehicles.

| Writer | `meta.status` | Notes |
| --- | --- | --- |
| Autosave | `draft` (never upgrades) | Quiet skip: invalid phone / partial address / empty identity. No people-registry write. **Preserve `committedAt`.** |
| Save | `committed`, stamp `committedAt` | Loud. Failure: keep draft, stay, status message. Success: go to view (leads: stay until split). |
| Leave / Back | unchanged | Keep the draft. No confirm-on-leave. **Back to {origin}**: view if `committedAt`, else list. Query origin for satellites (Book-in / I-200 / baseball / I-213). Not `history.back()`. |

One object per id. First autosave of a committed record **demotes** `meta.status` to `draft` in place; `committedAt` stays. No twin snapshot.

Existing rows with no `meta.status` migrate as **committed** (`committedAt ← updatedAt`). Root fleet `status: "available"` is **not** meta.

`meta.markedComplete` stays unused (`false`).

### `collectLead` vs `saveLead`

`collectLead` today always returns `meta: { createdAt, updatedAt, markedComplete: false }` with **no** `status` / `committedAt`. Collect **does not own** those fields.

`saveLead(snapshot, { mode: "draft" | "commit" })`:

1. Load previous snapshot by `leadId` if present.
2. Merge collected fields onto it.
3. Set `meta.status` from `mode`.
4. On **draft**: keep previous `meta.committedAt`; set `updatedAt`.
5. On **commit**: `committedAt = updatedAt`.
6. `rememberPeople` on **every** save (draft and commit) so the subject exists in `people{}` immediately.
6. Never let collect’s blank `meta` win.

Test: autosave of a previously committed lead keeps `committedAt`.

Same preservation rule for officer/vehicle quiet saves in `admin.js`.

## View: photo card + documents

On **committed** views that have an owner id, paint the shared media widgets from [data-models.md](data-models.md) Media. Query `copdocx.media.v1` by owner. Do not hydrate blobs into `collectLead`.

| View | Owner passed to the widget |
| --- | --- |
| `case.html` (alias `lead.html`) | **One widget per object:** subject `PERSON` on the folder card, each case `VEHICLE`, each `LOCATION`. Photos attach to the object they depict, not the lead. |
| `officer.html` | `OFFICER` (portrait of that officer) |
| `vehicle.html` | `VEHICLE` (photos of that unit) |
| `encounter.html` (view, when it exists) / encounter form snapshot | Scene files on `ENCOUNTER`; people/cars/places use their own owners |
| `bookin.html` (until split) | Detainee photo → linked `PERSON` |
| `mobile-target-sheet.html` | `#targetPhoto` = person’s **primary** photo; left/right (click or swipe) walks that person’s photos. Location/vehicle strips from those owners. |

No location view page — location photos sit on that location’s card on the parent snapshot. Form **Add photo** on the vehicle card and on each location card writes `ownerType=VEHICLE|LOCATION&id=` (mint `dataset.entityId` on add). Lead view: click the photo (or empty card) to add/edit. No extra Add photo text on the view. One **Case map** shows every mapped person and vehicle location.

## List UX

Default **All**. Cases list sorts Lead, then Target, then Detainee, then `meta.updatedAt` desc. Other lists: working first, then filed by `meta.updatedAt` desc. Storage stays `meta.status` `draft` | `committed`.

**Save-shape PR (lists that already exist):** `paintTable` / `paintStats` / dashboard previews:

- Availability counts: `meta.status === "committed"` **and** officer `duty === "available"` / fleet `status === "available"`.
- Working badge on uncommitted rows (`textContent` **Working**).
- Working row action: **Edit** → `*-form.html?id=` (do not use dead `editButton()`).
- Filed row action: **View**.
- Keep **Remove** on officers/vehicles (already deletes; also clears shifts). No lead delete (`store.js` has none; do not add).
- Sort working first on officers/vehicles/encounters.
- Filter chips All · Working · Filed on officers/vehicles/encounters (`draft` / `committed`). Cases list All · **Leads** · **Targets** · **Detainees** (`lead` / `target` / `detainee` = `caseRole` stage).

Case list (`leads.html`, tab **Cases**) columns:

| Column | Source |
| --- | --- |
| Name | `formatPersonLabel(subject)` or “Untitled case”. Working badge if still a draft. |
| Stage | `caseRole` Lead / Target / Detainee. Issued I-200/I-205 counts as Target unless already Detainee. |
| Crim / non-crim | derived `isCriminal` (any conviction with an offense) → Crim / Non-crim |
| Immigration disposition | `person.immigration.disposition` via `IMMIGRATION_DISPOSITIONS` label |
| City | first `person.locations[].city`, else **—** |
| Vehicle | first vehicle plate · state; `+N` if more |
| FBI number | `person.criminal.fbiNumber` |
| A-Number | `person.immigration.alienNumber` |
| FINS | `person.immigration.finNumber` |

## Validation

- Autosave no-op when new officer has no name, new vehicle has no unit/plate/VIN/make, or phone/address validators fail. Quiet: no status line.
- Commit: same rules, always `#appBarStatus`. Empty leads are legal to commit.

## Export

Committed only. **Never** export via `collectLead()` of the dirty form. `downloadCurrentLead` / CSV: `store.getLead` + `meta.status === "committed"`, else no-op + status message. Historical `people{}` rows from today’s autosave stay; no purge.

## Shared helper

`functions/model/autosave.js` — `COPDoc.model.autosave.bind` / `.commit`. Lead (`ui.js`), officer **and vehicle** (`admin.js`). Vehicle focusout autosave ships with this helper (and vehicle-form File Save is removed in that same PR).

## Shift pickers

`paintPickers` today lists every officer/vehicle. After save-shape: **committed only**. Drafts are not assignable.

## Encounter (0.11.0)

No view yet. List `encounter.html` (`data-page="encounter"`). Form `encounter-form.html`.

- **Add encounter** mints `encounterId` immediately (draft `saveEncounter` + `replaceState ?id=`). The ID field is readonly.
- Commit requires `startedAt`, then **stays** on `encounter-form.html?id=` (the form is the home until a view exists).
- **Add subject** quiet-saves, then `bookin.html?encounterId=`. Banner shows the ID (not editable) and Back to encounter.
- Book-in with `?encounterId=` is a satellite: loud **Save** files a person + DETAINEE lead (`promoteBookInToLead`), writes `personId` / `leadId` on the packet and `encounter.subjects[]`, then returns to the encounter. **Add another subject** quiet-saves a named packet (does not file a lead) and blanks the form. **Load from leads** fills committed-lead fields that exist on Book-in (same map as 0.7.1; no middle name). Autosave does not file a case.
- Book-in **Target / Collateral** radios are this booking’s role on this encounter (`encounterRole` on the Book-in record and `encounter.subjects[]`). Load from leads defaults to Target. Required to Save when `?encounterId=` is set. Not the RAP `person.encounters[].encounterRole` card.
- Encounter form subjects table is Book-in records with this `encounterId`. **Edit** → `bookin.html?encounterId=&recordId=`. **×** clears `encounterId` (keeps the Book-in packet) and rebuilds `encounter.subjects[]`.
- Saved-records table with `?encounterId=` lists only subjects assigned to that encounter. Book-in Save/Delete writes `encounter.subjects[]`.
- **Generate I-213** (form, after subjects exist) → `narrative.html?encounterId=`. One primary I-213 per arrested subject; **Save I-213** writes `encounter.narratives[]` and `supervisorSummary`. Missing encounter ids do not fall back to training data. Section 10 **Include all other arrested** lists the other subjects’ disposition / health / meds / kids / cash.

Do not inline RAP person cards on the encounter form. Baseball card stays a Book-in action.

## Book-in prefill

Own packet store. Do not merge it into `leads{}`. Book-in is an express lead form: loud **Save** mints or reuses a person and files a committed lead with `caseRole: "DETAINEE"` (in custody). `?leadId=` / **Load from leads** overlays identity onto that case and promotes it to Detainee.

`bookin.html?leadId=` **always** `startNewRecord()` then prefill (page load is a fresh JS heap; do not branch on `activeRecordId`). If the lead is missing or `meta.status !== "committed"`, status error, leave the new blank form.

**Load from leads** is always on the Book-in action slot (not only `?encounterId=`). Same field map. No write until Save. After load, `replaceState` keeps `encounterId` if present and sets `leadId`.

Map **only fields that exist** on `bookin.html`: `#lastName`, `#firstName`, `#dateOfBirth`, `#sexMale`/`#sexFemale`, `#citizenship`, `#alienNumber`. **No `#middleName`** — do not invent it; drop middle (do not concatenate).

After prefill:

```
suppressAutoSave = true
→ fill fields
→ rememberFormSignature()
→ suppressAutoSave = false
```

Never `saveCurrentRecord` in this path. Manual check: book-in localStorage count unchanged until explicit Save.

Shifts are not a draft/commit type. Book-in `meta.status` is follow-on.

## File Import / Export

Workspace File **Import** / **Export** (`functions/transfer.js`). Export dialog: record types (Cases, Officers, Vehicles, Schedule, Book-in, Encounters), optional inclusive date range, JSON and/or CSV. Committed only for leads/officers/vehicles/encounters. JSON is `copdocx.transfer.v1` (`COPDoc_export_YYYYMMDD.json`). CSV is one flat file per type and is not imported.

Import: pick JSON → verify → summary (counts, already here / new) → everything or selected types → merge by id (skip exact duplicates, replace different data) → reload. Also accepts a lead-snapshot array and a Book-in `alien-book-in-records` backup.

## Baseball card

Book-in action. `openBaseballCard` calls `saveCurrentRecord` then opens `baseballcard.html?leadId=` (lead id copied from Book-in’s query). Prefill reads `store.getLead` first (canonical after lead Save), then the Book-in sessionStorage handoff for fields typed only on Book-in. Generate appends `person.immigration.baseballCards[]` and writes deportation dates, `saveLead` commit. No leadId: generate in the editor only.

## I-200 / I-205 issuance

Committed lead view only. `i200-form.html?id={leadId}` / `i205-form.html?id={leadId}`. Primary **Issue** fills `assets/pdf/I200_BLANK.pdf` or `I205_BLANK.pdf` with pdf-lib and **does not flatten** (AcroForm + empty `/Sig` widgets stay for last-minute edit and Adobe digital sign). File **Download PDF** is the same fill without writeback.

Issue always downloads `I-200_{LAST}_{FIRST}_{A#########}_{YYYYMMDD}.pdf` (or I-205). If File System Access is available, the first Issue asks for a warrants folder, persists the directory handle in IndexedDB, and also writes `warrants/{filename}`. Denied / unavailable → download only.

Then append `person.warrants[]` (`formType` I-200/I-205) and `saveLead` **commit**. Lead view **Warrants issued** lists those rows (form, date, file no, officer, filename). Criminal RAP warrant cards on the lead form are separate (`formType` empty).
