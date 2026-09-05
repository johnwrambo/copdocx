/** Pure map projections. Reads supplied snapshots; never reads DOM or persistence. */
(function (global) {
  "use strict";
  var root = (global.COPDoc = global.COPDoc || {});
  var projections = (root.projections = root.projections || {});

  function formatAddress(location) {
    if (!location) {
      return "";
    }
    var line1 = [location.street, location.street2].filter(Boolean).join(" ");
    var line2 = [location.city, location.state, location.zip]
      .filter(Boolean)
      .join(" ");
    return [line1, line2].filter(Boolean).join(", ");
  }

  function hasCoords(lat, lng) {
    var a = Number(lat);
    var b = Number(lng);
    return isFinite(a) && isFinite(b) && !(a === 0 && b === 0);
  }

  function parseCoords(text) {
    var m = String(text || "").match(
      /(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/
    );
    if (!m) {
      return null;
    }
    if (!hasCoords(m[1], m[2])) {
      return null;
    }
    return { latitude: m[1], longitude: m[2] };
  }

  function subjectFor(snapshot) {
    if (snapshot.person && snapshot.person.personId) {
      return snapshot.person;
    }
    return null;
  }

  function vehicleSummary(vehicle) {
    if (!vehicle) {
      return "";
    }
    return [vehicle.year, vehicle.make, vehicle.model, vehicle.licensePlate]
      .filter(Boolean)
      .join(" ");
  }

  function pushOwner(list, type, id) {
    var key = String(id || "").trim();
    if (!key) {
      return;
    }
    var i;
    for (i = 0; i < list.length; i++) {
      if (list[i].type === type && list[i].id === key) {
        return;
      }
    }
    list.push({ type: type, id: key });
  }

  function pinFromEncounter(encounter, storeState) {
    if (!encounter) {
      return null;
    }
    if (
      encounter.completed &&
      encounter.completed.pin &&
      hasCoords(encounter.completed.pin.latitude, encounter.completed.pin.longitude)
    ) {
      return encounter.completed.pin;
    }
    var source = encounter.completed || encounter;
    function fromLoc(loc) {
      loc = hydrateMapLocation(loc, storeState);
      if (!hasCoords(loc.latitude, loc.longitude)) {
        return null;
      }
      return {
        latitude: loc.latitude,
        longitude: loc.longitude,
        arrestLocation: formatAddress(loc),
        locationId: loc.locationId || ""
      };
    }
    var i;
    var pin;
    var locations = source.locations || [];
    var centerId = source.centerLocationId || encounter.centerLocationId || "";
    if (centerId) {
      for (i = 0; i < locations.length; i += 1) {
        if (locations[i] && locations[i].locationId === centerId) {
          pin = fromLoc(locations[i]);
          if (pin) {
            return pin;
          }
        }
      }
    }
    for (i = 0; i < locations.length; i += 1) {
      pin = fromLoc(locations[i]);
      if (pin) {
        return pin;
      }
    }
    var vehicles = source.vehicles || [];
    for (i = 0; i < vehicles.length; i += 1) {
      var nested = (vehicles[i] && vehicles[i].locations) || [];
      var j;
      for (j = 0; j < nested.length; j += 1) {
        pin = fromLoc(nested[j]);
        if (pin) {
          return pin;
        }
      }
    }
    return null;
  }

  function hydrateMapLocation(loc, storeState) {
    loc = loc || {};
    if (hasCoords(loc.latitude, loc.longitude)) {
      return loc;
    }
    var canonical =
      loc.locationId &&
      storeState &&
      storeState.locations &&
      storeState.locations[loc.locationId];
    if (canonical && hasCoords(canonical.latitude, canonical.longitude)) {
      return Object.assign({}, loc, {
        latitude: canonical.latitude,
        longitude: canonical.longitude,
        street: loc.street || canonical.street || "",
        city: loc.city || canonical.city || "",
        state: loc.state || canonical.state || "",
        zip: loc.zip || canonical.zip || ""
      });
    }
    var parsed = parseCoords(loc.latLong);
    if (parsed) {
      return Object.assign({}, loc, parsed);
    }
    return loc;
  }

  function completedEncounters(storeState) {
    var rows = [];
    var leads = (storeState && storeState.leads) || {};
    var encounters = (storeState && storeState.encounters) || {};
    Object.keys(encounters).forEach(function (encounterId) {
      var encounter = encounters[encounterId];
      if (!encounter) {
        return;
      }
      var source = encounter.completed;
      if (!source) {
        return;
      }
      var subjectNames = [];
      var personIds = [];
      (source.subjects || encounter.subjects || []).forEach(function (subject) {
        if (!subject) {
          return;
        }
        var name = [subject.lastName, subject.firstName].filter(Boolean).join(", ");
        if (name && subjectNames.indexOf(name) === -1) {
          subjectNames.push(name);
        }
        var personId = subject.personId || "";
        if (!personId && subject.leadId && leads[subject.leadId]) {
          var person = subjectFor(leads[subject.leadId]);
          personId = person && (person.personId || person.id) || "";
        }
        if (personId && personIds.indexOf(personId) === -1) {
          personIds.push(personId);
        }
      });
      var places = [];
      (source.locations || []).forEach(function (location) {
        places.push({
          location: hydrateMapLocation(location, storeState),
          vehicle: null
        });
      });
      (source.vehicles || []).forEach(function (vehicle) {
        (vehicle && vehicle.locations ? vehicle.locations : []).forEach(function (location) {
          places.push({
            location: hydrateMapLocation(location, storeState),
            vehicle: vehicle
          });
        });
      });
      if (!places.length && source.pin) {
        places.push({
          location: {
            locationId: source.pin.locationId || "",
            latitude: source.pin.latitude,
            longitude: source.pin.longitude,
            street: source.pin.arrestLocation || ""
          },
          vehicle: null
        });
      }
      if (!places.length) {
        places.push({ location: null, vehicle: null });
      }
      var seen = Object.create(null);
      places.forEach(function (place, index) {
        var loc = place.location || {};
        var vehicle = place.vehicle;
        var vehicleId = vehicle && (vehicle.vehicleId || vehicle.id) || "";
        var address = formatAddress(loc) || "(no location)";
        var key = [loc.locationId || "", vehicleId, address, loc.latitude || "", loc.longitude || ""].join("|");
        if (seen[key]) {
          return;
        }
        seen[key] = true;
        var objectOwners = [];
        pushOwner(objectOwners, "LOCATION", loc.locationId);
        pushOwner(objectOwners, "VEHICLE", vehicleId);
        var owners = objectOwners.slice();
        var people = [];
        personIds.forEach(function (personId) {
          pushOwner(people, "PERSON", personId);
          pushOwner(owners, "PERSON", personId);
        });
        var subjectLine = subjectNames.join("; ") || "No booked subjects";
        var date = String(source.startedAt || encounter.startedAt || "").slice(0, 10) || "—";
        rows.push({
          category: "encounters",
          id:
            "encounters:" +
            encounterId +
            ":" +
            (loc.locationId || vehicleId || String(index)),
          encounterId: encounterId,
          personId: personIds[0] || "",
          locationId: loc.locationId || "",
          vehicleId: vehicleId,
          subject: subjectNames.join("; ") || "Encounter " + encounterId,
          extra: [encounterId, date, vehicleSummary(vehicle)].filter(Boolean).join(" · "),
          address: address,
          association: "Encounter location",
          latitude: loc.latitude || "",
          longitude: loc.longitude || "",
          hasCoords: hasCoords(loc.latitude, loc.longitude),
          photoOwners: owners,
          objectPhotoOwners: objectOwners,
          personPhotoOwners: people,
          flags: encounterFlags(encounter, source),
          cols: [date, encounterId, subjectLine, address]
        });
      });
    });
    rows.sort(function (a, b) {
      return String(b.cols[0]).localeCompare(String(a.cols[0]));
    });
    return rows;
  }

  function encounterFlags(encounter, source) {
    source = source || encounter || {};
    var subjects = source.subjects || (encounter && encounter.subjects) || [];
    var counts = source.outcomeCounts || {};
    var fled = Number(counts.fled) > 0;
    subjects.forEach(function (subject) {
      var outcome = String((subject && subject.outcome) || "").toUpperCase();
      if (outcome.indexOf("FLED") === 0) {
        fled = true;
      }
    });
    var eventType = String(
      source.eventType || (encounter && encounter.eventType) || ""
    ).toUpperCase();
    return {
      fled: fled,
      collision:
        eventType === "COLLISION" ||
        source.collisionOccurred === true ||
        Number(source.collisionCount) > 0
    };
  }

  function heatPoints(arrestRows) {
    var points = [];
    (arrestRows || []).forEach(function (row) {
      if (!row || !row.hasCoords) {
        return;
      }
      points.push({
        lat: Number(row.latitude),
        lng: Number(row.longitude),
        row: row
      });
    });
    return points;
  }

  function heatCellSize(zoom) {
    zoom = zoom == null ? 10 : zoom;
    if (zoom >= 15) {
      return 0.0035;
    }
    if (zoom >= 13) {
      return 0.007;
    }
    if (zoom >= 11) {
      return 0.014;
    }
    if (zoom >= 9) {
      return 0.03;
    }
    return 0.06;
  }

  function computeHeatPeaksGeo(points, cellDeg) {
    cellDeg = Number(cellDeg) || 0.015;
    var grid = Object.create(null);
    (points || []).forEach(function (point) {
      var lat = Number(point.lat != null ? point.lat : point.latitude);
      var lng = Number(point.lng != null ? point.lng : point.longitude);
      if (!isFinite(lat) || !isFinite(lng)) {
        return;
      }
      var cx = Math.round(lng / cellDeg);
      var cy = Math.round(lat / cellDeg);
      var key = cx + ":" + cy;
      if (!grid[key]) {
        grid[key] = { cx: cx, cy: cy, count: 0, lat: 0, lng: 0 };
      }
      grid[key].count += 1;
      grid[key].lat += lat;
      grid[key].lng += lng;
    });
    var peaks = [];
    Object.keys(grid).forEach(function (key) {
      var cell = grid[key];
      if (cell.count < 2) {
        return;
      }
      var neighborMax = 0;
      var dx;
      var dy;
      for (dx = -1; dx <= 1; dx += 1) {
        for (dy = -1; dy <= 1; dy += 1) {
          if (!dx && !dy) {
            continue;
          }
          var neighbor = grid[cell.cx + dx + ":" + (cell.cy + dy)];
          if (neighbor && neighbor.count > neighborMax) {
            neighborMax = neighbor.count;
          }
        }
      }
      if (cell.count <= neighborMax) {
        return;
      }
      var lat = cell.lat / cell.count;
      var lng = cell.lng / cell.count;
      peaks.push({
        category: "arrestHeat",
        id: "arrestHeat:" + cell.cx + ":" + cell.cy,
        subject: cell.count + " arrests",
        extra: "Local maximum",
        address: lat.toFixed(4) + ", " + lng.toFixed(4),
        latitude: lat,
        longitude: lng,
        hasCoords: true,
        count: cell.count,
        cols: ["Local max", String(cell.count), lat.toFixed(4) + ", " + lng.toFixed(4)]
      });
    });
    peaks.sort(function (a, b) {
      return b.count - a.count;
    });
    return peaks;
  }

  projections.map = Object.freeze({
    formatAddress: formatAddress, hasCoords: hasCoords, parseCoords: parseCoords,
    subjectFor: subjectFor, vehicleSummary: vehicleSummary, pushOwner: pushOwner,
    encounterPin: pinFromEncounter, hydrateLocation: hydrateMapLocation,
    completedEncounters: completedEncounters, encounterFlags: encounterFlags,
    heatPoints: heatPoints, heatCellSize: heatCellSize, heatPeaks: computeHeatPeaksGeo
  });
})(typeof window !== "undefined" ? window : globalThis);
