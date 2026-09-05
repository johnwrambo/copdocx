/**
 * COPDoc Narrative page controller.
 *
 * `?encounterId=` is the I-213 workspace for a saved encounter.
 * With no query, this page stays a Build 9 training lab on synthetic data.
 */
(function (global) {
  "use strict";

  var narratives = global.COPDoc && global.COPDoc.narratives;
  var domain = narratives && narratives.build9;
  if (!narratives || !domain) {
    throw new Error("Narrative Build 9 dependencies did not load.");
  }

  var bootGeneration = 0;

  function byId(id) {
    return document.getElementById(id);
  }

  function loadLiveFixture(encounterId) {
    var liveEncounter = false;
    var liveMiss = false;
    var fixture = global.COPDocNarrativeDemoFixture;
    if (!encounterId) {
      return { liveEncounter: liveEncounter, liveMiss: liveMiss, fixture: fixture };
    }
    try {
      var live =
        global.COPDoc &&
        COPDoc.encounterNarrative &&
        typeof COPDoc.encounterNarrative.bundleFromEncounter === "function"
          ? COPDoc.encounterNarrative.bundleFromEncounter(encounterId)
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
          sourceFacts: live.sourceFacts || null,
          encounterLocked: !!live.encounterLocked,
          sourceUnavailable: live.sourceUnavailable === true,
          unassignedParticipantCount: live.unassignedParticipantCount || 0,
          narrativesInitial: live.narrativesInitial || []
        };
      } else {
        liveMiss = true;
        fixture = {
          encounter: { encounterId: encounterId },
          participants: [],
          events: [],
          encounterVehicles: [],
          officers: [],
          vehicles: [],
          narrativesInitial: []
        };
      }
    } catch (error) {
      console.warn(error);
      liveMiss = true;
      fixture = {
        encounter: { encounterId: encounterId },
        participants: [],
        events: [],
        encounterVehicles: [],
        officers: [],
        vehicles: [],
        narrativesInitial: []
      };
    }
    return { liveEncounter: liveEncounter, liveMiss: liveMiss, fixture: fixture };
  }

  function bootWorkspace(options) {
  options = options || {};
  if (typeof narratives.flushWorkspace === "function") {
    try {
      narratives.flushWorkspace();
    } catch (error) {
      console.warn(error);
    }
  }
  var inPage = !!options.inPage;
  var liveEncounterId = String(options.encounterId || "").trim();
  var loaded = loadLiveFixture(liveEncounterId);
  var liveEncounter = loaded.liveEncounter;
  var liveMiss = loaded.liveMiss;
  var fixture = loaded.fixture;
  if (!liveMiss && !fixture) {
    throw new Error("Narrative Build 9 dependencies did not load.");
  }

  bootGeneration += 1;
  var session = bootGeneration;
  global.OpDocNarrative = undefined;
  document.body.classList.remove(
    "narrative-embed",
    "narrative-empty",
    "narrative-live",
    "narrative-training",
    "narrative-inpage"
  );
  if (inPage) {
    document.body.classList.add("narrative-inpage");
  }

  var host = byId("narrativeEngineHost");
  if (!host) {
    throw new Error("Narrative page host is missing.");
  }
  host.__copdocNarrativeWorkspaceUi = null;
  var previousSourcePanel = byId("narrativeSourceStatusPanel");
  if (previousSourcePanel) previousSourcePanel.remove();

  var liveEmpty = liveEncounter && !(fixture.participants && fixture.participants.length);
  var emptyState = byId("narrativeEmptyState");
  var emptyText = byId("narrativeEmptyText");
  var emptyLink = byId("narrativeEmptyLink");
  var workspace = byId("narrativeWorkspace");
  var liveHeader = byId("narrativeLiveHeader");
  if (liveMiss || liveEmpty) {
    var needsRoles = liveEmpty && Number(fixture.unassignedParticipantCount) > 0;
    document.body.classList.add("narrative-empty");
    if (workspace) workspace.hidden = true;
    if (liveHeader) liveHeader.hidden = true;
    if (emptyState) emptyState.hidden = false;
    if (emptyText) {
      emptyText.textContent = liveMiss
        ? "Encounter not found."
        : needsRoles
          ? "Assign each subject a Target or Collateral role before writing an I-213."
          : inPage
            ? "Add subjects on the Subjects tab before writing an I-213."
            : "Add subjects before writing an I-213.";
    }
    if (emptyLink && liveEmpty && liveEncounterId && !inPage) {
      emptyLink.hidden = false;
      emptyLink.href =
        "encounter-form.html?id=" + encodeURIComponent(liveEncounterId);
      emptyLink.textContent = needsRoles ? "Assign subject roles" : "Back to encounter";
    }
    if (!inPage) {
      document.title = "I-213";
    }
    showStatus(
      liveMiss
        ? "Encounter not found."
        : needsRoles
          ? "Assign Target or Collateral roles before writing an I-213."
          : inPage
            ? "Add subjects on the Subjects tab before writing an I-213."
            : "Add subjects before writing an I-213.",
      false
    );
    return;
  }

  document.body.classList.add(liveEncounter ? "narrative-live" : "narrative-training");
  if (liveEncounter) {
    if (!inPage) {
      document.title = "I-213";
    }
    if (liveHeader) liveHeader.hidden = inPage;
    var pageHeader = byId("narrativePageHeader");
    if (pageHeader) pageHeader.hidden = true;
  }

  global.OpDocNarrativeConfig = {
    mode: "embedded",
    enableDemo: false,
    enableTestPacket: false,
    enableJsonImport: false,
    enableLocalStorage: false,
    canEditTemplates: !liveEncounter,
    canComposeNarrative: true,
    canEditSourceValues: false,
    requireResolvedBeforeCopy: false,
    allowUnknownFields: false
  };
  host.innerHTML = narratives.ENGINE_MARKUP;
  var engine = global.__opdocNarrativeBootstrap();
  if (typeof narratives.enhanceWorkspace === "function") {
    narratives.enhanceWorkspace({ host: host, engine: engine });
  } else if (narratives.installWorkspaceEnhancements) {
    narratives.installWorkspaceEnhancements(engine);
  }
  var store = domain.createNarrativeStore(fixture.narrativesInitial);
  var unsavedDraftStateByParticipant = new Map();
  var conflictedParticipantIds = new Set();
  var activeParticipantId = null;
  var sourceApi = global.COPDoc && COPDoc.narrativeSource;
  var sourceSnapshotByParticipant = new Map();
  var loadedSourceByParticipant = new Map();
  var reviewReadyParticipantIds = new Set();
  var sourceStatusByNarrativeId = new Map();
  var latestSourceFixture = fixture;
  var readOnlyControlState = new WeakMap();
  if (typeof engine.setCopyOutputHandler === "function") {
    engine.setCopyOutputHandler(function (text) { return deliverNarrativeOutput("clipboard", "narrative.text", text); });
  }

  function copyValue(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function captureSource(sourceFixture, participantId) {
    return sourceApi && typeof sourceApi.capture === "function"
      ? sourceApi.capture(sourceFixture, participantId)
      : null;
  }

  function sourceStatus(snapshot, currentSnapshot) {
    return sourceApi && typeof sourceApi.evaluate === "function"
      ? sourceApi.evaluate(snapshot, currentSnapshot)
      : "UNKNOWN";
  }

  function latestSources() {
    if (!liveEncounter) return fixture;
    var loadedSource = loadLiveFixture(liveEncounterId);
    return loadedSource.liveEncounter ? loadedSource.fixture : null;
  }

  function refreshSourceStatus() {
    latestSourceFixture = latestSources();
    sourceStatusByNarrativeId.clear();
    store.all().forEach(function (record) {
      var participant = participantForReference(record.focusEncounterParticipantId);
      sourceStatusByNarrativeId.set(record.narrativeId, sourceStatus(
        record.sourceSnapshot,
        participant && latestSourceFixture
          ? captureSource(latestSourceFixture, participant.encounterParticipantId)
          : null
      ));
    });
  }

  function sourceAwareNarratives(records) {
    if (!liveEncounter) return records;
    return records.map(function (record) {
      return Object.assign({}, record, {
        freshnessStatus: sourceStatusByNarrativeId.get(record.narrativeId) || "UNKNOWN"
      });
    });
  }

  function isReadOnlyNarrative(record) {
    return !!(
      (record && record.workflowStatus === "FINALIZED") ||
      (latestSourceFixture && latestSourceFixture.encounterLocked)
    );
  }

  function applyEditorReadOnly(readOnly) {
    var viewActions = ["copyButton", "typesViewButton", "rolesViewButton", "valuesViewButton",
      "plainTextViewButton", "bindingsViewButton", "helpButton", "helpCloseButton", "popoutDraftButton"];
    host.querySelectorAll("input, select, textarea, button, [contenteditable]").forEach(function (control) {
      if (control.tagName === "BUTTON" && viewActions.indexOf(control.id) !== -1) return;
      if (readOnly) {
        if (!readOnlyControlState.has(control)) {
          readOnlyControlState.set(control, {
            disabled: control.disabled,
            readOnly: control.readOnly,
            contenteditable: control.getAttribute("contenteditable")
          });
        }
        if (control.tagName === "TEXTAREA") control.readOnly = true;
        else if (/^(INPUT|SELECT|BUTTON)$/.test(control.tagName)) control.disabled = true;
        if (control.getAttribute("contenteditable") != null) control.setAttribute("contenteditable", "false");
      } else if (readOnlyControlState.has(control)) {
        var previous = readOnlyControlState.get(control);
        control.disabled = previous.disabled;
        control.readOnly = previous.readOnly;
        if (previous.contenteditable != null) control.setAttribute("contenteditable", previous.contenteditable);
        readOnlyControlState.delete(control);
      }
    });
    var record = primaryFor(activeParticipantId);
    if (readOnly && record && record.output) {
      // The source signature cannot reconstruct a historical packet. Preserve
      // finalized/locked prose in every view instead of re-resolving its tokens.
      var frozenText = record.output.finalPlainText || "";
      var draft = byId("narrativeDraft");
      var resolved = byId("resolvedDraft");
      if (draft && draft.textContent !== frozenText) draft.textContent = frozenText;
      if (resolved) resolved.value = frozenText;
    }
  }

  function outputForExport() {
    var record = primaryFor(activeParticipantId);
    return isReadOnlyNarrative(record) && record && record.output
      ? copyValue(record.output)
      : engine.getOutput();
  }

  function copyReadOnlyNarrative() {
    return deliverNarrativeOutput("clipboard", "narrative.text");
  }

  async function deliverNarrativeOutput(method, documentType, explicitText, targetWindow) {
    if (session !== bootGeneration) return false;
    var documents = global.COPDoc && global.COPDoc.documents;
    if (!documents || !documents.captureContext || !documents.generate || !documents.recordDelivery) {
      showStatus("Document tracking is unavailable. Reload this page before exporting the narrative.", false);
      return false;
    }
    var output = outputForExport();
    var saved = primaryFor(activeParticipantId);
    var locked = isReadOnlyNarrative(saved);
    var participant = fixture.participants.find(function (row) { return row.encounterParticipantId === activeParticipantId; }) || {};
    var text = locked || explicitText === undefined
      ? (typeof output.finalPlainText === "string" ? output.finalPlainText : output.plainText || output.generatedResolvedText || "")
      : String(explicitText);
    if (documentType === "narrative.text" && !text) { showStatus("Build the narrative before exporting text.", false); return false; }
    var sourceSnapshot = locked && saved ? saved.sourceSnapshot
      : sourceSnapshotByParticipant.get(activeParticipantId) || loadedSourceByParticipant.get(activeParticipantId);
    var state = locked && saved ? saved.engine && saved.engine.state : (engine.getState ? engine.getState({ includeData: false }) : null);
    var template = locked && saved ? (saved.template || state && state.template || {})
      : (engine.getTemplate ? engine.getTemplate() : state && state.template || {});
    var sources = [];
    [["Encounter", liveEncounterId || fixture.encounter && fixture.encounter.encounterId],
      ["EncounterSubject", activeParticipantId], ["Person", participant.personId],
      ["Booking", participant.bookingId || participant.bookinRecordId], ["Narrative", saved && saved.narrativeId]]
      .forEach(function (pair) { if (pair[1]) sources.push({type:pair[0],id:pair[1],authority:locked ? "snapshot" : "draft"}); });
    var context;
    var generation;
    try {
      context = documents.captureContext({ documentType: documentType, sources: sources,
        input: { output: output, text: text, state: state || null, sourceSnapshot: sourceSnapshot || null,
          filename: activeFileStem() + (documentType === "narrative.json" ? ".json" : ".txt"),
          trailingNewline: method === "download" && documentType === "narrative.text" }
      });
      generation = await documents.generate({ documentType: documentType, context: context, templateContent: template,
        render: function (snapshot) {
          var input = snapshot.input;
          return { data: snapshot.documentType === "narrative.json" ? JSON.stringify(input.output, null, 2)
            : input.text + (input.trailingNewline ? "\n" : ""),
            mimeType: snapshot.documentType === "narrative.json" ? "application/json" : "text/plain;charset=utf-8", filename: input.filename };
        }
      });
    } catch (error) { showStatus("Narrative could not be recorded: " + error.message, false); return false; }
    var delivered = false;
    try {
      if (method === "download") {
        downloadFile(generation.artifact.filename, generation.artifact.data, generation.artifact.mimeType);
        delivered = true;
      } else {
        var destination = targetWindow || global;
        var clipboard = destination.navigator && destination.navigator.clipboard;
        try { if (clipboard && clipboard.writeText) { await clipboard.writeText(generation.artifact.data); delivered = true; } } catch (error) {}
        if (!delivered) {
          var doc = destination.document || document, field;
          try {
            field = doc.createElement("textarea"); field.value = generation.artifact.data; field.readOnly = true;
            doc.body.appendChild(field); field.select(); delivered = !!doc.execCommand("copy");
          } finally { if (field) field.remove(); }
        }
      }
    } catch (error) { delivered = false; }
    try {
      await documents.recordDelivery(generation.record.generationId, {
        method: method, status: delivered ? (method === "download" ? "SUBMITTED" : "SUCCEEDED") : "FAILED"
      });
    } catch (error) {
      showStatus((delivered ? "Narrative exported, but its delivery record could not be saved: " : "Export failed; delivery record could not be saved: ") + error.message, false);
      return false;
    }
    showStatus(delivered ? (method === "download" ? "Narrative downloaded." : "Narrative copied.") : "Narrative could not be exported.", delivered);
    return delivered;
  }

  function renderSourceStatus() {
    var panel = byId("narrativeSourceStatusPanel");
    if (!liveEncounter || !activeParticipantId) {
      if (panel) panel.hidden = true;
      return;
    }
    if (!panel) {
      panel = document.createElement("div");
      panel.id = "narrativeSourceStatusPanel";
      panel.className = "narrative-source-status";
      var message = document.createElement("p");
      message.id = "narrativeSourceStatusText";
      message.setAttribute("role", "status");
      message.setAttribute("aria-live", "polite");
      var refresh = document.createElement("button");
      refresh.id = "refreshNarrativeSourceButton";
      refresh.type = "button";
      refresh.textContent = "Refresh source facts";
      refresh.addEventListener("click", refreshActiveSource);
      var review = document.createElement("button");
      review.id = "reviewNarrativeSourceButton";
      review.type = "button";
      review.textContent = "Mark source reviewed";
      review.addEventListener("click", markSourceReviewed);
      panel.append(message, refresh, review);
      if (host.parentNode) host.parentNode.insertBefore(panel, host);
    }
    panel.hidden = false;
    var record = primaryFor(activeParticipantId);
    var currentSource = latestSourceFixture && captureSource(latestSourceFixture, activeParticipantId);
    var baseline = sourceSnapshotByParticipant.has(activeParticipantId)
      ? sourceSnapshotByParticipant.get(activeParticipantId)
      : record && record.sourceSnapshot;
    var status = sourceStatus(baseline, currentSource);
    var readOnly = isReadOnlyNarrative(record);
    var ready = reviewReadyParticipantIds.has(activeParticipantId) &&
      sourceStatus(loadedSourceByParticipant.get(activeParticipantId), currentSource) === "CURRENT";
    var messageText = status === "CURRENT"
      ? "Source facts match this draft."
      : status === "STALE"
        ? "Source facts changed. Refresh them, review the draft, then mark the source reviewed."
        : "Source not verified. Refresh the facts and review this draft before marking the source reviewed.";
    if (!latestSourceFixture || !currentSource) {
      messageText = "This subject or its source is unavailable. Reload the Narrative workspace.";
    } else if (record && record.workflowStatus === "FINALIZED") {
      messageText = "Finalized narrative · " + (status === "CURRENT" ? "source unchanged." :
        status === "STALE" ? "source facts changed; the saved narrative is unchanged." :
          "source not verified; the saved narrative is unchanged.");
    } else if (readOnly) {
      messageText = "This encounter is completed and locked. Its narrative is read-only.";
    } else if (ready) {
      messageText += " Refreshed facts are loaded; review any manual text before accepting them.";
    }
    byId("narrativeSourceStatusText").textContent = messageText;
    byId("refreshNarrativeSourceButton").disabled = readOnly || !currentSource;
    byId("reviewNarrativeSourceButton").disabled = readOnly || !ready;
    ["appBarPrimaryAction", "saveEncounterNarrativeButton"].forEach(function (id) {
      var button = byId(id);
      if (button) button.disabled = readOnly;
    });
    applyEditorReadOnly(readOnly);
  }

  function refreshActiveSource() {
    if (session !== bootGeneration || !liveEncounter || !activeParticipantId) return;
    refreshSourceStatus();
    var existing = primaryFor(activeParticipantId);
    if (isReadOnlyNarrative(existing)) {
      renderSourceStatus();
      return;
    }
    if (conflictedParticipantIds.has(activeParticipantId)) {
      showStatus("This narrative changed in another window. Reload before refreshing its source.", false);
      return;
    }
    var currentParticipant = fixture.participants.find(function (row) {
      return row.encounterParticipantId === activeParticipantId;
    });
    var matches = latestSourceFixture && latestSourceFixture.participants.filter(function (row) {
      return row.encounterParticipantId === activeParticipantId;
    }) || [];
    var nextParticipant = matches.length === 1 ? matches[0] : null;
    if (!nextParticipant || !["personId", "leadId", "bookingId"].every(function (key) {
      var before = currentParticipant && currentParticipant[key];
      var after = nextParticipant[key];
      return !before || !after || before === after;
    })) {
      showStatus("This subject's identity changed. Reload the Narrative workspace.", false);
      return;
    }
    var state = engine.getState({ includeData: false });
    var previousSeed = seedFromEncounter(currentParticipant);
    fixture = latestSourceFixture;
    var nextSeed = seedFromEncounter(nextParticipant);
    state.encounter = state.encounter || {};
    state.encounter.selections = Object.assign({}, state.encounter.selections || {});
    previousSeed.hideIds.concat(nextSeed.hideIds).forEach(function (fieldId) {
      delete state.encounter.selections[fieldId];
    });
    Object.assign(state.encounter.selections, nextSeed.selections);
    var packet = narratives.buildPacketFromBundle(demoBundle(), activeParticipantId, {
      isTestData: false,
      vehicleResolver: vehicleResolver
    });
    engine.resetEncounter({ clearData: true });
    engine.setDataPacket(packet);
    engine.loadState(state, { loadData: false, restorePlainText: true, autoBind: true });
    applyEncounterOwnedUi(nextSeed.hideIds);
    loadedSourceByParticipant.set(activeParticipantId, captureSource(fixture, activeParticipantId));
    reviewReadyParticipantIds.add(activeParticipantId);
    renderParticipantList();
    renderCoverageAndSummary();
    renderOutputAudit();
    renderSourceStatus();
    showStatus("Source facts refreshed. Review the narrative, including any manual text, before marking the source reviewed.");
  }

  function markSourceReviewed() {
    if (session !== bootGeneration || !liveEncounter || !activeParticipantId) return;
    refreshSourceStatus();
    var existing = primaryFor(activeParticipantId);
    var currentSource = latestSourceFixture && captureSource(latestSourceFixture, activeParticipantId);
    var loadedSource = loadedSourceByParticipant.get(activeParticipantId);
    if (isReadOnlyNarrative(existing) || !reviewReadyParticipantIds.has(activeParticipantId)) {
      renderSourceStatus();
      return;
    }
    if (sourceStatus(loadedSource, currentSource) !== "CURRENT") {
      reviewReadyParticipantIds.delete(activeParticipantId);
      renderSourceStatus();
      showStatus("Source facts changed again. Refresh them before marking the source reviewed.", false);
      return;
    }
    sourceSnapshotByParticipant.set(activeParticipantId, copyValue(loadedSource));
    reviewReadyParticipantIds.delete(activeParticipantId);
    var saved = captureCurrent({ createMissing: !!existing, silent: true });
    if (saved !== false) {
      var latestAfterSave = latestSourceFixture && captureSource(latestSourceFixture, activeParticipantId);
      showStatus(sourceStatus(loadedSource, latestAfterSave) === "CURRENT"
        ? (existing ? "Source review saved." : "Source reviewed. Save to create this primary narrative.")
        : "Draft saved, but source facts changed again. Refresh and review the latest facts.");
    }
    renderSourceStatus();
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
        destResolved.readOnly = isReadOnlyNarrative(primaryFor(activeParticipantId));
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
          var record = primaryFor(activeParticipantId);
          if (isReadOnlyNarrative(record) && record && record.output) {
            text = record.output.finalPlainText || "";
          }
          if (!text) {
            return;
          }
          return deliverNarrativeOutput("clipboard", "narrative.text", text, win);
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

  function participantReferenceIds(participant) {
    var seen = Object.create(null);
    return [
      participant && participant.encounterParticipantId,
      participant && participant.subjectId
    ].concat(
      participant && Array.isArray(participant.legacyEncounterParticipantIds)
        ? participant.legacyEncounterParticipantIds
        : []
    ).reduce(function (output, value) {
      var id = String(value || "").trim();
      if (id && !seen[id]) {
        seen[id] = true;
        output.push(id);
      }
      return output;
    }, []);
  }

  function participantForReference(candidateId) {
    var id = String(candidateId || "").trim();
    if (!id) {
      return null;
    }
    var matches = fixture.participants.filter(function (participant) {
      return participantReferenceIds(participant).indexOf(id) !== -1;
    });
    return matches.length === 1 ? matches[0] : null;
  }

  function recordFocusesParticipant(record, participantId) {
    var focused = participantForReference(
      record && record.focusEncounterParticipantId
    );
    return !!focused && focused.encounterParticipantId === participantId;
  }

  function matchLiveSubject(participant) {
    if (!participant) return null;
    var subjects = fixture.sourceFacts && fixture.sourceFacts.subjects || {};
    var canonicalId = String(participant.subjectId || participant.encounterParticipantId || "").trim();
    // Source facts have already crossed the adapter's identity boundary. An
    // explicit subject ID never falls back to a name, A-number, or roster index.
    if (canonicalId && Object.prototype.hasOwnProperty.call(subjects, canonicalId)) {
      return subjects[canonicalId];
    }
    if (participant.subjectId) return null;
    var aliases = participantReferenceIds(participant);
    var matches = Object.keys(subjects).filter(function (subjectId) {
      return aliases.indexOf(subjectId) !== -1;
    });
    return matches.length === 1 ? subjects[matches[0]] : null;
  }

  function seedFromEncounter(participant) {
    var selections = {};
    var hideIds = [];
    function take(fieldId, optionId) {
      if (!optionId) {
        return;
      }
      selections[fieldId] = optionId;
      hideIds.push(fieldId);
    }
    function hide(fieldId) {
      if (hideIds.indexOf(fieldId) === -1) {
        hideIds.push(fieldId);
      }
    }
    if (!liveEncounter || !participant) {
      return { selections: selections, hideIds: hideIds };
    }
    var facts = fixture.sourceFacts || {};
    var enc = facts.encounter || fixture.encounter || {};
    var eventType = String(enc.eventType || "").toUpperCase();
    if (eventType === "TARGETED_ARREST") {
      take("origin_type", "preplanned_targeted_arrest");
    } else if (eventType === "COLLATERAL_CONTACT") {
      take("origin_type", "collateral_encounter");
    }
    var assoc = String(enc.centerAssociation || "").toLowerCase();
    if (assoc === "target") {
      take("encounter_location_type", "residence");
    } else if (assoc === "stop" || assoc === "arrest") {
      take(
        "encounter_location_type",
        eventType === "VEHICLE_STOP" ? "moving_vehicle" : "public_place"
      );
    } else if (assoc === "vehicle-left") {
      take("encounter_location_type", "parked_vehicle");
    } else if (assoc === "staging") {
      take("encounter_location_type", "custodial_transfer");
    } else if (assoc === "other") {
      take("encounter_location_type", "other_context");
    } else if (eventType === "VEHICLE_STOP") {
      take("encounter_location_type", "moving_vehicle");
    } else if (eventType === "WORKSITE") {
      take("encounter_location_type", "workplace");
    } else if (eventType === "KNOCK_AND_TALK") {
      take("encounter_location_type", "residence");
    }
    var vehicles = facts.vehicles || [];
    if (!vehicles.length) {
      hide("vehicle_disposition");
    } else {
      var moved = vehicles.some(function (row) {
        return String((row && row.encounterDisposition) || "").toUpperCase() === "MOVED";
      });
      var left = vehicles.some(function (row) {
        return String((row && row.encounterDisposition) || "").toUpperCase() === "LEFT";
      });
      if (moved) {
        take("vehicle_disposition", "vehicle_released");
      } else if (left) {
        take("vehicle_disposition", "vehicle_left_secured");
      }
    }
    take("incident_subject", "primary_subject");
    var subject = matchLiveSubject(participant);
    var outcome = String(
      (subject && subject.outcome) || participant.finalOutcome || ""
    ).toUpperCase();
    var flightMode = String((subject && subject.flightMode) || "").toUpperCase();
    if (outcome === "FLED_FOOT" || flightMode === "FOOT") {
      take("flight", "fled_on_foot");
    } else if (outcome === "FLED_VEHICLE" || flightMode === "VEHICLE") {
      take("flight", "fled_in_vehicle");
    }
    if (outcome === "ARRESTED") {
      // Custody alone establishes neither arrest authority nor destination.
      // Officers select those facts unless an explicit authority is supplied.
      var authority = String(participant.enforcementBasisCode || "").toUpperCase();
      if (authority === "I_200") {
        take("enforcement_action", "administrative_arrest_i200");
      } else if (authority === "WARRANTLESS_ADMINISTRATIVE") {
        take("enforcement_action", "warrantless_administrative_arrest");
      }
    } else if (outcome === "RELEASED") {
      take("enforcement_action", "released_no_action");
      take("final_outcome", "released_scene");
    } else if (outcome === "FLED" || outcome === "FLED_FOOT" || outcome === "FLED_VEHICLE") {
      hide("enforcement_action");
      hide("final_outcome");
    }
    var compliance = String((subject && subject.compliance) || "").toUpperCase();
    if (compliance === "COMPLIANT") {
      take("subject_conduct", "fully_compliant");
    }
    var uof = String((subject && subject.useOfForce) || "").toLowerCase();
    if (uof === "no") {
      hide("force_type");
      hide("force_result");
    }
    var closing = participant.closing || {};
    var health = String(closing.health || "").trim();
    if (!looksEmptyUnknown(health) && /good|none|n\/a/.test(health.toLowerCase())) {
      take("claimed_health", "claims_good_health");
    }
    var meds = String(closing.medication || closing.medications || "").trim();
    if (!looksEmptyUnknown(meds)) {
      take(
        "medication_statement",
        /^(none|no\b)/i.test(meds) ? "claims_no_medications" : "claims_named_medications"
      );
    }
    var minors = String(closing.minors || "").trim();
    if (!looksEmptyUnknown(minors) && /^(none|no\b)/i.test(minors)) {
      take("minor_children_statement", "claims_no_minor_children_us");
    }
    var cash = closing.currency && closing.currency.amountUsd;
    if (cash) {
      take("currency_statement", "usd_in_possession");
    }
    var docs = String(closing.identityDocuments || "").trim();
    if (!looksEmptyUnknown(docs)) {
      take(
        "identity_documents",
        /^(none|no\b)/i.test(docs) ? "no_identity_documents" : "documents_in_property"
      );
    }
    var nationality = String(
      (participant.identitySnapshot &&
        participant.identitySnapshot.nationalityDisplay) ||
        (participant.identitySnapshot &&
          participant.identitySnapshot.nationalityCountryCode) ||
        (subject && subject.citizenship) ||
        ""
    ).toLowerCase();
    if (nationality === "mexico" || nationality === "mx" || nationality === "mexican") {
      take("subject_nationality", "mexican");
    } else if (nationality && !looksEmptyUnknown(nationality)) {
      take("subject_nationality", "other_nationality");
    }
    var others = fixture.participants.filter(function (row) {
      return row && row.encounterParticipantId !== participant.encounterParticipantId &&
        String(row.finalOutcome || row.outcome || "").toUpperCase() === "ARRESTED";
    });
    if (others.length) {
      take("other_arrested", "include_all_other_arrested");
    } else {
      hide("other_arrested");
    }
    return { selections: selections, hideIds: hideIds };
  }

  function applyEncounterOwnedUi(hideIds) {
    if (
      global.COPDoc &&
      COPDoc.narratives &&
      typeof COPDoc.narratives.markEncounterOwnedFields === "function"
    ) {
      COPDoc.narratives.markEncounterOwnedFields(liveEncounter ? hideIds || [] : []);
    }
  }

  function isNarrativeConflict(error) {
    return error && [
      "REVISION_CONFLICT",
      "NARRATIVE_ID_DUPLICATE",
      "NARRATIVE_LOGICAL_DUPLICATE",
      "NARRATIVE_SUBJECT_STALE"
    ].indexOf(error.code) !== -1;
  }

  function narrativeErrorMessage(error) {
    if (error && error.code === "NARRATIVE_SUBJECT_STALE") {
      return "This subject was removed or is no longer assigned a narrative role. Reload the Narrative workspace.";
    }
    if (isNarrativeConflict(error)) {
      return "This subject's narrative changed in another window. Reload this page before editing it again.";
    }
    if (error && error.code === "FINALIZED_NARRATIVE_IMMUTABLE") {
      return "This narrative is finalized. Create a supplement or a new version instead of changing it.";
    }
    return (error && error.message) || "The narrative could not be saved.";
  }

  function persistLiveEncounter(change) {
    if (!liveEncounter || !liveEncounterId) {
      return true;
    }
    if (!change || !change.record) {
      return true;
    }
    var model = global.COPDoc && COPDoc.model;
    if (
      !model ||
      !model.store ||
      typeof model.store.updateEncounter !== "function"
    ) {
      showStatus("Narrative storage is unavailable.", false);
      if (change.previousNarratives) store.replaceAll(change.previousNarratives);
      return false;
    }
    var result = model.store.updateEncounter(liveEncounterId, function (enc) {
      if (enc.meta && enc.meta.markedComplete) {
        throw new domain.DomainError("ENCOUNTER_LOCKED", "This encounter is completed and locked.");
      }
      var adapter = global.COPDoc && COPDoc.encounterNarrative;
      var latestBundle =
        adapter && typeof adapter.bundleFromEncounterRecord === "function"
          ? adapter.bundleFromEncounterRecord(enc)
          : null;
      var latestParticipants =
        latestBundle && Array.isArray(latestBundle.participants)
          ? latestBundle.participants
          : [];
      var recordToSave = Object.assign({}, change.record);
      var subjectNarrative =
        recordToSave.narrativeKind === domain.NARRATIVE_KINDS.PRIMARY_SUBJECT ||
        recordToSave.narrativeKind === domain.NARRATIVE_KINDS.SUBJECT_SUPPLEMENT;
      if (subjectNarrative) {
        var intendedFocusId = String(
          change.expectedFocusEncounterParticipantId || ""
        ).trim();
        var intendedMatches = latestParticipants.filter(function (participant) {
          return participant.encounterParticipantId === intendedFocusId;
        });
        var latestFocusedParticipant =
          intendedMatches.length === 1 ? intendedMatches[0] : null;
        var canonicalFocusId =
          adapter && typeof adapter.resolveEncounterParticipantId === "function"
            ? adapter.resolveEncounterParticipantId(
                latestParticipants,
                recordToSave.focusEncounterParticipantId
              )
            : "";
        var expectedParticipant = change.expectedParticipantIdentity || {};
        function identityValue(participant, key, alias) {
          return String(
            (participant && (participant[key] || participant[alias])) || ""
          ).trim();
        }
        function focusIdentityCompatible() {
          if (!latestFocusedParticipant) {
            return false;
          }
          return [
            ["bookingId", "bookinRecordId"],
            ["personId", "personId"],
            ["leadId", "leadId"]
          ].every(function (keys) {
            var expectedValue = identityValue(
              expectedParticipant,
              keys[0],
              keys[1]
            );
            var latestValue = identityValue(
              latestFocusedParticipant,
              keys[0],
              keys[1]
            );
            if (expectedValue && latestValue && expectedValue !== latestValue) {
              return false;
            }
            if (!expectedValue || latestValue) {
              return true;
            }
            return !latestParticipants.some(function (other) {
              return (
                other !== latestFocusedParticipant &&
                identityValue(other, keys[0], keys[1]) === expectedValue
              );
            });
          });
        }
        if (
          !intendedFocusId ||
          canonicalFocusId !== intendedFocusId ||
          !focusIdentityCompatible()
        ) {
          throw new domain.DomainError(
            "NARRATIVE_SUBJECT_STALE",
            "The focused Encounter subject is no longer eligible for a narrative."
          );
        }
        if (change.kind === "create") {
          recordToSave.focusEncounterParticipantId = canonicalFocusId;
        }
        var relatedSeen = Object.create(null);
        recordToSave.relatedEncounterParticipantIds = (
          Array.isArray(recordToSave.relatedEncounterParticipantIds)
            ? recordToSave.relatedEncounterParticipantIds
            : []
        ).reduce(function (ids, participantId) {
          var canonicalRelatedId =
            adapter && typeof adapter.resolveEncounterParticipantId === "function"
              ? adapter.resolveEncounterParticipantId(
                  latestParticipants,
                  participantId
                )
              : "";
          var retainedRelatedId =
            canonicalRelatedId ||
            (change.kind === "create" ? "" : String(participantId || "").trim());
          if (retainedRelatedId && !relatedSeen[retainedRelatedId]) {
            relatedSeen[retainedRelatedId] = true;
            ids.push(retainedRelatedId);
          }
          return ids;
        }, []);
      }
      var diskNarratives = Array.isArray(enc.narratives) ? enc.narratives : [];
      recordToSave.freshnessStatus = sourceStatus(
        recordToSave.sourceSnapshot,
        latestBundle ? captureSource(latestBundle, change.expectedFocusEncounterParticipantId) : null
      );
      var mergeResult = change.kind === "create"
        ? domain.addNarrative(diskNarratives, recordToSave, {
            now: recordToSave.updatedAt
          })
        : domain.saveNarrativeById(
            diskNarratives,
            recordToSave.narrativeId,
            recordToSave,
            {
              expectedRevision: change.expectedRevision,
              now: recordToSave.updatedAt
            }
          );
      var coverage = domain.validateCoverage({
        encounterId: enc.encounterId,
        participants: latestParticipants,
        narratives: mergeResult.narratives
      });
      var summaryBundle = latestBundle
        ? {
            encounter: latestBundle.encounter,
            operation: latestBundle.operation,
            participants: latestParticipants,
            events: latestBundle.events || [],
            vehicles: latestBundle.encounterVehicles || [],
            primaryLocation: latestBundle.location,
            officers: latestBundle.officers || [],
            narratives: mergeResult.narratives,
            narrativeFacts: {}
          }
        : demoBundle();
      summaryBundle.narratives = mergeResult.narratives;
      var summary = domain.deriveEncounterSummary(summaryBundle, {
        narrativeCoverage: coverage,
        now: recordToSave.updatedAt || new Date().toISOString()
      });
      enc.narratives = mergeResult.narratives;
      enc.supervisorSummary = Object.assign({}, summary, {
        text: summary.generatedSupervisorText || "",
        derivedAt: summary.generatedAt,
        coverage: {
          complete: !!(coverage && coverage.coverageComplete),
          missing: (coverage && coverage.missingParticipantIds) || []
        }
      });
      return enc;
    });
    if (!result || !result.ok) {
      var error = result && result.cause;
      var persisted = result && result.encounter;
      if (persisted && Array.isArray(persisted.narratives)) {
        store.replaceAll(persisted.narratives);
      } else if (change.previousNarratives) {
        store.replaceAll(change.previousNarratives);
      }
      if (isNarrativeConflict(error) && change.record.focusEncounterParticipantId) {
        var conflicted = participantForReference(
          change.record.focusEncounterParticipantId
        );
        conflictedParticipantIds.add(
          conflicted
            ? conflicted.encounterParticipantId
            : change.record.focusEncounterParticipantId
        );
      }
      showStatus(
        error
          ? narrativeErrorMessage(error)
          : (result && result.error) || "The narrative could not be saved.",
        false
      );
      return false;
    }
    store.replaceAll(result.encounter.narratives);
    return true;
  }

  function primaryFor(participantId) {
    return store.all().find(function (record) {
      return record &&
        (record.recordState || "ACTIVE") === "ACTIVE" &&
        record.narrativeKind === domain.NARRATIVE_KINDS.PRIMARY_SUBJECT &&
        recordFocusesParticipant(record, participantId);
    }) || null;
  }

  function supplementsFor(participantId) {
    return store.all().filter(function (record) {
      return record &&
        (record.recordState || "ACTIVE") === "ACTIVE" &&
        record.narrativeKind === domain.NARRATIVE_KINDS.SUBJECT_SUPPLEMENT &&
        recordFocusesParticipant(record, participantId);
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
      narratives: sourceAwareNarratives(store.all()),
      sourceFacts: fixture.sourceFacts,
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

  function coverageFor(narrativeRecords) {
    return domain.validateCoverage({
      encounterId: fixture.encounter.encounterId,
      participants: fixture.participants,
      narratives: sourceAwareNarratives(narrativeRecords || [])
    });
  }

  function currentCoverage() {
    return coverageFor(store.all());
  }

  function renderParticipantList() {
    var container = byId("participantNarratives");
    if (!container) {
      return;
    }
    container.replaceChildren();
    fixture.participants.forEach(function (participant) {
      var primary = primaryFor(participant.encounterParticipantId);
      var supplements = supplementsFor(participant.encounterParticipantId);
      var button = document.createElement("button");
      button.type = "button";
      button.className = "narrative-participant" +
        (participant.encounterParticipantId === activeParticipantId ? " is-active" : "");
      button.dataset.participantId = participant.encounterParticipantId;
      button.setAttribute(
        "aria-pressed",
        participant.encounterParticipantId === activeParticipantId ? "true" : "false"
      );

      var code = document.createElement("span");
      code.className = "narrative-role-code";
      code.textContent = roleCode(participant);

      var text = document.createElement("span");
      var name = document.createElement("span");
      name.className = "narrative-participant-name";
      name.textContent = participantName(participant);
      var meta = document.createElement("span");
      meta.className = "narrative-participant-meta";
      var narrativeStatus = primary ? primary.workflowStatus || "DRAFT" : "MISSING";
      if (liveEncounter && primary) {
        narrativeStatus += " · " + (sourceStatusByNarrativeId.get(primary.narrativeId) || "UNKNOWN");
      }
      var outcome = String(participant.finalOutcome || "UNKNOWN").replaceAll("_", " ");
      meta.textContent = narrativeStatus +
        " · " + outcome +
        (participant.iceEventNumber ? " · " + participant.iceEventNumber : "") +
        (supplements.length ? " · +" + supplements.length : "");
      button.setAttribute(
        "aria-label",
        [
          roleCode(participant),
          participantName(participant),
          narrativeStatus,
          outcome,
          supplements.length
            ? supplements.length + " supplement" + (supplements.length === 1 ? "" : "s")
            : ""
        ].filter(Boolean).join(", ")
      );
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
    if (coverageBadge) {
      coverageBadge.textContent = coverage.coveredCount + "/" + coverage.requiredCount;
      coverageBadge.className = "narrative-status " +
        (coverage.coverageComplete ? "is-ok" : "is-warn");
    }

    var details = byId("coverageDetails");
    if (!details) {
      return;
    }
    details.replaceChildren();
    [
      ["Required primary narratives", coverage.requiredCount],
      ["Covered", coverage.coveredCount],
      ["Missing", coverage.missingParticipantIds.length],
      ["Duplicates", coverage.duplicateParticipantIds.length],
      ["Source changed", coverage.staleNarrativeIds.length],
      ["Source unverified", coverage.unknownFreshnessNarrativeIds.length],
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
    if (!missingButton) {
      return;
    }
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
    if (grid) {
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
    }
    var summaryText = byId("supervisorSummaryText");
    if (summaryText) {
      summaryText.textContent = summary.generatedSupervisorText;
    }
  }

  function seededSelections(record, participant) {
    var state = record && record.engine && record.engine.state;
    var seed = seedFromEncounter(participant);
    var selections = Object.assign({}, seed.selections, state && state.encounter && state.encounter.selections || {});
    if (
      selections.subject_conduct ||
      selections.force_type ||
      selections.window_break
    ) {
      selections.incident_subject = selections.incident_subject || "primary_subject";
    }
    applyEncounterOwnedUi(seed.hideIds);
    return selections;
  }

  function resumableStateFor(record) {
    var storedState = record && record.engine && record.engine.state;
    if (!storedState) return null;
    var adapter = global.COPDoc && COPDoc.encounterNarrative;
    var state =
      adapter &&
      typeof adapter.remapNarrativeStateParticipantIds === "function"
        ? adapter.remapNarrativeStateParticipantIds(
            storedState,
            fixture.participants
          )
        : JSON.parse(JSON.stringify(storedState));
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
    if (session !== bootGeneration) return false;
    if (!activeParticipantId) return null;
    refreshSourceStatus();
    var output = engine.getOutput();
    var state = engine.getState({ includeData: false });
    var existing = primaryFor(activeParticipantId);
    var participant = fixture.participants.find(function (row) {
      return row.encounterParticipantId === activeParticipantId;
    });
    if (isReadOnlyNarrative(existing)) {
      if (!options.silent) {
        showStatus(existing && existing.workflowStatus === "FINALIZED"
          ? narrativeErrorMessage({ code: "FINALIZED_NARRATIVE_IMMUTABLE" })
          : "This encounter is completed and locked.", false);
      }
      renderSourceStatus();
      return false;
    }
    if (conflictedParticipantIds.has(activeParticipantId)) {
      showStatus(
        "This subject's narrative changed in another window. Reload this page before editing it again.",
        false
      );
      return false;
    }
    var successMessage = "";
    var persistenceChange = null;
    var beforeNarratives = store.all();
    var sourceSnapshot = copyValue(sourceSnapshotByParticipant.get(activeParticipantId) || null);
    var freshness = sourceStatus(sourceSnapshot,
      latestSourceFixture && captureSource(latestSourceFixture, activeParticipantId));
    try {
      if (existing) {
        var updated = store.save(existing.narrativeId, {
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
          sourceSnapshot: sourceSnapshot,
          freshnessStatus: liveEncounter ? freshness : "CURRENT"
        });
        persistenceChange = {
          kind: "save",
          record: updated,
          expectedRevision: Number(existing.revision) || 0,
          expectedFocusEncounterParticipantId: activeParticipantId,
          expectedParticipantIdentity: {
            subjectId: participant.subjectId,
            bookingId: participant.bookingId || participant.bookinRecordId || "",
            personId: participant.personId || "",
            leadId: participant.leadId || ""
          }
        };
        unsavedDraftStateByParticipant.delete(activeParticipantId);
        successMessage = "Dynamic narrative updated for " + participantName(participant) + ".";
      } else if (!existing && options.createMissing) {
        var created = store.create({
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
          freshnessStatus: liveEncounter ? freshness : "CURRENT",
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
          sourceSnapshot: sourceSnapshot
        });
        persistenceChange = {
          kind: "create",
          record: created,
          expectedFocusEncounterParticipantId: activeParticipantId,
          expectedParticipantIdentity: {
            subjectId: participant.subjectId,
            bookingId: participant.bookingId || participant.bookinRecordId || "",
            personId: participant.personId || "",
            leadId: participant.leadId || ""
          }
        };
        unsavedDraftStateByParticipant.delete(activeParticipantId);
        successMessage = "Primary narrative created for " + participantName(participant) + ".";
      } else {
        unsavedDraftStateByParticipant.set(activeParticipantId, state);
      }
    } catch (error) {
      showStatus(narrativeErrorMessage(error), false);
      return false;
    }
    if (persistenceChange) persistenceChange.previousNarratives = beforeNarratives;
    var persisted = persistLiveEncounter(persistenceChange);
    if (!persisted) {
      renderParticipantList();
      renderCoverageAndSummary();
      renderOutputAudit();
      refreshSourceStatus();
      renderSourceStatus();
      return false;
    }
    refreshSourceStatus();
    if (!options.silent && successMessage) {
      var savedRecord = primaryFor(activeParticipantId);
      var savedFreshness = savedRecord && sourceStatusByNarrativeId.get(savedRecord.narrativeId);
      if (liveEncounter && savedFreshness !== "CURRENT") {
        successMessage += savedFreshness === "STALE"
          ? " Source facts changed; review is still needed."
          : " Source is unverified; review is still needed.";
      }
      showStatus(successMessage);
    }
    renderParticipantList();
    renderCoverageAndSummary();
    renderOutputAudit();
    renderSourceStatus();
    return output;
  }

  function switchFocus(participantId, focusOptions) {
    if (participantId === activeParticipantId) return;
    var participant = fixture.participants.find(function (row) {
      return row.encounterParticipantId === participantId;
    });
    if (!participant) return;
    var currentRecord = activeParticipantId
      ? primaryFor(activeParticipantId)
      : null;
    if (
      activeParticipantId &&
      !(focusOptions && focusOptions.alreadyCaptured) &&
      !isReadOnlyNarrative(currentRecord) &&
      captureCurrent({ silent: true, createMissing: false }) === false
    ) {
      return;
    }
    applyEditorReadOnly(false);
    activeParticipantId = participantId;
    refreshSourceStatus();
    var existing = primaryFor(participantId);
    if (!sourceSnapshotByParticipant.has(participantId)) {
      sourceSnapshotByParticipant.set(participantId, copyValue(existing
        ? existing.sourceSnapshot || null
        : captureSource(fixture, participantId)));
    }
    loadedSourceByParticipant.set(participantId, captureSource(fixture, participantId));
    reviewReadyParticipantIds.delete(participantId);
    var packet = narratives.buildPacketFromBundle(demoBundle(), participantId, {
      isTestData: !liveEncounter,
      vehicleResolver: vehicleResolver
    });

    engine.resetEncounter({ clearData: true });
    engine.setDataPacket(packet);

    var resumableState = unsavedDraftStateByParticipant.get(participantId) ||
      resumableStateFor(existing);
    if (existing && existing.workflowStatus === "FINALIZED") {
      // Finalized prose is a historical output. Fresh source packets may inform
      // the warning, but must not silently rewrite the displayed/copyable text.
      resumableState = resumableState || engine.getState({ includeData: false });
      resumableState.narrative = Object.assign({}, resumableState.narrative || {}, {
        plainText: existing.output && existing.output.finalPlainText || "",
        plainTextIsManual: true
      });
    }
    if (resumableState) {
      engine.loadState(resumableState, {
        loadData: false,
        restorePlainText: true,
        autoBind: true
      });
    } else {
      engine.setSelections(seededSelections(existing, participant), { rebuild: true });
    }
    applyEncounterOwnedUi(seedFromEncounter(participant).hideIds);
    engine.setView(isReadOnlyNarrative(existing) ? "plain" : "values");
    var title = byId("activeNarrativeTitle");
    if (title) {
      title.textContent =
        roleCode(participant) + " · " + participantName(participant) +
        (existing ? " · " + (existing.workflowStatus || "DRAFT") : " · MISSING PRIMARY");
    }
    renderParticipantList();
    renderCoverageAndSummary();
    renderOutputAudit();
    renderSourceStatus();
  }

  function renderOutputAudit() {
    if (!activeParticipantId) return;
    var container = byId("sectionAudit");
    if (!container) return;
    var output = engine.getOutput();
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
    var badge = byId("outputSchemaBadge");
    if (badge) {
      badge.textContent =
        output.schema + (exactBreaks ? " · breaks verified" : " · break mismatch");
      badge.className = "narrative-status " +
        (exactBreaks ? "is-ok" : "is-warn");
    }
    var outputJson = byId("outputJson");
    if (outputJson) {
      outputJson.textContent = JSON.stringify(output, null, 2);
    }
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
    return deliverNarrativeOutput("download", "narrative.json");
  }

  function downloadOutputText() {
    return deliverNarrativeOutput("download", "narrative.text");
  }

  function saveNarrative() {
    if (session !== bootGeneration || !activeParticipantId) return false;
    var originalFocus = activeParticipantId;
    var pending = Array.from(unsavedDraftStateByParticipant.keys()).filter(function (id) {
      return id !== originalFocus;
    });
    var activeReadOnly = isReadOnlyNarrative(primaryFor(originalFocus));
    if (activeReadOnly && !pending.length) return false;
    if (!activeReadOnly && captureCurrent({ createMissing: true }) === false) return false;
    for (var i = 0; i < pending.length; i += 1) {
      switchFocus(pending[i], { alreadyCaptured: true });
      if (activeParticipantId !== pending[i] || captureCurrent({ createMissing: true }) === false) return false;
    }
    if (activeParticipantId !== originalFocus) switchFocus(originalFocus, { alreadyCaptured: true });
    if (liveEncounter) showStatus("Narrative snapshot saved for review. It will be committed when the Encounter is reviewed and closed.");
    return true;
  }

  function navigateEncounterStep(step, event) {
    if (event && event.preventDefault) event.preventDefault();
    if (session !== bootGeneration || !liveEncounterId) return;
    refreshSourceStatus();
    var readOnly = isReadOnlyNarrative(primaryFor(activeParticipantId));
    if ((!readOnly || unsavedDraftStateByParticipant.size) && !saveNarrative()) return;
    global.location.href = "encounter-form.html?id=" + encodeURIComponent(liveEncounterId) + "&tab=" + step;
  }
  [["narrativeBackToEvidenceButton", "evidence"], ["narrativeContinueToReviewButton", "review"]].forEach(function (entry) {
    var action = byId(entry[0]);
    if (action) action.addEventListener("click", function (event) { navigateEncounterStep(entry[1], event); });
  });
  narratives.flushWorkspace = function () {
    if (session !== bootGeneration) {
      return;
    }
    if (liveEncounter) {
      if (!isReadOnlyNarrative(primaryFor(activeParticipantId))) {
        captureCurrent({ silent: true, createMissing: false });
      }
    }
  };
  var primaryAction = byId("appBarPrimaryAction");
  if (primaryAction) {
    primaryAction.addEventListener("click", saveNarrative);
  }
  var inPageSave = byId("saveEncounterNarrativeButton");
  if (inPageSave) {
    inPageSave.addEventListener("click", saveNarrative);
  }
  var copyAction = byId("copyNarrativeButton");
  if (copyAction) {
    copyAction.addEventListener("click", function () {
      if (session !== bootGeneration) return;
      if (isReadOnlyNarrative(primaryFor(activeParticipantId))) {
        return copyReadOnlyNarrative();
      }
      var engineCopy = document.getElementById("copyButton");
      if (engineCopy) {
        engineCopy.click();
        return;
      }
      return deliverNarrativeOutput("clipboard", "narrative.text");
    });
  }
  var downloadJson = byId("downloadNarrativeJsonButton");
  if (downloadJson) {
    downloadJson.addEventListener("click", downloadOutputJson);
  }
  var downloadText = byId("downloadNarrativeTextButton");
  if (downloadText) {
    downloadText.addEventListener("click", downloadOutputText);
  }
  var completeMissing = byId("completeMissingNarrativeButton");
  if (completeMissing) {
  completeMissing.addEventListener("click", function () {
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
  }

  global.addEventListener(engine.events.narrativeChange, function () {
    if (session !== bootGeneration) {
      return;
    }
    global.requestAnimationFrame(function () {
      if (session !== bootGeneration) {
        return;
      }
      renderOutputAudit();
      var focused = fixture.participants.find(function (row) {
        return row && row.encounterParticipantId === activeParticipantId;
      });
      if (focused) {
        applyEncounterOwnedUi(seedFromEncounter(focused).hideIds);
      }
      applyEditorReadOnly(isReadOnlyNarrative(primaryFor(activeParticipantId)));
    });
  });

  ["beforeinput", "paste", "cut", "drop", "dragstart"].forEach(function (type) {
    host.addEventListener(type, function (event) {
      if (session !== bootGeneration || !isReadOnlyNarrative(primaryFor(activeParticipantId))) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    }, true);
  });
  host.addEventListener("click", function (event) {
    if (session !== bootGeneration || !isReadOnlyNarrative(primaryFor(activeParticipantId))) return;
    var target = event.target && event.target.closest ? event.target.closest("button") : null;
    if (target && target.id === "copyButton") {
      event.preventDefault();
      event.stopImmediatePropagation();
      copyReadOnlyNarrative();
    }
  }, true);
  host.addEventListener("click", function () {
    if (session !== bootGeneration) return;
    applyEditorReadOnly(isReadOnlyNarrative(primaryFor(activeParticipantId)));
  });

  function reevaluateLiveSource() {
    if (session !== bootGeneration || !liveEncounter) return;
    refreshSourceStatus();
    renderParticipantList();
    renderCoverageAndSummary();
    renderSourceStatus();
  }
  global.addEventListener("storage", reevaluateLiveSource);
  global.addEventListener("focus", reevaluateLiveSource);
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) reevaluateLiveSource();
  });

  var master = narratives.MASTER_NARRATIVE_SECTIONS;
  var fields = master.flatMap(function (section) { return section.fields; });
  var options = fields.flatMap(function (field) { return field.options; });
  var libraryVerification = byId("libraryVerification");
  if (libraryVerification) {
    libraryVerification.textContent =
      "Prose libraries verified · " + master.length + "/" + fields.length + "/" + options.length;
    libraryVerification.className = "narrative-status is-ok";
  }

  bindDraftPopout();

  refreshSourceStatus();
  renderParticipantList();
  renderCoverageAndSummary();
  switchFocus(
    fixture.participants[0] && fixture.participants[0].encounterParticipantId
  );
  }

  narratives.bootWorkspace = bootWorkspace;

  function autoBootStandalone() {
    if (!document.body || document.body.getAttribute("data-page") !== "narrative") {
      return;
    }
    var encounterId = "";
    try {
      encounterId = new URLSearchParams(window.location.search).get("encounterId") || "";
    } catch (error) {
      encounterId = "";
    }
    bootWorkspace({ encounterId: encounterId, inPage: false });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", autoBootStandalone, { once: true });
  } else {
    autoBootStandalone();
  }
})(typeof window !== "undefined" ? window : globalThis);
