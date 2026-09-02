/**
 * Form → snapshot.
 *
 * Walks the live form and builds one lead object.
 * Nested location cards on a vehicle become vehicle.locations.
 * Person-level location cards become person.locations.
 * Link cards become lead.links.
 *
 * Never throws for missing fields. Empty cards are skipped.
 */

(function (global) {
  "use strict";

  var root = (global.COPDoc = global.COPDoc || {});
  var model = (root.model = root.model || {});

  function byId(id) {
    return document.getElementById(id);
  }

  function textValue(el) {
    if (!el) {
      return "";
    }
    return String(el.value || "").trim();
  }

  function checked(el) {
    return !!(el && el.checked);
  }

  function ownsField(card, el) {
    var host = el.closest ? el.closest("[data-card]") : null;
    return host === card;
  }

  /**
   * Read data-field inputs that belong to THIS card, not nested cards.
   */
  function readFields(rootEl) {
    var out = {};
    if (!rootEl) {
      return out;
    }
    var nodes = rootEl.querySelectorAll("input, select, textarea");
    Array.prototype.forEach.call(nodes, function (el) {
      if (!ownsField(rootEl, el)) {
        return;
      }
      var key = el.getAttribute("data-field") || "";
      if (!key) {
        return;
      }
      var type = (el.type || "").toLowerCase();
      if (type === "button" || type === "submit" || type === "file") {
        return;
      }
      if (type === "radio") {
        if (el.checked) {
          out[key] = el.value;
        } else if (out[key] === undefined) {
          out[key] = "";
        }
        return;
      }
      if (type === "checkbox") {
        out[key] = !!el.checked;
        return;
      }
      out[key] = textValue(el);
    });
    return out;
  }

  function entityId(card, prefix) {
    if (card && card.dataset.entityId) {
      return card.dataset.entityId;
    }
    var id = model.newId(prefix);
    if (card) {
      card.dataset.entityId = id;
    }
    return id;
  }

  function cardHasData(card) {
    if (typeof global.cardHasData === "function") {
      return global.cardHasData(card);
    }
    var nodes = card.querySelectorAll("input, select, textarea");
    var i;
    for (i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (!ownsField(card, el)) {
        continue;
      }
      var type = (el.type || "").toLowerCase();
      if (type === "hidden" || type === "button" || type === "submit") {
        continue;
      }
      if (type === "checkbox" || type === "radio") {
        if (el.checked) {
          return true;
        }
        continue;
      }
      if (textValue(el)) {
        return true;
      }
    }
    return false;
  }

  function cardsIn(listId) {
    var list = byId(listId);
    if (!list) {
      return [];
    }
    return Array.prototype.slice.call(
      list.querySelectorAll(":scope > fieldset")
    );
  }

  function nestedCards(parentCard, kind) {
    var list = parentCard.querySelector('[data-nested-list="' + kind + '"]');
    if (!list) {
      return [];
    }
    return Array.prototype.slice.call(
      list.querySelectorAll(":scope > fieldset")
    );
  }

  function collectLocation(card) {
    var f = readFields(card);
    return model.createLocation({
      locationId: entityId(card, "loc"),
      street: f.street || "",
      street2: f.street2 || "",
      city: f.city || "",
      state: f.state || "",
      zip: f.zip || "",
      latitude: f.latitude || "",
      longitude: f.longitude || "",
      association: f.locationAssociation || f.addressAssociation || "",
      parksHere: f.parksHere || "",
      targetPriority: f.targetPriority || "",
      pinColor: f.pinColor || "",
      occupancy: f.occupancy || "current",
      occupiedFrom: f.occupiedFrom || "",
      occupiedTo: f.occupiedTo || "",
      notes: f.notes || "",
      otherResidents: f.otherResidents || ""
    });
  }

  function collectLink(card, vehicleId) {
    var f = readFields(card);
    var reasons = [];
    card.querySelectorAll('[data-field="linkReason"]').forEach(function (el) {
      if (el.checked && el.value) {
        reasons.push(el.value);
      }
    });
    var toId = f.linkedPersonId || "";
    if (!toId && !reasons.length && !f.linkNotes) {
      return null;
    }
    return model.createLink({
      linkId: entityId(card, "link"),
      from: { type: "VEHICLE", id: vehicleId },
      to: { type: "PERSON", id: toId },
      reasons: reasons,
      notes: f.linkNotes || ""
    });
  }

  function collectLead() {
    var leadCard = document.querySelector('[data-card="lead"]');
    var leadFields = readFields(leadCard);
    var subjectId = entityId(leadCard, "p");
    var leadId = (leadCard && leadCard.dataset.leadId) || "";
    var previous =
      leadId && model.store && typeof model.store.getLead === "function"
        ? model.store.getLead(leadId)
        : null;
    var prevSubject = previous
      ? model.subjectOf
        ? model.subjectOf(previous)
        : previous.person
      : null;

    var person = model.createPerson({
      personId: subjectId,
      caseRole: "LEAD",
      name: {
        lastName: leadFields.lastName || "",
        firstName: leadFields.firstName || "",
        middleName: leadFields.middleName || ""
      },
      sex: leadFields.sex || "",
      dateOfBirth: leadFields.dateOfBirth || "",
      age: (function () {
        if (leadFields.age === "" || leadFields.age == null) {
          return "";
        }
        var n = Number(leadFields.age);
        return isFinite(n) ? n : "";
      })(),
      citizenship: textValue(byId("citizenship")) || leadFields.citizenship || "",
      ssn: leadFields.ssn || textValue(byId("ssn")) || "",
      lexId: leadFields.lexId || textValue(byId("lexId")) || ""
    });

    cardsIn("aliasList").forEach(function (card) {
      if (!cardHasData(card)) {
        return;
      }
      var f = readFields(card);
      person.aliases.push(
        model.createAlias({
          aliasId: entityId(card, "als"),
          lastName: f.lastName || "",
          firstName: f.firstName || "",
          middleName: f.middleName || ""
        })
      );
    });

    cardsIn("documentList").forEach(function (card) {
      if (!cardHasData(card)) {
        return;
      }
      var f = readFields(card);
      person.documents.push(
        model.createDocument({
          documentId: entityId(card, "doc"),
          documentType: f.documentType || "",
          documentNumber: f.documentNumber || "",
          issuingState: f.issuingState || "",
          issuingCountry: f.issuingCountry || "",
          documentIssueDate: f.documentIssueDate || "",
          documentExpiration: f.documentExpiration || ""
        })
      );
    });

    person.criminal = {
      fbiNumber: textValue(byId("fbiNumber")),
      ncicNumber: textValue(byId("ncicNumber")),
      stateId: textValue(byId("stateId")),
      rapSheet: textValue(byId("rapSheet"))
    };

    cardsIn("encounterList").forEach(function (card) {
      if (!cardHasData(card)) {
        return;
      }
      var f = readFields(card);
      person.encounters.push(
        model.createEncounter({
          encounterId: entityId(card, "enc"),
          encounterDate: f.encounterDate || "",
          encounterRole: f.encounterRole || "",
          encounterType: f.encounterType || "",
          encounterDisposition: f.encounterDisposition || "",
          encounterAgency: f.encounterAgency || "",
          encounterAgencyCode: f.encounterAgencyCode || "",
          encounterReportNumber: f.encounterReportNumber || "",
          encounterLocation: f.encounterLocation || "",
          encounterNarrative: f.encounterNarrative || ""
        })
      );
    });

    cardsIn("arrestList").forEach(function (card) {
      if (!cardHasData(card)) {
        return;
      }
      var f = readFields(card);
      person.arrests.push(
        model.createArrest({
          arrestId: entityId(card, "arr"),
          arrestDate: f.arrestDate || "",
          arrestCharge: f.arrestCharge || "",
          arrestStatute: f.arrestStatute || "",
          arrestClass: f.arrestClass || "",
          arrestAgency: f.arrestAgency || "",
          arrestAgencyCode: f.arrestAgencyCode || "",
          arrestLocation: f.arrestLocation || ""
        })
      );
    });

    cardsIn("convictionList").forEach(function (card) {
      if (!cardHasData(card)) {
        return;
      }
      var f = readFields(card);
      person.convictions.push(
        model.createConviction({
          convictionId: entityId(card, "cnv"),
          crime: f.crime || "",
          convictionStatute: f.convictionStatute || "",
          convictionClass: f.convictionClass || "",
          disposition: f.disposition || "",
          convictionDate: f.convictionDate || "",
          dispositionDate: f.dispositionDate || "",
          court: f.court || "",
          docketNumber: f.docketNumber || "",
          sentence: f.sentence || ""
        })
      );
    });

    cardsIn("warrantList").forEach(function (card) {
      if (!cardHasData(card)) {
        return;
      }
      var f = readFields(card);
      person.warrants.push(
        model.createWarrant({
          warrantId: entityId(card, "wnt"),
          charge: f.charge || "",
          warrantNumber: f.warrantNumber || "",
          warrantDate: f.warrantDate || "",
          warrantStatus: f.warrantStatus || "",
          warrantIssuer: f.warrantIssuer || "",
          warrantIssuerCode: f.warrantIssuerCode || ""
        })
      );
    });

    person.immigration = {
      alienNumber: textValue(byId("alienNumber")),
      finNumber: textValue(byId("finNumber")),
      disposition: textValue(byId("immigrationDisposition")),
      status: textValue(byId("immigrationStatus")),
      finalOrder: checked(byId("finalOrder")),
      finalOrderDate: textValue(byId("finalOrderDate")),
      firstDeportationDate: textValue(byId("firstDeportationDate")),
      lastDeportationDate: textValue(byId("lastDeportationDate")),
      baseballCards: []
    };

    cardsIn("locationList").forEach(function (card) {
      var keepLoc =
        card.dataset.entityId &&
        prevSubject &&
        (prevSubject.locations || []).some(function (row) {
          return row && row.locationId === card.dataset.entityId;
        });
      if (!cardHasData(card) && !keepLoc) {
        return;
      }
      person.locations.push(collectLocation(card));
    });

    var vehicles = [];
    var links = [];

    cardsIn("vehicleList").forEach(function (card) {
      var ownHas = cardHasData(card);
      var nestedLocs = nestedCards(card, "location").filter(cardHasData);
      var nestedLinks = nestedCards(card, "link").filter(cardHasData);
      var keepId = card.dataset.entityId;
      var keepExisting =
        keepId &&
        previous &&
        (previous.vehicles || []).some(function (row) {
          return row && row.vehicleId === keepId;
        });
      if (!ownHas && !nestedLocs.length && !nestedLinks.length && !keepExisting) {
        return;
      }
      var f = readFields(card);
      var vehicleId = entityId(card, "veh");
      var vehicle = model.createVehicle({
        vehicleId: vehicleId,
        licensePlate: String(f.licensePlate || "").toUpperCase(),
        plateState: f.plateState || "",
        vehicleYear: f.vehicleYear || "",
        vehicleMake: f.vehicleMake || "",
        vehicleModel: f.vehicleModel || "",
        vehicleColor: f.vehicleColor || "",
        vehicleBodyStyle: f.vehicleBodyStyle || "",
        vin: f.vin || "",
        registeredOwnerName: f.registeredOwner || f.registeredOwnerName || "",
        governmentVehicle: false,
        occupancy: f.occupancy || "current",
        occupiedFrom: f.occupiedFrom || "",
        occupiedTo: f.occupiedTo || "",
        notes: f.notes || "",
        otherResidents: f.otherResidents || ""
      });
      nestedLocs.forEach(function (locCard) {
        vehicle.locations.push(collectLocation(locCard));
      });
      nestedLinks.forEach(function (linkCard) {
        var link = collectLink(linkCard, vehicleId);
        if (link && link.to.id) {
          links.push(link);
        }
      });
      vehicles.push(vehicle);
    });

    cardsIn("relationshipList").forEach(function (card) {
      if (!cardHasData(card)) {
        return;
      }
      var f = readFields(card);
      var otherId = f.relatedPersonId || "";
      var label = f.associationLabel || "";
      var otherType = f.otherType || (otherId ? "PERSON" : "");
      if (!label && !otherId) {
        return;
      }
      links.push(
        model.createLink({
          linkId: entityId(card, "link"),
          label: label,
          otherType: otherType || "PERSON",
          from: { type: "PERSON", id: subjectId },
          to: { type: otherType || "PERSON", id: otherId },
          reasons: f.relationshipType ? [f.relationshipType] : [],
          notes: f.notes || ""
        })
      );
    });

    var preservedHistory = [];
    if (!leadId) {
      leadId = model.newId("lead");
      if (leadCard) {
        leadCard.dataset.leadId = leadId;
      }
    }
    if (previous) {
      ((prevSubject && prevSubject.warrants) || []).forEach(function (row) {
        if (model.isIssuedWarrant && model.isIssuedWarrant(row)) {
          person.warrants.push(row);
        }
      });
      function mergePinColors(nextList, prevList) {
        var byId = {};
        (prevList || []).forEach(function (loc) {
          if (loc && loc.locationId && loc.pinColor) {
            byId[loc.locationId] = loc.pinColor;
          }
        });
        (nextList || []).forEach(function (loc) {
          if (loc && loc.locationId && !loc.pinColor && byId[loc.locationId]) {
            loc.pinColor = byId[loc.locationId];
          }
        });
      }
      mergePinColors(person.locations, prevSubject && prevSubject.locations);
      (previous.vehicles || []).forEach(function (prevVeh) {
        (vehicles || []).forEach(function (nextVeh) {
          if (
            prevVeh &&
            nextVeh &&
            prevVeh.vehicleId &&
            prevVeh.vehicleId === nextVeh.vehicleId
          ) {
            mergePinColors(nextVeh.locations, prevVeh.locations);
          }
        });
      });
      if (previous && Array.isArray(previous.history)) {
        preservedHistory = previous.history.slice();
      }
      var prevImm = (prevSubject && prevSubject.immigration) || {};
      if (Array.isArray(prevImm.baseballCards) && prevImm.baseballCards.length) {
        person.immigration.baseballCards = prevImm.baseballCards.slice();
      }
    }
    if (prevSubject && prevSubject.caseRole) {
      person.caseRole = prevSubject.caseRole;
    }
    if (typeof model.deriveCriminalProfile === "function") {
      model.deriveCriminalProfile(person);
    }
    var createdAt =
      (leadCard && leadCard.dataset.createdAt) || model.nowIso();
    if (leadCard) {
      leadCard.dataset.createdAt = createdAt;
    }

    return {
      schema: model.SCHEMA,
      leadId: leadId,
      subjectPersonId: subjectId,
      caseRole: (previous && previous.caseRole) || person.caseRole || "LEAD",
      source: model.createSource({
        leadSource: textValue(byId("leadSource")),
        caseNumber: textValue(byId("caseNumber")),
        refAgency: textValue(byId("refAgency")),
        refAgencyCode: textValue(byId("refAgencyCode")),
        probationCheck: checked(byId("probationCheck")),
        leadInfo: textValue(byId("leadInfo"))
      }),
      person: person,
      vehicles: vehicles,
      links: links,
      history: preservedHistory,
      followUps:
        typeof window.followUpRecords === "function"
          ? window.followUpRecords()
          : [],
      meta: {
        createdAt: createdAt,
        updatedAt: model.nowIso(),
        markedComplete: false
      }
    };
  }

  model.collectLead = collectLead;
  model.readFields = readFields;
  model.collectLocation = collectLocation;
})(typeof window !== "undefined" ? window : globalThis);
