# App structure (living outline)

This folder is the **rule book** for COPDoc pages, chrome, records, and models. It is a project artifact, not scratch notes.

The design document holds **decisions, alternatives, risks, and PR file lists**. It must **point here** for tables (File menu, triad names, `data-page`, lifecycle, models). If a table appears in both places, **this folder wins** — update the outline in the same PR as the behavior.

## How to use this folder

1. **New page or record type** — `taxonomy.md` (files, `data-page`, IDs, directories, script order). `records.md` (list → view → form, draft vs commit). `chrome.md` (app bar).
2. **New button** — add/edit/save → **action slot**. Disk read/write → **File**. Never both.
3. **New field on officer/vehicle/lead** — `data-models.md` in the same change as the factory.
4. **Implementation order** — `implementation-plan.md`. File lists live in the design document PR Plan.

If a PR disagrees with these files, change the files in that PR and say why.

## Index

| File | Home for |
| --- | --- |
| [taxonomy.md](taxonomy.md) | Pages, URLs, `data-page` / `data-admin-page`, button IDs, CSS, directories, script order |
| [chrome.md](chrome.md) | App-bar zones, File items (incl. exceptions), Admin ▾, action slot, painter wiring |
| [records.md](records.md) | List/view/form, working vs filed (`draft`/`committed` in store), list UX, export, book-in prefill |
| [data-models.md](data-models.md) | Officer, vehicle (`governmentVehicle` vs fleet `status`), location, stores, migration |
| [implementation-plan.md](implementation-plan.md) | Ordered PRs (index). File lists: [design.md](design.md). |
| [design.md](design.md) | Decisions, alternatives, risks, detailed PR file lists |
| [media-plan.md](media-plan.md) | Proposed: attach photos/files to the object they depict. Comment on D# / PR# / Q# before 0.17.x. |
| [operations-plan.md](operations-plan.md) | Proposed: Operation record (planning form + issued order view). Comment on D# / PR# / Q# before coding. |
| [map-layout-plan.md](map-layout-plan.md) | Map-first layout (0.19.0): overlay tools, one layer dock, Brief/Print in the app bar. Comment on D# / Q# to change it. |
| [map-parity-plan.md](map-parity-plan.md) | Shared pin-card photos (0.53.0 PR-A). PR-B/C still open. Comment on D# / Q# before the rest. |
| [investigation-wall-plan.md](investigation-wall-plan.md) | Investigation wall: LE workflow on a mind-map canvas (graph, not tree). 0.37.0 draft; Windows drawer **0.52.0**. Comment on D# / PR# / Q#. |
| [association-plan.md](association-plan.md) | First-class `associations{}` (**0.53.0**). Card composer **0.54.0**. |

## Constraints that do not move

- Vanilla HTML/JS/CSS. Pages live at repo root.
- Stamp is 0.x until save-shape freeze. Header `data-version` is the product stamp; `APP_RELEASE.version` in `functions/book-in.js` bumps only when the book-in backup format changes.
- Do not merge `alien-book-in.saved-records.v1` into `copdocx.store.v1`. Book-in **Save** may write a person + lead via `promoteBookInToLead`; the packet still lives in the Book-in store.
- Do not rewrite book-in PDF layout.
- Do not edit `data/immigration.js` for structure work.
- Map file exports and baseball-card criminal/immigration cards are later.
- Do not put +Person / +Vehicle / +Location on Book-in or Map.
- Operations triad shipped **0.62.0** (`operations.html` / `operation.html` / `operation-form.html`). Pocket brief later. Encounter list/form shipped in 0.11.0. Do not invent `encounters.html` until a view split.
- `home.html` is the briefing hub (`data-page="home"`). Empty action slot. No store writes.
