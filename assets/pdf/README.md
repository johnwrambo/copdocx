# PDF templates (`assets/pdf/`)

Blank official / product AcroForm PDFs.

Design-authorized examples (add as binary files when available):

- `cap.pdf` — CAP packet blank
- `medical.pdf` — medical screening blank

Rules:

- Keep blank originals unchanged; fill mappings live in `src/shared/pdf/`.
- Prefer embedding via base64 template modules under `src/shared/pdf/templates/` for offline standalone, or load from this path in hosted mode.
