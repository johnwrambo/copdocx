# Records

Every record type uses **list → view → form**. Admin dashboard is the hub: counts and snapshots; add/edit on subpages.

## Navigation (end state)

- **List** — table. Primary: Add {record}.
- **View** — snapshot. Primary: Edit. Lead view: Book-in if **committed**.
- **Form** — add (no id) or edit (`?id=`). Primary: Save (commit). Secondary: Cancel.
- **Add** skips view.
- After **Save**, go to the view (**except** leads until the triad exists — see Interim).
- **Autosave** stays on the form URL; first draft `replaceState`s `?id=`.

Draft rows → **form**. Committed rows → **view**.

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
| Leave / Cancel | unchanged | Keep the draft. No confirm-on-leave. Cancel → view if `committedAt`, else list. |

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
5. On **commit**: `committedAt = updatedAt`; then `rememberPeople`.
6. Never let collect’s blank `meta` win.

Test: autosave of a previously committed lead keeps `committedAt`.

Same preservation rule for officer/vehicle quiet saves in `admin.js`.

## List UX

Default **All**. Drafts first (badge `.record-status-draft`), then committed by `meta.updatedAt` desc.

**Save-shape PR (lists that already exist):** `paintTable` / `paintStats` / dashboard previews:

- Availability counts: `meta.status === "committed"` **and** officer `duty === "available"` / fleet `status === "available"`.
- Draft badge on the row.
- Draft row action: **Edit** → `*-form.html?id=` (do not use dead `editButton()`).
- Committed row action: **View**.
- Keep **Remove** on officers/vehicles (already deletes; also clears shifts). No lead delete (`store.js` has none; do not add).
- Sort drafts first.
- Filter chips All · Drafts · Committed + CSS (`.record-filter-chips`). Lead list reuses the same CSS when it ships.

Lead columns (when the list ships):

| Column | Source |
| --- | --- |
| Name | `formatPersonLabel(subject)` or “Untitled lead” |
| Source / case | Human label from `SOURCE_LABELS` **added to** `functions/lead-source.js` in the triad PR (`tag` → “Plate Check”, matching today’s `<option>` text on `lead.html`). `leads.js` reads that map. Do **not** scrape `#leadSource` — the list page has no select. That file today only shows/hides `[data-source]` panels; it has no label map yet. Plus `source.caseNumber`. |
| City | first `person.locations[].city`, else **—** (plate-check-only leads have no person city) |
| Updated | `meta.updatedAt` date |
| Status | Draft / Committed |

## Validation

- Autosave no-op when new officer has no name, new vehicle has no unit/plate/VIN/make, or phone/address validators fail. Quiet: no status line.
- Commit: same rules, always `#appBarStatus`. Empty leads are legal to commit.

## Export

Committed only. **Never** export via `collectLead()` of the dirty form. `downloadCurrentLead` / CSV: `store.getLead` + `meta.status === "committed"`, else no-op + status message. Historical `people{}` rows from today’s autosave stay; no purge.

## Shared helper

`functions/model/autosave.js` — `COPDoc.model.autosave.bind` / `.commit`. Lead (`ui.js`), officer **and vehicle** (`admin.js`). Vehicle focusout autosave ships with this helper (and vehicle-form File Save is removed in that same PR).

## Shift pickers

`paintPickers` today lists every officer/vehicle. After save-shape: **committed only**. Drafts are not assignable.

## Book-in prefill

Own store. Do not merge.

`bookin.html?leadId=` **always** `startNewRecord()` then prefill (page load is a fresh JS heap; do not branch on `activeRecordId`). If the lead is missing or `meta.status !== "committed"`, status error, leave the new blank form.

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
