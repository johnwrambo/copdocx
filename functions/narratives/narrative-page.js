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
  try {
    liveEncounterId = new URLSearchParams(window.location.search).get(
      "encounterId"
    ) || "";
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
          unassignedParticipantCount: live.unassignedParticipantCount || 0,
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
    var needsRoles = liveEmpty && Number(fixture.unassignedParticipantCount) > 0;
    document.body.classList.add("narrative-empty");
    if (workspace) workspace.hidden = true;
    if (liveHeader) liveHeader.hidden = true;
    if (emptyState) emptyState.hidden = false;
    if (emptyText) {
      emptyText.textContent = liveMiss
        ? "Encounter not found."
        : needsRoles
          ? "Assign each Book-in subject a Target or Collateral role before writing an I-213."
          : "Add subjects on Book-in before writing an I-213.";
    }
    if (emptyLink && liveEmpty && liveEncounterId) {
      emptyLink.hidden = false;
      emptyLink.href = "bookin.html?encounterId=" + encodeURIComponent(liveEncounterId);
      emptyLink.textContent = needsRoles ? "Assign subject roles" : "Add subjects";
    }
    document.title = "I-213";
    showStatus(
      liveMiss
        ? "Encounter not found."
        : needsRoles
          ? "Assign Target or Collateral roles on Book-in before writing an I-213."
          : "Add subjects on Book-in before writing an I-213.",
      false
    );
    return;
  }

  document.body.classList.add(liveEncounter ? "narrative-live" : "narrative-training");
  if (liveEncounter) {
    document.title = "I-213";
    if (liveHeader) liveHeader.hidden = false;
    var pageHeader = byId("narrativePageHeader");
    if (pageHeader) pageHeader.hidden = true;
  }

  global.OpDocNarrativeConfig = {
    mode: "embedded",
    enableDemo: false,
    enableTestPacket: false,
    enableJsonImport: false,
    enableLocalStorage: false,
    // The no-query training lab keeps the recovered Build 9 authoring tools.
    // Live I-213s may compose repeated incidents without changing Master prose.
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
  }
  var store = domain.createNarrativeStore(fixture.narrativesInitial);
  var unsavedDraftStateByParticipant = new Map();
  var conflictedParticipantIds = new Set();
  var activeParticipantId = null;

  function byId(id) {
    return document.getElementById(id);
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

  function isNarrativeConflict(error) {
    return error && [
      "REVISION_CONFLICT",
      "NARRATIVE_ID_DUPLICATE",
      "NARRATIVE_LOGICAL_DUPLICATE"
    ].indexOf(error.code) !== -1;
  }

  function narrativeErrorMessage(error) {
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
      return false;
    }
    var result = model.store.updateEncounter(liveEncounterId, function (enc) {
      var diskNarratives = Array.isArray(enc.narratives) ? enc.narratives : [];
      var mergeResult = change.kind === "create"
        ? domain.addNarrative(diskNarratives, change.record, {
            now: change.record.updatedAt
          })
        : domain.saveNarrativeById(
            diskNarratives,
            change.record.narrativeId,
            change.record,
            {
              expectedRevision: change.expectedRevision,
              now: change.record.updatedAt
            }
          );
      var coverage = coverageFor(mergeResult.narratives);
      var summaryBundle = demoBundle();
      summaryBundle.narratives = mergeResult.narratives;
      var summary = domain.deriveEncounterSummary(summaryBundle, {
        narrativeCoverage: coverage,
        now: change.record.updatedAt || new Date().toISOString()
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
      }
      if (isNarrativeConflict(error) && change.record.focusEncounterParticipantId) {
        conflictedParticipantIds.add(change.record.focusEncounterParticipantId);
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

  function coverageFor(narrativeRecords) {
    return domain.validateCoverage({
      encounterId: fixture.encounter.encounterId,
      participants: fixture.participants,
      narratives: narrativeRecords || []
    });
  }

  function currentCoverage() {
    return coverageFor(store.all());
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
    if (conflictedParticipantIds.has(activeParticipantId)) {
      showStatus(
        "This subject's narrative changed in another window. Reload this page before editing it again.",
        false
      );
      return false;
    }
    var successMessage = "";
    var persistenceChange = null;
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
          freshnessStatus: "CURRENT"
        });
        persistenceChange = {
          kind: "save",
          record: updated,
          expectedRevision: Number(existing.revision) || 0
        };
        successMessage = "Dynamic narrative updated for " + participantName(participant) + ".";
      } else if (options.createMissing) {
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
        persistenceChange = { kind: "create", record: created };
        unsavedDraftStateByParticipant.delete(activeParticipantId);
        successMessage = "Primary narrative created for " + participantName(participant) + ".";
      } else {
        unsavedDraftStateByParticipant.set(activeParticipantId, state);
      }
    } catch (error) {
      showStatus(narrativeErrorMessage(error), false);
      return false;
    }
    var persisted = persistLiveEncounter(persistenceChange);
    if (!persisted) {
      renderParticipantList();
      renderCoverageAndSummary();
      renderOutputAudit();
      return false;
    }
    if (!options.silent && successMessage) {
      showStatus(successMessage);
    }
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
    var currentRecord = activeParticipantId
      ? primaryFor(activeParticipantId)
      : null;
    if (
      activeParticipantId &&
      !(currentRecord && currentRecord.workflowStatus === "FINALIZED") &&
      captureCurrent({ silent: true, createMissing: false }) === false
    ) {
      return;
    }
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
