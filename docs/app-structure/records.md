# Records

Every record type uses **list → view → form**. Admin dashboard is the hub: counts and snapshots; add/edit on subpages.

## Navigation (end state)

- **List** — table. Primary: Add {record} (Cases: **Add case**).
- **View** — snapshot. Primary: Edit. Case view (`case.html`): Book-in, Issue I-200, Issue I-205 if **committed**. `lead.html?id=` redirects to `case.html?id=`. Associations **Add** opens the slide-over: choose Person / Vehicle / Location / Business / Entity, choose an existing object or “Create new,” complete the standard object card, then choose the relationship. **Cancel** writes nothing; **Apply** saves and stays open; **Save & Close** saves then closes. `store.associateCaseObject` writes one canonical object/association and a Case citation. Editing preserves the `associationId`; × drops the world fact and its unsupported Case projection while keeping the object. A PERSON name jumps to `case.html?id=` when that person is the subject of another **committed** lead. **Open as new case** mints a **working** lead for a PERSON associate (or reuses their existing lead). A **Linked cases** line lists this subject’s other committed cases and committed cases that link this person. Drafts do not jump. See [object-workflow-audit.md](object-workflow-audit.md).
- **Form** — add (no id) or edit (`?id=`). Primary: Save (commit). Secondary: **Back to {origin}** (`committedAt` → view, else list).
- **Add** skips view.
- After **Save**, go to the record home (view if it exists; encounter form until a view exists). Satellite Book-in Save returns to the encounter.
- **Autosave** stays on the form URL; first draft `replaceState`s `?id=`.

Operations (**0.66.0**): list `operations.html`, plan `operation-form.html`, issued view `operation.html`, pocket brief `operation-brief.html?id=`. Draft → form. Filed → view. **Import targets** pulls filed cases with a current place or vehicle. **Import cell** takes 2–4 roster officers (assignment roles, availability from duty/shifts/other ops). One cell per target. Click an officer name, then the map, then **Commit start**. Rally / cleanup / medevac / hospital / landmark pins and a medevac route live on the operation map. The map plots target places too (live while planning; freeze on issue). Commit writes `order { generatedAt, narrative, officerBriefs[] }`. **Generate brief** opens the operation sheet with one nested Target-sheet block per target (photo, places, vehicles, assigned cell) plus officer cards. Print / Save HTML. Quiet draft on form change once name or dates exist; Add does not write an empty row. Does not write `officer.duty`.

Working (`draft`) rows → **form**. Filed (`committed`) rows → **view**. Cases tab (`cases.html`, `leads.html` redirects) defaults to the **Arrests** roster (search, arrest-date range; no column picker, row select, or generate report). **Case files** keeps stage chips All · Leads · Targets · Detainees. Admin **Today’s arrests** is the same roster, today-only, with select and generate today’s report (table + baseball cards). The encounter **list** (`encounter.html`) keeps All / Working / Filed / Completed and **Open** (working or completed — same workspace; completed is locked). No list Delete. Arrested-subjects column still reads Book-in packets. **Add encounter** opens the tabbed workspace (`encounter-form.html`); its Subjects table reads `encounter.subjects[]` and does not open Book-in. Book-in **Saved packets** is a short load/delete list plus export/import/restore. The Alien saved-records filter/view lives on Cases Arrests, not on the Book-in form. Daily arrest report lives on Admin **Today’s arrests**. Officers, vehicles, encounters, investigations, and operations keep **Working** / **Filed**. Encounter **Target / Collateral** is `encounterRole`, not stage. Investigation workspace (`investigate.html?id=`) is the form; list **Open** / **Edit** both go there. The form body is an infinite **wall** (pan/zoom). Ingest (plates) is a **Plates** overlay; **Promote** / click (with a type selected) materializes objects on the wall. **Tab** opens Associated type-ahead. Click the selected Vehicle / Person / Location / Business / Entity chip again to stop placing (empty click then does not mint). Typed A6 edges associate them (`store.associations{}` is the world fact; the wall `links[]` cite `associationId`); **Spawn** peels a child web (shared object ids, copied `x,y`, same association ids). Parent/child walls draw hulls around shared objects (Venn overlap). Every node is the same Person / Vehicle / Location / Business / Entity object and identity card as the rest of the app (including photo/file and location address fields). Nodes on the wall are title chips; if the object has a photo, that photo is the chip face with the label. Selecting a node brightens it and its one-hop neighbors (focus-plex). **Edit** / double-click / Enter opens the **Card** window for that object; placing a new object also opens Card. The Card has **Associated**: pick Person / Vehicle / Location / Business / Entity, type a name or plate or street, Enter, reuse or mint, spawn, draw the relationship. **Tab** / **Shift+Tab** from a focused chip open that composer (type-ahead) instead of minting a blank chip (**0.60.0**). × drops this wall’s citation. Off-wall people get **Place on wall**. **Objects** is a directory (Find, Hits, jump) you show or hide. **All** clears plex. **Find** filters the Objects list (plate, name, street, kind, VIN); Enter jumps to the first match. Matching wall chips stay bright; the rest dim. Plate-check **Hits** shows vehicles that came from the plate queue. Nothing is removed from the wall. Card **Remove from wall** (`store.removeInvestigationObject`) or keyboard Delete drops the focused chip from this investigation (links too). The shared record stays. **Junk** archives it (`junked`): off every wall, skipped by reuse; placing the same identity restores it. **Delete record** permanently drops an unreferenced object. Case subjects cannot be junked or deleted. Chrome **Clear all** (`store.clearInvestigationWorkspace`) empties this wall and plate queue after confirm; shared objects and child investigations stay. Chrome **Open as case** (`store.promoteInvestigationPersonToCase`) mints a **working** lead for the focused PERSON (same `personId`, identity only, no RAP, no wall-graph dump) or reuses their existing lead. The wall stays an investigation. See [investigation-wall-plan.md](investigation-wall-plan.md).

Case **Officer assigned to** (`assignedOfficerId`) is a search-select on the lead form. On Case view the officer’s name sticks at the top of Case history (does not scroll with notes). Click the name to assign or reassign in a dialog. That change is itself a history note. Shown on the Target sheet as **Targeting Officer**. History events created while assigned store `officerAlias` (initials + badge).

Cold-open Add pages may mint display ids in memory, but Encounter and Investigation do not persist a blank row or put that id in the URL. A meaningful edit or explicit dependent action creates the draft; Save commits it.

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
| Save | `committed`, stamp `committedAt` | Loud. Failure: keep draft, stay, status message. Success: go to the record view (Encounter stays in its workspace). |
| Leave / Back | unchanged | Keep the draft. No confirm-on-leave. **Back to {origin}**: view if `committedAt`, else list. Query origin for satellites (Book-in / I-200 / baseball / I-213). Not `history.back()`. |

One object per id. First autosave of a committed record **demotes** `meta.status` to `draft` in place; `committedAt` stays. No twin snapshot.

Existing rows with no `meta.status` migrate as **committed** (`committedAt ← updatedAt`). Root fleet `status: "available"` is **not** meta.

`meta.markedComplete` stays unused (`false`) except on encounters, where Confirm/Complete sets it.

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

No location view page — location photos sit on that location’s card on the parent snapshot. Form **Add photo** on a person, officer, vehicle, or location opens the owner-scoped picker as a modal over the current page. Save writes `copdocx.media.v1`, closes without a location hop, restores focus, and refreshes the matching card. No media row uses owner type `LEAD`. One **Case map** shows every mapped person and vehicle location.

## List UX

Default **All**. Cases list sorts Lead, then Target, then Detainee, then `meta.updatedAt` desc. Other lists: working first, then filed by `meta.updatedAt` desc. Storage stays `meta.status` `draft` | `committed`.

**Save-shape PR (lists that already exist):** `paintTable` / `paintStats` / dashboard previews:

- Availability counts: `meta.status === "committed"` **and** officer `duty === "available"` / fleet `status === "available"`.
- Working badge on uncommitted rows (`textContent` **Working**).
- Working row action: **Open** → `*-form.html?id=` (do not use dead `editButton()`).
- Filed row action: **Open** → the view page.
- Officer and fleet lists use one disposition grammar: **Remove from schedule** (confirm and list affected shifts), **Junk** (archive without destroying references or media), **Restore**, then **Delete record** only while junked and unreferenced. Permanent delete requires typing the record label. Media is removed only after the record write succeeds. Shift removal always confirms. No lead delete (`store.js` has none; do not add).
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

## Encounter (0.69.2 workspace)

No separate view yet. List `encounter.html` (`data-page="encounter"`) keeps All / Working / Filed / Completed. Row action is **Open** for every row (working or completed) into `encounter-form.html?id=`. Completed opens locked. **Add encounter** on that list opens the tabbed workspace.

Form `encounter-form.html` is the room for one field event: **Stop | Vehicles | Subjects | Evidence | Narrative | Review**. Thin banner is `ID · city` plus vehicle + subject facts. Chrome action slot is **Back to encounters** only; the form quiet-autosaves.

- **Add encounter** mints a transient `encounterId` in memory. A blank page does not write or change the URL. The first meaningful draft write persists it and `replaceState`s `?id=`. The ID lives in the banner (hidden input). Same workspace from three starts: list **Add encounter**; operation view **Add encounter** (`?operationId=`) seeds cell officers, target places/vehicles (association `target`), and the assigned target as the first subject; case view **Add encounter** (`?leadId=` / `?personId=`) seeds that person (role Target if Lead/Target, else Collateral) plus current places/vehicles. Does not mutate the operation or write `officer.duty`. Last-minute add/remove stays on the encounter.
- Stop holds date/time, team (still remints the id while working), event type, optional **Operation** (change auto-loads cell `officerIds` and does not write `officer.duty` or mutate the op), officers table (add/remove from roster), and location cards plus one **Encounter center**.
- Vehicles stay live cards. Encounter-specific disposition is **Left at scene** / **Moved for public safety** (parked-at when moved).
- Subjects table reads `encounter.subjects[]`, not Book-in packets. Each subject is that person’s **LE encounter** on this stop: identity/role/outcome plus a `shared` stamp of the field event (time, type, officers, center place, vehicles). Saving the encounter upserts `person.encounters[]` keyed by this `encounterId`. **Add existing** / **Add new** stay in-page floats and do not open Book-in. **Book** is in-page, **Arrested** rows only: medical / children / cash / ID, then loud Save files the packet, Detainee, and Arrest from that participation + shared stop. Officer `fieldArrests` write here. Row becomes **Booked-in** → **Generate docs** (opens the packet on Book-in). **Edit** reopens encounter fields and clears Generated. Fled/released never Book. **×** removes the row from `encounter.subjects[]` and unlinks a packet `encounterId` if one exists. The list’s arrested-subjects column still reads packets.
- Evidence files are on the encounter. Narrative tab is a stub; the Build 9 I-213 engine stays on `narrative.html`. Review Confirm locks and writes the snapshot. Unlock requires a reason.
- Book-in with `?encounterId=` remains a satellite for custody paperwork. Loud **Save** still files/reuses a Person + DETAINEE lead and upserts its canonical Arrest. Do not use Book-in to add a person to the encounter.
- Book-in **Target / Collateral** radios are this booking’s role on this encounter (`encounterRole` on the Book-in record and `encounter.subjects[]`). Not the RAP `person.encounters[].encounterRole` card.
- List **Delete** is removed. `store.deleteEncounter` remains for later; it unlinks Book-in packets and leaves cases and arrests.
- Evidence files are owned by the **ENCOUNTER**. Associate each with the scene, a booked subject, or a vehicle (`media.tags` `assoc:scene` / `assoc:subject:…` / `assoc:vehicle:…`).
- Confirm (Review) writes `completed` (`copdocx.encounter-snapshot.v1`) with `centerLocationId`, `officerIds`, `eventType`, `outcomeCounts`, and `pin` = the center. `completedHistory[]` gains the previous snapshot plus the unlock reason on re-Confirm. The form locks. **Unlock** requires a reason, drops the lock, and **keeps** `completed` until re-Confirm. Autosave does not run while locked. Map Encounters reads that snapshot. Review paints the location group (center + satellites + lines).

Do not inline RAP person cards on the encounter form. Baseball card stays a Book-in action.

## Book-in

Own packet store for import/export and provenance; do not merge that packet array into `leads{}`. Book-in is an express canonical case form: loud **Save** mints/reuses a Person, files a committed lead with `caseRole: "DETAINEE"`, and upserts one Arrest keyed by the packet id. Import/merge and restore accept Alien Book-In schema 1–3 backups, including v1.10.0, and perform the same promotion immediately. Re-importing a row is idempotent. Existing packet rows without links are reconciled when Book-in opens.

The 1.10-compatible fields are FBI number, encounter number, vehicle position, and a distinct arrest time. Arrest time defaults to one hour before Book-In; if that clock is later than the Book-In clock, the arrest date rolls to the prior day. Foreign Warrants is Yes/No with country required for Yes. Saved Records supports search/date filters, selection, sortable/configurable columns, inline correction, a synchronized live-table window, and all/selected/filtered/today report scopes. Inline saves re-run canonical promotion, so table corrections update the case rather than only the packet.

`bookin.html?leadId=` **always** `startNewRecord()` then prefill (page load is a fresh JS heap; do not branch on `activeRecordId`). If the lead is missing or `meta.status !== "committed"`, status error, leave the new blank form.

**Load from cases** is always on the Book-in action slot (not only `?encounterId=`). Same field map. No write until Save or another explicit promotion action. After load, `replaceState` keeps `encounterId` if present and sets `leadId`.

Map **only fields that exist** on `bookin.html`: identity, A-Number, FBI number, ICE event, encounter, latest arrest/Book-in details, foreign warrants, disposition, and booking fields. **No `#middleName`** — do not invent it; drop middle (do not concatenate).

After prefill:

```
suppressAutoSave = true
→ fill fields
→ rememberFormSignature()
→ suppressAutoSave = false
```

Never `saveCurrentRecord` in this path. Manual check: book-in localStorage count unchanged until explicit Save.

Shifts are not a draft/commit type. Book-in `meta.status` is follow-on.

## Workspace Import / Export

Home **Tools / Utilities** owns **Import JSON** / **Export JSON / CSV** (`functions/transfer.js`); there is no global File menu. The export dialog includes Cases, Officers, Vehicles, Schedule, Book-in, Encounters, Investigations, and Operations, an optional inclusive date range, and JSON and/or CSV. Committed-only rules apply to filed record types. JSON is `copdocx.transfer.v1` (`COPDoc_export_YYYYMMDD.json`) and includes the IndexedDB Media bundle so card photos and other attachments remain portable. CSV is one flat file per type and is not imported.

Import: pick JSON → verify → summary (counts, already here / new) → everything or selected types → merge by id (skip exact duplicates, replace different data) → reload. Also accepts a lead-snapshot array and a Book-in `alien-book-in-records` backup. Imported Book-in rows are promoted before reload into canonical committed Detainee cases and Arrest objects; promotion counts/errors appear in import status, and canonical ids are written back onto the packet rows.

## Baseball card

Book-in action. `openBaseballCard` quiet-saves the packet **with promotion** so it always has canonical `leadId` and `recordId`, then opens `baseballcard.html?leadId=&recordId=`. **Back to book-in** carries that exact `recordId`; it must not create a second packet/arrest by returning through lead-only prefill. Prefill reads `store.getLead` first, selecting the arrest by `bookinRecordId`, then uses the Book-in session handoff for form-only context. The live rich card can be edited, copied for email, or downloaded as HTML. **Save card** upserts one persisted card for that arrest, including sanitized rich HTML, disposition, foreign-warrant data, and a `photoMediaId` reference to its PERSON-owned Media photo; reload resolves the Media blob. Legacy embedded photos migrate on save. The warrant bullet is immediately before `photo from arrest in the field.` and the No text is exactly `No foreign warrants.`

## Unified arrest report

**0.67.0.** Admin **Today’s arrests** generates the arrest report (`functions/arrest-report.js` + `functions/arrest-roster.js`). Cases **Arrests** is the same roster without column picker, select, or generate. Rows are committed `person.arrests[]`. Row action is **Open** only (case file, or the Book-in packet if there is no case). Case / Book-in / Card links are not on the roster. The encounter workspace no longer mounts that roster. A missing Book-in packet never drops a row. If `bookinRecordId` is set, ICE / encounter / officer / team fill from the packet only when the arrest row is blank. Packets are not a second roster. Today’s headline is `{unit} Arrested N aliens today in M encounters.` Selected/filtered uses `{unit} Selected Arrest Report: N aliens in M encounters.` The summary table uses the visible roster columns (never Selection or Actions). Each saved Baseball Card follows as the arrest-card email table (`buildBaseballCardEmailMarkup` when loaded). Photos resolve from IndexedDB only while composing. Copy is HTML + plain text for email. Missing cards are reported in the status line.

## I-200 / I-205 issuance

Committed lead view only. `i200-form.html?id={leadId}` / `i205-form.html?id={leadId}`. Primary **Issue** fills `assets/pdf/I200_BLANK.pdf` or `I205_BLANK.pdf` with pdf-lib and **does not flatten** (AcroForm + empty `/Sig` widgets stay for last-minute edit and Adobe digital sign). Action-slot **Download PDF** is the same fill without writeback.

Issue always downloads `I-200_{LAST}_{FIRST}_{A#########}_{YYYYMMDD}.pdf` (or I-205). If File System Access is available, the first Issue asks for a warrants folder, persists the directory handle in IndexedDB, and also writes `warrants/{filename}`. Denied / unavailable → download only.

Then append `person.warrants[]` (`formType` I-200/I-205) and `saveLead` **commit**. Lead view **Warrants issued** lists those rows (form, date, file no, officer, filename). Criminal RAP warrant cards on the lead form are separate (`formType` empty).
