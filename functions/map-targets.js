/**
 * Targets card on Maps and Planning.
 *
 * Reads saved leads from COPDoc.store, lists locations that have a
 * targetPriority (Primary / Secondary / Tertiary / 4th…), and drops
 * numbered markers on the Leaflet map when lat/long exist.
 *
 * Row click flies to that marker. Map click / right-click are not
 * wired yet — those are planning gestures, not table gestures.
 */
(function (global) {
  "use strict";

  var root = (global.COPDoc = global.COPDoc || {});
  var api = (root.map = root.map || {});
  var markersById = {};
  var markerLayer = null;
  var selectedId = "";

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
    if (!n) {
      return "";
    }
    return String(n);
  }

  function associationLabel(code) {
    var labels = {
      residence: "Residence",
      work: "Work",
      "plate-check": "Plate check",
      "plate-check-location": "Plate check",
      registration: "Vehicle registration",
      "known-parking": "Known parking",
      "vehicle-registration": "Vehicle registration",
      "vehicle-location": "Vehicle location"
    };
    return labels[code] || code || "";
  }

  function walkLocations(snapshot) {
    var rows = [];
    var subject = subjectFor(snapshot);
    if (subject && subject.locations) {
      subject.locations.forEach(function (location) {
        rows.push({ location: location, owner: "subject" });
      });
    }
    (snapshot.vehicles || []).forEach(function (vehicle) {
      (vehicle.locations || []).forEach(function (location) {
        rows.push({
          location: location,
          owner: "vehicle",
          plate: vehicle.licensePlate || ""
        });
      });
    });
    (snapshot.locations || []).forEach(function (location) {
      rows.push({ location: location, owner: "legacy" });
    });
    return rows;
  }

  function formatAddress(location) {
    var line1 = [location.street, location.street2].filter(Boolean).join(" ");
    var line2 = [location.city, location.state, location.zip]
      .filter(Boolean)
      .join(" ");
    return [line1, line2].filter(Boolean).join(", ");
  }

  function hasCoords(location) {
    var lat = Number(location.latitude);
    var lng = Number(location.longitude);
    return isFinite(lat) && isFinite(lng) && !(lat === 0 && lng === 0);
  }

  function subjectFor(snapshot) {
    if (snapshot.person && snapshot.person.personId) {
      return snapshot.person;
    }
    var people = snapshot.people || [];
    var i;
    for (i = 0; i < people.length; i++) {
      if (people[i].personId === snapshot.subjectPersonId) {
        return people[i];
      }
    }
    return people[0] || null;
  }

  function listTargets() {
    var model = root.model;
    if (!model || !model.store) {
      return [];
    }
    model.store.loadFromDisk();
    var state = model.store.getState();
    var leads = state.leads || {};
    var rows = [];
    Object.keys(leads).forEach(function (leadId) {
      var snap = leads[leadId];
      var subject = subjectFor(snap);
      var name =
        (model.formatPersonLabel && model.formatPersonLabel(subject)) ||
        "Untitled";
      walkLocations(snap).forEach(function (row) {
        var location = row.location;
        if (!location || !location.targetPriority) {
          return;
        }
        var assoc =
          location.association || location.formAssociation || "";
        rows.push({
          leadId: leadId,
          locationId: location.locationId,
          priority: Number(location.targetPriority) || 99,
          priorityLabel: priorityLabel(location.targetPriority),
          subject: name || "Untitled",
          address: formatAddress(location) || "(no street)",
          association: associationLabel(assoc),
          latitude: location.latitude,
          longitude: location.longitude,
          hasCoords: hasCoords(location)
        });
      });
    });
    rows.sort(function (a, b) {
      if (a.priority !== b.priority) {
        return a.priority - b.priority;
      }
      return String(a.subject).localeCompare(String(b.subject));
    });
    return rows;
  }

  function bindCollapse(fieldset) {
    if (!fieldset || fieldset.dataset.collapseReady === "true") {
      return;
    }
    fieldset.dataset.collapseReady = "true";
    fieldset.classList.add("card");
    var legend = fieldset.querySelector(":scope > legend");
    if (!legend) {
      return;
    }
    var titleText = legend.textContent.trim();
    legend.textContent = "";
    var toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "card-toggle";
    toggle.setAttribute("aria-expanded", "true");
    toggle.setAttribute("title", "Collapse card");
    toggle.textContent = titleText;
    legend.appendChild(toggle);

    toggle.addEventListener("click", function (event) {
      event.preventDefault();
      var collapsed = fieldset.classList.toggle("is-collapsed");
      toggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
      toggle.setAttribute("title", collapsed ? "Expand card" : "Collapse card");
      var layout = document.querySelector(".map-layout");
      if (layout) {
        layout.classList.toggle("is-targets-collapsed", collapsed);
      }
      if (api.resize) {
        global.setTimeout(api.resize, 0);
      }
    });
  }

  function clearMarkers() {
    markersById = {};
    if (markerLayer && api.leaflet) {
      markerLayer.clearLayers();
    }
  }

  function markerIcon(priority) {
    return global.L.divIcon({
      className: "target-marker",
      html: "<span>" + String(priority) + "</span>",
      iconSize: [26, 26],
      iconAnchor: [13, 13]
    });
  }

  function plotMarkers(rows) {
    if (!api.leaflet || !global.L) {
      return;
    }
    if (!markerLayer) {
      markerLayer = global.L.layerGroup().addTo(api.leaflet);
    }
    clearMarkers();
    var bounds = [];
    rows.forEach(function (row) {
      if (!row.hasCoords) {
        return;
      }
      var latlng = [Number(row.latitude), Number(row.longitude)];
      var marker = global.L.marker(latlng, {
        icon: markerIcon(row.priority),
        title: row.priorityLabel + " — " + row.subject
      });
      marker.bindPopup(
        "<strong>" +
          row.priorityLabel +
          "</strong><br>" +
          row.subject +
          "<br>" +
          row.address
      );
      marker.on("click", function () {
        selectTarget(row.locationId, false);
      });
      marker.addTo(markerLayer);
      markersById[row.locationId] = marker;
      bounds.push(latlng);
    });
    if (bounds.length) {
      api.leaflet.fitBounds(bounds, { padding: [28, 28], maxZoom: 16 });
    }
  }

  function selectTarget(locationId, fly) {
    selectedId = locationId || "";
    var body = document.getElementById("targetsTableBody");
    if (body) {
      Array.prototype.forEach.call(body.querySelectorAll("tr"), function (tr) {
        tr.classList.toggle(
          "is-selected",
          tr.getAttribute("data-location-id") === selectedId
        );
      });
    }
    var marker = markersById[selectedId];
    if (marker && fly !== false && api.leaflet) {
      api.leaflet.flyTo(marker.getLatLng(), Math.max(api.leaflet.getZoom(), 16), {
        duration: 0.6
      });
      marker.openPopup();
    }
  }

  function renderTable(rows) {
    var body = document.getElementById("targetsTableBody");
    var empty = document.getElementById("targetsEmpty");
    if (!body) {
      return;
    }
    body.replaceChildren();
    if (!rows.length) {
      if (empty) {
        empty.hidden = false;
      }
      return;
    }
    if (empty) {
      empty.hidden = true;
    }
    rows.forEach(function (row) {
      var tr = document.createElement("tr");
      tr.setAttribute("data-location-id", row.locationId);
      tr.setAttribute("data-lead-id", row.leadId);
      if (!row.hasCoords) {
        tr.classList.add("is-ungeocoded");
      }
      [row.priorityLabel, row.subject, row.address, row.association].forEach(
        function (text) {
          var td = document.createElement("td");
          td.textContent = text;
          tr.appendChild(td);
        }
      );
      tr.addEventListener("click", function () {
        selectTarget(row.locationId, true);
      });
      body.appendChild(tr);
    });
  }

  function refresh() {
    var rows = listTargets();
    api.targets = rows;
    renderTable(rows);
    plotMarkers(rows);
  }

  function init() {
    var card = document.querySelector(".targets-card");
    if (!card) {
      return;
    }
    bindCollapse(card);
    refresh();
  }

  api.listTargets = listTargets;
  api.refreshTargets = refresh;
  api.selectTarget = selectTarget;

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", init);
    } else {
      init();
    }
  }
})(typeof window !== "undefined" ? window : globalThis);
