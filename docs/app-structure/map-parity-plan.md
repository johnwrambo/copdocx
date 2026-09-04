# Case map ↔ planning map — shared feature ledger

**Status:** Shared pin card, planning/officer photos, dual object/person photos, and the Encounters layer are shipped. PR-B and the remaining optional parity items are still proposed.
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

- **Dual photo pin card.** Click a pin (or legend row) → floating card. The mapped object photo is main and an associated person portrait is inset; either can stand alone. Load is lazy (`popupopen`) from IndexedDB thumbs.
- Kind glyphs (residence / worksite / vehicle / parking) via `COPDoc.mapIcons`, plus pin color and vehicle color.
- Primary ring. Occupancy: **current** places only.
- Side list of every place (mapped or not). Click flies and opens the card. **Navigate** (Google Maps). Set primary / pin color on the case view.
- Pop-out larger map. Form cards: drag the pin to correct lat/long.
- Vehicle location with an address but no coords reuses the matching person-place pair. Overlapping pins are nudged.

### Planning map (best)

- Map-first shell: overlays on the tiles, one **Layers** dock, Brief / Print in the app bar.
- Multi-record layers with independent eyes: Active targets, Arrests, Encounters, Officer homes, Origin / finds, Markup.
- Icon library (category default or one pin). Labels / arrows. Home view + presets.
- Table of the selected layer; fly-to; ungeocoded rows stay in the list, italic.
- Planning-only storage.

### Shared already

Basemap Map / Sat / Hyb (OSM + Esri). `COPDoc.mapIcons` badges. Leaflet 1.9.4.

> Comment (inventory):

---

## 3. Closed gap

Both engines now use `functions/map-popup.js`, load media lazily, and apply the
same dual object/person display rule. The planning map remains read-only.

> Comment (gap):

---

## 4. Decisions

### D1 — Same pin card, two engines

The extracted `COPDoc.mapPopup` helper in `functions/map-popup.js` owns the card
DOM and lazy media fill. Both maps bind it; CSS stays `.case-map-popup*`.

Do **not** instantiate `locationMap.displayMany` inside `#map`.

> Comment (D1):

### D2 — Show the mapped object and its associated person

Same media rule as [data-models.md](data-models.md): mugshot → PERSON, house → LOCATION, plate/car → VEHICLE, portrait → OFFICER. **Never LEAD.**

The popup has two independent owner groups. Each group chooses its first
committed primary photo (or first committed photo):

| Planning layer | Main object owners | Person inset owners |
| --- | --- | --- |
| Active targets | LOCATION, then VEHICLE for a vehicle place | Case subject plus PERSON associations to that LOCATION/VEHICLE |
| Origin / finds | VEHICLE, then LOCATION | Case subject plus linked PERSON records |
| Encounters | LOCATION, then encounter VEHICLE | Encounter subjects |
| Arrests | none | PERSON (rendered as the single main photo) |
| Officer homes | LOCATION | OFFICER |

When both groups resolve, the object is the main image and the person is an
inset. Object-only stays one image. Person-only promotes the portrait to the
main image. Case map and planning map use the same rule. Associated people are
not additional media owners: every row remains on the PERSON, VEHICLE,
LOCATION, or OFFICER it depicts.

Lazy load on `popupopen`. Revoke blob URLs when markers rebuild. Do **not** prefetch every thumb at plot time.

> Comment (D2):

### D3 — Planning map is still read-only

`map.html` **reads** `copdocx.media.v1`. It does **not** Save photo, open the picker, or write leads. The photo on the card is display-only (same as today’s case-map popup).

Optional links on the card (recommended): **Open case** (`case.html?id={leadId}`) for lead pins; **Navigate** when coords exist. Officer pin → `officer.html?id=`.

> Comment (D3):

### D4 — Catalog rows carry owners, not bytes

Catalog rows carry `objectPhotoOwners[]` and `personPhotoOwners[]` plus their
object ids. Legacy `photoOwners[]` remains a compatibility fallback. No
data-URLs are stored in the catalog. Target sheet can keep prefetching a data
URL for saved HTML.

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
  → resolve objectPhotoOwners[] and personPhotoOwners[] in parallel
  → for each group: first committed primary, else first committed photo
  → blob(mediaId, "thumb") else "display"
  → object URL into main and optional person-inset image
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

- Additional popup links (dual object/person display is already shipped)
- Case-map legend eyes (home/work/vehicle/parking)
- Planning glyphs tint from `pinColor` / vehicle color
- Overlap nudge + vehicle-coord reuse on `map-targets.js`

> Comment (build):

---

## 8. Open questions

### Q1 — PERSON on a place pin?

- [x] Show it independently from the object: inset when both exist, single image when person-only.
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
| Owners | Object main + associated PERSON/OFFICER inset; person-only falls back to one image |
| Photo click | Display only |
| Planning writes | Still none of leads/media |
| Case map extras | Officer `photoOwners` in PR-A; legend eyes in PR-C |
