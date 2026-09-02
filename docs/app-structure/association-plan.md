# Associations — relational object model

**Status:** Factory shipped **0.53.0**. Card composer shipped **0.54.0**. Case live composer shipped **0.58.0**.

Canonical rules: vanilla HTML/JS/CSS; stores stay split; investigation is a graph, a case is one person file; same factory/card for every object; do not merge book-in; do not rewrite PDF.

---

## Shipped (0.53.0)

Two kinds of thing:

- **Entity** — `people{}` / `vehicles{}` / `locations{}` / `businesses{}` / `entities{}`. Identity only.
- **Association** — `store.associations{}`. Two ends, one A6 `reason`, optional occupancy dates, provenance.

`createAssociation` (`copdocx.association.v1`): `associationId`, `from` `{type,id}`, `to` `{type,id}`, `reason` / `reasons[]`, `label` (unresolved name), `occupancy`, `validFrom` / `validTo`, `source`, `junked`.

Canonical direction is the A6 matrix. Symmetric types (`SPOUSE_OF`, …) match either order; one record. `CUSTOMER_OF` is PERSON → BUSINESS.

Investigation `links[]` cite `associationId`. Spawn copies new link ids and the **same** association ids. Remove from wall drops the citation. Reuse-on-type retargets ends. Delete unreferenced object drops hanging associations.

`registeredOwnerName` remains a title-print string.

---

## Shipped (0.54.0) — card composer

On every object card:

```
Associated people
  GARCIA, Luis    [Registered owner ▾]  ×
  [type a name, Enter]   [Relationship ▾]
```

Enter: parse name → type-ahead / `findPersonByName` reuse → else mint → `upsertAssociation` → place chip if missing → draw edge. Host card stays open. Dropdown is A6 filtered by host type.

Defaults: vehicle → registered owner; location → current residence; business → customer; entity → member; person → associate.

Tab still places a blank linked chip. × drops this wall’s citation (Q10).

---

## Shipped (0.55.0) — all object types

Same Associated block. Kind select: Person / Vehicle / Location / Business / Entity (A6 pairs only). Placeholder follows kind (name, plate, street). Enter reuses or mints that type, places it, draws the edge. `store.associateInvestigationObject`.

---

## Decisions (D13–D19)

**D13** Associations are first-class. Nested `person.locations[]` / `lead.vehicles[]` are dual-written from associations when the person is a case subject (**0.56.0**). Case map and list city keep working. Open as case still copies no RAP.  
**D14** One factory, one A6 catalog.  
**D15** Wall layout ≠ world fact.  
**D16** Wall Enter always resolves a person (no label-only ghosts on the wall).  
**D17** Title print is not a person.  
**D18** First composer was associated *people* (**0.54.0**). **0.55.0** same block for every object type (kind select).  
**D19** Open as case stays identity-only. **0.57.0** the case Associations tile reads `associations{}` and uses the same constructor (name / plate / street).  
**D20** **0.58.0** the case Associations tile is the same live composer as the Card: type a name / plate / street, Enter, reuse or mint, relationship dropdown. × (`dropAssociation`) deletes the world fact and uncite every case/wall `links[]` that pointed at it. Objects stay. Nested copies stay (merge). Leftover OTHER × (`removeCaseLink`) drops that case link only. Add still opens the slide-over for notes / OTHER / Open as new case.  
**D21** **0.59.0** Occupancy is on the association (`occupancy` current|historical, `validFrom` / `validTo`). Nested `person.locations[]` / `lead.vehicles[]` / vehicle places are dual-written copies. Case location/vehicle save writes the association, then the nested copy. Case map still skips historical pins from the nested occupancy. `otherResidents` stays on the nested place.

---

## Open

**Q10.** ~~× junk vs citation.~~ **0.54.0** × drops this wall’s citation. The association stays. The person chip stays.  
**Q11.** ~~Fill empty `registeredOwnerName`.~~ **0.54.0** yes, once, if empty.  
**Q12.** ~~Business default.~~ **0.54.0** Customer.  
**Q13.** ~~Show off-wall people.~~ **0.54.0** yes, with **Place on wall**.
