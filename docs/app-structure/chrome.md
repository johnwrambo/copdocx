# Chrome

Two-row sticky app bar (`style/style.css`, painted by `COPDoc.chrome` in
`functions/app-bar.js`).

```text
Row 1  COPDoc     Version x.y.z     {date}                 .app-bar-info
Row 2  Home | Cases | Investigate | Encounters | Operations | Map | Oracle | Admin ▾  [ ACTION SLOT ]
       --------------------------- .app-bar-nav ---------------------------  .app-bar-actions
Status #appBarStatus
```

There is no global File menu. Occasional workspace disk I/O lives in the
**Tools / Utilities** card on Home. Page-specific downloads and print controls
stay in that page's action slot.

## Navigation

`#appBarNavRow` contains two zones:

| Zone | Holds |
| --- | --- |
| `.app-bar-nav` | Product tabs and **Admin ▾** (`#adminMenu`) |
| `.app-bar-actions` | Actions for the current page or record |

The Admin dropdown contains visible text links for Dashboard, Officers,
Vehicles, and Schedule. `aria-current="page"` belongs on the Admin summary for
any admin child; `.is-current` belongs on its matching link.

**Oracle** is a product tab (`oracle.html`). Read-only analysis; empty action slot.

I-213, warrants, the Target sheet, media labs, Book-in, and the operation brief are
sub-pages, not tabs. The associated product tab stays current. Book-in is reached
from encounter **Book** / Generate docs and case **Book-in**, not from the nav.

## Home tools

`home.html` owns the workspace transfer entry points:

- `#homeImportButton` calls `openFileImport` and accepts a COPDoc JSON backup.
- `#homeExportButton` calls `openFileExport`; the dialog supports JSON, CSV, or
  both, selected record types, and an optional inclusive date range.
- `#homeLockButton` clears the tab unlock and immediately covers the workspace.

`functions/transfer.js` keeps the workspace, admin, and Book-in stores
separate. Import merges by record id; it does not combine their schemas.

## Action slot

One action may be primary (`#appBarPrimaryAction`); secondary actions follow in
the same physical area. Chrome paints controls and dispatches declared `call`
handlers. Record scripts own validation and persistence.

| Page kind | Primary | Typical secondaries |
| --- | --- | --- |
| Collection | Add record | None; tabs leave collections |
| View | Edit | Back to list, record-specific output/actions |
| Form | Save | Back to origin, form-specific actions |
| Investigation | Save | Back, Import plates, Spawn, Open as case, Clear all |
| Encounter list | Add encounter | None |
| Encounter form | none (quiet autosave) | Back to encounters. Confirm lives on Review. Add subject / Book-in are not chrome actions. |
| Operation view | Edit | Back, Generate brief, Add encounter (`?operationId=`) |
| Case view | Edit | Back, Add encounter (`?leadId=`), Book-in, Issue I-200 / I-205 |
| Operation brief | Print | Save brief, Back to operation |
| Map | Print brief | Brief view and planned map exports |
| Narrative | Save I-213 / Update draft | Back when live, Copy, downloads |
| Book-in | Save | Contextual Back/Add subject, Generate, Load, Clear, Baseball card, New, Open |
| Home / Oracle / Admin dashboard / Schedule | none | Home uses its in-page Tools card |

Record-specific downloads remain available in this slot: case JSON/CSV,
warrant PDF, Narrative JSON/text, Target sheet, media-lab JSON/clear, and map or
operation printing. `data-not-built` continues to mark controls that are only
reserved.

The `file` array in `COPDoc.chrome.mount` is now a compatibility input for
page-specific tools. The painter merges those items into actions, de-duplicates
matching handlers, ignores the old workspace `fileImportButton` and
`fileExportButton`, and never creates `#fileMenu`.

## Media picker

Owner-scoped Add photo links open `functions/photo-picker-modal.js` over the
current page. The embedded `photo-picker.html` retains crop/tag behavior and
writes only `copdocx.media.v1`; Save posts the owner back, closes, restores
focus, and refreshes matching media cards without changing the parent URL.
Standalone no-owner `photo-picker.html` remains the development lab.

File upload remains a page for now.

## Privacy lock

Every active app page loads `workspace-config.js` and `privacy-gate.js` in the
document head. Before chrome is visible, the gate requires the local unlock
phrase. The first visit sets the phrase; its salted SHA-256 digest is stored in
`copdocx.privacy-lock.v1`. A successful unlock is remembered only in
`sessionStorage` for that tab (`copdocx.privacy-unlocked.v1`). This is a
shoulder-surf screen lock, not encryption or authentication.

Unreadable lock state fails closed. The record stores and media database are
not encrypted, migrated, or re-keyed by this feature.

## Mobile

The nav row wraps. At narrow widths, `.app-bar-actions` receives its own row
and remains right-aligned. Do not hide tabs or record actions.

## Painter contract

```js
COPDoc.chrome.mount({
  tab: "leads", // home | leads | investigate | encounter | operations | bookin | map | oracle | admin
  actions: [
    { label: "Save", primary: true, chromeAction: "save" },
    { label: "Back to cases", href: "leads.html" }
  ],
  file: [
    // Compatibility: page-specific downloads only; painted in the action slot.
    { id: "downloadLeadButton", label: "Download JSON" }
  ]
});
```

The registry keys off `body[data-page]`, not `data-admin-page`. Preserve menu
dismissal, Escape behavior, `data-not-built`, and
`COPDoc.setAppBarStatus(message, { ok: true })`.
