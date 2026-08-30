/**
 * Save / open / new, plus person pickers.
 *
 * Registered Owner "Owner is" select:
 *   ""        = name string only (no Person record)
 *   this lead = the subject person (even if their name is still blank)
 *   other ids = people from previously saved leads
 *
 * Relationship Person select is link-only: other saved people, not create.
 */

(function (global) {
  "use strict";

  var root = (global.COPDoc = global.COPDoc || {});
  var model = (root.model = root.model || {});

  function byId(id) {
    return document.getElementById(id);
  }

  function subjectCard() {
    return document.querySelector('[data-card="lead"]');
  }

  function subjectId() {
    var card = subjectCard();
    if (!card) {
      return "";
    }
    if (!card.dataset.entityId) {
      card.dataset.entityId = model.newId("p");
    }
    if (!card.dataset.leadId) {
      card.dataset.leadId = model.newId("lead");
    }
    if (!card.dataset.createdAt) {
      card.dataset.createdAt = model.nowIso();
    }
    return card.dataset.entityId;
  }

  function subjectName() {
    var card = subjectCard();
    if (!card) {
      return "";
    }
    var fields = model.readFields ? model.readFields(card) : {};
    return model.formatPersonLabel({
      lastName: fields.lastName,
      firstName: fields.firstName,
      middleName: fields.middleName
    });
  }

  var suppressAutoSave = false;
  var lastLeadSignature = "";
  var autoSaveBound = false;

  function setStatus(message, isOk) {
    var el = byId("leadSaveStatus");
    if (!el) {
      return;
    }
    if (!message) {
      el.hidden = true;
      el.textContent = "";
      el.classList.remove("is-ok");
      return;
    }
    el.hidden = false;
    el.textContent = message;
    if (isOk) {
      el.classList.add("is-ok");
    } else {
      el.classList.remove("is-ok");
    }
  }

  function fillSelectEl(select, items, placeholder) {
    if (!select) {
      return;
    }
    var current = select.value;
    if (typeof global.fillSelect === "function") {
      global.fillSelect(select, items, placeholder);
    } else {
      select.replaceChildren();
      var blank = document.createElement("option");
      blank.value = "";
      blank.textContent = placeholder;
      select.appendChild(blank);
      items.forEach(function (item) {
        var option = document.createElement("option");
        option.value = item.code;
        option.textContent = item.label;
        select.appendChild(option);
      });
    }
    var still = Array.prototype.some.call(select.options, function (option) {
      return option.value === current;
    });
    if (still) {
      select.value = current;
    }
  }

  function otherPeople() {
    var sid = subjectId();
    if (!model.store) {
      return [];
    }
    return model.store.allPeople().filter(function (person) {
      return person.personId && person.personId !== sid;
    });
  }

  function fillPersonSelects() {
    var leadLabel = "This lead";
    var name = subjectName();
    if (name) {
      leadLabel += " — " + name;
    }
    var leadItem = { code: subjectId(), label: leadLabel };
    var others = otherPeople().map(function (person) {
      return {
        code: person.personId,
        label: model.formatPersonLabel(person) || "Untitled person"
      };
    });

    document
      .querySelectorAll('select[data-field="registeredOwnerPersonId"]')
      .forEach(function (select) {
        if (select.closest("template")) {
          return;
        }
        fillSelectEl(
          select,
          [leadItem].concat(others),
          "Name only (not a person record)"
        );
      });

    document
      .querySelectorAll('[data-field="relatedPersonId"]')
      .forEach(function (select) {
        if (select.closest("template")) {
          return;
        }
        select.disabled = false;
        fillSelectEl(
          select,
          others,
          others.length
            ? "Select a person"
            : "No other saved people yet"
        );
      });
  }

  function refreshSavedLeadSelect() {
    var select = byId("savedLeadSelect");
    if (!select || !model.store) {
      return;
    }
    var current = select.value || model.store.getCurrentLeadId();
    var items = model.store.listLeads().map(function (row) {
      var when = row.updatedAt ? String(row.updatedAt).slice(0, 10) : "";
      return {
        code: row.leadId,
        label: row.label + (when ? " (" + when + ")" : "")
      };
    });
    fillSelectEl(select, items, "Open a saved lead");
    if (current) {
      select.value = current;
    }
  }

  function leadFormSignature() {
    var parts = [];
    function walk(root) {
      if (!root) {
        return;
      }
      root.querySelectorAll("input, select, textarea").forEach(function (el) {
        if (el.closest("template")) {
          return;
        }
        if (el.dataset.recordIgnore === "true") {
          return;
        }
        if (
          el.matches(
            'input[type="button"], input[type="submit"], input[type="file"], input[type="hidden"]'
          )
        ) {
          return;
        }
        var type = (el.type || "").toLowerCase();
        if (type === "checkbox" || type === "radio") {
          parts.push(el.name + ":" + el.id + "=" + (el.checked ? "1" : "0"));
        } else {
          parts.push((el.id || el.name || "") + "=" + String(el.value || ""));
        }
      });
    }
    walk(byId("leadForm"));
    walk(byId("followUpPanel"));
    return parts.join("\n");
  }

  function rememberLeadSignature() {
    lastLeadSignature = leadFormSignature();
  }

  function isLeadAutoSaveField(el) {
    if (!el || !el.matches) {
      return false;
    }
    if (el.closest("template")) {
      return false;
    }
    if (el.dataset.recordIgnore === "true") {
      return false;
    }
    if (
      el.matches(
        'input[type="button"], input[type="submit"], input[type="file"], button, summary'
      )
    ) {
      return false;
    }
    return el.matches("input, select, textarea");
  }

  function saveCurrentLead(options) {
    var quiet = Boolean(options && options.quiet);
    var snapshot = model.collectLead();
    var result = model.store.saveLead(snapshot);
    refreshSavedLeadSelect();
    fillPersonSelects();
    if (!result.ok) {
      setStatus(result.error || "Save failed.");
      return null;
    }
    rememberLeadSignature();
    var name = model.formatPersonLabel(model.subjectOf(snapshot));
    if (quiet) {
      setStatus("Auto-saved.", true);
    } else {
      setStatus(
        "Saved incomplete lead" +
          (name ? " — " + name : " (no name yet)") +
          ".",
        true
      );
    }
    return snapshot;
  }

  function requestLeadAutoSave() {
    if (suppressAutoSave) {
      return;
    }
    window.setTimeout(function () {
      if (suppressAutoSave) {
        return;
      }
      if (leadFormSignature() === lastLeadSignature) {
        return;
      }
      saveCurrentLead({ quiet: true });
    }, 0);
  }

  function bindLeadAutoSave() {
    if (autoSaveBound) {
      return;
    }
    autoSaveBound = true;
    document.addEventListener(
      "focusout",
      function (event) {
        if (isLeadAutoSaveField(event.target)) {
          requestLeadAutoSave();
        }
      },
      true
    );
    document.addEventListener("change", function (event) {
      if (isLeadAutoSaveField(event.target)) {
        requestLeadAutoSave();
      }
    });
  }

  function loadSelectedLead() {
    var select = byId("savedLeadSelect");
    var leadId = select ? select.value : "";
    if (!leadId) {
      setStatus("Pick a saved lead to open.");
      return;
    }
    var snapshot = model.store.getLead(leadId);
    if (!snapshot) {
      setStatus("That lead is no longer in the store.");
      return;
    }
    suppressAutoSave = true;
    model.hydrateLead(snapshot);
    model.store.setCurrentLeadId(leadId);
    fillPersonSelects();
    refreshSavedLeadSelect();
    rememberLeadSignature();
    suppressAutoSave = false;
    setStatus("Opened saved lead.", true);
  }

  function newLead() {
    suppressAutoSave = true;
    var form = byId("leadForm");
    if (form && typeof form.reset === "function") {
      form.reset();
    }
    var card = subjectCard();
    if (card) {
      card.dataset.leadId = model.newId("lead");
      card.dataset.entityId = model.newId("p");
      card.dataset.createdAt = model.nowIso();
    }
    ["aliasList", "relationshipList"].forEach(function (id) {
      model.clearRepeatableList(id);
    });
    ["vehicleList", "locationList", "documentList", "encounterList", "arrestList", "convictionList", "warrantList"].forEach(
      function (id) {
        model.clearRepeatableList(id);
      }
    );
    [
      "vehicle",
      "location",
      "document",
      "encounter",
      "arrest",
      "conviction",
      "warrant"
    ].forEach(function (type) {
      if (root.cards) {
        root.cards.add(type);
      }
    });
    if (typeof global.updateLeadSourceFields === "function") {
      global.updateLeadSourceFields();
    }
    if (typeof global.updateAgeDisplay === "function") {
      global.updateAgeDisplay();
    }
    fillPersonSelects();
    if (typeof window.paintFollowUps === "function") {
      window.paintFollowUps([]);
    }
    if (typeof window.applyLeadLane === "function") {
      window.applyLeadLane();
    }
    rememberLeadSignature();
    suppressAutoSave = false;
    setStatus("New blank lead. Nothing is required — save any time.", true);
  }

  function downloadCurrentLead() {
    var snapshot = model.collectLead();
    var blob = new Blob([JSON.stringify(snapshot, null, 2)], {
      type: "application/json"
    });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    var name = model.formatPersonLabel(model.subjectOf(snapshot));
    var slug = (name || "untitled-lead")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    link.href = url;
    link.download = slug + ".json";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setStatus("Downloaded JSON snapshot.", true);
  }

  function bindUi() {
    subjectId();
    if (model.store) {
      model.store.loadFromDisk();
    }

    var saveBtn = byId("saveLeadButton");
    if (saveBtn) {
      saveBtn.addEventListener("click", saveCurrentLead);
    }
    var quickSaveBtn = byId("quickSaveLeadButton");
    if (quickSaveBtn) {
      quickSaveBtn.addEventListener("click", saveCurrentLead);
    }
    var openBtn = byId("openLeadButton");
    if (openBtn) {
      openBtn.addEventListener("click", loadSelectedLead);
    }
    var newBtn = byId("newLeadButton");
    if (newBtn) {
      newBtn.addEventListener("click", newLead);
    }
    var downloadBtn = byId("downloadLeadButton");
    if (downloadBtn) {
      downloadBtn.addEventListener("click", downloadCurrentLead);
    }

    var leadCard = subjectCard();
    if (leadCard) {
      leadCard.addEventListener("blur", fillPersonSelects, true);
    }

    fillPersonSelects();
    refreshSavedLeadSelect();
    rememberLeadSignature();
    bindLeadAutoSave();
  }

  model.fillPersonSelects = fillPersonSelects;
  model.saveCurrentLead = saveCurrentLead;
  model.bindUi = bindUi;
  model.subjectId = subjectId;
})(typeof window !== "undefined" ? window : globalThis);

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      if (window.COPDoc && COPDoc.model && COPDoc.model.bindUi) {
        COPDoc.model.bindUi();
      }
    });
  } else if (window.COPDoc && COPDoc.model && COPDoc.model.bindUi) {
    COPDoc.model.bindUi();
  }
}
