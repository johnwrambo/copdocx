/**
 * In-page host for the existing photo picker.
 * Intercepts owner-scoped photo-picker links so record forms keep their state.
 */
(function (global) {
  "use strict";

  var root = (global.COPDoc = global.COPDoc || {});
  if (!document.body || document.body.getAttribute("data-page") === "photo-picker") {
    return;
  }

  var backdrop = null;
  var frame = null;
  var status = null;
  var addButton = null;
  var saveButton = null;
  var returnFocus = null;

  function pickerUrl(href) {
    try {
      var url = new URL(String(href || ""), document.baseURI);
      var path = url.pathname.replace(/\\/g, "/").toLowerCase();
      if (!/\/(?:photo-picker\.html)$/.test(path)) {
        return null;
      }
      if (!url.searchParams.get("ownerType") && !url.searchParams.get("leadId")) {
        return null;
      }
      url.searchParams.set("embedded", "1");
      return url;
    } catch (error) {
      return null;
    }
  }

  function setStatus(message, ok) {
    if (!status) {
      return;
    }
    status.textContent = message || "";
    status.hidden = !message;
    status.classList.toggle("is-ok", !!ok);
  }

  function close() {
    if (!backdrop || backdrop.hidden) {
      return;
    }
    backdrop.hidden = true;
    document.body.classList.remove("photo-picker-modal-open");
    if (frame) {
      frame.src = "about:blank";
    }
    if (returnFocus && typeof returnFocus.focus === "function") {
      returnFocus.focus();
    }
    returnFocus = null;
  }

  function invokeFrame(method) {
    var target = frame && frame.contentWindow;
    if (!target || typeof target[method] !== "function") {
      setStatus("Photo tools are still loading.");
      return;
    }
    target[method]();
  }

  function build() {
    if (backdrop) {
      return;
    }
    backdrop = document.createElement("div");
    backdrop.className = "dialog-backdrop photo-picker-modal";
    backdrop.hidden = true;
    backdrop.innerHTML =
      '<section class="dialog-box photo-picker-modal-box" role="dialog" aria-modal="true" aria-labelledby="photoPickerModalTitle">' +
      '<div class="photo-picker-modal-heading"><h2 id="photoPickerModalTitle">Photos</h2>' +
      '<button type="button" class="photo-picker-modal-close" aria-label="Close photo picker">×</button></div>' +
      '<p class="photo-picker-modal-status section-note" role="status" aria-live="polite" hidden></p>' +
      '<iframe class="photo-picker-modal-frame" title="Photo picker"></iframe>' +
      '<div class="dialog-actions"><button type="button" class="action-button photo-picker-modal-add">Add photos</button>' +
      '<button type="button" class="action-button photo-picker-modal-save">Save photos</button>' +
      '<button type="button" class="action-button-secondary photo-picker-modal-cancel">Cancel</button></div>' +
      "</section>";
    document.body.appendChild(backdrop);
    frame = backdrop.querySelector("iframe");
    status = backdrop.querySelector(".photo-picker-modal-status");
    addButton = backdrop.querySelector(".photo-picker-modal-add");
    saveButton = backdrop.querySelector(".photo-picker-modal-save");

    backdrop.querySelector(".photo-picker-modal-close").addEventListener("click", close);
    backdrop.querySelector(".photo-picker-modal-cancel").addEventListener("click", close);
    addButton.addEventListener("click", function () {
      invokeFrame("openPhotoPicker");
    });
    saveButton.addEventListener("click", function () {
      invokeFrame("savePhotosToOwner");
    });
    backdrop.addEventListener("mousedown", function (event) {
      if (event.target === backdrop) {
        close();
      }
    });
    frame.addEventListener("load", function () {
      addButton.disabled = false;
      saveButton.disabled = false;
      setStatus("Add, crop, tag, and save photos without leaving this page.", true);
    });
  }

  function open(href, trigger) {
    var url = pickerUrl(href);
    if (!url) {
      return false;
    }
    build();
    returnFocus = trigger || document.activeElement;
    backdrop.hidden = false;
    document.body.classList.add("photo-picker-modal-open");
    addButton.disabled = true;
    saveButton.disabled = true;
    setStatus("Loading photo tools…");
    frame.src = url.href;
    backdrop.querySelector(".photo-picker-modal-close").focus();
    return true;
  }

  document.addEventListener("click", function (event) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    var link = event.target && event.target.closest
      ? event.target.closest('a[href*="photo-picker.html"]')
      : null;
    if (link && open(link.href, link)) {
      event.preventDefault();
    }
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && backdrop && !backdrop.hidden) {
      event.preventDefault();
      close();
    }
  });

  global.addEventListener("message", function (event) {
    if (!frame || event.source !== frame.contentWindow || !event.data) {
      return;
    }
    if (event.data.type === "copdocx:photo-picker-close") {
      close();
      return;
    }
    if (event.data.type === "copdocx:photo-picker-status") {
      setStatus(event.data.message, event.data.ok);
      return;
    }
    if (event.data.type === "copdocx:photo-picker-saved") {
      var owner = event.data.owner || null;
      close();
      global.dispatchEvent(
        new CustomEvent("copdoc:media-changed", { detail: { owner: owner } })
      );
    }
  });

  root.photoPicker = {
    open: open,
    close: close
  };
})(typeof window !== "undefined" ? window : globalThis);
