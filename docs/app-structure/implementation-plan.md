# Implementation plan

Index only. **File lists, script-tag edits, and stamp bumps:** design document **PR Plan**. Rules: this folder.

Do not edit `data/immigration.js`. Do not rewrite PDF layout. Do not merge book-in into the lead store. Do not implement Map exports.

| # | Title | Depends | Stamp | Notes |
| --- | --- | --- | --- | --- |
| 1 | `docs/app-structure/` | — | — | This folder. |
| 2 | `COPDoc.chrome.mount` | 1 | 0.5.3 | Headers + **rebind** `ui.js` / `admin.js` / `lead-csv.js`. Dual `data-page`/`data-admin-page`. Lead File New/Open stay. **Vehicle-form File Save stays.** |
| 3 | Draft/commit + `autosave.js` + `util.js` | 2 | **0.6.0** | Hydrate **only** `?id=` (not `currentLeadId`). File New → `lead.html` no query; File Open → `?id=`. Lead Save stays on the form. Vehicle `autosave.bind`; **then** drop vehicle-form File Save. |
| 4 | `createOfficer` + dual-write `address`/`locations` | 3 | 0.6.1 | Stay in `copdoc.admin.v1`. Do not delete `address`. |
| 5 | `governmentVehicle` on `createVehicle` | **3** (not 4) | 0.6.2 | Can run parallel with 4. Fleet `status` default `"available"`. |
| 6 | Lead triad | 2, 3 | **0.7.0** | `leads.html` / view `lead.html` / `lead-form.html`. Drop Lead File New/Open. Add `SOURCE_LABELS` to `lead-source.js`. Commit → view. |
| 7 | Book-in from committed lead | 6 | 0.7.1 | Scripts: `util.js` → `lead.js` → `person.js` → `store.js` → `book-in.js`. `?leadId=` → `startNewRecord` + prefill; no write until Save. |
| 8 | Book-in File + baseball File | 2 | 0.7.2 | File = Export / Import(merge) / Restore(replace). Leave zero-byte stubs empty. |
| 9 | Issue I-200 / I-205 from lead view | 6 | **0.8.0** | Unflattened pdf-lib fill of `I200_BLANK` / `I205_BLANK`. Download + optional warrants folder. `person.warrants[]` writeback with `formType`. Never flatten. Leave blanks unmodified. |
| 10 | Baseball card page | 6 | **0.9.0** | Book-in Baseball card saves then opens `baseballcard.html`. Prefill from committed lead + Book-in handoff. Persist `lexId` / deportation dates on lead Save. Generate appends `immigration.baseballCards[]`. |
| 11 | File Import / Export dialogs | 6 | **0.10.0** | Shared File Import/Export. Types + optional date range. JSON bundle and/or CSV. Import verifies, summarizes, merge-by-id. |
| 12 | Encounter aggregate | 6, 11 | **0.11.0** | `createEncounterRecord` + `store.encounters{}`. List `encounter.html`, form `encounter-form.html` (ID minted on Add). Add subjects → Book-in `?encounterId=`. Generate I-213 → `narrative.html?encounterId=`. Do not merge book-in. Do not rewrite the narrative engine. |
| 13 | Back to origin | 12 | **0.11.1** | Replace Cancel with **Back to {origin}** next to Save/Edit. Forms: `committedAt` → view, else list. Views → list. Book-in / I-213 / baseball follow query. No Back on tabs/lists. |
| 14 | Book-in load from leads | 7, 13 | **0.11.2** | **Load from leads** on every Book-in page. `?leadId=` prefills committed leads. Do not write until Save. |
| 15 | Derived criminal profile | 6 | **0.12.0** | Drop lead Criminal checkbox. Derive `isCriminal` and threat flags from crime cards. Book-in/baseball show a disabled Criminal box from the person. |
| 16 | Encounter subject table | 12 | **0.12.1** | Encounter form table: Add subject, Edit (Book-in `recordId`), × unlinks by clearing `encounterId`. Do not delete the Book-in packet. |
| 17 | Target / Collateral | 16 | **0.12.2** | Book-in radios on the encounter packet (`encounterRole`). Lead load defaults Target. Adapter passes role into I-213. Full narrative wiring next. |
| 18 | Live I-213 field map | 17 | **0.13.0** | Thicken `bundleFromEncounter` from Book-in/lead/encounter. No demo narrativeFacts on `?encounterId=`. Do not rewrite the engine. |
| 19 | Per-subject I-213 persist | 18 | **0.14.0** | Narratives + supervisor summary on the encounter. Section 10 **Include all other arrested**. Seed final disposition from Book-in. |
| 20 | Encounter ID DAL+team | 12 | **0.14.1** | IDs mint as `DAL{team}-{YYYYMMDD}-{seq}`. Remint on team change only if draft and no Book-in subjects. |
| 21 | Media store + `createMedia` | 6 | **0.17.0** | IDB `copdocx.media.v1`. `primary` photo per owner. `list(owner)` meta only. |
| 22 | Save photo / Save file | 21 | **0.17.1** | Owner query → IDB. Lead/officer/vehicle views get Add photo/file links. Lab path unchanged. |
| 23 | View photo card + document list | 22 | **0.17.2** | Add photo/file on **forms**. Views show primary photo + thumbs + files. |
| 24 | Encounter + Book-in + FOW media | 23, 12, 7 | **0.17.3** | Planned FOW media; shipped as Mobile Target sheet in **0.18.2**. |
| 25 | Transfer media index | 21, 11 | later | media-plan PR-E. Index only, no blobs. |
| 26 | Product I-213 workspace | 19 | **0.16.0** | Live vs training layout. No demo fallback. **Save I-213**. Drop supplement/inspect chrome. Hide embedded Data/Template toolbars. |
| 27 | I-213 is not a tab | 26 | **0.16.1** | Drop Narrative from chrome nav. `narrative.html` is an Encounter sub-page (`tab: "encounter"`). |
| 28 | Lead case view body | 23 | **0.18.0** | Click photo on lead view to add/edit. List every vehicle and location with photos. |
| 28a | Generate Target sheet | 28, 24 | **0.18.2** | Lead view chrome opens `mobile-target-sheet.html?id=` in a new window. Live paint of the filed lead; primary photo swipe. |
| 28b | Card photos + location pin | 23, 28 | **0.18.3** | Add photo on vehicle/location form cards. Resolve drops a Leaflet pin on every location card; drag/click to correct. |
| 28c | Lead view location maps | 28b | **0.18.4** | Filed lead location tiles show a read-only Leaflet pin when lat/long exist. |
| 28d | Combined case map | 28c | **0.18.5** | One square case map of all person + vehicle locations. Hide empty identity facts. View photo click is the picker (no extra Add photo link). |
| 28e | Square photos, 4:3 map | 28d | **0.18.6** | Subject photo stages are square (cover). Case/form location maps are 4×3. |
| 28f | Case map legend + side files | 28e | **0.18.7** | Map = subject home/work/vehicle only, with side list. Files + gallery in the facts column. |
| 28g | Location map basemaps | 28f | **0.18.9** | Map / Satellite / Hybrid on case map and form location maps. |

| 28 | Operation skeleton | 6 | **0.18.0** | See [operations-plan.md](operations-plan.md) PR-A. Comment there before coding. |
| 29 | Import targets + map | 28 | **0.18.1** | operations-plan PR-B. |
| 30 | Teams, roles, availability | 29 | **0.18.2** | operations-plan PR-C. Reads roster/shifts; does not write duty. |
| 31 | Pins, heading, rally, medevac | 30 | **0.18.3** | operations-plan PR-D. |
| 32 | Generate / print order | 31 | **0.18.4** | operations-plan PR-E. |

Vehicle autosave is **#3**. Lead New/Open die in **#6**, never “PR 5”.
