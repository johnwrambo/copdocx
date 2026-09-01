/**
 * I-200 / I-205 issuance forms. Prefill from a committed lead, fill the
 * blank PDF without flattening, download (and optionally write a warrants
 * folder), then append person.warrants and commit the lead.
 */
(function () {
  "use strict";

  var SETTINGS_KEY = "copdocx.settings.v1";
  var ADMIN_KEY = "copdoc.admin.v1";
  var IDB_NAME = "copdocx.warrants";
  var IDB_STORE = "handles";
  var HANDLE_KEY = "warrantsDirectory";
  var memoryDirectoryHandle = null;

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

  function loadSettings() {
    try {
      return JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}") || {};
    } catch (error) {
      return {};
    }
  }

  function saveSettings(partial) {
    var cur = loadSettings();
    Object.keys(partial || {}).forEach(function (key) {
      cur[key] = partial[key];
    });
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(cur));
    } catch (error) {
      /* ignore quota */
    }
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
      var parsed = JSON.parse(localStorage.getItem(ADMIN_KEY) || "{}") || {};
      var officers = parsed.officers || [];
      return officers.filter(isCommitted);
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

  function idbOpen() {
    return new Promise(function (resolve, reject) {
      if (!window.indexedDB) {
        reject(new Error("IndexedDB is not available."));
        return;
      }
      var req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = function () {
        if (!req.result.objectStoreNames.contains(IDB_STORE)) {
          req.result.createObjectStore(IDB_STORE);
        }
      };
      req.onsuccess = function () {
        resolve(req.result);
      };
      req.onerror = function () {
        reject(req.error);
      };
    });
  }

  function loadDirectoryHandle() {
    return idbOpen()
      .then(function (db) {
        return new Promise(function (resolve, reject) {
          var tx = db.transaction(IDB_STORE, "readonly");
          var req = tx.objectStore(IDB_STORE).get(HANDLE_KEY);
          req.onsuccess = function () {
            resolve(req.result || null);
          };
          req.onerror = function () {
            reject(req.error);
          };
        });
      })
      .catch(function () {
        return null;
      });
  }

  function saveDirectoryHandle(handle) {
    return idbOpen().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(IDB_STORE, "readwrite");
        var req = tx.objectStore(IDB_STORE).put(handle, HANDLE_KEY);
        req.onsuccess = function () {
          resolve(handle);
        };
        req.onerror = function () {
          reject(req.error);
        };
      });
    });
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
    return m.store.getLead(id);
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

  function collectValues(snap) {
    var m = model();
    var pdf = pdfApi();
    var subject = m.subjectOf ? m.subjectOf(snap) : snap.person || {};
    var officer = findOfficer(textValue("issuingOfficer"));
    var name = officerLabel(officer) || textValue("officerName");
    var title = textValue("officerTitle");
    var location = textValue("issuingOffice");
    var fileNo = textValue("fileNo");
    var date = textValue("issueDate") || todaySlash();
    var subjectName =
      (m.formatPersonLabel && m.formatPersonLabel(subject)) || "";
    if (formType() === "I-205") {
      return {
        formType: "I-205",
        template: pdf.I205_TEMPLATE,
        mapped: pdf.mapI205({
          fileNo: fileNo,
          date: date,
          fullName: subjectName,
          entryPlace: textValue("entryPlace"),
          entryDate: textValue("entryDate"),
          inaLaw: textValue("inaLaw"),
          officerTitle: title,
          location: location
        }),
        fileNo: fileNo,
        date: date,
        officerName: name,
        officerTitle: title,
        office: location,
        inaLaw: textValue("inaLaw"),
        entryPlace: textValue("entryPlace"),
        entryDate: textValue("entryDate"),
        basis: pdf.checkedI205OrderFieldIds(collectOrder()),
        person: subject
      };
    }
    return {
      formType: "I-200",
      template: pdf.I200_TEMPLATE,
      mapped: pdf.mapI200({
        fileNo: fileNo,
        date: date,
        determination: textValue("determination"),
        officerName: name,
        officerTitle: title,
        location: location,
        nameOfAlien: textValue("nameOfAlien") || subjectName,
        dateOfService: textValue("dateOfService"),
        language: textValue("serviceLanguage"),
        interpreter: textValue("interpreter"),
        basis: collectBasis()
      }),
      fileNo: fileNo,
      date: date,
      officerName: name,
      officerTitle: title,
      office: location,
      inaLaw: "",
      entryPlace: "",
      entryDate: "",
      basis: pdf.checkedI200BasisFieldIds(collectBasis()),
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

  function fillPdf(payload) {
    var pdf = pdfApi();
    return pdf.fillWarrantPdf(payload.template, payload.mapped);
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
      formType: payload.formType,
      fileNo: payload.fileNo,
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
    snap.person = subject;
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
    opts = opts || {};
    var writeRecord = opts.writeRecord !== false;
    var pickFolder = opts.pickFolder === true;
    var snap = currentLead();
    if (!snap || !isCommitted(snap)) {
      setStatus("Open a committed lead to issue this warrant.");
      return Promise.resolve();
    }
    var pdf = pdfApi();
    if (!pdf || typeof pdf.fillWarrantPdf !== "function") {
      setStatus("PDF helper is missing.");
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
    if (writeRecord) {
      payload.warrantId = warrantId;
      var saved = appendWarrant(snap, payload, filename);
      if (!saved || !saved.ok) {
        setStatus(
          (saved && saved.error) || "Could not save the warrant on the lead."
        );
        return Promise.resolve();
      }
    }
    setStatus("Filling " + payload.formType + "…");
    var folderPromise = pickFolder
      ? getFolderOnGesture()
      : Promise.resolve(null);
    return folderPromise
      .then(function (dirHandle) {
        return fillPdf(payload).then(function (bytes) {
          var wroteFolder = Promise.resolve(false);
          if (dirHandle) {
            wroteFolder = writeToFolder(dirHandle, filename, bytes)
              .then(function () {
                return true;
              })
              .catch(function (error) {
                console.warn("Could not write warrants folder", error);
                return false;
              });
          }
          return wroteFolder.then(function (savedToFolder) {
            pdf.downloadBytes(filename, bytes);
            if (!writeRecord) {
              setStatus("Downloaded " + filename + ".", true);
              return;
            }
            var extra = savedToFolder ? " Saved to the warrants folder." : "";
            window.location.href =
              "lead.html?id=" + encodeURIComponent(snap.leadId);
            setStatus("Issued " + payload.formType + "." + extra, true);
          });
        });
      })
      .catch(function (error) {
        console.warn(error);
        if (writeRecord) {
          setStatus(
            (error && error.message) ||
              "Warrant is saved on the lead, but the PDF could not be filled."
          );
          return;
        }
        setStatus((error && error.message) || "Could not fill the PDF.");
      });
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
