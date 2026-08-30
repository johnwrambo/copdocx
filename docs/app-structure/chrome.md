# Chrome

Two-row sticky app bar (`style/style.css`, painted by `COPDoc.chrome` in `functions/app-bar.js`).

```
Row 1  COPDoc     Version x.y.z     {date}                 .app-bar-info
Row 2  [ File ▾ ]  Leads | Book-in | Map | Admin ▾    [ ACTION SLOT ]
       #fileMenu   ------------ .app-bar-nav -----------  .app-bar-actions
Status #appBarStatus
```

Info row stays in HTML (product stamp in `data-version` + visible text). `#appBarNavRow` is painted from `COPDoc.chrome.mount`.

## Three zones (row 2)

| Zone | Owner | Holds |
| --- | --- | --- |
| Left | `#fileMenu` | Disk import / export only |
| Center | `.app-bar-nav` | Page tabs, including **Admin ▾** (`#adminMenu`) |
| Right | `.app-bar-actions` | Record actions. **Not** page tabs. |

Do not put Dashboard / Officers / Vehicles / Schedule on the right.

## File menu

**Allowed:** Import JSON, Export JSON, Download CSV, page-specific file exports (including Restore Backup).

**Forbidden (end state):** New, Open, Open-from-dropdown, in-app Save, Add officer / vehicle / lead.

Unimplemented items use `data-not-built`. Do not pretend they work.

| Page | Items | Ships |
| --- | --- | --- |
| Leads list | Import JSON | `data-not-built` |
| Leads list | Export JSON / Download CSV (all **committed** leads) | lead-split PR |
| Lead view | Export JSON / Download CSV (this lead if committed) | lead-split PR |
| Lead form (`lead.html` until split) | Download JSON (`#downloadLeadButton`), Download CSV (`#downloadLeadCsvButton`) | **today**; save-shape PR: no-op unless stored `meta.status === "committed"` (never `collectLead()` of a draft). Painter **must emit these ids** — `ui.js` / `lead-csv.js` bind them. |
| Lead form | **New** (`#newLeadButton`), **Open** (`#openLeadButton` + `#savedLeadSelect` in `.app-bar-menu-open`) | **exception:** keep until `leads.html` ships. Painter **must emit these ids**. Open is a select+button row, not a lone button. Save-shape PR: New `replaceState`s to `lead.html` with **no** query; Open `replaceState`s `lead.html?id=` ([records.md](records.md) Interim). |
| Officers / vehicles lists, views, dashboard, schedule | Import JSON, Export JSON (roster) | `data-not-built` (inherit the same two items so File is not empty) |
| Officer / vehicle **view** | no extra items; inherit roster export | `data-not-built` |
| **Vehicle form only** | in-app **Save** (`#adminSaveButton` → `addVehicle({ quiet: true })`) | **exception:** keep until shared autosave ships; then delete |
| Other admin File Save | remove when chrome ships | officer already focusout-autosaves; dashboard `saveState()` is redundant |
| Map | Save PDF, Export KMZ (iTAK), Export JSON, Export CSV | already `data-not-built` |
| Book-in | Export JSON, Import JSON (**merge**), Restore backup (**replace**, confirm) | already in the records **toolbar** (`#exportRecordsButton`, `#importRecordsButton`, `#restoreRecordsButton`). File-cleanup PR **moves** them into File and **removes the toolbar duplicates**. Not New/Save/Open. |
| Baseball card | Export `data-not-built` only | File-cleanup PR strips New/Save/Open |

**Exceptions (only these):**

1. Lead File **New** and **Open** until `leads.html` exists.
2. Vehicle-form File **Save** until `autosave.bind` exists on that form.

Export is **committed records only**. Roster import/export stay labeled `data-not-built` until a later import PR (out of this program except the labels).

## Admin dropdown

Inside `.app-bar-nav`:

- Dashboard → `admin.html`
- Officers → `officers.html`
- Vehicles → `vehicles.html`
- Schedule → `schedule.html`

`aria-current` on the Admin summary for any admin child; `is-current` on the matching **link**.

## Action slot

One primary (`#appBarPrimaryAction`), optional secondaries, same physical place. **Edit and Save occupy that slot.**

Chrome **paints** the control. It does **not** call `saveLead` / `addOfficer` / `addVehicle`. Page scripts bind **Save** clicks. Add/Edit are links (chrome fills `href`, including `?id=` from the query string for Edit).

| Page kind | Primary | Secondaries |
| --- | --- | --- |
| Collection | **Add {record}** (`<a>`) | — |
| View | **Edit** (`<a href="{record}-form.html?id=">`) | Lead view: **Book-in** (committed only) |
| Form | **Save** (`<button>`) | **Cancel** → view if `committedAt`, else list |
| Dashboard, Map, Schedule | empty | Map is not +Person |
| Book-in (until split) | **Generate** | New, Save record, Clear, Baseball card (move New/Save off File in the File-cleanup PR) |
| Lead form extras | Save | Follow-ups; **+Person / +Vehicle / +Location** (`workflow.js`). Never on Book-in or Map. **Cancel omitted until the lead split** (no list/view to return to). |

Six lead-form secondaries will wrap: at `max-width: 639px` `.app-bar-actions` is a full row, `justify-content: flex-end`. That crowding is accepted; do not move stubs onto other pages.

Baseball card stays a **book-in** action, not a lead-view action.

### Interim lead (`data-page="lead-form"` on today’s `lead.html`)

Primary **Save**, stay on the page. No Cancel. No Book-in. File still has New/Open.

### Officer / vehicle forms after chrome

Hide/remove in-form `#addOfficerButton` / `#addVehicleButton` in the chrome PR. Slot is the only visible Save.

## Mobile

`.app-bar-navrow` already wraps. On `max-width: 639px`:

```css
.app-bar-actions {
  flex: 1 1 100%;
  justify-content: flex-end;
  margin-left: 0;
}
```

Do not hide File, tabs, or the slot.

## Painter

```js
COPDoc.chrome.mount({
  tab: "leads",       // leads | bookin | map | admin
  adminChild: "",     // dashboard | officers | vehicles | schedule | ""
  file: [
    { id: "newLeadButton", label: "New" },
    { id: "openLeadButton", label: "Open", selectId: "savedLeadSelect" },
    { id: "downloadLeadButton", label: "Download JSON" },
    { id: "downloadLeadCsvButton", label: "Download CSV" }
  ],
  actions: [
    /* add/edit: { label, href, primary: true, chromeAction: "add"|"edit" } */
    /* save:     { label, primary: true, chromeAction: "save" }  → <button> */
  ]
});
```

Lead-form File **must emit** `#newLeadButton`, `#openLeadButton`, `#savedLeadSelect`, `#downloadLeadButton`, `#downloadLeadCsvButton` until New/Open die (triad PR) and until export ids move. Vehicle-form File Save **must emit** `#adminSaveButton` until autosave ships.

Registry keyed by `data-page` (not `data-admin-page`). Keep menu dismiss, Escape, `data-not-built`, and `COPDoc.setAppBarStatus(message, { ok: true })` (must be able to set `.is-ok`; today the helper always removes it). Do not add `functions/chrome.js` unless the painter outgrows `app-bar.js`.

`#appBarNav` is created by the painter; it does not exist in HTML today.
