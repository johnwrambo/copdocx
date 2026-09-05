/**
 * Narrative Library page: browse Master wording, version options, set profiles.
 */
(function (global) {
  "use strict";

  function byId(id) {
    return document.getElementById(id);
  }

  function library() {
    return global.COPDoc && COPDoc.narratives && COPDoc.narratives.library;
  }

  function catalogs() {
    return (global.COPDoc && COPDoc.catalogs && COPDoc.catalogs.ENCOUNTER_TYPES) || [];
  }

  function showStatus(message, ok) {
    if (global.COPDoc && typeof COPDoc.setAppBarStatus === "function") {
      COPDoc.setAppBarStatus(message, { ok: ok !== false });
    }
  }

  function selected(id) {
    var el = byId(id);
    return el ? el.value : "";
  }

  function setValue(id, value) {
    var el = byId(id);
    if (el) {
      el.value = value || "";
    }
  }

  var NEW_OPTION = "__new__";
  var NEW_FIELD = "__new_field__";
  var NEW_SECTION = "__new_section__";

  function currentLineage() {
    var api = library();
    var sectionId = selected("librarySection");
    var fieldId = selected("libraryField");
    var lineageId = selected("libraryLineage");
    if (!api || !sectionId || !fieldId || !lineageId || lineageId === NEW_OPTION) {
      return null;
    }
    return api.listLineages(sectionId, fieldId).filter(function (row) {
      return row.lineageId === lineageId;
    })[0] || null;
  }

  function appendCreateOption(select, value, label) {
    if (!select) {
      return;
    }
    var option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    select.appendChild(option);
  }

  function fillSelect(el, items, valueKey, labelKey, selectedValue) {
    if (!el) {
      return;
    }
    el.replaceChildren();
    items.forEach(function (item) {
      var option = document.createElement("option");
      option.value = item[valueKey];
      option.textContent = item[labelKey];
      if (String(item[valueKey]) === String(selectedValue || "")) {
        option.selected = true;
      }
      el.appendChild(option);
    });
  }

  function paintSections() {
    var api = library();
    var keep = selected("librarySection");
    fillSelect(
      byId("librarySection"),
      api.sections().map(function (section) {
        return { id: section.id, title: section.title };
      }),
      "id",
      "title",
      keep
    );
    appendCreateOption(byId("librarySection"), NEW_SECTION, "Add new section…");
    if (keep === NEW_SECTION) {
      byId("librarySection").value = NEW_SECTION;
    }
    paintFields();
  }

  function paintFields() {
    var api = library();
    var section = api.sections().filter(function (row) {
      return row.id === selected("librarySection");
    })[0];
    var keep = selected("libraryField");
    fillSelect(
      byId("libraryField"),
      ((section && section.fields) || []).map(function (field) {
        return { id: field.id, label: field.label || field.id };
      }),
      "id",
      "label",
      keep
    );
    if (section) {
      appendCreateOption(byId("libraryField"), NEW_FIELD, "Add new field…");
    }
    if (keep === NEW_FIELD) {
      byId("libraryField").value = NEW_FIELD;
    }
    paintLineages();
  }

  function paintLineages() {
    var api = library();
    var keep = selected("libraryLineage");
    var fieldId = selected("libraryField");
    var items = [];
    if (fieldId && fieldId !== NEW_FIELD) {
      items = api.listLineages(selected("librarySection"), fieldId).map(function (row) {
        return {
          id: row.lineageId,
          label: (row.current && row.current.label) || row.lineageId
        };
      });
    }
    fillSelect(byId("libraryLineage"), items, "id", "label", keep);
    if (fieldId && fieldId !== NEW_FIELD) {
      appendCreateOption(byId("libraryLineage"), NEW_OPTION, "Add new option…");
    }
    if (keep === NEW_OPTION) {
      byId("libraryLineage").value = NEW_OPTION;
    }
    paintDetail();
  }

  function paintHistory(lineage) {
    var versionsEl = byId("libraryVersions");
    if (!versionsEl) {
      return;
    }
    versionsEl.replaceChildren();
    if (!lineage || !lineage.versions || !lineage.versions.length) {
      var empty = document.createElement("p");
      empty.className = "library-history-empty";
      empty.textContent = selected("libraryLineage") === NEW_OPTION
        ? "New option. Enter a unique label and sentence, then save."
        : "No saved wordings yet.";
      versionsEl.appendChild(empty);
      return;
    }
    lineage.versions.forEach(function (row) {
      var item = document.createElement("label");
      item.className = "library-history-row" + (row.optionId === lineage.currentId ? " is-current" : "");
      var box = document.createElement("input");
      box.type = "checkbox";
      box.checked = row.optionId === lineage.currentId;
      box.addEventListener("click", function (event) {
        event.preventDefault();
        library().setCurrent(lineage.fieldId, lineage.lineageId, row.optionId);
        setValue("libraryLabel", row.label);
        setValue("libraryText", row.text);
        paintLineages();
        paintProfilePreview();
        showStatus("That wording is now displayed.");
      });
      var text = document.createElement("span");
      text.textContent = row.text || row.label || "(blank)";
      item.append(box, text);
      versionsEl.appendChild(item);
    });
  }

  function paintDetail() {
    var lineage = currentLineage();
    var creating = selected("libraryLineage") === NEW_OPTION;
    var previewEl = byId("libraryOptionPreview");
    if (creating) {
      paintHistory(null);
      setValue("libraryLabel", "");
      setValue("libraryText", "");
      if (previewEl) {
        previewEl.textContent = "New option starts blank.";
      }
      paintUsedVariables("");
      return;
    }
    if (!lineage) {
      paintHistory(null);
      setValue("libraryLabel", "");
      setValue("libraryText", "");
      if (previewEl) {
        previewEl.textContent = "Select a section, field, and option.";
      }
      return;
    }
    setValue("libraryLabel", lineage.current.label || "");
    setValue("libraryText", lineage.current.text || "");
    if (previewEl) {
      previewEl.textContent = lineage.current.text || "(no generated sentence)";
    }
    paintHistory(lineage);
    paintUsedVariables(lineage.current.text);
  }

  function paintUsedVariables(text) {
    var api = library();
    var el = byId("libraryUsedVariables");
    if (!el) {
      return;
    }
    var tokens = api.placeholdersIn(text);
    el.textContent = tokens.length
      ? "This sentence uses: " + tokens.map(function (token) {
        return "[" + token + "]";
      }).join(", ")
      : "This sentence has no placeholders.";
  }

  function paintVariables() {
    var api = library();
    var list = byId("libraryVariableList");
    if (!list) {
      return;
    }
    list.replaceChildren();
    api.variables.forEach(function (row) {
      var item = document.createElement("button");
      item.type = "button";
      item.className = "library-variable";
      item.innerHTML = "<strong></strong><span></span>";
      item.querySelector("strong").textContent = row.token;
      item.querySelector("span").textContent = row.meaning;
      item.addEventListener("click", function () {
        insertToken(row.token);
      });
      list.appendChild(item);
    });
  }

  function insertToken(token) {
    var area = byId("libraryText");
    if (!area) {
      return;
    }
    var start = area.selectionStart || area.value.length;
    var end = area.selectionEnd || start;
    area.value = area.value.slice(0, start) + token + area.value.slice(end);
    area.focus();
    area.selectionStart = area.selectionEnd = start + token.length;
    paintUsedVariables(area.value);
  }

  function saveVersion() {
    var creating = selected("libraryLineage") === NEW_OPTION;
    var lineage = currentLineage();
    if (!creating && !lineage) {
      showStatus("Select an option first.", false);
      return;
    }
    var label = selected("libraryLabel").trim();
    var text = byId("libraryText") ? byId("libraryText").value : "";
    if (!label) {
      showStatus("Option label is required.", false);
      return;
    }
    try {
      if (creating) {
        var created = library().addOption(selected("librarySection"), selected("libraryField"), {
          label: label,
          text: text
        });
        paintLineages();
        setValue("libraryLineage", created.lineageId);
        paintDetail();
        paintProfilePreview();
        showStatus("Added option “" + label + "” and set it current.");
        return;
      }
      if (text === (lineage.current.text || "") && label === (lineage.current.label || "")) {
        showStatus("No wording change to save.", false);
        return;
      }
      library().addVersion({
        sectionId: lineage.sectionId,
        fieldId: lineage.fieldId,
        lineageId: lineage.lineageId,
        label: label,
        text: text,
        basedOn: lineage.currentId
      });
      paintLineages();
      paintProfilePreview();
      showStatus("Saved a new wording and set it current. Previous wording is kept.");
    } catch (error) {
      showStatus(error.message || "Could not save.", false);
    }
  }

  function addNewField() {
    var label = window.prompt("New field label in this section");
    if (!label) {
      paintFields();
      return;
    }
    try {
      var field = library().addField(selected("librarySection"), { label: label });
      paintFields();
      setValue("libraryField", field.id);
      paintLineages();
      showStatus("Added field “" + label + "”.");
    } catch (error) {
      showStatus(error.message || "Could not add field.", false);
      paintFields();
    }
  }

  function addNewSection() {
    var title = window.prompt("New section title");
    if (!title) {
      paintSections();
      return;
    }
    try {
      var section = library().addSection({ title: title });
      paintSections();
      setValue("librarySection", section.id);
      paintFields();
      showStatus("Added section “" + title + "”.");
    } catch (error) {
      showStatus(error.message || "Could not add section.", false);
      paintSections();
    }
  }

  function encounterTypeId(row) {
    return row.id || row.code || row.value || "";
  }

  function paintProfilesFromCatalog() {
    var select = byId("libraryEventType");
    if (!select) {
      return;
    }
    var keep = select.value;
    select.replaceChildren();
    catalogs().forEach(function (row) {
      var option = document.createElement("option");
      option.value = encounterTypeId(row);
      option.textContent = row.label || option.value;
      select.appendChild(option);
    });
    if (keep) {
      select.value = keep;
    }
    loadProfileSelections();
  }

  function loadProfileSelections() {
    var api = library();
    var eventType = selected("libraryEventType");
    var profile = api.profileForEventType(eventType);
    var host = byId("libraryProfileFields");
    if (!host) {
      return;
    }
    host.replaceChildren();
    api.sections().forEach(function (section) {
      (section.fields || []).forEach(function (field) {
        var wrap = document.createElement("label");
        wrap.textContent = field.label || field.id;
        var select = document.createElement("select");
        select.dataset.fieldId = field.id;
        var blank = document.createElement("option");
        blank.value = "";
        blank.textContent = "Not set (officer chooses)";
        select.appendChild(blank);
        api.listLineages(section.id, field.id).forEach(function (lineage) {
          var option = document.createElement("option");
          option.value = lineage.lineageId;
          option.textContent = (lineage.current && lineage.current.label) || lineage.lineageId;
          select.appendChild(option);
        });
        if (profile && profile.selections && profile.selections[field.id]) {
          select.value = profile.selections[field.id];
        }
        select.addEventListener("change", paintProfilePreview);
        wrap.appendChild(select);
        host.appendChild(wrap);
      });
    });
    paintProfilePreview();
  }

  function collectProfileSelections() {
    var selections = {};
    document.querySelectorAll("#libraryProfileFields select[data-field-id]").forEach(function (select) {
      if (select.value) {
        selections[select.dataset.fieldId] = select.value;
      }
    });
    return selections;
  }

  function paintProfilePreview() {
    var preview = byId("libraryProfilePreview");
    if (!preview) {
      return;
    }
    var text = library().preview(collectProfileSelections());
    preview.textContent = text || "No default sentences yet. Choose options, then save the profile.";
  }

  function saveProfile() {
    var eventType = selected("libraryEventType");
    var type = catalogs().filter(function (row) {
      return encounterTypeId(row) === eventType;
    })[0];
    try {
      library().saveProfile({
        eventType: eventType,
        label: (type && type.label) || eventType,
        selections: collectProfileSelections()
      });
      paintProfilePreview();
      showStatus("Saved profile for " + ((type && type.label) || eventType) + ". Stop-tab event type can load these as helpers.");
    } catch (error) {
      showStatus(error.message || "Could not save profile.", false);
    }
  }

  function downloadJson() {
    var blob = new Blob([library().exportJson()], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = "narrative-library.json";
    document.body.appendChild(link);
    link.click();
    link.remove();
    global.setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 0);
    showStatus("Downloaded library JSON. Master JS files are unchanged until you copy wording back.");
  }

  function bind() {
    if (!library()) {
      throw new Error("Narrative library store did not load.");
    }
    byId("librarySection").addEventListener("change", function () {
      if (selected("librarySection") === NEW_SECTION) {
        addNewSection();
        return;
      }
      paintFields();
    });
    byId("libraryField").addEventListener("change", function () {
      if (selected("libraryField") === NEW_FIELD) {
        addNewField();
        return;
      }
      paintLineages();
    });
    byId("libraryLineage").addEventListener("change", paintDetail);
    byId("libraryText").addEventListener("input", function () {
      paintUsedVariables(byId("libraryText").value);
      byId("libraryOptionPreview").textContent = byId("libraryText").value || "(no generated sentence)";
    });
    byId("librarySaveVersion").addEventListener("click", saveVersion);
    byId("libraryEventType").addEventListener("change", loadProfileSelections);
    byId("librarySaveProfile").addEventListener("click", saveProfile);
    var download = byId("downloadLibraryButton");
    if (download) {
      download.addEventListener("click", downloadJson);
    }
    paintSections();
    paintVariables();
    paintProfilesFromCatalog();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bind, { once: true });
  } else {
    bind();
  }
})(typeof window !== "undefined" ? window : globalThis);
