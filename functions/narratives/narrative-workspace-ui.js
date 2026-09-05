/**
 * Presentation-only controls for the embedded Narrative Build 9 workspace.
 *
 * Fact search, section collapse/expand, selected counts, Advanced disclosure,
 * encounter-owned field hiding, and a viewport-locked fact scrollport.
 */
(function (global) {
  "use strict";

  var root = (global.COPDoc = global.COPDoc || {});
  var narratives = (root.narratives = root.narratives || {});

  function schedule(callback) {
    if (typeof global.requestAnimationFrame === "function") {
      return global.requestAnimationFrame(callback);
    }
    return global.setTimeout(callback, 0);
  }

  function sectionKey(fieldset) {
    return fieldset.dataset.sectionId || fieldset.dataset.sectionTitle || "section";
  }

  function safeDomId(value) {
    return String(value || "section")
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "section";
  }

  function fieldMatches(row, fieldId) {
    var id = String((row && row.dataset && row.dataset.fieldId) || "");
    return id === fieldId || id.indexOf(fieldId + "__") === 0;
  }

  function markEncounterOwnedFields(fieldIds) {
    var form = document.getElementById("narrativeForm");
    if (!form) {
      return;
    }
    var wanted = {};
    (fieldIds || []).forEach(function (id) {
      if (id) {
        wanted[id] = true;
      }
    });
    Array.prototype.forEach.call(form.querySelectorAll(".field[data-field-id]"), function (row) {
      var owned = Object.keys(wanted).some(function (id) {
        return fieldMatches(row, id);
      });
      row.classList.toggle("ui-encounter-owned", owned);
    });
    Array.prototype.forEach.call(form.querySelectorAll("fieldset[data-section-id]"), function (fieldset) {
      var rows = fieldset.querySelectorAll(":scope > .field[data-field-id]");
      var allOwned =
        rows.length > 0 &&
        Array.prototype.every.call(rows, function (row) {
          return row.classList.contains("ui-encounter-owned");
        });
      fieldset.classList.toggle("ui-encounter-owned", allOwned);
    });
  }

  function enhanceWorkspace(options) {
    options = options || {};
    var host = options.host;
    var engine = options.engine;
    if (!host || typeof host.querySelector !== "function") {
      throw new TypeError("enhanceWorkspace({ host }) requires the narrative engine host.");
    }
    if (host.__copdocNarrativeWorkspaceUi) {
      return host.__copdocNarrativeWorkspaceUi;
    }

    var form = host.querySelector("#narrativeForm");
    var workspace = host.querySelector(".narrative-engine-workspace");
    if (!form || !workspace) {
      throw new Error("Narrative workspace markup is missing.");
    }

    var sectionUiState = new Map();
    var refreshQueued = false;
    var inputPane = document.createElement("section");
    inputPane.className = "narrative-input-pane input-pane";
    inputPane.setAttribute("aria-label", "Narrative fact builder");

    var inputHeader = document.createElement("div");
    inputHeader.className = "narrative-input-pane-header input-pane-header";

    var inputTitle = document.createElement("div");
    inputTitle.className = "narrative-input-pane-title input-pane-title";
    var title = document.createElement("strong");
    title.textContent = "Narrative facts";
    var sectionTotal = document.createElement("span");
    sectionTotal.id = "narrativeSectionTotal";
    sectionTotal.textContent = "0 sections";
    inputTitle.append(title, sectionTotal);

    var inputTools = document.createElement("div");
    inputTools.className = "narrative-input-pane-tools input-pane-tools";

    var filter = document.createElement("input");
    filter.id = "narrativeSectionFilter";
    filter.className = "narrative-section-filter section-filter";
    filter.type = "search";
    filter.autocomplete = "off";
    filter.placeholder = "Find a fact or section";
    filter.setAttribute("aria-label", "Find a narrative fact or section");

    var expandButton = document.createElement("button");
    expandButton.type = "button";
    expandButton.className = "narrative-input-tool-button input-tool-button";
    expandButton.textContent = "Expand";
    expandButton.title = "Expand all narrative sections";

    var collapseButton = document.createElement("button");
    collapseButton.type = "button";
    collapseButton.className = "narrative-input-tool-button input-tool-button";
    collapseButton.textContent = "Collapse";
    collapseButton.title = "Collapse all narrative sections";

    inputTools.append(filter, expandButton, collapseButton);
    inputHeader.append(inputTitle, inputTools);
    workspace.insertBefore(inputPane, form);
    inputPane.append(inputHeader, form);

    function fieldsets() {
      return Array.from(form.querySelectorAll(":scope > fieldset[data-section-id]"));
    }

    function setSectionCollapsed(fieldset, collapsed, persist) {
      var button = fieldset.querySelector(
        ":scope > legend .narrative-section-collapse-button, :scope > legend .section-collapse-button"
      );
      fieldset.classList.toggle("narrative-ui-collapsed", collapsed);
      fieldset.classList.toggle("ui-collapsed", collapsed);
      if (button) {
        var icon = collapsed ? "▸" : "▾";
        if (button.textContent !== icon) {
          button.textContent = icon;
        }
        button.setAttribute("aria-expanded", collapsed ? "false" : "true");
        button.title =
          (collapsed ? "Expand " : "Collapse ") +
          (fieldset.dataset.sectionTitle || "section");
        button.setAttribute("aria-label", button.title);
      }
      if (persist !== false) {
        sectionUiState.set(sectionKey(fieldset), collapsed);
      }
    }

    function updateSelectionCount(fieldset) {
      var count = Array.from(fieldset.querySelectorAll("select")).filter(function (select) {
        return Boolean(select.value);
      }).length;
      var badge = fieldset.querySelector(
        ":scope > legend .narrative-section-selection-count, :scope > legend .section-selection-count"
      );
      if (!badge) {
        return;
      }
      var label = count ? count + " selected" : "Empty";
      if (badge.textContent !== label) {
        badge.textContent = label;
      }
      badge.classList.toggle("has-selections", count > 0);
    }

    function applySectionFilter() {
      var query = filter.value.trim().toLowerCase();
      fieldsets().forEach(function (fieldset) {
        var sectionMatch = String(fieldset.dataset.sectionTitle || "")
          .toLowerCase()
          .indexOf(query) !== -1;
        var rowMatchCount = 0;
        Array.from(fieldset.querySelectorAll(":scope > .field[data-field-id]")).forEach(
          function (row) {
            var matches =
              !query || sectionMatch || row.textContent.toLowerCase().indexOf(query) !== -1;
            row.classList.toggle("narrative-ui-filtered-out", !matches);
            row.classList.toggle("ui-filtered-out", !matches);
            if (matches) {
              rowMatchCount += 1;
            }
          }
        );
        var hideSection = Boolean(query) && !sectionMatch && rowMatchCount === 0;
        fieldset.classList.toggle("narrative-ui-filtered-out", hideSection);
        fieldset.classList.toggle("ui-filtered-out", hideSection);
        if (query && (sectionMatch || rowMatchCount > 0)) {
          setSectionCollapsed(fieldset, false, false);
        } else if (!query) {
          setSectionCollapsed(
            fieldset,
            sectionUiState.get(sectionKey(fieldset)) === true,
            false
          );
        }
      });
    }

    function clearLockedBox(element) {
      if (!element || !element.style) {
        return;
      }
      element.style.removeProperty("height");
      element.style.removeProperty("max-height");
      element.style.removeProperty("min-height");
      element.style.removeProperty("overflow");
      element.style.removeProperty("overflow-x");
      element.style.removeProperty("overflow-y");
      element.style.removeProperty("overscroll-behavior");
    }

    function lockFactScroll() {
      // Nested overflow:hidden + pixel heights clipped the fact list.
      // Live/embed I-213s scroll as a normal document inside the iframe.
      clearLockedBox(host);
      clearLockedBox(inputPane);
      clearLockedBox(form);
      clearLockedBox(host.querySelector(".narrative-panel"));
      clearLockedBox(host.querySelector("#narrativeDraft"));
      clearLockedBox(host.querySelector("#resolvedDraft"));
    }

    function enhanceFieldsets() {
      refreshQueued = false;
      var sections = fieldsets();
      var totalLabel =
        sections.length + (sections.length === 1 ? " section" : " sections");
      if (sectionTotal.textContent !== totalLabel) {
        sectionTotal.textContent = totalLabel;
      }

      sections.forEach(function (fieldset, index) {
        var key = sectionKey(fieldset);
        if (!sectionUiState.has(key)) {
          sectionUiState.set(key, index > 0);
        }
        if (!fieldset.id) {
          fieldset.id = "narrative-section-" + safeDomId(key);
        }

        if (fieldset.dataset.workspaceUiEnhanced !== "true") {
          fieldset.dataset.workspaceUiEnhanced = "true";
          var legend = fieldset.querySelector(":scope > legend");
          if (legend) {
            var count = document.createElement("span");
            count.className = "narrative-section-selection-count section-selection-count";

            var toggle = document.createElement("button");
            toggle.type = "button";
            toggle.className = "narrative-section-collapse-button section-collapse-button";
            toggle.addEventListener("click", function (event) {
              event.preventDefault();
              event.stopPropagation();
              setSectionCollapsed(
                fieldset,
                !fieldset.classList.contains("narrative-ui-collapsed"),
                true
              );
            });
            legend.append(count, toggle);
          }
        }

        updateSelectionCount(fieldset);
        setSectionCollapsed(fieldset, sectionUiState.get(key) === true, false);
      });
      applySectionFilter();
      lockFactScroll();
    }

    function queueEnhancement() {
      if (refreshQueued) {
        return;
      }
      refreshQueued = true;
      schedule(enhanceFieldsets);
    }

    expandButton.addEventListener("click", function () {
      filter.value = "";
      fieldsets().forEach(function (fieldset) {
        setSectionCollapsed(fieldset, false, true);
      });
      applySectionFilter();
      lockFactScroll();
    });

    collapseButton.addEventListener("click", function () {
      filter.value = "";
      fieldsets().forEach(function (fieldset) {
        setSectionCollapsed(fieldset, true, true);
      });
      applySectionFilter();
      lockFactScroll();
    });

    filter.addEventListener("input", applySectionFilter);
    form.addEventListener("change", function (event) {
      var fieldset = event.target.closest("fieldset[data-section-id]");
      if (fieldset) {
        updateSelectionCount(fieldset);
      }
    });

    var observer = new MutationObserver(queueEnhancement);
    observer.observe(form, { childList: true, subtree: true });
    enhanceFieldsets();

    var narrativeChangeEvent =
      engine && engine.events && engine.events.narrativeChange;
    if (narrativeChangeEvent && typeof global.addEventListener === "function") {
      global.addEventListener(narrativeChangeEvent, queueEnhancement);
    }

    var headingActions = host.querySelector(".narrative-heading-actions");
    if (headingActions && !document.getElementById("narrativeAdvancedButton")) {
      var advancedButton = document.createElement("button");
      advancedButton.id = "narrativeAdvancedButton";
      advancedButton.type = "button";
      advancedButton.className = "narrative-advanced-tools-toggle compact";
      advancedButton.textContent = "Advanced";
      advancedButton.setAttribute("aria-pressed", "false");
      advancedButton.addEventListener("click", function () {
        var open = host.classList.toggle("advanced-tools-open");
        document.body.classList.toggle("narrative-advanced", open);
        advancedButton.setAttribute("aria-pressed", open ? "true" : "false");
        advancedButton.textContent = open ? "Hide advanced" : "Advanced";
        lockFactScroll();
      });
      headingActions.insertBefore(advancedButton, headingActions.firstChild);
    }

    [
      ["typesViewButton", "Show placeholder categories"],
      ["rolesViewButton", "Show reusable semantic roles"],
      ["valuesViewButton", "Show resolved encounter values"],
      ["plainTextViewButton", "Review and edit final plain text"],
      ["bindingsViewButton", "Audit source bindings and unresolved values"]
    ].forEach(function (entry) {
      var control = host.querySelector("#" + entry[0]);
      if (control) {
        control.title = entry[1];
      }
    });

    global.setTimeout(lockFactScroll, 0);

    var controller = {
      refresh: enhanceFieldsets,
      lockFactScroll: lockFactScroll,
      markEncounterOwnedFields: markEncounterOwnedFields
    };
    host.__copdocNarrativeWorkspaceUi = controller;
    return controller;
  }

  narratives.enhanceWorkspace = enhanceWorkspace;
  narratives.installWorkspaceEnhancements = function (engine) {
    var host = document.getElementById("narrativeEngineHost");
    if (!host) {
      return null;
    }
    return enhanceWorkspace({ host: host, engine: engine });
  };
  narratives.markEncounterOwnedFields = markEncounterOwnedFields;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      enhanceWorkspace: enhanceWorkspace,
      markEncounterOwnedFields: markEncounterOwnedFields
    };
  }
})(typeof window !== "undefined" ? window : globalThis);
