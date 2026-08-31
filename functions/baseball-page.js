/**
 * Baseball card page: hydrate from committed lead + Book-in handoff,
 * Generate persists a card on person.immigration.
 */
(function () {
  "use strict";

  var HANDOFF_KEY = "copdocx.baseball.handoff.v1";

  function byId(id) {
    return document.getElementById(id);
  }

  function pageKey() {
    return document.body.getAttribute("data-page") || "";
  }

  function queryLeadId() {
    var fromUrl = "";
    try {
      fromUrl = new URLSearchParams(window.location.search).get("leadId") || "";
    } catch (error) {
      fromUrl = "";
    }
    if (fromUrl) {
      return fromUrl;
    }
    var handoff = readHandoff();
    return (handoff && handoff.leadId) || "";
  }

  function model() {
    return window.COPDoc && COPDoc.model;
  }

  function setStatus(message, ok) {
    if (window.COPDoc && COPDoc.setAppBarStatus) {
      COPDoc.setAppBarStatus(message, ok ? { ok: true } : undefined);
    }
  }

  function readHandoff() {
    try {
      var raw = sessionStorage.getItem(HANDOFF_KEY);
      if (!raw) {
        return null;
      }
      return JSON.parse(raw);
    } catch (error) {
      return null;
    }
  }

  function catalogLabel(items, code) {
    var key = String(code || "").trim();
    if (!key) {
      return "";
    }
    var list = items || [];
    var i;
    for (i = 0; i < list.length; i++) {
      if (list[i] && list[i].code === key) {
        return list[i].label || key;
      }
    }
    return key;
  }

  function countryLabel(code) {
    var key = String(code || "").trim();
    if (!key) {
      return "";
    }
    var list = window.COUNTRIES || [];
    var i;
    for (i = 0; i < list.length; i++) {
      if (
        list[i] &&
        (list[i].code === key ||
          String(list[i].label || "").toLowerCase() === key.toLowerCase())
      ) {
        return list[i].label || key;
      }
    }
    return key;
  }

  function dispositionLabel(code) {
    var items =
      typeof IMMIGRATION_DISPOSITIONS !== "undefined"
        ? IMMIGRATION_DISPOSITIONS
        : [];
    return catalogLabel(items, code);
  }

  function fillIfEmpty(id, value) {
    var el = byId(id);
    var text = String(value == null ? "" : value).trim();
    if (!el || !text) {
      return;
    }
    if (String(el.value || "").trim()) {
      return;
    }
    el.value = text;
  }

  function fillRow(row, data) {
    if (!row || !data) {
      return;
    }
    Object.keys(data).forEach(function (key) {
      var el = row.querySelector('[data-field="' + key + '"]');
      var text = String(data[key] == null ? "" : data[key]).trim();
      if (el && text) {
        el.value = text;
      }
    });
  }

  function hydrateFromLead(snap) {
    var m = model();
    var subject = m.subjectOf ? m.subjectOf(snap) : snap.person || {};
    var name = subject.name || {};
    var immigration = subject.immigration || {};
    fillIfEmpty("lastName", name.lastName);
    fillIfEmpty("firstName", name.firstName);
    fillIfEmpty("age", subject.age);
    fillIfEmpty("country", countryLabel(subject.citizenship));
    fillIfEmpty(
      "alienNumber",
      typeof formatAlienNumber === "function"
        ? formatAlienNumber(immigration.alienNumber)
        : immigration.alienNumber
    );
    fillIfEmpty("disposition", dispositionLabel(immigration.disposition));
    fillIfEmpty("finalOrderDate", immigration.finalOrderDate);
    fillIfEmpty("firstDeportationDate", immigration.firstDeportationDate);
    fillIfEmpty("lastDeportationDate", immigration.lastDeportationDate);
    var arrests = subject.arrests || [];
    if (arrests[0] && arrests[0].arrestDate) {
      fillIfEmpty("arrestDate", arrests[0].arrestDate);
    }
    var criminal =
      m && typeof m.deriveCriminalProfile === "function"
        ? m.deriveCriminalProfile(subject)
        : subject.criminal || {};
    var criminalBox = byId("isCriminal");
    if (criminalBox && (criminal.isCriminal || criminal.hasCriminalRecord)) {
      criminalBox.checked = true;
    }
    var convictions = subject.convictions || [];
    var list = byId("criminalHistoryList");
    if (list && convictions.length && typeof addCriminalHistoryRow === "function") {
      convictions.forEach(function (row) {
        if (!row || !(row.crime || row.charge)) {
          return;
        }
        fillRow(addCriminalHistoryRow(), {
          charge: row.crime || row.charge || "",
          convictionDate: row.convictionDate || "",
          court: row.court || ""
        });
      });
    }
  }

  function hydrateFromHandoff(data) {
    if (!data) {
      return;
    }
    fillIfEmpty("firstName", data.firstName);
    fillIfEmpty("lastName", data.lastName);
    fillIfEmpty("age", data.age);
    fillIfEmpty("country", data.country);
    fillIfEmpty(
      "alienNumber",
      typeof formatAlienNumber === "function"
        ? formatAlienNumber(data.alienNumber)
        : data.alienNumber
    );
    fillIfEmpty("disposition", data.disposition);
    fillIfEmpty("arrestDate", data.arrestDate);
    fillIfEmpty("finalOrderDate", data.finalOrderDate);
    fillIfEmpty("firstDeportationDate", data.firstDeportationDate);
    fillIfEmpty("lastDeportationDate", data.lastDeportationDate);
    var criminalBox = byId("isCriminal");
    if (criminalBox && data.isCriminal) {
      criminalBox.checked = true;
    }
  }

  function editorText() {
    if (typeof createBaseballText === "function") {
      return createBaseballText() || "";
    }
    return "";
  }

  function persistBaseballCard() {
    var text = editorText();
    var leadId = queryLeadId();
    if (!leadId) {
      setStatus("Generated. No lead is attached, so the card was not saved to a subject.");
      return;
    }
    var m = model();
    if (!m || !m.store) {
      setStatus("Lead store is not available.");
      return;
    }
    m.store.loadFromDisk();
    var snap = m.store.getLead(leadId);
    if (!snap) {
      setStatus("Lead not found. Card was generated but not saved.");
      return;
    }
    if (m.isCommitted && !m.isCommitted(snap)) {
      setStatus("Commit the lead before saving a baseball card.");
      return;
    }
    var subject = m.subjectOf ? m.subjectOf(snap) : snap.person;
    if (!subject) {
      setStatus("Lead has no subject.");
      return;
    }
    subject.immigration = subject.immigration || {};
    subject.immigration.firstDeportationDate = String(
      (byId("firstDeportationDate") && byId("firstDeportationDate").value) || ""
    ).trim();
    subject.immigration.lastDeportationDate = String(
      (byId("lastDeportationDate") && byId("lastDeportationDate").value) || ""
    ).trim();
    if (!Array.isArray(subject.immigration.baseballCards)) {
      subject.immigration.baseballCards = [];
    }
    var card = m.createBaseballCard({
      text: text,
      arrestDate: String((byId("arrestDate") && byId("arrestDate").value) || "").trim(),
      disposition: String((byId("disposition") && byId("disposition").value) || "").trim()
    });
    subject.immigration.baseballCards.push(card);
    snap.person = subject;
    var saved = m.store.saveLead(snap, { mode: "commit" });
    if (!saved || !saved.ok) {
      setStatus((saved && saved.error) || "Could not save the baseball card.");
      return;
    }
    setStatus("Saved baseball card on the subject.", true);
  }

  window.persistBaseballCard = persistBaseballCard;

  function boot() {
    if (pageKey() !== "baseballcard") {
      return;
    }
    var m = model();
    var leadId = queryLeadId();
    if (leadId && m && m.store) {
      m.store.loadFromDisk();
      var snap = m.store.getLead(leadId);
      if (snap && (!m.isCommitted || m.isCommitted(snap))) {
        hydrateFromLead(snap);
      } else if (!snap) {
        setStatus("Lead not found.");
      }
    }
    hydrateFromHandoff(readHandoff());
    var list = byId("criminalHistoryList");
    if (
      list &&
      !list.querySelector(".criminal-history-row") &&
      typeof addCriminalHistoryRow === "function"
    ) {
      addCriminalHistoryRow();
    }
    if (typeof bindAlienNumberInput === "function" && byId("alienNumber")) {
      bindAlienNumberInput(byId("alienNumber"));
    }
    editorText();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
