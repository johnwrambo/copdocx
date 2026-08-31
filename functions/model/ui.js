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
  var leadAuto = null;

  function queryLeadId() {
    if (window.COPDoc && COPDoc.chrome && typeof COPDoc.chrome.queryId === "function") {
      return COPDoc.chrome.queryId();
    }
    try {
      return new URLSearchParams(window.location.search).get("id") || "";
    } catch (error) {
      return "";
    }
  }

  function replaceLeadUrl(leadId) {
    if (!window.history || !window.history.replaceState) {
      return;
    }
    var next = leadId
      ? "lead-form.html?id=" + encodeURIComponent(leadId)
      : "lead-form.html";
    window.history.replaceState({}, "", next);
  }

  function setStatus(message, isOk) {
    if (window.COPDoc && typeof COPDoc.setAppBarStatus === "function") {
      COPDoc.setAppBarStatus(message || "", { ok: Boolean(isOk) });
      return;
    }
    var el = byId("appBarStatus") || byId("leadSaveStatus");
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
    el.classList.toggle("is-ok", Boolean(isOk));
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
    if (leadAuto) {
      leadAuto.remember();
    }
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
    var result = model.store.saveLead(snapshot, {
      mode: quiet ? "draft" : "commit"
    });
    refreshSavedLeadSelect();
    fillPersonSelects();
    if (!result.ok) {
      setStatus(result.error || "Save failed.");
      return null;
    }
    replaceLeadUrl(result.leadId);
    rememberLeadSignature();
    if (quiet) {
      setStatus("Draft saved.", true);
      return snapshot;
    }
    window.location.href = "lead.html?id=" + encodeURIComponent(result.leadId);
    return snapshot;
  }

  function bindLeadAutoSave() {
    if (!model.autosave || typeof model.autosave.bind !== "function") {
      return;
    }
    leadAuto = model.autosave.bind({
      key: "lead",
      suppressed: function () {
        return suppressAutoSave;
      },
      isField: isLeadAutoSaveField,
      signature: leadFormSignature,
      saveDraft: function () {
        saveCurrentLead({ quiet: true });
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
    replaceLeadUrl(leadId);
    fillPersonSelects();
    refreshSavedLeadSelect();
    rememberLeadSignature();
    suppressAutoSave = false;
    setStatus("Opened saved lead.", true);
  }

  function newLead() {
    suppressAutoSave = true;
    if (model.store) {
      model.store.setCurrentLeadId("");
    }
    replaceLeadUrl("");
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
    updateCancelHref(null);
    setStatus("New blank lead. Nothing is required — save any time.", true);
  }

  function storedCommittedLead() {
    var card = subjectCard();
    var leadId = card && card.dataset.leadId;
    if (!leadId || !model.store) {
      return null;
    }
    var snapshot = model.store.getLead(leadId);
    if (!snapshot) {
      return null;
    }
    if (typeof model.isCommitted === "function") {
      return model.isCommitted(snapshot) ? snapshot : null;
    }
    return snapshot.meta && snapshot.meta.status === "committed"
      ? snapshot
      : null;
  }

  function downloadCurrentLead() {
    var snapshot = storedCommittedLead();
    if (!snapshot) {
      setStatus("Commit the lead before exporting.");
      return;
    }
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

  function updateCancelHref(snapshot) {
    var a = byId("appBarBack") || byId("appBarCancel");
    if (!a) {
      return;
    }
    if (snapshot && snapshot.leadId && snapshot.meta && snapshot.meta.committedAt) {
      a.href = "lead.html?id=" + encodeURIComponent(snapshot.leadId);
      a.textContent = "Back to lead";
    } else {
      a.href = "leads.html";
      a.textContent = "Back to leads";
    }
  }

  function bindUi() {
    if (document.body.getAttribute("data-page") !== "lead-form") {
      return;
    }
    if (model.store) {
      model.store.loadFromDisk();
    }
    var qid = queryLeadId();
    if (qid && model.store) {
      var existing = model.store.getLead(qid);
      if (existing) {
        suppressAutoSave = true;
        model.hydrateLead(existing);
        model.store.setCurrentLeadId(qid);
        updateCancelHref(existing);
      } else {
        setStatus("Lead not found.");
        subjectId();
        updateCancelHref(null);
      }
    } else {
      subjectId();
      updateCancelHref(null);
    }

    var saveBtn = document.querySelector(
      '#appBarPrimaryAction[data-chrome-action="save"]'
    );
    if (saveBtn) {
      saveBtn.addEventListener("click", saveCurrentLead);
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
    bindLeadAutoSave();
    rememberLeadSignature();
    suppressAutoSave = false;
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
