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

Vehicle autosave is **#3**. Lead New/Open die in **#6**, never “PR 5”.
