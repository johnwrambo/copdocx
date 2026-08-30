/**
 * Shared app-bar behavior: close File / Book-in menus on outside click
 * or Escape, and label-only File items (Map exports, later baseball save).
 */
(function () {
  function closeMenus(except) {
    document.querySelectorAll("details.app-bar-menu[open]").forEach(function (menu) {
      if (menu !== except) {
        menu.removeAttribute("open");
      }
    });
  }

  document.addEventListener("click", function (event) {
    var openMenu =
      event.target && event.target.closest
        ? event.target.closest("details.app-bar-menu")
        : null;
    closeMenus(openMenu);
    var action =
      event.target && event.target.closest
        ? event.target.closest(".app-bar-menu-list button, .app-bar-menu-list a")
        : null;
    if (action && !action.closest(".app-bar-menu-open")) {
      window.setTimeout(function () {
        closeMenus(null);
      }, 0);
    }
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
      closeMenus(null);
    }
  });

  function setAppBarStatus(message) {
    var el =
      document.getElementById("appBarStatus") ||
      document.getElementById("leadSaveStatus") ||
      document.getElementById("status");
    if (!el) {
      return;
    }
    if (!message) {
      el.hidden = true;
      el.textContent = "";
      el.classList.remove("is-ok");
      return;
    }
    el.hidden = false;
    el.textContent = message;
    el.classList.remove("is-ok");
  }

  document.addEventListener("click", function (event) {
    var btn =
      event.target && event.target.closest
        ? event.target.closest("[data-not-built]")
        : null;
    if (!btn) {
      return;
    }
    event.preventDefault();
    var label = btn.getAttribute("data-not-built") || btn.textContent.trim();
    setAppBarStatus(label + " is not built yet.");
    closeMenus(null);
  });

  window.COPDoc = window.COPDoc || {};
  window.COPDoc.setAppBarStatus = setAppBarStatus;
})();
