# Icons (`assets/icons/`)

`copdoc-icons.js` is the shared inline SVG registry for the app shell and map
surfaces. It exposes:

- `COPDoc.icon(name, size)` for general interface icons.
- `COPDoc.mapIcons.html(id, size)` for a semantic map glyph.
- `COPDoc.mapIcons.badgeHtml(id, options)` for the standard map marker badge.
- `COPDoc.mapIcons.entries` for the grouped map icon catalog.
- `COPDoc.mapIcons.libraries` for the available Field Ops, Tactical, Atlas, and
  Minimal libraries.
- `COPDoc.mapIcons.getLibraryId()` / `setLibrary(id)` for the persisted global
  map choice.
- `COPDoc.mapIcons.entriesFor(id)` and `badgeHtml(id, { libraryId: id })` for
  side-by-side previews without changing the active library.

Map IDs are stable persisted values. Marker meaning is semantic (`Target`,
`Residence`, `Medevac`, and so on), while each catalog entry points to a reusable
SVG glyph. Legacy planning-map values such as `Crosshair`, `Shield`, and
`MapPin` remain renderable.

Library choice changes the glyph vocabulary, marker geometry, and line weight;
semantic IDs and operational colors remain stable. The choice is stored inside
`copdocx.map.icons.v1`, so existing backups and saved pin assignments continue
to work.

Open `map-icons-preview.html` to review the full set, sizes, basemap contrast,
and marker states.
