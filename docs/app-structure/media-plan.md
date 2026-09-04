# Media on objects — implementation plan (proposed)

**Status:** 0.17.0 store in progress. Lab pickers still write isolated `localStorage` until 0.17.1.

How to comment: add a quoted line under any **D#**, **PR#**, or **Q#** block, e.g.

> Comment: …

Do not edit the locked sentences unless you are changing the decision. Strike with `~~text~~` and write the replacement underneath.

Canonical tables that this plan must not contradict: [data-models.md](data-models.md) (Media), [records.md](records.md) (view widgets), [taxonomy.md](taxonomy.md), [chrome.md](chrome.md). If this file and those disagree after you comment, **this file is updated in the same change as the outline.**

---

## 1. Goal

Attach photos and files to the **object they are of**. Show them on that object’s **view**: a photo card and a document list.

A mugshot belongs to that person. A plate shot belongs to that vehicle. A house shot belongs to that location. The lead is a case file, not a photo dump.

---

## 2. Decisions (comment here)

### D1 — Owner is the depicted object

`owner = { type, id }` is the person / vehicle / location / officer **in the picture** (or the document’s subject).

**Photos never use `LEAD` as owner.**

> Comment (D1):

### D2 — Bytes never live on the lead JSON

IndexedDB `copdocx.media.v1`. Not `copdocx.store.v1`, not admin, not book-in. Save photo does **not** call `saveLead` / `addOfficer`.

> Comment (D2):

### D3 — No data-URLs in persistence

Lab pickers use base64 `localStorage`. Product Save uses `Blob` in IDB. Encode with `convertToBlob` / `toBlob`, never `toDataURL` into storage.

> Comment (D3):

### D4 — One owner, query by index

No `mediaIds[]` on person/vehicle. Views call `media.list({ type, id })` via index `ownerKey` (`PERSON:p_…`).

> Comment (D4):

### D5 — `kind` is a label, not a second owner

`subject` | `vehicle` | `location` | `document` | `evidence` | `other`. Plate-check photo: `owner: VEHICLE`, kind evidence or vehicle — not a mugshot.

> Comment (D5):

### D6 — Identity documents stay metadata

`person.documents[]` = type, number, dates. A scan is Media with `documentType` and optional `documentId`. No PDF bytes on the RAP card.

> Comment (D6):

### D7 — Add photo lives on that object’s card

The card supplies the owner query to the in-page photo-picker modal. Vehicle card → `photo-picker.html?ownerType=VEHICLE&id={vehicleId}` inside the embedded picker. User does not pick “attach to lead” after the fact and the parent URL does not change.

> Comment (D7):

### D8 — Lab vs product

No `ownerType` query → current isolated library; primary stays **Add photos** / **Add files**; **no** product Save. With owner → primary **Save photo** / **Save file**.

> Comment (D8):

### D9 — Draft vs committed media

Same `meta.status` as records. Committed views hide draft media. Save photo with an owner **commits** that media row (the user pressed Save).

> Comment (D9):

### D10 — Caps

Photo original 15 MB. Other file 25 MB. `storage.estimate()`; fail if remaining &lt; size × 1.2. `storage.persist()` on first successful save.

> Comment (D10):

---

## 3. Mechanical save (one file)

This is the path to implement. Comment on a step if you want it changed.

```
1. Guard: ownerType + id in the query. None → status error, stay.
2. Read File as Blob (not readAsDataURL).
3. SHA-256 (crypto.subtle.digest).
4. If sha256 already on this ownerKey → skip, “Already saved.”
5. Size / quota check (D10). Fail loud, no partial write.
6. Photo (image/*):
     createImageBitmap(file, { imageOrientation: "from-image" })
     original = File as-is
     display  = JPEG max-edge 1920, quality 0.86
     thumb    = JPEG max-edge 320,  quality 0.72
   Non-image file: original only.
7. One IDB readwrite transaction:
     meta.put(createMedia(…))
     blobs.put([mediaId, "original"], …)
     blobs.put([mediaId, "display"], …)   // photos
     blobs.put([mediaId, "thumb"], …)     // photos
8. Revoke picker object URLs.
9. Status “Saved to {label}.” → owner view.
```

Multi-select: **one file = one transaction**. File 3 failing does not undo 1–2. Status `Saving 2 of 5`. Concurrency at most **2**.

**Apply crop:** replace `display` + `thumb`; keep `original`; store `crop` rect.  
**Reset original:** rebuild derivatives from `original`; clear `crop`.  
**Remove:** delete that `mediaId` meta + blobs. Do not rewrite the owner record.

> Comment (save path):

---

## 4. Mechanical read (view)

```
list(owner)     → meta only (ownerKey index)
thumbs          → blob role "thumb"  → object URL
large picture   → primary photo, role "display" (one URL)
Target sheet    → primary first; left/right click or swipe loads the next/prev display blob only
Open document   → role "original"; revoke URL on leave
```

Never decode originals to paint a thumbnail strip. Revoke URLs when leaving the view.

> Comment (read path):

---

## 5. IDB shape

Database `copdocx.media.v1` (not the warrants handle DB).

| Store | Key | Value |
| --- | --- | --- |
| `meta` | `mediaId` | factory JSON, no bytes |
| `blobs` | `[mediaId, role]` | `{ mediaId, role, mime, bytes, blob }` |

`role`: `original` | `display` | `thumb`.

Indexes on `meta`: `ownerKey`, `mediaClass`, `sha256`.

API: `COPDoc.media.save`, `.list(owner)`, `.blob(mediaId, role)`, `.setPrimary(mediaId)`, `.remove(mediaId)`.

`list(owner)` is the scale point: one object’s meta rows, no bytes. Thousands of photos in the DB are fine because a view never opens the whole store. Thumbnails use `thumb`; the Target sheet and the large picture use one `display` at a time.

> Comment (IDB):

---

## 6. Where it shows

Lead **view** paints **one widget per object** on the snapshot (subject, each vehicle, each location). Officer view = that officer. Fleet vehicle view = that unit.

```
┌ Photo                    ┐  ┌ Documents              ┐
│ hero                     │  │ type · caption · Open  │
│ caption · date           │  │ empty: No files        │
│ thumbs                   │  │ Add file               │
│ Add photo                │  └────────────────────────┘
└──────────────────────────┘
```

| Object in the picture | Photo card | Document list |
| --- | --- | --- |
| PERSON | Mugshot (`kind=subject` first) | DL, passport, rap sheet, packets |
| VEHICLE | Unit / plate | Title, registration |
| LOCATION | House / lot (on parent view; no `location.html`) | If any |
| OFFICER | Portrait | Creds / certs |
| ENCOUNTER | Scene as a whole only | I-213 PDF, packets |
| LEAD | **Never** photos | Rare files not of a nested object |
| BOOKIN | Detainee → PERSON when `personId` exists | Generated packets |

Mobile Target sheet `#targetPhoto` shows that person’s **primary** photo. Left/right (click or swipe) walks the person’s other photos without loading every full-size image up front. Empty photo: FOW-style placeholder. Empty files: `records-empty`.

Do **not** put +Person / +Vehicle / +Location on these cards.

> Comment (UI):

---

## 7. Picker query

| Opened from | URL |
| --- | --- |
| Subject photo card | `photo-picker.html?ownerType=PERSON&id={personId}` |
| Vehicle photo card | `?ownerType=VEHICLE&id={vehicleId}` |
| Location photo card | `?ownerType=LOCATION&id={locationId}` |
| Officer photo card | `?ownerType=OFFICER&id={officerId}` |
| Lab | no query — isolated keys, no product Save |

`file-upload.html` uses the same query. `leadId=` on the photo picker means the lead **subject**, not owner type LEAD.

Owner-scoped photo use: the parent modal provides **Add photos**, **Save photos**, and **Cancel**. Save writes IDB, posts the owner to the parent, closes, restores focus, and refreshes matching media cards. Standalone lab downloads/clear remain page-specific actions and do not wipe product IDB. File upload still uses its page chrome.

> Comment (picker URL / chrome):

---

## 8. Implementation slices (comment per PR)

Stamps assume current product **0.16.x**. First media PR is **0.17.0**.

### PR-A — Store (0.17.0)

**Files:** `functions/model/media.js` (new); `scripts/test-media.js` (new); `docs/app-structure/data-models.md` (mark shipped).

Open IDB, `createMedia`, `save` / `list` / `blob` / `remove`, hash, quota. No HTML chrome yet. Node tests: factory shape, ownerKey, duplicate sha256, missing owner rejected.

> Comment (PR-A):

### PR-B — Save photo / Save file (0.17.1)

**Files:** `photo-picker.html`, `functions/photo-picker.js`, `file-upload.html`, `functions/file-upload.js`, `functions/app-bar.js`.

Parse `ownerType` + `id`. Product Save → `COPDoc.media.save`. Navigate back to owner view. Lab path unchanged. No view widgets yet. Manual check: save a mugshot from `photo-picker.html?ownerType=PERSON&id=…` (any existing personId); reload; `list` returns one row.

> Comment (PR-B):

### PR-C — Lead / officer / vehicle views (0.17.2)

**Files:** `functions/media-card.js` (new); `style/style.css` (`.media-photo-card`, `.media-doc-list`); `lead.html`, `functions/leads.js`; `officer.html`, `vehicle.html`, `functions/admin.js`; script tags: `model/media.js` → `media-card.js`.

Paint widgets. Add photo/file links with owner query. Empty states. Thumbs only. Revoke URLs. Stamp **0.17.2** on those headers.

> Comment (PR-C):

### PR-D — Encounter, book-in, Target sheet (0.17.3 / 0.18.2)

**Files:** encounter view/form as exists; `bookin.html` / `functions/book-in.js`; `mobile-target-sheet.html` + its painter.

Same widgets. Target sheet `#targetPhoto` from PERSON `display` blob.

> Comment (PR-D):

### PR-E — Transfer index (later)

**Files:** `functions/transfer.js`. Export media **ids + metadata + sha256**, no blobs. Blob import later.

> Comment (PR-E):

---

## 9. Out of scope (this program)

- Merging media into `copdocx.store.v1`
- File System Access as the photo store (warrants folder stays for issued I-200/I-205 PDFs)
- CSV of binaries
- `location.html` triad
- Auto-face-detect to pick owner
- Replacing the lab isolated keys until PR-B ships product Save

> Comment (out of scope):

---

## 10. Open questions

Mark one option or write Other.

### Q1 — Which photo is large on the view / Target sheet?

- [x] The **primary** photo. Many photos per object; one primary. First save is primary. Set as primary demotes the previous. Target sheet starts there; swipe/click walks the rest.

> Comment (Q1): locked. Not “hero.”

### Q2 — Saving from the lab library (no owner) later “attach to object”?

- [ ] Not in 0.17.x — only Save with owner query
- [ ] Add “Save to object…” that copies lab row into IDB
- [ ] Other:

> Comment (Q2):

### Q3 — Lead form (edit), not only view: show media widgets?

- [ ] View only in 0.17.2; form gets Add photo links later
- [ ] Same widgets on `lead-form.html` / officer-form / vehicle-form
- [ ] Other:

> Comment (Q3):

### Q4 — Duplicate file (same sha256) on the **same** owner?

- [ ] Skip, “Already saved.” (plan default)
- [ ] Allow a second row (e.g. two crops / captions)
- [ ] Other:

> Comment (Q4):

---

## 11. Manual check after PR-C

1. Open a committed lead view. Subject photo card empty; vehicle card empty.
2. Add photo on the **subject** card → picker URL has `ownerType=PERSON`. Save. Back on lead: mugshot shows.
3. Add photo on a **vehicle** card → `ownerType=VEHICLE`. Save. Subject mugshot unchanged; vehicle card has the plate shot.
4. Hard refresh. Both still there. `localStorage` lead JSON has no data-URL.
5. Open file on the person → document list; Open works; URL revoked after leave.
6. Officer view: portrait of that officer only.
7. Quota / huge file: status error, no half-written meta.
