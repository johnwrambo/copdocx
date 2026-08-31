# COPDoc assets

Canonical **binary / non-code** product inputs (PDFs, images, icons).  
Runtime JS engines and base64 template wrappers stay under `src/shared/`.

| Path | Contents |
|------|----------|
| `pdf/` | Blank AcroForm templates (e.g. CAP, medical). Do not overwrite authorized originals. |
| `images/` | Product imagery (logos, chrome, static UI art). |
| `icons/` | PWA / favicon / browser icons. |

**Not for:** case media (workspace storage), demos (`demo/`), scratch (`tmp/`), or generated standalones (`dist/`).

When an asset must ship offline, wire it through `index.html` / `src/app/assemble-standalone.js` (or convert to a `src/shared` embed if required).
