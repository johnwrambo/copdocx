/**
 * Repeatable cards (alias / vehicle / address) and minimize on every fieldset.
 * Legend: down-arrow collapses, + adds, x removes (warns if the card has data).
 */

var cardSerial = 0;
var repeatableCardAdders = {};

function enhanceFieldset(fieldset) {
  if (!fieldset || fieldset.dataset.collapseReady === "true") {
    return;
  }
  // Book-in (and any glued-open card): no toggle, no collapse.
  if (
    fieldset.classList.contains("card-static") ||
    fieldset.getAttribute("data-collapse") === "off"
  ) {
    fieldset.dataset.collapseReady = "true";
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
  });
}

function enhanceAllFieldsets(root) {
  (root || document)
    .querySelectorAll("fieldset")
    .forEach(function (fieldset) {
      enhanceFieldset(fieldset);
    });
}

function uniqueCardIds(card, prefix, index) {
  var uid = prefix + "-" + index + "-" + ++cardSerial;
  card.dataset.cardKey = uid;
  card.querySelectorAll("[id]").forEach(function (el) {
    el.id = uid + "-" + el.id;
  });
  card.querySelectorAll("[for]").forEach(function (el) {
    el.htmlFor = uid + "-" + el.getAttribute("for");
  });
  card.querySelectorAll("[name]").forEach(function (el) {
    var field = el.getAttribute("data-field") || el.name;
    el.name = prefix + "[" + index + "][" + field + "]";
  });
  card.querySelectorAll("[aria-controls]").forEach(function (el) {
    el.setAttribute(
      "aria-controls",
      uid + "-" + el.getAttribute("aria-controls")
    );
  });
}

function locationOwnerOf(select) {
  var list = select && select.closest("[data-location-owner]");
  return (list && list.getAttribute("data-location-owner")) || "person";
}

function locationAssociationChoices(owner) {
  if (
    window.COPDoc &&
    COPDoc.model &&
    owner === "vehicle" &&
    COPDoc.model.VEHICLE_LOCATION_ASSOCIATIONS
  ) {
    return COPDoc.model.VEHICLE_LOCATION_ASSOCIATIONS;
  }
  if (window.COPDoc && COPDoc.model && COPDoc.model.PERSON_LOCATION_ASSOCIATIONS) {
    return COPDoc.model.PERSON_LOCATION_ASSOCIATIONS;
  }
  if (owner === "vehicle") {
    return [
      { value: "registration", label: "Registration address" },
      { value: "known-parking", label: "Known parking location" },
      { value: "plate-check", label: "Plate check location" }
    ];
  }
  return [
    { value: "residence", label: "Residence" },
    { value: "work", label: "Work" }
  ];
}

function fillLocationAssociationSelect(select) {
  if (!select) {
    return;
  }
  var current = select.value;
  var choices = locationAssociationChoices(locationOwnerOf(select));
  select.replaceChildren();
  var placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Select an Option";
  select.appendChild(placeholder);
  choices.forEach(function (item) {
    var option = document.createElement("option");
    option.value = item.value;
    option.textContent = item.label;
    select.appendChild(option);
  });
  var stillThere = Array.prototype.some.call(select.options, function (option) {
    return option.value === current;
  });
  select.value = stillThere ? current : "";
}

function refreshLocationAssociationOptions() {
  document
    .querySelectorAll('[data-field="locationAssociation"]')
    .forEach(function (select) {
      if (select.closest("template")) {
        return;
      }
      fillLocationAssociationSelect(select);
    });
  refreshAddressTargetPriorityOptions();
}

function refreshAddressAssociationOptions() {
  refreshLocationAssociationOptions();
}

function addressTargetPriorityLabel(rank) {
  var n = Number(rank);
  if (!n) {
    return "";
  }
  if (n === 1) {
    return "Primary target";
  }
  if (n === 2) {
    return "Secondary";
  }
  if (n === 3) {
    return "Tertiary";
  }
  var tens = n % 100;
  var ones = n % 10;
  var suffix = "th";
  if (tens < 11 || tens > 13) {
    if (ones === 1) {
      suffix = "st";
    } else if (ones === 2) {
      suffix = "nd";
    } else if (ones === 3) {
      suffix = "rd";
    }
  }
  return n + suffix;
}

function refreshAddressTargetPriorityOptions() {
  var cards = document.querySelectorAll('[data-card="location"]');
  var maxRank = Math.max(3, cards.length);
  cards.forEach(function (card) {
    var select = card.querySelector('[data-field="targetPriority"]');
    if (!select || select.closest("template")) {
      return;
    }
    var current = select.value;
    select.replaceChildren();
    var placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Not a target address";
    select.appendChild(placeholder);
    var i;
    for (i = 1; i <= maxRank; i++) {
      var option = document.createElement("option");
      option.value = String(i);
      option.textContent = addressTargetPriorityLabel(i);
      select.appendChild(option);
    }
    var stillThere = Array.prototype.some.call(select.options, function (option) {
      return option.value === current;
    });
    select.value = stillThere ? current : "";
  });
}

function uniqueAddressTargetPriority(sourceCard) {
  var select = sourceCard.querySelector('[data-field="targetPriority"]');
  var value = select ? select.value : "";
  if (!value) {
    return;
  }
  document.querySelectorAll('[data-card="location"]').forEach(function (card) {
    if (card === sourceCard || card.closest("template")) {
      return;
    }
    var other = card.querySelector('[data-field="targetPriority"]');
    if (other && other.value === value) {
      other.value = "";
    }
  });
}

function bindAddressTargetPriority(card) {
  var select = card.querySelector('[data-field="targetPriority"]');
  if (!select || select.dataset.priorityBound === "true") {
    return;
  }
  select.dataset.priorityBound = "true";
  select.addEventListener("change", function () {
    uniqueAddressTargetPriority(card);
    var list = card.closest(".card-list");
    updateCardTitles(list, "Location", true);
  });
}

function syncParksHere(card) {
  var assoc = card.querySelector('[data-field="locationAssociation"]');
  var wrap = card.querySelector('[data-show-association="registration"]');
  if (!wrap) {
    return;
  }
  wrap.hidden = !(assoc && assoc.value === "registration");
}

function bindAddressCardFull(card) {
  fillLocationAssociationSelect(
    card.querySelector('[data-field="locationAssociation"]')
  );
  if (typeof bindAddressCard === "function") {
    bindAddressCard(card);
  }
  bindAddressTargetPriority(card);
  refreshAddressTargetPriorityOptions();
  syncParksHere(card);
  var assoc = card.querySelector('[data-field="locationAssociation"]');
  if (assoc && assoc.dataset.parksBound !== "true") {
    assoc.dataset.parksBound = "true";
    assoc.addEventListener("change", function () {
      syncParksHere(card);
    });
  }
  ["licensePlate", "plateState", "street", "city", "lastName", "firstName"].forEach(
    function (name) {
      var el = card.querySelector('[data-field="' + name + '"]');
      if (!el || el.dataset.summaryBound === "true") {
        return;
      }
      el.dataset.summaryBound = "true";
      el.addEventListener("input", function () {
        var list = card.closest(".card-list");
        var title =
          card.getAttribute("data-card") === "vehicle"
            ? "Vehicle"
            : card.getAttribute("data-card") === "location"
              ? "Location"
              : "Card";
        updateCardTitles(list, title, true);
      });
    }
  );
}

function bindNestedList(parentCard, options) {
  var list = parentCard.querySelector(
    '[data-nested-list="' + options.kind + '"]'
  );
  var addBtn = parentCard.querySelector(
    '[data-add-nested="' + options.kind + '"]'
  );
  var template = document.getElementById(options.templateId);
  if (!list || !template) {
    return;
  }
  function add() {
    return addRepeatableCard({
      list: list,
      template: template,
      title: options.title,
      prefix: options.prefix,
      bind: options.bind,
      add: add,
      allowEmpty: true
    });
  }
  parentCard._addNested = parentCard._addNested || {};
  parentCard._addNested[options.kind] = add;
  if (addBtn && addBtn.dataset.nestedBound !== "true") {
    addBtn.dataset.nestedBound = "true";
    addBtn.addEventListener("click", add);
  }
}

function bindVehicleCardFull(card) {
  if (typeof bindVehicleCard === "function") {
    bindVehicleCard(card);
  }
  ["licensePlate", "plateState"].forEach(function (name) {
    var el = card.querySelector('[data-field="' + name + '"]');
    if (!el || el.dataset.summaryBound === "true") {
      return;
    }
    el.dataset.summaryBound = "true";
    el.addEventListener("input", function () {
      updateCardTitles(card.closest(".card-list"), "Vehicle", true);
    });
    el.addEventListener("change", function () {
      updateCardTitles(card.closest(".card-list"), "Vehicle", true);
    });
  });
  bindNestedList(card, {
    kind: "location",
    templateId: "locationCardTemplate",
    title: "Location",
    prefix: "location",
    bind: bindAddressCardFull
  });
  bindNestedList(card, {
    kind: "link",
    templateId: "linkCardTemplate",
    title: "Link",
    prefix: "link",
    bind: bindLinkCard
  });
}

function cardHasData(card) {
  var controls = card.querySelectorAll("input, select, textarea");
  var i;
  for (i = 0; i < controls.length; i++) {
    var el = controls[i];
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
    if (String(el.value || "").trim() !== "") {
      return true;
    }
  }
  return false;
}

function syncEmptyAddButton(list) {
  if (!list) {
    return;
  }
  var addId = list.dataset.emptyAddId;
  var addButton = addId ? document.getElementById(addId) : null;
  if (!addButton) {
    return;
  }
  var actions = addButton.closest(".card-list-actions");
  if (!actions) {
    return;
  }
  var count = list.querySelectorAll(":scope > fieldset").length;
  actions.hidden = count > 0;
}

function cardSummary(card) {
  function val(name) {
    var el = card.querySelector('[data-field="' + name + '"]');
    return el ? String(el.value || "").trim() : "";
  }
  var kind = card.getAttribute("data-card");
  if (kind === "vehicle") {
    return [val("plateState"), val("licensePlate")].filter(Boolean).join(" ");
  }
  if (kind === "location") {
    var bits = [val("street"), val("city")].filter(Boolean);
    var assoc = val("locationAssociation");
    if (assoc) {
      bits.push("(" + assoc + ")");
    }
    return bits.join(" ");
  }
  if (kind === "lead" || kind === "alias") {
    return [val("lastName"), val("firstName")].filter(Boolean).join(", ");
  }
  return "";
}

function updateCardTitles(list, title, allowEmpty) {
  var cards = list.querySelectorAll(":scope > fieldset");
  cards.forEach(function (card, index) {
    var toggle = card.querySelector(":scope > legend .card-toggle");
    if (toggle) {
      var extra = "";
      if (card.getAttribute("data-card") === "location") {
        var priority = card.querySelector('[data-field="targetPriority"]');
        var label = addressTargetPriorityLabel(priority && priority.value);
        if (label) {
          extra = " — " + label;
        }
      }
      var summary = cardSummary(card);
      toggle.textContent =
        title +
        " " +
        (index + 1) +
        extra +
        (summary ? " — " + summary : "");
    }
    var remove = card.querySelector(":scope > legend .card-remove");
    if (remove) {
      remove.hidden = !allowEmpty && cards.length < 2;
    }
  });
  syncEmptyAddButton(list);
}

function addRepeatableCard(options) {
  var list = options.list;
  var template = options.template;
  var title = options.title;
  var prefix = options.prefix;
  var bind = options.bind;
  var add = options.add;
  var allowEmpty = options.allowEmpty === true;
  var nextIndex = Number(list.dataset.nextCardIndex);
  if (!Number.isFinite(nextIndex) || nextIndex < 0) {
    nextIndex = list.querySelectorAll(":scope > fieldset").length;
  }
  var index = nextIndex;
  list.dataset.nextCardIndex = String(nextIndex + 1);
  var card = template.content.firstElementChild.cloneNode(true);

  uniqueCardIds(card, prefix, index);
  list.appendChild(card);
  enhanceFieldset(card);

  var legend = card.querySelector(":scope > legend");
  if (legend) {
    if (!legend.querySelector(".card-add")) {
      var plus = document.createElement("button");
      plus.type = "button";
      plus.className = "card-icon-btn card-add";
      plus.setAttribute("aria-label", "Add " + title.toLowerCase());
      plus.setAttribute("title", "Add " + title.toLowerCase());
      plus.textContent = "+";
      plus.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();
        if (typeof add === "function") {
          add();
        }
      });
      legend.appendChild(plus);
    }

    if (!legend.querySelector(".card-remove")) {
      var remove = document.createElement("button");
      remove.type = "button";
      remove.className = "card-icon-btn card-remove";
      remove.setAttribute("aria-label", "Remove " + title.toLowerCase());
      remove.setAttribute("title", "Remove " + title.toLowerCase());
      remove.textContent = "x";
      remove.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();
        if (
          !allowEmpty &&
          list.querySelectorAll(":scope > fieldset").length < 2
        ) {
          return;
        }
        if (cardHasData(card)) {
          var ok = window.confirm(
            "This " +
              title.toLowerCase() +
              " card has data. Remove it anyway?"
          );
          if (!ok) {
            return;
          }
        }
        card.remove();
        updateCardTitles(list, title, allowEmpty);
        refreshLocationAssociationOptions();
      });
      legend.appendChild(remove);
    }
  }

  if (typeof bind === "function") {
    bind(card);
  }
  updateCardTitles(list, title, allowEmpty);
  refreshLocationAssociationOptions();
  return card;
}

function addPlateCheckAddress() {
  var vehicleList = document.getElementById("vehicleList");
  var vehicle =
    vehicleList && vehicleList.querySelector(":scope > fieldset");
  if (!vehicle && typeof repeatableCardAdders.vehicle === "function") {
    vehicle = repeatableCardAdders.vehicle();
  }
  if (!vehicle || !vehicle._addNested || !vehicle._addNested.location) {
    return null;
  }
  var existing = vehicle.querySelectorAll(
    '[data-nested-list="location"] > fieldset'
  );
  var card = null;
  var i;
  for (i = 0; i < existing.length; i++) {
    var assoc = existing[i].querySelector(
      '[data-field="locationAssociation"]'
    );
    var street = existing[i].querySelector('[data-field="street"]');
    if (
      assoc &&
      (assoc.value === "plate-check" || !assoc.value) &&
      street &&
      !String(street.value || "").trim()
    ) {
      card = existing[i];
      break;
    }
  }
  if (!card) {
    card = vehicle._addNested.location();
  }
  if (!card) {
    return null;
  }
  var select = card.querySelector('[data-field="locationAssociation"]');
  if (select) {
    fillLocationAssociationSelect(select);
    select.value = "plate-check";
  }
  card.classList.remove("is-collapsed");
  vehicle.classList.remove("is-collapsed");
  if (typeof card.scrollIntoView === "function") {
    card.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  var streetInput = card.querySelector('[data-field="street"]');
  if (streetInput) {
    streetInput.focus();
  }
  return card;
}

function initRepeatable(options) {
  var list = document.getElementById(options.listId);
  var template = document.getElementById(options.templateId);
  var addButton = document.getElementById(options.addButtonId);
  if (!list || !template) {
    return;
  }
  if (options.addButtonId) {
    list.dataset.emptyAddId = options.addButtonId;
  }

  function add() {
    return addRepeatableCard({
      list: list,
      template: template,
      title: options.title,
      prefix: options.prefix,
      bind: options.bind,
      add: add,
      allowEmpty: options.allowEmpty === true
    });
  }

  repeatableCardAdders[options.prefix] = add;

  if (options.seed !== false) {
    add();
  }

  if (addButton) {
    addButton.addEventListener("click", add);
  }
  syncEmptyAddButton(list);
}

function bindAliasCard(card) {
  if (typeof bindNameCard === "function") {
    bindNameCard(card);
  }
}

function getPersonRelationshipChoices() {
  var matrix =
    (typeof COPDoc !== "undefined" &&
      COPDoc.models &&
      COPDoc.models.ASSOCIATION_MATRIX) ||
    [];
  var seen = {};
  var choices = [];

  function addChoice(value, label) {
    if (!value || seen[value]) {
      return;
    }
    seen[value] = true;
    choices.push({ value: value, label: label });
  }

  matrix.forEach(function (row) {
    if (!row || row.active === false) {
      return;
    }
    if (row.fromEntityTypeCode !== "PERSON" || row.toEntityTypeCode !== "PERSON") {
      return;
    }
    addChoice(row.code, row.label);
    if (row.inverseTypeCode && row.inverseTypeCode !== row.code) {
      addChoice(row.inverseTypeCode, row.inverseLabel || row.inverseTypeCode);
    }
  });

  return choices;
}

function bindRelationshipCard(card) {
  var typeSelect = card.querySelector('[data-field="relationshipType"]');
  if (typeof fillSelect === "function") {
    fillSelect(
      typeSelect,
      getPersonRelationshipChoices(),
      "Select a Relationship"
    );
  }
  if (
    window.COPDoc &&
    COPDoc.model &&
    typeof COPDoc.model.fillPersonSelects === "function"
  ) {
    COPDoc.model.fillPersonSelects();
  }
}

function searchSubjects(query) {
  var q = String(query || "").toLowerCase().trim();
  var hits = [];
  var model = window.COPDoc && COPDoc.model;
  if (!model) {
    return hits;
  }
  var sid = typeof model.subjectId === "function" ? model.subjectId() : "";
  var leadCard = document.querySelector('[data-card="lead"]');
  var leadName =
    model.formatPersonLabel && model.readFields && leadCard
      ? model.formatPersonLabel(model.readFields(leadCard))
      : "";
  if (sid) {
    hits.push({
      id: sid,
      label: leadName ? "This lead — " + leadName : "This lead"
    });
  }
  if (model.store && typeof model.store.allPeople === "function") {
    model.store.allPeople().forEach(function (person) {
      if (!person || person.personId === sid) {
        return;
      }
      hits.push({
        id: person.personId,
        label: model.formatPersonLabel(person) || "Untitled person"
      });
    });
  }
  if (!q) {
    return hits.slice(0, 12);
  }
  return hits
    .filter(function (hit) {
      return hit.label.toLowerCase().indexOf(q) !== -1;
    })
    .slice(0, 12);
}

function bindLinkCard(card) {
  if (!card || card.dataset.linkBound === "true") {
    return;
  }
  card.dataset.linkBound = "true";
  var box = card.querySelector("[data-field='linkReasons']") ||
    card.querySelector(".link-reasons");
  var reasons =
    (window.LINK_REASONS) ||
    (window.COPDoc && COPDoc.data && COPDoc.data.linkReasons) ||
    [];
  if (box && !box.childElementCount) {
    reasons.forEach(function (reason) {
      var label = document.createElement("label");
      var input = document.createElement("input");
      input.type = "checkbox";
      input.value = reason.code;
      input.setAttribute("data-field", "linkReason");
      label.appendChild(input);
      label.appendChild(document.createTextNode(" " + reason.label));
      box.appendChild(label);
    });
  }
  var search = card.querySelector('[data-field="linkedPersonSearch"]');
  var hidden = card.querySelector('[data-field="linkedPersonId"]');
  var results = card.querySelector(".search-results");
  if (!search || !results) {
    return;
  }
  function hide() {
    results.hidden = true;
    results.replaceChildren();
  }
  function choose(hit) {
    if (hidden) {
      hidden.value = hit.id;
    }
    search.value = hit.label;
    hide();
  }
  function render() {
    var hits = searchSubjects(search.value);
    results.replaceChildren();
    if (!hits.length) {
      hide();
      return;
    }
    hits.forEach(function (hit) {
      var li = document.createElement("li");
      li.textContent = hit.label;
      li.setAttribute("role", "option");
      li.addEventListener("mousedown", function (event) {
        event.preventDefault();
        choose(hit);
      });
      results.appendChild(li);
    });
    results.hidden = false;
  }
  search.addEventListener("input", render);
  search.addEventListener("focus", render);
  search.addEventListener("blur", function () {
    window.setTimeout(hide, 120);
  });
}

function fillLinkCard(card, link) {
  if (!card || !link) {
    return;
  }
  bindLinkCard(card);
  var hidden = card.querySelector('[data-field="linkedPersonId"]');
  var search = card.querySelector('[data-field="linkedPersonSearch"]');
  var toId = link.to && link.to.id;
  if (hidden) {
    hidden.value = toId || "";
  }
  if (search && toId) {
    var hits = searchSubjects("");
    var hit = hits.filter(function (row) {
      return row.id === toId;
    })[0];
    search.value = hit ? hit.label : toId;
  }
  var reasons = link.reasons || [];
  card.querySelectorAll('[data-field="linkReason"]').forEach(function (el) {
    el.checked = reasons.indexOf(el.value) !== -1;
  });
  var notes = card.querySelector('[data-field="linkNotes"]');
  if (notes) {
    notes.value = link.notes || "";
  }
}

window.fillLinkCard = fillLinkCard;

enhanceAllFieldsets(document);

initRepeatable({
  listId: "aliasList",
  templateId: "aliasCardTemplate",
  addButtonId: "addAliasButton",
  title: "Alias",
  prefix: "alias",
  bind: bindAliasCard,
  seed: false,
  allowEmpty: true
});

initRepeatable({
  listId: "relationshipList",
  templateId: "relationshipCardTemplate",
  addButtonId: "addRelationshipButton",
  title: "Relationship",
  prefix: "relationship",
  bind: bindRelationshipCard,
  seed: false,
  allowEmpty: true
});

initRepeatable({
  listId: "vehicleList",
  templateId: "vehicleCardTemplate",
  addButtonId: "addVehicleButton",
  title: "Vehicle",
  prefix: "vehicle",
  bind: bindVehicleCardFull
});

initRepeatable({
  listId: "locationList",
  templateId: "locationCardTemplate",
  addButtonId: "addLocationButton",
  title: "Location",
  prefix: "location",
  bind: bindAddressCardFull
});

function bindDocumentCard(card) {
  var typeSelect = card.querySelector('[data-field="documentType"]');
  var stateSelect = card.querySelector('[data-field="issuingState"]');
  var countrySelect = card.querySelector('[data-field="issuingCountry"]');

  if (typeof fillSelect === "function") {
    fillSelect(
      typeSelect,
      typeof IDENTITY_DOCUMENT_TYPES !== "undefined"
        ? IDENTITY_DOCUMENT_TYPES.filter(function (item) {
            return item && item.active !== false;
          })
        : [],
      "Select a Type"
    );
    fillSelect(
      stateSelect,
      typeof US_STATES !== "undefined"
        ? US_STATES.filter(function (item) {
            return item && item.active !== false;
          })
        : [],
      "Select a State",
      function (state) {
        return state.code;
      },
      function (state) {
        return state.code + " — " + state.label;
      }
    );
  }

  if (typeof populateCitizenshipSelect === "function") {
    populateCitizenshipSelect(countrySelect, false);
    if (countrySelect && countrySelect.options[0]) {
      countrySelect.options[0].textContent = "Select a Country";
    }
  }
}

initRepeatable({
  listId: "documentList",
  templateId: "documentCardTemplate",
  addButtonId: "addDocumentButton",
  title: "Document",
  prefix: "document",
  bind: bindDocumentCard
});

function bindCardAgencySearch(card, inputField, codeField) {
  if (typeof attachLawEnforcementSearch !== "function") {
    return;
  }
  var input = card.querySelector('[data-field="' + inputField + '"]');
  var results = card.querySelector(".search-results");
  var codeInput = card.querySelector('[data-field="' + codeField + '"]');
  if (!input || !results) {
    return;
  }
  attachLawEnforcementSearch(input, {
    resultsList: results,
    codeInput: codeInput
  });
}

function bindWarrantCard(card) {
  bindCardAgencySearch(card, "warrantIssuer", "warrantIssuerCode");
}

function catalogItems(name) {
  var catalogs = window.COPDoc && window.COPDoc.catalogs;
  var list = catalogs && catalogs[name];
  return (list || []).filter(function (item) {
    return item && item.active !== false;
  });
}

function bindEncounterCard(card) {
  if (typeof fillSelect === "function") {
    fillSelect(
      card.querySelector('[data-field="encounterRole"]'),
      catalogItems("POLICE_ENCOUNTER_ROLES"),
      "Select a Role"
    );
    fillSelect(
      card.querySelector('[data-field="encounterType"]'),
      catalogItems("POLICE_ENCOUNTER_TYPES"),
      "Select a Type"
    );
    fillSelect(
      card.querySelector('[data-field="encounterDisposition"]'),
      catalogItems("POLICE_ENCOUNTER_DISPOSITIONS"),
      "Select a Disposition"
    );
  }
  bindCardAgencySearch(card, "encounterAgency", "encounterAgencyCode");
}

function bindArrestCard(card) {
  bindCardAgencySearch(card, "arrestAgency", "arrestAgencyCode");
}

initRepeatable({
  listId: "encounterList",
  templateId: "encounterCardTemplate",
  addButtonId: "addEncounterButton",
  title: "Police Encounter",
  prefix: "encounter",
  bind: bindEncounterCard
});

initRepeatable({
  listId: "arrestList",
  templateId: "arrestCardTemplate",
  addButtonId: "addArrestButton",
  title: "Arrest",
  prefix: "arrest",
  bind: bindArrestCard
});

initRepeatable({
  listId: "convictionList",
  templateId: "convictionCardTemplate",
  addButtonId: "addConvictionButton",
  title: "Conviction",
  prefix: "conviction"
});

initRepeatable({
  listId: "warrantList",
  templateId: "warrantCardTemplate",
  addButtonId: "addWarrantButton",
  title: "Warrant",
  prefix: "warrant",
  bind: bindWarrantCard
});

window.COPDoc = window.COPDoc || {};
window.COPDoc.cards = window.COPDoc.cards || {};
window.COPDoc.cards.add = function addCardByType(type) {
  var add = repeatableCardAdders[String(type || "")];
  return typeof add === "function" ? add() : null;
};
window.COPDoc.cards.addAlias = function addAliasCard() {
  return window.COPDoc.cards.add("alias");
};
window.COPDoc.cards.addDocument = function addDocumentCard() {
  return window.COPDoc.cards.add("document");
};
window.COPDoc.cards.addEncounter = function addEncounterCard() {
  return window.COPDoc.cards.add("encounter");
};
window.COPDoc.cards.addArrest = function addArrestCard() {
  return window.COPDoc.cards.add("arrest");
};
window.COPDoc.cards.addConviction = function addConvictionCard() {
  return window.COPDoc.cards.add("conviction");
};
window.COPDoc.cards.addWarrant = function addWarrantCard() {
  return window.COPDoc.cards.add("warrant");
};
window.COPDoc.cards.addLocation = function addLocationCard() {
  return window.COPDoc.cards.add("location");
};
window.COPDoc.cards.addAddress = window.COPDoc.cards.addLocation;
