/**
 * Officer — agency roster, not a case Person.
 * Never enters people{}. Location is the same Location object.
 */
(function (global) {
  "use strict";

  var root = (global.COPDoc = global.COPDoc || {});
  var model = (root.model = root.model || {});

  function locationFromAddress(address) {
    address = address || {};
    var assoc = address.association || address.locationAssociation || "";
    var loc = {
      locationId: address.locationId || "",
      association: assoc,
      locationAssociation: assoc,
      targetPriority: address.targetPriority || "",
      parksHere: address.parksHere || "",
      street: address.street || "",
      street2: address.street2 || "",
      city: address.city || "",
      state: address.state || "",
      zip: address.zip || "",
      latLong: address.latLong || "",
      latitude: address.latitude || "",
      longitude: address.longitude || ""
    };
    if (typeof model.createLocation === "function") {
      return model.createLocation(loc);
    }
    return loc;
  }

  function addressFromLocation(loc) {
    loc = loc || {};
    var assoc = loc.association || loc.locationAssociation || "";
    return {
      locationId: loc.locationId || "",
      locationAssociation: assoc,
      association: assoc,
      targetPriority: loc.targetPriority || "",
      parksHere: loc.parksHere || "",
      street: loc.street || "",
      street2: loc.street2 || "",
      city: loc.city || "",
      state: loc.state || "",
      zip: loc.zip || "",
      latLong: loc.latLong || "",
      latitude: loc.latitude || "",
      longitude: loc.longitude || ""
    };
  }

  function placeHasData(place) {
    if (!place) {
      return false;
    }
    return Boolean(
      place.street ||
        place.street2 ||
        place.city ||
        place.state ||
        place.zip ||
        place.latLong ||
        place.latitude ||
        place.association ||
        place.locationAssociation
    );
  }

  function officerAddress(officer) {
    if (!officer) {
      return {};
    }
    var loc = officer.locations && officer.locations[0];
    if (placeHasData(loc)) {
      return addressFromLocation(loc);
    }
    return officer.address || {};
  }

  function officerCity(officer) {
    var addr = officerAddress(officer);
    return (addr && addr.city) || "";
  }

  function syncOfficerPlaces(officer) {
    if (!officer) {
      return officer;
    }
    var loc = officer.locations && officer.locations[0];
    if (placeHasData(officer.address) && !placeHasData(loc)) {
      officer.locations = [locationFromAddress(officer.address)];
    }
    if (placeHasData(loc) && !placeHasData(officer.address)) {
      officer.address = addressFromLocation(loc);
    }
    if (!Array.isArray(officer.locations)) {
      officer.locations = [];
    }
    if (officer.id && !officer.officerId) {
      officer.officerId = officer.id;
    }
    if (officer.officerId && !officer.id) {
      officer.id = officer.officerId;
    }
    return officer;
  }

  function createOfficer(extra) {
    extra = extra || {};
    var now = model.nowIso ? model.nowIso() : new Date().toISOString();
    var built = model.assign(
      {
        officerId: model.newId ? model.newId("ofc") : "ofc",
        entityType: "OFFICER",
        lastName: "",
        firstName: "",
        middleName: "",
        badge: "",
        callSign: "",
        duty: "available",
        role: "",
        team: "",
        eod: "",
        phoneGov: "",
        phonePrivate: "",
        locations: [],
        qualifications: [],
        qualOther: "",
        equipment: [],
        equipNotes: "",
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
    if (!built.officerId) {
      built.officerId = built.id || (model.newId ? model.newId("ofc") : "ofc");
    }
    if (!built.id) {
      built.id = built.officerId;
    }
    if (placeHasData(built.address) && !(built.locations && built.locations.length)) {
      built.locations = [locationFromAddress(built.address)];
    }
    if (!Array.isArray(built.locations)) {
      built.locations = [];
    }
    if (!Array.isArray(built.qualifications)) {
      built.qualifications = [];
    }
    if (!Array.isArray(built.equipment)) {
      built.equipment = [];
    }
    if (placeHasData(built.locations[0]) && !placeHasData(built.address)) {
      built.address = addressFromLocation(built.locations[0]);
    }
    return built;
  }

  model.createOfficer = createOfficer;
  model.locationFromAddress = locationFromAddress;
  model.addressFromLocation = addressFromLocation;
  model.officerAddress = officerAddress;
  model.officerCity = officerCity;
  model.syncOfficerPlaces = syncOfficerPlaces;
})(typeof window !== "undefined" ? window : globalThis);
