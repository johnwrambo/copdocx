/**
 * Snapshot → form.
 *
 * Puts a saved lead back into the cards. Nested vehicle locations and
 * link cards are recreated. Missing fields stay blank.
 */

(function (global) {
  "use strict";

  var root = (global.COPDoc = global.COPDoc || {});
  var model = (root.model = root.model || {});

  function byId(id) {
    return document.getElementById(id);
  }

  function setValue(el, value) {
    if (!el) {
      return;
    }
    var type = (el.type || "").toLowerCase();
    if (type === "checkbox") {
      el.checked = !!value;
      return;
    }
    if (type === "radio") {
      el.checked = el.value === String(value || "");
      return;
    }
    el.value = value == null ? "" : String(value);
  }

  function setById(id, value) {
    setValue(byId(id), value);
  }

  function fillCard(card, data) {
    if (!card || !data) {
      return;
    }
    Object.keys(data).forEach(function (key) {
      var value = data[key];
      if (value && typeof value === "object") {
        return;
      }
      var nodes = card.querySelectorAll('[data-field="' + key + '"]');
      Array.prototype.forEach.call(nodes, function (el) {
        var host = el.closest ? el.closest("[data-card]") : card;
        if (host !== card) {
          return;
        }
        setValue(el, value);
      });
    });
  }

  function fillLocationCard(card, location) {
    setEntity(card, location.locationId);
    fillCard(card, location);
    var assoc = card.querySelector('[data-field="locationAssociation"]');
    if (assoc) {
      assoc.value = location.association || "";
    }
    var pair = card.querySelector('[data-field="latLong"]');
    if (pair && location.latitude && location.longitude) {
      pair.value =
        (global.formatLatLongPair &&
          global.formatLatLongPair(location.latitude, location.longitude)) ||
        location.latitude + ", " + location.longitude;
    }
    var priority = card.querySelector('[data-field="targetPriority"]');
    if (priority) {
      priority.value = location.targetPriority || "";
    }
  }

  function clearList(listId) {
    var list = byId(listId);
    if (!list) {
      return;
    }
    Array.prototype.slice
      .call(list.querySelectorAll(":scope > fieldset"))
      .forEach(function (card) {
        card.remove();
      });
    list.dataset.nextCardIndex = "0";
  }

  function addCard(type) {
    if (root.cards && typeof root.cards.add === "function") {
      return root.cards.add(type);
    }
    return null;
  }

  function addNested(parent, kind) {
    if (parent && parent._addNested && typeof parent._addNested[kind] === "function") {
      return parent._addNested[kind]();
    }
    return null;
  }

  function replaceList(listId, type, items, fill, seedEmpty) {
    clearList(listId);
    var records = items || [];
    if (!records.length && seedEmpty) {
      addCard(type);
      return [];
    }
    return records.map(function (item) {
      var card = addCard(type);
      if (card && fill) {
        fill(card, item);
      }
      return card;
    });
  }

  function setEntity(card, id) {
    if (card && id) {
      card.dataset.entityId = id;
    }
  }

  function hydrateLead(snapshot) {
    if (!snapshot) {
      return;
    }

    var subject =
      (model.subjectOf && model.subjectOf(snapshot)) ||
      snapshot.person ||
      model.createPerson({ caseRole: "LEAD" });

    var leadCard = document.querySelector('[data-card="lead"]');
    if (leadCard) {
      leadCard.dataset.leadId = snapshot.leadId || "";
      leadCard.dataset.entityId = subject.personId || "";
      leadCard.dataset.createdAt =
        (snapshot.meta && snapshot.meta.createdAt) || "";
      fillCard(leadCard, {
        lastName: subject.name.lastName,
        firstName: subject.name.firstName,
        middleName: subject.name.middleName,
        sex: subject.sex,
        dateOfBirth: subject.dateOfBirth,
        age: subject.age === "" || subject.age == null ? "" : String(subject.age),
        citizenship: subject.citizenship,
        ssn: subject.ssn || ""
      });
      if (typeof global.updateAgeDisplay === "function") {
        global.updateAgeDisplay();
      }
    }

    var source = snapshot.source || {};
    setById("leadSource", source.leadSource || "");
    setById("caseNumber", source.caseNumber || "");
    setById("refAgency", source.refAgency || "");
    setById("refAgencyCode", source.refAgencyCode || "");
    setById("probationCheck", source.probationCheck);
    setById("leadInfo", source.leadInfo || "");
    if (typeof global.updateLeadSourceFields === "function") {
      global.updateLeadSourceFields();
    }

    replaceList(
      "aliasList",
      "alias",
      subject.aliases,
      function (card, alias) {
        setEntity(card, alias.aliasId);
        fillCard(card, alias);
      },
      false
    );

    replaceList(
      "documentList",
      "document",
      subject.documents,
      function (card, doc) {
        setEntity(card, doc.documentId);
        fillCard(card, doc);
      },
      true
    );

    var criminal = subject.criminal || {};
    setById("isCriminal", criminal.isCriminal);
    setById("fbiNumber", criminal.fbiNumber || "");
    setById("ncicNumber", criminal.ncicNumber || "");
    setById("stateId", criminal.stateId || "");
    setById("rapSheet", criminal.rapSheet || "");

    replaceList("encounterList", "encounter", subject.encounters, function (card, row) {
      setEntity(card, row.encounterId);
      fillCard(card, row);
    }, true);
    replaceList("arrestList", "arrest", subject.arrests, function (card, row) {
      setEntity(card, row.arrestId);
      fillCard(card, row);
    }, true);
    replaceList("convictionList", "conviction", subject.convictions, function (card, row) {
      setEntity(card, row.convictionId);
      fillCard(card, row);
    }, true);
    replaceList("warrantList", "warrant", subject.warrants, function (card, row) {
      setEntity(card, row.warrantId);
      fillCard(card, row);
    }, true);

    var immigration = subject.immigration || {};
    setById("alienNumber", immigration.alienNumber || "");
    setById("finNumber", immigration.finNumber || "");
    setById("immigrationDisposition", immigration.disposition || "");
    setById("immigrationStatus", immigration.status || "");
    setById("finalOrder", immigration.finalOrder);
    setById("finalOrderDate", immigration.finalOrderDate || "");

    replaceList(
      "locationList",
      "location",
      subject.locations,
      fillLocationCard,
      true
    );

    var vehicleLinks = (snapshot.links || []).filter(function (link) {
      return link.from && link.from.type === "VEHICLE";
    });

    replaceList(
      "vehicleList",
      "vehicle",
      snapshot.vehicles,
      function (card, vehicle) {
        setEntity(card, vehicle.vehicleId);
        fillCard(card, vehicle);
        fillCard(card, {
          registeredOwner: vehicle.registeredOwnerName || ""
        });
        var plate = card.querySelector('[data-field="licensePlate"]');
        if (typeof formatLicensePlate === "function") {
          formatLicensePlate(plate);
        } else if (plate) {
          plate.value = String(plate.value || "").toUpperCase();
        }
        var make = card.querySelector('[data-field="vehicleMake"]');
        if (make) {
          make.dispatchEvent(new Event("change"));
        }
        fillCard(card, {
          vehicleModel: vehicle.vehicleModel,
          vehicleBodyStyle: vehicle.vehicleBodyStyle
        });
        (vehicle.locations || []).forEach(function (location) {
          var locCard = addNested(card, "location");
          if (locCard) {
            fillLocationCard(locCard, location);
          }
        });
        vehicleLinks.forEach(function (link) {
          if (!link.from || link.from.id !== vehicle.vehicleId) {
            return;
          }
          var linkCard = addNested(card, "link");
          if (linkCard && typeof global.fillLinkCard === "function") {
            global.fillLinkCard(linkCard, link);
          }
        });
      },
      true
    );

    if (typeof global.refreshLocationAssociationOptions === "function") {
      global.refreshLocationAssociationOptions();
    }
    if (typeof global.refreshAddressTargetPriorityOptions === "function") {
      global.refreshAddressTargetPriorityOptions();
    }
    if (typeof global.updateCardTitles === "function") {
      global.updateCardTitles(byId("locationList"), "Location");
    }

    var relationshipRows = (snapshot.links || []).filter(function (link) {
      return (
        link.from &&
        link.from.type === "PERSON" &&
        link.to &&
        link.to.type === "PERSON"
      );
    });
    replaceList(
      "relationshipList",
      "relationship",
      relationshipRows,
      function (card, row) {
        setEntity(card, row.linkId);
        fillCard(card, {
          relatedPersonId: row.to && row.to.id,
          relationshipType: (row.reasons && row.reasons[0]) || ""
        });
      },
      false
    );

    if (typeof window.paintFollowUps === "function") {
      window.paintFollowUps(snapshot.followUps || []);
    }
    if (typeof window.applyLeadLane === "function") {
      window.applyLeadLane();
    }
    if (typeof model.fillPersonSelects === "function") {
      model.fillPersonSelects();
    }
  }

  model.hydrateLead = hydrateLead;
  model.clearRepeatableList = clearList;
})(typeof window !== "undefined" ? window : globalThis);
