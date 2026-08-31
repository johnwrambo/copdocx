/**
 * Home briefing hub. Skeleton only: icons and empty panes.
 * Do not write leads, admin, or book-in storage from this page.
 */
(function () {
  "use strict";

  if (!document.body || document.body.getAttribute("data-page") !== "home") {
    return;
  }

  function paintIcons() {
    if (window.COPDoc && COPDoc.icons && typeof COPDoc.icons.inject === "function") {
      COPDoc.icons.inject();
    }
    document.querySelectorAll("[data-icon]").forEach(function (el) {
      var name = el.getAttribute("data-icon") || "";
      var size = Number(el.getAttribute("data-icon-size")) || 18;
      if (window.COPDoc && typeof COPDoc.icon === "function") {
        el.innerHTML = COPDoc.icon(name, size);
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", paintIcons);
  } else {
    paintIcons();
  }
})();
