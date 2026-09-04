/**
 * Location — a place we might go.
 *
 * Fed by: a location card (street, city, state, ZIP, lat/long,
 *         association, target rank). Resolve address / Map it write lat/long.
 * Owned by: a Person (residence, work) OR a Vehicle (registration,
 *           known parking, plate-check). Nesting is ownership — no join table.
 * Feeds: map pins, hit order (targetPriority).
 *
 * "Address" is the label on the form. The object is always a location.
 * Empty is legal. association may be "".
 */

(function (global) {
  "use strict";

  var root = (global.COPDoc = global.COPDoc || {});
  var model = (root.model = root.model || {});

  model.PERSON_LOCATION_ASSOCIATIONS = [
    { value: "residence", label: "Residence" },
    { value: "work", label: "Work" }
  ];

  model.VEHICLE_LOCATION_ASSOCIATIONS = [
    { value: "registration", label: "Registration address" },
    { value: "known-parking", label: "Known parking location" },
    { value: "plate-check", label: "Plate check location" }
  ];

  model.ENCOUNTER_LOCATION_ASSOCIATIONS = [
    { value: "stop", label: "Stop / encounter location" },
    { value: "staging", label: "Staging / processing" },
    { value: "other", label: "Other" }
  ];

  function createLocation(extra) {
    extra = extra || {};
    var built = model.assign(
      {
        locationId: extra.locationId || model.newId("loc"),
        entityType: "LOCATION",
        street: "",
        street2: "",
        city: "",
        state: "",
        zip: "",
        latitude: "",
        longitude: "",
        // residence | work | registration | known-parking | plate-check | ""
        association: "",
        // Only for registration: yes | no | "". Not a "verified" flag.
        parksHere: "",
        // "1" Primary, "2" Secondary, "3" Tertiary, then "4"…  Empty = not a target.
        targetPriority: "",
        // Optional #rrggbb pin override. Empty = auto (type, or vehicle color).
        pinColor: "",
        junked: false,
        junkedAt: "",
        occupancy: "current",
        occupiedFrom: "",
        occupiedTo: "",
        notes: "",
        otherResidents: ""
      },
      extra
    );
    built.entityType = "LOCATION";
    if (!built.locationId) {
      built.locationId = built.id || model.newId("loc");
    }
    built.id = built.locationId;
    return built;
  }

  function isHistoricalOccupancy(row) {
    return String((row && row.occupancy) || "").toLowerCase() === "historical";
  }

  model.createLocation = createLocation;
  model.isHistoricalOccupancy = isHistoricalOccupancy;
})(typeof window !== "undefined" ? window : globalThis);
