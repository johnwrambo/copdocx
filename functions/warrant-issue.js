/**
 * I-200 / I-205 issuance forms. Prefill from a committed lead, fill the
 * blank PDF without flattening, download (and optionally write a warrants
 * folder), then append person.warrants and commit the lead.
 */
(function () {
  "use strict";

  var memoryDirectoryHandle = null;
  var activeIssue = null;
  var committedIssue = null;

  function byId(id) {
    return document.getElementById(id);
  }

  function pageKey() {
    return document.body.getAttribute("data-page") || "";
  }

  function formType() {
    return document.body.getAttribute("data-form-type") || "";
  }

  function queryId() {
    if (window.COPDoc && COPDoc.chrome && COPDoc.chrome.queryId) {
      return COPDoc.chrome.queryId();
    }
    try {
      return new URLSearchParams(window.location.search).get("id") || "";
    } catch (error) {
      return "";
    }
  }

  function model() {
    return window.COPDoc && COPDoc.model;
  }

  function pdfApi() {
    return window.COPDoc && COPDoc.pdf;
  }

  function setStatus(message, ok) {
    if (window.COPDoc && COPDoc.setAppBarStatus) {
      COPDoc.setAppBarStatus(message, ok ? { ok: true } : undefined);
    }
  }

  function hideActions(hide) {
    ["appBarPrimaryAction", "downloadWarrantPdfButton"].forEach(function (id) {
      var el = byId(id);
      if (el) {
        el.hidden = hide;
      }
    });
  }

  function preferences() { return COPDoc.repositories.preferences; }

  function loadSettings() {
    try { return preferences().readSettings(); }
    catch (error) { return {}; }
  }

  function saveSettings(partial) {
    try { preferences().patchSettings(partial || {}); }
    catch (error) { /* Optional destination preferences must not block warrant issuance. */ }
  }

  function isCommitted(row) {
    var m = model();
    if (m && typeof m.isCommitted === "function") {
      return m.isCommitted(row);
    }
    return !row || !row.meta || row.meta.status !== "draft";
  }

  function committedOfficers() {
    try {
      var parsed = COPDoc.repositories.admin.readSnapshot();
      var officers = parsed.officers || [];
      return officers.filter(function (row) {
        return row && !row.junked && isCommitted(row);
      });
    } catch (error) {
      return [];
    }
  }

  function officerLabel(officer) {
    if (!officer) {
      return "";
    }
    var first = [officer.firstName, officer.middleName].filter(Boolean).join(" ");
    return [officer.lastName, first].filter(Boolean).join(", ");
  }

  function findOfficer(id) {
    if (!id) {
      return null;
    }
    var list = committedOfficers();
    var i;
    for (i = 0; i < list.length; i++) {
      if (list[i].id === id || list[i].officerId === id) {
        return list[i];
      }
    }
    return null;
  }

  function todaySlash() {
    var now = new Date();
    var month = now.getMonth() + 1;
    var day = now.getDate();
    return (
      (month < 10 ? "0" + month : String(month)) +
      "/" +
      (day < 10 ? "0" + day : String(day)) +
      "/" +
      now.getFullYear()
    );
  }

  function displayFileNo(value) {
    if (typeof formatAlienNumber === "function") {
      return formatAlienNumber(value);
    }
    var digits = String(value || "").replace(/\D/g, "").slice(0, 9);
    if (!digits) {
      return "";
    }
    return "A" + digits;
  }

  function textValue(id) {
    var el = byId(id);
    return el ? String(el.value || "").trim() : "";
  }

  function checked(id) {
    var el = byId(id);
    return !!(el && el.checked);
  }

  function setValue(id, value) {
    var el = byId(id);
    if (!el) {
      return;
    }
    el.value = value == null ? "" : String(value);
  }

  function loadDirectoryHandle() {
    return COPDoc.repositories.warrants.loadDirectoryHandle();
  }

  function saveDirectoryHandle(handle) {
    return COPDoc.repositories.warrants.saveDirectoryHandle(handle);
  }

  function ensureDirectoryPermission(handle) {
    if (!handle || typeof handle.queryPermission !== "function") {
      return Promise.resolve(null);
    }
    return handle.queryPermission({ mode: "readwrite" }).then(function (state) {
      if (state === "granted") {
        return handle;
      }
      if (typeof handle.requestPermission !== "function") {
        return null;
      }
      return handle.requestPermission({ mode: "readwrite" }).then(function (next) {
        return next === "granted" ? handle : null;
      });
    });
  }

  function rememberHandle(handle) {
    if (!handle) {
      return Promise.resolve(null);
    }
    memoryDirectoryHandle = handle;
    return saveDirectoryHandle(handle)
      .then(function () {
        return handle;
      })
      .catch(function () {
        return handle;
      });
  }

  function pickWarrantsFolderNow() {
    if (typeof window.showDirectoryPicker !== "function") {
      return Promise.resolve(null);
    }
    return window
      .showDirectoryPicker({
        id: "copdocx-warrants",
        mode: "readwrite",
        startIn: "documents"
      })
      .then(rememberHandle)
      .catch(function () {
        return null;
      });
  }

  function getFolderOnGesture() {
    if (typeof window.showDirectoryPicker !== "function") {
      return Promise.resolve(null);
    }
    if (memoryDirectoryHandle) {
      return ensureDirectoryPermission(memoryDirectoryHandle).then(function (
        usable
      ) {
        if (usable) {
          memoryDirectoryHandle = usable;
          return usable;
        }
        return pickWarrantsFolderNow();
      });
    }
    return pickWarrantsFolderNow();
  }

  function writeToFolder(dirHandle, filename, bytes) {
    return dirHandle
      .getFileHandle(filename, { create: true })
      .then(function (fileHandle) {
        return fileHandle.createWritable();
      })
      .then(function (writable) {
        return writable.write(bytes).then(function () {
          return writable.close();
        });
      });
  }

  function currentLead() {
    var m = model();
    if (!m || !m.store) {
      return null;
    }
    m.store.loadFromDisk();
    var id = queryId();
    if (!id) {
      return null;
    }
    var snap = m.store.getLead(id);
    var embedded = snap && (m.subjectOf ? m.subjectOf(snap) : snap.person);
    var canonical = embedded && embedded.personId && typeof m.store.getPerson === "function"
      ? m.store.getPerson(embedded.personId) : null;
    if (canonical) { snap.person = canonical; }
    return snap;
  }

  function fillOfficerSelect(selectedId) {
    var select = byId("issuingOfficer");
    if (!select) {
      return;
    }
    var current = selectedId || select.value || "";
    select.replaceChildren();
    var blank = document.createElement("option");
    blank.value = "";
    blank.textContent = "Select an officer";
    select.appendChild(blank);
    committedOfficers()
      .slice()
      .sort(function (a, b) {
        return officerLabel(a).localeCompare(officerLabel(b));
      })
      .forEach(function (officer) {
        var opt = document.createElement("option");
        opt.value = officer.officerId || officer.id;
        opt.textContent = officerLabel(officer);
        select.appendChild(opt);
      });
    if (current && findOfficer(current)) {
      select.value = current;
    }
  }

  function applyOfficerTitle() {
    var officer = findOfficer(textValue("issuingOfficer"));
    if (!officer) {
      return;
    }
    if (!textValue("officerTitle") && officer.role) {
      setValue("officerTitle", officer.role);
    }
  }

  function collectBasis() {
    return {
      charging: checked("basisCharging"),
      pending: checked("basisPending"),
      deferred: checked("basisDeferred"),
      biometric: checked("basisBiometric"),
      voluntary: checked("basisVoluntary")
    };
  }

  function collectOrder() {
    return {
      ij: checked("orderIJ"),
      official: checked("orderOfficial"),
      bia: checked("orderBIA"),
      court: checked("orderCourt")
    };
  }

  // Capture UI overrides exactly once; all PDF rendering below consumes this value.
  function collectValues(snap) {
    var m = model();
    var pdf = pdfApi();
    var subject = m.subjectOf ? m.subjectOf(snap) : snap.person || {};
    var officerId = textValue("issuingOfficer");
    var officer = findOfficer(officerId);
    var name = officerLabel(officer) || textValue("officerName");
    var type = formType() === "I-205" ? "I-205" : "I-200";
    var values = {
      fileNo: textValue("fileNo"),
      date: textValue("issueDate") || todaySlash(),
      officerName: name,
      officerTitle: textValue("officerTitle"),
      location: textValue("issuingOffice")
    };
    var subjectName = (m.formatPersonLabel && m.formatPersonLabel(subject)) || "";
    var basis;
    if (type === "I-205") {
      values.fullName = subjectName;
      values.entryPlace = textValue("entryPlace");
      values.entryDate = textValue("entryDate");
      values.inaLaw = textValue("inaLaw");
      values.order = collectOrder();
      basis = pdf.checkedI205OrderFieldIds(values.order);
    } else {
      values.determination = textValue("determination");
      values.nameOfAlien = textValue("nameOfAlien") || subjectName;
      values.dateOfService = textValue("dateOfService");
      values.language = textValue("serviceLanguage");
      values.interpreter = textValue("interpreter");
      values.basis = collectBasis();
      basis = pdf.checkedI200BasisFieldIds(values.basis);
    }
    return {
      formType: type,
      template: type === "I-205" ? pdf.I205_TEMPLATE : pdf.I200_TEMPLATE,
      mapped: type === "I-205" ? pdf.mapI205(values) : pdf.mapI200(values),
      values: values,
      fileNo: values.fileNo,
      date: values.date,
      officerName: name,
      officerTitle: values.officerTitle,
      officerId: officerId,
      officer: officer,
      office: values.location,
      inaLaw: values.inaLaw || "",
      entryPlace: values.entryPlace || "",
      entryDate: values.entryDate || "",
      basis: basis,
      person: subject
    };
  }

  function existingFileNames(person) {
    return ((person && person.warrants) || [])
      .map(function (row) {
        return row && row.pdfFileName;
      })
      .filter(Boolean);
  }

  function persistOfficeAndOfficer() {
    saveSettings({
      issuingOffice: textValue("issuingOffice"),
      lastOfficerId: textValue("issuingOfficer")
    });
  }

  function generationContext(snap, payload, filename) {
    var sources = [{ type: "Lead", id: snap.leadId, revision: (snap.meta || {}).updatedAt || "", authority: "canonical" }];
    if (payload.person && payload.person.personId) {
      sources.push({ type: "Person", id: payload.person.personId, revision: payload.person.objectRevision || (payload.person.meta || {}).updatedAt || "", authority: model().store.getPerson && model().store.getPerson(payload.person.personId) ? "canonical" : "snapshot" });
    }
    sources.push({ type: "WarrantForm", id: snap.leadId + ":" + payload.formType, revision: null, authority: "draft" });
    if (payload.officer && payload.officerId) {
      sources.push({ type: "Officer", id: payload.officerId, revision: (payload.officer.meta || {}).updatedAt || "", authority: "canonical" });
    }
    return COPDoc.documents.captureContext({
      documentType: payload.formType === "I-205" ? "warrant.i205" : "warrant.i200",
      input: { values: payload.values, mapped: payload.mapped, filename: filename, template: payload.template },
      person: payload.person,
      officers: payload.officer ? [payload.officer] : [],
      generatingOfficerId: payload.officerId,
      sources: sources
    });
  }

  function generatePdf(context) {
    return fetch(context.input.template).then(function (response) {
      if (!response.ok) { throw new Error("Could not load " + context.input.template); }
      return response.arrayBuffer();
    }).then(function (templateBytes) {
      return COPDoc.documents.generate({
        documentType: context.documentType,
        context: context,
        templateContent: templateBytes,
        render: function (captured) {
          return pdfApi().fillWarrantPdf(captured.input.template, captured.input.mapped, templateBytes).then(function (bytes) {
            return { data: bytes, mimeType: "application/pdf", filename: captured.input.filename };
          });
        }
      });
    });
  }

  function appendWarrant(snap, payload, filename) {
    var m = model();
    var subject = m.subjectOf ? m.subjectOf(snap) : snap.person;
    if (!subject) {
      return { ok: false, error: "Lead has no subject." };
    }
    if (!Array.isArray(subject.warrants)) {
      subject.warrants = [];
    }
    var charge =
      payload.formType === "I-205"
        ? "I-205 Warrant of Removal/Deportation"
        : "I-200 Warrant for Arrest of Alien";
    var warrant = m.createWarrant({
      warrantId: payload.warrantId,
      documentGenerationId: payload.documentGenerationId || "",
      formType: payload.formType,
      fileNo: payload.fileNo,
      mediaId: payload.mediaId || "",
      pdfFileName: filename,
      office: payload.office,
      officerName: payload.officerName,
      officerTitle: payload.officerTitle,
      basis: payload.basis || [],
      inaLaw: payload.inaLaw || "",
      entryPlace: payload.entryPlace || "",
      entryDate: payload.entryDate || "",
      issuedAt: m.nowIso ? m.nowIso() : new Date().toISOString(),
      charge: charge,
      warrantNumber: payload.fileNo,
      warrantDate: payload.date,
      warrantStatus: "active",
      warrantIssuer: payload.officerName,
      warrantIssuerCode: ""
    });
    subject.warrants.push(warrant);
    subject.caseRole = "TARGET";
    snap.person = subject;
    snap.caseRole = "TARGET";
    return m.store.saveLead(snap, { mode: "commit" });
  }

  function issueErrors(payload) {
    var errors = [];
    var digits = String((payload && payload.fileNo) || "").replace(/\D/g, "");
    if (digits.length !== 9) {
      errors.push("Enter a 9-digit file number.");
    }
    if (!(payload && payload.officerName)) {
      errors.push("Select an issuing officer.");
    }
    if (payload && payload.formType === "I-200" && !(payload.basis && payload.basis.length)) {
      errors.push("Select at least one basis.");
    }
    if (payload && payload.formType === "I-205" && !(payload.basis && payload.basis.length)) {
      errors.push("Select at least one order.");
    }
    return errors;
  }

  function issue(opts) {
    if (activeIssue) { return activeIssue; }
    if (committedIssue) {
      setStatus("This warrant has already been issued. Open it from the Case.", true);
      window.location.href = "case.html?id=" + encodeURIComponent(committedIssue.leadId);
      return Promise.resolve();
    }
    opts = opts || {};
    var writeRecord = opts.writeRecord !== false;
    var pickFolder = opts.pickFolder === true;
    var snap = currentLead();
    if (!snap || !isCommitted(snap)) {
      setStatus("Open a filed case to issue this warrant.");
      return Promise.resolve();
    }
    var pdf = pdfApi();
    if (!pdf || typeof pdf.fillWarrantPdf !== "function") {
      setStatus("PDF helper is missing.");
      return Promise.resolve();
    }
    var docs = window.COPDoc && COPDoc.documents;
    if (!docs || typeof docs.captureContext !== "function" || typeof docs.generate !== "function" || typeof docs.recordDelivery !== "function" || typeof docs.attachMedia !== "function") {
      setStatus("Document generation is unavailable. Reload this page before issuing a warrant.");
      return Promise.resolve();
    }
    persistOfficeAndOfficer();
    var payload = collectValues(snap);
    var errors = issueErrors(payload);
    if (errors.length) {
      setStatus(errors[0]);
      return Promise.resolve();
    }
    var warrantId = model().newId("wnt");
    var filename = pdf.warrantFileName({
      formType: payload.formType,
      person: payload.person,
      fileNo: payload.fileNo,
      date: payload.date,
      warrantId: warrantId,
      existingNames: existingFileNames(payload.person)
    });
    hideActions(false);
    payload.warrantId = warrantId;
    setStatus("Filling " + payload.formType + "…");
    var folderPromise = pickFolder
      ? getFolderOnGesture()
      : Promise.resolve(null);
    var subject = model().subjectOf ? model().subjectOf(snap) : snap.person;
    var context;
    try { context = generationContext(snap, payload, filename); }
    catch (error) { setStatus(error.message || "Could not capture warrant inputs."); return Promise.resolve(); }
    var generationId = "";
    activeIssue = folderPromise
      .then(function (dirHandle) {
        return generatePdf(context).then(function (generated) {
          generationId = generated.record.generationId;
          payload.documentGenerationId = generationId;
          var bytes = generated.artifact.data;
          var blob = new Blob([bytes], { type: "application/pdf" });
          var mediaPromise = Promise.resolve(null);
          if (
            writeRecord &&
            subject &&
            subject.personId &&
            window.COPDoc &&
            COPDoc.media &&
            typeof COPDoc.media.save === "function"
          ) {
            mediaPromise = COPDoc.media
              .save({
                owner: { type: "PERSON", id: subject.personId },
                mediaClass: "file",
                mime: "application/pdf",
                originalName: filename,
                documentType: payload.formType,
                kind: "document",
                caption:
                  payload.formType === "I-205"
                    ? "I-205 Warrant of Removal/Deportation"
                    : "I-200 Warrant for Arrest of Alien",
                original: blob
              })
              .catch(function (error) {
                console.warn("Could not store warrant PDF", error);
                return null;
              });
          }
          return mediaPromise.then(async function (mediaRow) {
            var deliveryWarnings = [];
            if (mediaRow) { await docs.attachMedia(generationId, mediaRow.mediaId); }
            if (writeRecord) {
              payload.mediaId = mediaRow && mediaRow.mediaId;
              var saved = appendWarrant(snap, payload, filename);
              if (!saved || !saved.ok) {
                setStatus((saved && saved.error) || "Could not save the warrant on the lead.");
                await docs.recordDelivery(generationId, { method: "save", status: "FAILED" });
                return;
              }
              // The domain commit is final even if its delivery annotation fails.
              // Keep this page from minting another warrant while navigation settles.
              committedIssue = { leadId: snap.leadId, warrantId: payload.warrantId };
              try { await docs.recordDelivery(generationId, { method: "save", status: "SUCCEEDED" }); }
              catch (error) { deliveryWarnings.push("Its issuance history annotation could not be saved."); }
            }
            var savedToFolder = false;
            if (dirHandle) {
              try { await writeToFolder(dirHandle, filename, bytes); savedToFolder = true; }
              catch (error) { console.warn("Could not write warrants folder", error); }
            }
            var downloadSubmitted = false;
            try { pdf.downloadBytes(filename, bytes); downloadSubmitted = true; }
            catch (error) { deliveryWarnings.push("The PDF download could not be started."); }
            try { await docs.recordDelivery(generationId, { method: "download", status: downloadSubmitted ? "SUBMITTED" : "FAILED" }); }
            catch (error) { deliveryWarnings.push("Its download history annotation could not be saved."); }
            if (!writeRecord) {
              setStatus((downloadSubmitted ? "Downloaded " + filename + ". " : "") + deliveryWarnings.join(" "), downloadSubmitted && !deliveryWarnings.length);
              return;
            }
            var extra = savedToFolder ? " Saved to the warrants folder." : "";
            setStatus("Issued " + payload.formType + "." + extra + (deliveryWarnings.length ? " " + deliveryWarnings.join(" ") + " Open the issued warrant from the Case." : ""), !deliveryWarnings.length);
            window.location.href = "case.html?id=" + encodeURIComponent(snap.leadId);
          });
        });
      })
      .catch(function (error) {
        console.warn(error);
        if (writeRecord) {
          setStatus(
            (error && error.message) ||
              "Could not fill the warrant PDF. Nothing was saved."
          );
          return;
        }
        setStatus((error && error.message) || "Could not fill the PDF.");
      }).then(function (result) {
        activeIssue = null;
        return result;
      }, function (error) {
        activeIssue = null;
        throw error;
      });
    return activeIssue;
  }

  window.issueWarrant = function () {
    return issue({ writeRecord: true, pickFolder: true });
  };

  window.downloadWarrantPdf = function () {
    return issue({ writeRecord: false, pickFolder: false });
  };

  var root = (window.COPDoc = window.COPDoc || {});
  root.warrantIssue = {
    issueErrors: issueErrors
  };

  function paintMissing(message) {
    var missing = byId("warrantMissing");
    var form = byId("warrantForm");
    if (missing) {
      missing.hidden = false;
      missing.textContent = message;
    }
    if (form) {
      form.hidden = true;
    }
    hideActions(true);
  }

  function paintForm(snap) {
    var m = model();
    var subject = m.subjectOf ? m.subjectOf(snap) : snap.person || {};
    var immigration = subject.immigration || {};
    var name = (m.formatPersonLabel && m.formatPersonLabel(subject)) || "Lead";
    var settings = loadSettings();
    var missing = byId("warrantMissing");
    var form = byId("warrantForm");
    if (missing) {
      missing.hidden = true;
    }
    if (form) {
      form.hidden = false;
    }
    hideActions(false);
    if (byId("warrantSubjectName")) {
      byId("warrantSubjectName").textContent = name;
    }
    if (byId("warrantSubjectFileNo")) {
      byId("warrantSubjectFileNo").textContent =
        displayFileNo(immigration.alienNumber) || "—";
    }
    document.title = formType() + " — " + name;
    setValue("fileNo", displayFileNo(immigration.alienNumber));
    setValue("issueDate", todaySlash());
    setValue("issuingOffice", settings.issuingOffice || "");
    fillOfficerSelect(settings.lastOfficerId || "");
    applyOfficerTitle();
    if (formType() === "I-200") {
      setValue("nameOfAlien", name);
    }
    if (typeof bindAlienNumberInput === "function" && byId("fileNo")) {
      bindAlienNumberInput(byId("fileNo"));
    }
  }

  function bindForm() {
    var officer = byId("issuingOfficer");
    if (officer) {
      officer.addEventListener("change", function () {
        var selected = findOfficer(officer.value);
        if (selected && selected.role) {
          setValue("officerTitle", selected.role);
        }
        persistOfficeAndOfficer();
      });
    }
    var office = byId("issuingOffice");
    if (office) {
      office.addEventListener("change", persistOfficeAndOfficer);
    }
  }

  function bootForm() {
    loadDirectoryHandle().then(function (saved) {
      if (saved) {
        memoryDirectoryHandle = saved;
      }
    });
    var m = model();
    if (!m || !m.store) {
      paintMissing("Lead store is not available.");
      return;
    }
    var snap = currentLead();
    if (!snap) {
      paintMissing("Lead not found.");
      setStatus("Lead not found.");
      return;
    }
    if (!isCommitted(snap)) {
      window.location.replace(
        "lead-form.html?id=" + encodeURIComponent(snap.leadId)
      );
      return;
    }
    paintForm(snap);
    bindForm();
  }

  function boot() {
    var page = pageKey();
    if (page !== "i200-form" && page !== "i205-form") {
      return;
    }
    bootForm();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
