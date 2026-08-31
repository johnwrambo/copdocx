/**
 * COPDoc Narrative Build 9 training-page controller.
 *
 * This page exercises the production narrative boundary with deterministic,
 * synthetic Encounter data. It never mutates canonical source facts.
 */
(function (global) {
  "use strict";

  var fixture = global.COPDocNarrativeDemoFixture;
  try {
    var liveEncounterId = new URLSearchParams(window.location.search).get(
      "encounterId"
    );
    var live =
      liveEncounterId &&
      global.COPDoc &&
      COPDoc.encounterNarrative &&
      typeof COPDoc.encounterNarrative.bundleFromEncounter === "function"
        ? COPDoc.encounterNarrative.bundleFromEncounter(liveEncounterId)
        : null;
    if (live && live.encounter) {
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
    }
  } catch (error) {
    console.warn(error);
  }
  var narratives = global.COPDoc && global.COPDoc.narratives;
  var domain = narratives && narratives.build9;
  if (!fixture || !narratives || !domain) {
    throw new Error("Narrative Build 9 dependencies did not load.");
  }

  function initNarrativePage() {
  var host = document.getElementById("narrativeEngineHost");
  if (!host) {
    throw new Error("Narrative page host is missing.");
  }
  global.OpDocNarrativeConfig = {
    mode: "embedded",
    enableDemo: false,
    enableTestPacket: false,
    enableJsonImport: false,
    enableLocalStorage: false,
    canEditTemplates: true,
    canEditSourceValues: false,
    requireResolvedBeforeCopy: false,
    allowUnknownFields: false
  };
  host.innerHTML = narratives.ENGINE_MARKUP;
  var engine = global.__opdocNarrativeBootstrap();
  var store = domain.createNarrativeStore(fixture.narrativesInitial);
  var unsavedDraftStateByParticipant = new Map();
  var activeParticipantId = null;
  var syntheticCounter = 1;

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
      narrativeFacts: {
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
    missingButton.textContent = coverage.missingParticipantIds.length
      ? "Create missing T3 narrative"
      : "Primary coverage complete";

    var summary = domain.deriveEncounterSummary(demoBundle(), {
      narrativeCoverage: coverage,
      now: "2026-08-09T19:10:00.000Z"
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

  function seededSelections(record) {
    var state = record && record.engine && record.engine.state;
    var selections = Object.assign({}, state && state.encounter && state.encounter.selections || {});
    if (
      selections.subject_conduct ||
      selections.force_type ||
      selections.window_break
    ) {
      selections.incident_subject = selections.incident_subject || "primary_subject";
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
        narrativeId: "nar_demo_" + activeParticipantId + "_primary",
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
        validationSnapshot: output.validation
      });
      unsavedDraftStateByParticipant.delete(activeParticipantId);
      if (!options.silent) showStatus("Primary narrative created for " + participantName(participant) + ".");
    } else {
      unsavedDraftStateByParticipant.set(activeParticipantId, state);
    }
    renderParticipantList();
    renderCoverageAndSummary();
    renderOutputAudit();
    return output;
  }

  function switchFocus(participantId) {
    if (participantId === activeParticipantId) return;
    if (activeParticipantId) captureCurrent({ silent: true, createMissing: false });
    activeParticipantId = participantId;
    var participant = fixture.participants.find(function (row) {
      return row.encounterParticipantId === participantId;
    });
    var existing = primaryFor(participantId);
    var packet = narratives.buildPacketFromBundle(demoBundle(), participantId, {
      isTestData: true,
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
      engine.setSelections(seededSelections(existing), { rebuild: true });
    }
    engine.setView("values");
    byId("activeNarrativeTitle").textContent =
      roleCode(participant) + " · " + participantName(participant) +
      (existing ? " · " + (existing.workflowStatus || "DRAFT") : " · MISSING PRIMARY");
    renderParticipantList();
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

  byId("appBarPrimaryAction").addEventListener("click", function () {
    captureCurrent({ createMissing: true });
  });
  byId("inspectOutputButton").addEventListener("click", function () {
    renderOutputAudit();
    byId("sectionAudit").scrollIntoView({ behavior: "smooth", block: "start" });
  });
  byId("downloadNarrativeJsonButton").addEventListener("click", downloadOutputJson);
  byId("downloadNarrativeTextButton").addEventListener("click", downloadOutputText);
  byId("completeMissingNarrativeButton").addEventListener("click", function () {
    var coverage = currentCoverage();
    var participantId = coverage.missingParticipantIds[0];
    if (!participantId) return;
    if (participantId === activeParticipantId) {
      captureCurrent({ createMissing: true });
    } else {
      if (typeof fixture.makeMissingPrimaryNarrative === "function") {
        store.create(fixture.makeMissingPrimaryNarrative());
      }
      renderParticipantList();
      renderCoverageAndSummary();
      showStatus("Created the missing T3 primary narrative. Coverage is now complete.");
    }
  });
  byId("addSupplementButton").addEventListener("click", function () {
    if (!activeParticipantId) return;
    var participant = fixture.participants.find(function (row) {
      return row.encounterParticipantId === activeParticipantId;
    });
    var id = "nar_demo_supplement_" + syntheticCounter++;
    store.addAdditional({
      narrativeId: id,
      encounterId: fixture.encounter.encounterId,
      focusEncounterParticipantId: activeParticipantId,
      title: participantName(participant) + " — Additional narrative",
      output: {
        sections: [{
          sectionId: "supplement",
          sequence: 1,
          title: "Supplement",
          sectionType: "MANUAL_SUPPLEMENT",
          manualTextOverride: "Synthetic additional narrative created inside the encounter demonstration."
        }],
        plainTextIsManual: true,
        finalPlainText: "Synthetic additional narrative created inside the encounter demonstration."
      }
    });
    renderParticipantList();
    renderCoverageAndSummary();
    showStatus("Additional subject narrative added to this training session.");
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
  switchFocus("ep_demo_t1");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initNarrativePage, { once: true });
  } else {
    initNarrativePage();
  }
})(typeof window !== "undefined" ? window : globalThis);
