/**
 * Photo picker. Lab: copdocx.photo-picker.v1.
 * With ?ownerType=&id= or ?leadId=, Save photo writes copdocx.media.v1.
 */
(function (global) {
  "use strict";

  if (!document.body || document.body.getAttribute("data-page") !== "photo-picker") {
    return;
  }

  var STORAGE_KEY = "copdocx.photo-picker.v1";
  var MAX_EDGE = 1600;
  var JPEG_QUALITY = 0.86;
  var DISPLAY_MAX = 1920;
  var THUMB_MAX = 320;
  var KINDS = {
    subject: "Subject",
    vehicle: "Vehicle",
    location: "Location",
    document: "Document",
    evidence: "Evidence",
    other: "Other"
  };

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
  var state = { photos: [], selectedId: "", filter: "all" };
  var sourceFiles = {};
  var removedStoredIds = [];
  var suppress = false;
  var cropNatural = { x: 0, y: 0, w: 0, h: 0 };
  var drag = null;

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

  function selectedPhoto() {
    var id = state.selectedId;
    var i;
    for (i = 0; i < state.photos.length; i++) {
      if (state.photos[i].photoId === id) {
        return state.photos[i];
      }
    }
    return null;
  }

  function loadState() {
    if (ownerMode) {
      return;
    }
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return;
      }
      var parsed = JSON.parse(raw);
      state.photos = Array.isArray(parsed.photos) ? parsed.photos : [];
      state.selectedId = parsed.selectedId || "";
    } catch (err) {
      state.photos = [];
    }
  }

  function saveState() {
    if (ownerMode) {
      return true;
    }
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          schema: STORAGE_KEY,
          photos: state.photos,
          selectedId: state.selectedId
        })
      );
      return true;
    } catch (err) {
      setStatus("Could not save photos (storage full or blocked).");
      return false;
    }
  }

  function fileToBitmap(file) {
    if (typeof createImageBitmap === "function") {
      return createImageBitmap(file, { imageOrientation: "from-image" }).catch(
        function () {
          return createImageBitmap(file);
        }
      );
    }
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error("Could not read image."));
      };
      img.src = url;
    });
  }

  function canvasFromSource(source, width, height) {
    var canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    var ctx = canvas.getContext("2d");
    ctx.drawImage(source, 0, 0, width, height);
    return canvas;
  }

  function encodeCanvas(canvas) {
    return canvas.toDataURL("image/jpeg", JPEG_QUALITY);
  }

  function canvasToBlob(canvas, quality) {
    if (canvas && typeof canvas.convertToBlob === "function") {
      return canvas.convertToBlob({ type: "image/jpeg", quality: quality });
    }
    return new Promise(function (resolve, reject) {
      if (!canvas || typeof canvas.toBlob !== "function") {
        reject(new Error("Cannot encode image."));
        return;
      }
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

  function scaleCanvas(source, maxEdge) {
    var w = source.width || source.naturalWidth;
    var h = source.height || source.naturalHeight;
    var scale = Math.min(1, maxEdge / Math.max(w, h));
    var outW = Math.max(1, Math.round(w * scale));
    var outH = Math.max(1, Math.round(h * scale));
    var canvas = document.createElement("canvas");
    canvas.width = outW;
    canvas.height = outH;
    canvas.getContext("2d").drawImage(source, 0, 0, outW, outH);
    return canvas;
  }

  function croppedSource(bmp, crop) {
    if (!crop || !crop.w || !crop.h) {
      return bmp;
    }
    var canvas = document.createElement("canvas");
    canvas.width = crop.w;
    canvas.height = crop.h;
    canvas.getContext("2d").drawImage(
      bmp,
      crop.x,
      crop.y,
      crop.w,
      crop.h,
      0,
      0,
      crop.w,
      crop.h
    );
    return canvas;
  }

  function buildPhotoBlobs(file, crop) {
    return fileToBitmap(file).then(function (bmp) {
      var source = croppedSource(bmp, crop);
      var display = scaleCanvas(source, DISPLAY_MAX);
      var thumb = scaleCanvas(source, THUMB_MAX);
      return Promise.all([
        canvasToBlob(display, 0.86),
        canvasToBlob(thumb, 0.72)
      ]).then(function (pair) {
        if (bmp.close) {
          bmp.close();
        }
        return {
          original: file,
          display: pair[0],
          thumb: pair[1],
          width: display.width,
          height: display.height
        };
      });
    });
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

  function importFile(file) {
    if (!file || !String(file.type || "").match(/^image\//)) {
      return Promise.resolve(null);
    }
    if (
      model &&
      typeof model.isActiveMarkupFile === "function" &&
      model.isActiveMarkupFile(file.name, file.type)
    ) {
      return Promise.resolve(null);
    }
    var photoId = newId("pho");
    var taken = file.lastModified
      ? new Date(file.lastModified).toISOString()
      : nowIso();
    if (ownerMode) {
      sourceFiles[photoId] = file;
      return fileToBitmap(file).then(function (bmp) {
        var w = bmp.width;
        var h = bmp.height;
        if (bmp.close) {
          bmp.close();
        }
        return {
          photoId: photoId,
          originalName: file.name || "photo.jpg",
          mime: file.type || "image/jpeg",
          bytes: file.size || 0,
          width: w,
          height: h,
          previewUrl: URL.createObjectURL(file),
          dataUrl: "",
          originalDataUrl: "",
          crop: null,
          cropDirty: false,
          storedId: "",
          primary: !state.photos.some(function (row) {
            return row.primary;
          }),
          kind: "subject",
          caption: "",
          takenAt: taken,
          place: "",
          tags: [],
          notes: "",
          createdAt: nowIso(),
          updatedAt: nowIso()
        };
      });
    }
    return fileToBitmap(file).then(function (bmp) {
      var w = bmp.width;
      var h = bmp.height;
      var scale = Math.min(1, MAX_EDGE / Math.max(w, h));
      var outW = Math.max(1, Math.round(w * scale));
      var outH = Math.max(1, Math.round(h * scale));
      var canvas = canvasFromSource(bmp, outW, outH);
      if (bmp.close) {
        bmp.close();
      }
      var dataUrl = encodeCanvas(canvas);
      return {
        photoId: photoId,
        originalName: file.name || "photo.jpg",
        mime: "image/jpeg",
        bytes: file.size || 0,
        width: outW,
        height: outH,
        dataUrl: dataUrl,
        originalDataUrl: dataUrl,
        kind: "subject",
        caption: "",
        takenAt: taken,
        place: "",
        tags: [],
        notes: "",
        createdAt: nowIso(),
        updatedAt: nowIso()
      };
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
    Promise.all(files.map(importFile))
      .then(function (rows) {
        var added = rows.filter(Boolean);
        if (!added.length) {
          setStatus("No image files in that drop.");
          return;
        }
        state.photos = added.concat(state.photos);
        state.selectedId = added[0].photoId;
        saveState();
        paint();
        var msg =
          "Added " + added.length + " photo" + (added.length === 1 ? "" : "s") + ".";
        if (blocked.length) {
          msg += " Skipped HTML/SVG: " + blocked.join(", ") + ".";
        }
        setStatus(msg, true);
      })
      .catch(function (err) {
        setStatus(err.message || "Could not read image.");
      });
  }

  function openPicker() {
    var input = byId("photoFileInput");
    if (input) {
      input.click();
    }
  }

  function filteredPhotos() {
    if (ownerMode || state.filter === "all") {
      return state.photos;
    }
    return state.photos.filter(function (row) {
      return row.kind === state.filter;
    });
  }

  function paintLibrary() {
    var list = byId("photoLibrary");
    var empty = byId("photoLibraryEmpty");
    var rows = filteredPhotos();
    document.querySelectorAll("[data-photo-filter]").forEach(function (btn) {
      btn.setAttribute(
        "aria-pressed",
        btn.getAttribute("data-photo-filter") === state.filter ? "true" : "false"
      );
    });
    if (!list) {
      return;
    }
    list.replaceChildren();
    if (!rows.length) {
      if (empty) {
        empty.hidden = false;
        empty.textContent = state.photos.length
          ? "No photos in this filter."
          : "No photos yet.";
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
      li.className = "photo-thumb";
      if (row.photoId === state.selectedId) {
        li.classList.add("is-selected");
      }
      li.setAttribute("tabindex", "0");
      li.setAttribute("role", "button");
      var img = document.createElement("img");
      img.alt = row.caption || row.originalName || "Photo";
      img.src = row.previewUrl || row.dataUrl;
      if (row.primary) {
        li.classList.add("is-primary");
      }
      var meta = document.createElement("span");
      meta.className = "photo-thumb-meta";
      meta.textContent = row.primary
        ? "Primary"
        : row.width && row.height
          ? row.width + "×" + row.height
          : row.originalName || "Photo";
      li.appendChild(img);
      li.appendChild(meta);
      li.addEventListener("click", function () {
        collectInspector();
        state.selectedId = row.photoId;
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

  function paintTags(photo) {
    var list = byId("photoTagList");
    if (!list) {
      return;
    }
    list.replaceChildren();
    (photo.tags || []).forEach(function (tag, index) {
      var li = document.createElement("li");
      li.className = "photo-tag";
      li.textContent = tag;
      var btn = document.createElement("button");
      btn.type = "button";
      btn.setAttribute("aria-label", "Remove tag " + tag);
      btn.textContent = "×";
      btn.addEventListener("click", function () {
        photo.tags.splice(index, 1);
        photo.updatedAt = nowIso();
        saveState();
        paintTags(photo);
      });
      li.appendChild(btn);
      list.appendChild(li);
    });
  }

  function layoutCropOverlay() {
    var stage = byId("photoCropStage");
    var img = byId("photoCropImage");
    var overlay = byId("photoCropOverlay");
    if (!stage || !img || !overlay || !img.naturalWidth) {
      return;
    }
    var stageRect = stage.getBoundingClientRect();
    var imgRect = img.getBoundingClientRect();
    overlay.style.left = imgRect.left - stageRect.left + "px";
    overlay.style.top = imgRect.top - stageRect.top + "px";
    overlay.style.width = imgRect.width + "px";
    overlay.style.height = imgRect.height + "px";
    paintCropBox();
  }

  function paintCropBox() {
    var box = byId("photoCropBox");
    var img = byId("photoCropImage");
    if (!box || !img || !img.naturalWidth) {
      return;
    }
    var sx = img.clientWidth / img.naturalWidth;
    var sy = img.clientHeight / img.naturalHeight;
    box.style.left = cropNatural.x * sx + "px";
    box.style.top = cropNatural.y * sy + "px";
    box.style.width = cropNatural.w * sx + "px";
    box.style.height = cropNatural.h * sy + "px";
  }

  function clampCrop(next, aspect) {
    var img = byId("photoCropImage");
    if (!img || !img.naturalWidth) {
      return next;
    }
    var maxW = img.naturalWidth;
    var maxH = img.naturalHeight;
    var x = Math.max(0, next.x);
    var y = Math.max(0, next.y);
    var w = Math.max(32, next.w);
    var h = Math.max(32, next.h);
    if (aspect && aspect !== "free") {
      var ratio = Number(aspect);
      if (ratio > 0) {
        h = w / ratio;
        if (h > maxH) {
          h = maxH;
          w = h * ratio;
        }
        if (w > maxW) {
          w = maxW;
          h = w / ratio;
        }
      }
    }
    if (x + w > maxW) {
      x = Math.max(0, maxW - w);
      w = Math.min(w, maxW);
    }
    if (y + h > maxH) {
      y = Math.max(0, maxH - h);
      h = Math.min(h, maxH);
    }
    return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
  }

  function resetCropToFull() {
    var img = byId("photoCropImage");
    if (!img || !img.naturalWidth) {
      return;
    }
    cropNatural = clampCrop(
      { x: 0, y: 0, w: img.naturalWidth, h: img.naturalHeight },
      byId("photoCropAspect").value
    );
    paintCropBox();
  }

  function setPrimaryExclusive(photoId) {
    state.photos.forEach(function (row) {
      row.primary = row.photoId === photoId;
    });
  }

  function ensureOriginal(photo) {
    if (!photo) {
      return Promise.resolve(null);
    }
    if (sourceFiles[photo.photoId]) {
      return Promise.resolve(sourceFiles[photo.photoId]);
    }
    if (!photo.storedId || !mediaApi || typeof mediaApi.blob !== "function") {
      return Promise.resolve(null);
    }
    return mediaApi.blob(photo.storedId, "original").then(function (orig) {
      var file = blobAsFile(orig, photo.originalName, photo.mime);
      if (file) {
        sourceFiles[photo.photoId] = file;
      }
      return file;
    });
  }

  function blobAsFile(payload, name, mime) {
    var blob = payload && payload.blob ? payload.blob : payload;
    if (!blob) {
      return null;
    }
    var type = mime || blob.type || "image/jpeg";
    try {
      return new File([blob], name || "photo.jpg", { type: type });
    } catch (error) {
      return blob;
    }
  }

  function collectInspector() {
    var photo = selectedPhoto();
    if (!photo || suppress) {
      return;
    }
    photo.kind = (byId("photoKind") && byId("photoKind").value) || photo.kind || "subject";
    photo.caption = byId("photoCaption").value.trim();
    if (byId("photoPrimary")) {
      if (byId("photoPrimary").checked) {
        setPrimaryExclusive(photo.photoId);
      } else if (photo.primary) {
        byId("photoPrimary").checked = true;
      }
    }
    photo.place = byId("photoPlace").value.trim();
    photo.notes = byId("photoNotes").value.trim();
    photo.takenAt = fromDatetimeLocal(byId("photoTakenAt").value);
    photo.updatedAt = nowIso();
    saveState();
  }

  function addTag() {
    var photo = selectedPhoto();
    var input = byId("photoTagInput");
    if (!photo || !input) {
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
    photo.tags = photo.tags || [];
    raw.forEach(function (tag) {
      var key = tag.toLowerCase();
      var exists = photo.tags.some(function (item) {
        return item.toLowerCase() === key;
      });
      if (!exists) {
        photo.tags.push(tag);
      }
    });
    input.value = "";
    photo.updatedAt = nowIso();
    saveState();
    paintTags(photo);
    paintLibrary();
  }

  function paintInspector() {
    var photo = selectedPhoto();
    var empty = byId("photoInspectorEmpty");
    var panel = byId("photoInspector");
    var img = byId("photoCropImage");
    if (!photo) {
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
    if (byId("photoKind")) {
      byId("photoKind").value = photo.kind || "subject";
    }
    if (byId("photoPrimary")) {
      byId("photoPrimary").checked = !!photo.primary;
    }
    byId("photoCaption").value = photo.caption || "";
    byId("photoPlace").value = photo.place || "";
    byId("photoNotes").value = photo.notes || "";
    byId("photoTakenAt").value = toDatetimeLocal(photo.takenAt);
    byId("photoFileMeta").textContent =
      (photo.originalName || "photo") +
      " · " +
      photo.width +
      "×" +
      photo.height +
      (photo.bytes ? " · " + Math.round(photo.bytes / 1024) + " KB in" : "");
    paintTags(photo);
    img.onload = function () {
      resetCropToFull();
      layoutCropOverlay();
    };
    img.src = photo.previewUrl || photo.dataUrl;
    if (img.complete) {
      resetCropToFull();
      layoutCropOverlay();
    }
    suppress = false;
  }

  function paint() {
    paintLibrary();
    paintInspector();
  }

  function applyCrop() {
    var photo = selectedPhoto();
    var img = byId("photoCropImage");
    if (!photo || !img || !img.naturalWidth) {
      return;
    }
    var box = clampCrop(cropNatural, "free");
    var canvas = document.createElement("canvas");
    canvas.width = box.w;
    canvas.height = box.h;
    var ctx = canvas.getContext("2d");
    ctx.drawImage(img, box.x, box.y, box.w, box.h, 0, 0, box.w, box.h);
    photo.crop = { x: box.x, y: box.y, w: box.w, h: box.h };
    photo.cropDirty = true;
    photo.width = box.w;
    photo.height = box.h;
    photo.updatedAt = nowIso();
    if (ownerMode) {
      if (photo.previewUrl && String(photo.previewUrl).indexOf("blob:") === 0) {
        URL.revokeObjectURL(photo.previewUrl);
      }
      canvasToBlob(canvas, JPEG_QUALITY).then(function (blob) {
        photo.previewUrl = URL.createObjectURL(blob);
        saveState();
        paint();
        setStatus("Crop applied.", true);
      });
      return;
    }
    photo.dataUrl = encodeCanvas(canvas);
    saveState();
    paint();
    setStatus("Crop applied.", true);
  }

  function resetOriginal() {
    var photo = selectedPhoto();
    if (!photo) {
      return;
    }
    function restoreFromFile(file) {
      if (!file) {
        return;
      }
      photo.crop = null;
      photo.cropDirty = true;
      if (photo.previewUrl && String(photo.previewUrl).indexOf("blob:") === 0) {
        URL.revokeObjectURL(photo.previewUrl);
      }
      photo.previewUrl = URL.createObjectURL(file);
      photo.updatedAt = nowIso();
      saveState();
      paint();
      setStatus("Restored original.", true);
    }
    if (ownerMode) {
      ensureOriginal(photo).then(restoreFromFile);
      return;
    }
    if (!photo.originalDataUrl) {
      return;
    }
    var img = new Image();
    img.onload = function () {
      photo.dataUrl = photo.originalDataUrl;
      photo.width = img.naturalWidth;
      photo.height = img.naturalHeight;
      photo.updatedAt = nowIso();
      saveState();
      paint();
      setStatus("Restored original.", true);
    };
    img.src = photo.originalDataUrl;
  }

  function removeSelected() {
    var photo = selectedPhoto();
    if (!photo) {
      return;
    }
    if (
      !global.confirm(
        ownerMode
          ? "Remove this photo from the list to save?"
          : "Remove this photo from the test library?"
      )
    ) {
      return;
    }
    if (photo.previewUrl && String(photo.previewUrl).indexOf("blob:") === 0) {
      URL.revokeObjectURL(photo.previewUrl);
    }
    delete sourceFiles[photo.photoId];
    if (photo.storedId) {
      removedStoredIds.push(photo.storedId);
    }
    var wasPrimary = !!photo.primary;
    state.photos = state.photos.filter(function (row) {
      return row.photoId !== photo.photoId;
    });
    if (wasPrimary && state.photos[0]) {
      setPrimaryExclusive(state.photos[0].photoId);
    }
    state.selectedId = state.photos[0] ? state.photos[0].photoId : "";
    saveState();
    paint();
    setStatus("Photo removed.", true);
  }

  function downloadLibrary() {
    var blob = new Blob(
      [
        JSON.stringify(
          {
            schema: STORAGE_KEY,
            exportedAt: nowIso(),
            photos: state.photos
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
    a.download = "copdoc-photo-picker.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setStatus("Downloaded photo library JSON.", true);
  }

  function persistOnePhoto(current, photo) {
    var fields = {
      kind: photo.kind || "subject",
      caption: photo.caption || "",
      place: photo.place || "",
      notes: photo.notes || "",
      takenAt: photo.takenAt || "",
      tags: photo.tags || [],
      crop: photo.crop || null,
      primary: !!photo.primary
    };
    if (photo.storedId) {
      if (!photo.cropDirty) {
        return mediaApi.update(photo.storedId, { fields: fields });
      }
      return ensureOriginal(photo).then(function (file) {
        if (!file) {
          return Promise.reject(
            new Error("Missing original for " + (photo.originalName || "photo"))
          );
        }
        return buildPhotoBlobs(file, photo.crop).then(function (parts) {
          return mediaApi.update(photo.storedId, {
            display: parts.display,
            thumb: parts.thumb,
            fields: Object.assign({}, fields, {
              width: parts.width,
              height: parts.height
            })
          });
        });
      });
    }
    return ensureOriginal(photo).then(function (file) {
      if (!file) {
        return Promise.reject(
          new Error("Missing original file for " + (photo.originalName || "photo"))
        );
      }
      return buildPhotoBlobs(file, photo.crop).then(function (parts) {
        return mediaApi.save({
          owner: { type: current.type, id: current.id },
          mediaClass: "photo",
          original: parts.original,
          display: parts.display,
          thumb: parts.thumb,
          mime: file.type || "image/jpeg",
          originalName: photo.originalName,
          bytes: file.size || photo.bytes,
          width: parts.width,
          height: parts.height,
          fields: fields
        }).then(function (saved) {
          photo.storedId = saved.mediaId;
          return saved;
        });
      });
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
    if (!state.photos.length && !removedStoredIds.length) {
      setStatus("Add photos first.");
      return;
    }
    if (!mediaApi || typeof mediaApi.save !== "function") {
      setStatus("Media store is not loaded.");
      return;
    }
    var queue = removedStoredIds.slice();
    var i = 0;
    function afterDeletes() {
      if (i >= state.photos.length) {
        var primary = state.photos.filter(function (row) {
          return row.primary && row.storedId;
        })[0];
        var done = function () {
          setStatus("Photos saved.", true);
          var href = mediaApi.returnHref(current);
          if (href) {
            window.location.href = href;
          }
        };
        if (primary && typeof mediaApi.setPrimary === "function") {
          return mediaApi.setPrimary(primary.storedId).then(done, done);
        }
        done();
        return;
      }
      var photo = state.photos[i];
      i += 1;
      setStatus("Saving " + i + " of " + state.photos.length + "…");
      persistOnePhoto(current, photo).then(afterDeletes).catch(function (err) {
        if (err && err.code === "ALREADY_SAVED" && err.existing) {
          photo.storedId = err.existing.mediaId;
          return afterDeletes();
        }
        setStatus((err && err.message) || "Could not save photo.");
      });
    }
    function deleteNext() {
      if (!queue.length) {
        afterDeletes();
        return;
      }
      var id = queue.shift();
      mediaApi.remove(id).then(deleteNext, deleteNext);
    }
    deleteNext();
  }

  function loadStoredPhotos() {
    if (!ownerMode || !mediaApi || typeof mediaApi.list !== "function") {
      return Promise.resolve();
    }
    var current = mediaApi.ownerFromPage ? mediaApi.ownerFromPage() : owner;
    if (!current || !current.id) {
      return Promise.resolve();
    }
    return mediaApi.list({ type: current.type, id: current.id }).then(function (rows) {
      var photos = (rows || []).filter(function (row) {
        return row.mediaClass === "photo";
      });
      var loaded = [];
      var i = 0;
      function loadPreview(row) {
        return mediaApi
          .blob(row.mediaId, "thumb")
          .catch(function () {
            return mediaApi.blob(row.mediaId, "display");
          })
          .catch(function () {
            return null;
          })
          .then(function (disp) {
            var preview = disp && disp.blob;
            return {
              photoId: row.mediaId,
              storedId: row.mediaId,
              originalName: row.originalName || "photo.jpg",
              mime: row.mime || "image/jpeg",
              bytes: row.bytes || 0,
              width: row.width || 0,
              height: row.height || 0,
              previewUrl: preview
                ? URL.createObjectURL(
                    preview instanceof Blob ? preview : new Blob([preview])
                  )
                : "",
              crop: row.crop || null,
              cropDirty: false,
              primary: !!row.primary,
              kind: row.kind || "subject",
              caption: row.caption || "",
              takenAt: row.takenAt || "",
              place: row.place || "",
              tags: row.tags || [],
              notes: row.notes || "",
              createdAt: (row.meta && row.meta.createdAt) || nowIso(),
              updatedAt: (row.meta && row.meta.updatedAt) || nowIso()
            };
          });
      }
      function next() {
        if (i >= photos.length) {
          return Promise.resolve(loaded);
        }
        var row = photos[i];
        i += 1;
        return loadPreview(row).then(function (item) {
          loaded.push(item);
          return next();
        });
      }
      return next();
    }).then(function (loaded) {
      state.photos = loaded.concat(state.photos);
      if (!state.selectedId && state.photos.length) {
        var prim = state.photos.filter(function (row) {
          return row.primary;
        })[0] || state.photos[0];
        state.selectedId = prim.photoId;
      }
      paint();
    }).catch(function (err) {
      setStatus((err && err.message) || "Could not load photos.");
    });
  }

  function paintOwnerNote() {
    var note = document.querySelector(".page-photo-picker .page-meta p");
    if (!note || !ownerMode) {
      return;
    }
    var label = owner && owner.type ? owner.type.toLowerCase() : "record";
    note.textContent =
      "Photos for this " +
      label +
      ". Add, crop, and mark one as primary, then Save photo.";
    var libLegend = document.querySelector(".photo-library-card legend");
    if (libLegend) {
      libLegend.textContent = "Photos";
    }
    var editLegend = document.querySelector(".photo-inspector-card legend");
    if (editLegend) {
      editLegend.textContent = "Edit photo";
    }
  }

  function clearLibrary() {
    if (!state.photos.length) {
      setStatus("Library is already empty.", true);
      return;
    }
    if (!global.confirm("Clear every photo in this test library?")) {
      return;
    }
    state.photos = [];
    state.selectedId = "";
    saveState();
    paint();
    setStatus("Library cleared.", true);
  }

  function overlayToNatural(clientX, clientY) {
    var overlay = byId("photoCropOverlay");
    var img = byId("photoCropImage");
    var rect = overlay.getBoundingClientRect();
    var x = ((clientX - rect.left) / rect.width) * img.naturalWidth;
    var y = ((clientY - rect.top) / rect.height) * img.naturalHeight;
    return { x: x, y: y };
  }

  function onPointerDown(event) {
    var handle = event.target.getAttribute("data-handle");
    var movingBox = event.target.id === "photoCropBox" || event.target.closest("#photoCropBox");
    if (!handle && !movingBox) {
      return;
    }
    event.preventDefault();
    var start = overlayToNatural(event.clientX, event.clientY);
    drag = {
      handle: handle || "move",
      startX: start.x,
      startY: start.y,
      origin: {
        x: cropNatural.x,
        y: cropNatural.y,
        w: cropNatural.w,
        h: cropNatural.h
      }
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event) {
    if (!drag) {
      return;
    }
    var now = overlayToNatural(event.clientX, event.clientY);
    var dx = now.x - drag.startX;
    var dy = now.y - drag.startY;
    var next = {
      x: drag.origin.x,
      y: drag.origin.y,
      w: drag.origin.w,
      h: drag.origin.h
    };
    var aspect = byId("photoCropAspect").value;
    if (drag.handle === "move") {
      next.x = drag.origin.x + dx;
      next.y = drag.origin.y + dy;
      cropNatural = clampCrop(next, "free");
      paintCropBox();
      return;
    } else {
      if (drag.handle.indexOf("n") !== -1) {
        next.y = drag.origin.y + dy;
        next.h = drag.origin.h - dy;
      }
      if (drag.handle.indexOf("s") !== -1) {
        next.h = drag.origin.h + dy;
      }
      if (drag.handle.indexOf("w") !== -1) {
        next.x = drag.origin.x + dx;
        next.w = drag.origin.w - dx;
      }
      if (drag.handle.indexOf("e") !== -1) {
        next.w = drag.origin.w + dx;
      }
    }
    cropNatural = clampCrop(next, aspect);
    paintCropBox();
  }

  function onPointerUp() {
    drag = null;
  }

  function bind() {
    var fileInput = byId("photoFileInput");
    var drop = byId("photoDropZone");
    var overlay = byId("photoCropOverlay");

    if (fileInput) {
      fileInput.addEventListener("change", function () {
        importFiles(fileInput.files);
        fileInput.value = "";
      });
    }

    var downloadBtn = byId("downloadPhotoLibraryButton");
    if (downloadBtn) {
      downloadBtn.addEventListener("click", downloadLibrary);
    }
    var clearBtn = byId("clearPhotoLibraryButton");
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

    document.addEventListener("paste", function (event) {
      var items = event.clipboardData && event.clipboardData.files;
      if (items && items.length) {
        importFiles(items);
      }
    });

    document.querySelectorAll("[data-photo-filter]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        state.filter = btn.getAttribute("data-photo-filter") || "all";
        paintLibrary();
      });
    });

    ["photoKind", "photoCaption", "photoPlace", "photoNotes", "photoTakenAt"].forEach(
      function (id) {
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
      }
    );

    if (byId("photoPrimary")) {
      byId("photoPrimary").addEventListener("change", function () {
        var photo = selectedPhoto();
        if (!photo) {
          return;
        }
        if (byId("photoPrimary").checked) {
          setPrimaryExclusive(photo.photoId);
        } else {
          byId("photoPrimary").checked = true;
        }
        paintLibrary();
      });
    }
    byId("photoAddTag").addEventListener("click", addTag);
    byId("photoTagInput").addEventListener("keydown", function (event) {
      if (event.key === "Enter" || event.key === ",") {
        event.preventDefault();
        addTag();
      }
    });
    byId("photoApplyCrop").addEventListener("click", applyCrop);
    byId("photoResetCrop").addEventListener("click", resetOriginal);
    byId("photoRemove").addEventListener("click", removeSelected);
    byId("photoCropAspect").addEventListener("change", function () {
      cropNatural = clampCrop(cropNatural, byId("photoCropAspect").value);
      paintCropBox();
    });

    if (overlay) {
      overlay.addEventListener("pointerdown", onPointerDown);
      overlay.addEventListener("pointermove", onPointerMove);
      overlay.addEventListener("pointerup", onPointerUp);
      overlay.addEventListener("pointercancel", onPointerUp);
    }

    global.addEventListener("resize", layoutCropOverlay);
  }

  global.openPhotoPicker = openPicker;
  global.savePhotosToOwner = saveToOwner;

  loadState();
  bind();
  if (ownerMode) {
    document.body.classList.add("photo-owner-mode");
  }
  paintOwnerNote();
  paint();
  loadStoredPhotos();
  if (ownerMode && (!owner || !owner.id)) {
    setStatus("This record has no id to attach photos to. Save it first.");
  }
})(typeof window !== "undefined" ? window : globalThis);
