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
    var now = model.nowIso ? model.nowIso() : new Date().toISOString();
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
        junked: false,
        junkedAt: "",
        locations: [],
        governmentVehicle: false,
        unit: "",
        status: "",
        barcode: "",
        driverNumber: "",
        assignedOfficerIds: [],
        equipment: [],
        occupancy: "current",
        occupiedFrom: "",
        occupiedTo: "",
        notes: "",
        otherResidents: "",
        meta: {
          createdAt: now,
          updatedAt: now,
          markedComplete: false,
          status: "draft",
          committedAt: ""
        }
      },
      extra
    );
    if (ownerName != null && extra.registeredOwnerName == null) {
      built.registeredOwnerName = String(ownerName);
    }
    delete built.registeredOwner;
    if (!built.vehicleId) {
      built.vehicleId = built.id || model.newId("veh");
    }
    if (!built.id) {
      built.id = built.vehicleId;
    }
    if (built.licensePlate) {
      built.licensePlate = String(built.licensePlate).toUpperCase();
    }
    if (built.plate) {
      built.plate = String(built.plate).toUpperCase();
    }
    if (!built.licensePlate && built.plate) {
      built.licensePlate = built.plate;
    }
    if (!built.plate && built.licensePlate) {
      built.plate = built.licensePlate;
    }
    if (built.governmentVehicle === true && !built.status) {
      built.status = "available";
    }
    if (!Array.isArray(built.locations)) {
      built.locations = [];
    }
    if (!Array.isArray(built.assignedOfficerIds)) {
      built.assignedOfficerIds = [];
    }
    if (!Array.isArray(built.equipment)) {
      built.equipment = [];
    }
    return built;
  }

  model.createVehicle = createVehicle;
})(typeof window !== "undefined" ? window : globalThis);
