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
| 29 | Case view Wave A | 28d | **0.21.0** | `case.html` board + folder identity card. `lead.html` redirects. Map in-tile + pop-out. Associations. Empty tiles collapse. Full-width map stays on Target sheet. |
| 30 | Case view Wave B | 29 | **0.21.1** | Arrange layout (removed in **0.23.1**). |
| 31 | Case view Wave C | 30 | **0.22.0** | Slide-over edit/add for identity, source, vehicle, location, immigration, criminal IDs, documents, associations. Patches one object and commits. RAP stays on the form. |
| 32 | Case view Wave D | 31 | **0.22.1** | Case history: derived events + `lead.history[]` notes. Form collect preserves history. |
| 33 | Case view Wave E | 32 | **0.23.0** | Association jump: PERSON links whose other party is the subject of another committed lead open `case.html?id=`. Linked-cases line lists this subject’s other committed cases and committed cases that link this person. Drafts do not jump. No investigations board. |
| 34 | Drop Case arrange | 33 | **0.23.1** | Static Case view board from HTML `data-size`. No `copdocx.case-view.layout.v1`. |
| 35 | Case biographics board | 34 | **0.24.0** | Combined biographics, warrant banner (issued only) sets TARGET, documents+history column, source as first history row, mint stubs on Add, keep photo-only objects. |
| 36 | Historical occupancy | 35 | **0.24.1** | Location/vehicle `occupancy`, date range, notes, other residents. Map skips historical pins. |
| 37 | Association strings | 36 | **0.25.0** | Associations save as name + type + note without a registry person. Optional existing-person link. Open-as-new-case not built. |
| 38 | Open as new case | 37 | **0.26.0** | Association slide-over **Open as new case** mints a **working** lead (or reuses an existing one) for a PERSON associate. Stays in `leads{}` / All–Working–Filed. Reciprocal link + history. No RAP copy. |
| 39 | Book-in express lead | 38 | **0.27.0** | Book-in Save mints/reuses a person and files a DETAINEE lead. Packet store stays separate. Lead Save remembers people on draft too. Chrome primary is Save. |
| 40 | Uniform navigation | 39 | **0.28.0** | Encounter Save stays on the form. Add subject quiet-saves then opens Book-in. Book-in with `?encounterId=` Save returns to the encounter; **Add another subject** replaces the same-page Add subject no-op. |
| 41 | Cases tab | 40 | **0.29.0** | Operator-facing Leads → Cases (tab, list, Add case, Home). Store keys and files stay `lead*`. Role column Lead / Target / Detainee. Working / Filed chips unchanged. |
| 42 | Cases chips Leads / Targets | 41 | **0.30.0** | Cases list chips All · Leads · Targets (`draft` / `committed`). Row badge **Lead**. Officers/vehicles/encounters stay Working / Filed. |
| 43 | Case stage filter | 42 | **0.31.0** | Cases chips filter `caseRole` (Lead / Target / Detainee), not draft/committed. Column **Stage**. Folder does not show a Detainee as Target. Encounter Target/Collateral stays `encounterRole`. |
| 44 | Targeting officer | 43 | **0.32.0** | Case `assignedOfficerId` search-select. Target sheet **Targeting Officer**. History notes/system events stamp officer alias (initials + badge). |
| 45 | History targeting officer | 44 | **0.32.1** | Case view: officer name sticky at top of history; click opens assign dialog. Search-select stays on the lead form, not biographics. |
| 46 | Investigation shell | 45 | **0.33.0** | `createInvestigation` INV{team}-{YYYYMMDD}-{seq}, kinds = Case source codes, list + workspace shell, Investigate tab. |
| 47 | Plate parser + queue | 46 | **0.33.1** | Kind `tag`: paste/file import, parse, queue table, Discard / Hit. No vehicle objects yet. |
| 48 | Promote plate → vehicle | 47 | **0.33.2** | First-class `vehicles{}`. Promote mints/reuses a vehicle node, focuses inspector. No case. |
| 49 | Quick-add object + link | 48 | **0.34.0** | Add person/vehicle/location from the focused object; `createLink`; reuse existing by name, plate, or address. First-class `locations{}`. No case. |
| 50 | Spawn child investigation | 49 | **0.35.0** | Chrome **Spawn** mints a child with `parentInvestigationId`. Copies focused object + 1-hop links (same object ids, new node ids). No plate-queue copy. No case. |
| 51 | ~~Inspector vehicle card~~ | 50 | **0.36.0** | Shipped a stacked case-form vehicle (occupancy, nested locs/links). **Dead end.** Wall replaces it. See [investigation-wall-plan.md](investigation-wall-plan.md). |
| 51w | Investigation wall | 50 | **0.37.0** | Pan/zoom wall, click-to-place identity cards, drag move, drag-connect, promote onto the wall, spawn copies `x,y`. **Draft.** Target UX: [investigation-wall-plan.md](investigation-wall-plan.md). |
| 56 | Compact nodes + reuse-on-type | 51w | **0.38.0** | Same Person/Vehicle/Location objects and identity cards. Title chip when unfocused; typing plate/name/address reuses; click edge to change/disconnect; Tab from focus. Promote lands in a lot strip. |
| 57 | Focus-plex | 56 | **0.39.0** | Selected node + one-hop stay bright; rest dim. Objects list sidecar jumps to a node. All clears plex. |
| 58 | BUSINESS + ENTITY | 57 | **0.40.0** | First-class `businesses{}` / `entities{}`. Same identity-card rule. Wall chips, A6 links, reuse by name. |
| 59 | Hulls / Venn | 58 | **0.41.0** | Convex hulls around nodes shared with parent/child investigations. Overlap glow. Click hull tag to open the other wall. |
| 60 | Promote person → case | 59 | **0.42.0** | Chrome **Open as case** mints or reuses a working lead for the focused PERSON on the wall. Same `personId`. Identity only (no RAP, no wall dump). |
| 61 | Slim inspector | 60 | **0.43.0** | Wall nodes stay title chips. Identity fields (same Person/Vehicle/Location/Business/Entity card) open in the Objects-rail inspector. |
| 62 | Outline search | 61 | **0.44.0** | Objects-rail Find filters the list (not the wall). Enter jumps. Hits shows plate-check vehicles. |
| 63 | Deselect place type | 62 | **0.45.0** | Click the selected wall type chip again to deselect. Empty-wall click does not mint until a type is selected. |
| 64 | Find dims the wall | 63 | **0.46.0** | Objects Find / Hits dim non-matching wall chips. Nothing is removed. Find wins over plex. |
| 65 | Remove from wall | 64 | **0.47.0** | `removeInvestigationObject` drops the focused node and its links on this investigation only. Shared identity stays. Promoted plate returns to hit. |
| 66 | Photo chip + card media | 65 | **0.48.0** | Wall inspector cards get the same photo/file row and location address fields. A photo on the object is the wall chip face plus label. |
| 67 | Object identity audit | 66 | **0.49.0** | Reuse drops abandoned records. Promote-from-wall keeps RAP on `people{}`. File export includes investigations + referenced objects. `investigationIntegrity`. |
| 68 | Clear workspace | 67 | **0.50.0** | Chrome **Clear all** empties this investigation’s wall and plate queue. Shared objects and child walls stay. |
| 72 | Junk / delete record | 68 | **0.51.0** | **Remove from wall** vs **Junk** (archive, skip reuse, strip every wall) vs **Delete record** (unreferenced only). Case subjects blocked. |
| 69 | Split windows (DOM) | 68 | **0.52.0** | Card overlay is not under the Objects list. |
| 70 | Windows drawer | 69 | **0.52.0** | Wall-tools **Plates / Objects / Card**. Click = focus; Edit / double-click / Enter opens Card. |
| 71 | Remember open windows | 70 | **0.52.0** | `sessionStorage` `copdocx.investigation-windows.v1`. Positions added **0.61.0**. |
| 80 | Association factory | 71 | **0.53.0** | `store.associations{}`. `createAssociation` + `upsertAssociation`. Wall connect/add/spawn cite `associationId`. Indexes, integrity, File export bag. No card UI. |
| 81 | A6 is the only catalog | 80 | **0.53.0** | `CUSTOMER_OF`. Canonical ends and validation read the matrix. |
| 75 | Card composer (people) | 81 | **0.54.0** | Associated people on the Card window. Type a name, Enter, reuse or mint, spawn, edge, relationship, × / Place on wall. |
| 78 | Card composer (all types) | 75 | **0.55.0** | Same Associated block: Person / Vehicle / Location / Business / Entity. Plate or street Enter. |
| 76 | Dual-write nested case views | 78 | **0.56.0** | PERSON–LOCATION / PERSON–VEHICLE associations copy onto the case snapshot (`person.locations[]`, `lead.vehicles[]`). No RAP. No wall dump. |
| 77 | Case Associations consume associations | 76 | **0.57.0** | Case tile lists world associations. Add/Edit slide-over uses the same constructor. Open as new case still works. |
| 79 | Case Associations live composer | 77 | **0.58.0** | Same Enter constructor as the Card. Relationship dropdown. × drops the fact (`dropAssociation`). OTHER leftover uses `removeCaseLink`. |
| 82 | Occupancy on the association | 79 | **0.59.0** | `occupancy` / `validFrom` / `validTo` on `associations{}`. Nested copies dual-written. Case map still reads nested current/historical. |
| 83 | Tab type-ahead | 82 | **0.60.0** | Wall Tab / Shift+Tab open the Card Associated composer. Do not mint a blank linked chip. |
| 84 | Draggable windows | 83 | **0.61.0** | Drag Plates / Objects / Card title bars. Session `pos` `{x,y}`. Not on `investigations{}`. |
| 28e | Square photos, 4:3 map | 28d | **0.18.6** | Subject photo stages are square (cover). Case/form location maps are 4×3. |
| 28f | Case map legend + side files | 28e | **0.18.7** | Map = subject home/work/vehicle only, with side list. Files + gallery in the facts column. |
| 28g | Location map basemaps | 28f | **0.18.9** | Map / Satellite / Hybrid on case map and form location maps. |
| 73 | Planning pin card + photos | 23, 28d | **0.53.0** | Shared `map-popup.js`. Case map, officer map, and `map.html` pin cards show the object photo. Media read-only on the planning map. |

| 28 | Operation skeleton | 6 | **0.62.0** | Tab, `operations{}`, list + name/dates form, issued view shell. Brief nests Target sheets in a later PR. |
| 29 | Import targets + map | 28 | **0.63.0** | Filed cases with a place/vehicle. Plot on the operation map. Freeze on issue. |
| 30 | Teams, roles, availability | 29 | **0.64.0** | Import 2–4 officer cells. Assignment roles. Availability from duty/shifts/other ops. Assign one cell per target. |
| 31 | Pins, heading, rally, medevac | 30 | **0.18.3** | operations-plan PR-D. |
| 32 | Generate / print order | 31 | **0.18.4** | operations-plan PR-E. |

Vehicle autosave is **#3**. Lead New/Open die in **#6**, never “PR 5”.
