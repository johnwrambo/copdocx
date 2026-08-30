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

  function createLocation(extra) {
    return model.assign(
      {
        locationId: model.newId("loc"),
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
        // "1" Primary, "2" Secondary, "3" Tertiary, then "4"…  Empty = not a target.
        targetPriority: ""
      },
      extra
    );
  }

  model.createLocation = createLocation;
})(typeof window !== "undefined" ? window : globalThis);
