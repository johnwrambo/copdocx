/**
 * Presentation-only controls for the embedded Narrative Build 9 workspace.
 *
 * The engine continues to own section and field markup. This adapter wraps the
 * fact form with search/collapse controls and adds a single Advanced disclosure
 * without changing the engine's ordering or persistence contracts.
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
    inputPane.className = "narrative-input-pane";
    inputPane.setAttribute("aria-label", "Narrative fact builder");

    var inputHeader = document.createElement("div");
    inputHeader.className = "narrative-input-pane-header";

    var inputTitle = document.createElement("div");
    inputTitle.className = "narrative-input-pane-title";
    var title = document.createElement("strong");
    title.textContent = "Narrative facts";
    var sectionTotal = document.createElement("span");
    sectionTotal.id = "narrativeSectionTotal";
    sectionTotal.textContent = "0 sections";
    inputTitle.append(title, sectionTotal);

    var inputTools = document.createElement("div");
    inputTools.className = "narrative-input-pane-tools";

    var filter = document.createElement("input");
    filter.id = "narrativeSectionFilter";
    filter.className = "narrative-section-filter";
    filter.type = "search";
    filter.autocomplete = "off";
    filter.placeholder = "Find a fact or section";
    filter.setAttribute("aria-label", "Find a narrative fact or section");

    var expandButton = document.createElement("button");
    expandButton.type = "button";
    expandButton.className = "narrative-input-tool-button";
    expandButton.textContent = "Expand";
    expandButton.title = "Expand all narrative sections";

    var collapseButton = document.createElement("button");
    collapseButton.type = "button";
    collapseButton.className = "narrative-input-tool-button";
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
      var button = fieldset.querySelector(":scope > legend .narrative-section-collapse-button");
      fieldset.classList.toggle("narrative-ui-collapsed", collapsed);
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
      var badge = fieldset.querySelector(":scope > legend .narrative-section-selection-count");
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
          .includes(query);
        var rowMatchCount = 0;
        Array.from(fieldset.querySelectorAll(":scope > .field[data-field-id]")).forEach(
          function (row) {
            var matches =
              !query || sectionMatch || row.textContent.toLowerCase().includes(query);
            row.classList.toggle("narrative-ui-filtered-out", !matches);
            if (matches) {
              rowMatchCount += 1;
            }
          }
        );
        fieldset.classList.toggle(
          "narrative-ui-filtered-out",
          Boolean(query) && !sectionMatch && rowMatchCount === 0
        );
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
            count.className = "narrative-section-selection-count";

            var toggle = document.createElement("button");
            toggle.type = "button";
            toggle.className = "narrative-section-collapse-button";
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
    });

    collapseButton.addEventListener("click", function () {
      filter.value = "";
      fieldsets().forEach(function (fieldset) {
        setSectionCollapsed(fieldset, true, true);
      });
      applySectionFilter();
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

    var toolbar = host.querySelector(".editor-toolbar");
    var headingActions = host.querySelector(".narrative-heading-actions");
    var advancedButton = null;
    if (toolbar && headingActions) {
      advancedButton = document.createElement("button");
      advancedButton.id = "narrativeAdvancedButton";
      advancedButton.type = "button";
      advancedButton.className = "narrative-advanced-tools-toggle";
      advancedButton.textContent = "Advanced";
      advancedButton.setAttribute("aria-pressed", "false");
      advancedButton.addEventListener("click", function () {
        var open = host.classList.toggle("advanced-tools-open");
        advancedButton.setAttribute("aria-pressed", open ? "true" : "false");
        advancedButton.textContent = open ? "Hide advanced" : "Advanced";
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

    var controller = { refresh: enhanceFieldsets };
    host.__copdocNarrativeWorkspaceUi = controller;
    return controller;
  }

  narratives.enhanceWorkspace = enhanceWorkspace;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { enhanceWorkspace: enhanceWorkspace };
  }
})(typeof window !== "undefined" ? window : globalThis);
