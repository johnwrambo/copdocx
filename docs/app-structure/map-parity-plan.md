# Case map ↔ planning map — shared features (not built)

**Status:** PR-A shipped in 0.53.0 (shared pin card + planning/officer photos). PR-B / PR-C still proposed.  
**Goal:** Keep two maps with two jobs. Share the pin card (photo + facts) and a short list of other wins. Do not merge the engines.

How to comment: under any **D#**, **PR#**, or **Q#**:

> Comment: …

---

## 1. Two maps, two jobs

| | **Case map** | **Planning map** (`map.html`) |
| --- | --- | --- |
| Where | `case.html` (also officer view, Target sheet, pop-out) | Chrome **Map** tab |
| Job | This subject’s places | Every filed case + officer homes + markup |
| Engine | `COPDoc.locationMap` in `functions/location-map.js` | `COPDoc.map.leaflet` in `functions/map.js` + `map-targets.js` |
| Writes | May set primary / pin color on the lead | Views, layers, icons, markup keys only. Never leads/admin/book-in |
| Scope | One snapshot | All committed leads + roster homes |

Do **not** replace one with the other. Do **not** put planning markup on a case. Do **not** make `map.html` a case view.

> Comment (jobs):

---

## 2. What each already does well

### Case map (best)

- **Photo on the pin card.** Click a pin (or legend row) → floating card. If the **object** has a photo, it shows above title / vehicle line / address. Load is lazy (`popupopen`), from IndexedDB thumbs. Owner order today: **LOCATION**, then **VEHICLE**.
- Kind glyphs (residence / worksite / vehicle / parking) via `COPDoc.mapIcons`, plus pin color and vehicle color.
- Primary ring. Occupancy: **current** places only.
- Side list of every place (mapped or not). Click flies and opens the card. **Navigate** (Google Maps). Set primary / pin color on the case view.
- Pop-out larger map. Form cards: drag the pin to correct lat/long.
- Vehicle location with an address but no coords reuses the matching person-place pair. Overlapping pins are nudged.

### Planning map (best)

- Map-first shell: overlays on the tiles, one **Layers** dock, Brief / Print in the app bar.
- Multi-lead layers with independent eyes: Active targets, Arrests, Officer homes, Origin / finds, Markup.
- Icon library (category default or one pin). Labels / arrows. Home view + presets.
- Table of the selected layer; fly-to; ungeocoded rows stay in the list, italic.
- Planning-only storage.

### Shared already

Basemap Map / Sat / Hyb (OSM + Esri). `COPDoc.mapIcons` badges. Leaflet 1.9.4.

> Comment (inventory):

---

## 3. The gap you named

On the case map, a pin of a house/car opens a **card with that object’s photo**.

On `map.html`, the same click is a Leaflet default popup: **name, address, association**. No photo. Catalog rows do not carry `photoOwners`. The page does not load `functions/model/media.js`.

That is the first thing to copy.

> Comment (gap):

---

## 4. Decisions

### D1 — Same pin card, two engines

Extract the case-map popup (photo box + body + lazy `fillPopupPhoto`) to a shared helper, e.g. `COPDoc.mapPopup` in `functions/map-popup.js` (or a named export on `location-map.js` if you want one less file). Both maps bind that DOM node. CSS stays `.case-map-popup*` (rename later only if you want).

Do **not** instantiate `locationMap.displayMany` inside `#map`.

> Comment (D1):

### D2 — Photo is of the object the pin is of

Same media rule as [data-models.md](data-models.md): mugshot → PERSON, house → LOCATION, plate/car → VEHICLE, portrait → OFFICER. **Never LEAD.**

Recommended owner chain (first committed primary, else first photo):

| Planning layer | Owners, in order |
| --- | --- |
| Active targets | LOCATION, then VEHICLE (if a vehicle place), then PERSON |
| Origin / finds | VEHICLE, then LOCATION |
| Arrests | PERSON (the arrest is of the subject) |
| Officer homes | LOCATION, then OFFICER |

Case map today is LOCATION then VEHICLE only. **PR-A** uses that same chain on the planning map. **PR-C** may add PERSON as last fallback on **both** maps so a house with no house shot still shows the face. Until then, no face on a location pin unless the location (or vehicle) owns a photo.

Lazy load on `popupopen`. Revoke blob URLs when markers rebuild. Do **not** prefetch every thumb at plot time.

> Comment (D2):

### D3 — Planning map is still read-only

`map.html` **reads** `copdocx.media.v1`. It does **not** Save photo, open the picker, or write leads. The photo on the card is display-only (same as today’s case-map popup).

Optional links on the card (recommended): **Open case** (`case.html?id={leadId}`) for lead pins; **Navigate** when coords exist. Officer pin → `officer.html?id=`.

> Comment (D3):

### D4 — Catalog rows carry owners, not bytes

`map-targets.js` collect already has `locationId` / `leadId`. Add `personId`, `vehicleId`, `officerId`, `photoOwners[]`. No data-URLs on the catalog. Target sheet can keep prefetching `photoDataUrl` for saved HTML.

> Comment (D4):

### D5 — Copy a few case-map facts onto the planning card

On the planning popup, under the photo:

- Subject (or officer name)
- Association / kind / rank
- Vehicle line when it is a vehicle place
- Address
- Occupancy line when present

Skip Set primary / pin-color **controls** on `map.html` (those write the lead). Pin **color** from `location.pinColor` / vehicle color may tint the **glyph** later (PR-C); not required for photos.

> Comment (D5):

### D6 — What goes the other way (case map)

Worth taking from `map.html` onto the **case** map only:

- **Place-type eyes** on the legend: Home / Work / Vehicle / Parking, same idea as the planning dock. One subject, still.
- Overlay-style basemap (already a bar; optional restyle to match the planning chips).

**Do not** bring: markup, Brief/Print, home/presets, icon-library assignment (kinds are semantic), multi-lead layers.

Officer case map should pass `photoOwners` the same way as the lead case map (today it does not). That is a one-line collect fix in the photo PR.

> Comment (D6):

### D7 — Occupancy on the planning map

Filed **targets** and **origin** skip historical occupancy, same as the case map. Arrests and officer homes unchanged. Ungeocoded rows still list.

> Comment (D7):

---

## 5. Control / data flow (photo)

```
pin click / legend or table row
  → open shared popup card (photo hidden)
  → popupopen
  → media.list(owner) for each photoOwners[] until a committed photo
  → blob(mediaId, "thumb") else "display"
  → object URL into .case-map-popup-photo
```

`map.html` script order adds **read-only** media:

```
… store.js → model/media.js → Leaflet → copdoc-icons.js
→ map-popup.js → map-views.js → map.js → map-targets.js → map-markup.js
```

Do **not** load `media-card.js`, `collect.js`, `hydrate.js`, or `admin.js`.

> Comment (flow):

---

## 6. What we do not do

- Do not merge case map and `map.html` into one Leaflet object.
- Do not write media, leads, or admin from the planning map.
- Do not dump photos onto the lead JSON or use data-URLs in `copdocx.map.*`.
- Do not prefetch every image when the Map tab opens.
- Do not put Label/Arrow/Delete on `case.html`.
- Do not change Target-sheet saved HTML in the first photo PR (it already inlines a photo URL when one was loaded).
- Do not implement Operations overlay here ([operations-plan.md](operations-plan.md)).

> Comment (non-goals):

---

## 7. Build (after you comment)

### PR-A — Shared pin card + planning photos (**0.53.0**)

The named gap.

**Files:** `functions/map-popup.js` (or extract on `location-map.js`); `functions/location-map.js` (call the helper); `functions/map-targets.js` (owners on catalog, bind card, `popupopen`); `map.html` (load `model/media.js` + helper); `functions/admin.js` (officer places get `photoOwners`); [taxonomy.md](taxonomy.md) Map script order; [data-models.md](data-models.md) one sentence that the planning popup uses the same owners.

Reuse existing `.case-map-popup*` CSS.

### PR-B — Card links + occupancy (**0.53.1**)

Navigate + Open case / Open officer on the planning card. Historical occupancy skipped on targets/origin. Optional Navigate on the case-map **popup** (legend already has it).

### PR-C — Optional parity (**0.53.2**)

Pick after comment:

- PERSON last-fallback on both maps
- Case-map legend eyes (home/work/vehicle/parking)
- Planning glyphs tint from `pinColor` / vehicle color
- Overlap nudge + vehicle-coord reuse on `map-targets.js`

> Comment (build):

---

## 8. Open questions

### Q1 — PERSON as last fallback on a place pin?

- [x] Later (PR-C). First ship LOCATION then VEHICLE, matching today’s case map. (Recommended)
- [ ] Yes in PR-A, both maps
- [ ] Never. Face only on arrest / officer pins
- [ ] Other:

> Comment (Q1):

### Q2 — Click the popup photo?

- [x] Display only. Open case / officer from a text link. (Recommended — planning map is not an editor)
- [ ] Open the in-app gallery for that owner
- [ ] Open the photo picker (case map only)
- [ ] Other:

> Comment (Q2):

### Q3 — Case-map layer eyes (home/work/vehicle)?

- [x] PR-C if you still want them after photos ship
- [ ] Skip. Legend click is enough
- [ ] Other:

> Comment (Q3):

### Q4 — Print brief on `map.html` include popup photos?

- [x] No. Brief is the map + layer legend. Photos stay on click. (Recommended)
- [ ] Yes, a second page of cards
- [ ] Other:

> Comment (Q4):

---

## 9. Recommended defaults

| Topic | Default |
| --- | --- |
| Engines | Stay two |
| First ship | PR-A photos only |
| Owners | Same as case map; PERSON later |
| Photo click | Display only |
| Planning writes | Still none of leads/media |
| Case map extras | Officer `photoOwners` in PR-A; legend eyes in PR-C |
