/**
 * Map location layers: active targets, arrests, encounters, officer homes, origin finds.
 * Icon library assigns a glyph to a category or a single pin.
 * Writes only copdocx.map.layers.v1 and copdocx.map.icons.v1.
 */
(function (global) {
  "use strict";

  var root = (global.COPDoc = global.COPDoc || {});
  var api = (root.map = root.map || {});
  var config = root.config;
  var LAYER_KEY =
    (config && config.storageKey("mapLayers")) || "copdocx.map.layers.v1";
  var ICON_KEY =
    (config && config.storageKey("mapIcons")) || "copdocx.map.icons.v1";
  var ADMIN_KEY =
    (config && config.storageKey("admin")) || "copdoc.admin.v1";
  var LEGACY_PALETTE = [
    "Crosshair",
    "MapPin",
    "MapPinned",
    "Shield",
    "Users",
    "Car",
    "Star",
    "Navigation",
    "Radio",
    "Focus",
    "Archive"
  ];
  var DEFAULT_ICONS = {
    targets: "Target",
    arrests: "Arrest",
    encounters: "Contact",
    officers: "OfficerHome",
    origin: "Origin"
  };
  var CATEGORY_COLORS = {
    targets: "#f0ad35",
    arrests: "#e96868",
    encounters: "#b58bea",
    officers: "#68a8e8",
    origin: "#55c7bd"
  };
  var MARKER_LABELS = {
    targets: "Active target",
    arrests: "Arrest",
    encounters: "Encounter",
    officers: "Officer home",
    origin: "Origin or find"
  };
  var DEFAULT_VISIBLE = {
    targets: true,
    arrests: true,
    encounters: true,
    officers: true,
    origin: false,
    markup: true,
    arrestHeat: false
  };
  var HEADERS = {
    targets: ["Rank", "Subject", "Address", "Association"],
    arrests: ["Date", "Subject", "Charge", "Location"],
    encounters: ["Date", "Encounter", "Subjects", "Location"],
    officers: ["Officer", "Address", "Duty"],
    origin: ["Subject", "Address", "Association"],
    markup: ["Type", "Text"],
    arrestHeat: ["Peak", "Arrests", "Center"]
  };
  var EMPTY = {
    targets: "No ranked target locations.",
    arrests: "No arrest locations on filed cases.",
    encounters: "No completed encounters yet.",
    officers: "No officer home addresses with coordinates.",
    origin: "No plate-check / origin locations.",
    markup: "No labels or arrows yet.",
    arrestHeat: "No arrest clusters yet."
  };
  var LAYER_ORDER = [
    ["targets", "Active targets"],
    ["arrests", "Arrests"],
    ["arrestHeat", "Arrest heat"],
    ["encounters", "Encounters"],
    ["officers", "Officer homes"],
    ["origin", "Origin / finds"],
    ["markup", "Markup"]
  ];
  var ICON_SIZE_MIN = 20;
  var ICON_SIZE_MAX = 56;
  var ICON_SIZE_DEFAULT = 32;
  var ICON_STROKE_MIN = 1;
  var ICON_STROKE_MAX = 4;
  var ICON_STROKE_DEFAULT = 2;
  var ICON_FILL_MIN = 0;
  var ICON_FILL_MAX = 100;
  var ICON_FILL_DEFAULT = 40;
  var NEUTRAL_PIN_COLOR = "#5e7887";
  var ICON_OPTION_KEYS = ["labels", "badges"];
  var DEFAULT_ICON_OPTIONS = {
    labels: false,
    badges: true
  };
  var VISUAL_FILTERS = [
    {
      id: "targetOther",
      group: "targets",
      label: "Regular",
      icon: "Target",
      color: "#5e7887",
      other: true
    },
    {
      id: "criminal",
      group: "targets",
      label: "Criminal",
      icon: "TargetCriminal",
      color: "#e96868"
    },
    {
      id: "finalOrder",
      group: "targets",
      label: "Final order",
      icon: "TargetFinalOrder",
      color: "#c45c26"
    },
    {
      id: "reinstate",
      group: "targets",
      label: "Reinstatement",
      icon: "TargetReinstate",
      color: "#8b5a2b"
    },
    {
      id: "encounterOther",
      group: "encounters",
      label: "Regular",
      icon: "Contact",
      color: "#5e7887",
      other: true
    },
    {
      id: "fled",
      group: "encounters",
      label: "Fled",
      icon: "EncounterFled",
      color: "#b58bea"
    },
    {
      id: "collision",
      group: "encounters",
      label: "Collision",
      icon: "EncounterCollision",
      color: "#f0ad35"
    }
  ];

  var catalog = {
    targets: [],
    arrests: [],
    arrestHeat: [],
    encounters: [],
    officers: [],
    origin: []
  };
  var visible = Object.assign({}, DEFAULT_VISIBLE);
  var icons = {
    libraryId: "standard",
    category: Object.assign({}, DEFAULT_ICONS),
    pins: {},
    size: ICON_SIZE_DEFAULT,
    stroke: ICON_STROKE_DEFAULT,
    fillOpacity: ICON_FILL_DEFAULT,
    labels: DEFAULT_ICON_OPTIONS.labels,
    badges: DEFAULT_ICON_OPTIONS.badges,
    filters: {},
    hiddenPins: {},
    hiddenLabels: {}
  };
  var listId = "targets";
  var pendingIcon = "";
  var pendingFilterId = "";
  var selectedId = "";
  var groups = {};
  var markersById = {};
  var fitted = false;
  var popupUrls = [];
  var dockTab = "layers";
  var heatCanvas = null;
  var heatRedrawBound = false;

  function byId(id) {
    return document.getElementById(id);
  }

  function loadJson(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (err) {
      return fallback;
    }
  }

  function saveJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (err) {}
  }

  function copyIdFlagMap(value) {
    var out = {};
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return out;
    }
    Object.keys(value).forEach(function (key) {
      if (key && value[key]) {
        out[key] = true;
      }
    });
    return out;
  }

  function isPinHidden(id) {
    return !!(icons.hiddenPins && icons.hiddenPins[id]);
  }

  function isLabelHidden(id) {
    return !!(icons.hiddenLabels && icons.hiddenLabels[id]);
  }

  function hiddenCount() {
    return (
      Object.keys(icons.hiddenPins || {}).length +
      Object.keys(icons.hiddenLabels || {}).length
    );
  }

  function loadPrefs() {
    var layers = loadJson(LAYER_KEY, null);
    if (layers && layers.visible) {
      Object.keys(DEFAULT_VISIBLE).forEach(function (k) {
        if (typeof layers.visible[k] === "boolean") {
          visible[k] = layers.visible[k];
        }
      });
    }
    var stored = loadJson(ICON_KEY, null);
    if (stored && stored.category) {
      Object.keys(DEFAULT_ICONS).forEach(function (k) {
        if (stored.category[k]) {
          icons.category[k] = stored.category[k];
        }
      });
    }
    if (stored && stored.pins && typeof stored.pins === "object") {
      icons.pins = stored.pins;
    }
    icons.size =
      stored && stored.size != null
        ? clampIconSize(stored.size)
        : ICON_SIZE_DEFAULT;
    ICON_OPTION_KEYS.forEach(function (key) {
      icons[key] =
        stored && typeof stored[key] === "boolean"
          ? stored[key]
          : DEFAULT_ICON_OPTIONS[key];
    });
    icons.stroke =
      stored && stored.stroke != null
        ? clampIconStroke(stored.stroke)
        : ICON_STROKE_DEFAULT;
    icons.fillOpacity =
      stored && stored.fillOpacity != null
        ? clampIconFill(stored.fillOpacity)
        : ICON_FILL_DEFAULT;
    icons.hiddenPins = copyIdFlagMap(stored && stored.hiddenPins);
    icons.hiddenLabels = copyIdFlagMap(stored && stored.hiddenLabels);
    icons.filters = {};
    VISUAL_FILTERS.forEach(function (spec) {
      var saved =
        stored && stored.filters && stored.filters[spec.id]
          ? stored.filters[spec.id]
          : {};
      icons.filters[spec.id] = {
        visible: saved.visible !== false,
        color: safeFilterColor(saved.color, spec.color),
        icon: saved.icon || spec.icon
      };
    });
    var mapIcons = mapIconApi();
    if (mapIcons && typeof mapIcons.setLibrary === "function") {
      if (stored && stored.libraryId) {
        mapIcons.setLibrary(stored.libraryId, {
          persist: false,
          notify: false
        });
      }
      icons.libraryId =
        typeof mapIcons.getLibraryId === "function"
          ? mapIcons.getLibraryId()
          : "standard";
    }
  }

  function saveLayers() {
    saveJson(LAYER_KEY, { visible: visible });
  }

  function saveIcons() {
    var mapIcons = mapIconApi();
    if (mapIcons && typeof mapIcons.getLibraryId === "function") {
      icons.libraryId = mapIcons.getLibraryId();
    }
    saveJson(ICON_KEY, icons);
  }

  function committed(row) {
    return !row || !row.meta || row.meta.status !== "draft";
  }

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

  function associationLabel(code) {
    var labels = {
      residence: "Residence",
      home: "Home",
      work: "Work",
      "plate-check": "Plate check",
      registration: "Registration",
      "known-parking": "Known parking"
    };
    return labels[code] || code || "";
  }

  function priorityLabel(rank) {
    var n = Number(rank);
    if (n === 1) {
      return "Primary";
    }
    if (n === 2) {
      return "Secondary";
    }
    if (n === 3) {
      return "Tertiary";
    }
    return n ? String(n) : "";
  }

  function subjectFor(snapshot) {
    if (snapshot.person && snapshot.person.personId) {
      return snapshot.person;
    }
    return null;
  }

  function walkLeadLocations(snapshot) {
    var rows = [];
    var subject = subjectFor(snapshot);
    if (subject && subject.locations) {
      subject.locations.forEach(function (location) {
        rows.push({ location: location });
      });
    }
    (snapshot.vehicles || []).forEach(function (vehicle) {
      (vehicle.locations || []).forEach(function (location) {
        rows.push({
          location: location,
          plate: vehicle.licensePlate || "",
          vehicleId: vehicle.vehicleId || vehicle.id || "",
          extra: vehicleSummary(vehicle)
        });
      });
    });
    (snapshot.locations || []).forEach(function (location) {
      rows.push({ location: location });
    });
    return rows;
  }

  function personLabel(person) {
    if (root.model && root.model.formatPersonLabel) {
      return root.model.formatPersonLabel(person) || "Untitled";
    }
    return "Untitled";
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

  function placePhotoOwners(locationId, vehicleId, origin) {
    var owners = [];
    if (origin) {
      pushOwner(owners, "VEHICLE", vehicleId);
      pushOwner(owners, "LOCATION", locationId);
    } else {
      pushOwner(owners, "LOCATION", locationId);
      pushOwner(owners, "VEHICLE", vehicleId);
    }
    return owners;
  }

  function linkedPersonOwners(storeState, snapshot, objectRefs, seedPersonId) {
    var owners = [];
    pushOwner(owners, "PERSON", seedPersonId);
    var links = Object.keys((storeState && storeState.associations) || {}).map(function (id) {
      return storeState.associations[id];
    }).concat((snapshot && snapshot.links) || []);
    (objectRefs || []).forEach(function (ref) {
      if (!ref || !ref.id) {
        return;
      }
      var type = String(ref.type || "").toUpperCase();
      var id = String(ref.id);
      links.forEach(function (link) {
        if (!link || link.junked || !link.from || !link.to) {
          return;
        }
        var fromType = String(link.from.type || "").toUpperCase();
        var toType = String(link.to.type || "").toUpperCase();
        if (fromType === "PERSON" && toType === type && String(link.to.id || "") === id) {
          pushOwner(owners, "PERSON", link.from.id);
        }
        if (toType === "PERSON" && fromType === type && String(link.from.id || "") === id) {
          pushOwner(owners, "PERSON", link.to.id);
        }
      });
    });
    return owners;
  }

  function caseWindowNameFor(leadId) {
    return "copdoc-case-" + String(leadId || "").replace(/[^A-Za-z0-9_-]/g, "_");
  }

  function popupPinFor(row) {
    var extraBits = [];
    if (row.extra) {
      extraBits.push(row.extra);
    }
    if (row.association && extraBits.indexOf(row.association) === -1) {
      extraBits.push(row.association);
    }
    var pin = {
      title: row.subject || "",
      extra: extraBits.join(" · "),
      address: row.address && row.address !== "(no street)" ? row.address : "",
      occupancy: row.occupancy || "",
      isPrimary: row.category === "targets" && Number(row.priority) === 1,
      photoOwners: row.photoOwners || [],
      objectPhotoOwners: row.objectPhotoOwners,
      personPhotoOwners: row.personPhotoOwners,
      photoDataUrl: row.photoDataUrl || ""
    };
    if (row.category === "targets" && row.leadId) {
      pin.caseUrl = "case.html?id=" + encodeURIComponent(row.leadId);
      pin.caseWindowName = caseWindowNameFor(row.leadId);
      pin.caseLabel = "Open case";
    }
    return pin;
  }

  function revokePopupUrls() {
    if (root.mapPopup && root.mapPopup.revoke) {
      root.mapPopup.revoke(popupUrls);
    } else {
      popupUrls.forEach(function (url) {
        if (url && String(url).indexOf("blob:") === 0) {
          URL.revokeObjectURL(url);
        }
      });
    }
    popupUrls = [];
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

  function collectEncounters(storeState) {
    catalog.encounters = [];
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
        catalog.encounters.push({
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
    catalog.encounters.sort(function (a, b) {
      return String(b.cols[0]).localeCompare(String(a.cols[0]));
    });
  }

  function collectLeads() {
    catalog.targets = [];
    catalog.arrests = [];
    catalog.origin = [];
    var model = root.model;
    if (!model || !model.store) {
      return;
    }
    model.store.loadFromDisk();
    var storeState = model.store.getState() || {};
    var leads = storeState.leads || {};
    Object.keys(leads).forEach(function (leadId) {
      var snap = leads[leadId];
      if (!committed(snap)) {
        return;
      }
      var subject = subjectFor(snap);
      var name = personLabel(subject);
      var personId = (subject && (subject.personId || subject.id)) || "";
      walkLeadLocations(snap).forEach(function (row) {
        var loc = row.location;
        if (!loc) {
          return;
        }
        var assoc = loc.association || loc.locationAssociation || "";
        var vehicleId = row.vehicleId || "";
        var personOwners = linkedPersonOwners(
          storeState,
          snap,
          [
            { type: "LOCATION", id: loc.locationId || "" },
            { type: "VEHICLE", id: vehicleId }
          ],
          personId
        );
        var base = {
          leadId: leadId,
          personId: personId,
          locationId: loc.locationId || "",
          vehicleId: vehicleId,
          subject: name,
          extra: row.extra || row.plate || "",
          address: formatAddress(loc) || "(no street)",
          association: associationLabel(assoc),
          associationCode: assoc,
          latitude: loc.latitude,
          longitude: loc.longitude,
          hasCoords: hasCoords(loc.latitude, loc.longitude),
          flags: personFlags(subject)
        };
        if (loc.targetPriority) {
          catalog.targets.push(
            Object.assign({}, base, {
              category: "targets",
              id: "targets:" + (loc.locationId || leadId),
              priority: Number(loc.targetPriority) || 99,
              priorityLabel: priorityLabel(loc.targetPriority),
              photoOwners: placePhotoOwners(loc.locationId, vehicleId, false),
              objectPhotoOwners: placePhotoOwners(loc.locationId, vehicleId, false),
              personPhotoOwners: personOwners,
              cols: [
                priorityLabel(loc.targetPriority),
                name,
                base.address,
                base.association
              ]
            })
          );
        }
        if (assoc === "plate-check") {
          catalog.origin.push(
            Object.assign({}, base, {
              category: "origin",
              id: "origin:" + (loc.locationId || leadId),
              photoOwners: placePhotoOwners(loc.locationId, vehicleId, true),
              objectPhotoOwners: placePhotoOwners(loc.locationId, vehicleId, true),
              personPhotoOwners: personOwners,
              cols: [name, base.address, base.association]
            })
          );
        }
      });
      var canonicalPerson = storeState.people && storeState.people[personId];
      var arrests = canonicalPerson && Array.isArray(canonicalPerson.arrests)
        ? canonicalPerson.arrests
        : (subject && subject.arrests ? subject.arrests : []);
      arrests.forEach(function (arr) {
        if (!arr || arr.voidedAt) { return; }
        var parsed = parseCoords(arr.arrestLocation);
        var lat = arr.latitude || (parsed && parsed.latitude) || "";
        var lng = arr.longitude || (parsed && parsed.longitude) || "";
        var pinAddress = arr.arrestLocation || "";
        if (!hasCoords(lat, lng) && arr.encounterId && storeState.encounters) {
          var pin = pinFromEncounter(
            storeState.encounters[arr.encounterId],
            storeState
          );
          if (pin && hasCoords(pin.latitude, pin.longitude)) {
            lat = pin.latitude;
            lng = pin.longitude;
            pinAddress = pin.arrestLocation || pinAddress;
          }
        }
        var arrestOwners = [];
        pushOwner(arrestOwners, "PERSON", personId);
        catalog.arrests.push({
          category: "arrests",
          id: "arrests:" + (arr.arrestId || leadId),
          leadId: leadId,
          personId: personId,
          subject: name,
          extra: arr.arrestCharge || "",
          address: pinAddress || "(no location)",
          latitude: lat,
          longitude: lng,
          hasCoords: hasCoords(lat, lng),
          photoOwners: arrestOwners,
          objectPhotoOwners: [],
          personPhotoOwners: arrestOwners,
          cols: [
            arr.arrestDate || "—",
            name,
            arr.arrestCharge || "—",
            pinAddress || "(no location)"
          ]
        });
      });
    });
    catalog.targets.sort(function (a, b) {
      if (a.priority !== b.priority) {
        return a.priority - b.priority;
      }
      return String(a.subject).localeCompare(String(b.subject));
    });
    collectEncounters(storeState);
  }

  function collectOfficers() {
    catalog.officers = [];
    var parsed = loadJson(ADMIN_KEY, { officers: [] });
    (parsed.officers || []).forEach(function (officer) {
      if (!committed(officer) || officer.junked) {
        return;
      }
      var locs = officer.locations || [];
      var home = null;
      locs.forEach(function (loc) {
        var assoc = loc.association || loc.locationAssociation || "";
        if (assoc === "residence" || assoc === "home") {
          home = loc;
        }
      });
      if (!home && officer.address) {
        var a =
          officer.address.association ||
          officer.address.locationAssociation ||
          "";
        if (a === "residence" || a === "home") {
          home = officer.address;
        }
      }
      if (!home) {
        return;
      }
      var name = [officer.lastName, officer.firstName].filter(Boolean).join(", ");
      if (officer.lastName && officer.firstName) {
        name = officer.lastName + ", " + officer.firstName;
      }
      var officerId = officer.officerId || officer.id || "";
      var officerOwners = [];
      pushOwner(officerOwners, "LOCATION", home.locationId);
      pushOwner(officerOwners, "OFFICER", officerId);
      catalog.officers.push({
        category: "officers",
        id: "officers:" + officerId,
        officerId: officerId,
        locationId: home.locationId || "",
        subject: name || "Officer",
        extra: officer.duty || "",
        address: formatAddress(home) || "(no street)",
        latitude: home.latitude,
        longitude: home.longitude,
        hasCoords: hasCoords(home.latitude, home.longitude),
        photoOwners: officerOwners,
        objectPhotoOwners: home.locationId
          ? [{ type: "LOCATION", id: home.locationId }]
          : [],
        personPhotoOwners: officerId
          ? [{ type: "OFFICER", id: officerId }]
          : [],
        cols: [name || "Officer", formatAddress(home) || "(no street)", officer.duty || ""]
      });
    });
  }

  function iconNameFor(row) {
    var fallback = DEFAULT_ICONS[row && row.category] || "Location";
    var filter = activeFilterFor(row);
    var name =
      filter && filter.icon
        ? filter.icon
        : row && icons.pins[row.id]
          ? icons.pins[row.id]
          : icons.category[row && row.category] || fallback;
    var mapIcons = mapIconApi();
    if (mapIcons && typeof mapIcons.isKnown === "function") {
      return mapIcons.isKnown(name) ? name : fallback;
    }
    if (global.COPDoc && COPDoc.icons && COPDoc.icons.ICONS) {
      return COPDoc.icons.ICONS[name] ? name : fallback;
    }
    return name;
  }

  function mapIconApi() {
    return global.COPDoc && COPDoc.mapIcons ? COPDoc.mapIcons : null;
  }

  function clampIconSize(value) {
    var n = Math.round(Number(value));
    if (!isFinite(n)) {
      return ICON_SIZE_DEFAULT;
    }
    return Math.max(ICON_SIZE_MIN, Math.min(ICON_SIZE_MAX, n));
  }

  function clampIconStroke(value) {
    var n = Math.round(Number(value));
    if (!isFinite(n)) {
      return ICON_STROKE_DEFAULT;
    }
    return Math.max(ICON_STROKE_MIN, Math.min(ICON_STROKE_MAX, n));
  }

  function iconStrokeWidth() {
    return clampIconStroke(icons.stroke);
  }

  function clampIconFill(value) {
    var n = Math.round(Number(value));
    if (!isFinite(n)) {
      return ICON_FILL_DEFAULT;
    }
    return Math.max(ICON_FILL_MIN, Math.min(ICON_FILL_MAX, n));
  }

  function iconFillOpacity() {
    return clampIconFill(icons.fillOpacity) / 100;
  }

  function safeFilterColor(value, fallback) {
    var color = String(value || "").trim();
    if (/^#[0-9a-fA-F]{6}$/.test(color)) {
      return color.toLowerCase();
    }
    if (/^#[0-9a-fA-F]{3}$/.test(color)) {
      return (
        "#" +
        color.charAt(1) +
        color.charAt(1) +
        color.charAt(2) +
        color.charAt(2) +
        color.charAt(3) +
        color.charAt(3)
      ).toLowerCase();
    }
    return fallback || NEUTRAL_PIN_COLOR;
  }

  function defaultFilterState(spec) {
    return {
      visible: true,
      color: spec.color,
      icon: spec.icon
    };
  }

  function filterState(id) {
    var spec = VISUAL_FILTERS.filter(function (row) {
      return row.id === id;
    })[0];
    if (!spec) {
      return null;
    }
    var stored = icons.filters && icons.filters[id];
    if (!stored) {
      return defaultFilterState(spec);
    }
    return {
      visible: stored.visible !== false,
      color: safeFilterColor(stored.color, spec.color),
      icon: stored.icon || spec.icon
    };
  }

  function setFilterState(id, patch, persist) {
    var spec = VISUAL_FILTERS.filter(function (row) {
      return row.id === id;
    })[0];
    if (!spec) {
      return null;
    }
    var next = Object.assign(filterState(id), patch || {});
    if (patch && Object.prototype.hasOwnProperty.call(patch, "color")) {
      next.color = safeFilterColor(patch.color, spec.color);
    }
    if (patch && Object.prototype.hasOwnProperty.call(patch, "icon") && patch.icon) {
      next.icon = String(patch.icon);
    }
    if (patch && Object.prototype.hasOwnProperty.call(patch, "visible")) {
      next.visible = !!patch.visible;
    } else if (patch && Object.prototype.hasOwnProperty.call(patch, "on")) {
      next.visible = !!patch.on;
    }
    icons.filters = icons.filters || {};
    icons.filters[id] = {
      visible: next.visible !== false,
      color: next.color,
      icon: next.icon
    };
    paintVisualFilters();
    paintPalette();
    plotAll();
    renderList();
    if (persist !== false) {
      saveIcons();
    }
    return next;
  }

  function personFlags(person) {
    person = person || {};
    var imm = person.immigration || {};
    var criminal = person.criminal || {};
    var disposition = String(imm.disposition || "").toUpperCase();
    return {
      finalOrder: !!(imm.finalOrder || imm.finalOrderDate),
      reinstate: /REINST/.test(disposition),
      criminal: !!(
        criminal.isCriminal ||
        criminal.hasCriminalRecord ||
        criminal.hasCriminalWarrants
      )
    };
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

  function matchingFilterIds(row) {
    if (!row || (row.category !== "targets" && row.category !== "encounters")) {
      return [];
    }
    var flags = row.flags || {};
    var ids = [];
    VISUAL_FILTERS.forEach(function (spec) {
      if (spec.group !== row.category || spec.other) {
        return;
      }
      if (flags[spec.id]) {
        ids.push(spec.id);
      }
    });
    if (!ids.length) {
      VISUAL_FILTERS.forEach(function (spec) {
        if (spec.group === row.category && spec.other) {
          ids.push(spec.id);
        }
      });
    }
    return ids;
  }

  function isFilterVisible(id) {
    var state = filterState(id);
    return !state || state.visible !== false;
  }

  function rowPassesFilters(row) {
    if (!row) {
      return false;
    }
    var ids = matchingFilterIds(row);
    if (!ids.length) {
      return true;
    }
    return ids.some(isFilterVisible);
  }

  function activeFilterFor(row) {
    if (!row) {
      return null;
    }
    var ids = matchingFilterIds(row);
    var i;
    for (i = 0; i < VISUAL_FILTERS.length; i += 1) {
      var spec = VISUAL_FILTERS[i];
      if (ids.indexOf(spec.id) === -1) {
        continue;
      }
      var state = filterState(spec.id);
      if (state && state.visible !== false) {
        return Object.assign({ id: spec.id, label: spec.label }, state);
      }
    }
    return null;
  }

  function iconPixelSize() {
    return clampIconSize(icons.size);
  }

  function iconBoxSize() {
    return iconPixelSize() + 12;
  }

  function iconOptionOn(key) {
    if (typeof icons[key] === "boolean") {
      return icons[key];
    }
    return DEFAULT_ICON_OPTIONS[key] === true;
  }

  function iconOptionsState() {
    return {
      labels: iconOptionOn("labels"),
      badges: iconOptionOn("badges")
    };
  }

  function pinLabelText(row) {
    var text = String((row && row.subject) || "").trim();
    if (!text) {
      return "";
    }
    return text.length > 28 ? text.slice(0, 26) + "…" : text;
  }

  function boxesOverlap(a, b, pad) {
    pad = pad || 3;
    return !(
      a[0] + a[2] + pad <= b[0] ||
      b[0] + b[2] + pad <= a[0] ||
      a[1] + a[3] + pad <= b[1] ||
      b[1] + b[3] + pad <= a[1]
    );
  }

  function pickLabelPlace(marker, row, used, map) {
    var text = pinLabelText(row);
    var pt = map.latLngToContainerPoint(marker.getLatLng());
    var width = Math.min(220, 28 + text.length * 7);
    var height = 22;
    var radius = Math.max(10, Math.round(iconBoxSize() / 2));
    var gap = 6;
    var candidates = [
      {
        dir: "right",
        offset: [radius + gap, 0],
        box: [pt.x + radius + gap, pt.y - height / 2, width, height]
      },
      {
        dir: "left",
        offset: [-(radius + gap), 0],
        box: [pt.x - radius - gap - width, pt.y - height / 2, width, height]
      },
      {
        dir: "top",
        offset: [0, -(radius + gap)],
        box: [pt.x - width / 2, pt.y - radius - gap - height, width, height]
      },
      {
        dir: "bottom",
        offset: [0, radius + gap],
        box: [pt.x - width / 2, pt.y + radius + gap, width, height]
      }
    ];
    var step;
    for (step = 1; step <= 8; step += 1) {
      var dy = step * (height + 3);
      candidates.push({
        dir: "right",
        offset: [radius + gap, dy],
        box: [pt.x + radius + gap, pt.y - height / 2 + dy, width, height]
      });
      candidates.push({
        dir: "right",
        offset: [radius + gap, -dy],
        box: [pt.x + radius + gap, pt.y - height / 2 - dy, width, height]
      });
      candidates.push({
        dir: "left",
        offset: [-(radius + gap), dy],
        box: [pt.x - radius - gap - width, pt.y - height / 2 + dy, width, height]
      });
    }
    var i;
    var j;
    for (i = 0; i < candidates.length; i += 1) {
      var hit = false;
      for (j = 0; j < used.length; j += 1) {
        if (boxesOverlap(candidates[i].box, used[j])) {
          hit = true;
          break;
        }
      }
      if (!hit) {
        return candidates[i];
      }
    }
    return candidates[0];
  }

  function labelNode(row) {
    var wrap = document.createElement("span");
    wrap.className = "map-pin-name-inner";
    var text = document.createElement("span");
    text.textContent = pinLabelText(row);
    wrap.appendChild(text);
    var hide = document.createElement("button");
    hide.type = "button";
    hide.className = "map-pin-name-hide";
    hide.title = "Hide this name";
    hide.setAttribute("aria-label", "Hide name for " + pinLabelText(row));
    hide.innerHTML =
      global.COPDoc && COPDoc.icon ? COPDoc.icon("EyeOff", 12) : "hide";
    hide.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();
      hideLabel(row.id);
    });
    wrap.appendChild(hide);
    return wrap;
  }

  function bindLabel(marker, row, place) {
    if (!marker || typeof marker.bindTooltip !== "function") {
      return;
    }
    marker.bindTooltip(labelNode(row), {
      permanent: true,
      direction: place.dir,
      offset: place.offset,
      opacity: 1,
      className: "map-pin-name"
    });
  }

  function labeledMarkerItems() {
    var items = [];
    Object.keys(markersById).forEach(function (id) {
      var marker = markersById[id];
      var row = marker && marker._mapRow;
      if (!row || isPinHidden(id) || isLabelHidden(id)) {
        return;
      }
      if (!pinLabelText(row)) {
        return;
      }
      items.push({ id: id, marker: marker, row: row });
    });
    items.sort(function (a, b) {
      var pa = Number(a.row.priority) || 99;
      var pb = Number(b.row.priority) || 99;
      if (pa !== pb) {
        return pa - pb;
      }
      return String(a.row.subject || "").localeCompare(String(b.row.subject || ""));
    });
    return items;
  }

  function layoutLabels() {
    Object.keys(markersById).forEach(function (id) {
      var marker = markersById[id];
      if (marker && typeof marker.unbindTooltip === "function") {
        marker.unbindTooltip();
      }
    });
    var map = api.leaflet;
    if (!iconOptionOn("labels") || !map || typeof map.latLngToContainerPoint !== "function") {
      return;
    }
    var used = [];
    labeledMarkerItems().forEach(function (item) {
      var place = pickLabelPlace(item.marker, item.row, used, map);
      used.push(place.box);
      bindLabel(item.marker, item.row, place);
    });
  }

  function bindLabelLayout() {
    var map = api.leaflet;
    if (!map || map._copdocLabelLayout) {
      return;
    }
    map._copdocLabelLayout = true;
    map.on("zoomend moveend", function () {
      layoutLabels();
    });
  }

  function hidePin(id) {
    if (!id) {
      return;
    }
    icons.hiddenPins = icons.hiddenPins || {};
    icons.hiddenPins[id] = true;
    saveIcons();
    var marker = markersById[id];
    if (marker) {
      var cat = marker._mapRow && marker._mapRow.category;
      if (cat && groups[cat] && groups[cat].hasLayer && groups[cat].hasLayer(marker)) {
        groups[cat].removeLayer(marker);
      } else if (api.leaflet && api.leaflet.removeLayer) {
        api.leaflet.removeLayer(marker);
      }
      delete markersById[id];
    }
    layoutLabels();
    renderList();
    paintRevealAll();
  }

  function hideLabel(id) {
    if (!id) {
      return;
    }
    icons.hiddenLabels = icons.hiddenLabels || {};
    icons.hiddenLabels[id] = true;
    saveIcons();
    layoutLabels();
    renderList();
    paintRevealAll();
  }

  function showPin(id) {
    if (!id || !icons.hiddenPins) {
      return;
    }
    delete icons.hiddenPins[id];
    saveIcons();
    plotAll();
    renderList();
    paintRevealAll();
  }

  function revealAll() {
    icons.hiddenPins = {};
    icons.hiddenLabels = {};
    saveIcons();
    plotAll();
    renderList();
    paintRevealAll();
  }

  function paintRevealAll() {
    if (!document || typeof document.querySelectorAll !== "function") {
      return;
    }
    var n = hiddenCount();
    var nodes = document.querySelectorAll("[data-map-reveal-all]");
    Array.prototype.forEach.call(nodes, function (btn) {
      var icon =
        global.COPDoc && COPDoc.icon ? COPDoc.icon("Eye", 14) + " " : "";
      btn.innerHTML = icon + "Reveal all";
      btn.hidden = false;
      btn.disabled = n === 0;
      btn.setAttribute(
        "aria-label",
        n ? "Reveal " + n + " hidden icons and names" : "Reveal all icons"
      );
    });
  }

  function bindRevealAll() {
    if (document.body && document.body.dataset.mapRevealBound === "true") {
      return;
    }
    if (document.body) {
      document.body.dataset.mapRevealBound = "true";
    }
    document.addEventListener("click", function (event) {
      var btn = event.target.closest("[data-map-reveal-all]");
      if (!btn) {
        return;
      }
      event.preventDefault();
      revealAll();
    });
  }

  function pinColorFor(row) {
    var filter = activeFilterFor(row);
    if (filter && filter.color) {
      return filter.color;
    }
    return NEUTRAL_PIN_COLOR;
  }

  function repaintMarkers() {
    Object.keys(markersById).forEach(function (id) {
      var marker = markersById[id];
      var row =
        marker && marker._mapRow ? marker._mapRow : findCatalogRow(id);
      if (!marker || !row) {
        return;
      }
      if (typeof marker.setIcon === "function") {
        marker.setIcon(markerIcon(row));
      }
    });
    layoutLabels();
  }

  function iconHtml(name, size) {
    var mapIcons = mapIconApi();
    if (mapIcons && typeof mapIcons.html === "function") {
      return mapIcons.html(name, size);
    }
    return global.COPDoc && COPDoc.icon ? COPDoc.icon(name, size) : "";
  }

  function iconLabel(name) {
    var mapIcons = mapIconApi();
    if (mapIcons && typeof mapIcons.label === "function") {
      return mapIcons.label(name);
    }
    return String(name || "Location").replace(/([a-z])([A-Z])/g, "$1 $2");
  }

  function paletteEntries() {
    var mapIcons = mapIconApi();
    if (mapIcons && Array.isArray(mapIcons.entries) && mapIcons.entries.length) {
      return mapIcons.entries;
    }
    return LEGACY_PALETTE.map(function (name) {
      return {
        id: name,
        label: iconLabel(name),
        group: "Symbols",
        description: "Map symbol"
      };
    });
  }

  function pinHtml(row) {
    var name = iconNameFor(row);
    var badge =
      iconOptionOn("badges") && row.category === "targets" && row.priority
        ? row.priority
        : "";
    var mapIcons = mapIconApi();
    if (mapIcons && typeof mapIcons.badgeHtml === "function") {
      return mapIcons.badgeHtml(name, {
        selected: row.id === selectedId,
        badge: badge,
        size: iconPixelSize(),
        stroke: iconStrokeWidth(),
        fillOpacity: iconFillOpacity(),
        color: pinColorFor(row)
      });
    }
    var glyph = Math.max(12, Math.round(iconPixelSize() * 0.45));
    return (
      '<span class="map-pin-glyph map-pin-' +
      row.category +
      '" style="width:' +
      iconPixelSize() +
      "px;height:" +
      iconPixelSize() +
      'px">' +
      iconHtml(name, glyph) +
      (badge ? "<i>" + String(badge) + "</i>" : "") +
      "</span>"
    );
  }

  function markerIcon(row) {
    var box = iconBoxSize();
    return global.L.divIcon({
      className: "map-pin",
      html: pinHtml(row),
      iconSize: [box, box],
      iconAnchor: [box / 2, box / 2]
    });
  }

  function findCatalogRow(id) {
    var keys = ["targets", "arrests", "encounters", "officers", "origin"];
    var i;
    var j;
    var rows;
    for (i = 0; i < keys.length; i += 1) {
      rows = catalog[keys[i]] || [];
      for (j = 0; j < rows.length; j += 1) {
        if (rows[j].id === id) {
          return rows[j];
        }
      }
    }
    return null;
  }

  function syncIconSizeControl() {
    var slider = byId("mapIconSizeSlider");
    var valueEl = byId("mapIconSizeValue");
    var size = iconPixelSize();
    if (slider) {
      slider.min = String(ICON_SIZE_MIN);
      slider.max = String(ICON_SIZE_MAX);
      slider.value = String(size);
      slider.setAttribute("aria-valuenow", String(size));
      slider.setAttribute("aria-valuetext", size + " pixels");
    }
    if (valueEl) {
      valueEl.textContent = String(size);
    }
  }

  function applyIconSize(value, persist) {
    icons.size = clampIconSize(value);
    syncIconSizeControl();
    repaintMarkers();
    if (persist !== false) {
      saveIcons();
    }
  }

  function syncIconStrokeControl() {
    var slider = byId("mapIconStrokeSlider");
    var valueEl = byId("mapIconStrokeValue");
    var stroke = iconStrokeWidth();
    if (slider) {
      slider.min = String(ICON_STROKE_MIN);
      slider.max = String(ICON_STROKE_MAX);
      slider.value = String(stroke);
      slider.setAttribute("aria-valuenow", String(stroke));
      slider.setAttribute("aria-valuetext", stroke + " pixels");
    }
    if (valueEl) {
      valueEl.textContent = String(stroke);
    }
  }

  function applyIconStroke(value, persist) {
    icons.stroke = clampIconStroke(value);
    syncIconStrokeControl();
    repaintMarkers();
    if (persist !== false) {
      saveIcons();
    }
  }

  function bindIconStrokeControl() {
    var slider = byId("mapIconStrokeSlider");
    if (!slider || slider.dataset.bound === "true") {
      return;
    }
    slider.dataset.bound = "true";
    syncIconStrokeControl();
    slider.addEventListener("input", function () {
      applyIconStroke(slider.value, true);
    });
    slider.addEventListener("change", function () {
      applyIconStroke(slider.value, true);
    });
  }

  function syncIconFillControl() {
    var slider = byId("mapIconFillSlider");
    var valueEl = byId("mapIconFillValue");
    var pct = clampIconFill(icons.fillOpacity);
    if (slider) {
      slider.min = String(ICON_FILL_MIN);
      slider.max = String(ICON_FILL_MAX);
      slider.value = String(pct);
      slider.setAttribute("aria-valuenow", String(pct));
      slider.setAttribute("aria-valuetext", pct + " percent");
    }
    if (valueEl) {
      valueEl.textContent = pct + "%";
    }
  }

  function applyIconFill(value, persist) {
    icons.fillOpacity = clampIconFill(value);
    syncIconFillControl();
    repaintMarkers();
    if (persist !== false) {
      saveIcons();
    }
  }

  function bindIconFillControl() {
    var slider = byId("mapIconFillSlider");
    if (!slider || slider.dataset.bound === "true") {
      return;
    }
    slider.dataset.bound = "true";
    syncIconFillControl();
    slider.addEventListener("input", function () {
      applyIconFill(slider.value, true);
    });
    slider.addEventListener("change", function () {
      applyIconFill(slider.value, true);
    });
  }

  function paintVisualFilters() {
    var host = byId("mapIconFilters");
    if (!host) {
      return;
    }
    host.replaceChildren();
    var lastGroup = "";
    VISUAL_FILTERS.forEach(function (spec) {
      var state = filterState(spec.id);
      if (spec.group !== lastGroup) {
        lastGroup = spec.group;
        var heading = document.createElement("p");
        heading.className = "map-icon-filter-group";
        heading.textContent =
          spec.group === "targets" ? "Target flags" : "Encounter flags";
        host.appendChild(heading);
      }
      var row = document.createElement("div");
      row.className = "map-icon-filter-row";
      row.setAttribute("data-filter-id", spec.id);
      if (!state.visible) {
        row.classList.add("is-off");
      }
      if (pendingFilterId === spec.id) {
        row.classList.add("is-armed");
      }

      var eye = document.createElement("button");
      eye.type = "button";
      eye.className = "map-layer-eye";
      eye.setAttribute("aria-pressed", state.visible ? "true" : "false");
      eye.setAttribute(
        "title",
        (state.visible ? "Hide " : "Show ") + spec.label
      );
      eye.setAttribute(
        "aria-label",
        (state.visible ? "Hide " : "Show ") + spec.label
      );
      eye.innerHTML =
        global.COPDoc && COPDoc.icon
          ? COPDoc.icon(state.visible ? "Eye" : "EyeOff", 14)
          : state.visible
            ? "on"
            : "off";
      eye.addEventListener("click", function (event) {
        event.stopPropagation();
        setFilterState(spec.id, { visible: !state.visible }, true);
      });

      var iconBtn = document.createElement("button");
      iconBtn.type = "button";
      iconBtn.className = "map-layer-icon";
      iconBtn.setAttribute("title", "Assign icon to " + spec.label);
      iconBtn.setAttribute("aria-label", spec.label + " icon");
      iconBtn.innerHTML = iconHtml(state.icon, 14);
      iconBtn.addEventListener("click", function (event) {
        event.stopPropagation();
        if (pendingIcon) {
          setFilterState(spec.id, { icon: pendingIcon }, true);
          pendingIcon = "";
          pendingFilterId = "";
          paintPalette();
          setHint(spec.label + " icon assigned.");
          return;
        }
        pendingFilterId = pendingFilterId === spec.id ? "" : spec.id;
        paintVisualFilters();
        setHint(
          pendingFilterId
            ? "Select an icon for " + spec.label + "."
            : "Select an icon, then a filter, layer, or row."
        );
      });

      var nameEl = document.createElement("span");
      nameEl.className = "map-icon-filter-name";
      nameEl.textContent = spec.label;

      var color = document.createElement("input");
      color.type = "color";
      color.className = "map-icon-filter-color";
      color.value = state.color;
      color.setAttribute("aria-label", spec.label + " color");
      color.title = "Color for " + spec.label;
      color.addEventListener("input", function () {
        icons.filters = icons.filters || {};
        icons.filters[spec.id] = Object.assign(filterState(spec.id), {
          color: safeFilterColor(color.value, spec.color)
        });
        repaintMarkers();
        paintLegend();
      });
      color.addEventListener("change", function () {
        setFilterState(spec.id, { color: color.value }, true);
      });

      row.appendChild(eye);
      row.appendChild(iconBtn);
      row.appendChild(nameEl);
      row.appendChild(color);
      host.appendChild(row);
    });
  }

  function syncIconOptionControls() {
    var host = byId("mapIconOptions");
    if (!host) {
      return;
    }
    Array.prototype.forEach.call(
      host.querySelectorAll("[data-icon-option]"),
      function (button) {
        var key = button.getAttribute("data-icon-option");
        if (ICON_OPTION_KEYS.indexOf(key) === -1) {
          return;
        }
        var on = iconOptionOn(key);
        button.setAttribute("aria-pressed", on ? "true" : "false");
        button.classList.toggle("is-active", on);
      }
    );
  }

  function applyIconOption(key, on, persist) {
    if (ICON_OPTION_KEYS.indexOf(key) === -1) {
      return iconOptionsState();
    }
    icons[key] = !!on;
    syncIconOptionControls();
    repaintMarkers();
    paintLegend();
    if (persist !== false) {
      saveIcons();
    }
    return iconOptionsState();
  }

  function bindIconOptions() {
    var host = byId("mapIconOptions");
    if (!host || host.dataset.bound === "true") {
      return;
    }
    host.dataset.bound = "true";
    syncIconOptionControls();
    host.addEventListener("click", function (event) {
      var button = event.target.closest("[data-icon-option]");
      if (!button) {
        return;
      }
      var key = button.getAttribute("data-icon-option");
      applyIconOption(key, !iconOptionOn(key), true);
    });
  }

  function bindIconSizeControl() {
    var slider = byId("mapIconSizeSlider");
    if (!slider || slider.dataset.bound === "true") {
      return;
    }
    slider.dataset.bound = "true";
    syncIconSizeControl();
    slider.addEventListener("input", function () {
      applyIconSize(slider.value, true);
    });
    slider.addEventListener("change", function () {
      applyIconSize(slider.value, true);
    });
  }

  function ensureGroups() {
    if (!api.leaflet || !global.L) {
      return false;
    }
    ["targets", "arrests", "arrestHeat", "encounters", "officers", "origin"].forEach(function (key) {
      if (!groups[key]) {
        groups[key] = global.L.layerGroup();
      }
    });
    return true;
  }

  function plotCategory(key) {
    if (!ensureGroups()) {
      return;
    }
    var group = groups[key];
    group.clearLayers();
    if (api.leaflet.hasLayer(group)) {
      api.leaflet.removeLayer(group);
    }
    if (!visible[key]) {
      return;
    }
    var bounds = [];
    catalog[key].forEach(function (row) {
      if (!row.hasCoords || isPinHidden(row.id) || !rowPassesFilters(row)) {
        return;
      }
      var latlng = [Number(row.latitude), Number(row.longitude)];
      var markerTitle = MARKER_LABELS[row.category] || "Location";
      if (row.category === "targets" && row.priority) {
        markerTitle += ", priority " + row.priority;
      }
      var marker = global.L.marker(latlng, {
        icon: markerIcon(row),
        title:
          markerTitle +
          (row.subject ? " — " + row.subject : "") +
          (row.address ? " — " + row.address : "")
      });
      if (root.mapPopup && root.mapPopup.bind) {
        root.mapPopup.bind(marker, popupPinFor(row), popupUrls);
      } else {
        var popup = document.createElement("div");
        var nameEl = document.createElement("strong");
        nameEl.textContent = row.subject || "";
        popup.appendChild(nameEl);
        if (row.address) {
          popup.appendChild(document.createElement("br"));
          popup.appendChild(document.createTextNode(row.address));
        }
        if (row.association) {
          popup.appendChild(document.createElement("br"));
          popup.appendChild(document.createTextNode(row.association));
        }
        if (row.category === "targets" && row.leadId) {
          popup.appendChild(document.createElement("br"));
          var caseHref = "case.html?id=" + encodeURIComponent(row.leadId);
          var caseWinName = caseWindowNameFor(row.leadId);
          var caseLink = document.createElement("a");
          caseLink.className = "case-map-popup-case-link";
          caseLink.href = caseHref;
          caseLink.target = caseWinName;
          caseLink.rel = "opener";
          caseLink.textContent = "Open case";
          caseLink.addEventListener("click", function (event) {
            if (
              event.defaultPrevented ||
              event.button ||
              event.metaKey ||
              event.ctrlKey ||
              event.shiftKey ||
              event.altKey
            ) {
              return;
            }
            event.preventDefault();
            event.stopPropagation();
            if (typeof event.stopImmediatePropagation === "function") {
              event.stopImmediatePropagation();
            }
            if (root.mapPopup && root.mapPopup.openCasePopup) {
              root.mapPopup.openCasePopup(caseLink.href || caseHref, caseWinName);
            } else {
              window.open(
                caseLink.href || caseHref,
                caseWinName,
                "popup=yes,popup=true,width=880,height=760,left=200,top=60,scrollbars=yes,resizable=yes"
              );
            }
          });
          popup.appendChild(caseLink);
        }
        marker.bindPopup(popup);
      }
      marker.on("click", function () {
        listId = key;
        selectRow(row.id, false);
        renderList();
      });
      marker._mapRow = row;
      marker.addTo(group);
      markersById[row.id] = marker;
      bounds.push(latlng);
    });
    group.addTo(api.leaflet);
    return bounds;
  }

  function arrestHeatPoints() {
    var points = [];
    (catalog.arrests || []).forEach(function (row) {
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

  function heatCellSizeDeg(map) {
    var zoom = map && typeof map.getZoom === "function" ? map.getZoom() : 10;
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

  function peakIcon(count) {
    var html =
      '<span class="map-heat-peak"><span class="map-heat-peak-ring"></span><i>' +
      String(count) +
      "</i></span>";
    if (!global.L || !global.L.divIcon) {
      return null;
    }
    return global.L.divIcon({
      className: "map-heat-peak-icon",
      html: html,
      iconSize: [28, 28],
      iconAnchor: [14, 14]
    });
  }

  function ensureHeatCanvas() {
    var map = api.leaflet;
    if (!map || !map.getPanes) {
      return null;
    }
    var pane = map.getPanes().overlayPane;
    if (!pane) {
      return null;
    }
    if (!heatCanvas) {
      heatCanvas = document.createElement("canvas");
      heatCanvas.className = "map-arrest-heat-canvas";
      heatCanvas.setAttribute("aria-hidden", "true");
    }
    if (heatCanvas.parentNode !== pane) {
      pane.appendChild(heatCanvas);
    }
    return heatCanvas;
  }

  function hideHeatCanvas() {
    if (heatCanvas && heatCanvas.parentNode) {
      heatCanvas.parentNode.removeChild(heatCanvas);
    }
  }

  function drawArrestHeat() {
    var map = api.leaflet;
    if (!map || !visible.arrestHeat) {
      hideHeatCanvas();
      return;
    }
    var canvas = ensureHeatCanvas();
    if (!canvas || !map.getSize) {
      return;
    }
    var size = map.getSize();
    var width = size.x || 0;
    var height = size.y || 0;
    if (canvas.width !== width) {
      canvas.width = width;
    }
    if (canvas.height !== height) {
      canvas.height = height;
    }
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    var topLeft = map.containerPointToLayerPoint([0, 0]);
    if (global.L && global.L.DomUtil && global.L.DomUtil.setPosition) {
      global.L.DomUtil.setPosition(canvas, topLeft);
    } else {
      canvas.style.left = topLeft.x + "px";
      canvas.style.top = topLeft.y + "px";
    }
    var ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }
    ctx.clearRect(0, 0, width, height);
    ctx.globalCompositeOperation = "lighter";
    var radius = Math.max(22, Math.min(48, 18 + (map.getZoom() || 10)));
    arrestHeatPoints().forEach(function (point) {
      var pt = map.latLngToContainerPoint([point.lat, point.lng]);
      if (
        pt.x < -radius ||
        pt.y < -radius ||
        pt.x > width + radius ||
        pt.y > height + radius
      ) {
        return;
      }
      var gradient = ctx.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, radius);
      gradient.addColorStop(0, "rgba(233,104,104,0.42)");
      gradient.addColorStop(0.45, "rgba(240,173,53,0.2)");
      gradient.addColorStop(1, "rgba(240,173,53,0)");
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, radius, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalCompositeOperation = "source-over";
  }

  function plotArrestHeatPeaks() {
    if (!ensureGroups()) {
      catalog.arrestHeat = computeHeatPeaksGeo(
        arrestHeatPoints(),
        heatCellSizeDeg(api.leaflet)
      );
      return;
    }
    var group = groups.arrestHeat;
    group.clearLayers();
    if (api.leaflet.hasLayer(group)) {
      api.leaflet.removeLayer(group);
    }
    catalog.arrestHeat = computeHeatPeaksGeo(
      arrestHeatPoints(),
      heatCellSizeDeg(api.leaflet)
    );
    if (!visible.arrestHeat) {
      hideHeatCanvas();
      return;
    }
    catalog.arrestHeat.forEach(function (row) {
      var latlng = [Number(row.latitude), Number(row.longitude)];
      var marker = global.L.marker(latlng, {
        icon: peakIcon(row.count),
        title: "Local maximum — " + row.count + " arrests",
        zIndexOffset: 400,
        keyboard: true
      });
      var popup = document.createElement("div");
      popup.className = "map-heat-peak-popup";
      var strong = document.createElement("strong");
      strong.textContent = "Local maximum";
      popup.appendChild(strong);
      popup.appendChild(document.createElement("br"));
      popup.appendChild(document.createTextNode(row.count + " arrests in this cluster"));
      marker.bindPopup(popup);
      marker.on("click", function () {
        listId = "arrestHeat";
        selectRow(row.id, false);
        renderList();
      });
      marker._mapRow = row;
      marker.addTo(group);
      markersById[row.id] = marker;
    });
    group.addTo(api.leaflet);
  }

  function plotArrestHeat() {
    drawArrestHeat();
    plotArrestHeatPeaks();
  }

  function bindHeatRedraw() {
    var map = api.leaflet;
    if (!map || heatRedrawBound) {
      return;
    }
    heatRedrawBound = true;
    map.on("move zoom viewreset", function () {
      if (visible.arrestHeat) {
        drawArrestHeat();
      }
    });
    map.on("zoomend", function () {
      plotArrestHeat();
      if (listId === "arrestHeat") {
        renderList();
      }
    });
  }

  function plotAll() {
    revokePopupUrls();
    markersById = {};
    var bounds = [];
    ["targets", "arrests", "encounters", "officers", "origin"].forEach(function (key) {
      var part = plotCategory(key);
      if (part && part.length) {
        bounds = bounds.concat(part);
      }
    });
    bindHeatRedraw();
    plotArrestHeat();
    if (!fitted && bounds.length && api.leaflet) {
      api.leaflet.fitBounds(bounds, { padding: [28, 28], maxZoom: 16 });
      fitted = true;
    }
    if (typeof api.syncMarkupVisibility === "function") {
      api.syncMarkupVisibility(visible.markup);
    }
    paintLegend();
    bindLabelLayout();
    layoutLabels();
  }

  function selectRow(id, fly) {
    selectedId = id || "";
    Object.keys(markersById).forEach(function (markerId) {
      var symbol =
        markersById[markerId] && markersById[markerId]._icon
          ? markersById[markerId]._icon.querySelector(".copdoc-map-symbol")
          : null;
      if (symbol) {
        symbol.classList.toggle("is-selected", markerId === selectedId);
      }
    });
    var body = byId("targetsTableBody");
    if (body) {
      Array.prototype.forEach.call(body.querySelectorAll("tr"), function (tr) {
        tr.classList.toggle("is-selected", tr.getAttribute("data-row-id") === selectedId);
      });
    }
    var marker = markersById[selectedId];
    if (marker && fly !== false && api.leaflet) {
      api.leaflet.flyTo(marker.getLatLng(), Math.max(api.leaflet.getZoom(), 14), {
        duration: 0.5
      });
      marker.openPopup();
    }
  }

  function renderHead() {
    var head = byId("mapListHead");
    if (!head) {
      return;
    }
    var tr = document.createElement("tr");
    var eyeHead = document.createElement("th");
    eyeHead.className = "map-row-eye-col";
    eyeHead.textContent = "";
    tr.appendChild(eyeHead);
    (HEADERS[listId] || []).forEach(function (label) {
      var th = document.createElement("th");
      th.textContent = label;
      tr.appendChild(th);
    });
    head.replaceChildren(tr);
  }

  function currentRows() {
    if (listId === "markup" && typeof api.listMarkup === "function") {
      return api.listMarkup();
    }
    return catalog[listId] || [];
  }

  function renderList() {
    renderHead();
    var body = byId("targetsTableBody");
    var empty = byId("targetsEmpty");
    var rows = currentRows();
    paintLayerList();
    if (!body) {
      return;
    }
    body.replaceChildren();
    if (!rows.length) {
      if (empty) {
        empty.hidden = false;
        empty.textContent = EMPTY[listId] || "Nothing in this list.";
      }
      return;
    }
    if (empty) {
      empty.hidden = true;
    }
    rows.forEach(function (row) {
      var tr = document.createElement("tr");
      tr.setAttribute("data-row-id", row.id);
      if (row.hasCoords === false) {
        tr.classList.add("is-ungeocoded");
      }
      if (row.id === selectedId) {
        tr.classList.add("is-selected");
      }
      if (isPinHidden(row.id) || !rowPassesFilters(row)) {
        tr.classList.add("is-pin-hidden");
      }
      var eyeTd = document.createElement("td");
      eyeTd.className = "map-row-eye-col";
      var eye = document.createElement("button");
      eye.type = "button";
      eye.className = "map-row-eye";
      var pinHidden = isPinHidden(row.id);
      var labelHidden = isLabelHidden(row.id);
      var hidden = pinHidden || (iconOptionOn("labels") && labelHidden);
      eye.setAttribute("aria-pressed", hidden ? "false" : "true");
      eye.title = pinHidden
        ? "Show this icon"
        : labelHidden
          ? "Name hidden — click to show the icon"
          : "Hide this icon";
      eye.setAttribute(
        "aria-label",
        (pinHidden ? "Show " : "Hide ") + (row.subject || "this icon")
      );
      eye.innerHTML =
        global.COPDoc && COPDoc.icon
          ? COPDoc.icon(hidden ? "EyeOff" : "Eye", 14)
          : hidden
            ? "off"
            : "on";
      eye.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();
        if (pinHidden) {
          showPin(row.id);
          return;
        }
        hidePin(row.id);
      });
      eyeTd.appendChild(eye);
      tr.appendChild(eyeTd);
      (row.cols || []).forEach(function (text) {
        var td = document.createElement("td");
        td.textContent = text;
        tr.appendChild(td);
      });
      tr.addEventListener("click", function () {
        if (pendingIcon && row.category && row.category !== "markup") {
          icons.pins[row.id] = pendingIcon;
          saveIcons();
          pendingIcon = "";
          paintPalette();
          plotAll();
          setHint("Icon assigned to this pin.");
        }
        selectedId = row.id;
        if (row.category === "markup" && typeof api.selectMarkup === "function") {
          api.selectMarkup(row.id);
        } else {
          selectRow(row.id, true);
        }
        renderList();
      });
      body.appendChild(tr);
    });
  }

  function paintPalette() {
    var host = byId("mapIconPalette");
    if (!host) {
      return;
    }
    if (global.COPDoc && COPDoc.icons && COPDoc.icons.inject) {
      COPDoc.icons.inject();
    }
    host.replaceChildren();
    var grouped = {};
    paletteEntries().forEach(function (entry) {
      var group = entry.group || "Symbols";
      grouped[group] = grouped[group] || [];
      grouped[group].push(entry);
    });
    Object.keys(grouped).forEach(function (groupName) {
      var group = document.createElement("section");
      group.className = "map-icon-group";
      group.setAttribute("aria-label", groupName);
      var title = document.createElement("p");
      title.className = "map-icon-group-title";
      title.textContent = groupName;
      group.appendChild(title);
      grouped[groupName].forEach(function (entry) {
        var name = entry.id;
        var label = entry.label || iconLabel(name);
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "map-icon-swatch";
        if (name === pendingIcon) {
          btn.classList.add("is-active");
        }
        btn.setAttribute(
          "title",
          label + (entry.description ? " — " + entry.description : "")
        );
        btn.setAttribute("aria-label", label);
        btn.innerHTML =
          iconHtml(name, 16) +
          '<span class="map-icon-swatch-label"></span>';
        btn.querySelector(".map-icon-swatch-label").textContent = label;
        btn.addEventListener("click", function () {
          if (pendingFilterId) {
            setFilterState(pendingFilterId, { icon: name }, true);
            pendingFilterId = "";
            pendingIcon = "";
            paintPalette();
            setHint(label + " assigned to the filter.");
            return;
          }
          pendingIcon = pendingIcon === name ? "" : name;
          paintPalette();
          setHint(
            pendingIcon
              ? label + " selected — click a filter, layer, or row."
              : "Select an icon, then a filter, layer, or row."
          );
        });
        group.appendChild(btn);
      });
      host.appendChild(group);
    });
  }

  function iconLibraries() {
    var mapIcons = mapIconApi();
    return mapIcons && Array.isArray(mapIcons.libraries)
      ? mapIcons.libraries
      : [];
  }

  function paintLibraryPicker() {
    var wrap = byId("mapIconLibraryPicker");
    var select = byId("mapIconLibrarySelect");
    var note = byId("mapIconLibraryDescription");
    var mapIcons = mapIconApi();
    var libraries = iconLibraries();
    if (!wrap || !select || !mapIcons || !libraries.length) {
      if (wrap) wrap.hidden = true;
      return;
    }
    wrap.hidden = false;
    select.replaceChildren();
    libraries.forEach(function (library) {
      var option = document.createElement("option");
      option.value = library.id;
      option.textContent = library.label;
      select.appendChild(option);
    });
    var active =
      typeof mapIcons.getLibraryId === "function"
        ? mapIcons.getLibraryId()
        : libraries[0].id;
    select.value = active;
    var selected = libraries.filter(function (library) {
      return library.id === active;
    })[0];
    if (note) {
      note.textContent = selected ? selected.description : "";
    }
  }

  function applyLibrary(libraryId) {
    var mapIcons = mapIconApi();
    if (!mapIcons || typeof mapIcons.setLibrary !== "function") return;
    icons.libraryId = mapIcons.setLibrary(libraryId, { notify: false });
    saveIcons();
    pendingIcon = "";
    paintLibraryPicker();
    paintPalette();
    plotAll();
    paintLayerList();
    renderList();
    paintLegend();
    var selected = iconLibraries().filter(function (library) {
      return library.id === icons.libraryId;
    })[0];
    setHint((selected ? selected.label : "Icon library") + " applied.");
  }

  function bindLibraryPicker() {
    var select = byId("mapIconLibrarySelect");
    if (!select || select.dataset.bound === "true") return;
    select.dataset.bound = "true";
    select.addEventListener("change", function () {
      applyLibrary(select.value);
    });
  }

  function setHint(text) {
    var el = byId("mapIconHint");
    if (el) {
      el.textContent = text;
    }
  }

  function paintLegend() {
    var el = byId("mapBriefLegend");
    if (!el) {
      return;
    }
    var parts = [];
    LAYER_ORDER.forEach(function (pair) {
      if (!visible[pair[0]]) {
        return;
      }
      var icon = "";
      var mapIcons = mapIconApi();
      if (pair[0] === "arrestHeat") {
        icon = '<span class="map-heat-swatch"></span>';
      } else if (
        pair[0] !== "markup" &&
        mapIcons &&
        typeof mapIcons.badgeHtml === "function"
      ) {
        icon = mapIcons.badgeHtml(
          icons.category[pair[0]] || DEFAULT_ICONS[pair[0]] || "Location",
          {
            size: "compact",
            color: NEUTRAL_PIN_COLOR,
            stroke: iconStrokeWidth(),
            fillOpacity: iconFillOpacity()
          }
        );
      } else if (pair[0] !== "markup") {
        icon = iconHtml(icons.category[pair[0]] || "MapPin", 14);
      }
      parts.push(
        '<span class="map-legend-item">' +
          icon +
          " " +
          pair[1] +
          " (" +
          layerCount(pair[0]) +
          ")</span>"
      );
    });
    var customSymbols = {};
    ["targets", "arrests", "encounters", "officers", "origin"].forEach(function (key) {
      if (!visible[key]) {
        return;
      }
      (catalog[key] || []).forEach(function (row) {
        var custom = icons.pins[row.id];
        if (!custom || custom === icons.category[key]) {
          return;
        }
        var token = key + "\u0000" + custom;
        if (!customSymbols[token]) {
          customSymbols[token] = { key: key, name: custom, count: 0 };
        }
        customSymbols[token].count += 1;
      });
    });
    Object.keys(customSymbols).forEach(function (token) {
      var custom = customSymbols[token];
      var mapIcons = mapIconApi();
      var icon =
        mapIcons && typeof mapIcons.badgeHtml === "function"
          ? mapIcons.badgeHtml(custom.name, {
              size: "compact",
              color: NEUTRAL_PIN_COLOR,
              stroke: iconStrokeWidth(),
              fillOpacity: iconFillOpacity()
            })
          : iconHtml(custom.name, 14);
      parts.push(
        '<span class="map-legend-item">' +
          icon +
          " " +
          iconLabel(custom.name) +
          " custom (" +
          custom.count +
          ")</span>"
      );
    });
    VISUAL_FILTERS.forEach(function (spec) {
      var state = filterState(spec.id);
      if (!state.visible || spec.other) {
        return;
      }
      var mapIcons = mapIconApi();
      var icon =
        mapIcons && typeof mapIcons.badgeHtml === "function"
          ? mapIcons.badgeHtml(state.icon, {
              size: "compact",
              color: state.color,
              stroke: iconStrokeWidth(),
              fillOpacity: iconFillOpacity()
            })
          : iconHtml(state.icon, 14);
      parts.push(
        '<span class="map-legend-item">' + icon + " " + spec.label + "</span>"
      );
    });
    el.innerHTML = parts.join("");
  }

  function layerCount(key) {
    if (key === "markup" && typeof api.listMarkup === "function") {
      return (api.listMarkup() || []).length;
    }
    return (catalog[key] || []).length;
  }

  function assignCategoryIcon(key) {
    if (!pendingIcon || !DEFAULT_ICONS[key]) {
      return false;
    }
    icons.category[key] = pendingIcon;
    saveIcons();
    pendingIcon = "";
    paintPalette();
    setHint("Default icon set for " + key + ".");
    return true;
  }

  function showList(key) {
    var assigned = assignCategoryIcon(key);
    var turnedOn = !visible[key];
    listId = key;
    if (turnedOn) {
      visible[key] = true;
      saveLayers();
    }
    if (assigned || turnedOn) {
      plotAll();
    }
    renderList();
  }

  function toggleLayer(key) {
    visible[key] = !visible[key];
    saveLayers();
    plotAll();
    paintLayerList();
  }

  function paintLayerList() {
    var host = byId("mapLayerList");
    if (!host) {
      return;
    }
    if (global.COPDoc && COPDoc.icons && COPDoc.icons.inject) {
      COPDoc.icons.inject();
    }
    host.replaceChildren();
    LAYER_ORDER.forEach(function (pair) {
      var key = pair[0];
      var label = pair[1];
      var row = document.createElement("div");
      row.className = "map-layer-row";
      row.setAttribute("role", "listitem");
      row.setAttribute("data-layer", key);
      if (listId === key) {
        row.classList.add("is-active");
      }
      if (!visible[key]) {
        row.classList.add("is-off");
      }

      var eye = document.createElement("button");
      eye.type = "button";
      eye.className = "map-layer-eye";
      eye.setAttribute("aria-pressed", visible[key] ? "true" : "false");
      eye.setAttribute(
        "title",
        (visible[key] ? "Hide " : "Show ") + label
      );
      eye.setAttribute("aria-label", (visible[key] ? "Hide " : "Show ") + label);
      eye.innerHTML =
        global.COPDoc && COPDoc.icon
          ? COPDoc.icon(visible[key] ? "Eye" : "EyeOff", 14)
          : visible[key]
            ? "on"
            : "off";
      eye.addEventListener("click", function (event) {
        event.stopPropagation();
        toggleLayer(key);
      });

      var iconBtn = document.createElement("button");
      iconBtn.type = "button";
      iconBtn.className = "map-layer-icon";
      if (key === "arrestHeat") {
        iconBtn.classList.add("is-heat-legend");
        iconBtn.innerHTML = '<span class="map-heat-swatch"></span>';
        iconBtn.disabled = true;
        iconBtn.tabIndex = -1;
      } else if (DEFAULT_ICONS[key]) {
        iconBtn.setAttribute("title", "Assign icon to " + label);
        iconBtn.setAttribute("aria-label", "Icon for " + label);
        iconBtn.innerHTML = iconHtml(
          icons.category[key] || DEFAULT_ICONS[key],
          14
        );
        iconBtn.addEventListener("click", function (event) {
          event.stopPropagation();
          if (assignCategoryIcon(key)) {
            plotAll();
            paintLayerList();
            return;
          }
          showDockTab("icons");
          setHint("Select an icon, then click this layer or a row.");
        });
      } else {
        iconBtn.disabled = true;
        iconBtn.setAttribute("aria-hidden", "true");
        iconBtn.tabIndex = -1;
      }

      var nameBtn = document.createElement("button");
      nameBtn.type = "button";
      nameBtn.className = "map-layer-name";
      nameBtn.textContent = label;
      nameBtn.addEventListener("click", function () {
        showList(key);
      });

      var count = document.createElement("span");
      count.className = "map-layer-count";
      count.textContent = String(layerCount(key));

      row.appendChild(eye);
      row.appendChild(iconBtn);
      row.appendChild(nameBtn);
      row.appendChild(count);
      host.appendChild(row);
    });
  }

  function refresh() {
    collectLeads();
    collectOfficers();
    api.catalog = catalog;
    plotAll();
    renderList();
  }

  function showDockTab(tab) {
    dockTab = tab === "icons" ? "icons" : "layers";
    var layersPanel = byId("mapDockPanelLayers");
    var iconsPanel = byId("mapDockPanelIcons");
    var layersTab = byId("mapDockTabLayers");
    var iconsTab = byId("mapDockTabIcons");
    var dock = byId("mapDock");
    if (layersPanel) {
      layersPanel.hidden = dockTab !== "layers";
    }
    if (iconsPanel) {
      iconsPanel.hidden = dockTab !== "icons";
    }
    if (layersTab) {
      layersTab.setAttribute("aria-selected", dockTab === "layers" ? "true" : "false");
    }
    if (iconsTab) {
      iconsTab.setAttribute("aria-selected", dockTab === "icons" ? "true" : "false");
    }
    if (dock) {
      dock.setAttribute("data-dock-tab", dockTab);
    }
  }

  function bindDockTabs() {
    var tabs = document.querySelector(".map-dock-tabs");
    if (!tabs || tabs.dataset.bound === "true") {
      return;
    }
    tabs.dataset.bound = "true";
    tabs.addEventListener("click", function (event) {
      var button = event.target.closest("[data-dock-tab]");
      if (!button) {
        return;
      }
      var shell = document.querySelector(".map-shell");
      var toggle = byId("mapDockToggle");
      if (shell && shell.classList.contains("is-dock-collapsed")) {
        shell.classList.remove("is-dock-collapsed");
        if (toggle) {
          toggle.setAttribute("aria-expanded", "true");
        }
        if (api.resize) {
          global.setTimeout(api.resize, 0);
        }
      }
      showDockTab(button.getAttribute("data-dock-tab"));
    });
  }

  function bindDock() {
    var shell = document.querySelector(".map-shell");
    var toggle = byId("mapDockToggle");
    if (!shell || !toggle || toggle.dataset.bound === "true") {
      return;
    }
    toggle.dataset.bound = "true";
    toggle.addEventListener("click", function () {
      var collapsed = shell.classList.toggle("is-dock-collapsed");
      toggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
      if (api.resize) {
        global.setTimeout(api.resize, 0);
      }
    });
  }

  function init() {
    if (!byId("mapDock") && !document.querySelector(".map-shell")) {
      return;
    }
    loadPrefs();
    bindDock();
    bindDockTabs();
    showDockTab(dockTab);
    bindLibraryPicker();
    bindIconSizeControl();
    bindIconStrokeControl();
    bindIconFillControl();
    bindIconOptions();
    bindRevealAll();
    bindLabelLayout();
    paintRevealAll();
    paintLibraryPicker();
    paintVisualFilters();
    paintPalette();
    refresh();
  }

  api.listTargets = function () {
    return catalog.targets;
  };
  api.listEncounters = function () {
    return catalog.encounters;
  };
  api.listArrests = function () {
    return catalog.arrests;
  };
  api.listArrestHeat = function () {
    return catalog.arrestHeat;
  };
  api.computeHeatPeaks = function (points, cellDeg) {
    return computeHeatPeaksGeo(points, cellDeg);
  };
  api.refreshTargets = refresh;
  api.selectTarget = function (id) {
    selectRow(id, true);
  };
  api.layerVisible = function (key) {
    return !!visible[key];
  };
  api.getIconSize = iconPixelSize;
  api.setIconSize = function (value) {
    applyIconSize(value, true);
    return iconPixelSize();
  };
  api.getIconOptions = iconOptionsState;
  api.setIconOption = function (key, on) {
    return applyIconOption(key, on, true);
  };
  api.getIconStroke = iconStrokeWidth;
  api.setIconStroke = function (value) {
    applyIconStroke(value, true);
    return iconStrokeWidth();
  };
  api.getIconFill = function () {
    return clampIconFill(icons.fillOpacity);
  };
  api.setIconFill = function (value) {
    applyIconFill(value, true);
    return clampIconFill(icons.fillOpacity);
  };
  api.getVisualFilters = function () {
    return VISUAL_FILTERS.map(function (spec) {
      return Object.assign({ id: spec.id, group: spec.group, label: spec.label }, filterState(spec.id));
    });
  };
  api.setVisualFilter = function (id, patch) {
    return setFilterState(id, patch, true);
  };
  api.hidePin = hidePin;
  api.hideLabel = hideLabel;
  api.showPin = showPin;
  api.revealAll = revealAll;
  api.hiddenCount = hiddenCount;
  api.rowVisible = function (id) {
    var row = findCatalogRow(id);
    return !!(row && rowPassesFilters(row) && !isPinHidden(id));
  };
  api.refreshLocationLists = refresh;

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", init);
    } else {
      init();
    }
  }
})(typeof window !== "undefined" ? window : globalThis);
