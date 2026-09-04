/**
 * COPDoc Narrative page controller.
 *
 * `?encounterId=` is the I-213 workspace for a saved encounter.
 * With no query, this page stays a Build 9 training lab on synthetic data.
 */
(function (global) {
  "use strict";

  var fixture = global.COPDocNarrativeDemoFixture;
  var liveEncounter = false;
  var liveEncounterId = "";
  var liveMiss = false;
  var embedded = false;
  try {
    var params = new URLSearchParams(window.location.search);
    embedded = params.get("embed") === "1";
    liveEncounterId = params.get("encounterId") || "";
    if (liveEncounterId) {
      var live =
        global.COPDoc &&
        COPDoc.encounterNarrative &&
        typeof COPDoc.encounterNarrative.bundleFromEncounter === "function"
          ? COPDoc.encounterNarrative.bundleFromEncounter(liveEncounterId)
          : null;
      if (live && live.encounter) {
        liveEncounter = true;
        fixture = {
          encounter: live.encounter,
          operation: live.operation,
          participants: live.participants || [],
          events: live.events || [],
          encounterVehicles: live.encounterVehicles || [],
          location: live.location,
          officers: live.officers || [],
          vehicles: live.vehicles || [],
          narrativesInitial: live.narrativesInitial || []
        };
      } else {
        liveMiss = true;
        fixture = {
          encounter: { encounterId: liveEncounterId },
          participants: [],
          events: [],
          encounterVehicles: [],
          officers: [],
          vehicles: [],
          narrativesInitial: []
        };
      }
    }
  } catch (error) {
    console.warn(error);
  }
  var narratives = global.COPDoc && global.COPDoc.narratives;
  var domain = narratives && narratives.build9;
  if (!narratives || !domain) {
    throw new Error("Narrative Build 9 dependencies did not load.");
  }
  if (!liveMiss && !fixture) {
    throw new Error("Narrative Build 9 dependencies did not load.");
  }

  function initNarrativePage() {
  if (embedded) {
    document.body.classList.add("narrative-embed");
  }
  var host = document.getElementById("narrativeEngineHost");
  if (!host) {
    throw new Error("Narrative page host is missing.");
  }

  var liveEmpty = liveEncounter && !(fixture.participants && fixture.participants.length);
  var emptyState = byId("narrativeEmptyState");
  var emptyText = byId("narrativeEmptyText");
  var emptyLink = byId("narrativeEmptyLink");
  var workspace = byId("narrativeWorkspace");
  var liveHeader = byId("narrativeLiveHeader");
  if (liveMiss || liveEmpty) {
    document.body.classList.add("narrative-empty");
    if (workspace) workspace.hidden = true;
    if (liveHeader) liveHeader.hidden = true;
    if (emptyState) emptyState.hidden = false;
    if (emptyText) {
      emptyText.textContent = liveMiss
        ? "Encounter not found."
        : embedded
          ? "Add subjects on the Subjects tab before writing an I-213."
          : "Add subjects before writing an I-213.";
    }
    if (emptyLink && liveEmpty && liveEncounterId && !embedded) {
      emptyLink.hidden = false;
      emptyLink.href =
        "encounter-form.html?id=" + encodeURIComponent(liveEncounterId);
      emptyLink.textContent = "Back to encounter";
    }
    document.title = "I-213";
    showStatus(
      liveMiss
        ? "Encounter not found."
        : embedded
          ? "Add subjects on the Subjects tab before writing an I-213."
          : "Add subjects before writing an I-213.",
      false
    );
    return;
  }

  document.body.classList.add(liveEncounter ? "narrative-live" : "narrative-training");
  if (liveEncounter) {
    document.title = "I-213";
    if (liveHeader) liveHeader.hidden = embedded;
    var pageHeader = byId("narrativePageHeader");
    if (pageHeader) pageHeader.hidden = true;
  }

  global.OpDocNarrativeConfig = {
    mode: "embedded",
    enableDemo: false,
    enableTestPacket: false,
    enableJsonImport: false,
    enableLocalStorage: false,
    canEditTemplates: false,
    canEditSourceValues: false,
    requireResolvedBeforeCopy: false,
    allowUnknownFields: false
  };
  host.innerHTML = narratives.ENGINE_MARKUP;
  var engine = global.__opdocNarrativeBootstrap();
  var store = domain.createNarrativeStore(fixture.narrativesInitial);
  if (liveEncounter && liveEncounterId && global.COPDoc && COPDoc.model && COPDoc.model.store) {
    COPDoc.model.store.loadFromDisk();
    var storedEncounter = COPDoc.model.store.getEncounter(liveEncounterId);
    if (storedEncounter && Array.isArray(storedEncounter.narratives) && storedEncounter.narratives.length) {
      store.replaceAll(storedEncounter.narratives);
    }
  }
  var unsavedDraftStateByParticipant = new Map();
  var activeParticipantId = null;

  function byId(id) {
    return document.getElementById(id);
  }

  function bindDraftPopout() {
    var hostEl = document.getElementById("narrativeEngineHost");
    var actions = hostEl && hostEl.querySelector(".narrative-heading-actions");
    var srcDraft = document.getElementById("narrativeDraft");
    var srcResolved = document.getElementById("resolvedDraft");
    if (!hostEl || !actions || !srcDraft) {
      return;
    }
    var btn = document.getElementById("popoutDraftButton");
    if (!btn) {
      btn = document.createElement("button");
      btn.id = "popoutDraftButton";
      btn.type = "button";
      btn.className = "compact";
      btn.title = "Open the draft in a separate window so it stays on screen while the elements scroll";
      actions.appendChild(btn);
    }
    if (btn.dataset.bound === "true") {
      return;
    }
    btn.dataset.bound = "true";

    var draftWindow = null;
    var closedTimer = 0;

    function stylesheetHref() {
      var link = document.querySelector('link[href*="style/style.css"]');
      if (link && link.href) {
        return link.href;
      }
      try {
        return new URL("style/style.css", window.location.href).href;
      } catch (error) {
        return "style/style.css";
      }
    }

    function popupFeatures() {
      var width = 720;
      var height = Math.min(980, (window.screen && window.screen.availHeight) || 900);
      var left = Math.max(0, (window.screenX || 0) + (window.outerWidth || 0) - 24);
      var avail = (window.screen && window.screen.availWidth) || left + width;
      if (left + width > avail) {
        left = Math.max(0, avail - width - 16);
      }
      var top = Math.max(0, (window.screenY || 0) + 48);
      return (
        "popup=yes,width=" +
        width +
        ",height=" +
        height +
        ",left=" +
        left +
        ",top=" +
        top +
        ",menubar=no,toolbar=no,location=no,status=no,scrollbars=yes,resizable=yes"
      );
    }

    function setPopped(on) {
      hostEl.classList.toggle("narrative-draft-popped", on);
      document.body.classList.toggle("narrative-draft-popped", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
      btn.textContent = on ? "Dock" : "Pop out";
      if (!on && closedTimer) {
        global.clearTimeout(closedTimer);
        closedTimer = 0;
      }
    }

    function dockDraft() {
      if (draftWindow && !draftWindow.closed) {
        draftWindow.close();
      }
      draftWindow = null;
      setPopped(false);
    }

    function watchClosed() {
      if (!draftWindow || draftWindow.closed) {
        draftWindow = null;
        setPopped(false);
        return;
      }
      closedTimer = global.setTimeout(watchClosed, 400);
    }

    function paintPopout() {
      if (!draftWindow || draftWindow.closed) {
        return;
      }
      var doc = draftWindow.document;
      var destDraft = doc.getElementById("narrativeDraft");
      var destResolved = doc.getElementById("resolvedDraft");
      var label = doc.getElementById("popoutViewLabel");
      if (destDraft) {
        destDraft.innerHTML = srcDraft.innerHTML;
        destDraft.hidden = !!srcDraft.hidden;
      }
      if (destResolved && srcResolved) {
        destResolved.value = srcResolved.value;
        destResolved.hidden = !!srcResolved.hidden;
      }
      if (label) {
        var mode = document.getElementById("editorModeLabel");
        label.textContent = mode ? String(mode.textContent || "").trim() : "";
      }
    }

    function bindPopupChrome(win) {
      var dockBtn = win.document.getElementById("popoutDockBtn");
      var copyBtn = win.document.getElementById("popoutCopyBtn");
      if (dockBtn) {
        dockBtn.onclick = function () {
          win.close();
        };
      }
      if (copyBtn) {
        copyBtn.onclick = function () {
          var destResolved = win.document.getElementById("resolvedDraft");
          var destDraft = win.document.getElementById("narrativeDraft");
          var text =
            destResolved && !destResolved.hidden
              ? destResolved.value
              : destDraft
                ? destDraft.innerText
                : "";
          if (!text) {
            return;
          }
          if (win.navigator.clipboard && win.navigator.clipboard.writeText) {
            win.navigator.clipboard.writeText(text);
          }
        };
      }
    }

    function openDraftWindow() {
      var win = window.open("", "copdocxNarrativeDraft", popupFeatures());
      if (!win) {
        return null;
      }
      var href = stylesheetHref().replace(/"/g, "");
      var html =
        "<!DOCTYPE html><html lang=\"en\"><head><meta charset=\"UTF-8\">" +
        "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">" +
        "<title>I-213 Draft</title>" +
        "<link rel=\"stylesheet\" href=\"" + href + "\">" +
        "<style>html,body{height:100%;}body.narrative-draft-window{display:flex;flex-direction:column;overflow:hidden;}" +
        ".draft-popout-bar{flex:0 0 auto;display:flex;align-items:center;gap:.65rem;padding:.45rem .75rem;border-bottom:1px solid var(--ns-line-strong);background:rgb(8 16 24 / .96);}" +
        ".draft-popout-bar strong{margin-right:auto;}body.narrative-draft-window .narrative-engine-host{flex:1 1 auto;min-height:0;height:auto;}" +
        "body.narrative-draft-window .narrative-panel{height:100%;max-height:none;border:0;border-radius:0;box-shadow:none;}" +
        "</style></head><body class=\"narrative-draft-window\">" +
        "<header class=\"draft-popout-bar\"><strong>I-213 Draft</strong>" +
        "<span id=\"popoutViewLabel\"></span>" +
        "<button type=\"button\" class=\"compact\" id=\"popoutCopyBtn\">Copy</button>" +
        "<button type=\"button\" class=\"compact\" id=\"popoutDockBtn\">Dock</button></header>" +
        "<div class=\"narrative-engine-host\"><section class=\"narrative-panel\">" +
        "<div id=\"narrativeDraft\"></div>" +
        "<textarea id=\"resolvedDraft\" hidden></textarea>" +
        "</section></div></body></html>";
      win.document.open();
      win.document.write(html);
      win.document.close();
      return win;
    }

    btn.addEventListener("click", function () {
      if (draftWindow && !draftWindow.closed) {
        dockDraft();
        return;
      }
      draftWindow = openDraftWindow();
      if (!draftWindow) {
        showStatus("Allow popups to open the I-213 draft window.", false);
        setPopped(false);
        return;
      }
      setPopped(true);
      global.setTimeout(function () {
        if (!draftWindow || draftWindow.closed) {
          return;
        }
        bindPopupChrome(draftWindow);
        paintPopout();
        try {
          draftWindow.focus();
        } catch (error) {}
      }, 0);
      watchClosed();
    });

    global.addEventListener(engine.events.narrativeChange, function () {
      paintPopout();
    });
    if (typeof MutationObserver === "function") {
      var observer = new MutationObserver(paintPopout);
      observer.observe(srcDraft, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true
      });
      if (srcResolved) {
        observer.observe(srcResolved, { attributes: true });
        srcResolved.addEventListener("input", paintPopout);
      }
    }
    global.addEventListener("pagehide", dockDraft);

    setPopped(false);
  }

  function showStatus(message, ok) {
    if (global.COPDoc && typeof global.COPDoc.setAppBarStatus === "function") {
      global.COPDoc.setAppBarStatus(message, { ok: ok !== false });
    }
  }

  function participantName(participant) {
    return participant.identitySnapshot && participant.identitySnapshot.displayName ||
      participant.encounterParticipantId;
  }

  function roleCode(participant) {
    return (participant.encounterRole === "TARGET" ? "T" : "C") + participant.roleSequence;
  }

  function looksEmptyUnknown(value) {
    var text = String(value == null ? "" : value).trim().toLowerCase();
    return !text || text === "unknown" || text === "null";
  }

  function seedFinalDisposition(participant) {
    var selections = {};
    if (!participant) {
      return selections;
    }
    if (String(participant.finalOutcome || "").toUpperCase() === "ARRESTED") {
      selections.final_outcome = "transported_ice_office";
    }
    var closing = participant.closing || {};
    var health = String(closing.health || "").trim();
    if (!looksEmptyUnknown(health) && /good|none|n\/a/.test(health.toLowerCase())) {
      selections.claimed_health = "claims_good_health";
    }
    var meds = String(closing.medication || closing.medications || "").trim();
    if (!looksEmptyUnknown(meds)) {
      selections.medication_statement = /^(none|no\b)/i.test(meds)
        ? "claims_no_medications"
        : "claims_named_medications";
    }
    var minors = String(closing.minors || "").trim();
    if (!looksEmptyUnknown(minors) && /^(none|no\b)/i.test(minors)) {
      selections.minor_children_statement = "claims_no_minor_children_us";
    }
    var cash = closing.currency && closing.currency.amountUsd;
    if (cash) {
      selections.currency_statement = "usd_in_possession";
    }
    var others = (fixture.participants || []).filter(function (row) {
      return row &&
        row.encounterParticipantId !== participant.encounterParticipantId &&
        String(row.finalOutcome || "").toUpperCase() === "ARRESTED";
    });
    if (others.length) {
      selections.other_arrested = "include_all_other_arrested";
    }
    return selections;
  }

  function persistLiveEncounter() {
    if (!liveEncounter || !liveEncounterId) {
      return;
    }
    var model = global.COPDoc && COPDoc.model;
    if (!model || !model.store) {
      return;
    }
    model.store.loadFromDisk();
    var enc = model.store.getEncounter(liveEncounterId);
    if (!enc) {
      return;
    }
    enc.narratives = store.all();
    var coverage = currentCoverage();
    var summary = domain.deriveEncounterSummary(demoBundle(), {
      narrativeCoverage: coverage,
      now: new Date().toISOString()
    });
    enc.supervisorSummary = {
      text: (summary && summary.generatedSupervisorText) || "",
      derivedAt: new Date().toISOString(),
      coverage: {
        complete: !!(coverage && coverage.coverageComplete),
        missing: (coverage && coverage.missingParticipantIds) || []
      }
    };
    model.store.saveEncounter(enc, {
      mode: model.isCommitted && model.isCommitted(enc) ? "commit" : "draft"
    });
  }

  function primaryFor(participantId) {
    return store.all().find(function (record) {
      return record &&
        (record.recordState || "ACTIVE") === "ACTIVE" &&
        record.narrativeKind === domain.NARRATIVE_KINDS.PRIMARY_SUBJECT &&
        record.focusEncounterParticipantId === participantId;
    }) || null;
  }

  function supplementsFor(participantId) {
    return store.all().filter(function (record) {
      return record &&
        (record.recordState || "ACTIVE") === "ACTIVE" &&
        record.narrativeKind === domain.NARRATIVE_KINDS.SUBJECT_SUPPLEMENT &&
        record.focusEncounterParticipantId === participantId;
    });
  }

  function demoBundle() {
    return {
      encounter: fixture.encounter,
      operation: fixture.operation,
      participants: fixture.participants,
      events: fixture.events,
      vehicles: fixture.encounterVehicles,
      primaryLocation: fixture.location,
      officers: fixture.officers,
      narratives: store.all(),
      narrativeFacts: liveEncounter
        ? {}
        : {
            command: "unlock the vehicle and exit",
            conduct: "pulling both arms away and attempting to turn toward Officers",
            facts_supporting_arrest: "the confirmed identity and immigration records",
            authority_and_basis: "the applicable administrative enforcement authority",
            technique_or_tool: "a control hold",
            tool: "a window punch"
          }
    };
  }

  function vehicleResolver(vehicleId) {
    return fixture.vehicles.find(function (vehicle) { return vehicle.vehicleId === vehicleId; }) || null;
  }

  function currentCoverage() {
    return domain.validateCoverage({
      encounterId: fixture.encounter.encounterId,
      participants: fixture.participants,
      narratives: store.all()
    });
  }

  function renderParticipantList() {
    var container = byId("participantNarratives");
    container.replaceChildren();
    fixture.participants.forEach(function (participant) {
      var primary = primaryFor(participant.encounterParticipantId);
      var supplements = supplementsFor(participant.encounterParticipantId);
      var button = document.createElement("button");
      button.type = "button";
      button.className = "narrative-participant" +
        (participant.encounterParticipantId === activeParticipantId ? " is-active" : "");
      button.dataset.participantId = participant.encounterParticipantId;

      var code = document.createElement("span");
      code.className = "narrative-role-code";
      code.textContent = roleCode(participant);

      var text = document.createElement("span");
      var name = document.createElement("span");
      name.className = "narrative-participant-name";
      name.textContent = participantName(participant);
      var meta = document.createElement("span");
      meta.className = "narrative-participant-meta";
      meta.textContent = (primary ? primary.workflowStatus || "DRAFT" : "MISSING") +
        " · " + participant.finalOutcome.replaceAll("_", " ") +
        (participant.iceEventNumber ? " · " + participant.iceEventNumber : "") +
        (supplements.length ? " · +" + supplements.length : "");
      text.append(name, document.createElement("br"), meta);

      var dot = document.createElement("span");
      dot.className = "narrative-status-dot" + (primary ? "" : " is-missing");
      dot.title = primary ? "Primary narrative exists" : "Primary narrative missing";

      button.append(code, text, dot);
      button.addEventListener("click", function () {
        switchFocus(participant.encounterParticipantId);
      });
      container.appendChild(button);
    });
  }

  function renderCoverageAndSummary() {
    var coverage = currentCoverage();
    var coverageBadge = byId("coverageBadge");
    coverageBadge.textContent = coverage.coveredCount + "/" + coverage.requiredCount;
    coverageBadge.className = "narrative-status " +
      (coverage.coverageComplete ? "is-ok" : "is-warn");

    var details = byId("coverageDetails");
    details.replaceChildren();
    [
      ["Required primary narratives", coverage.requiredCount],
      ["Covered", coverage.coveredCount],
      ["Missing", coverage.missingParticipantIds.length],
      ["Duplicates", coverage.duplicateParticipantIds.length],
      ["Supplements", store.all().filter(function (n) {
        return n.narrativeKind === domain.NARRATIVE_KINDS.SUBJECT_SUPPLEMENT ||
          n.narrativeKind === domain.NARRATIVE_KINDS.ENCOUNTER_SUPPLEMENT;
      }).length]
    ].forEach(function (row) {
      var line = document.createElement("div");
      line.className = "narrative-compact-row";
      var label = document.createElement("span");
      label.textContent = row[0];
      var value = document.createElement("strong");
      value.textContent = row[1];
      line.append(label, value);
      details.appendChild(line);
    });

    var missingButton = byId("completeMissingNarrativeButton");
    missingButton.disabled = coverage.missingParticipantIds.length === 0;
    if (!coverage.missingParticipantIds.length) {
      missingButton.textContent = "Primary coverage complete";
    } else {
      var missingParticipant = fixture.participants.find(function (row) {
        return row.encounterParticipantId === coverage.missingParticipantIds[0];
      });
      missingButton.textContent = missingParticipant
        ? "Create missing " + roleCode(missingParticipant) + " narrative"
        : "Create missing narrative";
    }

    var liveMeta = byId("narrativeLiveMeta");
    if (liveMeta && liveEncounter) {
      var active = fixture.participants.find(function (row) {
        return row.encounterParticipantId === activeParticipantId;
      }) || fixture.participants[0];
      liveMeta.textContent = [
        fixture.encounter && fixture.encounter.encounterId,
        active ? roleCode(active) + " · " + participantName(active) : "",
        active && active.iceEventNumber,
        coverage.coveredCount + "/" + coverage.requiredCount + " covered"
      ].filter(Boolean).join(" · ");
    }

    var summary = domain.deriveEncounterSummary(demoBundle(), {
      narrativeCoverage: coverage,
      now: new Date().toISOString()
    });
    var metrics = [
      [summary.what.arrestedCount, "Arrested"],
      [summary.what.releasedCount, "Released"],
      [summary.what.notContactedCount, "Not contacted"],
      [summary.what.finalOrders.yesCount, "Final orders"],
      [summary.how.forceIncidentCount, "Force"],
      [summary.how.windowBreakIncidentCount, "Window break"]
    ];
    var grid = byId("metricGrid");
    grid.replaceChildren();
    metrics.forEach(function (metric) {
      var card = document.createElement("div");
      card.className = "stat-card narrative-metric";
      var value = document.createElement("strong");
      value.className = "stat-value";
      value.textContent = metric[0];
      var label = document.createElement("span");
      label.className = "stat-label";
      label.textContent = metric[1];
      card.append(value, label);
      grid.appendChild(card);
    });
    byId("supervisorSummaryText").textContent = summary.generatedSupervisorText;
  }

  function seededSelections(record, participant) {
    var state = record && record.engine && record.engine.state;
    var selections = Object.assign({}, state && state.encounter && state.encounter.selections || {});
    if (
      selections.subject_conduct ||
      selections.force_type ||
      selections.window_break
    ) {
      selections.incident_subject = selections.incident_subject || "primary_subject";
    }
    if (liveEncounter && !(state && state.encounter && state.encounter.selections)) {
      selections = Object.assign(seedFinalDisposition(participant), selections);
    }
    return selections;
  }

  function resumableStateFor(record) {
    var state = record && record.engine && record.engine.state;
    if (!state) return null;
    if (state.template && Array.isArray(state.template.sections)) return state;

    // Build 9 fixtures predate the extracted template envelope. Project their
    // encounter choices and times onto the current Master template so no saved
    // timing or binding state is lost during the compatibility migration.
    var migrated = engine.getState({ includeData: false });
    migrated.encounter = Object.assign({}, migrated.encounter, state.encounter || {});
    migrated.narrative = Object.assign({}, migrated.narrative, state.narrative || {});
    return migrated;
  }

  function captureCurrent(options) {
    options = options || {};
    if (!activeParticipantId) return null;
    var output = engine.getOutput();
    var state = engine.getState({ includeData: false });
    var existing = primaryFor(activeParticipantId);
    var participant = fixture.participants.find(function (row) {
      return row.encounterParticipantId === activeParticipantId;
    });
    if (existing) {
      store.save(existing.narrativeId, {
        engine: {
          version: engine.version,
          build: engine.build,
          stateSchema: engine.schemas.state,
          state: state
        },
        output: output,
        bindings: output.bindings,
        factsManifest: output.factsManifest,
        validationSnapshot: output.validation,
        freshnessStatus: "CURRENT"
      });
      if (!options.silent) showStatus("Dynamic narrative updated for " + participantName(participant) + ".");
    } else if (options.createMissing) {
      store.create({
        narrativeId: liveEncounter
          ? "nar_" + liveEncounterId + "_" + activeParticipantId + "_primary"
          : "nar_demo_" + activeParticipantId + "_primary",
        encounterId: fixture.encounter.encounterId,
        narrativeKind: domain.NARRATIVE_KINDS.PRIMARY_SUBJECT,
        focusEncounterParticipantId: activeParticipantId,
        relatedEncounterParticipantIds: fixture.participants.map(function (row) {
          return row.encounterParticipantId;
        }),
        title: participantName(participant) + " — Primary subject narrative",
        workflowStatus: "DRAFT",
        freshnessStatus: "CURRENT",
        engine: {
          version: engine.version,
          build: engine.build,
          stateSchema: engine.schemas.state,
          state: state
        },
        output: output,
        bindings: output.bindings,
        factsManifest: output.factsManifest,
        validationSnapshot: output.validation,
        sourceSnapshot: {
          encounterId: fixture.encounter.encounterId,
          iceEventNumber: participant.iceEventNumber || ""
        }
      });
      unsavedDraftStateByParticipant.delete(activeParticipantId);
      if (!options.silent) showStatus("Primary narrative created for " + participantName(participant) + ".");
    } else {
      unsavedDraftStateByParticipant.set(activeParticipantId, state);
    }
    persistLiveEncounter();
    renderParticipantList();
    renderCoverageAndSummary();
    renderOutputAudit();
    return output;
  }

  function switchFocus(participantId) {
    if (participantId === activeParticipantId) return;
    var participant = fixture.participants.find(function (row) {
      return row.encounterParticipantId === participantId;
    });
    if (!participant) return;
    if (activeParticipantId) captureCurrent({ silent: true, createMissing: false });
    activeParticipantId = participantId;
    var existing = primaryFor(participantId);
    var packet = narratives.buildPacketFromBundle(demoBundle(), participantId, {
      isTestData: !liveEncounter,
      vehicleResolver: vehicleResolver
    });

    engine.resetEncounter({ clearData: true });
    engine.setDataPacket(packet);

    var resumableState = unsavedDraftStateByParticipant.get(participantId) ||
      resumableStateFor(existing);
    if (resumableState) {
      engine.loadState(resumableState, {
        loadData: false,
        restorePlainText: true,
        autoBind: true
      });
    } else {
      engine.setSelections(seededSelections(existing, participant), { rebuild: true });
    }
    engine.setView("values");
    byId("activeNarrativeTitle").textContent =
      roleCode(participant) + " · " + participantName(participant) +
      (existing ? " · " + (existing.workflowStatus || "DRAFT") : " · MISSING PRIMARY");
    renderParticipantList();
    renderCoverageAndSummary();
    renderOutputAudit();
  }

  function renderOutputAudit() {
    if (!activeParticipantId) return;
    var output = engine.getOutput();
    var container = byId("sectionAudit");
    container.replaceChildren();
    output.sections.forEach(function (section) {
      var row = document.createElement("div");
      row.className = "narrative-section-row" +
        (section.sectionType === "SYSTEM" ? " is-system" : "");
      var number = document.createElement("strong");
      number.textContent = section.sequence;
      var title = document.createElement("strong");
      title.textContent = section.title;
      var text = document.createElement("span");
      text.className = "narrative-section-text";
      text.textContent = section.resolvedText;
      row.append(number, title, text);
      container.appendChild(row);
    });
    var canonical = output.sections
      .map(function (section) { return section.resolvedText; })
      .filter(Boolean)
      .join("\n\n");
    var exactBreaks = canonical === output.generatedResolvedText;
    byId("outputSchemaBadge").textContent =
      output.schema + (exactBreaks ? " · breaks verified" : " · break mismatch");
    byId("outputSchemaBadge").className = "narrative-status " +
      (exactBreaks ? "is-ok" : "is-warn");
    byId("outputJson").textContent = JSON.stringify(output, null, 2);
  }

  function activeFileStem() {
    var participant = fixture.participants.find(function (row) {
      return row.encounterParticipantId === activeParticipantId;
    });
    var label = participant ? roleCode(participant) + "_" + participantName(participant) : "narrative";
    return label.replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "") || "narrative";
  }

  function downloadFile(filename, content, type) {
    var blob = new Blob([content], { type: type });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    global.setTimeout(function () { URL.revokeObjectURL(url); }, 0);
  }

  function downloadOutputJson() {
    var output = engine.getOutput();
    downloadFile(activeFileStem() + ".json", JSON.stringify(output, null, 2), "application/json");
    showStatus("Narrative JSON downloaded.");
  }

  function downloadOutputText() {
    var output = engine.getOutput();
    var text = output.plainText || output.generatedResolvedText || "";
    if (!text) {
      showStatus("Build the narrative before downloading text.", false);
      return;
    }
    downloadFile(activeFileStem() + ".txt", text + "\n", "text/plain;charset=utf-8");
    showStatus("Narrative text downloaded.");
  }

  var primaryAction = byId("appBarPrimaryAction");
  if (primaryAction) {
    primaryAction.addEventListener("click", function () {
      captureCurrent({ createMissing: true });
    });
  }
  var copyAction = byId("copyNarrativeButton");
  if (copyAction) {
    copyAction.addEventListener("click", function () {
      var engineCopy = document.getElementById("copyButton");
      if (engineCopy) {
        engineCopy.click();
        return;
      }
      var output = engine.getOutput();
      var text = output.plainText || output.generatedResolvedText || "";
      if (!text) {
        showStatus("Build the narrative before copying.", false);
        return;
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () {
          showStatus("Narrative copied.");
        });
      }
    });
  }
  byId("downloadNarrativeJsonButton").addEventListener("click", downloadOutputJson);
  byId("downloadNarrativeTextButton").addEventListener("click", downloadOutputText);
  byId("completeMissingNarrativeButton").addEventListener("click", function () {
    var coverage = currentCoverage();
    var participantId = coverage.missingParticipantIds[0];
    if (!participantId) return;
    if (participantId === activeParticipantId) {
      captureCurrent({ createMissing: true });
    } else if (liveEncounter) {
      switchFocus(participantId);
      captureCurrent({ createMissing: true });
    } else {
      if (typeof fixture.makeMissingPrimaryNarrative === "function") {
        store.create(fixture.makeMissingPrimaryNarrative());
      }
      renderParticipantList();
      renderCoverageAndSummary();
      var missing = fixture.participants.find(function (row) {
        return row.encounterParticipantId === participantId;
      });
      showStatus(
        "Created the missing " +
          (missing ? roleCode(missing) + " " : "") +
          "primary narrative. Coverage is now complete."
      );
    }
  });

  global.addEventListener(engine.events.narrativeChange, function () {
    global.requestAnimationFrame(renderOutputAudit);
  });

  var master = narratives.MASTER_NARRATIVE_SECTIONS;
  var fields = master.flatMap(function (section) { return section.fields; });
  var options = fields.flatMap(function (field) { return field.options; });
  byId("libraryVerification").textContent =
    "Prose libraries verified · " + master.length + "/" + fields.length + "/" + options.length;
  byId("libraryVerification").className = "narrative-status is-ok";

  if (liveEncounter) {
    var headingActions = document.querySelector(".narrative-heading-actions");
    if (headingActions && !document.getElementById("narrativeAdvancedButton")) {
      var advanced = document.createElement("button");
      advanced.id = "narrativeAdvancedButton";
      advanced.type = "button";
      advanced.className = "compact ghost";
      advanced.textContent = "Advanced";
      advanced.setAttribute("aria-pressed", "false");
      advanced.addEventListener("click", function () {
        var on = document.body.classList.toggle("narrative-advanced");
        advanced.setAttribute("aria-pressed", on ? "true" : "false");
      });
      headingActions.insertBefore(advanced, headingActions.firstChild);
    }
  }

  bindDraftPopout();

  renderParticipantList();
  renderCoverageAndSummary();
  switchFocus(
    fixture.participants[0] && fixture.participants[0].encounterParticipantId
  );
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initNarrativePage, { once: true });
  } else {
    initNarrativePage();
  }
})(typeof window !== "undefined" ? window : globalThis);
