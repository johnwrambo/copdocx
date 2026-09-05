/**
 * File upload. Lab: copdocx.file-upload.v1.
 * With ?ownerType=&id= or ?leadId=, Save file writes copdocx.media.v1.
 */
(function (global) {
  "use strict";

  if (!document.body || document.body.getAttribute("data-page") !== "file-upload") {
    return;
  }

  var STORAGE_KEY = root.repositories.viewState.schemas.demoFiles;
  var MAX_STORE_BYTES = 2.5 * 1024 * 1024;
  var KINDS = {
    subject: "Subject",
    vehicle: "Vehicle",
    location: "Location",
    document: "Document",
    evidence: "Evidence",
    other: "Other"
  };
  var PACKET_TYPES = [
    { code: "RAP_SHEET", label: "Rap sheet" },
    { code: "WARRANT", label: "Warrant" },
    { code: "I200", label: "I-200" },
    { code: "I205", label: "I-205" },
    { code: "I213", label: "I-213 / narrative" },
    { code: "NTA", label: "Notice to Appear" },
    { code: "DETAINER", label: "Detainer" },
    { code: "BOOKIN_PACKET", label: "Book-in packet" },
    { code: "COURT_RECORD", label: "Court record" },
    { code: "VEHICLE_TITLE", label: "Vehicle title / registration" },
    { code: "OTHER_FILE", label: "Other file" }
  ];

  var model = (global.COPDoc && COPDoc.model) || {};
  var mediaApi = global.COPDoc && COPDoc.media;
  function hasOwnerQuery() {
    try {
      var q = new URLSearchParams(window.location.search);
      return !!(q.get("ownerType") || q.get("leadId"));
    } catch (error) {
      return false;
    }
  }
  var owner = mediaApi && typeof mediaApi.ownerFromPage === "function"
    ? mediaApi.ownerFromPage()
    : null;
  var ownerMode = hasOwnerQuery();
  var state = { files: [], selectedId: "", filter: "all" };
  var sourceFiles = {};
  var suppress = false;

  function byId(id) {
    return document.getElementById(id);
  }

  function nowIso() {
    return model.nowIso ? model.nowIso() : new Date().toISOString();
  }

  function newId(prefix) {
    return model.newId
      ? model.newId(prefix)
      : String(prefix || "id") +
          "_" +
          Date.now().toString(36) +
          "_" +
          Math.random().toString(36).slice(2, 8);
  }

  function setStatus(message, ok) {
    if (global.COPDoc && typeof COPDoc.setAppBarStatus === "function") {
      COPDoc.setAppBarStatus(message, { ok: !!ok });
    }
  }

  function identityTypes() {
    return (
      (global.COPDoc && COPDoc.data && COPDoc.data.identityDocumentTypes) ||
      global.IDENTITY_DOCUMENT_TYPES ||
      []
    ).filter(function (row) {
      return row && row.active !== false;
    });
  }

  function allDocumentTypes() {
    return identityTypes().concat(PACKET_TYPES);
  }

  function documentTypeLabel(code) {
    if (!code) {
      return "";
    }
    var list = allDocumentTypes();
    var i;
    for (i = 0; i < list.length; i++) {
      if (list[i].code === code) {
        return list[i].label;
      }
    }
    return code;
  }

  function fillDocumentTypeSelect() {
    var select = byId("fileDocumentType");
    if (!select || select.dataset.filled === "true") {
      return;
    }
    select.dataset.filled = "true";
    var blank = document.createElement("option");
    blank.value = "";
    blank.textContent = "Select a document type";
    select.appendChild(blank);

    function addGroup(label, rows) {
      var group = document.createElement("optgroup");
      group.label = label;
      rows.forEach(function (row) {
        var opt = document.createElement("option");
        opt.value = row.code;
        opt.textContent = row.label;
        group.appendChild(opt);
      });
      select.appendChild(group);
    }

    addGroup("Identity", identityTypes());
    addGroup("Case files", PACKET_TYPES);
  }

  function selectedFile() {
    var id = state.selectedId;
    var i;
    for (i = 0; i < state.files.length; i++) {
      if (state.files[i].fileId === id) {
        return state.files[i];
      }
    }
    return null;
  }

  function loadState() {
    if (ownerMode) {
      return;
    }
    try {
      var parsed = root.repositories.viewState.loadDemoFiles();
      if (parsed === undefined) {
        return;
      }
      state.files = Array.isArray(parsed.files) ? parsed.files : [];
      state.selectedId = parsed.selectedId || "";
    } catch (err) {
      state.files = [];
    }
  }

  function persistableCopy() {
    return state.files.map(function (row) {
      if (row.bytes && row.bytes > MAX_STORE_BYTES) {
        var slim = {};
        Object.keys(row).forEach(function (key) {
          slim[key] = row[key];
        });
        slim.dataUrl = "";
        slim.sessionOnly = true;
        return slim;
      }
      return row;
    });
  }

  function saveState() {
    if (ownerMode) {
      return true;
    }
    try {
      root.repositories.viewState.saveDemoFiles(state.files, state.selectedId, MAX_STORE_BYTES);
      return true;
    } catch (err) {
      setStatus("Could not save files (storage full or blocked).");
      return false;
    }
  }

  function toDatetimeLocal(iso) {
    if (!iso) {
      return "";
    }
    var d = new Date(iso);
    if (isNaN(d.getTime())) {
      return "";
    }
    var pad = function (n) {
      return String(n).padStart(2, "0");
    };
    return (
      d.getFullYear() +
      "-" +
      pad(d.getMonth() + 1) +
      "-" +
      pad(d.getDate()) +
      "T" +
      pad(d.getHours()) +
      ":" +
      pad(d.getMinutes())
    );
  }

  function fromDatetimeLocal(value) {
    if (!value) {
      return "";
    }
    var d = new Date(value);
    return isNaN(d.getTime()) ? "" : d.toISOString();
  }

  function guessKind(file) {
    var mime = String(file.type || "").toLowerCase();
    if (mime.indexOf("image/") === 0) {
      return "subject";
    }
    return "document";
  }

  function readFile(file) {
    var fileId = newId("fil");
    var taken = file.lastModified
      ? new Date(file.lastModified).toISOString()
      : nowIso();
    var row = {
      fileId: fileId,
      originalName: file.name || "file",
      mime: file.type || "application/octet-stream",
      bytes: file.size || 0,
      dataUrl: "",
      previewUrl: "",
      sessionOnly: false,
      kind: guessKind(file),
      documentType: "",
      caption: "",
      takenAt: taken,
      place: "",
      tags: [],
      notes: "",
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    if (ownerMode) {
      sourceFiles[fileId] = file;
      row.previewUrl = URL.createObjectURL(file);
      return Promise.resolve(row);
    }
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        row.dataUrl = reader.result || "";
        row.sessionOnly = file.size > MAX_STORE_BYTES;
        resolve(row);
      };
      reader.onerror = function () {
        reject(new Error("Could not read " + (file.name || "file") + "."));
      };
      reader.readAsDataURL(file);
    });
  }

  function importFiles(fileList) {
    var files = Array.prototype.slice.call(fileList || []);
    var blocked = [];
    files = files.filter(function (file) {
      var unsafe =
        model && typeof model.isActiveMarkupFile === "function"
          ? model.isActiveMarkupFile(file.name, file.type)
          : /\.(html?|xhtml|svg)$/i.test(file.name || "");
      if (unsafe) {
        blocked.push(file.name || "file");
        return false;
      }
      return true;
    });
    if (blocked.length && !files.length) {
      setStatus("HTML and SVG files cannot be stored here.");
      return;
    }
    if (!files.length) {
      return;
    }
    Promise.all(files.map(readFile))
      .then(function (rows) {
        state.files = rows.concat(state.files);
        state.selectedId = rows[0].fileId;
        saveState();
        paint();
        var skipped = rows.filter(function (row) {
          return row.sessionOnly;
        }).length;
        var msg =
          "Added " + rows.length + " file" + (rows.length === 1 ? "" : "s") + ".";
        if (skipped) {
          msg +=
            " " +
            skipped +
            " over " +
            Math.round(MAX_STORE_BYTES / 1024 / 1024) +
            " MB stay in this session only.";
        }
        if (blocked.length) {
          msg += " Skipped HTML/SVG: " + blocked.join(", ") + ".";
        }
        setStatus(msg, true);
      })
      .catch(function (err) {
        setStatus(err.message || "Could not read file.");
      });
  }

  function openPicker() {
    var input = byId("fileUploadInput");
    if (input) {
      input.click();
    }
  }

  function filteredFiles() {
    if (state.filter === "all") {
      return state.files;
    }
    return state.files.filter(function (row) {
      return row.kind === state.filter;
    });
  }

  function formatBytes(n) {
    if (!n) {
      return "0 B";
    }
    if (n < 1024) {
      return n + " B";
    }
    if (n < 1024 * 1024) {
      return Math.round(n / 1024) + " KB";
    }
    return (n / 1024 / 1024).toFixed(1) + " MB";
  }

  function paintLibrary() {
    var list = byId("fileLibrary");
    var empty = byId("fileLibraryEmpty");
    var rows = filteredFiles();
    document.querySelectorAll("[data-file-filter]").forEach(function (btn) {
      btn.setAttribute(
        "aria-pressed",
        btn.getAttribute("data-file-filter") === state.filter ? "true" : "false"
      );
    });
    if (!list) {
      return;
    }
    list.replaceChildren();
    if (!rows.length) {
      if (empty) {
        empty.hidden = false;
        empty.textContent = state.files.length
          ? "No files in this filter."
          : "No files yet.";
      }
      list.hidden = true;
      return;
    }
    if (empty) {
      empty.hidden = true;
    }
    list.hidden = false;
    rows.forEach(function (row) {
      var li = document.createElement("li");
      li.className = "file-row";
      if (row.fileId === state.selectedId) {
        li.classList.add("is-selected");
      }
      li.setAttribute("tabindex", "0");
      li.setAttribute("role", "button");
      var name = document.createElement("strong");
      name.textContent = row.originalName || "file";
      var meta = document.createElement("span");
      meta.className = "file-row-meta";
      meta.textContent = [
        KINDS[row.kind] || row.kind,
        documentTypeLabel(row.documentType) || "No type",
        formatBytes(row.bytes)
      ].join(" · ");
      li.appendChild(name);
      li.appendChild(meta);
      li.addEventListener("click", function () {
        collectInspector();
        state.selectedId = row.fileId;
        saveState();
        paint();
      });
      li.addEventListener("keydown", function (event) {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          li.click();
        }
      });
      list.appendChild(li);
    });
  }

  function paintTags(file) {
    var list = byId("fileTagList");
    if (!list) {
      return;
    }
    list.replaceChildren();
    (file.tags || []).forEach(function (tag, index) {
      var li = document.createElement("li");
      li.className = "photo-tag";
      li.textContent = tag;
      var btn = document.createElement("button");
      btn.type = "button";
      btn.setAttribute("aria-label", "Remove tag " + tag);
      btn.textContent = "×";
      btn.addEventListener("click", function () {
        file.tags.splice(index, 1);
        file.updatedAt = nowIso();
        saveState();
        paintTags(file);
      });
      li.appendChild(btn);
      list.appendChild(li);
    });
  }

  function paintPreview(file) {
    var host = byId("filePreview");
    var open = byId("fileOpenLink");
    if (!host) {
      return;
    }
    host.replaceChildren();
    var src = file.previewUrl || file.dataUrl;
    if (open) {
      if (src) {
        open.hidden = false;
        open.href = src;
        open.setAttribute("download", file.originalName || "file");
      } else {
        open.hidden = true;
        open.removeAttribute("href");
      }
    }
    var mime = String(file.mime || "");
    if (!src) {
      var missing = document.createElement("p");
      missing.className = "section-note";
      missing.textContent = "Bytes were not stored (file too large for this browser).";
      host.appendChild(missing);
      return;
    }
    if (mime.indexOf("image/") === 0) {
      var img = document.createElement("img");
      img.alt = file.caption || file.originalName || "File";
      img.src = src;
      host.appendChild(img);
      return;
    }
    if (mime === "application/pdf") {
      var frame = document.createElement("iframe");
      frame.title = file.originalName || "PDF";
      frame.src = src;
      host.appendChild(frame);
      return;
    }
    var note = document.createElement("p");
    note.className = "section-note";
    note.textContent = "No in-page preview for this type. Use Open file.";
    host.appendChild(note);
  }

  function collectInspector() {
    var file = selectedFile();
    if (!file || suppress) {
      return;
    }
    file.kind = byId("fileKind").value || "document";
    file.documentType = byId("fileDocumentType").value || "";
    file.caption = byId("fileCaption").value.trim();
    file.place = byId("filePlace").value.trim();
    file.notes = byId("fileNotes").value.trim();
    file.takenAt = fromDatetimeLocal(byId("fileTakenAt").value);
    file.updatedAt = nowIso();
    saveState();
  }

  function addTag() {
    var file = selectedFile();
    var input = byId("fileTagInput");
    if (!file || !input) {
      return;
    }
    var raw = String(input.value || "")
      .split(",")
      .map(function (part) {
        return part.trim();
      })
      .filter(Boolean);
    if (!raw.length) {
      return;
    }
    file.tags = file.tags || [];
    raw.forEach(function (tag) {
      var key = tag.toLowerCase();
      var exists = file.tags.some(function (item) {
        return item.toLowerCase() === key;
      });
      if (!exists) {
        file.tags.push(tag);
      }
    });
    input.value = "";
    file.updatedAt = nowIso();
    saveState();
    paintTags(file);
    paintLibrary();
  }

  function paintInspector() {
    var file = selectedFile();
    var empty = byId("fileInspectorEmpty");
    var panel = byId("fileInspector");
    if (!file) {
      if (empty) {
        empty.hidden = false;
      }
      if (panel) {
        panel.hidden = true;
      }
      return;
    }
    if (empty) {
      empty.hidden = true;
    }
    if (panel) {
      panel.hidden = false;
    }
    suppress = true;
    byId("fileKind").value = file.kind || "document";
    byId("fileDocumentType").value = file.documentType || "";
    byId("fileCaption").value = file.caption || "";
    byId("filePlace").value = file.place || "";
    byId("fileNotes").value = file.notes || "";
    byId("fileTakenAt").value = toDatetimeLocal(file.takenAt);
    byId("fileMeta").textContent =
      (file.originalName || "file") +
      " · " +
      (file.mime || "unknown") +
      " · " +
      formatBytes(file.bytes) +
      (file.sessionOnly ? " · session only" : "");
    paintTags(file);
    paintPreview(file);
    suppress = false;
  }

  function paint() {
    paintLibrary();
    paintInspector();
  }

  function canvasToBlob(canvas, quality) {
    if (canvas && typeof canvas.convertToBlob === "function") {
      return canvas.convertToBlob({ type: "image/jpeg", quality: quality });
    }
    return new Promise(function (resolve, reject) {
      canvas.toBlob(
        function (blob) {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error("Could not encode JPEG."));
          }
        },
        "image/jpeg",
        quality
      );
    });
  }

  function imageParts(file) {
    if (!file || String(file.type || "").indexOf("image/") !== 0) {
      return Promise.resolve({ original: file });
    }
    var load = typeof createImageBitmap === "function"
      ? createImageBitmap(file, { imageOrientation: "from-image" }).catch(function () {
          return createImageBitmap(file);
        })
      : Promise.reject(new Error("bitmap"));
    return load.then(function (bmp) {
      function scale(maxEdge) {
        var scaleN = Math.min(1, maxEdge / Math.max(bmp.width, bmp.height));
        var canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(bmp.width * scaleN));
        canvas.height = Math.max(1, Math.round(bmp.height * scaleN));
        canvas.getContext("2d").drawImage(bmp, 0, 0, canvas.width, canvas.height);
        return canvas;
      }
      return Promise.all([
        canvasToBlob(scale(1920), 0.86),
        canvasToBlob(scale(320), 0.72)
      ]).then(function (pair) {
        if (bmp.close) {
          bmp.close();
        }
        return { original: file, display: pair[0], thumb: pair[1] };
      });
    }).catch(function () {
      return { original: file };
    });
  }

  function saveToOwner() {
    collectInspector();
    var current = mediaApi && typeof mediaApi.ownerFromPage === "function"
      ? mediaApi.ownerFromPage()
      : owner;
    if (!current || !current.id) {
      setStatus("Open this page from a person, officer, vehicle, or location to save.");
      return;
    }
    if (!state.files.length) {
      setStatus("Add files first.");
      return;
    }
    var i = 0;
    var saved = 0;
    var skipped = 0;
    function step() {
      if (i >= state.files.length) {
        var msg = "Saved " + saved + " file" + (saved === 1 ? "" : "s") + ".";
        if (skipped) {
          msg += " " + skipped + " already saved.";
        }
        setStatus(msg, true);
        var href = mediaApi.returnHref(current);
        if (href) {
          window.location.href = href;
        }
        return;
      }
      var row = state.files[i];
      var index = i + 1;
      i += 1;
      var file = sourceFiles[row.fileId];
      if (!file) {
        setStatus("Missing original for " + (row.originalName || "file") + ".");
        return;
      }
      setStatus("Saving " + index + " of " + state.files.length + "…");
      var isPhoto = String(file.type || "").indexOf("image/") === 0;
      imageParts(file)
        .then(function (parts) {
          return mediaApi.save({
            owner: { type: current.type, id: current.id },
            mediaClass: isPhoto ? "photo" : "file",
            original: parts.original,
            display: parts.display,
            thumb: parts.thumb,
            mime: file.type || row.mime,
            originalName: row.originalName,
            bytes: file.size || row.bytes,
            fields: {
              kind: row.kind || (isPhoto ? "subject" : "document"),
              documentType: row.documentType || "",
              caption: row.caption || "",
              place: row.place || "",
              notes: row.notes || "",
              takenAt: row.takenAt || "",
              tags: row.tags || []
            }
          });
        })
        .then(function () {
          saved += 1;
          return step();
        })
        .catch(function (err) {
          if (err && err.code === "ALREADY_SAVED") {
            skipped += 1;
            return step();
          }
          setStatus((err && err.message) || "Could not save file.");
        });
    }
    step();
  }

  function paintOwnerNote() {
    var note = document.querySelector(".page-photo-picker .page-meta p");
    if (!note || !ownerMode) {
      return;
    }
    var label = owner && owner.type ? owner.type.toLowerCase() : "record";
    note.textContent =
      "Saving to this " +
      label +
      ". Drop files, set type if needed, then Save file.";
  }

  function removeSelected() {
    var file = selectedFile();
    if (!file) {
      return;
    }
    if (
      !global.confirm(
        ownerMode
          ? "Remove this file from the list to save?"
          : "Remove this file from the test library?"
      )
    ) {
      return;
    }
    if (file.previewUrl && String(file.previewUrl).indexOf("blob:") === 0) {
      URL.revokeObjectURL(file.previewUrl);
    }
    delete sourceFiles[file.fileId];
    state.files = state.files.filter(function (row) {
      return row.fileId !== file.fileId;
    });
    state.selectedId = state.files[0] ? state.files[0].fileId : "";
    saveState();
    paint();
    setStatus("File removed.", true);
  }

  function downloadLibrary() {
    var blob = new Blob(
      [
        JSON.stringify(
          {
            schema: STORAGE_KEY,
            exportedAt: nowIso(),
            files: persistableCopy()
          },
          null,
          2
        )
      ],
      { type: "application/json" }
    );
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "copdoc-file-upload.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setStatus("Downloaded file library JSON.", true);
  }

  function clearLibrary() {
    if (!state.files.length) {
      setStatus("Library is already empty.", true);
      return;
    }
    if (!global.confirm("Clear every file in this test library?")) {
      return;
    }
    state.files = [];
    state.selectedId = "";
    saveState();
    paint();
    setStatus("Library cleared.", true);
  }

  function bind() {
    fillDocumentTypeSelect();
    var input = byId("fileUploadInput");
    var drop = byId("fileDropZone");
    if (input) {
      input.addEventListener("change", function () {
        importFiles(input.files);
        input.value = "";
      });
    }
    var downloadBtn = byId("downloadFileLibraryButton");
    if (downloadBtn) {
      downloadBtn.addEventListener("click", downloadLibrary);
    }
    var clearBtn = byId("clearFileLibraryButton");
    if (clearBtn) {
      clearBtn.addEventListener("click", clearLibrary);
    }
    if (drop) {
      drop.addEventListener("click", openPicker);
      drop.addEventListener("keydown", function (event) {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openPicker();
        }
      });
      drop.addEventListener("dragover", function (event) {
        event.preventDefault();
        drop.classList.add("is-hot");
      });
      drop.addEventListener("dragleave", function () {
        drop.classList.remove("is-hot");
      });
      drop.addEventListener("drop", function (event) {
        event.preventDefault();
        drop.classList.remove("is-hot");
        importFiles(event.dataTransfer.files);
      });
    }
    document.querySelectorAll("[data-file-filter]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        state.filter = btn.getAttribute("data-file-filter") || "all";
        paintLibrary();
      });
    });
    [
      "fileKind",
      "fileDocumentType",
      "fileCaption",
      "filePlace",
      "fileNotes",
      "fileTakenAt"
    ].forEach(function (id) {
      var el = byId(id);
      if (!el) {
        return;
      }
      el.addEventListener("change", function () {
        collectInspector();
        paintLibrary();
      });
      if (el.tagName !== "SELECT") {
        el.addEventListener("blur", collectInspector);
      }
    });
    byId("fileAddTag").addEventListener("click", addTag);
    byId("fileTagInput").addEventListener("keydown", function (event) {
      if (event.key === "Enter" || event.key === ",") {
        event.preventDefault();
        addTag();
      }
    });
    byId("fileRemove").addEventListener("click", removeSelected);
  }

  global.openFileUpload = openPicker;
  global.saveFilesToOwner = saveToOwner;

  loadState();
  bind();
  paintOwnerNote();
  paint();
})(typeof window !== "undefined" ? window : globalThis);
