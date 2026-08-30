/**
 * Vehicle — a car (or other conveyance) in the case.
 *
 * Fed by: the vehicle card (plate, VIN, make/model, registered owner NAME).
 * Owns: locations[] (registration, known parking, plate-check).
 * Does not own: who the human is. That is an explicit link (see link.js).
 *
 * registeredOwnerName is whatever was on the title / printout.
 * Linking a person never overwrites that string.
 */

(function (global) {
  "use strict";

  var root = (global.COPDoc = global.COPDoc || {});
  var model = (root.model = root.model || {});

  function createVehicle(extra) {
    extra = extra || {};
    var ownerName = extra.registeredOwnerName;
    if (ownerName == null && extra.registeredOwner) {
      ownerName = extra.registeredOwner.nameText || "";
    }
    var built = model.assign(
      {
        vehicleId: model.newId("veh"),
        entityType: "VEHICLE",
        licensePlate: "",
        plateState: "",
        vehicleYear: "",
        vehicleMake: "",
        vehicleModel: "",
        vehicleColor: "",
        vehicleBodyStyle: "",
        vin: "",
        registeredOwnerName: "",
        locations: []
      },
      extra
    );
    if (ownerName != null && extra.registeredOwnerName == null) {
      built.registeredOwnerName = String(ownerName);
    }
    delete built.registeredOwner;
    if (!Array.isArray(built.locations)) {
      built.locations = [];
    }
    return built;
  }

  model.createVehicle = createVehicle;
})(typeof window !== "undefined" ? window : globalThis);
