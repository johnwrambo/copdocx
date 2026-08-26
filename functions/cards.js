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

var ADDRESS_ASSOCIATION_STATIC = [
  { value: "residence", label: "Residence" },
  { value: "work", label: "Work" }
];

function getVehicleAssociationChoices() {
  var list = document.getElementById("vehicleList");
  if (!list) {
    return [];
  }
  var choices = [];
  list.querySelectorAll(":scope > fieldset").forEach(function (card, index) {
    var n = String(index + 1);
    var key = card.dataset.cardKey || n;
    choices.push({
      value: "vehicle-registration-" + key,
      label: "Vehicle " + n + " registration address"
    });
    choices.push({
      value: "vehicle-location-" + key,
      label: "Vehicle " + n + " known location"
    });
  });
  return choices;
}

function refreshAddressAssociationOptions() {
  var vehicleChoices = getVehicleAssociationChoices();
  document
    .querySelectorAll('[data-field="addressAssociation"]')
    .forEach(function (select) {
      if (select.closest("template")) {
        return;
      }
      var current = select.value;
      select.replaceChildren();

      var placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = "Select an Option";
      select.appendChild(placeholder);

      ADDRESS_ASSOCIATION_STATIC.concat(vehicleChoices).forEach(function (item) {
        var option = document.createElement("option");
        option.value = item.value;
        option.textContent = item.label;
        select.appendChild(option);
      });

      var stillThere = Array.prototype.some.call(select.options, function (option) {
        return option.value === current;
      });
      select.value = stillThere ? current : "";
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

function updateCardTitles(list, title, allowEmpty) {
  var cards = list.querySelectorAll(":scope > fieldset");
  cards.forEach(function (card, index) {
    var toggle = card.querySelector(":scope > legend .card-toggle");
    if (toggle) {
      toggle.textContent = title + " " + (index + 1);
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
        refreshAddressAssociationOptions();
      });
      legend.appendChild(remove);
    }
  }

  if (typeof bind === "function") {
    bind(card);
  }
  updateCardTitles(list, title, allowEmpty);
  refreshAddressAssociationOptions();
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
  listId: "vehicleList",
  templateId: "vehicleCardTemplate",
  addButtonId: "addVehicleButton",
  title: "Vehicle",
  prefix: "vehicle",
  bind: typeof bindVehicleCard === "function" ? bindVehicleCard : null
});

initRepeatable({
  listId: "addressList",
  templateId: "addressCardTemplate",
  addButtonId: "addAddressButton",
  title: "Address",
  prefix: "address",
  bind: typeof bindAddressCard === "function" ? bindAddressCard : null
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

function bindArrestCard(card) {
  bindCardAgencySearch(card, "arrestAgency", "arrestAgencyCode");
}

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
window.COPDoc.cards.addArrest = function addArrestCard() {
  return window.COPDoc.cards.add("arrest");
};
window.COPDoc.cards.addConviction = function addConvictionCard() {
  return window.COPDoc.cards.add("conviction");
};
