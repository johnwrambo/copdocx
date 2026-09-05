/**
 * Opens Narrative Build 9 against the current Encounter.
 * The existing Encounter autosave session flushes first so the Narrative page
 * reads the latest subject and stop facts from localStorage.
 */
(function (global) {
  "use strict";

  function byId(id) {
    return document.getElementById(id);
  }

  function encounterId() {
    var field = byId("encounterId");
    if (field && field.value) {
      return String(field.value);
    }
    try {
      return new URLSearchParams(global.location.search).get("id") || "";
    } catch (error) {
      return "";
    }
  }

  function narrativeHref(id) {
    return "narrative.html?encounterId=" + encodeURIComponent(id);
  }

  function setStatus(message) {
    if (global.COPDoc && typeof COPDoc.setAppBarStatus === "function") {
      COPDoc.setAppBarStatus(message);
    }
  }

  function syncLink() {
    var link = byId("openEncounterNarrativesButton");
    var id = encounterId();
    if (link) {
      link.href = id ? narrativeHref(id) : "narrative.html";
    }
  }

  function openWorkspace(event) {
    var id = encounterId();
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    if (!id) {
      setStatus("Create the encounter first.");
      return;
    }

    var model = global.COPDoc && COPDoc.model;
    var autosave = model && model.autosave;
    var session =
      autosave && typeof autosave.bind === "function"
        ? autosave.bind({ key: "encounter-form" })
        : null;
    if (session && typeof session.request === "function") {
      session.request();
    }

    global.setTimeout(function () {
      if (model && model.store && typeof model.store.loadFromDisk === "function") {
        model.store.loadFromDisk();
        if (!model.store.getEncounter(id)) {
          setStatus("Enter at least one encounter detail before opening the I-213 workspace.");
          return;
        }
      }
      global.location.href = narrativeHref(id);
    }, 0);
  }

  function boot() {
    var link = byId("openEncounterNarrativesButton");
    var tab = byId("tabbtn-narrative");
    if (!link && !tab) {
      return;
    }
    syncLink();
    if (link && link.dataset.narrativeLauncherBound !== "true") {
      link.dataset.narrativeLauncherBound = "true";
      link.addEventListener("click", openWorkspace);
    }
    if (tab && tab.dataset.narrativeLauncherBound !== "true") {
      tab.dataset.narrativeLauncherBound = "true";
      tab.addEventListener("click", openWorkspace);
    }
    var form = byId("encounterForm");
    if (form) {
      form.addEventListener("change", syncLink);
    }
    global.addEventListener("popstate", syncLink);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})(typeof window !== "undefined" ? window : globalThis);
